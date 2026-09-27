---
id: SCR-{{NNN}}
slug: {{kebab-case-slug}}
route: {{/(public)/... | /(protected)/...}}
layout: {{DashboardShell | PublicShell | ModalShell | none}}
roles: [{{role-id-1}}, {{role-id-2}}]
features: [FT-{{XX}}]
personas: [PER-{{YYY}}]
packets: [15_IMPLEMENTATION_PACKETS/FT-{{XX}}.md]
tier: custom
# --- Provenance (OPTIONAL — day-2 only; OMIT entirely on greenfield SCRs) ---
# Emitted by `/design add <plan>` to leave a durable audit trail. A greenfield SCR
# WITHOUT these fields is fully valid. Tier rules live in `methodology/day2-classification.md`
# (SSOT — do NOT duplicate here). Field reference: `methodology/screen-contract-shape.md`.
source_tier: {{kit-pure | kit-extended | custom}} # tier the day-2 classifier elected
plan_source: {{path/to/plan.md#anchor (hash: sha-12)}} # plan path + section anchor + sha-12 of plan at emission
day2_action: {{nueva | regenerar | backfill}} # enum — exactly one of these 3 values
revisions: [] # append-only: each regen ADDS one entry, never rewrites
---

# SCR-{{NNN}} — {{Screen name}}

> Per-screen UI contract. Consumed by `/backlog` and `/implement`. Mobile-first invariant — §3 ASCII at 375px is REQUIRED.

## 1. Purpose & JTBD

{{1-2 sentences. The user problem this screen solves, anchored to the primary persona's JTBD from `02_PERSONAS.md`. Avoid restating the feature name — explain WHY the screen exists.}}

## 2. Route & Access

- **URL:** `{{/(protected)/entity}}`
- **Layout:** `{{DashboardShell}}` (`sk-ui §6.1`) — or `none` if standalone modal/sheet
- **Breadcrumb:** `"{{breadcrumb label}}"` (via `BreadcrumbSetter` per `sk-ui §3.2`)
- **RBAC:** `{{roles}}` (per `05_RBAC_MATRIX.md`)
- **Auth:** {{required | optional | public}}
- **Feature flag:** {{none | flag-name from `14_DOMAIN_REGISTRY_LOCKS §FF`}}

## 3. Layout — Mobile-first 375px (REQUIRED)

```
┌─ Mobile 375px ───────────────────────────────┐
│ {{Header — describe in 1-2 lines}}           │
├──────────────────────────────────────────────┤
│ ┌─ {{Section 1}} ──────────────────────────┐ │
│ │ {{contents}}                             │ │
│ └──────────────────────────────────────────┘ │
│ ┌─ {{Section 2}} ──────────────────────────┐ │
│ │ {{contents}}                             │ │
│ └──────────────────────────────────────────┘ │
│ {{… more sections}}                          │
│                                              │
│ [BottomNav (if applicable)]                  │
└──────────────────────────────────────────────┘
```

> **Lint:** orchestrator post-Phase-5 parses this section and rejects the file if missing the `375px` keyword or no ASCII box drawing characters detected. Re-spawn `dsg-screen-specer-full` for that single SCR with corrective feedback. Max 2 re-spawn attempts.

## 4. Layout — Desktop ≥lg (only if meaningfully diverges)

If desktop is mobile + sidebar visible + minor grid expansion (no layout shift) → write a single line: **"Desktop = mobile + sidebar visible + {{grid delta}}"**. Don't emit ASCII unless the layout actually changes (grid columns, hidden mobile sections shown, repositioned elements).

```
{{ASCII desktop ONLY if meaningfully diverges. If not, delete this code block and use the prose line above.}}
```

## 5. SK Components Used (binding explícito)

| Slot                   | Component                                      | Source                                   | Props clave                                           |
| ---------------------- | ---------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Shell                  | `{{DashboardShell}}`                           | `sk-ui §6.1`                             | —                                                     |
| {{Header section}}     | `{{Header / PageTitle}}`                       | `sk-ui §3.2 / custom`                    | `title`, `subtitle`                                   |
| {{KPIs section}}       | `{{StatCard}}` grid                            | `kb-dataviz §3`                             | one `<StatCard>` per metric: label · value · delta   |
| {{Chart section}}      | `{{AreaChart}}` (Recharts)                     | `kb-dataviz §2`                        | `data={...}` from `{{action}}` in `10_API_SURFACE.md` |
| {{Table section}}      | `DataTable` + `TableSearch` + `TableFilterBar` | `sk-ui §1.1+`                            | columns = see §7                                      |
| {{Form section}}       | `Form` + `FormField` × N                       | `sk-ui §2.1+`                            | Zod schema from `10_API_SURFACE.md §X.Y input`        |
| {{Status badge}}       | `Badge` with variants                          | `sk-ui §5.1`                             | variant: `success / warn / destructive / info`        |
| {{BottomNav (mobile)}} | `BottomNav`                                    | `sk-navigation §2`                       | items from `src/config/navigation.ts`                 |
| {{Custom}}             | `{{CMP-XXX}}`                                  | `16_DESIGN/components/CMP-XXX-{slug}.md` | per CMP file                                          |

## 6. Data wiring

- **Server data (RSC fetch):** `{{actionName}}` from `10_API_SURFACE.md §X.Y`. Returns `{{shape}}`. Cache strategy: `{{revalidate on /api/X mutations | static | dynamic}}`.
- **Client actions (forms, buttons):** `{{actionName}}` from `10_API_SURFACE.md §X.Y`. Returns `ActionResult<T>`.
- **Optimistic UI:** {{N/A | useOptimistic on X — describe}}
- **URL state (filters, pagination):** keyed in `?{{filter}}`, `?{{cursor}}`, etc. — per `sk-ui §12.1 URL state`.

## 7. Table columns (if applicable)

| Col         | Type     | Source field           | Visible mobile | Sort | Format                       |
| ----------- | -------- | ---------------------- | -------------- | ---- | ---------------------------- |
| {{Col 1}}   | date     | `{{entity}}.{{field}}` | ✓              | ✓    | `DD/MM/YY`                   |
| {{Col 2}}   | text     | `{{entity}}.{{field}}` | ✓              | —    | `truncate sm:max-w-50`       |
| {{Col 3}}   | currency | `{{entity}}.{{field}}` | ✓              | ✓    | `{{MXN ###,###.##}}`         |
| {{Col 4}}   | badge    | `{{entity}}.{{field}}` | hidden <sm     | —    | Badge per §5                 |
| {{Actions}} | actions  | (computed)             | ✓              | —    | `[…] dropdown / inline btns` |

## 8. Filters (if applicable)

- **Search:** `{{field}}` (`TableSearch` from `sk-ui §1.3`)
- **Filter A:** `{{field}}` (`TableFilter` — **cascading per `sk-ui §1.5`** — opciones derivadas del dataset filtrado por los OTROS filtros, no hardcoded)
- **Filter B:** `{{field}}` (cascading)

> **Anti-pattern explícito:** NO hardcodear opciones estáticas de filtro cuando hay 2+ filtros. Cada filtro calcula opciones del subconjunto filtrado por los otros — kit default (SK.md §3.1).

## 9. States catálogo

| Estado       | Trigger                            | Visual                                                       | Copy es-MX                                                                   |
| ------------ | ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Loading      | Initial fetch / async pending      | `Skeleton` mirror del layout (`sk-ui §12.2`)                    | —                                                                            |
| Empty        | 0 `{{entity}}` en periodo / filtro | `EmptyState` (`sk-ui §5.4`) + ilustración + CTA `{{action}}` | `"Aún no hay {{entity}} para este {{periodo/filtro}}."`                      |
| Error        | Fetch fails / action rejects       | Banner destructivo + retry button                            | `"No se pudieron cargar los {{entity}}. Intenta de nuevo en unos segundos."` |
| Unauthorized | RBAC mismatch                      | Redirect a `/(protected)/` o 403 page                        | —                                                                            |
| {{Specific}} | {{trigger}}                        | {{visual}}                                                   | {{copy es-MX}}                                                               |

> Reusable patterns from `16_DESIGN.md §7 Cross-cutting States`. This section EXTENDS shared vocab, doesn't reinvent.

## 10. Interaction details

- {{Action 1}}: Tap `{{element}}` → navega a SCR-XXX
- {{Action 2}}: Click row → SCR-YYY (modal `Sheet` mobile / `Dialog` desktop per `sk-ui §4.2+4.3`)
- {{Action 3}}: `+` BottomNav → SCR-ZZZ (nuevo)
- Keyboard: {{shortcuts if any — Cmd+K search, etc.}}
- Pull-to-refresh: enabled via `PullToRefreshShell` (`sk-pull-to-refresh §1` — kit default)

## 11. Copy (es-MX inventario de esta pantalla)

| Key                          | Texto es-MX                 |
| ---------------------------- | --------------------------- |
| `{{screen}}.title`           | `"{{title}}"`               |
| `{{screen}}.subtitle`        | `"{{subtitle}}"` (if any)   |
| `{{screen}}.kpi.{{name}}`    | `"{{label}}"`               |
| `{{screen}}.cta.primary`     | `"{{label}}"`               |
| `{{screen}}.table.empty`     | `"{{empty copy}}"`          |
| `{{screen}}.filter.{{name}}` | `"{{label}}"`               |
| `{{screen}}.dialog.confirm`  | `"¿{{action}} {{entity}}?"` |
| ...                          | ...                         |

> Default reusable patterns (`"Guardar"`, `"Cancelar"`, `"Eliminar"`) come from `16_DESIGN.md §6.2` — don't duplicate them here unless this screen overrides the default.

## 12. Responsive notes

- **375px (mobile baseline):** {{describe key reductions — stats 2-col, table cols hide X/Y, etc.}}
- **≥sm (640px):** {{deltas — table shows all cols, etc.}}
- **≥md (768px):** {{deltas}}
- **≥lg (1024px):** {{deltas — sidebar visible, BottomNav hidden, grid expands to N cols}}
- **Touch targets:** min 44×44px per WCAG 2.5.5

## 13. Refs

- **Features:** FT-XX (from `03_DEEP_DIVE.md`)
- **Personas:** PER-XXX (from `02_PERSONAS.md`)
- **Acceptance scenarios:** AC-XX.Y (from `06_ACCEPTANCE_SCENARIOS.md` — Gherkin)
- **Entities:** ENT-{{name}} (from `09_DATA_MODEL.md`)
- **Server actions:** `{{actionName}}` (from `10_API_SURFACE.md §X.Y`)
- **RBAC:** `{{role × entity × action}}` cells in `05_RBAC_MATRIX.md`
- **Packet:** `15_IMPLEMENTATION_PACKETS/FT-XX.md`
- **Used in flows:** FLW-XXX, FLW-YYY (from `16_DESIGN/flows/`)
- **Custom components:** CMP-XXX (from `16_DESIGN/components/`)

---

_TimeKast Factory — tk-design template · SCR-{{NNN}} (per-screen contract)_
