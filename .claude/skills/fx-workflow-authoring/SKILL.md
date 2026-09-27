---
name: fx-workflow-authoring
description: Factory-internal meta-skill for authoring CC-native pipeline workflows (`.claude/skills/tk-*/`) and their thin slash commands. Invoked when creating a new `tk-*` or refactoring phases.
family: factory-internal
operational: true
model: opus
authoring_time: true
runtime: false
last-verified: 2026-08-20
user-invocable: false
---

# fx-workflow-authoring — CC-native workflow authoring doctrine

> **Propósito:** capturar la doctrina de autoría de workflows CC-native — patterns, contratos, checkpoints, artifacts y subprocess delegation — para que cada workflow nuevo aplique las mismas decisiones sin drift silencioso.
>
> **Aplica a:** autoría nueva de un `tk-*` y refactor de un `tk-*` existente.
>
> **NO es runtime.** Este skill no se carga cuando un workflow se ejecuta — se carga cuando **lo estás creando o refactorizando**.

---

## ¿Cuándo se auto-carga?

Routing semántico (CC.md §1.1). Triggers típicos:

- "autorar workflow", "crear skill tk-\*", "refactor phase del tk-\*", "nuevo comando para pipeline"
- "split SKILL.md", "diseñar checkpoint", "subprocess delegation pattern"
- Edición de archivos en `.claude/skills/tk-*/`, `.claude/skills/fx-*/`, `.claude/commands/`

**NO se carga cuando:**

- Estás ejecutando un workflow — eso es runtime, lo cubre el skill `tk-*` mismo.
- Estás autorando un `kb-*` / `sk-*` — distinto dominio, no estructura de workflow.
- Estás escribiendo una rule (`.claude/rules/*.md`) — declarativa, no procedural.
- Estás autorando un agent (`.claude/agents/*.md`) standalone — diferente primitiva.

---

## §1 Framing CC-native authoring

Este skill es la **doctrina de autoría de workflows CC-native** — patterns, contratos, checkpoints, artifacts y subprocess delegation. No es guía de port desde otros runtimes.

Cuando un `tk-*` nuevo necesita autoría, este skill responde sin handwaving:

- ¿Qué frontmatter? → §5
- ¿Qué secciones del SKILL.md? → §6
- ¿CP1 inline o CP2 Plan Mode? → §7
- ¿Necesito templates/, methodology, CHANGELOG? → §11 decision tree
- ¿Cómo nombro subprocesses? → §8
- ¿Cómo escribo el thin wrapper? → §12
- ¿Qué evito en el body? → `anti-patterns.md §7`
- ¿Cómo invoco mis subprocesses? → §9 skill grounding
- ¿Qué pasa si llega info post-CP? → §10 invalidation handling
- ¿Cómo cierro y cleanup? → §6 + lifecycle final phase
- ¿Está completo? → §14 checklist

Si alguna respuesta es "depende" o "quizá" → gap a cubrir antes de autorar.

---

## §2 Ontology table

Agents NO son "quién hace qué" (persona, roleplay). Son **subprocesos aislados** lanzables en paralelo o serie con contexto propio. Su valor es aislamiento + control de carga + paralelismo.

| Primitiva                                         | Propósito                                                                                                                                                              | Naturaleza  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Rules** (`.claude/rules/*.md`)                  | Constraints always-on                                                                                                                                                  | Declarativa |
| **Skills** (`.claude/skills/*/`)                  | Conocimiento / procedimiento reusable                                                                                                                                  | Estática    |
| **tk-\*** (`.claude/skills/tk-*/`)                | Workflow / orquestador                                                                                                                                                 | Procedural  |
| **Agents** (subprocesses) (`.claude/agents/*.md`) | Subprocesses aislados lanzables en paralelo/serie. Contexto propio, input acotado, output esperado. Valor = aislamiento + control de carga + paralelismo (no roleplay) | Subprocess  |
| **Commands** (`.claude/commands/*.md`)            | Thin wrappers de invocación                                                                                                                                            | Pegamento   |
| **Templates** (`templates/*.template.md`)         | Shape obligatorio de artefactos generados                                                                                                                              | Schema      |
| **CHANGELOG** (`CHANGELOG.md`)                    | Historia interna de evolución del workflow                                                                                                                             | Audit trail |

Un workflow que trata a sus agents como "personas con personalidad" tiende a darles tareas vagas y context completo. Un workflow que los trata como subprocesos los acota: input contract, output esperado, return summary.

---

## §3 9 principios

1. **Foco por fase + gates duros.** Ejecutar la fase actual con su contexto explícito. No saltar checkpoints. No operar de memoria. Implementación posible: SKILL.md monolítico + turn boundaries explícitos, o phase files separados con Read on-demand. La disciplina importa, no el split. **Progressive loading clásico (phase files) es técnica disponible, no requisito universal.**
2. **Checkpoints son stops condicionales, no incondicionales.** Un checkpoint para ante **señal real** (algo falla · ambigüedad · HIGH-risk o irreversible · decisión sin default obvio — criterio en §7.1) — ahí presenta **opciones explícitas y excluyentes** (vía → §7.0) y espera la elección. Sin señal y en modo **fluido** (default), auto-avanza con un resumen breve. El override `--step` restaura el stop incondicional. "El usuario probablemente quiere continuar" es válido **solo** sin señal + fluido + output reversible; nunca para un gate HIGH-risk.
3. **Batch boundaries previenen saturación cuando aplica** (volúmenes grandes de inputs / outputs). Sub-batches dinámicos para volumen impredecible.
4. **Entender antes de modificar** (Chesterton's Fence). Leer file + dependencias + porqué de su diseño antes de cambiar.
5. **Conocer arquitectura ≠ autorización para saltar.** Aunque sepas que la fase 3 viene después, solo ejecutas lo cargado en la sesión actual (CC.md §8).
6. **Trust the harness — no duplicar gates con reglas manuales.** CC runtime gestiona auto-compact context, Plan Mode formal, hooks, ToolSearch deferred loading. NO replicar primitivas runtime compartidas en cada workflow. Si CC ya lo hace, no lo agregamos como check manual.
7. **Fundamentar en skills, no inventar.** Si una regla ya vive en un skill/rule del kit, citarla. No reimplementar inline. No proponer mecanismo paralelo cuando ya hay uno.
8. **Skill body es ahistórico.** Decisiones de evolución, calibración, casos específicos viven en `CHANGELOG.md` per-heavy. El body refleja behavior actual; la historia va al CHANGELOG. NO mencionar otros skills por nombre como "el que está bien hecho" o "el que está stale" — el body es manual, no biografía.
9. **Quality > speed.** Preservar información sobre comprimir. Templates obligatorios. Procesar todo source. Challenge passes. Gates cuantitativos.

---

## §4 Estructura de archivos canónica per workflow

```
.claude/skills/tk-{name}/
├── SKILL.md                           ← Entry monolítico (sin LOC limit; ver §6)
├── methodology.md                     ← Companion conceptual (OPCIONAL — solo si schemas formales)
├── CHANGELOG.md                       ← Audit trail (heavy workflows; ver §11)
└── templates/                         ← OBLIGATORIO si genera ≥1 artifact con shape fijo
    ├── {{artifact-1}}.template.md     ← (regla "no template, no artifact" — §11)
    └── {{artifact-2}}.template.md

.claude/agents/                        ← Subprocesses propios viven aquí (FLAT, no dentro del skill folder)
├── {{prefix}}-{{name-1}}.md           ← prefix scoped al workflow (ver §8)
└── {{prefix}}-{{name-2}}.md

.claude/commands/{{name}}.md           ← Thin wrapper (ver §12)
```

---

## §5 Frontmatter shape (12 fields)

```yaml
---
name: tk-{workflow-name} # kebab-case, match directorio
description: { 1-line EN trigger surface } # EN-only, no enumeración wall-of-text
family: coding | documentation | factory-internal # Agrupa workflows por dominio
model: opus | sonnet | haiku | inherit # Opus default para workflows críticos (semántica abajo)
parallelism_unit: none | batch | pass # Solo si aplica
concurrency_cap: 1 # Pipeline workflows: siempre 1
batch_size_default: N # Solo con parallelism_unit: batch (semántica abajo)
merge_strategy: orchestrator-merge # Si hay subprocess outputs a consolidar
auditor_step: true | false # true si Phase final activa quality-engineer u otro auditor
paths: [globs] # Routing determinista (semántica abajo)
disable-model-invocation: true | false # Routing determinista (semántica abajo)
user-invocable: false # Menú `/` limpio (semántica abajo)
last-verified: YYYY-MM-DD # Convención del kit (no-std YAML) — skill-lint staleness check
---
```

**Campos obligatorios:** `name`, `description` (EN-only, single-line), `family`, `model`.
**Campos opcionales:** `parallelism_unit`, `concurrency_cap`, `batch_size_default`, `merge_strategy`, `auditor_step`, `paths`, `disable-model-invocation`, `user-invocable`, `last-verified`.

**`model` — el enum incluye `inherit`:** `opus`/`sonnet`/`haiku` pinnean el modelo mientras la skill está activa (el campo aplica al turno actual; en workflows multi-turno es palanca de refuerzo, no garantía end-to-end). `inherit` declara que el workflow hereda **deliberadamente** el modelo de la sesión — es válido porque un `tk-*` puede querer correr con lo que el operador eligió, y porque unifica el vocabulario con el frontmatter de agents, donde `inherit` es alias aceptado (§8 Model selection). La doctrina de qué modelo elegir por naturaleza de tarea NO vive en esta sección — aquí solo la shape.

**`parallelism_unit` valores:**

- **`none`** — workflow lineal sin batching (caso típico de pipelines simples).
- **`batch`** — fases procesan items en batches paralelos (ej: ≤5 files per subprocess invocation).
- **`pass`** — fases completas en paralelo como pasadas independientes (ej: 3 reviewers).

**`batch_size_default`** — default declarativo del tamaño de batch por fase, solo para workflows con `parallelism_unit: batch`. Lo lee el **propio workflow** (config declarativa, no un campo del runtime CC) y es override-able per-invocación vía parámetro del orchestrator. Consumidores reales en el kit: los workflows batch de documentación que lo citan en su cuerpo/methodology.

**Routing determinista** (campos del runtime CC — los lee el router al decidir si auto-carga la skill):

- **`paths`** — globs que acotan **cuándo** el runtime auto-carga la skill; NO bloquea la invocación manual (`/name` o el thin wrapper).
- **`disable-model-invocation`** — `true` = el runtime nunca auto-activa la skill por routing semántico; queda solo la invocación manual.
- **`user-invocable`** — `false` = la skill no aparece en el menú `/` ni acepta invocación manual del usuario; el auto-load semántico de Claude **y el `Skill` tool** quedan **intactos** (es el campo inverso a `disable-model-invocation` — controla al humano, no al modelo). Política del kit: **toda skill lo declara `false`** — el usuario entra siempre por el thin wrapper de `.claude/commands/` (`/implement`, `/pdf`, …), así el menú `/` muestra solo comandos y nunca duplica `backlog`/`tk-backlog`. Nunca combinar `user-invocable: false` con `disable-model-invocation: true` en la misma skill (la dejaría inalcanzable por ambas vías).

### §5.1 Veredicto de adopción — campos del runtime que los `tk-*` NO usan

> Decidido una vez y escrito, para no re-discutirlo. Para `kb-*`/`sk-*`/`fx-*` → [`fx-skill-author §5.1`](../fx-skill-author/SKILL.md), que comparte criterio; aquí va lo específico de la familia de workflows.

| Campo | Veredicto para `tk-*` | Razón |
| --- | --- | --- |
| `allowed-tools` **en la skill** | **No adoptar** | El kit ya restringe donde el alcance es nítido: el `tools:` de los agents (§8) y el `allowed-tools` del **thin wrapper** en `.claude/commands/` — dos superficies con dueño claro. Una tercera, sobre la sesión mientras el `tk-*` está cargado, se solaparía con el wrapper sin criterio de cuál gana. **Resuelto contra la doc oficial (2026-08-20): `allowed-tools` NO restringe — es una pre-aprobación temporal.** Las tools listadas no piden permiso durante ese turno y el grant se limpia con el siguiente mensaje del user; las **no** listadas siguen siendo usables, solo pasan por el flujo normal de permisos. Por eso `/backlog` spawnea sus `bkl-*` sin declarar la tool: nunca estuvo restringido. **Veredicto: no adoptar `allowed-tools` en skills** — el kit no tiene un problema de fricción de permisos que resolver, y declarar una allowlist que no restringe invita a leerla como garantía. **`disallowed-tools` es otra cosa y tiene veredicto propio** → `fx-skill-author §5.1` |
| `disallowed-tools` **en la skill** | **Diferido, con el bloqueo nombrado** | Es el único de los dos que **sí** restringe (quita tools del pool mientras la skill está activa), y su caso canónico en la doc oficial es *"`AskUserQuestion` para un loop en background"* — el problema headless de los `tk-*`. 🔴 **No se adopta todavía porque el campo es estático y ningún `tk-*` es siempre-headless:** el mismo workflow corre interactivo o headless según la invocación, y bloquear la tool por frontmatter le quitaría los checkpoints al modo interactivo. La garantía sigue siendo la abstención en prosa de `§7.0` hasta que exista un modo headless-por-construcción al que colgarle el campo. Veredicto completo → [`fx-skill-author §5.1`](../fx-skill-author/SKILL.md) |
| `context: fork` | **No adoptar** — candidato evaluado y **descartado** | El único candidato del kit era `tk-preflight` (no interactivo en apariencia). **Descartado por verificación en disco:** su flujo standalone ofrece **tres** prompts `[y/n]` — promover a `pgEnum` (Phase 3), correr `security-audit` (Phase 4) y el listado de candidatos — todos TTY-only. `fork` corre **sin historial**, aislado y background por default, así que no sirve para un workflow con checkpoints, y esos prompts lo son. **La puerta que queda abierta:** acotar el `fork` a un sub-modo genuinamente no interactivo (p.ej. `--t1` sin `--security-audit`, que hoy no pasa por ningún prompt) — es trabajo propio, no una línea de frontmatter |
| `paths` | **No adoptar** | Un `tk-*` no se auto-carga por path: entra por su thin wrapper, y su `user-invocable: false` ya cierra la vía manual. Acotar por globs no aporta sobre un routing que ya es explícito |
| `disable-model-invocation` | **No adoptar** | Apagaría el auto-routing de un workflow que **debe** ser alcanzable por el modelo cuando el wrapper lo invoca. Es el campo opuesto a `user-invocable`, que sí está adoptado kit-wide — no confundirlos por el parecido de nombre |

**El criterio de cierre es que cada campo tenga razón escrita, no que se adopte alguno.** Cablear cualquiera después es trabajo propio con su issue.

---

## §6 SKILL.md sections en orden

11 secciones canónicas. Cada una con criterio de aplicabilidad — **NO marker UNIVERSAL/CONDITIONAL binario**, sino "aplica si workflow tiene X característica". El template `templates/tk-skill.template.md` las trae con instrucciones inline.

| #   | Sección                                             | Aplica si...                          |
| --- | --------------------------------------------------- | ------------------------------------- |
| 1   | Propósito + Architectural principle (>)             | Siempre                               |
| 2   | Tone guidance                                       | Workflow es conversacional con humano |
| 3   | Anti-Drift / Quality Rules numeradas                | Workflow tiene reglas no-negociables  |
| 4   | Turn boundaries table                               | Workflow es multi-turn iterativo      |
| 5   | TodoWrite obligatorio (mention)                     | 3+ phases                             |
| 6   | Flow overview (ASCII diagram)                       | 3+ phases                             |
| 7   | Phase N — Propósito + Acciones                      | Siempre (1 por fase)                  |
| 8   | Checkpoints (CP1 inline + CP2 Plan Mode)            | Workflow tiene gates intermedios      |
| 9   | Output files lifecycle (durable/audit/transitional) | Produce >2 artifacts                  |
| 10  | Invalidation handling cross-phase                   | Cualquier checkpoint                  |
| 11  | Subprocess delegation summary table                 | Workflow tiene subprocesses propios   |

**Sin LOC limit.** Un SKILL.md monolítico funciona si está bien escrito (turn boundaries explícitos, sub-secciones con H2/H3 navegables). Partir solo si secciones temáticamente separables o se quiere permitir Read parcial — no por número de líneas.

---

## §7 CP1 vs CP2 doctrine

| Checkpoint | Mecanismo                                                          | Cuándo                                                                                                     | Output template                             |
| ---------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **CP1**    | Inline + STOP (compact 3-4 líneas críticas) + opciones (§7.0)      | Conversational review post-context-load. LOW-MEDIUM risk reversible. Verbose mode opt-in vía flag command. | `templates/checkpoint-inline.template.md`   |
| **CP2**    | Plan Mode formal (entry/exit según runtime) + structured synthesis | Synthesis multi-fuente crítica. HIGH risk (CC.md §4). Output durable bloquea writes hasta approval.        | `templates/checkpoint-planmode.template.md` |

**Contrato de checkpoint (condicional al modo de ejecución — §7.1).** Cuando un checkpoint **para** — porque hay señal real, o porque corre en `--step` — DEBE presentar opciones **explícitas y excluyentes** y esperar la elección del user. En modo **fluido** (default) y **sin señal real**, el checkpoint NO presenta opciones: auto-avanza con un resumen breve (1-2 líneas) y continúa. Los gates HIGH-risk (CP2 Plan Mode formal sobre output **no** reversible) NO auto-avanzan nunca — ver §7.1.

#### §7.0 Cómo se presentan las opciones — dos vías por disponibilidad de tool

> Numerada `§7.0` a propósito: va **antes** de `§7.1` en el documento y `§7.1` ya lo citan otros archivos del kit por ese número. Renumerarla habría roto esas referencias sin ganar nada.

SSOT: [`CC.md §3`](../../rules/CC.md). Aquí, lo que un autor de `tk-*` necesita para escribir su checkpoint:

| Situación | Vía |
| --- | --- |
| Hay user **y** `AskUserQuestion` disponible | **Estructurada** (default) — una pregunta por decisión, opciones clickeables |
| Hay user, runtime **sin** la tool | **Tabla numerada 1/2/3** — fallback; se espera respuesta numérica, no "ok"/"sí"/"procede" |
| **Headless** (sin user) | **Ninguna de las dos** — el CP resuelve por su fail-open/fail-closed declarado |

🔴 **Headless no es "el fallback de tabla".** Sin nadie que lea, una tabla no cumple ninguna función. Y **no se intenta** `AskUserQuestion`: sin usuario **bloquea**, y bloquea *antes* de llegar al fallback — así que un CP que auto-avanza en fluido nunca llegaría a auto-avanzar. El patrón correcto es la **abstención explícita**, ya escrito en [`tk-provision`](../tk-provision/SKILL.md) §headless: _"el skill NO intenta `AskUserQuestion`"_. Cópialo, no lo re-derives.

🔴 **Las otras tres garantías las fija `CC.md §3` y aquí NO se reproducen** (`CORE.md §4` — las skills ejecutan, no redefinen reglas): la tabla completa sigue siendo la presentación cuando el checkpoint trae filas con contexto · un checkpoint que exige texto libre conserva el campo de texto · `ExitPlanMode` no se sustituye en los CP2/Plan Mode formales. Si vas a autorar un checkpoint que toca alguna de las tres, **lee la regla** — no la infieras de este resumen.

**Con más decisiones que las que caben en una llamada:** varias llamadas consecutivas, agrupando de a 4, y **antes de todo** la pregunta de atajo ("¿aplico la recomendación a todas?"). 🔴 El atajo se ofrece **solo sobre las filas cuya recomendación no es un descarte** — las que exigen texto quedan fuera y se preguntan una por una, con su conteo narrado. Ninguna fila queda sin presentar.

> ⚠️ **Supuesto declarado, no verificado en este repo:** el tope de 4 preguntas por llamada es un dato del runtime. Si cambia, la regla de agrupado cambia con él — está escrita aquí y no escondida en ningún lado, justamente para que no se rompa en silencio.

**El `allowed-tools` del slash command declara lo que la doctrina del workflow usa.** Si un `tk-*` presenta opciones con `AskUserQuestion`, el `.claude/commands/<wf>.md` que lo invoca la lista. Checklist textual — detectable leyendo los dos archivos, sin validador que lo atrape.

> **Es consistencia declarativa, NO un gate — y en el caso de `AskUserQuestion`, casi un no-op.** Dos hechos de la doc oficial (§5.1): el campo **no restringe** (pre-aprueba, no limita), y **`AskUserQuestion` no requiere permiso** de entrada. O sea que listarla no habilita nada que no estuviera habilitado. Un workflow cuya allowlist la omita **no está roto ni lo estuvo nunca**. Se lista igual porque el archivo declara el contrato del workflow y un contrato incompleto confunde a quien lo lee — pero no es un bug, no justifica un 🔴, y **no se presenta como si lo fuera**.

> **Inconsistencia real que esto cierra:** `tk-design`, `tk-mockup` y `tk-proposal` ya prescribían `AskUserQuestion` bajo comandos cuya allowlist la excluía. ⚠️ **Si eso los bloqueaba de hecho no está verificado** — es la misma incógnita que `§5.1` declara (un command sin `Task`/`Agent` en su allowlist igual spawnea agents). La corrección es correcta en **las dos** lecturas: si el campo restringe, arregla el bloqueo; si no restringe, alinea el contrato declarado con lo que el workflow hace. No hizo falta resolver la incógnita para actuar, y no se afirma un bloqueo demostrado. Se corrigió en los cinco comandos que declaran allowlist (`backlog`, `design`, `mockup`, `proposal`, `publish` — `provision` ya la tenía, y es el único workflow que la usaba sin el defecto: la correlación no era casual).
>
> **Corolario para verificar:** una prueba manual de esta doctrina corrida en un workflow **sin** allowlist (`/implement`, `/discovery`, `/deploy`, `/preflight`) da verde sin haber ejercitado el caso. Verifica en uno **con** allowlist.

> **Pre-load nota:** si las primitivas de Plan Mode son deferred en el runtime actual (ej: requieren tool-loading explícito antes de invocarse), el orchestrator debe cargarlas antes de CP2. El mecanismo concreto vive en docs del runtime; este skill solo establece el requisito.

> **Verbosidad — `--verbose` (default compact).** Los CPs (paren o auto-avancen) son compact (3-4 líneas) por default. `--verbose` amplía con coverage map + plan detallado + invalidation rules. **Coexiste con la forma legacy `verbose=true`** (key=value) que workflows pre-fluido aún exponen al usuario (ej: `tk-discovery`); ambos activan el modo verbose. La unificación a `--verbose` kit-wide es follow-up declarado — NO romper `verbose=true` donde ya está documentado al usuario.

---

### §7.1 Execution modes — fluido (default) / `--step` / headless

Dos ejes **ortogonales**, no un espectro:

|             | `--step` (para en cada CP)   | fluido (para solo ante señal)                     |
| ----------- | ---------------------------- | ------------------------------------------------- |
| interactivo | comportamiento legacy        | **DEFAULT**                                       |
| headless    | n/a (nadie responde)         | comportamiento headless por-CP (fail-open/closed) |

- **fluido** (default interactivo): el checkpoint para SOLO ante **señal real**; sin señal auto-avanza con resumen.
- **`--step`** (override): restaura el stop incondicional en cada checkpoint (doctrina legacy). En **headless no aplica** (nadie responde) → degrada al fallback headless del CP.
- **headless**: cada CP declara su fallback (fail-open / fail-closed). Fluido y headless convergen en "para ante señal" pero divergen en el fallback (headless no tiene user). No se unifican; se documentan lado a lado.
- **Verbosidad** (`--verbose`) es un eje aparte (detalle del resumen / del STOP), no parte de step↔fluido.

**Señal real** (el checkpoint para aunque sea fluido) — criterio canónico; cada workflow lo especializa:

1. Falla un gate mecánico (preflight / verify / build / lint / coverage-shortfall).
2. Conflicto, commits inesperados upstream, drift, branch ≠ source.
3. **HIGH-risk o transición irreversible** (schema / auth / cross-module / first-release) → Plan Mode (`CC.md §4`; el modo fluido NO lo exime).
4. **Decisión genuina sin default obvio** (un dominio sensible sin override declarado, etc). 🔴 **La prueba es la respuesta, no el tema:** si en la operación real la respuesta sale siempre igual, no hay decisión — hay fricción. Y hay **dos** salidas, según la respuesta constante tenga efecto o no: si lo tiene, **se aplica sin preguntar** (es el caso de abajo, "default correcto obvio" — el gate sigue actuando, solo deja de interrogar); si no lo tiene, se degrada a **señal narrada** (nota + registro durable). 🔴 **La prueba aplica SOLO a este criterio 4.** En los criterios 1-3 lo que gatea es el **costo de reversión**, no la variabilidad de la respuesta: un gate HIGH-risk o sobre transición irreversible NO se degrada aunque la respuesta sea siempre la misma (`CC.md §4`; el usuario aprueba casi todos los deploys y el gate se queda igual).

> **NO es señal** (auto-avanza en fluido): un gate cuyo default correcto es obvio (ej: agregar un test recomendado), o un WARNING rutinario que se **surfacea en el resumen** sin pedir decisión. "No silencioso" ≠ "debe parar".

**Nunca auto-avanzan** (ni en fluido): los CP2 Plan Mode formal cuyo output **no** es reversible, y los gates HIGH-risk del criterio 3. Un CP2 sobre output **reversible** (docs / issues regenerables) SÍ puede auto-aceptar sin señal — el workflow lo declara explícito.

> Cada `tk-*` que adopta el modo fluido declara su tabla **checkpoint × modo** en su SKILL.md. El default kit-wide es fluido; los workflows que aún no lo adoptan paran siempre (= `--step` de facto) sin contradecir esta doctrina.

---

## §8 Subprocess delegation policy

**Definición:** subprocess = agent aislado lanzable en paralelo o serie. Contexto propio, input acotado, output esperado. Valor = aislamiento + control de carga + paralelismo.

### Usar subprocess cuando

- **Input grande contaminaría el main context.** Ej: procesar N PDFs / transcripts no debe contaminar al orchestrator.
- **Tarea con contrato cerrado input/output.** Inputs definidos, output schema definido, sin diálogo intermedio.
- **Varias tareas independientes pueden correr en paralelo.** N batches simultáneos sobre items independientes.
- **Output puede persistirse como artifact y mergearse luego.** Subprocess escribe a path pre-calculado; orchestrator concatena/consolida post-completion.

### NO usar subprocess cuando

- **Decisiones globales de orquestación.** Eso vive en main loop, no se delega.
- **Main loop ya tiene todo el contexto y trabajo es lineal.** No hay valor en aislar.
- **Output depende de conversación inmediata con user.** Caso CP1 / CP2 — orchestrator-direct.
- **Subprocess tendría que redescubrir medio workflow para operar.** Si el contract no es cerrable, no es candidato.

### Naming convention

Prefix scoped al workflow: `{prefix}-*` donde `{prefix}` deriva del workflow name (ej: workflow `tk-foobar` → prefix `fb-*` o `foo-*`). Documenta el prefix en `SKILL.md §11 Subprocess delegation summary` para que sea grep-able.

**Scoped vs genérico — el corte es lente vs. maquinaria, y su SSOT vive en `CC.md §2`** (esta sección lo aplica, no lo redefine): un agent lleva prefijo cuando ejecuta **una fase** de un pipeline concreto (maquinaria); va **sin prefijo** cuando hace **una pregunta** invariante al objeto (lente — ej: `architect`, `product-owner`, `project-planner`, `quality-engineer`, `grounding-auditor`). El conteo de workflows que lo invocan NO es el criterio: un genérico con un solo call site sigue siendo genérico. Los genéricos viven sin prefix en `.claude/agents/` y entran a la lista cerrada de `CC.md §2`.

### Tools allowlist

**Restrictivo en frontmatter, NO default = todas.**

Default sugerido por rol:

| Rol                                                      | tools allowlist                |
| -------------------------------------------------------- | ------------------------------ |
| **Writer / extractor** (persiste artifact directo)       | `Read, Grep, Glob, Write`      |
| **Auditor / reviewer** (findings inline al orchestrator) | `Read, Grep, Glob` (sin Write) |
| **Test runner** (ejecuta comandos, no persiste)          | `Read, Grep, Glob, Bash`       |

**Anti-pattern:** subprocess sin `tools:` declarado (default = todas, peligroso). Subprocess auditor con `Write` (rol es solo análisis).

### Model selection per agent

**El criterio de decisión es la verificabilidad** — SSOT del eje: [`fx-execution-policy §3`](../fx-execution-policy/SKILL.md). ¿El resultado lo valida la máquina? Si sí (`pnpm verify`, tests, typecheck), un error sale a la luz y se corrige — el tier barato compra mucho. Si la salida es documental o de juicio, el error se propaga en silencio hasta fases después — ahí el modelo caro sale barato. No hay alias default: el default es **decidir por verificabilidad y declarar el alias elegido**.

La decisión existe en **tres niveles**, los tres con el mismo criterio:

| Nivel              | Dónde se declara                                                  | Qué gobierna                                                                                  |
| ------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Workflow**       | frontmatter `model:` del `tk-*` (§5)                              | el modelo del main loop mientras la skill está activa                                          |
| **Agent**          | frontmatter `model:` del subagent (`.claude/agents/*.md`)         | el modelo con que corre el subprocess spawneado                                                |
| **Trabajo inline** | no tiene campo propio — corre en el modelo de la sesión/workflow | elegir el `model:` del workflow ES elegir el modelo del trabajo inline (las fases sin spawn)  |

> **Sintaxis del campo `model`:** el frontmatter de subagent acepta solo aliases — `sonnet`, `opus`, `haiku`, `inherit`. NUNCA model IDs completos (`claude-sonnet-4-6`, `claude-opus-4-7`). El alias mapea al latest del runtime CC.

Asignación por naturaleza de la tarea (los tiers del eje A viven en `fx-execution-policy §3` — esta sección los aplica, no los redefine):

- **Revisores → pin explícito `opus`.** El juicio ES el output y nada lo valida la máquina. La herencia está prohibida en un revisor: hereda hacia abajo — si el orquestador corre en un modelo más barato, el audit degrada en silencio, sin que nadie lo decidiera. El pin blinda contra esa degradación. Qué agents son revisores NO se lista aquí: lo declara la política de ejecución y su registry (`fx-execution-policy`).
- **Extract input-pesado / implement verificable / specs acotadas por template → `sonnet`.** La máquina (o el schema del template) valida el resultado; el tier barato compra mucho.
- **Síntesis load-bearing → `opus`.** Criterio nuevo que fases posteriores consumen sin re-validar: un error ahí se propaga en silencio.
- **`inherit` es válido solo como herencia declarada a propósito** (el subprocess debe correr en lo que corra la sesión, y eso se quiere así) — nunca como ausencia de decisión, y nunca en un revisor.

### Invocation shape — obligatorio en todo spawn de subagent

Toda invocación del Agent tool en un workflow sigue esta plantilla — los tres elementos son parte del shape, no prosa dispersa:

```
Agent(
  subagent_type: {agent},
  model: {alias}                        ← decisión explícita por verificabilidad. Omitirlo es válido
                                          SOLO si el frontmatter del agent ya pinnea el alias correcto
                                          para el caso — herencia accidental no es una decisión
  prompt: |
    [{phase-label}] {tarea}             ← fase/label que origina el spawn (ej: "Phase 4.2 — QC del epic")
    consulta antes de empezar:
    - .claude/skills/{skill}/SKILL.md   ← paths repo-relative de skills (§9, CC.md §2)
    {input contract del agent}
)
```

- **Modelo:** decidido, nunca accidental (criterios en Model selection, arriba). La herencia solo cuando se declara a propósito — nunca en revisores.
- **El parámetro `model` per-spawn gana sobre el frontmatter del agent** (capacidad verificada del Agent tool): si el spawn declara un alias, el subagent corre en ese modelo aunque su card declare otro.
- **Todo override per-spawn se narra:** un workflow que use `model` distinto del frontmatter del agent lo anuncia al usuario en su output (`CC.md §3`) — resultados distintos entre corridas deben ser visibles, no mágicos.
- **Skills:** paths repo-relative citados cuando el dominio del task matchea ≥1 skill del kit (`CC.md §2`, §9 de esta skill).
- **`phase`:** todo spawn nombra la fase/label que lo origina — hace el trabajo atribuible en el transcript y en `/usage`.

El shape gobierna la autoría (nueva o refactor); no reescribe por sí solo los spawns ya escritos — esos se ajustan cuando su workflow se audite o refactorice contra §8.

### Presupuesto de subprocesos — deriva del registry, nunca de un predicado propio

**Cuántos subprocesos vale la pena gastar en un run es una decisión de escala, y esa escala ya existe.** El nivel de riesgo del registry (`.claude/policy/quality-gates.json`, semántica en [`fx-execution-policy §5`](../fx-execution-policy/SKILL.md)) gobierna **tres** consumidores a la vez: qué revisores corren, el presupuesto de spawns, y el gate de interacción. Un workflow que quiera recortar spawns **lee esa escala**; no inventa un trigger.

🔴 **Ningún workflow declara predicado propio de volumen.** Un criterio local —procedencia, conteo de unidades de trabajo, lista literal de paths— es una segunda fuente para lo que el registry ya decide, y `CORE.md §1` no admite dos. Además el volumen **no es riesgo** (`fx-execution-policy §5`): un cambio grande no compra más escrutinio por ser grande, ni uno chico lo pierde por ser chico.

Dos elementos del patrón sobreviven como doctrina propia de esta sección:

1. **Narración obligatoria.** Un recorte que el usuario no ve es indistinguible de un olvido. Todo recorte se narra —qué se recortó y de qué nivel salió— en el output del workflow. Es el principio 1 de §7 aplicado a este eje.
2. 🔴 **La frontera: el recorte es de SUBPROCESOS, nunca de rigor.** Se recorta a cuántos agentes se les paga contexto propio. **Jamás** se recortan la planeación, los gates, el barrido de validación ni los checkpoints. Un run barato que se saltó un gate no es barato: es un run sin gate.

**Los workflows documentales evalúan sobre lo que su plan ENUMERA, no sobre lo que escriben** — un run que produce markdown en su directorio de backlog no matchea ninguna regla del registry y resolvería riesgo 0 siempre. La partición diff-time / plan-time vive en [`fx-execution-policy §6`](../fx-execution-policy/SKILL.md) y aquí se remite, no se reproduce.

> ⚠️ **La partición es doctrina general; la exención es decisión por workflow.** Que exista un momento plan-time no obliga a cablearlo: un workflow puede declararse **exento** del registry —con la razón escrita en su propio `SKILL.md`— y resolver **su panel y su presupuesto** por otra vía. Los dos hechos conviven y no se contradicen. Lo que **no** puede pasar es lo tercero: derivar el panel de un nivel cuyo `panel_by_risk` está vacío y quedarse sin revisores sin que nadie lo note.
>
> 🔴 **Un workflow exento declara de dónde sale su presupuesto, no solo su panel.** "Deriva del registry" es la regla para quien lo consume; quien se exime queda sin esa fuente y tiene que poner otra por escrito — aunque sea *"estos subprocesos corren siempre, sin importar el nivel"*. **Qué workflow documental está en cada caso —exento con presupuesto fijo, o consumidor del registry— lo enumera [`fx-execution-policy §4.3`](../fx-execution-policy/SKILL.md), dueño de la política; aquí no se lista.** El primero en cablear la lectura — deriva del registry el **conteo de pases de revisión** de su pipeline plan-mode, sobre los archivos que su plan enumera, y declara por escrito la parte de la que sigue exento. Una exención que solo nombra el panel deja el presupuesto sin fuente declarada, que es la misma ausencia de decisión que esta sección existe para cerrar.
>
> **Un consumidor puede serlo a medias, y decirlo es parte del contrato.** [`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md) agrega sobre dos renglones (`risk` y `require`); consumir uno y eximirse del otro es legítimo **si la exención del segundo lleva su razón escrita en el `SKILL.md` del workflow**, como cualquier exención total. Lo que no vale es consumir uno y dejar el otro resuelto por omisión: el lector no puede distinguir una decisión de un descuido, y un derivado que endurezca el renglón exento compraría un endurecimiento inerte sin enterarse.

**Qué spawns concretos recorta cada workflow lo decide su propio `SKILL.md`, no esta sección.** La doctrina fija de dónde sale el presupuesto; el reparto es local y se justifica ahí.

### Contrato de contexto del spawn de revisor — 6 campos obligatorios

Un revisor adversarial sin contexto del repo produce ruido — findings genéricos sobre convenciones que el proyecto ya decidió, sobre archivos que el cambio no toca, o sobre una producción que no existe — y ese ruido es el modo de falla que vuelve inservible un gate. Todo prompt que spawnea un revisor lleva estos **seis campos**. Es una **checklist textual**: un prompt al que le falte un campo es detectable leyendo el spawn, sin correr nada — no hay validador automatizado.

| Campo                                              | Qué evita                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Qué se hizo y por qué**                          | criticar el "qué" sin entender la intención                                                            |
| **Alcance exacto** (archivos/diff bajo revisión)   | opinar de archivos que el cambio no toca                                                               |
| **Restricciones del kit que aplican**              | refutar contra reglas que el repo ya decidió (capas frozen-at-birth, SSOT, fronteras kit↔derivado)    |
| **Líneas de ataque a agotar**                      | refutación genérica en vez de dirigida                                                                 |
| **Qué está fuera de alcance**                      | arrastrar hallazgos ajenos que el filtro del loop tiene que trabajar de más para sacar                 |
| **Fase del proyecto**                              | el ruido "esto te va a tronar producción" en repos sin release                                         |

**El campo fase se deriva MECÁNICAMENTE — nunca se escribe a mano.** Es la misma detección de `GIT.md §4`, aplicada **en su orden**:

1. **Override explícito primero, y es bidireccional:** si `project/planning/project-config.md` declara la preferencia de branching en su sección `## 1. Identity`, esa manda — `branching: develop-first` → post-release · `branching: main-first` → **pre**-release. Colapsar "hay override = post-release" clasificaría al revés a un derivado que declaró `main-first`.
2. **Sin override:** `package.json` `version` — `0.0.0` → pre-release · `≥1.0.0` → post-release.

**El token que se busca (no solo la regla):** la preferencia puede no vivir como un campo `branching:` propio. En este repo, el token `branching: develop-first` vive como prosa dentro de la celda de la fila `is_factory` de la tabla `## 1. Identity` de `project/planning/project-config.md` — `is_factory: true` implica `develop-first`. La resolución busca el token literal `branching: develop-first` / `branching: main-first` dentro de `## 1. Identity` (grep del token, no un parser de campo).

**Ejemplo resuelto sobre este mismo repo:** el Factory declara `version: 0.0.0` permanente + `is_factory: true` → el override manda → post-release/`develop-first`, pese al `0.0.0`. La regla general "lee `version`" clasificaría mal justo aquí; por eso el override va primero.

**Implicación de la fase para el revisor — acotada a la superficie desplegada con datos reales:**

- **Pre-release:** un cambio destructivo de schema o quitar un campo es gratis — exigir migraciones de compatibilidad, pasos de deprecación o planes de rollback ahí es ruido.
- **Post-release:** esa misma exigencia es correcta y obligatoria **sobre esa superficie**.
- 🔴 **La implicación de fase queda SUBORDINADA al campo "restricciones del kit que aplican" — ese campo gana cuando ambos aplican.** El caso que lo obliga vive en este mismo repo: `BR-FACTORY-006` (`project-config.md §10`) declara que el `src/` del Factory **nace congelado** en el derivado — no se propaga y no admite el eje de breaking retroactivo; una implicación post-release aplicada categóricamente ahí produciría exactamente el ruido que esa regla prohíbe. La fase gobierna la superficie desplegada, nunca las capas frozen-at-birth.

Declarar el contrato no audita los spawns ya escritos: cada workflow se revisa contra §8 en su propio issue de sweep.

### Input contract section (obligatoria en cada agent .md)

```markdown
## Input contract

El orchestrator invoca el subprocess con:

- **`{param-1}`** — descripción + tipo
- **`{param-2}`** — descripción
- **`output_path`** — path pre-calculado por orchestrator
- **`{project_slug or batch_id}`** — para naming
```

### Return summary (obligatoria)

5-8 líneas máximo. **NO retornar el output completo inline** — el orchestrator lee el file post-completion.

### "Cuándo NO usar este subprocess" section

Cada agent .md debe listar 3-4 casos donde NO es responsable. Boundary enforcement, previene mission creep.

### Mandato adversarial (obligatoria en todo agent card de revisor)

Todo agent card de **revisor** lleva, junto a las secciones obligatorias de arriba (Input contract · Return summary · "Cuándo NO usar este subprocess"), una sección de **mandato adversarial**: intentar **refutar** la pieza bajo revisión, tratar la duda como evidencia en contra (no a favor), y declarar cuándo un hallazgo sobrevive el intento de refutación. El mandato vive en el card — no solo en los prompts — porque el card viaja con el agente a cualquier workflow que lo invoque, incluidos los que todavía no existen; se redacta sin asumir el contexto de un call site concreto.

---

## §9 Skill grounding rule (CC.md §2 codification)

**Regla:** cuando orchestrator invoca subprocess y el dominio del task matchea ≥1 skill del kit, DEBE citar paths repo-relative en el prompt del Agent call.

**Razón:** subprocesses NO reciben listing por description injection. Sin paths citados, el subprocess opera sin el kit (`sk-*`/`kb-*`).

**Format obligatorio:**

```
consulta antes de empezar:
- .claude/skills/{name}/SKILL.md
- .claude/skills/{name2}/SKILL.md
```

**Paths repo-relative**, no absolutos — `<absolute-user-path>/...` no debe aparecer en docs tracked.

**Anchor:** `CC.md §2`.

---

## §10 Invalidation handling rule

Cada workflow heavy DEBE declarar qué pasa si llega información nueva después de un checkpoint. Sin esto, los workflows iterativos producen state inconsistente.

**Opciones para declarar:**

- **Patch incremental** — orchestrator hace edits localizados al artifact afectado.
- **Regen completo** — re-corre la fase que produjo el artifact.
- **Backtrack a fase anterior** — vuelve a una fase upstream y re-corre intermedias.
- **User choice con threshold** — debajo de cierto delta (ej: <30%), patch; por encima, prompt al user con opciones.

El threshold concreto y la mezcla de opciones es decisión del workflow; lo no negociable es **declarar la política explícitamente** en una sección dedicada del SKILL.md.

**Anti-pattern:** workflow heavy sin esta sección → state inconsistente garantizado en runs reales.

---

## §11 Companions decision tree

Cuándo necesitas cada companion file:

| Característica del workflow                                     | Companion necesario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Skeleton                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Schemas formales (taxonomies, confidence tags, factory-tickets) | Default: `methodology.md` (single file, ≤500 LOC). Split a `methodology/{topic}.md` sub-folder cuando el contenido es sectionable per agent invocation Y aplica al menos uno: (a) ≥3 topics distintos consumidos por subprocesses distintos, (b) algún topic excede 150 LOC, o (c) `methodology.md` total excede 500 LOC. Al split, mantener `methodology.md` como **thin index** que apunta a cada sub-file (no eliminar — preserva discoverability + back-compat con refs viejos). Subprocess prompts citan el sub-file específico cuando split. | (domain-specific, no skeleton)                                           |
| Itera y calibra (3+ runs sistémicos)                            | `CHANGELOG.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `templates/workflow-changelog.template.md`                               |
| Produce ≥1 artifact con shape fijo                              | `templates/*.template.md` (regla **"no template, no artifact"** — hard)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `templates/` shape convention                                            |
| Subprocesses propios                                            | Naming `{prefix}-*` + tools allowlist + input contract + return summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `templates/subprocess-prompt.template.md`                                |
| Conversacional multi-turn                                       | Tone guidance + turn boundaries + verbose flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `templates/tk-skill.template.md` (sections 2, 4)                         |
| Synthesis multi-fuente HIGH-risk                                | CP2 Plan Mode formal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `templates/checkpoint-planmode.template.md`                              |
| >2 artifacts                                                    | Output lifecycle 3-tier (durable / audit / transitional)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `templates/tk-skill.template.md` (section 9)                             |
| 3+ phases con checkpoints                                       | TodoWrite + thin wrapper + flow overview ASCII                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `templates/tk-skill.template.md` + `templates/slash-command.template.md` |
| Cualquier checkpoint                                            | Invalidation handling explícito (§10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | inline en SKILL.md                                                       |

> Definición operable de heavy vs ligero: ver §13.

> **Hard rule "no template, no artifact":** si el workflow va a generar `foo.md`, primero crea `templates/foo.template.md`. Sin template, no se genera. Improvisar shape produce drift entre runs y entre proyectos derivados.

> **Why keep `methodology.md` as thin index after split:** human reads y stale instructions siguen resolviendo. Cost ~10 LOC; benefit zero broken refs across the kit (incl. otros agents y skills que pudieran citar `methodology.md` por costumbre).

---

## §12 Wrapper rules (thin slash command)

**Anatomía:** thin wrapper. `Read` del SKILL.md → parse `$ARGUMENTS` → TodoWrite obligatorio si 3+ phases → delegate a skill.

**Regla operativa:** "wrapper no duplica semántica del skill". El conteo de líneas es guideline (~30-40 típicamente), no constraint hard.

**Mode detection:**

- Parámetros sin prefijo (ej: `nuevo`, `con-docs`, `validar`) → modo principal del workflow.
- Flags con `--` (ej: `--next`, `--plan`) → comportamiento secundario.
- `--step` → override del modo fluido (para en cada checkpoint — §7.1). `--verbose` → CP verbose mode (`verbose=true` legacy sigue válido donde ya está documentado).
- Si `$ARGUMENTS` vacío → Phase 0 del skill pregunta el modo.

**3 reglas duras:**

- ❌ Wrapper NO duplica fases del skill. (No enumerar Phase 1, 2, 3 en el wrapper — eso vive en SKILL.md.)
- ❌ Wrapper NO contradice checkpoints del skill. (Si el skill define un mecanismo concreto para CP1, el wrapper no puede decir lo contrario.)
- ❌ Wrapper NO redefine semantics. (No introducir modos no documentados en el skill.)

**Skeleton:** `templates/slash-command.template.md`.

---

## §13 Heavy vs ligero — definición operable

- **Heavy workflow** = 3+ phases con artifacts durables / schemas formales / subprocesses propios.
  - Necesita: SKILL.md + templates/ + (methodology.md si schemas) + CHANGELOG.md + thin wrapper + agents prefix-scoped.
- **Ligero workflow** = 1-2 phases sin artifacts. Caso típico: utilidad de transición de sesión / utility tooling sin output durable.
  - Mínimo: SKILL.md + frontmatter + thin wrapper + anti-pattern grep.

---

## §14 Heavy workflow checklist (12 items SÍ/NO/N/A)

Aplicar antes de cerrar la autoría. Si algún item es NO sin justificación → gap a cubrir.

- [ ] Frontmatter sigue el shape de §5 (4 obligatorios + opcionales que apliquen)
- [ ] SKILL.md sigue las 11 secciones invariables en orden (§6)
- [ ] CP1 + CP2 con doctrina explícita (§7) — opciones explícitas y excluyentes cuando paran (señal real o `--step`; §7.1). **La vía estructurada cumple este ítem igual que la tabla** (§7.0): no marcar NO por presentar con `AskUserQuestion`
- [ ] `templates/` folder con `*.template.md` por artifact (regla "no template no artifact" — §11)
- [ ] `methodology.md` si hay schemas formales (§11)
- [ ] `CHANGELOG.md` con `[Unreleased]` + buckets (§11)
- [ ] Thin wrapper command sigue las 3 reglas (§12) — no duplica, no contradice, no redefine
- [ ] Subprocesses prefix-scoped `{prefix}-*` con tools allowlist apropiado por rol (§8)
- [ ] Subprocess model selection (§8) — alias decidido por verificabilidad (revisores → pin `opus`, nunca `inherit`; extract/implement verificable → `sonnet`)
- [ ] Skill body ahistórico (no client names, no journey narrative — `anti-patterns.md §7`)
- [ ] Invalidation handling explícito (§10)
- [ ] Subprocess prompts citan paths repo-relative de skills (§9, CC.md §2)
- [ ] Anti-patterns greps pasan vacío (`anti-patterns.md §14`)

---

## §15 Verificación funcional

**Caso de prueba:** un workflow heavy hipotético del pipeline (cualquiera que no exista todavía). Aplicar este skill a "diseña ese workflow" y confirmar que responde sin handwaving en las 12 preguntas del checklist (§14). Si alguna es "depende" / "quizá" → gap a cubrir.

Si el meta-skill entrega respuestas concretas en las 12, cumplió su objetivo.

---

## §16 Boundary

| Si vas a autorar...                                        | NO uses este skill — usa...                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| Un `kb-*` (patterns cross-fase: coding o documental)       | El dominio técnico directo (no hay meta-skill para `kb-*`) |
| Un `sk-*` (kit-shipped system)                             | Inventario directo + `kb-*` correspondiente                |
| Un agent `.claude/agents/*.md` standalone (cross-workflow) | Leer otros agents + `CC.md §7` como referencia             |
| Una rule `.claude/rules/*.md`                              | Cada rule es ad-hoc — no hay patrón replicable             |
| Un slash command sin skill detrás                          | `templates/slash-command.template.md` (aquí mismo sirve)   |

---

## §17 Post-change validation

Antes de commit de un workflow nuevo o refactor:

- [ ] Frontmatter válido (`name`, `description` EN-only single-line, `family`, `model`)
- [ ] Todos los Read-refs resuelven (paths existen)
- [ ] Phase files (si hay split) auto-contenidos (no dependen de variables del padre)
- [ ] Checkpoints presentan opciones explícitas y excluyentes cuando paran (señal real o `--step`) — estructuradas o en tabla, las dos cumplen (§7.0); auto-avanzan con resumen en fluido sin señal (§7.1). Si el workflow adopta el modo fluido → tabla checkpoint × modo presente en el SKILL.md
- [ ] No hay carry-overs AG residuales (greps en `anti-patterns.md §14`)
- [ ] No hay paths absolutos `<absolute-user-path>/...` (dev-specific va en `settings.local.json`)
- [ ] CHANGELOG actualizado si workflow heavy
- [ ] Templates folder presente si genera artifacts
- [ ] Subprocesses prefix-scoped con tools allowlist apropiado por rol
- [ ] Wrapper no contradice skill (test funcional: leer SKILL §Checkpoints + leer wrapper, confirmar que coinciden)
- [ ] Skill body ahistórico (greps en `anti-patterns.md §14`)
- [ ] Skill-lint pasa (`pnpm skill:lint`)

---

_TimeKast Factory — fx-workflow-authoring (CC-native authoring doctrine, factory-internal)_
