# tk-design — Day-2 Classification (action matrix + tier signals + rigor graduation)

> SSOT for the **day-2 Phase 4 classifier** (`add <plan>` mode). For each touched screen frozen in `parsed-design-plan.md §2`, it decides the **action** (nueva / regenerar / backfill) and the **tier** (kit-pure / kit-extended / custom). Live behavior in [`../SKILL.md`](../SKILL.md) §Phase 4 (day-2 branch) + §10.2 Phase 3-delta (which consumes the action).
>
> **Split of rigor:** the **action matrix** is deterministic (route/code presence × SCR presence) — its 4 cells are asserted by `scripts/tools/verify-scr-classifier.ts`. The **tier** is judgment (signal-driven, fail-toward-custom) — it lives in the worked examples below, NOT asserted (declared in §Out of scope of the plan; `C8`). This file is where the day-2 rigor graduation now lives as SSOT; `tk-backlog/methodology/plan-mode-input.md §Graduación de rigor` cross-refs here.

---

## When this runs

`/design add <plan>` only, in Phase 4 (after Phase 3.5 cross-cutting vocab does NOT run in day-2 — see SKILL §15; the classifier runs after Phase 3-delta reconcile, surfaced together in CP3). The greenfield Phase 4 tier election (`screen-contract-shape.md §Tier election rule`) handles fresh discovery-sourced SCRs; this file handles screens classified **against the existing app** (code as-built + the current `16_DESIGN.md`).

The classifier reads, per touched screen:

- The screen's `route` + `as_built` from `parsed-design-plan.md §2` (`page.tsx` on disk, or `new`).
- Whether a covering SCR exists in `16_DESIGN.md §3 Screen Map` / `16_DESIGN/SCR-*.md` (by route, fallback slug).
- The unit body describing the plan's delta over that screen.
- The as-built code signals (`INVENTORY.md` / `HOOKS.md` / the screen's `page.tsx`).

---

## Action matrix (deterministic — the 4 cells)

Two boolean axes per screen: **¿existe en código?** (`as_built` is a real `page.tsx` on disk vs `new`) × **¿tiene SCR?** (a covering SCR exists in `16_DESIGN.md`). Matching is **by route** (primary, against the SCR frontmatter `route`); **by slug** (fallback, only when no `route` frontmatter — `SCR-012-dashboard.md` → `dashboard`).

| ¿Existe en código? | ¿Tiene SCR? | `day2_action` | Meaning                                                                            |
| ------------------ | ----------- | ------------- | ---------------------------------------------------------------------------------- |
| **no** (`new`)     | no          | **nueva**     | Plan adds a brand-new screen with no spec — proactive design from scratch.          |
| **no** (`new`)     | yes         | **nueva**     | New page file, but a covering SCR already exists (stale/orphan) — treat as nueva; Phase 3-delta updates the existing row in place (sticky ID), no duplicate. |
| **yes**            | yes         | **regenerar** | Screen exists in code AND has an SCR; the plan touches it — re-emit the spec, same SCR ID + audit trail. |
| **yes**            | no          | **backfill**  | Screen exists in code but has no spec — reverse-engineer an as-built SCR, then layer the plan's delta. |

🔴 **These 4 cells are deterministic and reproducible headless** — same `(as_built, scr_present)` pair → same action every run. They are the assert surface of `verify-scr-classifier.ts` (the day-2 action fixtures). The **tier** is NOT in this table — it is the judgment layer below.

> **Edge — new page file with a covering SCR (row 2).** Rare but real: a plan adds `dashboard/page.tsx` while `SCR-012-dashboard.md` already exists (e.g. the SCR was designed first, code lagged, now both land). The action is **nueva** (the screen is genuinely new to code), but Phase 3-delta does NOT mint a new ID — it updates the existing SCR-012 row in place (sticky ID, §10.2 step 3). The action drives the spec depth; the reconcile drives ID assignment. They are decided separately.

---

## Value framing — nueva > regenerar > backfill (decisión 3)

The three actions are **not equal in design value**, and the classifier surfaces this so CP3 review prioritizes correctly:

- **nueva** — highest value. A proactive spec that **directs** implementation before code exists. The whole SCR is prescriptive.
- **regenerar** — middle. The screen already has a spec; the plan reshapes part of it. Value is in the **delta** the plan describes over the existing spec, not in re-stating what was already designed.
- **backfill** — hygiene / safety net, lowest standalone value. Its **as-built block is descriptive** (it mirrors what code already does — no prescriptive force). Its prescriptive value lives in **the plan's delta over that screen** plus leaving a base for future iterations. A backfill with no plan delta is pure documentation of the status quo.

🔴 **Do NOT oversell backfill.** The as-built portion is a reverse-engineering snapshot — it drifts at the first out-of-pipeline code change (staleness, §Edge cases). The reason to emit it is the delta + the future base, not the snapshot itself.

---

## Tier signals (day-2 — judgment, fail-toward-custom)

Tier in day-2 is **signal-driven**, reading the plan's delta + the as-built code (greenfield reads `07_SK_LEVERAGE` rows; day-2 has no FT chain, so it reads code + plan instead). Apply in order, first match wins; the residual borderline **fails toward `custom`**.

| Signal (first match wins)                                                                  | Tier           |
| ------------------------------------------------------------------------------------------ | -------------- |
| **nueva** with its own layout (not a kit-shipped primitive mount)                          | **custom**     |
| Plan **delta reshapes layout** (panel lateral, wizard, split view, new view) on any action | **custom**     |
| **backfill** of a screen that is a **kit-mount + project customizations** (extends a kit primitive) | **kit-extended** |
| Screen sits on a **pure kit-shipped route** (login, notifications panel, theme switcher — mount only, no per-screen customization) | **kit-pure** |
| **Borderline** — signals mixed (some kit, some custom; ambiguous as-built)                 | **custom — fail-toward-custom** |

**Why fail-toward-custom (not toward-extended):** under-speccing a custom screen as `kit-extended` ships a light spec that misses the custom layout → implementation drifts. Over-speccing a kit-extended screen as `custom` costs extra spec lines but loses no information. The asymmetry favors the conservative direction — the same principle as the greenfield Rule 6 (`screen-contract-shape.md §Tier election rule`).

🔴 **Tier is NOT asserted by the harness.** It is judgment; it lives in the worked examples below (hand-checked) so an implementer can calibrate. The harness asserts only the deterministic action cells (`C8` — completitud barata sin sobre-venta).

---

## Tier rule on regen (conserve · raise auto · lower only with CP3 override)

When the action is **regenerar**, the existing SCR already carries a tier. The default is **conserve it**:

- **Conserve** — keep the SCR's current tier unless a signal clearly raises it.
- **Raise automatically** — if the plan's delta adds a custom-layout signal (or a Build-equivalent as-built signal) to a screen currently `kit-pure` / `kit-extended`, the classifier raises the tier (kit-pure → kit-extended → custom) without asking. Raising never loses information.
- **Lower ONLY with an explicit CP3 override** — a screen does NOT silently drop from `custom` to `kit-pure` (it would discard the existing full spec). A downgrade requires a deliberate per-screen override at CP3, which writes an append-only tombstone to `parsed-design-plan.md §4` (SKILL §21.1). Headless never lowers a tier (`no destructive tier downgrades` — SKILL §12.3).

🔴 **A silent tier downgrade is the failure mode to prevent.** If an implementer does not know this rule, a regen could quietly turn a `custom` SCR into a stub and lose the full spec. The rule lives here in the SSOT and is enforced as a Phase 8.6 guard (no auto-downgrade).

---

## CMP / FLW rules (plan-derived)

Day-2 plans can introduce components and flows alongside screens. These are NOT in the action matrix (the matrix is screens only); they follow the existing greenfield policies, applied to plan-derived units:

- **CMP-Detection.** A plan unit that introduces a **component without a screen** does NOT enter the action matrix (it is `non-ui-unit` in the day-2 parser — `day2-plan-input.md §Step 2`). Component emission follows `component-extension-policy.md §CMP-Detection` unchanged: composable from sk-ui → SCR §5 inline (no CMP); criterion A (≥2 screens) / B (complex single-screen) → emit `CMP-XXX.md`; criterion C (thin sk-ui extension) → factory ticket, no local CMP. Day-2 does not relax this gating.
- **FLW — ≥2 pantallas.** A plan that wires **≥2 screens into a flow** (a multi-screen journey) triggers an `FLW-XXX.md` + a §4 Flow Map row in Phase 3-delta. A single-screen flow (one entry → one exit) lives inline in the SCR (`screen-contract-shape.md` — single-screen flows do not get a FLW file).
- **Sticky IDs.** Both CMP and FLW IDs follow the **`max+1`** sticky-ID discipline (Phase 3-delta §10.2): parse the existing `16_DESIGN.md` for the max `CMP-NNN` / `FLW-NNN` (tombstones counted, never reused), assign `max+1` in plan order, freeze. A second parse of the same plan reproduces the same IDs (no collision).

---

## Rigor graduation (SSOT — design-significance, what fires vs what does NOT)

> This is the **day-2 rigor graduation SSOT**. `tk-backlog/methodology/plan-mode-input.md §Graduación de rigor` (introduced inline in Fase 1, marked provisional N6) cross-refs here. The graduation documents **what does NOT make a change design-significant** (an exclusion list), coherent with the fail-toward-signal principle — the borderline always fires.

A plan change is **design-significant** (warrants a screen entering the day-2 classifier / firing the backlog design-significance detection) per these enumerated rules, first match wins:

| Change                                                                                 | Design-significant? |
| -------------------------------------------------------------------------------------- | :-----------------: |
| New `page.tsx` under `src/app/(public\|protected)/**` (path not on disk pre-run)       | **yes — siempre**   |
| Existing page with a **structural change described** in the unit body (layout reshape, new view, route added) | **yes** |
| Borderline — a `page.tsx` exists but the structural change is described vaguely         | **yes — fail-toward-signal** |
| **Component-only change** (`src/components/**`, no new page)                            | **no**              |
| Backend / data (`src/lib/**`, `src/app/api/**`)                                         | **no**              |
| Tests (`tests/**`, `__tests__/`), copy tweaks, a single field added to an existing form | **no**              |
| Any other path                                                                          | **no (default)**    |

🔴 **Component-only does NOT fire; new page files ALWAYS do.** A new component inside an already-spec'd screen is not a new pantalla — it does not warrant a fresh SCR. This mirrors the divergence declared in `tk-backlog`'s design detection (Phase 0.6) vs its `ui_touching` table: the same paths, the **same answer** on the component-only case (both exclude it from design-significance). The principle is fail-toward-signal on borderline — better a screen named as unspecified than UI entering the backlog with nothing said about it.

> The graduation states what does NOT fire (the exclusion list), not an exhaustive list of what does — consistent with fail-toward-signal. The borderline always fires.

---

## Worked examples (hand-checked — ≥3 actions × ≥2 tiers)

> Each example is hand-checked with the **expected `(action, tier)` result** stated explicitly. The action follows the deterministic matrix; the tier follows the judgment signals. These calibrate an implementer — they are documentation, NOT a CI assertion (only the action cells are asserted by the harness).

### WE-1 — nueva + custom (new dashboard, own layout)

- **Input:** plan adds `src/app/(protected)/analytics/page.tsx` (`as_built: new`), no covering SCR. Unit body: "panel de analytics con gráfica de tendencias + filtros en cascada por sucursal".
- **Action:** `nueva` (code: no × SCR: no → matrix row 1).
- **Tier:** `custom` (nueva with own layout + delta reshapes layout — chart + cascading filters; tier signal row 1 + 2).
- **Why hand-checked here:** anchors the highest-value case — a fully prescriptive full spec. The chart/filters signal forces custom even though no FT chain exists.

### WE-2 — regenerar + kit-extended (conserved)

- **Input:** `src/app/(protected)/mi-perfil/page.tsx` exists (`as_built` real), `SCR-019-mi-perfil.md` exists with `tier: kit-extended`. Plan touches it: "agrega campo `telefono` al ProfileForm".
- **Action:** `regenerar` (code: yes × SCR: yes → matrix row 3).
- **Tier:** `kit-extended` **conserved** — the delta adds a field, not a layout reshape; no signal raises the tier. The existing tier is kept (NOT lowered to kit-pure, NOT raised).
- **Why hand-checked here:** demonstrates the regen-conserve rule. A field addition is a kit-extended-shaped delta; the tier stays put. No CP3 override needed.

### WE-3 — backfill + kit-pure (kit-shipped route, no customization)

- **Input:** `src/app/(public)/login/page.tsx` exists (`as_built` real), no SCR in `16_DESIGN.md` (app never ran greenfield `/design`). Plan touches it only to "actualizar copy del header a es-MX".
- **Action:** `backfill` (code: yes × SCR: no → matrix row 4).
- **Tier:** `kit-pure` — pure kit-shipped route (NextAuth login mount), customization is a project-level copy default (excluded from per-screen customization count). The backfill emits a ≤7-line stub binding `sk-security`.
- **Why hand-checked here:** shows a backfill landing on `kit-pure` — the as-built is a kit mount, the plan's delta is a project default (not prescriptive). Confirms a backfill is not automatically heavyweight.

### WE-4 — backfill + kit-extended (kit-mount + customizations)

- **Input:** `src/app/(protected)/notificaciones/page.tsx` exists (`as_built` real, mounts `NotificationPanel`), no SCR. Plan: "agrega categorías custom `alertas-cron` + `fallos-sync` al panel".
- **Action:** `backfill` (code: yes × SCR: no → matrix row 4).
- **Tier:** `kit-extended` — kit-mount (NotificationPanel) **plus** per-screen customizations (custom categories visible as labeled badges); no layout reshape. Tier signal row 3 (backfill of kit-mount + customizations).
- **Why hand-checked here:** distinguishes WE-3 (kit-pure backfill, no customization) from a kit-extended backfill. Same action, different tier driven by the customization signal. Two backfills, two tiers.

### WE-5 — borderline → custom (fail-toward-custom)

- **Input:** `src/app/(protected)/inventario/page.tsx` exists (`as_built` real), no SCR. Plan: "rediseñar la vista — mezcla `DataTable` del kit con un panel de detalle custom a la derecha". Signals mixed (kit table + custom panel).
- **Action:** `backfill` (code: yes × SCR: no → matrix row 4).
- **Tier:** `custom` — **borderline** (kit + custom mixed) resolves to custom by fail-toward-custom. Recorded reason: `borderline → fail-toward-custom`.
- **Why hand-checked here:** the calibration case for the borderline rule. The split-view detail panel is enough custom-layout signal that the conservative direction wins. Surfaced at CP3 for explicit confirmation.

### WE-6 — borderline → custom on a regen (raise auto)

- **Input:** `src/app/(protected)/reportes/page.tsx` exists, `SCR-030-reportes.md` exists with `tier: kit-extended`. Plan: "convierte la lista en un dashboard con 3 gráficas + drill-down".
- **Action:** `regenerar` (code: yes × SCR: yes → matrix row 3).
- **Tier:** `custom` — the delta reshapes layout (dashboard + charts), which **raises** the tier from `kit-extended` → `custom` automatically (raise never loses info; no override needed). Borderline-adjacent but the chart/dashboard signal is unambiguous.
- **Why hand-checked here:** second borderline case + demonstrates the auto-raise on regen (vs WE-2 conserve). Raising is automatic; only lowering needs a CP3 override.

> **Coverage:** actions covered — nueva (WE-1), regenerar (WE-2, WE-6), backfill (WE-3, WE-4, WE-5). Tiers covered — custom (WE-1, WE-5, WE-6), kit-extended (WE-2, WE-4), kit-pure (WE-3). ≥3 actions × ≥2 tiers, with ≥2 borderline cases (WE-5, WE-6).

---

## Anti-patterns

- **Asserting tier in the harness.** Tier is judgment (signal-driven, fail-toward-custom). Only the 4 deterministic action cells are asserted (`C8`). Asserting tier would force a brittle heuristic into CI and oversell the harness's coverage.
- **Silently lowering a tier on regen.** A regen never drops `custom` → `kit-pure` without an explicit CP3 override (it discards the full spec). Conserve by default; raise auto; lower only with a tombstoned override.
- **Treating a backfill's as-built as prescriptive.** The as-built block mirrors code (descriptive, drifts on the first out-of-pipeline change). The prescriptive value is the plan's delta, not the snapshot.
- **Routing a component-only change into the action matrix.** A component without a screen is `non-ui-unit` (parser) — it follows CMP-Detection, not the screen action matrix.
- **Minting a new ID on a `nueva` that already has a covering SCR (matrix row 2).** The action is nueva but Phase 3-delta updates the existing row in place (sticky ID) — action drives spec depth, reconcile drives ID assignment, decided separately.

---

## Edge cases

- **Backfill staleness (C3).** A backfilled SCR mirrors code at run time and drifts at the first out-of-pipeline change. The backlog design detection verifies existence, not freshness — a stale SCR counts as covering the screen. A future `validar` day-2 would reconcile; out of scope v1.
- **New page file with a covering SCR (matrix row 2).** Action `nueva`, but no new ID is minted (sticky update in place). Surfaced above; the separation of action vs ID assignment is deliberate.
- **CMP introduced without a screen.** Stays out of the action matrix (`non-ui-unit`); CMP-Detection decides emit vs factory ticket. The classification loop here is screens (and FLWs that wire ≥2 of them), not standalone components.
- **Tier signals in conflict (borderline).** `fail-toward-custom` resolves the majority; WE-5 + WE-6 are the calibration cases with explicit reasoning. CP3 surfaces every borderline for confirmation.

---

_TimeKast Factory — tk-design methodology · day2-classification_
