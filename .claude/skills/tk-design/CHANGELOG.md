# tk-design — Changelog

> Internal workflow audit log (scope rule: `fx-workflow-authoring §11` decides which workflows carry a CHANGELOG — this header only points there). Entry policy: non-trivial behavior changes get a Run entry. Cosmetic touchups don't.

---

## [Unreleased]

### Changed

- **§3 + §7.1 — audit SkillSpector 2026-09-20.** El "NO `rm -rf` bajo ninguna circunstancia" queda acotado a artefactos durables (los efímeros del run sí se limpian en §20.3); el cleanup pre-flight **se salta en `validar`**, que promete cero writes durables y antes podía ofrecer borrar `16_DESIGN/**` antes del dispatch.

- **Las extension proposals (criterio C) salen del run como factory-tickets `ui-extension`.** Antes morían listadas en `16_DESIGN.md §1.2` y el ticket lo escribía un humano. Ahora Phase 6 **acumula** (no emite — Phase 7/8 todavía puede re-clasificar) y al cierre, §20.1.2, el orquestador presenta las N propuestas y el usuario elige **cuáles** se escriben bajo `project/factory/` con el shape canónico de `fx-factory-tickets §4`. Modo *surfaceado-luego-emitido* (el mismo de `workflow-drift`) porque el disparo es de juicio, no verificable: **headless lista y NO emite**. §1.2 sigue siendo el registro de diseño; la propuesta emitida se anota con el path de su ticket. El slug `ui-extension` se declara en `fx-factory-tickets §5` (fuente única), no aquí.
- **Skin selection en Phase 2 + CP1.** `/design nuevo` lee el registry de skins shipeados (`src/config/skins.ts`) y ofrece elegir entre los N disponibles (dinámico, sin hardcode) en CP1, con opción "otra dirección (custom)" si ninguno encaja; la elección se registra en `16_DESIGN §0` (`visual_direction`). En `con-direccion`, "usar un skin shipeado" salta Phase 2 solo si el brief nombró un skin concreto — si no, corre Phase 2 para elegirlo. Boundary: `/design` solo LEE `skins.ts` (read-only); el switch lo aplica `/implement` vía el issue de setup que emite `/backlog`.

---

## [v6.3.0] — 2026-06-13

> EPIC-08 `design-add-day2` — the day-2 `add <plan>` mode end-to-end: parse a Plan Mode plan against an existing app, seed `16_DESIGN.md` if absent, classify each touched screen (nueva/regenerar/backfill × tier) with provenance, and chain into `/backlog add`. Consolidates DSGN-001..008; the DSGN-009 dry-run validated the three facets (parser vs expected · pre-merge over the `day2-seed-app` fixture in both variants · end-to-end `/design add → /backlog add` with the gate not firing).

### Added

- **`add <plan>` mode surface.** Day-2 iteration mode in the modes table (4th row) + `description` frontmatter + slash invocation (`commands/design.md` exposes the `add <plan-file>` arg in the argument-hint + Args line + TodoWrite phases — DSGN-006). Reduced phase set (0/0.5/1/3-delta/5/7/8/8.6/9) with CP saltos: conditional `CP1-seed` → `CP3` → `CP4` (greenfield CP2 does not run). Turn boundaries §6.1.
- **Phase 0.5 day-2 parser.** Orchestrator-direct. Shared/own split — Step 1 (unit detection) shared with `tk-backlog` by cross-ref; classification (`ui-unit`/`non-ui-unit`/`prose`) + attribution (unit → screen by route) own to design. STOP if plan illegible or ui-unit with no resolvable screen; redirect to `/backlog add` if no UI. New methodology `methodology/day2-plan-input.md` + frozen template `templates/parsed-design-plan.template.md` (SHA-256 of the plan + append-only override tombstones).
- **Phase 2-seed — minimal `16_DESIGN.md` from code (DSGN-003).** Orchestrator-direct linear extraction (no agent) that runs only when `needs_seed: true` (no `16_DESIGN.md`): §2 sitemap + §3 Screen Map from `navigation.ts` + route Glob (first ID minting, sticky), §0 Visual Direction harvested from legacy `15_DESIGN.md` (code is token arbiter) or an honest kit-default placeholder from `globals.css` (never invents a direction), §8 exact kit-shipped bindings only. CP1-seed gates the extraction (headless: conservative auto-approve + caveat). New template `templates/16_DESIGN.seed.template.md` (`seeded_from_code: true`, partial-by-design).
- **Phase 4 day-2 classification (DSGN-002).** New SSOT `methodology/day2-classification.md`: deterministic action matrix (4 cells: nueva/regenerar/backfill, asserted by the harness) + judgment tier signals (fail-toward-custom, hand-checked worked examples WE-1..WE-6) + regen tier rule (conserve/raise-auto/lower-only-with-override) + CMP/FLW plan-derived rules + the day-2 rigor graduation SSOT (`tk-backlog` cross-refs here). Phase 4 gains the day-2 branch + a day-2 CP3 (screen × action × tier + borderlines + reconcile preview). Harness `verify-scr-classifier.ts` extended with the 4 deterministic day-2 action fixtures.
- **Phase 3-delta index reconcile.** The only day-2 ID-assigner: sticky IDs `max+1` parsing §3, new §3 rows, in-place tier+File update on backfill/regen, §4 FLW, §8 bindings, §10 refresh. Approval travels in CP3. A second parse of an unchanged plan reproduces the same IDs (no collision).
- **SCR provenance frontmatter (DSGN-005).** Optional block added to all 3 SCR templates (`SCR.template.md` / `.light.md` / `.stub.md`): `source_tier`, `plan_source` (path#anchor + sha-12), `day2_action` (enum), `revisions: []` (append-only). `screen-contract-shape.md` documents the fields and points to `day2-classification.md` as the tier-rule SSOT. Back-compat: a greenfield SCR without these fields stays valid; `imp-issue-executor` unchanged (tier handling is origin-agnostic).
- **Day-2 agent input branch (DSGN-004).** `dsg-context-analyst` gains a `source_mode: discovery | plan-code` branch — in `plan-code` it reads `parsed-design-plan.md` + each target's as-built `page.tsx` instead of the discovery slots, and emits `per-scr-day2` shards with a declared validator caveat. `dsg-screen-specer-full` / `dsg-screen-specer-light` gain provenance passthrough + as-built block handling on regen/backfill. No new agent (reuses the `bkl-context-analyst` dual-mode precedent); watch-item C11 (prompt growth) declared.
- **CP4 headless conservador.** Inline auto-approve in headless + manifest caveat; residual risk C2 declared in §26 (not sold as a mitigation).
- **§21 day-2 invalidation.** Plan edited mid-run → re-hash + diff (≤2 screens → patch; ≥3 → AskUserQuestion backtrack); CP3 action override → append-only tombstone.
- **§16.1 plan-code validator mapping + §18.1 day-2 sweep guards.** `source_mode: plan-code` validator scope shift + provenance/sticky-ID sweep guards (FT/persona coverage skipped — no discovery chain).
- **Phase 9 `add` mode emit (§20.1.1).** Index delta (not full rewrite) + Pipeline Status cell `🟡 Parcial (seed)` when seeded + numbered offer to chain `/backlog add`.
- **Calibration examples + committed fixture (DSGN-007).** `methodology/examples/sample-day2-plan.md` + hand-checked `sample-day2-plan.expected-parsed-plan.md` (5 cases: nueva/backfill/regen/backend-only/component-only) + `tests/fixtures/day2-seed-app/` mini-tree in two variants (with/without legacy `15_DESIGN.md`), so the pre-merge dry-run runs from the Factory repo with zero external repos.
- **§22/§23 contract rows + §25/§27 index entries.** `source_mode` branch + `provenance` passthrough rows; new templates + methodology indexed.

### Changed

- **`tk-backlog/methodology/plan-mode-input.md` (surgical):** reciprocal back-pointer at Step 1 (shared with `/design add`) + design gate (Phase 0.6) option-1 copy now points to `/design add` as the primary remediation (N6 provisional resolved); rigor graduation cross-refs `tk-design/methodology/day2-classification.md` as SSOT.

### Upstream (cross-skill — Fase 2 declarations, DSGN-008)

- **`PIPELINE_CURRENT_TRUTH.md`:** §1 declares the full day-2 path `Plan Mode → /design add → /backlog add → /implement`; §4 design row lists the real `/design` modes.
- **`project-config.template.md`:** `Design` row in §2 Pipeline Status gains the `🟡 Parcial (seed)` value (row not renamed — M3).
- **Layer-5 audit report:** finding F1 closed.

---

## [v6.2.1] — 2026-06-01

### Added

- **Phase 9 cierra la fila `Design` en `project-config.md` §2 Pipeline Status.** Cumple el contrato del template (`Cada workflow actualiza su fila al cerrar`), que estaba declarado pero ningún workflow implementaba como edición (`tk-discovery` solo instancia el template). Mecanismo **Read-first → Edit condicional** (NO Edit a ciegas: `old_string` literal de la línea leída, evita el fallo en headless cuando la fila ya está en `✅` o el padding varía). Guards: skip en `validar` (no llega a Phase 9), `is_factory: true` (tabla schema-v2 propia), celda ya `✅` (no-op), o sección/fila ausente (warning de 1 línea, no falla). Edita 1 celda: Estado → `✅ Completo`. Archivos: `SKILL.md` (§20.1 + §5). Hermano simétrico en `tk-backlog` v6.5.0 (cierra fila `Backlog`, 2 celdas).

## [v6.2.0] — 2026-06-01

### Added

- **SCR tier classification (Phase 4 NEW).** Orchestrator inline pass classifies each SCR into one of 3 tiers — `kit-pure` (stub ≤5 líneas) / `kit-extended` (light spec 5 secciones) / `custom` (full spec 13 secciones) — driven by `07_SK_LEVERAGE.md` rows + `layout_impact: bool` from packets + per-screen customizations rule (project-defaults excluded). Replaces 1-size-fits-all SCR emission.
- **Skill-gap validator + CP3 surface.** Post-classification lint heurístico sobre shard content vs expected skill hints (chart→kb-dataviz, DataTable→sk-ui, form→sk-ui form kit). Surface gaps to user at new **CP3** with 4 numbered options (approve+complete / approve-without-complete-acknowledged / override per-screen / cancel). Specer downstream emits `skills_warning_acknowledged: true` flag in spec when user opts to skip completion.
- **Per-N batching (Phase 5).** Specers process batches of `batch_size: 4` SCRs (configurable in frontmatter) instead of 1, amortizing cold-start cost ~4x. Two new agents: `dsg-screen-specer-light` (model sonnet, low-synthesis batch for `kit-extended`) + `dsg-screen-specer-full` (model inherit, dense synthesis for `custom`). Per-target atomicity + integrity check + re-spawn ≤2x + context-overflow split ≤1x.
- **§10 Invalidation handling.** Política explícita por caso (override CP3, skill-gap ack, validator mis-class 1-2 vs ≥3 SCRs, shard dedup, blocker loop budget, mid-run branding change).
- **§11 Agent contracts table.** Model + tools allowlist + Input/Return/Cuándo-NO-usar sections + skill grounding inject pattern declarados per agent.
- **Phase 0 cleanup pre-flight (R-NEW-1).** AskUserQuestion tabla numerada 1/2/3 con default backup-then-remove. Reemplaza `rm -rf` directo.
- **Phase 9 notes harvest opt-in.** Mirror `tk-discovery §Phase 8 Close notes harvest`. Categorías: `tk-design-drift` / `sk-drift` / `workflow-drift`.
- **Plain language §2 extensión workflow-specific** — extiende `.claude/rules/CC.md §3` kit-wide rule con vocab SCR/CMP/FLW + CP narration pattern.
- **Per-FT shards en Phase 1 (eliminó monolito).** `dsg-context-analyst` emite `design-registry-{run_id}/per-ft/FT-XX.md`, no archivo consolidado. Phase 4 concatena per-SCR shards on-demand con dedup.
- **2 templates nuevos:** `registry-shard.template.md` + `scr-classification.template.md`.
- **2 templates de SCR adicionales:** `SCR.template.light.md` + `SCR.template.stub.md`. `SCR.template.md` (full) sin cambios estructurales — solo refs Phase 4→5, agent name → `dsg-screen-specer-full`.
- **Classifier harness:** `scripts/tools/verify-scr-classifier.ts` con 8 worked examples (boundary cases cubiertos). Comando: `pnpm test:scr-classifier`.

### Changed

- **Phase renumbering:** old Phase 4 (per-screen) → Phase 5; old Phase 5 (CMP) → 6; 6→7; 7→8; 7.5→8.5; 7.6→8.6; old CP3 → CP4; old Phase 8 → 9. New Phase 4 is SCR classification. Added new CP3 between Phase 4 and Phase 5.
- **Phase 1 output shape:** monolítico → per-FT shards. `dsg-context-analyst` reescrito.
- **Frontmatter:** añadido `parallelism_unit: batch`, `concurrency_cap: 6`, `batch_size_default: 4`. `last-verified` actualizado.

### Upstream (cross-skill)

- **`tk-discovery/templates/03_DEEP_DIVE.template.md`:** añadido `Layout impact: bool` field a Tier M y Tier L tables (8-fields ahora, era 7).
- **`tk-discovery/templates/15_IMPLEMENTATION_PACKET.template.md`:** añadido `Layout impact:` field propagado desde deep-dive. Consumido por `tk-design` Phase 4.
- **`dsc-feature-specer.md`:** Tier M renombrado a 8-fields. Field `Layout impact` añadido al output format.
- **`.claude/rules/CC.md`:** nueva §3 "Plain language al usuario (kit-wide)". Existing §3-§7 renumbered a §4-§8.

### Migration risk (semver) — audit completed

- **Downstream impact:** SCR file shape changes per tier. Audit pre-merge ejecutado sobre los 3 consumers:
  - **`bkl-context-analyst`:** schema `screens_with_features` actualizado con fields `tier` + `binding` v6.2.0 (`.claude/agents/bkl-context-analyst.md`). Stub tolerance documentada explícitamente.
  - **`bkl-issue-specer`:** nueva sección "Handling SCR tier" declara handling per-tier (kit-pure → integración kit primitive; kit-extended → light §3 customizations; custom → full §1..§13). Frontmatter `tier` checked BEFORE body section parsing. Back-compat: tier ausente → asume `custom`.
  - **`imp-issue-executor`:** nueva sección "Handling SCR tier" mirror de bkl-issue-specer. Skills allowlist incluye `binding` skill cuando tier=kit-pure.
- **Verdict:** cero cambios destructivos en downstream contracts → v6.2.0 minor OK (no major bump requerido).
- **QC tooling:** no consume SCR files directamente (lint vive en tk-design Phase 5 post-batch + Phase 8.6 sweep). No requiere cambios.
- **Projects pre-fix con SCR files completos:** `/validar` mode flag-ea como warning (no blocker) cuando SCR existente caería en `kit-pure` post-fix. Migración tolerante.
- **Cross-skill refs renumbered:** `tk-backlog/SKILL.md` y `tk-backlog/methodology/input-contract.md` actualizados con nuevas section refs `tk-design §7.2 / §13.1 / §19 / §23` y nuevo nombre `dsg-screen-specer-{light,full}`.

### Deferred

- **Cloud rendering integration** — future skill `tk-design-cloud` would consume `SCR-XXX.md` → render PNG/Figma, anotating the SCR with append-only section. Still ASCII-only contract in v6.2.0; cloud rendering opt-in downstream.
- **Specialized `dsg-design-*` validators** — v6.2.0 still uses 5 generic agents in Phase 8 with scope injected via prompt. If real-run pain shows prompt-scope-injection instability, future may create `dsg-design-{ui-critic,po,skeptical,architect,planner}.md` with restricted tools.
- **Plain-language extraction a `_shared/`** — decisión usuario v6.2.0: vive inline en CC.md kit-wide + extensión §2 aquí. Re-evaluar cuando `tk-implement` adopte plain language; si emerge segundo workflow extension idéntica → momento natural para extraer.

---

## [v1] — initial release (FACTORY-008)

### Added

- v1 initial release — workflow `/design` ships executable UI contract at slot 16. Multi-file output: `16_DESIGN.md` (index) + `16_DESIGN/SCR-XXX.md` per screen + `16_DESIGN/components/CMP-XXX.md` + `16_DESIGN/flows/FLW-XXX.md`. 8 phases + 3 CPs + Phase 7.5 Blocker Resolution + Phase 7.6 Pre-CP3 Canonical State Sweep. 5 validators parallel in Phase 7 (`ui-critic` + `product-owner` + `skeptical-client` + `architect` + `project-planner`) with non-overlapping scopes. 3 modes: `nuevo` / `con-direccion` / `validar`. Mobile-first invariant — every SCR must emit 375px ASCII layout. 3 subagents: `dsg-context-analyst` (Phase 1 serial), `dsg-screen-specer` (Phase 4 parallel cap 6), `dsg-component-specer` (Phase 5 parallel cap 4).

---

_TimeKast Factory — tk-design audit log (latest: v6.3.0)_
