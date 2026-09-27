# Parsed plan: sample-plan.md (EXPECTED — calibration reference)

> Expected frozen decomposition for `sample-plan.md`. Hand-checked reference (not a CI assertion — the split is LLM judgment, decisión #6). Demonstrates: 3 process headings skipped, central `## Critical files` attribution, a shared file → **non-contiguous** chain (N4), and a cross-issue verification bullet → e2e.

> **Source:** .claude/skills/tk-backlog/methodology/examples/sample-plan.md
> **Hash:** <sha-256 del archivo>
> **Parsed at:** <ISO timestamp>
> **Epic count:** 1
> **Units detected:** 8 · **Issues classified:** 5 · **Prose skipped:** 3
> **Split discretion:** none (toda unidad salió de la estructura visible del plan)
> **Decomposition hash:** <sha-256 sobre { units[].title, units[].files[] } ordenado>

## Context

(narrativa de `## Context` — el panel acumuló drift; fuente del §1 Objetivo de cada issue)

## Issues (frozen decomposition)

> Process headings skipped (prose-non-issue): `## Context`, `## Sequencing`, `## Out of scope`. `## Critical files` y `## Verification` son secciones-fuente, no unidades.
>
> `refuted_by` (RF-prev): ningún ítem de `sample-plan.md` trae línea `Refutado:` → ningún issue de este expected lleva la línea `- refuted_by:`. La ausencia **nunca** se lee como "ya refutado" — el panel pregunta todo. Un plan de `/implement` que sí la traiga la vería congelada aquí, entre `body:` y `files:`, como `- refuted_by: <la consulta que corrió>`.

### Issue 1 — Badge no refleja el conteo real

- body: el badge queda desincronizado tras marcar leído…
- files:
  - src/components/notifications/NotificationBell.tsx — badge sync
  - src/lib/notifications/useNotifications.ts — hook compartido: conteo + polling

### Issue 2 — Panel no agrupa por categoría

- body: la lista muestra todo plano; agrupar por categoría…
- files:
  - src/components/notifications/NotificationPanel.tsx — agrupación por categoría

### Issue 3 — Settings no persiste el toggle de push

- body: al recargar, el toggle vuelve a activado…
- files:
  - src/components/notifications/NotificationSettings.tsx — persistencia del toggle

### Issue 4 — Email template sin branding

- body: el email sale sin el layout branded del kit…
- files:
  - src/lib/email/templates/notification.tsx — branding del email

### Issue 5 — Polling no respeta visibilidad

- body: el polling sigue corriendo en background…
- files:
  - src/lib/notifications/useNotifications.ts — hook compartido: conteo + polling
  - src/app/api/notifications/poll/route.ts — gate de visibilidad

## Verification bullets

- El badge muestra el conteo real tras marcar leído (cross-issue: no | issues: [Issue 1])
- El panel agrupa por categoría (cross-issue: no | issues: [Issue 2])
- El toggle de push persiste tras recargar (cross-issue: no | issues: [Issue 3])
- El email llega con el layout branded (cross-issue: no | issues: [Issue 4])
- El polling se pausa en background y reanuda al volver (cross-issue: no | issues: [Issue 5])
- recibir push → badge incrementa → marcar leído → badge decrementa (cross-issue: yes | issues: [Issue 1, Issue 5]) → e2e-flow issue

## Shared-file chains (topology input)

> `src/lib/notifications/useNotifications.ts` está en Issue 1 e Issue 5 → conexos → un chain. Issue 5 = NNN 005, Issue 1 = NNN 001 → chain **no-contiguo** `[001, 005]` con `[002, 003, 004]` paralelizables (N4: válido, el sweep NO corrige el gap).

```yaml
sequential_chains:
  - [Issue 1, Issue 5] # share src/lib/notifications/useNotifications.ts
parallelizable_issues: [Issue 2, Issue 3, Issue 4]
```

## Extras (non-required sections)

- ## Sequencing: (verbatim — process, skipped as unit)
- ## Out of scope: (verbatim — process, skipped as unit)

## Grounding (Phase 3.4 — appended post-freeze)

> Ausente a la hora del parse — este expected ES el output de Phase 0.5. El orquestador agrega esta sección después de que corre el grounding de Phase 3.4 (`SKILL.md §12.4`): una fila por afirmación del plan (cita textual + clase `HECHO`/`INFERENCIA`/`SUPUESTO`/`DESCONOCIDO` + consulta corrida + veredicto). Aditivo: no toca la descomposición congelada (RF1) ni mueve `Decomposition hash:`.
