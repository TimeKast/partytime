---
id: CMP-{{NN}}
slug: {{kebab-case-slug}}
based_on: {{sk-ui-primitive | sk-ui-recipe | from-scratch}}
detection_criterion: {{A | B | C}}
used_in: [SCR-XXX, SCR-YYY, ...]
---

# CMP-{{NN}} — {{Component name}}

> **Per-component extension.** Emitted only when CMP-Detection criterion (A/B/C) passes — see `methodology/component-extension-policy.md`. If criterion C (thin sk-ui extension) → don't emit this file; raise a factory ticket to extend the kit.

## 1. Purpose

{{1-2 sentences. What gap in `sk-ui` / `INVENTORY.md` does this component fill? Why is it not a simple composition in the SCR?}}

## 2. Detection criterion

- [ ] **A** — Reusable prop API, used in ≥2 screens
- [ ] **B** — Complex single-screen with implementation risk (animation / state machine / web API / hardware-accel)
- [ ] **C** — Thin extension of `sk-ui` primitive (→ should be factory ticket, NOT this file. If you're filling this template with C marked, stop and route to kit ticket instead.)

## 3. Based on

{{Reference to the source primitive or pattern this component extends/composes. Examples:}}

- `sk-ui §1.1 DataTable` + custom column renderer
- `sk-ui §11.2 Internal scroll` recipe + `.scrollbar-visible`
- From scratch (no primitive or recipe in sk-ui applies)

## 4. Prop API (TypeScript signature)

```ts
interface {{ComponentName}}Props {
  // required
  {{prop}}: {{type}};

  // optional
  {{prop}}?: {{type}};

  // event handlers
  on{{Event}}?: (args: {{ArgType}}) => void;

  // composition
  className?: string;
  children?: React.ReactNode;
}
```

## 5. Variants

| Variant | When to use                | Visual treatment                                    |
| ------- | -------------------------- | --------------------------------------------------- |
| default | {{default usage scenario}} | {{tokens used: --elevation-raised, --surface-card, etc.}} |
| {{v2}}  | {{when}}                   | {{visual delta}}                                    |
| {{v3}}  | {{when}}                   | {{visual delta}}                                    |

## 6. States

| State    | Trigger                 | Visual                                | Copy (if shown) |
| -------- | ----------------------- | ------------------------------------- | --------------- |
| idle     | default                 | {{baseline render}}                   | —               |
| hover    | mouse over (desktop)    | {{elevation increase}}                | —               |
| active   | pressed / tap           | {{inset shadow / press feedback}}     | —               |
| disabled | `disabled` prop         | {{50% opacity, no hover, no events}}  | —               |
| loading  | async pending state     | {{spinner inline / skeleton overlay}} | (if applicable) |
| error    | error prop / async fail | {{destructive token / icon}}          | error message   |

## 7. Token usage

| Concern    | Tokens used                                                  |
| ---------- | ------------------------------------------------------------ |
| Surface    | {{--surface-card / --surface-elevated / --surface-recessed}} |
| Elevation  | {{--elevation-raised-sm / --elevation-raised / --elevation-inset / etc.}} |
| Spacing    | {{p-2 / p-3 / p-4 — never arbitrary px}}                     |
| Radius     | {{rounded-md / rounded-lg / rounded-xl}}                     |
| Typography | {{text-sm / text-base / text-lg — never arbitrary size}}     |
| Color      | {{--primary / --foreground / --muted-foreground / etc.}}     |
| Motion     | {{duration-200 ease-out, etc. — only if applicable}}         |

Anti-tokens (forbidden — see `sk-tokens-neomorphism §2`):

- ❌ Hardcoded hex codes
- ❌ Arbitrary `[Xpx]` values where a scale step exists
- ❌ Manual `box-shadow: ...` (use `.surface-*` utilities; legacy pre-v11: `.neo-*`)

## 8. Responsive behavior

| Breakpoint | Behavior                                           |
| ---------- | -------------------------------------------------- |
| <375px     | (not supported — kit baseline is 375px)            |
| 375-639px  | {{mobile rendering — describe in 1 line}}          |
| 640-1023px | {{tablet — usually same as mobile or minor delta}} |
| ≥1024px    | {{desktop — describe deltas}}                      |

## 9. Used in

- SCR-XXX (`§5 SK Components Used`)
- SCR-YYY (`§5 SK Components Used`)

## 10. Accessibility notes

- ARIA roles: {{role + aria-label / aria-labelledby pattern}}
- Keyboard: {{focusable? tab order? shortcut?}}
- Screen reader: {{what is announced on state changes}}
- Color contrast: {{ratio against bg — must pass WCAG AA 4.5:1 for text}}
- Touch target: {{min 44×44px per WCAG 2.5.5}}

## 11. Implementation notes (for `/implement` consumer)

{{Anything `/implement` needs to know that isn't obvious from `5` + `6` + `7`:}}

- File location: `src/components/{{domain}}/{{component-name}}.tsx` (per `sk-project-structure`)
- Dependencies (kit primitives reused): {{list of sk-ui or other primitives this composes}}
- Server-vs-Client boundary: {{Server / Client — per `sk-crud-scaffold §4` (RSC shells delegate to client components)}}
- Notable hooks needed: {{list of hooks from `HOOKS.md` or new ones to add}}

## 12. Refs

- **Used in:** SCR-XXX, SCR-YYY
- **Based on:** {{sk-ui primitive or §11 recipe ref}}
- **Detection rationale:** {{1 line — why A or B; not C since C → factory ticket}}

---

_TimeKast Factory — tk-design template · CMP-{{NN}}_
