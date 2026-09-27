# Parsed plan: sample-day2-plan.md (EXPECTED — calibration reference)

> Expected frozen decomposition for `sample-day2-plan.md`. Hand-checked reference (not a CI
> assertion — only the 4 deterministic action cells of `day2-classification.md` are asserted by
> `verify-scr-classifier.ts`; the gate fire/no-fire + reconcile shown here are hand-checked).
> Demonstrates the 5 day-2 cases: **nueva** (gate +), **backfill** (gate +), **regenerar**
> (gate +), **backend-only** (gate −), **component-only** (gate −).

> **Source:** .claude/skills/tk-design/methodology/examples/sample-day2-plan.md
> **Fixture:** tests/fixtures/day2-seed-app/ (route surface this plan runs against)
> **Hash:** <sha-256 del archivo>
> **Parsed at:** <ISO timestamp>
> **Plan units detected:** 5 (C1..C5) · **design-significant (gate +):** 3 · **gate −:** 2
> **Screen actions classified:** 3 (nueva 1 · backfill 1 · regenerar 1)

## Hypothetical seed state (index reconcile baseline)

> The reconcile assigns sticky IDs from the **existing max** in the seed's `16_DESIGN.md §3`.
> The seed (DSGN-003) ran first on the fixture's code surface and minted one SCR per on-disk
> route, in nav order:

| SCR-ID  | Slug          | Route                          | Source              |
| ------- | ------------- | ------------------------------ | ------------------- |
| SCR-001 | dashboard     | /(protected)/dashboard         | seed (on-disk)      |
| SCR-002 | inventario    | /(protected)/inventario        | seed (on-disk)      |
| SCR-003 | configuracion | /(protected)/configuracion     | seed (on-disk)      |
| SCR-004 | equipo        | /(protected)/equipo            | seed (on-disk)      |

> **max SCR-NNN = SCR-004.** New screens this plan adds mint `max+1` → SCR-005, SCR-006, …
> in plan order. Existing-route units reconcile **in place** (sticky ID, no new mint).
> Note: the `dashboard` route carries an SCR (SCR-001) for case C3's regen — in a real run a
> seed row alone is enough; this expected treats SCR-001 as the covering SCR for the regen.

## Units (frozen decomposition)

> Process headings skipped (prose-non-issue): `## Context`, `## Out of scope`. `## Critical
> files` and `## Verification` are source sections, not units.

### C1 — Pantalla nueva: Analytics

- gate (Fase 1 design-significance): **+ positivo** — new `page.tsx` under `(protected)` not on
  disk pre-run → `yes — siempre` (graduation row 1).
- as_built: **new** (`src/app/(protected)/analytics/page.tsx` does not exist in the fixture).
- covering SCR: **no**.
- action: **nueva** (code: no × SCR: no → matrix row 1).
- tier: **custom** (nueva with own layout + delta reshapes layout — chart + cascading filters;
  tier signals row 1 + 2). _(tier is judgment — not asserted.)_
- reconcile: mint **SCR-005** = max(004) + 1. New §3 row + Phase 5 full spec.

### C2 — Backfill: Inventario sin spec

- gate: **+ positivo** — existing page with a structural change described (formalize + export CSV
  view) → graduation row 2.
- as_built: **yes** (`src/app/(protected)/inventario/page.tsx` exists in the fixture).
- covering SCR: **no** (seed row exists but no specced SCR file).
- action: **backfill** (code: yes × SCR: no → matrix row 4) — reverse-engineer as-built, then
  layer the plan's delta (export CSV).
- tier: **kit-extended** (DataTable kit-mount + per-screen customization = CSV export; no layout
  reshape). _(judgment — not asserted.)_
- reconcile: **sticky SCR-002** (its seed row) updated in place — NO new ID minted.

### C3 — Regen: Dashboard con SCR existente

- gate: **+ positivo** — existing page with a structural change described (alerts card = new view
  in the layout) → graduation row 2.
- as_built: **yes** (`src/app/(protected)/dashboard/page.tsx` exists).
- covering SCR: **yes** (SCR-001 from the seed).
- action: **regenerar** (code: yes × SCR: yes → matrix row 3) — re-emit the spec, same SCR ID +
  audit trail.
- tier: **conserve** the SCR's current tier unless the alerts-card delta raises it; an alerts
  card is a kit-shaped addition, not a layout reshape → tier conserved (no auto-raise). _(judgment.)_
- reconcile: **sticky SCR-001** updated in place — NO new ID minted.

### C4 — Backend-only: recálculo de métricas

- gate: **− negativo** — touches only `src/app/api/metrics/route.ts` + `src/lib/metrics/aggregate.ts`
  → graduation rows "Backend / data" → `no`. Does NOT enter the action matrix.
- as_built / covering SCR / action / tier: **N/A** — no screen classified.
- reconcile: none — no SCR minted, no §3 row touched.

### C5 — Component-only: badge de estado compartido

- gate: **− negativo** — touches only `src/components/common/StatusBadge.tsx`, no new page →
  graduation row "Component-only change" → `no`. Does NOT enter the action matrix.
- as_built / covering SCR / action / tier: **N/A** — a component without a screen is a
  `non-ui-unit` (parser); follows CMP-Detection, not the screen action matrix.
- reconcile: none — no SCR minted, no §3 row touched.

## Verification bullets (mapped to units)

- analytics renderiza gráfica + filtros en cascada (gate +) → C1
- inventario exporta CSV respetando filtros (gate +) → C2
- dashboard muestra tarjeta de alertas arriba del grid (gate +) → C3
- `/api/metrics` devuelve métricas agregadas (gate −, backend-only) → C4
- `StatusBadge` se renderiza igual en inventario y equipo (gate −, component-only) → C5

## Index reconcile summary (sticky-ID discipline)

```yaml
seed_max_scr: SCR-004
gate_positive: [C1, C2, C3] # design-significant → enter classifier
gate_negative: [C4, C5] # excluded by graduation (backend-only, component-only)
actions:
  nueva: [C1] # SCR-005 (max+1) — new row + full spec
  backfill: [C2] # SCR-002 (sticky) — as-built + delta, updated in place
  regenerar: [C3] # SCR-001 (sticky) — re-emit, same ID + audit trail
new_ids_minted: [SCR-005]
sticky_ids_reused: [SCR-001, SCR-002]
```

> **Reproducibility:** a second parse of the same plan against the same seed state reproduces
> the same IDs — SCR-005 is minted once (only C1 is new); C2/C3 reconcile in place. No collision,
> no duplicate row.

## Extras (non-required sections)

- ## Context: (verbatim — process, skipped as unit)
- ## Out of scope: (verbatim — process, skipped as unit)
