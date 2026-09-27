---
name: tk-deploy
description: Coding-family workflow that ships changes to main — ship-only (merge without bump) or a versioned release (auto-bump + CHANGELOG + tag) with Factory-aware selective merge, post-release transition, and read-only observation of the production deploy on Vercel or Railway. In the Factory it also cuts the `cli-v*` and `gui-v*` satellite tags on the same merge commit. Primary invocation is `/deploy [ship|release [--patch|--minor|--major] [--skip-verify]]`; do not run it outside that command.
family: factory-internal
model: opus
parallelism_unit: none
concurrency_cap: 1
auditor_step: false
last-verified: 2026-09-23
user-invocable: false
---

# tk-deploy — Ship or Release to main

> **Propósito:** ejecutar el merge de la branch de trabajo a `main` con dos modos claros — `ship` (solo deploy, sin bump) o `release` (bump + CHANGELOG + tag). Aplica selective merge en Factory (excluye planning/backlog/runbooks); usa el flow estándar en proyectos derivados.
> **Architectural principle:** trust the harness — el permission prompt del runtime es el gate de push; los checkpoints explícitos son solo para decisiones del workflow (validation, CHANGELOG review, conflictos).
> **Anterior:** `/implement` (mergea issues a la source branch).
> **Siguiente:** el deploy automático del destino del repo — Vercel o Railway, según `target` en `.timekast/provision.json` (preview en pre-release, production en post-release).

Este SKILL.md es monolítico — todas las fases viven inline abajo. Companions: `methodology/*.md` (schemas detallados) + `templates/*.template.md` (artifacts). Lee la sección `methodology/X` referenciada cuando una fase lo pida.

---

## Invocación

```
/deploy                          # Phase 0 pregunta ship vs release
/deploy ship                     # merge source → main, sin bump/CHANGELOG/tag
/deploy release                  # auto-bump desde commits + CHANGELOG + tag
/deploy release --patch          # bump explícito (skip auto-suggest)
/deploy release --minor
/deploy release --major
/deploy release --as-is          # taggea la versión actual de package.json sin re-bumpear
/deploy release --skip-verify    # release sin pnpm verify (override default)
/deploy release --skip-preflight # release sin el sweep de readiness (el build de Phase 1.6 corre siempre)
```

---

## 🔴 Anti-Drift Rules

1. **NUNCA pushear sin autorización del runtime.** El permission prompt al ejecutar `git push` es el gate — no se simula ni se bypassea (GIT.md §2).
2. **NUNCA mergear sin pasar por CP4 cuando hay conflictos.** Resolución silenciosa contamina main con decisiones no auditadas. _Excepción determinística (Factory):_ los conflictos DENY-scoped pre-resueltos en Phase 4.3.1 (`project/*` salvo `reference/`, `src/app/showcase/*` — paths que el DENY saca de main) NO cuentan como "conflictos" para CP4 — son deletions determinísticas **auditadas** (loggeadas), no decisiones. CP4 sigue disparando para conflictos reales en paths que SÍ viajan a main.
3. **NUNCA bumpear `version` en Factory.** Factory bumpea `factoryVersion` **y** `agentKitVersion` al **mismo** número en cada release (modelo dual alineado en origen — DISTRIBUTION_DESIGN §3); `version` queda en `0.0.0` permanente. En derivados, al revés: bumpea solo `version`.
4. **NUNCA `git merge main` desde la source branch post-release** (BR-FACTORY-004). Borraría silenciosamente paths develop-only que el selective merge excluyó. Si necesitas algo de main en source, cherry-pick.
5. **NUNCA `--no-verify` en commits del workflow.** Phase 4.5 regenera autogen explícito; el merge commit puede pasar por pre-commit limpio. Excepción: solo si pre-commit hook entra en loop infinito (documentar).
6. **NUNCA saltar Phase 4.5 (autogen regen) en Factory.** Sin esto, main queda con `INVENTORY.md` / `CODEBASE.md` / `HOOKS.md` desincronizados respecto al `src/` mergeado.

---

## TodoWrite obligatorio

Al iniciar (Turn 1), crear TodoWrite con items para Phase 0 → Phase 7 + 4 checkpoints. Un solo `in_progress` a la vez. Marcar cada fase `completed` al terminarla.

```
- [ ] Phase 0 — Mode detect
- [ ] Phase 1 — Pre-deploy checks (CP1) + destino del deploy (§1.4, solo derivados)
- [ ] Phase 1.5 — Quality verify   ← solo si SHOULD_VERIFY
- [ ] Phase 1.6 — Readiness gate   ← release: build + sweep T1 / ship post-release: sweep T1 (--skip-preflight salta solo el sweep)
- [ ] Phase 2 — Bump + CHANGELOG (CP2)   ← solo si MODE='release'
- [ ] Phase 3 — Inspect origin/main (CP3 conditional)
- [ ] Phase 3.5 — Bump líneas satélite (cli/ · desktop/)   ← solo IS_FACTORY, si cambiaron
- [ ] Phase 4 — Merge (CP4 conditional)
- [ ] Phase 4.5 — Autogen regen
- [ ] Phase 4.6 — Factory selective DENY   ← solo si IS_FACTORY
- [ ] Phase 5 — Commit + tag
- [ ] Phase 6 — Push (harness gate)
- [ ] Phase 7 — Post-release + return   ← incluye 7.5.7: observar el deploy real en el destino (Vercel o Railway)
```

---

## Flow overview

```
Phase 0 (mode detect) → Phase 1 (precheck) → 🛑 CP1
  → Phase 1.5 (verify, release only) → Phase 1.6 (readiness gate: build + sweep) → Phase 2 (bump + CHANGELOG) → 🛑 CP2
  → Phase 3 (inspect main) → 🛑 CP3 (conditional)
  → Phase 3.5 (bump satélites: cli/ · desktop/) → 🛑 STOP por línea (conditional, Factory)
  → Phase 4 (raw merge) → 🛑 CP4 (conditional, conflicts)
  → Phase 4.5 (autogen regen) → Phase 4.6 (Factory DENY, conditional)
  → Phase 5 (commit + TODOS los tags: v* kit + cli-v*/gui-v* satélites) → Phase 6 (push, harness gate)
  → Phase 7 (post-release + return)
```

> 🔴 **Todos los tags nacen en Phase 5**, sobre el merge commit que ya está en `main`. Eso es lo que
> los hace ancestros de `main` **por construcción** — y las Actions `cli-publish.yml` /
> `gui-release.yml` rechazan cualquier tag que no lo sea.

Fases condicionales: **1.5** (solo release sin `--skip-verify`), **1.6** (readiness — release: build siempre + sweep T1; ship post-release: sweep T1; `--skip-preflight` salta solo el sweep), **2** (solo release), **3.5** (bump de `cli/`/`desktop/` si cambiaron, solo Factory — corre en release **y** ship), **4.3.1** (Factory pre-resuelve conflictos DENY-scoped antes de CP4), **4.6** (solo `is_factory: true`), **7.5.5** (verify de las Actions satélite, solo Factory + si 3.5 bumpeó), **7.5.6** (verify dist-release, solo Factory + release), **1.4** (destino del deploy — solo derivados: resuelve y registra `target`), **7.5.7** (observar el deploy en el destino que registra `target`, Vercel o Railway — corre en `ship` **y** `release`; degrada a `⏭️` sin `target`, sin los ids del destino o si no puede leer el token del rail). CP3 y CP4 solo disparan si hay commits inesperados / conflictos reales (los DENY-scoped se pre-resuelven en 4.3.1).

---

## Modes (resumen — detalle en `methodology/modes.md`)

> **Tag** en esta tabla = el tag **del kit** (`v*`). Los tags **satélite** (`cli-v*` / `gui-v*`) son
> ortogonales al modo: los corta Phase 5.4 en `release` **y** en `ship`, siempre que Phase 3.5 haya
> bumpeado esa línea. Publicar el CLI sin marcar versión del kit = `/deploy ship`.

| Modo                                | Bumpea      | CHANGELOG | Tag | Verify       | Cuándo                                                                     |
| ----------------------------------- | ----------- | --------- | --- | ------------ | -------------------------------------------------------------------------- |
| `ship`                              | No (el kit) | No        | No (`v*`); **sí** `cli-v*`/`gui-v*` si 3.5 bumpeó | No | Solo mandar cambios a producción/preview, sin marcarlos como versión nueva. **También es el camino para publicar el CLI/launcher sin bumpear el kit** |
| `release`                           | Sí          | Sí        | Sí  | Sí (default) | Versión semver oficial — auto-bump desde Conventional Commits              |
| `release --patch\|--minor\|--major` | Sí (forced) | Sí        | Sí  | Sí (default) | Override del auto-bump cuando sabes el tipo                                |
| `release --as-is`                   | No          | Sí        | Sí  | Sí (default) | Versión ya fijada en `package.json` (política: eras, rebranding) — taggea sin re-bumpear |
| `release --skip-verify`             | Sí          | Sí        | Sí  | No           | Release sin correr `pnpm verify` (ya validaste a mano)                     |

**First release derivado** (`!is_factory && version='0.0.0' && mode=release`): Phase 2 pregunta target version (default `1.0.0`), salta auto-bump. Triggerea transición one-way a post-release en Phase 7.

---

## Checkpoints (resumen) — modo fluido (default) / `--step`

Per [`fx-workflow-authoring §7.1`](../fx-workflow-authoring/SKILL.md), el default es **fluido**: un checkpoint
para SOLO ante **señal real**; sin señal auto-avanza con resumen. `--step` restaura el STOP en cada CP. Templates
en `templates/checkpoint-cp{N}.template.md`.

| CP      | Phase           | `--step` | fluido (default) — para SOLO si…                              |
| ------- | --------------- | -------- | ------------------------------------------------------------- |
| **CP1** | 1               | para     | estado `blocking` (algo falla) o branch ≠ source (§1.2). Estado `valid` → **auto-advance + resumen** |
| **CP2** | 2 (release)     | para     | **para siempre en release** (el CHANGELOG lo cura el user — §2.5/2.6); no aplica en ship |
| **CP3** | 3 (conditional) | para     | `origin/main` tiene commits inesperados (ya condicional)     |
| **CP4** | 4 (conditional) | para     | hay conflictos en merge (ya condicional)                     |

**Otras paradas (señal real — paran en fluido y en `--step`):** Caso B first-release (transición
ONE-WAY — `CC.md §4`), none-bump (decisión genuina ship/force/cancel), §2.6 editar CHANGELOG (release),
**§3.5.2 bump de cada línea satélite** (cortar una línea de release es decisión genuina; headless
degrada a skip silencioso), y las dos paradas de **§1.4** — destino ambiguo (el repo en las dos
plataformas) y `target: railway` sin bloque `railway` — que ofrecen abortar o seguir sin observar el
deploy (headless degrada a seguir sin observar, con la causa en el resumen). Detalle por modo: [`methodology/modes.md`](./methodology/modes.md).

> ℹ️ **Ruta que aparece sola:** si el auto-suggest de §2.3 da `none` (el kit no cambió lo suficiente
> para un release) pero `cli/` sí cambió, la opción `1 = cambiar a ship mode` resuelve el caso
> completo — cae en `ship`, Phase 3.5 bumpea el CLI y Phase 5.4 corta **solo** el tag satélite.

**Gates que SIEMPRE paran (no son checkpoints 1/2/3, fuera de la tabla):** `verify` / build / sweep de
readiness (fail-closed) y el **push a main** — el harness prompt al ejecutar `git push` es el gate
(`feedback_trust_platform`). No se sueltan en ningún modo.

Cuando un CP **para**, espera una elección explícita: por la vía estructurada (`AskUserQuestion`, default interactivo) es la respuesta de la tool; por el fallback de tabla, la respuesta numérica — y ahí texto libre (`ok`/`sí`/`procede`) → re-presentar opciones. Detalle: `CC.md §3` + [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md).

> **Sobre el literal `🛑 STOP — Responde con el número.`** que aparece en los bloques de ejemplo de este skill y en sus templates de CP: es el texto del **fallback de tabla**. Por la vía estructurada no se emite — la elección la recoge la tool y pedir un número sería contradecir la presentación. Los bloques de ejemplo muestran el fallback porque es el que necesita instrucción escrita.

---

# Phase 0 — Mode Detect

**Propósito:** parsear argumentos, leer estado del repo (Factory? branching phase? source branch?) y resolver las variables de contexto que las fases siguientes consumen. Sin STOP — solo announcement breve.

### 0.1 Parse `$ARGUMENTS`

Posibles formas: `(vacío)`, `ship`, `release`, `release --patch|--minor|--major`, `release --as-is`, `release --skip-verify`, `--step`, `--verbose`, combinaciones.

Extraer:

- `MODE` ∈ `{ship, release}` o `null` (si vacío)
- `BUMP_FLAG` ∈ `{patch, minor, major}` o `null`
- `AS_IS` boolean (`--as-is` presente)
- `SKIP_VERIFY` boolean (`--skip-verify` presente)
- `SKIP_PREFLIGHT` boolean (`--skip-preflight` presente — salta solo el sweep T1 de Phase 1.6; el build de release corre siempre)
- `EXEC_MODE` ∈ `{fluido, step}` — `fluido` por default; `step` si `--step` presente (override: para en cada checkpoint — ver §Checkpoints + `fx-workflow-authoring §7.1`)
- `VERBOSE` boolean (`--verbose` presente — amplía el resumen/STOP de cada CP)

Validaciones:

- `BUMP_FLAG` solo válido en `MODE === 'release'`. Si `ship --patch` → STOP: "ship mode no acepta --patch/--minor/--major; usa release".
- Solo un `BUMP_FLAG` a la vez. Si `--patch --minor` → STOP.
- `AS_IS` solo válido en `MODE === 'release'`. Si `ship --as-is` → STOP: "ship mode no taggea; usa release --as-is".
- `AS_IS` mutuamente excluyente con `BUMP_FLAG`. Si `release --as-is --patch` → STOP: "no se puede forzar bump y taggear as-is a la vez".

### 0.2 Pregunta interactiva (solo si MODE es null)

```markdown
## /deploy — Selección de modo

| #   | Modo        | Qué hace                                                                                               |
| --- | ----------- | ------------------------------------------------------------------------------------------------------ |
| 1   | **ship**    | Merge source → main, sin bump/CHANGELOG/tag. Para mandar a producción/preview sin marcar como versión. |
| 2   | **release** | Bump semver (auto-sugerido desde commits) + CHANGELOG + tag vX.Y.Z. Para versión oficial.              |

🛑 Responde con el número (1=ship, 2=release).
```

Esperar la elección (estructurada por default; respuesta numérica por el fallback de tabla, donde texto libre → re-presentar).

### 0.3 Read state del repo

```bash
CURRENT_VERSION=$(node -p "require('./package.json').version")
FACTORY_VERSION=$(node -p "require('./package.json').factoryVersion || ''")
CURRENT_BRANCH=$(git branch --show-current)
```

Leer `project/planning/project-config.md` (si existe — derivados nuevos pueden no tenerlo). Buscar `is_factory:`. Ausente o `false` → `IS_FACTORY=false`. `true` → `IS_FACTORY=true`.

```bash
IS_FACTORY=$(grep -E '\*\*is_factory\*\*\s*\|\s*true' project/planning/project-config.md 2>/dev/null && echo "true" || echo "false")
```

### 0.4 Resolver variables de contexto

```javascript
// Branching phase: is_factory implica develop-first; sino override o auto-detect
const BRANCHING_PHASE = IS_FACTORY
  ? 'develop-first'
  : PROJECT_CONFIG_BRANCHING || (CURRENT_VERSION === '0.0.0' ? 'pre-release' : 'post-release');

const SOURCE_BRANCH = PROJECT_CONFIG_WORKING_BRANCH || CURRENT_BRANCH;
// En Factory el bump avanza AMBOS campos al mismo número (modelo dual alineado en
// origen — DISTRIBUTION_DESIGN §3). `BUMP_FIELDS` es la lista que Phase 2.4 escribe.
// En derivados solo `version`.
const BUMP_FIELDS = IS_FACTORY ? ['factoryVersion', 'agentKitVersion'] : ['version'];
const BUMP_FIELD = BUMP_FIELDS[0]; // campo primario para auto-bump/announce/grep
const BUMP_FIELD_CURRENT = IS_FACTORY ? FACTORY_VERSION : CURRENT_VERSION;
const CHANGELOG_PATH = IS_FACTORY ? '.claude/docs/CHANGELOG.md' : 'CHANGELOG.md';
const SHOULD_VERIFY = MODE === 'release' && !SKIP_VERIFY;

// Líneas de release SATÉLITE (Factory-only): semver propio, tag propio, Action propia —
// desacopladas del bump dual del kit. Phase 3.5 las bumpea, Phase 5.4 las taggea sobre el
// MISMO merge commit que el del kit. SSOT de la lista: no repetir estos paths ni prefijos
// en ninguna fase.
const SATELLITE_LINES = IS_FACTORY
  ? [
      { key: 'cli', dir: 'cli/', pkg: 'cli/package.json', tagPrefix: 'cli-v', label: '@timekast/factory (CLI npm)' },
      { key: 'gui', dir: 'desktop/', pkg: 'desktop/package.json', tagPrefix: 'gui-v', label: 'launcher de escritorio (Electron)' },
    ]
  : [];

// Commits que el WORKFLOW crea en la source branch. Arranca en 0 y lo incrementan Phase 2.8
// (bump/CHANGELOG del kit) y Phase 3.5 (+1 por línea satélite bumpeada). Las recoveries
// retroceden `HEAD~${BUMP_COMMITS}` — ver §Invalidation handling.
// El commit del destino (§1.4) NO cuenta aquí, a propósito: nace en Phase 1, debajo de todo commit
// contado, así que ningún reset de las recoveries lo alcanza.
// 🔴 Arranca en 0 acá y NO en 2.8, porque 2.8 es release-only: en `ship` con un bump de 3.5
// las recoveries también lo necesitan.
let BUMP_COMMITS = 0;
```

**Resolver `LAST_RELEASE_TAG_VERSION`** (baseline para el modo as-is — Phase 2.3 Caso D):

```bash
# Último tag de release por NOMBRE. El glob `v*` NO matchea `cli-v*` (empieza con 'c').
# 🔴 `grep -vE '[0-9]-'` excluye los PRERELEASES antes de ordenar: `sort -V` los coloca
# DESPUÉS de su release final (`v11.5.0-beta.5` > `v11.5.0`), que es lo contrario de lo
# que dice semver. Sin el filtro, un repo que cortó betas resuelve como "último release"
# una beta ya superada → el auto-detect de Caso D (§2.3) compara `package.json` contra un
# baseline stale y ofrece taggear as-is una versión YA taggeada, que revienta en Phase 5.
# El patrón exige un DÍGITO antes del guion, así que no toca `cli-v*` ni `gui-v*` (ahí el
# guion va precedido de letra). Incidente real: release v11.6.0, 2026-08-10.
LAST_RELEASE_TAG=$(git tag --list 'v*' | grep -vE '[0-9]-' | sort -V | tail -1)
LAST_RELEASE_TAG_VERSION="${LAST_RELEASE_TAG#v}"   # strip 'v'; "" si no hay tag
```

Si no existe ningún tag `v*` → `LAST_RELEASE_TAG_VERSION` queda vacío (`null`). En ese caso el **auto-detect de Caso D se desactiva** (no hay baseline contra qué comparar; first-release lo maneja Caso B). El flag explícito `--as-is` sigue funcionando sin baseline (taggea lo que hay).

### 0.5 Detectar first-release derivado

```javascript
const IS_FIRST_RELEASE_DERIVED = !IS_FACTORY && MODE === 'release' && CURRENT_VERSION === '0.0.0';
```

Usado en Phase 2 (skip auto-bump, preguntar target) y Phase 7 (transición one-way).

### 0.6 Announcement (no es checkpoint)

```markdown
## /deploy — Contexto resuelto

| Item                          | Valor                                             |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------ | --- |
| Modo                          | {ship \| release [--patch\|--minor\|--major]}     |
| Repo                          | {Factory \| derivado}                             |
| Branching                     | {develop-first \| pre-release \| post-release}    |
| Source → target               | `{source}` → `main`                               |
| Bump field                    | `{factoryVersion \| version}` (actual: `{value}`) |
| CHANGELOG path                | `{path}`                                          |
| Verify                        | {on \| off (--skip-verify) \| n/a (ship)}         |
| Readiness (Phase 1.6)         | {build+t1 (release) \| build (release --skip-preflight) \| t1 (ship post-release) \| off (ship --skip-preflight \| ship pre-release)} |
| {si IS_FIRST_RELEASE_DERIVED: | First release                                     | Sí — Phase 2 preguntará target version (default 1.0.0) | }   |

Procedo a Phase 1 — Pre-deploy checks.
```

Continuar a Phase 1 sin esperar respuesta. Crear TodoWrite (ver §TodoWrite arriba).

---

# Phase 1 — Pre-deploy Checks

**Propósito:** validar pre-condiciones antes de cualquier mutación. Computa el estado del repo en silencio (sin emitir STOPs sueltos a stderr) y cierra con un **CP1 fusionado** que renderiza estado válido o estado bloqueante, según lo computado.

### 1.1 Compute state (silencioso)

Los hard-checks ya NO emiten errores sueltos. Solo computan flags + cuentas que CP1 (§1.3) consume:

```bash
git fetch origin                                                                       # blocking, sin output al user
WORKING_TREE_DIRTY=$( [ -n "$(git status --short)" ] && echo "true" || echo "false" )
DIRTY_COUNT=$(git status --short | wc -l | tr -d ' ')
BRANCH=$(git branch --show-current)
COMMITS_AHEAD=$(git log "origin/main..HEAD" --oneline 2>/dev/null | wc -l | tr -d ' ')
UNPUSHED=$(git log "origin/${SOURCE_BRANCH}..HEAD" --oneline 2>/dev/null | wc -l | tr -d ' ')
RECENT_COMMITS=$(git log -5 --oneline)

# Sincronizar tags ANTES de resolver las líneas satélite: `ls-remote` puede devolver un tag
# que el repo local no tiene (clone con refspec angosto, `git tag -d` manual), y entonces el
# `git diff <tag> HEAD` de abajo revienta con `fatal: bad revision` en vez de degradar.
#
# 🔴 NO agregar `--prune-tags` para "limpiar fantasmas": sin `--prune` NO HACE NADA y git
# NO avisa (su propia doc: "does not error out when provided without --prune") — una opción
# que promete y no ejecuta, el mismo patrón que el `$$` del snapshot en 4.1. Y CON `--prune`
# sí borraría tags LOCALES ausentes del remoto, que es justo el estado en que queda una
# recovery de Phase 6 rechazada (tag creado en 5.4, push no autorizado → §6.3).
git fetch origin --tags 2>/dev/null || true

# Detección (NO el prompt) de las líneas satélite — el prompt vive en Phase 3.5.
# Se adelanta acá porque decide si `COMMITS_AHEAD === 0` bloquea (ver abajo).
# Por cada línea de SATELLITE_LINES (§0.4), con su `dir` y `tagPrefix`:
LAST_TAG=$(git ls-remote --tags origin "${TAG_PREFIX}*" | grep -v '\^{}' | sed 's|.*refs/tags/||' \
             | grep -vE '[0-9]-' | sort -V | tail -1)     # excluye prereleases (§0.4)
if [ -z "$LAST_TAG" ]; then
  LINE_CHANGED=true                                        # sin baseline → tratar como cambiada
else
  LINE_CHANGED=$( [ -n "$(git diff --name-only "$LAST_TAG" HEAD -- "$DIR" 2>/dev/null)" ] && echo true || echo false )
fi
# SATELLITE_PENDING = true si ALGUNA línea cambió.
```

> 🔴 **`ls-remote`, no `git tag --list`.** El ref local puede estar ausente o stale (misma
> lección que §3.3 con `SOURCE_PUSHED`), y en la línea `gui-v*` el prune de `gui-release.yml`
> deja el namespace local mayormente fantasma — medido: **17 tags locales contra 1 en origin**.
> Resolver "el último tag" de ahí compararía contra un tag que el remoto ya no tiene.
>
> Los fantasmas **no se podan**, y no hace falta: la resolución sale del remoto, y el `--tags`
> de arriba garantiza que el nombre resuelto exista también en local para el `git diff`. Un
> tag local de más es inerte; borrarlo, en cambio, tiene un modo de fallo real (ver arriba).

**Estado bloqueante** (cualquiera verdadera) — CP1 renderiza modo `blocking` con error inline:

- `WORKING_TREE_DIRTY === "true"` → "Working tree no limpio — `{DIRTY_COUNT}` archivos modificados."
- `BRANCH === "main"` → "Estás en main. Switch a `{SOURCE_BRANCH}` antes de continuar."
- `COMMITS_AHEAD === 0` **Y `SATELLITE_PENDING === false`** → "No hay commits para mergear en main."

> 🔴 **Por qué `SATELLITE_PENDING` desactiva ese bloqueo.** Phase 3.5 crea el commit que
> satisface `COMMITS_AHEAD`, pero corre DESPUÉS de esta fase. Sin la excepción, el caso más
> común de la línea satélite queda sin entrada: tras un `release` donde el usuario respondió
> "4 = no ahora" (o que corrió headless → skip silencioso), `cli/` ya viajó a `main` sin tag,
> `develop` y `main` quedan parejas, y el `/deploy ship` que publicaría el CLI aborta con
> "no hay commits para mergear". Un re-publish puro (bump sin cambio de código) cae siempre ahí.
> Phase 3.5 **re-evalúa al salir**: ahí `COMMITS_AHEAD` sí debe ser ≥ 1 — si sigue en 0, el
> bump no se commiteó y es un error real.

**Estado válido** — CP1 renderiza modo `valid` con la tabla + últimos 5 commits + plan de continuación.

### 1.2 Branch mismatch (single-decision separado)

Cuando estado base es válido (tree limpio, no es main, hay commits) pero `BRANCH !== SOURCE_BRANCH`, NO se mete en el render de CP1 — es decisión real, no error. Se surfacea como AskUserQuestion antes de §1.3:

```markdown
⚠️ Branch actual (`{BRANCH}`) no es working_branch (`{SOURCE_BRANCH}`).

| #   | Acción                                                 |
| --- | ------------------------------------------------------ |
| 1   | usar branch actual (`{BRANCH}`) como source — proceder |
| 2   | switch a `{SOURCE_BRANCH}` antes de continuar          |
| 3   | cancelar                                               |

🛑 STOP — Responde con el número.
```

Resuelta esta pregunta (o si no aplica), continuar a §1.3.

> **Modo (`fx-workflow-authoring §7.1`):** branch ≠ source es **señal real** (criterio §2) → este STOP aplica en fluido y en `--step` por igual. No se auto-avanza.

### 1.3 🛑 CP1 — Pre-deploy validation (fusionado, 2 modos)

Usar `templates/checkpoint-cp1.template.md` con flag `mode` ∈ `{valid, blocking}` decidido en §1.1.

**Modo `valid`** — el estado válido (tree limpio, branch correcta, hay commits) **no encierra decisión**; el control real lo conserva el push gate downstream. Por eso:

- **Fluido (default)** → NO STOP: emitir resumen breve (1 línea — `{MODE}` · `{SOURCE_BRANCH}` → main · `{COMMITS_AHEAD}` commits) y **auto-advance** a §1.4 (solo derivados) y de ahí a la siguiente fase (1.5 si SHOULD_VERIFY; sino 1.6 si activa; sino 2/3). Con `--verbose`, ampliar el resumen con la tabla + últimos 5 commits.
- **`--step`** → STOP con tabla — placeholders: `{MODE}`, `{SOURCE_BRANCH}`, `{BUMP_FIELD_CURRENT}`, `{BUMP_FIELD}`, `{COMMITS_AHEAD}`, `{UNPUSHED}`, `{RECENT_COMMITS}`, `{NEXT_PHASE_DESC}`. Opciones `1=continuar / 2=cancelar`.
  - `1` → §1.4 (solo derivados), y luego la siguiente fase: 1.5 si SHOULD_VERIFY; sino 1.6 si está activa (release siempre — por el build; ship post-release sin `--skip-preflight`); sino 2 (release) / 3 (ship).
  - `2` → terminar workflow sin cambios. Sin reset (no hubo mutaciones: §1.4 todavía no corrió).

**Modo `blocking`** → STOP SIEMPRE (señal real §1 — aplica en fluido y en `--step`; algo falla, no se auto-avanza). Placeholders: `{BLOCKING_REASON}` (mensaje específico de §1.1), `{DETAIL_HINT}` (cómo arreglarlo). Opciones `1=cancelar / 2=ver detalle`.

- `1` → terminar workflow sin cambios.
- `2` → mostrar `git status` completo / branch list / `git log origin/main..HEAD` según el reason; luego re-presentar opciones `1=cancelar / 2=re-chequear` (la segunda re-corre §1.1 por si el user fixeó mientras).

No hay "continuar" en modo bloqueante — el error bloquea por construcción.

### 1.4 Destino del deploy — resolver y registrar `target` (solo derivados)

**Propósito:** que 7.5.7 sepa **dónde** mirar el deploy real. El destino de un repo (`vercel` o
`railway`) vive en un solo lugar: el campo `target` de `.timekast/provision.json`. Este paso lo deja
registrado **antes** de cualquier mutación del release, para que un repo que nunca lo tuvo se siga
observando sin ningún paso manual.

**Cuándo:** después de §1.1-§1.3 — solo con el árbol ya limpio (`WORKING_TREE_DIRTY === "false"`), en
`{SOURCE_BRANCH}`, con la branch de §1.2 resuelta y CP1 superado. Antes de 1.5, 1.6, Phase 2 y de
cualquier merge. Igual en `ship` y en `release`.

**`IS_FACTORY=true` → este paso no corre.** El Factory no tiene estado de provision propio: no hay
`target` que resolver, y 7.5.7 reporta `⏭️` por esa causa.

🔴 **El destino nunca se infiere de archivos.** Ni este paso ni 7.5.7 deciden "Vercel" o "Railway" por
la presencia de `.vercel/project.json`, `vercel.json`, `railway.json` ni de un bloque `vercel`/`railway`
sin `target`: el kit shippea `vercel.json` a todo derivado, y un proyecto de Vercel viejo sobrevive a una
mudanza. El único origen del destino es `target`, y quien lo escribe es el CLI.

#### 1.4.1 Correr el modo sólo-resolver

```bash
npx @timekast/factory provision --resolve-target
TARGET_RC=$?
```

Con `target` ya guardado, el modo lo imprime y termina **sin consultar ninguna plataforma**. Sin
`target`, pregunta a Railway y a Vercel por el repo conectado (lectura) con los tokens del rail y, si el
resultado es inequívoco, **lo guarda sin preguntar** e imprime una línea con la plataforma, el proyecto y
el repo. Nunca imprime tokens; este paso tampoco.

Se ramifica **por código de salida, nunca parseando el texto** (la causa que se registra es el mensaje
del CLI, tal cual):

| `TARGET_RC` | Qué pasó | Qué hace `/deploy` |
| --- | --- | --- |
| `0` | Resuelto: ya estaba guardado, o se guardó ahora | Sigue. Si el archivo cambió → commit propio (§1.4.2), **sin pedir confirmación** |
| `11` | Ambiguo: el repo está en las dos plataformas, o `project-config.md` declara un rail de cliente | **STOP** (abajo) |
| `10` | Sin destino: el repo no está conectado en ninguna plataforma | Sigue; 7.5.7 reporta `⏭️` con esa causa |
| `12` | Un token del rail no se pudo leer | **Sin STOP.** Sigue; 7.5.7 reporta `⏭️` con el mensaje del resolvedor |
| cualquier otro (incluido `1`, el de un CLI anterior al modo que no conoce el flag) | El modo no corrió | Sigue; 7.5.7 reporta `⏭️` con la causa |

**Ambiguo (`11`) — STOP**, señal real en fluido y en `--step` (decisión genuina: no hay default correcto
entre dos plataformas):

```markdown
⚠️ No sé en qué plataforma vive este repo: {mensaje del CLI — nombra los proyectos o el rail de cliente}.

| #   | Acción                                                                          |
| --- | ------------------------------------------------------------------------------- |
| 1   | abortar para resolverlo (el mensaje del CLI de arriba dice cómo)                |
| 2   | seguir sin observar el deploy (7.5.7 reporta `⏭️` con esta causa)               |

🛑 STOP — Responde con el número.
```

- `1` → terminar. El único cambio posible es nada: con `11` el modo no escribe.
- `2` → seguir. **Headless → opción 2**, con la causa en el resumen — **nunca** `✅`.

El agente **conserva la causa** de todo resultado distinto de `0` (el mensaje del CLI) para el resumen de
7.5.7: no es una variable de shell — cada llamada Bash es un shell nuevo (§2.8).

#### 1.4.2 Commit propio del estado — de inmediato, fuera de `BUMP_COMMITS`

Si el modo escribió `.timekast/provision.json`, el archivo se commitea **en este mismo momento**, en su
propio commit. El árbol estaba limpio antes de correr el modo (§1.1), así que cualquier cambio en ese
archivo es del modo:

```bash
STATE=.timekast/provision.json
CHANGE=$(git status --porcelain -- "$STATE")
case "$CHANGE" in
  "")    ;;                                           # no escribió nada → no hay commit
  "??"*) git add -- "$STATE" \
           && git commit -m "chore(provision): record deploy target" -- "$STATE" ;;   # archivo NUEVO
  *)     git commit -m "chore(provision): record deploy target" -- "$STATE" ;;         # ya versionado
esac
```

- **Archivo nuevo:** el `git add` va primero porque el commit por pathspec no alcanza un archivo que git
  no conoce (`GIT.md §3.6.1`). Nada entre el `add` y el `commit`: la ventana es la mínima que declara esa
  regla.
- **Pathspec siempre** (`-- "$STATE"`): el commit no se traga lo que otra sesión dejó staged.
- **Sin `Closes:`** (commit intermedio, `GIT.md §3.3`) y **sin `--no-verify`**. Si el pre-commit
  reformatea el JSON, rige la regla de 2.8: un reintento con el mismo pathspec; si falla dos veces →
  STOP (1=ver detalle / 2=abortar).
- **Fuera de `BUMP_COMMITS`**, en `release` y en `ship` por igual. Nace aquí, **debajo** de todo commit
  que el contador cuenta (2.8 y 3.5 vienen después), así que el `git reset --soft HEAD~${BUMP_COMMITS}`
  de las recoveries se detiene justo encima de él y nunca lo toca. El estado guardado es verdad aunque el
  release se cancele.
- Viaja a `main` con el merge, y a `origin/{SOURCE_BRANCH}` con el push de source de Phase 6 (en `ship`,
  `UNPUSHED` se recomputa ahí y lo incluye).

**Caminos de cancelación — ninguno deja el archivo sucio**, porque el commit ya está hecho cuando llegan:

- **CP1 `2=cancelar` (`--step`) o CP1 bloqueante:** ocurre **antes** de este paso — el modo aún no corrió.
- **Falla de 1.5 (verify) o de 1.6 (build / sweep):** terminan sin reset; el commit del estado queda en
  `{SOURCE_BRANCH}` y el árbol está limpio.
- **CP2 `3=cancelar` → 2.9:** el `git reset --soft HEAD~${BUMP_COMMITS}` retrocede solo bump/CHANGELOG (y
  satélites), y los `git restore`/`git checkout` de 2.9 nombran `package.json` y el CHANGELOG — nunca
  `.timekast/provision.json`.
- **none-bump `3`, CP3 `3`, CP4 `3`, push rechazado (6.3):** mismas recoveries por `BUMP_COMMITS`; el
  commit del estado queda debajo.

#### 1.4.3 `target: railway` sin bloque `railway` — detectarlo antes del merge

Después de 1.4.1/1.4.2, si el estado dice `target: railway` pero no trae los ids que 7.5.7 necesita
(proyecto, servicio y el entorno que el bloque mapea como `main`), el repo necesita que `provision` lo
adopte. Se detecta aquí, antes de cualquier merge — no después del push:

```bash
jq -r 'if .target == "railway"
          and ((.railway.projectId // "") == "" or (.railway.serviceId // "") == ""
               or (.railway.environments.main // "") == "")
       then "missing" else "ok" end' .timekast/provision.json 2>/dev/null
```

Sin `jq` o sin archivo, la comprobación no corre (y 7.5.7 degrada por la misma causa). Con `missing` →
**STOP**, señal real en fluido y en `--step`:

```markdown
⚠️ Este repo vive en Railway, pero su estado no tiene los ids del proyecto (proyecto, servicio, entorno
de producción). Corre `npx @timekast/factory provision --adopt --force --target=railway` para registrarlos
(el `--force` hace falta porque el estado ya existe: sin él, `--adopt` se niega a reescribirlo).

| #   | Acción                                                             |
| --- | ------------------------------------------------------------------ |
| 1   | abortar para adoptar                                               |
| 2   | seguir sin observar el deploy (7.5.7 reporta `⏭️` con esta causa)  |

🛑 STOP — Responde con el número.
```

- `1` → terminar (el commit de 1.4.2, si lo hubo, queda: el `target` es correcto).
- `2` → seguir. **Headless → opción 2**, con la causa en el resumen.

### Anti-patterns Phase 1

```
❌ Saltar checks "porque estoy seguro"   ❌ git stash automático   ❌ Continuar con working tree dirty
❌ Correr §1.4 antes del chequeo de árbol limpio · ramificar §1.4 por el texto del CLI en vez del código
❌ Decidir el destino por `.vercel/project.json`, `vercel.json`, `railway.json` o un bloque sin `target`
❌ Contar el commit del destino en `BUMP_COMMITS` · juntarlo con el commit de CHANGELOG · commitearlo sin pathspec
❌ STOP por un token del rail ilegible (`12`) — sigue, y 7.5.7 reporta `⏭️`
```

---

# Phase 1.5 — Quality verify

**Propósito:** correr `pnpm verify` (lint + typecheck + test) en source branch antes de bumpear/mergear.

**Cuándo:** solo `MODE === 'release'` Y NO `--skip-verify`. En `ship` SIEMPRE se salta.

### 1.5.1 Run

```bash
pnpm verify
```

Output completo se loguea — no esconder fallos.

### 1.5.2 Resultado

- **Pase** (`exit 0`): mostrar `✅ pnpm verify pasó`. Continuar a Phase 1.6 (release siempre pasa por el build-gate).
- **Falla** (`exit !=0`): mostrar tail -50 del output + opciones:

```markdown
| #   | Acción                                     |
| --- | ------------------------------------------ |
| 1   | ver output completo de nuevo (sin avanzar) |
| 2   | cancelar deploy                            |

🛑 STOP — Responde con el número.
```

- `1` → re-mostrar output completo + re-presentar opciones.
- `2` → terminar. Sin mutaciones que deshacer — el commit del destino de §1.4, si lo hubo, queda (es verdad durable, fuera de `BUMP_COMMITS`). User fixea fuera del workflow y reinvoca.

**No hay "ignorar y continuar"** — el gate existe para bloquear. Para skip, usa `--skip-verify` desde el inicio (decisión consciente).

### Notas Phase 1.5

- Corre en source branch ANTES del merge. Conflictos semánticos post-merge no se detectan aquí. El build de producción del release corre en Phase 1.6; verificar `pnpm build` manual en main entre Phase 5 y 6 queda como extra-safety opcional.
- Phase 1.5 NO modifica nada en disco. Es read-only validation.

---

# Phase 1.6 — Readiness gate (build + sweep)

**Propósito:** verificar antes de mergear lo que `pnpm verify` NO cubre — que el **build de producción compila** (release) y el sweep estático de readiness (vulnerabilidades de prod, drift de migrations, código muerto, bundle advisory). Lighthouse NO corre aquí — es audit manual vía `/preflight` standalone (advisory).

**Cuándo (activación distinta a 1.5):**

| Caso                          | Build               | Sweep T1                       |
| ----------------------------- | ------------------- | ------------------------------ |
| `release`                     | ✅ siempre          | ✅                             |
| `release --skip-preflight`    | ✅ siempre          | ❌                             |
| `ship` post-release           | ❌                  | ✅ (salvo `--skip-preflight`)  |
| `ship` pre-release            | ❌ (main = preview) | ❌                             |

> **Post-release** = `CURRENT_VERSION >= 1.0.0` O `IS_FACTORY=true` (ver `GIT.md §4` — main = producción post-release). El `ship` pre-release salta el gate (main = preview, sin riesgo de prod). El build de release NO es skippeable: un release que nunca corrió `next build` no debe llegar a main (`pnpm verify` no buildea).

### 1.6.1 Run (script directo — NO se carga el skill `tk-preflight`)

- **release:** `pnpm build` (background — CC.md §5) → si pasa, sweep T1 (cadena de invocación abajo; corre con bundle fresco).
- **release `--skip-preflight`:** solo `pnpm build`.
- **ship post-release:** sweep T1 (sin build; bundle = advisory sobre cache local si existe).

**Cadena de invocación del sweep** (en derivados `package.json` es dev-owned — la entry `preflight` puede no existir en repos bootstrapeados antes de que el script entrara al boilerplate):

1. `pnpm preflight --t1` — si la entry existe en `package.json.scripts`.
2. Sino, **script directo:** `pnpm exec tsx scripts/tools/preflight.ts --t1` (el archivo viaja con el kit vía `factory:update`; `tsx` es devDep del kit).
3. Si tampoco existe el archivo (cerebro viejo / perfil core): correr inline SOLO los dos checks bloqueantes — `pnpm audit --prod` (high/critical bloquea) + `pnpm drizzle-kit check` si hay Drizzle (drift bloquea) — y anotar en el output que el kit necesita `factory:update` para el sweep completo.

### 1.6.2 Resultado

**Build fallido** (solo release) — mostrar tail -50 del output de compilación + opciones (patrón 1.5.2; un build fallido no tiene report):

| #   | Acción                                     |
| --- | ------------------------------------------ |
| 1   | ver output completo de nuevo (sin avanzar) |
| 2   | cancelar deploy                            |

🛑 STOP — Responde con el número. El build no tiene override: se fixea fuera y se reinvoca. Cancelar aquí no deja nada que deshacer: el commit del destino de §1.4 queda.

**Sweep:**

- **READY / READY-WITH-WARNINGS** (exit 0): mostrar el veredicto en plano. Continuar a **Phase 2** (release) / **Phase 3** (ship).
- **NOT-READY** (exit 1): mostrar el report (severidad + top findings) + opciones:

| #   | Acción                                       |
| --- | -------------------------------------------- |
| 1   | ver report completo (sin avanzar)            |
| 2   | cancelar deploy (fixear fuera + reinvocar)   |

🛑 STOP — Responde con el número. Para saltar el sweep conscientemente, reinvoca con `--skip-preflight` desde el inicio (el build de release corre igual).

> **No hay "ignorar y continuar" inline** — igual que 1.5, el gate bloquea. El override del sweep es `--skip-preflight` (decisión consciente upfront), no un bypass mid-flow.
>
> **Headless:** sin TTY → build fallido Y NOT-READY son fail-closed (abortan el merge, reportan).

### Notas Phase 1.6

- En release el paso de build genera/regenera `.next/` (regenerable, gitignored) — el gate no es read-only en disco, pero no toca nada tracked.
- Los únicos bloqueantes del sweep son audit (high/critical) y migrations (high) — knip, bundle y Lighthouse capean en warn (advisory).
- Salida en pase: **Phase 2** si release, **Phase 3** si ship.

---

# Phase 2 — Version bump + CHANGELOG

**Propósito:** computar bump (auto-suggest o flag), aplicarlo, inferir CHANGELOG entry, permitir edición, commitear 2 commits LOCALES (sin push). Cierra con CP2.

**Cuándo:** solo `MODE === 'release'`. En `ship` se salta entero (de Phase 1/1.6 directo a Phase 3).

Lectura previa obligatoria: [methodology/conventional-commits.md](./methodology/conventional-commits.md) — algoritmo de auto-bump y CHANGELOG inference completos.

### 2.1 Variables (ya resueltas en Phase 0)

`BUMP_FIELD`, `BUMP_FIELD_CURRENT`, `CHANGELOG_PATH`, `BUMP_FLAG`, `IS_FIRST_RELEASE_DERIVED`.

### 2.2 Leer commits desde último tag

```bash
# Baseline = el último tag de RELEASE, no el merge-base con main.
#
# 🔴 Por qué NO el merge-base: cualquier `ship` entre releases lo adelanta, y entonces el
# release siguiente infiere su CHANGELOG de un rango que YA NO contiene lo que ese ship
# llevó a main — commits reales desaparecen de las notas sin que nada avise, y el
# auto-suggest de §2.3 cae en `none` por un rango vacío. Medido el 2026-08-15: tras
# shippear un fix, el merge-base daba 1 commit donde el tag daba 2.
#
# 🔴 Y NO `git describe` (methodology §1): camina ancestría, y en Factory los tags viven en
# merge-commits de main fuera de la ancestría de la source branch → devolvería stale.
# `LAST_RELEASE_TAG` (§0.4) lo resuelve por NOMBRE, que es inmune a eso; `git log <tag>..HEAD`
# funciona igual aunque el tag no sea ancestro de HEAD (compara conjuntos, no camina la rama).
git fetch origin main 2>/dev/null || true
if [ -n "$LAST_RELEASE_TAG" ]; then
  RANGE="${LAST_RELEASE_TAG}..HEAD"                     # desde el último release — lo correcto
else
  MERGE_BASE=$(git merge-base origin/main HEAD 2>/dev/null)   # sin tags aún (first release)
  if [ -n "$MERGE_BASE" ]; then RANGE="$MERGE_BASE..HEAD"; else RANGE="HEAD"; fi
fi
COMMITS=$(git log "$RANGE" --no-merges --format='---%n%H%n%B')
```

### 2.3 Resolver bump target

**Orden de evaluación:** A (flag bump) → D (as-is) → B (first-release derivado) → C (auto-suggest). El primero que matchea gana.

**Caso A — `BUMP_FLAG` pasado:** salta auto-suggest, aplica el flag. `BUMP_TYPE = BUMP_FLAG`.

**Caso D — as-is / pre-bump:** la versión ya está fijada en `package.json`; taggearla sin re-bumpear.

Trigger:

- `AS_IS` flag explícito (siempre activa este caso), **o**
- **auto-detect**: `LAST_RELEASE_TAG_VERSION` no vacío Y `pkg[BUMP_FIELD]` semver-mayor que `LAST_RELEASE_TAG_VERSION`.

> 🔴 **Headless-safety (RED FLAG):** el auto-detect (sin flag) ofrece su checkpoint **SOLO en modo interactivo**. En headless, sin `--as-is` explícito el flujo NO entra a as-is por adivinación — sigue a Caso B/C normal. El flag explícito es el camino canónico (`methodology/modes.md`); el auto-detect es conveniencia interactiva.

Auto-detect interactivo → checkpoint:

```markdown
ℹ️ `package.json` ya está en `{pkg_version}` (> último tag `v{LAST_RELEASE_TAG_VERSION}`).

| #   | Acción                                                       |
| --- | ------------------------------------------------------------ |
| 1   | taggear `{pkg_version}` as-is (sin re-bumpear)               |
| 2   | bumpear encima del valor actual (auto-suggest desde commits) |
| 3   | cancelar                                                     |

🛑 STOP — Responde con el número.
```

- `1` → entrar a Caso D. `2` → seguir a Caso C (auto-suggest). `3` → terminar sin mutaciones.

Al entrar a Caso D: `NEW_VERSION = pkg[BUMP_FIELD]`, `BUMP_TYPE = 'as-is'`.

**Validaciones determinísticas (STOP directo — no piden decisión, seguras en headless):**

- `NEW_VERSION === LAST_RELEASE_TAG_VERSION` → STOP: "tag `v{NEW_VERSION}` ya existe; as-is necesita una versión nueva".
- `NEW_VERSION` semver-menor que `LAST_RELEASE_TAG_VERSION` → STOP: "downgrade — package.json (`{NEW_VERSION}`) < último tag (`{LAST_RELEASE_TAG_VERSION}`)".
- `IS_FIRST_RELEASE_DERIVED && AS_IS` → STOP: "`--as-is` requiere una versión ya fijada; un first-release en 0.0.0 usa el flujo de target version (Caso B), no as-is".
- Factory (`IS_FACTORY`): `factoryVersion !== agentKitVersion` → STOP: "campos del modelo dual desalineados (`{factoryVersion}` ≠ `{agentKitVersion}`); alinéalos antes de as-is".

**Caso B — First-release derivado:** preguntar target version (default `1.0.0`). Validar formato semver. `BUMP_TYPE = 'first-release'`, `NEW_VERSION = respuesta`.

> **Modo (`§7.1`):** Caso B es una **transición ONE-WAY** (señal real §3 — `CC.md §4`) y el none-bump de abajo es una **decisión genuina** (señal §4). Ambos **paran en fluido y en `--step`** — el modo fluido NO los auto-avanza.

**Caso C — Auto-suggest desde commits** (ver [methodology/conventional-commits.md §1](./methodology/conventional-commits.md)):

- Si `suggestBump === 'none'` (solo chore/docs/style/test/ci/build/refactor):

```markdown
⚠️ Los commits desde el último release a main no justifican bump semver.

| #   | Acción                                  |
| --- | --------------------------------------- |
| 1   | cambiar a `ship` mode (merge sin bump)  |
| 2   | forzar bump con --patch/--minor/--major |
| 3   | cancelar                                |

🛑 STOP — Responde con el número.
```

- `1` → `MODE='ship'`, saltar resto de Phase 2, ir a Phase 3.
- `2` → preguntar tipo, aplicar, continuar.
- `3` → terminar sin mutaciones.

- Si `suggestBump ∈ {patch,minor,major}`: `NEW_VERSION = bump(...)`, continuar.

### 2.4 Aplicar bump a package.json

> **Caso as-is (`BUMP_TYPE === 'as-is'`):** **saltar** la escritura entera — el valor ya está en `package.json` (mergeado desde source). NO `node -e` write, NO `git add package.json` (no cambió). Conservar solo la verificación grep de que cada `BUMP_FIELD` == `NEW_VERSION` (es read-only). Avanzar a 2.5.

En Factory se escriben **ambos** campos del modelo dual (`factoryVersion` **y** `agentKitVersion`) al **mismo** `NEW_VERSION` — alineados en origen, sin condicional de `src/` (DISTRIBUTION_DESIGN §3; regla detallada en [methodology/conventional-commits.md §5](./methodology/conventional-commits.md)). En derivados solo `version`. `BUMP_FIELDS` (resuelto en Phase 0.4) es la lista a escribir.

```bash
# BUMP_FIELDS = ['factoryVersion','agentKitVersion'] en Factory; ['version'] en derivados.
node -e "
  const fs = require('fs');
  const fields = ${BUMP_FIELDS_JSON};   // p.ej. '[\"factoryVersion\",\"agentKitVersion\"]'
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const f of fields) pkg[f] = '${NEW_VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
git add package.json
# Verificar cada campo (si alguno no quedó en NEW_VERSION → STOP).
for f in ${BUMP_FIELDS_SPACE}; do
  grep -E "\"${f}\":\s*\"${NEW_VERSION}\"" package.json || { echo "❌ ${f} no quedó en ${NEW_VERSION}"; exit 1; }
done
```

> `BUMP_FIELDS_JSON` = la lista en JSON (`["factoryVersion","agentKitVersion"]` en Factory, `["version"]` en derivado); `BUMP_FIELDS_SPACE` = los mismos campos separados por espacio para el loop de verificación. Ambos derivan de `BUMP_FIELDS` (Phase 0.4).

### 2.5 Generar CHANGELOG entry

Aplicar [methodology/conventional-commits.md §2](./methodology/conventional-commits.md). Buckets Breaking/Added/Changed/Fixed; solo emit secciones con contenido. Append a `CHANGELOG_PATH` (crear con header si no existe — §3 del methodology). Usar `templates/changelog-entry.template.md`.

> **as-is:** se infiere del **mismo rango** (`LAST_RELEASE_TAG..HEAD`, §2.2) — no se salta el inference. Como el salto de versión es semántico (política), no derivado de commits, el user típicamente **cura** la entry en 2.6/CP2 — el header `## [vX.Y.Z]` usa `NEW_VERSION` (= valor de package.json).

**Idioma del entry:** seguir [methodology/conventional-commits.md §Idioma del entry](./methodology/conventional-commits.md) — headings inglés (Keep a Changelog canonical), bullets por `locale:` del frontmatter YAML de `project/planning/project-config.md` (schema v2.0). Default es-MX cuando ausente o pre-v2.0. Leer:

```bash
LOCALE=$(awk '/^---$/{c++} c==1 && /^locale:/{gsub(/locale:|[ '\''\"]/, ""); print; exit} c==2{exit}' project/planning/project-config.md 2>/dev/null)
LOCALE="${LOCALE:-es-MX}"
```

```bash
git add "${CHANGELOG_PATH}"
```

### 2.6 User editing pre-CP2

> **Modo (`§7.1`):** §2.6 y CP2 (§2.7) corren **solo en release** y **paran en fluido y en `--step`** — el CHANGELOG es lo que ve el mundo y el user típicamente lo cura; el output del release no se auto-avanza. En `ship` no hay CHANGELOG → no aplican.

Mostrar entry inline + preguntar `1=editar / 2=continuar`. Si `1`: esperar a que user edite y confirme; re-leer entry final.

### 2.7 🛑 CP2 — Bump + CHANGELOG review

Usar `templates/checkpoint-cp2.template.md`. Mostrar bump type, `{current} → {new}`, campo bumpeado, CHANGELOG path, tag a crear, entry final, y opciones:

```markdown
| #   | Acción                                                   |
| --- | -------------------------------------------------------- |
| 1   | commitear bump + CHANGELOG (commits locales, sin push)   |
| 2   | editar entry de nuevo                                    |
| 3   | cancelar (reset y terminar)                              |

🛑 STOP — Responde con el número.
```

- `1` → ejecutar 2.8.
- `2` → volver a 2.6.
- `3` → ejecutar 2.9 (cleanup).

### 2.8 Commitear (LOCAL, sin push)

```bash
# BUMP_COMMITS cuenta TODOS los commits que el workflow crea en source. Arranca en 0 (§0.4),
# se incrementa acá y en Phase 3.5 (+1 por línea satélite). Las recoveries leen HEAD~${BUMP_COMMITS}.
BUMP_COMMITS=$((BUMP_COMMITS + $([ "$BUMP_TYPE" = "as-is" ] && echo 1 || echo 2)))

if [ "$BUMP_TYPE" != "as-is" ]; then
  git commit -m "chore: bump ${BUMP_FIELD} to v${NEW_VERSION}"      # templates/commit-message-bump.template.md
fi
git commit -m "docs: update CHANGELOG for v${NEW_VERSION}"          # templates/commit-message-changelog.template.md
```

> **as-is:** se omite el commit `chore: bump ...` (package.json no cambió — el valor ya venía de source). Solo se commitea el CHANGELOG → aporta 1 en vez de 2. Las recoveries que retroceden commits deben usar `HEAD~${BUMP_COMMITS}`, NO `HEAD~2` hardcodeado.
>
> ℹ️ **Esta fase no es la única que aporta.** Phase 3.5 (bump de `cli/`/`desktop/`) suma `+1` por línea y corre **también en `ship`**, donde Phase 2 nunca se ejecuta. Por eso el contador nace en §0.4 y no acá: en un `ship` con bump satélite, las recoveries igual necesitan un valor.
>
> ⚠️ **`BUMP_COMMITS` no persiste entre invocaciones Bash** (cada `Bash` call es un shell nuevo — mismo gotcha que `$$` en Phase 4.1/7.4). Al ejecutar una recovery en una fase posterior hay que **re-derivarlo inline** en esa misma llamada: `2` por el bump+CHANGELOG del kit (`1` si as-is, `0` si el modo es `ship`) **más 1 por cada línea satélite que 3.5 bumpeó**. El commit del destino de §1.4 **nunca** suma.
>
> 🔴 **Con la variable vacía el reset NO falla — falla en silencio, que es peor.** `git reset --soft HEAD~` **es** sintaxis válida: `HEAD~` resuelve idéntico a `HEAD~1` (verificado). Así que un `HEAD~${BUMP_COMMITS}` con la variable sin valor **retrocede un commit** en lugar de dos o tres, y deja aplicado el bump de la última línea satélite mientras descarta el del kit — en una recovery destructiva, sin un solo mensaje de error. Guard obligatorio antes de cualquier reset:
>
> ```bash
> [ -n "${BUMP_COMMITS}" ] && [ "${BUMP_COMMITS}" -gt 0 ] || { echo "🛑 BUMP_COMMITS sin valor — NO reseteo"; exit 1; }
> git reset --soft "HEAD~${BUMP_COMMITS}"
> ```

**NO `--no-verify`** — pre-commit puede actualizar lockfile/format. Si modifica algo: `git add -u && git commit ...` reintentar 1×. Si falla 2× → STOP (1=ver detail / 2=abort).

**No push.** Los commits quedan locales en `{SOURCE_BRANCH}` hasta Phase 6.

### 2.9 Cleanup si CP2 = `3 cancelar`

Mostrar comandos al user ANTES de ejecutar (destructive-adjacent, CC.md §4):

> El commit del destino de §1.4 queda fuera de este cleanup a propósito: nació antes de todo commit
> contado en `BUMP_COMMITS`, así que el reset se detiene encima de él, y los `restore`/`checkout` de
> abajo nombran solo `package.json` y el CHANGELOG. `.timekast/provision.json` no queda sucio.

```bash
# Si NO se commiteó (cancel antes de 2.8):
git restore --staged package.json "${CHANGELOG_PATH}"
git checkout package.json "${CHANGELOG_PATH}"

# Si SÍ se commiteó:
git reset --soft HEAD~${BUMP_COMMITS}    # kit: 2 (1 en as-is) + 1 por línea satélite de 3.5
git restore package.json "${CHANGELOG_PATH}"
```

### Anti-patterns Phase 2

```
❌ Push en Phase 2   ❌ --no-verify en bump/CHANGELOG   ❌ Mezclar bump+CHANGELOG en un commit
❌ Auto-cancelar si bump='none' sin preguntar   ❌ Tagear en Phase 2 (el tag se crea en Phase 5)
```

---

# Phase 3 — Inspect origin/main

**Propósito:** detectar si `origin/main` tiene commits no presentes en `{SOURCE_BRANCH}`. Si los hay, dar decisión al user antes de mergear.

### 3.1 Fetch + comparar (con filtro de subjects del propio workflow)

```bash
git fetch origin main
# Excluir merge commits creados por el propio tk-deploy (release: / ship:, con o sin scope).
# --no-decorate blinda contra config global log.decorate=full que insertaría (HEAD -> ...) antes del subject.
AHEAD_ALL=$(git log --no-decorate --oneline "${SOURCE_BRANCH}..origin/main" 2>/dev/null || true)
UNEXPECTED=$(echo "$AHEAD_ALL" | grep -vE '^[0-9a-f]+ (release|ship)(\([^)]+\))?: ' || true)
OWN_FILTERED=$(echo "$AHEAD_ALL" | grep -cE '^[0-9a-f]+ (release|ship)(\([^)]+\))?: ' || true)
```

> 🔴 **Usar SIEMPRE este comando filtrado** para inspeccionar main — nunca un `git log {source}..main` a ojo. Tras varios `ship`s sin release, main acumula merge commits `ship:` que NO están en la source (BR-FACTORY-004 prohíbe traerlos de regreso): en un log crudo parecen "cosas en main que faltan en develop", pero son los commits del propio workflow — esperados, no drift.

Los subjects `release:` y `ship:` están **reservados** para commits creados por tk-deploy en Phase 5 (ver `templates/commit-message-{release,ship}.template.md` para la convención). Un derivado que necesite enforzar la reserva puede agregar un hook ad-hoc, pero Factory propia no lo necesita.

### 3.2 Caso A: sin commits inesperados

`UNEXPECTED` vacío → mostrar `✅ origin/main sin commits inesperados ({OWN_FILTERED} merge commits propios del workflow filtrados — ship:/release:, esperados)`. Continuar a Phase 4 sin CP. Si `OWN_FILTERED=0`, omitir el paréntesis.

### 3.3 Caso B: hay commits inesperados — 🛑 CP3

Antes de renderizar el checkpoint, resolver si la source ya está en el remoto — esto decide si el rebase (opción 2) es seguro o reescribiría historia pública:

```bash
# Señal AUTORITATIVA sobre el remoto (NO `git rev-parse origin/${SOURCE_BRANCH}`, que lee
# el ref local y puede estar ausente/stale en un clone con refspec angosto o si la source
# se pusheó desde otra máquina → falso negativo peligroso: ofrecería "rebase seguro" y el
# push de Phase 6 se rechazaría por non-fast-forward).
SOURCE_PUSHED=$(git ls-remote --heads origin "${SOURCE_BRANCH}" | grep -q . && echo 1 || echo 0)
```

Usar `templates/checkpoint-cp3.template.md`. Mostrar los commits + opciones (NINGUNA pre-marcada "recomendada" — la decisión depende de qué son los commits ajenos y de `SOURCE_PUSHED`):

```markdown
| #   | Acción                                                       |
| --- | ------------------------------------------------------------ |
| 1   | continuar al merge — Phase 4 los integra                     |
| 2   | rebase `{SOURCE_BRANCH}` sobre `origin/main` ANTES de mergear |
| 3   | cancelar deploy                                              |

{REBASE_SAFETY_NOTE}

🛑 STOP — Responde con el número.
```

`{REBASE_SAFETY_NOTE}` se rellena según `SOURCE_PUSHED` (single source de la nota — el template solo lleva el placeholder):

- **`SOURCE_PUSHED=1`** → la source ya está en `origin`; rebasarla es incompatible con las reglas del workflow:
  > ⚠️ `{SOURCE_BRANCH}` ya está en `origin`. La opción 2 (rebase) la deja divergente de su upstream: el push de Phase 6 (`git push origin {SOURCE_BRANCH}`, sin `--force`) será rechazado por non-fast-forward, y `--force` está prohibido (anti-pattern de Phase 6 — ver §6 Anti-patterns; reiterado en 6.3). **Default seguro: opción 1** (el merge reconcilia). Elige opción 2 solo si vas a reconciliar el remoto fuera del workflow.
- **`SOURCE_PUSHED=0`** → sin alarma espuria:
  > ℹ️ `{SOURCE_BRANCH}` no está pusheada — el rebase (opción 2) es seguro (no reescribe historia pública).

**`1`** → Phase 4 (CP4 maneja conflictos texto). **`2`** → si `SOURCE_PUSHED=0`: `git rebase origin/main` directo; si hay conflictos, esperar al user resolver (`git add` + `git rebase --continue` o `--abort`); luego Phase 4. Si `SOURCE_PUSHED=1`: el rebase exigiría un push non-fast-forward que Phase 6 rechaza y `--force` está prohibido → **interactivo:** confirmar con el user que reconciliará el remoto fuera del workflow ANTES de rebasear; **headless (sin user):** NO rebasear — fail-safe a opción 1. **`3`** → cancelar; si Phase 2 **o** Phase 3.5 commitearon, mostrar `git reset --soft HEAD~${BUMP_COMMITS}` al user antes de ejecutar.

### Anti-patterns Phase 3

```
❌ Auto-rebase silencioso   ❌ Saltar CP3 "porque seguro está OK"   ❌ git pull origin main → SOURCE_BRANCH (drift)
❌ Inspeccionar main con git log ad-hoc sin el filtro de §3.1 — los ship:/release: propios parecen drift y no lo son
```

---

# Phase 3.5 — Bump de las líneas satélite (solo Factory)

**Propósito:** bumpear `cli/` y/o `desktop/` **antes** del merge, para que el bump viaje **dentro**
de él y Phase 5 pueda taggear sobre el merge commit. Corre en `release` **y** en `ship`. Sin cambios
detectados o fuera del Factory → no-op silencioso.

> 🔴 **Por qué antes del merge y no en Phase 7 (el defecto que esta fase corrige).** El paso viejo
> (7.5.5/7.5.7, retirado) bumpeaba y taggeaba **después** del push, sobre `{SOURCE_BRANCH}` — así el
> commit del bump nunca entraba al merge y **el tag nacía fuera de `main`**, sin forma de entrar
> (mergear `main → develop` está prohibido, `BR-FACTORY-004`). Consecuencia medida: npm sirvió
> `@timekast/factory@1.24.0` desde un commit que `main` no contenía hasta que `v11.8.3` lo absorbió
> — auditar "qué corre la flota" desde `main` daba una respuesta vieja. Las Actions ahora **rechazan**
> un tag que no sea ancestro de `main`, así que cortar fuera del merge deja de publicar del todo.

> ℹ️ **`ship` también taggea satélites** (Phase 5.4). Atarlos solo a `release` obligaría a bumpear
> `factoryVersion` por un parche del CLI y a gritarle "hay kit nuevo" a toda la flota cuando el kit
> no cambió. Publicar el CLI sin tocar el kit = **`/deploy ship`**.

### 3.5.1 Resolver el estado de cada línea

La detección ya corrió en Phase 1.1 (con su `git fetch origin --tags` y el
`ls-remote`) — es lo que desactivó el bloqueo por `COMMITS_AHEAD === 0`. Acá se **reusa**, no se
recomputa. Por cada entrada de `SATELLITE_LINES` (§0.4) con `LINE_CHANGED === true`:

```bash
PKG_VER=$(node -p "require('./${PKG}').version")     # p.ej. cli/package.json
LAST_TAG_VER="${LAST_TAG#${TAG_PREFIX}}"             # "" si la línea no tiene ningún tag
```

### 3.5.2 🛑 STOP — bump de la línea

**Señal real** (`fx-workflow-authoring §7.1` criterio 4: cortar una línea de release es una decisión
genuina) → **para en fluido y en `--step`**. Declarado en §Checkpoints, bloque "Otras paradas".

```markdown
La línea **{LABEL}** cambió desde `{LAST_TAG}` ({N} archivos). Versión actual: `{PKG_VER}`.

| #   | Acción                                    |
| --- | ----------------------------------------- |
| 1   | patch → `{NEXT_PATCH}`                    |
| 2   | minor → `{NEXT_MINOR}`                    |
| 3   | major → `{NEXT_MAJOR}`                    |
| 4   | no ahora — no cortar esta línea           |

🛑 STOP — Responde con el número.
```

- **`1`/`2`/`3`** → 3.5.3.
- **`4`** → skip de ESA línea (las demás siguen su curso). No interrumpe el flow.
- **Headless (sin TTY):** degrada a **skip silencioso** (= opción 4) — el corte **nunca** se
  auto-ejecuta sin elección humana. Sin bump no hay tag → nada queda huérfano.

### 3.5.3 Bumpear y commitear (LOCAL, sin tag ni push)

```bash
NEW_VER=$(npm --prefix "${DIR%/}" version "<bump>" --no-git-tag-version | tr -d 'v')
# --no-git-tag-version: el tag lo crea Phase 5.4 como `${TAG_PREFIX}${NEW_VER}`, sobre el
# merge commit. Un tag de npm acá colisionaría con el esquema y nacería fuera de main.
git add "${PKG}"
git commit -m "chore(${KEY}): bump ${LABEL} to ${NEW_VER}"
BUMP_COMMITS=$((BUMP_COMMITS + 1))                   # las recoveries retroceden este total
```

**NO `--no-verify`** — si el pre-commit modifica algo: `git add -u && git commit` reintento 1×; si
falla 2× → STOP (1=investigar / 2=abort).

🔴 **NO taggear ni pushear acá.** El tag se corta en Phase 5.4 (sobre el merge commit, ya en `main`)
y se pushea en Phase 6.2. Y el publish/build nunca es local: lo hacen `cli-publish.yml` (npm
Trusted Publishing — el 2FA passkey del owner haría EOTP) y `gui-release.yml` (electron-builder en
runners macOS + Windows).

### 3.5.4 Cerrar la fase

```bash
git status --porcelain    # DEBE estar vacío: Phase 4.1 hace `checkout main` y un residuo lo aborta
COMMITS_AHEAD=$(git log "origin/main..HEAD" --oneline | wc -l | tr -d ' ')   # re-evaluar (§1.1)
```

Si `COMMITS_AHEAD` sigue en `0` tras haber bumpeado → **STOP**: el commit no se creó (el bump se
perdió). No continuar al merge.

### Anti-patterns Phase 3.5

```
❌ git tag / git push aquí (el tag es de Phase 5.4 — taggear acá lo deja FUERA de main)
❌ npm publish / electron-builder local   ❌ git describe para resolver el último tag (→ stale)
❌ Resolver el último tag con `git tag --list` (ref local stale; la línea gui-v* es casi toda fantasma)
❌ Auto-bumpear sin prompt   ❌ Bumpear en un derivado (SATELLITE_LINES está vacío fuera del Factory)
❌ Olvidar `BUMP_COMMITS + 1` → las recoveries retroceden de menos y dejan el bump aplicado
```

---

# Phase 4 — Merge (raw)

**Propósito:** `git merge --no-commit --no-ff` para inspeccionar antes de commit. Si conflictos, CP4. Phase 4 NO commitea — el commit final es Phase 5, tras 4.5 (autogen) y 4.6 (Factory DENY).

### 4.1 Snapshot de paths ignored + checkout main + pull

> ⚠️ **Gotcha:** el workflow hace `checkout main` físicamente, lo que **altera el working tree de la source branch**. Si hay archivos gitignored-pero-presentes en disco (ej: `plan/`, notas local-only) y el merge a main toca esos paths (porque main los tiene tracked), **se pierden del disco** — `checkout {source}` en Phase 7 no los restaura (ya no están tracked en ninguna branch). Snapshot defensivo antes del checkout, restore en Phase 7.

> 🔴 **El nombre del snapshot deriva del REPO, nunca de `$$` ni de un literal global.** Dos
> requisitos que se contradicen si eliges mal:
>
> - **Estable entre shells.** Cada llamada Bash del agente abre un shell nuevo, así que con `$$`
>   el PID de 4.1 y el de 7.4 **jamás coinciden**: el `if [ -f … ]` de 7.4 da falso y el bloque
>   entero —restore incluido— se salta **en silencio**. El `.env.local` que el `checkout main`
>   acaba de borrar no vuelve, y nada lo dice.
> - **Aislado entre repos.** `concurrency_cap: 1` acota este workflow, **no la máquina**: un dev
>   con varios proyectos del kit puede tener dos `/deploy` a la vez. Con un literal global se pisan
>   el archivo, y 7.4 extrae el `.env` y el `.vercel/` de OTRO proyecto dentro de este. Observado
>   en vivo (2026-08-14): dos repos escribieron el mismo `/tmp/tk-deploy-preserve.tgz` con un
>   minuto de diferencia.
>
> El hash del toplevel cumple ambos: mismo repo → mismo nombre siempre; repos distintos → nombres
> distintos.

```bash
# Nombre derivado del REPO (ver aviso arriba): estable entre shells, aislado entre proyectos.
REPO_KEY=$(git rev-parse --show-toplevel | shasum | cut -c1-8)
PRESERVE_TGZ="/tmp/tk-deploy-preserve-${REPO_KEY}.tgz"
PRESERVE_TXT="/tmp/tk-deploy-preserve-${REPO_KEY}.txt"

# Barrido de restos DE ESTE REPO: un /deploy abortado antes de Phase 7 (cancelas en CP3/CP4, un
# push rechazado, un error a media corrida) deja su tar sin dueño, y macOS NO limpia /tmp al
# reiniciar — la misma lección que el runner de e2e aprendió con las contraseñas de Neon.
# Se barre al ENTRAR, no al salir: el restore de 7.4 es justo lo que un abort no ejecuta.
# 🔴 SOLO los propios — un glob `/tmp/tk-deploy-preserve-*` borraría el snapshot de un /deploy
#    en curso en OTRO repo, dejándolo sin restore.
rm -f "$PRESERVE_TGZ" "$PRESERVE_TXT" 2>/dev/null || true

# Snapshot: paths ignored presentes en disco, EXCLUYENDO regenerables.
# `(^|/)` y NO `^`: el ancla solo excluía los regenerables de la RAÍZ, así que en un repo
# con paquetes anidados (`cli/`, `desktop/`) sus `node_modules/` y `dist/` entraban al tar.
# Medido en el Factory: 700 MB de basura regenerable → 252 MB comprimidos, empaquetados y
# re-extraídos en cada `/deploy`.
git status --ignored --porcelain=v1 -- . 2>/dev/null \
  | awk '/^!!/ {print $2}' \
  | grep -vE '(^|/)(node_modules|\.next|dist|build|coverage|\.turbo|\.vercel)/' \
  > "$PRESERVE_TXT" || true

if [ -s "$PRESERVE_TXT" ]; then
  tar -czf "$PRESERVE_TGZ" -T "$PRESERVE_TXT" 2>/dev/null || true
  echo "📦 Snapshot de paths ignored para restaurar en Phase 7:"
  cat "$PRESERVE_TXT"
fi

git checkout main
git pull origin main
```

Si `git pull` reporta cambios inesperados → opciones `1=reintentar Phase 3 / 2=abort`.

### 4.2 Raw merge

```bash
git merge --no-commit --no-ff "${SOURCE_BRANCH}"
```

`--no-commit` para hacer 4.5 + 4.6 antes del commit. `--no-ff` para merge commit explícito.

> 🔴 **Los flags van ANTES de la branch, y el orden NO es cosmético — es lo que hace expresable el permiso.** Los patrones de permisos del runtime son **prefijo con comodín al final** (`Bash(git *)`), sin comodín intermedio. Con la branch primero, el único patrón posible es exacto por nombre de branch (`Bash(git merge develop --no-commit --no-ff)`), que se rompe en cuanto un derivado trabaja en otra branch — y la alternativa, un `Bash(git merge *)` amplio, **autorizaría `git merge main`**, el comando que `BR-FACTORY-004` prohíbe por haber borrado backlog entero en el incidente de v6.0.1. Con los flags primero el patrón es un prefijo puro (`Bash(git merge --no-commit --no-ff *)`): sirve para cualquier branch de cualquier derivado y **no** alcanza al merge peligroso, que no lleva esos flags. Ambos permisos viajan en `.claude/settings.json`.

### 4.3 Pre-resolver conflictos DENY-scoped (Factory) + detectar

#### 4.3.1 Pre-resolver conflictos DENY-scoped (SOLO `is_factory: true`)

En Factory, los conflictos `modify/delete` en paths que Phase 4.6 DENY excluye de `main` igual (`project/*` salvo `reference/`, `src/app/showcase/*`) son **ruido mecánico** — su destino ya lo decidió el DENY (no quedan en main: `project/*` es develop-only, incluido el autogen `project/backlog/BOARD.md`). Los conflictos en los **autogenerados de `project/reference/*`** (INVENTORY/CODEBASE/HOOKS) también son ruido: la resolución es irrelevante porque Phase 4.5 los regenera completos del árbol mergeado — se pre-resuelven tomando la versión de la source. Pre-resolver todo esto acá deja CP4 solo para conflictos **reales** en paths que SÍ viajan a main (`src/`, `.claude/`, `cli/`, `distribution/`, root files).

Lectura previa: [methodology/factory-exclusions.md §7](./methodology/factory-exclusions.md) — la pre-resolución reusa la **MISMA** clasificación que 4.6 (SSOT única).

```bash
if [ "$IS_FACTORY" = "true" ]; then
  # Scoped al repo igual que el snapshot de 4.1 — dos /deploy simultáneos en repos distintos
  # se pisarían la lista y uno pre-resolvería los conflictos del otro.
  CONFLICTS_TXT="/tmp/tk-deploy-conflicts-$(git rev-parse --show-toplevel | shasum | cut -c1-8).txt"
  # Redirect desde archivo (NO pipe) → el while corre en el shell actual, el exit propaga.
  # Shell-agnostic (igual que el snapshot de 4.1): no usar pipe-to-while ni process substitution.
  git diff --name-only --diff-filter=U > "$CONFLICTS_TXT"
  while IFS= read -r f; do
    case "$f" in
      project/reference/*)
        # Autogen (INVENTORY/CODEBASE/HOOKS): la resolución da igual — Phase 4.5 regenera.
        git checkout --theirs -- "$f" >/dev/null 2>&1 && git add "$f" >/dev/null \
          || { echo "❌ resolución autogen falló en $f (estado de índice raro) — STOP"; exit 1; }
        echo "♻️  $f (autogen — Phase 4.5 lo regenera)" ;;
      project/*)
        git rm -f "$f" >/dev/null || { echo "❌ git rm falló en $f (estado de índice raro) — STOP"; exit 1; }
        echo "♻️  $f" ;;                                    # DENY → deletion determinística
      src/app/showcase/*)
        git rm -f "$f" >/dev/null || { echo "❌ git rm falló en $f (estado de índice raro) — STOP"; exit 1; }
        echo "♻️  $f" ;;                                    # DENY → deletion (showcase factory-only — 4.6.4)
      *) : ;;                                               # default NO-OP: src (salvo app/showcase/)/.claude/cli/distribution/root → CP4
    esac
  done < "$CONFLICTS_TXT"
  rm -f "$CONFLICTS_TXT"
fi
```

> **Default no-op explícito:** solo los prefijos exactos de la denylist (deletion) y `project/reference/*` (autogen → tomar source) se pre-resuelven. `cli/`, `distribution/`, `src/` (salvo `src/app/showcase/`), `.claude/`, root files **NUNCA** se pre-resuelven — caen a 4.3.2/CP4 como conflicto real. El `git rm` de `project/*` y `src/app/showcase/*` NO silencia errores con `|| true`: un rm rechazado por estado del índice → **STOP**.

Log: `♻️ Pre-resueltos N conflictos mecánicos (DENY-scoped + autogen): <paths>`. **NO cuentan como conflictos para CP4** — son resoluciones determinísticas auditadas: deletions de paths que no viajan a main + autogenerados que Phase 4.5 regenera (ver Anti-Drift Rule #2).

#### 4.3.2 Detectar conflictos restantes

```bash
CONFLICTS=$(git diff --name-only --diff-filter=U)
```

**Caso A — sin conflictos:** mostrar `git diff --cached --stat | head -30` (informativo). Continuar a 4.5.

**Caso B — conflictos — 🛑 CP4:** usar `templates/checkpoint-cp4.template.md`:

```markdown
| #   | Acción                                                           |
| --- | ---------------------------------------------------------------- |
| 1   | resolver todos a favor de `{SOURCE_BRANCH}`                      |
| 2   | resolver manualmente (workflow espera hasta diff-filter=U vacío) |
| 3   | abort merge (`git merge --abort`) y cancelar                     |

🛑 STOP — Responde con el número.
```

- **`1`** — favor source:

```bash
git diff --name-only --diff-filter=U | while IFS= read -r f; do
  git checkout "${SOURCE_BRANCH}" -- "$f"
done
git add -u
git diff --name-only --diff-filter=U   # debe ser vacío
```

Si quedan conflictos (ej: deleted-en-source vs modified-en-main): mostrar paths, resolver caso por caso o ir a opción 2.

- **`2`** — manual: workflow espera. User stagea y dice "done". Re-check `diff-filter=U`. Si vacío → 4.5; sino re-presentar.

- **`3`** — abort: `git merge --abort`. Si Phase 2 **o** Phase 3.5 commitearon (`BUMP_COMMITS > 0` — 3.5 corre también en `ship`): mostrar `git checkout {source} && git reset --soft HEAD~${BUMP_COMMITS}` al user. Terminar.

### Anti-patterns Phase 4

```
❌ Auto-resolver favor source sin CP4   ❌ Commit del merge en Phase 4   ❌ Saltar --no-ff   ❌ rebase main sobre source
```

---

# Phase 4.5 — Autogen regen

**Propósito:** regenerar `project/reference/INVENTORY.md`, `CODEBASE.md`, `HOOKS.md`, `SCHEMA.md`, `API.md` para que el merge commit (Phase 5) incluya autogen fresco. Corre SIEMPRE post-Phase 4, ANTES de Phase 4.6 (si DENY corriera primero podría borrar `project/reference/`).

### 4.5.1 Run los 5 scripts

```bash
pnpm generate:inventory     # scripts/tools/generate-inventory.mjs
pnpm generate:hooks         # scripts/tools/generate-hooks.mjs
pnpm generate:codebase      # scripts/tools/generate-codebase.mjs
pnpm generate:schema        # scripts/tools/generate-schema.mjs
pnpm generate:api           # scripts/tools/generate-api.mjs
```

Si alguno falla:

```markdown
| #   | Acción                                                                         |
| --- | ------------------------------------------------------------------------------ |
| 1   | reintentar (a veces transient)                                                 |
| 2   | continuar SIN regen (autogen quedará viejo — sub-óptimo, documentar en commit) |
| 3   | abort merge                                                                    |

🛑 STOP — Responde con el número.
```

### 4.5.2 Re-stage si hubo diff

```bash
git add project/reference/INVENTORY.md project/reference/HOOKS.md project/reference/CODEBASE.md project/reference/SCHEMA.md project/reference/API.md
git diff --cached --stat | grep "project/reference"   # si aparece → stageado; sino idempotente, continuar
```

### Notas Phase 4.5

- Scripts en `scripts/tools/generate-*.mjs`. Si alguno se retira/renombra, Phase 4.5 falla y necesita update.
- Corre siempre (no depende de `is_factory`). En derivados, autogen también vive en `project/reference/`.

---

# Phase 4.6 — Factory selective DENY

**Propósito:** en Factory (`is_factory: true`), vaciar `project/*` (preservando `reference/` y `.gitkeep`) del merge stageado, para que no contamine main con material interno (planning, backlog, runbooks).

**Cuándo:** SOLO si `is_factory: true`. En derivados se salta entero — el merge a main es total.

Lectura previa obligatoria: [methodology/factory-exclusions.md](./methodology/factory-exclusions.md) — allowlist/DENY canónica.

### 4.6.1 Pre-condiciones

- En main, post-merge `--no-commit`, post-4.5 autogen regen + staged.

### 4.6.2 Vaciar `project/*` preservando `reference/` (shell-agnostic — NO `shopt`)

```bash
for d in project/*/; do
  [ -e "$d" ] || continue                        # guard no-match (reemplaza shopt nullglob; falla en zsh)
  case "$d" in project/reference/) continue ;; esac
  git rm -rf "$d" 2>/dev/null || true            # -f obligatorio: los paths están staged por el merge
done
```

Borra `project/{backlog,planning,factory,migration,runbooks,discovery-smoke-tests,discovery-artifacts,proposals,...}`. Preserva `project/reference/`. NUNCA `git rm --quiet`/`-rq` (esta versión de git los rechaza).

### 4.6.2b Restaurar `.gitkeep` estructurales (PRESERVE §2)

El loop de 4.6.2 borra los dirs **enteros**, incl. sus `.gitkeep`. Restaurarlos desde la source branch los deja en el árbol de main → el tarball **stable** (que se construye de main, no de develop) los incluye, manteniendo los drop locations (`intake`/`backlog`/`factory`/`proposals`) válidos en derivados bootstrapeados por el canal stable. Sin esto, la fila PRESERVE `**/.gitkeep` de [factory-exclusions.md §2](./methodology/factory-exclusions.md) sería letra muerta para `project/`.

```bash
# General — NO hardcodea intake (cubre un 5º drop location futuro):
git ls-tree -r --name-only MERGE_HEAD -- 'project/' | grep '/\.gitkeep$' | while IFS= read -r k; do
  git checkout MERGE_HEAD -- "$k" && git add -- "$k"
done
```

> Alinea 4.6 con la pre-resolución 4.3.1 (ambas preservan `.gitkeep`). `MERGE_HEAD` está disponible durante el merge `--no-commit`. Portable bash/zsh.

### 4.6.3 Archivos sueltos en `project/` raíz (por nombre — no glob)

```bash
for f in project/pendientes_edmond.md project/WORKFLOWS_MASTER_PLAN.md; do
  [ -e "$f" ] && git rm -f "$f" 2>/dev/null || true
done
```

### 4.6.4 `src/app/showcase/` — borrar de main (factory-only showcase)

`src/app/showcase/` es la ruta de showcase factory-only (DRIFT-007): vive solo en `develop` para revisar componentes del design-system, nunca debe llegar a `main` ni a derivados. Es el **primer path bajo `src/`** que el DENY excluye (el resto de `src/` sí viaja a main). Se **borra** del merge result:

```bash
git rm -rf src/app/showcase 2>/dev/null || true                  # factory-only showcase — borra de main (Barrera 1; develop-only por diseño)
```

> Detalle en `methodology/factory-exclusions.md §3`. Defensa redundante: `distribution/profiles.json` (perfil `full`) también lo excluye del tarball (Barrera 2), pero como el tarball se construye de `main`, esta Barrera 1 es la primaria.

### 4.6.5 Verificación post-DENY

```bash
git ls-files --cached -- 'project/*' | head -30       # project/reference/* + los .gitkeep restaurados por 4.6.2b
git ls-files --cached -- 'project/**/.gitkeep'         # esperado: intake/backlog/factory/proposals .gitkeep (PRESERVE §2)
git ls-files --cached -- 'src/app/showcase/*' | wc -l # esperado: 0 (showcase factory-only borrado del merge result)
```

Si `project/*` muestra paths **además de `reference/*` y los `.gitkeep` estructurales** (los restaura 4.6.2b — son esperados), o `src/app/showcase` muestra >0 → STOP, opciones `1=re-aplicar DENY / 2=investigar / 3=abort merge`.

### 4.6.6 Diff summary informativo

```bash
git diff --cached --stat | head -40
```

Mostrar `✅ Factory DENY aplicado` + stats. Continuar a Phase 5.

### Anti-patterns Phase 4.6

```
❌ git rm -rf project/*   ❌ git rm -rf project   ❌ rm -rf (no actualiza index)   ❌ shopt (bash-only, falla en zsh)
❌ Saltar Phase 4.6 en Factory   ❌ Aplicar en derivado
```

---

# Phase 5 — Commit + tag

**Propósito:** crear el merge commit final en main (con autogen fresco + Factory DENY aplicado) y, si `release`, taggear `vX.Y.Z`.

### 5.1 Pre-condiciones

```bash
git diff --cached --stat | head -5   # verificar que hay staged changes; si vacío → STOP
```

### 5.2-5.3 Commit message + ejecutar

```bash
if [ "$MODE" = "release" ]; then
  MSG="release: v${NEW_VERSION} — merge ${SOURCE_BRANCH} into main

${COMMIT_SUMMARY:-See CHANGELOG for details}"
else
  MSG="ship: merge ${SOURCE_BRANCH} into main

${COMMIT_SUMMARY:-}"
fi
git commit -m "$MSG"
```

Plantillas: `templates/commit-message-{ship,release}.template.md`. **NO `--no-verify`** — autogen ya fresco (Phase 4.5), pre-commit idempotente. Si pre-commit modifica algo: `git add -u && git commit` reintento 1×. Si falla 2× → STOP con opciones **1=investigar (mostrar el output del pre-commit y corregir la causa) / 2=abort**. El `--no-verify` **NO** es opción de menú: solo se justifica si el pre-commit entra en un loop infinito comprobado, y aun así **requiere autorización explícita del usuario** (GIT.md §1).

### 5.4 Tags

Todos los tags se cortan **acá**, sobre el merge commit recién creado (`HEAD` de `main`). Eso es lo
que los hace ancestros de `main` por construcción — no hay SHA que derivar ni ancestría que probar.

**Tag del kit (solo release):**

```bash
if [ "$MODE" = "release" ]; then
  git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION} — ${TAG_SUMMARY:-release}"
  git tag -l "v${NEW_VERSION}"   # verificar; si no se creó → STOP
fi
```

**Tags satélite (release Y ship)** — por cada línea que Phase 3.5 bumpeó:

```bash
# El assert compara DOS ÁRBOLES DISTINTOS: el merge commit (HEAD de main) contra main
# pre-merge. Prueba que el bump SOBREVIVIÓ al merge, a la pre-resolución de 4.3.1 y al DENY
# de 4.6 — y sigue probándolo aunque quien lo mantenga re-derive las variables (que no
# persisten entre llamadas Bash, §2.8). Compararlo contra el mismo árbol sería una tautología.
STAGED_VER=$(git show "HEAD:${PKG}"        | node -pe "JSON.parse(require('fs').readFileSync(0)).version")
MAIN_VER=$(git show "origin/main:${PKG}"   | node -pe "JSON.parse(require('fs').readFileSync(0)).version")
[ "${STAGED_VER}" != "${MAIN_VER}" ] || { echo "🛑 el merge no trajo el bump de ${KEY}"; exit 1; }

# El tag NO debe existir ya en el remoto. `ls-remote`, no el ref local (§1.1).
git ls-remote --tags origin "${TAG_PREFIX}${STAGED_VER}" | grep -q . \
  && { echo "🛑 ${TAG_PREFIX}${STAGED_VER} ya existe en origin"; exit 1; }

# `-m` OBLIGATORIO: `git tag -a` sin mensaje abre el editor y cuelga en headless.
git tag -a "${TAG_PREFIX}${STAGED_VER}" -m "${TAG_PREFIX}${STAGED_VER}"
```

> ℹ️ Ese segundo assert verifica **que el tag exista en origin**, no que npm tenga la versión — no
> son lo mismo. Si `cli-publish.yml` falló (tests, npm caído) el tag existe y npm no tiene nada. La
> comprobación autoritativa es `npm view @timekast/factory@X.Y.Z version`; el caso `E409` y su
> salida están en [`project/runbooks/satellite-tags.md`](../../../project/runbooks/satellite-tags.md).

### 5.5 No push aquí

Phase 5 deja: 1 merge commit local en main, los tags locales (kit si release + satélites si 3.5 bumpeó), y `BUMP_COMMITS` commits locales en source. Nada pushado — Phase 6 lo maneja.

### Anti-patterns Phase 5

```
❌ git push aquí   ❌ --no-verify (salvo loop infinito comprobado + autorización explícita)   ❌ Skip tag en release
❌ Tag `v*` en ship (el kit no se taggea en ship; los satélites SÍ)   ❌ Tag liviano (sin -a) o `-a` sin `-m` (cuelga headless)
❌ Taggear un satélite sin el assert de dos árboles → un tag que promete una versión que el merge no trajo
```

---

# Phase 6 — Push

**Propósito:** pushear source (con bump+CHANGELOG si release), main (merge commit), y tag (release). Cada `git push` triggerea el harness permission prompt — ese es el gate (GIT.md §2). Summary informativo previo, sin CP propio.

### 6.1 Summary informativo (sin gate)

Mostrar los comandos exactos que se van a ejecutar (orden abajo) + nota de que cada push pide permiso.

### 6.2 Ejecutar pushes en orden

> 🔴 **`UNPUSHED` se recomputa acá, no se lee de §1.1.** El valor de Phase 1.1 es anterior al bump de
> Phase 3.5. Si valía `0` y 3.5 commiteó, el `if` viejo saltaba el push de source: el bump llegaba a
> `main` por el merge pero **nunca a `{SOURCE_BRANCH}`**, y el siguiente ciclo leería una versión
> vieja de `package.json` y volvería a bumpear el mismo número.
>
> ```bash
> UNPUSHED=$(git rev-list --count "origin/${SOURCE_BRANCH}..${SOURCE_BRANCH}" 2>/dev/null || echo 0)
> ```

**Release mode:**

```bash
git push origin "${SOURCE_BRANCH}"   # 1. source primero — propaga bump+CHANGELOG
git push origin main                 # 2. main con merge commit
git push origin "v${NEW_VERSION}"    # 3. tag del kit
# 4. tags satélite — uno por cada línea que Phase 3.5 bumpeó (§5.4)
git push origin "${TAG_PREFIX}${STAGED_VER}"
```

**Ship mode:**

```bash
if [ "$UNPUSHED" -gt 0 ]; then git push origin "${SOURCE_BRANCH}"; fi   # 1. (recomputado arriba)
git push origin main                 # 2. main
# 3. tags satélite — ship NO taggea el kit, pero SÍ corta las líneas satélite (§5.4)
git push origin "${TAG_PREFIX}${STAGED_VER}"
```

> 🔴 **Sin este push el modo no publica nada.** El tag es lo único que dispara `cli-publish.yml` /
> `gui-release.yml`; un tag que se queda local no llega a ninguna Action. Los satélites van
> **después** de `main` a propósito: el guard de ambas Actions rechaza un tag que aún no sea
> ancestro de `main`, y en ese orden ya lo es.

Cada uno → harness pide permiso. Si autoriza → continúa. Si rechaza → 6.3.

### 6.3 Recovery — user rechaza un push mid-stream

- **Rechaza el primero (source):** nada pushado. Mostrar comandos de revert al user (`git reset --hard origin/main` en main + `git tag -d` de TODOS los tags creados en 5.4 + `git reset --soft HEAD~${BUMP_COMMITS}` en source).
- **Rechaza después del push de source (release):** source ya tiene bump+CHANGELOG. Mostrar para completar manual (`git push origin main && git push origin vX.Y.Z`) o revertir (force-push prohibido — bump queda en source).
- **Rechaza el tag del kit:** main ya actualizado, falta el tag. Mostrar `git push origin vX.Y.Z` para completar o `git tag -d` para descartar local.
- **Rechaza un tag satélite:** `main` ya tiene el bump; falta **publicar**. El tag quedó local y su Action nunca corrió. Mostrar `git push origin ${TAG_PREFIX}${STAGED_VER}` para completar (se puede hacer después, el merge commit no se mueve), o `git tag -d ${TAG_PREFIX}${STAGED_VER}` para descartarlo — en ese caso queda un bump en `main` sin publicar y el próximo ciclo detectará la línea como cambiada. Procedimiento: [`project/runbooks/satellite-tags.md`](../../../project/runbooks/satellite-tags.md).

### 6.4 Final summary tras push exitoso

Mostrar tabla: modo, source→main, merge commit sha, tag, nota del deploy automático del destino (Vercel o Railway, según `target`; lo observa 7.5.7). Continuar a Phase 7.

### Anti-patterns Phase 6

```
❌ Push automático sin harness prompt   ❌ git push --force   ❌ --no-verify
❌ Tag antes de main   ❌ main antes de source (release)   ❌ Saltar push del tag
```

---

# Phase 7 — Post-release + return

**Propósito:** detectar first-release de derivado (transición one-way 0.0.0→1.0.0+), ejecutar pasos si aplica, y SIEMPRE regresar al source branch (NUNCA `git merge main` — BR-FACTORY-004).

Lectura previa obligatoria: [methodology/post-release-transition.md](./methodology/post-release-transition.md).

### 7.1 Detectar transición

```javascript
const IS_FIRST_RELEASE_DERIVED =
  !IS_FACTORY && MODE === 'release' && PREVIOUS_VERSION === '0.0.0' && NEW_VERSION !== '0.0.0';
```

`PREVIOUS_VERSION` = `BUMP_FIELD_CURRENT` registrado en Phase 0 (antes del bump).

### 7.2 Caso A: First-release derivado — transición

```bash
DEVELOP_EXISTS=$(git branch --list develop)
if [ -z "$DEVELOP_EXISTS" ]; then
  git branch develop main
  git push origin develop      # harness prompt; si falla, log y continuar
fi
git checkout develop
```

Emit `templates/post-release-summary.template.md`: tag, develop creada/confirmada, branching post-release, el recordatorio de configuración **según el destino** (`target` del estado: Vercel → config manual de branches, production=`main` / preview=`develop`; Railway → si `provision` dio de alta el proyecto, nada que configurar a mano porque ya ató cada entorno a su rama; si el state lo reconstruyó `--adopt`, revisar las ramas en el dashboard) y, **solo si el repo es el Factory** (`is_factory: true`), recordar BR-FACTORY-004 — en un derivado ese bloque se omite.

### 7.3 Caso B: No first-release — return simple

```bash
git checkout "${SOURCE_BRANCH}"
```

**NUNCA** después: `git merge main`, `git pull origin main`, `git merge --ff-only origin/main`. Si necesitas un commit de main en source → `git cherry-pick <sha>` puntual. (BR-FACTORY-004 — recovery en [methodology/post-release-transition.md §7](./methodology/post-release-transition.md)).

### 7.4 Restore de paths ignored perdidos (snapshot de Phase 4.1)

El `checkout main` + merge pudo borrar del disco paths gitignored que existían en source (ej: `plan/`). Restaurar desde el snapshot:

```bash
# Se RE-DERIVA igual que en Phase 4.1 (mismo repo → mismo nombre). Con `$$` el PID no coincide
# entre shells y este `if` da falso, saltándose el restore sin decir nada; con un literal global
# extraería el snapshot de otro repo dentro de este. Ver el aviso 🔴 de 4.1.
REPO_KEY=$(git rev-parse --show-toplevel | shasum | cut -c1-8)
PRESERVE_TGZ="/tmp/tk-deploy-preserve-${REPO_KEY}.tgz"
PRESERVE_TXT="/tmp/tk-deploy-preserve-${REPO_KEY}.txt"

if [ -f "$PRESERVE_TGZ" ]; then
  tar -xzf "$PRESERVE_TGZ" 2>/dev/null || true   # re-extrae; sobreescribe con misma versión si no se perdió (no-op)
  rm -f "$PRESERVE_TGZ" "$PRESERVE_TXT"
  echo "♻️  Paths ignored restaurados desde snapshot (quedan untracked + gitignored)."
elif [ -s "$PRESERVE_TXT" ]; then
  # El .txt existe pero el .tgz no: el tar falló en 4.1 (disco lleno, permisos) y su
  # `|| true` se lo tragó. Nombrar los paths que quedaron sin respaldo — el usuario puede
  # verificar a mano si el checkout se los llevó. Un restore que no ocurre debe DECIRLO.
  echo "⚠️  Había paths ignored para preservar pero NO se generó el snapshot. Verifica:"
  cat "$PRESERVE_TXT"
  rm -f "$PRESERVE_TXT"
fi
```

> Los archivos restaurados quedan untracked y gitignored — no aparecen en `git status`, no se re-trackean.

### 7.5 Restore deps si lockfile cambió

```bash
if git diff "HEAD@{1}" HEAD -- pnpm-lock.yaml | grep -q "^"; then pnpm install; fi
```

### 7.5.5 Verificar la publicación de las líneas satélite (solo Factory)

> **Solo `IS_FACTORY`, y solo si Phase 3.5 bumpeó alguna línea.** El bump vive en Phase 3.5 y el
> corte del tag en Phase 5.4 — acá **solo se verifica** que la Action que el tag disparó haya
> terminado bien. Mismo contrato que 7.5.6: **best-effort observability, NUNCA un gate**.
>
> Cadena por línea: `tag cli-v* → cli-publish.yml → npm (dist-tag latest)` ·
> `tag gui-v* → gui-release.yml → .dmg/.exe en GitHub Release`.

```bash
# Headless-safe: sin `gh` o sin auth (ej: una corrida headless) → skip-con-nota, sin STOP.
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  TAG_SHA=$(git rev-list -n 1 "${TAG_PREFIX}${STAGED_VER}")
  gh run list --workflow="${WORKFLOW}" --json status,conclusion,headSha,databaseId
  #   → matchear el run cuyo headSha == TAG_SHA (NO `--limit 1`: reportaría un run viejo).
  #     Si aún no aparece → In-progress, no fallo.
fi
# Solo la línea CLI tiene comprobación de registro público:
npm view "@timekast/factory@${STAGED_VER}" version    # debe existir; si no, la Action no publicó
```

Evaluación: **success** → ✅ en el summary 7.6. **In-progress / run no registrado** → nota
no-bloqueante + comandos para re-chequear. **Failure** → nota con la causa y el `gh run rerun <id>`;
el guard de ambas Actions re-evalúa la ancestría al re-correr, así que un rerun tras landear `main`
es un camino válido. Procedimiento completo (incluido `E409`):
[`project/runbooks/satellite-tags.md`](../../../project/runbooks/satellite-tags.md).

> 🔴 **Nunca aborta el flow.** El tag ya está pusheado e inmutable y las Actions son re-ejecutables
> aparte. En headless, skip-con-nota.
>
> **Un tag existente ≠ una versión publicada.** Si la Action falló, el tag está y npm no tiene nada.
> Por eso la comprobación autoritativa del CLI es `npm view`, no la presencia del tag.
>
> **Primer tag (sequencing):** el primer tag de una línea tras introducir su Action debe apuntar a un
> commit que ya la incluya (sino no dispara nada). Se cumple naturalmente: el bump se commitea
> después de que el workflow ya esté en la branch.

### 7.5.6 Verificar la cadena de distribución (solo Factory + release)

> **Solo `IS_FACTORY` Y `MODE === 'release'`.** El tag `v*` pusheado en Phase 6 dispara la Action `dist-release.yml` (~36s async) que **construye los tarballs (`tk-full`/`tk-core`) y crea el GitHub Release** — la pieza que consume el CLI de distribución (`new`/`add`/`update` bajan de GitHub Releases). `tk-deploy` solo crea el git tag; **la pieza shippable la completa la Action**. Cadena: `tag → dist-release.yml → tarballs + GitHub Release`. Runbook: [`project/runbooks/distribution-smoke-test.md`](../../../project/runbooks/distribution-smoke-test.md) Prereq #3.
>
> 🔴 **Es best-effort observability, NUNCA un gate.** Su fallo **no aborta el release** — el tag ya está pusheado e inmutable, y la Action es re-ejecutable aparte. Ship no taggea (no aplica); los derivados no tienen esta Action (gate `IS_FACTORY` los salta limpio).

```bash
if [ "$IS_FACTORY" = "true" ] && [ "$MODE" = "release" ]; then
  # Headless-safe: si gh no está o no está autenticado (ej: una corrida headless) → skip-con-nota, sin STOP.
  if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
    echo "⏭️  Verificación dist-release omitida (gh no disponible/auth). Manual: gh release view v${NEW_VERSION}"
  else
    # Resolver el run de ESTE tag por SHA — NO solo --limit 1 (evita reportar un release viejo).
    TAG_SHA=$(git rev-list -n 1 "v${NEW_VERSION}" 2>/dev/null)
    gh run list --workflow=dist-release.yml --json status,conclusion,headSha,databaseId,createdAt
    #   → matchear el run cuyo headSha == TAG_SHA. Si aún no aparece (la Action tarda en registrarse)
    #     → tratar como In-progress (no como fallo).
    # prerelease esperado: MISMA fuente que la Action (dist-release.yml) — no re-expresar la regla.
    EXPECTED_PRERELEASE=$(pnpm tsx distribution/prerelease.ts "v${NEW_VERSION}" 2>/dev/null)
    gh release view "v${NEW_VERSION}"   # confirmar assets tk-*.tgz + comparar prerelease vs EXPECTED_PRERELEASE
  fi
fi
```

Evaluación del resultado:

- **Success** — Action `success` + Release con assets `tk-*.tgz` + `prerelease` del Release == `EXPECTED_PRERELEASE` → ✅ en el summary 7.6. `EXPECTED_PRERELEASE` lo resuelve `distribution/prerelease.ts` (la **misma** fuente que invoca la Action en `dist-release.yml`) — sin re-expresar la regla `-rc.`/`test` en el SKILL.
- **In-progress / run aún no registrado** → nota no-bloqueante en el summary (`⏳ pendiente ~36s`) + comandos para re-chequear (`gh run watch <id>`, `gh release view v${NEW_VERSION}`). Continuar.
- **Failure** (Action `failure`, o Release sin assets):
  - **Interactivo** → verification-STOP inline (NO es un CP de la tabla header — estilo Phase 1.5.2/4.5.1):
    ```markdown
    | #   | Acción                                            |
    | --- | ------------------------------------------------- |
    | 1   | re-run la Action (`gh run rerun <id>`)            |
    | 2   | investigar (mostrar logs: `gh run view <id> --log`) |
    | 3   | continuar — el tag ya está pusheado, la Action es re-ejecutable aparte |

    🛑 STOP — Responde con el número.
    ```
  - **Headless** → degrada a nota no-bloqueante en el summary (no STOP). El release no se aborta.

> ℹ️ **La línea `gui-v*` sigue el mismo camino.** No tiene una fase propia: `desktop/` es una
> entrada más de `SATELLITE_LINES` (§0.4), la bumpea Phase 3.5, la taggea Phase 5.4 y la verifica
> 7.5.5. El build de instaladores (`.dmg` + `.exe`) lo hace `gui-release.yml` en runners macOS +
> Windows — **nunca local**; el GitHub Release se auto-publica y el gate es el repo privado (solo
> miembros del org descargan).
>
> 🔴 **Aislamiento de líneas:** un `gui-v*` NO debe confundir la resolución de "última del kit" —
> `status`/`update` de los derivados filtran GitHub Releases a tags `v*` (`isKitReleaseTag`; ver
> `fx-distribution §4`). La detección de Phase 1.1 es ortogonal a ese filtro.

### 7.5.7 Observar el deploy real (según el destino)

> **Corre en `ship` Y en `release`** — los dos mergean al mismo `main`, y post-release ese `main`
> es producción (`GIT.md §4`). Observa en el destino que registra `target` en
> `.timekast/provision.json` (§1.4): Vercel o Railway. No hay gate de `IS_FACTORY`: el Factory no
> corre el paso del destino (§1.4) y no tiene `target`, así que ahí la fase degrada sola a `⏭️`.
>
> 🔴 **Por qué existe.** Hasta acá el workflow terminaba en el push y delegaba al humano
> "monitorear el deploy". Un deploy que falla **después** del push no lo ve nadie hasta que lo
> reporta un usuario. Y el fallo no siempre está donde uno lo busca: `troubleshooting.md § Deploy`
> documenta el caso real, en Vercel, donde el log de build sale **limpio** —imprime hasta la tabla de
> rutas— y el deployment igual termina en `ERROR`, con el motivo solo al final del stream de eventos.
> Por eso se consulta el **estado del deployment** en la plataforma, no un log de build local.
>
> 🔴 **Es observabilidad, no un gate que revierte** (misma doctrina que 7.5.5/7.5.6). El push ya
> ocurrió y es irreversible desde el workflow: ante un fallo, el workflow **para y pide decisión**
> — nunca declara el release terminado, y nunca intenta deshacer el merge por su cuenta.
>
> **No espera indefinidamente.** Cada destino hace **una** consulta: si el deployment del merge aún no
> termina (o la plataforma todavía no lo registra), la fase cierra en `⏳` con la forma de volver a mirar,
> y el workflow sigue.

Los tokens de las dos plataformas (`VERCEL_TOKEN`, `RAILWAY_TOKEN`) son del rail: viven en la bóveda
(`rail-timekast`, entorno `main`) y se leen con la sesión de la persona mediante el lector del kit para
bash, `scripts/tools/lib/rail.sh` (contrato → `fx-secrets-vault §3`; códigos de salida en el encabezado del
lector). No se toman del entorno: una copia exportada en la terminal se ignora. El valor queda en una
variable no exportada que nunca se imprime.

🔴 **Cada bloque corre bajo `bash` explícito, nunca en la shell del agente.** `rail.sh` es bash (usa
`BASH_SOURCE` para ubicar `.claude/policy/vault.json`) y se niega a cargarse desde zsh o sh; la shell del
agente puede ser cualquiera de las dos. El heredoc con delimitador entre comillas (`bash <<'EOF'`) le entrega
el bloque literal a un `bash` hijo: la shell externa no expande nada, y `rail_require` —que sale con su código
si no puede leer— termina ese hijo, no la sesión. El código de salida del hijo es lo único que la shell externa
lee. `jq` se comprueba **antes** del `source`: sin él, el lector no puede separar "clave ausente" de "respuesta
no reconocida".

🔴 **El token nunca se imprime.** Ningún bloque hace `echo` del token, lo pone en una URL o en un argumento de
`curl`, ni activa `set -x`: viaja **solo** en el header `Authorization`, que llega a `curl` por stdin
(`printf` builtin → `-H @-`; un `-H "Authorization: Bearer …"` en argumentos queda visible en `ps`), dentro
del `bash` hijo que leyó el rail. Los cuerpos de las consultas van en `-d` y no llevan secretos.

#### 7.5.7.1 Leer el destino

`IS_FACTORY=true` → no se corre nada: `⏭️ deploy no observado — el Factory no corre el paso del destino
(§1.4) y no tiene target`. En un derivado:

```bash
bash <<'EOF'
STATE=.timekast/provision.json
if [ ! -f "$STATE" ]; then
  echo "⏭️  Deploy no observado: no hay .timekast/provision.json (ningún destino registrado)."; exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "⏭️  Deploy no observado: falta jq (brew install jq)."; exit 0
fi
TARGET=$(jq -r '.target // empty' "$STATE" 2>/dev/null)
case "$TARGET" in
  vercel|railway) printf 'target=%s\n' "$TARGET" ;;
  *) echo "⏭️  Deploy no observado: el estado no registra el destino (target)." ;;
esac
EOF
```

| Destino | Qué corre |
| --- | --- |
| `target=vercel` | 7.5.7.2 — el flujo de Vercel |
| `target=railway` | 7.5.7.3 — el flujo de Railway (si en §1.4.3 se eligió "seguir sin observar", `⏭️` con esa causa, sin correr el bloque) |
| cualquier otro (`⏭️` arriba) | `⏭️ deploy no observado`, con la causa que registró §1.4 si hubo una (ambiguo, sin destino, token del rail ilegible, CLI que no conoce el modo); si no, la del bloque |

#### 7.5.7.2 Vercel

`.vercel/project.json` aquí solo aporta los **ids** del proyecto (`projectId`, `orgId`) de un repo cuyo
destino ya es Vercel — nunca decide el destino.

```bash
# Preflight de capacidad: sin los ids del proyecto de Vercel, sin jq o sin poder leer la credencial, no hay
# nada que observar. NO es un fallo del deploy — pero tampoco es un éxito verificado (ver evaluación abajo).
bash <<'EOF'
if [ ! -f .vercel/project.json ]; then
  echo "⏭️  Deploy no observado: falta .vercel/project.json (los ids del proyecto de Vercel)."; exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "⏭️  Deploy no observado: falta jq (brew install jq)."; exit 0
fi
RAIL_PROG="deploy-observe"
source scripts/tools/lib/rail.sh || exit $?
rail_require VERCEL_TOKEN VERCEL_RAIL_TOKEN   # sale con 40-45 si no puede leer (tabla en 7.5.7.4)
VERCEL_PROJECT_ID=$(jq -r '.projectId // empty' .vercel/project.json)
VERCEL_ORG_ID=$(jq -r '.orgId // empty' .vercel/project.json)
if [ -z "$VERCEL_PROJECT_ID" ] || [ -z "$VERCEL_ORG_ID" ]; then
  echo "⏭️  Deploy no observado: .vercel/project.json no trae projectId u orgId."; exit 0
fi
MERGE_SHA=$(git rev-parse main)
# 🔴 Filtrar por target=production Y por el SHA del merge — un push produce MÁS de un deployment
#    (production + preview) y un limit=1 puede devolver el de otra rama.
# 🔴 -f: un 401/403/404 sale distinto de cero aquí. Sin -f, el cuerpo de error no trae deployments
#    y se leería como "ningún deployment → en curso". teamId: el token está acotado al equipo.
# 🔴 El token viaja por stdin (printf builtin → -H @-), nunca en el argv de curl (visible en ps).
RESP=$(printf 'Authorization: Bearer %s\n' "$VERCEL_RAIL_TOKEN" | curl -sf -H @- \
  "https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_ORG_ID}&target=production&limit=10") \
  || { echo "⏭️  Deploy no observado: la llamada a Vercel falló (curl salió con $?)."; exit 0; }
if ! printf '%s' "$RESP" | jq -e 'type == "object" and (.deployments | type) == "array"' >/dev/null 2>&1; then
  echo "⏭️  Deploy no observado: Vercel respondió sin la lista de deployments."; exit 0
fi
MATCH=$(printf '%s' "$RESP" | jq -r --arg sha "$MERGE_SHA" \
  '[.deployments[] | select(.meta.githubCommitSha == $sha)][0] // empty
   | "\(.uid)\t\(.readyState // .state)\thttps://\(.url)"')
if [ -z "$MATCH" ]; then
  echo "⏳ Deploy en curso: Vercel aún no registra el deployment de ${MERGE_SHA}."
else
  printf '%s\n' "$MATCH"   # uid · readyState (QUEUED | BUILDING | READY | ERROR | CANCELED) · URL
fi
EOF
RC=$?
case "$RC" in
  0) ;;
  40|41|42|43|44|45) echo "⏭️  Deploy no observado (código $RC: no se pudo leer VERCEL_TOKEN del rail → tabla en 7.5.7.4, fx-secrets-vault §3)." ;;
  *) echo "⏭️  Deploy no observado (código $RC inesperado del bloque de observación)." ;;
esac
```

Evaluación del resultado (Vercel):

- **`READY`** → ✅ en el summary 7.6, con la URL del deployment.
- **`QUEUED` / `BUILDING` / deployment aún no registrado** → nota **no-bloqueante** en el summary
  (`⏳ deploy en curso`) + el comando para re-chequear (re-correr este bloque). Continuar. **Es un
  estado distinto de `ERROR`** y no debe confundirse con él — misma distinción que 7.5.6 hace para el
  run de la Action que todavía no aparece.
- **`ERROR` / `CANCELED`** — mostrar el **final del stream de eventos**, que es donde vive el motivo
  real (el estado trae `errorStep`/`errorCode`, y `errorMessage` suele venir `undefined`):

  ```bash
  # Misma lectura del rail que arriba, bajo bash explícito. El uid entra por el entorno del hijo:
  # el heredoc entre comillas no expande nada de la shell externa. El EOF de cierre va sin sangría.
  DEPLOYMENT_ID="<uid del deployment>" bash <<'EOF'
  command -v jq >/dev/null 2>&1 || { echo "⏭️  Sin jq no se lee el rail (brew install jq)."; exit 0; }
  RAIL_PROG="deploy-observe"
  source scripts/tools/lib/rail.sh || exit $?
  rail_require VERCEL_TOKEN VERCEL_RAIL_TOKEN
  VERCEL_ORG_ID=$(jq -r '.orgId // empty' .vercel/project.json)
  EVENTS=$(printf 'Authorization: Bearer %s\n' "$VERCEL_RAIL_TOKEN" | curl -sf -H @- \
    "https://api.vercel.com/v3/deployments/${DEPLOYMENT_ID}/events?teamId=${VERCEL_ORG_ID}") \
    || { echo "⏭️  No se pudo leer el stream de eventos (curl salió con $?)."; exit 0; }
  printf '%s\n' "$EVENTS" | tail -40
  EOF
  ```

  - **Interactivo** → verification-STOP inline (NO es un CP de la tabla header — estilo 7.5.6):

    ```markdown
    | #   | Acción                                                                     |
    | --- | -------------------------------------------------------------------------- |
    | 1   | ver el stream de eventos completo (sin avanzar)                            |
    | 2   | investigar en el dashboard de Vercel (mostrar la URL del deployment)       |
    | 3   | continuar — el merge ya está pusheado; el fix va en un commit nuevo        |

    🛑 STOP — Responde con el número.
    ```

    > No hay opción de "revertir": el merge a `main` ya se pusheó y deshacerlo es un acto aparte
    > (un revert commit), no un paso de este workflow.

  - **Headless** → degrada a nota no-bloqueante en el summary (no STOP), igual que 7.5.6. El
    release no se aborta, pero el summary dice **`❌ deploy en error`**, nunca ✅.

#### 7.5.7.3 Railway

Con los ids del bloque `railway` del estado —proyecto, servicio y el entorno que el bloque mapea como `main`
(en un repo adoptado cuyo entorno de producción se llama `production`, el id guardado como `main` es el que
vale: se usa el **id**, nunca el nombre)— consulta los deployments por la API GraphQL y busca el que tiene
`meta.commitHash` igual al SHA del merge. El documento, sus argumentos y los campos que lee son los del
extracto fechado del esquema (`cli/tests/fixtures/railway-schema-2026-09-23.json`), los mismos que usa el
cliente del CLI (`listDeployments` en `cli/src/lib/railway-api.ts`). La prueba de vida del token **nunca** es
`me`: con un token de equipo responde "Not Authorized" estando vivo (`fx-secrets-vault §5`) — aquí no hay
prueba aparte, la consulta de deployments es la prueba.

```bash
bash <<'EOF'
if ! command -v jq >/dev/null 2>&1; then
  echo "⏭️  Deploy no observado: falta jq (brew install jq)."; exit 0
fi
STATE=.timekast/provision.json
RW_PROJECT=$(jq -r '.railway.projectId // empty' "$STATE" 2>/dev/null)
RW_SERVICE=$(jq -r '.railway.serviceId // empty' "$STATE" 2>/dev/null)
RW_ENV=$(jq -r '.railway.environments.main // empty' "$STATE" 2>/dev/null)   # el id mapeado como main
if [ -z "$RW_PROJECT" ] || [ -z "$RW_SERVICE" ] || [ -z "$RW_ENV" ]; then
  echo "⏭️  Deploy no observado: el estado no trae el bloque railway completo (corre factory provision --adopt --force --target=railway)."; exit 0
fi
RAIL_PROG="deploy-observe"
source scripts/tools/lib/rail.sh || exit $?
rail_require RAILWAY_TOKEN RAILWAY_RAIL_TOKEN   # sale con 40-45 si no puede leer (tabla en 7.5.7.4)
RW_API="https://backboard.railway.com/graphql/v2"
RW_PAGE=20   # = RAILWAY_DEPLOYMENTS_PAGE del CLI: cuántos deployments recientes se revisan
MERGE_SHA=$(git rev-parse main)
# Cuerpo sin secretos → va en -d. Nombres de campo del extracto fechado del esquema.
BODY=$(jq -nc --arg p "$RW_PROJECT" --arg e "$RW_ENV" --arg s "$RW_SERVICE" --argjson n "$RW_PAGE" '{
  query: "query ($first: Int, $input: DeploymentListInput!) { deployments(first: $first, input: $input) { edges { node { id status createdAt meta } } } }",
  variables: { first: $n, input: { projectId: $p, environmentId: $e, serviceId: $s } } }')
# 🔴 El token viaja por stdin (printf builtin → -H @-), nunca en el argv de curl (visible en ps).
# 🔴 -f: un 4xx/5xx sale distinto de cero y nunca se lee como "aún no registrado".
RESP=$(printf 'Authorization: Bearer %s\n' "$RAILWAY_RAIL_TOKEN" | curl -sf -X POST -H @- \
  -H "Content-Type: application/json" -d "$BODY" "$RW_API") \
  || { echo "⏭️  Deploy no observado: la llamada a Railway falló (curl salió con $?)."; exit 0; }
# GraphQL responde 200 también con error: exigir la lista y ningún `errors`.
if ! printf '%s' "$RESP" | jq -e '(.errors | not) and (.data.deployments.edges | type) == "array"' >/dev/null 2>&1; then
  echo "⏭️  Deploy no observado: Railway respondió sin la lista de deployments."; exit 0
fi
# Más de un deployment del mismo commit (un redeploy manual, o serviceConnect + el deploy de provision):
# se toma el más reciente, y se reporta cuántos hubo.
MATCH=$(printf '%s' "$RESP" | jq -r --arg sha "$MERGE_SHA" '
  [.data.deployments.edges[].node
   | select((((.meta | objects | .commitHash | strings) // "") | ascii_downcase) == $sha)]
  | sort_by(.createdAt) | reverse
  | if length == 0 then empty else "\(.[0].id)\t\(.[0].status)\t\(length)" end')
if [ -z "$MATCH" ]; then
  echo "⏳ Deploy en curso: Railway aún no registra el deployment de ${MERGE_SHA}."; exit 0
fi
IFS=$'\t' read -r DEP_ID DEP_STATUS DEP_COUNT <<< "$MATCH"
# Clasificación del enum `DeploymentStatus` del extracto fechado (= DEPLOYMENT_STATE_CLASS del CLI).
case "$DEP_STATUS" in
  SUCCESS|SLEEPING) CLASS="success" ;;
  INITIALIZING|QUEUED|WAITING|NEEDS_APPROVAL|BUILDING|DEPLOYING) CLASS="pending" ;;
  FAILED|CRASHED) CLASS="failed" ;;
  REMOVING|REMOVED|SKIPPED) CLASS="ended" ;;   # otro deploy lo reemplazó u omitió → ⏭️, nunca ❌
  *) CLASS="unobservable" ;;   # un valor que el extracto no conoce: nunca se lee como éxito
esac
RW_DASHBOARD="https://railway.com/project/${RW_PROJECT}/service/${RW_SERVICE}?environmentId=${RW_ENV}&id=${DEP_ID}"
printf '%s\t%s\t%s\t%s\t%s\n' "$DEP_ID" "$DEP_STATUS" "$CLASS" "$DEP_COUNT" "$RW_DASHBOARD"
EOF
RC=$?
case "$RC" in
  0) ;;
  40|41|42|43|44|45) echo "⏭️  Deploy no observado (código $RC: no se pudo leer RAILWAY_TOKEN del rail → tabla en 7.5.7.4, fx-secrets-vault §3)." ;;
  *) echo "⏭️  Deploy no observado (código $RC inesperado del bloque de observación)." ;;
esac
```

> ⚠️ **La URL del deployment es la del dashboard de Railway**, armada con los ids: el extracto fechado del
> esquema no incluye un campo de URL en `Deployment` (solo `id`, `status`, `createdAt`, `meta`). Si esa URL
> no abre el deployment, el proyecto y el servicio que nombra siguen siendo los correctos: se busca el
> deployment por su id en el dashboard.

Evaluación del resultado (Railway) — `id · status · clase · cuántos deployments del commit · URL`:

| Clase | Estados del enum | Resultado |
| --- | --- | --- |
| `success` | `SUCCESS`, `SLEEPING` (quedó vivo y reposa) | ✅ en el summary 7.6, con la URL del deployment |
| `pending` (o aún no registrado) | `INITIALIZING`, `QUEUED`, `WAITING`, `NEEDS_APPROVAL`, `BUILDING`, `DEPLOYING` | `⏳ deploy en curso`, nota **no-bloqueante** + re-chequeo (re-correr este bloque, o abrir la URL). Continuar. **Distinto de fallo** |
| `failed` | `FAILED`, `CRASHED` | ❌ — final del log + STOP (abajo) |
| `ended` | `REMOVING`, `REMOVED`, `SKIPPED` (otro deploy lo reemplazó, o Railway lo omitió) | `⏭️ deploy reemplazado u omitido por otro deploy — revisa el dashboard`, con la URL. **No** es ❌: no dice nada de si el código falla. Sin log ni STOP; continuar |
| `unobservable` | cualquier valor que el extracto no conoce | `⏭️ deploy no observado` nombrando el estado — **nunca** ✅ |

Si hubo más de un deployment del commit, la nota lo dice ("N deployments de este commit; se evaluó el más
reciente").

**❌ — mostrar el final del log del deployment**, donde vive el motivo:

```bash
# Misma lectura del rail que arriba, bajo bash explícito. El id entra por el entorno del hijo.
DEPLOYMENT_ID="<id del deployment>" bash <<'EOF'
command -v jq >/dev/null 2>&1 || { echo "⏭️  Sin jq no se lee el rail (brew install jq)."; exit 0; }
RAIL_PROG="deploy-observe"
source scripts/tools/lib/rail.sh || exit $?
rail_require RAILWAY_TOKEN RAILWAY_RAIL_TOKEN
RW_API="https://backboard.railway.com/graphql/v2"
LOG_LINES=40
BODY=$(jq -nc --arg id "$DEPLOYMENT_ID" --argjson n "$LOG_LINES" '{
  query: "query ($id: String!, $n: Int) { buildLogs(deploymentId: $id, limit: $n) { message } deploymentLogs(deploymentId: $id, limit: $n) { message } }",
  variables: { id: $id, n: $n } }')
LOGS=$(printf 'Authorization: Bearer %s\n' "$RAILWAY_RAIL_TOKEN" | curl -sf -X POST -H @- \
  -H "Content-Type: application/json" -d "$BODY" "$RW_API") \
  || { echo "⏭️  No se pudo leer el log (curl salió con $?): ábrelo en el dashboard."; exit 0; }
printf '%s' "$LOGS" | jq -r --argjson n "$LOG_LINES" '
  if .errors then "⏭️  Railway no devolvió el log: ábrelo en el dashboard."
  else ("— build —", ((.data.buildLogs // [])[-$n:][] | .message),
        "— deploy —", ((.data.deploymentLogs // [])[-$n:][] | .message)) end'
EOF
```

> ⚠️ **`buildLogs` y `deploymentLogs` no están en el extracto fechado del esquema** (el cliente del CLI no
> los usa). Si el esquema no los acepta, el bloque lo dice y remite al dashboard — nunca inventa un
> motivo. Es una degradación permanente del bloque, no un pendiente.

- **Interactivo** → verification-STOP inline (mismo patrón que Vercel, sin "revertir"):

  ```markdown
  | #   | Acción                                                                     |
  | --- | -------------------------------------------------------------------------- |
  | 1   | ver más del log (sin avanzar)                                              |
  | 2   | investigar en el dashboard de Railway (mostrar la URL del deployment)      |
  | 3   | continuar — el merge ya está pusheado; el fix va en un commit nuevo        |

  🛑 STOP — Responde con el número.
  ```

- **Headless** → nota no-bloqueante en el summary (no STOP): **`❌ deploy en error`**, nunca ✅.

#### 7.5.7.4 No observado (los dos destinos)

Sin destino registrado (§1.4 con `⏭️`, o sin `target`), sin los ids del destino (sin `.vercel/project.json`
o sin su `orgId`; sin el bloque `railway` completo), sin `jq`, sin poder leer el token del rail, una llamada
que falla —un 401/403/404 incluido—, una respuesta sin la lista de deployments, o un estado que el extracto
no conoce → nota explícita en el summary: `⏭️ deploy no observado`, con el motivo. Si fue el rail, qué falló
según el código (`40` sesión · `41` acceso — o el proyecto configurado no existe · `42` clave ausente · `43`
respuesta no reconocida · `44` `infisical` sin instalar · `45` falta `.claude/policy/vault.json`; arreglo de
cada uno → `fx-secrets-vault §3`). 🔴 **No es lo mismo que verificado.** No poder mirar nunca se reporta como
éxito — el summary dice que no se miró, y por qué. Y un fallo de la llamada **nunca** se lee como "deployment
aún no registrado": `⏳ en curso` exige una respuesta válida con la lista de deployments.

### 7.6 Final summary

Mostrar tabla: modo, source→main, tag del kit, branch actual ({source} o develop), branching phase, CHANGELOG path (release), transición one-way (si aplica), **líneas satélite cortadas** (si 3.5 bumpeó: la nueva `cli-vX.Y.Z` / `gui-vX.Y.Z` + estado de su Action ✅/⏳/⏭️/❌), **dist-release (solo Factory + release): ✅ verificado / ⏳ pendiente / ⏭️ omitido / ❌ fallo (no bloquea)**, **deploy observado (7.5.7): ✅ `READY` + URL / ⏳ en curso / ❌ en error / ⏭️ no observado** (el mismo campo en los dos destinos; en Railway, ✅ = `SUCCESS`/`SLEEPING` + URL). Marcar todas las todos `completed`. Workflow termina.

> 🔴 **El summary NUNCA cierra en "monitorear el deploy" a secas** (ni en Vercel ni en Railway). Esa línea era el hueco que 7.5.7 cierra: delegaba al humano la única verificación que decide si el deploy sirvió. Los próximos pasos que quedan son los que el workflow genuinamente no puede hacer por el user (fix del error si lo hubo, revert si lo decide) — nunca "fíjate si funcionó".

### Anti-patterns Phase 7

```
❌ git merge main → source post-release   ❌ git pull origin source   ❌ Olvidar Phase 7
❌ Re-bump después del push   ❌ Borrar tag pusheado   ❌ pnpm install si lockfile no cambió
❌ Olvidar el restore 7.4 → se pierden paths ignored (plan/, notas local-only) del disco
❌ Nombrar el snapshot con `$$` en 4.1/7.4 → el PID difiere entre shells, el `if` da falso y el restore se salta EN SILENCIO
❌ Bumpear o taggear una línea satélite en Phase 7 — el bump es de 3.5 y el tag de 5.4; acá el tag nacería FUERA de main y su Action lo rechazaría
❌ `npm publish` local (passkey biométrico → EOTP; lo hace `cli-publish.yml`) · build con `electron-builder` local (lo hacen los runners mac/win de `gui-release.yml`)
❌ Tratar 7.5.5 (verify satélite) como gate que aborta · asumir que un tag existente == versión publicada (si la Action falló, el tag está y npm no)
❌ Tratar 7.5.6 (dist verify) como gate que aborta el release · STOP en headless · asumir `gh` auth sin pre-check · `--limit 1` sin matchear el SHA del tag
❌ Cerrar el summary en "monitorear el deploy" sin haber consultado el estado del deployment en su destino (7.5.7)
❌ Elegir el destino de 7.5.7 por un archivo (`.vercel/project.json`, `vercel.json`, `railway.json`) en vez de `target`
❌ Reportar ✅ un deploy que no se pudo observar (sin `target`, sin los ids del destino o sin poder leer su token del rail) — "no observado" ≠ "verificado"
❌ Tratar un estado en curso (Vercel `QUEUED`/`BUILDING`; Railway clase `pending`) o aún-no-registrado como fallo · leer solo el log de build (en Vercel el motivo real vive al final del stream de eventos)
❌ `--limit 1` sobre deployments sin matchear el SHA del merge (`meta.githubCommitSha` en Vercel, `meta.commitHash` en Railway) — un push produce más de un deployment
❌ Imprimir o loguear `RAILWAY_TOKEN` (o `VERCEL_TOKEN`): `echo`, en la URL, en un argumento de `curl` (`-H "Authorization: Bearer $…"` queda en `ps`) o con `set -x` — el header va por stdin (`printf … | curl -H @-`)
❌ Probar el token de Railway con `me` (un token de equipo responde "Not Authorized" estando vivo) · mapear un `status` de Railway de memoria en vez del enum del extracto fechado · leer un estado desconocido como ✅
❌ Consultar Railway por el NOMBRE del entorno de producción en vez del id que el bloque `railway` mapea como `main`
```

---

## Archivos de output

### Durable (persistidos en repo)

| Path                                                                  | Cuándo                       |
| --------------------------------------------------------------------- | ---------------------------- |
| `package.json` (`factoryVersion`+`agentKitVersion` en Factory; `version` en derivado) | Phase 2 (release) — bumped   |
| `.claude/docs/CHANGELOG.md` (Factory) o `CHANGELOG.md` raíz (derived) | Phase 2 (release) — appended |
| Tag `vX.Y.Z`                                                          | Phase 5 (release)            |
| `cli/package.json` · `desktop/package.json` (Factory)                 | Phase 3.5 — bumped si la línea cambió |
| Tags `cli-vX.Y.Z` / `gui-vX.Y.Z` (Factory)                            | Phase 5 (release **y** ship, si 3.5 bumpeó) |
| Merge commit en `main`                                                | Phase 5                      |
| `.timekast/provision.json` (`target`) — commit propio `chore(provision): record deploy target`, fuera de `BUMP_COMMITS` | Phase 1 §1.4 (derivados) — solo si el modo sólo-resolver lo escribió |

### Transitional (locales hasta Phase 6)

| Path                             | Lifecycle                                                     |
| -------------------------------- | ------------------------------------------------------------- |
| Commits bump+CHANGELOG en source | Pushed en Phase 6; `git reset --soft HEAD~${BUMP_COMMITS}` si cancelas |
| Commits de bump satélite en source | Pushed en Phase 6; incluidos en el mismo `BUMP_COMMITS`      |
| Merge commit local en main       | Pushed en Phase 6; `git reset --hard origin/main` si cancelas |

---

## Invalidation handling

> ⚠️ Las recoveries que usan `HEAD~${BUMP_COMMITS}` corren en invocaciones Bash posteriores — `BUMP_COMMITS` NO persiste entre shells. Re-derivarlo inline antes del reset: **`2`** por el bump+CHANGELOG del kit (`1` en as-is, `0` en `ship`) **+ 1 por cada línea satélite que Phase 3.5 bumpeó**. El commit del destino de §1.4 no cuenta: queda debajo del punto de reset.
>
> 🔴 Con la variable vacía el reset **no falla**: `HEAD~` == `HEAD~1`, así que retrocede un commit en silencio y deja trabajo aplicado a medias. Guard obligatorio: `[ -n "${BUMP_COMMITS}" ] && [ "${BUMP_COMMITS}" -gt 0 ]` antes de resetear (detalle en §2.8).

- **Commits inesperados en origin/main (Phase 3):** CP3 — `1=continuar (default seguro si source pusheada) / 2=rebase (solo si source no pusheada) / 3=cancelar`.
- **Conflictos de merge (Phase 4):** CP4 — `1=favor source / 2=manual / 3=abort`.
- **Cancel en CP2 post-bump:** `git reset --soft HEAD~${BUMP_COMMITS}` (mostrar al user antes de ejecutar — CC.md §4).
- **Cancel post-Phase 5 (merge commit local, pre-push):** `git reset --hard origin/main` en main + `git checkout {source}` + `git reset --soft HEAD~${BUMP_COMMITS}` si `BUMP_COMMITS > 0` + `git tag -d` de los tags que 5.4 creó. Mostrar antes.
- **Bump auto-suggest = `none`:** sugerir cambiar a `ship` o forzar con flag (ver Phase 2.3).

---

## Out of scope

`/deploy` ejecuta el merge a `main` (+ bump/tag/distribución en Factory). **NO** cubre:

- **Configuración del destino:** en **Vercel**, conectar el proyecto y fijar production branch (`main`) / preview branch (`develop`) es manual en el dashboard (lo recuerda el summary; la configuración de branches no se hace por API). En **Railway** no hay nada manual: `factory provision` ata cada entorno a su rama. Las únicas llamadas a la API de una plataforma en este workflow son la lectura del paso del destino (§1.4, vía el CLI) y la observación read-only del deployment en 7.5.7, que degrada si no puede leer el token del rail.
- **Migraciones de DB a producción (modelo dual-env):** el repo maneja 2 branches Neon — `develop` (dev) y `main` (prod). El sweep de Phase 1.6 detecta _drift_ de migrations (schema TS ↔ migrations generadas) como bloqueante, pero `/deploy` mismo **NO corre** `db:migrate`. Si el merge incluye migrations nuevas (`src/lib/db/migrations/`), se aplican solas en el deploy productivo resultante, contra la DB de prod y **después** de buildear, según el destino: en **Vercel**, `vercel-build` (`pnpm build && pnpm db:migrate`) — gateado por el exit code del comando completo (si cualquiera de los dos falla, el deployment queda en `ERROR` y no deploya); en **Railway**, el pre-deploy del servicio (`TK_VAULT=off pnpm db:migrate`), que corre después del build y antes de promover el deployment. Sin paso manual ni GitHub Action en ninguno de los dos. El build va primero a propósito: con la migración primero, un build fallido dejaba la base de producción ya migrada y el alias sirviendo el código anterior — un estado que el rollback de deployment no deshace. Detalle del modelo y del porqué → `SK.md §1.4`.

---

## Subprocess delegation

**Ninguno.** El workflow es lineal sin paralelismo útil. La quality check de Phase 1.5 es inline Bash (`pnpm verify`), no subagent — el output es estándar y no requiere análisis adversarial.

---

_TimeKast Factory — tk-deploy workflow (factory-internal family)_
