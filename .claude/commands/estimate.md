---
description: Estimate — internal project pricing via story points (direction fee + Factory capacity + risk-coverage pool, Opt/Real/Cons MXN ranges with a single floor). Reads backlog > brief > quick scoping; writes project/planning/00b_INTERNAL_ESTIMATE.md.
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, AskUserQuestion
argument-hint: '[refresh]'
---

# /estimate

Run the `tk-estimate` workflow.

## Args

- `$ARGUMENTS` — pass through to the skill as mode dispatch:
  - (empty) — E0: puntúa desde la mejor fuente disponible (backlog > brief > scoping rápido) y escribe `project/planning/00b_INTERNAL_ESTIMATE.md`.
  - `refresh` — E1: recalcula desde §3 + §10 del estimate existente, sin re-puntuar issues.

## Behavior

Delegate to skill [`tk-estimate`](../skills/tk-estimate/SKILL.md). The skill owns the scoring scale, the price formula, the rates resolution (kit defaults + host override), the checkpoint and the output template.

This command MUST NOT redefine phases, override checkpoints, or duplicate skill semantics — pure thin wrapper per `fx-workflow-authoring §12`.

Use **TodoWrite** from Turn 1 to track: Phase 0 (modo + gates) · Phase 1 (fuente) · Phase 2 (scoring) · Phase 3 (cálculo) · **Phase 4** (checkpoint) · Phase 5 (escribir estimate) · Phase 6 (CP-commit).
