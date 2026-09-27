# tk-deploy — Modes

> Schema operable de los modos del workflow: `ship`, `release` (con `--patch|--minor|--major`, `--as-is`, `--skip-verify`, `--skip-preflight`). Modos de ejecución ortogonales: `--step`, `--verbose`.

---

## Modos de ejecución: fluido (default) / `--step` / `--verbose`

Ortogonales a `ship`/`release` (aplican a ambos). Doctrina: [`fx-workflow-authoring §7.1`](../../fx-workflow-authoring/SKILL.md).

| Flag        | Efecto                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| (default)   | **fluido** — los checkpoints paran SOLO ante señal real; sin señal auto-avanzan con resumen.            |
| `--step`    | restaura el STOP en cada checkpoint (comportamiento legacy paso-a-paso).                                 |
| `--verbose` | amplía el resumen / STOP de cada CP con la tabla + commits + detalle. Coexiste con `verbose=true` legacy. |

**Qué se suelta en fluido (deploy) y qué NO:**

- **Se suelta (auto-advance):** solo **CP1 estado `valid`** (tree limpio, branch correcta, hay commits → sin decisión).
- **Sigue parando (señal real, en fluido y `--step`):** CP1 `blocking`, branch-mismatch (§1.2), Caso B first-release (transición ONE-WAY — `CC.md §4`), none-bump, §2.6 editar CHANGELOG, CP2 release, CP3 (commits inesperados), CP4 (conflictos).
- **Gates que SIEMPRE paran (no son checkpoints):** `verify` / build / sweep (fail-closed) y el push a `main` (gate del harness).

> deploy fluido es un win acotado (elimina el prompt de CP1-valid). El payoff ergonómico mayor del modo fluido está en `tk-backlog`.

---

## Modo: `ship`

**Propósito:** mandar lo que está en la source branch a `main` para que Vercel construya producción / preview, **sin marcar los cambios como versión nueva**.

| Acción                             | En `ship`                          |
| ---------------------------------- | ---------------------------------- |
| Bump de version field              | ❌                                 |
| CHANGELOG entry                    | ❌                                 |
| Tag `vX.Y.Z`                       | ❌                                 |
| Bump + tag de líneas satélite (`cli-v*` / `gui-v*`) | ✅ si `is_factory` y la línea cambió (Phase 3.5 + 5.4) |
| Verify (`pnpm verify`)             | ❌ (siempre se salta)              |
| Merge `source → main`              | ✅                                 |
| Push a `origin/main`               | ✅ (autorización via harness)      |
| Push a `origin/{source}`           | ✅ si hay commits locales sin push |
| Factory selective DENY (Phase 4.6) | ✅ si `is_factory: true`           |
| Autogen regen (Phase 4.5)          | ✅ siempre                         |

**Cuándo usar `ship`:**

- Iteración rápida — quieres ver el cambio en preview/producción y validar a mano antes de versionar.
- Commits desde el último tag son solo `chore:` / `docs:` / `style:` / etc. que no justifican bump semver.
- Hotfix urgente que va a versionarse en el próximo `release` agregado.

**Comportamiento Phase 2:** se salta completo. El workflow va de Phase 1 (CP1) directo a Phase 3.

---

## Modo: `release`

**Propósito:** marcar el estado actual como versión semver oficial. Bump del campo correcto (`factoryVersion` en Factory, `version` en derivado), entrada de CHANGELOG inferida desde Conventional Commits (editable por el user), y tag `vX.Y.Z`.

| Acción                                                     | En `release`                         |
| ---------------------------------------------------------- | ------------------------------------ |
| Bump de version field                                      | ✅                                   |
| CHANGELOG entry                                            | ✅ (auto-generado, editable en CP2)  |
| Tag `vX.Y.Z`                                               | ✅                                   |
| Bump + tag de líneas satélite (`cli-v*` / `gui-v*`)        | ✅ si `is_factory` y la línea cambió (Phase 3.5 + 5.4) |
| Verify (`pnpm verify`)                                     | ✅ default; `--skip-verify` lo apaga |
| Merge `source → main`                                      | ✅                                   |
| Push a `origin/{source}` + `origin/main` + `origin/vX.Y.Z` | ✅ (cada push autoriza via harness)  |
| Factory selective DENY                                     | ✅ si `is_factory: true`             |
| Autogen regen                                              | ✅ siempre                           |

**Cuándo usar `release`:**

- Hay `feat:` / `fix:` / `perf:` o cambios `BREAKING` desde el último tag.
- Quieres comunicar a downstream (proyectos derivados, CI, users) que hay versión nueva.
- Quieres tag inmutable como punto de referencia para rollback.

---

## Override del auto-bump: `--patch | --minor | --major`

Por default, Phase 2.3 deriva el bump type desde los commits siguiendo [conventional-commits.md](./conventional-commits.md). Si el user pasa flag explícito, **salta el auto-suggest** y aplica el bump pedido sin preguntar.

```
/deploy release --patch    # vX.Y.Z → vX.Y.(Z+1)
/deploy release --minor    # vX.Y.Z → vX.(Y+1).0
/deploy release --major    # vX.Y.Z → v(X+1).0.0
```

**Cuándo usar override:**

- El auto-suggest no captura el impacto real (ej: refactor masivo que prefieres marcar como minor aunque conventional-commits diga "none").
- Quieres ser explícito y dejar el tipo registrado en el comando.

---

## Override del verify: `--skip-verify`

Por default, Phase 1.5 corre `pnpm verify` (lint + typecheck + test) antes del merge a `main` en `release` mode. `--skip-verify` lo apaga.

**Cuándo usar `--skip-verify`:**

- Ya ejecutaste `pnpm verify` a mano y confirmaste pase.
- El verify suite es lento (>5 min) y estás iterando releases pequeños.
- Tests están temporariamente rotos por razón conocida y vas a fixearlos en el próximo deploy.

**Cuándo NO usar:**

- Es la primera release después de un PR grande.
- Has tocado schema, auth, o dependencies — el verify es el último filtro antes de main.

---

## Modo as-is: `release --as-is`

**Propósito:** taggear la versión que **ya está** en `package.json` sin re-bumpearla. Es el caso de una versión decidida por **política** (eras, rebranding, alineación de plataformas) — no derivable de Conventional Commits. Reusa toda la maquinaria de `release` (merge selectivo, autogen, DENY, CHANGELOG, tag, push, Action) excepto la escritura del bump.

| Acción                             | En `release --as-is`                                   |
| ---------------------------------- | ------------------------------------------------------ |
| Bump de version field              | ❌ (el valor ya está en package.json — no se re-escribe) |
| CHANGELOG entry                    | ✅ (inferido del mismo rango; el user lo cura)         |
| Tag `vX.Y.Z`                       | ✅ (toma `NEW_VERSION` de package.json)                |
| Verify (`pnpm verify`)             | ✅ default; `--skip-verify` lo apaga                   |
| Commits locales (Phase 2.8)        | 1 (solo CHANGELOG; se omite el `chore: bump`)          |
| Merge / DENY / autogen / push      | ✅ igual que `release`                                 |

**Dos entradas (Phase 2.3 Caso D):**

1. **Flag explícito `release --as-is`** — camino **canónico**. Funciona siempre, incluso sin tag previo (`LAST_RELEASE_TAG_VERSION` vacío). Headless-safe.
2. **Auto-detect (solo interactivo)** — si `package.json[BUMP_FIELD]` quedó semver-mayor que el último tag de release (alguien pre-bumpeó a mano y corrió `release` a secas), Phase 2.3 ofrece un checkpoint `1=taggear as-is / 2=bumpear encima / 3=cancelar`. 🔴 En **headless** el auto-detect NO dispara — sin `--as-is` explícito el flujo sigue el bump normal.

**Validaciones determinísticas (STOP, sin pedir decisión):** versión == último tag (duplicado), versión < último tag (downgrade), first-release derivado (usa Caso B), y en Factory los dos campos del modelo dual deben venir alineados.

**Cuándo usar `--as-is`:**

- Salto de versión por convención (ej: era unificada `6.4.0 → 9.5.0`, número interim, rebranding).
- Ya fijaste la versión en `package.json` en un commit previo y solo quieres taggear + CHANGELOG + distribuir.

**Cuándo NO:** si quieres que el número se derive de los commits — usa `release` normal o `--patch|--minor|--major`.

---

## First release derivado (versión 0.0.0 → 1.0.0+)

**Trigger:** `!is_factory && version === '0.0.0' && mode === 'release'`.

Phase 2.3 detecta el caso y **salta el auto-suggest**:

```
Versión actual: 0.0.0 (pre-release)

¿Cuál será la versión inicial? (recomendado: 1.0.0)
```

El user responde la versión target. El bump no se calcula desde commits — se aplica directo. Phase 7 detecta la transición one-way y activa post-release (crear branch `develop` si no existe, switch a `develop`, emit summary). Ver [post-release-transition.md](./post-release-transition.md).

**No aplica en Factory:** Factory tiene `version: 0.0.0` permanente (es template — BR-FACTORY-002). El bump siempre es de `factoryVersion`.

---

## Decision tree (resumen)

```
$ARGUMENTS vacío?
  └─ sí → Phase 0 pregunta: ship o release?

mode === 'ship'?
  ├─ Saltar Phase 1.5 + Phase 2
  └─ Ir directo de CP1 a Phase 3

mode === 'release'?
  ├─ !--skip-verify → correr Phase 1.5 (pnpm verify)
  ├─ Phase 2.3 (orden A → D → B → C, primero que matchea gana):
  │   ├─ A: --patch|--minor|--major → usar pasado
  │   ├─ D: --as-is (o auto-detect interactivo: pkg > último tag) → taggear as-is (skip bump write)
  │   ├─ B: !is_factory && version==='0.0.0' → preguntar target
  │   └─ C: auto-suggest desde commits:
  │       ├─ 'none' (solo chore/docs) → sugerir cambiar a ship
  │       ├─ 'major' / 'minor' / 'patch' → continuar
  └─ Phase 2.4-2.6 → bump (skip en as-is) + CHANGELOG + CP2
```

---

## Pre-merge vs post-merge verify (decisión consciente)

Phase 1.5 corre verify en la **source branch antes del merge**. Conflict-free merges típicamente no rompen build, pero semantic conflicts cross-module pueden aparecer post-merge sin tipos rotos.

**Decisión actual (v1):** no re-verify post-merge. Razones:

- Duplica runtime (~5-15 min extra por release).
- Vercel build catches el problema antes de promote.
- El verify post-merge no agrega mucho si el user va a `pnpm build` localmente entre Phase 5 y Phase 6.

**Workaround si quieres extra-safety:** entre Phase 5 (commit local en main) y Phase 6 (push), correr manualmente `pnpm build` desde main local. Si falla, abortar antes del push (`git reset --hard origin/main`).

---

_TimeKast Factory — tk-deploy methodology: modes_
