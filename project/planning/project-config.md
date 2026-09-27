---
project: 'partytime'
client: 'TBD'
stakeholder: 'TBD'
project_type: saas-mvp
structure_version: '2.0'
locale: 'es-MX'
timezone: 'America/Mexico_City'
sk_active: false
design_system: custom
stack: { framework: next, db: drizzle-neon, auth: custom }
deadline: 'TBD'
---

# Project Config — partytime

> Generado durante la migración legacy `.agent/` v8 → TimeKast Factory kit v13.x (perfil `full`),
> no vía `/discovery`. Los campos marcados `TBD` requieren un `/discovery` real; no se inventaron
> datos de negocio.

---

## 1. Identity

| Campo                 | Valor                                                            |
| --------------------- | ----------------------------------------------------------------- |
| **Nombre**            | partytime (Rooftop Party — sistema de invitaciones para eventos) |
| **Slug**              | partytime                                                          |
| **Tipo**              | saas-mvp (multi-evento)                                            |
| **Repo**              | TimeKast/partytime                                                 |
| **Branch principal**  | main                                                               |
| **Branch de trabajo** | main (sin `develop`; ver §9)                                       |
| **Stakeholder**       | TBD                                                                |
| **Deadline MVP**      | TBD (proyecto en producción, iteración continua)                  |
| **Rail del cliente**  | —                                                                  |
| **is_factory**        | false                                                              |

---

## 3. Problem Statement

Plataforma web de gestión de invitaciones y RSVPs para eventos (multi-evento, cada uno con su
propio slug/URL), con panel de administración, envío de emails transaccionales/masivos (Resend),
pagos (Stripe) y exportación de listas de invitados a PDF/Excel.

---

## 4. Stack Summary

- **Framework:** Next.js 14 (App Router) — **no** Next 16; no actualizar el major sin decisión aparte
- **UI:** React 18 + CSS Modules + Framer Motion (sin Tailwind, sin shadcn/ui)
- **DB:** Neon Postgres + Drizzle ORM
- **Auth:** sistema propio (bcryptjs + sesiones), no NextAuth/Auth.js
- **Hosting:** Vercel (`party.timekast.mx`) + cron (`/api/cron/send-reminders`)
- **Otros:** Payments: Stripe | Storage: Vercel Blob | Email: Resend | PDF: jsPDF | Excel: xlsx

> 🚫 Layout diverge del Starter Kit: **no hay `src/`** — `app/`, `lib/`, `types/`, `drizzle/`,
> `scripts/` viven en la raíz del repo. `sk_active: false` — este proyecto no nació del Starter
> Kit y las skills `sk-*` que asumen `src/`/Tailwind/shadcn no aplican verbatim.

---

## 5. Infrastructure & Services

| Servicio | Host / URL                                   | Propósito              | Env Var          |
| -------- | --------------------------------------------- | ----------------------- | ---------------- |
| Vercel   | `party.timekast.mx` (prod, Node 22.x, READY)  | Hosting + Cron Jobs      | —                 |
| Neon     | Via `DATABASE_URL`                            | DB principal             | `DATABASE_URL`    |
| Resend   | Via API                                       | Email transaccional      | `RESEND_API_KEY`  |
| Stripe   | Via API                                       | Pagos                    | `STRIPE_*`        |

---

## 8. Stakeholders & Team

TBD — requiere `/discovery` real.

---

## 9. Key Decisions

1. Sin `src/` — código vive en `app/`, `lib/`, `types/`, `drizzle/` en la raíz (confirmado por `tsconfig.json`, `@/*` → `./*`). No se migró a `src/` en esta migración de kit (F5-B queda pendiente, opt-in).
2. Solo existe la rama `main` (sin `develop`).
3. Perfil `full` del kit (incluye `sk-*` + `SK.md`), aunque el proyecto no nació del Starter Kit — decisión operativa para tener disponible la bóveda de secretos (`vault adopt`), no porque el stack siga la convención `sk-*`.
4. Adapters multi-runtime: solo `codex` + `hermes` habilitados; `cursor` y `copilot` desactivados (`.claude/adapters.project.json`) — nadie en el equipo usa esos runtimes hoy.

---

## 13. SSOT Pointers

- **Versions (deps, scripts, ports):** `package.json`
- **Commands (pnpm dev/test/build/lint/typecheck/etc):** `SK.md §4.1` + scripts propios documentados en `README.md`
- **Docs de producto/negocio (legacy, no migrados a `project/`):** `docs/` (backlog, features, audits, runbooks) — SSOT histórico del proyecto, no renombrado en esta migración
