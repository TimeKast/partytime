# tk-deploy — Factory selective merge exclusions

> Procedimiento de Phase 4.6: cuando `is_factory: true`, ciertos paths de la source branch NO deben llegar a `main`. Aplica el principio de [BR-FACTORY-001](../../../../project/planning/project-config.md) actualizado a la estructura `project/` actual.

**No aplica en derivados.** Phase 4.6 se salta entero cuando `is_factory !== true`. Para derivados, el merge es total — la convención SK es que toda la fuente de verdad operativa vive en `src/` y se mergea a main sin excepciones.

---

## §1 ¿Por qué selective merge en Factory?

Factory es **meta-proyecto**: `main` y la branch de trabajo (`develop`) tienen contenido distinto **por diseño**.

- `main` = lo que viaja al proyecto derivado cuando un equipo bootstrapea desde el template. Solo necesita kit shipped + reference autogenerada.
- La branch de trabajo = todo lo anterior **MÁS** planning interno, backlog interno, runbooks operativos, migration notes, smoke tests, propuestas — material que no le sirve al derivado.

Merge total `source → main` contaminaría main con material interno del Factory. Selective merge resuelve el problema haciendo `git rm -rf` de los paths internos durante el merge `--no-commit`, antes del commit final.

---

## §2 Allowlist y DENY

### PRESERVE (allowlist — viaja a main)

| Path                     | Razón                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**/.gitkeep` (anywhere) | Mantiene estructura de directorios vacíos para que la convención de paths del kit siga siendo válida en derivados. Bajo `project/*`, el loop de DENY (§3 paso 1) borra el dir entero incl. su `.gitkeep`; el **paso 1b lo restaura** desde la source branch — sin él, esta fila sería letra muerta para `project/` (el tarball stable se buildea de main y no tendría el `.gitkeep`) |
| `project/reference/**`   | Autogenerados (`INVENTORY.md`, `CODEBASE.md`, `HOOKS.md`) — refresh en Phase 4.5; el derivado los regenera al primer build pero el snapshot inicial ayuda |

### DENY (Phase 4.6 — no viajan a main)

| Path                                 | Cómo                | Razón                                                                                                                                                                     |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project/*` (todo excepto allowlist) | `git rm -rf`        | Planning, backlog, runbooks, migration, smoke tests, propuestas, factory-internal docs — material no shippable                                                            |
| `src/app/showcase/**`                | `git rm -rf`        | Showcase factory-only (demo del design system del kit, vive solo en `develop`). No es shippable a `main` ni a derivados. **Primer path bajo `src/` que se excluye** del merge (el resto de `src/` viaja a main) — entry quirúrgico por path, no por dir top-level |

---

## §3 Snippet exacto (lo que ejecuta Phase 4.6)

```bash
# Pre-condición: estamos en main, post-merge --no-commit, post-autogen regen (Phase 4.5)
# git status muestra el merge commit pendiente con changes de source
# Shell-agnostic (corre igual en bash y zsh — NO usar `shopt`, que falla en zsh).

# 1) DENY project/* excepto reference/  — git rm -rf (el -f fuerza pese a estar staged)
for d in project/*/; do
  [ -e "$d" ] || continue                       # guard no-match (reemplaza `shopt -s nullglob`)
  case "$d" in project/reference/) continue ;; esac
  git rm -rf "$d" 2>/dev/null || true
done

# 1b) Re-preservar .gitkeep estructurales (PRESERVE allowlist §2). El loop (1) borró los dirs
#     ENTEROS, incl. sus .gitkeep; restaurarlos desde la source branch (MERGE_HEAD) los deja en
#     el árbol de main → el tarball stable (build-dist se construye DE main) los incluye, no solo
#     el canal beta (tag en develop). Hace verdadera la fila PRESERVE §2 y mantiene la convención
#     de paths del kit válida en derivados. General — NO hardcodea intake (cubre un 5º dir futuro).
git ls-tree -r --name-only MERGE_HEAD -- 'project/' | grep '/\.gitkeep$' | while IFS= read -r k; do
  git checkout MERGE_HEAD -- "$k" && git add -- "$k"
done

# 2) project/*.md sueltos en raíz — explícito (zsh aborta `project/*.md` si no hay match → guard)
for f in project/pendientes_edmond.md project/WORKFLOWS_MASTER_PLAN.md; do
  [ -e "$f" ] && git rm -f "$f" 2>/dev/null || true
done

# 3) src/app/showcase/ — borrar de main (showcase factory-only, vive solo en develop)
#    primer path bajo src/ excluido del merge; explícito por path (el loop de project/* no lo cubre)
git rm -rf src/app/showcase 2>/dev/null || true                   # borrar el showcase del merge result (factory-only — DRIFT-007)
```

**Notas:**

- **NO `shopt`** — es bash-only; el runtime puede ser zsh (`command not found: shopt` + glob nomatch aborta). El guard `[ -e "$d" ] || continue` logra lo mismo portable.
- `git rm -rf` (= `-r -f`): el `-f` es obligatorio — los paths del merge están staged, sin `-f` git rehúsa ("changes staged in the index"). NUNCA `--quiet`/`-rq` (esta versión de git los rechaza).
- **`src/app/showcase/` es delete por path (DRIFT-007):** único DENY que apunta dentro de `src/` (que por lo demás viaja a main entero). El paso 3 es explícito por path — el loop de `project/*` (paso 1) no lo alcanza. El `2>/dev/null || true` lo hace inofensivo si el showcase aún no existe en la source branch. Defensa redundante con la Barrera 2 (profiles.json excluye el showcase del tarball).

---

## §4 ¿Qué pasa con archivos sueltos en `project/` raíz?

Algunos archivos viven directamente en `project/` (no en un subdir): `project/pendientes_edmond.md`, `project/WORKFLOWS_MASTER_PLAN.md`. El snippet de §3 (paso 2) los limpia por nombre explícito con guard `[ -e ]` (no glob `project/*.md`, que zsh aborta si no hay match).

Si en el futuro hay archivos de tipos distintos sueltos en `project/` raíz que SÍ deban viajar a main, el snippet se actualiza para excluirlos por nombre explícito.

---

## §5 Verificación post-DENY

Inmediatamente después del loop, verificar que el state es el esperado:

```bash
# Lo único que debería quedar bajo project/ después del DENY:
git ls-files --cached -- 'project/*'
#   project/reference/INVENTORY.md · CODEBASE.md · HOOKS.md · SCHEMA.md · API.md
#   + los .gitkeep estructurales restaurados por el paso 1b (PRESERVE §2):
#     project/intake/.gitkeep · project/backlog/.gitkeep · project/factory/.gitkeep · project/proposals/.gitkeep
#   (los .gitkeep SON esperados — los restaura 1b; no son contaminación)

# src/app/showcase/ debe estar AUSENTE del merge result (factory-only, borrado — DRIFT-007):
git ls-files --cached -- 'src/app/showcase/*' | wc -l   # esperado: 0
```

Si `project/*` muestra otros paths **además de `reference/*` y los `.gitkeep` estructurales** (ej: `project/backlog/issue-foo.md`), o `src/app/showcase/*` muestra >0 → el merge introdujo paths no limpiados. Investigar antes de Phase 5. (Los `.gitkeep` de `intake`/`backlog`/`factory`/`proposals` SÍ deben aparecer — los restaura el paso 1b.)

---

## §6 Relación con BR-FACTORY-001

[BR-FACTORY-001](../../../../project/planning/project-config.md) en project-config.md establece el principio: "merge a main es quirúrgico". Este archivo es el **SSOT operativo del procedimiento concreto** — qué paths exactamente excluir y cómo.

Este archivo **cumple BR-FACTORY-001**.

> **`.agent/` (cerrado, 2026-08-05):** el cerebro legacy se retiró de develop en `ec119cb` y el `/deploy` de v11.5.0 confirmó main limpio, así que su disposición se quitó del workflow — era un `git rm` que ya no borraba nada. Si un clone viejo llega con `.agent/` tracked, el merge lo dejará pasar a main: es un dir legacy inerte, no una rotura, y se borra a mano.

---

## §7 Pre-resolución de conflictos DENY-scoped en el merge (Phase 4.3.1)

El raw merge `develop → main` (Phase 4.2) puede disparar `CONFLICT (modify/delete)` en paths que `main` tiene "borrados" (DENY de releases previos) y la source branch modificó — exactamente los paths que esta denylist excluye igual. Phase 4.3.1 **pre-resuelve esos conflictos antes de evaluar CP4**, para que CP4 solo dispare por conflictos reales en paths que SÍ viajan a main.

**La pre-resolución reusa la MISMA clasificación de §2 (SSOT única — no hay segunda denylist):**

| Clasificación (§2)            | Paths                                   | Disposición en 4.3.1                          | Disposición en 4.6                |
| ----------------------------- | --------------------------------------- | --------------------------------------------- | --------------------------------- |
| Allowlist autogen (viaja a main) | `project/reference/**`               | `git checkout --theirs` + `git add` (tomar source — la resolución es irrelevante: Phase 4.5 regenera del árbol mergeado) | preservado (refresh en 4.5) |
| Allowlist (viaja a main)      | `**/.gitkeep`                           | **no-op** — conflicto real, va a 4.3.2/CP4    | preservado (los de `project/*` vía restore 1b) |
| DENY-as-deletion              | `project/*` (resto) + sueltos de raíz   | `git rm -f` (resuelve como deletion)          | `git rm -rf`                      |
| DENY-as-deletion (src subpath)| `src/app/showcase/**`                   | `git rm -f` (resuelve como deletion)          | `git rm -rf`                      |
| Todo lo demás (viaja a main)  | `src/` (salvo `showcase/`), `.claude/`, `cli/`, `desktop/`, `distribution/`, root files | **no-op (default explícito)** — conflicto real, va a 4.3.2/CP4 | merge normal |

> **Los autogenerados se reparten en dos filas:** `project/reference/*` (INVENTORY/CODEBASE/HOOKS) viaja a main → conflicto pre-resuelto tomando source (4.5 regenera). `project/backlog/BOARD.md` (autogen del backlog, `update-board.ts`) NO viaja a main → cae en la fila DENY-as-deletion de `project/*` como cualquier otro path del backlog. Ningún autogenerado debe llegar a CP4.
>
> **`src/app/showcase/` es el único DENY *dentro* de `src/`:** el catch-all "todo lo demás" cubre `src/` salvo este subpath. En el `case` de 4.3.1, el branch `src/app/showcase/*` debe ir **antes** del default no-op (sino el showcase caería al no-op y quedaría como conflicto falso → CP4 espurio). Ambas fases lo **borran** (`git rm`); no se pisan (rm idempotente).


**🔴 Invariante:** 4.3.1 y 4.6 deben clasificar los paths **idénticamente**. Si esta denylist (§2) cambia, ambos snippets — el `case` de 4.3.1 (incluido el branch `src/app/showcase/*` antes del default no-op) y el `for`/`git rm` de 4.6.2-4.6.6 (incl. `git rm -rf src/app/showcase` por path) — deben actualizarse juntos (ver anti-pattern en §8).

---

## §8 Anti-patterns

```
❌ git rm -rf project/*           # Borra project/reference/ — perderías autogen
❌ git rm -rf project             # Borra el dir entero — Phase 4.5 ya regeneró reference/
❌ Saltar Phase 4.5 antes de 4.6  # reference/ quedaría con snapshot viejo o ausente
❌ shopt -s nullglob              # bash-only; falla en zsh — usar guard `[ -e ]`
❌ git rm --quiet / -rq           # esta versión de git los rechaza — usar `git rm -r -f`
❌ rm -rf en lugar de git rm -rf  # No actualiza el index; el commit no incluiría los deletes
❌ Editar la denylist de 4.6 sin actualizar el pre-pass de 4.3.1 (o viceversa)  # §2 es SSOT única; ambos snippets deben clasificar idéntico — sino drift silencioso
❌ Pre-resolver con git rm un path fuera del scope DENY (src/, cli/, distribution/)  # default del case DEBE ser no-op; esos son conflictos reales → CP4
```

---

_TimeKast Factory — tk-deploy methodology: factory-exclusions_
