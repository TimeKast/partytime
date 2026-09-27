---
name: tk-preflight
description: Coding-family mechanical pre-release readiness check: static sweep (dead code, dep audit, migration journal, bundle and pgEnum advisories) plus Lighthouse advisory, emitting a report with a READY / READY-WITH-WARNINGS / NOT-READY verdict; standalone-only chainings for pgEnum promotion and an optional security audit. Invoked via `/preflight`; the `/deploy` gate calls `pnpm preflight --t1` directly without loading this skill. Thin orchestrator over `scripts/tools/preflight.ts`.
family: coding
model: sonnet
parallelism_unit: none
concurrency_cap: 1
auditor_step: false
last-verified: 2026-09-22
user-invocable: false
---

# tk-preflight — `/preflight` Readiness Check

> **Propósito:** verificar que un proyecto del kit está **shippable** antes de un release, corriendo las herramientas mecánicas que `pnpm verify` NO cubre (código muerto, vulnerabilidades, drift de migrations, tamaño de bundle, Lighthouse) y emitiendo un veredicto. **Sin agentes en el sweep** — la lógica mecánica vive en `scripts/tools/preflight.ts`; este skill es la capa delgada que orquesta el lifecycle de la app (para Lighthouse) y surfacea el report. Único opt-in con agente: encadenar `security-auditor` al final, **solo en modo standalone** (Phase 4).

> **Architectural principle:** el script `scripts/tools/preflight.ts` es el **SSOT** del sweep mecánico (corre tools → parsea → ensambla report → veredicto). El skill **no re-implementa** ninguna verificación: solo (a) decide tier, (b) levanta/baja el server para T2, (c) surfacea el report en lenguaje plano.

> **Slash command:** `/preflight [--t1] [--security-audit]` (wrapper en `.claude/commands/preflight.md`). El gate de `/deploy` corre el script directamente (`pnpm preflight --t1`) sin cargar este skill — ver `tk-deploy` Phase 1.6.

---

## 1. Cuándo usar

- **Standalone:** audit manual on-demand — antes de un release que tocó UI/perf, o cuando quieres saber "¿qué tan shippable estoy?". `/preflight` (full, incluye Lighthouse advisory) o `/preflight --t1` (sweep rápido).
- **Gate de `/deploy`:** `tk-deploy` Phase 1.6 corre `pnpm preflight --t1` directo (script, sin este skill) — en release además corre `pnpm build` antes. Lighthouse no participa del gate.

**No usar para:** revisión profunda de código / arquitectura (eso lo cubre la herramienta de review del runtime — CLI, fuera del scope del kit); QC per-epic (eso es `/implement` Phase 4); correr los tests (eso es `pnpm verify` / `pnpm test`).

---

## 2. Tiers (acumulativos)

| Tier | Qué corre | Headless-safe | Costo |
| --- | --- | --- | --- |
| **T1 — Sweep estático** | knip (código muerto, capea en warn) + `pnpm audit --prod` (vulns) + `drizzle-kit check` (journal de migrations) + bundle size (**advisory** — N/A sin `.next/static/chunks`; cache local, no validado contra el commit actual) | ✅ T1 completo | Barato |
| **T2 — Lighthouse** *(solo full)* | T1 + **Lighthouse** (perf/a11y/best-practices/seo, mediana multi-report) sobre la app levantada — **advisory**: capea en warn, nunca produce NOT-READY por sí solo (score local no determinista) | ⚠️ degrada graceful (Chromium/server ausentes → N/A) | Medio |

`--t1` corre solo T1 (sin levantar la app). El default (full) corre T1+T2.

**Bloqueantes reales del veredicto:** audit (high/critical) y migrations (high). Knip, bundle y Lighthouse son advisory (máximo READY-WITH-WARNINGS).

---

## 3. Flow

```
Phase 0  tier + flags  (--t1 vs full · --security-audit)
Phase 1  T1 sweep      → pnpm preflight --t1 --json  (knip/audit/migrations/bundle)
Phase 2  T2 (si full)  → build (si falta) → start server (bg) → lhci collect → kill → ingest
Phase 3  veredicto     → surfacea report plano (informativo)
                         → si el advisory de enums reportó candidatos: ofrece encadenar
                           `pnpm db:harden-enum <nombre>` [y/n] (SOLO standalone, TTY)
Phase 4  security-audit opcional (SOLO standalone) → --security-audit o pregunta [y/n] → spawn security-auditor
```

---

## 4. Phases

### Phase 0 — Tier

- Parsea `$ARGUMENTS`: `--t1` → tier T1; sin flag → full. `--security-audit` → encadena Phase 4 sin pregunta interactiva (ortogonal al tier).
- TodoWrite opcional (workflow corto).

### Phase 1 — T1 sweep (script)

- Corre `pnpm preflight --t1 --json` (o sin `--json` para el report formateado). El script hace todo el trabajo mecánico de T1 y devuelve report + veredicto + exit code (0 READY/WARN, 1 NOT-READY).
- **Derivados sin la entry `preflight` en `package.json`** (dev-owned; repos bootstrapeados antes de que el script entrara al boilerplate): invocar el script directo — `pnpm exec tsx scripts/tools/preflight.ts --t1 --json`. Si el archivo tampoco existe (cerebro viejo / perfil core) → correr inline solo los checks bloqueantes (`pnpm audit --prod` + `drizzle-kit check`) y sugerir `factory:update`.
- Si `--t1` → saltar a Phase 3 con el resultado.

### Phase 2 — T2 readiness (solo full; lifecycle de la app)

Lo NO-mecánico que el script no hace (necesita la app corriendo):

1. Si `.next/` no existe → `pnpm build` (background; CC notifica al terminar).
2. Levantar `pnpm start` en **background**; esperar a que `http://localhost:3000` responda.
3. `pnpm lighthouse:collect` (escribe `.lighthouseci/`).
4. **Bajar el server** (kill del proceso background) — siempre, incluso si lhci falló.
5. `pnpm preflight --json` (full) — el script corre T1 + **ingiere** `.lighthouseci/` (mediana sobre todos los reports) para el veredicto unificado.

> **Degrade graceful:** si no hay Chromium / la app no levanta / no hay DB → Lighthouse y bundle se marcan `⚪ N/A` (el script ya lo maneja), no se bloquea el run. El veredicto se calcula sobre lo que sí corrió.

### Phase 3 — Veredicto

- Surfacea el report en **lenguaje plano** (es-MX): veredicto + counts por severidad + top findings. No volcar el JSON crudo.
- Informativo — muestra el report. No bloquea nada por sí mismo. Si el encadenamiento de enums y Phase 4 no aplican (sin candidatos/flag, sin TTY, o el user responde `n`), el run termina aquí.

**Encadenamiento de promoción de enums (SOLO standalone, TTY):** si el check `Enum registry (pgEnum advisory)` del report trae candidatos:

1. Preguntar: `¿promover alguno a pgEnum?` — dos opciones excluyentes sin campo de texto, así que **migra** a la vía estructurada por default; `[y/n]` es el fallback sin la tool (`CC.md §3`). `n` → seguir a Phase 4.
2. `y` → listar los candidatos del detail del advisory (key del registry + `tabla.columna` + values) y dejar que el user elija — opciones estructuradas por default, tabla numerada como fallback sin la tool (`CC.md §3`). El listado con sus valores es la **presentación** y se emite completo en las dos vías.
3. Correr `pnpm db:harden-enum <nombre>` (driver asistido — `sk-db §1.1`): valida huérfanos en vivo vía `db:query` (STOP si hay), actualiza el schema TS a `pgEnum` y genera la migration revisable vía drizzle-kit con guard apply-time + rollback comentado. **NUNCA la aplica** — el user revisa y corre `pnpm db:migrate` cuando esté lista.
4. **Headless / no-TTY:** nunca dispara — no hay quién responda la pregunta (mismo degrade que Phase 4).

> **Guard de deploy por arquitectura (igual que Phase 4):** el gate de `/deploy` corre el _script_ `pnpm preflight --t1` sin cargar este skill → el script solo imprime el advisory y este encadenamiento **no existe en el path de deploy**. No se necesita lógica de modo.

### Phase 4 — Security audit opcional (SOLO standalone)

Tras el veredicto, ofrecer encadenar un audit de seguridad sobre el código del issue/epic activo. Es el único punto del skill que spawnea un agente, y es opt-in:

- **Activación:**
  - Flag `--security-audit` en `$ARGUMENTS` → encadena directo, sin pregunta.
  - Sin flag, en sesión interactiva (TTY) → preguntar `¿correr security-audit sobre el código del issue/epic activo?` — **migra** a la vía estructurada por default (dos opciones excluyentes, sin texto libre); `[y/n]` es el fallback sin la tool (`CC.md §3`). `n` → terminar normal.
  - **Headless / no-TTY:** NUNCA dispara — sin flag no hay quién responda la pregunta, y con flag se ignora silenciosamente (degrade sin error). El audit con agente necesita un humano que lea los findings.
- **Spawn `security-auditor`** con **`model: opus` explícito** y `phase: "Phase 4 — security audit opt-in"`, citando paths literales de skills en el prompt (CC.md §2): `consulta antes de empezar: .claude/skills/sk-security/SKILL.md`.

  > 🔴 **El `model` explícito es load-bearing aquí, no ceremonia.** Este skill corre en `model: sonnet` (su frontmatter), y un spawn sin `model:` hereda el de la sesión. Sin el explícito, un audit de seguridad —el pase que existe para encontrar lo que nadie más va a encontrar— correría en el modelo barato del workflow que lo invoca, en silencio y sin que nada lo reporte. El `model` per-spawn gana sobre el frontmatter del agente ([`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md)), así que declararlo aquí lo blinda de las dos vías: de la herencia de sesión y de que alguien baje la ficha por descuido.
- **Scope:** SOLO el código del issue/epic activo — los archivos modificados aún no deployados (`git diff --name-only origin/main...HEAD`, o el rango de commits del epic activo si el user lo indica) — NO el kit base completo.
- **Output:** findings clasificados en la escala nativa del auditor — `Critical`/`High`/`Medium`/`Low` (agent card de `security-auditor`) — cada uno con qué/dónde/por qué/impacto/fix, surfaceados en lenguaje plano. Es la misma escala y el mismo contrato que usa `/implement` Phase 4.6 — un solo agente, un solo vocabulario entre sus dos consumidores. **Informativo** — standalone no bloquea nada (§5); el gate que muerde con estos findings (`Critical`/`High` bloquean, `Medium`/`Low` no) vive en `/implement` Phase 4.6.
- **Guard de deploy (por arquitectura, sin lógica de modo):** el gate de `/deploy` corre el _script_ `pnpm preflight --t1` directo, **sin cargar este skill** (`tk-deploy` Phase 1.6) → este encadenamiento **nunca dispara durante un deploy**, exista o no el flag. El guard es gratis: no hay skill cargado, no hay Phase 4.

---

## 5. Gate de deploy — vive en tk-deploy

Este skill NO define checkpoints de gate. Cuando el readiness check actúa como gate de `/deploy`, el STOP, sus opciones y el fallback headless los define `tk-deploy` Phase 1.6 (referencia, no redefinición — CORE.md §4). Como standalone, `/preflight` es informativo siempre, también headless.

> **Sin CP1/CP2 de Plan Mode** — `tk-preflight` no escribe código ni toca DB (solo puede generar `.next/` si buildea para T2), no dispara `CC.md §4` (HIGH reversal cost). El encadenamiento de enums de Phase 3 es la excepción acotada: el driver `db:harden-enum` escribe schema TS + migration **revisables** tras confirmación explícita del user, y jamás aplica nada a la DB (el apply sigue siendo `pnpm db:migrate` manual).

---

## 6. Output + invalidation

- **Artifact único:** el report markdown (stdout del script / `templates/PREFLIGHT-REPORT.template.md` como shape). No se persiste a disco por default (efímero en el turn); el orchestrator puede guardarlo si el user lo pide.
- **Invalidation (light, read-only):** si un check falla a mitad → re-run de ese tier (no hay artifact durable a medio escribir). Si el user cambia tier → re-corre desde Phase 1. El server de Phase 2 **siempre** se baja (incluso en error) para no dejar procesos colgados.

---

## 7. Subprocess delegation

**Ninguno en el sweep mecánico.** Toda la lógica mecánica está en `scripts/tools/preflight.ts` (testeable, headless-safe); Phases 0-3 orquestan tools, no subprocesos.

**Excepción opt-in (Phase 4, SOLO standalone):** `security-auditor` (keep genérico, cross-workflow) — spawneado únicamente si el user lo pide (`--security-audit` o `[y/n]` interactivo). Solo report, sin Write. Nunca en el path de deploy (el script corre sin este skill) ni en headless.

---

_TimeKast Factory — tk-preflight (readiness check, mecánico)_
