# Extender la Factory — Skills y Hooks propios sin romper el kit

> **Para:** developers de TimeKast que arrancan un proyecto desde la Factory.
> **Objetivo:** agregar tus propios skills y entender los hooks que el kit ya trae, **sin chocar** con lo que la Factory shipea ni perder tu trabajo en la próxima actualización del kit.

> [!IMPORTANT]
> **La regla vive en [`.claude/rules/CORE.md §5 Frontera kit ↔ derivado`](../rules/CORE.md)** — es always-on, la lee el agente en cada sesión, y ahí está el criterio (qué es dev-owned, cuándo usar un punto de extensión, cuándo abrir un factory-ticket, cómo se detecta el drift). Este doc **no la reenuncia**: aquí está el **procedimiento** (cómo extender sin chocar, Partes 1 y 2). El **inventario** de puntos de extensión ya no vive aquí — es la skill `fx-extension-points` (Parte 3).

---

## Parte 1 — Skills

### 1.1 De quién es cada prefijo (namespace ownership)

El kit usa prefijos para rutear skills. Antes de crear el tuyo, mira de quién es cada espacio:

| Prefijo                     | Dueño                                                               | ¿Lo tocas?      | Dónde vive                                            |
| --------------------------- | ------------------------------------------------------------------- | --------------- | ----------------------------------------------------- |
| `sk-*`                      | **Kit** — sistemas shipped (auth, notifications, tokens, nav…)      | ❌ Solo-lectura | `.claude/skills/` (viene del kit)                     |
| `kb-*`                      | **Kit** — knowledge base (patterns cross-fase, coding y documental) | ❌ Solo-lectura | `.claude/skills/` (viene del kit)                     |
| `tk-*`                      | **Kit** — workflows (`/implement`, `/discovery`, `/deploy`…)        | ❌ Solo-lectura | `.claude/skills/` (viene del kit)                     |
| `fx-*`                      | **Kit** — factory-internal                                          | ❌ Solo-lectura | `.claude/skills/` (viene del kit)                     |
| `pj-*`                      | **Tú** — específicos de ESTE proyecto                               | ✅ Tuyos        | `.claude/skills/` de tu repo (NO se sube al template) |
| prefijo personal (ver §1.3) | **Tú** — generales, varios proyectos tuyos                          | ✅ Tuyos        | `~/.claude/skills/` (tu máquina, todos tus proyectos) |

> Los 5 primeros prefijos son **terreno del kit**. No crees skills tuyos con esos prefijos — además de pisarte con un update, confundes el ruteo semántico.

### 1.2 Skill específico de un proyecto → `pj-*`

Si el skill solo aplica a este derivado (ej: "cómo facturamos en este CRM", "el flujo de aprobación de este cliente"):

1. Créalo en `.claude/skills/pj-mi-skill/SKILL.md`.
2. Vive en el repo del **proyecto derivado**, no en el template de la Factory.
3. Frontmatter mínimo: `name`, `description` (1 línea, en inglés, trigger surface clara).

```
.claude/skills/
├── sk-auth/         ← del kit, no tocar
├── sk-api/          ← del kit, no tocar
└── pj-facturacion/  ← TUYO, específico de este proyecto
    └── SKILL.md
```

> [!NOTE]
> **`skill:lint` ignora los `pj-*` a propósito.** El linter del pre-commit valida solo los skills del kit (`sk-/kb-/tk-/fx-`). Tus `pj-*` no se revisan — así un frontmatter imperfecto o un cross-ref tuyo nunca te bloquea el commit. La calidad de tus `pj-*` es tu responsabilidad, no la del kit.

### 1.3 Skill general tuyo (varios proyectos) → `~/.claude/skills/` con prefijo personal

Si es un skill que usas en varios de tus proyectos (ej: tu estilo de PRs, tu checklist personal de QA), ponlo en tu scope **personal**, no en el repo:

1. Vive en `~/.claude/skills/` (tu máquina) — disponible en todos tus proyectos automáticamente.
2. **Usa un prefijo personal que NO colisione con el kit.** Recomendado: tus iniciales o tu handle.

```
~/.claude/skills/
└── ec-pr-style/     ← prefijo personal "ec-" (Edmond Charabati), nunca choca con sk-/kb-/tk-/fx-
    └── SKILL.md
```

> [!WARNING]
> **Nunca nombres un skill personal igual que uno del kit** (ej: un `sk-api` propio en `~/.claude/skills/`). Si dos skills comparten nombre exacto, la resolución entre scope personal y scope de proyecto es ambigua y termina cargando el que no querías. El prefijo personal lo evita de raíz.

### 1.4 Qué NO hacer con skills

```
❌ Editar sk-*/kb-*/tk-*/fx-* del kit → se pierde en el próximo release de la Factory
❌ Nombrar tu skill con prefijo del kit (sk-/kb-/tk-/fx-) → colisión + ruteo confuso
❌ Nombrar un skill personal igual a uno del kit → resolución ambigua entre scopes
❌ Meter un pj-* en ~/.claude/skills/ global → es project-specific, va en el repo del proyecto
✅ Necesitas cambiar comportamiento de un skill del kit → abre un issue/PR a la Factory, no lo forkees localmente
```

### 1.5 ¿El kit ya hace lo que necesito?

Antes de crear un skill nuevo, revisa si el kit ya lo cubre:

- `sk-features-index` → catálogo de lo que ya shipea el kit (auth, RBAC, notifications, email, PWA, nav, tablas, forms…).
- `project/reference/INVENTORY.md` y `HOOKS.md` → componentes y helpers ya disponibles (autogenerados).
- `project/reference/SCHEMA.md` y `API.md` → modelo de datos y superficie de API ya disponibles (autogenerados).

Si ya existe, **engánchate** (vía el `sk-*` correspondiente) en vez de duplicar.

---

## Parte 2 — Hooks

La Factory ya trae una cadena de hooks por default. **No los edites** (son del kit). Lo que SÍ debes hacer: **revisar los hooks custom que tú tengas** y quitar los que dupliquen función — si no, corren dos veces o pelean entre ellos.

### 2.1 Lo que el kit ya corre (no lo repliques)

| Capa                                       | Hook                         | Qué hace                                                          | Cubre                                   |
| ------------------------------------------ | ---------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| **Husky pre-commit** (`.husky/pre-commit`) | lint-staged                  | `eslint --fix` + `prettier --write` sobre archivos staged         | Todos los commits                       |
|                                            | autogen                      | Regenera `INVENTORY.md` / `CODEBASE.md` / `HOOKS.md` / `SCHEMA.md` / `API.md` y los stagea | Todos los commits                       |
|                                            | `skill:lint`                 | Valida frontmatter + cross-refs de skills                         | Todos los commits                       |
|                                            | `agent-taxonomy-lint`        | Valida convención de nombres de agents                            | Todos los commits                       |
|                                            | board sync                   | Regenera `BOARD.md` si borraste issues                            | Todos los commits                       |
| **Husky pre-push** (`.husky/pre-push`)     | typecheck + lint             | `pnpm typecheck` + `pnpm lint` (full repo)                        | Todos los push                          |
| **CC hooks** (`.claude/settings.json`)     | `validate-commit.sh`         | Valida `Closes: ID` → Evidence + ✅ en epic                       | Solo commits del **agente** Claude Code |
|                                            | `skill-announce-reminder.sh` | Recuerda al agente anunciar el skill que cargó                    | Solo sesión del **agente**              |

> La división es a propósito: **Husky** = guardrails universales en git (corren te commitee quien te commitee). **CC hooks** = guardrails del agente en sesión. No se pisan entre sí.

### 2.2 Revisa TUS hooks custom — quita los que dupliquen

Si vienes de otro setup, probablemente arrastras hooks propios. Revisa estos lugares y **elimina lo redundante**:

#### a) Husky / pre-commit propio (`.husky/` en tu repo, o `.git/hooks/`)

```
❌ Un pre-commit tuyo que corra `prettier --write` o `eslint`     → ya lo hace lint-staged del kit
❌ Un pre-commit que corra `tsc`/typecheck                        → ya lo hace pre-push del kit
❌ Un pre-push propio con lint/typecheck                          → ya está en .husky/pre-push del kit
✅ Si necesitas validación extra propia → ponla en `.husky/pre-commit.project` (abajo)
```

#### a.1) Tus pasos propios de pre-commit → `.husky/pre-commit.project` (sobrevive updates)

🔴 **NUNCA edites el `.husky/pre-commit` del kit para agregar pasos tuyos** — ese archivo es brain-owned: `factory update` lo sobrescribe y tu customización se pierde en silencio (incidente real: un derivado perdió el reconciler + linter de su sistema de cron en un update).

El hook del kit ejecuta al final, si existe, el archivo **`.husky/pre-commit.project`** — que es **tuyo** (dev-owned): el Factory nunca lo shippea ni lo toca, así que sobrevive todos los updates. Créalo, trackéalo en git, y mete ahí tus pasos:

```sh
# .husky/pre-commit.project — pasos de pre-commit de ESTE proyecto (dev-owned)
# Ejemplo real: registry de cron jobs (CRON-001)
pnpm generate:vercel-crons   # reconciler: src/config/cron-jobs.ts → vercel.json
pnpm cron-jobs:lint          # validator: invariantes del registry
```

Corre con `sh` bajo el `set -e` del hook padre: un exit no-cero de tu script aborta el commit (mismo contrato que los pasos del kit). Si reemplazaste el `.husky/pre-commit` del kit entero por el tuyo, vas a perder autogen + skill:lint + board sync — **restaura el del kit** y migra tu lógica a `pre-commit.project`.

#### b) CC hooks globales (`~/.claude/settings.json`)

Si tienes hooks en tu `settings.json` **global** (scope personal, aplican a todos tus repos), revisa que no choquen con los del kit:

```
❌ Un PreToolUse:Bash global que valide commits           → el kit ya trae validate-commit.sh; correrían los dos
❌ Un PostToolUse:Read global que anuncie skills          → el kit ya trae skill-announce-reminder.sh
✅ Hooks globales para cosas que el kit NO cubre (ej: tu notificación de escritorio al terminar) → OK, no chocan
```

> Los hooks de `settings.json` se **acumulan**: los globales (`~/.claude/`) + los del proyecto (`.claude/`) corren ambos. Si tienes un validador de commits global, vas a tener dos validando el mismo commit. Quita el tuyo y deja el del kit.

#### c) lint-staged propio (`package.json`)

El kit ya define `lint-staged` (eslint + prettier por tipo de archivo). Si tienes una config propia que haga lo mismo, no la dupliques — extiende la del kit solo si necesitas un paso extra real.

### 2.3 Regla de oro de hooks

> El kit ya cubre: **format, lint, typecheck, autogen de reference, skill:lint, agent-taxonomy, validación de commits (agente), board sync**. No agregues hooks custom que repitan cualquiera de esos. Solo agrega hooks para cosas que el kit genuinamente no hace.

### 2.4 Cómo ver qué hooks tienes corriendo

```bash
# Husky del proyecto (del kit)
ls .husky/ && cat .husky/pre-commit .husky/pre-push

# CC hooks del proyecto (del kit)
jq '.hooks' .claude/settings.json

# CC hooks TUYOS globales (revisa duplicación)
jq '.hooks' ~/.claude/settings.json

# git hooks crudos (por si quedó algo viejo de otro setup)
ls -la .git/hooks/ | grep -v '\.sample$'
```

Si en `~/.claude/settings.json` o `.git/hooks/` aparece algo que duplique la tabla de §2.1 → quítalo.

---

## Parte 3 — Inventario de puntos de extensión → skill `fx-extension-points`

> 🔴 **La lista NO vive en este documento. Vive en [`.claude/skills/fx-extension-points/SKILL.md`](../skills/fx-extension-points/SKILL.md), y ahí es donde se agrega un punto nuevo — nunca aquí.** Esa skill es la fuente única: se autocarga por ruteo semántico justo cuando estás por editar un archivo del kit, y viaja en los dos perfiles de distribución (este documento, solo en `full`).

Ahí encuentras, para cada punto: el archivo dev-owned (o export opcional) que te toca crear, qué archivo del kit lo invoca de verdad, su límite —todos son **agregar, nunca reemplazar**—, en qué perfil está vivo, cómo pedirle un punto nuevo al Factory y qué hacer mientras tanto sin forkear.

---

## TL;DR

1. **Skills tuyos de proyecto** → `pj-*` en `.claude/skills/` del repo (el linter los ignora).
2. **Skills tuyos generales** → prefijo personal (tus iniciales) en `~/.claude/skills/`.
3. **Nunca** uses prefijos del kit (`sk-/kb-/tk-/fx-`) ni edites sus skills.
4. **No toques** los hooks del kit (`.husky/`, `.claude/hooks/`, `.claude/settings.json`).
5. **Revisa tus hooks custom** (Husky propio, CC global, `.git/hooks/`) y **quita los que dupliquen** format/lint/typecheck/commit-validation — el kit ya los corre.

---

_TimeKast Factory — guía de extensión del kit_
