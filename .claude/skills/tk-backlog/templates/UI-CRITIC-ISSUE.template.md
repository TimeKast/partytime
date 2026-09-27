# {{DOMAIN}}-{{NNN}}: UI critic — {{epic-slug}}

> **Issue ID:** {{DOMAIN}}-{{NNN}}
> **Epic:** [{{EPIC-NN-slug}}](../epics/{{EPIC-NN-slug}}.md)
> **Priority:** {{P1 | P2}}
> **Effort:** S · **Story Points:** 2
> **Status:** 📋 Backlog
> **Skills:** `sk-skins`, `kb-design-engineering`, `sk-tokens-neomorphism`, `fx-visual-evidence`
> **Depends on:** {{las UI issues del epic — se ejecuta al final de la cadena}} · **Parallelizable:** no
> **DoR Waivers:** N/A (review issue)
> **Board:** story
>
> **Refs (discovery):** {{FTs del epic}} · {{personas del epic}} · —
> **Refs (design):** {{SCRs del epic}} · —
> **Refs (contract):** — · —

<!-- Slug-prefix `ui-critic-` para grep-ability. Pre-asignado en Phase 3, materializado como chain tail en Phase 4.
     Corre el agent `ui-critic` en /implement time sobre la UI ya renderizada. -->

## 1. 🎯 Objetivo

Auditar la UI renderizada del epic {{EPIC-NN-slug}} contra el design system (compliance) + scorecard de calidad visual, **después** de que las UI issues del epic estén implementadas.

## 2. Pantallas a auditar

- {{SCR-XXX}} — {{ruta}}
- {{SCR-YYY}} — {{ruta}}

## 3. ✅ Criterios de Aceptación

- [ ] El **orquestador de `/implement`** spawnea el agent `ui-critic` sobre las pantallas listadas (UI real, no markdown) al llegar el turno de este issue en Phase 3 — **no** lo ejecuta `imp-issue-executor`, cuyo allowlist (`Read, Grep, Glob, Edit, Write, Bash`) no incluye el Agent tool
- [ ] **Evidencia visual adjunta antes de reportar DS4** — el orquestador corre el harness (`pnpm evidence:visual`, [`fx-visual-evidence`](../../fx-visual-evidence/SKILL.md)) y le pasa a `ui-critic` el path del manifest (`tests/.evidence/<corrida>/manifest.json`), que queda citado en el Evidence de este issue. **Condicional a que este checkout cablee el proyecto `evidence`** — se comprueba con `Grep` sobre `playwright.config.ts` buscando `'evidence'`, nunca con `pnpm test:e2e --help` (ese texto es estático y nombra la fase aunque no esté cableada). Si no está —perfil `core`, o un proyecto que aún no aplicó [`visual-evidence-adoption.md`](../../../docs/retrofits/visual-evidence-adoption.md)— este AC se satisface anotando esa ausencia, y DS4 se reporta como **"no demostrado"**, nunca Pass. El criterio nunca exige evidencia donde no se puede producir
- [ ] DS compliance: tokens (`sk-tokens-neomorphism`), reuse de primitives, escalas, **multi-theme sobre todos los temas que declara el skin activo** (`activeSkinThemes()` de `src/config/skins.ts` — dos, tres o los que sean; nunca una terna escrita a mano) — **Pass binario**; DS4 se evalúa **sobre las capturas del manifest**, y sin manifest sale "no demostrado" (ni Pass ni Fail)
- [ ] Scorecard de calidad visual emitido (claridad / pulido / consistencia)
- [ ] Findings de compliance que fallen → issues de fix creados vía `/backlog add` (referenciados aquí)

## 4. 🚫 Out of Scope

- Cambios de scope funcional — solo visual/DS compliance.

## 5. 📝 Implementation Evidence

_Pendiente._

## 6. 📦 Commits

_Pendiente._
