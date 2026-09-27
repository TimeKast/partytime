# Methodology — Factory Tickets (intake-drift / sk-drift / workflow-drift)

> Sub-file of `tk-discovery/methodology/`. See parent `methodology.md` for the full index.
> Topical scope: puntero a la convención canónica de factory-tickets (que ya no vive aquí), las pipeline rules **locales** de `/discovery`, y la bibliografía interna del workflow.

---

## §13 — Factory-Ticket Pattern → se mudó a la skill `fx-factory-tickets`

**La convención canónica de factory-tickets** —qué es un ticket, tipos y naming, shape, campos por tipo, `Estado`, higiene de contenido y trigger rules— vive en [`.claude/skills/fx-factory-tickets/SKILL.md`](../../fx-factory-tickets/SKILL.md). Es una primitiva del kit, no del Discovery: se carga por ruteo semántico desde cualquier workflow, sin haber corrido `/discovery`.

Lo que queda abajo es **solo la mecánica local** de cómo `/discovery` maneja un ticket dentro de una corrida — ininteligible fuera de este workflow, y por eso no viaja a la skill.

### §13.1 Pipeline rules dentro de `/discovery` (local)

- Pipeline NO se detiene por tickets. Agent escala + continúa con `[MARKER]` en output estructurado (ej: `[MEDIA-PENDING-STRATEGY]`, `[SK-DRIFT-FEATURE]`).
- Si ≥1 ticket emitido en un run → orchestrator surface count al user al cierre de la fase correspondiente (Phase 1 para intake, Phase 5 para kit).
- Tickets **no bloquean** CP1/CP2 — son feedback async para Factory.

### §13.2 Candidates de `workflow-drift` (orchestrator surfacea, user emite)

Los umbrales concretos de este workflow para la condición que la skill declara en genérico (_"el schema o la estructura del propio workflow no aloja bien la información que el run produjo"_):

- Edge bucket de un FT Tier L excede **500 chars** → candidate "schema 8-fields insuficiente para state machines"
- **≥2 FTs Tier L en mismo run** disparan la regla above → elevar a ticket material
- **>8 [INFERRED] tags** en Firm Decisions de un run → candidate "Phase 3 Gap Interview insuficiente" (gap rate alto sugiere workflow gap)
- Agent `dsc-feature-specer` retorna error "Tier L received in batch" → workflow-drift "Phase 4a tiering pass missed Tier L"

---

## §14 — Bibliografía interna

- `SKILL.md` — workflow operacional (entry point ejecutable)
- `templates/00_DISCOVERY_BRIEF.template.md` — shape canónico del output brief
- `templates/project-config.template.md` — shape canónico del project-config
- `.claude/agents/dsc-intake-analyst.md` — subagent Phase 1 (implementa `methodology/intake.md §2.1` strategies + §10 schema)
- `.claude/agents/dsc-kit-analyst.md` — subagent Phase 5 (implementa `methodology/kit-leverage.md §12` schema)

---

_TimeKast Factory — Discovery methodology / factory tickets (sub-file)_
