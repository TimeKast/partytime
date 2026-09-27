# Methodology — RBAC Matrix

> **Artifact:** `05_RBAC_MATRIX.md` (path canónico `project/planning/05_RBAC_MATRIX.md`).
> **Phase:** 6.1 (synthesis post-brief, después de 03_DEEP_DIVE + 04_ARCHITECTURE).
> **Template:** `templates/05_RBAC_MATRIX.template.md`.

> **Forward-ref documentado:** 05 depende de 03 (entities) Y 04 (routes). Numbering scheme rompe rule de "doc N solo cita 00..N-1" — excepción aceptada porque RBAC necesita ambos como input estructural. Phase 6.1 emite RBAC en **multi-pass** — first-pass con resources de entities (ya cerrados Phase 4), second-pass agrega routes después de 04 emit.

---

## §1 Resource SSOT (crítico)

**Universe de resources = `entities (ENT-XXX de 03_DEEP_DIVE.md Data field) ∪ routes (de 04_ARCHITECTURE.md §3 module boundaries)`**

Sin SSOT explícito, gate `count(roles) × count(resources) × ≥90%` es gameable (agente puede inventar resources). Methodology fija:

### Entities (ENT-XXX)

- Source: `03_DEEP_DIVE.md` per-feature Data field.
- Universe: union de todas las ENT-XXX declaradas across FT-NN.
- Granularidad: una entry per (rol × ENT × action × scope).

### Routes

- Source: `04_ARCHITECTURE.md §3 Module boundaries` — sección "Routes inventory".
- Universe: routes pattern declarados (incluye `/api/...` handlers + RSC pages auth-required).
- Granularidad: una entry per (route pattern × required role(s) + middleware notes).

### Actions canonical

`{create, read, update, delete, list}` — set fijo. No emitir actions custom como "approve", "publish" en este matrix; esos son **operaciones de dominio** que viven en deep-dive AC. RBAC solo cubre CRUD+list.

---

## §2 Scope values

| Scope    | Significado                                                             |
| -------- | ----------------------------------------------------------------------- |
| `own`    | Solo recursos propios (e.g., user puede leer su perfil)                 |
| `team`   | Recursos del team del user (e.g., admin puede leer usuarios de su team) |
| `global` | Cualquier recurso (e.g., super_admin)                                   |
| `denied` | Sin acceso (cell vacía explícita)                                       |

`denied` cuenta para coverage — declaración explícita de negación es válida.

---

## §3 vs. sk-security ROUTE_ACL

| Dimension   | `05_RBAC_MATRIX.md` (este doc)                         | `sk-security` ROUTE_ACL                                       |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Scope       | Declaración del proyecto                               | Implementación del kit                                        |
| Cobertura   | entities + routes custom + actions canonical CRUD+list | Solo routes del scaffolding shipped (auth, admin/users, etc.) |
| Audience    | downstream workflows (/design, /backlog, /implement)   | runtime middleware del kit                                    |
| Update path | Re-discovery (manual)                                  | Edit `src/lib/auth/permissions.ts` (const `ROUTE_ACL`)        |

**Implicación:** `/implement` consume **ambos** — usa 05_RBAC_MATRIX para guards de dominio + extiende ROUTE_ACL en código para routes auth.

---

## §4 Quantitative gate (Phase 6.1)

- `count(entries) ≥ count(roles) × count(resources)` con ≥90% coverage
- Resource universe explícito (entities + routes — no inventar)
- Cells `denied` cuentan
- Si fail → orchestrator re-ensambla cells faltantes; NO re-spawn

---

## §5 Multi-pass workflow

Phase 6.1 emite 05_RBAC_MATRIX en 2 pases:

1. **First-pass (post-03):** emit matrix con resources = ENT-XXX universe. Routes universe se deja TBD.
2. **Second-pass (post-04):** orchestrator regresa al matrix, agrega routes section + valida coverage gate.

Verification gate del artifact corre **post-second-pass** sobre el output final.

---

## §6 Refs downstream

- `/design` lee 05 para UI auth gates (qué botones mostrar per rol/scope)
- `/backlog` lee 05 para issue acceptance — cada FT-NN issue declara scope esperado
- `/implement` lee 05 para guards en server actions (`withAuth({ resource, action, schema, revalidate })`; el scope own/team/global NO es param — se realiza con `withSelf` u ownership-check en el handler)

---

## §7 Authorization Model Lock

> **🔴 Hard gate (enforced en SKILL.md Phase 8 step 4 + Phase 7.6 sweep):** sección obligatoria en `05_RBAC_MATRIX.md`. Captura el modelo de autorización completo en forma estructurada — NO solo la matriz CRUD.

### Required fields

| Field                      | Contenido                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Canonical roles`          | Lista locked de roles del sistema. Ejemplo: `super_admin, admin, staff_operativo, finanzas`. NO admite incertidumbre.                                                                                                |
| `Scope model`              | Modelo único: `global`, `per-org`, `per-tenant`, `per-resource`, o composición explícita. NO admite múltiples opciones sin decidir.                                                                                  |
| `Role derivation rules`    | Cómo se asigna el rol al usuario: signup default, org membership, manual admin assignment, etc. Lógica determinística.                                                                                               |
| `Route ACL source`         | Path al SSOT runtime de Route ACL: `src/lib/auth/permissions.ts` (const `ROUTE_ACL`, enforced por `isRouteAllowed()` en el callback `authorized()`) o custom file. NO empty.                                          |
| `Server-side scope helper` | Cómo se realiza el scope de fila (own/team/global) a nivel server: `withSelf()` (self-service) u ownership-check dentro del handler de `withAuth` (`where userId = session.user.id`). El kit NO tiene un param `scope` ni un helper central de scope. NO empty. |
| `Forbidden states`         | Lista explícita de estados inválidos. Ejemplo: `staff CANNOT have global scope`, `deprecated role cannot access admin routes`. **Único field donde "deprecated" es legítimo** (referencia a estado fuera del canon). |

### Gate keywords — scoped por field

Pre-CP2 sweep (SKILL.md Phase 7.6) + Phase 8 step 4 scan KEYWORDS por field específico (no global). False-positive en `Forbidden states` es legítimo:

| Field                                           | Keywords prohibidas (case-insensitive)                                   | Razón                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `Canonical roles`                               | `tentative`, `hypothesis`, `3 vs 4`, `?`, `unclear`, `TBD`, `deprecated` | Roles son canonical-locked; no admiten incertidumbre.   |
| `Scope model`                                   | `tentative`, `hypothesis`, `?`, `unclear`, `TBD`                         | Modelo único; "deprecated" no es modifier válido aquí.  |
| `Role derivation rules`                         | `tentative`, `hypothesis`, `?`, `unclear`, `TBD`                         | Lógica determinística.                                  |
| `Forbidden states`                              | **NONE** (whitelist explícita)                                           | "deprecated role cannot access X" es phrasing legítimo. |
| `Route ACL source` / `Server-side scope helper` | empty value                                                              | Path ref obligatoria; vacío = unimplemented.            |

### Gate failure → action

Si scan detecta keyword prohibida en field scope-ado:

1. Orchestrator imprime el field + keyword + línea afectada.
2. User debe resolver:
   - **Si es vagueness real:** convertir a `DECISION-XXX` o resolver inline (Gap Round local).
   - **Si es falso positivo** (e.g., "deprecated" en field equivocado): mover a `Forbidden states` con phrasing correcto.
3. Re-correr gate post-edit.

### Test matrix DEFERRED (Codex point 5 last item)

Test matrix per role × resource × expected behavior vive en E2E (`tests/e2e/auth/`), NO en este artifact. Discovery solo declara el modelo; E2E lo verifica runtime.

---

_TimeKast Factory — tk-discovery methodology · rbac-matrix_
