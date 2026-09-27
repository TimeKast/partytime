---
description: Pre-release readiness check (mechanical) — vulns/migrations bloqueantes + dead-code/bundle/Lighthouse advisory → veredicto READY/WARNINGS/NOT-READY. Optional security-audit chaining (standalone only).
argument-hint: '[--t1] [--security-audit]'
---

# /preflight

Corre el check de readiness pre-release: las herramientas que `pnpm verify` NO cubre (código muerto, vulnerabilidades, drift de migrations, tamaño de bundle, Lighthouse) → reporte + veredicto. Mecánico, sin agentes.

**Argumentos:** `$ARGUMENTS` — `--t1` corre solo el sweep estático rápido (sin levantar la app). Vacío → full (T1 + Lighthouse). `--security-audit` (ortogonal al tier) → tras el report, encadena el agente `security-auditor` sobre el código del issue/epic activo.

---

## Instrucciones al agente

1. **Invocar skill `tk-preflight`** — leer `.claude/skills/tk-preflight/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS`:
   - `--t1` → tier T1 (sweep estático; salta el lifecycle de app + Lighthouse).
   - (vacío) → full (T1 + T2).
   - `--security-audit` → encadenar `security-auditor` tras el report (Phase 4 del SKILL), sin pregunta interactiva.
3. Ejecutar las fases del SKILL: T1 vía `scripts/tools/preflight.ts` (script = SSOT mecánico); T2 (si full) orquesta build + server + lhci.
4. Surfacea el report en lenguaje plano (CC.md §3). Standalone = informativo (no bloquea nada).
5. Security audit opcional (Phase 4 del SKILL): con `--security-audit` encadena directo; sin flag, en sesión interactiva pregunta `[y/n]`. **Headless / no-TTY: degrada silenciosamente** — no pregunta, ignora el flag y no lanza error (el audit con agente requiere un humano que lea los findings).

No re-implementar las verificaciones en el agente — el script las corre. No commitear nada.

---

## Relación con `/deploy`

`tk-deploy` Phase 1.6 corre el **script directo** como gate antes de mergear a main: `pnpm build` + `pnpm preflight --t1` en `release`, `pnpm preflight --t1` en `ship` post-release — sin Lighthouse (advisory, solo standalone). `/preflight` standalone es el check completo corrido on-demand, informativo, sin deployar. El encadenamiento de `security-auditor` **nunca dispara en el path de deploy**: el gate corre el script sin cargar el skill, así que ni el flag ni la pregunta existen ahí (guard por arquitectura).

---

_TimeKast Factory — /preflight thin wrapper_
