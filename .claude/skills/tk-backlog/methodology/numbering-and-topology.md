# tk-backlog — Numbering & Topology

> Hook-safe IDs + topological rules + parallelism marking. Live behavior in [`../SKILL.md`](../SKILL.md) §3.1, §19, §21.

---

## Convention

One ID convention active in v6.4.0+. Commit-hook-safe via the PR0 fix (the hook skips `EPIC-NN` tokens and matches `{DOMAIN}-{NNN}` via token-boundary `grep`).

| Convention      | Filename                           | `Issue ID:` blockquote        | Numbering scope           | Tree ordering by epic |
| --------------- | ---------------------------------- | ----------------------------- | ------------------------- | :-------------------: |
| `epic-compound` | `EPIC-NN-{DOMAIN}-{NNN}-{slug}.md` | `{DOMAIN}-{NNN}` (shortform!) | per-epic within `EPIC-NN` |          yes          |

**Key insight:** the `Issue ID:` blockquote uses shortform `{DOMAIN}-{NNN}` always; the compound prefix lives only in the filename. `Closes: {DOMAIN}-{NNN}` works (the hook's token-boundary `grep` matches `-AUTH-003-` in the compound filename).

For compound projects, **prefer `Closes: EPIC-NN-{DOMAIN}-{NNN}` in commits** (the full compound form). It disambiguates when two issues in different epics share `{DOMAIN}-{NNN}` (rare but possible — the hook blocks with `ambiguous match` if you use the bare shortform).

## Why the scheme is constrained

`.claude/hooks/validate-commit.sh` extracts `Closes:` IDs with `grep -oE '[A-Za-z]+-[0-9]+'`, skips `^EPIC-[0-9]+$` tokens (epics aren't closeable), then matches each remaining token against `*/issues/*.md` via token-boundary `grep` (`(/|-)${ID}(-|\.md$)`). Therefore:

- The canonical `Issue ID:` is **one `LETTERS-DIGITS` token** (e.g. `AUTH-003`). Two-token compound `{DOMAIN}-{NNN}-{DOMAIN}-{NNN}` would still parse but the second token would match nothing.
- The filename has the ID as a `-`-delimited segment (compound form).
- IDs are unique per epic scope. Dual-match → hook blocks (PR0).

## Epic IDs

`EPIC-NN-{slug}` — `NN` topological, zero-padded. `EPIC-00` reserved for bootstrap. Number-at-front means `epics/` lists in logical order. Epic tokens `^EPIC-[0-9]+$` are SKIPPED by the hook (not closeable). Format under the `EPIC-*.md` glob is hook-safe.

## Issue IDs

`{DOMAIN}-{NNN}` (single token, used as `Issue ID:` blockquote):

- `{DOMAIN}` — uppercase domain code (`AUTH`, `MOV`, `DASH`, `SETUP`, …). Gives grep-ability + readable commit tracking.
- `{NNN}` — zero-padded 3 digits, **step=1** (`001, 002, 003, …`). Numbering per-epic within `EPIC-NN`. Each epic starts at `001`. Ceiling: 999 issues per epic (20× margin vs any realistic epic).

Filename shape: `issues/EPIC-NN-{DOMAIN}-{NNN}-{slug}.md`.

Special issue types carry their role in the **slug**, not the ID:

- `AUTH-004-ui-critic-{epic-slug}` — pre-assigned for `ui_touching` epics.
- `MOV-007-e2e-flow-{flw-slug}` — when a FLW spans ≥3 SCRs.

### Preassigned issue NNN (ui-critic, e2e-flow)

ui-critic preassigned and e2e-flow preassigned receive `NNN = max(NNN del epic) + 1` **at Phase 4 emission time**. They are NOT renumbered if a functional issue is added later (`extend-epic`) — the new functional issue takes `max+1` and lands after the preassigned one positionally. The semantic "ui-critic closes the epic" is enforced by the **topology** (`sequential_chains` lists ui-critic as tail), NOT by NNN position.

### `nuevo` / `extend` / `extend-epic`

- `nuevo`: each new epic starts at `001` within its scope.
- `extend`: continues from `max(existing within scope) + 1` for the target epic.
- `extend-epic EPIC-NN <plan>`: continues from `max(existing in EPIC-NN) + 1`.

### Tradeoffs

- **Inserts entre existentes** require renumeration (no gap). Reordering belongs in `EXECUTION-ORDER.md` + `sequential_chains` del epic, not in NNN.
- **Raw `issues/` listing sorts** by `EPIC-NN`, then `{DOMAIN}-{NNN}` — tree ordering by epic, matching developer mental model. `BOARD.md` still sorts alphabetically (update-board uses `id.localeCompare`); execution order still lives in `EXECUTION-ORDER.md`.

## Topological ordering

- **Within an epic:** no issue depends on one with a higher NNN. Enforced in the Phase 7.6 sweep.
- **Across epics:** cycles are blockers → `decisions/DECISION-BACKLOG-XXX-{slug}.md`. `EXECUTION-ORDER.md` shows the global topological sort + Wave assignment.

## Parallelism marking (epic = SSOT)

Per epic `## Topology` block:

```yaml
parallelizable_issues: [AUTH-003, AUTH-004]
sequential_chains:
  - [AUTH-005, AUTH-006]
  - [AUTH-007, AUTH-008, AUTH-009]
```

- `parallelizable_issues` — zero-dep singletons (can spawn concurrent `/implement`).
- `sequential_chains` — ordered chains (serial within; chains run parallel to each other).
- Invariant (sweep): `parallelizable_issues ∪ sequential_chains.flat() == {all issue IDs in the epic}`.
- The per-issue `> **Parallelizable:**` line is **derived** from this block; never the other way around.

**Plan-mode — shared-file chains (connected components).** In plan-mode the chains are derived from **file overlap** (a file may belong to ≥2 issues — [`plan-mode-input.md`](plan-mode-input.md) §Shared-file sequencing): build the graph where two issues share an edge iff they share ≥1 file; **each connected component → one `sequential_chain`** (handles the transitive case A∩B, B∩C, A∩C=∅ → all three in one chain). Chain order = ascending NNN (= plan order). Issues with no overlap → `parallelizable_issues`.

**Nota N4 — non-contiguous chains are valid.** A chain may skip NNN values (e.g. `[1,5]` while `[2,3,4]` are parallelizable) when issues 1 and 5 share a file but 2-4 don't. This is **correct** — the invariant is "no issue depends on a higher NNN", which `[1,5]` (1→5) respects. The Phase 7.6 sweep MUST NOT "fix" the gap by renumbering or by merging the intermediate issues into the chain.

Enables a future `/implement-epic` to fan out: one `/implement` per chain head + per parallelizable singleton, respecting cross-epic `Depends on`.

---

## Legacy mode (pre-v6.4.0)

Pre-v6.4.0 the kit emitted under `global-gap-10`: filename `{DOMAIN}-{NNN}-{slug}.md`, NNN step=10 (`010, 020, 030, …`), numbering global across all `project/backlog/**/issues/*`. Kit no longer emits this. Existing backlogs that used it (e.g. Factory `project/backlog/v6.0/` with `FX-001`, `KIT-013`, etc.) remain intact and continue to work — the hook's token-boundary `grep` still matches the shortform filename pattern. No automatic migration.

If a derived project needs to extend a legacy `global-gap-10` epic in v6.4.0+, `/backlog extend-epic` will emit the next NNN as `max(existing) + 1` (e.g. an epic with `RBAC-010..RBAC-060` will get `RBAC-061` next — linear, no detection branching). The visual mix is a known trade-off; regenerate the backlog manually if coherence is preferred.

---

_TimeKast Factory — tk-backlog v6.6.0 · numbering-and-topology_
