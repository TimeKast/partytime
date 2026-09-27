---
description: Backlog — converts /discovery + /design output OR a Plan Mode plan into self-contained, topologically-ordered backlog issues + epics consumed directly by /implement.
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, AskUserQuestion
argument-hint: '[nuevo|extend|add <plan>|extend-epic EPIC-NN <plan>|validar] [--skip-bootstrap] [--keep-artifacts] [--step] [--verbose]'
---

# /backlog

Run the `tk-backlog` workflow.

## Args

- `$ARGUMENTS` — mode dispatch:
  - `nuevo` — fresh backlog from a complete discovery+design. Includes `EPIC-00-bootstrap`. Auto-picks next free `{LAYOUT}` slot.
  - `extend` (was `add` pre-v6.3.0) — iterative: extend the latest active version with delta from discovery+design, continue per-convention numbering.
  - `add <plan-file>` — turn a Plan Mode plan into 1+ epics (1 per `## Epic:` heading; default 1) + N issues. Plan is read by content (NOT magic heading names): hard-requires ≥1 file enumerated to modify (in any list) + a verification/tests section recognizable by content (any name) — per `tk-backlog/methodology/plan-mode-input.md`.
  - `extend-epic EPIC-NN <plan-file>` — append plan-derived issues to an existing open epic. Same plan shape as `add`; updates the epic's Topology block.
  - `validar` — read-only drift detection (current upstream — discovery/design or plan-hash — vs existing backlog). Zero durable writes.
  - (empty) — Phase 0 asks the user inline.
- `--skip-bootstrap` — `nuevo` only: omit `EPIC-00-bootstrap` (project already bootstrapped).
- `--keep-artifacts` — opcional: conserva `project/backlog-artifacts/{run-id}/` (registry + manifest + parsed-plan) tras el run para debug o forensics. Default = limpiar en Phase 8.
- `--step` — override del modo fluido: para en cada checkpoint (CP-split / CP1 / CP2 / test-gate). `--verbose` — amplía el resumen/STOP. Default = **fluido** (para solo ante señal real; ver `tk-backlog/SKILL.md §6` tabla + `fx-workflow-authoring §7.1`).

## Behavior

Delegate to skill [`tk-backlog`](../skills/tk-backlog/SKILL.md). The skill owns all phase semantics, checkpoints (CP-split-proposal / CP1 / CP2), ID/topology rules, convention detection, and emit logic.

This command MUST NOT redefine phases, override checkpoints, or duplicate skill semantics — pure thin wrapper per `fx-workflow-authoring §12`.

Use **TodoWrite** from Turn 1 to track: Phase 0 (mode + readiness) · Phase 0.1 (convention detection) · Phase 0.5 (plan parse, plan-mode only) · Phase 0.6 (design signal, plan-mode only) · **CP-split-proposal** (plan-mode, if ≥2 file groups) · Phase 1 (registry) · Phase 2 (setup epic, nuevo) · Phase 3 (epics + manifest) · **CP1** · Phase 4 (issue emission) · Phase 5 (dependency closure) · Phase 6 (coverage gate) · Phase 7 (validación adversarial — el panel lo fijan el modo y, en plan-mode, el tier de riesgo resuelto en Phase 0.5) · Phase 7.5 (blocker resolution, if any) · Phase 7.6 (sweep) · **CP2** · Phase 8 (emit + handoff).

## Pipeline

```
/discovery → /design → /backlog → /implement                      (greenfield)
                       /backlog add <plan>      → /implement       (plan-mode)
                       /backlog extend-epic EPIC-NN <plan>         (plan-mode, append)
```
