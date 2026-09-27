# Backlog Readiness — {{project}}

> **Produced by:** main orchestrator (Phase 6.3) — per-FT roll-up de qué se puede meter a `/backlog` clean, qué va partial, qué es spike-only, y qué decisión desbloquea cada uno.
> **Consumed by:** `/backlog` (single source of truth para qué FTs aceptan issues completos vs cuáles van a placeholder/spike) + `/implement` (read-only para entender wave sequencing).
> **Path canónico:** `project/planning/12_BACKLOG_READINESS.md`.
> **Schema canónico:** `methodology/implementation-readiness.md §3` (blocker IDs) + §2 (dual gates).

> **Contract source:** derivado de `03_DEEP_DIVE.md` (Tier S/M/L FT specs) + `06_ACCEPTANCE_SCENARIOS.md` (US blockers) + `01_FREEZE_MAP.md` (Open Questions per FT) + `13_OQ_BY_FT_MATRIX.md` (per-OQ FT impact) + `decisions/`. NO razonamiento nuevo — si 12 contradice 03 → emission FAILS (fix 03 first).

**Run date:** {{YYYY-MM-DD}}
**Source:** registry-first synthesis from listed artifacts above.

---

## Per-FT readiness matrix

| FT-ID  | Status       | Blocking ID(s)            | Blocking consumer     | Decision/Spike to unblock                                             |
| ------ | ------------ | ------------------------- | --------------------- | --------------------------------------------------------------------- |
| FT-001 | `ready`      | —                         | —                     | —                                                                     |
| FT-002 | `partial`    | `DECISION-007`            | `/backlog`            | Pricing tier limits define max-rows in `subscription_limits` table    |
| FT-003 | `partial`    | `SPIKE-002`               | `/backlog`            | PoC scoring engine output stable cross-runs                           |
| FT-004 | `spike-only` | `SPIKE-005`               | `/backlog`            | Vendor SDK doesn't support our auth model; spike validates workaround |
| FT-005 | `blocked`    | `DECISION-008`, `ADR-003` | `/design`, `/backlog` | Both pending — entire feature deferred until resolved                 |

### Status semantics

| Status       | Significado                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `ready`      | `/backlog` puede crear issues completos. Todos los AC, RBAC, data shapes, actions definidos.                                  |
| `partial`    | `/backlog` puede crear issues parciales (e.g., schema + read paths) pero `update`/`delete` esperan la decisión listada.       |
| `spike-only` | `/backlog` solo crea un SPIKE-XXX issue para validar tech path; NO crea issues de feature implementación hasta spike resolve. |
| `blocked`    | `/backlog` NO crea NINGÚN issue para este FT. Todos los blockers son hard pre-req.                                            |

---

## Aggregate

**Backlog can proceed:** {{YES / WITH-CAVEAT / NO}}

- **YES** → todos los FT Tier S + Tier M están `ready`. Tier L con `partial` no bloquea backlog general porque issues iniciales (schema + scaffold) son creables.
- **WITH-CAVEAT** → ≥1 FT `partial` o `spike-only` que afecta wave 1-2 del delivery plan. `/backlog` procede pero documenta caveats en cada issue afectado.
- **NO** → ≥1 FT `blocked` que es prerequisito de Wave 1, o `count(blocked) >= 3` independiente de wave.

**Active blockers (deduped, ordered by impact):**

1. `DECISION-007` — pricing tier limits — blocks FT-002 (P0 wave 1) — owner: Stakeholder — due: YYYY-MM-DD
2. `SPIKE-002` — scoring engine PoC — blocks FT-003 (P0 wave 2) — owner: Edmond — due: pre-W3
3. ...

---

## Wave alignment (opcional · si `project-config §11 Delivery Model` declara waves)

| Wave | Required FTs ready                  | Pending blockers en ese wave                  |
| ---- | ----------------------------------- | --------------------------------------------- |
| W1   | FT-001, FT-006, FT-008              | —                                             |
| W2   | FT-002, FT-003                      | `DECISION-007` (FT-002), `SPIKE-002` (FT-003) |
| W3   | FT-005, FT-009                      | `DECISION-008` + `ADR-003` (FT-005)           |
| W4   | FT-007 (Tier L — schedule UI)       | —                                             |
| W5   | FT-010, FT-011 (reports stretch)    | —                                             |
| W6   | FT-012 (Cobranza V2 — descope-able) | —                                             |

> **Note:** si project-config no declara waves, omitir esta sección.

---

## Completeness Gate

| Check                                                                                  | Result      |
| -------------------------------------------------------------------------------------- | ----------- |
| Row count == count(FT-NN en `03_DEEP_DIVE.md`) (all Tier S/M/L cubiertos)              | PASS / FAIL |
| Cada `partial` / `blocked` / `spike-only` tiene tracking ID en `Blocking ID(s)` column | PASS / FAIL |
| Cada Blocking ID resuelve a un archivo existente en `decisions/`                       | PASS / FAIL |
| Aggregate `Backlog can proceed` valor ∈ {`YES`, `WITH-CAVEAT`, `NO`}                   | PASS / FAIL |
| Wave alignment table consistente con `project-config §11` (si waves declared)          | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions                                                                                  |
| ------------ | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/design`    | `ready` / `partial` / `blocked` | List IDs blocking design (subset of Active blockers above)                                          |
| `/backlog`   | (idem)                          | (idem) — this artifact IS the readiness for backlog; status mirrors `Backlog can proceed` aggregate |
| `/implement` | (idem)                          | (idem) — implement reads 12 + 16 packets per FT                                                     |

### Notes

{{If `Backlog can proceed: NO` → list which blockers must resolve and in what order. If `WITH-CAVEAT` → list which issues will have explicit `partial` markers.}}

---

_TimeKast Factory — tk-discovery template · 12_BACKLOG_READINESS_
