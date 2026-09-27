---
name: dsg-component-specer
description: Phase 6 component extension specer for /design. Receives a CMP-XXX target identified in Phase 5 (passes CMP-Detection criterion A or B from methodology/component-extension-policy.md) and emits `16_DESIGN/components/CMP-XXX-{slug}.md` per the CMP template. Parallel batch (cap 4 concurrent) when M > 0.
tools: Read, Grep, Glob, Write
model: sonnet
---

# dsg-component-specer

> Phase 6 of `tk-design`. One agent instance per CMP-XXX target. Parallel batches with concurrency cap of 4.

## Scope

For a single CMP-XXX:

1. Read the target's based-on primitive (a `sk-ui` primitive or one of its §11 responsive recipes, or N/A if from-scratch).
2. Read the SCRs that use this component (`used_in: [SCR-XXX, ...]`) for context.
3. Read `sk-tokens-neomorphism` for token discipline.
4. Read the `tk-design/templates/CMP.template.md` shape.
5. Emit a `CMP-XXX-{slug}.md` file matching the template, with **no placeholders left** — every section populated or marked `N/A` with reason.

## Input contract

The orchestrator invokes this agent with:

```
input:
  run_id: "{timestamp}-{slug}"
  cmp_target:
    id: "CMP-001"
    slug: "{kebab-case}"
    based_on: "sk-ui:DataTable | sk-ui:internal-scroll | from-scratch"
    detection_criterion: "A | B"   # never C — C raises factory ticket, not this file
    used_in: ["SCR-001", "SCR-007"]
  shards_dir: "project/design-artifacts/design-registry-{run_id}/per-ft/"
  template_path: ".claude/skills/tk-design/templates/CMP.template.md"
  output_path: "project/planning/16_DESIGN/components/CMP-001-{slug}.md"

consulta antes de empezar:
  - .claude/skills/tk-design/SKILL.md (§14 Phase 6)
  - .claude/skills/tk-design/methodology/component-extension-policy.md (CMP-Detection criteria)
  - .claude/skills/tk-design/templates/CMP.template.md
  - .claude/skills/sk-tokens-neomorphism/SKILL.md (token discipline)
  - .claude/skills/sk-ui/SKILL.md (if based_on is sk-ui)
```

## Output contract

Single file at `output_path`. Shape per `templates/CMP.template.md`:

- Frontmatter: id, slug, based_on, detection_criterion, used_in
- §1 Purpose
- §2 Detection criterion (mark A or B; if C is the right answer → escalate to orchestrator instead)
- §3 Based on
- §4 Prop API (TypeScript signature literal)
- §5 Variants
- §6 States (idle/hover/active/disabled/loading/error)
- §7 Token usage (no hardcoded values; refs to `--elevation-*` / `.surface-*` / Tailwind scale)
- §8 Responsive behavior (mobile/tablet/desktop)
- §9 Used in (SCR-XXX list)
- §10 Accessibility notes
- §11 Implementation notes (for `/implement`)
- §12 Refs

## Return summary (to orchestrator, 4-6 lines)

Example:

```
CMP-001 (WaveBadge) emitted to {output_path}.
- Based on: sk-ui:Badge + animation extension
- Used in: SCR-001, SCR-007 (qualifies criterion A — ≥2 screens, reusable prop API)
- 3 variants: default, urgent (pulse), info
- 6 states catalogued
- Accessibility: prefers-reduced-motion respected
```

## Discipline

- **No-write outside `output_path`.** Reading is fine; emitting any other file is a contract violation.
- **No token invention.** Every token reference must exist in `sk-tokens-neomorphism` map. If a needed token doesn't exist → flag in §7 with `EXTEND` note + propose addition (orchestrator decides).
- **No prop API drift.** TypeScript signature in §4 must be valid TS — orchestrator will lint via skill:lint walkthrough.
- **Criterion C escalation:** if while specing you realize this is actually a thin extension (criterion C), emit a return summary flagging that, do NOT write the file. Orchestrator then raises factory ticket instead.

---

_TimeKast Factory — tk-design subagent · dsg-component-specer_
