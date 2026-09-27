# Migration brief — tus jobs de CI y E2E dejan de gastar minutos de GitHub

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a **todo derivado que corra CI o
> E2E en runners de GitHub**. Si tu repo ya está en el pool, no te aplica.
>
> **Disponible desde:** kit `v12.2.0`
>
> 🔴 **Todo repo privado de la org `TimeKast` YA puede usar el pool — no hay alta por repo.**
> El runner group `e2e-pool` está abierto a todos los repos privados de la org. Consecuencia
> práctica: el `e2e.yml` que genera `pnpm setup:e2e` (con `runs-on: [self-hosted, e2e,
> playwright]` y `playwright install chromium` sin `--with-deps`) **funciona tal cual**; se
> regenera sin re-aplicar nada a mano. Solo un repo **público** (o de otra org) se queda en
> hosted, y ése necesita dos ediciones al archivo generado: `runs-on: ubuntu-latest` **y**
> `playwright install --with-deps chromium` (la VM de GitHub no trae las librerías de sistema
> del navegador que la imagen del pool sí). El resto (caché de pnpm condicional, workers por
> CPU real) funciona igual en los dos mundos.
>
> 🤖 **Agente:** si ves `runs-on: ubuntu-latest` en un repo privado de la org, eso es drift a
> corregir hacia el pool, no una excepción a preservar.
>
> 🔎 **"¿Mi repo está en el runner group?"** — Si es privado de la org, sí. Sin `admin:org` no
> lo puedes consultar por API (403) y no hace falta: despacha el job y lee `runner_group_name`
> en el log.
>
> **Si esto se cae** (un job queda en cola sin runner, `Waiting for a runner to pick up this
> job`), la causa es de la infra del pool, no de tu repo — avisa; no conviertas tu repo a hosted
> como solución.
>
> ⚠️ Lo anterior depende de UNA configuración de la org ("All repositories" en el runner group).
> Si algún día cambia a lista, este bloque es lo que hay que corregir primero.
>
> **Para:** el equipo (o el agente) de una app TimeKast derivada del Factory. No hace falta
> leer el código del pool — esta guía se basta sola; ese es su criterio de éxito.
>
> **Cuesta:** ~30 minutos por repo si tu suite ya es paralelo-segura. Si no lo es, el trabajo
> real está casi todo en la sección 6; cumpliendo §6.1 y sin `storageState` compartido, es de
> horas y no de días.
>
> **Contrato vivo de la suite:** [`sk-e2e`](../../skills/sk-e2e/SKILL.md) — §1.2 (modelo de
> costo), §4 (`own-session.ts`), §6 R4 y R9. La infra del pool vive en
> `TimeKast/gh-runner-pool`.

---

## 1. Qué pasa, y por qué te conviene

La org está en GitHub Free: **2,000 minutos de Actions al mes para TODA la organización**
(no por seat; Team sube a 3,000, también por org). En septiembre se agotaron el día 2; cada
minuto siguiente se cobra a $0.006. E2E y CI de un solo repo activo ya son ~1,200
minutos/mes.

La org tiene un **pool de runners self-hosted** en Railway (repo
`TimeKast/gh-runner-pool`, runner group `e2e-pool`). Un job que corre ahí **no consume
minutos de GitHub**; cuesta el cómputo real en Railway, medido: **$0.011 por job de CI y
$0.011–0.021 por corrida de E2E**, contra $0.036 y $0.066–0.072 facturados en hosted. Y es
más rápido: `validate` 7.3 → 2.7 min; E2E 9.0 → 3.9 min con `workers: 4`.

Segunda medición, en una suite grande (`adi-capital-admin`, ~166 tests, 2026-09-11): **E2E
892 s → 337 s (−62 %)** con 4 workers, y **CI `validate` 639 s → 420 s (−34 %)**.

🔴 **Mide el step de trabajo, no el total del job, y di siempre contra qué comparas.** En esa
misma medición el step de tests dio 317 s en las cuatro corridas, **sin desviación**: toda la
dispersión del total vivía en el arranque — una corrida gastó 117 s en `Set up job` más 160 s
en el checkout sobre un contenedor frío. Un runner frío suma del orden de 4.5 min al total, y
leído contra el promedio se confunde con una regresión que no existe.

Todo lo que ves en la UI de GitHub (checks, logs, artifacts, notificaciones) sigue igual:
el pool solo cambia **dónde** se ejecuta el job.

## 2. Phase 0 — ¿me aplica? (y en qué estado está tu repo)

Cuatro estados, leídos del `e2e.yml` **en la rama que vas a deployar** (no en `main`):

| Estado | Señal | Lo que `/deploy` dirá |
|---|---|---|
| Pool | `runs-on` con `self-hosted` | gate completo: verde verificado / rojo = freno |
| Hosted | `runs-on: ubuntu-latest` | "E2E no verificado (repo en hosted)"; usa una corrida verde del SHA si existe, no dispara |
| E2E que nunca corre | `e2e.yml` existe, 0 corridas (trigger solo `main`, `paths-ignore`) | "no verificado" + la causa |
| Sin E2E | no hay `e2e.yml` (solo `.example`) | "no aplica — `pnpm setup:e2e` lo crea" |

Esta guía te lleva del segundo, tercer o cuarto estado al primero.

- Tu repo es privado de la org `TimeKast` → sí. (Repos públicos: NO — el runner group tiene
  "Allow public repositories" apagado a propósito.)
- Tu repo está en el runner group `e2e-pool` (Settings de la org → Actions → Runner
  groups). Hoy es "All repositories"; si cambia a lista, pide que te agreguen.
  ℹ️ Sin `admin:org` en tu `gh` no puedes consultarlo, y no hace falta pedir el scope: se
  resuelve empíricamente — despacha el job y lee `runner_group_name` en el log del runner.
  Si corrió, pertenece.
- Tu `@playwright/test` está entre las versiones horneadas en la imagen del pool (hoy
  1.58.2, 1.58.0, 1.57.0 — `grep -o "@playwright/test@[0-9.]*" pnpm-lock.yaml | sort -u`).
  Si no: todo funciona igual, la primera corrida descarga tu versión (~1 min); pide que la
  horneen en `gh-runner-pool/Dockerfile` (una línea) para que sea instantáneo.

Lo que el pool ya te da, sin tocar nada en tu repo:

| Provee | Qué es |
|---|---|
| labels `self-hosted, linux, x64, e2e, playwright` | a qué apuntar en `runs-on` |
| `NEXT_BUILD_CPUS=4` | el contenedor "ve" ~48 CPUs pero tiene 4; Next lo lee si tu `next.config.ts` lo consume (sección 5) |
| `VITEST_MAX_THREADS=4` / `VITEST_MIN_THREADS=1` | Vitest los honra nativamente; nada que hacer salvo que fijes `poolOptions.threads` explícito |
| `*.localhost` → 127.0.0.1 (`tenant-e2e.localhost`, `ops-e2e.localhost`) | hosts virtuales para el fixture `request`; si usas otros nombres, pide que los agreguen a `E2E_LOOPBACK_HOSTS` |
| 4 vCPU / 12 GB por job, 6 jobs simultáneos en la org | techo medido: `next build` pico 8.2 GB |
| Node 22, pnpm, navegadores de Playwright | horneados; `playwright install` es cache hit |

## 3. Phase 1 — `ci.yml`

En cada job (`validate`, y `integration` si lo tienes):

```yaml
runs-on: [self-hosted, linux, x64]
```

y en `actions/setup-node`, el caché de pnpm **condicional** — en el pool el store de pnpm
persiste en el contenedor y subirlo al caché de GitHub costaba 1.3 min por job:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: '22'
    cache: ${{ runner.environment == 'github-hosted' && 'pnpm' || '' }}
```

Si `validate` no tiene el guard de PRs de forks que sí tiene `integration`, agrégalo por
simetría (riesgo bajo en repo privado, pero un self-hosted ejecuta lo que el workflow diga):

```yaml
if: ${{ github.event_name != 'pull_request' || github.event.pull_request.head.repo.fork == false }}
```

Nada más cambia: pasos, secrets, `timeout-minutes`, `concurrency`.

## 4. Phase 2 — `e2e.yml`

1. `runs-on: ubuntu-latest` → `runs-on: [self-hosted, e2e, playwright]`.
2. **Borra** el bloque `container: image: mcr.microsoft.com/playwright:vX.Y.Z-noble`. El
   runner **ya es** esa imagen; dejarlo intentaría Docker-in-Docker.
3. Asegúrate de que exista el paso `pnpm exec playwright install chromium` después de
   `pnpm install` (el template del kit ya lo trae). El pool nunca asume tu versión: cada
   job instala la suya; horneada = instantáneo.
4. Mismo caché condicional de `setup-node` que en `ci.yml`.
5. Inputs de `workflow_dispatch` para experimentar sin tocar config (sección 5.2).
6. `timeout-minutes: 30` (el default del kit; si tu repo lo subió a 60, bájalo). En el pool
   el timeout importa MÁS: un job colgado ya no factura minutos, pero ocupa una réplica y,
   si lo cancelas, deja un zombi que bloquea el grupo de concurrencia de esa rama ~10 min.
   CI se queda en 15 (medido: 2–6 min).
7. Opcional, ahora que cuesta ~$0.02: agrega tu rama de trabajo al `push:` (`branches:
   [main, develop]` con el mismo `paths-ignore`). El template del kit lo evitaba por costo
   de minutos; ese argumento ya no aplica en el pool.
8. Nada más: secrets, `E2E_PARENT_BRANCH`, el volcado de `vars`, `upload-artifact`.

🔴 **No regeneres el workflow con `pnpm setup:e2e` para aplicar esto.** Ese comando
reescribe el archivo DESDE EL TEMPLATE, y si tu `e2e.yml` está generado **pero
customizado** —variables de tu proyecto, un step propio, un `E2E_PARENT_BRANCH` pineado a
mano— se lleva esas customizaciones por delante. Edita a mano. (Visto en
`adi-capital-admin`: cinco customizaciones en un archivo que a primera vista parece
generado; el propio archivo lo advierte en un comentario.) Si de todos modos regeneras
algún día, verifica que estos deltas sigan ahí.

## 5. Phase 3 — la app tiene que saber cuántos CPUs tiene de verdad

### 5.1 `next.config.ts`

El contenedor reporta los CPUs del host (~48), no su cuota (4). Sin esto, `next build`
lanza 47 workers y muere OOM (visto: exit 137 a los 8 minutos).

Un derivado **nuevo** ya nace con esto; los dos archivos de abajo nacen **congelados**
(BR-FACTORY-006), así que en un repo existente son edición manual — cópialos del kit.

```ts
// next.config.ts — fuera del objeto, arriba
const buildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS ?? '', 10);
const buildParallelism =
  Number.isInteger(buildCpus) && buildCpus > 0 ? { experimental: { cpus: buildCpus } } : {};

const nextConfig: NextConfig = {
  ...buildParallelism, // ← y esto dentro
  // …
};
```

Sin la variable (local, hosted) el config queda byte por byte como estaba: ni siquiera
aparece la clave `experimental`.

🔴 **Si tu repo YA tiene un bloque `experimental`, fusiona dentro de él** — esparcir
`...buildParallelism` al lado sobreescribe el bloque entero y te llevas por delante lo que
hubiera ahí. En `adi-capital-admin` eso habría borrado
`serverActions.bodySizeLimit: '51mb'`, que es lo que permite subir documentos de 50 MB: un
fallo de producto que ningún test de E2E ve venir. La forma segura, con `cpus` como número:

```ts
const buildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS ?? '', 10);
const buildParallelism = Number.isInteger(buildCpus) && buildCpus > 0 ? buildCpus : undefined;

  experimental: {
    // …lo que ya tenías, intacto
    ...(buildParallelism ? { cpus: buildParallelism } : {}),
  },
```

Y revisa si tu repo ya arrastra `NODE_OPTIONS=--max-old-space-size=…` en CI: si el build ya
se quedaba corto de heap con un proceso, 47 contra 12 GB no es un riesgo teórico.

### 5.2 `playwright.config.ts` — cuatro workers en todos lados, ajustados al hardware

```ts
import os from 'os';
// …
retries: Number(process.env.E2E_RETRIES || 1),
workers: Number(process.env.E2E_WORKERS || Math.min(4, os.availableParallelism())),
```

- **Cuatro por default, no uno.** En el pool cada job tiene 4 vCPU y la corrida baja de ~9
  a ~4 minutos. `Math.min` es lo que mantiene eso honesto fuera del pool: un runner hosted
  de repo privado tiene 2 vCPU, y cuatro navegadores más `next start` sobre dos núcleos es
  más lento, no más rápido.
- **Un reintento, no dos.** Un retry vuelve a correr un worker entero: es exactamente lo que
  esconde una carrera detrás de un tick verde. Uno, no cero, porque `trace: 'on-first-retry'`
  solo produce traza cuando hay reintento.
- `||`, nunca `??`: el `env:` de un step entrega `''` cuando el input no viene, y
  `Number('')` es 0 — cero workers, o una suite que nunca reintenta.

En `e2e.yml` (el template del kit ya lo trae):

```yaml
workflow_dispatch:
  inputs:
    workers: { description: 'Playwright workers (vacío = default del config)', default: '', required: false }
    retries: { description: 'Playwright retries (0 para cazar carreras)', default: '', required: false }
# …
- name: Run E2E tests
  env:
    E2E_WORKERS: ${{ inputs.workers }}
    E2E_RETRIES: ${{ inputs.retries }}
```

Vacíos por default para que el config siga siendo el único SSOT. Local:
`E2E_WORKERS=4 E2E_RETRIES=0 pnpm test:e2e` es la corrida diagnóstica.

🔴 **Si tu suite todavía no es paralelo-segura, aplica la sección 6 ANTES de subir el
default.** Cuatro workers sobre specs que se pisan no descubren carreras: las vuelven
intermitentes.

## 6. Phase 4 — paralelo-seguro: comparte la sesión solo si no mutas lo que compartes

Validado en agent-portal (sesión `agent-portal-7c`, 2026-09-07): de 7 fallos con 4
workers, **4 eran del teardown y 3 de specs que mutan la cuenta compartida**; tras el
cambio, 3 corridas seguidas con `workers: 4, retries: 0` en verde (161 ✓, fase A 3.7–4.1
min vs 6.1) y 1 con defaults.

Confirmado en un segundo repo (`adi-capital-admin`, 2026-09-11) — y ahí el trabajo fue
**mucho menor**, porque su suite ya nació con los teardowns por id y con cada spec haciendo
su propio login: de ~166 tests falló **uno solo**, y no por mutar nada (§6.2). Si tu repo ya
cumple §6.1 y no comparte `storageState`, espera un retrofit corto.

`auth.setup.ts` crea **una** cuenta por rol y guarda su sesión (storageState); los specs
la reutilizan. Con 1 worker funciona porque corren en fila. Con 4, chocan los que la
**mutan**. Regla: **el storageState de rol es de solo lectura**.

### 6.1 🔴 `afterAll` corre POR WORKER — el teardown "por marcador" borra a los vecinos
Con `fullyParallel`, cada worker ejecuta su propio `afterAll`. Un cleanup que borra por
patrón (`like(users.email, '%e2e-%')`) borra los usuarios que otro worker está usando en
ese instante. Fue **4 de los 7** fallos. Patrón: array de ids a nivel de módulo
(`createdUserIds.push(user.id)`) y `delete … where inArray(users.id, createdUserIds)`.
Nunca por marcador.

### 6.2 🔴 El asertor global — un test que no muta nada y aun así se rompe

Las dos formas de arriba son **mutadores**: el teardown que borra de más, el spec que
escribe en la cuenta que comparte. Falta una tercera, y es la que se escapa de una auditoría
que solo busque escrituras: **un test que no muta nada pero afirma sobre el estado completo
de una tabla que otros sí mutan**.

Caso real (`adi-capital-admin`, 2026-09-11): un test leía la tabla `funds` entera y exigía
que las posiciones fueran `1..N` contiguas. Cuatro specs vecinos siembran un fondo efímero y
lo borran en su teardown, así que con 4 workers el asertor leía la tabla con huecos **en
vuelo**. Los valores lo delatan: `Expected 3 / Received 5` en una corrida y `Received 7` en
otra — según cuántos vecinos vivieran en ese instante.

Dos consecuencias que valen más que el caso:

- **Amplía la pregunta de auditoría.** No es solo *¿escribe en lo que comparte?* — también
  *¿lee una tabla entera, o afirma sobre un conteo global?* Un `SELECT` sin `WHERE` que
  acote a lo que tú sembraste es un asertor global, aunque el test sea de solo lectura.
- **`mode: 'serial'` NO lo salva** (§6.5 lo ofrece como puente, y aquí no aplica): la
  colisión es **entre archivos**, y `serial` solo ordena los tests de su propio archivo. El
  puente real es acotar la aserción a las filas que el test sembró — o retirarla.

**Antes de retirar, decide si el test afirmaba algo que el sistema garantiza.** En el caso
real no lo hacía, y por eso se retiró en vez de acotarse: la unicidad —lo único con
consecuencia— la impone Postgres con un índice único; el consumo en producción es posicional
absoluto y nunca asume contigüidad; el allocator asigna `max+1` sin reutilizar, así que
borrar una fila intermedia deja un hueco **permanente y válido** que el test habría
reportado como fallo. Era más estricto que el invariante. Si en tu repo el test sí afirma un
invariante real, acótalo; no lo borres.

### 6.3 El fixture del kit: `tests/fixtures/own-session.ts`

**El kit ya lo shippea** — si tu repo nació antes, cópialo tal cual del kit (su única
dependencia, `tests/fixtures/auth.ts`, también viaja). Tres exports, sin `test.extend` a
propósito (el spec abre el contexto dentro del test y es dueño de su ciclo):

- `seedOwnUser(role, label)` → usuario verificado con password conocida
  (`e2e-own-<label>-<hex>@test.com`), vía `createTestUser`.
- `openOwnSession(browser, user)` → `BrowserContext` logueado por el **form real** de
  `/login`, mismo camino que `auth.setup.ts`: aserciones web-first (nunca `networkidle`,
  R8), `#email`/`#password`/`button[type="submit"]`, `waitForURL` **fuera de** `/login`
  (no `/dashboard`: quien deba un segundo factor aterriza en `/2fa`, y eso también es un
  login exitoso), y afirma que se acuñó la cookie de sesión. Arranca de storageState vacío
  a propósito. Rutas relativas: el `baseURL` sale del proyecto de Playwright, así que la
  sustitución de puerto del runner sigue funcionando.
- `cleanupOwnUser(user)` → `cleanupTestUser`.

### 6.4 Quién usa qué

- **Usuario propio + `openOwnSession`** — el spec **navega como** la cuenta que muta:
  enrola un factor, registra una passkey, planta o revoca un grant de step-up, vincula un
  proveedor, cambia el correo. En el kit: `passkey-login`.
- **Usuario propio SIN login** — el spec **actúa sobre** un usuario desde una sesión de
  admin compartida (otorgar o quitar un rol, un alcance, un acceso). El objetivo es propio;
  el conductor sigue siendo compartido.
- **Teardown por ids** (6.1) en todo spec que cree usuarios. En el kit ya lo hacen los
  cinco de identidad (`auth-linking`, `email-change`, `2fa-fail-closed`, `step-up`,
  `auth-takeover`) más `user-admin`.
- **Login central, sin cambios**: todo lo demás — que es la mayoría, porque solo lee.
  Ningún `serial` nuevo hizo falta.

En tu repo, la lista equivalente sale de **dos** preguntas por spec, no de una:

1. *¿escribe en la cuenta con la que entró?* → candidato a usuario propio (arriba).
2. *¿lee una tabla entera, o afirma sobre un conteo global?* → asertor global (§6.2), y esa
   no se arregla con un usuario propio ni con `serial`.

Un spec que responda "no" a las dos puede quedarse como está, aunque sea de solo lectura —
que es la mayoría.

### 6.5 Datos compartidos y DOM bajo carga
- La rama efímera de Neon **hereda los datos de `develop`**: `getByText('42 filas')` choca
  con filas reales. Acota siempre a la fila que TÚ sembraste.
- Orden de cleanup: primero las filas que apuntan a `users` **sin cascade**
  (`scheduled_reports`/`report_recipients`, `saved_analyses`, `conversations`,
  `query_audit_logs`, `oauth_authorization_codes`/`oauth_grants`); tokens, factores y
  grants de step-up sí cascadean.
- El route announcer de Next **duplica el h1** → `getByRole('heading', …)`, no `getByText`.
- Un `reload` sin `networkidle` ve el panel Radix del server y el del cliente a la vez
  (ids `_R_` vs `_r_`) → `waitUntil: 'networkidle'`.
- `page.goto` que muere con `net::ERR_ABORTED` tras guardar un form = el guard de
  unsaved-changes (beforeunload), no la red: busca un form que no hace `reset()` al
  guardar. En agent-portal fue un defecto real de producto.
- `getByLabel` sin `exact` matchea aria-labels de switches de otros specs; sufijos
  aleatorios no bastan si el label parcial coincide → `{ exact: true }`.
- Puente para un spec que no valga la pena migrar aún:
  `test.describe.configure({ mode: 'serial' })`.

Diagnóstico para encontrar los tuyos: `gh workflow run e2e.yml -f workers=4 -f retries=0`
contra un baseline verde con 1 worker; lo que falle solo con 4 es candidato. Criterio de
cierre: **3 verdes seguidas con 4/0 + 1 con defaults** — una sola verde no prueba nada con
carreras.

## 7. Phase 5 — verifica

1. `gh workflow run e2e.yml --ref <tu-rama>` y en el log:
   - `Collecting page data using 4 workers` (no 47) — la app leyó `NEXT_BUILD_CPUS`.
   - `playwright install` < 5 s — versión horneada.
   - Cero `getaddrinfo ENOTFOUND` — hosts virtuales resueltos.
   - `Running N tests using 1 worker` (o 4 cuando aplique).
2. Un push a tu rama de trabajo: los dos jobs de CI arrancan **al mismo segundo** en
   runners `railway-*` distintos.
3. **Ante un rojo, compara primero con los últimos runs en hosted** — tres veces el "fallo
   del pool" fue pre-existente (calibración por datos, FK del fixture de integration).
   `retries: 2` enmascara carreras: para diagnosticar, `retries=0`.

### 7.1 No necesitas mergear a `main` para empezar a experimentar

`gh workflow run e2e.yml --ref <tu-rama> -f workers=4 -f retries=0` funciona aunque la
definición en la default branch todavía **no declare** los inputs `workers`/`retries`:
GitHub los resuelve desde la definición del workflow en **la ref que despachas**. Medido en
`adi-capital-admin` (2026-09-11) — el retrofit entero se puede validar en la rama de trabajo.

🔴 **El límite:** el evento `workflow_dispatch` solo es despachable si el **archivo** existe
en la default branch. Un `e2e.yml` que nazca directamente en una rama de trabajo devuelve
404 al despachar; ahí sí hay que llevarlo a la default branch antes.

---

## 8. Qué NO tienes que hacer

- Nada de secrets: `${{ secrets.* }}` se inyecta igual.
- Nada de `RAILWAY_*`: el pool los quita del env de los jobs (un `isDeployed()` que mire
  `RAILWAY_ENVIRONMENT` se creería desplegado y rechazaría el agent server local — pasó).
- Nada de runners nuevos por repo: es un pool de la org; solo apuntas `runs-on`.

## 9. Preguntas que aparecen siempre

- **¿Y si el pool está caído?** El job queda `queued`; con `timeout-minutes` corto falla en
  minutos, no en 6 horas. Railway avisa del crash; el contenedor se recrea solo.
- **¿Por qué mi E2E sigue tardando 9 min con 1 worker?** Porque el tiempo está en los
  tests, no en el pool (el build en frío son ~2.5 min). El 4 es el que baja a ~4 min.
- **¿Por qué mi CI bajó 34 % y no 63 % como el del piloto?** Porque el pool acelera lo que
  estaba **limitado por CPU**, no lo que está limitado por la **cantidad de trabajo**. Si el
  tiempo de tu `validate` vive en una suite unitaria grande, más vCPU lo mejora hasta donde
  el paralelismo de esa suite lo permite y ahí se detiene. El ahorro de dinero es el mismo;
  el de tiempo, no extrapola entre repos.
- **¿Puedo correr E2E en `develop` ahora?** Sí (Phase 2, punto 7): el template del kit lo
  evitaba por costo; a $0.02 por corrida en el pool ese argumento ya no aplica. Además es
  lo que hace que el gate de abajo casi nunca te haga esperar.
- **¿Y el deploy?** `/deploy` (kit) comprueba que exista una corrida de E2E **verde para
  el SHA exacto** que va a mergear: la busca por `--commit`; si está en vuelo la espera; si
  no existe la dispara (≤6 min con 4 workers); si está roja, frena y nombra el spec. No
  corre nada en tu máquina, no frena a nadie más, y `--skip-e2e` es la salida explícita
  para un hotfix. Depende solo de GitHub Actions + el kit: sirve igual en Vercel, Railway
  o un VPS.
