# SCR Classifier Fixtures

> Worked examples for the Phase 4 SCR classifier. Each fixture documents:
>
> - **Input:** packet excerpts + 07_SK_LEVERAGE row(s) + customization signals.
> - **Expected output:** tier + justification.
> - **Edge case category:** what makes this fixture useful for catching regressions.
>
> **Companion harness:** `scripts/tools/verify-scr-classifier.ts` runs the classifier (pure function) over these fixtures + asserts `actual == expected`. Correr con `pnpm test:scr-classifier`.
>
> **Two fixture sets:** (1) the **greenfield tier** fixtures below validate `screen-contract-shape.md §Tier election rule` (tier is asserted in greenfield — driven by `07_SK_LEVERAGE`). (2) the **day-2 action matrix** fixtures (§Day-2 action matrix fixtures) validate the deterministic action cells from `day2-classification.md §Action matrix` (`nueva` / `regenerar` / `backfill`). Day-2 **tier is NOT asserted** — it is judgment (fail-toward-custom), documented in `day2-classification.md §Worked examples`.
>
> **Election rule lives in:** `screen-contract-shape.md §Tier election rule` (greenfield tier); `day2-classification.md §Action matrix` (day-2 action). Fixtures aquí los VALIDAN, no los redefinen.

---

## Fixture 1 — Pure kit-shipped (login magic-link only)

**Input:**

```yaml
scr_id: SCR-001
slug: login
features: [FT-S01]

# From 07_SK_LEVERAGE.md
sk_leverage_rows:
  - feature: FT-S01
    sub_feature: NextAuth credentials provider
    action: Configure
    effort: S

# From 15_IMPLEMENTATION_PACKETS/FT-S01.md
layout_impact: false

# From discovery
per_screen_customizations: []
project_defaults_applied: [es-MX copy, neomorphism theme, TimeKast logo]
```

**Expected tier:** `kit-pure`

**Justification:** 100% Configure + cero per-screen customizations. Solo project-level defaults aplicados via theme provider. Stub ≤5 líneas con binding `sk-security`.

**Edge case category:** baseline canonical kit-shipped case. Sirve como anchor para asegurar que el classifier NO promueve a tier mayor cuando solo hay project-defaults.

---

## Fixture 2 — Kit-extended (mi-perfil con campo custom)

**Input:**

```yaml
scr_id: SCR-019
slug: mi-perfil
features: [FT-S01]

sk_leverage_rows:
  - feature: FT-S01
    sub_feature: ProfileForm component (sk-security)
    action: Configure
    effort: S
  - feature: FT-S01
    sub_feature: Custom field employee_id
    action: Extend
    effort: S

layout_impact: false

per_screen_customizations:
  - 'Campo employee_id agregado al ProfileForm'
  - 'Validation Zod custom para format RFC mexicano'
project_defaults_applied: [es-MX copy, neomorphism theme]
```

**Expected tier:** `kit-extended`

**Justification:** 1 Configure + 1 Extend (no majority Extend). Per-screen customizations existen (employee_id + RFC validation) pero NO impactan layout. Light spec con sección Customizations + States deltas si aplica.

**Edge case category:** caso típico de Tier S feature con field custom. Sirve para validar que el classifier distingue Extend de Configure cuando hay 1 sub-feature de cada uno.

---

## Fixture 3 — Custom por layout_impact declarativo

**Input:**

```yaml
scr_id: SCR-022
slug: queries-proscai-editor
features: [FT-M02]

sk_leverage_rows:
  - feature: FT-M02
    sub_feature: saved_queries CRUD via withAuth helpers
    action: Configure
    effort: S
  - feature: FT-M02
    sub_feature: SQL editor with syntax highlighting
    action: Build
    effort: M

layout_impact: true # ← declarativo upstream

per_screen_customizations:
  - 'SQL editor con CodeMirror (no kit primitive)'
  - 'Split view: editor superior + preview inferior'
project_defaults_applied: [es-MX, theme]
```

**Expected tier:** `custom`

**Justification:** `layout_impact: true` declarativo → force tier `custom` regardless of Configure/Extend breakdown. Además hay 1 Build sub-feature (regla tier rule #2 también aplica). Full spec con ASCII 375px.

**Edge case category:** valida que el field declarativo `layout_impact: true` corta la decisión sin necesidad de heurística. Crítico para B-NEW-2 fix.

---

## Fixture 4 — Custom por fallback heuristic con default-conservative

**Input:**

```yaml
scr_id: SCR-005
slug: ventas-dashboard
features: [FT-M11]

sk_leverage_rows:
  - feature: FT-M11
    sub_feature: DataTable con filtros cascada
    action: Configure
    effort: S
  - feature: FT-M11
    sub_feature: Recharts AreaChart custom
    action: Extend
    effort: M

# Packet legacy pre-fix — sin layout_impact field
layout_impact: null

per_screen_customizations:
  - 'Chart Recharts con tooltip custom'
  - 'Filtros cascada por temporada + sucursal'

# Heuristic keyword detection
packet_keywords_detected: ['dashboard', 'chart', 'tooltip']
```

**Expected tier:** `custom`

**Justification:** Packet legacy sin `layout_impact` field. Fallback: keyword `chart` + `dashboard` + `tooltip` detectados. Default-conservative aplica → tier `custom` (no extended). Full spec emitido.

**Edge case category:** valida backwards-compat para packets pre-fix + asimetría del fallback (fail-toward-custom). Crítico para que la migración legacy NO produzca falsos negativos silenciosos.

---

## Fixture 5 — False-positive keyword "tabla" en CRUD generic (NO promueve)

**Input:**

```yaml
scr_id: SCR-007
slug: usuarios-list
features: [FT-S05]

sk_leverage_rows:
  - feature: FT-S05
    sub_feature: DataTable con paginación
    action: Configure
    effort: S
  - feature: FT-S05
    sub_feature: Action `inviteUser` via withAuth
    action: Configure
    effort: S

layout_impact: false # ← declarativo upstream OK

per_screen_customizations: []

# Heuristic: keyword "tabla" en descripción
packet_keywords_detected: ['tabla', 'DataTable']
```

**Expected tier:** `kit-pure`

**Justification:** Aunque keyword `tabla` apareció en heuristic scan, `layout_impact: false` es declarativo. Field declarativo gana sobre heuristic. 100% Configure + cero per-screen customizations → `kit-pure`.

**Edge case category:** valida que el field declarativo PRIVENE el falso positivo del keyword scan. Crítico para R-NEW-2 — evita inflar el tier por matches espurios.

---

## Fixture 6 — Boundary case: kit-pure vs kit-extended (notifications)

**Input:**

```yaml
scr_id: SCR-018
slug: notifications-panel
features: [FT-S03]

sk_leverage_rows:
  - feature: FT-S03
    sub_feature: NotificationPanel component (sk-notifications)
    action: Configure
    effort: S
  - feature: FT-S03
    sub_feature: Custom categories `cron-alerts` + `sync-failures`
    action: Extend
    effort: S

layout_impact: false

per_screen_customizations:
  - 'Categories custom (cron-alerts, sync-failures) declaradas en src/config/notifications.ts'
project_defaults_applied: [es-MX, theme]
```

**Expected tier:** `kit-extended`

**Justification:** Categories custom NO son project-default (no aplican a toda página) — son per-screen customization de cómo NotificationPanel filtra y muestra. Pero NO impactan layout. Light spec.

**Boundary clarification:** si la única diferencia fuera que el proyecto declara categories en `notifications.ts` y el panel las consume automáticamente (sin override visual) → seguiría siendo `kit-pure` porque la "customization" es config global del proyecto, no del panel mismo. Aquí la diferencia se manifiesta visualmente (badges con labels custom) → `kit-extended`.

**Edge case category:** valida la frontera fina entre "config del proyecto" (kit-pure) y "customization que toca esta pantalla" (kit-extended).

---

## Fixture 7 — Tier custom por majority Extend (FT-L04 admin matrix)

**Input:**

```yaml
scr_id: SCR-025
slug: permisos-matrix
features: [FT-L04]

sk_leverage_rows:
  - feature: FT-L04
    sub_feature: DataTable con paginación
    action: Configure
    effort: S
  - feature: FT-L04
    sub_feature: Matrix view custom (role × dashboard × scope)
    action: Extend
    effort: M
  - feature: FT-L04
    sub_feature: Bulk assignment UI
    action: Extend
    effort: M

layout_impact: true # admin matrix es layout custom

per_screen_customizations:
  - 'Matrix view 3D (role × dashboard × scope)'
  - 'Bulk assignment con checkboxes per-row'
```

**Expected tier:** `custom`

**Justification:** Majority Extend (2 Extend vs 1 Configure) + `layout_impact: true`. Doble señal para tier `custom`. Full spec con ASCII.

**Edge case category:** caso clásico de admin tooling que NO es pure kit (requiere matrix view). Valida regla tier #3 (majority Extend).

---

## Fixture 8 — Tier custom por Build (FT-L01 Proscai MySQL connection)

**Input:**

```yaml
scr_id: SCR-020
slug: sincronizacion-config
features: [FT-L01, FT-M01]

sk_leverage_rows:
  - feature: FT-L01
    sub_feature: MySQL2 connection pool (no kit precedent)
    action: Build
    effort: L
  - feature: FT-M01
    sub_feature: HistoryTable de sync runs
    action: Extend
    effort: M

layout_impact: false # solo es admin form + table

per_screen_customizations:
  - 'Form de configuración connection pool (host/port/SSL)'
  - 'HistoryTable con badges custom para sync status'
```

**Expected tier:** `custom`

**Justification:** Build sub-feature presente (FT-L01 no tiene precedent en kit) → tier `custom` por regla #2. Full spec aunque `layout_impact: false`.

**Edge case category:** valida que un Build single sub-feature force tier `custom` independiente de layout_impact.

---

## Coverage matrix

| Fixture | Tier rule trigger                            | Default-conservative bridge | layout_impact field |
| ------- | -------------------------------------------- | --------------------------- | ------------------- |
| 1       | Rule 5 (100% Configure + cero custom)        | —                           | `false`             |
| 2       | Rule 4 (some Extend + per-screen custom)     | —                           | `false`             |
| 3       | Rule 1 (layout_impact true) + Rule 2 (Build) | —                           | `true`              |
| 4       | Rule 6 (heuristic default-conservative)      | ✓                           | `null` (legacy)     |
| 5       | Rule 5 (declarative beats heuristic)         | —                           | `false`             |
| 6       | Rule 4 (boundary: per-screen vs config)      | —                           | `false`             |
| 7       | Rule 1 + Rule 3 (majority Extend)            | —                           | `true`              |
| 8       | Rule 2 (Build single sub-feature)            | —                           | `false`             |

**Total fixtures:** 8. **Rules covered:** 1, 2, 3, 4, 5, 6 — all six rules from `screen-contract-shape.md §Tier election rule`. **Legacy bridge covered:** 1 (Fixture 4).

---

## Day-2 action matrix fixtures (deterministic cells)

> These validate the **day-2 action matrix** (`day2-classification.md §Action matrix`), NOT tier. Two boolean axes per screen — **¿existe en código?** (`as_built` is a real `page.tsx` vs `new`) × **¿tiene SCR?** (a covering SCR exists by route/slug) — map deterministically to `nueva` / `regenerar` / `backfill`. The harness (`verify-scr-classifier.ts`) asserts these 4 cells. **Tier is NOT asserted** in day-2 (judgment, fail-toward-custom — lives in `day2-classification.md §Worked examples`).

### Day-2 Fixture 1 — New page, no SCR → `nueva`

**Input:**

```yaml
exists_in_code: false # plan adds page.tsx (as_built: new)
has_scr: false
```

**Expected action:** `nueva`

**Matrix cell:** `code:no × scr:no` — brand-new screen, no spec. Highest-value proactive design.

### Day-2 Fixture 2 — New page, covering SCR exists (stale/orphan) → `nueva`

**Input:**

```yaml
exists_in_code: false # new page file
has_scr: true # an SCR already covers the route (designed first, code lagged)
```

**Expected action:** `nueva`

**Matrix cell:** `code:no × scr:yes` — still `nueva` (genuinely new to code). Phase 3-delta updates the existing row in place (sticky ID), no new ID minted — action drives spec depth, reconcile drives ID assignment.

### Day-2 Fixture 3 — Exists in code + has SCR → `regenerar`

**Input:**

```yaml
exists_in_code: true # as_built page.tsx on disk
has_scr: true # covering SCR present
```

**Expected action:** `regenerar`

**Matrix cell:** `code:yes × scr:yes` — re-emit the spec, same SCR ID + audit trail. Tier conserved (raise auto, lower only with CP3 override — judgment, not asserted).

### Day-2 Fixture 4 — Exists in code, no SCR → `backfill`

**Input:**

```yaml
exists_in_code: true # as_built page.tsx on disk
has_scr: false # no spec
```

**Expected action:** `backfill`

**Matrix cell:** `code:yes × scr:no` — reverse-engineer an as-built SCR, then layer the plan's delta. As-built block is descriptive; prescriptive value is the delta.

### Day-2 action coverage matrix

| Day-2 Fixture | `exists_in_code` | `has_scr` | Expected action |
| ------------- | ---------------- | --------- | --------------- |
| 1             | `false`          | `false`   | `nueva`         |
| 2             | `false`          | `true`    | `nueva`         |
| 3             | `true`           | `true`    | `regenerar`     |
| 4             | `true`           | `false`   | `backfill`      |

**Total day-2 action fixtures:** 4 — all 4 cells of the action matrix. Tier is excluded by design (judgment → worked examples in `day2-classification.md`).

---

## Adding new fixtures

When a real-run produces an unexpected tier classification:

1. Capture the inputs verbatim (packet excerpts + `07_SK_LEVERAGE` row + customizations list).
2. Document the expected tier per current rules.
3. If the classifier got it WRONG → fix rules in `screen-contract-shape.md §Tier election rule` first, then add fixture for regression.
4. If the classifier got it RIGHT but the rule was non-obvious → add fixture as documentation of the corner case.

Fixtures should grow over time. Goal: every classifier behavior change in production is preceded by a fixture update.

---

_TimeKast Factory — tk-design methodology · SCR Classifier Fixtures_
