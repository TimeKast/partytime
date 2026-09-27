# Screen Contract Shape — Anatomy of `SCR-XXX.md`

> Three shapes per `tier` (post-v6.2.0). Phase 4 classifier elects the shape; Phase 5 specer emits it. Companion templates: `SCR.template.{stub,light,md}` in `templates/`.
>
> | Tier           | Shape     | Sections                                                    | Specer route                      |
> | -------------- | --------- | ----------------------------------------------------------- | --------------------------------- |
> | `kit-pure`     | **Stub**  | 3 lines body + frontmatter                                  | Orchestrator direct (no agent)    |
> | `kit-extended` | **Light** | 5 (Purpose / Route / Customizations / States deltas / Refs) | `dsg-screen-specer-light` batches |
> | `custom`       | **Full**  | 13 (Purpose..Refs — this document)                          | `dsg-screen-specer-full` batches  |

---

## Tier election rule (Phase 4 classifier)

> Single source of truth for which shape gets emitted per SCR. The classifier in `tk-design/SKILL.md §Phase 4` applies this rule against `07_SK_LEVERAGE.md` + packets.

**Step 1 — gather signals per SCR:**

- Sub-features breakdown from `07_SK_LEVERAGE.md`: count of `Configure` / `Extend` / `Build` rows referenced by the SCR's mapped FTs.
- `layout_impact: bool` from each FT's packet (or fallback heuristic for legacy packets).
- Per-screen customizations from `00_DISCOVERY_BRIEF.md §11.2` + packet `Edge` field (NOT project-level defaults like es-MX, theme, branding).

**Step 2 — apply tier rules in order:**

1. If **any** mapped FT has `layout_impact: true` → tier `custom`.
2. If **any** Build row referenced → tier `custom`.
3. If **majority Extend** (Extend count > Configure count) → tier `custom`.
4. If **some Extend** with per-screen customizations (without layout impact) → tier `kit-extended`.
5. If **100% Configure** + cero per-screen customizations (only project-level defaults) → tier `kit-pure`.
6. **Borderline default-conservative:** any ambiguity between extended/custom → tier `custom` (R-NEW-2: fail-toward-custom, not toward-extended).

**Project-level defaults excluded from customization count:**

- es-MX copy (locale default del proyecto).
- Theme/branding tokens (apply to every page).
- Logo override (applies via theme provider, not per-screen).

**Per-screen customizations COUNT:**

- Layout reshape (panel lateral, wizard multi-step, split view).
- Flow divergence (OTP/MFA/biometric vs magic-link-only).
- Data presentation custom (chart variant, table column logic).
- Role-specific divergence within the same screen.
- State deltas vs `16_DESIGN.md §7 Cross-cutting States`.

---

## Stub shape (tier `kit-pure`)

Total file: ≤5 lines body + frontmatter. Emitted directly by orchestrator (no specer spawn).

```markdown
---
id: SCR-001
slug: login
route: /(public)/login
tier: kit-pure
binding: sk-security
features: [FT-S01]
---

# SCR-001 — Login

Pantalla shipped por `sk-security`. Customization: solo defaults del proyecto (es-MX, theme, branding global).

**Ver:** `.claude/skills/sk-security/SKILL.md` · refs: FT-S01
```

**Lint:** Phase 5 post-batch integrity check verifies stub files are ≤7 lines total (frontmatter + body). Stubs with more content → classifier mis-elected tier; flag for re-classify.

---

## Light shape (tier `kit-extended`)

5 sections. Template: `templates/SCR.template.light.md`. Specer: `dsg-screen-specer-light`.

| #   | Section                       | Purpose                                                         |
| --- | ----------------------------- | --------------------------------------------------------------- |
| 1   | Purpose & JTBD                | Por qué la extensión existe sobre el shipped del kit            |
| 2   | Route & Access                | URL + layout + RBAC + auth (idéntico a full)                    |
| 3   | Customizations vs kit default | Tabla de TODO lo que cambia vs `sk-{skill}` baseline            |
| 4   | States deltas (vs §7)         | Solo estados nuevos. Standard states viven en `16_DESIGN.md §7` |
| 5   | Refs                          | Cross-links upstream + kit binding                              |

**Anti-patterns for light shape:**

- ❌ Emitir ASCII wireframe → si requiere layout custom, debió ser tier `custom`.
- ❌ Copy table completa → es-MX defaults vienen del kit; light spec solo lista overrides.
- ❌ States catálogo full → reescritura del shared §7 catalog.

Si el specer-light se encuentra con un SCR que NO entra en este shape (necesita ASCII o copy table completa) → return error `tier-mismatch: should be custom`, no force-fit.

---

## Full shape (tier `custom`)

13 sections — documented in §1..§13 below. Template: `templates/SCR.template.md`. Specer: `dsg-screen-specer-full`.

---

## 0. File header (frontmatter)

```yaml
---
id: SCR-001 # Sticky ID — never reused once tombstoned
slug: dashboard # Locked at first emission
route: /(protected)/ # Per sk-project-structure URL convention
layout: DashboardShell # sk-ui §6.1 (or PublicShell / ModalShell / none)
roles: [admin, staff] # Must subset roles in 05_RBAC_MATRIX
features: [FT-01] # Must exist in 03_DEEP_DIVE
personas: [PER-001, PER-002] # Must exist in 02_PERSONAS
packets: [15_IMPLEMENTATION_PACKETS/FT-01.md] # Per-FT handoff packet ref
---
```

Frontmatter lint (Phase 8.6 sweep):

- `id` matches filename SCR-XXX prefix.
- `slug` matches filename slug suffix.
- `route` syntactically valid (`/(public)/...` or `/(protected)/...`).
- `roles`, `features`, `personas` all reference existing IDs in discovery.

---

## 0.1 Provenance (OPTIONAL — day-2 audit trail)

> Applies to all three tiers (stub / light / full). These four frontmatter fields are emitted **only** by `/design add <plan>` (the day-2 mode) to leave a durable audit trail of where an SCR came from. **They are optional.** A greenfield SCR (one emitted by the fresh discovery-sourced flow) carries **none** of them and remains 100% valid — see Back-compat below.

| Field         | Type                | Meaning                                                                                                        |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `source_tier` | enum                | The tier the day-2 classifier elected for this SCR (`kit-pure` / `kit-extended` / `custom`). Mirrors `tier`.   |
| `plan_source` | `path#anchor (hash)`| The originating plan: file path + section anchor + a `sha-12` hash of the plan **at the moment of emission**.  |
| `day2_action` | enum                | The action that produced this SCR — exactly one of **`nueva` / `regenerar` / `backfill`**.                     |
| `revisions`   | array (append-only) | History of regenerations. Starts `[]`; each regen **appends** one entry. Never rewritten — see below.          |

**`day2_action` valid values (exactly these three):**

- `nueva` — a brand-new screen, no prior code/spec; the SCR is fully prescriptive.
- `regenerar` — the screen already had code + an SCR; the plan reshapes part of it (same sticky ID).
- `backfill` — the screen exists in code but had no spec; the SCR reverse-engineers the as-built, then layers the plan delta.

> A value outside this enum is invalid. There is no automatic validation in v1 — this list is the contract. (Tier election + the `(action, tier)` matrix are NOT redefined here; they live in `day2-classification.md`.)

**`plan_source` shape:** `project/reports/<plan>.md#<section-anchor> (hash: <sha-12>)`. The `sha-12` is a 12-char prefix of the plan's content hash, sealed at emission. It is intentionally a point-in-time stamp: if the plan is later edited, the hash goes stale (drift detection of the plan itself is out of scope here).

**`revisions` is append-only.** Each regeneration **adds** a new entry (timestamp + one-line change summary); it never overwrites or replaces existing entries. Two regenerations of the same SCR therefore accumulate two entries. Rewriting the array in place silently loses the audit history — there is no technical enforcement in v1, so this convention is the only barrier. Entry shape (illustrative):

```yaml
revisions:
  - { at: 2026-06-13, action: regenerar, summary: 'agrega columna estado a la tabla' }
  - { at: 2026-06-20, action: regenerar, summary: 'convierte lista en dashboard con 3 gráficas' }
```

**Tier rules are NOT documented here.** Which tier (and which action) a day-2 SCR gets is decided by the classifier — single source of truth is [`day2-classification.md`](./day2-classification.md) (the action matrix + tier signals + regen conserve/raise/lower rules). This section documents the **fields**; that file owns the **rules**. Do not duplicate the rules here.

**`imp-issue-executor` does NOT change.** The implementer reads each SCR by its `tier` (`kit-pure` / `kit-extended` / `custom`) to decide handling — that election is already agnostic of whether the SCR came from greenfield or day-2. Provenance fields are inert to the executor: it ignores `source_tier` / `plan_source` / `day2_action` / `revisions`. No executor change is required by their presence or absence.

**Back-compat (critical).** These fields are **purely additive and optional**:

- A greenfield SCR with **none** of the four fields validates exactly as before — the Phase 8.6 frontmatter sweep above only asserts `id` / `slug` / `route` / `roles` / `features` / `personas`, none of which are touched.
- No validator, no specer, and no `imp-issue-executor` path treats the absence of provenance as an error or warning.
- Therefore any SCR authored before this addition (or any greenfield SCR going forward) remains valid with zero edits.

---

## 1. Purpose & JTBD

1-2 sentences. The user problem this screen solves, anchored to a JTBD from `02_PERSONAS.md`.

**Good:**

> Permite al admin revisar movimientos del mes y detectar desviaciones por sucursal en menos de 30 segundos. Resuelve el JTBD "verificar salud financiera operativa" de PER-001 (Director comercial).

**Bad (vague):**

> Esta pantalla muestra información del dashboard.

The Purpose section answers "why does this screen exist" — never "what's on it" (that's §3 + §5).

---

## 2. Route & Access

Static metadata block:

- **URL:** the concrete route path. If the kit URL convention applies (`/(protected)/{entity}/{nuevo,[id],[id]/editar}` per `sk-project-structure`), use it. Deviations require `architect` Phase 8 approval.
- **Layout:** shell wrapper (`DashboardShell` from `sk-ui §6.1`, `PublicShell`, `ModalShell`, or `none` for standalone).
- **Breadcrumb:** the label shown in `BreadcrumbSetter` (`sk-ui §3.2`).
- **RBAC:** roles allowed (subset of frontmatter `roles`).
- **Auth:** required / optional / public.
- **Feature flag:** flag name from `14_DOMAIN_REGISTRY_LOCKS` if behind a flag.

---

## 3. Layout — Mobile-first 375px (REQUIRED)

ASCII layout at iPhone SE baseline (375px). See `methodology/wireframe-conventions.md` for the full grammar.

This section is mandatory for `custom`-tier SCRs. The orchestrator's post-Phase-5 lint rejects the file if missing. Cero excepciones for `custom`, even for "desktop-only by design" screens — emit a viable mobile fallback ASCII with explicit note. (`kit-extended` light spec has no ASCII; `kit-pure` stub has no ASCII.)

The ASCII shows the **happy path data state** (with realistic placeholder content). Empty/loading/error states have their own catalog in §9.

Annotations inside the ASCII may reference component sources (`← StatCard (kb-dataviz §3)`). The canonical component-to-region mapping lives in §5.

---

## 4. Layout — Desktop ≥lg (only when meaningfully diverges)

Three options:

1. **Trivial divergence** (mobile + sidebar visible + minor grid expansion): write a single prose line.

   > Desktop = mobile + sidebar (240px left) + stats grid expands to 4-col + table shows all cols

2. **Substantive divergence** (different layout structure, repositioned elements, hidden-on-mobile sections shown): emit a full Desktop ASCII.

3. **No divergence beyond responsive Tailwind classes**: skip section. The §3 mobile ASCII + §12 Responsive notes cover it.

Decision rule: if you can describe the desktop layout in 1 sentence as deltas from mobile → prose line. Otherwise → ASCII.

---

## 5. SK Components Used (binding explícito)

Table with explicit component bindings. Each row maps a region of the screen to a specific component source.

| Slot     | Component                   | Source            | Props clave                                     |
| -------- | --------------------------- | ----------------- | ----------------------------------------------- |
| Shell    | `DashboardShell`            | `sk-ui §6.1`      | —                                               |
| KPIs row | `StatCard` grid             | `kb-dataviz §3`      | one `<StatCard>` per metric: label · value · delta |
| Chart    | `<AreaChart>` (Recharts)    | `kb-dataviz §2` | `data={...}` from `getDashboardStats` (10 §3.2) |
| Table    | `DataTable` + `TableSearch` | `sk-ui §1.1+1.3`  | columns = see §7                                |
| ...      | ...                         | ...               | ...                                             |

Rules:

- Every row cites a source — either `sk-ui §X.Y` for kit-shipped primitives and recipes, or `CMP-XXX` for extensions emitted in Phase 6.
- Cero placeholder `{{?}}` allowed. If unsure of the right component → leave a `TODO: orchestrator pick` and flag in the agent return summary; orchestrator resolves before emitting the final file.

Why explicit binding matters:

- `/implement` reads this section first to know which kit hooks/imports to use.
- Phase 8 `ui-critic` audits DS2 (component reuse): a hardcoded inline component when `sk-ui` ships an equivalent = FAIL.

---

## 6. Data wiring

Three sub-sections:

- **Server data (RSC fetch):** action name + return shape + cache strategy.
- **Client actions (forms, buttons):** action name + return shape (`ActionResult<T>`).
- **Optimistic UI:** `useOptimistic` patterns if any, or N/A.
- **URL state:** `?filter`, `?cursor`, etc. with reference to `sk-ui §12.1 URL state`.

All action references must exist in `10_API_SURFACE.md`. The agent reads the registry to validate.

---

## 7. Table columns (if applicable)

If the screen has a `DataTable`, list its columns:

| Col      | Type     | Source field             | Visible mobile | Sort | Format                 |
| -------- | -------- | ------------------------ | -------------- | ---- | ---------------------- |
| Fecha    | date     | `movimiento.created_at`  | ✓              | ✓    | `DD/MM/YY`             |
| Concepto | text     | `movimiento.descripcion` | ✓              | —    | `truncate sm:max-w-50` |
| Monto    | currency | `movimiento.monto`       | ✓              | ✓    | `MXN ###,###.##`       |
| Estado   | badge    | `movimiento.status`      | hidden <sm     | —    | Badge per §5           |
| Actions  | actions  | (computed)               | ✓              | —    | `[...]` dropdown       |

Rules:

- Every source field must exist in `09_DATA_MODEL.md`.
- "Visible mobile" = ✓ if shown at 375px; "hidden <sm" if hidden at mobile and shown at sm+.
- Format spec must be concrete (no `???` placeholders).

If the screen has no table → omit this section.

---

## 8. Filters (if applicable)

If the screen has 2+ filters → **cascading by default** per `sk-ui §1.5` (cascading filters). Anti-pattern: hardcoded static options when 2+ filters present.

Format:

- **Search:** `{field}` (`TableSearch` from `sk-ui §1.3`)
- **Filter A:** `{field}` (`TableFilter` — cascading)
- **Filter B:** `{field}` (cascading)

Document the cascade direction (which filter constrains which) only if non-obvious from filter names.

If 0-1 filters → no cascading needed; section can be simpler. If 2+ filters but cascading explicitly NOT desired (rare) → flag with explicit note + DECISION-DESIGN-XXX.

---

## 9. States catálogo

Per-screen states. Extends the shared §7 Cross-cutting States in `16_DESIGN.md` — does NOT reinvent.

Required rows: Loading, Empty, Error. Auth state if applicable.

| Estado       | Trigger                      | Visual                                                             | Copy es-MX                                                   |
| ------------ | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Loading      | Initial fetch                | `Skeleton` mirror of layout (`sk-ui §12.2`)                           | —                                                            |
| Empty        | 0 movimientos en periodo     | `EmptyState` (`sk-ui §5.4`) + ilustración + CTA "Registrar primer" | `"Aún no hay movimientos para este periodo."`                |
| Error        | Fetch fails / action rejects | Banner destructivo + retry                                         | `"No se pudieron cargar los movimientos. Intenta de nuevo."` |
| Unauthorized | RBAC mismatch                | Redirect a `/(protected)/`                                         | —                                                            |

Screen-specific states (e.g., "user has no payment method yet", "feature locked behind plan"): add additional rows with explicit triggers.

---

## 10. Interaction details

Bullet list of interactions:

- Tap KPI card → navega a SCR-002 (Reportes)
- Click row → SCR-003 (Detalle Movimiento, modal Sheet mobile / Dialog desktop)
- `+` BottomNav → SCR-004 (Nuevo Movimiento)
- Keyboard: Cmd+K opens search palette
- Pull-to-refresh: enabled via shell-wide `PullToRefreshShell` (`sk-pull-to-refresh §1`)

Single-screen flows (one entry → one exit) live here. Multi-screen flows have their own `FLW-XXX.md` file.

---

## 11. Copy (es-MX inventario de esta pantalla)

Key/value table of literal es-MX strings used in this screen. Keys follow convention `{screen}.{section}.{element}`.

| Key                      | Texto es-MX                                   |
| ------------------------ | --------------------------------------------- |
| `dashboard.title`        | `"Inicio"`                                    |
| `dashboard.subtitle`     | `"Resumen de tu actividad del mes"`           |
| `dashboard.kpi.saldo`    | `"Saldo total"`                               |
| `dashboard.kpi.delta_up` | `"↑ {n}% vs mes pasado"`                      |
| `dashboard.table.empty`  | `"Aún no hay movimientos para este periodo."` |
| `dashboard.cta.create`   | `"Registrar movimiento"`                      |

Rules:

- ≥1 row required (cero placeholders).
- Reuse the canonical patterns from `16_DESIGN.md §6.2` (e.g., `"Guardar"`, `"Cancelar"`, `"Eliminar"`) by reference, NOT by duplication.
- If this screen overrides a canonical pattern → explicit override row with rationale comment.

---

## 12. Responsive notes

Bullet list of behavior per breakpoint:

- **375px (mobile baseline):** stats 2-col, table cols hide `estado`, BottomNav visible.
- **≥sm (640px):** table shows all cols.
- **≥md (768px):** stats 3-col.
- **≥lg (1024px):** sidebar visible, BottomNav hidden, stats 4-col.
- **Touch targets:** min 44×44px per WCAG 2.5.5.

Tablet-specific layouts (rare): document here as prose, not as ASCII.

---

## 13. Refs

Cross-link to upstream artifacts. Every reference must resolve (Phase 8.6 sweep catches dangling refs).

- **Features:** FT-XX (from `03_DEEP_DIVE.md`)
- **Personas:** PER-XXX (from `02_PERSONAS.md`)
- **Acceptance scenarios:** AC-XX.Y (from `06_ACCEPTANCE_SCENARIOS.md`)
- **Entities:** ENT-{name} (from `09_DATA_MODEL.md`)
- **Server actions:** `actionName` (from `10_API_SURFACE.md §X.Y`)
- **RBAC:** role × entity × action cells (from `05_RBAC_MATRIX.md`)
- **Packet:** `15_IMPLEMENTATION_PACKETS/FT-XX.md`
- **Used in flows:** FLW-XXX (from `16_DESIGN/flows/`)
- **Custom components:** CMP-XXX (from `16_DESIGN/components/`)

These refs are what make the SCR self-contained for `/backlog` and `/implement` — they can open this one file and have pointers to every relevant upstream concern.

---

## 14. Optional appendable sections (post-v1, NOT in v1 emission)

Reserved naming convention for future appendable sections (NOT emitted in v1, just documented for future hookability):

- `## 14. Cloud Render` — would be appended by future `tk-design-cloud` skill with PNG/Figma render links.
- `## 15. Storybook entry` — would be appended by future `tk-design-storybook` skill.

v1 of `tk-design` does NOT emit these. SCR files emitted by v1 end at §13 Refs.

---

_TimeKast Factory — tk-design methodology · Screen Contract Shape_
