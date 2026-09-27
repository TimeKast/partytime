# tk-deploy — Conventional Commits

> Algoritmos para inferir bump semver y CHANGELOG entry desde el rango de commits nuevos (último tag de release → `HEAD`; ver §1 por qué no el merge-base ni `git describe`). Aplica solo en `release` mode (Phase 2.3 + 2.5).

Anchor: [GIT.md §3.1](../../../rules/GIT.md) — el repo ya enforce Conventional Commits via `validate-commit.sh` hook, así que el parsing es confiable.

---

## §1 Auto-bump from commits

### Input

```bash
# Range = lo nuevo desde el ÚLTIMO RELEASE. Dos formas descartadas, cada una por su motivo:
#
# ❌ `git describe --tags`: camina ancestría, y en Factory (o cualquier repo con
#    merge-no-backflow — BR-FACTORY-004) los tags de release viven en merge-commits de `main`
#    que nunca vuelven a la source branch → devuelve un tag stale y arrastra commits ya
#    released al bump/CHANGELOG.
#
# ❌ `merge-base origin/main HEAD`: inmune a la topología de tags, pero CUALQUIER `ship`
#    entre releases lo adelanta — y entonces lo que ese ship llevó a main desaparece del
#    rango del release siguiente. Los commits no salen en las notas, nadie avisa, y el
#    auto-bump de §1 puede caer en `none` por un rango vacío. Medido el 2026-08-15: tras
#    shippear un fix, el merge-base daba 1 commit donde el tag daba 2.
#
# ✅ `LAST_RELEASE_TAG` (SKILL.md §0.4) se resuelve por NOMBRE (`git tag --list 'v*' | sort -V
#    | tail -1`, sin prereleases), así que no camina ancestría, y `git log <tag>..HEAD` compara
#    CONJUNTOS de commits — funciona aunque el tag no sea ancestro de HEAD.
git fetch origin main 2>/dev/null || true
if [ -n "$LAST_RELEASE_TAG" ]; then
  RANGE="${LAST_RELEASE_TAG}..HEAD"
else
  MERGE_BASE=$(git merge-base origin/main HEAD 2>/dev/null)   # first release: aún no hay tag v*
  if [ -n "$MERGE_BASE" ]; then
    RANGE="$MERGE_BASE..HEAD"
  else
    RANGE="HEAD"   # sin origin/main (repo nuevo) — todos los commits
  fi
fi

# Output: lista de commits con subject + body separados
git log "$RANGE" --no-merges --format='---%n%H%n%B'
```

### Priority assignment per commit

| Priority | Match                                                                                                                       | Bump implied |
| -------: | --------------------------------------------------------------------------------------------------------------------------- | ------------ |
|        3 | Subject regex `/^[a-z]+(\([^)]+\))?!:/` (e.g. `feat!:`, `fix(api)!:`) OR body contains line matching `/^BREAKING CHANGE:/m` | major        |
|        2 | Subject regex `/^feat(\([^)]+\))?:/`                                                                                        | minor        |
|        1 | Subject regex `/^(fix\|perf)(\([^)]+\))?:/`                                                                                 | patch        |
|        0 | Subject matches `/^(chore\|docs\|style\|test\|ci\|build\|refactor\|revert)(\([^)]+\))?:/` o no matchea ninguno              | none         |

### Bump decision

```
max_priority = max(priorities across all commits)

bump =
  3 → 'major'
  2 → 'minor'
  1 → 'patch'
  0 → 'none'   # solo chore/docs/style/test/ci/build/refactor — no justifica bump semver
```

### Caso `bump === 'none'`

Workflow muestra:

```
⚠️ Los commits desde el último release a main no justifican un bump semver
   (solo: chore / docs / style / test / ci / build / refactor).

Opciones:
| # | Acción |
|---|--------|
| 1 | cambiar a `ship` mode (merge sin bump) |
| 2 | forzar bump con --patch | --minor | --major |
| 3 | cancelar |

🛑 STOP — Responde con el número.
```

### Override por flag

Si `$ARGUMENTS` incluye `--patch | --minor | --major`, **saltar el auto-suggest entero** y aplicar el flag directamente:

```bash
case "$BUMP_FLAG" in
  patch) NEW_VERSION=$(semver-bump patch "$CURRENT") ;;
  minor) NEW_VERSION=$(semver-bump minor "$CURRENT") ;;
  major) NEW_VERSION=$(semver-bump major "$CURRENT") ;;
esac
```

### Override as-is (`--as-is` / Caso D)

Si el modo as-is está activo (`BUMP_TYPE === 'as-is'`, ver SKILL.md Phase 2.3 Caso D), **saltar el auto-suggest entero**: `NEW_VERSION` NO se deriva de los commits ni se bumpea — se toma tal cual de `package.json[BUMP_FIELD]` (la versión fue fijada por política: era unificada, rebranding, alineación de plataformas). El CHANGELOG (§2) **sí** se infiere del mismo rango (`LAST_RELEASE_TAG..HEAD`, §1), pero como el salto de versión es semántico y no derivado de commits, el user típicamente **cura** la entry en Phase 2.6/CP2. Phase 2.4 no re-escribe `package.json` en este caso (el valor ya está); solo se commitea el CHANGELOG, así que Phase 2 **aporta 1** a `BUMP_COMMITS` en vez de 2. Es un contador acumulado (arranca en 0 en §0.4): Phase 3.5 le suma 1 por cada línea satélite bumpeada, y las recoveries retroceden el total.

### Implementación inline (sin dependencias)

```bash
# Aplica bump al campo correcto (factoryVersion en Factory, version en derived)
FIELD="${BUMP_FIELD:-version}"   # set in Phase 0
CURRENT=$(node -p "require('./package.json').${FIELD}")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
  major) NEW="$((MAJOR+1)).0.0" ;;
  minor) NEW="${MAJOR}.$((MINOR+1)).0" ;;
  patch) NEW="${MAJOR}.${MINOR}.$((PATCH+1))" ;;
esac

# In-place edit con node (más robusto que sed para JSON)
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.${FIELD} = '${NEW}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
```

---

## §2 CHANGELOG inference

### Buckets

| Bucket         | Type / marker incluido                                   |
| -------------- | -------------------------------------------------------- |
| `### Breaking` | Subject contiene `!:` o body contiene `BREAKING CHANGE:` |
| `### Added`    | `feat:`                                                  |
| `### Fixed`    | `fix:`                                                   |
| `### Changed`  | `refactor:` o `perf:`                                    |

**Excluidos del CHANGELOG inferido (por default):**

```
chore, docs, style, test, ci, build, revert
```

Estos commits aparecen en el rango pero no se listan en la entry — son ruido para el reader del CHANGELOG. Si el user quiere incluir uno específico, lo agrega manualmente al editar en CP2.

### Per-commit transform

```javascript
function commitToChangelogLine(commit) {
  const { subject, body } = parseCommit(commit);

  // Strip `<type>(<scope>)!?:` prefix
  const cleaned = subject.replace(/^[a-z]+(\([^)]+\))?!?:\s*/, '');

  // Parse "Closes:" / "Refs:" footer for issue refs
  const refsMatch = body.match(/^(?:Closes|Refs):\s*([A-Z]+-\d+(?:,\s*[A-Z]+-\d+)*)/m);
  const refs = refsMatch
    ? ` (${refsMatch[1]
        .split(',')
        .map((r) => r.trim())
        .join(', ')})`
    : '';

  return `- ${cleaned}${refs}`;
}
```

**Issue ref regex es generic** (`[A-Z]+-\d+`) — funciona para `FX-008`, `PL-001`, `EPIC-FACTORY-ROBUSTNESS`, etc. No hardcodear el prefix del proyecto.

### Output order

```markdown
## [vX.Y.Z] — YYYY-MM-DD

### Breaking

- ... ← solo si hay commits priority=3

### Added

- ... ← solo si hay commits feat

### Changed

- ... ← solo si hay commits refactor o perf

### Fixed

- ... ← solo si hay commits fix
```

**Solo emit secciones que tienen contenido** — si no hay `fix:` en el rango, no escribir `### Fixed` vacío.

### Format target

[Keep a Changelog](https://keepachangelog.com) — secciones invariables Added/Changed/Fixed/Removed/Deprecated/Security/Breaking. El template `templates/changelog-entry.template.md` lo refleja.

---

### Idioma del entry

- **Headings** (`### Added` / `### Changed` / `### Fixed` / `### Breaking` / `### Removed` / `### Deprecated` / `### Security`): **inglés** — son Keep a Changelog canonical, no se traducen.
- **Bullets**: idioma por **`locale:`** del frontmatter YAML del project-config (schema v2.0). Resolución:

  ```bash
  LOCALE=$(awk '/^---$/{c++} c==1 && /^locale:/{gsub(/locale:|[ '\''\"]/, ""); print; exit} c==2{exit}' project/planning/project-config.md 2>/dev/null)
  LOCALE="${LOCALE:-es-MX}"
  ```

  Default cuando el campo es `es-MX`, ausente, o el project-config está en formato pre-v2.0 → **es-MX**. Si declara `locale: en-US` → inglés.

- **es-MX rules:** términos técnicos en inglés sin traducir (`commit`, `push`, `merge`, `deploy`, `schema`, `hook`, `tag`, `bump`, `lockfile`, `frontmatter`, `branch`). Anglicismos verbalizados OK cuando fluyen (`commitear`, `mergear`, `bumpear`, `pushear`). NUNCA argentino (voseo prohibido — ver `CORE.md §4` + global preferences).

### Subjects reservados

`release:` y `ship:` (con o sin scope) son **reservados** para subjects creados por tk-deploy Phase 5 — el filtro de Phase 3 (`§3.1` del SKILL) excluye estos prefijos del CP3 trigger. Editar `templates/commit-message-{release,ship}.template.md` para cambiar el subject rompe el contrato silenciosamente. Un derivado con contributors externos o automation (release-please, dependabot con subjects custom) que necesite enforzar la reserva puede agregar un hook ad-hoc; Factory propia no lo necesita.

### Anti-patterns

- Mezclar idiomas en el mismo bullet ("Phase 4 classifier divides screens" en un bullet que en otro dice "los 4 validadores"). Elegir uno por bullet (y, salvo override, ese es es-MX).
- Traducir nombres de scope (`auth` queda `auth`, no "autenticación"), de comandos (`pnpm verify`), o de IDs (`FACTORY-006`).
- Cambiar el header del template a algo distinto de `## [{VERSION}] - {DATE} — {TITLE}` (sin `v` prefix, hyphen, título descriptivo). Las entries históricas (v6.2.0, v6.1.1, v6.1.0) siguen este formato.

---

## §3 Append vs replace

Phase 2.5 **appendea** la nueva entry al archivo CHANGELOG existente:

1. Read CHANGELOG path (Factory: `.claude/docs/CHANGELOG.md`; derived: `CHANGELOG.md` raíz).
2. Localizar el primer marker `## [` después del header — esa es la entry más reciente.
3. Insertar la nueva entry ANTES de ese marker, separada por `\n---\n\n`.

Si el archivo no existe (derived nuevo), crearlo con header estándar:

```markdown
# Changelog

> All notable changes documented here. Format: [Keep a Changelog](https://keepachangelog.com).

---

{nueva entry}
```

### Date format

`YYYY-MM-DD` (ISO). Usar `$(date +%Y-%m-%d)` shell-side para evitar drift de timezone.

---

## §4 User editing antes de CP2

Después de generar la entry inferida, **Phase 2.6** permite al user editar:

1. Workflow muestra entry generada inline.
2. Pregunta: "¿Editar antes de continuar? (1=sí, 2=continuar tal cual)".
3. Si `1`: workflow espera hasta que user confirme que terminó de editar (Edit tool external, o pega versión nueva inline).
4. Una vez confirmado: avanzar a CP2 con la entry final.

CP2 muestra la entry **final** + bump type + nuevo `vX.Y.Z` + path del CHANGELOG. Opciones:

| #   | Acción                                         |
| --- | ---------------------------------------------- |
| 1   | commitear bump + CHANGELOG (2 commits locales) |
| 2   | editar entry de nuevo                          |
| 3   | cancelar (no commit, workflow termina)         |

---

## §5 Bump sincronizado del modelo de versión dual (Factory)

> Aplica solo cuando `IS_FACTORY` (modelo de versión dual). En derivados el bump toca un único campo (`version`) y esta sección no aplica.

El Factory mantiene **dos** campos de versión en `package.json`:

| Campo             | Qué sella                                                          |
| ----------------- | ----------------------------------------------------------------- |
| `factoryVersion`  | Sello de nacimiento del boilerplate `src/` ("de qué nací")        |
| `agentKitVersion` | Versión del cerebro vivo `.claude/` ("qué cerebro tengo hoy")     |

**Regla — ambos campos al mismo número, siempre (alineados en origen):**

En cada `release` del Factory, `tk-deploy` Phase 2.4 escribe **ambos** campos al **mismo** `NEW_VERSION`. No hay condicional de `git diff src/`: aunque la release no haya tocado `src/`, `factoryVersion` avanza igual que `agentKitVersion`.

```
release --patch sobre {factoryVersion: 9.5.0, agentKitVersion: 9.5.0}
  → {factoryVersion: 9.5.1, agentKitVersion: 9.5.1}   ✅ alineados

release --minor sobre {9.5.0, 9.5.0}
  → {9.6.0, 9.6.0}                                     ✅ alineados
```

**Rationale (decisión 2026-06-01, DISTRIBUTION_DESIGN §3 + §13):** simplicidad > precisión del sello. Se evaluó bumpear `factoryVersion` solo cuando `src/` cambia, pero un sello "alineado en origen, divergente en consumidor" es más fácil de razonar: en el **origen** (Factory) los dos campos siempre coinciden; la **divergencia** entre ellos solo emerge en un **derivado** (consumidor), donde `factoryVersion` queda congelado en el bootstrap (no hay update de `src/` en EPIC 1) mientras `agentKitVersion` sube con cada `factory:update`. Los dos campos juntos codifican ese _drift_ — es lo que `factory:status` / `factory:doctor` reportan.

> 🚫 NUNCA bumpear `version` en Factory: queda en `0.0.0` permanente (el branching adaptive del Factory usa el override `is_factory: true`, no la auto-detección por `version` — ver `project-config.md §1`). El bump dual toca `factoryVersion` + `agentKitVersion`, nunca `version`.

Implementación: `tk-deploy/SKILL.md` Phase 0.4 resuelve `BUMP_FIELDS` (`['factoryVersion','agentKitVersion']` en Factory) y Phase 2.4 escribe + verifica cada campo.

---

_TimeKast Factory — tk-deploy methodology: conventional-commits_
