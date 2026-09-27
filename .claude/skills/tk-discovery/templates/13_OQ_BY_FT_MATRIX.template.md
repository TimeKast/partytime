# OQ-by-FT Matrix — {{project}}

> **Produced by:** main orchestrator (Phase 6.3) — operational matrix mapping every OQ to FTs blocked + consumer + tracking ID. ALL OQs (client + tech + internal).
> **Consumed by:** `/backlog`, `/implement`, `/design` — knows exactly which FTs are gated by which OQ without re-deriving from prose.
> **Path canónico:** `project/planning/13_OQ_BY_FT_MATRIX.md`.
> **Schema canónico:** `methodology/intake.md §6` (OQ tracking) + `methodology/implementation-readiness.md §3` (blocker IDs).

> **Aggregation rule:** every OQ surfaced during discovery — `01_FREEZE_MAP §Open Questions`, Phase 7.4 GR2 unresolved, deep-dive Tier L sub-rondas unresolved — gets one row here. Client-facing subset is rephrased in `11_CLIENT_QUESTIONS.md` (no info duplication; 11 cites OQ-IDs from this matrix).

**Run date:** {{YYYY-MM-DD}}
**Source:** `01_FREEZE_MAP.md §Open Questions` + Phase 7.4 Gap Round 2 unresolved + `03_DEEP_DIVE.md` Tier L sub-rondas unresolved.

---

## Matrix

| OQ ID  | Owner type                  | Owner name                           | Blocks FTs           | Blocks consumer                         | Default allowed?                     | Deadline       | Tracking                                   |
| ------ | --------------------------- | ------------------------------------ | -------------------- | --------------------------------------- | ------------------------------------ | -------------- | ------------------------------------------ |
| OQ-001 | cliente \| tech \| internal | {{concrete name or `TimeKast team`}} | FT-{{NN}}, FT-{{NN}} | `/design` \| `/backlog` \| `/implement` | `none — must resolve` \| {{default}} | {{YYYY-MM-DD}} | `DECISION-{{NNN}}` \| `SPIKE-{{NNN}}` \| — |
| OQ-002 | (idem)                      | (idem)                               | (idem)               | (idem)                                  | (idem)                               | (idem)         | (idem)                                     |

### Cell rules (Pre-CP2 gate enforces — see SKILL.md Phase 7.3)

| Column             | Allowed values                                                           | Gate fail if                                                     |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `Owner type`       | `cliente`, `tech`, `internal`                                            | other value                                                      |
| `Owner name`       | concrete person OR explicit group (`TimeKast team`)                      | empty, `TBD`, `?`                                                |
| `Blocks FTs`       | list of `FT-NN` IDs (comma-separated)                                    | empty, prose, non-ID format                                      |
| `Blocks consumer`  | `/design`, `/backlog`, `/implement`                                      | other value                                                      |
| `Default allowed?` | `none — must resolve` OR explicit default                                | empty, vague (`maybe`, `TBD`)                                    |
| `Deadline`         | `YYYY-MM-DD` OR phase ref (`pre-W5`, `pre-CP2`)                          | empty, `?`, `ASAP`                                               |
| `Tracking`         | `DECISION-NNN` OR `SPIKE-NNN` OR `—` (only if `Default allowed != none`) | `—` AND `Default allowed = none — must resolve` (gate hard fail) |

---

## Owner-type semantics

- **cliente** — only the project's external stakeholder (or their delegate) can answer. Subset surfaces in `11_CLIENT_QUESTIONS.md`.
- **tech** — TimeKast tech team can answer via spike, code inspection, or vendor docs. Often emits `SPIKE-NNN` for tracking.
- **internal** — TimeKast team decision (architecture, kit defaults, scope). Often emits `DECISION-NNN` or `ADR-NNN`.

---

## Cross-reference helpers

| OQ status (live)                        | Action                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Default allowed = X`                   | `/backlog` proceeds; downstream applies `X` if OQ unresolved by deadline. Re-evaluate post-deadline.   |
| `Default allowed = none`                | `/backlog` cannot create issues for `Blocks FTs` until OQ resolved. Each blocked FT goes `spike-only`. |
| `Owner = cliente`                       | Track in `11_CLIENT_QUESTIONS.md` for Q&A round.                                                       |
| `Owner = tech` + `Tracking = SPIKE-NNN` | Spike must run before `Deadline`. SPIKE file owns the action plan.                                     |

---

## Completeness Gate

| Check                                                                                                      | Result      |
| ---------------------------------------------------------------------------------------------------------- | ----------- |
| Row count == OQ registry size (Phase 6.3 step 1)                                                           | PASS / FAIL |
| Cero filas con `Blocks FTs` vacío o non-ID format                                                          | PASS / FAIL |
| Cero filas con `Owner name = TBD` o `?`                                                                    | PASS / FAIL |
| Cero filas con `Default allowed: none — must resolve` AND `Tracking = —` (hard fail; needs DECISION/SPIKE) | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions                                             |
| ------------ | ------------------------------- | -------------------------------------------------------------- |
| `/design`    | `ready` / `partial` / `blocked` | List `DECISION-XXX` / `SPIKE-XXX` IDs blocking design phase    |
| `/backlog`   | (idem)                          | (idem) — backlog needs OQs resolved to create non-spike issues |
| `/implement` | (idem)                          | (idem) — implement can proceed with `Default allowed` per OQ   |

### Notes

{{If any row violates cell rules above → list here and resolve before CP2. Pre-CP2 sweep gate enforces.}}

---

_TimeKast Factory — tk-discovery template · 13_OQ_BY_FT_MATRIX_
