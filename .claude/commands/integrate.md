---
description: Integrate an outside collaborator's fork PR into a pruned repo — history audit, path refusal before checkout, local verify, merge as a member.
argument-hint: '<número-de-PR> [--step]'
allowed-tools: AskUserQuestion
---

# /integrate

Integra el PR que un colaborador externo abrió desde su fork a un repo compartido sin la metodología (`/prune`): audita la historia, rechaza por ruta antes del checkout, explica el cambio, corre `pnpm verify` en tu máquina y mergea a la rama de trabajo como socio.

**Argumento:** `$ARGUMENTS` — el número del PR. `--step` para en cada checkpoint. Si está vacío, Phase 0 lista los PRs abiertos (`gh pr list`) y pregunta cuál.

---

## Instrucciones al agente

1. **Invocar skill `tk-integrate`** — leer `.claude/skills/tk-integrate/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS`: número de PR → modo explícito; `--step` → para en cada checkpoint; vacío → preguntar el PR.
3. **Crear TodoWrite** con Phase 0 → Phase 6 desde el inicio.
4. Respetar los checkpoints de `tk-integrate/SKILL.md`. El rechazo de `factory prune check-pr` no se relaja nunca.
5. No ejecutar de memoria. No saltar fases.

---

_TimeKast Factory — /integrate thin wrapper_
