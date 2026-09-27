# tk-backlog — Input Contract

> How `/backlog` consumes inputs in each mode. Live phase behavior in [`../SKILL.md`](../SKILL.md) §7 (Phase 0) and §9 (Phase 1). Input set depends on `extension_mode` (see [`derived-project-conventions.md`](derived-project-conventions.md) §0.1.c).

---

## extension_mode → input set

| `extension_mode` | Triggered by                       | Primary source                  | Read by                                                                                     |
| ---------------- | ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `greenfield`     | `nuevo`, `extend`                  | discovery (00-15) + design (16) | `bkl-context-analyst` Phase 1 (full table below)                                            |
| `operational`    | `add <plan>`, `extend-epic <plan>` | Plan Mode plan file             | orchestrator Phase 0.5 (plan parser) + `bkl-context-analyst` Phase 1 reads `parsed-plan.md` |

`validar` inherits from the existing backlog (greenfield if issues lack `Source tier: plan-mode`; operational if they have it).

---

## Greenfield input table (`nuevo` / `extend`)

| Source                                     | Req (nuevo) | Used for                                                                                                             |
| ------------------------------------------ | :---------: | -------------------------------------------------------------------------------------------------------------------- |
| `project/planning/project-config.md`       |     ✅      | `SK_ACTIVE` · stack · branding · idioma · `is_factory` (STOP if true)                                                |
| `00_DISCOVERY_BRIEF.md`                    |     ✅      | Features overview · BR canvas · scope · §11 visual direction (context)                                               |
| `01_FREEZE_MAP.md`                         |     ✅      | Firm decisions → priority + MoSCoW + post-MVP exclusions                                                             |
| `02_PERSONAS.md`                           |     ✅      | PER-XXX (audience lens per issue; every MVP persona needs ≥1 issue)                                                  |
| `03_DEEP_DIVE.md`                          |     ✅      | FT-XX 7-field specs — **primary driver of the issue list**                                                           |
| `04_ARCHITECTURE.md`                       |     ✅      | Topology · module boundaries · route structure (validated vs `sk-project-structure`)                                 |
| `05_RBAC_MATRIX.md`                        |     ✅      | Role × resource × action → per-issue RBAC gate (slot `actions` in `Refs (contract):` + RBAC in §Contexto Técnico)    |
| `06_ACCEPTANCE_SCENARIOS.md`               |     ✅      | AC-XX.Y Gherkin → issue §Gherkin (es-MX) + slot `AC` in `Refs (discovery):`                                          |
| `07_SK_LEVERAGE.md`                        |     ✅      | Features shipped by SK → skills allowlist + "don't rebuild" guardrail                                                |
| `08_GLOSSARY.md`                           |   ⚠️ opt    | Domain terms → consistent naming (warning if absent, no STOP)                                                        |
| `09_DATA_MODEL.md`                         |     ✅      | Entities (ENT-XX) → §Contexto Técnico (schema + form fields + indexes) + slot `ENT` in `Refs (design):`              |
| `10_API_SURFACE.md`                        |     ✅      | Server actions → §Contexto Técnico (Zod input + output shape + RBAC + errors) + slot `actions` in `Refs (contract):` |
| `11_CLIENT_QUESTIONS.md`                   |   ⚠️ opt    | Unresolved open questions → DECISION refs                                                                            |
| `12_BACKLOG_READINESS.md`                  |     ✅      | Per-FT readiness (ready/partial/blocked) → propagates to issue `Status:` + dependency graph                          |
| `13_OQ_BY_FT_MATRIX.md`                    |     ✅      | OQs with `Consumer: /backlog` or `/implement` → DECISION/SPIKE refs in the issue                                     |
| `14_DOMAIN_REGISTRY_LOCKS.md`              |     ✅      | Nav registry → epic structure mirror · reports/cron registries → dedicated cron-jobs issues                          |
| `15_IMPLEMENTATION_PACKETS/FT-XX.md`       |   ✅ (≥1)   | **Primary input** — self-contained packet per FT → 1-N issues (granularity per domain)                               |
| `16_DESIGN.md`                             |     ✅      | Visual direction · IA · cross-cutting copy/states → §Contexto Técnico                                                |
| `16_DESIGN/SCR-XXX-{slug}.md`              |   ✅ (≥1)   | **Per-screen contract — drives per-screen / per-CRUD issue emission**                                                |
| `16_DESIGN/components/CMP-XXX-{slug}.md`   |   ⚠️ opt    | Component extensions — issue when CMP-Detection criterion A/B applies                                                |
| `16_DESIGN/flows/FLW-XXX-{slug}.md`        |   ⚠️ opt    | Cross-screen flows — `e2e-flow` issue when ≥3 SCRs                                                                   |
| `project/reference/INVENTORY.md` (autogen) | ⚠️ opt+warn | Components shipped/built → skills allowlist + "don't rebuild"                                                        |
| `project/reference/HOOKS.md` (autogen)     | ⚠️ opt+warn | Helpers available → §Contexto Técnico                                                                                |
| `project/reference/CODEBASE.md` (autogen)  | ⚠️ opt+warn | Dependency map → cross-issue `Depends on` inference                                                                  |
| `sk-features-index` (skill)                |     ✅      | Kit feature catalog — "does the kit ship X?" before emitting a "build X" issue                                       |
| `.claude/rules/DOR_DOD.md`                 |     ✅      | DoR / DoD criteria — enforcement gates (test gate, §test-plan-rules)                                                 |
| Existing `project/backlog/{LAYOUT}/`       | extend only | Active version detection · max NNN per epic scope (for `max+1`) · overlap check                                      |

---

## Operational input table (`add <plan>` / `extend-epic`)

Plan-mode reads a single plan file (parsed by orchestrator Phase 0.5 — see [`plan-mode-input.md`](plan-mode-input.md)). The plan replaces discovery+design as the source of truth. `bkl-context-analyst` Phase 1 reads the parsed-plan output, NOT the raw plan file.

| Source                                      |  Required   | Used for                                                                                                                                         |
| ------------------------------------------- | :---------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project/planning/project-config.md`        |     ✅      | Stack, branding, idioma, `is_factory`, optional `backlog.layout` / `backlog.id_convention` overrides                                             |
| Plan file (`*.md`)                          |     ✅      | Read **by content** (no magic heading names): **≥1 file enumerated** (any list) + **a verification section** (any name) are hard-required — see [`plan-mode-input.md`](plan-mode-input.md) §Required plan content |
| Existing `project/backlog/{LAYOUT}/`        |     ✅      | Active version detection · max ID per convention scope · target epic (extend-epic only)                                                          |
| `project/reference/INVENTORY.md` (autogen)  | ⚠️ opt+warn | Components shipped/built → skills allowlist + "don't rebuild" hints                                                                              |
| `project/reference/HOOKS.md` (autogen)      | ⚠️ opt+warn | Helpers available → §6 Contexto Técnico                                                                                                          |
| `project/reference/CODEBASE.md` (autogen)   | ⚠️ opt+warn | Dependency map → cross-issue `Depends on` inference                                                                                              |
| `sk-features-index` (skill)                 |     ✅      | Kit feature catalog — used by `bkl-issue-specer` for skills allowlist                                                                            |
| `.claude/rules/DOR_DOD.md`                  |     ✅      | DoR / DoD criteria — enforcement gates (test gate adapted to file-path detection)                                                                |

**NOT consumed in operational mode** (no FT/SCR/persona refs available by construction): `00`–`15`, `16_DESIGN.md`, `16_DESIGN/SCR-*.md`, `16_DESIGN/components/`, `16_DESIGN/flows/`. Phase 6 coverage gate and Phase 7 validators (`product-owner`) scope down accordingly — see [`readiness-gates.md`](readiness-gates.md) §extension_mode flag.

**Plan-hash drift detection:** orchestrator stores SHA-256 of plan file content at parse time (first 12 chars) into each emitted issue's `> **Plan source:** ... (hash: <sha-12>)` blockquote line. `validar` re-hashes the plan and reports `CHANGED` finding on mismatch.

---

## Path conventions (must match `/design` emission)

- SCR / CMP / FLW use the **slugged** form: `SCR-XXX-{slug}.md` — that's how `dsg-screen-specer-{light,full}` writes them per tier (tk-design §23 Subprocess delegation). Coverage-gate globs must match this form, not bare `SCR-XXX.md`.
- Artifacts `00..14` live flat in `project/planning/`. Packets in `project/planning/15_IMPLEMENTATION_PACKETS/`.

## Optional-with-warning pattern

If an `⚠️ opt+warn` autogen ref is missing (fresh project without a pre-commit run):

- `/backlog` continues.
- `COVERAGE-MATRIX.md §Consumer Readiness` records the caveat (e.g. `INVENTORY.md missing — "don't rebuild" check ran conservative`).
- `bkl-issue-specer` is more conservative about "already exists" claims.
- Reminder emitted: run `pnpm generate:inventory && pnpm generate:hooks` before `/implement`.

## Source hashes (for `validar`)

`bkl-context-analyst` records a content hash per consumed FT/SCR/ENT/AC into the registry; Phase 8 persists them in `COVERAGE-MATRIX.md §Source Hashes`. `validar` diffs current hashes against stored ones to detect **semantic change** upstream (`CHANGED`), not only presence/absence (`GAP`/`STALE`).

## No-invention discipline

Extract only from source artifacts. Never invent business rules, entities, actions, or AC (`CODING.md §8`). On contradiction between sources, trust the upstream source-of-truth hierarchy (`tk-discovery/SKILL.md §6.3`); flag the contradiction in the registry `## Caveats`.

---

_TimeKast Factory — tk-backlog v6.6.0 · input-contract_
