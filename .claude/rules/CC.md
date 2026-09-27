# CC — Claude Code Runtime Rules

> Reglas del runtime Claude Code (CLI, VSCode extension, desktop). Extiende `CORE.md`.

---

## 1. Routing y anuncio de skills

#### 1.1 Ruteo semántico por `description`

- Ruteo de agents/skills es **semántico** por `description` del frontmatter — único criterio de match
- Cargar skills on-demand (Read) solo cuando haya gap concreto en el razonamiento. Preferir orchestrators (p.ej. `sk-crud-scaffold`) cuando matcheen varias skills del mismo dominio
- `@agent-name` o `/skill-name` explícito del usuario → override semántico

#### 1.2 Anuncio de skill al activarse

> **Trigger binario:** al hacer `Read` de un archivo `SKILL.md`, anunciarla antes de aplicar su guidance.

```
✅ OBLIGATORIO: Si acabas de leer `.claude/skills/*/SKILL.md`, imprimir UNA línea antes de actuar:

   🧰 Aplicando skill `nombre-skill`

✅ Múltiples skills cargadas en la misma tarea:

   🧰 Skills: `skill-a`, `skill-b`, `skill-c`

❌ PROHIBIDO: Aplicar guidance del body de una skill sin anunciarla
❌ PROHIBIDO: Anunciar skills que NO se cargaron (performance theater)
ℹ️  Guidance conocida solo por `description` (sin Read del body) → no anunciar; es routing metadata, no la skill
```

> El harness refuerza la regla con un `PostToolUse` hook en `.claude/hooks/skill-announce-reminder.sh` que inyecta recordatorio al detectar Read de un `SKILL.md`.

#### 1.3 Tool-over-bash para inspección

```
✅ OBLIGATORIO: búsqueda/lectura simple → tool dedicada: `Grep` (buscar contenido),
   `Glob` (localizar archivos), `Read` (leer archivos)
✅ Bash queda para EXEC (`git`/`pnpm`/`node`/`gh`) y pipelines reales multi-paso
   (`grep -c … | sort`, `find … | xargs …` siguen siendo Bash válido)
❌ PROHIBIDO: Bash de inspección simple (`grep`/`ls`/`find`/`cat`) cuando una tool dedicada resuelve en un call
```

#### 1.4 No `cd x && …`

```
✅ OBLIGATORIO: flag de directorio nativo donde exista — `git -C <dir>`, `pnpm -C <dir>` / `pnpm --dir <dir>`,
   `make -C <dir>`, `npm --prefix <dir>` — o paths explícitos en los args (`grep pattern dir/file`, `ls dir/`)
❌ PROHIBIDO: `cd x && cmd` — rompe el matcher de permisos (matchea por prefijo del string)
ℹ️  No hay wrapper universal portable: `env -C` es GNU, no existe en macOS BSD
```

---

## 2. Agentes vía Agent tool

> Agents NO son personas-por-dominio. Son **subprocesos aislados** (contexto propio, input acotado, output esperado). El spawn se justifica por **aislamiento de contexto / contrato cerrado / paralelismo** (criterios en `fx-workflow-authoring §8`), NO por "el dominio matchea un agent". El conocimiento de dominio vive en skills, no en una persona spawneada.

```
✅ Dominio (api/db/ui/testing/security/...) → consultar el skill del kit (`kb-*`/`sk-*`) desde el main loop.
   NO se spawnea un agent ni se simula una persona para "ser el experto de X".
✅ Spawn `Agent` SOLO cuando aplica un criterio de subproceso (`fx-workflow-authoring §8`):
   input grande que contaminaría el contexto · contrato cerrado input/output · tareas independientes en paralelo.
   Agents keep disponibles: `architect`, `quality-engineer`, `security-auditor`, `ui-critic`,
   `code-archaeologist`, `skeptical-client`, `product-owner`, `project-planner`, `flutter-mobile`,
   `grounding-auditor` (verifica premisas de un artefacto contra el repo ANTES del escrutinio
   adversarial — responde "¿las premisas son ciertas?", nunca "¿dónde se rompe?").
ℹ️  Taxonomía scoped vs genérico — SSOT del corte (vive aquí, junto a la lista cerrada que
   gobierna): el criterio es LENTE vs MAQUINARIA. Un agent scoped (`dsc-*`/`bkl-*`/`imp-*`/…)
   ejecuta UNA FASE de un pipeline concreto — es maquinaria de su workflow y lleva su prefijo.
   Un agent genérico (sin prefijo) hace UNA PREGUNTA invariante al objeto — la misma sobre un
   plan, un backlog, un freeze-map o un SCR. El conteo de workflows que lo invocan NO es el
   criterio: un genérico recién nacido con un solo call site sigue siendo genérico.
   `fx-workflow-authoring §8 Naming convention` y el `CLAUDE.md` del repo apuntan aquí — no lo
   redefinen.
✅ Exploración profunda o paralela → `Agent` con `run_in_background`
✅ OBLIGATORIO: Pasar paths explícitos de skills relevantes en el `prompt` del Agent
   call — los subagents NO reciben el listado de skills por `description` injection.
   Sin paths citados, el subagent opera sin el kit (`sk-*`/`kb-*`).
   Formato: "consulta antes de empezar: .claude/skills/<nombre>/SKILL.md, ..."
✅ OBLIGATORIO (revisores): el prompt que spawnea un revisor cumple además el contrato de
   contexto de 6 campos de `fx-workflow-authoring §8` (qué se hizo/alcance/restricciones del
   kit/líneas de ataque/fuera de alcance/fase del proyecto) — extensión natural de esta regla
❌ PROHIBIDO: Inventar un subagent por dominio (`backend-specialist`, `frontend-specialist`, etc.) —
   se retiraron; el conocimiento de dominio vive en skills, se consulta inline.
❌ PROHIBIDO: Invocar subagent sin citar skills relevantes cuando el dominio del task matchea ≥1 skill del kit
```

---

## 3. Plain language al usuario (kit-wide)

> La **doctrina** (audiencia, definir términos inline, ejemplos antes de abstracciones, resumir findings, prohibido el argentino) vive en `CORE.md §6` — es portable a cualquier runtime. Aquí queda solo lo que es mecánica de Claude Code.

### Mecánica de checkpoints en Claude Code

```
✅ OBLIGATORIO: CP options **explícitas y excluyentes** — nunca checkboxes, nunca prosa ambigua.
   Dos vías, por disponibilidad de la tool (NO por headless — ver abajo):
   · **(1) Estructurada — default interactivo:** `AskUserQuestion` cuando hay user y la tool
     está disponible. Elimina el formato de respuesta memorizable.
   · **(2) Tabla numerada 1/2/3 — fallback:** cuando hay user presente pero el runtime NO
     tiene la tool. Mismo contenido, respuesta escrita.
   🔴 **Headless (sin user) NO es "la vía 2".** Sin nadie que lea, la tabla no tiene función:
     cada checkpoint resuelve por su fail-open/fail-closed ya declarado por workflow, sin tabla
     y sin tool. Y **no se intenta** `AskUserQuestion` — sin usuario bloquea.
   🔴 **La tabla completa sigue siendo la PRESENTACIÓN** cuando el checkpoint tiene filas con
     contexto (qué / por qué / impacto / recomendación): `AskUserQuestion` es el mecanismo de
     respuesta, no un reemplazo del contenido. Se emiten juntas, en ese orden.
   🔴 **Un checkpoint que exige texto libre del user** (justificar un descarte) NO se convierte
     en opción estructurada sin campo de texto. La exigencia de texto nunca se deroga.
   🔴 **Los gates formales de Plan Mode conservan `ExitPlanMode`** (`§4`) — la vía estructurada
     aplica a la presentación de opciones, jamás sustituye el gate HIGH-risk.
```

---

## 4. Plan Mode para HIGH-risk

```
✅ OBLIGATORIO: Entrar en Plan Mode (ExitPlanMode tool) antes de acciones con reversal cost alto:
   - Issue HIGH risk — "HIGH risk" = riesgo ≥3 de la escala 0-4 (skill `fx-execution-policy`)
   - Schema / auth changes
   - Cambios cross-module (3+ archivos críticos — archivo crítico = con lógica ejecutable o
     configuración que altera comportamiento, no docs/prosa; excepción de volumen declarada
     en `fx-execution-policy §5`)
❌ PROHIBIDO: Proceder sin aprobación en HIGH risk
ℹ️  Git push: autorización explícita por sesión — GIT.md §2
ℹ️  El modo fluido de los workflows (`fx-workflow-authoring §7.1`) NO exime esta regla:
   un checkpoint HIGH-risk o sobre transición irreversible (schema/auth/cross-module/first-release)
   SIEMPRE para — el auto-advance del modo fluido aplica solo a checkpoints LOW-MEDIUM reversibles.
```

---

## 5. Background para tasks largas

```
✅ OBLIGATORIO: `run_in_background=true` para builds, dev servers, tests >30s. CC notifica al terminar; no hacer polling con sleep
```

---

## 6. Permissions (settings.json)

Baseline compartido: `.claude/settings.json` (tracked). Overrides per-dev: `.claude/settings.local.json` (gitignored).

> Ese split (tracked del kit vs dev-owned) es la misma frontera que rige todo `.claude/**`, `scripts/**`, `.husky/**` y `.github/workflows/**` → `CORE.md §5 Frontera kit ↔ derivado`.

> **Wiring de `.claude/hooks/*.sh` — dos vías distintas** (no confundir): (a) **runtime de Claude Code** vía el key `hooks` de `.claude/settings.json` (eventos `PreToolUse`/`PostToolUse`; corren sobre acciones del agente — p. ej. `validate-commit.sh`, `skill-announce-reminder.sh`); (b) **git pre-commit** vía `.husky/pre-commit`, que invoca los scripts por path con guard de existencia `-f` (corren sobre todo commit, del agente o manual — p. ej. `agent-taxonomy-lint.sh`, `config-use-client-lint.sh`). Un hook puede estar en una vía, la otra, o ambas.

#### 6.1 🔴 PROHIBIDO en `settings.json` tracked

| Patrón prohibido                                                | Regla que lo prohíbe                             |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `Bash(git push *)`                                              | GIT.md §2 (push requiere autorización explícita) |
| `Bash(* --no-verify)` / `* --no-gpg-sign` / `gpgsign=false`     | GIT.md §1                                        |
| `Bash(pnpm db:push *)`                                          | SK.md §1.1                                       |
| `Bash(rm -rf *)` genérico / `rm -rf /`                          | Destructivo, no acotado a cache                  |
| `Bash(git reset --hard *)` / `git checkout .` / `git restore .` | Sobrescribe trabajo local                        |
| Paths absolutos (`/Users/foo/**`, `/home/bar/**`)               | Dev-specific — va a `.local.json`                |
| `Bash(gh api -X POST *)` / `-X DELETE *`                        | Writes a GitHub — prompt explícito               |
| `Bash(vercel pull*)` / `vercel env pull` / `vercel link*`       | SK.md §7.1 (sobrescriben `.env.local` → locked out) |

> ℹ️ Instalar deps (`pnpm install`/`add`/`remove`) **no** va en esta tabla: es **ASK** (gate), no DENY
> ni allow — ver `CODING.md §7`.

**Audit rápido:**

```bash
jq -r '.permissions.allow[]' .claude/settings.json \
  | grep -E '(git push |--no-verify|pnpm db:push|/Users/|/home/|reset --hard|rm -rf (\*|/|~)|vercel (pull|env pull|link))'
# → debe retornar vacío. Si hay matches → violación del kit.
```

---

## 7. Ontología del kit (mapeo CC)

| Concepto del usuario                                         | Primitiva CC         | Directorio                                                      |
| ------------------------------------------------------------ | -------------------- | --------------------------------------------------------------- |
| **Agent** (proceso invocable con I/O)                        | Subagent             | `.claude/agents/`                                               |
| **Workflow** (pasos, orchestrator)                           | Skill `tk-*`         | `.claude/skills/tk-*/`                                          |
| **Knowledge** (patterns y skills cross-fase)                 | Skill `kb-*`         | `.claude/skills/kb-*/`                                          |
| **Sistema del Starter Kit** (shipped)                        | Skill `sk-*`         | `.claude/skills/sk-*/`                                          |
| **Workflow interno Factory**                                 | Skill `fx-*`         | `.claude/skills/fx-*/`                                          |
| **Skill project-specific**                                   | Skill `pj-*`         | `.claude/skills/pj-*/` (del developer — `skill:lint` lo ignora) |
| **Slash command delgado**                                    | Command              | `.claude/commands/`                                             |
| **Rules**                                                    | Rules via @import    | `.claude/rules/`                                                |

> **`kb-*` vs `sk-*`:** `kb-*` = patterns y knowledge (_"¿qué patterns aplico?"_; cubre fase coding y fase documental — el routing semántico decide cuándo aplican); `sk-*` = sistema shipped por el kit (_"¿cómo me engancho al sistema existente?"_).

---

## 8. 🔴 NUNCA ejecutar procedimientos de memoria

```
❌ PROHIBIDO: Ejecutar un workflow/skill sin Read del archivo fuente en la sesión actual
✅ Si el .md ya está en contexto de esta sesión → no re-leer
```

---

_TimeKast Factory — Claude Code Runtime Rules (L1 Peer)_
