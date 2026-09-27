# Distribución del Factory — `@timekast/factory`

> **Audiencia:** developers del org TimeKast **y agentes** (Claude Code es el consumidor principal del kit). Vive en `.claude/docs/` para que un agente lo encuentre por ruta. Lectura humana: ~2 min.
>
> **Qué es:** el CLI `@timekast/factory` distribuye el "cerebro" del Factory (`.claude/` + scripts) y, en proyectos nuevos, también el boilerplate Next.js (`src/`). Es público y delgado: solo se autentica con `gh` y baja los releases privados del repo Factory. Si no eres miembro del org TimeKast, el repo es invisible (404).

---

## Quick-start

Tres comandos cubren el 90% de los casos:

```bash
# 1. Crear un proyecto nuevo desde cero (boilerplate + cerebro, o solo cerebro)
npx @timekast/factory new MiApp
#    → interactivo: 1) App completa (Next.js + cerebro)  2) Solo el cerebro
#    → crea carpeta MiApp/, crea el repo TimeKast/MiApp, instala, hace git init propio

# 2. Meter el cerebro a un repo que YA existe
cd mi-repo-existente
npx @timekast/factory add
#    → auto-detecta: derivado del Factory (factoryVersion en package.json) → `full`
#      (incl. sk-* + SK.md); otro stack (Python/Flutter) → `core`. Nunca toca tu src/.
#    → flags: --full / --core fuerzan el perfil. Si ya tienes .claude/, redirige a update

# 3. Actualizar el cerebro de un proyecto ya configurado
npx @timekast/factory update   # funciona en cualquier repo (Python, Flutter, Go, Node…)
pnpm factory:update            # atajo equivalente — SOLO en repos Node (el CLI lo dejó en package.json)
#    → bumpea según lo instalado; respeta lo que agregaste local
```

> **`npx … update` vs `pnpm factory:update`:** hacen lo mismo. `pnpm factory:update` es solo un atajo que el instalador deja en el `package.json` de proyectos Node. Un repo sin `package.json` (Python, Flutter…) se actualiza con `npx @timekast/factory update`.

---

## Tabla de referencia rápida

| Comando                            | Qué hace                                                                                     | Cuándo                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npx @timekast/factory new <Name>` | Crea repo nuevo `TimeKast/<Name>` + instala (`full` o `core` según elijas) + `git init`      | Proyecto nuevo, en carpeta limpia (fuera de cualquier repo)             |
| `npx @timekast/factory add`        | Mete el cerebro en el repo (auto-detecta `full`/`core`; `--full`/`--core` override)          | Repo existente **sin** cerebro (si ya tiene `.claude/`, redirige a `update`) |
| `npx @timekast/factory update`     | Refresca lo que el lockfile tenga registrado (`.claude/` + scripts; `src/` nunca se toca). `--full` sube `core`→`full` | Mantener el cerebro al día                          |
| `pnpm factory:update`              | Alias de conveniencia del anterior — **solo** en proyectos Node con `package.json`           | Atajo en proyectos Node (idéntico a `npx @timekast/factory update`)     |
| `factory:status`                   | Versión instalada vs última (lee el lockfile)                                                | Saber si hay drift                                                      |
| `factory:doctor`                   | Reporta drift, archivos huérfanos y conflictos pendientes (incluye el aviso de seguridad A1) | Diagnóstico antes/después de un `update`                               |

---

## Modelo mental mínimo

### 1. El perfil vive en el lockfile (pegajoso, con un cross-grade aditivo)

- El perfil (`core` o `full`) se fija en `new`/`add` (o el `update` legacy auto-detecta) y queda grabado en `.timekast/lockfile.json`.
- Es **pegajoso:** `update` lee el lockfile para elegir el tarball. **Única excepción:** `update --full` hace **cross-grade `core` → `full`** (aditivo — agrega `sk-*` + `SK.md`, nunca baja `src/`). El downgrade `full` → `core` **no** está soportado (borraría archivos).
- El marcador canónico de "este repo lo gestiona el kit" es **`.timekast/lockfile.json`**, no el `package.json`. El lockfile se commitea (para que `status`/`doctor` funcionen en cualquier clon).

### 2. `npx` vs `pnpm` — el CLI no necesita `package.json`

- El CLI corre con **`npx @timekast/factory <cmd>`** y opera sobre `.claude/` + `.timekast/lockfile.json`. **No necesita `package.json`** → funciona en repos Python, Flutter, Go, etc.
- El alias **`pnpm factory:update` es solo conveniencia** y existe únicamente en proyectos Node, donde el instalador insertó el script en `package.json`.
- Por lo tanto: un repo **`core` sin `package.json`** actualiza con **`npx @timekast/factory update`**. Un proyecto Node puede usar el alias o npx indistintamente — hacen lo mismo.

### 3. Perfiles `full` y `core`

| Perfil   | Contenido                                                                            | Cómo se obtiene                                                          |
| -------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `full`   | todo `.claude/` (incl. `sk-*` + `SK.md`) + scripts. **`src/` solo en `new`**         | `new` (con `src/`); o `add`/`update --full` en un repo existente (cerebro full **sin** `src/` — el `track` lo excluye) |
| `core`   | `.claude/` (rules sin `SK.md`, agents, commands, hooks) + skills `tk-*`/`kb-*`/`fx-*` + scripts portables. **Sin `sk-*`, sin `src/`** | `add`/`update` auto-detect cuando NO es derivado del Factory, o forzando `--core` |

- El **boilerplate `src/`** solo lo baja `new` (en carpeta limpia, con su `git init` propio). `add`/`update` **nunca** tocan `src/`, en ningún perfil.
- `add`/`update`-legacy **auto-detectan**: `factoryVersion` en `package.json` → `full` (es un derivado del Factory); ausente → `core`. `--full`/`--core` overridean.
- Los `sk-*` referencian `src/` (`withAuth`, Drizzle, `INVENTORY`): tienen sentido en un derivado Next del kit (que ya tiene `src/`), no en un repo Python/Flutter — por eso el default es `full` para derivados y `core` para el resto.

### 4. Modelo de versión dual

Dos campos en el `package.json` del derivado codifican el _drift_ entre "de qué nací" y "qué cerebro tengo hoy":

| Campo             | Qué es                                          | Evolución                                  |
| ----------------- | ----------------------------------------------- | ------------------------------------------ |
| `factoryVersion`  | **Sello de nacimiento** — de qué boilerplate naciste | **Estático** (no hay update de `src/`)  |
| `agentKitVersion` | **Cerebro vivo** — qué versión del `.claude/` tienes | **Sube** con cada `factory:update`      |

> **Estado actual:** ambos campos arrancan en `10.0.0` — el inicio oficial de la **era unificada** (origen escribe `factoryVersion` y `agentKitVersion` al mismo número). El `9.5.x` fue el número intermedio para validar la distribución end-to-end; la campaña de smoke (2026-06-02) la confirmó, así que se comprometió el 10.0.0 oficial. En un **derivado** divergen con el tiempo: `factoryVersion` queda congelado en el bootstrap y `agentKitVersion` sube con cada `factory:update`.

> 🚫 No hardcodear versiones — leer siempre de `package.json`.

---

## ⚠️ Nota A1 — seguridad de `src/` es responsabilidad del derivado

> La seguridad de `src/` y sus dependencias (auth, middleware, Next.js, Drizzle, NextAuth) es responsabilidad del proyecto derivado; el canal de parches de `src/` llega en EPIC 2.

En claro: `src/` se baja **una vez** en el bootstrap (`new`) y queda **frozen**. `update` toca solo `.claude/` + scripts portables — **nunca** `src/`. Si aparece un CVE en `auth.ts`, en el `middleware`, en `next.config.ts` o en una dependencia (Next / NextAuth / Drizzle), ese parche **no llega solo** por `update` en EPIC 1. Mantener `src/` y sus deps al día es tarea del equipo del proyecto derivado. El canal automático para empujar esos parches (update agentico con merge inteligente) es **EPIC 2**.

---

## Edge case — `new` falla con 403 (sin "Repository creation")

Si `npx @timekast/factory new MiApp` falla con un **403 de GitHub** al intentar crear el repo (`gh repo create TimeKast/<Name>`), la causa es que tu cuenta **no tiene el privilegio org "Repository creation"** habilitado.

**Fix (lo hace el org owner, no tú ni el agente):** el owner habilita "Repository creation" en _Org Settings → Member privileges_. Detalle completo y los demás pasos de permisos en el runbook del owner: `project/runbooks/github-permissions-distribution.md`.

---

## Adoptar un repo con `.claude/` viejo (pre-distribución, sin lockfile)

Repos bootstrapeados **antes** del CLI (clone manual del template, factory vieja) tienen `.claude/` pero **no** `.timekast/lockfile.json`. La vía de adopción es **`npx @timekast/factory update`** (no `add` — `add` redirige a `update` si ve un `.claude/` sin lockfile). Dispara un **auto-registro legacy** (no falla):

1. **Auto-detecta el perfil:** `factoryVersion` en `package.json` → **`full`** (es un derivado del Factory → baja `sk-*` + `SK.md`); ausente → `core`. `--full`/`--core` overridean.
2. **Pregunta primero** (default **No**), mostrando el perfil detectado. Si no confirmas, no toca nada.
3. Al confirmar: hace **backup**, sobrescribe los archivos kit-owned con la última versión, agrega los nuevos, y **crea el lockfile**. Si hay `package.json`, deja el script `factory:update` y sella `agentKitVersion`.
4. **Tu `CLAUDE.md` se conserva** (no se sobrescribe). Verifica que importe las rules del kit (`@.claude/rules/*`) — `factory doctor` reporta rules sin importar.
5. Los archivos de tu `.claude/` que **no** están en el manifest (custom tuyos / `pj-*`) **no se borran** — se listan como `ambiguo — revisar manualmente`. `src/` nunca se toca.

Después de ese primer sync el repo queda registrado y los `update` siguientes son normales (lockfile-based). Si un repo quedó registrado `core` y luego quieres el cerebro completo, `update --full` lo sube (cross-grade aditivo).

---

_Deriva de `project/planning/DISTRIBUTION_DESIGN.md` (sesión 2026-06-01). Si los comandos o perfiles divergen de ese diseño, este doc está desactualizado._
