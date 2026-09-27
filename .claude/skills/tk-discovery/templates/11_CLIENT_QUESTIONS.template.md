# Client Questions — {{project}}

> **Produced by:** main orchestrator (Phase 6.3) — subset of OQs requiring **client** input pre-`/design`.
> **Consumed by:** stakeholder (decisor del proyecto) for Q&A round; `/proposal` for client-friendly rephrasing (out of scope here — this doc uses neutral technical language).
> **Path canónico:** `project/planning/11_CLIENT_QUESTIONS.md`.
> **Schema canónico:** `methodology/intake.md §6` (OQ tracking) + `methodology/implementation-readiness.md §3` (blocker IDs).

> **Scope rule:** include ONLY OQs where `Owner: cliente`. For the full OQ matrix (client + tech + internal) → `13_OQ_BY_FT_MATRIX.md`. NO redundancy — 11 is a filtered, expanded view of 13.

**Run date:** {{YYYY-MM-DD}}
**Source:** `01_FREEZE_MAP.md §Open Questions` (filter owner=cliente) + Phase 7.4 Gap Round 2 unresolved (filter owner=cliente) + Phase 4c Tier L sub-rondas unresolved (filter owner=cliente).

---

## OQ index — client-owned only

| ID     | Question (1-line summary)                   | Blocks FTs           | Blocks consumer                         | Default allowed                        | Deadline       | Tracking                |
| ------ | ------------------------------------------- | -------------------- | --------------------------------------- | -------------------------------------- | -------------- | ----------------------- |
| OQ-001 | {{summary — escribe pregunta entera abajo}} | FT-{{NN}}, FT-{{NN}} | `/design` \| `/backlog` \| `/implement` | `none — must resolve` \| `{{default}}` | {{YYYY-MM-DD}} | `DECISION-{{NNN}}` \| — |

> **Cell rules:**
>
> - `Blocks consumer` MUST be one of `/design`, `/backlog`, `/implement` (no slash variants, no extra prefixes).
> - `Default allowed` is either `none — must resolve` OR an explicit default value/policy that downstream uses if the OQ is unresolved by deadline. NO vague language.
> - `Tracking` references a `DECISION-NNN` or `SPIKE-NNN` file in `decisions/` — REQUIRED if `Default allowed: none — must resolve`. If `Default allowed` is set, tracking may be `—`.

---

## OQ details

> **Body convention:** one section per OQ in the same order as the index above. Self-contained — reader should NOT need to consult upstream artifacts to understand the question.

### OQ-{{NNN}} — {{short title}}

**Context (from upstream):** {{1-2 sentences condensed from `01_FREEZE_MAP.md §Open Questions` entry or Phase 7.4 GR2 entry. Cite anchor: `(01_FREEZE_MAP §Open Questions row N)`.}}

**Question:** {{full question phrasing — neutral technical language. NO factory jargon (`Phase X`, `CP1/2`, `FT-NN bare`, `Tier S/M/L` — translate to plain context if user-facing).}}

**Why it matters:** {{which FT or architectural decision this unblocks; cite refs `FT-NN`, `ADR-NN` inline}}.

**Options on table (if predefined):**

- (a) {{option}} — {{1-line implication}}
- (b) {{option}} — {{1-line implication}}
- (c) Other / Defer — {{1-line implication if deferred past deadline}}

**Owner:** {{cliente name — concrete person, not "team"}}
**Default if no answer:** {{matches index `Default allowed` cell}}
**Deadline:** {{YYYY-MM-DD — matches index cell}}
**Tracking ID:** {{DECISION-XXX OR SPIKE-XXX OR `—` if direct question without ID}}

---

### OQ-{{NNN+1}} — ...

{{repeat per OQ}}

---

## Completeness Gate

| Check                                                                     | Result      |
| ------------------------------------------------------------------------- | ----------- |
| Row count == count(OQs en `13_OQ_BY_FT_MATRIX` con `owner_type=cliente`)  | PASS / FAIL |
| Cada OQ tiene Context + Question no-vacíos                                | PASS / FAIL |
| Cada OQ tiene Owner = concrete name (no `TBD`, no group placeholder)      | PASS / FAIL |
| Cada `Default allowed: none — must resolve` tiene `Tracking ID` non-empty | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions                       |
| ------------ | ------------------------------- | ---------------------------------------- |
| `/design`    | `ready` / `partial` / `blocked` | List `DECISION-XXX` / `SPIKE-XXX` if any |
| `/backlog`   | (idem)                          | (idem)                                   |
| `/implement` | (idem)                          | (idem)                                   |

### Notes

{{Optional — flag if any OQ has no tracking ID AND no default allowed (= gate violation). Pre-CP2 sweep should catch this; this section documents why if it happens.}}

---

_TimeKast Factory — tk-discovery template · 11_CLIENT_QUESTIONS_
