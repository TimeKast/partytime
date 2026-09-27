---
id: SCR-{{NNN}}
slug: {{kebab-case-slug}}
route: {{/(protected)/...}}
layout: {{DashboardShell | PublicShell}}
roles: [{{role-id-1}}, {{role-id-2}}]
features: [FT-{{XX}}]
personas: [PER-{{YYY}}]
packets: [15_IMPLEMENTATION_PACKETS/FT-{{XX}}.md]
tier: kit-extended
binding: sk-{{skill}}
# --- Provenance (OPTIONAL — day-2 only; OMIT entirely on greenfield SCRs) ---
# Emitted by `/design add <plan>` to leave a durable audit trail. A greenfield SCR
# WITHOUT these fields is fully valid. Tier rules live in `methodology/day2-classification.md`
# (SSOT — do NOT duplicate here). Field reference: `methodology/screen-contract-shape.md`.
source_tier: {{kit-pure | kit-extended | custom}} # tier the day-2 classifier elected
plan_source: {{path/to/plan.md#anchor (hash: sha-12)}} # plan path + section anchor + sha-12 of plan at emission
day2_action: {{nueva | regenerar | backfill}} # enum — exactly one of these 3 values
revisions: [] # append-only: each regen ADDS one entry, never rewrites
---

# SCR-{{NNN}} — {{Screen name}} (light spec)

> **Tier:** `kit-extended` — la pantalla se monta sobre la primitiva shipped por `sk-{{skill}}` con extensiones específicas (campos nuevos, validation custom, state delta vs §7 cross-cutting).
>
> **Mobile-first invariant:** NO se emite ASCII propio. El layout viene del kit + las extensiones se describen en §3 Customizations. Si la extensión IMPACTA layout estructural (panel lateral nuevo, wizard multi-step) → este SCR debió clasificarse como `custom`, no `kit-extended`. Si llegas aquí con layout impact verdadero → escala a tk-design CP3 override.

## 1. Purpose & JTBD

{{1-2 sentences. El user problem que esta pantalla resuelve, anchored to primary persona's JTBD from `02_PERSONAS.md`. Explica POR QUÉ la extensión existe sobre lo que ya shippea el kit.}}

## 2. Route & Access

- **URL:** `{{/(protected)/entity}}`
- **Layout:** `{{DashboardShell}}` (`sk-ui §6.1`)
- **Breadcrumb:** `"{{breadcrumb label}}"` (via `BreadcrumbSetter`)
- **RBAC:** `{{roles}}` (per `05_RBAC_MATRIX.md`)
- **Auth:** {{required | optional}}
- **Feature flag:** {{none | flag-name}}

## 3. Customizations vs kit default

> Lista plain language de TODO lo que esta SCR cambia vs lo que `sk-{{skill}}` shippea out-of-the-box. Si esta lista está vacía → la SCR debe ser `kit-pure`, no `kit-extended`.

| #   | Customization                            | Tipo        | Justification (1 línea)                                   |
| --- | ---------------------------------------- | ----------- | --------------------------------------------------------- |
| 1   | {{Campo `employee_id` agregado al form}} | data field  | {{Requerimiento legal del cliente — RH lo necesita}}      |
| 2   | {{Validation Zod custom para RFC}}       | validation  | {{Format específico es-MX}}                               |
| 3   | {{State `pending_review` agregado}}      | state delta | {{No existe en §7 cross-cutting — local a esta pantalla}} |

> Refs: `sk-{{skill}}/SKILL.md §{{section}}` documenta el baseline shipped que estamos extendiendo.

## 4. States deltas (vs §7 cross-cutting)

> Solo los estados que ESTA pantalla introduce sobre el catálogo compartido. Estados standard (loading/error/empty/auth) NO se re-documentan — viven en `16_DESIGN.md §7`.

| Estado             | Trigger                                       | Visual                                | Copy es-MX                               |
| ------------------ | --------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| {{pending_review}} | {{User envía form pero falta approval admin}} | {{Badge `pending` + disabled inputs}} | `"En revisión — un admin debe aprobar."` |

> Si esta tabla está vacía → la SCR debería ser `kit-pure`, no `kit-extended`.

## 5. Refs

- **Features:** FT-{{XX}} — `03_DEEP_DIVE.md` + `15_IMPLEMENTATION_PACKETS/FT-{{XX}}.md`
- **Personas:** PER-{{YYY}} — `02_PERSONAS.md`
- **Acceptance scenarios:** US-{{XXX}} — `06_ACCEPTANCE_SCENARIOS.md`
- **Entities:** {{ENT-XXX refs from `09_DATA_MODEL.md`}}
- **Server actions:** {{from `10_API_SURFACE.md`}}
- **RBAC:** {{from `05_RBAC_MATRIX.md`}}
- **Kit binding:** `.claude/skills/sk-{{skill}}/SKILL.md` — primitive base
- **Cross-cutting states:** `16_DESIGN.md §7`
- **Cross-cutting copy:** `16_DESIGN.md §6`

## Caveats (opcional)

{{Si hay alguna decisión de design pendiente o ambigua que el specer no resolvió, dejarla aquí con tracking ID. Ejemplo: "DECISION-DESIGN-{{NN}}: ¿el campo employee_id es required o optional? Pendiente confirmación cliente."}}

---

_TimeKast Factory — tk-design template · SCR (light tier kit-extended)_
