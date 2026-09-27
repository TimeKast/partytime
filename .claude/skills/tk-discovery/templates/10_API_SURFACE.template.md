# API Surface — {{project}}

> **Produced by:** main orchestrator (Phase 6.1 step 3 — registry-first synthesis).
> **Consumed by:** `/design` (forms wire to actions), `/backlog` (issues reference action signatures), `/implement` (server actions + route handlers + Zod schemas copy-paste-able).
> **Schema canónico:** este template ES el schema — no hay doc metodológico adicional en el kit; el detalle se define inline en el documento.
> **Path canónico:** `project/planning/10_API_SURFACE.md`.
>
> **Source aggregation:** built from shared registry in Phase 6.1 step 1. Inputs: 03_DEEP_DIVE Tier M `Action contracts` field (NEW Fase-1) + 03_DEEP_DIVE Tier L slot template §4.5 Action contracts + 04_ARCHITECTURE §3 routes inventory (expanded per Fase-1: auth strategy + input + output + error codes) + 05_RBAC_MATRIX (auth scope per resource×action) + 06_ACCEPTANCE_SCENARIOS error scenarios (error codes catalog source).
>
> **NO new info inventada** — pure restructure desde existing artifacts. Si un error code aparece aquí pero NO en upstream artifacts, es bug del flujo de captura — fix upstream antes de re-emit.

**Run date:** {{YYYY-MM-DD}}

---

## §1 Server Actions surface

> One subsection per FT con server action(s). Per action: signature + Zod input literal + output shape + errors + side effects.

### FT-{{NN}} — {{Feature name}}

#### `{{actionName}}(input)`

- **Path:** `src/lib/actions/{{domain}}/{{action-file}}.ts`
- **RBAC:** `withAuth({ resource: '{{ent}}', action: '{{verb}}', schema, revalidate })` (o `withSelf({...})` o `public` o `CRON_SECRET` para cron-only) — el scope own/team/global NO es param del wrapper; se realiza en el handler (`withSelf` / ownership-check `where userId = session.user.id`)
- **Input Zod schema (literal):**

  ```typescript
  z.object({
    {{field1}}: z.string().min(3).max(30),
    {{field2}}: z.enum(['option_a', 'option_b']),
    {{field3}}: z.number().int().positive().optional(),
    // ... per registry.actions[].input_zod
  });
  ```

- **Output:** `ActionResult<{{DataShape}}>` donde `{{DataShape}}`:

  ```typescript
  type {{DataShape}} = {
    {{field}}: {{type}};
    // ...
  };
  ```

- **Errors emitted (referenced from §3 catalog):**
  - `{{ERROR_CODE_1}}` (HTTP {{422|403|404|409}}) — {{cuándo se dispara}} → user message: "{{texto literal}}"
  - `{{ERROR_CODE_2}}` (HTTP ...) — ...

- **Side effects:**
  - `revalidatePath('{{path}}')` post-success
  - `notify({{category}}, {{payload}})` si aplica (per F17 / notifications domain)
  - `audit_events INSERT` si action es sensible (per BR-AUDIT-NN)
  - {{etc}}

{{repeat per actionName de la feature}}

### FT-{{MM}} — {{Next feature}}

#### `{{nextActionName}}(input)`

...

---

## §2 Route handlers surface

> Endpoints en `src/app/api/**/route.ts` (cron, webhooks, public APIs, polling endpoints).

### `{{METHOD}} {{path}}`

- **Handler type:** {{cron / webhook / public API / polling / SSE / streaming}}
- **Auth strategy:** {{CRON_SECRET / withAuth({...}) / withSelf / public / authenticated}}
- **Input shape:**

  ```typescript
  // body
  z.object({ ... })
  // o query params: ?{{key}}={{type}}
  // o headers: X-{{name}}: {{type}}
  ```

- **Output shape:**

  ```typescript
  // success
  Response.json({ data: {{DataShape}} }, { status: 200 })
  // 304 si ETag match (polling endpoints)
  Response(null, { status: 304, headers: { ETag: '{{hash}}' } })
  // error
  Response.json({ error: { code, message } }, { status: {{4xx|5xx}} })
  ```

- **Error codes emitted (referenced from §3 catalog):**
  - `{{ERROR_CODE_1}}` (HTTP {{4xx|5xx}}) — {{cuándo}}
  - ...

- **Refs upstream:** FT-{{NN}}, ADR-{{NN}}

{{repeat per route handler}}

---

## §3 Error codes catalog (consolidated)

> All error codes emitted by server actions + route handlers, deduplicated. Source of truth para user-facing error messages.

| Code                             | HTTP | Cuándo se dispara                          | User message (literal)                          | Emitted from                                         |
| -------------------------------- | ---- | ------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------- |
| `UNAUTHORIZED`                   | 401  | Sin sesión (sk-security baseline)          | "Por favor inicia sesión"                       | `sk-security` middleware                             |
| `FORBIDDEN`                      | 403  | Sin permisos sobre resource                | "No tienes permiso para esta acción"            | `withAuth({...})` RBAC check                         |
| `NOT_FOUND`                      | 404  | Recurso no existe o soft-deleted           | "No encontrado"                                 | varios handlers + actions                            |
| `{{DOMAIN_ERROR_1}}`             | 422  | {{condición específica del dominio}}       | "{{texto user-facing literal}}"                 | `{{actionName1}}`, `{{actionName2}}` (multi-emitter) |
| `{{DOMAIN_ERROR_2}}`             | 409  | Conflicto de concurrencia / race condition | "{{texto}}"                                     | `{{actionName}}`                                     |
| `{{VALIDATION_ERR}}`             | 422  | Zod parse failure (catch-all schema input) | "Datos inválidos"                               | TODOS los actions (Zod boundary)                     |
| `{{RATE_LIMITED}}`               | 429  | Rate limit excedido (sk-security bucket)   | "Demasiadas solicitudes. Espera unos segundos." | `sk-security` rate-limiting middleware               |
| ... (per registry.error_codes[]) |      |                                            |                                                 |                                                      |

**Convention:**

- Codes en `SCREAMING_SNAKE_CASE`.
- HTTP status follows REST conventions: 401 unauth, 403 forbidden, 404 not found, 409 conflict, 422 unprocessable, 429 rate limit.
- User message en es-MX neutro (factory default) — no jergón técnico, action-oriented.
- Códigos genéricos (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERR) viven sk-security; codes de dominio viven en project actions.

---

## Completeness Gate

| Check                                                                                                        | Result      |
| ------------------------------------------------------------------------------------------------------------ | ----------- |
| Todas las server actions de 03_DEEP_DIVE Action contracts cubiertas                                          | PASS / FAIL |
| Todos los route handlers de 04_ARCHITECTURE §3 routes cubiertos                                              | PASS / FAIL |
| Error codes catalog consolidado sin duplicados (deduplicar por code; `emitted_from` list todos los emitters) | PASS / FAIL |
| Zod input shapes literales (no `...`) per action                                                             | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                    | Blocking decisions                                                                              |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `/design`    | ready / partial / blocked | {{DECISION/SPIKE refs o —}} (forms wire to action signatures sin re-discovery)                  |
| `/backlog`   | ready / partial / blocked | {{DECISION/SPIKE refs o —}} (issues reference exact `{{actionName}}(input)` paths)              |
| `/implement` | ready / partial / blocked | {{DECISION/SPIKE refs o —}} (Zod schemas + ActionResult shapes + error catalog copy-paste-able) |

---

_TimeKast Factory — tk-discovery template · 10_API_SURFACE (Fase 1 — emitted Phase 6.1 step 3 from shared registry)_
