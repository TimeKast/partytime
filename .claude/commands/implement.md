---
description: Implement a whole backlog epic cohesively (plan once → serial issues with atomic commits → integrate → close). Secondary single-issue mode for fixes.
argument-hint: '[EPIC-NN | ISSUE-ID] [--next | --only ID[,ID] | --start-at ID | --plan] [--keep-artifacts] [--step] [--verbose]'
---

# /implement

Corre el workflow `tk-implement` (v2, epic-first serial).

**Argumento:** `$ARGUMENTS` — modo dispatch:

- `EPIC-NN` → **epic mode**: planea el epic (CP-A) y ejecuta sus issues en serie.
- `ISSUE-ID` → **issue mode**: un solo issue (fix/one-off).
- `--next` → primer epic con un issue `ready` según `EXECUTION-ORDER.md`.
- `EPIC-NN --only ID[,ID]` → subset explícito de issues.
- `EPIC-NN --start-at ID` → resume desde ese issue hasta el final.
- `EPIC-NN --plan` → solo hasta CP-A (plan aprobado, sin ejecutar).
- `--keep-artifacts` → opcional: conserva `project/implement-artifacts/{run-id}/epic-plan.md` tras Phase 5 (close epic) para audit retroactive. Sin flag, el cleanup borra el plan al cerrar.
- `--step` → override del modo fluido: convierte el alto liviano entre grupos en una pausa ("¿sigo?"). `--verbose` → amplía resúmenes. Default = **fluido** = comportamiento de hoy en implement (CP-A/CP-B ya paran; ver `SKILL.md §8` + `fx-workflow-authoring §7.1`).
- (vacío) → Phase 0 pregunta.

> Desambiguación: arg que matchea `^EPIC-\d+` → epic mode; cualquier otro `{DOMAIN}-{NNN}` → issue mode.

> **Path migration:** desde este release, el `EPIC-PLAN` persiste en `project/implement-artifacts/{run-id}/epic-plan.md` (no en `.claude/transitions/`). Phase 0 detecta planes en el path legacy y los migra automáticamente con un warning.

---

## Instrucciones al agente

1. **Invocar skill `tk-implement`** — leer `.claude/skills/tk-implement/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS` (modos arriba). Vacío → Phase 0 pregunta.
3. **Crear TodoWrite** desde Turn 1 (fases + un todo por issue del SELECTION SET).
4. Ejecutar respetando los **turn boundaries** y checkpoints del SKILL.md:
   - **CP-A** (post-plan, Plan Mode) — aprobar el plan = autorizar el epic.
   - **CP-B** (post-ejecución, inline) — review final; push/merge se decide aparte.
5. No ejecutar de memoria. No saltar fases. No commitear sin CP-A aprobado; no push sin autorización (GIT.md §2).

El SKILL.md es dueño de toda la semántica (fases, checkpoints, B1, delegación). Este wrapper no la duplica ni la redefine (`fx-workflow-authoring §12`).

---

## Pipeline

```
/discovery → /design → /backlog → /implement → /deploy
```
