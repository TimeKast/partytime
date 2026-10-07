# Project Config Template

> Template para `project/planning/project-config.md`.
> **Se genera durante:** `/discovery` (Phase 8 Close)
> **Se carga en:** `@import` desde `CLAUDE.md` (always-on, ver CLAUDE.md §Proyecto)

---

## Principios del schema

1. **Minimal always-on.** Este archivo se @importa en CLAUDE.md — cada línea es context tax. Target: ≤200 líneas.
2. **Síntesis, no enumeración.** Versiones, features, comandos genéricos → pointers a SSOT real (package.json, skills, SK.md), no duplicación.
3. **Project-specific only.** Si algo está en `SK.md`, `GIT.md`, `CODING.md`, `CC.md` → no repetir aquí.
4. **Ops detail va aparte.** SSH commands, paths del VPS, env vars completas → `project/infra/{servicio}.md` (pointer desde §5).

---

## Template

````markdown
---
project: '{{nombre_proyecto}}'
client: '{{nombre_cliente_o_organización}}'
stakeholder: '{{nombre_principal — quien aprueba}}'
project_type: saas-mvp # saas-mvp | internal-tool | landing | e-commerce | mobile-app | api-service
structure_version: '2.0'
locale: 'es-MX'
timezone: 'America/Mexico_City'
sk_active: true # true = proyecto usa Starter Kit; false = stack custom desde cero
design_system: neomorphism
stack: { framework: next, db: drizzle-neon, auth: nextauth }
deadline: '{{YYYY-MM-DD o TBD}}'
---

# Project Config — {{nombre_proyecto}}

<!-- INSTRUCCIÓN: No incluir este comentario ni los HTML comments del template en el output final -->

---

## 1. Identity

| Campo                 | Valor                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Nombre**            | {{nombre_proyecto}}                                                                                                 |
| **Slug**              | {{kebab-case}}                                                                                                      |
| **Tipo**              | {{saas-mvp / internal-tool / landing / e-commerce / custom}}                                                        |
| **Repo**              | {{org/repo}}                                                                                                        |
| **Branch principal**  | {{main}}                                                                                                            |
| **Branch de trabajo** | {{develop}}                                                                                                         |
| **Stakeholder**       | {{nombre_principal}}                                                                                                |
| **Deadline MVP**      | {{YYYY-MM-DD o TBD}}                                                                                                |
| **Rail del cliente**  | {{rail-<cliente> · <id del proyecto en la bóveda> — o "—"}}                                                         |
| **is_factory**        | false <!-- true SOLO en TimeKast-Factory; activa selective merge en `/deploy` e implica branching develop-first --> |

<!-- INSTRUCCIÓN (Rail del cliente): solo si el cliente opera infraestructura PROPIA (p.ej. el DNS de su dominio en SU cuenta de Cloudflare). Valor: el proyecto `rail-<cliente>` de la bóveda y su id, que es un UUID (`rail-acme · 1a2b3c4d-…`); el id lo da un admin de la bóveda, no se inventa. Si el cliente no tiene infraestructura propia o el dato no está en el discovery → `—`. `factory provision --domain=… --dns=cliente-cf` lee de ese proyecto la clave `CLOUDFLARE_API_TOKEN` (nombre real, sin prefijos); sin este campo, pide el token por terminal. Nunca escribas aquí un token ni ningún otro valor secreto. -->

---

## 2. Pipeline Status

| Fase      | Documento                                | Estado       |
| --------- | ---------------------------------------- | ------------ |
| Discovery | `project/planning/00_DISCOVERY_BRIEF.md` | ✅ Completo  |
| Design    | `project/planning/16_DESIGN.md`          | ⬜ Pendiente |
| Backlog   | `project/backlog/`                       | ⬜ Pendiente |
| Code      | `src/`                                   | ⬜ Pendiente |

<!-- Cadena real per CORE.md §3. Cada workflow actualiza su fila al cerrar. -->
<!-- On-demand off primary path (NO listar aquí): /proposal (post-backlog cotización), /docs api · /docs data-model (autogen post-implement). -->
<!-- Fila Design — valor `🟡 Parcial (seed)`: lo escribe `/design add <plan>` (day-2) cuando generó el 16_DESIGN.md desde un seed mínimo (sitemap + Screen Map del código real, sin visual direction completa). NO renombrar la fila `Design` (el matcher de Phase 9 de tk-design usa el nombre exacto); solo cambia el valor de la celda Estado. Insert defensivo: si la fila `Design` ya existe, solo se actualiza su valor — no se crea fila nueva. -->

---

## 3. Problem Statement

<!-- 3-5 líneas: qué hace, para quién, qué problema resuelve. Narrativa densa, no bullets. -->

{{Descripción concisa del proyecto.}}

---

## 4. Stack Summary

<!-- ≤6 bullets con tecnología, sin versiones. Versiones exactas → package.json -->

- **Framework:** {{Next.js 16 (App Router, RSC)}}
- **UI:** {{React + Tailwind v4 + shadcn/ui}}
- **DB:** {{Neon Postgres + Drizzle ORM}}
- **Auth:** {{Auth.js v5}}
- **Hosting:** {{Vercel}}
- **Otros:** {{Payments: Stripe | Storage: R2 | Email: Resend}} <!-- consolidar en 1 línea -->

<!-- 🚫 No duplicar package.json. Si el stack difiere del SK base → anotar en §9 Key Decisions. -->

---

## 5. Infrastructure & Services

<!-- Tabla compacta: solo lo necesario para que el agente sepa QUÉ existe y DÓNDE.
     Detalle operativo (SSH, paths, commands, monitoreo) → project/infra/{servicio}.md -->

| Servicio | Host / URL         | Propósito           | Env Var          | Costo         |
| -------- | ------------------ | ------------------- | ---------------- | ------------- |
| Vercel   | {{app.vercel.app}} | Hosting + Cron Jobs | —                | {{$20/mes}}   |
| Neon     | Via `DATABASE_URL` | DB principal        | `DATABASE_URL`   | {{Free tier}} |
| Resend   | Via API            | Email transaccional | `RESEND_API_KEY` | {{Free tier}} |

> **Ops detail:** SSH, monitoreo, paths, env vars completas → `project/infra/{servicio}.md` (crear si hay VPS/tunnel/proxy/cron).

---

## 6. Related Repos

<!-- Solo si hay multi-repo / monorepo / repos hermanos. Omitir sección completa si single-repo. -->

| Repo       | Path / URL       | Stack                  | Propósito                          |
| ---------- | ---------------- | ---------------------- | ---------------------------------- |
| {{repo-1}} | {{~/org/repo-1}} | {{Flutter + Firebase}} | {{App móvil — consume este admin}} |

---

## 7. Roles (RBAC)

<!-- Roles del sistema, no stakeholders del proyecto (eso va en §8). Línea compacta.
     Fuente: Brief §2 (Personas & RBAC). -->

{{super_admin, admin, staff}}

---

## 8. Stakeholders & Team (OBLIGATORIO)

<!-- Stakeholders = decisores (quién puede aprobar o bloquear).
     Team = ejecutores (quién hace qué, con responsabilidades concretas).
     Fuente: Brief §2.1 y §2.2. -->

### 8.1 Stakeholders

| Rol                   | Nombre     | Decide sobre            |
| --------------------- | ---------- | ----------------------- |
| Stakeholder principal | {{nombre}} | Aprobación final        |
| {{Product Owner}}     | {{nombre}} | {{Scope, prioridad}}    |
| {{Tech Lead}}         | {{nombre}} | {{Arquitectura, stack}} |

### 8.2 Team members

| Rol             | Nombre     | Responsabilidades               |
| --------------- | ---------- | ------------------------------- |
| {{Developer 1}} | {{nombre}} | {{áreas del código / features}} |

---

## 9. Key Decisions

<!-- Top 10 decisiones firmes con razón 1-línea. Para el resto → Brief Decision Registry. -->

1. {{Decisión 1}} — {{razón 1-línea}}
2. {{Decisión 2}} — {{razón 1-línea}}

> Decision Registry completo → `project/planning/00_DISCOVERY_BRIEF.md §Decision Registry`.

---

## 10. Project-Specific Rules (BR-XXX)

<!-- Solo reglas ÚNICAS del proyecto. NO repetir reglas de SK.md/GIT.md/CODING.md/CC.md.
     Prefijo BR-XXX para trazabilidad a Business Rules del Brief. -->

### BR-PROJECT-001 — Quality >> Deadline (DOGMA TimeKast)

Si hay trade-off entre calidad y fecha de entrega, **calidad manda**. Ship tarde con calidad, nunca a tiempo con deuda técnica acumulada. Esta regla es durable TimeKast, no negociable a nivel discovery ni por stakeholder individual. Si un stakeholder explícitamente lo contradice, escalar antes de aceptar.

### Otras BR del proyecto

1. **BR-XXX** — {{regla específica}} — {{razón}}

---

## 11. Client Context

<!-- Contexto del cliente para adaptar tono, vocabulario y restricciones de marca.
     Fuente: Brief §9 (Branding) + §11 (Visual Direction Seeds). -->

| Campo                   | Valor                                                     |
| ----------------------- | --------------------------------------------------------- |
| **Industria**           | {{industria}}                                             |
| **Nivel de formalidad** | {{formal / semi-formal / casual}}                         |
| **Idioma preferido**    | {{español / inglés / bilingüe}}                           |
| **Restricciones marca** | {{colores prohibidos, logo rules, o "sin restricciones"}} |

---

## 12. Domain Glossary — Quick Ref

<!-- Top 8-10 términos del dominio con "usar en lugar de". Full glossary → 09_GLOSSARY.md. -->

| Término       | Significado            | Usar en lugar de     |
| ------------- | ---------------------- | -------------------- |
| {{Término 1}} | {{definición concisa}} | {{sinónimo ambiguo}} |

> Glossary completo → `project/planning/09_GLOSSARY.md`.

---

## 13. SSOT Pointers

<!-- Apuntadores a las fuentes de verdad que este archivo NO duplica. -->

- **Versions (deps, scripts, ports):** `package.json`
- **Features (DB tables, actions, env vars):** [`sk-features-index`](../../.claude/skills/sk-features-index/SKILL.md)
- **File structure (dónde va cada archivo):** [`sk-project-structure`](../../.claude/skills/sk-project-structure/SKILL.md)
- **Commands (pnpm dev/test/build/lint/typecheck/etc):** `SK.md §4.1`
- **UI primitives:** [`sk-ui`](../../.claude/skills/sk-ui/SKILL.md) + `project/reference/INVENTORY.md`
- **Canonical symbols (hooks, actions, form kit):** `project/reference/HOOKS.md`
- **Dependency map:** `project/reference/CODEBASE.md`

### Project-specific commands (si aplica)

<!-- Solo comandos ÚNICOS de este proyecto que no están en SK.md §4.1. Omitir si ninguno. -->

```bash
# Ejemplo:
# pnpm db:query:erp "SQL"   # Query read-only contra MySQL Proscai via VPS proxy
```

---

## 14. Delivery Model (interno — alimenta /proposal)

<!-- Términos comerciales + ownership. Vive aquí (no en Brief público) por sensibilidad:
     Brief puede ser cliente-facing, project-config es interno por convención.
     /proposal workflow lee esta sección al cotizar. -->

### 14.1 Commercial structure

- **Type:** Fixed-scope / Time-and-materials / Milestones / Internal (no cliente externo)
- **Payment cadence:** upfront / per milestone / monthly / on completion

> **NOTA:** currency + montos **NO van aquí**. Eso vive en `/proposal`. Esta sección captura solo la estructura operativa del delivery, no el deal comercial.

### 14.2 Stakeholder decision authority

| Decisión               | Rol que aprueba | Mecanismo                  |
| ---------------------- | --------------- | -------------------------- |
| Scope changes          |                 | sign-off / email / meeting |
| Deadline changes       |                 | sign-off / email           |
| Technical architecture |                 | ADR review                 |
| Descope bajo presión   |                 | PO + Tech Lead             |

### 14.3 Infrastructure ownership

- **Dev:** Cliente / TimeKast / Híbrido
- **Prod:** Cliente / TimeKast / Híbrido
- **Post-launch ops:** Cliente / TimeKast
- **Transition plan:** [si hay handover al cliente, describir]

### 14.4 Post-launch support

- **¿Incluido?** Sí / No
- **Duración:** [ej: 3 meses]
- **Scope:** Bug fixes / Minor changes / Major features (extra)
- **Channel:** [ej: Slack / email / ticket]

---

_{{nombre_proyecto}} — Project Config ({{YYYY-MM-DD}})_
````

---

## Notas para el agente (cómo rellenar)

### Frontmatter YAML (OBLIGATORIO)

- `project`, `client`, `stakeholder` → Brief §1 + §2.1
- `project_type` → Brief §1 (tipo de producto)
- `design_system` → skin activo del kit (`neomorphism` por default; registry en `src/config/skins.ts`) o el que `/design` elija
- `locale` → Brief §9 (idioma UI)
- `timezone` → Brief §8 (infraestructura), default `America/Mexico_City`
- `stack` → Brief §8 + SK actual (framework, db, auth)
- `deadline` → Brief §8 (timeline), o `'TBD'` si no hay fecha definida
- `structure_version` → siempre `"2.0"` para proyectos nuevos (frontmatter v2 schema)
- `sk_active` → `true` si proyecto usa Starter Kit, `false` si stack custom (Phase 0 detection visible)
- **No incluir** `version` ni `ports` — SSOT en `package.json`

### Body desde Brief

| Sección                    | Fuente Brief                                                             |
| -------------------------- | ------------------------------------------------------------------------ |
| §1 Identity                | §1 Nombre + §2.1 Stakeholder principal + §8 Deadline                     |
| §2 Pipeline Status         | Discovery ✅, Design/Backlog/Code ⬜ (per `CORE.md §3`)                  |
| §3 Problem Statement       | §1.2 Problem Statement (3-5 líneas, condensar)                           |
| §4 Stack Summary           | §8 Stack (tech solo, sin versiones)                                      |
| §5 Infrastructure          | §5 Infra + §8 Services (consolidar en 1 tabla)                           |
| §6 Related Repos           | §8 Related Repos (omitir si single-repo)                                 |
| §7 Roles                   | §2.3 Tipos de Usuario (roles del sistema)                                |
| §8 Stakeholders & Team     | §2.1 Stakeholders + §2.2 Team (AMBOS obligatorios)                       |
| §9 Key Decisions           | Decision Registry (top 10 firmes)                                        |
| §10 Project-Specific Rules | `BR-PROJECT-001` hardcoded + §6 Business Rules únicas del proyecto       |
| §11 Client Context         | §9 Branding + §11 Visual Direction                                       |
| §12 Domain Glossary        | `09_GLOSSARY.md §Términos de Negocio` (top 8-10)                         |
| §13 SSOT Pointers          | Fijo (copiar del template + agregar project-specific commands si aplica) |

### `BR-PROJECT-001` es hardcoded

No es opcional, no se negocia en discovery. Si el stakeholder explícitamente contradice ("quiero calidad < deadline"), el workflow rechaza y escala antes de aceptar. Esta fila siempre se escribe.

### Qué NO va aquí

- ❌ **Tech Stack versions** → `package.json` es SSOT
- ❌ **Features completas** → `sk-features-index`
- ❌ **File structure** → `sk-project-structure`
- ❌ **Comandos genéricos** (`pnpm dev`, `pnpm build`, `pnpm test`…) → `SK.md §4.1`
- ❌ **Env vars completas** → `.env.example`
- ❌ **SSH commands, paths del VPS, monitoreo** → `project/infra/{servicio}.md`
- ❌ **Changelog** → git log / tags
- ❌ **Scope Boundaries completos** → Brief §3.3
- ❌ **Open Questions / Assumptions** → Brief (fase discovery, no runtime)
- ❌ **Stack Overrides históricos** → ADRs

### Mantenimiento

1. **Pipeline Status** se actualiza por cada workflow al cerrar fase.
2. **Cambios de infra/stack/key decisions** → update manual + entry en git log (no changelog inline).
3. **Target tamaño:** ≤200 líneas. Si crece más → algo pertenece a otra SSOT (skill, ADR, doc de infra).

---

_TimeKast Factory — Project Config Template (schema v2 — BR-PROJECT-001 hardcoded)_
