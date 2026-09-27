---
name: tk-implement
description: Coding-family workflow that implements a whole backlog epic cohesively — plan once, execute issues serially (one isolated executor at a time) with an atomic commit each, integrate, fix all small debt in the run and close. Single-issue mode for fixes. The bootstrap epic delegates provisioning to /provision (which pushes via the CLI); issue status mirrors to the central backlog when BACKLOG_API_KEY is set. Primary invocation is `/implement EPIC-NN` (or `ISSUE-ID`); do not run it directly.
family: coding
model: opus
parallelism_unit: none
concurrency_cap: 1
merge_strategy: orchestrator-merge
auditor_step: true
last-verified: 2026-09-23
user-invocable: false
---

# tk-implement — `/implement` Workflow Skill (v2, epic-first)

> Coding-family workflow. La unidad de trabajo es el **epic**: se planea cohesivo **una vez**, se aprueba **una vez**, y se ejecutan sus issues **en serie, uno a la vez, en el mismo repo**, integrando backend + frontend + contratos + APIs + tests + UI + diseño, con **commit atómico por issue**. Consume el output de `/backlog` (epics + issues self-contained con su `## Topology`). Modo secundario single-issue para fixes.

> **Slash command:** `/implement [EPIC-NN | ISSUE-ID] [--next|--only|--start-at|--plan]` (thin wrapper en `.claude/commands/implement.md`).

> **Architectural principle:** el esfuerzo va en **planear bien** (CP-A), no en vigilar cada línea. Si el spec del backlog está bien puesto, el código sale bien. Después de aprobar el plan, el workflow se **suelta** y ejecuta el epic completo, parando solo al final (CP-B) o ante lo imprevisto.

---

## 1. Cuándo usar

Invocar después de `/backlog` (existe `project/backlog/v*/` con epics + issues). `/implement` es el último eslabón del pipeline `discovery → design → backlog → implement`.

**Usar para:** implementar un epic completo (`/implement EPIC-NN`); un fix/one-off de un issue suelto (`/implement ISSUE-ID`); tomar el siguiente epic listo (`/implement --next`); retomar un epic a medias (`--start-at`).

**No usar para:** generar backlog (eso es `/backlog`); revisión profunda post-merge standalone (fuera del scope de `/implement` — lo cubre la herramienta de review del runtime; el readiness pre-release es `/preflight`); diseño de UI (eso es `/design`).

---

## 2. Tono + Plain Language rule (user-facing)

Todo lo que el **user** ve va en **lenguaje claro**, audiencia = developer mid-level que NO leyó el backlog ni reports de executors completos. Aplica a: CP-A, CP-B, los altos livianos per-grupo (Phase 3), los STOP messages, y los resúmenes de cierre por-issue. Un término técnico se explica en una línea al primer uso. Hereda `CC.md §3` (kit-wide rule). Extensión específica a vocab implement:

### Vocab a definir inline (primer uso por turno)

| Término             | Definición plain                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| EPIC                | grupo cohesivo de issues que entregan una capacidad ("Auth: login + sesión + roles")             |
| SELECTION SET       | los issues del epic que vas a ejecutar en este run (puede ser todo el epic o un subset)          |
| Issue               | unidad de trabajo: lo que un solo run de `/implement` ejecuta + cierra + commitea                |
| DoR                 | Definition of Ready — checklist de qué necesita un issue antes de que `/implement` lo agarre     |
| DoD                 | Definition of Done — checklist de qué tiene que cumplirse para cerrar el issue                   |
| Evidence            | resumen plain de lo que hizo cada issue, anclado al commit final (lo que tú revisas en CP-B)    |
| CP-A                | checkpoint de Plan Mode al inicio: apruebas el plan completo del epic ANTES de codear             |
| CP-B                | checkpoint inline al final: revisas todo el epic ejecutado, decides push/merge                   |
| Epic Plan           | el documento que el orchestrator produce en Phase 2 — orden + grupos + skills + áreas sensibles  |
| Retry cap (N=3)     | si el executor falla 3 veces seguidas en un issue, STOP — el orchestrator lo surface al user     |
| Diff-ownership gate | check que verifica que el executor solo tocó los archivos esperados del issue (anti-scope-creep) |
| alto liviano        | resumen plain de 3-4 líneas entre grupos del Phase 3 — qué se terminó, qué viene después         |
| Deuda del epic      | los pendientes que quedan al terminar y que SÍ hay que atender: lo que anotó cada executor + hallazgos del QC + los `Medium`/`Low` con vector del audit de seguridad. Una `mejora` no es deuda |
| Frontera del epic   | el corte que decide si un pendiente es del epic (rompe un AC suyo o es defecto de su código) o se descubrió de paso |
| Cierre parcial      | el epic queda abierto porque un pendiente **suyo** no se pudo resolver en este run (un bloqueante de seguridad, un AC que no cerró, o algo que se mandó a issue); lo demás sí se cerró y commiteó |
| QC delta            | el reporte que se anexa al epic tras corregir la deuda — qué se arregló, qué no, y por qué      |
| Mejora              | hallazgo tipo "funciona, pero podría estar mejor / endurecerse por si acaso": no rompe nada, no incumple ninguna regla citable, no tiene vector. **No se corrige, no es fila, no es issue** — se registra y ya |
| Observaciones       | la sección al final del QC delta donde quedan, una línea cada una, las mejoras y lo que el filtro de refutación retiró (no existe / duplicado / sin consecuencia). Tracked; se rescata por nombre desde "Revisar" |
| Chico / grande      | chico = tier `S`/`M` de `fx-execution-policy` (el fix cabe en el run) → **se arregla solo**. Grande = `L` = **alcance nuevo** (una pantalla, entidad, flujo o endpoint que no existe) → único candidato a issue, y sólo con consecuencia concreta. Schema, deps y AC reescrito NO son grandes: son confirmaciones de un clic dentro del run |

### Pattern de narration de CP (4 pasos plain)

1. **Qué se hizo** (1-2 líneas, en términos de capacidad entregada, no IDs crudos — "Login y sesión funcionan; faltan los roles").
2. **Estado actual** (counts agrupados — "5 de 7 issues cerrados, 2 en chain de roles").
3. **Decisión pendiente** (qué necesitas tú del user).
4. **Opciones explícitas y excluyentes** — nunca checkboxes, nunca prosa ambigua. Estructuradas (`AskUserQuestion`) como default interactivo; tabla numerada 1/2/3 como fallback sin la tool; headless resuelve por su fail-closed. Detalle → `CC.md §3` + [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md).

### Phase 3 alto liviano per-grupo

Cuando el Epic Plan agrupa issues en chains o grupos paralelos, después de cerrar cada grupo el orchestrator emite un **alto liviano** plain. **NO es checkpoint** — en **fluido** (default) es solo update visible y **auto-continúa** al siguiente grupo (comportamiento de hoy); en **`--step`** se convierte en una **pausa opcional** ("¿sigo con el siguiente grupo?") antes de seguir:

```
✓ Grupo {N} cerrado — {capacidad entregada en 1 línea}
  · {issue-count} issues commiteados ({SHA range si vale la pena})
  · próximo: Grupo {N+1} — {qué viene en 1 línea}
```

Ejemplo:

```
✓ Grupo 2 cerrado — Login con magic link + verificación de email funcionan end-to-end
  · 3 issues commiteados (964ab6c..7f8e2a1)
  · próximo: Grupo 3 — RBAC roles + matriz de permisos
```

No es un STOP; es un "voy bien, esto se cerró, ahora arranco con el siguiente". Si el user quiere interrumpir, lo hace ahí.

### Executor failure narration template

Cuando el retry cap (N=3) se agota en un issue, o el diff-ownership gate detecta scope-creep, el orchestrator NO surface el report técnico raw del executor. Emite plain:

**Retry cap exhausted:**

```
🛑 STOP — Issue {AUTH-030} falló 3 veces seguidas.

Qué intentó el executor:
  · 1er intento: {1-2 líneas plain del primer fail — qué code escribió, qué falló}
  · 2do intento: {1-2 líneas — qué cambió, qué siguió fallando}
  · 3er intento: {1-2 líneas}

Hipótesis de raíz: {1 línea — typo, deps, decision-mode mismatch, schema gap, etc}

Opciones:
| 1 | Te paso al issue para que lo arregles a mano y reanudemos    |
| 2 | Marcamos el issue como blocked + DECISION-XXX + seguimos    |
| 3 | Cancelamos el epic completo                                  |
```

**Diff-ownership gate failure (scope-creep):**

```
🛑 STOP — El executor de {AUTH-030} tocó archivos fuera del scope esperado.

Esperaba tocar:
  · src/lib/auth/magic-link.ts (declarado en §6 Contexto Técnico)
  · src/app/api/auth/route.ts
  · tests/unit/auth/magic-link.test.ts

Tocó además:
  · src/lib/db/schema.ts        ← fuera de scope
  · src/components/auth/Sidebar.tsx  ← fuera de scope

Esto suele ser scope-creep (el executor "aprovechó y arregló otra cosa"). Si era necesario:
| 1 | Lo apruebas (los cambios eran legítimos) y proseguimos              |
| 2 | Rollback del issue, reabrimos con scope ampliado en CP-A          |
| 3 | Rollback + cancelar epic                                          |
```

### Anti-patterns

- **Citar exit code raw** ("pnpm verify exit code 1"). Re-expresar plain: "los tests fallaron — 3 specs rojas en `auth/magic-link.test.ts`."
- **Dumpear el QC report completo**. El orchestrator extrae las 2-3 violaciones críticas + las pasa plain. El report técnico vive en el report file para auditoría posterior.
- **Listar IDs sin contexto**. "AUTH-030, AUTH-040, AUTH-050 done" → "los 3 issues de login (cuenta, magic link, verificación) están cerrados".
- **Citar hashes EPIC-PLAN visibles al user** — los hashes son internos para drift detection, no para el user.
- **Skipear el alto liviano entre grupos** — el user pierde visibilidad de progreso y se siente "a ciegas" si el epic tiene >5 issues.

```
❌ "footprint-disjoint collision gate"     ✅ "dos tareas que escriben el mismo archivo no se hacen juntas"
❌ "el executor retorna proposed Evidence"  ✅ "lo que hizo cada issue, para que tú lo revises"
```

Las secciones procedurales internas de este SKILL (delegation, execution model, gates) son técnicas a propósito — las lee Claude para ejecutar. Hereda `PIPELINE_CURRENT_TRUTH §5 "Plain Language cross-workflow discipline"` + `CC.md §3`.

---

## 3. Anti-Drift / Quality Rules (no-negociables)

1. **El plan es el risk gate.** CP-A aprueba TODA la ejecución del epic (incluidos los cambios sensibles). NO se re-gatea risk por issue — eso frena de más.
2. **Serial, un executor a la vez, mismo repo.** Sin paralelismo, sin worktrees (decisión durable del user).
3. **Leer SOLO los refs del epic/issue.** El issue es self-contained (lo emitió `/backlog`). Cero artifact-hopping, cero "resolver dinámico de paths".
4. **Commit atómico por issue** — Conventional Commits + footer `Closes: {ID}`. Cierre por-issue ANTES del commit (§9 B1).
5. **No inventar** (`CODING.md §8`): entidades/actions/AC se citan del backlog, no se inventan. El executor respeta los `DoR Waivers` del issue.
6. **Scope surgical** (`CODING.md §3`): un issue toca solo sus archivos esperados (§7 diff-ownership).
7. **No `--no-verify`, push manual — salvo el bootstrap** (`GIT.md §1-2`). Los commits por issue son locales y autónomos (autorizados por CP-A); el push lo decide el user en CP-B. La única excepción es `EPIC-00-bootstrap`: ahí `factory provision` commitea y pushea la migración inicial y crea `main`/`develop` en el remoto, y su gate HIGH-risk es el CP2 de `/provision` (§ Bootstrap epic) — no es un bypass, es el push autorizado en otro checkpoint.
8. **Nunca inventar aprobación** — solo respuestas reales del user en los checkpoints.

---

## 4. Turn boundaries

| Turn | Phases                                                                | Stops con                                        |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------ |
| 1    | Phase 0 (selection + gates) + Phase 1 (context) + Phase 2 (epic plan) | **CP-A** (Plan Mode)                             |
| 2    | Phase 3 (execution serial) [+ altos livianos si por-grupos]           | Inline progress / alto por-grupo                 |
| 3    | Phase 4 (epic integration, **incl. 4.7 deuda**)                       | **CP-B** (inline) — y hasta 3 STOP antes: micro-gate 4.7.4 · tope por AC 4.7.6 · post-hoc de riesgo 4.8 (si escala) |
| 4    | Phase 4.7.7 (el fix-loop ejecuta lo decidido en CP-B) + Phase 5 (epic close, normal o parcial) | Done — recommend `/implement --next` o `/deploy`. El micro-gate 4.7.4 puede volver a parar aquí si un fix decidido toca área no autorizada |

Issue mode colapsa a: Phase 0 + 1 (un issue) + plan inline + el loop de ejecución + single-issue final verification + close.

---

## 5. TodoWrite

Usar **TodoWrite** desde Turn 1. Un solo todo `in_progress` a la vez. En epic mode, un todo por issue del SELECTION SET + los de fase (plan / integración / close).

---

## 6. Flow overview

```
Phase 0  Selection + hard gates (git pre-flight · epic ready · deps · SELECTION SET)
Phase 1  Context (epic + refs de cada issue del set — self-contained)
Phase 2  Epic Plan (cohesivo + áreas sensibles + orden/grupos + skills)   ── orchestrator-direct
   🛑 CP-A  Aprobar plan (Plan Mode, plain, 1 pantalla)  ← ES el risk gate
Phase 3  Execution SERIAL — por issue: [executor] code+verify → [orquestador] diff-gate → Evidence → ✅ → commit
Phase 4  Epic integration (verify + build + e2e; QC report; security audit condicional)   ── loop acotado
         4.7 Deuda: recolecta → frontera → refuta/filtra → corrige TODO lo chico (S/M) → registra observaciones → re-verify + QC delta
         4.8 Post-hoc: re-evalúa el riesgo sobre el diff real del epic → escala si corresponde (CP)
   🛑 CP-B  Review final + tabla SOLO con lo grande (L con consecuencia / retry cap agotado) + resumen → push/merge (manual)
         4.7.7 El fix-loop ejecuta lo que CP-B decidió, en el mismo run → re-verify + QC delta
Phase 5  Close epic — normal (✅) o PARCIAL (queda 🚧 con la deuda registrada)
```

---

## 7. Phases (epic mode)

### Phase 0 — Selection + hard gates

- **Git pre-flight:** árbol limpio (`git status`) + en branch de trabajo (NO `main`). Si no → STOP + ofrecer corregir. (Evita commitear encima de cambios sucios o en la branch equivocada.)
- **Env validity gate (HARD, feature epics):** correr `pnpm env:check` ([`scripts/tools/env-check.ts`](../../../scripts/tools/env-check.ts), validación Zod — verifica que las env vars sean **válidas**, no solo presentes; un grep de `DATABASE_URL` matchearía el placeholder de `.env.example`). Si **falla** → **STOP**: el entorno no está aprovisionado/configurado → ofrecer correr el bootstrap (`/implement EPIC-00`). En un repo con bóveda `env:check` corre a través del wrapper: si lo que falló es el wrapper (sin sesión, sin acceso, sin `infisical`), surfacear su mensaje y remitir a [`fx-secrets-vault §3`](../fx-secrets-vault/SKILL.md) — no es un entorno sin aprovisionar. **Exención:** si el target ES `EPIC-00-bootstrap` (o `SETUP-001`), NO correr este gate — el bootstrap es justamente lo que deja el entorno válido (la bóveda o, sin ella, el `.env.local`). 🔴 Nunca mirar `.timekast/provision.json` ni el lockfile para esto (eso es capability/provenance, no validez de env).
- **Mode dispatch (desambiguación):** arg que matchea `^EPIC-\d+` → **epic mode**; cualquier otro `{DOMAIN}-{NNN}` → **issue mode**; `--next` → §debajo.
- **Execution-mode flags:** `--step` (override del modo fluido — convierte el alto liviano entre grupos en una pausa; CP-A y CP-B no cambian, ya paran), `--verbose` (amplía resúmenes). Default = **fluido** ([`fx-workflow-authoring §7.1`](../fx-workflow-authoring/SKILL.md); ver §8). Nota: en implement el modo fluido coincide con el comportamiento de hoy (ya corre suelto entre CP-A y CP-B) — los flags se aceptan por consistencia kit-wide.
- **Epic existe** + tiene ≥1 issue `ready` no cerrado. Si todos `✅` → "nada que hacer". Si todos `🚫 blocked` → STOP.
- 🔴 **Guard "epic pausado con deuda pendiente" (antes del "nada que hacer"):** si el epic está `🚧 In Progress` + **todos** sus issues `✅` + el último `## QC Delta` de su epic file registra ítems sin resolver → **NO responder "nada que hacer"**. Surfacear esos pendientes en plain y ofrecer emitirlos, citando el plan de remediación que 5.2 dejó escrito (`/backlog extend-epic EPIC-NN <plan>` para lo del epic; `/backlog add <plan>` para lo de fuera). Es la secuencia esperable tras un cierre parcial en el que el user difirió la segunda vuelta: los issues de deuda **todavía no existen**, así que sin este guard el workflow declararía "nada que hacer" sobre un epic explícitamente abierto con trabajo registrado. El ancla es el **QC delta** (durable, tracked, siempre presente) — no el plan, que podría haberse borrado.
- **Epic en estado parcial post-Phase 4 (recovery automático):** si epic mode Y todos los issues están `✅ Done` pero el epic file NO está `✅ Done` Y NO contiene sección `^## QC Report (Phase 4` → el epic quedó a medio cerrar (Phase 5 sanity check anterior falló). Reanudar desde Phase 4 (re-spawn `quality-engineer` + re-corrida de verify/build/e2e). Mensaje plain al user: "Epic en estado parcial detectado (issues cerrados pero QC report ausente). Reanudo desde Phase 4."
- **SELECTION SET** = issues `ready` del scope (epic completo / `--only ID[,ID]` / `--start-at ID`). Los `blocked` se **omiten** del set; CP-A los lista explícito ("omito X por blocked"). Si un issue del set depende de uno blocked → STOP.
- **Deps cross-epic:** los issues de otros epics de los que depende el set deben estar `✅` — status leído del `> **Status:**` del **issue file** (lo que `update-board` parsea), NO de la tabla del epic. Si no → STOP.
- **(issue mode)** los `Depends on` del issue suelto están `✅` → si no, STOP/warn.
- **(resume `--only`/`--start-at`)** las deps **intra-epic** de los seleccionados están `✅` → si no, STOP/warn.

**`--next` — algoritmo:** recorrer el orden global de `EXECUTION-ORDER.md`; saltar `✅ Done` / `🚫 Blocked` / `❌ Won't Do` / placeholders sin `.md`; el **primer issue `ready`** define el epic objetivo → epic mode sobre él. Aclaración: `EXECUTION-ORDER.md` aporta solo el **orden** (topología estática); el **status** de cada issue se lee de su issue file (campo `> **Status:**`), no de EXECUTION-ORDER.

### Bootstrap epic (`EPIC-00-bootstrap`) — provision inline (special-case)

`EPIC-00` (lo emite `/backlog` en `nuevo`) aprovisiona la infra del derivado. Difiere del flujo normal en puntos que se **declaran**, no se asumen (detalle en [`tk-backlog/methodology/setup-epic.md`](../tk-backlog/methodology/setup-epic.md)):

- **`SETUP-001-bootstrap` carga `tk-provision` inline.** En Phase 3, cuando el issue es `SETUP-001` del bootstrap, el orquestador **NO** spawnea `imp-issue-executor` — hace **Read de `.claude/skills/tk-provision/SKILL.md`** (en la sesión, `CC.md §8`) **y ejecuta sus primitivas inline** (patrón `tk-design`→`kb-visual-direction`), en este orden **inviolable**:
  1. `pnpm install`.
  2. `pnpm db:generate` — mint del `0000` desde el schema TS.
  3. 🔴 **Commit pre-provision** del `0000` (`src/lib/db/migrations/`) + `pnpm-lock.yaml` — subject `chore(db): add initial 0000 migration`, **sin** `Closes:` (commit intermedio, `GIT.md §3.3`). **DEBE ocurrir ANTES del substrato de provision** (paso 4), con los dos destinos: el substrato pushea `main`+`develop` y **dispara el primer deploy**, que migra — en Vercel en `vercel-build` (`pnpm build && pnpm db:migrate`), en Railway en el pre-deploy (`TK_VAULT=off pnpm db:migrate`, después del build). Si el `0000` no está commiteado, el deploy corre **sin** el schema: el build pasa y **falla `db:migrate`**, que no encuentra `meta/_journal.json` → **el deployment queda en error y no se promueve**. El síntoma aparece al final del comando, no antes del build. (Root cause del incidente de bootstrap — ver [`setup-epic.md`](../tk-backlog/methodology/setup-epic.md), SSOT del orden.)
  4. Primitivas de provision (Neon → **CP2** substrato de despliegue, Vercel o Railway → DNS/Resend → wizard de env).
  5. `pnpm verify` (lint + typecheck + unit/component, **sin** e2e).

  Los workflows `tk-*` NO van en el `Skills:` del issue (allowlist) — esta carga inline la decide ESTE workflow, no el issue.
- **Excepción a B1 (commit atómico por issue).** El bootstrap emite **dos** commits para `SETUP-001`: el commit pre-provision del paso 3 (migración + lockfile, intermedio, sin `Closes:`) y el commit de cierre B1 (§9: issue file + epic file + Evidence, con `Closes: SETUP-001`). No viola "un commit por issue" — lo **reubica**: el `0000` tiene que viajar en el push de provision, que ocurre a mitad del issue. El commit intermedio **no lleva keyword** → `validate-commit.sh` no lo valida (§9: el hook solo muerde `Closes:`). El diff-ownership gate no aplica al bootstrap (no hay `imp-issue-executor`). Declarado para `fx-factory-reviewer`.
  - **Por qué es seguro inlinear este `tk-*` (no copiar el patrón a la ligera):** `tk-provision` es **factory-internal + delgado** — un orquestador sobre las primitivas del CLI (las mutaciones viven en el CLI, no en el skill) con **un solo checkpoint** (CP2). NO es licencia para inlinear un `tk-*` pesado (p.ej. `tk-design`, con su propio flujo multi-checkpoint): eso anidaría checkpoints que colisionan. El inline aplica solo a un workflow delgado sin gates propios más allá del que este special-case ya declara.
- **El gate es el CP2 de `tk-provision`, NO el CP-A de implement.** `EPIC-00` **no** corre el CP-A de Phase 2: el bootstrap es mecánico y su único punto HIGH-risk irreversible es el **CP2 de provision** (substrato de despliegue, Vercel o Railway), que para incondicionalmente dentro de `SETUP-001`. Declararlo evita el doble-gate. (El resto de los epics SÍ corre CP-A normal.)
- **`SETUP-002-go-live` corre normal** (executor estándar): verifica el primer deploy+migrate + crea el invite del super_admin en `main` (`npx @timekast/factory invite-admin --target main --app-url=<prod>`). **Gate de output (no solo exit-code):** para `--target main`, si el comando cae al fallback de consola (`ℹ️  Email no configurado` / `emailSent:false`) → STOP, NO cerrar la AC del invite (el correo no se envió). Detalle en [`tk-backlog/methodology/setup-epic.md`](../tk-backlog/methodology/setup-epic.md) § `SETUP-002-go-live`.
- **Headless (sin TTY):** fail-closed — `tk-provision` no puede satisfacer su CP2 sin aprobador → emite el runbook como doc y `SETUP-001` queda `🚫 Blocked` (no cumple DoD). Nunca aprovisiona en silencio.
- **§7.1 seguro:** provision muta por las APIs de cada proveedor con los tokens del rail, no `vercel link`/`vercel pull` (los vectores de overwrite-sin-diff). Declarado para `fx-factory-reviewer`.

### Phase 1 — Context load

Leer el epic file + **SOLO** los refs de cada issue del SELECTION SET (FT/SCR/ENT/AC/actions/RBAC/packet que el issue cita). Self-contained: no abrir más que lo referenciado. Cargar `project/reference/{INVENTORY,HOOKS,CODEBASE,SCHEMA,API}.md` si existen (para diff-ownership + "don't rebuild" + no inventar tablas/columnas ni endpoints — `CODING.md §8`, `SK.md §2`).

### Phase 2 — Epic Plan (orchestrator-direct)

El corazón del workflow. Produce el `EPIC-PLAN` (template `templates/EPIC-PLAN.template.md`, **plain language, 1 pantalla**):

- **Medir tamaño del SELECTION SET** (no el epic completo): si el scope es el epic entero → leer `Total Issues` + `Story Points` del **header del epic** (no re-sumar issue por issue); si `--only`/`--start-at` → contar solo los issues pendientes seleccionados. → decide **de-corrido vs por-grupos** (§Modo adaptativo).
- **Objetivo cohesivo** del epic en lenguaje claro.
- **Orden + grupos** (del `## Topology` del epic): grupos = `sequential_chains` + cada `parallelizable_issue` como grupo propio (singleton), todo ordenado por número global. Cubre el invariante `parallelizable_issues ∪ sequential_chains.flat() == todos los issues`. Si un grupo (chain larga) supera el umbral → proponer sub-chunks (cada K issues) para tener pausas. Fallback si no hay `## Topology`: orden flat por número global (parser: entero **tras el primer guion** del ID; nunca `localeCompare`; si no hay número → orden de la tabla de Issues del epic).
- **Áreas sensibles** que el epic toca, en lenguaje claro: "este epic crea tablas nuevas en la base de datos", "modifica el login". (El user lo ve una vez, en CP-A.) Sale del **mismo paso** que `sensitive_paths_authorized` — ver §2.1.
- **Skills a consultar** (consolidado del epic — del campo `Skills:` de cada issue).
- **Resolución de riesgo plan-time + panel** — §2.1 y §2.2 abajo. Reemplaza el gating de `architect` por juicio en prosa que esta fase tenía; ese criterio **sobrevive como piso aditivo** (§2.2).
- **Y antes de todo lo anterior, el predicado de drift** — §2.0 abajo: si el repo ya no tiene la forma que el backlog supone, se replanea antes de gastar el panel.

#### 2.0 Predicado de drift del backlog — mecánico, con escalada condicional

Un backlog envejece entre su emisión y su ejecución: `/implement` puede correr semanas después de `/backlog` (Phase 0 contempla explícitamente epics reanudados), y §2.2 revisaría un plan cuyos supuestos ya no describen el repo — un hallazgo que en realidad es drift llega vestido de problema arquitectónico y el panel excava alrededor. Por eso, **antes de §2.1/§2.2**, el orquestador corre este predicado — **gratis, sin spawn en el caso normal**.

**Insumo: la enumeración CRUDA del bullet `Files to create/modify` de cada issue del SELECTION SET — nunca la lista filtrada de §2.1.** Es la misma regla que la fila «riesgo» de la tabla de §2.2, y por la razón que ahí quedó escrita: *el sesgo protege la autorización; nunca debe recortar el escrutinio*. Detectar drift es escrutinio — heredar el sesgo conservador de §2.1 dejaría **exentos de verificación** justo los paths condicionales o ambiguos, la dirección insegura del error (el caso real de §2.1 es exactamente un path marcado `CONDICIONAL`). Bullet ausente, vacío o no parseable → el trato que §2.1 ya declara, heredado: no aborta el run, el path no entra al predicado y CP-A lo declara en una línea.

**Sólo paths — existencia, nada más.** Por cada path enumerado, el predicado pregunta si el repo lo tiene: un path que el issue da por existente (lo modifica/extiende) y ya no está, o uno que declara crear y ya existe, es drift; cuando la prosa del bullet no distingue crear de modificar, la discordancia se trata como drift — escalar de más cuesta un pase de dimensionamiento; no escalar deja al panel excavando sobre un repo que se movió. El drift **semántico** — un símbolo que sigue existiendo pero cambió de contrato — queda **fuera, con su razón escrita**: exige un contrato de parseo que §2.1 no tiene (el bullet es prosa libre), y venderlo como «gratis, mecánico» sería lo que §2.1 llama *parsear markdown a ojo*. Cerrarlo es trabajo aparte, no una extensión silenciosa de este predicado.

**Sin drift → §2.2 directo**, sin spawn y sin parada. Es la ruta normal y no cambia nada de lo que sigue.

**Con drift → escala al `grounding-auditor`** (keep genérico, read-only — §11: puede correr antes de CP-A porque no produce writes durables, mismo registro que `architect`), con mandato acotado a **dimensionar, no diseñar** — el mismo corte que [`fx-execution-policy §7`](../fx-execution-policy/SKILL.md) declara para el refutador de deuda: establece cuánto se movió el repo respecto de lo que los issues suponen (qué paths discuerdan, qué issues del set quedan afectados, qué afirmaciones sobreviven), y **no** escribe criterios de aceptación, no elige dónde vive el fix, no propone arquitectura. **La salida es replan, no panel:** con el dimensionamiento en mano el run PARA (fila de §8) y ofrece replanear — ajustar el plan sobre lo que sobrevive, regenerar el backlog (`/backlog extend-epic` / re-emisión), o cancelar. El panel de §2.2 no se paga sobre un backlog que ya se sabe desfasado; corre después, si el replan produce un plan que vuelve a describir el repo.

**El spawn cumple [`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md)** — invocation shape (fase declarada: `/implement Phase 2.0` · `model` explícito: `opus`, el pin del card · skills citadas por path: `consulta antes de empezar: .claude/skills/fx-execution-policy/SKILL.md`) **y el contrato de contexto de 6 campos**: qué se hizo y por qué (el backlog del epic supone una forma del repo que el predicado ya refutó en paths concretos) · alcance exacto (los issue files afectados y sus bullets `Files to create/modify`, con los paths discordantes señalados) · restricciones del kit (mandato cerrado del card: clasificar y citar consultas, nunca proponer remedio) · líneas a agotar (las afirmaciones de existencia y forma de cada issue afectado) · fuera de alcance (rediseño, alternativas de fix, el drift semántico) · fase del proyecto (derivada mecánicamente, per esa misma sección). Mapeo al input contract del card: `artifact` = los issue files afectados (+ el epic file), `claim_scope` = sus `§6 Contexto Técnico`, `repo_context` = `project/reference/*` si existen.

**Consumidores del resultado:** §2.2 — el predicado de frescura de `gate_decisions` lee este veredicto (abajo) — y la narración de CP-A, que declara en una línea los paths no parseables y, si hubo drift, cómo se resolvió.

**Headless con drift: fail-closed, ANTES de spawnear.** Aborta con la causa citada (los paths discordantes), sin pagar el dimensionamiento — el mismo patrón que §2.2 ya aplica: resolver primero, nunca comprar un pase que no se va a consumir.

**Lo que este paso NO cambia:** el filtro y el sesgo de §2.1 siguen gobernando `sensitive_paths_authorized` sin cambios; el contrato de parseo del bullet no se toca.

#### 2.1 Resolución mecánica de `sensitive_paths_authorized` — predicado, no juicio

Hasta aquí el campo lo llenaba **quien redactaba el plan**, aplicando con juicio el criterio que el template ya prescribía. Dos corridas sobre el mismo SELECTION SET podían enumerar paths distintos, y el micro-gate de `§4.7.4` —que es fail-closed contra ese campo— se comportaba distinto sin razón. Ahora lo resuelve un predicado.

**Insumo: el bullet `Files to create/modify` del `§6 Contexto Técnico` de cada issue del SELECTION SET.** Nada más del `§6` — ni la prosa de `Kit primitives`, ni los paths citados en `API contract`/`RBAC`.

> 🔴 **Ese bullet es prosa libre, no un campo estructurado** (`ISSUE.template.md`: `- **Files to create/modify:** {{paths}}`). No existe un campo `expected_files`. Por eso el predicado necesita un contrato de parseo explícito y un sesgo declarado — sin ellos, "mecánico" sería un nombre para "parsear markdown a ojo".

**Contrato de parseo — qué entra y qué no:**

| Forma de la entrada | Entra | Por qué |
| --- | --- | --- |
| Un path o glob concreto **en posición inicial** de su bullet o sub-bullet — antes del primer guion largo | ✅ | el issue declara que lo va a tocar. La restricción posicional importa: un path **mencionado en la prosa explicativa** («no se toca; el cambio va en X») no es una declaración de edición y no entra |
| Con **cualquier marca de condicionalidad**, sea cual sea su redacción — `CONDICIONAL`, `solo si`, `si aplica`, `puede terminar sin líneas editadas`… | ❌ | el issue declara que **puede** no tocarlo. El criterio es **semántico, no un token literal**: el backlog real expresa la condicionalidad de varias formas, y anclar a una palabra dejaría entrar las demás |
| **Alternativa** (`X` **o** `Y`) | ❌ | sólo uno de los dos se edita, y cuál no se sabe hasta ejecutar |
| **"verificado, no editado"** / "recibe estatus… aunque no se edite" | ❌ | el issue declara explícitamente que no lo modifica |
| Bullet ausente, vacío o no parseable | ❌ (ver abajo) | no hay dato del que derivar |

🔴 **Sesgo: ante ambigüedad, NO se autoriza — y este sesgo GANA sobre la fila ✅ cuando entran en conflicto.** Si una entrada parsea como path concreto pero su prosa la condiciona o la niega, queda fuera: la columna normativa no anula la regla de arriba. Un path que no entra queda **fuera** de `sensitive_paths_authorized`, y por lo tanto el micro-gate de `§4.7.4` **sí** dispara sobre él si un fix del cierre lo toca. Esa es la dirección correcta del error.

🔴 **Garantía verificable — la razón de ser del sesgo:** la lista que el predicado produce es siempre un **subconjunto** de la que produciría el juicio humano. La mecanización sólo puede **reducir** lo pre-autorizado, nunca ampliarlo. Sin esta garantía, mecanizar cumpliría el criterio al pie de la letra mientras **afloja** el fail-closed que ese criterio existe para proteger: cada path autorizado de más es un STOP menos.

> **Caso real que lo obliga, de este mismo kit:** un issue puede listar `.claude/policy/quality-gates.json` marcado *"CONDICIONAL: solo si la salida elegida retira…"* y luego no tocarlo. Un extractor ingenuo lo autorizaría, y un fix del fix-loop sobre el registry de riesgo pasaría **sin gate** — sobre el archivo que gobierna todos los gates del kit.

**Bullet ausente o no parseable → no aborta el run, pero se narra.** El path no entra (sesgo de arriba) y CP-A lo declara en una línea: *"el issue X no declara sus archivos de forma legible — su superficie no queda pre-autorizada"*. Es el mismo criterio que Phase 3 ya aplica con su STOP por `§6` impreciso, ubicado donde todavía es barato.

**La prosa y el frontmatter se emiten en el MISMO paso.** Todo path que el predicado agregue tiene su línea correspondiente en «Áreas sensibles» **antes** de que CP-A pida aprobación, y CP-A **narra el conteo resuelto** ("autoricé N áreas, derivadas de los issues X e Y"). Sin esto, el user aprobaría una autorización que la prosa nunca mencionó — y `§4.7.4` dejaría de disparar sobre un path que nadie vio.

#### 2.2 Panel plan-time — quién revisa el PLAN, antes de pedir aprobación

Resuelto el riesgo, Phase 2 **spawnea a los revisores que apliquen** y sus hallazgos entran a la narración de CP-A. No se pregunta "¿quieres que revise?": si el predicado ya levantó la señal, esa pregunta tiene una sola respuesta posible y sólo agrega fricción.

**Agregación:** la misma de `§4.6` (`POL-001` — `risk = máximo`, `require = unión ∪ panel_by_risk[risk]`, kit ∪ override), más las señales plan-time de [`fx-execution-policy §6`](../fx-execution-policy/SKILL.md).

🔴 **Los dos insumos NO son la misma lista, y la diferencia es deliberada:**

| Qué se computa | Sobre qué lista | Por qué |
| --- | --- | --- |
| **El riesgo** (y con él el panel) | la enumeración **cruda** del bullet `Files to create/modify` — sin el filtro de §2.1 | el sesgo conservador es la dirección segura para **autorizar** y la dirección **insegura** para revisar: una entrada `CONDICIONAL` sobre `src/lib/auth/**` no debe producir riesgo bajo ni dejar el plan sin revisor. Si el issue lo menciona, entra al cálculo del riesgo |
| **`sensitive_paths_authorized`** | la lista **filtrada** de §2.1 | ahí sí: lo que no es seguro autorizar, no se autoriza |

Sin esta distinción, el filtro de §2.1 se propagaría al panel y CP-A narraría al user un riesgo **menor** que el real. El sesgo protege la autorización; nunca debe recortar el escrutinio.

**El `risk_resolved` del `EPIC-PLAN` se escribe en este paso**, con el nivel, las reglas o señales que lo produjeron (con su origen `kit`/`proyecto`, mismo formato de narración que `§4.6`) y los revisores que efectivamente corrieron.

**Del panel resuelto corren sólo los revisores cuya lente aplica a un plan** — subconjunto **declarado y cerrado**, nunca un juicio por corrida:

| Revisor | Plan-time | Por qué |
| --- | --- | --- |
| `architect` | ✅ riesgo ≥3 · **o** `meta-foundation` · **o** el piso en prosa (abajo) | juzga decisiones de diseño, que es exactamente lo que un plan contiene |
| `security-auditor` | ✅ cuando **el panel resuelto lo traiga** — es decir `require` de las reglas que matchearon **∪ `panel_by_risk[risk]`** | un plan que enumera server actions, rutas de API o schema tiene superficie que modelar. Se enuncia sobre el **panel**, no sobre las reglas sueltas: hay reglas con `require: []` cuyo nivel lo convoca vía `panel_by_risk` (p.ej. la de `.claude/settings.json`, riesgo 4) — mirar solo el `require` lo dejaría fuera justo en la frontera de autorización del agente |
| `quality-engineer` | ❌ | verifica tests, build y AC cumplidos — sobre un plan no tiene objeto, y un revisor sin objeto produce el ruido que invalida un gate |
| `ui-critic` | ❌ | revisa UI renderizada; no existe todavía |
| `fx-factory-reviewer` | ❌ | audita el artefacto **como quedó escrito**: su batería de checks lee el archivo (frontmatter, `description`, cuerpo, `tools`, solapamiento contra el catálogo vigente), y el `EPIC-PLAN` es la narración de 1 pantalla del plan, no el artefacto del kit. El `evolution-plan` de su `artifact_type` es un RFC/masterplan entregado como `artifact_path` — no el plan de este workflow. Su objeto real, el diff bajo `.claude/**`, lo revisa en el gate del cierre (`§4.6`). **Decisión escrita, no heredada por omisión** |

🔴 **El predicado de `security-auditor` sale del registry, NUNCA de una descripción en prosa.** Escribirlo como "auth, permisos o base de datos" **quitaría** un revisor que el registry ya exige por nombre para `src/lib/actions/**`, `src/app/api/**` y las rutas de `cli/src/**` + `scripts/tools/**` — ninguna de las tres es auth, permisos ni base de datos. Eso sería la reducción de cobertura en riesgo alto que [`fx-execution-policy §5`](../fx-execution-policy/SKILL.md) prohíbe.

🔴 **El recorte aplica al panel del KIT, nunca al del proyecto.** El panel plan-time es este subconjunto **∪ lo que el override del proyecto agregue en ese nivel** ([`fx-execution-policy §4.2`](../fx-execution-policy/SKILL.md): el override sólo endurece). Sin esta línea, un derivado que endurece su panel obtendría un no-op plan-time sin enterarse — el "endurecimiento sin efecto" que esa sección existe para impedir.

> **La colisión, resuelta explícitamente:** las dos reglas de arriba se tocan cuando un proyecto pide **justo uno de los dos que el kit excluye por lente** (`quality-engineer` / `ui-critic`). **Corre.** El recorte por lente es un criterio sobre el panel **del kit**, no una prohibición universal: quien escribió ese override sabe algo de su proyecto que el kit no sabe, y "el override sólo endurece" no admite excepciones tácitas. El costo —un revisor con poco que mirar en ese proyecto— lo asume quien lo declaró, y es preferible a un endurecimiento que no surte efecto y del que nadie se entera. Se declara aquí para que no se lea como una contradicción entre las dos reglas.

**🔴 El piso aditivo en prosa — no se retira.** El criterio que esta fase tenía (*"schema nuevo / **patrón no documentado** / decisión irreversible que amerite ADR"*) **sigue vigente** y sólo puede **agregar** a `architect`, nunca quitarlo. Verificado: de sus tres casos, el registry cubre bien "schema nuevo", y **ninguna regla ni señal captura "patrón no documentado"**. Presentar el reemplazo como "prosa → predicado" sería en realidad "prosa → predicado **más chico**".

> **`no-adr` — declarada, no computable todavía.** La señal se define como "el issue declara una decisión arquitectural **sin campo ADR**", y ese campo **no existe** en el shape de issue del kit (verificado: cero ocurrencias en los templates y la metodología de `tk-backlog`; tampoco hay directorio de ADRs). Hasta que exista, el eje que cubría lo sostiene el piso en prosa de arriba. La señal **no se retira** del registry — se deja declarada con esta razón escrita, y crear el campo es trabajo aparte: no es "agregar un campo", exige decidir de dónde sale, qué issues sí lo requieren y cuáles no, cuál es la señal que lo decide y quién lo llena — lo que toca `/backlog` **y** `/discovery`.
>
> `meta-foundation` **sí** es computable y **sí** se evalúa aquí: el grafo `depends_on` existe en cada issue del backlog.

**Skills que cada revisor plan-time cita en su prompt** (`CC.md §2` — paths repo-relative, obligatorio):

| Revisor | Skills |
| --- | --- |
| `architect` | `.claude/skills/fx-execution-policy/SKILL.md` · `.claude/skills/kb-ssot-registries/SKILL.md` |
| `security-auditor` | `.claude/skills/sk-security/SKILL.md` (la escala de severidad y el shape del finding viven en su propio card, `.claude/agents/security-auditor.md`) |

**Mapeo de escala nativa + shape del hallazgo — declarados aquí para los dos revisores plan-time** (*quien detecta clasifica*, `§4.7.1`). [`tk-backlog §12.5`](../tk-backlog/SKILL.md) ya los declara para los suyos — y `architect` es revisor en ambos paneles, así que tenerlos escritos allá y no acá era una asimetría verificable dentro del kit. El **shape pedido en el prompt** es el mismo de §12.5: hallazgos con **clase + claim + `{consulta: …}`** — la consulta corrida, clase de evidencia cerrada de [`fx-execution-policy §7`](../fx-execution-policy/SKILL.md); sin consulta citable el segmento se omite, nunca se inventa:

| Revisor | Escala nativa | Mapeo pedido |
| --- | --- | --- |
| `architect` | tabla de opciones + `ADR requerido: Sí/No` (su ficha no declara severidad) | supuesto falsado contra el repo o pieza faltante → `rompe` · defecto no bloqueante → `está mal` · lo que exija elegir (incl. `ADR requerido: Sí`) → `decisión` |
| `security-auditor` | severidad por finding: `Critical / High / Medium / Low` (su ficha manda reportar SIN severidad la hipótesis sin ruta de ataque concreta) | `Critical`/`High` → `rompe` · `Medium`/`Low` → `está mal` · lo que exija elegir entre alternativas legítimas → `decisión` · finding sin severidad (hipótesis, per su ficha) → `está mal`, nunca gatea |

El orquestador puede re-clasificar, nunca en silencio: `{origen} → {final} · {motivo}` se registra y se muestra en CP-A junto al ítem (misma regla que §12.5).

**Carry-over del panel de `/backlog` — consumo de la sección `## Plan Review` del epic file.** Si el epic nació o se extendió por plan-mode, `/backlog` estampó en el epic file una o más secciones **`## Plan Review (Phase 3.5 — {ISO 8601 UTC})`** (productor: [`tk-backlog §20`](../tk-backlog/SKILL.md) Phase 8; shape SSOT: [`epic-shape.md`](../tk-backlog/methodology/epic-shape.md) §Plan Review append). Phase 2 las localiza con `grep` anclado al heading —el timestamp distingue estampados repetidos— y las consume ANTES de spawnear:

- **Intersección por alcance, nunca sección entera:** cada sección declara en `Cubre:` los issues que su panel revisó. Se intersecta contra el SELECTION SET: lo cubierto entra al carry-over; **lo NO cubierto lo mira `architect` con ojos frescos** (caso normal: un epic de discovery extendido por `extend-epic` adquiere una sección que cubre sólo la extensión); y **CP-A narra la diferencia** ("del set, N issues pasaron por el panel de /backlog; M no").
- **Qué entra al prompt de `architect` como *"ya resuelto — no re-levantar"*:** SOLO las filas hallazgo con `status: resolved` — que por contrato del productor significa *una re-corrida del panel no volvió a levantarlo* (regla de derivación de [`tk-backlog §12.5`](../tk-backlog/SKILL.md) §Carry-over: se deriva de una re-pasada, nunca de una afirmación). Cada una viaja con su `query_run`, verificable ítem por ítem — nunca un booleano "ya revisado". Las filas `live` y `dismissed` cruzan **como contexto**, no como resuelto.
- 🔴 **`gate_decisions` cruza siempre, con predicado de frescura — y la rama degradada es el default.** Cada entrada trae el `Decomposition hash` vigente al resolverse. Se presenta como "ya resuelto" **sólo si** el predicado de drift verificó los paths que ese hallazgo tocaba — y lo que ese predicado mide es **existencia, nada más** (§2.0: un path reescrito en su lugar pasa), así que la rama afirma exactamente eso y nunca "ausencia de movimiento"; con drift, llega como contexto (*"el user descartó esto, y el repo cambió"*), nunca como silencio. 🔴 **El predicado ES el de Phase 2.0 (§2.0):** la rama "ya resuelto" consume su veredicto — la entrada se presenta como resuelta **sólo si** §2.0 corrió sobre los paths que ese hallazgo tocaba y no encontró discordancia de existencia (drift). Si alguno de esos paths quedó **fuera** del predicado (bullet no parseable, path que los issues del set ya no enumeran), no hay veredicto que consumir y la entrada viaja **como contexto, nunca como "ya resuelto"**: el mismo fail-closed que la sección ausente. La rama está condicionada a que el predicado corra y responda sobre esos paths; si no, contexto, sin excepción.
- **Por qué `resolved` no lleva predicado de frescura (asimetría deliberada, no un hueco):** una fila `resolved` viaja con su `query_run` — el revisor del run actual puede re-correr esa consulta y detectar por sí mismo si el repo la invalidó; una decisión del user en `gate_decisions` no es re-derivable de ningún artefacto, así que **solo ella** necesita frescura externa. Es la diferencia entre evidencia re-verificable y juicio irrepetible. 🔴 **Y "decisión del user" son solo los tipos que lo son:** `component` (rama `justify` del test-gate) y `plan-review` (hallazgo que el user cerró en CP1). La entrada `design-spec` de esa misma lista **no** es una decisión —es el registro automático de la señal de diseño, sin user de por medio ([`tk-backlog/methodology/readiness-gates.md`](../tk-backlog/methodology/readiness-gates.md) §Phase 0.6)— y cruza como contexto: no hay juicio que refrescar.
- **Caveat de revisor caído (`status: failed`) → CP-A lo narra** si lo hubo: *"en /backlog cayó {reviewer}: su lente no revisó el plan"*. Un panel con caveat NO es un panel limpio, y callarlo aquí reabriría el fail-open que el productor ya cerró de su lado.
- 🔴 **Panel RECORTADO por presupuesto (`status: not-convened` + el campo `Presupuesto:` del encabezado) → cobertura parcial declarada, nunca cobertura completa.** El panel de `/backlog` deriva su composición del riesgo que su plan enumeraba ([`tk-backlog §24`](../tk-backlog/SKILL.md)), así que una sección puede traer lentes que **nunca se convocaron**. **Se leen igual que lo no cubierto por `Cubre:`: con ojos frescos** — sus preguntas no las hizo nadie, y el hallazgo que habrían levantado no existe en ninguna fila. CP-A lo narra junto a la diferencia de alcance (*"del set, N issues pasaron por el panel de /backlog, con {panel} — la lente de {reviewer} no se convocó allá y la mira {revisor de este run}"*).
  - **Las tres ausencias NO son la misma:** *lente que corrió limpia* (cero hallazgos, cobertura real) · *revisor caído* (`failed`, bullet de arriba) · *lente no convocada* (`not-convened`). Sin su fila propia, un revisor nunca convocado deja una sección **indistinguible de un panel limpio** — el mismo fail-open entrando por otra puerta. 🔴 **La fila `not-convened` viene calificada por fase** (`architect (Phase 7)`): el recorte del presupuesto es por fase, así que una misma lente puede haber revisado el plan y no los issues escritos — leerla sin la fase pone ojos frescos sobre la lente equivocada.
  - **Sección sin campo `Presupuesto:`** (estampada por una versión previa de `/backlog`) → **cobertura no declarada**: se trata como el caso de arriba para toda lente que no aparezca con hallazgos propios. Es el mismo default que la sección ausente, aplicado a una sección incompleta.
- 🔴 **La ausencia nunca se lee como "ya revisado":** epic sin sección (el 100 % de los preexistentes en el repo y la flota) = no hubo panel = cero carry-over, `architect` mira todo con ojos frescos. Es el default correcto, no un caso de error — misma regla que la línea `Refutado:` (`§5.2` / `tk-backlog` RF-prev).

**Qué pasa con lo que el revisor encuentre:**

- Los hallazgos se surfacean **en la narración de CP-A**, como bloque compacto — **no** dentro del `EPIC-PLAN`, cuyo contrato es "1 pantalla, audiencia = el user".
- 🔴 **Un hallazgo de clase `rompe` impide la opción 1 de CP-A** hasta ajustar el plan. Si el revisor corre pero su veredicto no gatea nada, es la misma alarma que sólo avisa, con más costo.
- **Tope del ciclo `plan → review → Ajustar → review`:** el re-spawn ocurre **sólo si el ajuste cambia el SELECTION SET o los paths que sus issues enumeran**. Un ajuste de orden, de grupos o de redacción re-presenta CP-A **sin** volver a revisar. Sin este tope, el único freno sería que el user dejara de elegir "Ajustar". (La regla de convergencia de `§4.7.8` **no** aplica aquí: su unidad es una pasada del cierre de `4.7.5`, que a plan-time no existe.)
- **Headless: resolver el riesgo primero y abortar ANTES de spawnear**, con la causa citada — mismo patrón fail-closed que `§4.6`. CP-A ya es fail-closed en headless, así que spawnear primero pagaría una revisión adversarial completa para después no ejecutar nada.

**Lo que este paso NO cambia:** el micro-gate de `§4.7.4` sigue siendo diff-time contra `sensitive_paths_authorized` — mismo comportamiento antes y después.

#### Modo adaptativo por tamaño (umbral declarado)

| Tamaño del SELECTION SET  | Modo                                                   |
| ------------------------- | ------------------------------------------------------ |
| ≤ 10 issues **y** ≤ 50 SP | **De corrido** — todos los issues sin pausa hasta CP-B |
| > 10 issues **o** > 50 SP | **Por grupos** — alto liviano entre grupos             |

> Umbral default: **>10 issues O >50 SP** → por-grupos. Parámetro de diseño documentado (no número mágico — `CODING.md §5` aplica a código). `K` (chunk de chain larga) ≈ 5 issues. Ajustables aquí, nunca escondidos en código.

### 🛑 CP-A — Aprobar el plan (Plan Mode formal)

HIGH-risk synthesis: aprobar el plan **autoriza toda la ejecución del epic**, incluidos los cambios en áreas sensibles. Plain language, 1 pantalla. Tabla de opciones:

| #   | Opción       | Acción                                                  |
| --- | ------------ | ------------------------------------------------------- |
| 1   | **Aprobar**  | Ejecuta el epic (de corrido o por grupos según el plan) |
| 2   | **Ajustar**  | Editar el plan (orden, scope, grupos) y re-presentar    |
| 3   | **Cancelar** | Termina — cero writes durables                          |

Tras aprobar, **persistir el `EPIC-PLAN`** en `project/implement-artifacts/{run-id}/epic-plan.md` con frontmatter YAML:

```yaml
---
status: in_progress
hash: <input-hash-first-12>
run_id: <timestamp-slug>
---
```

El hash de inputs (epic + issues + topology + skills + status) vive **en el frontmatter del propio plan**, no en archivo aparte. El resume (`--start-at`) lee `hash:` del frontmatter y **salta CP-A solo si coincide**; si algo cambió upstream → re-plan + re-CP-A.

> **Migration grace para path legacy** (`.claude/transitions/{run-id}/epic-plan.md`): si Phase 0 no encuentra el plan en `project/implement-artifacts/`, busca el último `.claude/transitions/*/epic-plan.md` por mtime y lo migra al path nuevo con `mkdir -p` antes del `mv`. Mensaje plain: "Plan migrado de path legacy. Run-id: ABC". Vive hasta próxima revisión del kit.

> Mecanismo Plan Mode formal: ver `fx-workflow-authoring §7` (CP2). Si las primitivas de Plan Mode son deferred en el runtime, cargarlas antes de CP-A.

### Phase 3 — Execution (SERIAL)

Serial de punta a punta: **un executor a la vez**, en el mismo repo, en el orden del plan. Lo que el orquestador compone es **cuántos issues lleva cada spawn**.

#### Composición del lote (orquestador, antes de spawnear)

Issues **consecutivos dentro de una misma cadena** que comparten su archivo principal se agrupan en **un** spawn. El resto va solo — el comportamiento de siempre, y el fallback de todo lo que no califique.

**Por qué.** Un epic puede tener nueve issues sobre el mismo archivo de miles de líneas. En spawns separados cada executor lo lee de cero y ninguno vio el razonamiento de los anteriores, así que el kit termina compensándolo a mano: hay issues cuya especificación dice literalmente _"va al final de la cadena para releer el código as-built en vez de asumirlo"_. Eso es el síntoma, no la solución. Un executor que recibe el lote lee el archivo **una vez** y ve la evolución acumulada — más rápido y con mejor contexto, no una cosa a costa de la otra.

**Límites del lote** — ajustables aquí, nunca escondidos en código. Si alguno se excede, se parte:

| Límite                              | Valor  | Por qué                                                                       |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------- |
| issues por lote                     | **≤4** | por encima, el summary del executor (5-8 líneas × N) deja de ser un resumen   |
| story points sumados                | **≤13** | el presupuesto de contexto de un executor, no una medida de esfuerzo humano   |
| un issue de effort **L** (≥8 SP)    | va **solo** | ya satura un spawn por sí mismo                                          |

**Reglas duras** (violarlas rompe el orden del plan aprobado en CP-A, no solo el lote):

- Un lote vive dentro de **una** cadena — nunca cruza cadenas ni mezcla un `parallelizable` con una cadena.
- Solo issues **consecutivos** en el orden global. Un hueco parte el lote.
- Nunca a través de un alto de grupo (§Modo adaptativo) — el alto es el punto donde el user puede intervenir.
- Un issue de revisión visual (path con el segmento `-ui-critic-`) **nunca entra a un lote**: parte el lote y lo ejecuta el orquestador spawneando `ui-critic` él mismo, porque el executor no tiene el Agent tool (§4.4).

#### Ciclo por lote

1. **[executor `imp-issue-executor`]** spawn (aislamiento de contexto, §11) con la **lista ordenada** de issues del lote + sus refs + **el allowlist de skills POR ISSUE, podado** + sus `DoR Waivers`. **Poda del allowlist (orquestador, antes de spawnear):** por cada issue, tomar su `> **Skills:**`, quitar toda `kb-*` cuya `sk-*` hermana esté en la lista y exista en `.claude/skills/` de este repo (issues emitidos antes de 2026-09-22 traen esas parejas; una `kb-*` que ya no exista en `.claude/skills/` también sale), quitar `sk-project-structure` (regla always-on), y truncar a **3** conservando el orden — la primera es la `sk-*`/`pj-*` del archivo principal del issue y es **obligatoria**. Se pasa como `skills_by_issue`, nunca como unión del lote: la unión es lo que producía listas de 5-8 que nadie leía (medido: `project/reports/skill-usage.mjs`). El executor: lee la primera skill de cada issue antes de su primer Edit → escribe **solo** código/tests/migrations, **issue por issue en orden** → `pnpm verify` completo (lint+typecheck+test, **sin build ni e2e**) → si falla, loop acotado de fix con `pnpm verify:quick` en las vueltas (máx **N=3**) y `pnpm verify` completo cuando el quick pasa — y siempre antes de devolver OK; la economía es "2 completas + las acotadas", y el acotado nunca es el veredicto que cierra el lote (detalle del comando en [`imp-issue-executor` § Loop interno acotado](../../agents/imp-issue-executor.md)) → retorna **un summary + proposed Evidence por issue**. **No toca backlog docs, no commitea.**
   - **[orquestador — sync best-effort]** **solo si `BACKLOG_CENTRAL=on`** (preflight de §9): al spawnear, disparar `npx @timekast/factory backlog sync --issue {ID} --status in_progress` **por cada issue del lote** (fire-and-forget; guard de disponibilidad + never-gate en §9 → _Sync de status a backlog-central_). Su fallo nunca bloquea ni retrasa el spawn. Con `off` → no se invoca nada, sin nota por issue.
   - **[orquestador] gate de `Skills consultadas:`** al recibir el summary, por issue: si el issue editó `src/` (lo dice su `Archivos:` y lo confirma el diff del paso 2) y la línea falta, dice "ninguna" sin razón, o no contiene la primera skill de su `skills_by_issue`, el lote se rechaza — **un** re-spawn con la instrucción explícita ("lee X antes de tocar Y"); si vuelve igual, STOP al user. No es ceremonia: es la única señal de que el conocimiento del kit entró al código, y sin ella el allowlist de `/backlog` es decorativo.
2. **[orquestador] diff-ownership gate (hard):** `git diff --name-only` vs la **unión** de los files esperados del lote (de `§6 Contexto Técnico` de cada issue + sus tests/migrations). Archivos inesperados → STOP. Si el `§6` de algún issue falta o es impreciso → STOP para aclarar.
   - 🔴 **Un fallo rojo que llegue reportado como «pre-existente» o «ajeno al trabajo» se atribuye contra el rango de commits de ESTE run antes de aceptarlo.** El executor sólo ve sus propios archivos —su contrato le acota el alcance a propósito—, así que un commit del **orquestador** le queda estructuralmente fuera de vista. El orquestador sí tiene el rango completo: `git log --name-only {run-base}..HEAD`, sobre el archivo que falla.
     - **`{run-base}` es el commit base del run: el `HEAD` anterior al primer commit del epic.** El orquestador lo tiene desde que arranca la fase; si no lo anotó, se resuelve como `{primer-commit-del-epic}^`. **No se usa `{start}` aquí:** ese nombre pertenece al `epic_metadata`, que se establece en Phase 4 y todavía no existe en este punto — citarlo dejaría el comando sin ancla resoluble justo cuando hace falta.
     - **Dentro del rango → el fallo NO se acepta como ajeno**: es defecto de este run, se atribuye al run y se corrige aquí, sin esperar al panel del cierre. **Fuera del rango → sí se acepta como ajeno.**
     - 🔴 **Archivo tocado ≠ causa, y el predicado por archivo solo no alcanza.** Un cambio en el archivo A que rompe un test en B deja a B fuera del rango, y quedarse en «el archivo que falla no aparece» **licenciaría** aceptar como ajeno exactamente el fallo que esta regla existe para atrapar. Así que: un fallo **fuera del rango por archivo, pero cuyo test ejercita código que el rango sí tocó** (lo importa, lo renderiza, lo invoca por su superficie pública) **tampoco se acepta sin mirar** — se abre el test, se ve qué ejercita, y recién ahí se decide.
     - El resultado de la verificación se declara en el resumen de cierre, en los dos casos. La regla atribuye el fallo; no prohíbe aceptarlo.
3. **[orquestador]** por **cada** issue del lote, en orden, el cierre completo de §9 B1 — Evidence → `✅ Done` + `Completed:` → fila del epic → **commit atómico** con `Closes: {ID}`, acotado con pathspec a los archivos de **ese** issue:

   ```bash
   git commit -m "<msg>" -- <archivos del issue> <su issue file> <epic file>
   ```

   Los flags van **antes** del `--`; todo lo que sigue es pathspec (`GIT.md §3.6.1`). Verificar con `git status` antes de cada commit, como siempre.

4. **[orquestador] residuo cero:** al cerrar el último issue del lote, `git status` debe quedar limpio. Un archivo sin commitear significa que el executor tocó algo que ningún issue del lote declaró — **es scope-creep y va a STOP**, igual que un archivo inesperado en el paso 2.

> **La atomicidad del commit nunca dependió de la atomicidad del spawn.** El kit ya separaba las dos cosas: el executor escribe y no commitea; el orquestador cierra y commitea (§9 B1). Un lote de tres issues produce **tres** commits atómicos con su `Closes:` cada uno, y `validate-commit.sh` los valida uno por uno igual que hoy. El pathspec del paso 3 y el residuo-cero del paso 4 son lo que mantiene esa separación honesta cuando un spawn cubre varios issues.
>
> 🔴 **Excepción declarada: dos issues del lote cuyo texto queda ENTRELAZADO en el mismo archivo.** El pathspec acota por archivo, no por hunk — si el trabajo del segundo issue quedó tejido dentro del del primero (típico en un archivo de prosa: la sección que escribe uno referencia la que introduce el otro), el diff completo viaja en el commit del primero y el del segundo cierra sólo con sus docs de backlog. **Antes de aceptar eso, intentar la atribución por hunks:** extraer del `git diff` los hunks de cada issue, `git apply --cached` los del primero, commitear sin pathspec, y repetir. Sólo cuando los hunks NO son separables —porque el texto de uno depende del otro para leerse— se cae al fallback. En ese caso **decláralo en el `## 11. Commits` de los dos issues**: sin esa nota, la trazabilidad `issue → commit` se lee como 1-a-1 y no lo es, justo donde se usa para auditar.

**Si modo por-grupos:** al cerrar cada grupo → **alto liviano** (resumen plain de lo hecho). En **fluido** (default) auto-continúa al siguiente grupo; en **`--step`** pregunta "¿sigo con el siguiente grupo?" antes de seguir. Si el user pausa (en `--step`, o interrumpe en fluido) → sugerir `/handoff` (`/handoff` detecta el `status: in_progress` del frontmatter del plan, registra el path activo en el header del transition, y `/continue` lo surface al resumir con `--start-at`).

### Phase 4 — Epic integration + QC report (loop acotado)

Loop de convergencia **acotado** (máx N=3; si no converge → escala a STOP):

**4.1 Wiring/integración cross-issue + checks integrados.** Orchestrator inline corre hasta verde **las compuertas que el criterio de alcance de abajo determina** — con diff de app, `pnpm verify` **completo** + e2e (`pnpm test:e2e`); build + e2e cierran el DoD que el verify por-issue no cubre. Cada comando redirige stdout+stderr a un temp file en `project/implement-artifacts/{run-id}/` (ya está en el cleanup canónico de Phase 5):

> 🔴 **Criterio de alcance — la compuerta de cierre corre la verificación que puede OBSERVAR el diff del epic** (`git diff --name-only {start-commit}..{end-commit}` — el mismo diff que 4.6 agrega contra el registry). *Diferentes tests, no cero tests*: el criterio refina **qué** corre, nunca lo vuelve opcional.
>
> | El diff del epic toca… | Compuerta obligatoria |
> | --- | --- |
> | `src/**` · `public/` · `types/` · `tests/e2e/**` · el tooling de e2e (`playwright.config.ts`, `scripts/tools/e2e-runner.ts`) | **build + e2e completos**, además del verify — la regla de este paso, **intacta**: esto es un refinamiento del alcance, no un aflojamiento |
> | `scripts/**` o `tests/**` | **`pnpm verify` completo** — hay código ejecutable y unit tests que sí observan ese diff; el e2e no lo ve |
> | `.claude/**` | **`pnpm verify` completo + los linters del cerebro** (`pnpm skill:lint` + el hook de taxonomía de agentes, `.claude/hooks/agent-taxonomy-lint.sh`) — las compuertas que sí leen prosa normativa. Fila autocontenida a propósito: un diff brain-only produce verify + linters por esta sola fila, sin depender del ejemplo del párrafo de abajo |
>
> Las filas se **suman** sobre el mismo diff (un epic que toca `src/**` y `.claude/**` corre todo). **Todo pase omitido se narra con su razón en el Implementation Evidence del epic** ([`fx-execution-policy §7`](../fx-execution-policy/SKILL.md), principio 1: omitir es legítimo; omitirlo en silencio no) — p.ej. un epic del cerebro sin una línea de `src/**` omite build + e2e **declarándolo**, y corre verify + linters igual.

> 🔴 **El e2e sube por escalera, no repite la suite completa en cada vuelta.** Una corrida paga branch de Neon + migración + build + arranque de servidor + Playwright + borrado de branch; en un repo real eso supera los 20 minutos. Repetirla entera para volver a descubrir que el mismo spec sigue rojo es el gasto más grande del workflow.
>
> 1. **Corrida completa.** Verde → termina aquí; es la ruta feliz y no cambia.
> 2. **Roja → iterar solo los specs que fallaron.** El runner reenvía sus argumentos a Playwright verbatim (`sk-e2e §1`), así que la vuelta de fix es `pnpm test:e2e <spec> --project=<fase>`. Máx **N=3**, el mismo tope de este loop.
> 3. **Corrida completa final, obligatoria.** Confirma que arreglar lo roto no rompió otra cosa. **Con el e2e fuera de CI en `develop`, esta corrida ES la garantía del epic** y no se negocia: ningún epic cierra sin un e2e completo verde.
>
> Honestidad sobre lo que la escalera **no** ahorra: si el fix tocó `src/`, el stamp del build cambia y la corrida acotada **sí** reconstruye. Ahorra la suite de Playwright y los dos arranques de servidor, no el build. Bajar también ese costo requiere una sesión de e2e persistente — trabajo aparte, no de este workflow.
>
> Registrar **cada** corrida por separado en `timings.jsonl` (`phase: e2e-run`, `ref: full` o los specs) — §9.

```bash
# ${ATTEMPT} = 1, 2, 3 — el número de vuelta de este loop acotado. El sufijo NO es
# cosmético: un path fijo hace que el reintento BORRE el log del fallo que lo motivó,
# y el QC report de 4.2 se queda sin la evidencia que tiene que citar.
#
# El `rc=$?; …; (exit $rc)` NO es adorno — no lo simplifiques a `; echo $? > …`:
#   · el `.exit` existe porque `quality-engineer` (4.2) corre DESPUÉS, en otro contexto,
#     y no puede observar el status de un comando que no ejecutó — sólo lee estos archivos;
#   · el `(exit $rc)` final devuelve el status REAL al que invoca. Sin él, el compuesto
#     termina en `echo` y sale 0 SIEMPRE, aunque el gate esté rojo — y quien corra esto
#     sin haber leído esta sección (un subagente, un revisor) lee ese 0 como verde.
# El subshell es lo que fija `$?` sin matar la sesión; `exit` a secas la cerraría.
pnpm verify > "project/implement-artifacts/${RUN_ID}/verify.${ATTEMPT}.log" 2>&1; rc=$?; echo $rc > "project/implement-artifacts/${RUN_ID}/verify.${ATTEMPT}.exit"; (exit $rc)
pnpm test:e2e > "project/implement-artifacts/${RUN_ID}/e2e.${ATTEMPT}.log" 2>&1; rc=$?; echo $rc > "project/implement-artifacts/${RUN_ID}/e2e.${ATTEMPT}.exit"; (exit $rc)

# El build de producción YA lo corre el runner de e2e (sirve el build con `next start`),
# así que un `pnpm build` suelto aquí sería el SEGUNDO de la misma corrida. Córrelo solo
# como respaldo, cuando el e2e no llegó a construir (p.ej. faltan credenciales de Neon):
# el DoD exige build verde, y sin este fallback un e2e abortado lo dejaría sin cubrir.
if ! grep -q "Build ready" "project/implement-artifacts/${RUN_ID}/e2e.${ATTEMPT}.log"; then
  pnpm build > "project/implement-artifacts/${RUN_ID}/build.${ATTEMPT}.log" 2>&1; rc=$?; echo $rc > "project/implement-artifacts/${RUN_ID}/build.${ATTEMPT}.exit"; (exit $rc)
fi
```

> 🔴 **No construyas por separado antes del e2e.** Además de duplicar el trabajo, con el
> runner viejo (`next dev`) dejaba un `.next` de producción que el dev server del e2e
> reusaba y se colgaba recompilando — en un derivado eso produjo tres fallas fantasma que
> costaron un rato de diagnóstico. El runner actual construye lo suyo y sirve ESE build,
> así que hay un solo dueño del directorio; mantenerlo así depende de no reintroducir el
> build suelto en la ruta feliz.

Honestidad: estos SÍ son buffers ephemeral en disk (legítimos, dentro del cleanup canónico). El QC report final NO va a buffer — vive solo en memoria del turn entre subagent y orchestrator append.

**4.2 QC report del epic.** `quality-engineer` (spawn) produce el QC report del epic (template `templates/EPIC-QC-REPORT.template.md`) — **solo report, NO fixes**. Los fixes los hace el orquestador/executor.

El subagent tiene `tools: Read, Grep, Glob, Bash` — **sin Write/Edit**. NO puede appendear al epic file directamente. El flow es:

1. Orchestrator spawns `quality-engineer` con prompt que incluye:
   - `epic_file_path`: path al epic file durable (informativo — el subagent NO escribe ahí).
   - `outputs_dir`: `project/implement-artifacts/{run-id}/` — el subagent lee **todos** los `verify.N.log` / `e2e.N.log` (+ `build.N.log` **si existe**) — la `N` más alta es el estado final, y las anteriores son la evidencia de los intentos que fallaron, que el report debe citar en vez de darlos por perdidos — con `tail -50` + los `.exit` files para exit codes. En la ruta feliz **no hay ningún `build.N.log`**: el build de producción lo hace el runner de e2e y su evidencia vive dentro del `e2e.N.log` (línea `Build ready`). Su ausencia NO es un gate faltante.
   - `acceptance_criteria_per_issue`: lista de ACs de cada issue del epic.
   - **Paths de skills** (`CC.md §2`, obligatorio): `consulta antes de empezar: .claude/skills/sk-testing-nextjs/SKILL.md, .claude/skills/fx-execution-policy/SKILL.md, .claude/rules/DOR_DOD.md`.
   - `epic_metadata`: epic ID, slug, start/end commits.
   - **`debt_classification`:** pedir que **cada hallazgo de `### Hallazgos` venga con su clase** — `rompe` (test rojo / build roto / AC con verificación fallida), `está mal` (calidad con locus o consecuencia, sin romper nada), `cosmético` (el fix no cambia ninguna ruta de ejecución — prueba mecánica en 4.7.1), `mejora` (funciona y nada lo exige: sin test rojo, sin comportamiento incorrecto, sin regla citable, sin vector — prueba de cuatro condiciones en [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md)) o `decisión` (hay dos caminos válidos y elegir no le toca al agente). Mapeo desde su escala nativa: `🔴 BLOCKER` → `rompe` · `🟠 HIGH`/`🟡 MEDIUM` → `está mal` **si trae locus o consecuencia**, si no `mejora` · `🟢 LOW` → `cosmético` **sólo si pasa la prueba de 4.7.1**; `mejora` si no hay locus ni consecuencia; si no `está mal` · cualquiera que exija elegir → `decisión`. 🔴 El prompt lo dice con estas palabras: *"un hallazgo que sólo dice que algo podría estar mejor, sin que nada lo rompa ni lo exija, es `mejora` — no lo infles a `está mal` para que se atienda"*. **Y junto a la clase, la consulta** (ranura de evidencia — 4.7.1): cada hallazgo trae, en la misma línea, el segmento `{consulta: …}` con el artefacto que lo exige (test rojo · línea de log · resultado de una búsqueda en el código — la clase de evidencia cerrada de [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md)); sin consulta citable el segmento se omite — nunca se inventa. Es el input de 4.7 y va **en el prompt**, no en el archivo del agent: `quality-engineer` es un keep genérico con consumidores fuera de este workflow.
2. Subagent corre su análisis y emite el **QC report markdown como output de su turn** — shape per `templates/EPIC-QC-REPORT.template.md`, empezando con heading `## QC Report (Phase 4 — {ISO 8601 UTC})`.
3. Orchestrator captura el output (texto markdown en memoria del turn) y appendea al epic file durable:

```bash
# ${SUBAGENT_OUTPUT} = lo que quality-engineer retornó.
# ${EPIC_FILE} = project/backlog/{LAYOUT}/epics/EPIC-NN-{slug}.md
printf '\n%s\n' "${SUBAGENT_OUTPUT}" >> "${EPIC_FILE}"
```

**Sin buffer ephemeral del QC report final.** Coordination step entre subagent output y orchestrator write vive solo en memoria del turn.

**4.3 Scope de Phase 4 = solo wiring / test / config cross-issue.** Si aparece un **AC incumplido** de un issue (cambio funcional) → NO se mete como "integración": entra a **4.7** con clase `rompe`, o se emite un issue nuevo si satisfacerlo exige una decisión.

> **Matiz declarado (4.7 deroga la ruta "reabrir").** Esta línea concedía dos salidas: reabrir/patchear el issue dueño, o emitir uno nuevo. **La primera se retira.** No porque el kit no pueda —puede: un segundo `Closes:` pasa el hook, un `Status` revertido mapea bien en `update-board`, y `epic-shape.md` contempla que un epic se reabra— sino por **contabilidad**: reabrir deja dos commits reclamando el cierre del mismo issue y un `Completed:` sobrescrito, sin que nada distinga cuál fue el cierre real. La trazabilidad `issue → commit` deja de ser 1-a-1 justo donde se usa para auditar. El fix va por el commit `Refs: EPIC-NN` de 4.7.5 y el AC recuperado queda en el QC delta. La segunda salida (issue nuevo) se preserva intacta.

**4.4 El issue `ui-critic` — issue normal en el ORDEN, spawn del orquestador en la EJECUCIÓN.** Si el epic es `ui_touching`, `/backlog` le pre-asigna su issue de revisión visual como tail de la cadena: corre en su turno de Phase 3 como cualquier otro y **el issue no se maneja aparte en Phase 4** — lo que sí hay en Phase 4 es un **re-check condicional** sobre el delta del fix-loop (4.7.5), un segundo punto de spawn que no reemplaza a este. Lo que "issue normal" **no** significa es "ejecutado por el executor genérico" — `imp-issue-executor` declara `tools: Read, Grep, Glob, Edit, Write, Bash`, **sin Agent tool**, así que no puede spawnear nada. El spawn lo hace el **orquestador**, que sí tiene la herramienta. Un AC que pida "correr `ui-critic`" dentro del executor es insatisfacible por construcción.

**Reconocimiento — mecánico, por el slug del archivo del issue.** `/backlog` codifica el rol en el **slug**, no en el ID (`{DOMAIN}-{NNN}-ui-critic-{epic-slug}.md`; el prefijo es grep-able a propósito — [`tk-backlog §21`](../tk-backlog/SKILL.md)). Al componer los lotes de Phase 3, el orquestador saca del batch **todo issue cuyo path contenga el segmento `-ui-critic-`**. Es un check de string sobre un path que el orquestador ya tiene en la mano, no un juicio de "este issue parece de revisión visual" — dos runs sobre el mismo epic resuelven idéntico.

En su turno, en vez de spawnear el executor:

1. **Produce la evidencia visual ANTES del spawn — condicionado a que el harness exista.** `ui-critic` lee código, no pantallas; sin evidencia renderizada su check multi-tema (DS4) sale **"no demostrado"**, nunca Pass ([`fx-visual-evidence`](../fx-visual-evidence/SKILL.md) · ficha del agente). El orquestador:
   - **Comprueba primero, invoca después** — y la comprobación es sobre el `playwright.config.ts` de ESTE checkout: **`Grep` sobre `playwright.config.ts` buscando `'evidence'`** (la tool dedicada, no un `Bash grep` — `CC.md §1.3`). ¿Hay coincidencia? → la fase está cableada. ¿Ninguna? → no lo está.

     ¿No está cableado? → **no se invoca nada, no se falla nada**: se sigue sin manifest y se anota "sin evidencia visual — el proyecto no declara la fase" en el Evidence del issue. Un derivado recibe el cerebro del kit pero **no** su `playwright.config.ts` ni su `tests/e2e/` (nacen congelados, `BR-FACTORY-006`), así que "la fase no existe" es el caso **normal** ahí, no una falla — y un artefacto del cerebro tolera el árbol donde aterriza. Remedio para el equipo, no para este paso: [`visual-evidence-adoption.md`](../../docs/retrofits/visual-evidence-adoption.md).

     > 🔴 **`pnpm test:e2e --help` NO responde esta pregunta, aunque lo parezca.** `formatRunnerHelp()` es puro y estático: renderiza el resumen de `--project` desde las constantes del kit, así que nombra `evidence` **en todo checkout**, cableado o no. Un probe contra ese texto siempre dice "sí existe" — la rama "el proyecto no la declara" nunca se toma, y en un derivado sin el retrofit se invoca el harness para que el runner lo rechace después. La búsqueda de arriba pregunta por el hecho que sí varía entre checkouts — es la misma comprobación que hace la Phase 0 de la guía de adopción (ahí escrita como un `grep` de shell, porque su lector es un humano en su terminal).

   - **¿Está cableado?** → `pnpm evidence:visual`. Escribe `tests/.evidence/<corrida>/manifest.json`, y `tests/.evidence/latest.json` apunta al más reciente.

     > **Reusar un manifest previo: sólo si su SELLO corresponde al código de ahora.** No hay tal cosa como "el manifest que dejó la corrida de e2e del issue": la fase es `optIn`, así que un `pnpm test:e2e` normal **no captura nada** ([`sk-e2e §1.7`](../sk-e2e/SKILL.md)) — el único manifest que existe es el de un `pnpm evidence:visual` explícito.
     >
     > La regla **se comprueba, no se recuerda**. El manifest trae `codeSeal`, que dice de qué **código** salieron las capturas — no de qué `HEAD` ([`fx-visual-evidence §2.1`](../fx-visual-evidence/SKILL.md)) — y trae también, en `codeSeal.inputs`, las rutas contra las que se midió. Así la decisión es un `jq` contra `git`, y **las tres condiciones miran el mismo conjunto de rutas**:
     >
     > ```bash
     > M="$(jq -r .manifest tests/.evidence/latest.json)"
     > jq -r '.codeSeal.codeCommit, .codeSeal.codeDirty' "$M"
     > git rev-list -1 HEAD -- $(jq -r '.codeSeal.inputs[]' "$M")     # el commit de código de AHORA
     > git status --porcelain -- $(jq -r '.codeSeal.inputs[]' "$M")   # ¿hay código sin commitear AHORA?
     > ```
     >
     > **Se reusa sólo si** `codeSeal.codeCommit` **es igual** al `git rev-list` de arriba **y** `codeSeal.codeDirty` es `false` **y** ese `git status` acotado sale vacío. Cualquier otra combinación — otro commit de código, un `codeDirty: true`, un `codeCommit: null`, o código sin commitear ahora — **se vuelve a correr**. Evidencia anterior al arreglo avalando el código posterior al arreglo es exactamente la afirmación falsa que este harness existe para impedir: sin el sello la regla es prosa sin nada contra qué comprobarse — `generatedAt` es un timestamp y el código no tiene ninguno.
     >
     > 🔴 **Un manifest SIN `codeSeal.inputs` no se compara: se recaptura.** Es un manifest de `timekast.visual-evidence/3` o anterior, sellado por `HEAD`. Y el riesgo no es sólo que le falte un campo: `git rev-list -1 HEAD --` **sin pathspecs** responde por el árbol entero y devuelve `HEAD`, así que el comando de arriba, corrido sobre un manifest viejo, daría una respuesta plausible a otra pregunta. Ante un manifest sin ese campo, no hay comparación definida.
     >
     > 🔴 **Las tres condiciones se acotan al MISMO conjunto de rutas, y ahí murió el costo que dolía.** Antes la tercera preguntaba por el árbol completo, así que **un plan de remediación suelto —que este mismo workflow deja sin commitear— bastaba para recapturar**, y arreglar sólo la igualdad de commit habría cerrado el issue con el reuso igual de imposible. Ahora las tres miran `codeSeal.inputs`: `src/`, `public/`, `types/`, los archivos raíz con los que se compila la app (`next.config.*`, `tailwind.config.*`, `package.json`, los lockfiles, …) y lo que el proyecto declare en `package.json#e2eBuildInputs`.
     >
     > 🔴 **Lo que NO se relajó: dentro de esas rutas se cuentan los archivos SIN TRACKEAR, en las dos puntas.** El `codeDirty` del sello los cuenta al capturar ([`fx-visual-evidence §2.1`](../fx-visual-evidence/SKILL.md), que ahí declara la decisión y su razón) y la tercera condición los vuelve a contar aquí. No es redundancia por descuido: Next.js resuelve `layout.tsx`, `template.tsx`, `loading.tsx` y `src/proxy.ts` **por convención**, así que **agregar** uno cambia lo que renderiza una superficie ya fotografiada sin que ningún archivo trackeado cambie — y `src/` está dentro del conjunto. Recapturar de más cuesta una corrida; reusar de más cuesta un veredicto firmado como `pantalla vista` sobre pantallas que ya no son las del código.
     >
     > ℹ️ **Fuera de un repo git** el sello sale `codeCommit: null` con su nota y el harness corre igual (degrada declarándolo). Ahí la comparación no existe: se captura de nuevo, que es el lado seguro.
   - **Si el harness corre y falla** (una superficie que no carga, un tema que no se aplica) → se trata como cualquier fallo de herramienta: se reporta en el Evidence y se sigue **sin** manifest. Nunca se inventa evidencia ni se marca DS4 como Pass por omisión.
2. **Spawn `ui-critic`** (keep — §11) sobre las pantallas del `## 2. Pantallas a auditar` del issue, **pasándole el path del manifest** (o diciéndole explícitamente que no hay) **y el commit de CÓDIGO contra el que se revisa** — el mismo `git rev-list -1 HEAD -- $(jq -r '.codeSeal.inputs[]' "$M")` de arriba, **no** `git rev-parse HEAD`. El agente tiene `Read`, `Grep` y `Glob` y **no** un shell: su operación es una igualdad entre el `codeSeal.codeCommit` que lee y el valor que le das, así que darle el `HEAD` lo haría comparar dos cosas distintas y degradar cada hallazgo `pantalla vista` sin motivo. Sin ese dato no puede verificar el sello y lo reporta como no verificable, que es su regla, no un descuido. Citando paths de skills (`CC.md §2`): `consulta antes de empezar: .claude/skills/fx-visual-evidence/SKILL.md, .claude/skills/sk-skins/SKILL.md, .claude/skills/kb-design-engineering/SKILL.md, .claude/skills/sk-tokens-neomorphism/SKILL.md`.
3. **Cierre §9 B1 igual que cualquier issue** — Evidence (verdict de compliance + scorecard) → `✅ Done` + `Completed:` → fila del epic → commit con `Closes: {ID}`. El diff-ownership del paso 2 de Phase 3 **no aplica**: no corrió executor y el issue no produce código (mismo matiz que el bootstrap declara para `SETUP-001`), así que el commit lleva sólo el issue file + el epic file.
4. Los **findings de compliance que fallen** salen por donde el propio issue lo declara (issues de fix vía `/backlog add`, referenciados en él), no por el fix-loop de 4.7.

Con **dos** issues de `ui-critic` pendientes (counter monotónico por `extend-epic` con UI), los dos corren en su orden normal de Phase 3, cada uno con su propio spawn.

**4.5** Cambios de integración legítimos → commit **separado** con footer `Refs: EPIC-NN` (no se meten en issues ya cerrados).

**4.6 Security audit del epic (condicional — gate que muerde).** Corre **después** del QC report de `quality-engineer` (4.2) y **antes** de CP-B. No reemplaza ni modifica el QC de 4.2 — es threat-modeling del código nuevo, no QA de logs.

- **Fuente única, leída en vivo: el registry del kit.** El orquestador lee `.claude/policy/quality-gates.json` **∪** `.claude/policy/quality-gates.project.json` (el override es opcional per-repo — su **ausencia es el caso normal**, sin warning) y agrega sobre **todas** las reglas que matchean el diff real del epic (`git diff --name-only {start-commit}..{end-commit}`, con start/end del `epic_metadata` de 4.2): `when.paths` contra los archivos tocados, `when.signal` contra las señales diff-time computables sobre ese mismo diff (`new-dependency` / `destructive-migration` / `combined-auth-schema` — definidas en [`fx-execution-policy §6`](../fx-execution-policy/SKILL.md); los path-sets de la última son `when.pathSets` de su regla, **kit ∪ override**, nunca una lista de la skill; las señales **plan-time** no aplican aquí porque no hay plan que leer en este momento — se evalúan en **Phase 2 §2.2**, no en `/backlog`, que quedó **exento** del registry, con la exención escrita en su propio `SKILL.md`). La agregación es la de [`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md), sus dos renglones, sobre lo que matcheó (kit ∪ override) — **la fórmula no se transcribe aquí**: una copia queda muda el día que esa sección gane un renglón. **Ni la lista de paths ni la tabla de niveles 0-4 se reproducen en este `SKILL.md`** — viven en el registry y en [`fx-execution-policy`](../fx-execution-policy/SKILL.md), la fuente que este gate consulta; ahí vive el detalle de reglas, señales y umbrales.

  > 🔴 **Registry ausente o inválido → aborta el gate con la causa citada, nunca "sin restricciones".** Un `.claude/policy/quality-gates.json` faltante o que no parsea como JSON válido no relaja el gate a "sin security audit" — se trata igual que un registry con reglas inconsistentes: el gate para, nombra el archivo y el motivo (falta / error de parseo), y el run **no** continúa a CP-B sin resolverlo. El override ausente, en cambio, **no** dispara esta condición — es el caso normal declarado arriba.

  > 🔴 **El registry se resuelve en DOS estados — el vigente y el pre-epic — y la agregación corre sobre ambos.** Un epic puede editar el registry mismo (es un archivo del kit); leído solo "en vivo", se gatearía con las reglas que él acaba de reescribir. Por eso el gate resuelve también el estado previo (`git show {start-commit}~1:.claude/policy/quality-gates.json`, y el override igual si existía) y agrega sobre la unión de ambos (`risk = máximo`, `require = unión`): **relajar el registry no surte efecto en el run que lo relaja; endurecerlo sí aplica de inmediato.** Estado previo **ausente** (el epic que crea el registry, o un override que nace en este run) = conjunto vacío para ese lado de la unión — no dispara el abort de arriba, que aplica al archivo vigente.

- **Panel resultante.** Si ninguna regla matcheó más allá del piso de `src/**` (riesgo 2, sin `security-auditor` en `require`) → **skip documentado** de `security-auditor`: 1 línea plain al user ("Security audit omitido — el diff del epic no matcheó ninguna regla del registry con `security-auditor` en su `require`") + nota del skip en el Implementation Evidence del epic (Phase 5). El resto del panel (`quality-engineer`, `ui-critic` si el epic es UI-touching) sigue su curso normal, fuera de este gate. **Principio rector** (`fx-execution-policy §5`): la escala **nunca reduce cobertura en riesgo alto** — riesgo 3 conserva `security-auditor` obligatorio para server actions, endpoints de API, schema y migraciones (las reglas correspondientes del registry — los globs exactos viven ahí, no aquí), y riesgo 4 **agrega `architect`** al cierre; el único recorte real de la escala está en riesgo 0-1.
- **Narración por regla, con origen — lo que el user ve.** Antes de continuar a CP-B (o al reportar el skip de arriba), el orquestador lista, en una línea compacta por cada regla que matcheó el diff: `` `{path o signal}` — riesgo {N} · revisores: {lista} — {origen} ``, donde `{origen}` es `regla del kit` si la regla vino de `.claude/policy/quality-gates.json` o `regla del proyecto` si vino de `quality-gates.project.json`. Es la vía por la que el mecanismo de override se auto-enseña en uso diario (`CC.md §3`) — sin esta línea el user ve el riesgo ya resuelto pero no de dónde salió cada aporte. El post-hoc de **4.8** reusa el mismo formato sobre su propio diff, cuando corre.
- **Modo y loop, del mismo registry.** Cada revisor del panel spawnea en el modo que declara el bloque `review` (`default_mode`, salvo que el agente esté listado en `informative` — `fx-execution-policy §4.4`) — el prompt de cada spawn lo declara explícito. La política de parada del fix-loop de 4.7 para el nivel de riesgo que este gate acaba de resolver (`clean_rounds` / `severity_floor`) es `review.loop_by_risk[risk]` del mismo registry; **4.7.8 la lee, no la redefine.**
- **Reconciliación con los R-tiers de `quality-engineer` (`fx-execution-policy §8.1`, sin duplicar su tabla aquí):** el `risk` que este gate resuelve es la **misma** escala que invoca la profundidad de verificación de `quality-engineer` — riesgo 2 → R1 (DoD + AC, ya cubierto por el QC report de 4.2), riesgo 3-4 → R2 (R1 + build + security scan + deps, ya cubierto entre el `pnpm verify`/`pnpm build` de 4.1 y el audit de este mismo gate). Este workflow no invoca R-tiers como un paso mecánico aparte — los satisface con las fases que ya corre. `R3` es exclusivo de `/preflight` y esta escala nunca lo invoca; las escalas de severidad de hallazgo (`Critical/High/Medium/Low`, `BLOCKER/HIGH/MEDIUM/LOW`) quedan intactas y ortogonales — clasifican lo encontrado, no lo cambiado.
- **Spawns del panel — el orquestador spawnea a CADA revisor que el panel resuelto exige y que no haya corrido ya **sobre este objeto**.** `quality-engineer` ya corre en 4.2 y `ui-critic` por su issue in-epic (§4.4) / re-check (4.7.5) — no se duplican. Los que este gate spawnea cuando el panel los incluye:

  > 🔴 **La deduplicación es por OBJETO revisado, no por "ya corrió en el run".** El objeto de este gate es el **diff real del epic**; el del panel plan-time de Phase 2 (§2.2) es el **plan**. Son cosas distintas y ninguna sustituye a la otra: un plan sensato puede ejecutarse mal, y un plan flojo puede ejecutarse sin tocar nada peligroso.
  >
  > Sin esta precisión la cláusula se leería al pie de la letra —`architect` "ya corrió" en Phase 2— y este gate lo **saltaría**: el epic cerraría con el plan revisado y **el código sin revisar**. No sería sumar una revisión, sería canjear una por otra. Aplica igual al post-hoc de **4.8**, que hereda la misma regla encadenada.


  - **`security-auditor`** (keep — §11), con prompt que cita los paths literales de skills (CC.md §2): `consulta antes de empezar: .claude/skills/sk-security/SKILL.md`.
  - **`architect`** (keep — §11), cuando `require` ∪ `panel_by_risk[risk]` lo trae (reglas de schema/deps/rules-del-kit, o riesgo 4): prompt adversarial con el contrato de 6 campos (`fx-workflow-authoring §8`), foco en la arquitectura del cambio (no la prosa), `consulta antes de empezar: .claude/skills/fx-execution-policy/SKILL.md, .claude/skills/kb-ssot-registries/SKILL.md`. Sus findings entran a 4.7 con la clase que él emite, igual que los del QC.
  - **`fx-factory-reviewer`** (agent factory-internal — §11), cuando `require` **∪ `panel_by_risk[risk]`** lo trae: la regla del registry para `.claude/**` (con `pj-*` exceptuado) lo pone en `require`, pero enunciarlo sobre `require` **solo** volvería un no-op silencioso el endurecimiento de un proyecto, que puede sumarlo por `panel_by_risk` (unión aditiva — [`fx-execution-policy §4.2`](../fx-execution-policy/SKILL.md)). Su objeto es el diff del epic sobre el **cerebro del kit** — skills, agents, rules, commands, `.claude/docs/`. Prompt adversarial con el contrato de 6 campos (`fx-workflow-authoring §8`) **más su input propio `artifact_type`, pasado explícito** por cada artefacto del diff (`skill | agent | rule | command | workflow | team-piece | evolution-plan`): el agente lo infiere del path si falta, y un `tk-*` inferido como skill declarativo se revisaría contra la doctrina de autoría equivocada. **Las skills que el prompt cita salen de ese `artifact_type`** (`CC.md §2`, sobre la tabla de doctrina de autoría condicional de su card): `consulta antes de empezar: .claude/skills/fx-skill-author/SKILL.md` para un skill declarativo (`kb-`/`sk-`/`fx-`/`pj-*`) · `.claude/skills/fx-workflow-authoring/SKILL.md` para un workflow `tk-*`, su slash command o un agent scoped a workflow · `.claude/skills/fx-execution-policy/SKILL.md` para el registro de política (`.claude/policy/quality-gates*.json`) o el criterio de riesgo/modelo que lo gobierna. Un diff que toca varios tipos cita la **unión** de esas skills, no una sola. Sus findings entran a 4.7 con la clase que él emite (mapeo en 4.7.1).
    - 🔴 **Los archivos del cerebro SIN doctrina de autoría propia también necesitan un `artifact_type`, y el enum no tiene uno para ellos.** `.claude/settings.json`, `.claude/hooks/**`, `.claude/docs/**` y el slash command de una skill declarativa llegan al gate por la misma regla `.claude/**`, y ninguno es skill, agent, workflow, team-piece ni evolution-plan. **Se pasan como `rule` o `command` según corresponda** (`rule` para `settings.json`, `.claude/hooks/**` y `.claude/docs/**`; `command` para el slash command), **sin skill de doctrina citada** — no existe una que los gobierne. El ancla del prompt es la **regla** que sí los gobierna: `CC.md §6` para `.claude/settings.json` (que además es el único path de `.claude/` en riesgo 4), `CC.md §6` para los hooks. Sin esta línea el bullet no sabe qué pasarle al revisor justo en la frontera de autorización del agente, y el `artifact_type` se infiere del path a la doctrina equivocada.
- 🔴 **Ranura de evidencia en los TRES prompts de este gate (`security-auditor`, `architect`, `fx-factory-reviewer`) — junto a la clase, la consulta.** Cada uno de los tres prompts pide que cada finding traiga, en la misma línea, el segmento `{consulta: …}` con el artefacto que lo exige (test rojo · línea de log · resultado de una búsqueda en el código — la clase de evidencia cerrada de [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md), SSOT del eje `evidenced`/`unevidenced`: aquí sólo se abre la ranura, el eje nunca se redefine). Sin consulta citable el segmento se omite — nunca se inventa. Dos matices por fuente, declarados allá y sólo citados aquí: los findings de `security-auditor` son **inertes al eje** (ensucian o gatean según su clase, citen o no citen consulta — cierre (a)), así que su ranura informa, nunca exime; y el objeto de `fx-factory-reviewer` es el cerebro (`.claude/**`), donde **la prosa ES la instrucción** y la regla incumplida siempre es citable (cierre (c)) — un hallazgo del cerebro sin consulta es `unevidenced` con todas las letras, no una víctima del formato.
- **Scope = SOLO el código producido en este epic** — NO el kit base ni epics anteriores (eso es audit de repo completo, fuera de este gate). El prompt incluye la misma lista de archivos que ya se usó para resolver el panel; el agent lee el contenido de esos archivos con Read.
- **Output esperado:** findings clasificados en la **escala nativa del auditor** — `Critical` / `High` / `Medium` / `Low` (definida en el agent card del `security-auditor`) — cada uno con qué/dónde/por qué/impacto/fix (shape per ese mismo card). Es la **única** escala de severidad que este workflow usa para hablar de findings: no se traduce a ninguna otra notación en ningún punto del run. **Pedir además la clase de 4.7** para los `Medium`/`Low` (`está mal` por default; `decisión` si el fix exige elegir entre caminos válidos) **y la consulta de la ranura de evidencia de arriba junto a cada finding** — va en el prompt, no en el archivo del agent (keep genérico con consumidores fuera de este workflow).

  > No confundir con la **prioridad del issue** (`P0`…`P3` del campo `Priority:` del backlog, `DOR_DOD.md`): eso ordena trabajo en el backlog y es un eje distinto. La severidad de un finding de seguridad es `Critical`/`High`/`Medium`/`Low`, punto.

- 🔴 **Gate de bloqueo (inequívoco):** si el output del `security-auditor` contiene findings de severidad **`Critical` o `High`**, el **CP-B (cierre del epic) NO avanza**. El run queda detenido hasta que cada finding `Critical`/`High` esté: (a) **resuelto** — fix + re-verify por la vía del fix-loop de 4.7 (commit de integración `Refs: EPIC-NN`, patrón 4.5; la ruta "reabrir el issue dueño" está retirada — §4.3); o (b) **documentado con aceptación de riesgo explícita** — el user la aprueba y la justificación queda escrita en el epic file junto al finding. No existe tercera vía: ignorar un finding `Critical`/`High` silenciosamente está prohibido. Findings **`Medium`/`Low` NO bloquean el cierre**, pero **tampoco quedan como contexto suelto**: entran a 4.7 con su clase y salen de ahí corregidos, convertidos en issue, o registrados fuera de frontera — nunca sin destino.
- 🔴 **Headless — riesgo ≥3 sin aprobador presente aborta, nunca auto-aprueba.** Si el `risk` que este gate resolvió es **≥3** y el run corre headless sin aprobador de ningún tipo → el gate **aborta con la causa citada** ("epic resolvió riesgo {N} vía {regla(s) que matchearon}; sin aprobador presente en headless, no avanza a CP-B") en vez de continuar solo. Precedente citado por nombre: el **abort del revisor caído de `/backlog`** ([`tk-backlog §12.5`](../tk-backlog/SKILL.md) — en headless un revisor que cae emite `plan_review_gate: blocked` y aborta, porque el caveat no tiene lector). No es el mismo caso que `GIT.md §3.5` (degrada el cierre de `/backlog` a commit-sin-push, avanza igual) ni que `tk-preflight:105` (degrada a "no dispara", omite en silencio) — los dos resuelven headless en la dirección **contraria** (avanzan/omiten en vez de bloquear) y no aplican como precedente aquí.
- **Trade-off aceptado:** este paso agrega tiempo/costo por epic. Es una decisión de pipeline consciente: threat-modeling real del código nuevo antes de cerrarlo vale más que la velocidad de cierre.

**4.7 Deuda del epic — recolección, triage y corrección.** Corre **después** de 4.6 y **antes** de CP-B — salvo su segunda pasada (**4.7.7**), que es justamente la que ejecuta lo que CP-B decidió.

Los pendientes llegan de **cuatro** fuentes durante el run, y ninguna tenía destino garantizado: lo que el executor reporta fuera de scope (§Phase 3), los `### Hallazgos` del QC report (4.2), los findings `Medium`/`Low` del security audit (4.6) y los del re-check visual (4.7.5) — las mismas cuatro que enumera la tabla de 4.7.1. 4.7 los junta, decide cuáles pertenecen al epic, corrige los que puede, y deja **todo** registrado. El principio ya existe en el kit para dos casos (4.3 con el AC incumplido, 4.6 con los `Critical`/`High`); esto lo generaliza al resto.

Las decisiones que el user toma en la tabla de CP-B entran **después** de esas cuatro, y el loop las ejecuta en el mismo run (4.7.7) — es la razón por la que un pendiente de decisión ya no deja el epic a medio cerrar.

**4.7.1 Recolección con clase de origen.** Cada fuente emite la clase del ítem — **quien detecta clasifica, no quien va a arreglar**. Se pide en el prompt del spawn (4.2, 4.6 y el re-check de 4.7.5), mapeando desde la escala nativa de cada agente:

| Fuente          | Escala nativa                          | Mapeo pedido en el prompt                                                     |
| --------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `quality-engineer` | `🔴 BLOCKER / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW` | BLOCKER → `rompe` · HIGH/MEDIUM → `está mal` **con locus o consecuencia**, si no `mejora` · LOW → `cosmético` **sólo si pasa la prueba** (abajo); `mejora` si no hay locus ni consecuencia; si no `está mal` · lo que exija elegir → `decisión` |
| `security-auditor` | `Critical / High / Medium / Low`       | Critical/High ya bloquean por 4.6 · Medium/Low **con vector concreto** (punto de entrada, ruta o config alcanzable en este repo) → `está mal`, salvo que exijan elegir · Medium/Low **sin vector** (hardening especulativo: *"considera endurecer X"*) → `mejora` · 🔴 **nunca `cosmético`** · 🔴 **fuente inerte al eje de evidencia** — ensucia o gatea según su clase, cite o no cite consulta (cierre (a) de [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md)) |
| `imp-issue-executor` | campo `Deuda detectada:` de su summary | emite la clase directamente (las cinco: incluye `[mejora]`)                    |
| `ui-critic` (re-check de 4.7.5) | `🔴 BLOCKER / 🟡 WARNING`         | BLOCKER → `rompe` · WARNING → `está mal`, o `cosmético` si sólo toca copy/espaciado sin cambiar comportamiento, o `mejora` si es preferencia estética sin regla del design system citable · un hallazgo sobre texto que el manifest trae como **decorativo declarado** (`notApplicable`) **no es hallazgo de ninguna clase** — el agente ya lo sabe por su card; si llega, se retira · lo que exija elegir → `decisión` |
| `fx-factory-reviewer` | `🔴 RED FLAG / 🟠 DRIFT / 🟡 GAP / 🔵 WARNING / ⚪ OMISIÓN / 🟢 INTEGRABLE CON FIX` | RED FLAG → `rompe` · **DRIFT → `decisión` por default, SALVO fix único** (abajo) · GAP / INTEGRABLE CON FIX → `está mal` · WARNING / OMISIÓN → `está mal` **si cita la regla que incumple**, o `cosmético` **sólo si pasa la prueba** (abajo), o `mejora` si no cita regla ni consecuencia · lo que exija elegir → `decisión` |

**Junto a la clase, cada fuente emite su consulta — la ranura de evidencia.** Los prompts de 4.2, 4.6 y 4.7.5 lo piden, y el card de `imp-issue-executor` lo declara: cada hallazgo trae, en la misma línea, el segmento `{consulta: …}` con el artefacto que lo exige (test rojo · línea de log · resultado de una búsqueda en el código). De ese texto emitido — nunca de un campo en un schema — se deriva el eje `evidenced`/`unevidenced`: prueba del locus, celdas, inercias y cierres viven en [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md), el SSOT — aquí sólo se abre la ranura, el eje no se redefine; su consumo está en 4.7.8. Sin consulta citable el segmento se omite — nunca se inventa — y el orquestador puede **promover** `unevidenced → evidenced` corriendo él la consulta (cierre (d)), nunca degradar.

🔴 **`DRIFT → decisión` es el default, no el mapeo completo — y sin ese recorte la clase neutraliza al revisor.** `decisión` queda **fuera del contador de convergencia** ([`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md): "nunca cuenta como ronda limpia ni como sucia"), así que un mapeo incondicional dejaría a un epic del cerebro convergiendo con **todo su drift sin resolver**. Y el propio catálogo de `fx-factory-reviewer` tiene la mayoría de sus filas en DRIFT, varias con **fix único y obvio ordenado por una regla del kit** — un path absoluto del dev en un archivo trackeado, identificadores en español, una versión hardcodeada. Ahí no hay dos caminos válidos.

- **DRIFT con fix único y obvio → `está mal`**: se corrige dentro del loop y **ensucia la ronda**. Casos canónicos: retirar un token histórico, sustituir un nombre de cliente por un placeholder genérico, corregir un identificador a inglés, quitar un path absoluto de un archivo trackeado.
- **DRIFT con dos caminos válidos → `decisión`**: va como fila a CP-B, el agente no lo cierra solo.

El orquestador **puede re-clasificar**, nunca en silencio: cada cambio se registra como `{origen} → {final} · {motivo}` en el QC delta (4.7.5) y se muestra en CP-B junto al ítem.

**La prueba de `cosmético` es mecánica, no un adjetivo:** el fix **no cambia ninguna ruta de ejecución** — copy visible, comentario, nombre interno sin consumidor fuera de su archivo, formato. *Si revirtieras el fix, ¿cambia el color de alguna prueba o algún comportamiento observable?* Sí → no es cosmético. Ante duda, **`está mal`**. Definición y cierres completos en [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md); aquí sólo el mapeo por fuente.

🔴 **Artefacto del cerebro (`.claude/**`): la prosa ES la instrucción** — el tercer cierre de la definición de `cosmético` vive con los otros dos, en [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md).

**La prueba de `mejora` también es mecánica, y es la de cuatro condiciones de [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md):** sin test rojo · sin comportamiento observable incorrecto hoy · sin locus de regla incumplida · sin vector de seguridad. Las cuatro a la vez → `mejora`: **no se corrige, no ensucia, no es fila** — va a `Observaciones (no son deuda)` del QC delta y ahí termina. Falla una → `está mal` y se corrige. 🔴 **La duda entre `está mal` y `mejora` se resuelve corriendo la consulta, no por adjetivo:** el orquestador intenta la promoción (producir el locus o la consecuencia); si la produce, es `está mal`; si no, es `mejora`. Un revisor que infla una `mejora` a `está mal` *para que se atienda* está haciendo exactamente lo que esta clase existe para impedir — y el prompt de cada spawn lo dice con esas palabras (4.2).

**4.7.2 Frontera — ¿el ítem es del epic?** Es del epic si cumple **al menos una**:

1. Rompe un **AC declarado del epic**, o
2. Es un **defecto en código que este epic escribió** — contra la **lista de archivos** del rango de commits de Phase 3, congelada al terminar esa fase (la lista, no el rango: una línea que 4.7 escriba dentro de uno de esos archivos sigue siendo del epic).

Lo demás **sale**: se registra en el QC delta y **NO bloquea el cierre**. Pero salir de la frontera **no decide si se arregla** — eso lo decide el tamaño del fix, igual que adentro: un ítem de fuera que sobrevive la refutación (4.7.2.1) y es **chico** (`S`/`M`) **se arregla en el run**, sin fila y sin preguntar, declarándolo en el resumen (*"fuera del alcance del epic, lo arreglé igual: N líneas en X"*). Sólo un ítem **grande** (`L`) **con consecuencia concreta** llega a la tabla de CP-B como candidato a issue; un `L` sin consecuencia, y todo lo que falle la refutación, va a `Observaciones (no son deuda)`. 🔴 **El epic de deuda por default se retira:** ya no existe un destino automático "issue" para lo de afuera — el issue se gana con tamaño **y** consecuencia, y lo escribe el user en CP-B.

🔴 **Antes de convertirse en fila de CP-B, cada ítem que sale pasa por un intento de refutación (4.7.2.1).** No es un paso simétrico al de dentro-de-frontera: lo que sale es, por definición, algo que este epic no escribió — el contexto caliente del run no basta para juzgarlo, hay que volver a mirar el repo.

🔴 **La recomendación de la fila se calibra por el costo y el riesgo del FIX, nunca por la frontera.** Un ítem fuera de frontera cuyo fix es trivial, seguro y verificable mecánicamente (pocas líneas, sin decisión de diseño, cubierto por la verificación del run) se recomienda **1 — hazlo así**, declarando que está fuera de frontera; «issue aparte» se recomienda solo cuando el fix es riesgoso, complicado, o alcance genuinamente nuevo que merece su propio spec. La frontera decide el **default del destino** y quién decide (el user) — no la recomendación: recomendar issue para un fix de una línea agrega la fricción exacta que la tabla existe para eliminar.

El corte importa porque "lo que el epic prometió" es un conjunto finito y conocido de antemano, mientras que "lo que se descubrió de paso" no tiene fondo — mezclarlos hace que un epic no cierre nunca.

> Ejemplo del límite: el epic construyó un formulario y su botón se rompe en móvil → es del epic aunque no exista AC de responsive (caso 2). "Falta una pantalla entera" → alcance nuevo, sale.

**4.7.2.1 Refutación de lo que salió de la frontera — ANTES de CP-B, no en Phase 5.** Anclar el filtro aquí, y no al emitir el handoff de 5.2, es lo que hace que cumpla su objetivo: lo de fuera ya es fila de la tabla de CP-B (arriba), así que un filtro corrido después de emitir llegaría cuando el user ya gastó la atención sobre la lista plana.

**Un solo spawn para los N ítems del run — nunca uno por ítem.** El agente es `quality-engineer` (keep, §11): ya corre en esta fase con mandato de juzgar si un hallazgo pesa, así que reusarlo evita instanciar un rol nuevo para el mismo tipo de juicio. Tools: `Read, Grep, Glob, Bash` — sin `Write`/`Edit`, el revisor lee el repo, nunca lo toca. El prompt cita los paths de skills (`CC.md §2`: `consulta antes de empezar: .claude/skills/fx-execution-policy/SKILL.md, .claude/rules/DOR_DOD.md`) y lleva el contrato de contexto de seis campos (`fx-workflow-authoring §8`): qué se hizo y por qué (el diff del epic + los hallazgos de 4.2/4.6), alcance exacto (los N ítems fuera de frontera + los archivos que cada uno declaró), restricciones del kit que aplican, líneas de ataque (las cinco preguntas de abajo), qué está fuera de alcance (diseñar el remedio — nunca: la quinta pregunta **dimensiona** el fix contra tres condiciones verificables, no lo planea), y la fase del proyecto (derivada mecánicamente, `fx-workflow-authoring §8`, nunca a mano). Sus rondas las acota la misma regla de convergencia de **4.7.8** (`clean_rounds`/`severity_floor` de `review.loop_by_risk`) — no se inventa un segundo contador.

**Cinco preguntas por ítem — cuatro sobre la afirmación, la quinta sobre su tamaño** — la doctrina completa (clase de evidencia, el corte "refuta la afirmación, no diseñes el remedio", el corte cerrado de tiers) vive en [`fx-execution-policy`](../fx-execution-policy/SKILL.md) § Refutación de deuda al cierre; aquí sólo se ancla el momento y el destino:

| Pregunta                      | Si falla                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------ |
| ¿Existe?                       | se **retira** a Observaciones, con su motivo y la consulta que lo refutó     |
| ¿Es nuevo?                     | se **retira** a Observaciones como duplicado, citando quién lo posee         |
| ¿Importa?                      | se **retira** a Observaciones: sin consecuencia concreta es una observación, no deuda |
| ¿Qué prioridad, y por qué ésa? | se emite con la prioridad que el revisor pueda defender, no con la que traía |
| ¿Cuánto cuesta el fix?         | se emite el tier `S`/`M`/`L`; `L` **nombra qué habría que construir** (pantalla, entidad, flujo, endpoint) — sin eso el dato es inválido y se pide de nuevo |

La refutación **re-deriva el alcance contra el repo**: cada sobreviviente registra la consulta que corrió (el grep, el test, el comando) — no solo lo que encontró. Es lo único que distingue haber buscado de haber copiado el texto del ítem cuando el alcance declarado ya era correcto.

🔴 **El tier decide el camino del sobreviviente, y lo decide aquí:** `S`/`M` → entra al fix-loop de 4.7.3 como cualquier `está mal` y se arregla en el run — **no es fila**. `L` con consecuencia concreta ([`fx-execution-policy`](../fx-execution-policy/SKILL.md) § Refutación) → fila de CP-B con recomendación **issue**, y la consecuencia escrita en la celda `Por qué`. `L` sin consecuencia → Observaciones. El tier —y para `L`, lo que habría que construir— se registra en el QC delta (4.7.5), junto a la clase y el destino. **Un fix chico que exige tocar un área sensible, agregar una dependencia o reescribir un AC no sube a `L`:** pasa por su confirmación de un clic ([`fx-execution-policy`](../fx-execution-policy/SKILL.md) § Refutación) y con el "sí" se cierra en el run; **un fix chico al que le falta la prueba, la construye** — el loop escribe el test, el e2e o la migración y lo pone verde.

🔴 **El filtro RETIRA, no pre-marca — y el registro es el control.** Un ítem que falla cualquiera de las tres primeras preguntas **no llega a la tabla de CP-B**: va a la sección `Observaciones (no son deuda)` del QC delta con su motivo y la consulta que lo refutó. CP-B muestra sólo el **conteo** (*"el filtro retiró N pendientes; están en el QC delta"*) y el user puede **rescatar cualquiera nombrándolo** en la opción **Revisar** — entra entonces por el camino normal (fix si es chico, fila si es `L` con consecuencia). Presentar cada retirado como fila con campo de texto para confirmar el descarte era la fricción que volvía interminable el cierre. Esto **no deroga** el 🔴 de **4.7.3** ("el agente nunca descarta deuda por su cuenta"): retirar no es descartar — descartar borra; retirar registra donde se puede volver a mirar, y lo retirado **no era deuda** (no existe, ya tiene dueño, o no tiene consecuencia).

**Lo retirado queda en el QC delta con su motivo.** El mensaje de cierre es conversación efímera; el QC delta es tracked y sobrevive al cleanup de Phase 5. Es lo que hace auditable al filtro (¿retira bien? ¿retira de más?) y lo que permite rescatar un retiro equivocado después de este run.

ℹ️ **Esto encarece el cierre del epic que lo paga, a cambio de la atención que no se gasta del otro lado.** El spawn agrega una vuelta al cierre; se acepta a propósito — el ahorro está en la atención que el user ya no gasta sobre pendientes ruidosos o duplicados.

Edge cases:

- **Cero pendientes fuera de frontera** → esta sub-fase no corre; CP-B se comporta como hoy.
- **Todos los pendientes de fuera retirados o arreglados** → CP-B lo declara explícito en una línea ("de los N pendientes fuera del alcance, arreglé A y retiré B — ver QC delta") en vez de omitir la sección: el conteo es la evidencia de que el filtro corrió.
- **Un ítem sin ningún archivo derivable** → no viaja al handoff (el gate N2 de `/backlog` abortaría la corrida). Se registra en el QC delta como no-emitible; nunca se emite vacío.

**4.7.3 Triage — por qué el ítem no se podría arreglar solo** (no por el área que toca; ese criterio dejaría sin arreglar cosas que rompen y son obvias):

| Clase                       | Definición — evidencia mecánica, no adjetivos                                          | Qué se hace                          |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| **Rompe**                   | test rojo, build roto, o AC con verificación fallida **citada del QC report**            | **Se corrige** (ver 4.7.4)           |
| **Está mal pero no rompe**  | hallazgo de calidad, o un finding `Medium`/`Low` del audit, dentro de los archivos congelados | **Se corrige**                   |
| **Cosmético**               | el fix no cambia ninguna ruta de ejecución (copy, comentario, nombre interno, formato) — prueba en 4.7.1 | **Se corrige**, y **no ensucia la ronda** (4.7.8) |
| **Mejora**                  | funciona y nada lo exige: sin test rojo, sin comportamiento incorrecto, sin regla citable, sin vector — las cuatro a la vez ([`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md)) | **NO se corrige, NO es fila, NO es issue.** Una línea en `Observaciones (no son deuda)` del QC delta |
| **Necesita una decisión**   | dos caminos válidos con consecuencias distintas                                          | **Chica (`S`/`M`): el agente elige, la aplica en el run y la declara en el resumen con la alternativa.** **Grande (`L`, alcance nuevo): va como fila a la tabla de CP-B** — el destino lo fija la respuesta del user y 4.7.7 lo ejecuta. Un AC mal escrito, una dependencia o una columna nueva **no** son decisiones grandes: son confirmaciones de un clic ([`fx-execution-policy`](../fx-execution-policy/SKILL.md) § Refutación) |

- **Sin tope de cantidad.** El `N=3` es de **reintentos por ítem**: si un fix concreto falla 3 veces, ese ítem pasa a issue **como recomendación de su fila en CP-B** y el loop **continúa con los demás**. El destino final lo fija la respuesta del user, igual que el de un ítem clase `decisión` — es una propuesta, no un ruteo automático.
- 🔴 **Una decisión NO es un issue automático.** El agente no elige el destino de un ítem de esta clase: lo **presenta** como fila de la tabla de CP-B con su recomendación, y el user decide entre aplicar el fix (**1**), mandarlo a issue (**2**) o descartarlo con justificación (**3**). Mandarlo a issue de oficio es precisamente la fricción que la tabla existe para eliminar — el pendiente vuelve a leerse y agendarse en vez de resolverse donde ya está todo el contexto.

- 🔴 **Dos grados de decisión — la clase no se subdivide, la recomendación sí.** `decisión` sigue siendo **una** clase a todos los efectos del eje de severidad (4.7.8 la deja fuera del contador de rondas, sin cambios). Lo que se separa es qué se recomienda en su fila, porque *"tiene diseño detrás"* no es por sí solo razón para diferir:

  | Grado                         | Qué es                                                                                                                                              | Recomendación de su fila                                                                                                                                                                          |
  | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | **Decisión de una línea**     | los dos caminos se enuncian en una frase cada uno, y el elegido se implementa dentro del run                                                          | **No es fila.** El agente elige el camino, lo aplica en el run y lo declara en el resumen agrupado de CP-B bajo `DECIDÍ POR TI`, con la alternativa nombrada — el user lo revierte desde **Revisar** si no está de acuerdo. Elegir entre dos nombres, dos ubicaciones o dos defaults no necesita un issue ni una pregunta: necesita una línea |
  | **Decisión con spec**         | el camino elegido es alcance nuevo (`L`) — construir una pantalla, entidad, flujo o endpoint que no existe. Cambiar un AC o agregar una dependencia **no** son de esta clase: pasan por su confirmación de un clic y se cierran en el run | **Fila en CP-B.** Recomendación **2 — issue aparte** si además tiene consecuencia concreta; si no la tiene, Observaciones, y la fila no existe                                                    |

  El grado se **deriva**, no se opina, y se deriva del **tier**: `S`/`M` → decisión de una línea · `L` → decisión con spec. El tier lo trae 4.7.2.1 si el ítem vino de fuera de frontera, y lo asigna el triage con el mismo corte cerrado si vino de dentro ([`fx-execution-policy`](../fx-execution-policy/SKILL.md) § Refutación de deuda al cierre). 🔴 **El corte mide el fix, no dónde vive el defecto** — estar fuera de frontera no empeora el tier por sí solo; si lo hiciera, la frontera se contaría dos veces y ningún ítem de fuera podría recomendarse nunca como `S`.
- **El agente nunca descarta DEUDA por su cuenta.** Un ítem de deuda (`rompe` / `está mal` / `cosmético` / `decisión`) termina corregido, convertido en issue, o descartado **por instrucción de texto del user** en CP-B — y ese texto **es** la justificación que se escribe. Las dos primeras salidas puede tomarlas el loop; la tercera nunca.
- **Retirar (4.7.2.1) y registrar una `mejora` NO son descartes.** Lo que el filtro retira no era deuda (no existe, ya tiene dueño, o no tiene consecuencia) y una `mejora` tampoco lo es (nada la exige). Las dos van a Observaciones con su motivo, tracked, y se rescatan por nombre desde **Revisar**. La regla de arriba protege lo que hay que atender; no obliga a preguntar por lo que no.

**4.7.4 Micro-gate de área sensible — sólo lo que CP-A no autorizó.** Un fix que toca los paths sensibles de 4.6 y que el `EPIC-PLAN` **no declaró** para en el momento, con el diagnóstico y el fix ya resueltos:

```
⚠️  {qué se encontró, 1-2 líneas plain} Toca `{path}`, que el plan del epic no declaró.

    Lo resuelvo así: {fix propuesto en 1 línea}

| 1 | Autorizado, arréglalo    |
| 2 | Mándalo a issue nuevo    |
```

> **Presentación:** dos opciones excluyentes, sin campo de texto → estructuradas por default (`CC.md §3`); la tabla de arriba es el fallback sin la tool. **Headless: fail-closed** — el ítem va a issue y el fix NO se aplica (§8); no se intenta la tool.

- **No re-gatea risk por issue** (§3 ítem 1): los fixes de 4.7 **no son issues**, y el gate sólo dispara sobre áreas que CP-A nunca vio. Cae fuera de las dos condiciones de esa regla — que queda intacta.
- **Predicado determinista:** los paths sensibles del registry menos los que `sensitive_paths_authorized` declara en el frontmatter del `EPIC-PLAN`. **"Sensible" tiene definición cerrada: los paths de las reglas con `risk` ≥ 3** del registry ∪ override (en sus dos estados, per 4.6 — vigente y pre-epic), **menos el `exceptPaths` de cada una** (el recorte es parte del predicado, no un filtro aparte — [`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md)); el piso genérico `src/**` (riesgo 2) **no** micro-gatea. Nunca la prosa de "áreas sensibles" del cuerpo, que haría divergir dos runs sobre el mismo caso.

  > **Los dos gates se mueven juntos, por construcción.** 4.6 y este micro-gate leen el mismo registry — una regla nueva o un path agregado en el kit o en el override amplía la cobertura de los dos a la vez. Este micro-gate es **fail-closed**: cada path sensible fuera de lo autorizado produce un STOP, así que ampliar el set amplía los STOPs del run — es el trade-off ya aceptado en 4.6.
- **Fail-closed sin el campo:** un plan persistido que no lo traiga (corrida vieja, o el path legacy de la migration grace) → **todo path sensible micro-gatea**. Nunca se asume una autorización ausente.
- Es un **checkpoint** (STOP + tabla + espera respuesta) y se cuenta como tal en §8.

**4.7.5 Cierre de 4.7 — sin esto, CP-B presenta evidencia caducada** (`CODING.md §6`):

| Paso                | Qué                                                                                                                | Por qué                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Diff-ownership**  | check mecánico como el de Phase 3: archivos tocados por 4.7 ⊆ archivos congelados ∪ los declarados por cada ítem   | Phase 3 protege el scope con un check; 4.7 no puede hacerlo con adjetivos                                                                                             |
| **Commit**          | patrón 4.5: commit separado con footer `Refs: EPIC-NN`, **antes de CP-B**                                          | Árbol sucio rompe el invariante de Phase 5 y el pre-flight del siguiente run. Colar los fixes en `chore(backlog): close…` viola `GIT.md §3.1`                        |
| **Re-verify**       | `pnpm verify` siempre + `pnpm test:e2e` **si el predicado de abajo lo pide**, con la escalera de 4.1              | Un defecto introducido por un fix se detecta **dentro** del loop de ese ítem, no en una vuelta futura                                                                 |
| **Re-audit**        | re-correr 4.6 **sólo sobre el diff de 4.7**, si ese diff intersecta paths de reglas del registry cuyo `require` incluya `security-auditor`, o dispara una señal diff-time — predicado mecánico, como sus vecinos | CP-B tiene como pre-condición que 4.6 corrió sin `Critical`/`High` pendientes. Sin esto, código de auth entra sin auditar por el hueco que abre 4.7. El scope es el delta → barato |
| **Re-check visual** | re-spawnear `ui-critic` **sólo sobre el diff de 4.7**, si el predicado de abajo lo pide                             | El re-verify vuelve a mirar los tests y el re-audit la seguridad; sin este paso, un fix visual aplicado **después** del issue in-epic de `ui-critic` cierra sin ojo de diseño. Mismo principio de re-verificación sobre el delta → barato |
| **QC delta**        | **`quality-engineer` re-spawneado sobre el delta** emite `## QC Delta (Phase 4.7 — {ISO 8601 UTC})`; el orquestador lo appendea al epic file igual que en 4.2 | El QC de 4.2 describe un árbol que 4.7 cambió. **El re-spawn no es ceremonia:** si el veredicto lo escribiera el orquestador, el mismo actor que clasificó y aplicó los fixes emitiría el dictamen que supersede al del auditor independiente |

**El `pnpm test:e2e` del re-verify va gateado por un predicado mecánico, no por criterio.** El paso Re-verify corre siempre `pnpm verify`; el e2e solo cuando **puede** descubrir algo:

> Si el diff de 4.7 **no intersecta** los inputs del build stamp del runner (`src`, `public`, `types` — `sk-e2e §1.3`) **ni** el propio tooling de e2e (`scripts/tools/e2e-*`, `playwright.config.ts`, `tests/e2e/**`), la segunda corrida completa no puede observar nada distinto de la de 4.1 y **se salta**, dejando la razón escrita en el QC delta.

Las dos piezas ya existen y no hay que construir nada: el diff-ownership de la fila de arriba acota qué archivos entran, y el stamp del runner ya define qué cambia un build. Es determinista y auditable — dos runs sobre el mismo diff toman la misma decisión, que es justo lo que un juicio del tipo "si tocó algo que el e2e ejercita" no garantiza. Para un epic cuyos issues no tocan `src/` en absoluto, esto elimina una corrida completa de más de veinte minutos sin renunciar a ninguna garantía: la corrida de 4.1 sigue siendo obligatoria y sigue siendo la que cierra el epic.

**El re-check visual va gateado por un predicado mecánico, igual que el e2e.** Corre sólo cuando las **dos** condiciones se cumplen:

1. El diff de 4.7 — **de las dos pasadas**, la de 4.7.3-4.7.5 y la que 4.7.7 corre tras CP-B — intersecta las clases de path que disparan el AC de UI del test-gate: `src/components/**` y `src/app/**/{page,layout,template}.tsx` ([`test-plan-rules.md`](../tk-backlog/methodology/test-plan-rules.md) §AC layer; `src/app/api/**` es capa de handler, no UI). **Y**
2. El issue in-epic de `ui-critic` (§4.4) **ya corrió** en el orden de Phase 3.

- **Sin intersección → se salta, dejando la razón escrita** en el QC delta ("el delta de 4.7 no tocó componentes ni páginas"), exactamente como el predicado de e2e de arriba.
- **Las dos pasadas cuentan.** Un fix de UI que el user decidió en la tabla de CP-B y que 4.7.7 aplicó tiene que pasar por este paso igual que uno de la primera pasada; si sólo mirara la primera, el hueco quedaría abierto justo donde el user acaba de pedir un cambio visual.
- **El issue in-epic todavía no llegó a su turno → no aplica.** Ese caso ya lo cubre la corrida in-epic normal, que ve el UI fixeado porque corre después en el orden.
- **Con dos issues de `ui-critic` en el epic** (counter monotónico, §4.4) el ancla es **el último que corrió**, no el primero: el delta relevante es el que quedó sin revisar.
- **Un fix puramente de copy/texto dentro de esas clases de path dispara igual.** El predicado es por **path tocado** — mecánico y determinista, dos runs sobre el mismo diff deciden lo mismo — nunca por juicio de "¿este cambio amerita revisión visual?".
- **Sus findings entran al loop de 4.7.3** con la clase de la tabla de 4.7.1, sujetos al mismo retry cap por ítem. **Una sola vuelta:** el re-check no se re-dispara por el fix de sus propios findings; lo que quede sin resolver va a la tabla de CP-B como cualquier otro ítem.
- **El spawn cita paths de skills** (`CC.md §2`), mismo shape que 4.6 usa con `security-auditor`: `consulta antes de empezar: .claude/skills/fx-visual-evidence/SKILL.md, .claude/skills/sk-skins/SKILL.md, .claude/skills/kb-design-engineering/SKILL.md, .claude/skills/sk-tokens-neomorphism/SKILL.md`. El scope del prompt es el **delta de 4.7** (la lista de archivos de UI que el fix-loop tocó), no las pantallas del epic completo. El prompt pide además, por cada finding, la clase de la tabla de 4.7.1 **y su segmento `{consulta: …}`** — la misma ranura de evidencia que 4.2 y 4.6 abren en sus prompts ([`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md)); sin consulta citable el segmento se omite, nunca se inventa.
- **Misma regla de evidencia que §4.4, sin re-declararla:** el re-check vuelve a mirar pantallas, así que corre el harness antes del spawn **si la fase existe en este checkout** y le pasa el path del manifest; si no existe o falla, se spawnea igual y DS4 sale "no demostrado". Los dos puntos de spawn del mismo agente no pueden tener contratos de entrada distintos.

🔴 **Este paso no reemplaza al issue in-epic de `ui-critic`, que sigue siendo el mecanismo principal** y es el que cubre la UI del epic entera. El re-check es estrictamente condicional y su alcance es el delta: un epic cuyo fix-loop no tocó UI no lo corre nunca, y ninguno de los dos hace el trabajo del otro.

El QC delta contiene: los ítems con su clase y destino, **los que salieron de la frontera** (con su tier, y arreglados o no), **la sección `### Observaciones (no son deuda)`** — una línea por ítem para cada `mejora` y cada retirado del filtro de 4.7.2.1, con su clase de origen, su motivo y la consulta que lo refutó cuando la hubo; es la única sede de ese material, nunca la tabla de CP-B —, el registro de re-clasificación de 4.7.1, **el conteo por ronda `{N} hallazgos, {M} con evidencia`** (cierre (f) de [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md) — lo que vuelve auditable, a posteriori, un panel que afirma sin consultar), la decisión del predicado de e2e y la del re-check visual con su razón, y un verdict que supersede al de 4.2. Es el **artefacto durable** de la deuda del run: tracked, con timestamp, fuera del alcance del cleanup de Phase 5. Shape en [`epic-shape.md`](../tk-backlog/methodology/epic-shape.md) § append post-hoc.

**4.7.6 Tope por AC — hard-STOP, sin retroceso de turno.** Si un **mismo AC** sigue incumplido después de dos vueltas del epic, no es deuda: el AC está mal escrito o el problema es mayor de lo que el epic asumió. Un tope de "máximo N vueltas" sería arbitrario e incentivaría guardar trabajo para no gastarlas.

```
🛑 {AC-N} del epic sigue sin cumplirse después de dos vueltas.

Dos intentos distintos no lo lograron. Probablemente el AC está mal escrito,
o el problema es más grande de lo que el epic asumió.

| 1 | Mándalo a issue y sigue con lo demás    |
| 2 | Cancelo el run; re-planeamos el epic    |
| 3 | Dejo el epic en progreso                |
```

No re-corre Phase 2 + CP-A: sería volver del Turn 3 al Turn 1 con código ya commiteado, y §10 sólo cubre re-plan por drift de inputs. Encaja con §8 ("un loop que agotó reintentos → escala al user").

> **Deliberadamente NO hay freno por volumen de correcciones.** Se evaluó parar el loop cuando la proporción de fallas superara un umbral, con el mensaje "la ejecución del epic no salió". Se descartó porque **(a)** pondría al workflow a diagnosticar lo que no puede saber (concluir "el backlog quedó corto" exige contexto que no tiene), **(b)** es redundante con CP-B, que ya presenta todo sin resumir, y **(c)** aplicaría una consecuencia grande a una medida ruidosa: un ítem que en realidad *mejora* la implementación, contado como falla, dispararía un diagnóstico catastrofista sobre un epic sano. Lo único que queda del volumen alto es cosmético (CP-B retira el `(recomendado)`).

**4.7.7 Segunda pasada — el fix-loop ejecuta lo que CP-B decidió.** Es la única sub-fase de 4.7 que corre **después** de CP-B, y vive aquí porque **no construye nada nuevo**: reusa entero el loop de 4.7.3-4.7.5 (triage → retry cap por ítem → micro-gate → diff-ownership → commit → re-verify → re-audit → QC delta) con el **input ampliado**. Lo único que cambia es de dónde salen los ítems: además de los hallazgos de 4.2/4.6 y la deuda de los executors, entran **las respuestas de la tabla de decisiones de CP-B**.

| Respuesta en la tabla | Qué hace el loop                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** hazlo así       | Aplica el fix como cualquier ítem `rompe`/`está mal` de 4.7.3 — mismo retry cap (**3** por ítem), mismo micro-gate 4.7.4 si toca un área que CP-A no autorizó — y corre el cierre de 4.7.5 **antes** de re-presentar el resultado         |
| **2** issue aparte    | El ítem sale del loop hacia su plan de remediación (5.2) y **no bloquea el resto**: los demás ítems se siguen aplicando en la misma pasada                                                                                               |
| **3** descartar       | Queda registrado en el QC delta con la justificación textual del user (4.7.3). No se aplica ni se emite issue                                                                                                                            |

- **Re-presentación acotada.** Tras ejecutar, el orquestador re-emite el **resumen agrupado** de CP-B con los destinos ya resueltos y el veredicto del re-verify. No re-abre la tabla completa: sólo declara las filas que **cambiaron de estado** respecto de lo decidido (típicamente, un fix que agotó su retry cap).
- **Un "hazlo así" que falla tres veces NO produce cierre parcial silencioso.** Aplica 4.7.3 tal cual: el ítem pasa a issue y el loop **continúa con los demás**. **Ese** ítem sí puede dejar el epic en cierre parcial —si queda dentro de la frontera (4.7.2)— pero por la vía declarada de 5.2, nunca por omisión.
- **El cierre de esta pasada re-corre la evaluación de 4.8 sobre SU diff, con LAS DOS condiciones de 4.8.** Los fixes de 4.7.7 son commits que el post-hoc de 4.8 no vio (corrió antes de CP-B): el re-verify de 4.7.5 de esta pasada incluye re-resolver el registry sobre el diff que 4.7.7 produjo — paths y señales diff-time (`new-dependency` incluida) — y aplicar el mismo predicado de silencio: escala si **sube el nivel** (a) **o** si **crece el panel** (b), incluido el caso en que el panel crece **sin mover el nivel**, o crece mientras el nivel baja. Una escalación aquí re-presenta el CP de escalación de 4.8 **antes** de Phase 5; sin este paso, un fix decidido en CP-B que agrega una dependencia, o que toca por primera vez un path cuya regla suma un revisor, cerraría sin el revisor que el **gate** exige — que es exactamente el caso de EPIC-16 que 4.8 existe para atrapar.
- **Un solo QC delta por run.** El `## QC Delta (Phase 4.7 — …)` de 4.7.5 cubre las dos pasadas: los ítems de la primera y las decisiones de CP-B ejecutadas en ésta, cada una con su destino y con su justificación cuando la hubo. No se emite un segundo artefacto.
- **Sin decisiones en la tabla → esta pasada no corre.** No es un paso obligatorio; es el destino de un input que puede venir vacío (CP-B ya declara el caso "no quedó nada que decidir").
- 🔴 **Orden inviolable: CP-B decide → 4.7.7 ejecuta → 5.2 evalúa la bifurcación.** Nunca al revés. Evaluar 5.2 antes de esta pasada dejaría el epic en cierre parcial por pendientes que el user acababa de resolver — exactamente el hueco que 4.7.7 cierra.

**4.7.8 Convergencia de la revisión — re-entrada + regla de parada.** Regla **transversal** del loop, no una pasada nueva ni un momento del flujo: gobierna cuándo el **ciclo de revisión** de 4.7 puede dejar de generar hallazgos. Sus dos parámetros — `clean_rounds` y `severity_floor` — se **leen** de `review.loop_by_risk` del registry (`.claude/policy/quality-gates.json`), nunca se redefinen aquí; el shape del bloque y la semántica del piso viven en [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md).

- **Re-entrada — los hallazgos del QC delta re-entran al loop.** Los hallazgos que emite el QC delta de 4.7.5 re-entran a 4.7.1 (con su clase, emitida por quien detecta) y a 4.7.3 (triage) igual que los de cualquier otra fuente. El ciclo de revisión es, por tanto: fixes → cierre de 4.7.5 → hallazgos nuevos → triage → fixes. Esta re-entrada es lo que hace del cierre un ciclo; la regla de parada de abajo es lo que evita que sea infinito.
- **Regla de parada.** El ciclo de revisión cierra cuando **`clean_rounds` rondas consecutivas** no producen ningún hallazgo dentro de frontera (4.7.2) con severidad **en o por encima de `severity_floor`** — ambos de `loop_by_risk[N]`, con N = nivel de riesgo del cambio. Una **ronda** = una pasada del cierre de 4.7.5 (QC delta sobre el delta tras aplicar fixes); es **sucia** si produce ≥1 hallazgo así, **limpia** si no.
- **El piso usa el orden total de `fx-execution-policy §4.4`:** `breaks` (`rompe`) > `wrong` (`está mal`) > `cosmetic` (`cosmético`), piso **inclusivo** — `"wrong"` cuenta `wrong` y `breaks`; `"breaks"` cuenta solo `breaks`; `"cosmetic"` cuenta las tres. La clase `decisión` queda **fuera del eje**: va como fila a CP-B por 4.7.3 y **nunca** cuenta como ronda limpia ni como sucia — la ronda se evalúa por sus demás hallazgos.
- 🔴 **Con el piso en `wrong` (riesgo 2-4 del registry del kit), un hallazgo `cosmético` NO ensucia la ronda — pero se corrige igual.** Es lo que hace la regla alcanzable: un revisor adversarial, por mandato, siempre encuentra *algo*, así que exigir rondas sin **ningún** hallazgo cerraba el ciclo por agotamiento y no por criterio. El ciclo converge cuando lo que queda ya es sólo cosmético; ese cosmético entra al fix-loop de 4.7.3 como cualquier otro ítem y queda escrito en el QC delta. **Convergencia y corrección son ejes distintos** — que un hallazgo no exija otra ronda no significa que se ignore.
- **El eje de evidencia (`evidenced`/`unevidenced`) se consume aquí — tres reglas, leídas del SSOT ([`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md)), activas sólo con `review.unevidenced_dirties` presente en el registry** (ausente, el eje entero es inerte — contrato de activación de esa sección — y esta lista no cambia ningún comportamiento): **(1) la celda efectiva es una sola — y rige sólo con la palanca en `false`**: un `está mal` (`wrong`) `unevidenced` **no ensucia la ronda, pero se corrige igual dentro del loop**, molde exacto de `cosmético`: mueve convergencia, nunca corrección. Con la palanca **en `true`** (el endurecimiento que un override compra — §4.4 Activación), todo `wrong` ensucia, cite o no cite consulta; las reglas (2) y (3) y el conteo (f) siguen activos por presencia. **(2) `breaks` es inerte** — un `rompe` ensucia cite o no cite consulta: su definición diff-time ya es evidencia, y el que llegue sin consulta citable se lee conservador — cuesta la ronda. **(3) Cierre (e) — ronda fallida:** una ronda donde **ningún** hallazgo dentro de frontera en o por encima del piso viene `evidenced` (tras la promoción obligatoria del cierre (d) sobre ese subconjunto) es **fallida**, no limpia — no cuenta para `clean_rounds`, no borra los hallazgos, y produce un caveat con el nombre del revisor. **CP-B no gana filas por el eje:** un `wrong × unevidenced` dentro de frontera se corrige en el loop como cualquier `está mal` — la regla _"el agente nunca descarta deuda por su cuenta"_ queda intacta — el retiro de 4.7.2.1 y el registro de `mejora` no la tocan porque no son descartes de deuda (4.7.3).
- **`mejora` queda fuera del eje y fuera del loop.** No ensucia, no se corrige, no re-entra: se registra en Observaciones y la ronda se evalúa por sus demás hallazgos ([`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md)).
- **Fuera de frontera no ensucia.** Un hallazgo fuera de la frontera de 4.7.2 se registra en el QC delta y **no** cuenta como ronda sucia. 4.7.2 ya dispone que lo de afuera "se registra, NO bloquea el cierre"; esta regla solo añade que tampoco ensucia la ronda.
- **Mecánica y auditable.** La decisión de parada es aritmética sobre `clean_rounds`/`severity_floor`, no juicio del agente: dos evaluaciones sobre el mismo conjunto de hallazgos (misma clase, misma frontera, mismo nivel de riesgo) paran igual. El contador de rondas — limpias consecutivas, y con qué hallazgo se ensució cada sucia — queda escrito en el QC delta.
- **Trabajo vs revisión — dos ejes, ninguno reemplaza al otro.** 4.7.6 gobierna el **trabajo**: un mismo AC del epic incumplido tras dos vueltas escala al user. Esta regla gobierna la **revisión**: cuándo converge la generación de hallazgos. No introduce ningún tope de vueltas de trabajo, y el `N=3` de 4.7.3 sigue siendo reintentos por ítem — tres contadores distintos que no se suman ni se sustituyen.
- **La segunda pasada cuenta bajo la misma regla.** 4.7.7 reusa entero el loop de 4.7.3-4.7.5, así que sus rondas entran al mismo contador: los ítems que CP-B decidió no abren un ciclo de revisión aparte.

**4.8 Post-hoc de riesgo — re-evaluar contra el diff real de cierre.** Corre **después** de que la primera pasada de 4.7 cierra (4.7.1-4.7.6 resueltos, ciclo de revisión de 4.7.8 convergido) y **antes** de CP-B. Es una **segunda** evaluación de riesgo, distinta de la de 4.6: 4.6 corre sobre el diff del epic **antes** de que exista la deuda que 4.7 recolecta y corrige; este paso re-evalúa sobre lo que **realmente** quedó commiteado.

> 🔴 **La evasión del executor NO es la motivación.** Ese caso ya lo bloquea el gate hard de diff-ownership de Phase 3 (paso 2 del ciclo por lote, arriba: archivos inesperados → STOP). El post-hoc cubre tres superficies que ese gate **no** ve, porque ninguna pasa por un executor: los commits de integración de **4.5**, los fixes del fix-loop de **4.7** (que su propio check de 4.7.5 ya admite "archivos congelados ∪ los declarados por cada ítem" — un set más ancho que lo que CP-A vio), y —**hasta que Phase 2 §2.1 mecanizó la resolución**— un issue que sí declaraba el path sensible en su `§6` pero al que nadie le asignaba el riesgo al planear. **Esa tercera superficie está cerrada** desde que el predicado deriva `sensitive_paths_authorized` del propio `§6`: el caso ya no puede ocurrir por olvido de quien redacta el plan. Lo que **sí** sobrevive de ella es su reverso — un path que el predicado dejó fuera por su sesgo conservador (entrada condicional, alternativa, o `§6` no parseable) y que la ejecución terminó tocando. Ese caso lo cubren el micro-gate de 4.7.4 en el momento y este post-hoc al cerrar; las dos primeras superficies (4.5 y 4.7) siguen intactas y son las que sostienen este paso.

- **Mecánica — reusa 4.6 entero, con un diff distinto.** Mismo registry (`.claude/policy/quality-gates.json` ∪ override), misma agregación de [`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md) (los dos renglones, sin reproducirlos aquí), mismas señales diff-time de [`fx-execution-policy §6`](../fx-execution-policy/SKILL.md). Lo único que cambia es el rango: `git diff --name-only {start-commit}..{end-commit}` sobre el par de commits de `epic_metadata` (el mismo que usa 4.2), que a esta altura ya incluye los commits de integración de 4.5 y los de la primera pasada de 4.7 — 4.6 solo vio el diff hasta su propio punto de corrida.
- **Sin escalación → silencio correcto — sólo cuando se cumplen LAS DOS condiciones.** El post-hoc guarda silencio si **(a)** el riesgo post-hoc es igual o menor al que 4.6 resolvió, **y (b)** el conjunto de revisores que el diff real exige está **contenido** en el que ya corrió **sobre este objeto**. El conjunto exigido se resuelve con la agregación de [`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md) sobre el **panel efectivo kit ∪ override** ([`§4.2`](../fx-execution-policy/SKILL.md) — el override también suma revisores, por regla y por nivel); "lo que ya corrió sobre este objeto" es el panel de 4.6 sobre el **diff**, más lo que este mismo post-hoc haya agregado en la corrida — **nunca** el panel plan-time de Phase 2 §2.2, cuyo objeto es el plan. Con las dos, no hay nada que hacer: se anota en el Implementation Evidence del epic (Phase 5) que el post-hoc corrió y no escaló, y el run sigue a CP-B sin interrupción. Un epic sin commits de integración de 4.5 ni fixes de 4.7 cae siempre aquí — el diff post-hoc coincide con el de 4.6 por construcción, así que las dos condiciones se cumplen a la vez.
  - 🔴 **La condición (b) no es redundante con la (a): el nivel colapsa por máximo, el panel acumula por unión.** Los dos renglones de la agregación son independientes, así que un diff que toca por primera vez un path cuya regla trae un revisor en su `require` **suma ese revisor sin mover el nivel** — y comparando sólo niveles se cuela por debajo del gate. Por la misma razón, un diff cuyo riesgo **baja** mientras el panel crece **también para**: la unión del `require` es independiente del máximo. Caso real que lo destapó: un fix de 4.7 tocó por primera vez un archivo de `.claude/**`, cuya regla exige `fx-factory-reviewer`, con el nivel de riesgo sin moverse.
  - **Un revisor que corrió sobre OTRO path no cuenta como corrido sobre el que disparó ahora.** La condición (b) mide **conjunto de revisores**; la ejecución sigue siendo por path (el spawn es "sobre el path que disparó la escalación", abajo).
- 🔴 **Con cualquiera de las dos condiciones incumplida → escalación: revisores faltantes + CP explícito, nunca en silencio.** Mismo mecanismo aditivo que el gate del cierre ([`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md)), y es el mismo para los dos disparadores — no hay mecánica nueva para el panel: se agregan los revisores que el **panel efectivo** del diff post-hoc exige (kit ∪ override) y que el panel de 4.6 no había corrido **sobre este objeto** (el diff — nunca cuenta el panel plan-time de Phase 2 §2.2, cuyo objeto es el plan), spawneados sobre el path que disparó la escalación. Antes de avanzar a CP-B:

  ```
  ⚠️  El diff real del epic escaló el gate de riesgo al cerrar. Disparador: {disparador}.
      Path que lo disparó: `{path}` — tocado por {"un fix de 4.7" | "un commit de integración 4.5"}.
      Regla: `{path o signal}` — riesgo {M} · revisores: {lista} — {origen} (misma narración de 4.6).

      Revisores agregados: {lista}. Ya corrieron sobre el path que disparó la escalación.

  | 1 | Aprobado, sigo a CP-B                                                |
  | 2 | Reviso ese cambio antes de continuar                                 |
  | 3 | Declara `{path}` como área sensible del proyecto (agrégalo al override) |
  ```

  > 🔴 **`{disparador}` nombra el hecho real y nunca afirma un salto que no ocurrió** — una de estas tres formas, decidida por cuál de las dos condiciones falló:
  >
  > - **Sólo el nivel:** `el nivel de riesgo subió de {N} (evaluado en 4.6) a {M} (al cerrar)`.
  > - **Sólo el panel:** `el nivel de riesgo sigue en {N}, y el panel creció: la regla de {path} exige revisores que no habían corrido sobre este diff`. Si el nivel **bajó**, la misma forma con `bajó de {N} a {M}` — el panel manda igual.
  > - **Las dos:** ambas frases, unidas por `y` — **un solo CP**, nunca dos seguidos (ver «Doble escalación» abajo, que ya une paths y revisores en una tabla).

  > **Presentación:** tres opciones excluyentes sin campo de texto → estructuradas por default (`CC.md §3`); la tabla es el fallback sin la tool. **Headless: fail-closed** — toda escalación aborta con causa citada (§8), sin intentar la tool.

  Sin una respuesta que apruebe, el run **no** avanza a CP-B — la escalación nunca se absorbe sola.
  - **Opción 3 — declaración de un clic.** Con esa respuesta, el orquestador agrega la entrada (`when.paths` + `risk` + `require`, mismo shape que el default — [`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md)) a `.claude/policy/quality-gates.project.json` (patrón `*.project.*`, dev-owned, excluido de distribución, descubrible vía la guía de retrofit `declare-project-sensitive-areas`) y la incluye en el `git add` del commit de cierre de **Phase 5** (junto al epic file y los demás artefactos de ese commit). **Clasificar un área como sensible es juicio de negocio, no del agente** (`CODING.md §8`): la opción **propone**, nunca escribe sin esta aprobación explícita.
    - 🔴 **El archivo escrito es un registry VÁLIDO para el linter.** Si el override no existía, se crea con el scaffold completo — `panel_by_risk` con los 5 niveles (vacíos) + `rules` con la entrada nueva — el mismo shape del ejemplo de la guía de retrofit `declare-project-sensitive-areas`; el schema Zod del check de registries es `strictObject` con `panel_by_risk` obligatorio, así que una entrada suelta sin scaffold no pasa el pre-commit. `pnpm skill:lint` debe estar en verde antes de que el override entre al commit de cierre.
    - **Merge del `panel_by_risk`: unión aditiva por nivel** ([`fx-execution-policy §4.2`](../fx-execution-policy/SKILL.md)) — el panel del override solo puede **sumar** revisores al del kit; vacío o ausente es inerte; **nunca** reemplaza al del kit. Sin esta regla, un override con paneles vacíos borraría a los revisores del nivel en silencio.
  - **La entrada solo puede endurecer — unión aditiva** ([`fx-execution-policy §4.2`](../fx-execution-policy/SKILL.md)): sube el `risk` de ese path o suma revisores al `require`, nunca baja un nivel ni quita uno que el kit ya exige. Una regla que declarara menos que la equivalente del kit quedaría inerte (`risk = máximo`) — el check de registries (`policy-registry.ts`) la reporta como `warning` en el siguiente `pnpm skill:lint`; este workflow no reimplementa ese check.
- **Doble escalación → un solo CP.** Si un commit de 4.5 y un fix de 4.7 tocan paths sensibles distintos en la misma corrida, el CP presenta **ambos** paths en la misma tabla, con la **unión** de los revisores que cada uno agregó — no dos checkpoints seguidos. Si el **mismo** path aparece en las dos superficies (un commit de 4.5 y un fix de 4.7 tocan el mismo path no declarado), la fila —y su opción 3— aparece **una sola vez**: no se re-ofrece la declaración por cada commit que lo toca.
- **Superficie tocada, no dirección del cambio.** Un fix de 4.7 que **borra** código dentro de un path sensible cuenta igual que uno que agrega: el post-hoc mide qué archivos cambiaron, no si el cambio creció o se redujo.
- 🔴 **Plan Mode (`CC.md §4`, riesgo ≥3) aplica SOLO a la evaluación previa.** CP-A es Plan Mode formal porque hay código **todavía no escrito** que aprobar. Este paso corre sobre código **ya commiteado** — no hay forma de pedir aprobación previa sobre algo que ya pasó. El CP de escalación de arriba es el mecanismo equivalente para este momento del run: mismo principio (nada de riesgo alto se cuela sin que el user lo vea), mecánica distinta porque el momento es distinto.
- **Headless.** En headless **TODA escalación aborta con causa citada** — no solo la de riesgo ≥3: el CP de escalación exige una respuesta ("sin una respuesta que apruebe, el run no avanza a CP-B") y en headless no hay quién la dé, así que una escalación 0→2 tampoco tiene salida que no sea el abort. Mismo precedente fail-closed que 4.6.
- **Si el post-hoc escala, la política de loop se re-deriva del nivel alcanzado.** `review.loop_by_risk` se re-lee con el riesgo nuevo — las rondas posteriores del ciclo de revisión (4.7.7, re-checks) usan `clean_rounds`/`severity_floor` del nivel escalado, no los que 4.6 había resuelto. Sin esta línea habría dos lecturas defendibles con resultados distintos, justo lo que la regla de convergencia prohíbe.

### 🛑 CP-B — Review final (inline, plain)

Resumen plain post-ejecución + QC report + AC coverage + **la deuda del epic completa** (4.7). **Pre-condición:** 4.6 cerrado — security audit corrido sin findings `Critical`/`High` pendientes (resueltos o con aceptación de riesgo documentada), o skip documentado por condición de ejecución; **4.7 cerrado hasta 4.7.6** con su re-verify verde; y **4.8 corrido, sin escalación de riesgo pendiente de aprobación**. El corte en 4.7.6 no es un detalle: **4.7.7 corre después de CP-B** por definición (es la pasada que ejecuta lo que CP-B decidió), así que exigir "4.7 completa" haría la pre-condición circular e insatisfacible.

**La deuda se presenta SIEMPRE y COMPLETA** — nunca resumida a "las 2-3 críticas". Se emite en **dos piezas, en este orden**:

1. **La tabla de decisiones** — el mecanismo con el que el user decide, una fila por decisión pendiente.
2. **El resumen agrupado por destino** — la confirmación de qué quedó decidido, que es como lo lee un humano al final.

#### La tabla de decisiones — todo lo que hay que decidir, en una sola tabla

**Sólo lo grande llega a esta tabla.** Una fila existe por exactamente una de estas razones: (a) un ítem `L` **con consecuencia concreta** (dentro o fuera de la frontera) — candidato a issue; (b) un ítem `rompe` / `está mal` cuyo fix **no se pudo aplicar** (el retry cap por ítem se agotó, o el micro-gate 4.7.4 lo mandó a issue); (c) una `decisión` grande (con spec, 4.7.3). Nada más es fila: lo chico (`S`/`M`) ya se arregló en el run, las decisiones de una línea ya se tomaron, las `mejora` y lo retirado por el filtro están en Observaciones. Un ítem con destino ya ejecutado —corregido, commiteado y verificado— **no** es una decisión: va al resumen agrupado, y si el user quiere moverlo, revertirlo o rescatar una observación tiene el sub-flujo de **Revisar** (la opción 2 del checkpoint, al final de esta sección). 🔴 **Una tabla con más filas que issues tenía el epic es una señal de que el triage falló, no de que el epic estaba mal:** revisar si entraron ítems chicos o mejoras antes de presentarla.

> **Dos niveles de opciones, no confundirlos:** las **opciones de fila** (1/2/3 de la tabla) deciden el destino de un ítem; las **opciones del checkpoint** (1/2/3 de la tabla del final) deciden qué hacer con el epic. Se responden por separado.

**Los ítems fuera de la frontera que llegan aquí ya pasaron la refutación (4.7.2.1) y son `L` con consecuencia — nunca una lista plana.** Traen su evidencia (la clase que la pasó), su consecuencia, la prioridad defendida, lo que habría que construir y el alcance re-derivado en archivos: esas piezas van en las celdas `Por qué` / `Impacto` / `Costo del fix` / `Recomendación` de su fila. **Lo retirado por el filtro no es fila**: se declara en una línea antes de la tabla (*"el filtro retiró N pendientes — están en Observaciones del QC delta; nómbralo en Revisar si quieres rescatar alguno"*), y esa línea se emite **siempre que N > 0**, aunque la tabla quede vacía — el conteo es la evidencia de que el filtro corrió.

Cada celda va en **lenguaje plano**, nunca en la jerga cruda del QC report ni del security audit: la audiencia es un developer que **no** leyó esos reportes (`CC.md §3`). Máximo tres líneas por celda.

| #   | Qué                                          | Por qué                             | Impacto                    | Costo del fix        | Recomendación del agente       | Opción de un clic                                      |
| --- | -------------------------------------------- | ----------------------------------- | -------------------------- | -------------------- | ------------------------------ | ------------------------------------------------------ |
| 1   | {qué se encontró, en términos de capacidad}  | {de dónde salió y por qué apareció} | {qué pasa si se queda así} | {`S`/`M`/`L` + qué toca, media línea} | {qué haría el agente, 1 línea} | **1** hazlo así · **2** issue aparte · **3** descartar |
| 2   | …                                            | …                                   | …                          | …                    | …                              | **1** · **2** · **3**                                  |

🔴 **La `Recomendación` se DERIVA del `Costo del fix`, no del juicio libre ni de la frontera** (regla de 4.7.2, anclada aquí porque aquí es donde se escribe la celda):

| Costo | Qué recomienda la fila                                                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S** / **M** | **No hay fila.** Un ítem chico se arregló en el run (4.7.3); si aparece aquí es porque su fix **agotó el retry cap** o el **micro-gate** lo mandó a issue — y entonces la celda lo dice, y la recomendación es **2 — issue aparte** con la razón del fallo escrita |
| **L** | **2 — issue aparte**, con la **consecuencia concreta** escrita en `Por qué` y **lo que habría que construir** (pantalla / entidad / flujo / endpoint) en `Costo del fix`. Sin consecuencia no hay fila: es una observación |

Un ítem sin `Costo del fix` en su celda es un defecto del run, no una fila válida: significa que 4.7.2.1 no emitió el tier o que el triage no lo derivó. Se resuelve pidiendo el dato, nunca recomendando sin él. Y un `L` que no nombra qué habría que construir es el mismo defecto.

🔴 **La frontera decide dónde se registra y si el cierre queda parcial — nunca si se arregla ni si es fila.** Recomendar "issue aparte" para un fix chico agrega exactamente la fricción que esta tabla existe para eliminar: el pendiente se vuelve a leer y a agendar en vez de resolverse donde ya está todo el contexto caliente. Que un ítem esté fuera de la frontera, o que "tenga diseño detrás", **no** basta para diferirlo — sólo lo difiere ser `L`, y sólo lo agenda tener consecuencia. **Un issue se gana con las dos cosas; el agente no propone issues por precaución.**

**Las tres opciones son siempre las mismas tres, en el mismo orden.** No se reordenan por fila, no se omite ninguna, y ninguna fila lleva más ni menos de tres:

| Opción                   | Qué hace                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** — hazlo así        | Aplica la recomendación del agente tal como está escrita en la fila                                                                                 |
| **2** — issue aparte     | El ítem sale del run y va a un plan de remediación: `/backlog extend-epic` si está **dentro** de la frontera (4.7.2), `/backlog add` si está fuera   |
| **3** — descartar        | El ítem no se arregla ni se convierte en issue. **Exige texto libre del user** — sin ese texto, la fila queda sin responder                          |

Cuando la recomendación del agente **es** una de las otras dos (p.ej. "emitir issue" para un ítem cuyo fix agotó el retry cap), la opción 1 coincide con ella. La redundancia es intencional: la fila conserva siempre las mismas tres opciones, y quien lee no tiene que descubrir cuáles aplican en cada caso.

**Cómo se responde — opciones estructuradas, con la tabla completa como presentación** (`CC.md §3`, [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md)):

Este es el checkpoint más denso del kit, y el que motivó la migración: convivían dos numeraciones (`{fila}.{opción}` para cada pendiente y otra 1/2/3 para el epic) más un atajo que había que aprender.

1. **La tabla completa se emite primero, íntegra.** 🔴 Sigue siendo la **presentación** — sus celdas (`Qué` / `Por qué` / `Impacto` / `Recomendación`) admiten hasta tres líneas cada una y no caben en la etiqueta de una opción. La garantía "SIEMPRE y COMPLETA, nunca resumida" **no** se relaja: migrar el mecanismo de respuesta no fracciona el contenido.
2. **El atajo va primero, como pregunta única:** _"¿aplico la recomendación del agente a todas las filas?"_ Si la respuesta es sí, el checkpoint se resuelve en **una sola interacción** — el camino de menor esfuerzo produce el mejor resultado alcanzable.
   - **Ninguna fila trae un descarte como recomendación** — lo que no merecía atención ya se retiró a Observaciones antes de la tabla (4.7.2.1), así que el atajo cubre todas las filas y no necesita salvedad. La opción **3** (descartar) sigue existiendo en cada fila para el user, con su campo de texto.
3. **Las filas restantes se preguntan de a 4 por llamada** (tope del runtime), en tandas consecutivas. Una fila = una pregunta con sus tres opciones de siempre. **Ninguna fila queda sin presentar**, cualquiera sea el volumen.
4. **La decisión del epic va por separado**, como su propia pregunta.

> 🔴 **Los dos niveles no se funden en la migración.** Las opciones de fila (destino de un pendiente) y las del checkpoint (destino del epic) siguen siendo decisiones distintas, presentadas y respondidas por separado. Justamente porque se prestaban a confusión cuando compartían formato numérico, no se resuelven ahora en la misma pregunta.

> **Fallback sin la tool:** el formato escrito de siempre — `{fila}.{opción}` por fila separadas por espacio (`1.1 2.3 3.2`), con el atajo `todas 1` sujeto a la misma salvedad del punto 2. **Headless:** ni tool ni tabla — CP-B es fail-closed (§8), ninguna fila se resuelve sola.

🔴 **El agente nunca descarta por su cuenta** (4.7.3). En concreto, y sin excepciones:

- La opción **3 exige texto libre del user**, y ese texto **es** la justificación que se escribe en el QC delta (4.7.5). Nunca existe una opción de descarte sin campo de texto.
- El agente **no puede pre-marcar** la opción 3 ni tratarla como default silencioso. Una fila sin respuesta **no** se descarta: queda pendiente y el checkpoint la vuelve a preguntar.
- La recomendación de una fila **nunca es un descarte**: un ítem que no merece atención no llega a ser fila (se retiró a Observaciones en 4.7.2.1, o es `mejora`). Si el user quiere descartar una fila, es la opción 3 con su texto; si quiere rescatar una observación, la nombra en **Revisar**.
- Headless: la fila va a issue, nunca a descarte (§8).

🔴 **Lo que la tabla decide se ejecuta en ESTE run.** Las respuestas entran al fix-loop de 4.7 como una segunda pasada (**4.7.7**): "hazlo así" se aplica y pasa por el re-verify / re-audit / QC delta de 4.7.5 antes de re-presentarse, "issue aparte" sale hacia su plan de remediación sin bloquear a los demás, y "descartar" queda registrado con la justificación del user. Nada de esto queda esperando una corrida futura — el resumen agrupado de abajo se emite **con los destinos ya resueltos**.

**Volumen alto no relaja nada.** Con más de diez filas la tabla se presenta **completa igual** — la garantía de arriba ("SIEMPRE y COMPLETA, nunca resumida") no admite un modo abreviado. Lo único que cambia con el volumen es cosmético (ver abajo: la opción 1 del checkpoint pierde el `(recomendado)`).

**Sin nada que decidir → no hay tabla — y es el caso esperado, no el raro.** Si el triage no dejó ningún `L` con consecuencia ni ningún fix fallido (todo era chico y se corrigió en 4.7.3-4.7.5), la tabla **se omite explícitamente** con 1 línea plain ("No quedó nada que decidir: arreglé N, decidí M, registré K observaciones") en vez de emitir una tabla vacía. El resumen agrupado se emite igual, con `A ISSUE (0)`.

#### El resumen agrupado por destino — la confirmación

La tabla es el mecanismo de decisión; este bloque es el resumen final que confirma qué quedó decidido. Se emite después de la tabla, con los destinos ya resueltos:

```
Al implementar el epic salieron {N} pendientes:

  CORREGIDOS EN ESTA PASADA ({n})
  · {qué era, en términos de capacidad — no IDs crudos} {· "fuera del alcance, lo arreglé igual" cuando aplique}
  · …

  DECIDÍ POR TI ({n})
  · {qué elegí y por qué, 1 línea} — alternativa: {la otra opción}. Revísalo en "Revisar" si no estás de acuerdo.

  A ISSUE ({n}) — grandes y con consecuencia; los decidiste en la tabla
  · {qué es} — {la consecuencia concreta} — {razón de L}

  OBSERVACIONES ({n}) — no son deuda; están en el QC delta, sin acción
  · {n} mejoras ("podría estar mejor") · {n} retiradas por el filtro (no existe / duplicado / sin consecuencia)
    Nombra cualquiera en "Revisar" para rescatarla.
```

Cada bloque con conteo cero **se omite** (no se imprime `A ISSUE (0)` salvo cuando la tabla no existió — ver arriba). El bloque `OBSERVACIONES` lleva sólo los conteos, nunca la lista: la lista vive en el QC delta, y traerla aquí volvería a poner frente al user exactamente lo que el filtro sacó.

Las re-clasificaciones del orquestador (4.7.1) se muestran inline junto al ítem afectado.

| #   | Opción                | Acción                                                                        |
| --- | --------------------- | ----------------------------------------------------------------------------- |
| 1   | **Completar**         | Acepta el triage y cierra (normal o parcial — Phase 5). Push aparte           |
| 2   | **Revisar**           | Ajustar **el triage de pendientes o cualquier otra cosa** antes de cerrar     |
| 3   | **Dejar en progreso** | Pausar (el plan persistido permite `--start-at`)                              |

- **La opción 1 es el default recomendado.** Es deliberado: el camino de menor esfuerzo del user debe producir el mejor resultado alcanzable. Un checkpoint que saliera con todo sin marcar equivale, para quien no lee, a no arreglar nada.
- **La opción 2 significa dos cosas** — el "ajustar algo antes de cerrar" de siempre **y** el triage; su texto lo dice para que quien la elija por el motivo viejo no caiga en un sub-flujo que no pidió. El sub-flujo mueve ítems entre *corregir* e *issue* (selección múltiple), **revierte una decisión de `DECIDÍ POR TI`** (el agente aplica la alternativa por 4.7.7) y **rescata observaciones por nombre**: una observación rescatada entra por el camino normal — fix si es chica, fila si es `L` con consecuencia. **Descartar NO está en la selección múltiple:** requiere una instrucción de texto del user, y ese texto es la justificación que se escribe en el QC delta.
- **Volumen alto retira la recomendación.** Cuando los ítems corregidos superan el número de issues del epic, la opción 1 se presenta **sin** `(recomendado)`. Nada más: mismas opciones, mismo texto, sin diagnóstico. Es el mecanismo más leve posible para la señal más ruidosa del diseño — deja de empujar al que no lee, en el único caso donde conviene que lea.

Push/merge sigue **manual** (`GIT.md §2`) — se pregunta por separado tras completar.

### Phase 5 — Close epic

**5.1 Sanity check — `## QC Report (Phase 4)` presente en el epic file.**

Antes del commit final, verificar que el QC report fue appendeado correctamente al epic file durante Phase 4 — tool **Grep** (pattern: `^## QC Report \(Phase 4`, path: `{EPIC_FILE}`, output_mode: `count`):

- **Pass condition:** count ≥ 1 — existe al menos una sección `## QC Report (Phase 4` en el epic file. No requiere que sea el último heading (el user puede haber agregado notas después).
- **count == 0** → STOP con recovery (abajo).

Si el check falla → STOP plain language al user con recovery path manual (NO hay auto-recovery — el state del epic ya tiene commits de Phase 3 + integration de Phase 4):

```
🛑 Phase 5 sanity check falló — el epic file `{EPIC_FILE}` no contiene la sección
   `## QC Report (Phase 4 — ...)`. Posibles causas:
   - El append del orchestrator falló mid-write (disco lleno, permission, crash).
   - El user editó el epic file y eliminó la sección accidentalmente.
   - Phase 4 nunca llegó a hacer el append (bug del orchestrator).

Para resolver:

| 1 | Pegar manualmente el QC report al final del epic file. El output del subagent
    quality-engineer está visible en el turn anterior — copia el bloque
    `## QC Report (Phase 4 — ...)` completo y appendea con un editor. Después
    responde "listo" para que Phase 5 re-checa.                                  |
| 2 | Re-correr Phase 4 entero: cancela este run y ejecuta `/implement EPIC-NN`
    de nuevo. /implement detectará el epic en estado parcial (issues ✅ pero
    epic abierto sin QC report) y reanuda desde Phase 4. Costo: re-spawn de
    quality-engineer + re-corrida de verify/build/e2e (~5 min + costo API).      |
```

El epic NO se commitea hasta que el sanity check pase.

**5.2 Cierre del epic — normal o parcial.**

**Bifurcación — mecánica, y se evalúa DESPUÉS de que el fix-loop ejecutó las decisiones de CP-B (4.7.7).** El user decide el destino de cada ítem en la tabla de CP-B; la bifurcación no es una pregunta aparte: se **lee** del estado que la segunda pasada dejó.

🔴 **El orden no es negociable: CP-B decide → 4.7.7 ejecuta → 5.2 evalúa.** Un epic que en CP-B tenía 3 pendientes en "issue aparte" y del que el user cambió 2 a "hazlo así" cierra **normal** si el fix-loop los aplicó y no quedó ningún ítem dentro de la frontera camino a issue. Evaluar esta tabla con las decisiones sin ejecutar produciría un cierre parcial por pendientes que el user ya resolvió.

| Situación **después** de 4.7.7                                                                                        | Cierre      |
| --------------------------------------------------------------------------------------------------------------------- | ----------- |
| Un finding `Critical`/`High` de 4.6 sigue sin resolver y sin aceptación de riesgo documentada                          | **Parcial** |
| El tope por AC de 4.7.6 disparó y el user eligió "dejo el epic en progreso"                                            | **Parcial** |
| Queda ≥1 ítem **dentro de la frontera** (4.7.2) destinado a issue — el user lo mandó ahí, o su fix agotó el retry cap  | **Parcial** |
| Nada de lo anterior                                                                                                   | **Normal**  |

🔴 El calificador **"dentro de la frontera"** es esencial: los ítems de afuera también van a issue, y sin él bloquearían el cierre contra lo que 4.7.2 declara.

**Epic sin audit de 4.6** (skip documentado porque no toca superficie server-side de seguridad): la primera fila **no puede activarse** — no hay findings que puedan quedar sin resolver. Ese epic sólo puede quedar parcial por el tope por AC o por el residuo de la frontera.

**Lo que ya NO produce cierre parcial: una decisión pendiente.** El cierre parcial está reservado a un bloqueante del audit sin resolver, al tope por AC, y al residuo mecánico de la frontera (un ítem que el user mandó a issue deliberadamente, o cuyo fix no salió en tres intentos). Un pendiente que sólo necesitaba que alguien decidiera **no** llega hasta aquí: se decide en la tabla de CP-B y se ejecuta en 4.7.7. Antes, esa clase de ítem dejaba el epic abierto y obligaba a una corrida futura para aplicar algo ya decidido.

**En cierre PARCIAL, cuatro guards** (lo demás de 5.2 aplica igual):

| Guard              | Regla                                                                                              | Por qué                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado del epic    | queda `🚧 In Progress`, **no** `✅ Done`                                                            | Marcarlo Done sería falso y `update-board` lo reflejaría mal                                                                                    |
| Fila `Code`        | **target forzado `🔄 En progreso`; NUNCA `✅ Completo`**                                            | El gate de completitud recorrería un `EXECUTION-ORDER.md` que no conoce los issues de deuda (todavía no existen) y declararía el proyecto terminado |
| `backlog sync`     | **no** dispara `--epic --status done`                                                              | Un epic en progreso no es `done` en el board del cliente                                                                                        |
| Commit final       | subject propio: `chore(backlog): EPIC-NN parcial — N pendientes` + `Refs: EPIC-NN`, **con los planes de remediación en el `git add`** (+ `quality-gates.project.json` si la opción 3 de **4.8** agregó una entrada con aprobación) | Reusar `close EPIC-NN` viola `GIT.md §3.1` — nada se cerró. Y sin los planes en el commit, el `> **Plan source:**` de cada issue emitido apuntaría fuera del árbol |

**Planes de remediación — un archivo por destino, y corren en los DOS cierres.** La deuda **fuera** de la frontera (4.7.2) no bloquea el cierre, así que un epic que cierra **normal** puede dejar deuda igual: los planes y el handoff de abajo no son exclusivos del cierre parcial. Se escriben desde [`REMEDIATION-PLAN.template.md`](../tk-backlog/templates/REMEDIATION-PLAN.template.md) (vive en `tk-backlog` porque el contrato que satisface es el de su parser) en `project/backlog/{LAYOUT}/remediation/EPIC-NN-{run-id}.md` — **tracked**, nunca `implement-artifacts/` (gitignored: el `Plan source` de cada issue nacería con una ref muerta):

| Deuda                                                   | Archivo                       | Destino — **una** invocación por archivo                                                                                   |
| ------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Dentro** de la frontera (4.7.2), necesita decisión    | `EPIC-NN-{run-id}.md`         | `/backlog extend-epic EPIC-NN <plan>` — es de este epic                                                                    |
| **Fuera** de la frontera — **sólo lo que CP-B mandó a issue** (`L` con consecuencia, o fix fallido), en un solo archivo | `EPIC-NN-{run-id}-fuera.md`   | **un solo** `/backlog add <plan>` → epic de deuda nuevo (o `extend-epic` sobre el que ya esté abierto en el layout activo). Lo chico ya se arregló y las observaciones viven en el QC delta: **ninguno de los dos entra al plan** |

🔴 **La deuda de fuera va consolidada en UN archivo con N ítems — nunca N archivos ni N invocaciones.** El template ya es multi-ítem (**un heading por ítem, nunca por bucket**), así que consolidar no le pide nada nuevo: es el mismo shape con más unidades, y el contrato del parser se cumple ítem por ítem igual que con uno solo — heading en imperativo, ≥1 archivo **en lista**, ≥1 bullet de verificación. Consolidar **no relaja ninguna de las tres**.

🔴 **Los dos archivos NO se fusionan.** Cada corrida de `/backlog` consume **un** plan con **un** destino: el parser clasifica heading por heading con first-match-wins y no lleva noción de destino por ítem, así que un archivo mixto mandaría al mismo epic cosas que pertenecen a dos. Son dos audiencias — este epic vs. uno nuevo.

🔴 **Inmutables una vez escritos.** Su hash alimenta el drift detection de `/backlog validar`; una vuelta posterior escribe un archivo nuevo, nunca appendea a éste. La consolidación es **por corrida**, no acumulativa: la deuda de dos corridas parciales del mismo epic (retomado con `--start-at`) vive en dos archivos, uno por corrida.

🔴 **Titular cada ítem en imperativo de acción** (`"Definir si el borrado es lógico o definitivo"`), **nunca** con la pregunta ni el nombre del bucket. El parser clasifica con first-match-wins y descarta en silencio lo que suene a *Decisiones · Riesgos · Fuera de alcance · Verificación* — **antes** de mirar sus archivos. El template lo detalla; esto es sólo el recordatorio en el punto donde se escribe.

🔴 **Estampar `Refutado:` — SÓLO en el archivo de fuera, nunca en el del epic.** Los sobrevivientes de **4.7.2.1** registran la consulta que corrió (el grep, el test, el comando); esa línea se copia del QC delta al ítem correspondiente como `Refutado: <la consulta>`, y es lo que hace que el panel adversarial de [`tk-backlog §12.5`](../tk-backlog/SKILL.md) no vuelva a preguntar *¿existe?* sobre algo ya verificado con el repo caliente. Sin ella el dato **no cruza la frontera entre workflows**: `/backlog` corre en otra sesión y lo único que recibe es este archivo.

| Archivo | ¿Lleva `Refutado:`? | Por qué |
| --- | --- | --- |
| `EPIC-NN-{run-id}-fuera.md` | **Sí**, por ítem sobreviviente | Es exactamente el conjunto que 4.7.2.1 refutó — su título lo dice: *refutación de lo que salió de la frontera* |
| `EPIC-NN-{run-id}.md` (del epic) | 🔴 **NO, jamás** | La deuda **dentro** de la frontera nunca pasó por 4.7.2.1. Estampar la línea ahí afirmaría una verificación que no ocurrió, y el panel dejaría de preguntar *¿existe?* sobre algo que nadie miró |

- **Va la consulta, no la conclusión.** Clase de evidencia cerrada de [`fx-execution-policy`](../fx-execution-policy/SKILL.md) § Refutación de deuda: test rojo · línea de log · resultado de una búsqueda en el código. *"Ya lo revisé"* no califica y es **peor que omitir la línea**.
- **Omitirla es seguro; inventarla no.** Un ítem sin `Refutado:` hace que el panel pregunte todo — el default correcto. Un ítem con una línea vacía o genérica compra silencio sobre una verificación que no existió.
- **Una observación que el user rescató desde Revisar no lleva la línea**: falló una de las tres primeras preguntas, así que su alcance no quedó re-derivado contra el repo. Sólo la lleva el **sobreviviente**.

**El handoff es UNA pregunta, y la invocación la hace `/implement`.** No es una instrucción para que el user corra `/backlog` por su cuenta más tarde: al cerrar, el orquestador ofrece emitir y con el "sí" invoca él mismo. **Una sola pregunta cubre los dos planes** — nunca una por ítem de deuda, nunca una por archivo:

```
{cierre parcial:}  Epic 27 queda abierto — 2 pendientes suyos requieren decisión.
{cierre normal:}   Epic 27 cerrado. Quedaron 3 pendientes fuera de su alcance.
  · Plan del epic:  project/backlog/v1.0/remediation/EPIC-27-{run}.md (2 ítems)
  · Fuera del epic: project/backlog/v1.0/remediation/EPIC-27-{run}-fuera.md (3 ítems)

| 1 | Los emito ahora y seguimos    |
| 2 | Los dejo para después          |
```

- **Opción 1 → el orquestador corre `/backlog`**, una vez por archivo y en este orden: `extend-epic EPIC-NN <plan del epic>`, después `add <plan de fuera>`. El `/backlog add`/`extend-epic` del handoff corre el **pipeline completo** — `tk-backlog` no tiene atajos por volumen: sus gates, su barrido y sus checkpoints corren igual que en cualquier otra invocación, y el panel de su Phase 7 es el que le fijen el modo y el tier de riesgo que resuelva sobre los archivos que el plan de remediación enumera ([`tk-backlog §24`](../tk-backlog/SKILL.md)), exactamente como en cualquier otra corrida plan-mode. Un plan de deuda que toque paths sensibles compra la composición completa por su superficie, nunca por venir de aquí. La invocación es **limpia, nunca inline**: inline anidaría los checkpoints de `/backlog` dentro de los nuestros.
- **Opción 2 →** los planes quedan escritos y tracked; el guard de Phase 0 los vuelve a surfacear en la próxima corrida. Nada se pierde.
- **Un plan sin ítems no se escribe** y su línea no se emite. **Cero ítems en los dos → no hay handoff:** ninguna pregunta, nunca una vacía ("¿emito el epic de deuda?" sin deuda que emitir).

**Verificación de conteo (cierra el drop silencioso).** El mensaje declara cuántos ítems lleva cada plan — **incluido el consolidado de fuera de frontera**, que es el que concentra N ítems en un archivo y por lo tanto el que más tiene que perder. Tras correr `/backlog`, comparar los issues emitidos contra ese número, **plan por plan**: si no coinciden, el parser descartó alguno por su heading (first-match-wins) y hay que revisarlo. Convierte un fallo invisible en uno que salta. Es el mismo mecanismo de siempre — la consolidación no agrega uno nuevo, sólo lo hace más necesario.

**En cierre NORMAL:**

- Marca el **epic** `✅ Done` + `Completed:` + escribe Implementation Evidence del epic.
- `pnpm update-board` (rollup a `BOARD.md`).
- **Actualizar la fila `Code` en `project/planning/project-config.md` §2 Pipeline Status** (cumple el contrato del template `Cada workflow actualiza su fila al cerrar`). A diferencia de Backlog/Design, `Code` es **incremental** (un run cierra un epic, no el proyecto) → lleva **gate de completitud**. Flujo **Read-first → branch**:
  - **Guards (skip sin tocar nada):** **solo epic mode** — issue mode (fix puntual) NO toca `Code` · `is_factory: true` (tabla schema-v2 propia del Factory).
  - **Gate de completitud (reusa el algoritmo de `--next`):** recorrer `EXECUTION-ORDER.md` (estado post-`update-board`). Si **queda algún** issue `ready` / `in-progress` (hay un próximo objetivo) → target estado = `🔄 En progreso`. Si **no queda ninguno** (todos `✅ Done` / `🚫 Blocked` / `❌ Won't Do`) → target estado = `✅ Completo`.
  - **Read** `project-config.md`, localizar `## 2. Pipeline Status` y la fila cuyo primer campo es `Code`.
  - **Sección/fila ausente** → warning de 1 línea + continuar (no falla). **Celda ya == target** → skip real (no-op). **Distinta** → `Edit` con `old_string` **literal de la línea leída** (padding incluido), 1 celda: Estado → target.
  - Surface en el handoff: _"Marqué Code {🔄 En progreso | ✅ Completo} en project-config."_ (o el warning).
- **Commit final** `chore(backlog): close EPIC-NN` con footer `Refs: EPIC-NN` (epic file + `BOARD.md` + `project-config.md` si la fila `Code` cambió + **los planes de remediación si se escribieron** — un cierre normal también puede dejar deuda fuera de frontera, y sin el plan en el commit el `> **Plan source:**` de cada issue emitido apuntaría fuera del árbol + `.claude/policy/quality-gates.project.json` si la opción 3 de **4.8** agregó una entrada con aprobación) → **árbol limpio** (`git status` vacío).
- **[sync best-effort, POST-commit]** **solo si `BACKLOG_CENTRAL=on`** (preflight de §9): `npx @timekast/factory backlog sync --epic EPIC-NN --status done` — después del commit final, fire-and-forget (§9 → _Sync de status a backlog-central_). Su fallo nunca bloquea el cierre del epic.
- **Cleanup del `{run-id}/`** con flag check `--keep-artifacts`. Si el flag está activo, actualiza `status: closed` en el frontmatter del plan ANTES del cleanup (para audit retroactive). Sin flag, escribir `status: closed` sería write inútil (el `rm -rf` borra el file).

  ```bash
  # Pre-condiciones (contrato del orchestrator):
  #   ${ARGUMENTS}      — args del slash command (puede estar vacío)
  #   ${RUN_ID}         — timestamp+slug generado en Phase 0. Guard defensivo abajo.
  #   ${EPIC_PLAN_PATH} — project/implement-artifacts/${RUN_ID}/epic-plan.md
  [ -n "${RUN_ID}" ] && [ -d "project/implement-artifacts/${RUN_ID}" ] || exit 0

  if echo "${ARGUMENTS:-}" | grep -qE '(^|[[:space:]])--keep-artifacts([[:space:]]|$)'; then
    # Update status para audit (solo si el plan va a sobrevivir)
    sed -i.bak 's/^status: in_progress$/status: closed/' "${EPIC_PLAN_PATH}" && rm -f "${EPIC_PLAN_PATH}.bak"
    echo "ℹ️  artifacts del run ${RUN_ID} conservados (--keep-artifacts); plan marcado status: closed"
  else
    rm -rf "project/implement-artifacts/${RUN_ID}" && \
      echo "🧹 ${RUN_ID} limpiado"
  fi
  ```

- Recommend → `/implement --next` o `/deploy`.

---

## 8. Checkpoints — doctrina

| CP       | Mecanismo        | Cuándo                                                                 | Tabla                                         |
| -------- | ---------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| **CP-A** | Plan Mode formal | Post-plan, antes de tocar código. HIGH-risk (autoriza el epic entero). | 1 Aprobar / 2 Ajustar / 3 Cancelar            |
| **CP-B** | Inline + STOP    | Post-ejecución, antes de cerrar + push.                                | 1 Completar / 2 Revisar / 3 Dejar en progreso |

**Puntos de parada del workflow, y su comportamiento headless:**

| Punto                              | Fluido | `--step` | **Headless**                                                      |
| ---------------------------------- | ------ | -------- | ------------------------------------------------------------------ |
| **Drift del backlog** (§2.0, solo si el predicado lo detecta) | para (replan) | para | **fail-closed** — aborta con la causa citada (los paths discordantes), **sin spawnear** el dimensionamiento: mismo patrón que §2.2 — resolver primero, nunca pagar un pase que no se va a consumir |
| **Panel plan-time** (§2.2, solo si el riesgo lo trae) | narra (no para) | íd. | **fail-closed** — se resuelve el riesgo y se **aborta ANTES de spawnear**, con la causa citada (CP-A ya es fail-closed: spawnear pagaría una revisión completa para no ejecutar nada) |
| **CP-A** (Plan Mode)               | para   | para     | **fail-closed** — no se ejecuta el epic sin aprobación             |
| **CP-B** (§Phase 4)                | para   | para     | **fail-closed**                                                    |
| **Micro-gate área sensible** (4.7.4) | para   | para     | **fail-closed** — el ítem va a issue; el fix NO se aplica          |
| **Gate de riesgo del cierre** (4.6, riesgo ≥3) | narra (no para) | íd. | **fail-closed** — riesgo ≥3 sin aprobador presente aborta con causa, nunca auto-aprueba |
| **Post-hoc de riesgo** (4.8, si sube el nivel **o** crece el panel) | para | para | **fail-closed** — TODA escalación aborta (el CP no tiene quién la responda), incluida la de panel sin cambio de nivel; no solo riesgo ≥3 |
| Tabla de decisiones de CP-B (§CP-B) | para (por fila) | íd. | **fail-closed** — con CP-B; ninguna fila se resuelve sola      |
| Sub-flujo de la opción 2 de CP-B   | disponible | disponible | **inalcanzable** — transitivamente, porque CP-B es fail-closed |
| Segunda pasada del fix-loop (4.7.7) | corre tras CP-B | íd. | **inalcanzable** — transitivamente, porque CP-B es fail-closed |
| Descartar un ítem de deuda (4.7.3 · opción 3 de la tabla) | instrucción de texto del user | íd. | **fail-closed** — no se descarta; va a issue |
| Filtro de refutación (4.7.2.1) y registro de `mejora` (4.7.3) | no para — retira a Observaciones | íd. | **igual** — retirar y registrar no piden respuesta; lo chico que sobrevive se arregla igual en headless (con el micro-gate 4.7.4 fail-closed intacto) |
| Confirmación de un clic — reescribir un AC mal escrito (fix chico, `fx-execution-policy` § Refutación) | para (una pregunta) | íd. | **fail-closed** — el AC no se toca; el ítem va a la tabla / issue con la causa |
| **Tope por AC** (4.7.6, excepción) | para   | para     | **fail-closed** — el AC va a issue; no hay tercera vuelta          |

🔴 El fail-closed del micro-gate es la decisión que sostiene el resto: sin aprobador, "el camino de menor esfuerzo produce el mejor resultado" degeneraría en *"el agente arregla schema y auth solo"* — el escape de CP-A que 4.7.4 existe para cerrar (`CC.md §4`). En un runtime headless con curador HITL (`tk-provision §modo`), las preguntas llegan por otro canal; lo declarado aquí es el comportamiento **sin aprobador de ningún tipo**.

Ambos CPs **paran y esperan una elección explícita** del user en fluido y en `--step` — CP-A es HIGH-risk (Plan Mode, autoriza el epic entero; `CC.md §4` lo mantiene siempre, y su gate sigue siendo **`ExitPlanMode`**: la vía estructurada presenta opciones, nunca sustituye ese gate) y CP-B encierra la decisión de push/merge (`GIT.md §2`). Por la vía estructurada la elección es la respuesta de la tool; por el fallback de tabla, la respuesta numérica — y ahí no se acepta "ok"/"sí" libre: re-presentar. **Hard-STOP sin CP** solo para lo imprevisto: un blocker/ciclo nuevo, una op destructiva fuera del plan, o un loop (QC/integración) que agotó reintentos → escala al user en plain language.

> **Excepción `EPIC-00-bootstrap`:** el bootstrap NO corre CP-A — su gate HIGH-risk (Plan Mode) es el **CP2 de `tk-provision`** dentro de `SETUP-001` (ver § Bootstrap epic). `CC.md §4` se honra ahí, no en un CP-A redundante; no es un bypass del gate, es su reubicación al punto irreversible real.

> **Modo fluido en implement (`fx-workflow-authoring §7.1`):** implement ya corre "suelto" entre CP-A y CP-B. El único punto que el modo toca es el **alto liviano entre grupos** (§Phase 3) — NO es checkpoint: en **fluido** (default) auto-continúa al siguiente grupo (= comportamiento de hoy), en **`--step`** hace una pausa opcional ("¿sigo?") antes de cada grupo. CP-A y CP-B intactos. La inclusión de implement en el modo fluido es por **consistencia de flags kit-wide**, no porque tuviera torpeza (ya fluía).

---

## 9. 🔴 B1 — Cierre por-issue ANTES del commit (orden inviolable)

Dos consumidores leen estado distinto (verificado contra el repo):

- **`validate-commit.sh`** bloquea `Closes: {ID}` si el issue no tiene `## Implementation Evidence` **o** no está `✅` en su **epic file**.
- **`update-board.ts`** (`parseStatus`) lee el `> **Status:**` del **issue file**, NO la tabla del epic.

Por eso, el orden por issue en Phase 3 es (todo lo de backlog docs lo escribe el **orquestador**, no el executor):

1. Implementation Evidence en el issue file — incluida la línea `Reintentos del executor: N de 3` con el conteo que el executor reporta por issue (su output contract): la Evidence es el único registro durable de esa métrica, los artifacts del run se borran en Phase 5.
2. Issue file → `> **Status:** ✅ Done` + `Completed: {YYYY-MM-DD}`.
3. Issue marcado `✅` en la tabla del epic (+ `Started:` del epic si estaba vacío).
4. Commit atómico (código + issue file + epic file) con `Closes: {ID}`.
5. **[sync best-effort, POST-commit]** **solo si `BACKLOG_CENTRAL=on`** (preflight de §9): `npx @timekast/factory backlog sync --issue {ID} --status done` — SOLO después del commit del paso 4. **NUNCA** entre el flip de `> **Status:** ✅ Done` (paso 2) y el commit (paso 4).

Cerrar todo en batch al final **rompería todos los commits** (el hook bloquea). Phase 5 cierra solo el **epic**. El cierre incluye verificar la presencia de Evidence + el epic-row `✅` + el `Started:` lifecycle del epic antes del commit.

### Sync de status a backlog-central (best-effort, nunca gate)

`/implement` espeja el ciclo de vida de cada issue/epic en backlog.timekast.mx vía `npx @timekast/factory backlog sync` (fire-and-forget, timeout 5s, sin API key configurada → exit 0 silencioso). Se dispara en tres puntos:

- **`--issue {ID} --status in_progress`** — al spawnear el executor (Phase 3 paso 1).
- **`--issue {ID} --status done`** — DESPUÉS del commit atómico del issue (paso 5 de la lista de arriba; nunca antes).
- **`--epic {ID} --status done`** — después del commit final de cierre de epic (Phase 5.2).

#### 🔴 Preflight `BACKLOG_CENTRAL` — una vez por run, ANTES del primer disparo

Los tres puntos de arriba se disparan **solo si el proyecto está dado de alta en el central**. El CLI ya degrada a exit 0 sin credenciales, pero eso no basta: sin este preflight, un epic de 20 issues arranca **41 procesos `npx`** (2 por issue + 1 del epic) que salen a resolver el paquete contra npm para terminar imprimiendo _"omitido"_. El alta hoy **no es automática** (requiere `factory provision --services=backlog` a mano), así que el caso `off` es el default de la flota, no la excepción.

El preflight es **local y sin red** — se evalúa **una sola vez** al arrancar el run (Phase 2, junto al resto del contexto del epic) y su resultado vale para todo el run.

🔴 **El bloque bash NO vive aquí — hacer `Read` de [`fx-backlog-central`](../fx-backlog-central/SKILL.md) § _El bloque canónico del preflight_ y evaluarlo ahí mismo.** Es su SSOT (lo comparte con `tk-backlog`, que lo lee igual). El `Read` es **explícito y obligatorio** (`CC.md §2`): esa skill se auto-carga por triggers semánticos de usuario que **no** coinciden con este momento del flujo, así que confiar en el auto-routing dejaría el preflight sin evaluar justo cuando hace falta.

- **`BACKLOG_CENTRAL=off` → CERO invocaciones de `npx` en todo el run.** Una nota de 1 línea al arrancar (_"Backlog central no configurado en este repo — no espejo status."_) y ningún mensaje más: no se repite por issue.
- **`BACKLOG_CENTRAL=on`** → los tres disparos corren tal cual (fire-and-forget, never-gate).
- El preflight **no reemplaza** la degradación del CLI — la duplica barato del lado del caller. Si el alta ocurre a mitad de run, el sync arranca en el **siguiente** run; no se re-evalúa por issue.

🔴 **Es best-effort, NUNCA un gate** — mismo principio que `tk-deploy §7.5.6`: _"Es best-effort observability, NUNCA un gate. Su fallo no aborta el release — el tag ya está pusheado e inmutable, y la Action es re-ejecutable aparte."_ Aquí el commit local es la fuente de verdad y el sync solo lo espeja a remoto: un fallo del sync — red caída, CLI ausente, sin key — **NUNCA** bloquea, aborta ni pausa `/implement`.

- **Guard de disponibilidad:** `BACKLOG_CENTRAL=off` (preflight de arriba) → no se invoca nada. Con `on`, si el CLI igual no está instalado o la key resulta inválida → skip-con-nota de 1 línea y el flujo sigue normal (el propio comando degrada a exit 0; el orquestador no lo trata como error).
- **Orden inviolable del `done`:** el `--status done` va SIEMPRE post-commit. Dispararlo entre el flip de `> **Status:** ✅ Done` (paso 2) y el commit (paso 4) empujaría a remoto un estado que el commit local todavía no selló — si el commit falla (el hook `validate-commit.sh` bloquea por Evidence o epic-row `✅` faltante), remoto quedaría adelantado de la verdad local. Post-commit garantiza que remoto solo refleja lo ya commiteado. Es la razón por la que el sync `done` es el paso 5 y no un paso intermedio.
- **Headless (sin TTY):** comportamiento idéntico — fire-and-forget, sin degradar a un prompt que nadie contesta. El sync nunca introduce un checkpoint nuevo.
- **Single-issue mode:** aplica igual (no es exclusivo de epic mode). El fix de un issue suelto dispara `in_progress` al arrancar y `done` post-commit, con las mismas garantías.

### Perfil de tiempos del run (`timings.jsonl`, best-effort, nunca gate)

Dónde se va el reloj de un epic era hasta ahora una estimación. El orquestador escribe una línea JSON por evento en `project/implement-artifacts/{run-id}/timings.jsonl` — mismo directorio que los `verify.N.log`/`e2e.N.log`, así que entra en el cleanup canónico de Phase 5 y sobrevive con `--keep-artifacts`.

```bash
# Helper del orquestador: tick <phase> <start|end> [ref]
tick() {
  printf '{"t":%s,"phase":"%s","event":"%s","ref":"%s"}\n' \
    "$(date -u +%s)" "$1" "$2" "${3:-}" \
    >> "project/implement-artifacts/${RUN_ID}/timings.jsonl" 2>/dev/null || true
}
```

Puntos de captura mínimos — menos que esto no permite decidir nada, porque el reparto entre **trabajo de modelo**, **e2e** y **verificación mecánica** es justo lo que hay que distinguir:

| Dónde                                | `phase`                                                        | `ref`                     |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------- |
| Phases 0, 1, 2, 5 (completas)        | `phase-0` … `phase-5`                                          | —                         |
| Phase 3, por issue                   | `issue`                                                        | el issue ID               |
| Phase 3, dentro de cada issue        | `executor` · `verify` · `commit`                               | el issue ID               |
| Phase 3, spawn agrupado (§7 Phase 3) | `executor`                                                     | los IDs separados por `+` |
| Phase 4, por sub-fase                | `4.1-verify` · `4.2-qc` · `4.6-audit` · `4.7-debt`             | —                         |
| **cada** corrida de e2e, por separado | `e2e-run`                                                      | `full` o los specs        |

El `ref` del spawn agrupado es lo que permite comparar los dos regímenes —agrupado vs individual— dentro de una misma corrida, sin necesidad de un A/B previo.

🔴 **Best-effort, nunca gate** — mismo principio que el sync a backlog-central. El `|| true` no es decorativo: un perfil incompleto es degradación aceptable, un run bloqueado por su propia instrumentación no lo es. Nunca hay `set -e` alrededor de `tick`.

---

## 10. Invalidation handling

- **Upstream cambió tras CP-A** (se re-corrió `/backlog`/`/design` a media ejecución): el hash de inputs del `EPIC-PLAN` persistido deja de coincidir → al retomar, re-plan + re-CP-A (no se ejecuta con un plan viejo).
- **El user ajusta el plan en CP-A (opción 2):** re-emitir el `EPIC-PLAN` y re-presentar CP-A; no se ejecuta nada hasta aprobar.
- **Un issue revela trabajo que pertenece a otro issue** (Phase 3/4): NO ampliar el scope del issue actual (diff-ownership lo bloquea) → reportarlo en el campo `Deuda detectada:` del executor, que lo lleva a **4.7**: ahí se decide si es del epic (se corrige) o no (queda registrado). Un AC incumplido entra por la misma vía con clase `rompe` (§4.3) — la ruta "reabrir el issue cerrado" está retirada.
- **Blocker/ciclo nuevo:** hard-STOP → el user decide (resolver inline / `DECISION` / deferir).

---

## 11. Subprocess delegation

| Agent                     | Phase | Spawn justificado por                                                                                                 | Tools                               | Model     |
| ------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------- |
| `imp-issue-executor`      | 3     | **aislamiento de contexto** (contexto fresco por lote; orquestador sin saturar). Corre **secuencial**, un lote a la vez; un lote es 1..4 issues consecutivos de una cadena que comparten archivo (§7 Phase 3). | Read, Grep, Glob, Edit, Write, Bash | `opus` |
| `architect` (keep)        | 2 · 4 | **panel plan-time sobre el PLAN** (§2.2: riesgo ≥3 · `meta-foundation` · o el piso en prosa —schema nuevo / patrón no documentado / decisión irreversible—) **+** panel del gate del cierre sobre el **DIFF** cuando `require` ∪ `panel_by_risk` lo trae (4.6, y el post-hoc 4.8 si escala el gate — nivel **o** panel). 🔴 **Los dos spawns coexisten** — la dedup de 4.6 es por objeto revisado, no por run | Read, Grep, Glob, Bash (**sin `Edit`/`Write`** — corre antes de CP-A, que garantiza cero writes durables al cancelar) | `opus` |
| `grounding-auditor` (keep) | 2 | **dimensionar el drift del backlog** (§2.0, sólo si el predicado mecánico detectó paths discordantes): establece cuánto se movió el repo respecto de lo que los issues del SELECTION SET suponen — mandato *dimensionar, no diseñar* ([`fx-execution-policy §7`](../fx-execution-policy/SKILL.md)); su salida alimenta un **replan, nunca un panel**. Solo report, read-only | Read, Grep, Glob, Bash (**sin `Edit`/`Write`** — corre antes de CP-A, mismo registro que `architect`: cero writes durables al cancelar) | `opus` |
| `quality-engineer` (keep) | 4     | QC report del epic (solo report, no fixes); + re-spawn en **4.7.2.1** para refutar la deuda fuera de frontera antes de CP-B (un solo spawn para los N ítems) | Read, Grep, Glob, Bash | `opus` |
| `security-auditor` (keep) | 2 · 4 | **panel plan-time sobre el PLAN** (§2.2: cuando alguna regla que matchea los paths enumerados lo trae en su `require`) **+** security audit del epic sobre el **DIFF** (4.6, condicional; + su post-hoc 4.8 si el diff real **escala el gate** — nivel **o** panel) — threat-modeling; solo report; `Critical`/`High` bloquean CP-B | Read, Grep, Glob, Bash | `opus` |
| `ui-critic` (keep)        | 3 · 4 | revisión visual sobre UI renderizada — **dos puntos de spawn, los dos del orquestador** (el executor no tiene Agent tool): el issue in-epic en su turno de Phase 3 (§4.4) y el re-check condicional sobre el delta del fix-loop (4.7.5) | Read, Grep, Glob | `opus` |
| `fx-factory-reviewer`     | 4     | panel del gate del cierre sobre el **DIFF**, cuando `require` ∪ `panel_by_risk[risk]` lo trae — la regla del registry para `.claude/**` (`pj-*` exceptuado) lo pone en `require`, y un override de proyecto puede sumarlo por `panel_by_risk` (unión aditiva, `fx-execution-policy §4.2`): enunciarlo sobre `require` solo volvería ese endurecimiento un no-op silencioso: review adversarial del cerebro del kit (skills, agents, rules, commands) contra el SSOT del kit. Solo report, no fixes; sus findings entran a 4.7 con su clase (mapeo en 4.7.1). **No corre plan-time** (§2.2: su lente pide el artefacto escrito, no el plan) | Read, Grep, Glob | `opus` |

**Delegación = agents-as-skills (`CC.md §2` + `fx-workflow-authoring §8`):** el conocimiento de dominio (api/db/ui/testing/security) se **consulta como skill** desde el executor/main loop (la `sk-*`/`pj-*` del dominio, `sk-crud-scaffold` para CRUD; `kb-*` sólo donde no hay `sk-*` que cubra el dominio), NO se spawnea un "specialist" por dominio (esos se retiraron). El `imp-issue-executor` es el único subproceso propio; los demás son keeps genéricos invocados cuando su rol aplica. Otros keeps disponibles: `code-archaeologist`, `flutter-mobile`.

Al invocar cualquier subproceso, citar paths repo-relative de skills en el prompt (`CC.md §2`): `consulta antes de empezar: .claude/skills/<nombre>/SKILL.md, ...`.

---

## 12. Naming Conventions (código generado)

| Tipo             | Convención      | Ejemplo           |
| ---------------- | --------------- | ----------------- |
| Componentes      | PascalCase      | `UserCard.tsx`    |
| Utilities        | kebab-case      | `date-utils.ts`   |
| Actions          | kebab-case      | `user-actions.ts` |
| Variables/funcs  | camelCase       | `getUserById`     |
| Types/Interfaces | PascalCase      | `CreatePickInput` |
| Constantes       | SCREAMING_SNAKE | `MAX_PICKS`       |
| DB columns       | snake_case      | `created_at`      |

---

## 13. Issue/Epic Status (formato exacto para `update-board`)

El vocabulario canónico de 6 estados (`📋 Backlog` / `🚧 In Progress` / `✅ Done` / `⏸️ Deferred` / `❌ Won't Do` / `🚫 Blocked by [ISSUE-XXX]`) vive en [`tk-backlog/methodology/issue-shape.md`](../tk-backlog/methodology/issue-shape.md) § Status vocabulary — **SSOT único**; este skill lo referencia, NO lo redefine. `parseStatus()` (`scripts/tools/update-board.ts`) clasifica cada estado en su bucket (incl. `blocked`). `⏸️ Postponed` es sinónimo legacy de `Deferred` que el parser acepta — no emitirlo en issues nuevos.

---

## 14. Out of scope (v2)

- Paralelismo / worktrees / anti-colisión — serial single-tree, un executor a la vez.
- Push/merge automático — manual (`GIT.md §2`); v2 commitea local atómico por issue.
- **Emitir issues.** Phase 4.7 escribe **planes**, no issues: el shape, los IDs, los gates de DoR y la actualización de `EXECUTION-ORDER`/`Topology` son de `/backlog`, que los aplica igual venga el plan de donde venga. `/implement` aporta el input **y dispara la invocación** (5.2) — lo que no hace es emitir el issue.
- Gate técnico de migración SQL a media ejecución — reemplazado por "áreas sensibles en CP-A" + el camino no-destructivo del kit (`db:generate`+`db:migrate`, nunca `db:push` — `SK.md §1.1`).
- Multi-epic en una corrida — un epic por invocación.
- Auto-creación de issues faltantes — eso es `/backlog add`.

---

_TimeKast Factory — tk-implement v2.12 (Phase 2.0 detecta el drift del backlog antes de CP-A; la compuerta de cierre corre la verificación que puede observar el diff)_
