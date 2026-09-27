# RBAC Matrix — {{project}}

> **Produced by:** main orchestrator (Phase 6.1 synthesis post-brief, after 03 + 04 ready).
> **Consumed by:** `/design` (auth gates en UI), `/backlog` (issue acceptance includes RBAC scope), `/implement` (server action guards + route middleware).
> **Schema canónico:** [`methodology/rbac-matrix.md`](../methodology/rbac-matrix.md).
> **Path canónico:** `project/planning/05_RBAC_MATRIX.md`.

> **Resource SSOT:** `entities (ENT-XXX de 03_DEEP_DIVE.md Data field) ∪ routes (de 04_ARCHITECTURE.md §3 module boundaries)`. **Actions canonical:** `{create, read, update, delete, list}`.

> **vs. `sk-security` ROUTE_ACL:** este matrix es **declaración del proyecto** — cubre resources de dominio (entities + routes custom). `sk-security` ROUTE_ACL es **implementación del kit** — cubre solo routes del scaffolding shipped.

**Run date:** {{YYYY-MM-DD}}
**Source:** brief §2.2 (matriz de permisos) + deep-dive Users field (per-feature access) + 03_DEEP_DIVE Data (ENT-XXX) + 04_ARCHITECTURE §3 (routes universe) + 02_PERSONAS (roles).

---

## Roles canónicos

| Role            | Scope típico | Comentarios                                    |
| --------------- | ------------ | ---------------------------------------------- |
| super_admin     | global       | full access, no constraints                    |
| admin           | global/team  | gestiona usuarios + configs                    |
| staff           | team/own     | operatives — features de dominio               |
| {role-custom-1} | own/team     | {{descripción de rol específico del proyecto}} |
| user            | own          | end-user / cliente del producto                |

---

## Matriz

> **Scope values:** `own` (solo recursos propios), `team` (recursos del team), `global` (cualquier recurso).
> **Cells:** `allowed` / `denied` (cells denied cuentan para coverage).

### Entities (ENT-XXX)

| Resource (ENT) | Action | super_admin | admin  | staff  | user   |
| -------------- | ------ | ----------- | ------ | ------ | ------ |
| ENT-USER       | create | global      | global | denied | denied |
| ENT-USER       | read   | global      | team   | own    | own    |
| ENT-USER       | update | global      | team   | own    | own    |
| ENT-USER       | delete | global      | global | denied | denied |
| ENT-USER       | list   | global      | team   | denied | denied |
| ENT-{{X}}      | create | ...         | ...    | ...    | ...    |
| ...            |        |             |        |        |        |

### Routes (de 04_ARCHITECTURE §3)

| Route pattern          | Required role(s)     | Middleware notes                                                      |
| ---------------------- | -------------------- | --------------------------------------------------------------------- |
| `/dashboard`           | authenticated        | redirect to `/login` si no auth                                       |
| `/admin/users`         | admin OR super_admin | check team scope si admin (no cross-team)                             |
| `/api/{feature-1}/...` | role-specific        | server action wrapper `withAuth({ resource: 'X', action: 'Y' })` (scope → handler) |
| ...                    |                      |                                                                       |

---

## Authorization Model Lock

> **🔴 Section obligatoria** (per `methodology/rbac-matrix.md §7`). Pre-CP2 sweep (SKILL.md Phase 7.6) + Phase 8 step 4 enforcement por keyword scan scoped por field. NO admite incertidumbre en `Canonical roles` / `Scope model` / `Role derivation rules`. `Forbidden states` whitelist permite "deprecated" como phrasing legítimo.

**Canonical roles:** {{`super_admin, admin, staff, user` — locked list, ningún `tentative`/`?`/`3 vs 4`. Lock antes de close.}}

**Scope model:** {{`global` | `per-org` | `per-tenant` | `per-resource` — single value. Si necesita composición, declararla explícita: `per-resource within per-team`.}}

**Role derivation rules:**

- {{e.g., `signup default = user`}}
- {{e.g., `org membership type = admin → role: admin`}}
- {{e.g., `manual assignment from super_admin → role: any except super_admin`}}

**Route ACL source:** `src/lib/auth/permissions.ts` (const `ROUTE_ACL`, enforced por `isRouteAllowed()` en `authorized()`) OR `{{custom-path}}` if proyecto custom. NO empty.

**Server-side scope helper:** el scope de fila (own/team/global) se realiza con `withSelf` (self-service) u ownership-check en el handler de `withAuth` from `@/lib/actions/helpers` — NO hay param `scope` en el wrapper. OR `{{custom-helper}}` ref. NO empty.

**Forbidden states (whitelist field — "deprecated" legítimo aquí):**

- {{e.g., `staff CANNOT have global scope`}}
- {{e.g., `deprecated role 'guest' cannot access admin routes`}}
- {{e.g., `user CANNOT manage other users`}}

---

## Completeness Gate

| Check                                                                                                                                 | Result      |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Coverage: `count(entries) ≥ count(roles) × count(resources)` con ≥90%                                                                 | PASS / FAIL |
| Resource universe explícito: `entities (ENT-XXX) ∪ routes (04 §3)`                                                                    | PASS / FAIL |
| Cells `denied` declaradas (no inferred)                                                                                               | PASS / FAIL |
| Authorization Model Lock section completo (per `methodology/rbac-matrix.md §7`)                                                       | PASS / FAIL |
| Keyword scan scoped por field pasa (no `tentative`/`hypothesis`/`TBD` en `Canonical roles` / `Scope model` / `Role derivation rules`) | PASS / FAIL |

**Overall:** PASS / FAIL

Si fail → orchestrator re-ensambla las cells faltantes o resuelve keyword violations; NO re-spawn agent.

---

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions |
| ------------ | ------------------------------- | ------------------ |
| `/design`    | `ready` / `partial` / `blocked` | —                  |
| `/backlog`   | (idem)                          |                    |
| `/implement` | (idem)                          |                    |

### Notes

{{Si status=partial: enumerar DECISION/SPIKE que desbloquean. Ejemplo:

- "/design partial: DECISION-007 (¿managers tienen scope team o solo own?) debe resolverse antes de diseñar admin panel."}}

---

_TimeKast Factory — tk-discovery template · 05_RBAC_MATRIX_
