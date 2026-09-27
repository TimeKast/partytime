# Component Extension Policy — CMP-Detection

> When does Phase 5 emit a `CMP-XXX.md`, and when does it route differently? Strict gating to avoid CMP inflation + fork-of-the-kit anti-pattern.

---

## 1. Decision tree

```
Is the component needed in the SCR composable from existing sk-ui primitives + Tailwind classes alone?
├─ YES → document inline in SCR §5 "SK Components Used" as composition. Cero CMP emit.
└─ NO  → continue.

Does the component appear in INVENTORY.md (already built in code, project-specific)?
├─ YES → reference it in SCR §5 with INVENTORY ref. Cero CMP emit.
└─ NO  → continue.

Apply criterion A / B / C in order:
├─ A passes → emit CMP-XXX.md  (local extension, lives in 16_DESIGN/components/)
├─ B passes → emit CMP-XXX.md  (single-screen complex widget)
└─ C passes → raise factory ticket to extend sk-ui kit. NO local CMP emit.
```

## 2. Criteria

### 2.1 Criterion A — Reusable prop API across ≥2 screens

**Pass if:**

- The component has an explicit prop interface (TypeScript signature).
- Used in `≥2 SCR-XXX` (orchestrator detects from Phase 4 batch outputs).
- Not a thin variant of an existing `sk-ui` primitive (that's criterion C).

**Examples:**

- `<EntityHeader>` showing avatar + name + status pill + actions — used on detail pages of 3+ entities.
- `<CurrencyInput>` with prefix, decimals control, validation — used in 4+ forms.
- `<MapPicker>` for location selection — used in 2 SCRs (vendor address + delivery address).

**Examples that DON'T pass A:**

- A specific `<Card>` layout used only on Dashboard — that's composition (in SCR §5).
- A `<Badge>` variant with custom color — that's thin extension (criterion C → factory ticket).

### 2.2 Criterion B — Complex single-screen widget with implementation risk

**Pass if:**

- Used in exactly 1 SCR.
- Has implementation risk: custom animation, state machine, integration with web API (camera, geolocation, WebSocket), hardware-accelerated rendering, etc.
- `/implement` would benefit from having the spec separate from the SCR (otherwise the SCR file becomes unreadable).

**Examples:**

- `<DragDropFileUploader>` with progress + retry + drag/drop visuals — only on Upload screen.
- `<RealTimeNotificationStream>` with WebSocket connection management — only on Inbox screen.
- `<InteractiveDashboardCanvas>` with d3 visualizations and pan/zoom — only on Analytics screen.

**Examples that DON'T pass B:**

- A form with 8 fields — that's just `<Form>` + `<FormField>` × N (in SCR §5).
- A list of 50 items with infinite scroll — that's `<DataTable>` with `useServerTableState` (in SCR §5).

### 2.3 Criterion C — Thin extension of sk-ui primitive

**Pass if:**

- The component extends a single `sk-ui` primitive by adding 1-2 props or a single variant.
- Used (or would be used) in ≥2 contexts.
- The extension is small enough that it should belong **to the kit**, not duplicated per project.

**Action:** raise a **factory ticket** proposing the variant be added to `sk-ui`. **Do NOT emit a local `CMP-XXX.md`.**

**Shape del ticket → la convención canónica, no una propia.** El formato de un factory-ticket
(H1, bloque de encabezado con `Estado` y el hueco `GitHub issue`, las cuatro secciones, el naming
`{type}-{YYYY-MM-DD}-{slug}-{NNN}.md` bajo `project/factory/`) vive en
[`fx-factory-tickets §4`](../../fx-factory-tickets/SKILL.md) — **fuente única**. Esta sección no lo
reenuncia; sólo dice **qué llenar** cuando el ticket sale por este criterio:

- `## What was attempted`: qué SCRs necesitan la variante y por qué el primitivo del kit no la cubre.
- `## Suggested Factory improvement`: la API de props propuesta y el tratamiento visual.
- `## Why it failed / why it's a gap`: por qué pertenece al kit y no a un `CMP-XXX` local
  (reusable entre proyectos).

**Cuándo se escribe el archivo — el orquestador surfacea, el usuario emite.** Phase 6 no emite nada:
sólo **acumula** la propuesta como una línea de `16_DESIGN.md §1.2 Extension proposals` (§1.2 la sigue
listando, se emita o no — es el registro de diseño). Al cierre del run, `tk-design §20.1.2` presenta las
propuestas acumuladas y el usuario elige **cuáles** se escriben como `ui-extension` bajo `project/factory/`;
la línea de §1.2 de cada propuesta emitida se anota con el path de su ticket.

> 🔴 **Se confirma, no se automatiza — y headless NO emite.** El disparo es de **juicio** (*"la extensión
> es lo bastante chica como para pertenecer al kit"*), y `fx-factory-tickets §5` reserva la emisión
> automática a las condiciones verificables sin criterio humano. Sin usuario que confirme, las propuestas
> se quedan listadas en §1.2 y el run lo declara en una línea. El tipo `ui-extension` está declarado en
> esa misma tabla de `fx-factory-tickets §5`, no aquí.

**Examples:**

- `<Badge>` + `pulse` animation prop → propuesta: extender `sk-ui:Badge` con la variante `animation="pulse"`.
- `<Button>` + `loading` state slot for spinner → propuesta: extender `sk-ui:Button` con la prop `loading`.
- `<Tabs>` + scrollable horizontal overflow → propuesta: extender `sk-ui:Tabs` con la variante scrollable.

> El **título** del ticket no se inventa aquí: el H1 canónico es `# Factory Ticket — ui-extension`, y el
> issue entregado toma su título de ese H1 más el nombre del archivo (`fx-factory-cli`). La propuesta de
> arriba es lo que se escribe en el cuerpo y en la línea de `16_DESIGN.md §1.2`.

**Why criterion C exists:** without it, every project that needs `<Badge>` + animation duplicates the extension locally. Multiplied across projects, the kit fragments. Routing to the kit keeps `sk-ui` evolving as the single source of truth.

## 3. Edge cases

### 3.1 "Used in 2 screens but they're variations of the same SCR (e.g., new/edit modes)"

Treat new and edit modes of the same entity as the **same SCR family** for criterion-A counting purposes. If component is only used in `SCR-001-nuevo-X` + `SCR-002-editar-X` → composition in both SCRs (NOT CMP). Criterion A counts 2+ distinct SCRs (different entities or contexts).

### 3.2 "Component starts as criterion B (single screen) but later spreads to 2 screens"

In a subsequent `/design` run, orchestrator detects the second usage → re-classify as criterion A. `CMP-XXX.md` already exists; update its `used_in:` frontmatter and `§9 Used in` section. ID stays sticky.

### 3.3 "Component is thin sk-ui extension AND complex (e.g., new animation library required)"

Criterion C wins (route to kit). If the kit ticket gets rejected ("we don't want this in the kit"), then re-classify as criterion B and emit local `CMP-XXX.md`.

### 3.4 "Component IS in INVENTORY.md but its API is now insufficient for the new SCR"

This is a refactor request, not a CMP emission. Flag in `16_DESIGN.md §9 Consumer Readiness` as a downstream concern (issue for `/backlog` to track). Don't emit `CMP-XXX.md` that shadows the INVENTORY entry.

## 4. CMP frontmatter validation

Every emitted `CMP-XXX.md` MUST have:

```yaml
---
id: CMP-001 # Sticky ID — assigned by orchestrator
slug: kebab-case-slug # Locked at first emission
based_on: sk-ui:Badge # Or sk-ui:internal-scroll (a §11 recipe), or from-scratch
detection_criterion: A # A or B only — never C (C → factory ticket)
used_in: [SCR-XXX, SCR-YYY] # At least 1 (criterion B) or ≥2 (criterion A)
---
```

Phase 7 `ui-critic` lint catches:

- Detection criterion = C in a CMP file (should not exist).
- `used_in: []` empty (file has no consumer).
- `based_on:` referencing a non-existent `sk-ui` slot.

## 5. CMP count budget (soft target, not hard cap)

A typical `/design` run for a kit-derived project emits **0-5 CMPs**. Counts >10 suggest:

- (a) The project genuinely needs custom UI primitives (acceptable — flag for `ui-critic` to confirm not over-engineering).
- (b) The orchestrator is over-detecting CMPs that should be SCR-level compositions.
- (c) Many extensions are thin (criterion C) that should be kit tickets, not local CMPs.

`ui-critic` Phase 7 audits the CMP list and may flag (c) cases for re-classification.

---

_TimeKast Factory — tk-design methodology · Component Extension Policy_
