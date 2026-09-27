# {{DOMAIN}}-{{NNN}}: {{Título imperativo}}

> **Issue ID:** {{DOMAIN}}-{{NNN}}
> **Epic:** [{{EPIC-NN-slug}}](../epics/{{EPIC-NN-slug}}.md)
> **Priority:** {{P0 | P1 | P2 | P3}}
> **Effort:** {{XS | S | M | L | XL}} · **Story Points:** {{1 | 2 | 3 | 5 | 8 | 13}}
> **Status:** 📋 Backlog
> **Skills:** {{1-3, ordered — `sk-...`/`pj-...` of the main file's domain FIRST (mandatory read); no `kb-*` sibling of a listed `sk-*`; NO agents — `skills-allowlist.md`}}
> **Depends on:** {{DOMAIN-NNN, DOMAIN-NNN | —}} · **Parallelizable:** {{yes | no}}
> **DoR Waivers:** {{justificación si se saltó un test-gate · y/o `design-spec — …` si la señal de diseño registró una pantalla sin SCR | —}}
> **Backlog UUID:** {{uuid}}
> **MoSCoW:** {{must | should | could | —}}
> **Board:** story
>
> **Refs (discovery):** {{FT-XX}} · {{PER-XXX}} · {{AC-XX.Y}}
> **Refs (design):** {{SCR-XXX[, SCR-YYY for a CRUD] | —}} · {{ENT-XX | —}}
> **Refs (contract):** {{actionName1, actionName2 | —}} · [packet]({{15_IMPLEMENTATION_PACKETS/FT-XX.md}})

<!--
  Header rules:
  - First 5 fields (Issue ID/Status/Priority/Story Points/Epic) are read by update-board.ts — exact labels.
  - Status: 📋 Backlog | 🚧 In Progress | ✅ Done | ⏸️ Deferred (emoji+word, NOT enum).
  - Parallelizable is DERIVED from the epic ## Topology SSOT; do not set it independently.
  - The 3 `Refs (...)` lines consolidate discovery/design/contract refs (v6.4.0+). Slot order within
    each line is fixed; empty slots are `—`. Phase 6 coverage gate reads these lines.
  - Backlog UUID / MoSCoW / Board are backlog-central sync metadata (BSYNC-007) — NOT read by
    update-board.ts. UUID = v4 minted in Phase 3, stamped verbatim by bkl-issue-specer (never re-generated);
    MoSCoW from 03_DEEP_DIVE (— if absent); Board defaults to `story`. See issue-shape.md § Blockquote header.
  - Filename MUST start with {{EPIC-NN-{DOMAIN}-{NNN}}} (epic-compound convention, commit-hook find).
-->

## 1. 🎯 Objetivo

{{2-3 oraciones: el problema + el cambio. No repetir el título.}}

## 2. User Story

Como {{persona}}, quiero {{acción}}, para {{beneficio}}. ({{US-XXX}})

## 3. 📎 Doc References

| Doc       | Ref                 | Link                                                                    |
| --------- | ------------------- | ----------------------------------------------------------------------- |
| Feature   | {{FT-XX}}           | [03_DEEP_DIVE](../../../planning/03_DEEP_DIVE.md)                       |
| Packet    | {{FT-XX}}           | [packet](../../../planning/15_IMPLEMENTATION_PACKETS/FT-{{XX}}.md)      |
| Screen(s) | {{SCR-XXX}}         | [SCR](../../../planning/16_DESIGN/{{SCR-XXX-slug}}.md)                  |
| Entity    | {{ENT-XX}}          | [09_DATA_MODEL](../../../planning/09_DATA_MODEL.md)                     |
| Actions   | {{actionName}}      | [10_API_SURFACE](../../../planning/10_API_SURFACE.md)                   |
| AC        | {{AC-XX.Y}}         | [06_ACCEPTANCE_SCENARIOS](../../../planning/06_ACCEPTANCE_SCENARIOS.md) |
| RBAC      | {{role × resource}} | [05_RBAC_MATRIX](../../../planning/05_RBAC_MATRIX.md)                   |

## 4. ✅ Criterios de Aceptación

<!-- Checks técnicos verificables por evidencia objetiva. NO narrativa de usuario (eso va en §5). -->

- [ ] {{check verificable}}
- [ ] `pnpm typecheck` sin errores
- [ ] `pnpm lint` sin errores
- [ ] {{AC funcional verificable}}

## 5. 🥒 Escenarios Gherkin (es-MX)

<!-- Obligatorio si: UI interactiva / user-facing flow / RBAC visible / algo que un QA humano probaría a mano.
     Exempt: pure refactor · docs-only · backend infra sin user-facing touch. -->

```gherkin
Escenario: {{happy path}}
  Dado {{contexto}}
  Cuando {{acción}}
  Entonces {{resultado observable}}

Escenario: {{edge case}}
  Dado {{contexto}}
  Cuando {{acción inválida}}
  Entonces {{manejo de error}}
```

## 6. 🔧 Contexto Técnico

- **Files to create/modify:** {{paths}}
- **API contract:** {{Zod input + output shape — ActionResult<T>}}
- **RBAC:** {{gate per 05_RBAC_MATRIX}}
- **Kit primitives:** {{referenced via INVENTORY / sk-features-index — no inventar}}

## 7. 🧪 Tests requeridos

<!-- Per SK.md §4.2 + el DoR gate (methodology/test-plan-rules.md). -->

- [ ] **Unit** (Vitest) — {{funciones puras / validaciones / helpers}}
- [ ] **Component** (RTL) — {{si UI interactiva — obligatorio por DoR}}
- [ ] **E2E** (Playwright) — {{si cross-page / auth / RBAC — obligatorio por DoR}}

## 8. ⚠️ Edge Cases

- {{edge case}}

## 9. 🚫 Out of Scope

- {{cuando hay ambigüedad}}

## 10. 📝 Implementation Evidence

<!-- Filled post-hoc por /implement. ESTA SECCIÓN DEBE EXISTIR (el commit hook la exige para Closes:). -->

_Pendiente._

## 11. 📦 Commits

_Pendiente._
