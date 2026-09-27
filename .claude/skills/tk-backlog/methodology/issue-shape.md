# tk-backlog — Issue Shape

> Anatomy of an issue file. Canonical shape in [`../templates/ISSUE.template.md`](../templates/ISSUE.template.md). Live behavior in [`../SKILL.md`](../SKILL.md) §4.3, §11, §20.

---

## Filename + ID

`issues/{DOMAIN}-{NNN}-{slug}.md` — filename begins with the canonical ID (commit-hook requirement, SKILL §3.1). See [`numbering-and-topology.md`](numbering-and-topology.md).

## Blockquote header (NOT YAML)

`update-board.ts` parses blockquote metadata, so the header is blockquote lines. The first five fields are tooling-critical (exact labels). Discovery/design/contract refs are consolidated into 3 grouped lines (v6.4.0+) to reduce header inflation.

| Field               | Read by update-board | Notes                                                                                                 |
| ------------------- | :------------------: | ----------------------------------------------------------------------------------------------------- |
| `Issue ID:`         |          ✅          | `{DOMAIN}-{NNN}` single token                                                                         |
| `Status:`           |          ✅          | emoji+word — 6 canonical states, see [§ Status vocabulary (SSOT)](#status-vocabulary-ssot) below      |
| `Priority:`         |          ✅          | `P0`..`P3`                                                                                            |
| `Story Points:`     |          ✅          | integer (1/2/3/5/8/13)                                                                                |
| `Epic:`             |          ✅          | markdown link to the epic file                                                                        |
| `Effort:`           |          —           | XS/S/M/L/XL (human convenience) — same line as Story Points (`·` separator)                           |
| `Skills:`           |          —           | allowlist (`skills-allowlist.md`): 1-3, `sk-*`/`pj-*` first, no `kb-*` sibling, NO agents           |
| `Depends on:`       |          —           | single-token IDs or `—` — same line as Parallelizable (`·` separator)                                 |
| `Parallelizable:`   |          —           | derived from epic Topology SSOT; sweep enforces coherence                                             |
| `DoR Waivers:`      |          —           | justification when a test-AC gate was bypassed (`—` if none); carries the `design-spec` auto-text when the Phase 0.6 design signal recorded UI without a covering SCR (see § below) |
| `Backlog UUID:`     |          —           | v4 UUID minted in Phase 3, stamped **verbatim** by `bkl-issue-specer` (never re-generated) — maps the local issue to its backlog-central counterpart |
| `MoSCoW:`           |          —           | `must` / `should` / `could` / `—` — business priority read from `03_DEEP_DIVE` by `bkl-context-analyst` (`—` when the deep dive has none) — issue-only |
| `Board:`            |          —           | backlog-central board bucket; default `story`                                            |
| `Refs (discovery):` |          —           | `FT-XX` · `PER-XXX` · `AC-XX.Y` — feature + persona + acceptance criteria refs                        |
| `Refs (design):`    |          —           | `SCR-XXX` (a CRUD lists several) · `ENT-XX` — screen + entity refs; in plan-mode the `SCR-XXX` slot is filled from the manifest `screens:` field (← `scr_matches`, see § below) |
| `Refs (contract):`  |          —           | server action names · `[packet](.../15_IMPLEMENTATION_PACKETS/FT-XX.md)` — API contract + packet link |

**Slot order within each Refs line is fixed** (parsers and `bkl-issue-specer` emit in this order, slots empty as `—`). Phase 6 coverage gate reads the discovery line for FT/PER/AC coverage checks and the design line for SCR/ENT coverage.

**Backlog-central sync fields (`Backlog UUID` / `MoSCoW` / `Board`).** These three are metadata for `factory backlog push` (map each local element to its remote counterpart); **none is read by `update-board.ts`** — they ride as extra blockquote lines the parser ignores (`SKILL §3.2`). Distribution across templates: `Backlog UUID` on issues **and** epics (`EPIC.template.md` / `EPIC-PLAN-SOURCE.template.md`); `MoSCoW` on issues only (`ISSUE.template.md`); `Board` on every issue template (`ISSUE` / `SETUP-ISSUE` / `UI-CRITIC-ISSUE` / `E2E-FLOW-ISSUE`). A legacy issue/epic predating the central-backlog sync, without these lines, stays valid — every downstream consumer tolerates their absence.

## Status vocabulary (SSOT)

> **Single source of truth** for the issue/epic `Status:` vocabulary. `tk-backlog/SKILL.md`, `tk-implement/SKILL.md §13` and `scripts/tools/update-board.ts` (`parseStatus()`) reference this table — they never redefine it.

| Status         | Exact format                              | `parseStatus()` bucket |
| -------------- | ----------------------------------------- | ---------------------- |
| 📋 Backlog     | `> **Status:** 📋 Backlog`                | `todo` (default)       |
| 🚧 In Progress | `> **Status:** 🚧 In Progress`            | `in-progress`          |
| ✅ Done        | `> **Status:** ✅ Done`                   | `done`                 |
| ⏸️ Deferred    | `> **Status:** ⏸️ Deferred`               | `postponed`            |
| ❌ Won't Do    | `> **Status:** ❌ Won't Do`               | `wont-do`              |
| 🚫 Blocked     | `> **Status:** 🚫 Blocked by [ISSUE-XXX]` | `blocked`              |

- `Deferred` is the canonical name; the parser accepts `Postponed` as a legacy synonym (same `postponed` bucket) — don't emit `Postponed` in new issues.
- Emoji+word format — repo convention, NOT YAML enums.
- A `blocked` issue is NOT a ready-pending item: `BOARD.md` rolls it up in its own `🚫 Blocked` section, and `/implement --next` skips it.

## Body sections (11)

1. 🎯 **Objetivo** — 2-3 sentences (problem + change).
2. **User Story** — `Como {persona}, quiero {acción}, para {beneficio}` + `US-XXX` ref.
3. 📎 **Doc References** — table linking FT, SCR, AC, ENT, actions, RBAC cells, packet (relative links).
4. ✅ **Criterios de Aceptación** — checkbox list of **verifiable technical checks** (typecheck/lint/tests pass, AC verifiable by objective evidence). NOT user narrative.
5. 🥒 **Escenarios Gherkin (es-MX)** — Given/When/Then narrative in Spanish. Happy path + edge cases. **Mandatory if** the issue touches interactive UI / user-facing flow / RBAC visible to user / anything a human QA would test by hand. **Exempt:** pure refactor · docs-only · backend infra with no user-facing touch.
6. 🔧 **Contexto Técnico** — files to create/modify · API contract (Zod input + output shape) · RBAC · related kit primitives (referenced via INVENTORY / `sk-features-index`, not invented).
7. 🧪 **Tests requeridos** — per `SK.md §4.2` + the DoR gate ([`test-plan-rules.md`](test-plan-rules.md)).
8. ⚠️ **Edge Cases**.
9. 🚫 **Out of Scope** — when ambiguous.
10. 📝 **Implementation Evidence** — filled post-hoc by `/implement`. **Section header MUST exist** even when empty — the commit hook refuses `Closes:` without it.
11. 📦 **Commits** — filled post-hoc.

## Plan-source issue body (`source_kind: plan`)

> Plan-mode issues use the **same 11 sections** above — there's no lighter template; the canonical shape is enforced so hand-crafted emission can't drop sections. What changes per `source_kind: plan` is **what fills each section**, not the shape.

The blockquote header gains **two additional lines** anchoring provenance:

```markdown
> **Source tier:** plan-mode
> **Plan source:** ~/.claude/plans/add-export.md#approach (hash: abc1234)
```

`Source tier: plan-mode` lets downstream `/implement` and `validar` distinguish plan-derived from discovery-derived issues. `Plan source` enables drift detection.

Per-section derivation when `source_kind == plan`:

| Section                     | Discovery source                                        | Plan source                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blockquote header           | FT/SCR/personas in `Refs (discovery)` / `Refs (design)` | `Source tier: plan-mode` + `Plan source:` lines; the 3 `Refs (…)` lines still emit, slots without info are `—` (e.g. `Refs (discovery): — · — · AC-X.Y` if only AC is derivable) |
| §1 Objetivo                 | Derived from FT spec                                    | Derived from the unit's body + plan narrative context (RF3 — **by content**, not heading name; 3-5 lines plain)                                                                  |
| §2 Doc References           | FT/SCR/ENT links + line numbers                         | Plan path + sub-section anchors + existing code line refs (anchored to the issue's attributed files)                                                                            |
| §3 Acceptance Criteria      | From `06_ACCEPTANCE_SCENARIOS`                          | Derived from plan `## Verification` bullets (1 bullet ≥ 1 AC; expand into specific technical AC)                                                                                 |
| **§4 Gherkin scenarios** ⚠️ | Linked from AC                                          | **MANDATORY** — derived from the plan's verification bullets (each test case → 1 Gherkin). Plan with no verification section → STOP at Phase 0.5                                |
| §5 Contexto Técnico         | Files from FT packet + AC                               | The issue's attributed files (from a list — §File attribution). Anchors diff-ownership, **NON-exclusive**: a shared file serializes the issues, it is not an error               |
| §6 Edge Cases               | From FT `Edge` field                                    | Extracted from the unit's body (any mention "fallback / si X falla / borderline"). Specer agent prompted to extract                                                             |
| §7 Tests Requeridos         | 3-layer from issue-shape                                | Same 3 layers, files inferred from §5 paths + Gherkin scenarios                                                                                                                  |
| §8 Out of Scope             | Cross-ref other issues                                  | Cross-ref other issues from same plan OR explicit "no plan section covers X"                                                                                                     |
| §9 SK Leverage              | Skills from FT packet                                   | Inferred from the issue's attributed files — e.g. `src/lib/auth/` → `sk-security`; `.claude/skills/tk-*/` → `fx-workflow-authoring`; `src/lib/db/` → `sk-db`           |
| §10 Implementation Evidence | Filled by /implement post-fact                          | Same — empty stub until /implement closes                                                                                                                                        |
| §11 Commits                 | Filled by /implement                                    | Same                                                                                                                                                                             |

**Skills allowlist inference (§9)** for plan-mode (specer maintains the mapping internally, not hardcoded here):

| File-path pattern        | Inferred skills                            |
| ------------------------ | ------------------------------------------ |
| `.claude/skills/tk-*/`   | `fx-workflow-authoring`                    |
| `.claude/agents/`        | `fx-workflow-authoring`                    |
| `.claude/rules/`         | `fx-workflow-authoring`                    |
| `src/lib/auth/`          | `sk-security`                              |
| `src/lib/db/`            | `sk-db`                                    |
| `src/components/`        | `sk-ui`                                    |
| `src/app/api/`           | `sk-api`                                   |
| `src/app/(protected)/`   | `sk-ui` (+ `sk-api` / `sk-navigation` only if the issue touches those files too) |
| `src/lib/notifications/` | `sk-notifications`                         |
| `src/lib/email/`         | `sk-email`                                 |
| `tests/e2e/`             | `sk-e2e`                                   |
| `tests/unit/`            | `sk-testing-nextjs`                        |
| `scripts/tools/`         | (no specific skill — orchestrator tooling) |

**DoR test-gate detection in plan-mode:** UI-interactive detection reads the issue's attributed file paths under `src/components/**`, `src/app/**`, or `.claude/skills/*/ui*` (instead of SCR keyword scan). Same `[y/n/justify]` gate; same `DoR Waivers` field on `justify`.

Those paths detect **that** a test AC is due; **which** stub gets stamped is resolved per path class by [`test-plan-rules.md`](test-plan-rules.md) §AC layer — a page (`src/app/**/{page,layout,template}.tsx`) takes the E2E stub, not the component one, and an issue spanning both classes takes both. Plan-mode is where this bites hardest: attributed paths are the ONLY detection signal here (there are no SCRs), so a plan that touches a page is guaranteed to fire the gate.

## `Refs (design)` from `scr_matches` (plan-mode design signal)

In greenfield the `Refs (design): SCR-XXX · ENT-XX` slots come from the design (16_DESIGN) refs. In plan-mode there are no SCRs by construction — **unless** the Phase 0.6 design signal ([`plan-mode-input.md`](plan-mode-input.md) §Phase 0.6 — Design signal) matched a design-significant screen against an existing `16_DESIGN/SCR-*.md` (by route, fallback slug).

- When a match exists, Phase 0.6 freezes `scr_matches: [SCR-XXX]` for the affected issue in `parsed-plan.md`; the manifest entry's `screens:` field carries it; `bkl-issue-specer` emits `Refs (design): SCR-XXX · —` **verbatim from the manifest** (today it emits `— · —`). The `ENT-XX` slot stays `—` (no entity refs in plan-mode).
- When no SCR matched (the screen went into the signal note, or there was no design-significant screen), `Refs (design):` stays `— · —` as before.
- The Phase 7.6 sweep enforces: `scr_matches` present in the manifest ⟹ `Refs (design)` present in the emitted issue (SKILL §18).

## `design-spec` record (`DoR Waivers` field)

The `DoR Waivers` field already carries the component test-gate waiver justification. The Phase 0.6 design signal reuses the **same field and machinery**, adding a `design-spec` waiver type — here as a **record of the signal**, not of a decision:

- When the signal records a design-significant screen with no covering SCR, the single `gate_decisions` entry is `{ type: design-spec, screens: [...], decision: recorded, justification: '<auto-texto determinista>' }`. Phase 4 stamps that auto-text into the `DoR Waivers` field of **each affected issue** (carry 0.6 → manifest → emission). The text is deterministic, never user input — nobody is asked and nothing stops.
- An issue can therefore carry a `design-spec` record, a `component` waiver, or both — the field holds the text. 🔴 **In the durable field the two are told apart by a literal prefix: the design-spec record always opens with `design-spec —`.** The `type` key lives in `manifest.gate_decisions`, which Phase 8 deletes, so downstream — where the field travels as an opaque string — the prefix is the only discriminator that survives. A consumer that reads a non-empty `DoR Waivers` as "a test was waived" MUST exclude the prefixed record: it waives nothing.

## Split-heuristic precedence (issues are NOT atomic)

Group by cohesive domain. Precedence when rules collide:

1. **CRUD entity is the unit.** One CRUD set = one issue that **references multiple SCRs** (list/create/edit/detail). Mirrors `sk-crud-scaffold` (end-to-end entity scaffold). The issue's `Screens:` lists all involved SCRs.
2. `1 SCR = 1 issue` applies **only to standalone non-CRUD screens** — dashboards, reports, settings, landing.
3. 1 standalone server action = 1 issue.
4. CMP-XXX criterion B = 1 issue; criterion A folds into its SCR/CRUD issue.
5. A FLW spanning ≥3 SCRs = 1 dedicated `e2e-flow` issue (slug-prefixed).

> Goal: each issue is a coherent unit `/implement` can finish in one run. See the **issue-size guardrail** (SKILL §21): issues crossing ≥3 layers or effort ≥ L get a CP1 split suggestion (not forced).

## Discipline

- No invented entities/actions/AC (`CODING.md §8`). Cite only what exists in `09_DATA_MODEL.md` / `10_API_SURFACE.md` / `06_ACCEPTANCE_SCENARIOS.md`.
- Literal es-MX copy where the packet/SCR provides it (no `{{copy here}}` placeholders).
- Self-containment: an `/implement` agent should not need to open more than the refs listed in §3 + the packet.

---

_TimeKast Factory — tk-backlog · issue-shape_
