# Wireframe Conventions

> ASCII grammar for `SCR-XXX.md` `§3 Layout — Mobile-first 375px` and `§4 Layout — Desktop ≥lg`. Mobile-first invariant is non-negotiable.

---

## 1. Why ASCII

- **Diff-friendly:** every change to layout shows in `git diff` as plain text edits.
- **AI-friendly:** consumers (`/backlog`, `/implement`) parse ASCII reliably; no image OCR needed.
- **Zero tooling:** no Figma plugin, no Storybook export, no design tool licensing.
- **Future-compatible:** when Cloud Design / Claude Design integration lands (Phase 2 of `tk-design`), ASCII + token refs + copy = enough signal to render PNG/Figma deterministically.

## 2. Mobile-first invariant (375px baseline)

Every `SCR-XXX.md` MUST have `§3 Layout — Mobile-first 375px` populated with an ASCII block. **Cero excepciones.**

- 375px = iPhone SE baseline (per `SK.md §3.2`).
- The 375px ASCII is the **primary contract**. Desktop is layered on top.
- Even for "desktop-only by design" screens (rare admin tooling), emit a viable mobile fallback ASCII with explicit note.

**Lint:** orchestrator post-Phase-5 (per `tk-design SKILL.md §13.2 Failure mode`) parses each emitted `custom`-tier SCR and rejects if:

- §3 has no ASCII box drawing characters (`┌─┐│└─┘├─┤├──┤`).
- §3 lacks the `375px` keyword anywhere in heading or ASCII frame label.

## 3. ASCII grammar

### 3.1 Frame box

```
┌─ Mobile 375px ───────────────────────────────┐
│ {content}                                    │
└──────────────────────────────────────────────┘
```

- Top-left corner: `┌`
- Top-right corner: `┐`
- Bottom-left corner: `└`
- Bottom-right corner: `┘`
- Horizontal edge: `─` (em dash) or `-`
- Vertical edge: `│`
- T-junction: `├` (left) / `┤` (right) / `┬` (top) / `┴` (bottom)
- Cross: `┼`
- Label inside top edge: `┌─ Label ─...─┐`

### 3.2 Section dividers (horizontal rules inside the frame)

```
├──────────────────────────────────────────────┤
```

### 3.3 Nested sections (sub-boxes for cards / sections)

```
┌─ Mobile 375px ───────────────────────────────┐
│ Header bar                                   │
├──────────────────────────────────────────────┤
│ ┌─ Saldo ─────────────────────────────────┐  │
│ │ $24,500.00                              │  │
│ │ ↑ 12% vs mes pasado                     │  │
│ └─────────────────────────────────────────┘  │
│ ┌─ Movimientos ───────────────────────────┐  │
│ │ Fecha   Concepto   Monto    Estado      │  │
│ │ 12/05   Pago       $1,200   ●           │  │
│ └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 3.4 Annotations (refs to components)

Inline notation inside the ASCII, marking which `sk-ui` primitive (or `kb-dataviz` recipe) renders a region:

```
│ ┌─ Saldo ─────────────────────────────────┐  │
│ │ $24,500.00    ← StatCard (kb-dataviz §3)│  │
│ │ ↑ 12%                                   │  │
│ └─────────────────────────────────────────┘  │
```

Annotations may use `←` to point to the component name + section ref. The `§5 SK Components Used` table is the canonical source; ASCII annotations are hints for readability.

### 3.5 Action elements

- Buttons: `[Label]` (primary), `[Cancelar]` (secondary text).
- Icon-only buttons: `[≡]` (menu), `[bell]`, `[avatar]`, `[+]`, `[←]`, `[→]`.
- Bottom nav: `[Inicio · Mov · + · Reportes · …]` with `·` separators.

### 3.6 Form fields

- Text input: `[___________________ Buscar ]` or `┌─ {label} ─┐` block style.
- Toggle: `[ ○ Inactivo / ● Activo ]`.
- Date picker: `[📅 12/05/26]` (icon + value).
- Select: `[{value} ▾]`.

### 3.7 Lists / tables (multi-row)

```
│ Fecha   │ Concepto       │ Monto      │ Estado │
│ 12/05   │ Pago proveedor │ $1,200.00  │ ●      │
│ 11/05   │ Servicio       │ $850.00    │ ●      │
│ 10/05   │ Compra X       │ -$320.50   │ ●      │
```

### 3.8 Empty / loading / error states (sketches in §3 are optional)

Empty/loading/error states have their own catalog in `§9 States catálogo` of the SCR (text-based). The §3 ASCII typically shows the **data state** (happy path). You may add a separate small ASCII for a key state if it's structurally different (e.g., empty state with illustration + CTA layout that diverges from data layout).

## 4. Desktop ASCII (only when meaningfully diverges)

`§4 Layout — Desktop ≥lg` of the SCR:

- **If desktop = mobile + sidebar visible + grid expanding to N cols** (no structural change): write a single line.

  ```
  Desktop = mobile + sidebar (240px left) + stats grid expands to 4-col + table shows all cols
  ```

- **If desktop changes layout meaningfully** (cards repositioned, hidden mobile sections shown, different grid structure): emit a full ASCII.

  ```
  ┌─ Desktop ≥lg ──────────────────────────────────────────────────────────┐
  │ [Sidebar 240px]    │ Header                                            │
  │                    ├───────────────────────────────────────────────────┤
  │                    │ ┌─ Saldo ─┐  ┌─ Gastos ─┐  ┌─ Ingresos ─┐  ...    │
  │                    │ └─────────┘  └──────────┘  └────────────┘         │
  │                    │ Table (full 8 cols)                               │
  │                    └───────────────────────────────────────────────────┘
  └────────────────────────────────────────────────────────────────────────┘
  ```

**Decision rule:** if you can describe the desktop layout in 1 sentence as deltas from mobile → use the prose line. If you need ≥3 sentences → emit the ASCII. The reader (`/backlog`/`/implement`) needs unambiguous structure either way.

## 5. Tablet (640px-1023px)

Usually omitted (treated as "mobile + minor expansions"). Document only if there's a substantive tablet-only layout (rare — tablets adopt either mobile or desktop UX most of the time).

If included, it goes in `§12 Responsive notes` of the SCR as prose, not as a third ASCII section.

## 6. Common anti-patterns

- ❌ Skipping §3 ASCII for "obvious" screens — there's no such thing. Every SCR emits 375px ASCII.
- ❌ Emitting desktop ASCII as the primary contract and mobile as afterthought — invert it.
- ❌ Using Unicode characters beyond box drawing + standard arrows (`←→↑↓●○`) — keep it parseable.
- ❌ Mixing layout state with content state. ASCII shows structure; `§9 States catálogo` shows state variants.
- ❌ Hardcoding pixel values in ASCII labels (`width: 240px` etc) — describe the structure, not implementation. Sizing details live in `§12 Responsive notes` referencing Tailwind scale.
- ❌ ASCII boxes that don't visually align (broken `│` columns, mismatched widths) — readers can't parse.

## 7. Lint failure recovery (Phase 5)

If orchestrator's mobile-first lint detects a violation:

1. Re-spawn `dsg-screen-specer-full` (single-target batch) with `corrective_feedback: "missing 375px ASCII at §3"` (or specific issue). Only `custom`-tier SCRs use ASCII — `kit-extended` light spec has no ASCII section + `kit-pure` stubs are length-capped at ≤7 lines (different lint).
2. Agent reads the previously emitted file, patches §3, re-writes.
3. Max 2 re-spawn attempts per target.
4. After 2 failures → orchestrator STOPs and surfaces to user with 3 options (manual rewrite, mark SCR FAIL, cancel run — per `SKILL.md §13.2 Failure mode`).

---

_TimeKast Factory — tk-design methodology · Wireframe Conventions_
