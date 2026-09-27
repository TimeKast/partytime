---
name: fx-skill-author
description: Factory-internal meta-skill for authoring declarative kit skills (`kb-*` / `sk-*` / `fx-*` / `pj-*`) — classify by prefix against the kit ontology, uniqueness-check against the existing catalog (extend over create), and apply the per-family frontmatter + body templates with ahistorical-body enforcement. Invoke when creating or refactoring a `kb-*` / `sk-*` / `fx-*` / `pj-*` skill. For `tk-*` pipeline workflows and their slash commands → `fx-workflow-authoring`.
family: factory-internal
operational: true
model: opus
authoring_time: true
runtime: false
last-verified: 2026-09-22
user-invocable: false
---

# fx-skill-author — Declarative skill authoring doctrine

> **Propósito:** capturar la doctrina de autoría de skills **declarativos** (`kb-*` / `sk-*` / `fx-*` / `pj-*`) — clasificación por prefijo, uniqueness check, frontmatter, descriptions que ruteen, anatomía de body por familia y disciplina ahistórica — para que cada skill nuevo entre al kit sin drift y sin inflación.
>
> **NO es runtime.** No se carga cuando un skill se aplica — se carga cuando **lo estás creando o refactorizando**.
>
> **Boundary:** workflows orquestados (`tk-*`, fases, gates, subprocesses, slash command) → `fx-workflow-authoring`. Este skill cubre lo declarativo, sin fases.

---

## §1 ¿Cuándo se auto-carga?

Routing semántico (CC.md §1.1). Triggers típicos:

- "crear un skill", "hagamos un `kb-*` para X", "nuevo `sk-*`", "documentar este patrón como skill"
- "¿esto debería ser un skill?", "agregar conocimiento de Stripe / cron / dataviz al kit"
- Edición de `.claude/skills/kb-*/`, `.claude/skills/sk-*/`, `.claude/skills/fx-*/`, `.claude/skills/pj-*/`

**NO se carga cuando:**

- Vas a autorar un workflow `tk-*` (fases + gates + slash command) → `fx-workflow-authoring`.
- Vas a autorar un agent `.claude/agents/*.md` standalone → distinta primitiva (lee otros agents + `CC.md §7`).
- Vas a escribir una rule `.claude/rules/*.md` → declarativa always-on, cada una es ad-hoc.
- **Vas a aplicar** un skill existente → eso es runtime, lo cubre el skill mismo.

---

## §2 Decisión de prefijo — la única pregunta de clasificación

> **Regla de Oro (CORE.md §4):** este skill **ancla** la ontología a su SSOT, no la recopia. La fuente de verdad de prefijos es [`CORE.md §1 Prioridad de Skills`](../../rules/CORE.md) + [`CC.md §7 Ontología del kit`](../../rules/CC.md). Si la tabla de abajo diverge del archivo, **gana el archivo** — léelo antes de clasificar.

Una sola pregunta al user (no un cuestionario): **¿qué naturaleza tiene el conocimiento?**

| Si el conocimiento es…                                                                 | Prefijo  | Pregunta clave que responde el skill        |
| --------------------------------------------------------------------------------------- | -------- | -------------------------------------------- |
| Patrón **portable** del stack, sirve en otros repos, no atado a este `src/`             | `kb-*`   | "¿qué patterns aplico?"                      |
| Sistema concreto **ya implementado** en este `src/` que **viaja con el kit**            | `sk-*`   | "¿cómo me engancho al sistema existente?"    |
| Herramienta de la **metodología / Factory** misma (no es feature de la app derivada)    | `fx-*`   | "¿cómo opero / construyo el kit?"            |
| Aplica **solo a este derivado**, no se sube al template (dev-owned)                      | `pj-*`   | "¿qué es específico de mi proyecto?"         |
| Un **workflow** con fases / gates / orquestación / slash command                        | `tk-*`   | → **STOP**, usa `fx-workflow-authoring`      |

**Desempate `kb-*` vs `sk-*` (la confusión #1):**

```
¿El kit YA shippea este sistema (existe en src/, lo asume un sk-* o sk-features-index)?
   SÍ  → sk-*  (y opcionalmente un kb-* par para el paradigma portable)
   NO  → kb-*  (portable; puede cubrir stacks que el kit ni usa — Flutter, Python)
```

Un dominio **puede** tener ambos: un `kb-x` (paradigma portable) + un `sk-x` (implementación del kit) — la división paradigma↔implementación. Pero el par es la excepción, no la regla: el kit no shippea ninguno. Una `kb-*` que solo repite como teoría lo que su `sk-*` documenta contra archivos reales no gana atención en el routing — lo que el modelo ya trae de fábrica no necesita skill, y lo que es del kit vive en la `sk-*`. Si un `kb-*` nuevo describe algo ya shippeado → debería ser `sk-*`, o no crearse (`ontology-drift`).

**`fx-*` shippea o no según su glob:** algunos `fx-*` viajan a derivados (`fx-pdf-export`, `fx-factory-cli` — el dev los usa), otros son origin-only (`fx-distribution`). El prefijo no decide el shipping; el dominio sí. No es criterio de clasificación.

---

## §3 Probe de contenido — los 4 inputs que hacen útil a un skill

Antes de generar, extrae del contexto del user (o pregúntale) los 4 inputs. Sin estos, el skill es cascarón:

1. **Patrones** — 5-8 bullets concretos y accionables (no teoría). Lo que el agente debe *hacer*.
2. **Whys NO derivables del código** — el gap real que justifica el skill. Trampas, decisiones de diseño, restricciones del stack que el agente no infiere leyendo `src/`. (La historia de *cómo se llegó* a la decisión **no** va — ver §8.)
3. **Triggers semánticos** — qué prompt típico del user debería activarlo. Alimenta la `description` (§6).
4. **Cross-refs** — qué skills existentes complementa, extiende o con cuáles NO debe solaparse (§4).

> Si no puedes llenar los 4 con sustancia → el skill no está listo, o el conocimiento ya vive en otro lado.

---

## §4 Uniqueness check — extend-over-create (defensa anti-inflación)

**El paso de mayor valor.** Crear un skill de más es peor que no crearlo: ensucia el routing semántico (overlaps parciales crean ambigüedad). Default: **extender un skill existente** antes que crear uno nuevo.

```bash
ls .claude/skills/                                   # catálogo completo
grep -rl "<keyword del dominio>" .claude/skills/*/SKILL.md   # overlap por contenido
```

Y compara el `description` propuesto contra los `description` de los skills del mismo dominio (el routing es por description — el overlap que importa es semántico, no textual).

| Resultado del check                                       | Acción                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| Existe un skill que ya cubre ~el mismo dominio            | **Extender ese skill** (agregar sección), no crear uno nuevo        |
| Existe un par `kb-X` pero falta el `sk-X` (o viceversa)   | Crear el faltante **anclando al par** en la description (§6)         |
| Overlap parcial con otro skill                            | Diferenciar scope explícito en ambos `description`, o no crear      |
| Nada cubre el dominio                                     | Crear nuevo                                                          |

> Si propones crear y hay overlap → preséntale al user la opción de extender, con el path del skill candidato. No crees unilateralmente.

---

## §5 Frontmatter por familia

Mínimo universal: `name` (kebab-case, == directorio) + `description` (§6). Campos extra según familia:

| Familia  | Campos                                                                 | Opcionales                                                                  | Notas                                                                       |
| -------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `kb-*`   | `name`, `description`, `last-verified`                                  | `paths`, `disable-model-invocation`, `user-invocable`                        | `description` cierra con `For kit infra → sk-x` si existe el par            |
| `sk-*`   | `name`, `description`, `last-verified`                                  | `paths`, `disable-model-invocation`, `user-invocable`                        | `description` abre con "Kit-shipped…" y cierra con `For portable → kb-x`    |
| `fx-*`   | `name`, `description`, `family: factory-internal`, `last-verified`      | `operational`, `model`, `effort`, `runtime`, `authoring_time`, `paths`, `disable-model-invocation`, `user-invocable` | `operational: true` = la skill ejecuta trabajo al invocarse; ausente = referencia. `model`/`effort` solo con `operational: true` |
| `pj-*`   | `name`, `description`                                                   | —                                                                             | Dev-owned — `skill:lint` lo ignora; el derivado decide su convención        |

- **`last-verified: YYYY-MM-DD`** — convención del kit (no-std YAML). El `skill:lint` warnea si falta o tiene >90 días (staleness check). Ponlo a la fecha de hoy al crear.
- **`paths` / `disable-model-invocation`** — routing determinista (campos del runtime CC): `paths` acota con globs **cuándo** el runtime auto-carga la skill (no bloquea la invocación manual); `disable-model-invocation: true` apaga el auto-routing semántico — la skill solo se activa por invocación manual.
- **`user-invocable: false`** — política kit-wide (todas las familias): oculta la skill del menú `/` y bloquea que **el usuario** la escriba a mano. **NO toca** el auto-load semántico de Claude **ni el `Skill` tool** — el modelo la sigue alcanzando por las dos vías. Su eje es el humano, no el modelo; el campo inverso es `disable-model-invocation`. El usuario entra por los thin wrappers de `.claude/commands/`; el menú `/` queda solo con comandos. Nunca combinarlo con `disable-model-invocation: true` (skill inalcanzable).

  > **Precisión que evita una confusión frecuente:** "solo visibilidad de menú" se queda corto (también bloquea que el usuario la invoque a mano) y "bloquea la invocación" se pasa de largo si se lee como que bloquea al modelo. Las dos mitades: **bloquea al humano · no toca al modelo.** Las **61 skills** del kit que lo declaran `false` lo hacen por la política del wrapper, nunca para protegerse del auto-routing — para eso el campo es `disable-model-invocation`.
- **`operational: true`** (solo `fx-*`) — declara que la skill **ejecuta trabajo al invocarse** (corre un build, genera artefactos, dirige authoring). Ausente/false = skill de pura referencia (solo se lee). Es lo que hace enforceable la regla de la columna Notas: el `skill:lint` acepta `model`/`effort` en un `fx-*` **solo** si declara `operational: true`; en un `fx-*` de referencia son error. No va en `kb-*`/`sk-*` (esas familias son referencia por definición — declararlo ahí es error).
- **`effort`** — nivel de razonamiento (`low`…`max`) mientras la skill está activa; si se omite, hereda el de la sesión. Aplica solo a `fx-*` con `operational: true` (la skill dirige trabajo). En `kb-*`/`sk-*` NO va `model` ni `effort`: son referencia, no trabajo — el tier lo decide quien ejecuta, no el material consultado.
- **No inventes campos** que ningún consumidor lee. El parser del lint solo extrae los listados arriba.

### §5.1 Veredicto de adopción — campos del runtime que el kit NO usa

> La regla de arriba ("no inventes campos que ningún consumidor lee") aplicada **a la inversa**: por qué el kit elige **no** consumir campos que el runtime **sí** ofrece. Se decide una vez y se escribe, para no re-discutirlo cada vez que alguien lo propone.
>
> Aplica a `kb-*` / `sk-*` / `fx-*`. Para `tk-*` → [`fx-workflow-authoring §5.1`](../fx-workflow-authoring/SKILL.md).

| Campo | Veredicto | Razón |
| --- | --- | --- |
| `allowed-tools` | **No adoptar** | **No restringe** — es una **pre-aprobación temporal** (doc oficial, verificada 2026-08-20): las tools listadas no piden permiso durante ese turno, el grant se limpia con el siguiente mensaje del user, y las **no** listadas siguen siendo usables por el flujo normal de permisos. El kit no tiene un problema de fricción de permisos que resolver, y declarar una allowlist que no restringe invita a leerla como garantía — el error exacto que este veredicto existe para prevenir |
| `disallowed-tools` | **Diferido con caso de uso identificado** — no es "no adoptar" | **Este sí restringe:** quita tools del pool mientras la skill está activa. Y la doc oficial da como caso canónico, textual, *"`AskUserQuestion` para un loop en background"* — que es **exactamente** el problema headless del kit. Hoy esa garantía es **prosa**: `fx-workflow-authoring §7.0` le pide al agente que "no intente" la tool sin usuario. `disallowed-tools` la volvería estructural. 🔴 **Lo que bloquea adoptarlo ya:** el campo es **estático en el frontmatter**, y ninguna skill del kit es siempre-background — los `tk-*` son interactivos o headless **según la corrida**, y una skill con la tool bloqueada por frontmatter perdería los checkpoints en modo interactivo. Adoptarlo exige primero una skill (o un modo) que sea headless **por construcción**, no por contexto. Ver `fx-workflow-authoring §5.1` |
| `context: fork` | **No adoptar** en esta familia | Corre como subagente aislado, **sin historial**, background por default y con tool set más estrecho. Ninguna skill `kb-*`/`sk-*`/`fx-*` de referencia lo necesita: no ejecutan, se leen. El único candidato del kit era un `tk-*` y quedó descartado — ver `fx-workflow-authoring §5.1` |
| `paths` | **No adoptar por ahora** | Acota con globs cuándo se auto-carga. El kit ya controla el auto-routing **redactando `description`** (§6), que es la superficie de trigger real y funciona: caso vivo, `kb-visual-direction` no se auto-carga en `/implement` por su description. Un segundo mecanismo de routing en paralelo tendría que ganarle a ese, no coexistir: dos fuentes de "cuándo se carga" es la clase de duplicación que §4 combate. **Reevaluar** si aparece una skill cuyo scope sea genuinamente de path (p.ej. una `pj-*` de un subdirectorio) |
| `disable-model-invocation` | **No adoptar por ahora** | Apaga el auto-routing semántico. Hoy ninguna skill del kit quiere eso: **todas** existen para que el modelo las encuentre. Su caso de uso sería una skill puramente humana, y la política del kit es la contraria — el humano entra por `.claude/commands/`, no por el menú de skills. **No confundirlo con `user-invocable`** (arriba): ejes opuestos, nombres parecidos |
| `effort` | **Fuera del alcance de este veredicto** | Territorio de la política de modelos (`EPIC-04` + el bloque de selección de modelo de `fx-workflow-authoring §8`). Ya está adoptado y documentado arriba para `fx-*` con `operational: true`. ⚠️ **Advertencia verificada:** `effort` **no existe como parámetro per-spawn de subagente** — ni parámetro del `Agent` tool, ni campo del frontmatter de agents, ni env var, ni setting. Los campos desconocidos se ignoran **en silencio**, así que declararlo en un `.claude/agents/*.md` no hace nada y nadie avisa. No apostar a él ahí |

**El criterio de cierre de este veredicto es que cada campo tenga razón escrita, no que se adopte alguno.** "No adoptar, por ahora" con su razón vale tanto como un sí — lo que no vale es dejar el campo sin decisión, que es el estado que esta sección elimina.

**Adoptar cualquiera de estos después es trabajo propio**, con su issue: este veredicto decide **si** el kit los usa y por qué, no los cablea.

---

## §6 Description doctrine — es trigger surface, NO index card

La `description` es el **único criterio de routing** (CC.md §1.1). Reglas duras:

```
✅ EN-only, single-line. Sin saltos de línea (no `description: >` multilínea enumerativo).
✅ Forma: <qué hace + para qué stack> — <cuándo se invoca, en palabras del prompt del user>. <boundary/cross-ref>.
✅ Palabras que estarían en el PROMPT del user (sinónimos del dominio), no jerga interna.
✅ Cierra con boundary cuando aplica: "For X → see `kb-y`." / "NOT for Z (eso es /w)."
✅ Par kb↔sk: si existe contraparte que SÍ shippea en el proyecto, ancla al par — son **3** anchors obligatorios (ver abajo).
❌ Duplicación bilingüe EN+ES (duplica tokens, no mejora routing — embeddings entrenados en EN).
❌ Enumerar >8 símbolos del body (el `skill:lint` warnea anti-enumeration). La description no es índice.
❌ Keywords sueltas sin contexto ("api server action helper validate").
```

**Par kb↔sk — los 3 anchors que `skill:lint` exige** (cada uno es un error P1 separado del check `pair-cross-refs`):

1. **Description:** cierra con `→ {partner}` (la mitad kb cierra con `For kit infra → {partner}`; la mitad sk, con `For portable → {partner}`).
2. **Body opener:** literal `Pair:` en las primeras ~10 líneas (dentro del blockquote intro está bien).
3. **Footer:** literal `Cross-reference:` en las últimas ~20 líneas.

El template `kb-sk-skill.template.md` ya trae los 3. **Registro obligatorio:** un par nuevo se valida solo si está en el array `DEFAULT_PAIRS` (hoy vacío — el kit no shippea ningún par) de [`scripts/tools/skill-lint/checks/pair-cross-refs.ts`](../../../scripts/tools/skill-lint/checks/pair-cross-refs.ts) — agrégalo o el check ignora el par en silencio. El check NO se enforce si la contraparte no shippea en el proyecto (guard de portabilidad para `kb-*` en derivados).

**Test de routing (3 prompts hipotéticos)** — antes de cerrar, valida la description:

1. Lee SOLO el `description` (como lo haría el router).
2. Genera 3 prompts típicos del user que *deberían* activar este skill.
3. Si los 3 caen claramente en este dominio → **green**. Si alguno derivaría a otro skill → la description está ambigua, ajústala.

---

## §7 Anatomía del body por familia

Usa el template de la familia (`templates/`). No improvises shape — el shape consistente es lo que hace el kit navegable entre proyectos.

### `kb-*` / `sk-*` — declarativo (`templates/kb-sk-skill.template.md`)

```
# {name} — {Título}
> Intro blockquote:
>   - Stack / "Portable" (kb) | "Kit-shipped — grounded in real files: …" (sk)
>   - **Pair:** [`sk-x`](../sk-x/SKILL.md)            ← ancla al par (obligatorio si existe)
>   - Related: [`kb-y`] · [`sk-z`]
>   - (solo sk-*) Canonical symbol names → project/reference/HOOKS.md
>   - (solo sk-*) As-built → project/reference/SCHEMA.md / API.md
1. {Regla / decisión principal}        ← rules → patterns → examples → tables
2. {Patrón con código}
…
N. Anti-patterns        ← tabla ❌ | ✅
N+1. Checklist          ← [ ] items verificables
_Cross-reference footer (italic) con links a skills relacionados._
```

- **`sk-*` es grounded:** cita archivos reales (`@/lib/...`). Los `@/` en fences DEBEN resolver bajo `src/` (el `skill:lint` specifiers lo valida — error P1 en el origen; en un derivado degrada a warning porque su `src/` diverge por diseño).
- **`kb-*` es portable:** no asume el `src/` del kit; puede cubrir otros stacks. No fuerces un anchor `→ sk-x` si ese `sk-x` no existe.

### `fx-*` — operacional (`templates/fx-skill.template.md`)

```
# {name} — {Título}
> Propósito + boundary (+ "NO es runtime" si authoring-time)
§1 ¿Cuándo se auto-carga? (triggers)
§N Doctrina / comandos / invariants / checks
§ Boundary table (qué NO cubre)
_Footer_
```

#### `scripts/` — cuando la skill trae su propio ejecutable

Un `fx-*` con `operational: true` puede llevar su ejecutable **dentro** del directorio de la skill, en `scripts/`. No hay que cablear nada en `distribution/profiles.json`: el mismo glob que lleva el `SKILL.md` a los dos perfiles (`include: ["**"]` en `full`, `.claude/skills/fx-*/**` en `core`) se lleva el subdirectorio completo.

**Ahí no va TypeScript, y la razón es de distribución, no de gusto.** El `include` del perfil `core` no lista `package.json`, ni `tsconfig.json`, ni `src/`, y el array `track` tampoco los lleva — un derivado `core` no tiene `node_modules` donde resolver una dependencia, ni con qué compilar o ejecutar un `.ts`. A eso se suma que el `tsconfig` del derivado es dev-owned y nace congelado: podría rechazar el archivo por una opción de strictness que el kit no controla. Consecuencia doble: el ejecutable va en `.mjs` y **solo** importa builtins `node:*`. Si el archivo necesita algo del registro, se invoca como proceso aparte (`npx`), nunca como import.

🔴 **Ese `npx` va con la versión FIJADA, y el permiso de `.claude/settings.json` matchea el literal CON versión.** Sin pin, cada instalación fría ejecuta lo que el registro haya publicado desde la última corrida — el mismo ejecutable produce resultados distintos sin que nada del repo haya cambiado. Y el patrón del permiso es literal: fijar la versión **rompe** un patrón escrito sin ella (tras el nombre del paquete sigue una arroba, no un espacio), así que el pin y su entrada de permiso se mueven juntos o el comando pierde su exención. Referencia viva de los dos lados —el `spawnSync` pineado y su entrada de permiso— en [`fx-pdf-export`](../fx-pdf-export/SKILL.md).

**Cobertura real de las tres herramientas de calidad sobre `.claude/skills/*/scripts/*.mjs`** (verificada, no supuesta — un autor que la asuma al revés escribe sobre garantías que no tiene):

| Herramienta | ¿Cubre? | Por qué |
| --- | --- | --- |
| prettier | **No** | `.prettierignore` saca `.claude/` entero del formatter, sin re-inclusión para este subárbol. `prettier --file-info` sobre el archivo responde `ignored: true` — el formato queda a cargo del autor |
| tsc | **No** | El `include` de `tsconfig.json` enumera `**/*.ts`, `**/*.tsx` y `**/*.mts`; `.mjs` no entra al programa ni con `allowJs: true`. `tsc --listFilesOnly` no lo lista |
| eslint | **Sí** | `pnpm lint` es `eslint .` y `.claude/` no está en `globalIgnores` — es la única compuerta automática que el ejecutable tiene |

> 🔴 **El override de `no-console` de `eslint.config.mjs` es inerte — no es lo que deja pasar los `console.` del ejecutable.** La única aparición de `no-console` en el config raíz es la de ese propio bloque, `'no-console': 'off'`: nada la enciende antes, así que apaga una regla que la base nunca prende. Un ejecutable con decenas de llamadas a `console.` pasa `eslint` limpio sin que el override intervenga. Lo que se sigue de ahí para un autor nuevo: **no extiendas ese bloque para cubrir tu `scripts/`** — no haría nada. Recién si algún día la base enciende `no-console` habrá que agregar el patrón, y ahí sí importará que los actuales son relativos a la raíz del repo y no alcanzan `.claude/skills/*/scripts/`.

Como eslint es la única red, las restricciones que ninguna herramienta verifica (cero dependencias, `.mjs`, builtins `node:*`) se documentan en la cabecera del propio ejecutable, donde el siguiente lector las encuentra sin salir del archivo. Referencia viva del patrón: [`fx-pdf-export/scripts/build-pdf.mjs`](../fx-pdf-export/scripts/build-pdf.mjs).

### `pj-*` — dev-owned

El derivado decide. Mínimo: frontmatter + cuerpo útil. `skill:lint` no lo valida. No es responsabilidad del kit.

---

## §8 Disciplina ahistórica — el body refleja behavior ACTUAL

> 🔴 La historia (por qué cambió algo, cómo se llegó a una decisión, qué se hacía antes) **NUNCA** va en `SKILL.md`, `methodology*` ni `templates/`. Esos archivos son manual, no biografía. Una frase retrospectiva se lee como instrucción de behavior actual y confunde al ejecutor.

**Dónde SÍ va la historia:** en un `CHANGELOG.md` co-locado. Lo llevan los `tk-*` pesados **y las declarativas que son SSOT pesado del kit** (hoy `fx-execution-policy` y `fx-workflow-authoring` — donde la narrativa de evolución contaminaría un body que ejecuta): ahí el CHANGELOG **PUEDE** existir, y la doctrina de cuándo vive **aquí**. Ningún header de CHANGELOG legisla una scope rule propia — cada uno apunta a su SSOT: los de las declarativas a esta sección, los de los `tk-*` a `fx-workflow-authoring §11` (la autoridad de los workflows, que esta sección no absorbe). El resto de los declarativos (`kb-*` / `sk-*` / `pj-*` y las `fx-*` ligeras) **NO llevan CHANGELOG** → para ellos el body ahistórico no es preferencia, es la única opción: no hay otro lugar donde meter historia.

**Prohibido en el body / methodology / templates** (la lista literal de tokens, con ejemplos, vive en [`anti-patterns.md §3`](anti-patterns.md)):

```
❌ Tags de evolución o versión, narrativa de "qué se hacía antes", fechas de decisión, referencias a un release.
❌ Nombres de cliente o proyecto derivado del roster — rompe portabilidad.
✅ Solo el estado actual: "El skill hace X. Para Y, usa Z."
✅ Ejemplos genéricos: "una entidad de ejemplo", placeholders {{entity}}, nunca un cliente real.
```

Greps de cierre en [`anti-patterns.md §6`](anti-patterns.md) (corre antes de commit; deben salir vacíos sobre el body/methodology/templates, **no** sobre el CHANGELOG de un `tk-*`). El grep de nombres de cliente es **best-effort** (roster manual, desactualizable) — la garantía real es usar siempre placeholders genéricos (`{{entity}}`), no depender de que el grep tenga el roster completo.

---

## §9 Validate — antes de cerrar

1. **`pnpm skill:lint`** — debe salir con 0 errores. Checks P1 (errores): `cross-refs`, `packages`, `symbols`, `rule-contradictions`, `pair-cross-refs`, `specifiers`. Checks P2 (warnings, no bloquean pero atiéndelos): `anti-enumeration`, `staleness`.
2. **Greps ahistóricos** de `anti-patterns.md` → vacíos sobre body/methodology/templates.
3. **Test de routing** de §6 (3 prompts) → los 3 en dominio.
4. **`Read`** del skill recién creado — confirma que el shape de §7 está completo y los cross-refs resuelven.
5. **(Opcional, recomendado)** `fx-factory-reviewer` sobre el draft antes de canonizarlo (`Agent` con `subagent_type=fx-factory-reviewer`).

---

## §10 Linkear el skill nuevo

```
✅ Otros skills con cross-ref en su `description` o footer, si la relación es de routing (par kb↔sk, orchestrator).
✅ El par opuesto (si creaste kb-X y existe sk-X) — ancla mutua en ambas descriptions.
❌ project/reference/INVENTORY.md — es de COMPONENTES (autogen de src/), no de skills. No va.
❌ MEMORY.md — skills no son memorias.
ℹ️  No hay un índice manual de skills: el routing es por description. Mantén la description buena = el skill es "encontrable".
```

---

## §11 Boundary — cuándo NO usar este skill

| Si vas a autorar…                                  | Usa en su lugar…                                          |
| -------------------------------------------------- | --------------------------------------------------------- |
| Cualquier skill con fases / gates / orquestación / slash command (`tk-*`, o un `fx-*` procedural) | `fx-workflow-authoring` |
| Un agent `.claude/agents/*.md` standalone          | Otros agents + `CC.md §7` como referencia (no hay meta)   |
| Una rule `.claude/rules/*.md`                       | Cada rule es ad-hoc — no hay patrón replicable            |
| Un slash command thin sin skill detrás             | `fx-workflow-authoring §12` (wrapper rules)               |

---

## §12 Checklist de cierre (autoría declarativa)

- [ ] Prefijo correcto según §2 (anclado a CORE.md §1, no asumido) — y NO es un `tk-*` disfrazado
- [ ] Uniqueness check corrido (§4): no duplica; si había overlap → se extendió o se diferenció scope
- [ ] `description` EN-only single-line, trigger surface, con boundary + anchor al par si existe (§6)
- [ ] Test de routing (3 prompts) → los 3 en dominio (§6)
- [ ] Frontmatter de la familia correcto, `last-verified` a hoy (§5)
- [ ] Body sigue la anatomía de la familia desde `templates/` (§7)
- [ ] Body / methodology / templates **ahistóricos** y sin nombres de cliente (§8 — greps vacíos)
- [ ] `sk-*`: cita archivos reales; `@/` resuelven bajo `src/` (specifiers)
- [ ] `kb↔sk`: los 3 anchors (description `→` + body `Pair:` + footer `Cross-reference:`) en ambas mitades, y el par registrado en `pair-cross-refs.ts` `PAIRS` (§6)
- [ ] `pnpm skill:lint` → 0 errores (§9)

---

_TimeKast Factory — fx-skill-author (declarative skill authoring doctrine, factory-internal)_
