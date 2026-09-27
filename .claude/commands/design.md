---
description: Design — converts discovery output into an executable UI contract at slot 16 (per-screen layout + SK component bindings + states + copy) for consumption by /backlog and /implement.
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, AskUserQuestion
argument-hint: '[nuevo|con-direccion|validar|add <plan-file>] [--keep-artifacts]'
---

# /design

Run the `tk-design` workflow.

## Args

- `$ARGUMENTS` — pass through to the skill as mode dispatch:
  - `nuevo` — fresh run from Phase 1.
  - `con-direccion` — consume visual direction already locked in `00_DISCOVERY_BRIEF.md §11.2`. Skips Phase 2 + CP1.
  - `validar` — read-only validation of existing `project/planning/16_DESIGN*`.
  - `add <plan-file>` — modo day-2: consume un plan de Plan Mode + el código existente, siembra un `16_DESIGN.md` mínimo si no existe, clasifica las pantallas tocadas (nueva/regenerar/backfill), emite/actualiza SCRs con provenance, y al cerrar ofrece encadenar a `/backlog add`.
  - (empty) — Phase 0 will ask the user inline.
- `--keep-artifacts` — opcional: conserva `project/design-artifacts/{run-id}/` tras el run para debug, forensics o mediciones. Default = limpiar en Phase 9 step 20.3.

## Behavior

Delegate to skill [`tk-design`](../skills/tk-design/SKILL.md). The skill owns all phase semantics, checkpoints, and emit logic.

This command MUST NOT redefine phases, override checkpoints, or duplicate skill semantics — pure thin wrapper per `fx-workflow-authoring §12`.

Use **TodoWrite** from Turn 1 to track: Phase 0 (mode + readiness) · Phase 1 (context) · Phase 2 (visual direction, if `nuevo`) · **CP1** · Phase 3 (IA) · **CP2** · Phase 3.5 (vocab) · Phase 4 (SCR classification + skill-gap validator) · **CP3** · Phase 5 (per-screen contracts) · Phase 6 (component extensions, if any) · Phase 7 (reinforce) · Phase 8 (5 validators) · Phase 8.5 (blocker resolution, if any) · Phase 8.6 (Pre-CP4 Sweep) · **CP4** · Phase 9 (emit).

For `add <plan-file>` (day-2) the phases differ: Phase 0 (mode + `needs_seed` detect) · Phase 0.5 (parse plan) · Phase 1 (context, `plan-code`) · Phase 2-seed (only if `needs_seed`) · **CP1-seed** (if seeding) · Phase 3-delta (index reconcile) · **CP3** · Phase 5 (per-screen contracts) · Phase 7 (reinforce) · Phase 8 (validators) · Phase 8.6 (Pre-CP4 Sweep) · **CP4** · Phase 9 (emit + offer `/backlog add`).
