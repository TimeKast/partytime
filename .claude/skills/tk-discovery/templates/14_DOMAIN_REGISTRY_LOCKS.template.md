# Domain Registry Locks — {{project}}

> **Produced by:** main orchestrator (Phase 6.3) — explicit enumeration de registries de dominio (reports, cron jobs, roles, navigation items, movement types, KPI definitions, dashboards). Cada uno marcado `locked` o `partial`.
> **Consumed by:** `/backlog` (issues con registry refs concretas, no placeholders), `/implement` (configs como SSOT — feature flags, role definitions, cron registry).
> **Path canónico:** `project/planning/14_DOMAIN_REGISTRY_LOCKS.md`.
> **Schema canónico:** `methodology/freeze-map.md` + `methodology/intake.md §6` (OQ tracking when partial).

> **Detector rule:** durante Phase 2 (freeze-map) o Phase 4c (Tier L sub-rondas), si orchestrator detecta enum-pattern abierto en upstream prose (e.g., "5-7 reportes", "varios tipos de cron", "opcional dashboard"), surface as Gap Round question — NO auto-scan. Orchestrator NO infiere enumeración silenciosamente. Codex finding: high false-positive risk on auto-scanner.

**Run date:** {{YYYY-MM-DD}}
**Source:** `01_FREEZE_MAP.md §Firm Decisions` (F-codes que declaran registries) + `03_DEEP_DIVE.md` Tier L specs (registries domain-specific) + `04_ARCHITECTURE.md §3 routes` (cron + navigation) + `decisions/` ADRs que locks registries.

---

## §1 Reports catalog

> Skip si proyecto no tiene reports/exports/scheduled-emails. Si tiene, locked enumeration mandatory.

**Status:** `locked` | `partial`

| ID     | Name                         | Cadence    | Format           | Recipients     | Owner FT  | Refs                 |
| ------ | ---------------------------- | ---------- | ---------------- | -------------- | --------- | -------------------- |
| RPT-01 | {{Weekly inventory summary}} | weekly Mon | xlsx + email     | gerente_tienda | FT-{{NN}} | F-{{NN}}, ADR-{{NN}} |
| RPT-02 | {{Monthly margin per store}} | monthly    | pdf + R2 archive | finanzas       | FT-{{NN}} | F-{{NN}}             |
| ...    | ...                          | ...        | ...              | ...            | ...       | ...                  |

**If status=partial:** what's missing + tracking ID

- {{e.g., `RPT-04 mentioned in brief §3 "anti-fraude report" but scope not defined → DECISION-011`}}

---

## §2 Cron jobs registry

> Skip si proyecto no tiene cron. Si tiene, follow `kb-cron-jobs` registry-as-SSOT pattern.

**Status:** `locked` | `partial`

| Cron ID              | Schedule     | Path                           | Purpose                    | Refs                  |
| -------------------- | ------------ | ------------------------------ | -------------------------- | --------------------- |
| `sync-erp`           | `0 22 * * *` | `/api/cron/sync-erp`           | Pull ERP delta + transform | FT-{{NN}}, ADR-{{NN}} |
| `reports-dispatcher` | `* * * * *`  | `/api/cron/reports/dispatcher` | Dispatch scheduled reports | FT-{{NN}}, ADR-{{NN}} |
| ...                  | ...          | ...                            | ...                        | ...                   |

**If status=partial:** what's missing + tracking ID

---

## §3 Roles registry

> SSOT for roles del sistema. Mismo locked list que `05_RBAC_MATRIX §Authorization Model Lock §Canonical roles` (debe match — orchestrator verifica).

**Status:** `locked` (siempre — si partial, gate fails)

| Role            | Scope default | Source                  |
| --------------- | ------------- | ----------------------- |
| super_admin     | global        | sk-security baseline    |
| admin           | global/team   | sk-security baseline    |
| staff_operativo | team/own      | project-specific (F-NN) |
| finanzas        | team          | project-specific (F-NN) |
| gerente_tienda  | own (scoped)  | project-specific (F-NN) |

> **Cross-ref check:** Phase 7.6 sweep verifica que `Canonical roles` en `05_RBAC_MATRIX §Authorization Model Lock` == este registry (set equality). Si mismatch → fail.

---

## §4 Navigation registry

> SSOT for top-level nav items. Per `sk-navigation` config schema. Project-specific extension del kit default.

**Status:** `locked` | `partial`

| Item ID        | Label              | Path          | Required role(s)         | Badge? | Refs      |
| -------------- | ------------------ | ------------- | ------------------------ | ------ | --------- |
| `dashboard`    | Dashboard          | `/dashboard`  | authenticated            | —      | FT-{{NN}} |
| `reports`      | Reportes           | `/reports`    | gerente_tienda, finanzas | count  | FT-{{NN}} |
| `cron-manager` | Tareas programadas | `/admin/cron` | admin, super_admin       | —      | FT-{{NN}} |
| ...            | ...                | ...           | ...                      | ...    | ...       |

---

## §5 Movement types / domain enums

> Skip if not applicable. For ERP/inventory/finance projects, list domain enums explicitly.

**Status:** `locked` | `partial`

| Enum name       | Values                                               | Used by                     |
| --------------- | ---------------------------------------------------- | --------------------------- |
| `movement_type` | `VENTA`, `DEVOLUCION`, `TRASPASO`, `AJUSTE`, `MERMA` | ENT-MOVEMENT (FT-{{NN}})    |
| `report_format` | `xlsx`, `pdf`                                        | RPT-\* (Reports catalog §1) |
| `cron_status`   | `enabled`, `paused`, `disabled`, `auto-paused`       | sync + reports cron entries |

---

## §6 KPI definitions / Dashboard widgets

> Skip if proyecto no tiene dashboards. Si tiene, lock list of KPIs + widgets — evitar drift en backlog ("5-7 KPIs" → enumerate ahora).

**Status:** `locked` | `partial`

| ID      | KPI / Widget                | Calculation source                       | Owner FT  | Refs                 |
| ------- | --------------------------- | ---------------------------------------- | --------- | -------------------- |
| KPI-01  | Total inventory value (MXN) | Sum(stock × cost) from `inv_current`     | FT-{{NN}} | F-{{NN}}             |
| KPI-02  | Cobranza Should %           | invoices.collected / invoices.due \* 100 | FT-{{NN}} | DECISION-002 pending |
| WIDG-01 | Top 10 modelos last 90d     | Sum(sales) order DESC limit 10           | FT-{{NN}} | F-{{NN}}             |
| ...     | ...                         | ...                                      | ...       | ...                  |

**If status=partial:** which KPIs unresolved + tracking ID

---

## Completeness Gate

| Check                                                                                       | Result      |
| ------------------------------------------------------------------------------------------- | ----------- |
| Each applicable registry (§1-§6) marked `locked` or `partial`                               | PASS / FAIL |
| Each `partial` registry has tracking ID for what's missing                                  | PASS / FAIL |
| Roles registry (§3) matches `05_RBAC_MATRIX §Authorization Model Lock §Canonical roles` set | PASS / FAIL |
| Vague language scan: no `5-7`, `varios`, `algunos`, `opcional` sin tracking ID adjacent     | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions                                                 |
| ------------ | ------------------------------- | ------------------------------------------------------------------ |
| `/design`    | `ready` / `partial` / `blocked` | List IDs blocking navigation/KPI design                            |
| `/backlog`   | (idem)                          | List IDs blocking issues con registry-specific refs                |
| `/implement` | (idem)                          | List IDs blocking config-file generation (cron, roles, navigation) |

### Notes

{{If status=partial: list per registry which entries pending + their tracking IDs.}}

---

_TimeKast Factory — tk-discovery template · 14_DOMAIN_REGISTRY_LOCKS_
