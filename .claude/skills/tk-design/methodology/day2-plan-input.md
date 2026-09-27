# tk-design — Day-2 Plan-Input Contract

> Spec for the **orchestrator-direct day-2 parser** (Phase 0.5) that consumes a Plan Mode plan and emits the structured input the day-2 design pipeline needs: which screens the plan touches, by route. Live behavior in [`../SKILL.md`](../SKILL.md) §6 Phase 0.5; frozen output shape in [`../templates/parsed-design-plan.template.md`](../templates/parsed-design-plan.template.md).

This file documents the **classification + attribution** contract that is **own to design**. It runs in the orchestrator main loop (NOT inside `dsg-context-analyst` — plan parsing is orchestration logic, `fx-workflow-authoring §8`).

---

## When the parser runs

`/design add <plan-file>` only. The `nuevo` / `con-direccion` / `validar` modes do not parse a plan — they consume discovery + design artifacts instead.

The parser runs in Phase 0.5 (after Phase 0 day-2 detect + optional Phase 2-seed, before Phase 1 dispatch), freezing its output to `project/design-artifacts/{run-id}/parsed-design-plan.md` for the rest of the run to read.

---

## Shared vs own — the split (C5)

The day-2 design parser and the `tk-backlog` plan parser share **exactly one** step and diverge on the rest. Keeping the boundary explicit prevents drift in either direction.

| Step                        | Owner                                                                                | Why                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Step 1 — unit detection** | **SHARED** — cross-ref `.claude/skills/tk-backlog/methodology/plan-mode-input.md §Step 1` | Splitting a plan into work units by visible structure is identical mechanics across both. |
| **Step 2 — classification** | **OWN (here)** — `ui-unit` / `non-ui-unit` / `prose` (NOT "issue")                    | Design cares whether a unit introduces/changes a screen, not whether it's an issue.        |
| **Step 3 — attribution**    | **OWN (here)** — unit → screen(s) **by route** (NOT → files)                          | Design attributes a unit to the pantalla(s) it touches; backlog attributes to files.       |

🔴 **Do NOT duplicate Step 1.** It is cited by cross-ref, with a reciprocal back-pointer in `plan-mode-input.md`. `plan-mode-input.md` is in active churn — if Step 1 changes there, the cross-ref must keep resolving (watch-item C5). Re-verify the back-pointer on any refactor of that file.

---

## Step 1 — Unit detection (SHARED, by cross-ref)

Detect the work units by visible structure exactly as `tk-backlog` does. See `.claude/skills/tk-backlog/methodology/plan-mode-input.md §Step 1 — Unit detection` for the SSOT (numbered findings → `### ` sub-headings → `## Workstream X` → list items under a work section; structured plan → reproducible units; flat prose → group by cohesive concern with judgment).

No mechanics are re-stated here — the back-pointer in that file points back to this consumer.

---

## Step 2 — Classification (ENUMERATED, first match top-to-bottom)

Classify each detected unit into one of three buckets so it is reproducible headless. Note: design classifies into `ui-unit` / `non-ui-unit` / `prose` — **NOT** the backlog `issue` / `prose-non-issue` buckets.

| Signal (first match wins)                                                                                                       | Classification    |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **process heading** — semantic ES/EN match: Context/Contexto · Background/Antecedentes · Verification/Verificación · Risks/Riesgos · Out of scope/Fuera de alcance · Decisions/Decisiones · Sequencing/Secuencia | **prose** (skip)  |
| Unit adds a new page file (`src/app/(public\|protected)/**/page.tsx`, path not on disk pre-run)                                  | **ui-unit**       |
| Unit describes a **structural change** to an existing screen (layout reshape, new view, route added)                            | **ui-unit**       |
| Borderline (a page exists but the structural change is described vaguely)                                                        | **ui-unit — fail-toward-ui** |
| Unit describes an implementable change with **no page** — component-only edit, backend, copy tweak, single field on a form      | **non-ui-unit**   |

Classification is **rule-based**, not open judgment → reproducible for structured plans. The residual borderline **fails toward `ui-unit`** (better a screen the human reviews than UI that skips design silently).

### Rigor graduation (what fires vs what does NOT)

The graduation documents **what does NOT trigger a ui-unit** (an exclusion list), coherent with the fail-toward-ui principle. The borderline always fires.

| Change                                                                       | Triggers `ui-unit`? |
| ---------------------------------------------------------------------------- | :-----------------: |
| New `page.tsx` under `src/app/(public\|protected)/**` (not on disk pre-run)  | **yes — siempre**   |
| Existing page with a structural change described in the unit body            | **yes**             |
| **Component-only change** (`src/components/**`, no new page)                  | **no**              |
| Backend / data (`src/lib/**`, `src/app/api/**`)                              | **no**              |
| Tests, copy tweaks, a single field added to an existing form                 | **no**              |

🔴 **Component-only does NOT trigger; page files new ALWAYS do.** A new component used inside an already-spec'd screen is not a new pantalla — it does not warrant a fresh SCR. A new page file always does. This mirrors the divergence declared in `tk-backlog`'s design-significance detection (Phase 0.6) — same paths, deliberately the same answer on the component-only case (both exclude it from design-significance).

> `day2-classification.md` is the day-2 graduation SSOT for design (full action-matrix graduation + tier signals); `tk-backlog/methodology/plan-mode-input.md §Graduación de rigor` cross-refs it. This section narrows to the **design-significance question** only — whether a unit warrants a SCR at all. The exclusion list below is complete and authoritative for that question.

---

## Step 3 — Attribution (unit → screen(s) by route)

Each `ui-unit` is attributed to the pantalla(s) it touches, **by route** — not to files (that is backlog's job).

1. **By route (primary).** Derive the route from the unit's page path (`src/app/(protected)/dashboard/page.tsx` → `/protected/dashboard`, route-group parens stripped). One unit may touch several screens → many-to-one allowed (each screen recorded under the unit's `screens:` list).
2. **By slug (fallback).** When no route is resolvable from a path but a screen slug is named in the unit body, attribute by slug.

The `as_built` field per screen records the existing `page.tsx` on disk (or `new` when the plan adds it) — read by the Phase 1 analyst in `source_mode: plan-code` to reverse-engineer the as-built state.

🔴 **Attribution is to screens, never to files.** A unit that mentions a file in prose (`see dashboard/page.tsx for the layout`) without resolving a route/slug for the screen is **not** attributable — it STOPs (below), it is not silently dropped.

---

## STOP / redirect conditions

Only when content that cannot be invented is genuinely absent, or a `ui-unit` cannot be resolved to a screen:

- **Plan illegible** (cannot detect any unit — no visible structure and no cohesive prose) → STOP "no pude leer la estructura del plan; agrega secciones o ítems para que pueda identificar las unidades de trabajo".
- **`ui-unit` with no resolvable screen** → STOP "la unidad «{title}» describe UI pero no resuelve una ruta `src/app/` ni un slug de pantalla". The parse freezes **nothing** — no `parsed-design-plan.md` is written (atomic). NEVER silent-skip the unit.
- **Plan with zero ui-units** (all units classified `non-ui-unit` / `prose`) → **exit with redirect**: "este plan no introduce pantallas nuevas ni cambios estructurales de UI; corre `/backlog add <plan>` — no hay trabajo de diseño que hacer". No design artifact is generated.

> The redirect mirrors the backlog gate's inverse: backlog redirects UI-without-spec to `/design add`; design redirects no-UI to `/backlog add`. Two complementary entrances, no overlap.

---

## Output: `parsed-design-plan.md`

Frozen to `project/design-artifacts/{run-id}/parsed-design-plan.md`. Shape (FROZEN — `templates/parsed-design-plan.template.md`):

- Header with `hash` (SHA-256 of the full plan bytes) + `needs_seed` + unit counts.
- `§1 Context` — narrative by content.
- `§2 UI units` — frozen decomposition: each ui-unit with its attributed `screens[]` (route + slug + as_built; `day2_action` + `scr_id` left blank, assigned downstream).
- `§3 Non-UI units` — surfaced, not screen-attributed.
- `§4 Override tombstones` — append-only (populated at CP3 on action override).
- `§5 Provenance`.

> **`day2_action`** (nueva / regenerar / backfill) is assigned in Phase 4 day-2 classification (`day2-classification.md`). **`scr_id`** is assigned in Phase 3-delta index reconcile (`max+1` of §3). This file freezes detection + classification + attribution only.

---

## Anti-patterns

- **Parsing inside `dsg-context-analyst`.** The agent has a closed contract (read targets → emit shards). Plan parsing is orchestration logic (`fx-workflow-authoring §8`).
- **Re-stating Step 1 mechanics here.** It is shared — cite by cross-ref, do not duplicate (drift magnet — `plan-mode-input.md` is in active churn).
- **Attributing a unit to files.** Design attributes to screens by route. Files are backlog's attribution concern.
- **Triggering a ui-unit for a component-only change.** A new component inside an existing screen is not a new pantalla — `non-ui-unit`. Page files new always trigger; component-only never does.
- **Silent-dropping a ui-unit with no resolvable screen.** It STOPs/surfaces — it is NOT reclassified to `non-ui-unit` silently.
- **Inventing a screen route.** If the unit doesn't resolve a route or slug, the parser STOPs — it does not synthesize a path.

---

_TimeKast Factory — tk-design · day2-plan-input_
