# Migration brief — las decisiones de auth de tu proyecto llegan a CI

> **Aplica si:** tienes E2E corriendo en CI (`.github/workflows/e2e.yml`) **y** alguna `NEXT_PUBLIC_AUTH_*` de tu `.env.local` difiere del default del kit. Si usas todos los defaults, tu CI ya prueba lo correcto y **no tienes nada que hacer**.
>
> **Cuesta:** un step de 4 líneas en tu workflow + publicar unas variables. Sin tocar el runner, sin tocar `playwright.config.ts`.
>
> **Disponible desde:** kit `v11.9`.
>
> 🔴 **No corras `pnpm setup:e2e` a ciegas para esto.** Ese comando **regenera** `.github/workflows/e2e.yml` desde la plantilla y **sobrescribe el archivo entero** — incluido `E2E_PARENT_BRANCH`, que avisa pero **no** preserva, y cualquier job, matriz o paso que hayas agregado a mano. Es el camino correcto para un proyecto que nunca lo personalizó; esta guía es para el resto.

---

## 1. Qué se arregla

En local, el runner carga `.env.local` y todo lo que lanza lo hereda. En CI ese archivo es gitignored y nunca llega al runner: `pnpm setup:e2e` solo publicaba `DATABASE_URL` y los dos secretos de Neon.

Las specs que leen un flag para decidir si corren —`register.spec.ts` y `NEXT_PUBLIC_AUTH_REGISTRATION` es el caso medido— caían al **default del kit**, no a lo que tu app es. En un proyecto con el registro cerrado, eso significa que CI probaba el registro contra una app que no lo tiene… y pasaba en verde.

El modo de falla es el peor: no hay error, no hay spec roja, y el reporte dice que todo está bien.

---

## 2. Phase 0 — ¿me aplica?

Compara tu `.env.local` contra los defaults del kit:

```bash
grep -E '^NEXT_PUBLIC_AUTH_' .env.local
```

| Variable | Default del kit | ¿Se publica? |
| --- | --- | --- |
| `NEXT_PUBLIC_AUTH_PASSWORD` | `true` | Sí (salvo postura de cero métodos — ver abajo) |
| `NEXT_PUBLIC_AUTH_REGISTRATION` | `true` | Sí |
| `NEXT_PUBLIC_AUTH_PASSWORD_RESET` | `true` | Sí |
| `NEXT_PUBLIC_AUTH_MAGIC_LINK` | `false` | **No** — el runner la fija por su cuenta |
| `NEXT_PUBLIC_AUTH_EMAIL_VERIFY` | `false` | Sí |
| `NEXT_PUBLIC_AUTH_GOOGLE` | `false` | **No** — depende de un secreto server-side ausente en CI |
| `NEXT_PUBLIC_AUTH_GITHUB` | `false` | **No** — depende de un secreto server-side ausente en CI |

> La cuarta variable excluida del publish, `NEXT_PUBLIC_APP_URL`, no lleva el prefijo `NEXT_PUBLIC_AUTH_` — no aparece en el `grep` de arriba ni en esta tabla, pero sigue siendo el runner quien la fija (ver la nota de las "cuatro variables" más abajo).

**Te aplica** si al menos una de las que SÍ se publican difiere de su default. El caso más común y más dañino es `NEXT_PUBLIC_AUTH_REGISTRATION="false"`: tu app tiene el registro cerrado y CI lo prueba abierto.

**No te aplica** si todas las publicables coinciden con la tabla — CI ya corre con la postura correcta, aunque tu workflow no traiga el step. Adoptarlo igual no rompe nada, pero no cambia nada tampoco.

**Tampoco te aplica** si no corres E2E en CI (no tienes `.github/workflows/e2e.yml`, o el que tienes está desactivado).

**Si tu única divergencia es `NEXT_PUBLIC_AUTH_GOOGLE` (o `_GITHUB`), esta guía no te aplica.** El publish la omite siempre — no hay nada que este step te resuelva, porque lo que falta no es la variable pública sino el secreto server-side (`AUTH_GOOGLE_ID`/`_SECRET`, `AUTH_GITHUB_ID`/`_SECRET`) que CI no tiene.

> 🔴 **Cuatro variables quedan fuera del publish, por dos razones distintas:**
>
> - **El runner las fija por su cuenta** (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_MAGIC_LINK`) — publicarlas solo produciría churn del build stamp o un valor que contradice el del proceso de tests. El runner gana el merge de todos modos.
> - **Dependen de un secreto server-side que CI no tiene** (`NEXT_PUBLIC_AUTH_GOOGLE`, `NEXT_PUBLIC_AUTH_GITHUB`) — encenderlas sin `AUTH_GOOGLE_ID`/`_SECRET` o `AUTH_GITHUB_ID`/`_SECRET` mata el `next build` completo en un derivado nacido antes del guard `BOOT-005`. Su default (`false`) es exactamente el estado real de un CI sin esas credenciales, así que excluir la clave es más simple que publicar el valor correcto.
>
> Si la postura resultante (una vez aplicadas ambas exclusiones) queda en **cero métodos habilitados** — el caso típico es un proyecto solo-magic-link, donde el runner ya apaga `MAGIC_LINK` — el publish además omite `NEXT_PUBLIC_AUTH_PASSWORD` (cae al default del kit, `true`, en servidor y cliente por igual) y sube `NEXT_PUBLIC_AUTH_REGISTRATION=false` explícito, para no dejar `/api/auth/register` abierto en la app bajo prueba. `pnpm setup:e2e:vars` te dice, clave por clave, qué omitió y por qué — nunca cómo publicarla a mano.

---

## 3. Phase 1 — publica las variables

```bash
pnpm setup:e2e:vars
```

> Si tu `package.json` todavía no trae el alias (no corriste `factory update` desde que el kit
> lo agrega, v11.9), usa el comando directo: `pnpm exec tsx scripts/tools/setup-e2e.ts --publish-vars`.
> Mismo resultado — el alias solo evita que lo escribas a mano.

**Publica y nada más.** No habla con Neon, no toca tu workflow — que es justo el punto de este comando frente al `setup:e2e` completo. Te muestra las claves que va a publicar y pide confirmación antes de escribir en tu repo.

Van como **variables**, nunca secretos: son `NEXT_PUBLIC_*`, o sea que `next build` ya las inlinea en el bundle del cliente. Archivarlas como secretos no compraría confidencialidad y costaría poder leer con qué corre CI.

> 🔴 **Por qué no `gh variable set` a mano.** El kit escribe `.env.local` **con comillas** (`NEXT_PUBLIC_AUTH_REGISTRATION="false"`) y el parser compara contra el literal `'false'`. Publicar el valor tal cual deja el flag en **true** en CI: el arreglo entregando exactamente lo contrario de lo que promete, en verde. El comando quita las comillas por ti (`dotenv.parse`, que además resuelve escapes y multilínea) y aplica la postura correcta (exclusiones + cero-métodos) — replicar eso a mano es replicar el bug que este documento existe para cerrar. Y para las cuatro variables que el publish omite (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_MAGIC_LINK`, `NEXT_PUBLIC_AUTH_GOOGLE`, `NEXT_PUBLIC_AUTH_GITHUB`) hacerlo a mano no sirve de nada: `selectCiEnv` las descarta igual del lado consumidor, aunque las agregues en la UI de GitHub.

Compruébalo antes de seguir:

```bash
gh variable list
```

---

## 4. Phase 2 — agrega el step a tu workflow

En `.github/workflows/e2e.yml`, **antes** del step que corre la suite (y después de `playwright install`), agrega:

```yaml
      - name: Volcar las variables de auth del repo al entorno del job
        env:
          E2E_REPO_VARIABLES: ${{ toJSON(vars) }}
        run: pnpm exec tsx scripts/tools/setup-e2e.ts --emit-ci-env >> "$GITHUB_ENV"
```

Va **antes** de la suite porque ahí adentro ocurre el build, que es cuando las públicas se hornean. Ponerlo después no serviría de nada.

Eso es todo. No hay que tocar nada más de tu workflow.

### Por qué el step se ve así y no de otra forma

Si vas a adaptarlo a un workflow custom, estos cuatro detalles son el punto y no el estilo:

- **`toJSON(vars)` entra por `env:`, jamás interpolado en el `run:`.** Interpolarlo pondría contenido controlable dentro de la línea que ejecuta el shell.
- **El filtro por prefijo se repite del lado del consumidor.** `vars` trae **todas** las variables del repo, incluida cualquiera que alguien agregue después en la UI de GitHub — y el runner lanza cada proceso hijo con `{...process.env, ...overrides}`, así que sin filtrar, un nombre como `NODE_OPTIONS` o `DATABASE_URL` entraría al build y al proceso de tests. Ese filtro vive en `selectCiEnv()` (`scripts/tools/setup-e2e.ts`), exportado y con tests, **no** en un `node -e` dentro del YAML: un control que nadie puede probar no es un control.
- **`node` vía `tsx`, no `jq`.** `jq` no está garantizado en la imagen de Playwright.
- **La salida usa heredoc con delimitador aleatorio**, no `clave=valor`: un valor con salto de línea corrompería `$GITHUB_ENV` y permitiría definir variables arbitrarias del job.

---

## 5. Phase 3 — verifica que funcionó

No des esto por cerrado con un push. La comprobación que importa es la del comportamiento:

1. Dispara una corrida de CI.
2. En el log del step nuevo, confirma que salen **solo** las claves que publicaste.
3. En el reporte de Playwright, confirma que las specs que dependen de tus flags hacen lo correcto. Con `NEXT_PUBLIC_AUTH_REGISTRATION=false`, `register.spec.ts` debe aparecer **skipped** — antes corría y pasaba, que es el bug.

Si el step falla, corta el job **antes** de la suite a propósito: una corrida que perdió en silencio la postura de auth del proyecto es una corrida que prueba lo contrario de la app y reporta verde.

---

## 6. Qué pasa si no haces nada

Nada se rompe. Sin variables publicadas, el step no escribe nada y CI sigue con los defaults del kit — el comportamiento de hoy, exactamente.

Lo que sí cambia: el runner **avisa** (ruidoso, sin abortar) al detectar un `e2e.yml` activo que corre la suite sin el step. Ese aviso apunta a este documento.

---

## 7. Si tu `e2e.yml` NO está personalizado

Entonces sí, el camino corto es válido y hace las dos fases de arriba en una sola corrida:

```bash
factory update      # primero: el step vive en la plantilla, y el update la refresca
pnpm setup:e2e      # publica las variables Y regenera el workflow
```

Antes de correrlo, confirma que puedes perder tu `e2e.yml` actual:

```bash
git diff --no-index .github/workflows/e2e.yml.example .github/workflows/e2e.yml
```

Si esa comparación solo muestra los placeholders resueltos (versión de Playwright, rama de trigger, `E2E_PARENT_BRANCH`), no tienes personalizaciones y el camino corto es seguro. Si muestra cualquier otra cosa —un job extra, una matriz, un step tuyo— **usa las fases 1 y 2 de esta guía**, no el camino corto.

---

_TimeKast Factory — retrofit `e2e-ci-auth-env` (kit v11.9)_
