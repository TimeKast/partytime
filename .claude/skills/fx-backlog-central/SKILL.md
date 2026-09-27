---
name: fx-backlog-central
description: Factory-internal SSOT for mirroring a derived project's repo backlog to the central client-facing tracker (backlog.timekast.mx): the provision → push → sync → self-heal flow, the three CLI commands, the local↔remote mapping tables, graceful degradation without the service, and the BACKLOG_ADMIN_TOKEN rail. Invoke when asking how backlog-central sync works or why an issue does not surface on the client board. CLI command detail → fx-factory-cli; the /backlog push phase → tk-backlog.
family: factory-internal
runtime: true
last-verified: 2026-09-23
user-invocable: false
---

# fx-backlog-central — El sistema de backlog central del derivado

> **Propósito:** documentar, en un solo lugar, TODO el sistema que espeja el backlog del repo a **backlog.timekast.mx** (la app de tracking client-facing): qué es, el flujo completo, los tres comandos, el mapping local↔remoto, los UUIDs, la degradación elegante, el self-healing, la curación de visibilidad y el rail de tokens. Es la fuente única para entender el sistema sin tener que juntar piezas de cuatro skills distintos.
>
> **Ships to derivatives via the fx-* glob (perfiles `full` y `core`).** Es el explainer que un derivado consulta en runtime cuando el sync se comporta de forma inesperada o hay que conectar el servicio. Para el perfil `core` (sin `SK.md`, sin `sk-*`) este skill es la **única** fuente de la info del rail (`BACKLOG_ADMIN_TOKEN`).
>
> **Boundary:** este skill EXPLICA el sistema; el **detalle operativo** de cada comando vive en su skill de workflow y no se reproduce aquí (uniqueness). Detalle de flags del CLI → [`fx-factory-cli`](../fx-factory-cli/SKILL.md); flujo `/provision` → [`tk-provision`](../tk-provision/SKILL.md); fase de push de `/backlog` → [`tk-backlog`](../tk-backlog/SKILL.md); hooks de sync de `/implement` → [`tk-implement`](../tk-implement/SKILL.md).
>
> **Una excepción, declarada:** el **bloque bash del preflight `BACKLOG_CENTRAL`** (§7) sí vive aquí, y esta skill es su SSOT. Es la única pieza operativa que rompe el Boundary, porque **dos** workflows lo ejecutan con lógica idéntica: alojarlo en cualquiera de los dos volvería a uno SSOT del otro sin serlo. La disciplina de cuándo dispararlo sigue siendo de cada workflow.

---

## §1 ¿Cuándo se auto-carga?

Routing semántico (CC.md §1.1). Triggers típicos:

- "¿por qué mis issues no aparecen en el board del cliente?", "¿cómo conecto mi derivado al backlog central?", "¿cómo funciona el push a backlog.timekast.mx?"
- "¿qué status remoto le corresponde a un issue Deferred?", "¿cómo mapea la prioridad / los puntos / el MoSCoW al central?"
- "¿qué es `BACKLOG_ADMIN_TOKEN` / `BACKLOG_API_KEY`?", "el sync no hace nada, ¿está roto?"

**NO se carga cuando:** vas a operar un comando puntual del CLI (flags, troubleshooting) → `fx-factory-cli`; vas a correr el provisioning completo → `tk-provision`.

---

## §2 Qué es el sistema

El backlog del **repo es el SSOT**; **backlog.timekast.mx** es un **espejo best-effort que jamás bloquea** ningún workflow. El sistema traduce el backlog markdown local (épicas, features, issues) a los elementos remotos de la app de tracking, y mantiene el status en sync mientras implementas.

Invariantes de diseño:

- **El repo manda.** Nada del central sobrescribe el markdown local; el flujo es siempre local → remoto (salvo el estampado de UUIDs de vuelta, que es aditivo).
- **Best-effort, nunca gate.** Cada punto de contacto con la API degrada a `exit 0` + nota si algo falta o falla. Un `push`/`sync` roto no aborta `/backlog` ni `/implement` (mismo principio que la observability best-effort de `tk-deploy`).
- **Guard `is_factory` (D9).** Un repo marcado `is_factory: true` en `project/planning/project-config.md` NUNCA pushea su propio backlog. La integración es para **derivados**, no para el Factory mismo.

---

## §3 El flujo — provision → push → sync → heal

| Etapa         | Quién lo dispara                                  | Qué pasa                                                                                                          |
| ------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **provision** | `factory provision --services=backlog` (opt-in)   | Registra el proyecto remoto + mintea su key project-scoped, y escribe `BACKLOG_API_KEY` + `BACKLOG_PROJECT_ID` en el entorno `local` de la bóveda del repo (sin bloque `vault`, en `.env.local`). |
| **push**      | Fase 8 de `/backlog` (`factory backlog push`)     | Sube el backlog local en cascada (épicas → features → issues) y estampa los UUIDs de vuelta a los archivos.       |
| **sync**      | `/implement` (`factory backlog sync`)             | Refleja el ciclo de vida de cada issue/epic: `in_progress` al arrancar, `done` post-commit (fire-and-forget).    |
| **heal**      | Heartbeat del mismo `sync` (self-healing)         | Un `GET /sync-state` compara remoto vs SSOT local y repara el drift de status detectado.                          |

Cada etapa es independiente y degradable: un derivado que nunca aprovisionó el backlog simplemente ve notas de skip y sigue trabajando.

---

## §4 Los 3 comandos (shape de flags)

> Detalle operativo completo → `fx-factory-cli`. Aquí, la forma que importa para entender el sistema.

| Comando                                              | Qué hace                                                                                          | Flags principales                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `factory provision --services=backlog`               | Registra el proyecto + mintea la key project-scoped al entorno `local` de la bóveda (sin bloque `vault`, a `.env.local`). Opt-in, skippeable, fluido. | (parte del set de `--services`; `--destroy` lo cascadea por lifecycle)   |
| `factory backlog push`                               | Refleja el backlog local en cascada épicas → features → issues (POSTs al central). **No modifica archivos locales por defecto** — `--stamp` es lo único que escribe UUIDs en los issues.        | `--stamp` · `--reconcile` · `--backfill`                                 |
| `factory backlog sync --issue <ID> \| --epic <ID> --status <s>` | Sync puntual del status de un elemento + heartbeat de self-healing.                     | `--heal-only`                                                            |

**`push` — semántica de flags:**

- (sin flag) — refleja el backlog; **idempotente** vía pre-check `GET /sync-state` + UUID (NO por status code, porque la colisión de `id` en el central devuelve `500`, no `409`). Un `409` en un `POST` individual → continúa con el resto.
- `--stamp` — estampa los UUIDs v4 faltantes de vuelta a los issues/epics locales, para que entren al mismo commit de cierre. Lo invoca la Fase 8 de `/backlog` **pre-commit**.
- `--reconcile` — hace `PATCH` (en vez de `POST`) sobre un elemento que ya existe.
- `--backfill` — campaña legacy: procesa issues sin UUID previo uno por uno (adopción de un backlog viejo; correrla es per-proyecto).

**`sync` — semántica:**

- `--issue <ID> --status <s>` / `--epic <ID> --status <s>` — resuelve el `Backlog UUID` estampado del markdown local y hace `PATCH` del status remoto. `--status` acepta la forma remota (`in_progress`) o el bucket local (`in-progress`).
- `--heal-only` — corre **solo** el self-healing (§8), sin el sync puntual.
- Issue/epic legacy sin `Backlog UUID` estampado → skip-con-nota (nunca crash).

---

## §5 Mapping local ↔ remoto

Cada eje es una **tabla de datos** (no `if/else` disperso). Es la capa de traducción entre el vocabulario local (el `Status:` emoji+palabra, `P0..P3`, Story Points enteros, MoSCoW) y los enums que acepta la API.

**Status — biyección estricta 6↔6** (cada bucket local tiene exactamente un destino remoto y viceversa):

| Status local (`Status:` del blockquote) | Bucket local  | Remoto (`WorkStatus`) |
| --------------------------------------- | ------------- | --------------------- |
| `📋 Backlog`                            | `todo`        | `todo`                |
| `🚧 In Progress`                        | `in-progress` | `in_progress`         |
| `✅ Done`                               | `done`        | `done`                |
| `❌ Won't Do`                           | `wont-do`     | `wont_do`             |
| `⏸️ Deferred` (y el sinónimo `Postponed`) | `postponed`   | `deferred`            |
| `🚫 Blocked`                            | `blocked`     | `blocked`             |

**Priority** (eje independiente del MoSCoW): `P0→p0`, `P1→p1`, `P2→p2`, `P3→p3`. Un `Priority:` sin token `P0..P3` reconocible → se omite (no se manda un valor inventado).

**Story Points:** un entero positivo pasa **tal cual** (fidelidad — no se re-bucketea la estimación del equipo); `0` o ausente → `null` (la API trata `null` como "sin puntos"; épicas y features llevan `null` porque sus puntos son rollup). Escala canónica: `1 / 2 / 3 / 5 / 8 / 13` — un valor fuera de escala pasa igual, solo se puede warnear.

**MoSCoW:** solo `must` / `should` / `could` llegan al central; `won't` nunca se pushea. Un `—` / vacío / valor desconocido (issue legacy sin el campo) → se omite `moscow` (no se adivina).

**Board (tipo de elemento):** el campo `Board:` del blockquote decide con qué tipo se crea el issue en el central: `story` (default) o `task`. Un issue pre-campo `Board:` → default `story`.

**Cascada del push:** épicas → **features** (proyectadas de los Refs `FT-XX` del issue + el deep dive cuando existe) → **issues** (story/task por `Board:`). Una story sin `FT-XX` en sus Refs se sube **sin** `featureId` (cross-épica) — nunca se inventa una feature. Los `Milestone:` se mapean a **releases** (adopt-by-name, sin `id` client-supplied) y se asigna **solo la épica** al release (features/stories heredan).

---

## §6 UUIDs — identidad estable de cada elemento

- **v4 nuevos (camino feliz):** la Fase 3 de `/backlog` genera un UUID v4 por issue/epic; el agente specer lo estampa **verbatim** en el blockquote (`Backlog UUID:`) y sobrevive sin regenerarse hasta la emisión. El `push` lo usa como `id` client-supplied → el central y el repo comparten identidad.
- **v5 fallback determinístico (legacy):** un issue sin UUID estampado obtiene un UUID **v5** (SHA-1 bajo un namespace fijo, vía `node:crypto`, sin dependencia nueva) keyed en su `Issue ID`. **Mismo input → mismo UUID en cualquier corrida.**
- **Por qué determinístico importa:** la colisión de un `id` ya existente en el central devuelve `500` (no un `409` distinguible), así que la no-duplicación se garantiza con el UUID estable + el pre-check `GET /sync-state`, NUNCA tratando el status code de colisión como señal de "ya existe".

---

## §7 Degradación elegante (cero fricción)

El sistema está diseñado para que un derivado que **no** usa el backlog central no sienta nada:

- **`push` / `sync` sin credenciales:** de dónde leen `BACKLOG_API_KEY` + `BACKLOG_PROJECT_ID` lo decide el bloque `vault` de `.timekast/provision.json`. **Con bloque `vault`**, del entorno `local` de la bóveda del repo, con la sesión de la persona (nunca de `.env.local`, aunque quede uno). **Sin él**, de `.env.local`. Cualquier falta —el archivo, una de las dos claves, la sesión de la bóveda, el acceso al proyecto, una bóveda que no responde, un `provision.json` ilegible— da el resultado distintivo `not-configured` (con `reason` en es-MX que nombra la causa real, nunca un valor) que **nunca lanza**; el comando termina con `exit 0` + nota. Nada bloquea `/backlog` ni `/implement`.
- **Preflight `BACKLOG_CENTRAL` del lado del caller (dos capas, no una):** la degradación del CLI es la red de seguridad, **no** el guard primario. Los workflows evalúan el mismo check — con bloque `vault` en `.timekast/provision.json`, que el backlog esté provisionado ahí (`backlog.keyMinted`); sin él, `.env.local` con ambas vars; más el guard `is_factory` — **una sola vez por run**, local y sin red, y con resultado `off` **no invocan `npx` ni una vez**. Sin esa capa, un epic de 20 issues arrancaría 41 procesos `npx` (2 por issue + 1 del epic) que salen a npm a resolver el paquete para terminar imprimiendo _"omitido"_. Como el alta en el central es **manual** hoy (`provision --services=backlog` a mano), `off` es el default de la flota.

<!-- Los tres bullets que siguen a esta subsección pertenecen a la lista de "Degradación elegante" de arriba, no al contrato del preflight. -->

#### 🔴 El bloque canónico del preflight — esta sección ES la SSOT

> **Excepción declarada al Boundary de arriba.** El §Propósito dice que el detalle operativo de cada comando vive en su skill de workflow. Este bloque es la **única** pieza operativa que vive aquí, y por una razón concreta: lo ejecutan **dos** consumidores (`tk-implement` y `tk-backlog`) con lógica idéntica. Alojarlo en uno de los dos lo volvería SSOT del otro sin serlo — que es exactamente el estado que esta sección corrige. Un tercer consumidor futuro apunta aquí, no copia.

```bash
# ¿El backlog central está cableado en ESTE repo? Local, sin red, una vez por run.
has_env() { grep -qE "^$1=[\"']?[^\"'[:space:]]" .env.local 2>/dev/null; }
# .timekast/provision.json → vault | vault-no-backlog | none | error
#   vault            bloque `vault` + backlog provisionado (`backlog.keyMinted === true`)
#   vault-no-backlog bloque `vault` sin alta en el central
#   none             sin bloque `vault` (o sin archivo)
#   error            archivo ilegible, bloque `vault` mal formado, o sin node
vault_link() {
  [ -f .timekast/provision.json ] || { echo none; return; }
  node -e '
    let s;
    try { s = JSON.parse(require("fs").readFileSync(".timekast/provision.json", "utf8")); }
    catch { console.log("error"); process.exit(0); }
    if (!s || typeof s !== "object" || Array.isArray(s) || s.vault === undefined) { console.log("none"); process.exit(0); }
    const v = s.vault;
    const ok = !!v && typeof v === "object" && typeof v.projectId === "string" && v.projectId.trim() !== "" &&
      !!v.envs && typeof v.envs === "object" && ["main", "develop", "local"].every((k) => typeof v.envs[k] === "string");
    if (!ok) { console.log("error"); process.exit(0); }
    const b = s.backlog;
    console.log(!!b && typeof b === "object" && b.keyMinted === true ? "vault" : "vault-no-backlog");
  ' 2>/dev/null || echo error
}
BACKLOG_CENTRAL=off
if grep -qiE '^\|[[:space:]]*\*\*is_factory\*\*[[:space:]]*\|[[:space:]]*true' \
     project/planning/project-config.md 2>/dev/null; then
  :   # guard D9 — el Factory nunca espeja su propio backlog
else
  case "$(vault_link)" in
    vault) BACKLOG_CENTRAL=on ;;   # credenciales en el entorno `local` de la bóveda; si no las da, el CLI degrada con su motivo
    vault-no-backlog) : ;;         # repo en la bóveda sin alta en el central: off, sin mirar .env.local
    none)  if has_env BACKLOG_API_KEY && has_env BACKLOG_PROJECT_ID; then BACKLOG_CENTRAL=on; fi ;;
    *)     : ;;                    # ilegible o mal formado: no se adivina (el CLI tampoco cae a .env.local)
  esac
fi
```

**Contrato para el consumidor** — lo que el bloque garantiza, y lo que NO:

- **Evalúa una sola vez por run.** El resultado vale para todo el run; no se re-evalúa por issue. Si el alta ocurre a media corrida, el sync arranca en el **siguiente** run.
- **`off` → cero invocaciones de `npx`.** Una nota de 1 línea al arrancar y ningún mensaje más.
- **Con bloque `vault`, `on` exige que el mismo `provision.json` registre el backlog provisionado** (`backlog.keyMinted === true`): la bóveda es default y el backlog es opt-in, así que un bloque `vault` solo no dice nada del central. Sin backlog provisionado da `off` **y no cae a leer `.env.local`** (el CLI tampoco lo leería en ese repo). El preflight no lee la bóveda (sería red, y una sesión por run); si con el backlog provisionado la bóveda no da las dos claves, el primer `push`/`sync` degrada con su motivo (`not-configured`, `exit 0`). Sin bloque `vault`, `on` exige `.env.local` con las dos claves. Un `provision.json` ilegible, un bloque `vault` mal formado (o un derivado sin `node`) dan `off`.
- **`on` → los disparos del workflow corren tal cual**, fire-and-forget.
- **No reemplaza la degradación del CLI** — la duplica barato del lado del caller.
- **La disciplina de CUÁNDO disparar es del workflow, no de este bloque:** el orden `in_progress`/`done`, el carácter best-effort-nunca-gate y los guards de disponibilidad viven en el skill que consume el preflight ([`tk-implement`](../tk-implement/SKILL.md) §9, [`tk-backlog`](../tk-backlog/SKILL.md) §cierre). Aquí solo vive el predicado.

**Los dos consumidores lo leen explícitamente** (`CC.md §2`), nunca por auto-routing: esta skill se auto-carga por triggers semánticos de usuario (§1) que **no** coinciden con el momento del flujo en que el preflight debe evaluarse.

> ℹ️ **Efecto observable declarado:** ese `Read` explícito dispara el anuncio de skill de `CC.md §1.2` en cada corrida de los dos workflows. Es el costo aceptado de tener una sola copia del bloque; no es un cambio de comportamiento del preflight, que resuelve idéntico.
- **`provision --services=backlog` sin token:** falta `BACKLOG_ADMIN_TOKEN` en el rail → la primitiva se **salta** con un aviso plain ("el backlog central no se aprovisionó: falta el token…") y el resto del provisioning (Neon/Vercel/dominios) sigue intacto. Es opt-in (no está en el set de servicios por default), así que quien no lo pide nunca lo dispara.
- **Guard `is_factory` (D9):** en un repo `is_factory: true`, tanto el push como el sync se **saltan** siempre.
- **Headless (sin TTY):** comportamiento idéntico — fire-and-forget, sin degradar a un prompt que nadie contesta. El sync nunca introduce un checkpoint nuevo.

---

## §8 Self-healing (heartbeat, no polling)

El mismo `factory backlog sync` corre un heartbeat de auto-reparación de drift de status, pensado para dispararse **fire-and-forget** desde los workflows — nunca como gate:

- **1 solo `GET /sync-state`** por invocación (heartbeat, no polling). Diff `{ id → status }` remoto vs SSOT local.
- **Repara solo status** (único eje con primitiva de sync); épicas/features con `status: null` se saltan.
- **Cap de 10 reparaciones** por invocación: el 11º elemento con drift espera al próximo heartbeat (no repara el mundo entero de una).
- **Timeout de 5s** en la invocación completa (`Promise.race`): si la API no responde, corta limpio y el workflow que lo invocó continúa sin esperar.
- Un `PATCH` de reparación que falla a media corrida **no aborta** el resto del batch; la próxima invocación reintenta ese elemento.

`/implement` lo dispara en tres puntos: `--issue {ID} --status in_progress` al arrancar el issue, `--issue {ID} --status done` post-commit, y `--epic {ID} --status done` al cerrar el epic.

---

## §9 Visibilidad — curación de staff, no automática

Los elementos que el push crea nacen **invisibles** en el board público del cliente. Hacerlos visibles es un **acto de curación del staff** en la app, no un flag de la API:

- La API de máquina **no expone** un campo de visibilidad; solo el `publicUuid` del proyecto identifica el board público.
- El staff hace visible el proyecto/los elementos **una vez** en la app; de ahí en adelante el tracking en vivo (status, progreso) fluye solo.
- **Implicación para narrar en `/backlog`:** tras el primer push, avisar que "el staff debe hacer visible el proyecto en la app la primera vez" — si el cliente no ve sus issues, casi siempre es esto (visibilidad sin curar), no un push roto.

---

## §10 El rail — `BACKLOG_ADMIN_TOKEN` (SSOT para el perfil `core`)

> Para un derivado perfil **`core`** (sin `SK.md`, sin `sk-*`) esta sección es la **única** fuente de la info del rail. Un derivado `full` tiene además `SK.md §7.3` (misma info, tabla de variables del rail).

El sistema usa **dos** credenciales de niveles distintos:

| Credencial              | Nivel           | Dónde vive                          | Quién la usa                                                                 |
| ----------------------- | --------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `BACKLOG_ADMIN_TOKEN`   | **org-level**   | rail: proyecto `rail-timekast` de la bóveda (entorno `main`) | `factory provision --services=backlog` — crear el proyecto + mintear la key |
| `BACKLOG_API_KEY` (+ `BACKLOG_PROJECT_ID`) | **project-scoped** | Entorno `local` de la bóveda del repo cuando tiene bloque `vault`; `.env.local` cuando no (LOCAL-ONLY en los dos) | `factory backlog push` / `sync` — operar los elementos             |

- **`BACKLOG_ADMIN_TOKEN`** lo emite el equipo que opera **backlog.timekast.mx**; vive en el rail junto al resto de los tokens de metodología: el proyecto `rail-timekast` de la bóveda, que `provision` lee con la **sesión de la persona** que lo corre, sin copia en disco y sin imprimir el valor. Es **org-level** (como `VERCEL_TOKEN`), por eso vive en el rail y no en el repo. Solo satisface los 3 endpoints org-level: crear proyecto, mintear key y desactivar proyecto — **no** las operaciones scopeadas a proyecto.
- **La key `read_write` project-scoped** (`tk_live_*`, show-once) que `provision` mintea **NO** va al rail: es project-scoped → `provision` la escribe como `BACKLOG_API_KEY` (+ `BACKLOG_PROJECT_ID`) en el entorno `local` de la bóveda del repo —el único destino que el guard de escritura de la bóveda permite para esas dos claves— o, sin bloque `vault`, en el `.env.local` del derivado. **LOCAL-ONLY, nunca a Vercel** (sin bóveda, tratamiento `PROVISION_OWNED`: `env:push` la salta). Todas las operaciones de elementos (push, sync, `sync-state`) usan esta key, jamás el admin token.
- **Rotación:** un admin de la bóveda mete el valor nuevo en `rail-timekast` con el **mismo** nombre; aplica en la siguiente corrida de `provision`, sin pasos en la máquina de nadie.
- **Si falta:** `BACKLOG_ADMIN_TOKEN` ausente en `rail-timekast` → `provision` **salta** el paso de backlog con aviso cuando se pidieron más servicios, y aborta sin mutar nada cuando `backlog` es el único (§7). Una bóveda que no se puede leer (sin sesión, sin acceso a `rail-timekast`) no es "token ausente": llega con su propia falla y su arreglo → [`fx-secrets-vault §3`](../fx-secrets-vault/SKILL.md).

> Entrar a la bóveda y qué significa cada falla del rail → [`fx-secrets-vault §3`](../fx-secrets-vault/SKILL.md); cómo lo consume cada comando → `fx-factory-cli` § El rail. Este skill documenta **qué** credenciales usa el backlog central y **dónde** viven; no reproduce el mecanismo del rail.

---

## §11 Boundary — qué NO cubre este skill

| Si buscas…                                                        | Fuente                                             |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| Detalle de flags / troubleshooting de un comando del CLI          | `fx-factory-cli`                                   |
| Correr el provisioning completo (orden, gates, narración)         | `tk-provision`                                     |
| La fase de push dentro del cierre de `/backlog` (guards, commit)  | `tk-backlog` (Phase 8)                             |
| Los hooks de sync de status dentro de `/implement`                | `tk-implement`                                     |
| El vocabulario canónico de `Status:` y el shape del blockquote    | `tk-backlog` (`methodology/issue-shape.md`)        |
| El rail de secretos de metodología (mecanismo general)            | `fx-secrets-vault §3` · `fx-factory-cli` § El rail · `SK.md §7.3` (perfil `full`) |

---

_TimeKast Factory — fx-backlog-central (SSOT del sistema de backlog central, ships via the `fx-*` glob)_
