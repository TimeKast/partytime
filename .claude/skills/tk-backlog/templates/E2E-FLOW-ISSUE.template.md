# {{DOMAIN}}-{{NNN}}: E2E flow — {{flw-slug}}

> **Issue ID:** {{DOMAIN}}-{{NNN}}
> **Epic:** [{{EPIC-NN-slug}}](../epics/{{EPIC-NN-slug}}.md)
> **Priority:** {{P0 | P1}}
> **Effort:** {{M | L}} · **Story Points:** {{5 | 8}}
> **Status:** 📋 Backlog
> **Skills:** `sk-e2e`
> **Depends on:** {{las issues de las SCRs que cubre el flujo}} · **Parallelizable:** no
> **DoR Waivers:** N/A (E2E test issue)
> **Board:** story
>
> **Refs (discovery):** {{FTs involucradas}} · {{personas del flujo}} · {{AC-XX.Y}}
> **Refs (design):** {{SCR-XXX, SCR-YYY, SCR-ZZZ — ≥3}} · {{ENT-XX}}
> **Refs (contract):** {{actions del flujo}} · [FLW]({{16_DESIGN/flows/FLW-XXX-slug.md}})

<!-- Emitido cuando un FLW-XXX abarca ≥3 SCRs. Slug-prefix `e2e-flow-`. Depende de las issues de pantalla. -->

## 1. 🎯 Objetivo

Cubrir el flujo cross-screen {{FLW-XXX}} ({{≥3 SCRs}}) con un test E2E Playwright end-to-end, una vez implementadas las pantallas involucradas.

## 2. 📎 Doc References

| Doc  | Ref         | Link                                                                    |
| ---- | ----------- | ----------------------------------------------------------------------- |
| Flow | {{FLW-XXX}} | [FLW](../../../planning/16_DESIGN/flows/{{FLW-XXX-slug}}.md)            |
| AC   | {{AC-XX.Y}} | [06_ACCEPTANCE_SCENARIOS](../../../planning/06_ACCEPTANCE_SCENARIOS.md) |

## 3. 🥒 Escenario del flujo (es-MX)

```gherkin
Escenario: {{flujo completo}}
  Dado {{estado inicial — pantalla 1}}
  Cuando {{transición a pantalla 2}}
  Y {{acción en pantalla 3}}
  Entonces {{resultado observable end-to-end}}
```

## 4. ✅ Criterios de Aceptación

- [ ] Spec E2E en `tests/e2e/{{flw-slug}}.spec.ts` cubre el flujo completo ({{SCRs}})
- [ ] Corre sobre la infra `e2e-runner.ts` (Neon branch aislado per run) — `sk-e2e`
- [ ] Selectores semánticos + hydration waits (estabilidad per `sk-e2e`)
- [ ] `pnpm test:e2e` pasa

## 5. 🚫 Out of Scope

- Tests unit/component de las pantallas individuales — viven en sus propias issues.

## 6. 📝 Implementation Evidence

_Pendiente._

## 7. 📦 Commits

_Pendiente._
