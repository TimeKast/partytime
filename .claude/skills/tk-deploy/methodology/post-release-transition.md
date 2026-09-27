# tk-deploy — Post-release transition

> Reglas para la transición one-way de pre-release (v0.0.0) a post-release (v1.0.0+) en proyectos derivados, y la regla anti-fast-forward [BR-FACTORY-004](../../../../project/planning/project-config.md) que aplica siempre post-release.

---

## §1 ¿Qué es la transición one-way?

[GIT.md §4](../../../rules/GIT.md) define dos fases de branching:

| Fase             | Detección                                               | Branching                                           |
| ---------------- | ------------------------------------------------------- | --------------------------------------------------- |
| **Pre-release**  | `version === '0.0.0'` (y NO override en project-config) | main-first — push directo a main OK                 |
| **Post-release** | `version >= '1.0.0'` (X >= 1)                           | develop-first — main protegida, merge via `/deploy` |

La transición sucede UNA SOLA VEZ — cuando el primer `release` mode en un derivado bumpea de `0.0.0` a `1.0.0` (u otra versión target ≥1). A partir de ese punto, el proyecto opera en post-release forever.

**No aplica en Factory.** Factory tiene `version: 0.0.0` permanente (es template). El bump siempre es de `factoryVersion`, que no triggerea transición (ya está en develop-first por `is_factory: true`).

---

## §2 Trigger preciso (Phase 7.1)

```javascript
const isFirstRelease =
  !isFactory && mode === 'release' && previousVersion === '0.0.0' && newVersion !== '0.0.0'; // típicamente '1.0.0' por convención, pero acepta cualquier target ≥ 1
```

Si `isFirstRelease`, ejecutar pasos §3. Si no, saltar a la rama return-to-source de Phase 7 (ver SKILL.md).

---

## §3 Pasos de la transición

### 3.1 Verificar si `develop` existe

```bash
git branch --list develop
```

- Si **existe** (output no vacío): saltar al paso 3.3.
- Si **no existe**: crear desde `main`.

### 3.2 Crear `develop` desde `main`

```bash
# Estamos en main post-merge, post-tag (Phase 5 commit + tag), post-push (Phase 6)
git branch develop main          # local
git push origin develop          # push del branch nuevo — harness prompt
```

### 3.3 Switch a `develop`

```bash
git checkout develop
```

A partir de este momento, `develop` es la rama de trabajo del proyecto derivado.

### 3.4 Emit summary template

Workflow muestra `templates/post-release-summary.template.md` rellenado con:

- Versión nueva (ej: `v1.0.0`)
- Tag creado
- Branch `develop` creada (o confirmada existente)
- Próximo deploy debe ser `/deploy [ship|release]` desde `develop`

### 3.5 ⚠️ Vercel config manual

El user debe configurar manualmente en Vercel dashboard:

- **Production branch:** `main`
- **Preview branch:** `develop`

El workflow lo recuerda en el summary pero no lo automatiza (Vercel API integration está out of scope, ver SKILL.md §Out of scope).

---

## §4 BR-FACTORY-004 — NUNCA fast-forward post-release

Una vez en post-release, **JAMÁS** ejecutar:

```bash
❌ git checkout {source} && git merge main           # arrastra deletions de selective merge
❌ git merge --ff-only origin/main                    # mismo problema
❌ git pull origin main                                # implica merge — mismo problema
```

**Por qué:** `main` (post-merge selective) tiene paths borrados que en source SÍ existen. `git merge main → source` propaga esos deletions, borrando silenciosamente material interno (planning, backlog, runbooks).

**Incidente histórico (Factory v6.0.1, 2026-05-20):** un `git merge main` post-release borró cientos de archivos del backlog/planning del Factory. Recovery requirió `git checkout <sha-pre-merge> -- {paths}` manual.

### Flow correcto post-release

```bash
# Después de /deploy release exitoso:
git checkout develop      # o {source} en general
# Ya está sincronizada — los commits que fueron a main vinieron de develop original
```

### Si necesitas algo de main en source (raro)

```bash
git cherry-pick <sha-del-commit-en-main>   # ✅ OK
git merge main                              # ❌ NO
```

Caso típico: hotfix hecho directamente en main que quieres en develop. Cherry-pick puntual del commit específico, NO merge del branch.

---

## §5 Phase 7 — flow completo

> El flujo completo de Phase 7 vive en el **SKILL.md** (7.1 detectar transición · 7.2 Caso A first-release · 7.3 Caso B return-to-source · 7.4 restore de paths ignored · 7.5 restore deps · 7.5.5 verify de las Actions satélite · 7.5.6 dist verify · 7.6 final summary). Este companion es SSOT **solo** de la transición one-way (§3) y de BR-FACTORY-004 (§4); no re-narra el flow para no desincronizarse de la numeración del orquestador.
>
> ℹ️ El **bump** de las líneas satélite (`cli/`, `desktop/`) es de **Phase 3.5** y su **tag** de **Phase 5.4** — Phase 7 solo verifica que la Action publicó. Antes ambas cosas vivían acá (7.5.5/7.5.7, retiradas), y por eso el tag nacía fuera de `main`.

---

## §6 Anti-patterns

```
❌ Olvidar Phase 7 entero       # source branch queda en main, futuras sesiones rompen
❌ git merge main desde source  # BR-FACTORY-004 — pérdida silenciosa
❌ git pull origin {source}     # implica merge si source divergió — pérdida silenciosa
❌ Re-bump version manual       # corrompe el contrato del tag/CHANGELOG ya pusheado
❌ Borrar tag pusheado          # tags son inmutables — si hay error, crear vNext con fix
```

---

## §7 Recovery del incidente histórico

Si por error alguien hace `git merge main → develop` post-release y los paths del backlog/planning desaparecen:

```bash
# 1. Identificar el sha previo al merge inadvertido
git log --oneline -n 20

# 2. Restaurar paths borrados desde ese sha
git checkout <sha-pre-merge> -- \
  project/backlog \
  project/planning \
  project/factory \
  project/migration \
  project/runbooks \
  project/discovery-smoke-tests \
  project/pendientes_edmond.md \
  project/WORKFLOWS_MASTER_PLAN.md

# 3. Verificar que NO restauras cambios intencionales del release
git status
git diff --cached

# 4. Commitear el restore
git add -A
git commit -m "restore: recover paths after inadvertent merge from main

Affected by BR-FACTORY-004 violation. Restored from <sha-pre-merge>."
```

---

_TimeKast Factory — tk-deploy methodology: post-release-transition_
