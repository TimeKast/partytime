# FT-{{NN}} — {{Feature name}}

> **This template:** `.claude/skills/tk-discovery/templates/15_IMPLEMENTATION_PACKET.template.md`. **One file per FT** emitted to `project/planning/15_IMPLEMENTATION_PACKETS/FT-NN.md`.
> **Produced by:** main orchestrator (Phase 6.3) — per-feature handoff packet for `/implement` (post-redesign).
> **Consumed by:** `/implement` (single file per work unit, self-contained — no jumping to upstream artifacts).

> **🔴 Contract source rule (Codex finding):** este packet es **INDEX/CONTRACT** derivado de `03_DEEP_DIVE.md#FT-{{NN}}` + `06_ACCEPTANCE_SCENARIOS.md` (US refs) + `01_FREEZE_MAP.md` (F-codes/BR refs) + `12_BACKLOG_READINESS.md` (Status + Blockers) + `decisions/`. **NO razonamiento nuevo.** Si packet contradice cualquier fuente upstream → packet emission FAILS (Phase 6.3 gate); fix la fuente PRIMERO, luego re-emit el packet.
>
> Source-of-truth hierarchy: `03_DEEP_DIVE` > `12_BACKLOG_READINESS` > `15_IMPLEMENTATION_PACKETS`. Si conflict → trust upstream.

---

**Status:** `ready` | `partial` | `blocked`

**Wave:** {{opcional · si `project-config §11 Delivery Model` declara waves; ej `W2`}}

**Depends on:** {{IDs only — comma-separated. Format: `FT-NN`, `ADR-NN`, `SPIKE-NN`, `DECISION-NN`. Validator regex: `^[A-Z]+-\d+(, [A-Z]+-\d+)*$`. NO prosa. Ejemplo: `FT-08, ADR-002`}}

**Blocks:** {{IDs only — `FT-NN` que dependen de éste. Mismo regex. Ejemplo: `FT-11, FT-12`}}

**Primary files:** {{paths derivados de 04_ARCHITECTURE §3 routes + 09_DATA_MODEL anchors + sk-* skill refs. Ejemplo:}}

- `src/lib/db/schema/{{domain}}.ts` (Drizzle schema for ENT-XXX)
- `src/lib/actions/{{domain}}/{{action-name}}.ts` (server action)
- `src/app/(protected)/{{route}}/page.tsx` (RSC page)
- `src/app/(protected)/{{route}}/[id]/page.tsx` (detail)
- `src/app/(protected)/{{route}}/nuevo/page.tsx` (create form)

**Entities:** {{ENT-XXX refs from `09_DATA_MODEL.md`. Ejemplo: `ENT-USER`, `ENT-INVOICE`. NO inline schema — read 09 for full shape.}}

**Actions/routes:** {{action signatures from `10_API_SURFACE.md` + route patterns from `04_ARCHITECTURE.md §3`. Ejemplo:}}

- `createInvoice(input)` — `withAuth({ resource: 'invoice', action: 'create' })`
- `GET /api/invoices/poll` — polling endpoint, ETag-aware
- `POST /api/cron/sync-invoices` — `CRON_SECRET` auth

**RBAC:** {{role × resource × action refs from `05_RBAC_MATRIX.md`. Ejemplo:}}

- `admin` × `invoice` × `{create, read, update, delete, list}` — scope: `team`
- `staff_operativo` × `invoice` × `{read, list}` — scope: `own`
- `finanzas` × `invoice` × `{read, list, update}` — scope: `team`

**Acceptance scenarios:** {{US-XXX refs from `06_ACCEPTANCE_SCENARIOS.md`. NO inline Gherkin — read 06 for full scenarios. Ejemplo: `US-007`, `US-008`, `US-009`}}

**Layout impact:** `true` | `false` — propagado desde `03_DEEP_DIVE.md#FT-{{NN}}` campo `Layout impact`. Consumido por `tk-design` Phase 4 (SCR classification): `true` fuerza tier `custom` aunque sea Configure-heavy. Si ausente en deep-dive (packets legacy pre-fix) → `tk-design` aplica fallback heurístico (keyword detection con default `custom` conservative).

**Tests required:**

- {{`unit` — Zod schemas, business rule helpers, calculation functions}}
- {{`component` — Form interactions, table actions, conditional renders (RTL)}}
- {{`E2E` — Cross-page flows, auth gates, real DB integration (Playwright)}}

**Open blockers:** {{tracking IDs only — `DECISION-XXX`, `SPIKE-XXX`, `ADR-XXX`. Si `Status: ready` → debe ser `[]` (empty array). Si `Status: ready` AND blockers non-empty → emission FAILS (inconsistencia obvia).}}

**Defaults allowed if unresolved:** {{explicit default value OR `none — must resolve`. Ejemplo: `default invoice currency = MXN if cliente Q-currency unresolved by W2`. Si `none — must resolve` → blocker MUST have tracking ID.}}

**Definition of done:**

{{Derived from `06_ACCEPTANCE_SCENARIOS.md` AC + `12_BACKLOG_READINESS.md` per-FT `Status==ready` criteria. Ejemplo:}}

- All US-XXX scenarios pass (manual smoke + automated where applicable)
- Drizzle schema migrated (no drift `pnpm db:check`)
- RBAC matrix entries enforced en server actions (`withAuth({ resource, action, schema, revalidate })`)
- Component tests cover happy + edge paths (Vitest + RTL)
- E2E covers cross-page auth flow (Playwright)
- `pnpm verify` passes (lint + typecheck + test)
- Issue marked Done in `project/backlog/` with Evidence per `DOR_DOD.md`

---

## Cross-ref index (for /implement)

| Aspect           | Source                                               |
| ---------------- | ---------------------------------------------------- |
| Feature spec     | `03_DEEP_DIVE.md#FT-{{NN}}`                          |
| Acceptance       | `06_ACCEPTANCE_SCENARIOS.md` (filter US refs above)  |
| Data shapes      | `09_DATA_MODEL.md` (filter ENT refs above)           |
| Action contracts | `10_API_SURFACE.md` (filter action refs above)       |
| RBAC enforce     | `05_RBAC_MATRIX.md` (filter role × resource above)   |
| ADRs             | `decisions/ADR-*.md` (filter ADR refs in Depends on) |
| SK leverage      | `07_SK_LEVERAGE.md` (filter FT-{{NN}} entry)         |
| Backlog status   | `12_BACKLOG_READINESS.md` (FT-{{NN}} row)            |

---

_TimeKast Factory — tk-discovery template · 15_IMPLEMENTATION_PACKET (one per FT-NN)_
