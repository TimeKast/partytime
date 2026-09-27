---
project: { { project-slug } }
run_id: { { timestamp-slug } }
status: ready | partial | blocked
sk_active: true | false
visual_direction: { { shipped-skin-name-from-registry | conceptual-family | custom } }
ui_language: es-MX
---

# 16_DESIGN — Executable UI Contract

> Index of the design output. Per-screen contracts in `16_DESIGN/SCR-XXX.md`, component extensions in `16_DESIGN/components/CMP-XXX.md`, multi-screen flows in `16_DESIGN/flows/FLW-XXX.md`. Source-of-truth for `/backlog` and `/implement`.

---

## §0 Visual Direction (final)

**Skin / direction:** {{a **shipped skin** name from the `src/config/skins.ts` registry (preferred when one fits) — or a `kb-visual-direction` conceptual family / `custom` if a new direction was taken}}

**Rationale:** {{2-3 sentences. Anchor to `00_DISCOVERY_BRIEF.md §11.1 Postura Visual`. Why this skin fits the product's tone, persona context, and trust profile.}}

**Posture summary:** {{trust vs novelty / density / iconography / motion stance — 1 line each}}

---

## §1 Design System Anchors

### 1.1 Token compatibility ({{SK_ACTIVE=true}} only — table absent if SK_ACTIVE=false)

| Token category | SK default                | This project's direction       | Treatment                 |
| -------------- | ------------------------- | ------------------------------ | ------------------------- |
| Colors         | Neomorphism palette       | {{matches / extends / custom}} | compatible / extend / N/A |
| Surfaces       | --elevation-raised, --elevation-inset | {{...}}                        | {{...}}                   |
| Radii          | rounded-md/lg/xl scale    | {{...}}                        | {{...}}                   |
| Typography     | text-sm/base/lg scale     | {{...}}                        | {{...}}                   |
| Motion         | duration-200 ease-out     | {{...}}                        | {{...}}                   |
| Iconography    | Lucide                    | {{...}}                        | {{...}}                   |

### 1.2 Extension proposals (factory tickets, if any)

{{List of thin extensions to sk-ui that should land as kit-level variant additions, NOT local CMPs. Format: una línea por propuesta, `extend <sk-ui primitive> with <variant>` — **sin** un ID propio. Esta lista es la propuesta, no el ticket: al cierre del run (`tk-design §20.1.2`) el usuario elige cuáles se emiten como factory-tickets `ui-extension` con el shape canónico de `fx-factory-tickets §4`, y la línea de la propuesta emitida se anota con el path del ticket (`… → project/factory/ui-extension-….md`). Las no emitidas quedan listadas aquí igual. Empty list is fine.}}

### 1.3 UI language

- Default: es-MX
- Tone: {{from `project-config.md §branding.tone`}}
- Voice patterns: see [§6 Copy Direction](#6-copy-direction)

---

## §2 Information Architecture

### 2.1 Sitemap

```
{{ASCII tree showing route hierarchy. Example:}}

/
├── (public)/
│   ├── /              # SCR-XXX (landing)
│   └── /login         # SCR-XXX
└── (protected)/
    ├── /              # SCR-XXX (dashboard)
    ├── /movimientos
    │   ├── /          # SCR-XXX (listado)
    │   ├── /nuevo     # SCR-XXX (form crear)
    │   ├── /[id]      # SCR-XXX (detail)
    │   └── /[id]/editar # SCR-XXX (form editar)
    └── /admin
        └── /...       # SCR-XXX (admin nested)
```

### 2.2 URL convention

Per `sk-project-structure`: `/(protected)/{entity}/{nuevo,[id],[id]/editar}`. Deviations require explicit justification + `architect` agent approval in Phase 8.

### 2.3 Breadcrumb policy

{{When are breadcrumbs shown? Hierarchy depth threshold? Per `sk-ui §3.2 BreadcrumbSetter`.}}

### 2.4 Navigation surface

- **Sidebar (desktop ≥lg):** {{N items}} — per `sk-navigation §1 NavItem`. Items: {{list}}
- **BottomNav (mobile <lg):** {{Y items + More sheet ({{Z items}})}}
- **RBAC filtering:** runtime via `filterNavigationByRole`

---

## §3 Screen Map

| ID      | Slug      | Route         | Roles        | Features | Personas         | Packet                             | File                           |
| ------- | --------- | ------------- | ------------ | -------- | ---------------- | ---------------------------------- | ------------------------------ |
| SCR-001 | dashboard | /(protected)/ | admin, staff | FT-01    | PER-001, PER-002 | 15_IMPLEMENTATION_PACKETS/FT-01.md | 16_DESIGN/SCR-001-dashboard.md |
| SCR-002 | …         | …             | …            | …        | …                | …                                  | …                              |
| ...     |           |               |              |          |                  |                                    |                                |

> **ID stability:** sticky once assigned. Tombstoned IDs persist with `(removed in run N)` note.
> **Slug stability:** locked at first emission. Rename only via CP2 explicit user approval (old file → `_archive/`).

---

## §4 Flow Map

| ID      | Name     | Trigger   | Screens involved            | Success path  | Error paths    | File                                |
| ------- | -------- | --------- | --------------------------- | ------------- | -------------- | ----------------------------------- |
| FLW-001 | {{name}} | {{event}} | SCR-XXX → SCR-YYY → SCR-ZZZ | {{end state}} | {{N variants}} | 16_DESIGN/flows/FLW-001-{{slug}}.md |
| ...     |          |           |                             |               |                |                                     |

> Only emit FLW-XXX for ≥2 screens. Single-screen flows live in the SCR `## 10 Interaction details`.

---

## §5 Component Extensions

| ID      | Component name | Based on                | Criterion | Where used       | File                                     |
| ------- | -------------- | ----------------------- | --------- | ---------------- | ---------------------------------------- |
| CMP-001 | {{name}}       | sk-ui:Badge + animation | A         | SCR-001, SCR-007 | 16_DESIGN/components/CMP-001-{{slug}}.md |
| ...     |                |                         |           |                  |                                          |

> Criterion C (thin sk-ui extensions) does NOT appear here — those become factory tickets listed in §1.2.

---

## §6 Copy Direction

### 6.1 es-MX rules

- {{Bullet list of language rules: tutéo vs ustéo, formal vs informal, technical jargon stance, etc.}}
- Tone anchors: {{from `project-config.md §branding.tone`}}

### 6.2 Reusable label patterns

| Action         | Label es-MX             | Where used                  |
| -------------- | ----------------------- | --------------------------- |
| Save           | `"Guardar"`             | All form submit buttons     |
| Cancel         | `"Cancelar"`            | All dialog/sheet dismiss    |
| Delete         | `"Eliminar"`            | All destructive actions     |
| Loading        | `"Cargando..."`         | All loading states          |
| Empty          | `"Sin resultados"`      | All empty states (default)  |
| Error          | `"Algo salió mal"`      | All generic error fallbacks |
| Confirm delete | `"¿Eliminar {entity}?"` | All confirmation dialogs    |
| ...            | ...                     | ...                         |

### 6.3 i18n preparedness

{{Notes on whether copy is keyed for i18n extraction or hardcoded. Default v1: hardcoded es-MX strings; i18n keys deferred to future `tk-i18n` workflow.}}

---

## §7 Cross-cutting States

### 7.1 Empty state pattern

- **When:** zero items in collection / filter returns 0 results
- **Visual:** `EmptyState` from `sk-ui §5.4` — illustration + headline + secondary text + optional CTA
- **Copy:** `"Aún no hay {entity}"` + CTA `"Crear el primero"` if user can create

### 7.2 Loading state pattern

- **When:** initial fetch in Server Component children / async client transitions
- **Visual:** `Skeleton` mirroring the real layout structure (not generic spinner) per `sk-ui §12.2`
- **Boundary:** `Suspense` at the page/section level

### 7.3 Error state pattern

- **When:** server fetch fails / action returns ActionError
- **Visual:** banner destructive (tokens `--destructive`) + retry button
- **Copy:** `"No se pudo cargar {entity}. Intenta de nuevo en unos segundos."` (generic) or specific from `10_API_SURFACE.md` error_codes

### 7.4 Auth state pattern

- **When:** RBAC mismatch / session expired
- **Behavior:** redirect to `/login` or 403 page (per `04_ARCHITECTURE.md` auth strategy)

---

## §8 Kit-bindings table (NEW v6.2.0)

> Pantallas clasificadas como `kit-pure` en Phase 4 viven aquí — listadas con binding al skill correspondiente. Sustituye SCR files completos para esas pantallas; el archivo SCR-XXX-{slug}.md sigue existiendo como stub ≤5 líneas para preservar contract con `/backlog`.

| SCR-ID  | Slug          | Route               | Tier     | Binding (sk-\*)  | Customizations                             |
| ------- | ------------- | ------------------- | -------- | ---------------- | ------------------------------------------ |
| SCR-001 | login         | /(public)/login     | kit-pure | sk-security      | Solo project-defaults (es-MX, theme, logo) |
| SCR-018 | notifications | /(protected)/notifs | kit-pure | sk-notifications | Solo project-defaults                      |
| ...     | ...           | ...                 | ...      | ...              | ...                                        |

> Si esta tabla está vacía → el classifier no encontró pantallas `kit-pure` en este project. Es válido para projects con `SK_ACTIVE=false` o con UI 100% custom.

---

## §9 Validation Checklist

> Generated from `product-owner` Phase 8 coverage report.

- [ ] Every FT in `03_DEEP_DIVE.md` appears in ≥1 SCR
- [ ] Every persona in `02_PERSONAS.md` has ≥1 SCR
- [ ] RBAC matrix (`05_RBAC_MATRIX.md`) consistent with SCR `roles[]` declarations
- [ ] All actions in `10_API_SURFACE.md` wired in at least one SCR
- [ ] All entities in `09_DATA_MODEL.md` represented in at least one SCR (list or detail)
- [ ] Every `custom`-tier SCR has mobile-first ASCII (375px) — lint enforced in Phase 5 post-batch
- [ ] Every `kit-pure` SCR has stub ≤5 líneas + binding declared
- [ ] Every CMP-XXX passes Detection criterion A or B (C → factory ticket, not local CMP)

---

## §10 Consumer Readiness

| Consumer     | Status                    | Blocking decisions                              |
| ------------ | ------------------------- | ----------------------------------------------- |
| `/backlog`   | ready / partial / blocked | List of `DECISION-DESIGN-XXX` / `SPIKE-XXX` IDs |
| `/implement` | ready / partial / blocked | List of `DECISION-DESIGN-XXX` / `SPIKE-XXX` IDs |

> **Partial-readiness rule:** ALL `partial` / `blocked` rows must have tracking ID adjacent. Pre-CP4 Sweep (Phase 8.6) STOPs if any unmarked.

---

_TimeKast Factory — 16_DESIGN template (one per project, populated by tk-design Phase 2-9, v6.2.0)_
