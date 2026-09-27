# Runbook — Subir dependencias en un derivado sin reabrir agujeros

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a **todo** derivado Next.js del TimeKast Factory, en cualquier versión. No es de un release puntual: es el procedimiento que se repite cada vez que `pnpm audit` marca algo.
>
> **Para:** dev + agente (Claude Code) del proyecto **derivado**. El humano aprueba en los gates ⏸.
> **Stack asumido:** Next.js (App Router) + NextAuth v5 (Auth.js) + Drizzle + Postgres — el estándar de todo derivado.
> **Origen:** la campaña de cierre de advisories del kit v11.5.0, que bajó de 2 críticas + 13 altas a 0 críticas + 1 alta documentada. Ese caso está trabajado con números concretos en §3.
>
> 🔴 **Lo más importante de este doc está en §2.1.** Subir `next-auth` sin re-validar el pin de `@auth/core` puede **reabrir el account-takeover** sin que falle ningún test excepto el E2E. Si solo lees una sección, lee esa.
> **Disponible desde:** kit `v11.6.0`

---

## 0. TL;DR

|                             |                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cuándo aplica**           | `pnpm preflight` (o `pnpm audit --prod`) devuelve **NOT-READY** por vulns critical/high en dependencias de producción.                                        |
| **Por qué es manual**       | `package.json` nace **congelado** en el derivado (`BR-FACTORY-006`). `factory update` refresca solo el cerebro — **nunca** tus dependencias.                  |
| **Trampa #1 (crítica)**     | El pin de `@auth/core` protege el fix de account-takeover (invariante **D3**). Subir `next-auth` lo mueve. Hay que re-validar **antes**, no después. → §2.1    |
| **Trampa #2**               | Next re-shippea su **propia copia** de algunas deps (`sharp`) como `optionalDependency`. Subirla en `dependencies` **no basta** — necesita override. → §2.2   |
| **Trampa #3**               | Un override sin calificar de major rompe la instalación cuando conviven varias majors del mismo paquete. → §2.3                                               |
| **Trampa #4**               | Algunos advisories **no tienen arreglo posible**. Perseguirlos rompe peers. Se documentan. → §2.4                                                             |
| **Esfuerzo**                | ~1–2 h si no hay sorpresas. La mayor parte es verificación, no edición.                                                                                       |
| **Riesgo si se hace mal**   | Reabrir un agujero de seguridad ya cerrado, en silencio.                                                                                                      |

---

## 1. Por qué esto es 100% manual

El `package.json` de tu proyecto **nace congelado** cuando corres `factory new`. El comando `factory update` refresca solo el cerebro (`.claude/` + los scripts trackeados) y **nunca** toca `src/` ni tus dependencias (`BR-FACTORY-006` — born-frozen).

Traducción práctica: **nadie te va a aplicar estos cambios solo.** No esperes que lleguen con un update.

**Única excepción:** los *aliases de scripts* que el kit shippeó (p. ej. `dev:next`) sí los mantiene el CLI vía `OBSOLETE_SCRIPT_CMDS` — sube el comando exacto que el kit publicó y **preserva** el que tú extendiste o personalizaste.

---

## 2. Los 4 patrones durables

Esto es lo que se repite en cada campaña de bump. Los números de §3 caducan; esto no.

### 2.1 🔴 El guardrail de `@auth/core` — léelo antes de tocar `next-auth`

Si tu derivado nació con la cobertura de seguridad del kit, tienes este archivo:

```
tests/unit/auth/auth-core-pin.test.ts
```

Ese test **falla el build a propósito** si el pin de `@auth/core` cambia. No es un test molesto que se pueda saltar.

**Qué protege.** El wipe anti-revival de **D3** (el fix de account-takeover, `SEC-002`) depende de que `@auth/core` corra el callback `signIn` **antes** del merge de cuentas OAuth — su ordenamiento interno en `handle-login`.

**Por qué es frágil.** Ese orden **no es contrato público** de la librería. Un bump transitivo silencioso podría reordenarlo y reabrir el account-takeover **sin que falle ningún test unitario** — solo el E2E lo vería. El pin exacto + este guard son lo que convierte un bump silencioso en una decisión deliberada.

**Procedimiento correcto — re-validar ANTES de mover el número:**

```bash
# 1. Baja las dos versiones a un directorio temporal (la pineada y la candidata)
cd "$(mktemp -d)" && npm pack @auth/core@<VERSION_ACTUAL> @auth/core@<VERSION_NUEVA>
for t in *.tgz; do mkdir -p "${t%.tgz}" && tar xzf "$t" -C "${t%.tgz}"; done

# 2. Diff de los DOS archivos que SON el ordenamiento
cmp <actual>/package/lib/actions/callback/index.js        <nueva>/package/lib/actions/callback/index.js
cmp <actual>/package/lib/actions/callback/handle-login.js <nueva>/package/lib/actions/callback/handle-login.js
```

⏸ **Gate — el humano decide según el resultado:**

| Resultado del `cmp`      | Qué significa                                                        | Acción                                                              |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Byte-idénticos**       | El orden no se movió. `handleAuthorized()` (donde vive el wipe D3) sigue corriendo antes de `handleLoginOrRegister()` (el merge). | ✅ Procede: sube el número en el test y deja el log de re-validación. |
| **Difieren**             | El ordenamiento **pudo** cambiar.                                    | 🛑 **PARA.** Lee el diff y evalúa el reordenamiento antes de seguir. No subas el número "a ver si pasan los tests". |

**Después de mover el pin, re-corre la cobertura de D3:**

```bash
pnpm test tests/unit/auth/login-gate.test.ts   # cobertura unit de D3 (SEC-002)
pnpm test:e2e                                   # el spec de account-takeover (SEC-006)
```

Y actualiza la aserción:

```ts
expect(pinned).toBe('<VERSION_NUEVA>');
```

> 🔴 **Nunca borres el test ni lo pongas en `skip`.** Es el único guardián de ese invariante fuera del E2E. Deja escrito en el docblock **qué verificaste y con qué resultado** — el siguiente que suba la versión (probablemente otro agente) depende de ese registro.
>
> 📖 Contexto completo del ataque que esto protege → [`account-takeover.md`](./account-takeover.md).

### 2.2 Dependencias que Next re-shippea por su cuenta

Subir un paquete en `dependencies` **no siempre alcanza**. Next declara copias propias de algunas dependencias como `optionalDependencies` con su propio rango pineado. Sin un override, la copia vulnerable **sigue instalada** bajo `next`, y `pnpm audit` la sigue marcando.

El caso conocido es **`sharp`**. Se necesitan las dos cosas:

```json
"dependencies": { "sharp": "^0.35.3" },
"pnpm": { "overrides": { "sharp": "^0.35.3" } }
```

**Cómo detectar si te pasa esto:** si subiste el paquete y el advisory sigue apareciendo, mira quién lo trae:

```bash
pnpm why <paquete>
```

⚠️ **El override fuerza el paquete fuera del rango que Next declara.** Ese es el riesgo residual real de esta operación — no lo razones, **verifícalo en runtime**. Para `sharp`, el consumidor es el optimizador de imágenes:

```bash
pnpm build && pnpm start
# en otra terminal, con una imagen real de tu app y en 3 anchos distintos:
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
  'http://localhost:3000/_next/image?url=%2Ficon-192.png&w=256&q=75'
# esperado: 200 image/webp   ← repite con w=384 y w=640
```

Si los tres devuelven WebP con las dimensiones correctas, el override es seguro en la práctica.

> ⚠️ **`sharp` tiene dos requisitos más, independientes del advisory.** Es un módulo **nativo**, y para que funcione desplegado necesita:
>
> 1. **`pnpm.supportedArchitectures` en `package.json`** — la causa raíz. pnpm instala solo los binarios de la plataforma actual, así que un árbol de dev en mac nunca materializa `@img/sharp-libvips-linux-x64` (el que trae `libvips-cpp.so`) y la función en Linux muere con `ERR_DLOPEN_FAILED`, llevándose todas las server actions de esa ruta. `"os": ["current","linux"], "cpu": ["current","x64","arm64"]` + `pnpm install` (el lockfile **no** cambia).
> 2. **`serverExternalPackages: ['sharp']` en `next.config.ts`** — evita que Next lo bundlee. **No basta por sí sola:** un deploy con solo esto siguió fallando en producción.
>
> Un derivado nacido antes de que el kit los declarara tiene que agregar ambos a mano. `pnpm preflight` verifica los dos.
>
> 🔴 **No uses globs de `outputFileTracingIncludes` sobre `node_modules/**`.** Parece el fix obvio y rompe el deploy una etapa más adelante: con pnpm esos paths son **symlinks** al store, y Vercel rechaza empaquetar una función construida a través de uno (*"invalid deployment package… files in symlinked directories"*). El build sigue compilando, así que el fallo se mueve de runtime a empaquetado en vez de desaparecer. `preflight` también marca esos globs. Detalle → [`sk-mfa`](../../skills/sk-mfa/SKILL.md) §10.

### 2.3 Overrides selectivos por major

`pnpm.overrides` acepta la forma `"paquete@rango": "versión"`, que aplica **solo** a las resoluciones que caen dentro de ese rango.

Úsala siempre que **convivan varias majors** del mismo paquete en el árbol — algo común en dependencias transitivas profundas, donde cada consumidor pinea la suya y cada major tiene su propia línea de fix.

```json
"brace-expansion@5": "^5.0.9"   // ✅ sube solo las instancias de la major 5
"brace-expansion": "^5.0.9"     // ❌ fuerza la major 5 sobre quien declara 1.x o 2.x → rompe el install
```

**Cómo saber si aplica:**

```bash
pnpm why <paquete>            # ¿aparece en más de una major?
```

### 2.4 Advisories sin arreglo posible

No todo advisory se puede cerrar. Cuando el **peer** de una dependencia directa no permite ninguna versión parchada, perseguirlo rompe la instalación.

**Criterio de decisión — se documenta y se acepta cuando se cumplen las dos:**

1. **No hay versión que lo cierre** dentro del rango que permite el peer.
2. **No es alcanzable desde tu código** — verificaste en tu `src/` que no usas la superficie de API afectada.

El caso vivo del kit es **`nodemailer`**: el peer de `next-auth` permite `^7 || ^8` mientras el advisory cubre `<= 9.0.0` — ni el tope del rango permitido está parchado. Y no es alcanzable: el advisory es sobre la opción `raw` a nivel de mensaje (que escapa los guards de acceso a archivos/URLs), y el dispatcher del kit solo pasa opciones estructuradas.

> ⚠️ **Verifícalo en TU código, no lo asumas.** Si tu derivado usa `nodemailer` directamente y en algún lado pasa `raw`, el advisory **sí** te aplica.

Deja el hallazgo escrito (en el commit y en tu doc de release) para que el siguiente `preflight` no lo re-investigue desde cero.

---

## 3. Caso trabajado — la campaña del kit v11.5.0

Los números de esta sección **caducan**. Sirven como ejemplo del procedimiento y como punto de partida si tu derivado viene de una versión cercana.

**Resultado:** de 2 critical + 13 high → **0 critical + 1 high** (la de §2.4).

### 3.1 `dependencies`

```diff
-    "next": "16.2.9",
-    "next-auth": "5.0.0-beta.30",
+    "next": "16.2.11",
+    "next-auth": "5.0.0-beta.32",
...
-    "sharp": "^0.34.5",
+    "sharp": "^0.35.3",
```

> Si tu derivado está en una **minor distinta de Next**, no saltes a ciegas: toma el último parche **de tu minor** y confirma que cubra los mismos advisories. El objetivo es cerrar el advisory, no igualar el número al del kit.

### 3.2 `pnpm.overrides`

```diff
     "overrides": {
       "@auth/core": "0.41.3",
       "@auth/core>nodemailer": "^7.0.12",
+      "brace-expansion@5": "^5.0.9",
       "esbuild": ">=0.25.0",
+      "fast-uri": "^3.1.5",
       "picomatch": "^4.0.4",
-      "postcss": "^8.5.10"
+      "postcss": "^8.5.18",
+      "sharp": "^0.35.3"
     },
```

### 3.3 Qué cerró cada cambio

| Cambio                     | Cierra                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `next-auth` → `beta.32`    | **Las 2 críticas.** (a) **GHSA-7rqj-j65f-68wh**: el normalizador de email validaba antes de normalizar Unicode — `＠` (U+FF20) y `﹫` (U+FE6B) colapsan a `@` bajo NFKC, así que un magic link pedido para `victim＠example.com` podía llegar a `victim@example.com`. (b) **GHSA-8fpg-xm3f-6cx3**: un error de configuración dejaba el objeto de auth poblado con el error → los checks de existencia **fallaban abiertos**. |
| `next` → `16.2.11`         | Un bypass de middleware, un DoS de Server Actions y dos SSRF.                                                    |
| `sharp` (+ override)       | Advisory alto en el procesamiento de imágenes. Ver §2.2 — el override es obligatorio.                            |
| `postcss`, `fast-uri`, `brace-expansion@5` | Advisories altos en transitivas. Sin cambio de código.                                          |
| `nodemailer`               | **No se cierra.** Ver §2.4.                                                                                      |

> **Nota sobre el pin `@auth/core: 0.41.3`:** `next-auth@beta.32` ya lo pinea ahí. La re-validación de §2.1 se hizo y salió **byte-idéntica** en `0.41.0 → 0.41.3`: el delta completo fueron tres parches de hardening que no tocan el camino sign-in/merge. Por eso el número se pudo mover.

---

## 4. Runbook

```bash
# ── F0 · Red de seguridad ────────────────────────────────────────────────
git status --porcelain          # DEBE estar vacío — si no, STOP y reporta
git checkout -b chore/dep-upgrade-$(date -u +%Y%m%d)
pnpm audit --prod > /tmp/audit-antes.txt   # foto para comparar al final

# ── F1 · Diagnóstico ─────────────────────────────────────────────────────
pnpm audit --prod               # ¿qué está abierto y quién lo trae?
pnpm why <paquete>              # por cada advisory: ¿transitiva? ¿varias majors? (§2.2, §2.3)

# ── F2 · ⏸ GATE — antes de tocar next-auth ───────────────────────────────
# Si el plan incluye subir next-auth o @auth/core → haz §2.1 AHORA, no después.
[ -f tests/unit/auth/auth-core-pin.test.ts ] && echo "⚠️  guard presente — §2.1 es obligatorio"

# ── F3 · Aplicar ─────────────────────────────────────────────────────────
# Edita package.json (dependencies + pnpm.overrides). El gate del harness
# pedirá confirmación en el install — eso es esperado (CODING.md §7).
pnpm install

# ── F4 · Verificar ───────────────────────────────────────────────────────
pnpm verify                     # lint + typecheck + test
pnpm build
pnpm test:e2e                   # en particular el spec de account-takeover
pnpm start                      # + los 3 curl de §2.2 si tocaste sharp

# ── F5 · Confirmar ───────────────────────────────────────────────────────
pnpm audit --prod               # compara contra /tmp/audit-antes.txt
pnpm preflight                  # veredicto de release
```

### Criterio de éxito

| Check                            | Esperado                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| `pnpm audit --prod`              | **0 critical**; los high restantes, documentados por §2.4    |
| `pnpm verify`                    | verde                                                        |
| `pnpm build`                     | verde                                                        |
| `auth-core-pin.test.ts`          | verde, con el número nuevo **y** el `cmp` registrado         |
| `pnpm test:e2e`                  | verde (spec de account-takeover incluido)                    |
| `/_next/image` en 3 anchos       | `200` + `image/webp` + dimensiones correctas (si tocaste `sharp`) |

---

## 5. Adyacente — el techo de heap en CI

Problema distinto, misma clase (algo que cada derivado estaba parchando a mano): **`JavaScript heap out of memory`** en CI.

V8 dimensiona su old-space por defecto según la memoria que el proceso **ve**. En un runner de GitHub — y más adentro del contenedor de Playwright — ese default queda por debajo de lo que necesitan `next build` + una corrida completa de Vitest.

Son **4 lugares**, porque el techo **no se propaga** de uno a otro:

| Dónde                         | Cómo                                                                                    | ¿Llega con `factory update`?                    |
| ----------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `.github/workflows/ci.yml`    | un `env:` por job                                                                        | ✅ sí                                            |
| `.github/workflows/e2e.yml`   | un `env:` por job                                                                        | ⚠️ es `merge=ours` → corre `pnpm setup:e2e`      |
| `scripts/tools/e2e-runner.ts` | en el origen: el `next start` por fase **reemplaza** el `NODE_OPTIONS` heredado          | ✅ sí                                            |
| `package.json` → `dev:next`   | el alias del kit                                                                         | ✅ vía `OBSOLETE_SCRIPT_CMDS`                    |

```yaml
env:
  NODE_OPTIONS: '--max-old-space-size=4096'
```

```json
"dev:next": "NODE_OPTIONS='--max-old-space-size=4096' next dev --turbopack"
```

> **No cuesta minutos facturados.** `--max-old-space-size` es un **techo**, no una reserva: no aparta memoria por adelantado ni cambia el tipo de runner, y la facturación cuenta wall clock. Un OOM, en cambio, te cobra la corrida dos veces.

---

## 6. Referencias

| Qué                                            | Dónde                                                     |
| ---------------------------------------------- | --------------------------------------------------------- |
| El ataque que protege el pin de `@auth/core`   | [`account-takeover.md`](./account-takeover.md)            |
| Guardián del pin + log de re-validación        | `tests/unit/auth/auth-core-pin.test.ts` (en tu repo)      |
| Cobertura unit de D3                           | `tests/unit/auth/login-gate.test.ts` (en tu repo)         |
| Campaña original + detalle de cada advisory    | `.claude/docs/CHANGELOG.md` → `[11.5.0]`                  |
| Por qué `package.json` no viaja                | `BR-FACTORY-006` (born-frozen)                            |
| Gate de instalación de dependencias            | `.claude/rules/CODING.md §7`                              |
| Subir un derivado viejo al kit de hoy          | [`legacy-migration.md`](./legacy-migration.md)            |

---

_TimeKast Factory — retrofit shipped: upgrade de dependencias_
