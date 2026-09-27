# tk-backlog — ui-critic Integration

> When and how a `ui-critic` review enters the backlog. Live behavior in [`../SKILL.md`](../SKILL.md) §14, §19. Canonical issue shape in [`../templates/UI-CRITIC-ISSUE.template.md`](../templates/UI-CRITIC-ISSUE.template.md).

---

## Why not in Phase 7

`/backlog` emits **text issues**. A visual-compliance audit needs **rendered UI**, which only exists after `/implement` produces code. So `ui-critic` is NOT one of the Phase 7 validators (those check backlog structure: coverage, topology, DoR/DoD, route convention). Running `ui-critic` against markdown would be theater.

## Default — per-epic auto-emit (pre-assigned)

For each epic with `UI Touching: yes`:

1. **Phase 3 pre-assigns** a `ui-critic` issue in the manifest (gets a global ID, slug `ui-critic-{epic-slug}`). Pre-assigning — not bolting on at Phase 8 — means it passes through CP1, Phase 6 coverage, Phase 7 validation, the 7.6 sweep, and lands in `EXECUTION-ORDER.md` like any other issue.
2. **Phase 4 materializes** it as the **last node of the epic's sequential chain** (it depends on the epic's UI issues — review runs after they're built).
3. At `/implement` time, that issue invokes the `ui-critic` agent against the rendered UI of the epic's screens.

The issue body (`UI-CRITIC-ISSUE.template.md`) lists the epic's screens to audit + the DS-compliance + scorecard dimensions `ui-critic` checks.

## Opt-in — per-issue

If the user flags a UI-heavy issue at CP1 or CP2, the workflow emits an extra `ui-critic` issue inline at that point (same template), chained after the flagged issue. Use for screens where visual quality is high-stakes beyond the epic default.

## Topology effect

The `ui-critic` issue is always the tail of a sequential chain (it `Depends on` the UI issues it reviews). It is never `parallelizable`.

---

_TimeKast Factory — tk-backlog v1 · ui-critic-integration_
