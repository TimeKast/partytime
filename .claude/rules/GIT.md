---
trigger: always_on
---

# GIT — Commits, Push & Branching Rules

> Reglas de git. Extiende `CORE.md`. Precede a TODA ejecución de comandos git.

---

## 1. 🔴 NUNCA usar --no-verify

```
❌ PROHIBIDO: git commit --no-verify / git commit -n
❌ PROHIBIDO: git push --no-verify
❌ PROHIBIDO: --no-gpg-sign, -c commit.gpgsign=false
✅ OBLIGATORIO: Si hooks fallan → investigar root cause → corregir → reintentar sin flags
✅ OBLIGATORIO: Si un hook obstaculiza legítimamente → proponer ajustarlo, no bypassearlo
✅ EXCEPCIÓN: Merge commits sin staged changes normales (workflows de release lo declaran explícitamente)
```

---

## 2. 🔴 NUNCA ejecutar git push sin autorización

```
❌ PROHIBIDO: git push sin confirmación del usuario
✅ OBLIGATORIO: Mostrar branch, remote, commits → ESPERAR confirmación
✅ EXCEPCIÓN: Workflows con checkpoint gate aprobado por el usuario = autorización implícita
ℹ️  El modo fluido (`fx-workflow-authoring §7.1`) NO bypassa el push gate: el permission prompt
   del runtime al ejecutar `git push` sigue siendo el control, en fluido y en `--step` por igual.
```

---

## 3. Commits — Conventional Commits + keyword-based issue tracking

> ⚠️ **Scope del enforcement:** `.claude/hooks/validate-commit.sh` es un PreToolUse hook de Claude Code — valida solo commits ejecutados por el agente via Bash tool. Commits manuales del usuario en terminal pasan por `.husky/pre-commit` (lint-staged) y **no** por este hook. La convención de abajo es igual obligatoria para ambos casos (consistencia del historial), pero el enforcement automático aplica solo al agente.

### 3.1 Subject format (Conventional Commits)

```
<type>(<scope>): <título en imperativo, ≤72 chars>
```

**Types permitidos:**

| Type       | Cuándo                                                     |
| ---------- | ---------------------------------------------------------- |
| `feat`     | Funcionalidad nueva visible al usuario                     |
| `fix`      | Corrección de bug                                          |
| `docs`     | Solo docs (README, planning, backlog, JSDoc, skills/rules) |
| `chore`    | Mantenimiento (deps, configs, housekeeping)                |
| `refactor` | Cambio de código sin efecto funcional                      |
| `perf`     | Mejora de performance                                      |
| `test`     | Agregar/modificar tests                                    |
| `build`    | Build system, bundler, release tooling                     |
| `ci`       | CI/CD (GitHub Actions, hooks, pipelines)                   |
| `style`    | Formatting, whitespace (sin cambios lógicos)               |
| `revert`   | Revertir un commit previo                                  |

**Scope:** módulo/área afectada (`auth`, `db`, `backlog`, `hooks`, `cc`, `sk`, etc). Opcional si el cambio es global.

### 3.2 Issue references — keyword-based (footer)

Los commits referencian issues mediante **keywords explícitos en el footer del body**, NO en el subject.

```
feat(hooks): ship close/ref distinction parser

<detalle del cambio>

Closes: FX-008
Refs: PL-001, EPIC-FACTORY-ROBUSTNESS
```

| Keyword   | Semántica                                                   | Hook behavior                         |
| --------- | ----------------------------------------------------------- | ------------------------------------- |
| `Closes:` | Este commit completa el issue — debe estar ✅ + Evidence    | Valida ✅ en epic + Evidence presente |
| `Refs:`   | Referencia contextual (blocked-by, related-to, parent epic) | Bypass — solo contexto humano         |

**Reglas:**

```
✅ OBLIGATORIO: Subject libre de IDs (e.g. `feat(auth): add session rotation`)
✅ OBLIGATORIO: Usar `Closes: <ID>` en el footer del commit que completa el issue
✅ PERMITIDO:  `Closes: FX-001, FX-002` si un commit cierra múltiples issues
✅ PERMITIDO:  `Refs: <ID>` sin check — para contexto (blocked-by, related-to)
❌ PROHIBIDO:  Poner ID de issue en subject (ambigüedad con keyword; el hook lo ignora)
```

### 3.3 Multi-commit por issue

Un issue puede requerir múltiples commits (WIP, refactor por pasos, test separado). Solo el commit **final** (el que lleva el issue a DoD) usa `Closes:`. Los intermedios no llevan keyword, o usan `Refs:` si vale la pena dejar el rastro.

```
chore(hooks): scaffold close/ref parser             ← sin Closes, pasa
test(hooks): add close/ref parser tests             ← sin Closes, pasa
refactor(hooks): ship close/ref hook                ← con Closes:, valida

  Closes: FX-008
```

### 3.4 Docs sync

```
✅ OBLIGATORIO: Actualizar /docs si el cambio afecta comportamiento documentado
```

### 3.5 Cierre de documentation-family — `CP-commit`

Los workflows de la familia documental (`/discovery`, `/design`, `/backlog`, `/proposal`, `/mockup`)
ofrecen al **cerrar** commitear los docs/entregables generados. Patrón único (SSOT — los workflows lo
referencian, no lo redefinen):

**Interactivo (TTY)** — tres opciones excluyentes es-MX al final del workflow:

```
✔ Generé N docs en {dir}. ¿Qué hago con el trabajo?
  1. Nada (queda local)
  2. Commit (local, sin push)
  3. Commit + push (a la branch de trabajo, NO main)
```

> **Veredicto de conformidad con `CC.md §3` — este `CP-commit` MIGRA a la vía estructurada.**
> Es peer de `CC.md` (`CORE.md §1`), así que sin este veredicto ganaría por especificidad de
> dominio y eximiría en silencio del cambio a los cinco workflows documentales. Migra porque
> cumple el perfil exacto: **tres opciones enumerables y excluyentes, sin campo de texto libre**.
> Con la tool disponible se presentan como opciones estructuradas; sin ella, el bloque de arriba
> es el fallback literal. **El guard de main y el degrade headless a la opción 2 no cambian** —
> este veredicto toca **cómo** se presentan las tres opciones, nunca cuáles son ni cuándo para.

```
✅ git add de los PATHS DURABLES del workflow (no `-A`, no un `{dir}` literal único):
     · discovery/design/backlog → su dir de docs
     · proposal/mockup          → su dir + `project/.publish.json` (si existe — vive FUERA del dir)
✅ Subject Conventional Commits (`docs(<wf>): …`). Skip si no hay cambios (no commit vacío).
✅ Opción 3 (push): va al upstream de la branch ACTUAL; el gate ES la autorización (§2). NUNCA a main.
🔴 Guard de main: si la branch actual es `main`/default → NO ofrecer opción 3 (push a main = `/deploy`).
ℹ️  Headless (sin TTY): degrada a opción 2 (commit, sin push) — nunca push a ciegas.
```

#### 3.5.1 Los factory-tickets del run van en su PROPIO commit

Un workflow que además emitió factory-tickets (`project/factory/*.md` — hoy `/discovery` y
`/design`) los commitea **aparte**, con subject `docs(factory): …`, **nunca** dentro del
`docs(<wf>):` de su corrida. Vive FUERA del dir de docs, como `project/.publish.json` — no
omitir.

```
✅ Un run que emite tickets cierra con DOS commits: `docs(<wf>): …` (sus docs) y
   `docs(factory): …` (los tickets). El CP-commit sigue siendo UNO: la opción elegida
   (nada / commit / commit + push) aplica a los dos por igual.
✅ Skip normal: sin tickets emitidos no hay segundo commit.
✅ El borrado que deja `factory ticket push` al entregar el ticket (`fx-factory-tickets §6`)
   viaja en otro `docs(factory): …` — misma clase de cambio, mismo scope.
```

**Por qué aparte y no junto.** Un factory-ticket **no es un entregable del run**: lo consume
`factory ticket push` para abrir un issue en el Factory, no la fase siguiente del pipeline. Su
ciclo de vida es otro — nace en un run, se entrega días después y, entregado, se borra: su
estado vive en el issue. Mezclarlo con los docs vuelve irrastreable un `git log` por el canal, y
deja sin dueño el commit del borrado posterior, que ya no pertenece a ningún run.

> **Se lee distinto según dónde corra, y conviene saberlo:** en el **Factory**,
> `project/factory/` nunca llega a `main` (BR-FACTORY-001 lo excluye del merge selectivo). En
> un **derivado** sí llega, porque esa exclusión se salta entera cuando `is_factory !== true`.
> El contrato de arriba es el mismo en los dos; su alcance final, no.

### 3.6 Scope de archivos — commitea solo lo que tocaste

> Guía de disciplina, **no** bloqueo por hook.

```
✅ COMMIT:    acota el commit a los archivos que MODIFICASTE — solo esos. El mecanismo
              es el pathspec de §3.6.1 (`git commit … -- <archivos>`); el `git add`
              explícito es el fallback que esa sección declara.
❌ NO:        `git add -A` / `git add .` — pueden arrastrar trabajo ajeno (otras sesiones
              abiertas sobre el mismo repo, autogen, ediciones sueltas que no son tuyas)
✅ STASH:     `git stash` requiere autorización del usuario (gate `ask`) — nunca a ciegas
✅ EXCEPCIÓN: el usuario pide explícitamente un add amplio ("commitea todo")
```

#### 3.6.1 🔴 Checkout compartido (multi-agente) — el commit por pathspec ES el camino

> Daño real: cuando varios agentes trabajan sobre el MISMO working tree, el index
> (staging) es **COMPARTIDO**. `git commit` commitea TODO lo staged — tu `git add`
> explícito (§3.6) agrega lo tuyo pero **NO des-stagea** lo que otro agente ya dejó
> staged → tu commit se traga su trabajo. Incidente real: un commit de provision se
> tragó un rename completo de otra sesión (su trabajo quedó mezclado en mi commit).

```
✅ OBLIGATORIO (agente), en TODO commit: `git commit -m "<msg>" -- <tus-archivos>`
   Commitea SOLO esos paths e IGNORA el resto del index, así que lo que otra sesión
   dejó staged no puede colarse — ni siquiera si lo stagea DESPUÉS de tu `git status`.
   Es la única forma que cierra esa ventana de carrera; verificar el index no la cierra.
   ⚠️ Los flags (`-m`…) van ANTES del `--`; todo lo que va DESPUÉS git lo trata como pathspec.
✅ IGUAL verifica: `git status` antes, y `git show --stat HEAD` después (confirma que no
   se coló nada ajeno). El pathspec acota el commit; no te exime de mirar.
❌ PROHIBIDO: `git commit` sin pathspec cuando el checkout puede estar compartido.
ℹ️  El commit por pathspec deja el índice desincronizado (git le escribe el estado PREVIO
    al pre-commit, así que todo archivo que el hook reformatea queda staged-pero-idéntico
    y `git status` reporta sucio un árbol limpio). `.husky/post-commit` lo repara solo;
    si ves ese residuo, es que el hook no corrió — no lo commitees encima.
```

**Dónde el pathspec NO alcanza** (son mecánicas de git, no preferencias — sin esto la regla se rompe el primer día):

| Caso                                        | Qué hacer                                                                                                                                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Archivo nuevo (untracked)**               | `git commit -- <path>` falla con `did not match any file(s) known to git`: el pathspec solo alcanza lo que git ya conoce. `git add <archivo>` primero, y después el commit por pathspec normal. El `add` te expone una ventana corta (otro agente podría commitear sin pathspec en ese instante) — es inevitable, no la agrandes con trabajo de más entre el `add` y el `commit`. |
| **Merge commit**                            | No lleva pathspec — no hay staged changes normales que acotar (§1 ya lo exceptúa).                                                                                                                                             |
| **Stagear por hunks** (`git add -p`)        | El pathspec ignora el index, así que mata ese flujo. Es trabajo de humano, no de agente: si stageas a mano, usa el fallback de abajo.                                                                                          |

**Fallback** — solo para los casos de arriba, o si el pathspec no es viable:

```
1. `git status` — el index debe contener SOLO los archivos que TÚ tocaste.
2. ¿Hay trabajo ajeno staged? → des-stagéalo (`git restore --staged <ajenos>`)
   hasta que el index sea 100% tuyo. Queda unstaged e INTACTO para el otro agente.
3. Recién entonces commitea.
⚠️  Este camino NO cierra la ventana de carrera: entre tu paso 1 y tu paso 3, otra
    sesión puede stagear algo y tu commit se lo traga. Por eso es el fallback.
```

---

## 4. Branching — Adaptive por fase de proyecto

### Detección de fase (obligatoria antes de aplicar reglas)

1. **Override explícito primero.** Si `project/planning/project-config.md` declara `branching: develop-first` o `branching: main-first` en la sección `## 1. Identity`, esa preferencia manda — la auto-detección se salta.
2. **Auto-detección (fallback).** Si no hay override, leer `version` de `package.json`:
   - `"0.0.0"` → Pre-release (main-first)
   - Cualquier otra (`"1.2.0"`, y también `"0.2.0"`) → Post-release (develop-first) — la misma regla que aplica `/deploy`

> El override permite a un proyecto en v0.0.0 ya adoptar develop-first (convención de equipo), y a un proyecto post-release declarar un modo explícito si `/deploy` no fue la vía del primer release.

### Pre-release (v0.0.0)

```
✅ PERMITIDO: Push a main directo, sin merge ni PR
✅ PERMITIDO: Trabajar en develop si el developer prefiere
ℹ️  Vercel: main = preview deployment
```

### Post-release (v1.0.0+)

```
❌ PROHIBIDO: Merge o push a main sin autorización explícita del usuario
✅ OBLIGATORIO: develop es la rama de trabajo
✅ OBLIGATORIO: Mostrar qué se mergea → ESPERAR autorización → Ejecutar
ℹ️  Vercel: main = production, develop = preview
ℹ️  Para deploy: usar /deploy (merge develop → main)
```

### Transición (ONE-WAY, irreversible)

Cuando `/deploy` ejecuta el primer release (version bump a ≥1.0.0):

1. Tag `main` como vX.Y.Z
2. Crear rama `develop` desde `main` (si no existe)
3. Activar protección de main (Post-release aplica)

---

_TimeKast Factory — Git Rules (L1 Peer)_
