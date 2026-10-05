---
description: Share a derived repo with outside collaborators without the methodology — prepare, cut to a clean-history repo, reconnect, invite.
argument-hint: '[--step]'
allowed-tools: AskUserQuestion
---

# /prune

Guía al Project Owner para compartir este repo con colaboradores externos sin la metodología: prepara el repo, decide qué datos ven, corta a un repo cuya historia nunca la tuvo, reconecta Vercel y la bóveda, cierra el repo viejo e invita a los colaboradores.

**Argumento:** `$ARGUMENTS` — `--step` para en cada checkpoint. Sin argumentos, Phase 0 explica el modelo y pregunta el tier y los colaboradores.

---

## Instrucciones al agente

1. **Invocar skill `tk-prune`** — leer `.claude/skills/tk-prune/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS`: `--step` → para en cada checkpoint.
3. **Crear TodoWrite** con Phase 0 → Phase 8 desde el inicio.
4. Respetar los checkpoints de `tk-prune/SKILL.md`; el corte pasa por Plan Mode. Headless: no se corre.
5. No ejecutar de memoria. No saltar fases.

---

## Flujo

```
/prune → (por cada PR de colaborador) /integrate
```

---

_TimeKast Factory — /prune thin wrapper_
