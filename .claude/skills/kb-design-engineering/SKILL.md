---
name: kb-design-engineering
description: Execution process for visual polish in the kit — translating an approved visual direction into production UI without breaking product logic. 5-step flow (scope → classify → map to system → implement with restraint → validate), where the validate step is answered by the visual-evidence manifest, never by assertion; plus system rules and anti-patterns. Route here when a screen feels generic, a skin must be applied, or tables/cards/nav need refinement.
last-verified: 2026-09-22
user-invocable: false
---

# Design Engineering — Visual Polish Execution

> Bridge between approved visual direction and production UI code. This skill is about **applying** direction, not choosing it.
> If the direction doesn't exist yet → load `kb-visual-direction` first. Inputs you need before touching code: the selected skin (`sk-skins` registry), the layout shell, the token vocabulary (`sk-tokens-neomorphism`), the icon family and the motion tone — all of them come out of `16_DESIGN.md`.

---

## 1. The 5-step process

### Step 1 — Identify UI scope

- Which screen(s) or components are affected
- Whether the task is shell-level, component-level, or page-level
- What must remain untouched (don't refactor adjacent code)

### Step 2 — Classify visual problems

Name the current issues explicitly. Common patterns:

- Weak hierarchy
- Same-depth surfaces (base / panel / overlay indistinguishable)
- Generic layout (no rhythm, no composition)
- Poor spacing rhythm
- Dry tables
- Weak nav identity
- Inconsistent icon treatment
- Poor interaction feedback
- Weak dark-mode contrast
- Excessive card repetition

### Step 3 — Map to system decisions

Translate each visual intent into a **system-level** change:

| Visual intent           | System decision                                                                |
| ----------------------- | ------------------------------------------------------------------------------ |
| Stronger hierarchy      | Semantic foreground tokens (e.g. `muted-foreground`) + ratio                   |
| Surface differentiation | Shadow / bg / ring tokens at 3 depths                                          |
| More rhythm in a page   | Extract a layout wrapper (if repeated 3+ times) instead of ad-hoc flex classes |
| Consistent hover/focus  | Motion primitive + token                                                       |
| Coherent icons          | Icon wrapper component + rule for base vs accent                               |

The change should live in the system (tokens, variants, wrappers) whenever possible — not scattered utility classes.

### Step 4 — Implement with restraint

**Prefer:**

- Reusable abstractions over one-off styling
- Semantic tokens over raw values
- Stable component APIs — don't reshape props for cosmetic changes
- Low-risk visual refactors
- Strong consistency across related surfaces

**Avoid:**

- Random one-off styling
- Visual overcorrection (turning a "weak" UI into a "loud" UI)
- Adding effects without hierarchy
- Touching unrelated logic
- Patterns that conflict with the design system

### Step 5 — Validate

Before declaring polish done:

> 🔴 **Three of these boxes cannot be ticked by reading the diff, and ticking them anyway is how a
> "verified in every theme" claim gets made about screens nobody opened.** Run the visual evidence
> harness — [`fx-visual-evidence`](../fx-visual-evidence/SKILL.md), `pnpm evidence:visual` — which
> captures every declared surface across every theme the active skin ships and three widths
> (375 / 768 / 1440) and measures contrast over the LIVE DOM of each capture. The rows marked
> below are answered by its manifest, not by an assertion. Where the harness is unavailable (a
> `core` profile, or a project that has not adopted the phase yet), say so: the honest answer is
> "not demonstrated", which is what `ui-critic` reports too — never a silent tick.

- [ ] Hierarchy is clearer than it was
- [ ] Components still align with the active skin
- [ ] **Dark / light (and any custom theme) still work** — answered by the harness manifest (one capture per theme), never by "I checked"
- [ ] **Contrast remains WCAG AA** — answered by the `contrast` field of each capture (measured, not derived from a token audit)
- [ ] Spacing follows the project scale
- [ ] **Responsive behavior is intact** — including the MIDDLE width (~768), where a regression that neither 375 nor 1440 showed reached production
- [ ] Interaction states feel intentional (hover/focus/pressed/selected)
- [ ] UI feels more premium without losing trust

---

## 2. System rules (non-negotiable)

- **Favor semantic tokens over raw values.** No hex inline, no pixel literals for radius/spacing.
- **Favor component variants over repeated class strings.** If the same visual recipe appears 3+ times, extract a variant.
- **Favor wrapper components over repeated visual patterns.** Icon containers, badges, KPI tiles → wrappers.
- **Respect the domain.** Finance / admin tools should feel precise, not playful. Premium ≠ flashy.
- **Strong hierarchy beats decorative effects.** If adding blur/gradient/glow is your fix, the hierarchy is the real problem.
- **Accent treatments must have a role.** Accent on the primary action, not on every card.
- **Every visual change should improve clarity, consistency, or feel.** If it does none of the three, skip it.

---

## 3. Anti-patterns

| ❌                                                    | ✅                                                      |
| ----------------------------------------------------- | ------------------------------------------------------- |
| "Premium" = more blur + more gradient + more glow     | Hierarchy, restraint, typography, token discipline      |
| Hardcoded visual values scattered across files        | Tokens + variants                                       |
| Every card styled the same way                        | Card hierarchy (base, featured, accent)                 |
| Nav and content surfaces indistinguishable            | Differentiated surfaces (shell vs page vs overlay)      |
| No depth system (everything at the same elevation)    | Three elevation tokens used consistently                |
| Styling that makes data harder to scan                | Polish serves legibility first                          |
| Mixing multiple style families in one pass            | One coherent direction per pass                         |
| Renaming props or reshaping APIs for cosmetic changes | Change styling only; leave component surface area alone |

---

## 4. Output contract

When finishing a polish pass, produce:

- **Scope** — screens/components touched, anything explicitly untouched
- **Visual problems classified** — the issues the pass addressed
- **System changes** — tokens/variants/wrappers added or modified
- **Validation** — checklist from §1 Step 5 marked
- **Known limitations** — anything deferred (explicit, not hidden)

---

_Cross-reference: `kb-visual-direction` for choosing the direction upstream. `sk-skins` + `sk-tokens-neomorphism` for the token discipline this skill must respect. `sk-ui` for component patterns in this stack._
