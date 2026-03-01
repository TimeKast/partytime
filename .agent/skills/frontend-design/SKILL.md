---
name: frontend-design
description: Design thinking and decision-making for web UI. UX psychology, color, typography, layout principles.
allowed-tools: Read, Write, Edit
---

# Frontend Design System

> **Philosophy:** Every pixel has purpose. Restraint is luxury. User psychology drives decisions.
> **Core Principle:** THINK, don't memorize. ASK, don't assume.

---

## ⚠️ CRITICAL: ASK BEFORE ASSUMING

> **STOP! If the user's request is open-ended, DO NOT default to your favorites.**

**Color not specified?** Ask:

> "What color palette do you prefer? (blue/green/orange/neutral/other?)"

**Style not specified?** Ask:

> "What style are you going for? (minimal/bold/retro/futuristic/organic?)"

**Layout not specified?** Ask:

> "Do you have a layout preference? (single column/grid/asymmetric/full-width?)"

---

## 🚫 Anti-Patterns to AVOID

| AI Default Tendency          | Why It's Bad            | Think Instead                             |
| ---------------------------- | ----------------------- | ----------------------------------------- |
| **Bento Grids**              | Used in every AI design | Why does this content NEED a grid?        |
| **Hero Split (Left/Right)**  | Predictable & Boring    | Massive Typography or Vertical Narrative? |
| **Mesh/Aurora Gradients**    | Lazy background         | Radical color pairing?                    |
| **Glassmorphism**            | AI's idea of "premium"  | Solid, high-contrast flat?                |
| **Deep Cyan / Fintech Blue** | Safe harbor             | Red, Black, or Neon Green?                |
| **Purple/Violet**            | 🚫 PURPLE BAN           | ANY other color                           |
| **Dark + neon glow**         | "AI look"               | What does the BRAND need?                 |
| **Rounded everything**       | Generic                 | Brutalist edges?                          |

---

## 1. UX Psychology Laws

| Law                 | Principle                         | Application           |
| ------------------- | --------------------------------- | --------------------- |
| **Hick's Law**      | More choices = slower decisions   | Limit options         |
| **Fitts' Law**      | Bigger + closer = easier to click | Size CTAs             |
| **Miller's Law**    | ~7 items in working memory        | Chunk content         |
| **Von Restorff**    | Different = memorable             | Make CTAs distinct    |
| **Serial Position** | First/last remembered most        | Key info at start/end |

---

## 2. Layout Principles

### Golden Ratio (φ = 1.618)

```
Content : Sidebar = roughly 62% : 38%
Each heading size = previous × 1.618
```

### 8-Point Grid

```
All spacing in multiples of 8:
├── Small: 8px
├── Medium: 16px
├── Large: 24px, 32px
├── XL: 48px, 64px
```

---

## 3. Color Principles

### 60-30-10 Rule

```
60% → Primary/Background (calm)
30% → Secondary (supporting)
10% → Accent (CTAs, highlights)
```

### Color Psychology

| If You Need... | Consider            | Avoid            |
| -------------- | ------------------- | ---------------- |
| Trust, calm    | Blue family         | Aggressive reds  |
| Growth         | Green family        | Industrial grays |
| Energy         | Orange, red         | Passive blues    |
| Luxury         | Teal, Gold, Emerald | Cheap brights    |

---

## 4. Typography Principles

### Scale Selection

| Content Type | Ratio     | Feel     |
| ------------ | --------- | -------- |
| Dense UI     | 1.125-1.2 | Compact  |
| General web  | 1.25      | Balanced |
| Editorial    | 1.333     | Spacious |
| Hero         | 1.5-1.618 | Dramatic |

### Readability

- **Line length**: 45-75 characters
- **Line height**: 1.4-1.6 for body
- **Size**: 16px+ for body on web

---

## 5. Animation Principles

| Action   | Easing      | Why        |
| -------- | ----------- | ---------- |
| Entering | Ease-out    | Settle in  |
| Leaving  | Ease-in     | Exit       |
| Emphasis | Ease-in-out | Deliberate |

**Performance:**

- Animate only transform and opacity
- Respect reduced-motion preference

---

## 6. "Wow Factor" Checklist

- [ ] Generous whitespace
- [ ] Subtle depth and dimension
- [ ] Smooth, purposeful animations
- [ ] Attention to detail (alignment)
- [ ] Custom elements (not defaults)
- [ ] Different from AI defaults

---

## Decision Process

```
For EVERY design task:
1. CONSTRAINTS → Timeline, brand, audience?
2. CONTENT → What exists? Hierarchy?
3. STYLE → Appropriate for context? ASK if unclear!
4. EXECUTE → Apply principles, check anti-patterns
5. REVIEW → "Is this different from my defaults?"
```

---

> **Remember:** Design is THINKING, not copying. **Avoid the Modern SaaS Safe Harbor!**
