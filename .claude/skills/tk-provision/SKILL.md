---
name: tk-provision
description: Factory-internal workflow that provisions a derived project's environment by driving the `factory provision` CLI primitives in order (tooling check, vault rail, state, service and domain choice, narration), with a HIGH-risk Plan Mode gate before the irreversible deploy substrate (Vercel or Railway), and an optional env-config wizard at the end. The CLI commits and pushes the initial migration itself; the skill never does. Primary invocation is `/provision`; do not run it outside that command.
family: factory-internal
model: opus
parallelism_unit: none
concurrency_cap: 1
auditor_step: false
last-verified: 2026-09-25
user-invocable: false
---

# tk-provision — `/provision` Workflow Skill

> Factory-internal workflow. The unit of work is **one derived project's environment**: verify the tooling, make sure the org secrets are present, read whatever provision state already exists, ask the developer the two real questions (which services, which domain), then drive the `factory provision` CLI primitives **in order**, narrating each step. The CLI primitives are headless and flag-driven; this skill is the **interactive orchestrator** around them — it remembers the order, the flags and the security gates so the developer does not have to.

> **Slash command:** `/provision [--step] [--verbose] [--dry-run] [--resume] [--adopt]` (thin wrapper in `.claude/commands/provision.md`).

> **Architectural principle:** the CLI owns the mutations; this skill owns the **sequence, the gates and the narration**. The one irreversible moment (on Vercel: creating the project + connecting git + installing the GitHub App; on Railway: creating the project + connecting the repo) is a hard Plan Mode stop that never auto-advances — everything else flows.

---

## 1. Propósito + cuándo usar

Invocar en un **proyecto derivado** del Factory cuando hay que aprovisionar su entorno (su proyecto en la bóveda de secretos, DB Neon, hosting —Vercel o Railway, uno por repo— + git substrate, dominios DNS, correo Resend) por primera vez, retomar uno a medias, o adoptar el state de uno provisionado antes de que existiera el CLI.

**Usar para:** correr el ciclo completo de provisioning de un derivado (`/provision`); retomar un provisioning interrumpido (`/provision --resume`); reconstruir el state de un derivado existente sin tocar recursos (`/provision --adopt`); ensayar el plan sin mutar nada (`/provision --dry-run`).

**No usar para:** destruir recursos de un derivado — eso lo corre una persona a propósito en su terminal, no este flujo (la primitiva `factory provision --destroy` existe en el CLI —con bóveda también borra sus syncs, revoca la key de Resend del proyecto y borra su proyecto de la bóveda; con Railway borra el proyecto de Railway con `RAILWAY_TOKEN` del rail; si el state no registra el id del proyecto de Railway, esa parte se salta —o falla nombrando el proyecto, si había un alta en curso— y el resto del teardown sigue— pero este skill no la orquesta → `fx-factory-cli` § `--destroy`); administrar el rail de la bóveda en sí (cargar o rotar un token de `rail-timekast`, dar acceso a una persona) — es trabajo de un admin de la bóveda, fuera de este skill (`fx-secrets-vault`); el bootstrap del repo (`factory new`/`add`); editar el modelo de datos o el RBAC de la app del derivado.

---

## 2. Tono + Plain Language (user-facing)

Todo lo que el **developer** ve va en lenguaje claro es-MX. Audiencia = developer mid-level que sabe usar la terminal pero NO recuerda el orden de las primitivas ni qué token va dónde. Hereda `CC.md §3` (kit-wide). Extensión de vocab a definir inline (primer uso por turno):

| Término               | Definición plain                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| provisioning          | crear y conectar la infra de un proyecto (base de datos, hosting, dominios, correo)              |
| primitiva CLI         | un subcomando de `factory provision` que muta UN provider — el skill las corre en orden          |
| state                 | el archivo `.timekast/provision.json` que registra qué se creó (IDs, no secretos) — permite retomar. Su bloque `vault` es el vínculo del repo con su proyecto de la bóveda |
| bóveda                | el almacén de secretos de la organización (Infisical); cada persona entra con su propia sesión (`infisical login`). Cada repo tiene ahí su propio proyecto, con los entornos `main`, `develop` y `local` (`fx-secrets-vault §6`) |
| wrapper de la bóveda  | `scripts/tools/with-vault.mjs`: los scripts del `package.json` (`dev`, `build`, `db:*`, `test:e2e`…) corren a través de él y reciben el entorno `local` de la bóveda, sin archivo en disco |
| rail de secretos      | los tokens de provisioning del org: el proyecto `rail-timekast` de la bóveda, entorno `main`. El CLI los lee con la sesión del developer; no hay copia local |
| lifecycle             | `live` (producción) — el default y ÚNICO que el skill provisiona. `ephemeral` (desechable) existe SOLO vía el flag crudo `npx @timekast/factory provision --ephemeral`; el skill nunca lo pregunta |
| HIGH-risk gate        | el punto irreversible (Vercel: proyecto + git + GitHub App · Railway: proyecto + conexión del repo) — para con Plan Mode, siempre |
| destino               | la plataforma donde se despliega el repo: Vercel o Railway, una por repo. Queda en el state (`target`) |
| modo fluido           | el default: corre suelto y solo para ante una señal real (algo falla, o el gate HIGH-risk)        |
| headless              | corrida sin terminal; las preguntas las contesta el curador HITL, no AskUserQuestion |
| curador HITL          | el humano que el orquestador headless intercala para responder las preguntas cuando no hay terminal (human-in-the-loop) |

### Pattern de narración (por primitiva)

Después de cada primitiva el skill emite 2-3 líneas plain: **qué se creó/configuró** (en términos de capacidad, no IDs crudos — "la base de datos quedó lista con su rama de desarrollo aislada"), **estado** (qué falta), y si aplica el **próximo paso**. Los IDs crudos del provider van al `.timekast/provision.json`, no al narrado.

### Anti-patterns

- Citar el exit code crudo del CLI. Re-expresar plain: "el preflight falló — `gh` no está autenticado".
- Dumpear el JSON del state al developer. Resumir: "Neon y Vercel listos; faltan dominios."
- Listar IDs de provider sin contexto. "prj_abc, br_xyz creados" → "el proyecto de hosting y la rama de desarrollo quedaron conectados".
- Citar nombres de cliente o derivados concretos — el skill es genérico.

---

## 3. Anti-Drift / Quality Rules (no-negociables)

1. **El gate HIGH-risk para siempre.** El paso que crea el proyecto Vercel + conecta git + instala la GitHub App es irreversible → Plan Mode formal (CP2), para **incondicionalmente** incluso en modo fluido. Con destino Railway, el mismo CP2 cubre crear el proyecto de Railway y conectarle el repo (`fx-workflow-authoring §7.1`, criterio 3 — HIGH-risk no auto-avanza). Nunca inventar aprobación.
2. **El orden de las primitivas es fijo.** Bóveda → Neon (DB) → sustrato de despliegue (HIGH-risk): Vercel + git, o git + Railway → dominios DNS + Resend. Un paso no arranca si el anterior falló — se retoma con `--resume`, no se saltea.
3. **Fail-closed en seguridad.** Sin `gh` autenticado, sin sesión de la bóveda, sin acceso a `rail-timekast` o con un token ausente → no se muta nada. El skill para y dice qué falta (Phase 2); nunca procede a ciegas. Y nunca lee la bóveda por su cuenta: los valores no pasan por la conversación.
4. **No mutar en `--dry-run`.** El flag `--dry-run` se propaga a TODAS las primitivas; ninguna llamada REST/git/state ocurre. El skill narra el plan, no lo ejecuta.
5. **El CLI es el dueño de las mutaciones.** Este skill NO reimplementa la lógica de creación de recursos ni el state — la invoca como primitiva y narra. No editar `.timekast/provision.json` a mano.
6. **`gh` obligatorio; `vercel`/`neonctl` opcionales.** Las primitivas mutan por las APIs de cada proveedor con los tokens del rail de la bóveda; un `vercel`/`neonctl` ausente nunca es un abort, y no se invita a instalarlos: ninguna primitiva los usa. El CLI de Railway no se usa (no sirve para agentes — `fx-secrets-vault §5`): Railway se opera por su API GraphQL.
7. **No inventar business rules ni el modelo de datos del derivado** (`CODING.md §8`) — este skill solo orquesta infra, no toca `src/` ni el schema de la app.
8. **El skill no commitea ni pushea; el CLI sí, y sólo lo declarado** — `factory provision` commitea y pushea la migración inicial `0000` a `origin/main` (Phase 5 paso 0) y escribe el state. El cableado del wrapper en `package.json` (Phase 5 paso (v)) lo escribe sin commitearlo. Cualquier otro commit del repo del derivado es decisión del developer, fuera de este flujo.

---

## 4. Turn boundaries

| Turn | Phases                                                                    | Stops con                                            |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| 1    | Phase 1 (tooling) + Phase 2 (secrets) + Phase 3 (state) + Phase 4 (preguntas) | Inline (señal real para en cualquiera; si no, fluye) |
| 2    | Phase 5 hasta el sub-paso de despliegue (bóveda, migración inicial y Neon primero) | **CP2** (Plan Mode, HIGH-risk) antes del paso Vercel o Railway |
| 3    | Phase 5 resto (Vercel + git, o git + Railway; dominios + Resend + env wizard + backlog opt-in) + Phase 6 (narración) | Done — recomienda verificar el primer deploy        |

El gate HIGH-risk parte la Phase 5 en dos turns: lo previo al sustrato de despliegue corre fluido; el sustrato (Vercel o Railway) para en CP2.

---

## 5. TodoWrite

Usar **TodoWrite** desde Turn 1. Un solo todo `in_progress` a la vez. Un todo por fase (1..6); en Phase 5, un sub-todo por primitiva (bóveda · migración inicial · Neon · Vercel/git o git/Railway · dominios/Resend · env wizard · backlog si aplica) para que el progreso sea visible.

---

## 6. Flow overview

```
Phase 1  Verificación de herramientas (gh obligatorio · vercel/neonctl opcionales)
Phase 2  Verificación de secretos (infisical instalado + sesión de la bóveda viva · acceso y tokens → preflight del CLI)
Phase 3  Lectura de state (.timekast/provision.json → resume · ilegible → git/a mano)
Phase 4  Preguntas: destino (alta nueva) + servicios + dominio custom   (AskUserQuestion · headless → curador HITL)
Phase 5  Ejecución de primitivas EN ORDEN:
            (v) Bóveda: proyecto del repo + cableado del wrapper         ── fluido (default; --no-vault la omite)
            (0) Migración inicial de la base (0000 de Drizzle)           ── fluido
            (a) Neon (DB + branches)                                    ── fluido
            🛑 CP2  Vercel project + git substrate + GitHub App                ── Plan Mode HIGH-risk
                    (con Railway: proyecto de Railway + conectar el repo)
            (b) Vercel + git substrate (tras aprobación)                ── fluido
            (b') Railway, en lugar de (b), con destino Railway           ── fluido
            (c) Dominios DNS + Resend                                   ── fluido
            (d) Wizard de variables de entorno (opcional, interactivo)  ── AskUserQuestion
            (e) Backlog central (opcional, skippeable)                  ── fluido
Phase 6  Narración del resultado (qué quedó listo · próximos pasos)
```

> ℹ️ **Aplicar** las migraciones no es un paso del provisioning: corren en cada deploy, en el
> destino del repo — en Vercel, en su `vercel-build` (`pnpm build && pnpm db:migrate`), gateado por
> el exit code del comando completo; en Railway, en el pre-deploy (`TK_VAULT=off pnpm db:migrate`),
> que corre después del build. En los dos, el build va primero para que un build fallido no llegue
> a tocar la base, y si algo falla el deployment no se promueve (`SK.md §1.4`). **Generar la
> migración inicial sí lo es** (Phase 5 paso 0): el `0000` se genera, commitea y llega al remoto
> antes de que la plataforma construya el árbol — sin él, el primer deploy buildearía bien y
> fallaría al migrar una base sin journal. El CP2 crea el sustrato de despliegue — sin GitHub
> Action de migración.

---

## 7. Phases

### Phase 1 — Verificación de herramientas

Verificar la cadena de tooling **antes** de tocar secretos o recursos:

- **`gh` (obligatorio):** correr `gh --version` + `gh auth status`. Es el precedente del preflight del CLI (`cli/src/lib/preflight.ts` → `runPreflight()`). Si falta o no está autenticado → **STOP**: ofrecer instalación (`brew install gh`, o la documentación oficial de GitHub CLI) + `gh auth login`, y abortar hasta resolverlo. Sin `gh` no hay membresía org verificable → nada de provisioning.
- **`vercel` (opcional):** correr `vercel --version`. Ausente → **warning** + ayuda de instalación (`npm install -g vercel`); NO abortar. Las primitivas mutan Vercel por REST con `VERCEL_TOKEN`, no por el CLI de Vercel. Con destino Railway ni siquiera hace falta: Railway se opera por API con `RAILWAY_TOKEN`, sin CLI.
- **`neonctl` (opcional):** correr `neonctl --version`. Ausente o sin sesión → se menciona en el resumen y se sigue; NO abortar y **no sugerir instalarlo**: ninguna primitiva lo usa. Las primitivas mutan Neon por REST con el `NEON_API_KEY` del rail (decisión congelada del plan: `vercel login`/`neonctl auth` opcionales). Solo sirve para inspección manual, si el developer ya lo tiene.

> Resumen plain de Phase 1: "Herramientas: `gh` OK. `vercel`/`neonctl` no instalados (opcionales, se usa REST)." No pedir decisión si solo faltan los opcionales — surfacear en el resumen y seguir.

### Phase 2 — Verificación de secretos

Los tokens de provisioning (`VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `RAILWAY_TOKEN`, `NEON_API_KEY`, `CLOUDFLARE_API_TOKEN`, y `BACKLOG_ADMIN_TOKEN` si se pide el backlog central) son claves del **rail**: el proyecto `rail-timekast` de la bóveda, entorno `main`. `factory provision` los lee con la **sesión del developer**; no hay archivo local ni paso de carga. Contrato → [`fx-secrets-vault §3`](../fx-secrets-vault/SKILL.md); comportamiento del CLI → `fx-factory-cli` § El rail.

- 🔴 **El skill no lee la bóveda.** Nunca corre `infisical export` ni `infisical secrets` para comprobar si un token está: esos comandos imprimen **valores**, y acabarían en el transcript. La presencia y el acceso los verifica el **preflight de `factory provision`**, que es fail-closed (aborta antes de mutar nada) y sólo reporta **nombres** de clave.
- **Lo que el skill sí comprueba aquí, sin tocar valores:**
  1. `infisical --version` → instalado. Ausente → **STOP**: `brew install infisical` y login con dominio (`fx-secrets-vault §3`).
  2. Sesión viva en la instancia de la organización. El dominio sale de `.claude/policy/vault.json` (`jq -r .domain .claude/policy/vault.json`; coordenadas → `fx-secrets-vault §3`), y se ramifica por el **código de salida**, sin imprimir nada:

     ```bash
     D="$(jq -r .domain .claude/policy/vault.json 2>/dev/null)"
     [ -n "$D" ] && [ "$D" != "null" ] || { echo "no se pudo leer el dominio: falta .claude/policy/vault.json, no trae domain, o falta jq"; exit 45; }
     INFISICAL_DOMAIN="$D" infisical user get token --domain="$D" --plain </dev/null >/dev/null 2>&1
     echo $?   # 0 = sesión viva · distinto de 0 = sin sesión
     ```

     `INFISICAL_DOMAIN` no es redundante con `--domain`: sin sesión, `infisical` lanza un login automático que **ignora** `--domain` y toma el dominio de un `.infisical.json` que encuentre subiendo desde el cwd. Fijarlo impide que ese login abra una instancia ajena. Sin dominio → **STOP**: si falta `jq`, `brew install jq`; si falta `vault.json` o no trae `domain`, recuperarlo → `fx-secrets-vault §3` ("Recuperar `vault.json`"). Y si `$D` no es el dominio de la organización (el que publica `fx-secrets-vault §3`) → **STOP** igual: el `vault.json` está editado; el developer no entra a esa instancia, lo recupera.

     🔴 **Nunca por el conteo de bytes de la salida.** Sin sesión, `infisical` escribe su aviso de login en stdout y sale con 1: un `wc -c > 0` lo leería como sesión viva. Sin sesión → **STOP**: el developer corre en **su** terminal `infisical login --domain=<dominio de vault.json>` (es interactivo; el agente no lo corre) y se reintenta.
- **Las fallas que llegan del preflight del CLI (en Phase 5), cada una con su salida:**
  - **Sin acceso a `rail-timekast` — o el proyecto configurado no existe** (el mensaje nombra el proyecto y su id) → **STOP**: si al developer le falta acceso, un admin de la bóveda se lo da. Si el acceso está, el id sale del propio CLI (lleva una copia embebida; no lee `.claude/policy/vault.json` al correr): se compara el id que nombra el mensaje con `rail.projectId` de `vault.json` — si difieren, el CLI está viejo y se reintenta con la versión vigente (`npx @timekast/factory@latest provision …`); si coinciden, el proyecto cambió en la bóveda y se avisa al equipo del Factory o a un admin de la bóveda. Si la falla nombra un `rail-<cliente>`, el id sale del campo **Rail del cliente** de `project-config.md`: se revisa ahí (`fx-secrets-vault §3`).
  - **Tokens ausentes** (`Faltan tokens en rail-timekast …: <nombres>`) → **STOP**: un admin los carga en `rail-timekast`; retomar con `--resume`. La excepción es `BACKLOG_ADMIN_TOKEN`: se salta el paso de backlog con aviso (§5(e)) — **salvo que `backlog` sea el ÚNICO servicio pedido**: ahí el CLI aborta con error y es **STOP fail-closed** (no queda nada más que aprovisionar).
  - **Respuesta no reconocida o la bóveda no respondió a tiempo** → **STOP**: surfacear el mensaje del CLI (no contiene valores) y remitir a `fx-secrets-vault §3`. Nunca se lee como "token ausente".
- Sin señales → resumen: "Bóveda: `infisical` instalado y tu sesión está viva; el acceso y los tokens los confirma el CLI antes de crear nada."

### Phase 3 — Lectura de state

Leer `.timekast/provision.json` (lo escribe el CLI tras cada create; ver PROV-001):

- **No existe** → primer provisioning. Continuar a Phase 4 desde cero.
- **Existe y es válido** → modo **resume** (idempotente): **anunciar plain que ya hay entorno provisionado y que NO se recrea nada** — solo se retoma lo que falte. Mostrar el progreso previo ("La base de datos ya está creada; falta el hosting y los dominios") y continuar desde el primer paso incompleto. El skill pasa `--resume` al CLI; internamente `buildPlan` marca `skip` cada servicio cuyo bloque ya existe en el state (`isServiceComplete`) — **el skip depende del state, no del flag**, así que un recurso ya creado nunca se re-crea. 🔒 Protección de clobber: correr `factory provision` sobre un state existente **sin** `--resume` ni `--force` hace que el CLI **aborte** pidiendo elegir (retomar / descartar) — nunca pisa a ciegas. `--force` (recrear desde cero) es opt-in destructivo; el skill no lo usa salvo que el developer lo pida explícito.
- **Existe pero no se puede leer (JSON inválido)** (edge §8) → avisarlo y ofrecer dos caminos en tabla 1/2/3:

  | # | Opción       | Acción                                                                        |
  | - | ------------ | ----------------------------------------------------------------------------- |
  | 1 | **Restaurar desde git** | `git checkout -- .timekast/provision.json` — el archivo va commiteado: git tiene la última copia buena |
  | 2 | **Corregir a mano** | Revisar el archivo con el developer y dejar el JSON válido                 |
  | 3 | **Cancelar** | Termina sin tocar nada                                                         |

  🔴 **No se ofrecen `--adopt` ni `--force` aquí, y el CLI rechaza los dos (y cualquier otra corrida de `provision` sobre ese archivo, `--dry-run` incluido):** sin poder leer el archivo no sabe si el repo vive en la bóveda ni cuál es la key de correo del proyecto — el adopt reconstruiría el state como "sin bóveda", y `--force` lo borraría, dejaría huérfana esa key y crearía un segundo proyecto en la bóveda (o, con `--no-vault`, escribiría secretos en `.env.local`).

> El modo `--adopt` (`/provision --adopt` directo) es **read-only**: interroga a los providers sólo con lecturas, reconstruye el state con `lifecycle: live` y nunca crea ni borra recursos. Con Railway encuentra el proyecto por el repo conectado y pregunta el servicio y el mapeo de entornos si hay más de uno (sin terminal se detiene nombrando lo que falta) → `fx-factory-cli` § `--adopt`. Útil para derivados existentes provisionados antes del CLI (sin `.timekast/provision.json`). Con el archivo presente, `--adopt` a secas se niega a reescribirlo: re-adoptar es `factory provision --adopt --force --target=<destino>` (p. ej. un state sin bloque `railway` en un repo que vive en Railway).

### Phase 4 — Preguntas (destino + servicios + dominio)

Las decisiones reales del developer (el destino, sólo en un alta nueva). **Interactivo (TTY):** usar `AskUserQuestion`. **Headless:** ver §headless abajo — el skill NO intenta `AskUserQuestion`, el curador HITL responde.

- **¿A qué plataforma se despliega?** Vercel o Railway — el **destino** del repo (uno por repo). Sólo en un **alta nueva** (Phase 3 no encontró state): el CLI exige `--target` en toda alta con un paso de despliegue y no tiene default. Opciones:
  - **Vercel** → el skill pasa `--target=vercel`.
  - **Railway** → el skill pasa `--target=railway`. Railway **exige bóveda** (sus variables sólo llegan por el sync de la bóveda): si el developer eligió `--no-vault`, o el repo es perfil `core`, decirlo plain y ofrecer Vercel — el CLI lo rechaza igual antes de llamar a nada. El set de servicios cambia: `vercel` se sustituye por `railway`; `dns` (dominios en Railway + registros en Cloudflare + Resend) y el go-live con `--domain` funcionan igual que con Vercel.

  En `--resume`, `--adopt` y `--destroy` el skill **no** pregunta el destino ni pasa `--target`: el CLI lo lee del state o lo **descubre** preguntando a Railway y a Vercel por el repo conectado (nunca por `vercel.json` ni otro archivo). Pasar `--target=vercel` en un retomar podría contradecir un repo que vive en Railway. Si el CLI se detiene por ambigüedad (el repo está en las dos plataformas, en ninguna, o `project-config.md` declara un rail de cliente), surfacear su mensaje plain y preguntar el destino; la respuesta se pasa como `--target`. Contrato de `--target` → `fx-factory-cli` § flags de `provision`.
- **¿Qué servicios aprovisionar?** Default = el set completo en orden (Neon, Vercel, dominios, Resend; con Railway: Neon, GitHub, Railway, dominios, Resend). El developer puede acotar (ej: solo Neon + Vercel). El skill traduce la respuesta al flag `--services=<list>` del CLI.
- **La bóveda va primero y por default.** El CLI agrega el servicio `vault` al frente del set sin que se pida: crea el proyecto del repo en la bóveda y todo lo que los pasos siguientes acuñan se escribe ahí. No es una pregunta más; se narra en el resumen pre-ejecución. Tres casos la cambian, y el CLI dice cuál:
  - **`--no-vault`** — el developer la declina: ninguna llamada a la bóveda, y el repo trabaja con `.env.local` como un repo sin bóveda (`fx-secrets-vault §8`). Pedir `--no-vault` junto con `vault` en `--services` es un error.
  - **Perfil `core`** — no se ofrece: el CLI imprime una línea con el motivo (el lockfile declara `core`, o no hay lockfile y falta `scripts/tools/with-vault.mjs`) y sigue como con `--no-vault`. Un `vault` explícito en `--services` ahí es un error.
  - **Un repo que ya se aprovisionó sin bóveda** (el state tiene servicios completos y ningún bloque `vault`) — el CLI **para antes de crear nada**: pasar un repo vivo a la bóveda es decisión de su equipo. Surfacear las dos salidas plain: `factory vault adopt` (sin `--apply` sólo enseña el plan) o repetir con `--no-vault`. El skill no elige por el developer.
- **¿Dominio custom?** Por default el provisioning usa los dominios intermedios del kit (`{slug}-dev` y `{slug}` bajo el dominio raíz de la org). El `{slug}` lo resuelve el CLI del `Slug` documentado en `project/planning/project-config.md` (y cae al nombre del directorio si no está documentado); si el directorio difiere del slug documentado, el CLI lo **avisa** — surfacearlo plain. Si el developer quiere un dominio propio → se pasa con `--domain <domain>`. El correo **no** se mueve con el dominio: sigue saliendo de `updates.timekast.com`, porque la cuenta de Resend no tiene cupo para un dominio por cliente. Solo si el developer pide explícitamente correo desde el dominio del cliente se agrega `--client-mail` (ocupa un dominio de Resend). Para ponerle nombre al remitente de una app existente: editar `EMAIL_FROM` en `main:/` de la bóveda (`Mi App <noreply@updates.timekast.com>`), nunca en Vercel → `fx-factory-cli` § go-live.

> 🔒 **El skill SIEMPRE provisiona `live` y NUNCA pregunta por el lifecycle.** El modo `ephemeral` (derivado desechable — demo/staging/E2E que se tira con `--destroy` sin la fricción de un `live`) es exclusivo del CLI crudo: el developer corre `npx @timekast/factory provision --ephemeral …` a mano. No se expone en `/provision`.

> Resumen pre-ejecución: enumerar plain qué se va a aprovisionar (incluida la bóveda, o por qué no va) y con qué dominio, ANTES de arrancar Phase 5. Esto NO es el gate HIGH-risk (ese es CP2, dentro de Phase 5) — es solo confirmar el set.

### Phase 5 — Ejecución de primitivas (EN ORDEN)

El skill invoca `factory provision` con los flags resueltos en Phase 4 y narra cada primitiva. El orden es **fijo** (Anti-Drift §3.2). `--dry-run` (si se pasó) se propaga a todo y nada muta.

**(v) Bóveda — el proyecto del repo (primero, por default).** Antes que la migración inicial y que cualquier recurso, el CLI crea (o adopta) el proyecto del repo en la bóveda y guarda el vínculo en el bloque `vault` de `.timekast/provision.json`. Qué crea, el layout y el cableado del wrapper → `fx-factory-cli` § La bóveda (layout → `fx-secrets-vault §6/§7`). Corre **fluido**. Lo que el skill hace en este paso:

- **Surfacear plain** los dos avisos del CLI: el `.env.local` que el repo ya traía (no se borra, pero Next.js lo carga y sus claves se colarían sobre las de la bóveda) y las dos listas del cableado del wrapper (scripts reescritos, con su diff; scripts customizados que no se tocaron y corren sin los secretos). El cambio a `package.json` queda sin commitear.
- **STOP — preflight local:** si el CLI para nombrando `scripts/tools/with-vault.mjs` o `.claude/policy/vault.json`, nada se creó. Salidas: `factory update` y repetir, o seguir sin bóveda con `--no-vault`.
- **STOP — sin sesión de la bóveda:** para antes de crear nada (Phase 2 ya lo comprobó; el CLI lo confirma).
- **STOP — bloque `vault` mal formado:** el CLI se detiene aun con `--force` o `--no-vault`. Surfacear el mensaje y remitir a `fx-factory-cli` § Troubleshooting; el skill no edita el state.
- **Headless:** estos STOP son fail-closed (tabla checkpoint × modo); el skill no elige salida por el developer.

Con `--no-vault` (o en perfil `core`) este paso no existe y todo lo de abajo que dice "sin bóveda" aplica.

**(0) Migración inicial de la base — el `0000` de Drizzle.** Antes de cualquier otra primitiva (salvo la bóveda), `factory provision` genera la migración inicial del derivado (`pnpm db:generate`), la commitea **con su propio pathspec** (`src/lib/db/migrations/`, nunca un commit pelado sobre el index — `GIT.md §3.6.1`) y se asegura de que llegue al remoto: si la primitiva de git no va a pushear en esta corrida, pushea ella y confirma que el commit quedó en `origin/main`. Sin eso, el primer deploy correría `db:migrate` (en `vercel-build` o en el pre-deploy de Railway) sin journal que aplicar. Corre **fluido**.

> **Cuándo NO corre** (el CLI lo decide y narra el motivo; el skill solo lo surfacea plain): si la corrida no crea infra de nacimiento (no hay `neon` ni `github` en `create` — p.ej. un `--domain` suelto para el go-live de un derivado ya vivo); si el checkout no se identifica como derivado (sin `.timekast/lockfile.json` — el Factory cae aquí a propósito, `BR-FACTORY-005`); si no hay schema en `src/lib/db/schema/`; o si ya hay un `.sql` generado (idempotente).
> **Si falla, aborta.** Una instalación de dependencias o un `db:generate` que truena paran el provisioning **antes** de que se pushee o deploye nada; se corrige y se retoma con `--resume`. Un fallo de identidad de git al commitear es warning, no abort: el `.sql` ya está en disco y el developer lo commitea.
> **Diagnóstico day-2:** `factory doctor` reporta el hueco (schema sin `.sql`) como aviso informativo, sin bloquear.

**(a) Neon — base de datos.** Crea el proyecto Neon, la rama `main` (producción) y una rama `develop` aislada, y acuña la API key **project-scoped** del proyecto (PROV-002), la que el runner de E2E usa para crear su branch por corrida, en CI y en la máquina del developer. Con bóveda queda en `develop:/ci` —que `local` importa— y el sync `develop:/ci → secrets de GitHub Actions` la lleva a GitHub; sin bóveda, `provision` la sube a los GitHub Secrets con `gh secret set` y la escribe en `.env.local`. Con bóveda, las cadenas de conexión van a la bóveda por carpeta (pooled para el runtime, directa para las herramientas) y `DATABASE_URL_MAIN` no existe; sin bóveda, `.env.local` recibe `DATABASE_URL` (develop) y `DATABASE_URL_MAIN` (main). Esa key da 404 en cualquier otro proyecto: la del rail nunca se distribuye. Corre **fluido**. Tras completar: state actualizado + narrado plain.

> **Antes de correr este paso, decide la organización de Neon.** El `org_id` se deriva de la key del rail, y si esa key ve **varias** organizaciones, el paso **aborta** nombrándolas en vez de elegir — adivinar ahí crea la base del cliente en la organización equivocada. Pásale `--neon-org "<nombre>"` cuando el proyecto no vaya a la organización por default (`NEON_ORG` del rail). Narra al developer en qué organización se va a crear **antes** de crearla; es una de esas cosas que nadie revisa después.
>
> **Key revocada o rotada:** `factory provision --services=neon --remint` la reacuña: con bóveda deja la key nueva en `develop:/ci` y el sync la lleva a los tres secrets de E2E en GitHub (`fx-secrets-vault §7`) — si ese sync todavía no existe, el CLI lo avisa: la anterior ya se revocó y el E2E de CI no tiene key válida hasta que un `--resume` lo cree; sin bóveda vuelve a subir esos tres secrets con `gh secret set` y la deja en `.env.local`. Un `--resume` normal no lo hace: el paso ya está marcado completo y hace corto circuito.

**🛑 CP2 — sustrato de despliegue (HIGH-risk).** Con destino Vercel: proyecto de Vercel + git substrate + GitHub App. Con destino Railway: proyecto de Railway + conexión del repo (abajo).

Con Vercel, éste es el punto irreversible (PROV-004): normaliza la rama git a `main`, agrega `origin`, crea `develop`, hace push de `main`, crea el proyecto Vercel por REST, instala/verifica la GitHub App de Vercel sobre el repo, conecta el git al proyecto con `production-branch: main` y activa el workflow E2E. Los valores llegan a Vercel según el modo: **con bóveda** el CLI crea los syncs `main:/ → Vercel production` y `develop:/ → Vercel preview` y el primer deployment espera a que entreguen (el tercero, `develop:/ci → secrets de GitHub Actions`, se crea al cierre de la corrida, con el repo ya creado); **sin bóveda** sube las variables directo a Vercel. Con Vercel, las migraciones corren en el build de Vercel (`vercel-build`: `pnpm build && pnpm db:migrate`), NO en un GitHub Action. **Para incondicionalmente** — Plan Mode formal, incluso en fluido.

Plain language, 1 pantalla. Plan a presentar con Vercel: qué rama se normaliza, qué se pushea, qué proyecto Vercel se crea, qué GitHub App se instala y cómo llegan los valores — con bóveda, las tres sincronizaciones que se crean (fuente → destino), nombradas así y no como una subida de variables; sin bóveda, qué variables y secrets se suben. Tabla:

| # | Opción       | Acción                                                            |
| - | ------------ | ---------------------------------------------------------------- |
| 1 | **Aprobar**  | Ejecuta el sustrato de despliegue (Vercel + git + GitHub App, o git + Railway) + E2E |
| 2 | **Ajustar**  | Revisar/cambiar algo (dominio, rama) y re-presentar               |
| 3 | **Cancelar** | Termina — la base de datos ya creada queda en el state (`--resume` retoma) |

**Con destino Railway, el CP2 es el mismo gate** (Plan Mode, HIGH-risk, nunca auto-avanza) y el plan dice, plain: se crea el proyecto en Railway con los entornos `main` y `develop` y el servicio `web`; la bóveda escribe `PORT` y `AUTH_TRUST_HOST` y sincroniza `main:/` y `develop:/` a su entorno de igual nombre; **cuando las variables ya llegaron**, se conecta el repo (la app de GitHub de Railway tiene que tener acceso a él) — y conectar es lo que enciende el auto-deploy de cada rama —; se dispara un primer deploy por entorno (las migraciones corren en su pre-deploy) y se prueba `/api/health/live`. No hay proyecto de Vercel ni variables que suban directo.

> Mecanismo Plan Mode formal: `fx-workflow-authoring §7` (CP2). Si las primitivas de Plan Mode son deferred en el runtime, cargarlas antes de CP2.
> Edge (PROV-004 §8): si la GitHub App de Vercel no está instalada sobre la org, la llamada de link falla 403 → el CLI imprime la URL de instalación y pausa; el skill surfacea ese paso manual al developer (instalar la app) y retoma con `--resume`.

**(b) Vercel + git substrate (tras aprobar CP2).** Ejecutar la primitiva. Narrar plain: "Hosting conectado a `main`; la migración inicial ya viajó al remoto, y de ahí en adelante las migraciones se aplican solas en cada deploy (vercel-build)." Con bóveda, sumar: "los valores llegan a Vercel por las sincronizaciones de la bóveda, que son las únicas que escriben ahí". Si el paso 0 no pudo confirmar el `.sql` en el remoto, surfacear ese aviso **aquí**, antes del primer deploy.

Con bóveda, tres avisos del CLI que el skill surfacea plain (detalle → `fx-factory-cli` § Deploys y CI con bóveda):

- **El destino ya tiene claves que la bóveda no maneja** → el CLI no crea ningún sync y las nombra: pasar un destino con valores vivos a la bóveda es decisión del equipo (la adopción), no de este flujo. El skill no elige por el developer.
- **Sync pendiente** (falta la app connection de ese tipo en la bóveda, o el destino todavía no existe) → no se dispara el primer deployment; un admin de la bóveda crea la conexión y se retoma con `--resume`.
- **Los syncs no entregaron a tiempo** → el paso queda reanudable con `--resume`. Si el CLI para porque apareció en Vercel una clave que sólo vive en `/ci` o en `local`, es **STOP**: no hay deployment hasta revisar la bóveda.

**(b') Railway (con destino Railway, en lugar de (b), tras aprobar CP2).** Ejecutar la primitiva. El paso `github` sólo deja `main` y `develop` en el remoto y el workflow de E2E; el paso `railway` hace lo demás, en un orden que protege el primer build (abajo; syncs → `fx-factory-cli` § Deploys y CI con bóveda). Narrar plain: "Railway quedó con `main` y `develop` atados a sus ramas; las migraciones corren en el pre-deploy y los secretos llegan desde la bóveda". Avisos del CLI a surfacear plain:

- **Un proyecto de Railway ya conectado al repo que el state no conoce** → para sin crear nada; la salida es `factory provision --adopt --force --target=railway` (el state ya existe a esta altura del alta, así que `--adopt` a secas se niega). El skill no elige por el developer.
- **Los syncs no entregaron a tiempo** → no conecta el repo; el paso queda reanudable con `--resume`.
- **Railway sin acceso al repo** → el CLI imprime el enlace para instalar la app de GitHub de Railway; se instala y se retoma con `--resume` (no recrea nada).
- **Healthcheck pendiente** (el `src/` del derivado no tiene una ruta de vida pública, o la app no respondió) → no es falla: el alta terminó; el CLI nombra la guía de retrofit, y un `--resume` posterior lo activa.

**Pasos de Railway, en el orden en que los corre el CLI** (para narrar y para saber dónde quedó un alta a medias; el CLI registra cada id en el bloque `railway` del state):

1. **Busca por repo conectado antes de crear.** Pregunta a Railway por un proyecto cuyo servicio despliega este repo — nunca por nombre. Uno que el state no conoce → alto, remite a `--adopt --force --target=railway`. Un homónimo sin la marca de alta propia en el state → alto, sin mutar nada.
2. **Crea el proyecto** en el workspace que ve `RAILWAY_TOKEN` (uno solo; si ve varios o ninguno, no elige), con la marca de "alta en curso" en el state para que un `--resume` lo reconozca.
3. **Entornos sin trigger:** renombra `production` → `main`, crea el servicio `web` **sin fuente** (sin repo no hay deploy) y crea `develop` duplicando `main` antes de escribir cualquier valor.
4. **Comandos por entorno,** con `TK_VAULT=off` (en la plataforma las variables ya están en el entorno; el wrapper de la bóveda no corre ahí): build `pnpm build`, pre-deploy `pnpm db:migrate`, start `pnpm start`. Región: la más cercana a la base de Neon.
5. **Bóveda y syncs:** escribe en `main:/` y `develop:/` los valores de runtime más `PORT`, `AUTH_TRUST_HOST` y `NEXT_PUBLIC_APP_ENV`, y crea los syncs `main:/ → main` y `develop:/ → develop`.
6. **Espera de nombres:** no sigue hasta que cada clave de la carpeta llegó a su entorno (por nombres, con tiempo acotado; si vence, alto reanudable con `--resume`).
7. **Conexión y triggers al final:** conecta el repo al servicio y ata cada entorno a su rama (`main` → `main`, `develop` → `develop`). Conectar es lo que enciende el auto-deploy; antes no existe ningún trigger.
8. **Dominio de servicio** por entorno, al puerto de la app.
9. **Primer deploy por entorno,** sólo si no hay uno de ese commit. Un deploy que falla detiene el paso nombrando `db:migrate` (el pre-deploy) como primer sospechoso.
10. **Sonda anónima a `/api/health/live`:** 200 → healthcheck activado sobre esa ruta. Un `src/` anterior que responde 404 ahí pero ya tiene `/api/health` pública (la versión previa de la guía) se activa sobre `/api/health`, con un aviso que nombra la guía. Si no → `pending` con la guía de retrofit (arriba).

**(c) Dominios DNS + Resend.** Conecta los dominios al proyecto de Vercel —con Railway, los crea en Railway, cada uno en su entorno, con un TXT de verificación además del CNAME—, crea los registros en Cloudflare (token scoped a la zona, `proxied: false`; un CNAME que ya apunta a otro destino no se reescribe: el CLI se detiene nombrando el actual y el esperado) y configura Resend para correo transaccional (PROV-005). Con y sin bóveda, los deploys reciben una key de Resend **propia del proyecto** (sólo envío, limitada a su dominio), nunca la de equipo del rail, que sólo la acuña; su id queda en el state para revocarla sin tocar a los demás. Con bóveda vive en `main:/` y los syncs la llevan a los deploys; sin bóveda va directo a los deploys y al `.env.local` (detalle → `fx-factory-cli` § La bóveda). Con key, los deploys reciben también `EMAIL_PROVIDER=resend` (sin él el runtime deja el correo apagado). Corre **fluido**. Narrar plain.

**(d) Wizard de variables de entorno — configuración guiada (nivel máximo).** Provision ya escribió lo esencial, todo provision-owned: las connection strings de Neon, `NEON_API_KEY` project-scoped + `NEON_PROJECT_ID` para el E2E local, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, y WebAuthn con **un solo rpID** —el host de producción, en producción y preview— más `WEBAUTHN_RELATED_ORIGINS` con el origen de develop. **Con bóveda** eso vive en sus entornos (layout → `fx-secrets-vault §7`; `local` lleva su propio `WEBAUTHN_RP_ID` de localhost); **sin bóveda**, en `.env.local`. El wizard llena **el resto** de las product vars (nombre de la app, empresa, correos legales, tema, email, OAuth, notificaciones, MFA). Doctrina: el CLI escribe —en la bóveda (una copia en `main:/`, referenciada desde `develop:/` y `local`) o, sin bóveda, en `.env.local`—, este skill **guía + pregunta**. La meta es que un developer que NO sabe qué es cada variable termine con la app **bien configurada**, sin decisiones inventadas y **sin que el valor de ningún secreto pase por la conversación**.

**🔴 Regla de secretos (no-negociable).** El agente NUNCA imprime, repite ni pega en el chat el **valor** de un campo `kind: 'secret'` (API keys, OAuth secrets, VAPID private, tokens). Los secretos no viajan por la conversación: los que provision ya configuró se **auto-detectan**, los auto-generables los **genera el CLI** escribiendo directo a su destino (la bóveda, o `.env.local` sin bóveda), y los que solo el developer tiene (secrets de OAuth) los **pega él mismo**. El resumen final va **enmascarado**. (El rail sigue la misma regla: el CLI lo lee de la bóveda y nunca imprime un valor.)

> **La única excepción, y su porqué.** El enmascarado del `--review` deja ver los **últimos 4 caracteres** de un secreto de 12 o más (por debajo de eso lo oculta entero, con el mismo ancho). No es una relajación de la regla: es lo que la hace utilizable. Ocultos del todo, **todas las credenciales se ven idénticas**, y el repaso no puede contestar la pregunta por la que se abre al rotar una key: *¿la que está puesta es la vieja o la nueva?* Cuatro caracteres finales la contestan **para un token de proveedor** y no sirven para nada por sí solos. Lo que no cambia: el **valor** nunca se imprime, y para verlo completo el developer abre su `.env.local` (sin bóveda) o el entorno `local` de la bóveda. Aplica igual a la tabla y al `--json` — una regla, no dos.
>
> 🔴 **Dónde esos 4 caracteres NO contestan nada, y el agente debe decirlo en vez de dejar concluir.** Un valor cuya cola es **constante** se ve idéntico antes y después de rotarlo: una cadena de conexión que termina en `?sslmode=require` sale siempre `••••••••uire`, y un comentario pegado al valor (`API_KEY=... # rotado 2026-08`) viaja *dentro* del valor, así que lo que se ve es el comentario. Si el developer está verificando una rotación sobre un valor de esa forma, la respuesta correcta es "esto no lo distingue, ábrelo".
>
> 🔴 **Un password que teclea una persona es el caso caro, y la regla no lo exceptúa.** Contra un token de proveedor esos 4 caracteres son ruido; contra `Primavera2026!` son `026!` — el sufijo con patrón, que no entrega entropía pero **confirma la regla de mangling**, que es la mitad cara de un ataque por diccionario. De lo que el kit enmascara, `EMAIL_SERVER_PASSWORD` es lo único que alguien teclea. Se decidió **no** excepcionarlo (una excepción por nombre es justo lo que este módulo se rediseñó para quitar), así que la mitigación es de operación: ese buzón manda el correo transaccional **y** recupera cuentas, así que dale una contraseña **generada**, no una memorizable.
>
> 🔴 **Se ve en pantalla; no se copia a un artefacto durable.** El `--json` existe para que lo lea un agente, y un agente pega salida en reportes y en bloques de Evidence que se commitean. Cuatro caracteres de una credencial **viva** en el historial de git son permanentes y le confirman a quien los lea que esa credencial nunca se rotó. Presentar el resumen plain al developer, sí; volcarlo a un archivo del repo, no.

Flujo:

1. **Pedir el plan:** `npx @timekast/factory env wizard --plan --json` → la lista de preguntas derivada del `.env.example` (help, `kind`, condicionales, y los **defaults ya ajustados por provision** — p.ej. `EMAIL_PROVIDER` llega en `resend` si provision configuró Resend; ver §detección abajo).
2. **Guiar por secciones — explicar ANTES de preguntar.** Recorrer las secciones; por cada una, **una línea plain de para qué sirve** antes de pedir nada ("Correo: cómo tu app manda los links de acceso y avisos"). Nivel máximo = explicar todo, decidir poco: proponer el **default recomendado** y pedir confirmar/cambiar. Reparto por tipo de campo:
   - **Decisiones estructuradas** (`kind: select`/`boolean`: `EMAIL_PROVIDER`, flags OAuth, `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`, `MFA_ENABLED`/`MFA_REQUIRED_ALL`) → `AskUserQuestion`, con la explicación plain de qué prende cada una.
   - **Texto libre no-secreto** (`kind: text`: nombre de app, empresa, correos, `EMAIL_FROM`, tema, OAuth `*_ID`) → preguntar en **conversación normal** (NO forzar los ~20 campos de texto al menú de 4 opciones — ese fue el bug de cherry-picking silencioso), con el default recomendado a la vista.
   - **Secretos** (`kind: secret`) → **NO se preguntan por el chat** (paso 4).
   - Respetar los **gates**: solo tratar `RESEND_API_KEY`/`EMAIL_FROM` si `EMAIL_PROVIDER=resend`, `EMAIL_SERVER_*` si `smtp`, `AUTH_*` si el flag OAuth está en `true`.
3. **Aplicar los NO-secretos:** pasar las respuestas como JSON `{ "answers": { … }, "push": <bool> }` por stdin a `npx @timekast/factory env wizard --apply` — el CLI escribe en la bóveda (sin bóveda, en `.env.local` con `setEnvLine`; nunca pisa provision-owned) y emite **avisos de completitud** (OAuth activado sin creds, notificaciones sin VAPID). Surface esos avisos plain. `answers` NO debe contener secretos.
4. **Secretos — cada uno por su vía segura (nunca el chat):**
   - **Ya configurados por provision** (`RESEND_API_KEY`, si la corrida configuró Resend): la key propia del proyecto — con bóveda, en `main:/`, y los syncs la llevan a Vercel; sin bóveda, en Vercel y `.env.local` —; nada que preguntar.
   - **Auto-generables** — VAPID (si el dev activó notificaciones): correr `npx @timekast/factory env wizard --gen-vapid`; el CLI genera el par y lo escribe en la bóveda (sin bóveda, en `.env.local`), la **privada nunca sale a stdout**. (`MFA_ENCRYPTION_KEY`/`AUTH_SECRET` ya los mintió provision.)
   - **Solo el developer los tiene** — secrets de OAuth (`AUTH_GOOGLE_SECRET`/`AUTH_GITHUB_SECRET`): el agente **no los pide por chat**. Deja el slot vacío e **instruye al developer** a pegarlos él mismo: en su terminal `npx @timekast/factory env wizard` (wizard TTY, teclea el secret ahí → va directo a la bóveda, o a `.env.local` sin bóveda), o, sin bóveda, editando `.env.local` a mano. Marcarlos "pendientes: los pegas tú".
5. **Resumen final ENMASCARADO + una aprobación:** correr `npx @timekast/factory env wizard --review` → tabla por sección con los valores (secretos enmascarados hasta sus últimos 4 caracteres —`••••••••3f7a`—, y ocultos enteros si miden menos de 12; vacíos marcados `⚠`) + los avisos de completitud. Presentarlo plain: "así quedó tu app". Con bóveda la tabla sale del entorno `local`; sin bóveda, de `.env.local`, que el developer **abre** para ver los valores completos (el agente no los vuelca). Pedir **una** confirmación antes de dar el wizard por cerrado. Sin bóveda, si eligió pushear, recién ahí `--apply` con `push: true` (o `pnpm env:push`); con bóveda no hay push: los deploys reciben los valores por los syncs de la bóveda (`fx-secrets-vault §7`) —en Vercel, a partir del siguiente deploy— y el CLI lo dice.

> **Detección de lo ya configurado (idempotencia).** `env wizard --plan` lee `.timekast/provision.json`: si provision ya corrió Resend (`state.dns`), el default de `EMAIL_PROVIDER` llega en `resend` — el wizard **no re-pregunta** una decisión que provision ya tomó (cierra el drift local↔Vercel). Mismo principio para todo lo provision-owned: se muestra, no se re-pregunta.
> **MFA granular NO es del wizard.** El env solo expresa las 3 posturas globales (`MFA_ENABLED` + `MFA_REQUIRED_ALL`). El MFA **por rol** (`requiresMfa` en `src/config/roles.ts`) y **por acción sensible** (`MFA_SENSITIVE_ACTIONS` en `src/config/mfa.ts`) vive en código, no en variables — si el dev quiere granularidad, apuntarlo a esos archivos, no inventar un knob de env.
> **Opcional + day-2:** el wizard se puede **saltar** — provision dejó el entorno local funcional (la bóveda, o `.env.local` sin bóveda). Si el dev lo salta, puede correr `npx @timekast/factory env wizard` (TTY) después; sin bóveda, también editar `.env.local` + `pnpm env:push`. Variables avanzadas sin gate (Sentry, overrides de rate-limit): con bóveda se cargan en ella (dónde, abajo en Phase 6); sin bóveda, a mano + `env:push`.
> **El CLI escribe, no el skill (§3.5):** el skill NUNCA edita `.env.local` con Edit ni escribe en la bóveda por su cuenta — pasa respuestas a `env wizard --apply`/`--gen-vapid` y deja que el CLI mute (sin bóveda, `.env.local` queda en `chmod 0600`).
> **Headless:** las preguntas las responde el **curador HITL** (igual que Phase 4); el skill no intenta `AskUserQuestion`. Sin respuestas → se salta el wizard (no bloquea: lo esencial ya quedó escrito). Los secrets de OAuth quedan como pendiente documentado; el VAPID auto-gen puede correr sin interacción.

**(e) Backlog central — proyecto + key (opcional · skippeable · LA ÚLTIMA).** El *backlog central* es la app de tracking client-facing (`backlog.timekast.mx`) que espeja el backlog del repo. Esta primitiva es **opt-in**: corre **solo** si el developer incluyó `backlog` en el set de servicios de Phase 4 (NO está en el set por default), así que quien no lo quiere nunca la dispara — cero fricción. `factory provision --services=backlog` usa el `BACKLOG_ADMIN_TOKEN` del rail para crear el proyecto remoto + mintear su key project-scoped, y escribe `BACKLOG_API_KEY` (la key `tk_live_*` show-once, regla no-echo) + `BACKLOG_PROJECT_ID` en el entorno `local` de la bóveda (sin bóveda, en `.env.local`) — LOCAL-ONLY, nunca a Vercel. Corre **fluido** (no es un gate HIGH-risk: no muta infra irreversible, solo registra un proyecto espejo). Tras completar: narrar plain ("El backlog central quedó conectado; los `push`/`sync` ya pueden espejar el backlog").

> **Degradación explícita (sin fricción):** el backlog central es un **espejo best-effort que jamás bloquea el provisioning**. Si falta `BACKLOG_ADMIN_TOKEN` en el rail → **saltar** la primitiva con un aviso plain ("El backlog central no se aprovisionó: falta `BACKLOG_ADMIN_TOKEN` en `rail-timekast`. Pide a un admin de la bóveda que lo cargue y retoma con `--resume`, o sáltalo — el resto del provisioning ya quedó listo") y **continuar**. NUNCA abortar: Neon/Vercel/dominios ya se aprovisionaron y son independientes de este paso. **La única excepción:** si `backlog` es el **único** servicio pedido, el CLI aborta con error antes de empezar (no queda nada más que aprovisionar, así que saltarlo dejaría una corrida vacía que parece exitosa) → **STOP fail-closed**: un admin carga el token y se reintenta.
> **Idempotencia (`--resume` / re-corrida):** si el proyecto remoto ya existe (`409 INTERNAL_KEY_TAKEN`), el CLI **adopta** el existente (resuelve el `id` con la key admin) y mintea una key nueva — no duplica. El skill solo narra; la lógica vive en la primitiva.

### Phase 6 — Narración del resultado

Resumen final plain: qué quedó listo (bóveda / DB / hosting / dominios / correo). Con bóveda, recordar que en local no hay `.env.local`: los scripts leen la bóveda con la sesión del developer, y para pisar un valor en una corrida existe `TK_ENV_OVERRIDE` (`fx-secrets-vault §7`). Y cómo se cambia un valor de ahí en adelante, porque es donde un developer se equivoca (quién escribe cada destino → la tabla de `SK.md §7.2`):

- Un valor se cambia o se agrega **en la bóveda**: en `/` del entorno si lo lee la app (`main` → production, `develop` → preview), en `develop:/ci` si sólo lo necesita CI. Nunca `pnpm env:push` (no escribe en un repo con bóveda) ni el dashboard de Vercel o `gh secret set`: el siguiente sync pisa o borra lo que se ponga a mano ahí.
- El sync actualiza las **variables** del destino, no el deployment que ya corre: en Vercel el cambio aplica en el siguiente deploy, y un `NEXT_PUBLIC_*` se hornea en el build.
- Con destino Railway, `main:/` y `develop:/` llegan a sus entornos de igual nombre por los syncs de la bóveda: el cambio se hace en la bóveda, nunca en el dashboard de Railway (el sync lo pisaría).

Al listar dominios, nombrar **AMBOS**: el de producción (`{slug}.timekast.com`) y el de preview/develop (`{slug}-dev.timekast.com`) — provision siempre crea los dos y los registra en el state. Nombra siempre los del **state**, no los derives del slug: un proyecto provisionado antes de la mudanza a `.com` vive en `timekast.mx`, que sigue activo. Qué falta si algo quedó pendiente, y el próximo paso natural: "Verifica el primer deploy en tu destino — las migraciones corren solas en cada deploy (`vercel-build` en Vercel, el pre-deploy en Railway), no hay paso manual." No commitear nada.

---

## 8. Checkpoints — doctrina + tabla checkpoint × modo

Un solo checkpoint formal (CP2 HIGH-risk). Los demás cruces (tooling, secrets, state, preguntas) paran **solo ante señal real** (`fx-workflow-authoring §7.1`).

| Checkpoint / cruce         | `--step`                  | fluido (default) — para SOLO si…                                              | headless (sin TTY)                                                           |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Phase 1 — tooling          | resumen + sigue           | `gh` ausente/no-auth (señal real §1) → **STOP**; opcionales solo warning     | **fail-closed**: `gh` ausente/no-auth → abort estructurado, no AskUserQuestion |
| Phase 2 — secrets          | resumen + sigue           | `infisical` ausente o sin sesión (señal real §1) → **STOP**; sin acceso a `rail-timekast` o tokens ausentes (del preflight del CLI) → **STOP fail-closed** | **fail-closed**: sin `infisical`/sin sesión/sin acceso → abort con señal estructurada; tokens ausentes → señal de "un admin los carga" |
| Phase 3 — state corrupto   | para 1/2/3                | state corrupto = decisión genuina (señal real §4) → **para 1/2/3**           | **fail-closed**: emite señal estructurada (corrupt-state) + no auto-elige; curador decide |
| Phase 4 — preguntas        | AskUserQuestion           | decisión genuina (destino en alta nueva/servicios/dominio §4) → **AskUserQuestion** | **curador HITL**: el orquestador intercepta el turno y responde; el skill NO llama AskUserQuestion |
| Phase 5(v) — bóveda        | resumen + sigue           | corre **fluido** (default); guard de día 2, preflight de `with-vault.mjs`/`vault.json`, sin sesión o bloque `vault` mal formado = señal real → **STOP** (nada creado); `core`/`--no-vault` → se omite con su línea | **fail-closed**: el guard de día 2 y el preflight abortan con señal estructurada antes de crear nada; el skill no elige entre `vault adopt` y `--no-vault` |
| Phase 5(0) — migración inicial | resumen + sigue      | corre **fluido**; se salta sola cuando no aplica (narrar el motivo). `db:generate` que truena = señal real → **STOP** (nada pusheado aún) | **fail-closed**: aborta con señal estructurada antes de pushear; nada quedó deployado |
| **CP2 — sustrato de despliegue** (Vercel o Railway) | **Plan Mode (para)**      | **HIGH-risk irreversible (§3 criterio 3) → para SIEMPRE, nunca auto-avanza** | **fail-closed**: NO auto-aprueba; emite el plan + señal de gate; espera aprobación del curador |
| Phase 5(d) — env wizard    | AskUserQuestion           | config interactiva (señal real §4) → **AskUserQuestion**; saltarlo es válido (lo esencial ya quedó escrito) | **curador HITL**: responde el orquestador; sin respuestas → se salta (no bloquea). 🔴 Secretos nunca por el chat — el CLI los escribe (§5(d) Regla de secretos) |
| Phase 5(e) — backlog central | resumen + sigue         | opt-in (solo si se pidió `backlog`) → corre **fluido**; falta `BACKLOG_ADMIN_TOKEN` → **skip con aviso** (§5(e) degradación) — salvo con `backlog` como **único** servicio: el CLI aborta → **STOP fail-closed** | **fail-soft**: sin token → se salta con señal estructurada; el resto del provisioning ya quedó listo. Con `backlog` como único servicio → **fail-closed**: abort con señal estructurada |

**Contrato de checkpoint:** cuando un cruce **para** (señal real, o `--step`) presenta opciones explícitas y excluyentes, y espera la elección. **El criterio de cuál vía ya no es libre** (`CC.md §3`, [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md)): `AskUserQuestion` es el **default interactivo**; la tabla numerada 1/2/3 es el **fallback** cuando el runtime no tiene la tool — y ahí no se acepta "ok"/"sí" libre, se re-presenta. En fluido sin señal, auto-avanza con resumen breve. **CP2 nunca auto-avanza** (output irreversible — `§7.1`) y conserva su gate formal: la vía estructurada presenta opciones, nunca sustituye la aprobación de un HIGH-risk.

> Este workflow era el **precedente** de la vía dual — la declaraba sin criterio de cuándo aplica cada una, que es justo lo que la doctrina ahora fija. Su patrón de **abstención headless** (abajo: _"el skill NO intenta `AskUserQuestion`"_) se canonizó al revés: es el que `fx-workflow-authoring §7.0` cita como referencia para todo el kit.

### Headless (sin TTY)

Headless, `AskUserQuestion` bloquea sin usuario. El skill DECLARA explícitamente:

- **Preguntas (Phase 4):** el **curador HITL** responde — el orquestador intercepta el turno y entrega la decisión (destino en un alta nueva + servicios + dominio). El skill NO intenta `AskUserQuestion`; opera sobre la respuesta inyectada. (El lifecycle NO es una pregunta: el skill siempre provisiona `live`; ephemeral es CLI-flag-only.)
- **Gates HIGH-risk (CP2):** patrón **fail-closed** — el skill NO auto-aprueba el sustrato de despliegue (Vercel o Railway). Emite el plan + una señal estructurada de gate y espera la aprobación del curador. Sin aprobación → no muta.
- **Fallas de tooling/secrets:** fail-closed — abortar con señal estructurada en vez de intentar interacción.

---

## 9. Output files lifecycle

Este workflow NO produce artifacts durables propios — el único state es `.timekast/provision.json`, que **lo escribe el CLI**, no el skill (Anti-Drift §3.5). El skill lo **lee** (Phase 3) y lo **resume al developer** (Phase 6), nunca lo edita a mano.

| Archivo                     | Tier         | Dueño        | Notas                                                            |
| --------------------------- | ------------ | ------------ | --------------------------------------------------------------- |
| `.timekast/provision.json`   | durable      | CLI primitiva | IDs de provider + lifecycle + el bloque `vault` (id del proyecto y sus entornos); commiteado en el repo del derivado (no ignorado) |
| `package.json` (scripts)     | durable      | CLI primitiva | Con bóveda: el cableado del wrapper en los scripts del kit, con diff previo; queda sin commitear |

> El rail **no** es un archivo de este workflow ni de la máquina: sus tokens viven en `rail-timekast` (bóveda) y el CLI los lee en cada corrida con la sesión del developer, sin dejar copia (`fx-secrets-vault §3`).

---

## 10. Invalidation handling

- **Token inválido a media corrida:** si una primitiva falla porque un token quedó inválido (p.ej. Vercel responde 401) → STOP el paso actual. Primero la sesión de la bóveda (caduca, y una sesión muerta no es un token muerto): `infisical login --domain=…`. Si la sesión está viva, un admin rota el token en `rail-timekast` con el mismo nombre. Luego retomar con `--resume` desde donde quedó: el CLI relee la bóveda en cada corrida, no hay nada que recargar localmente. No abortar el provisioning entero.
- **El developer ajusta el plan en CP2 (opción 2):** re-resolver los flags (dominio/servicios) y re-presentar CP2; no se ejecuta el substrato hasta aprobar.
- **State cambió fuera del skill** (otro proceso corrió el CLI): al retomar, re-leer `.timekast/provision.json` y recalcular el primer paso incompleto antes de continuar.
- **Falla recuperable de una primitiva** (ej: 403 GitHub App no instalada): el state parcial ya quedó persistido por el CLI → el skill surfacea el paso manual + retoma con `--resume`. No reintenta a ciegas ni recomienza desde cero. Los casos de Railway, abajo.
- **Falla no recuperable** (sin acceso a `rail-timekast`, op destructiva inesperada): hard-STOP → el developer decide.

### Troubleshooting de Railway

Cada caso lo detecta el CLI y lo nombra; el skill lo surfacea plain y **no elige por el developer**. Ninguno recrea lo que ya existe.

| Síntoma | Qué pasó | Salida |
| --- | --- | --- |
| Railway no tiene acceso al repo | La app de GitHub de Railway no está instalada sobre el repo | El CLI imprime el enlace de instalación (`https://github.com/apps/railway-app/installations/new`); se instala y `--resume` |
| Workspace ambiguo | `RAILWAY_TOKEN` ve proyectos de más de un workspace (o de ninguno) y el CLI no elige | Revisar qué token hay en `rail-timekast`: el de equipo alcanza uno solo (`fx-secrets-vault §5`) |
| El destino no se decide solo | El repo está conectado en Railway **y** en Vercel, o `project-config.md` declara un rail de cliente | Se detiene y pregunta: el developer elige y se pasa `--target` (en `--resolve-target`, código 11) |
| Proyecto de Railway conectado que el state no conoce | Alguien lo creó fuera de `provision`, o el state se perdió | Con state presente, `factory provision --adopt --force --target=railway`; sin state, `factory provision --adopt` |
| Se venció la espera de nombres | Los syncs no entregaron a tiempo; el repo no se conectó | `--resume` (no crea nada nuevo) |
| `develop` falta al retomar | `main` ya está sincronizado y `develop` (o su instancia de `web`) no existe | Crear `develop` con el servicio `web` en el dashboard de Railway, sin copiar variables, y `--resume` |
| Un CNAME (o TXT) ya apunta a otro destino | El registro existe en Cloudflare con otro contenido; el CLI nunca lo reescribe | Editarlo o borrarlo en Cloudflare si el destino correcto es el esperado, y `--resume` |
| El token de Railway "falla" en `me` | Es un token de equipo: `me` sólo existe para tokens personales; está vivo | Probarlo con la consulta de `projects` de `fx-secrets-vault §5`, nunca con `me` (§4) |
| Healthcheck pendiente | El `src/` del derivado no tiene una ruta de vida pública, o la app no respondió | Aplicar [`public-health-and-env-label.md`](../../docs/retrofits/public-health-and-env-label.md) y `--resume` |
| El state no tiene bloque `railway` | El repo ya vive en Railway pero el state no registra sus ids | `factory provision --adopt --force --target=railway` (el state existe: sin `--force`, `--adopt` se niega a reescribirlo) |

---

## 11. Subprocess delegation

Este workflow **no tiene subprocesses propios**. Es lineal y orquesta primitivas CLI (`factory provision`, `factory env wizard`) directamente desde el main loop — no hay input grande que aislar, ni tareas paralelas, ni contratos cerrados que delegar (`fx-workflow-authoring §8` — ninguno de los criterios de spawn aplica). El conocimiento de dominio (operar el CLI, el rail de la bóveda) se **consulta como skill** desde el main loop:

- `fx-factory-cli` — operar el CLI del Factory en un derivado (comandos, perfiles, el rail, troubleshooting).
- `fx-secrets-vault` — entrar a la bóveda, acceso a `rail-timekast`, qué significa cada falla del rail.
- `fx-workflow-authoring` — doctrina de checkpoints + modos (autoría, no runtime).

Las primitivas CLI que el skill orquesta y sus contratos viven en `fx-factory-cli` § `factory provision` (comando, state, preflight, Neon, Vercel/git o Railway, dominios, adopt y destroy). De dónde salen los tokens que usan → `fx-secrets-vault §3`.

---

_TimeKast Factory — tk-provision (factory-internal provisioning orchestrator)_
