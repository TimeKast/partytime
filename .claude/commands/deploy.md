---
description: Ship or release to main — merge source branch with optional bump+CHANGELOG+tag, Factory-aware selective merge.
argument-hint: '[ship | release [--patch|--minor|--major] [--as-is] [--skip-verify] [--skip-preflight]] [--step] [--verbose]'
---

# /deploy

Mergea la branch de trabajo a `main` para que Vercel construya producción/preview. Dos modos: `ship` (sin bump) o `release` (bump semver + CHANGELOG + tag `vX.Y.Z`).

**Argumento:** `$ARGUMENTS` — `ship` / `release` / `release --patch|--minor|--major` / `release --as-is` / `release --skip-verify` / `--skip-preflight` / `--step` / `--verbose`. Si está vacío, Phase 0 pregunta el modo.

---

## Instrucciones al agente

1. **Invocar skill `tk-deploy`** — leer `.claude/skills/tk-deploy/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS`:
   - `ship` / `release` → modo explícito, saltar pregunta en Phase 0.
   - `release --patch|--minor|--major` → release con bump explícito (Phase 2 salta auto-suggest).
   - `release --as-is` → taggea la versión que ya está en `package.json` sin re-bumpear (Phase 2 salta el bump, mantiene CHANGELOG + tag). Para versiones decididas por política (eras, rebranding).
   - `release --skip-verify` → release sin `pnpm verify` (Phase 1.5 salta).
   - `--skip-preflight` → salta solo el **sweep** de readiness de Phase 1.6; el build de release corre siempre. Combinable con cualquier modo.
   - `--step` → override del modo fluido: para en cada checkpoint (paso-a-paso legacy). `--verbose` → amplía el resumen/STOP de cada CP. Ambos ortogonales a ship/release (ver `SKILL.md §Checkpoints` + `methodology/modes.md`).
   - (vacío) → Phase 0 pregunta el modo.
3. **Crear TodoWrite** con Phase 0 → Phase 7 + 4 CPs desde el inicio del Turn 1.
4. Ejecutar las fases en orden desde el SKILL.md monolítico. Phase 1.5, 2, 4.6 son condicionales (ver SKILL.md §Flow overview). Leer las `methodology/*.md` referenciadas por cada fase cuando lo pida (auto-bump, factory-exclusions, post-release-transition).
5. Respetar los 4 checkpoints definidos en `tk-deploy/SKILL.md`. Push a main NO tiene CP propio — el harness pide permiso al ejecutar `git push` (GIT.md §2 cumplido vía runtime).

No ejecutar de memoria. No saltar fases. No commitear ni pushear sin pasar por los checkpoints correspondientes.

---

## Flujo en la pipeline

```
/implement (issues a source) → /deploy → Vercel auto-deploy
```

---

_TimeKast Factory — /deploy thin wrapper_
