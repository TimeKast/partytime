---
description: Mockup — renders /design output (16_DESIGN + SCR/CMP/FLW) into a navigable, offline, client-facing HTML walkthrough at project/mockup/ using the fx-presentation-kit catalog.
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, AskUserQuestion
argument-hint: '[validar] [--client <path>] [--keep-artifacts]'
---

# /mockup

Run the `tk-mockup` workflow.

## Args

- `$ARGUMENTS` — pass through to the skill as mode dispatch:
  - (empty) — render exhaustivo: todas las SCR del `16_DESIGN` del proyecto (Phase 0 confirma + readiness).
  - `validar` — read-only sobre `project/mockup/` existente (integridad: cobertura, assets, iconos resueltos, anti-jerga) + report. Cero writes durables.
- `--client <path>` — opcional: override del project root (renderiza el `16_DESIGN` de otro repo derivado). Default = repo actual.
- `--keep-artifacts` — opcional: conserva `project/mockup-artifacts/{run-id}/` tras el run. Default = limpiar en Phase 4.

## Behavior

Delegate to skill [`tk-mockup`](../skills/tk-mockup/SKILL.md). The skill owns all phase semantics, checkpoints, and emit logic.

This command MUST NOT redefine phases, override checkpoints, or duplicate skill semantics — pure thin wrapper per `fx-workflow-authoring §12`.

Use **TodoWrite** from Turn 1 to track: Phase 0 (mode + cleanup pre-flight + readiness gate) · Phase 1 (render-plan) · **CP1** · Phase 2 (render por tier) · Phase 3 (ensamble + assets) · **CP2** (Plan Mode) · Phase 4 (auto-checklist + cleanup).
