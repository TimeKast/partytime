# tk-backlog — Derived-Project Conventions

> Detection for **how a derived project organizes its backlog**: layout pattern + ID convention check + the `extension_mode` flag that drives downstream Phase 7 validator scope. Anchors the Phase 0.1 sub-step. Live behavior in [`../SKILL.md`](../SKILL.md) §6.

In v6.4.0+ the kit ships one active ID convention (`epic-compound` step=1). Derived projects diverge mostly on **layout_pattern** (Scrum sprints, milestones, semver versions). The pre-v6.4.0 `global-gap-10` convention is detected only as informational ("legacy backlog found") — no behavior branching.

---

## What gets detected

Three orthogonal facets, decided in Phase 0.1 **before** the hard-gate check and **before** any subprocess is spawned. Output → `project_conventions` block in `backlog-registry.md` (consumed by `bkl-context-analyst` and the Phase 7 validators).

| Facet            | Range                                                                      | Default (greenfield) |
| ---------------- | -------------------------------------------------------------------------- | -------------------- |
| `layout_pattern` | `v{X}` (legacy default) · `M{X}` · `sprint-{N}` · `milestone-{N}`          | `v{X}`               |
| `id_convention`  | `epic-compound` (active default) · `global-gap-10` (legacy, informational) | `epic-compound`      |
| `extension_mode` | `greenfield` (discovery+design as source) · `operational` (Plan Mode plan) | derived from mode    |

---

## 0.1.a — `layout_pattern` detection

```
scan project/backlog/*/   # immediate children, dir names only
collect ./<name>/ where ./<name>/epics/ exists OR ./<name>/issues/ exists

match each name against:
  ^v\d+(\.\d+)?$        → "v{X}"             (legacy default — Factory canonical)
  ^M\d+$                → "M{X}"             (numbered milestones, e.g. `M1`, `M2`)
  ^sprint-\d+$          → "sprint-{N}"
  ^milestone-\d+$       → "milestone-{N}"

resolution:
  - 0 matches AND mode == nuevo                 → default "v{X}" (greenfield preserved)
  - 0 matches AND mode != nuevo                 → STOP "no backlog detected; use `nuevo`"
  - all matches same pattern                    → adopt that pattern
  - mixed patterns across dirs                  → STOP, AskUserQuestion inline
                                                  ("Detected v6.0/ AND M1/; pick canonical or merge first")

override: project-config.md §1 `backlog.layout: <pattern>`   → wins over detection
```

The pattern is used by Phase 8 to pick the **target dir name** for new epics/issues — never to rename existing dirs.

---

## 0.1.b — `id_convention` check

The active convention is `epic-compound` step=1. The check exists to surface a friendly note when a project extends a legacy backlog.

```
if mode == nuevo:
  → "epic-compound" (active default — no detection needed)

else:
  sample up to 20 issue filenames across all backlog dirs (uniform random if >20)

  regex_legacy_shortform = ^[A-Z]+-\d{3}-.+\.md$            # e.g. AUTH-030-foo.md
  regex_compound         = ^(?:EPIC-)?\d{1,3}-[A-Z]+-\d{3}-.+\.md$
                           # e.g. EPIC-01-AUTH-003-foo.md

  count matches per regex; pick majority:
    - ≥80% compound          → "epic-compound" (active default)
    - ≥80% shortform         → "epic-compound" + emit informational note
                              ("Legacy backlog detected — extending in step=1 from max+1")
    - mixed <80% either way  → STOP, AskUserQuestion explicit
                              ("Filenames mix shortform and compound; pick one or migrate first")

override: project-config.md §1 `backlog.id_convention: <value>` → wins over detection
```

Effect on emission (v6.4.0+): always **filename `EPIC-NN-{DOMAIN}-{NNN}-{slug}.md` + `Issue ID:` blockquote `{DOMAIN}-{NNN}`** (shortform). Legacy detection only adjusts the surfaced note; the next NNN is always `max(existing in scope) + 1` linearly.

The commit hook is convention-safe via PR0 fix — see [`numbering-and-topology.md`](numbering-and-topology.md) §Why the scheme is constrained.

---

## 0.1.c — `extension_mode` flag

Drives Phase 7 validator scope (see `../SKILL.md` §14):

| Invocation mode                  | `extension_mode` | Source of truth                            |
| -------------------------------- | ---------------- | ------------------------------------------ |
| `nuevo`                          | `greenfield`     | discovery (00-15) + design (16)            |
| `extend` (was `add` pre-v6.3.0)  | `greenfield`     | discovery + design + delta from existing   |
| `add <plan-file>` (NEW)          | `operational`    | Plan Mode plan file (read by content)      |
| `extend-epic EPIC-NN <plan>` NEW | `operational`    | Plan + target epic context                 |
| `validar`                        | inherited        | metadata block of the existing backlog dir |

`operational` mode skips coverage gates against discovery refs (a plan has no FT/SCR/persona refs by construction) and runs a narrower validator set. Detail in [`readiness-gates.md`](readiness-gates.md) §extension_mode flag.

---

## Project-config overrides

A derived project can lock conventions in `project/planning/project-config.md` §1 (Identity):

```markdown
| **backlog** | layout: M{X} · id_convention: epic-compound |
```

Override precedence: **project-config > detection > default**. Useful when:

- The project starts greenfield but the team has already decided "we use M{X}".
- Detection sample is too small or mixed (project just bootstrapped).
- Forcing a specific layout after a mid-flight migration.

---

## What happens with the detection result

Phase 0.1 emits a small block at the head of the registry:

```yaml
# Phase 0.1 — project conventions
project_conventions:
  layout_pattern: 'M{X}'
  id_convention: 'epic-compound'
  extension_mode: 'operational'
  source: 'detection' # or "project-config-override" / "greenfield-default"
  sample_count: 12 # for id_convention only
  legacy_backlog_detected: false # true if pre-v6.4.0 shortform found
```

Downstream consumers:

- `bkl-context-analyst` — reads `id_convention` to compute `max NNN` per epic scope.
- Orchestrator Phase 3 — picks filename template + ID format for emission.
- Phase 7 validators — receive `extension_mode` to scope checks.
- Phase 8 — picks the target dir name from `layout_pattern`.

---

## Anti-patterns

- **Auto-migrating** an existing project's filenames or numbering. Out of scope for `/backlog`. A future `/backlog migrate-to-step1` may exist; until then, IDs are append-only per project.
- **Inventing** a layout pattern not in the matrix above. If detection STOPs on mixed, the orchestrator asks the user — never guesses a third option.
- **Reading sampling output past 20 filenames**. The 80% threshold is calibrated on a 20-sample window; larger reads waste tokens without changing the resolution.

---

_TimeKast Factory — tk-backlog v6.6.0 · derived-project-conventions_
