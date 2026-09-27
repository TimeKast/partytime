# Architecture — {{project}}

> **Produced by:** main orchestrator (Phase 6.1 synthesis post-brief).
> **Consumed by:** `/design` (constraints), `/backlog` (issue context), `/implement` (technical surface). **Ships con cliente** post-handoff — auto-suficiente sin contexto Factory.
> **Schema canónico:** [`methodology/architecture.md`](../methodology/architecture.md).
> **Path canónico:** `project/planning/04_ARCHITECTURE.md`.

> **NO `§ADR index`.** Lista completa de ADRs = `ls decisions/ADR-*.md`. Status = leer frontmatter del file. Este doc cita ADR-XXX inline en las consecuencias bakeadas en §§1-5.

**Run date:** {{YYYY-MM-DD}}
**Source:** brief §5 (integraciones) + brief §8.3 (constraints) + sk-leverage si sk_active + 03_DEEP_DIVE feature topology + decisions/ADR-\*.md.

---

## §1 Topology

{{Diagrama de componentes (ASCII / Mermaid). Bloques principales:}}

```
{Frontend (Next.js)} ──── {Backend (Next.js Server Actions)} ──── {DB (Postgres/Neon)}
                                       │
                                       └── {Servicios externos: Stripe, OpenAI, ...}
```

**Componentes:**

- {{Frontend / SSR / RSC layers}}
- {{Backend / Server Actions / Route Handlers}}
- {{DB (Drizzle + Postgres) — esquema en `src/lib/db/schema/*.ts`}}
- {{Auth — NextAuth v5 (provider config en `auth.config.ts`)}}
- {{Servicios externos involucrados — APIs, queues, tunnels, infra custom}}

**Consecuencias de ADRs bakeadas inline:**

- {{Ejemplo: "Storage de configs por usuario usa Postgres JSONB (ver ADR-001) — facilita schema-less expansion sin migrations."}}
- {{Ejemplo: "Auth flow combina magic-link + Google OAuth (ver ADR-003) — magic-link es default, OAuth opcional."}}

---

## §2 SK delta

> **Condicional:** solo si `sk_active=true` en project-config. Si `sk_active=false`, esta sección lleva nota "N/A — proyecto sin Starter Kit; toda la infra es custom" y los detalles relevantes se describen inline en §1, §3, §4, §5.

| Module        | SK provides                          | Custom delta                                                             |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Auth          | NextAuth + magic-link + Google OAuth | {{ej: + role-based middleware custom}}                                   |
| DB layer      | Drizzle ORM helpers + `auditFields`  | {{ej: + JSONB column type para `user_configs`}}                          |
| UI components | `DataTable`, `FormField`, ...        | {{ej: + custom `ScoringWidget` (FT-NN)}}                                 |
| RBAC          | `ROUTE_ACL` + `withAuth` wrapper     | {{ej: + scope-based check (own/team/global) en server actions críticas}} |
| Notifications | `notify()` dispatcher + email/push   | {{ej: + custom template `score-update-digest`}}                          |
| Misc          | ...                                  | ...                                                                      |

---

## §3 Module boundaries

> **Provee `routes universe`** consumido por `05_RBAC_MATRIX.md` resource SSOT.

**Layout principal** (refs convention de [`sk-project-structure`](../../sk-project-structure/SKILL.md) cuando aplica):

```
src/
├── app/
│   ├── (auth)/            # rutas no-auth
│   ├── (protected)/       # rutas auth-required
│   │   ├── dashboard/
│   │   ├── {feature-1}/   # FT-NN dispatch
│   │   └── api/           # route handlers custom
│   └── ...
├── components/
│   ├── ui/                # dos clases de archivo — ver SK.md §3.3
│   ├── common/            # cross-domain shared
│   └── {feature-1}/       # domain-specific
├── lib/
│   ├── actions/           # server actions per domain
│   ├── db/                # Drizzle schema + queries
│   └── ...
└── ...
```

**Anti-imports** (Shared vs Domain rule):

- `components/common/` NUNCA importa de `components/{feature}/`
- `components/{feature-A}/` NUNCA importa de `components/{feature-B}/` (extraer a `common/`)
- `lib/actions/{feature-A}/` NUNCA importa de `lib/actions/{feature-B}/`

**Routes inventory** (consumido por 05_RBAC + 10_API_SURFACE):

> **Capture-first (Fase 1):** cada route declara auth strategy + input + output + error codes. Phase 6.1 agrega 10_API_SURFACE desde aquí.

| Route pattern          | Method | Handler type       | Auth strategy                       | Input shape             | Output shape                            | Error codes                       |
| ---------------------- | ------ | ------------------ | ----------------------------------- | ----------------------- | --------------------------------------- | --------------------------------- |
| `/dashboard`           | GET    | RSC page           | `withAuth(authenticated)`           | —                       | RSC stream (200)                        | —                                 |
| `/{feature-1}/[id]`    | GET    | RSC page           | `withAuth({resource,action})` | `params.id (uuid)`      | RSC stream (200) o redirect (404)       | `NOT_FOUND`                       |
| `/{feature-1}/[id]`    | POST   | server action      | `withAuth({...})`                   | `z.object({...})` (Zod) | `ActionResult<{{Shape}}>`               | `INVALID_INPUT`, `FORBIDDEN`, etc |
| `/api/{feature-1}/...` | POST   | route handler      | `withAuth(...)` o `CRON_SECRET`     | JSON body (Zod schema)  | `{ data, error? }` JSON (200/304/422)   | `UNAUTHORIZED`, etc               |
| `/api/cron/{{job}}`    | POST   | cron route handler | `CRON_SECRET` (Vercel header)       | empty (cron-triggered)  | `{ status, processed_count }` (200/500) | `CRON_AUTH_FAILED`, etc           |
| ...                    |        |                    |                                     |                         |                                         |                                   |

**Auth strategy values:** `CRON_SECRET` (Vercel cron) · `withAuth({resource,action})` (RBAC) · `withSelf` (self-service) · `public` (unauthenticated) · `authenticated` (any signed-in user).

**Input shape values:** `Zod schema literal` · `form-data` (multipart) · `query-params` · `params.{id}` (route segment) · `empty` (cron).

**Output shape values:** `RSC stream` · `ActionResult<DataShape>` · JSON `{ data, error? }` · `Response(200|304|...)`.

**Error codes:** códigos que emite el handler — referenciados después en 10_API_SURFACE catalog consolidado.

---

## §4 Integration contracts

> Servicios externos, túneles, infraestructura adicional fuera del stack standard (Vercel / Neon / Next.js).

### {{Servicio externo 1}} — {{ej: Stripe / OpenAI / Twilio}}

- **Protocolo:** REST / GraphQL / gRPC / webhook
- **Auth method:** Bearer token / OAuth2 / API key (env var: `{{XXX}}_API_KEY`)
- **Error handling:** retry strategy (exponential backoff N=3) + circuit breaker si aplica
- **Rate limits:** {{X req/min}} — fallback strategy si se rebasa
- **Webhook signature verification:** {{HMAC SHA256 / JWT / N/A}}
- **Refs:** ver ADR-XXX si decisión arquitectural; brief §5 si requisito declarado.

### {{Servicio externo 2}}

(repetir)

### Infrastructure custom

{{Solo si aplica. Túneles, VPNs, máquinas standalone, workers de background, etc.
Ejemplo:

- "Worker VPS (DigitalOcean, pm2, Caddy) — procesa jobs en background. SSH-only access; admin via pm2 cli."
- "Tunnel ngrok para webhook testing local — N/A en prod."}}

---

## §5 Cache posture

| Surface             | Strategy                                                             | Invalidation                                       |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| Public pages        | SSG / ISR (revalidate N min)                                         | On-demand via `revalidatePath()` en server actions |
| Authed pages        | RSC dynamic (default)                                                | `revalidatePath()` post-mutation                   |
| API routes (read)   | HTTP cache `s-maxage` cuando aplica                                  | Time-based                                         |
| Client-side queries | TanStack Query (si presente)                                         | Mutation-driven                                    |
| DB                  | Drizzle no-cache by default; helpers `createCachedCount` para counts | `revalidateTag()`                                  |

**ADR refs:** {{ej: "(ver ADR-005) — política SSG-first para landing"}}.

---

## Completeness Gate

| Check                                                                                             | Result      |
| ------------------------------------------------------------------------------------------------- | ----------- |
| §1 Topology diagram presente · cita refs a integraciones brief §5                                 | PASS / FAIL |
| §2 SK delta declarado (módulos del kit + custom additions)                                        | PASS / FAIL |
| §3 Module boundaries — routes inventory completo (auth strategy + input/output/error codes)       | PASS / FAIL |
| §4 Integration contracts — APIs externas + auth + rate limits                                     | PASS / FAIL |
| §5 Cache posture declarada per layer                                                              | PASS / FAIL |
| ADRs flagged in §3 / §4 referenced inline (no §ADR index — `ls decisions/ADR-*.md` for full list) | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions |
| ------------ | ------------------------------- | ------------------ |
| `/design`    | `ready` / `partial` / `blocked` | —                  |
| `/backlog`   | (idem)                          |                    |
| `/implement` | (idem)                          |                    |

### Notes

{{Si status=partial: enumerar DECISION/SPIKE que desbloquean. Ejemplo: "/implement blocked: SPIKE-002 (PoC de scoring engine) debe correr antes de issues FT-07."}}

---

_TimeKast Factory — tk-discovery template · 04_ARCHITECTURE (ships con cliente)_
