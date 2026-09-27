# Readiness Gates — CP1 · CP2 · CP3 · CP4 · Phase 8.5 · Phase 8.6

> Detail of checkpoint flow, blocker resolution cycles, Pre-CP4 canonical state sweep, and invalidation handling. Companion to `tk-design SKILL.md §9-§19`.
>
> **v6.2.0 numbering:** post-fix introduced a new CP3 (SCR classification approval, inline) between CP2 and the per-screen contracts batch. The old CP3 (Plan Mode formal) is now CP4. Old Phase 7.5 / 7.6 are now Phase 8.5 / 8.6. Phase 8 (emit) is now Phase 9.

---

## 1. Four checkpoint tiers

`tk-design` uses four checkpoints, matching the doctrine in `fx-workflow-authoring §7`:

| Tier | Risk level | Format                                                                                    | Position                                     |
| ---- | ---------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| CP1  | LOW-MED    | Inline checkpoint table (`fx-workflow-authoring/templates/checkpoint-inline.template.md`) | Post-Phase 2 Visual Direction                |
| CP2  | MED        | Inline checkpoint table                                                                   | Post-Phase 3 Information Architecture        |
| CP3  | MED-HIGH   | Inline checkpoint table                                                                   | Post-Phase 4 SCR Classification (NEW v6.2.0) |
| CP4  | HIGH       | Plan Mode formal (`fx-workflow-authoring/templates/checkpoint-planmode.template.md`)      | Post-Phase 8.6 Pre-CP4 Sweep PASS            |

Rationale per tier:

- **CP1 (LOW-MED):** Visual direction is reversible — re-running Phase 2 is cheap if user pivots. Inline format keeps friction low.
- **CP2 (MED):** IA defines screen IDs (sticky once accepted). User can still add/remove screens but the structural commitment is non-trivial.
- **CP3 (MED-HIGH, NEW v6.2.0):** Classification tier election + skill-gap acknowledgements drive the wall-clock + spec quality of Phase 5. Surface boundary cases + skill-gaps to the user explicitly. Per-screen override allowed via opt 3 sub-flow.
- **CP4 (HIGH):** The output of CP4 is the durable artifact consumed by `/backlog` and `/implement`. Plan Mode formal ensures explicit synthesis review.

## 2. CP1 — Visual Direction approval (inline)

Position: post-Phase 2. Only fires in `nuevo` mode (`con-direccion` and `validar` skip Phase 2 + CP1).

Format (plain language per `.claude/rules/CC.md §3` + `tk-design SKILL.md §2`):

```
🛑 CP1 — Dirección visual propuesta

Skin family: {name}
Razón: {2-3 sentences anchored to 00_DISCOVERY_BRIEF §11.1}
Migración SK: {0 / X tokens to extend / N/A (no SK)}

### Opciones
| 1 | Aprobar — proceder a Phase 3 (Information Architecture)        |
| 2 | Pivotar — escoger otra skin (orchestrator presents 1-2 candidatos) |
| 3 | Cancelar — workflow ends                                       |
```

### 2.1 Invalidation handling

| Trigger                    | Effect                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| User picks `2. Pivotar`    | Re-run Phase 2 only with alternative skin candidate. Re-emit CP1.                                                                        |
| User picks `3. Cancelar`   | Workflow ends. No writes to `project/planning/`.                                                                                         |
| Late info arrives post-CP1 | If still in Phase 3 → orchestrator decides patch vs re-CP1 inline. If past Phase 3 → flag in §10 Consumer Readiness as caveat, continue. |

## 3. CP2 — Information Architecture approval (inline)

Position: post-Phase 3.

Format:

```
🛑 CP2 — Arquitectura de información propuesta

Screen Map: {N} pantallas
  - Visibles en nav: {V}
  - Admin / hidden: {A}
  - Modales / sheets: {M}
Sidebar: {X items}
BottomNav: {Y items} + More sheet ({Z items})
Flow Map: {F} flujos multi-pantalla

SCR IDs asignados ({sticky_count} sticky de runs previas, {new_count} nuevos).

### Opciones
| 1 | Aprobar — proceder a Phase 3.5 + Phase 4 (classification)     |
| 2 | Editar — agregar/quitar pantallas, cambiar allocation          |
| 3 | Cancelar — workflow ends                                       |
```

### 3.1 Invalidation handling

| Trigger                                      | Effect                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| User picks `2. Editar`                       | Orchestrator amends sitemap + Screen Map per user input. Re-emite §2 + §3 + §4 + re-CP2.            |
| User picks `3. Cancelar`                     | Workflow ends. No writes.                                                                           |
| User asks to rename a SCR slug               | Orchestrator schedules archive of old SCR file (if previously emitted) + new emission con new slug. |
| User asks to remove a SCR previously emitted | Tombstone the SCR ID in §3 + move the file to `16_DESIGN/_archive/`.                                |

## 4. CP3 — SCR Classification approval (NEW v6.2.0, inline)

Position: post-Phase 4 (SCR classification). Orchestrator inline pass, NOT plan mode.

Format:

```
🛑 CP3 — Clasificación de pantallas

Clasifiqué las {N} pantallas en 3 tiers:
  • {A} kit-pure — pantallas que ya shippea el kit sin customization
    → stub de 5 líneas, sin spec completo
  • {B} kit-extended — kit + extensiones específicas (campos custom, validation custom)
    → spec light de 5 secciones
  • {C} custom — pantallas a diseñar desde cero (dashboards, admin tooling)
    → spec full de 13 secciones

Detecté {X} skill-gaps en packets (skills relevantes faltantes):
  • SCR-XXX {nombre} — falta {skill} (mencionado en contenido del shard)
  • ...

Casos en borderline para tu revisión:
  • SCR-YYY {nombre} — clasificado {tier} porque {razón breve}. ¿Confirmas?
  • ...

### Opciones
| 1 | Aprobar clasificación + completar skill-gaps (recommended)         |
| 2 | Aprobar pero NO completar skill-gaps (degradación informada)       |
| 3 | Override per-screen — quiero subir/bajar algunas de tier           |
| 4 | Cancelar — quiero revisar packets antes de continuar               |
```

### 4.1 Invalidation handling (per `tk-design SKILL.md §21`)

| Trigger                                        | Effect                                                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User picks `1. Aprobar + completar skill-gaps` | Orchestrator updates `skills_consult[]` in per-SCR shards correspondientes. Proceed to Phase 5.                                                                                            |
| User picks `2. Aprobar sin completar`          | Per-SCR shards mantienen `skills_warning: [...]` + `skills_warning_acknowledged: true`. Specer recibe set incompleto + ack flag → emite `> ⚠ Skill gap acknowledged...` inline.            |
| User picks `3. Override per-screen`            | Sub-flow AskUserQuestion multi-select con lista de SCRs non-custom para override individual. Patch al per-SCR shard del SCR afectado + actualización del classification audit append-only. |
| User picks `4. Cancelar`                       | Workflow ends. No writes to durable artifacts.                                                                                                                                             |
| Late info arrives post-CP3 (during Phase 5)    | If 1-2 SCRs afectadas → patch incremental shard + re-spec del SCR. Si ≥3 → AskUserQuestion backtrack vs continue.                                                                          |

### 4.2 Boundary case surfacing rule

Si el classifier detecta que >30% de SCRs caen en boundary cases (Rule 6 default-conservative) → orchestrator surfaces warning explícito antes de presentar las opciones (estructuradas por default, tabla numerada como fallback — `CC.md §3`):

```
⚠ Clasificación con baja confianza ({N}% de pantallas en boundary).
El classifier puede estar mis-calibrado vs este proyecto. Recomiendo revisar
las pantallas borderline antes de aprobar.
```

Si <30% → narration estándar sin warning.

## 5. Phase 8.5 — Blocker Resolution Round (no stakeholder input)

Position: after Phase 8 (5 validators) if ≥1 blocker emerged. **1 round only.**

### 5.1 Mapping blockers to targets

Each blocker maps to one of:

- `SCR-XXX` (per-screen issue)
- `CMP-XXX` (component extension issue)
- `FLW-XXX` (flow issue)
- `16_DESIGN.md §N` (cross-cutting section issue)
- `IA structural` (sitemap / route convention level)

### 5.2 Targeted re-emit (not full Phase 5 re-batch)

- For SCR-level blockers: re-invoke `dsg-screen-specer-full` (for `custom`) or `dsg-screen-specer-light` (for `kit-extended`) for just the affected SCRs with corrective feedback. Single-target batch.
- For CMP-level blockers: re-invoke `dsg-component-specer` for just the affected CMPs.
- For cross-cutting / IA blockers: orchestrator-direct edit of `16_DESIGN.md`.
- For `kit-pure` SCR blockers (rare — stub itself is wrong): orchestrator-direct rewrite del stub.

### 5.3 Selective re-run of validators (not all 5)

After the patch:

| Blocker source                | Re-run validator        |
| ----------------------------- | ----------------------- |
| Visual / IA / DS              | `ui-critic` only        |
| FT coverage / readiness chain | `product-owner` only    |
| Copy                          | `skeptical-client` only |
| Route convention / module     | `architect` only        |
| Dependency / timing           | `project-planner` only  |
| ≥3 cross-validator blockers   | Full Phase 8 re-batch   |

> **El re-run hereda la misma degradación que la corrida original (`SKILL.md` §16), sin excepción.** `ui-critic` re-corre sobre las **specs** parchadas: sigue sin haber pantalla renderizada, así que sigue sin manifest de evidencia visual y su check DS4 (multi-tema) vuelve a salir **"no demostrado"** — nunca Pass. Un blocker de DS4 levantado aquí se resuelve arreglando **la especificación** (qué tokens/temas declara el SCR), no re-corriendo el validador hasta que "pase": no hay corrida de esta fase que pueda demostrarlo. La demostración vive en `/implement` §4.4, con el harness [`fx-visual-evidence`](../../fx-visual-evidence/SKILL.md) corrido sobre la UI real.

### 5.4 Outcome

- If all blockers resolved → proceed to Phase 8.6 Pre-CP4 Sweep.
- If blockers remain after 1 round → CP4 blocked by default; only path to `partial` is user explicit defer in CP4.

## 6. Phase 8.6 — Pre-CP4 Canonical State Sweep

Mirror of `tk-discovery Phase 7.6 Pre-CP2 Canonical State Sweep`. Before `EnterPlanMode`, check the durable state of emitted files.

### 6.1 Sweep criteria

| Criterion                                                                   | If FAIL                                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frontmatter valid in each `SCR-XXX.md` (id, slug, route, tier, …)           | STOP pre-Plan-Mode. Surface failing file. Re-spawn correct specer (full/light) per tier; orchestrator-direct for stubs. |
| §3 Screen Map rows parseable (SCR-XXX × route × roles × tier × binding)     | STOP. Force re-emit of §3 (orchestrator-direct).                                                                        |
| Each `partial`/`blocked` in §10 Consumer Readiness has tracking ID adjacent | STOP. Force user to classify (resolve inline / spike / defer + DECISION-DESIGN-XXX).                                    |
| Coverage of FT/persona vs `02`, `03`, `05` consistent                       | WARNING (no STOP). Surface in CP4 Plan Mode summary as advisory.                                                        |
| `kit-pure` stubs comply ≤7 líneas total + binding declared                  | STOP. Force re-emit (orchestrator-direct) — stubs that exceed length signal classifier mis-elected tier.                |

### 6.2 Sweep failure recovery

- Each STOP cycles back to the responsible Phase (5 for SCR, 6 for CMP, 7 for cross-cutting) for re-emit.
- Max 1 cycle of re-emit + re-sweep. After that → escalate to user.

## 7. CP4 — Plan Mode formal (HIGH-stakes synthesis)

Position: after Phase 8.6 PASS. Format: `EnterPlanMode` with Plan content per template.

### 7.1 Plan Mode body shape

```markdown
# `/design` — CP4 Synthesis

## Summary

- Mode: nuevo | con-direccion | validar
- Pantallas emitidas: N total
  - kit-pure (stubs): X
  - kit-extended (light): Y
  - custom (full): Z
- Componentes emitidos: M
- Flujos emitidos: F

## Coverage matrix

- FTs covered: X/Y (list any not covered)
- Personas covered: A/B (list any not covered)
- RBAC consistency: PASS | WARNING

## ui-critic scorecard

| Dimension       | Score (1-10) |
| --------------- | ------------ |
| Clarity         | X            |
| Consistency     | X            |
| Polish          | X            |
| Originality     | X            |
| Trustworthiness | X            |
| Density Control | X            |
| Layout          | X            |
| Wow Factor      | X            |

Verdict: amateur | competent | strong | premium | distinctive

## Blockers (post Phase 8.5)

- Resolved: {N}
- Remaining: {M} (cada uno con DECISION-DESIGN-XXX-{slug})

## Warnings (advisory, non-blocking)

- DS3 scale inconsistency in {N} SCRs: {list}
- DS5 surface hierarchy weak in {M} SCRs: {list}
- Tone drift in {K} copy keys: {list}
- Skill-gap acknowledged warnings: {SCRs with `skills_warning_acknowledged: true`}

## Deferred decisions

- DECISION-DESIGN-XXX-{slug}: {summary, owner, due}
- ...
```

### 7.2 User options (numbered table)

| Option | Action                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1      | **Aceptar** → Phase 9 emit + handoff. Si remaining blockers + user explicit defer → marked `partial` con tracking IDs. |
| 2      | **Editar** → return to Phase 8.5 con user-specified items (1 user-Edit cycle max).                                     |
| 3      | **Round Manual** → re-execute Phase 8.5 con override del 1-round-only cap (1 manual round max).                        |
| 4      | **Rechazar** → workflow ends; no final writes to `project/planning/`.                                                  |

### 7.3 Cycle state machine (full)

```
Phase 8 (5 validators)
     │
     ▼  blockers?
     ├─ no  → Phase 8.6 Sweep
     │         ├─ PASS → CP4 (Plan Mode)
     │         └─ FAIL → re-emit cycle (max 1) → re-Sweep
     │
     └─ yes → Phase 8.5 Blocker Resolution Round (auto, 1 cycle)
                  │
                  ▼  blockers remain?
                  ├─ no  → Phase 8.6 Sweep → CP4
                  └─ yes → CP4 (Plan Mode shows remaining blockers explicit)
                                │
                                ▼  user picks
                                ├─ 1 Aceptar → Phase 9 (con partial readiness si user defer explicit + DECISION-DESIGN-XXX)
                                ├─ 2 Editar (max 1 user-Edit cycle) → Phase 8.5 → CP4
                                ├─ 3 Round Manual (max 1 override) → Phase 8.5 → CP4
                                └─ 4 Rechazar → workflow ends, no writes
```

Max total cycles: 1 auto Phase 8.5 + 1 user-Edit + 1 Manual Round = **3 rounds maximum** before forcing Accept-with-defer or Reject final.

## 8. Tracking ID convention

`/design`-emitted decisions live in `project/planning/decisions/` with prefix `DECISION-DESIGN-XXX-{slug}`. Namespace avoids collision con `tk-discovery`'s `DECISION-XXX-{slug}` counter.

Numbering: per-project counter starting at 001 within the `DECISION-DESIGN-*` namespace.

Schema (per `tk-discovery/methodology/implementation-readiness.md` ADR format):

```yaml
---
id: DECISION-DESIGN-001
slug: kebab-case-slug
status: proposed | accepted | rejected
type: decision
owner: { user | TODO }
criterion: { what would close this }
due: { YYYY-MM-DD | none }
blocks: [{ SCR-XXX, /backlog, /implement }]
---
# DECISION-DESIGN-001 — {title}

## Context
...
## Decision
...
## Consequences
...
```

## 9. `validar` mode — checkpoint changes

In `validar` mode:

- CP1 + CP2 + CP3: **skipped** (no regeneration in `validar`).
- Phase 8 runs normally (5 validators audit existing `16_DESIGN*`).
- Phase 8.5: emits findings + suggested patches **inline in the validar report**, NEVER applies them.
- Phase 8.6: runs sweep against existing files; failures emit warnings in the validar report (no STOP — no regeneration to fix).
- CP4: Plan Mode shows the findings report. User options narrow:

| Option | Action                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | **Aceptar findings** — `validar` closes; report stays in `project/design-artifacts/validar-reports/`. No durable writes.                       |
| 2      | **Aplicar patches** — re-invoke `/design nuevo` or `/design --apply-validar-report` to commit the suggested patches (separate workflow entry). |
| 3      | **Ignorar** — close `validar` without changes.                                                                                                 |

---

_TimeKast Factory — tk-design methodology · Readiness Gates (v6.2.0)_
