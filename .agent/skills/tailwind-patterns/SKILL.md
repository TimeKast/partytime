---
name: tailwind-patterns
description: Tailwind CSS v4 principles. CSS-first configuration, container queries, modern patterns.
allowed-tools: Read, Write, Edit
---

# Tailwind CSS Patterns (v4 - 2025)

> Modern utility-first CSS with CSS-native configuration.

---

## 1. Tailwind v4 vs v3

| v3 (Legacy)          | v4 (Current)                 |
| -------------------- | ---------------------------- |
| `tailwind.config.js` | CSS-based `@theme` directive |
| PostCSS plugin       | Oxide engine (10x faster)    |
| JIT mode             | Native, always-on            |
| Plugin system        | CSS-native features          |

---

## 2. Configuration in CSS

### Theme Definition

```css
@theme {
  /* Colors - semantic names */
  --color-primary: oklch(0.7 0.15 250);
  --color-surface: oklch(0.98 0 0);

  /* Spacing scale */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 2rem;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
}
```

---

## 3. Breakpoint System

| Prefix | Min Width | Target            |
| ------ | --------- | ----------------- |
| (none) | 0px       | Mobile-first base |
| `sm:`  | 640px     | Large phone       |
| `md:`  | 768px     | Tablet            |
| `lg:`  | 1024px    | Laptop            |
| `xl:`  | 1280px    | Desktop           |
| `2xl:` | 1536px    | Large desktop     |

### Mobile-First Principle

1. Write mobile styles first (no prefix)
2. Add larger screen overrides with prefixes
3. Example: `w-full md:w-1/2 lg:w-1/3`

---

## 4. Container Queries (v4 Native)

| Type                         | Responds To          |
| ---------------------------- | -------------------- |
| **Breakpoint** (`md:`)       | Viewport width       |
| **Container** (`@container`) | Parent element width |

### When to Use

| Scenario                   | Use                  |
| -------------------------- | -------------------- |
| Page-level layouts         | Viewport breakpoints |
| Component-level responsive | Container queries    |
| Reusable components        | Container queries    |

---

## 5. Dark Mode

| Method  | Behavior                  | Use When              |
| ------- | ------------------------- | --------------------- |
| `class` | `.dark` class toggles     | Manual theme switcher |
| `media` | Follows system preference | No user control       |

### Pattern

| Element    | Light             | Dark                   |
| ---------- | ----------------- | ---------------------- |
| Background | `bg-white`        | `dark:bg-zinc-900`     |
| Text       | `text-zinc-900`   | `dark:text-zinc-100`   |
| Borders    | `border-zinc-200` | `dark:border-zinc-700` |

---

## 6. Layout Patterns

### Flexbox

| Pattern        | Classes                             |
| -------------- | ----------------------------------- |
| Center (both)  | `flex items-center justify-center`  |
| Vertical stack | `flex flex-col gap-4`               |
| Horizontal row | `flex gap-4`                        |
| Space between  | `flex justify-between items-center` |

### Grid

| Pattern             | Classes                                               |
| ------------------- | ----------------------------------------------------- |
| Auto-fit responsive | `grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))]` |
| Bento/Asymmetric    | `grid grid-cols-3 grid-rows-2` with spans             |
| Sidebar layout      | `grid grid-cols-[auto_1fr]`                           |

> **Prefer Bento/asymmetric layouts over symmetric grids.**

---

## 7. Modern Color System

### OKLCH (Recommended in 2025)

| Format    | Advantage                |
| --------- | ------------------------ |
| **OKLCH** | Perceptually uniform     |
| **HSL**   | Intuitive hue/saturation |
| **RGB**   | Legacy compatibility     |

### Color Token Layers

| Layer         | Example           | Purpose            |
| ------------- | ----------------- | ------------------ |
| **Primitive** | `--blue-500`      | Raw values         |
| **Semantic**  | `--color-primary` | Purpose-based      |
| **Component** | `--button-bg`     | Component-specific |

---

## 8. Anti-Patterns

| Don't                       | Do                       |
| --------------------------- | ------------------------ |
| Arbitrary values everywhere | Use design system scale  |
| `!important`                | Fix specificity properly |
| Inline `style=`             | Use utilities            |
| Duplicate long class lists  | Extract component        |
| Use `@apply` heavily        | Prefer components        |

---

> **Remember:** Tailwind v4 is CSS-first. Embrace CSS variables and native features.
