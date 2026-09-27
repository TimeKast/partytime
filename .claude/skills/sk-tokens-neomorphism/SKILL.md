---
name: sk-tokens-neomorphism
description: Per-token reference for the TimeKast Starter Kit's Neomorphism 2.0 skin — elevation recipes, semantic color tokens, the `.surface-*` utilities (`--elevation-*` from v11; `--neo-*` for pre-v11 legacy apps), 3-theme support (light/dark/midnight), and anti-tokens prohibited in kit code. Invoke when writing styles, extending surfaces, or debugging theme drift. For the full swappable skin system → `sk-skins`.
last-verified: 2026-09-22
user-invocable: false
---

# sk-tokens-neomorphism — TimeKast Kit's Neomorphism 2.0 Skin Tokens

> Tokens SSOT: [`src/app/globals.css`](../../../src/app/globals.css). Tailwind v4 mapping: the `@theme inline` block (same file).
> Related: [`sk-skins`](../sk-skins/SKILL.md) (the full swappable skin system) · [`sk-ui`](../sk-ui/SKILL.md) (components that consume these tokens).

> **Cláusula tolerante:** Esta skill documenta el vocab del skin Neomorphism 2.0.
> Consume el vocab de TU `globals.css`:
> - v11+ (post-SKINS-002): `--elevation-*` / `.surface-*` / `variant="surface"`
> - Pre-v11 (legacy): `--neo-*` / `.neo-*` / `variant="neo"`
>
> Para el sistema completo de skins intercambiables en v11, ver [`sk-skins`](../sk-skins/SKILL.md).

> **Kit-shipped — not portable.** El skin de tokens del kit es Neomorphism 2.0: **shadows define edges, no borders** (todos los `--*-border` son `transparent` por diseño). En un proyecto derivado del TimeKast Starter Kit estos tokens son tu vocabulario obligatorio — valores hardcoded están prohibidos.

---

## 0. Regla de oro

```
✅ OBLIGATORIO: Usar tokens CSS vars + Tailwind aliases + utilities de elevación de TU app
   · v11+:    --elevation-* / .surface-*
   · legacy:  --neo-* / .neo-*
❌ PROHIBIDO: Hex literals, `bg-white`, `bg-gray-*`, `shadow-md/lg`, `border-gray-*`, off-scale px
```

Shadows definen edges → **no agregues `border` a surfaces neumórficas** (rompe el efecto óptico). Si necesitas separación visual usa un tier de shadow distinto (`raised-sm` vs `raised-lg`), no un border.

> **Qué vocab escribir:** consulta cuál ship tu `globals.css`. En código nuevo sobre una app v11+ usa `--elevation-*` / `.surface-*` / `variant="surface"`. La tabla §1 lista ambos vocabularios lado a lado; `--neo-*` aparece marcado como **legacy** solo para que una app anterior a v11 pueda mapear su código existente.

---

## 1. Token Map (CSS vars → Tailwind alias → Usage)

### 1.1 Colores semánticos

Los nombres de color semántico son **idénticos** en v11+ y legacy (el rename solo tocó la familia de elevación). Estos alias no cambian:

| Token CSS              | Tailwind alias            | Usage                                              |
| ---------------------- | ------------------------- | -------------------------------------------------- |
| `--background`         | `bg-background`           | Page background (surface base; mismo que `--card`) |
| `--foreground`         | `text-foreground`         | Body text                                          |
| `--card`               | `bg-card`                 | Card surface (= background, shadow lo separa)      |
| `--card-foreground`    | `text-card-foreground`    | Text sobre card                                    |
| `--primary`            | `bg-primary`              | Brand blue (CTAs)                                  |
| `--primary-foreground` | `text-primary-foreground` | Text sobre primary                                 |
| `--secondary`          | `bg-secondary`            | Surface secundaria                                 |
| `--muted`              | `bg-muted`                | Surfaces pasivas (empty states, disabled)          |
| `--muted-foreground`   | `text-muted-foreground`   | Text de menor énfasis                              |
| `--accent`             | `bg-accent`               | Highlight sutil (hover, selected)                  |
| `--destructive`        | `bg-destructive`          | Errores, delete                                    |
| `--success`            | `bg-success`              | Success states                                     |
| `--error`              | `bg-error`                | Error states                                       |
| `--warning`            | `bg-warning`              | Warning states                                     |
| `--info`               | `bg-info`                 | Info states                                        |
| `--popover`            | `bg-popover`              | Dropdowns, tooltips, popovers                      |
| `--ring`               | `ring-ring` / `focus:`    | Focus ring (accesibilidad)                         |
| `--border`             | `border-border`           | **= `transparent` en todos los temas** (neumo)     |

### 1.2 Surfaces neumórficas (elevation tokens) — v11+ vs. legacy

La familia de elevación es la que renombró el skin system (`--neo-*` → `--elevation-*`). Usa la columna que corresponda a TU app:

| Elevación (rol)              | v11+ var / utility                       | Legacy var / utility (pre-v11)        |
| ---------------------------- | ---------------------------------------- | ------------------------------------- |
| Elevated por defecto         | `--elevation-raised` / `.surface-raised` | `--neo-outset` / `.neo-outset`        |
| Elevación baja               | `--elevation-raised-sm` / `.surface-raised-sm` | `--neo-outset-sm` / `.neo-outset-sm` |
| Elevación alta               | `--elevation-raised-lg` / `.surface-raised-lg` | `--neo-outset-lg` / `.neo-outset-lg` |
| Hover intermedio             | `--elevation-raised-hover` / —           | `--neo-outset-hover` / —              |
| Recessed (inputs)            | `--elevation-inset` / `.surface-inset`   | `--neo-inset` / `.neo-inset`          |
| Recessed pequeño             | `--elevation-inset-sm` / `.surface-inset-sm` | `--neo-inset-sm` / `.neo-inset-sm`   |
| Pressed (active)             | `--elevation-pressed` / `.surface-pressed` | `--neo-pressed` / `.neo-pressed`     |
| Floating overlay             | `--elevation-float` / `.surface-float`   | `--neo-float` / `.neo-float`          |
| Opt-out (sin elevación)      | `--elevation-flat` / `.surface-flat`     | `--neo-flat` / `.neo-flat`            |

> El vocab `--elevation-*` / `.surface-*` es el **vocab v11+**. El `--neo-*` / `.neo-*` es el **vocab legacy (apps anteriores a v11)**: mismas recetas, nombre branded. Para el sistema de skins que produjo el rename, ver [`sk-skins`](../sk-skins/SKILL.md).

### 1.2.1 Elevation system — semantic view

Los tokens de elevación mapean a 7 niveles semánticos. Esta vista te dice **cuál elegir** según el rol del componente (nombres v11+; el equivalente legacy está en §1.2):

| Nivel                 | Significado                | Aplica a                                                | Utility (v11+)                       |
| --------------------- | -------------------------- | ------------------------------------------------------- | ------------------------------------ |
| **Flat**              | Sin superficie (reset)     | Tabla interna dentro de DataTable, resets               | `.surface-flat`                      |
| **Raised (small)**    | Elevación baja interactiva | Buttons idle, icon buttons, filter triggers, paginación | `.surface-raised-sm`                 |
| **Raised (standard)** | Elevación de contenedor    | Cards, sidebar, wrapper de DataTable, BottomNav         | `.surface-raised`                    |
| **Raised (large)**    | Superficie prominente      | Dropdowns, popovers (NO sobre backdrop)                 | `.surface-raised-lg`                 |
| **Overlay**           | Flota sobre backdrop       | Dialogs, sheets                                         | `.surface-float`                     |
| **Sunken (small)**    | Inset / pressed            | Active nav item, botones presionados, toggle tracks     | `.surface-inset-sm` / `.surface-pressed` |
| **Sunken (deep)**     | Totalmente hundido         | Inputs, search fields                                   | `.surface-inset`                     |

**Patrón de interacción:**

- **Hover** sube una superficie un nivel
- **Active / pressed** convierte una surface raised en sunken
- **Containers** permanecen raised; **inputs** permanecen sunken; **overlays** flotan

**4 principios clave:**

1. Hover = subir un nivel; active = press (invertir a sunken)
2. Raised = clickable/container, sunken = input/active, flat = reset
3. Nunca apilar raised-sobre-raised — cancelar elevación interior primero
4. Overlays usan float/drop shadow dedicado, no elevación de container (evita glow borroso sobre backdrops oscuros)

> El composite `.surface-interactive` (legacy: `.neo-interactive`) encadena los 3 estados de un button: `raised-sm` (idle) → `raised` (hover) → `pressed` (active). Úsalo en lugar de stackear las utilities a mano.

### 1.3 Component-scoped tokens

| CSS var prefix        | Usage                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `--sidebar-*`         | Sidebar surface, foreground, active                                                             |
| `--header-*`          | App header                                                                                      |
| `--input-*`           | Form inputs (`bg`, `border`, `focus`)                                                           |
| `--table-*`           | Table header/row/hover/border                                                                   |
| `--badge-{color}-*`   | 7 badge palettes × 3 slots (`bg`/`text`/`dot`) — purple, blue, slate, emerald, red, amber, pink |
| `--showcase-banner-*` | Template showcase banner (removable)                                                            |

### 1.3.1 Sidebar vars × 3 themes

Enumeración del set completo para `--sidebar-*`, redefinido en `:root`, `.midnight` y `.dark` en `globals.css`:

| Variable                      | Light (`:root`) | Midnight (`.midnight`) | Dark (`.dark`) |
| ----------------------------- | --------------- | ---------------------- | -------------- |
| `--sidebar-bg`                | `#d5dae2`       | `#162029`              | `#262629`      |
| `--sidebar-foreground`        | `#334155`       | `#94a3b8`              | `#a1a1aa`      |
| `--sidebar-active`            | `#1e40af`       | `#3b82f6`              | `#60a5fa`      |
| `--sidebar-active-foreground` | `#1e293b`       | `#ffffff`              | `#ffffff`      |
| `--sidebar-border`            | `transparent`   | `transparent`          | `transparent`  |

**Consumo en Tailwind v4:** `bg-(--sidebar-bg)`, `text-(--sidebar-foreground)` (alias dinámico de Tailwind v4: `{util}-(--var)` emite `var(--var)` sin declarar el token en `@theme`).

> Los otros prefijos component-scoped (`--header-*`, `--input-*`, `--table-*`, `--badge-*`) siguen el mismo patrón 3-theme. Para el enum completo, abrir `src/app/globals.css` — este skill no duplica la enumeración exhaustiva (SSOT).

---

## 2. Anti-tokens (prohibidos en kit code)

| Prohibido                               | Por qué                                                              | Alternativa correcta                                               |
| --------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `bg-white` / `bg-black`                 | Rompe 3-theme support; hardcoded                                     | `bg-background` / `bg-card`                                        |
| `bg-gray-{50..900}`                     | No respeta tema; no-neumórfico                                       | `bg-muted` / `bg-secondary` / `bg-accent`                          |
| `text-gray-{50..900}`                   | No respeta tema                                                      | `text-foreground` / `text-muted-foreground`                        |
| `border-gray-*` / `border-{color}-*`    | En neomorphism `--border: transparent` — shadows separan, no borders | Eliminar el border; usar shadow tier                               |
| `shadow-sm/md/lg/xl` (Tailwind default) | No son shadows neumórficas (carecen de highlight)                    | `.surface-raised-sm` / `.surface-raised` / `.surface-raised-lg` / `.surface-float` |
| `#RRGGBB` literal                       | Hardcoded, no-themeable                                              | `var(--token)` o `bg-{semantic}`                                   |
| `rgb(...)` / `rgba(...)` literal        | Igual que hex; salvo opacity ya expresada en token                   | Token existente o extender en `globals.css`                        |
| `p-[17px]` / `w-[173px]` off-scale      | Rompe rhythm; imposible mantener                                     | Scale Tailwind (`p-4`, `w-44`, `gap-6`)                            |
| `!important` para override de tokens    | Señal de que el token no cubre el caso                               | Extender tokens en `globals.css`                                   |
| Inline `style={{ background: '#...' }}` | Bypasea tema                                                         | `className` con alias semántico                                    |
| Editar una primitiva de terceros de `src/components/ui/*` | El criterio es el archivo, no la carpeta (`SK.md §3.3`) — ahí también viven componentes propios del kit | Wrapper en `common/` (para la primitiva de terceros) |

> ℹ️ **Auditoría rápida:** buscar `#` en JSX/CSS (excluyendo fragments/hex en data), o `shadow-md|shadow-lg|bg-white|bg-gray-` en `src/**/*.tsx`. Violations >10 → crear follow-up issue.

---

## 3. Escalas

| Scale          | Valores                                                                                                                                        | Alias Tailwind / Utility                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Radius**     | `--radius: 0.75rem` (12px, kit default) — la escala de Tailwind se mapea al token en `globals.css` (`@theme inline`), anclada en `xl`           | `rounded-xl` **= `var(--radius)`** · `rounded-lg` −4px · `rounded-md` −6px |
| **Spacing**    | Tailwind default (0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24…) + custom `--spacing-10` (2.5rem), `--spacing-50` (12.5rem) para `min-w-10`/`min-h-50` | `p-*`, `m-*`, `gap-*`, `space-*`, `min-w-10`, `min-h-50`                   |
| **Elevation**  | 4 tiers raised + 2 inset + pressed + float + flat                                                                                              | `.surface-raised-sm` → `.surface-raised` → `.surface-raised-lg` → `.surface-float` |
| **Typography** | `--font-sans: var(--font-geist-sans)`, `--font-mono: var(--font-geist-mono)`                                                                   | `font-sans`, `font-mono`                                                   |
| **Transition** | Global `* { transition: bg/shadow/border/color 0.1-0.2s ease }`                                                                                | (aplicado global; no hace falta util)                                      |

> **Mover `--radius` desplaza todo el ladder**, con offsets **fijos en px** (no proporcionales): bajarlo por
> debajo del offset mayor deja los tiers inferiores en negativo y el navegador descarta esa declaración, así
> que `--radius: 0` **no** produce esquinas rectas en todos los tiers. `rounded-full` / `rounded-none` son
> absolutos por definición y quedan **fuera** del mapeo a propósito. Guard: `tests/unit/globals-radius-mapping.test.ts`.

> No agregues valores off-scale. Si el scale no cubre → discute en PR y extiende `globals.css`, no pongas arbitrary values.

---

## 4. Utility classes (kit-shipped)

Definidas en `globals.css` § utility classes. **Todas añaden `border: none`** — shadows definen edges. Nombres v11+; entre paréntesis el equivalente legacy:

| Class (v11+)           | Legacy            | Estado                 | Uso típico                                                                    |
| ---------------------- | ----------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `.surface-raised`      | `.neo-outset`     | Idle elevated          | Cards, modals, section containers                                             |
| `.surface-raised-sm`   | `.neo-outset-sm`  | Idle elevated (small)  | Buttons idle, compact cards                                                   |
| `.surface-raised-lg`   | `.neo-outset-lg`  | Idle elevated (large)  | Hero cards, featured surfaces                                                 |
| `.surface-inset`       | `.neo-inset`      | Recessed               | Inputs, selected tabs, active pills                                           |
| `.surface-inset-sm`    | `.neo-inset-sm`   | Recessed (small)       | Chips, small selected states                                                  |
| `.surface-pressed`     | `.neo-pressed`    | Pressed                | Button `:active`                                                              |
| `.surface-float`       | `.neo-float`      | Floating               | Toast, popover, dropdown                                                      |
| `.surface-flat`        | `.neo-flat`       | No elevation           | Opt-out explícito (e.g., inline ghost btn)                                    |
| `.surface-interactive` | `.neo-interactive`| Idle + hover + active  | Composite para botones — auto-transiciona entre `raised-sm`→`raised`→`pressed`|
| `.surface-focus`       | `.neo-focus`      | Focus-visible (raised) | Agregar a elementos interactivos elevated                                    |
| `.surface-focus-inset` | `.neo-focus-inset`| Focus-visible (inset)  | Agregar a inputs                                                             |
| `.focus-ring`          | `.focus-ring`     | Outline-based focus    | Links, non-neumo elementos                                                   |

**Ejemplo composición correcta (v11+):**

```tsx
<button className="surface-interactive surface-focus rounded-xl bg-primary px-4 py-2 text-primary-foreground">
  Click me
</button>

<input className="surface-inset surface-focus-inset rounded-xl bg-input px-3 py-2 text-foreground" />
```

---

## 5. 3-theme support

| Theme        | Trigger class      | Background base                      | Estrategia de elevación                                              |
| ------------ | ------------------ | ------------------------------------ | -------------------------------------------------------------------- |
| **Light**    | `:root` / `.light` | `#e0e5ec` (warm gray, NO pure white) | Recetas de doble fuente de luz (light beige + dark blue-gray)        |
| **Midnight** | `.midnight`        | `#1a2332` (deep blue)                | Recetas de doble fuente de luz (mid-blue + near-black)               |
| **Dark**     | `.dark`            | `#2d2d32` (charcoal)                 | Recetas de doble fuente de luz (lighter charcoal + near-black)       |

Cada tema redefine el mismo set completo de `--*` vars en `globals.css`. **Tu código siempre escribe alias semánticos** (`bg-background`, `.surface-raised`) — el tema se encarga del resto al cambiar la clase en `<html>`.

> Provider: `next-themes` (ver `src/components/providers/Providers.tsx`). Los 3 temas deben verse correctos para todo componente/página.

---

## 6. Cómo extender el skin

### 6.1 Agregar una nueva surface variant

1. Agrega el shadow CSS var en **los 3 temas** (`:root`, `.midnight`, `.dark`) en `globals.css`, siguiendo el prefijo de TU app (`--elevation-*` en v11+).
2. Agrega la utility class correspondiente (`.surface-*`) en la sección de utilities.
3. Documenta en esta skill (tabla §1.2 + §4).
4. No agregues utilities de un solo uso — si no vas a usarla en 2+ lugares, usa una de las existentes o discute.

### 6.2 Agregar un color semántico nuevo

1. Definir en los 3 temas en `globals.css`: `--brand-accent: #...`
2. Agregar alias Tailwind en `@theme inline`: `--color-brand-accent: var(--brand-accent);`
3. Ya disponible como `bg-brand-accent` / `text-brand-accent`.

### 6.3 Agregar una nueva elevation tier

Nombra con sufijo consistente (`-xs`, `-xl`) siguiendo el patrón `raised-sm` → `raised` → `raised-lg`. Mantén la relación `{offset}px {offset}px {blur}px` proporcional.

> Para crear un **skin nuevo completo** (no extender el de neomorphism) → [`sk-skins`](../sk-skins/SKILL.md) §7.

---

## 7. Anti-patterns kit-específicos

| Anti-pattern                                              | Regla                                                                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Editar `src/components/ui/button.tsx` para cambiar shadow **en un derivado** | Es un fork de una primitiva de terceros: wrapper en `common/`. En el Factory es lo contrario — `button.tsx` ya lleva tokens de skin encima y ajustarlo es mantenimiento del kit (`SK.md §3.3` dice para quién vale cada mitad). |
| `<div style={{ boxShadow: '6px 6px 12px ...' }}>`         | Usar `.surface-raised` (el shadow ya está en token)                                                                         |
| `<Card className="shadow-md">`                            | `shadow-md` no es neumórfico → `className="surface-raised"`                                                                 |
| `bg-gray-100` para hover state                            | `hover:bg-accent` o `.surface-interactive` composite                                                                        |
| `border border-gray-200` para separar cards               | En neumo los cards se separan con shadow, no border. Eliminar el border y usar `gap-*` en el parent o escalón de elevation. |
| Hardcoded `!important` para overrides                     | El token no cubre tu caso → extiende `globals.css`                                                                          |
| Agregar CSS var a un solo tema                            | **SIEMPRE** definir var en los 3 temas, aunque el valor sea idéntico                                                        |

---

## 8. Pointer — dónde vive qué

| Artefacto                              | Path                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **SSOT de tokens CSS**                 | `src/app/globals.css` (3 theme blocks + @theme inline)                                          |
| **Sistema de skins (intercambiable)**  | [`sk-skins`](../sk-skins/SKILL.md) + `src/app/skins/*.css`                                       |
| **Tailwind v4 setup**                  | `postcss.config.mjs` (`@tailwindcss/postcss` plugin) + `@import 'tailwindcss'` en `globals.css` |
| **Config sources (Tailwind scan)**     | `@source '../../src/config'` en `globals.css`                                                   |
| **Utility classes de elevación**       | `src/app/globals.css` § utility classes                                                         |
| **Theme provider / switcher**          | `next-themes` via `src/components/providers/Providers.tsx`                                      |
| **Primitivas de terceros**             | `src/components/ui/*` — clasifica el ARCHIVO antes de editar; `ui/` también contiene componentes propios del kit (`SK.md §3.3`) |
| **Consumer downstream (presentación)** | `fx-presentation-kit` es un snapshot FROZEN autónomo — ya NO deriva de estos tokens (v11)        |

> [!NOTE]
> **`fx-presentation-kit` es un snapshot autónomo congelado (no deriva de estos tokens).**
> Desde v11 su `theme.css` es un snapshot estático en vocab neomorphism (`--neo-*`),
> desacoplado de `globals.css`: el generador `generate:presentation-theme` y su drift-check de
> `lint-staged` fueron retirados. No hay nada que regenerar ni un generador que mantener.
> Cualquier marcador `@pk-theme` residual en `globals.css` es inerte (el split de skins lo
> retira al mover los theme blocks a `src/app/skins/`).

---

Cross-reference: [`sk-skins`](../sk-skins/SKILL.md) — full swappable skin system (contract, swap mechanism, Tailwind v4 CSS-first config). [`sk-ui`](../sk-ui/SKILL.md) — components que consumen estos tokens.
