# Design System Guide — Neomorphism Skin

> This guide documents the **Neomorphism 2.0** skin specifically — a soft, tactile visual language where shadow defines edges instead of borders. It describes **one** skin the kit can ship, **not** the unconditional design system of every derived app: a v11+ app can run a different active skin (e.g. `fintech`, which uses real borders and a flat elevation model — the opposite of neomorphism), in which case these rules do **not** apply as-is. Check the callout below before applying anything here.

---

## Does this guide apply to your app?

The kit's look is set by **one active skin** ([`sk-skins §1`](../skills/sk-skins/SKILL.md)). Which vocab you write against — and whether this neomorphism guide applies at all — depends on your app. Find your row first:

| Your app                                                                                                             | Applies?     | Vocab / where to look                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **v11+, active skin is _not_ neomorphism** — has `src/config/skins.ts` with a non-neo `ACTIVE_SKIN` (e.g. `fintech`) | ❌ Not as-is | A non-neo skin has real borders, `card ≠ background`, and a flat elevation model. Read your active skin's `src/app/skins/<name>.css` + [`sk-skins`](../skills/sk-skins/SKILL.md); this guide is neomorphism-only |
| **v11+, active skin _is_ neomorphism** — `ACTIVE_SKIN = 'neomorphism'`                                               | ✅ Yes       | `--elevation-*` / `.surface-*` (the vocab used throughout this guide)                                                                                                                            |
| **Legacy, pre-v11** — no `src/config/skins.ts`; neomorphism is inlined in `globals.css`                             | ✅ Yes       | `--neo-*` / `.neo-*` (same recipes, branded names)                                                                                                                                              |

> This guide does **not** assume your `src/` has `src/config/skins.ts`. If you're unsure which row is yours: `src/config/skins.ts` **present** → read `ACTIVE_SKIN` (top two rows); **absent** → you're a legacy app (bottom row), and the branded `--neo-*` vocab still works. For the per-token reference across both vocabs → [`sk-tokens-neomorphism`](../skills/sk-tokens-neomorphism/SKILL.md).

---

## 1. Core Concept

In neomorphism, surfaces "push out" (raised) or "push in" (inset) from the background. There are no visible borders — everything is defined by light and shadow.

**Key principle:** `--border: transparent` across all themes. Components never use `border` for visual edges.

---

## 2. Elevation Shadow Tokens

All shadows are CSS custom properties in `src/app/globals.css` (or the active skin file under `src/app/skins/`) and adapt automatically per theme.

Neomorphism elevation comes in five families, from a subtle lift to a deep sunken well:

| Family      | Role                                                     | v11 token base        |
| ----------- | -------------------------------------------------------- | --------------------- |
| **Raised**  | Lifted surface — containers, buttons (`-sm` / `-lg` / `-hover` variants) | `--elevation-raised*` |
| **Inset**   | Recessed well — inputs (`-sm` variant)                   | `--elevation-inset*`  |
| **Pressed** | Deeply sunken — active/pressed state                     | `--elevation-pressed` |
| **Float**   | Overlay above a backdrop — dialogs, dropdowns, popovers  | `--elevation-float`   |
| **Flat**    | No shadow — disabled, opt-out                            | `--elevation-flat`    |

> **Authoritative per-token reference** — the complete token set and the v11 ↔ legacy `--neo-*` mapping ([`sk-tokens-neomorphism §1.2`](../skills/sk-tokens-neomorphism/SKILL.md)), plus the 7-level semantic elevation view — which tier to pick per component role — in [`§1.2.1`](../skills/sk-tokens-neomorphism/SKILL.md). Exact px recipes live in `src/app/globals.css` (the SSOT). This guide keeps only the orienting summary above.

### How They're Built

Each token composes two per-theme sub-values — light/shadow primitives **private** to the neomorphism skin (`--neo-light` / `--neo-dark`) — into a dual shadow: dark bottom-right, light top-left.

```css
--elevation-raised-sm: 3px 3px 6px var(--neo-dark), -3px -3px 6px var(--neo-light);
```

The exact per-theme `--neo-light` / `--neo-dark` values live in `src/app/globals.css` (the SSOT) — see [`sk-tokens-neomorphism`](../skills/sk-tokens-neomorphism/SKILL.md) for the full breakdown.

---

## 3. Utility Classes

Use these CSS classes directly in your components. All classes automatically set `border: none`.

> Note: the class names below are v11 (`.surface-*`). If your app is pre-v11, use the legacy `.neo-*` classes — the full class mapping (`.surface-raised` ↔ the legacy name, etc.) is in `sk-tokens-neomorphism §4`.

### Base Classes

| Class (v11)            | Maps to                   | When to use                  |
| ---------------------- | ------------------------- | ---------------------------- |
| `surface-raised`       | `--elevation-raised`      | Containers, cards            |
| `surface-raised-sm`    | `--elevation-raised-sm`   | Buttons, small cards, tags   |
| `surface-raised-lg`    | `--elevation-raised-lg`   | Hero sections, large cards   |
| `surface-raised-hover` | `--elevation-raised-hover`| Button hover state           |
| `surface-inset-sm`     | `--elevation-inset-sm`    | Inputs, switches, checkboxes |
| `surface-inset`        | `--elevation-inset`       | Focus states for inputs      |
| `surface-pressed`      | `--elevation-pressed`     | Active/pressed button state  |
| `surface-float`        | `--elevation-float`       | Modals, dropdowns, popovers  |
| `surface-flat`         | `none`                    | Disabled states              |

### Composite Classes

| Class (v11)           | Behavior                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `surface-interactive` | `raised-sm` → hover:`raised` → active:`pressed`                                                  |
| `surface-focus`       | Adds ring + raised-sm on focus-visible _(currently unused — manual focus classes used instead)_ |
| `surface-focus-inset` | Adds ring + inset on focus-visible _(currently unused)_                                          |

---

## 4. Decision Table: Which Shadow to Use

> Names below are v11 (`.surface-*`); the legacy equivalent is `.neo-*` (see [`sk-tokens-neomorphism §4`](../skills/sk-tokens-neomorphism/SKILL.md)).

```
Is it a container/surface?
├── Yes → surface-raised (card, section)
│         surface-raised-sm (small card, tag)
│
Is it an input/control that receives data?
├── Yes → surface-inset-sm (resting)
│         surface-inset (focused)
│
Is it a button/interactive element?
├── Yes → surface-raised-sm (resting)
│         surface-raised (hover)
│         surface-pressed (active)
│
Is it an overlay/floating panel?
├── Yes → surface-float (dialog, dropdown, popover)
│
Is it disabled?
└── Yes → surface-flat
```

---

## 5. Color Architecture

Semantic color tokens group into base (`--background`, `--foreground`), surfaces (`--card`, `--sidebar-*`, `--header-*`), brand (`--primary`, `--secondary`, `--accent`), status (`--success` / `--error` / `--warning` / `--info`), inputs, and tables. Always write the semantic alias (`bg-card`, `text-foreground`), never a raw value.

> **Authoritative token map** — every semantic color token with its Tailwind alias and usage — is in [`sk-tokens-neomorphism §1.1`](../skills/sk-tokens-neomorphism/SKILL.md) (semantic colors) and `§1.3` (component-scoped `--sidebar-*` / `--header-*` / `--input-*` / `--table-*` / `--badge-*`). This guide keeps only the summary above.

### Principle: Card = Background

In neomorphism, `--card` must be the **same color** as `--background`. The card's "edge" is visible only through shadow, not a color difference.

```css
--background: #e0e5ec;
--card: #e0e5ec; /* Same! */
```

---

## 6. Theming

The neomorphism skin ships 3 themes. **Which** themes an app offers is set per-skin: v11+ apps declare them in `src/config/skins.ts` (`SKINS[name].themes`, consumed by the provider + toggle — [`sk-skins §1`](../skills/sk-skins/SKILL.md)); legacy apps keep the theme blocks inline in `globals.css`.

| Theme    | Selector          | Background            |
| -------- | ----------------- | --------------------- |
| Light    | `:root`, `.light` | `#e0e5ec` (warm gray) |
| Dark     | `.dark`           | `#2d2d32` (charcoal)  |
| Midnight | `.midnight`       | `#1a2332` (navy)      |

> **Authoritative 3-theme reference** — background bases, per-theme elevation strategy, and the full `--*` set each theme redefines — is in [`sk-tokens-neomorphism §5`](../skills/sk-tokens-neomorphism/SKILL.md).

### Creating a Custom Theme

Add a CSS block under your theme selector — inline in `globals.css` (legacy) or in the active skin file under `src/app/skins/` (v11) — defining all token categories (base, surfaces, brand, status, elevation). The elevation shadows adapt once you set the skin's private `--neo-light` / `--neo-dark` primitives. Full step-by-step — including registering the theme in `src/config/skins.ts` for v11 apps, and authoring a whole new skin — is in [`sk-tokens-neomorphism §6`](../skills/sk-tokens-neomorphism/SKILL.md) and [`sk-skins §7`](../skills/sk-skins/SKILL.md).

### Legacy Shadow Compatibility

The theme-scoped `--shadow-sm/md/lg` vars are **dead/legacy** — the standard Tailwind `shadow-md` utility inlines its own default and never reads them ([`sk-skins §6`](../skills/sk-skins/SKILL.md)). Use `.surface-*` for real skin elevation.

---

## 7. Component Patterns

### How Components Use the System

> Surface names below are v11 (`.surface-*`); the legacy equivalent is `.neo-*` (see [`sk-tokens-neomorphism §4`](../skills/sk-tokens-neomorphism/SKILL.md)).

| Component Type   | Resting              | Hover              | Active                       | Focus                  |
| ---------------- | -------------------- | ------------------ | ---------------------------- | ---------------------- |
| **Button**       | `surface-raised-sm`  | `surface-raised`   | `surface-pressed`            | ring                   |
| **Card**         | `surface-raised`     | —                  | —                            | —                      |
| **Input**        | `surface-inset-sm`   | —                  | —                            | `surface-inset` + ring |
| **FormSelect**   | `surface-inset-sm`   | —                  | —                            | `surface-inset` + ring |
| **Dialog**       | `surface-float`      | —                  | —                            | —                      |
| **Dropdown**     | `surface-float`      | —                  | —                            | —                      |
| **Tab (active)** | `surface-inset-sm`   | —                  | —                            | —                      |
| **Switch**       | `surface-inset-sm`   | —                  | —                            | ring                   |
| **Checkbox**     | `surface-inset`      | —                  | `surface-raised-sm` (checked)| —                      |
| **Badge**        | `--badge-*` tokens   | —                  | —                            | —                      |
| **Pagination**   | `surface-raised-sm`  | `surface-inset-sm` | `surface-inset`              | —                      |
| **Disabled**     | `surface-flat`       | —                  | —                            | —                      |

### Rules

1. **Never use `border` for visual edges** — use shadow
2. **Never hardcode shadow values** — use elevation tokens
3. **`border: transparent`** is the default (set by utility classes)
4. **Containers raised, inputs inset** — the fundamental pattern
5. **Float for overlays** — dialogs, dropdowns, popovers stand above
6. **Use Tailwind arbitrary values** for CSS custom properties: `bg-(--table-row-bg)`, `text-(--table-header-foreground)` — never `style={{}}`

---

_TimeKast Factory — Design System Guide_

---

## 8. Known Exceptions

Some contexts legitimately require patterns that differ from the rules above:

| Context                             | Why                                  | Example                                                    |
| ----------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| Layout shells (`Sidebar`, `Header`) | Tokens not in `@theme inline`        | `style={{ backgroundColor: 'var(--sidebar-bg)' }}`         |
| Tiny notification badges (8-10px)   | Elevation tokens produce oversized shadows | `shadow-sm` is acceptable                            |
| Safe area insets                    | No Tailwind equivalent               | `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}` |

---

## See Also

- [`sk-ui`](../skills/sk-ui/SKILL.md) — Kit-shipped UI primitives (tables, forms, dialogs)
- [`sk-crud-scaffold`](../skills/sk-crud-scaffold/SKILL.md) — Gold standard CRUD orchestrator
- [`sk-ui`](../skills/sk-ui/SKILL.md) §11 — Responsive layout recipes
- [`sk-skins`](../skills/sk-skins/SKILL.md) — Swappable skin system (token contract + swap mechanism)
- [`sk-tokens-neomorphism`](../skills/sk-tokens-neomorphism/SKILL.md) — Tokens + theming ref (incl. legacy `--neo-*`)
