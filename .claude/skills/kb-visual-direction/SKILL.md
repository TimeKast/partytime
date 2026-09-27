---
name: kb-visual-direction
description: Documentation-phase skill that picks the visual language for a product before implementation — produces inputs for `16_DESIGN.md`, not code. Defines skin family, surface system, typography posture, iconography treatment, motion profile, and aesthetic stance. Route here during `/design`, `/discovery`, or proposal work when the product lacks identity or the UI feels generic. Not auto-loaded during coding.
last-verified: 2026-09-22
user-invocable: false
---

# Visual Direction — Documentation Phase

> **Phase:** Discovery / Design — produces content for `project/planning/16_DESIGN.md`.
> **Not a coding skill.** This skill decides the visual language; `kb-design-engineering` + `sk-skins` + `sk-ui` implement it.
> **Routing:** invoked by `tk-design` Phase 2 + standalone during `/discovery` proposal work. Not auto-loaded during `/implement` (no coding triggers).

---

## 1. When to use

**Use during:**

- `/design` workflow — producing the visual direction section of `16_DESIGN.md`
- `/discovery` when the product needs an initial aesthetic posture
- Proposal / kickoff work — choosing a skin family before committing to tokens
- UI audits where the product "feels generic" and needs a cohesive redirection

**Don't use for:**

- Writing or editing actual UI code → `sk-ui`, `kb-design-engineering`
- Token definition → `sk-skins`, `sk-tokens-neomorphism`
- Dashboard chart design → `kb-dataviz`

---

## 2. Required process

> 🔴 **Step 0 — Shipped skins first.** Before recommending a conceptual skin family, check the kit's registry: `src/config/skins.ts` (`export const SKINS`). Each entry is a skin **already implemented** and swappable with a one-line switch (`ACTIVE_SKIN` + `pnpm generate:skin`). The workflow that invokes this skill (`tk-design` Phase 2) **reads that registry** and presents its skins as concrete candidates. Decision hierarchy:
>
> 1. **Does a shipped skin fit the product's posture?** → pick it. It's the cheap path (already built, zero implementation). The concrete list comes from the registry — it is **never hardcoded here**, so skins added later surface automatically.
> 2. **Does none fit?** → define a **new/custom direction** using the conceptual skin families (§3) — the higher-effort path (needs new tokens/implementation).
>
> The families in §3 are the **reasoning framework** (portable, kit-agnostic), not the list of available skins. A shipped skin typically **embodies** a family (e.g. a dark-forward skin embodies "Midnight Executive"); map by intent, not by hardcoded name.

When invoked, produce the following outputs in order:

1. **Product posture** — what the product is trying to signal (precision / warmth / density / aspiration)
2. **Trust vs novelty** — where on the axis the product sits (finance trust = high, creator tool = novelty OK)
3. **Density requirement** — low (editorial), medium (dashboards), high (operator tools)
4. **Skin selection** (Step 0) — a **shipped skin** from the registry (preferred when one fits) **or** a conceptual skin family (§3) for custom direction — with rationale
5. **Surface behavior** — how base / panel / overlay differ
6. **Typography posture** (§4)
7. **Iconography system** (§5)
8. **Motion profile** (§6)
9. **Anti-patterns to avoid** for this product
10. **Optional fallback skin** — second-best choice with why

---

## 3. Skin families

### 3.1 Midnight Executive

**Intent:** premium, trustworthy, dark-forward for finance, admin, analytics, governance.

| Best for                           | Avoid when                          |
| ---------------------------------- | ----------------------------------- |
| Fintech, admin systems, dashboards | Product should feel playful or warm |
| Investor portals, internal tools   | App is mostly editorial content     |

**Visual traits:** deep navy / charcoal backgrounds, restrained accents, layered subtle surfaces, strong hierarchy, premium dark mode, clean stable navigation.

**Tables:** crisp, dense, legible, strong row hierarchy, minimal decoration.
**Icons:** neutral outlines; accent only in KPI / highlighted surfaces.
**Motion:** crisp, restrained, premium.

---

### 3.2 Editorial Premium

**Intent:** typography-led, brand-aware, polished composition with less chrome and more character.

| Best for                              | Avoid when                                     |
| ------------------------------------- | ---------------------------------------------- |
| AI products, content platforms        | Extremely dense operational software dominates |
| Founder tools, premium B2B dashboards | —                                              |

**Visual traits:** stronger heading presence, more composition rhythm, fewer generic cards, better whitespace discipline, elegant hierarchy.

---

### 3.3 Dense Operator

**Intent:** high-clarity interface for serious multi-step operational work.

| Best for                              | Avoid when                                     |
| ------------------------------------- | ---------------------------------------------- |
| Ops, logistics, trading-like UIs      | Product should feel soft, aspirational, luxury |
| Internal consoles, monitoring systems | —                                              |

**Visual traits:** compact surfaces, strong zoning, stable shells, hierarchy through density and grouping, less decorative styling.

---

### 3.4 Soft Glass Accent

**Intent:** modern premium feel using restrained translucency on overlays, not as the full system.

| Best for                                          | Avoid when                                |
| ------------------------------------------------- | ----------------------------------------- |
| Premium dashboards, AI apps, command-heavy shells | Interface is highly dense                 |
| Consumer-facing modern products                   | Accessibility contrast is already fragile |

**Rules:** don't make every panel glass; prefer glass on overlays, highlighted widgets, topbars, or command surfaces; maintain strong contrast and readable boundaries.

---

### 3.5 Warm Productive

**Intent:** human, approachable, calm for wellness, education, creator, family-oriented products.

| Best for                           | Avoid when                                    |
| ---------------------------------- | --------------------------------------------- |
| Education, creator tools, wellness | Brand must feel highly formal / institutional |
| Family-focused apps                | —                                             |

---

## 4. Typography posture

Choose one posture — it sets heading weight, scale ratio, and rhythm:

| Posture          | Ratio       | Use with                                  |
| ---------------- | ----------- | ----------------------------------------- |
| Dense technical  | 1.125 – 1.2 | Dense Operator, finance tables            |
| Balanced product | 1.25        | Midnight Executive, general dashboards    |
| Editorial        | 1.333       | Editorial Premium, AI / content platforms |
| Hero / landing   | 1.5 – 1.618 | Marketing surfaces, premium consumer apps |

Pair with a typeface family decision: neutral sans for operator tools, humanist sans for warm productive, display serif/mono for editorial.

---

## 5. Iconography system

### Tiered library strategy

1. **Base system icons** — Lucide or Tabler. Used for navigation, actions, utilities, CRUD, settings.
2. **Accent / expressive icons** — Phosphor or custom SVG. Used for KPI cards, highlights, marketing surfaces, premium callouts.
3. **Brand / domain icons** — custom SVG for product-specific entities. Use sparingly.

### Policy rules

- Navigation icons stay neutral and consistent
- KPI cards may use richer treatment (filled, duotone, gradient container)
- Don't mix too many icon families on the same surface
- Glow / gradients only in accent contexts
- Outline icons are safer for system-level navigation
- Filled / duotone only in emphasis roles
- Money / dense data → preserve trust and precision (outline, consistent stroke)

### Anti-patterns

- Random mixing of icon sets
- Inconsistent stroke weights
- Over-glowing every icon
- Decorative icons in dense tables
- Duotone everywhere
- Icons without a role distinction

---

## 6. Motion profile

### Tone (choose one per product)

| Tone       | Description                 | Best for                       |
| ---------- | --------------------------- | ------------------------------ |
| Calm       | Slow, gentle, breathing     | Wellness, education            |
| Crisp      | Fast, snappy, immediate     | Admin, operator tools          |
| Premium    | Smooth, deliberate, elegant | Fintech, executive dashboards  |
| Restrained | Minimal, functional only    | Dense data tools               |
| Reduced    | Near-zero motion            | A11y-first, monitoring systems |

### Interaction feedback (define behavior per state)

- **Hover** — subtle scale, shadow lift, or background shift
- **Pressed** — inward motion (scale down) or color shift
- **Selected** — persistent indicator (underline, fill, ring)
- **Focused** — visible focus ring, meets WCAG
- **Disabled** — reduced opacity, no interaction feedback

### Container transitions

| Element                 | Recommendation                 |
| ----------------------- | ------------------------------ |
| Modal                   | Scale + fade from center       |
| Drawer                  | Slide from edge                |
| Tooltip                 | Fade with slight offset        |
| Page transitions        | Cross-fade or slide (if SPA)   |
| Tab / content switching | Fade or slide within container |

### Data-UI motion rules

- Tables: row highlight on hover, sort animation optional
- Charts: staggered entrance on load, tooltip follows cursor
- KPI cards: count-up on first paint
- Filters: smooth height transitions when toggling
- Empty states: gentle fade-in

### Reduced motion strategy

When `prefers-reduced-motion: reduce`:

- Remove all decorative transitions
- Keep state-change indicators (selected, focus)
- Use instant visibility changes instead of animated ones

---

## 7. Global anti-patterns

- Generic "clean SaaS" with no character
- Overusing cards until the UI loses hierarchy
- All surfaces at the same depth
- Neon accents without strong rationale
- Glassmorphism as the full system default
- Neumorphism for dense productivity tools
- Trendy style choices that weaken trust
- Purple / violet by default (AI-product cliché)
- Mesh / aurora gradients as lazy background

---

## 8. Output format — what to write into `16_DESIGN.md`

Always produce:

- **Chosen skin** + rationale — a **shipped skin** from the registry (concrete name, as `tk-design` read it from `src/config/skins.ts`) **or** a conceptual skin family (§3) if a custom direction was chosen (why this product needs it)
- **Visual tone** (1-paragraph narrative description)
- **Surface rules** (base / panel / overlay behavior)
- **Typography posture** (family + scale ratio + weight decisions)
- **Icon strategy** (base library + accent library + allowed styles)
- **Motion profile** (tone + interaction feedback rules)
- **Anti-patterns for this product** (what to avoid, with rationale)
- **Optional fallback skin** (second choice + when to prefer it)

---

## 9. Handoff to coding-phase skills

Qué skill consume esta dirección al implementar (`sk-skins`, `sk-tokens-neomorphism`, `kb-design-engineering`, `sk-ui`) y la regla de handoff viven en la metodología de `/design`: [`tk-design/methodology/visual-direction-handoff.md`](../tk-design/methodology/visual-direction-handoff.md) § Handoff to coding-phase skills.
---

_TimeKast Factory — kb-visual-direction (documentation-phase, not coding)_
