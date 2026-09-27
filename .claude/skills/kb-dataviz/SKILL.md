---
name: kb-dataviz
description: Dashboards and charts in the TimeKast Starter Kit — the chart-selection matrix, the Recharts defaults the kit's surfaces expect (transparent chart, token-driven strokes, no chart chrome), the KPI card + 2-column stat grid recipe, URL-backed dashboard filters over the kit's table hooks, and the color-blind / WCAG rules for charts. Recharts and TanStack Table ship with the kit, unwrapped. Invoke when building a dashboard, a KPI page, or any screen that renders a chart.
last-verified: 2026-09-22
user-invocable: false
---

# kb-dataviz — Dashboards & Charts

> Stack: Next.js 16+ + React 19 + Tailwind. Kit-shipped libs: **Recharts** (charts), **TanStack Table** (tables), **Framer Motion** (entrance motion). All installed; none wrapped by the kit (`sk-features-index`), so the entry point is the package import. Any other chart library (Visx, Tremor, Ag-Grid, Chart.js) needs a proposal before `pnpm add` (`CODING.md §7`).

---

## 1. Chart selection matrix

Pick the component based on the **data relationship**, not the mockup:

| Goal                           | Use                                    | ❌ Never                   |
| ------------------------------ | -------------------------------------- | -------------------------- |
| Single metric                  | Big number + sparkline + delta %       | Gauges, speedometers       |
| Trend over time                | Line chart / area chart                | Bars (if many data points) |
| Comparison (categorical)       | Horizontal bar chart                   | Pie / donut                |
| Composition (parts of a whole) | Stacked 100% bar / treemap             | 3D pie                     |
| Relationship / distribution    | Scatter plot / bubble chart            | Line chart                 |
| Dense cross-sectional data     | Heatmap (table with conditional color) | Spider / radar charts      |

> **Pie charts:** the human eye cannot estimate angles accurately. Use horizontal bars when you have ≥3 categories.

---

## 2. Recharts defaults in this kit

Default chart configs are noisy and fight the skin. Every chart in a kit surface starts from this shape — transparent background, strokes from the skin's tokens (never a hex), horizontal grid only, no axis lines, no default tooltip chrome:

```tsx
<LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
  <XAxis dataKey="month" tickLine={false} axisLine={false} />
  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}K`} />
  <Tooltip content={<CustomTooltip />} />
  <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={false} />
</LineChart>
```

- Colors come from the skin contract (`sk-skins` §4): `var(--primary)`, `var(--border)`, `var(--muted-foreground)`. A chart that hardcodes a color breaks on the next theme.
- Prefer **direct labels** on the line/bar over a detached legend; round tick labels (`10K`, not `10,000.00`).
- Custom tooltip: date/category + metric + comparison, same number format as the axis, opaque background with AA contrast, anchored to the data point (not the cursor).
- One brand color on the insight; neutral (`--muted-foreground`) for context. If you squint and the brightest element is chrome instead of data, the chart is wrong.

---

## 3. KPI card + stat grid

A KPI card shows **three things**: the number, the context, and the trend.

```tsx
<div className="surface-raised rounded-xl p-6">
  <h3 className="text-muted-foreground text-sm font-medium">Revenue (August)</h3>
  <div className="mt-2 flex items-baseline gap-2">
    <span className="text-foreground text-3xl font-semibold">€613.5k</span>
    <span className="text-success rounded-full px-2 py-0.5 text-sm font-medium">↑ +15.2% YoY</span>
  </div>
  <p className="text-muted-foreground mt-1 text-sm">Target: €660.0k</p>
</div>
```

- [ ] Label (what the metric measures) · the number, formatted · delta vs a comparison (prior period, target)
- [ ] Color semantics via tokens (`text-success` / `text-destructive`), **always paired with ↑/↓** (color-blind)
- [ ] Optional sparkline for trend shape

**Grid (mobile-first, `SK.md §3.2`):** compact stat grids go **2-column from 375px** and expand on desktop — never one card per row for short metrics, which wastes the first viewport on mobile/PWA and pushes real content below the fold.

```tsx
<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
  <StatCard /> <StatCard /> <StatCard /> <StatCard />
</div>
```

| Breakpoint        | Columns |
| ----------------- | ------- |
| Mobile (<640px)   | 2       |
| Desktop (≥1024px) | 4       |

When to diverge: a card whose value or label genuinely needs full width spans to 1-col; 3-up featured cards use `grid-cols-1 md:grid-cols-3`; a single hero card skips the grid.

---

## 4. Dashboard state

| Scope              | Mechanism                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Global filters     | URL query params (`?region=eu&year=2026`) — shareable, bookmarkable                         |
| Micro-interactions | `useState` (hover, toggle chart view)                                                       |
| Initial data       | Server Components + Server Actions — no client-side waterfalls                              |
| Paginated tables   | `useServerTableState` already syncs `?sort=&dir=&page=&limit=` (`sk-ui` §1.5) — reuse it    |

Dashboards get shared ("check this link"): URL-backed filters make the state portable. The kit reads `useSearchParams` directly — no `nuqs`.

---

## 5. Accessibility — non-negotiable

- **Never color alone** to convey meaning — pair with shape, pattern, icon, or label. Avoid red/green-only pairs; diverging scales use blue/orange.
- **Contrast:** text on charts meets AA (4.5:1 body, 3:1 large) — the evidence harness measures it on the live DOM (`fx-visual-evidence`).
- **Focus states** on interactive chart elements (tooltips, filter toggles, legend items).
- **Screen readers:** every chart has `aria-label` or an accessible data-table alternative.
- **Reduced motion:** respect `prefers-reduced-motion` — disable chart entrance animations.

---

## 6. Checklist — before closing a dashboard task

- [ ] Chart type matches the data relationship (§1)
- [ ] Kit defaults applied (§2): transparent chart, token strokes, horizontal grid only, no axis lines, custom tooltip
- [ ] One insight highlighted per chart; the rest is neutral
- [ ] Every KPI card shows number + context + trend, in a 2-column grid on mobile (§3)
- [ ] Filters live in the URL, not in local state (§4)
- [ ] Color paired with shape/label; AA contrast; `aria-label`; reduced motion respected (§5)

---

_Cross-reference: `sk-ui` for the table system and its hooks (`useTableState` / `useServerTableState`), skeletons and responsive recipes. `sk-skins` / `sk-tokens-neomorphism` for the tokens a chart is allowed to use. `kb-visual-direction` for picking the dashboard's visual posture during the design phase._
