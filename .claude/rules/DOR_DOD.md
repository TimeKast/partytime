# Definition of Ready & Done

> Criterios estándar para issues en proyectos TimeKast Factory.
> **Ubicación:** `.claude/rules/DOR_DOD.md`
> **Cargado:** always-on vía `@import` desde `CLAUDE.md`.

---

## Definition of Ready (DoR)

Un issue está **Ready** para implementar cuando tiene:

### Obligatorio

| ✅  | Criterio                                       |
| --- | ---------------------------------------------- |
| [ ] | Título con ID: `PREFIX-XXX: Descripción clara` |
| [ ] | Descripción del problema o feature             |
| [ ] | Acceptance Criteria (preferible Gherkin)       |
| [ ] | Prioridad asignada (P0/P1/P2/P3)               |
| [ ] | Epic asociado                                  |

### Si aplica

| ✅  | Criterio                           | Cuándo                                                                                                    |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [ ] | API Contract definido              | Issues con Server Actions                                                                                 |
| [ ] | Mockups/wireframes                 | Issues de UI                                                                                              |
| [ ] | **Component test declarado en AC** | Componentes con interacción (onClick, forms, state, conditional render) — DEBE aparecer como AC explícito |
| [ ] | **E2E test declarado en AC**       | Flujos cross-page, auth/RBAC — DEBE aparecer como AC explícito                                            |
| [ ] | **Evidencia visual declarada en AC** | Componentes/páginas con cambio **visual** — la evidencia la genera el harness `fx-visual-evidence` (`pnpm evidence:visual`), y el AC se redacta **condicionado a que el harness esté disponible** en el checkout (ver nota abajo) |
| [ ] | Dependencias identificadas         | Issues bloqueados                                                                                         |
| [ ] | ADR asociado                       | Decisiones de arquitectura                                                                                |

> 🔴 **La fila de evidencia visual es CONDICIONAL por diseño, y esa condición es parte de la regla.** El harness necesita `scripts/tools/e2e-runner.ts`, que **no** viaja al perfil de distribución `core`, y necesita un proyecto `evidence` en un `playwright.config.ts` que nace congelado en cada derivado (`BR-FACTORY-006`). Un AC redactado como "adjuntar capturas" sin esa condición sería **estructuralmente incumplible** en esos repos — el peor tipo de criterio, porque se cumple mintiendo. Redacción correcta: _"si el harness está disponible en este checkout, se adjunta el manifest; si no, se anota su ausencia y el check multi-tema se reporta como **no demostrado**, nunca como Pass"_. Ese "no demostrado" es la respuesta permanente, no un pendiente. Detalle: [`fx-visual-evidence`](../skills/fx-visual-evidence/SKILL.md) · adopción: [`visual-evidence-adoption.md`](../docs/retrofits/visual-evidence-adoption.md).

> 🔴 **Enforcement para `/backlog` — un gate y una señal, con comportamiento por modo (`fx-workflow-authoring §7.1`):**
>
> **(a) Test-gate (per-issue, modos `nuevo`/`add`/`extend-epic` — todo modo que emite issues):** detecta UI interactiva (keyword/scope de UI) y agrega la AC de la **capa que el path determina** — componente (RTL) para `src/components/**`, E2E para una página, unit para `src/app/api/**`. En **`--step`** corre el gate interactivo `[y/n/justify]` — `y` agrega la AC, `justify` (≥20 chars) registra la razón en `> **DoR Waivers:**` + log machine-readable, `n`/justificación <20 chars **bloquea el issue**. En **modo fluido** (default) el default correcto es obvio → **auto-agrega la AC** (= `y`), sin preguntar (no es señal real).
>
> > **Veredicto de conformidad con `CC.md §3` — el test-gate conserva su campo de texto.** `DOR_DOD.md` es peer de `CC.md` (`CORE.md §1`) y prescribe aquí el formato de un gate, así que el dictamen se declara y no se deja implícito: la vía estructurada presenta las opciones, y la rama **`justify` sigue exigiendo la razón escrita de ≥20 chars** (`CC.md §3`: la exigencia de texto nunca se deroga).
>
> **(b) Señal de diseño (per-run, plan-mode `add`/`extend-epic`):** la detección de UI design-significant sin SCR que la cubra **no es un gate** — no pregunta ni bloquea en ningún modo (fluido, `--step` y headless por igual). Se narra en una línea del resumen de CP1, se registra como **auto-texto determinista** en `> **DoR Waivers:**` de cada issue afectado y como nota en el manifest del run; cuando sí hay SCR que cubra, puebla `Refs (design)`. Quien demuestra la UI es el harness de evidencia visual + `ui-critic` en `/implement` — **donde el harness está adoptado**. Donde no lo está (perfil `core`, o un derivado que aún no corrió la adopción — la condición está enunciada arriba, en la fila de evidencia visual), `ui-critic` corre igual y reporta el check multi-tema como **no demostrado**, nunca Pass. 🔴 **Decirlo es parte de la regla:** en esos repos no hay eslabón que demuestre, y afirmar que sí lo hay convertiría una remoción neta en un reemplazo aparente.
>
> Detalle: `.claude/skills/tk-backlog/methodology/test-plan-rules.md`.

---

## Definition of Done (DoD)

Un issue está **Done** cuando cumple:

### Código ✅

| ✅  | Criterio                         | Comando          |
| --- | -------------------------------- | ---------------- |
| [ ] | Implementación completa según AC | —                |
| [ ] | Sin errores TypeScript           | `pnpm typecheck` |
| [ ] | Sin errores lint                 | `pnpm lint`      |
| [ ] | Build exitoso                    | `pnpm build`     |

### Tests ✅

Pirámide de 3 capas (ver `SK.md §4.2`). Según naturaleza del issue, al menos UNA capa debe cubrir el cambio:

| ✅  | Criterio                                                              | Comando         |
| --- | --------------------------------------------------------------------- | --------------- |
| [ ] | Unit — funciones puras, helpers, validaciones                         | `pnpm test`     |
| [ ] | Component (RTL) — componentes con interacción (onClick, forms, state) | `pnpm test`     |
| [ ] | E2E (Playwright) — flujos cross-page, auth, RBAC                      | `pnpm test:e2e` |
| [ ] | Todos los tests pasan                                                 | `pnpm verify`   |

### Documentación ✅

| ✅  | Criterio                             |
| --- | ------------------------------------ |
| [ ] | JSDoc en funciones públicas nuevas   |
| [ ] | Implementation Notes en issue.md     |
| [ ] | CHANGELOG entry (si feature visible) |

### Review ✅

| ✅  | Criterio                               |
| --- | -------------------------------------- |
| [ ] | Verificación pasó (`pnpm verify`)      |
| [ ] | Todas las AC verificadas con evidencia |
| [ ] | Usuario aprueba cierre explícitamente  |

---

## Excepciones

| Tipo de Issue        | Puede omitir    | Razón                     |
| -------------------- | --------------- | ------------------------- |
| **Hotfix P0**        | Tests unitarios | Urgencia, agregar después |
| **Spike/PoC**        | Tests, Docs     | Es investigación          |
| **Refactor interno** | CHANGELOG       | No afecta usuario         |
| **Docs-only**        | Build, Tests    | Solo documentación        |

---

## Regla de Oro

> 🛑 **No implementar issue que no cumpla DoR.**
> 🛑 **No cerrar issue que no cumpla DoD.**

---

_TimeKast Factory — Methodology Rules_
