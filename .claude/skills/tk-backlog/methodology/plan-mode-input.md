# tk-backlog — Plan-Mode Input Contract

> Spec for the **orchestrator-direct plan parser** (Phase 0.5) that consumes a Plan Mode plan file and emits the structured input that `bkl-context-analyst` and Phase 3 epic composition need, plus the **design signal** (Phase 0.6) that runs between the parse and CP-split-proposal. Live behavior in [`../SKILL.md`](../SKILL.md) §6 Phase 0.5/0.6 and §10 Phase 3.

This file documents the contract; the parser itself runs in the orchestrator main loop (NOT inside `bkl-context-analyst`, see §C of the v6.3.0 plan and `fx-workflow-authoring §8`).

---

## When the parser runs

`/backlog add <plan-file>` and `/backlog extend-epic EPIC-NN <plan-file>`. Both consume the same plan shape. The parser runs in Phase 0.5 (between Phase 0 mode dispatch and Phase 1 registry build), writing its output to `project/backlog-artifacts/{run-id}/parsed-plan.md` for `bkl-context-analyst` to read.

For `nuevo` / `extend` / `validar` the parser does NOT run — those modes consume discovery+design instead.

---

## Required plan content (NOT magic heading names)

The orchestrator reads the plan's **actual structure** — it does NOT require sections named exactly `## Approach` or `## Files to modify`. A plan written with `## Workstream A/B`, `## Critical files`, numbered findings, etc. parses fine.

Only **two** things are hard-required (STOP if absent — they cannot be invented without hallucination):

| Required content                                            | Where it can live                                                       | Why hard-required                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **≥1 file enumerated to modify** (anywhere in the plan)     | central `## Critical files` / `## Files` list, or per-unit `Files:` list | No files → nothing to diff-own → empty `§6 Contexto Técnico` (breaks `/implement`) |
| **A verification / tests section** (recognizable, any name) | `## Verification` / `## Test plan` / `## Tests` / per-unit verification  | Gherkin (issue-shape §4) derives from it; synthesizing it hallucinates scenarios   |

Everything else is read **by content, not by heading name**:

| Plan content (any heading)                            | Maps to                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Narrative context (`## Context` / `## Background` / …) | Epic Objetivo + per-issue `§1 Objetivo` source (RF3 — by content)         |
| Work units (findings / `## Workstream X` / `### ` …)   | Issue detection + classification (§Unit detection)                        |
| File lists, inline `Files:` or `## Critical files`     | Per-issue file attribution + diff-ownership (§File attribution)           |
| Verification bullets                                   | `§3` AC + `§4` Gherkin source                                             |

The parser is **tolerant of additional sections** (`## Risks`, `## Out of scope`, …) — stored in `extras`, surfaced in registry caveats, not required.

---

## Parser contract (orchestrator-direct, decomposition FROZEN here — RF1)

The orchestrator's main loop reads the plan, **detects + classifies + attributes** (the three steps below), and **freezes** the decomposition into `parsed-plan.md`. No agent involved. **All downstream phases read the frozen artifact — none re-decides the split.** Shape:

```ts
parsePlan(filepath: string): {
  context: string;          // narrative context body (by content, any heading)
  issues: PlanIssue[];      // the FROZEN decomposition — decided ONCE here (RF1)
  verification: VerificationBullet[];
  extras: Record<string, string>;  // non-required sections, keyed by heading
  hash: string;             // SHA-256 of full file content — drift detection (validar)
  filename_slug: string;    // derived from filename (see §Epic slug derivation)
}

type PlanIssue = {
  title: string;            // from the unit's heading / numbered item
  body: string;             // the unit's prose — source for §1 Objetivo + §6 Edge Cases (RF3, by content)
  files: string[];          // attributed modify-targets (§File attribution — list-based only, NOT prose citations)
  refuted_by?: string;      // the producer's `Refutado: <query>` line, verbatim (§RF-prev) — absent when the item has no line; absence is NEVER read as "already refuted"
};

type VerificationBullet = {
  text: string;
  cross_issue: boolean;     // true when it references files/concerns of ≥2 issues → e2e-flow (RF2-a/N3)
  issues: string[];         // the issue titles the bullet spans (by CONTENT, not location)
};
```

**Hash & `validar`:** SHA-256 of the full file bytes, stored in the issue blockquote `> **Plan source:** <path>#<section-anchor> (hash: abc1234)`. `validar` **never re-parses** — it re-hashes the plan file and compares against the stored hash; mismatch → `CHANGED`. The split is not re-derived (RF1: the frozen decomposition is authoritative for the run). A content change to the plan is the only drift signal **for the plan file**; decomposition drift (a user re-split at CP-split-proposal or CP1) is caught by the separate `Decomposition hash:` — see §Decomposition hash.

---

## Authoring de verification bullets

> **SSOT de autoría.** Aplica a quien **escribe** los bullets que el `type VerificationBullet` de arriba tipa: el productor de un plan de remediación ([`../templates/REMEDIATION-PLAN.template.md`](../templates/REMEDIATION-PLAN.template.md)) y, aguas abajo, [`bkl-issue-specer`](../../../agents/bkl-issue-specer.md) cuando deriva los criterios de aceptación de un issue a partir de ellos. Los dos **apuntan aquí**; ninguno reproduce la regla.

🔴 **Un criterio que se verifica con una búsqueda se redacta con vocabulario INDEPENDIENTE del cambio que verifica.** Redactado sólo con los tokens del diff, hereda sus puntos ciegos: verifica que el autor cambió lo que ya sabía que había cambiado, y no puede ver lo que se le pasó — que es justo lo que un criterio de verificación existe para encontrar.

**Los 3 componentes, obligatorios los tres:**

1. **El patrón incluye variantes de grafía y sinónimos del concepto.** Variantes: guion / underscore / espacio, singular y plural, mayúsculas y minúsculas (`-i`). Sinónimos: los términos con los que **otras sedes** nombran lo mismo — la sede doctrinal que describe el mecanismo rara vez usa el identificador del código. Se enumeran **variante por variante, literalmente**; condensar la lista a "y sus variantes" pierde justo la que faltaba.
2. **El criterio afirma el COMPORTAMIENTO prohibido o esperado, con una regla operativa de clasificación de hits** — qué hit pasa y por qué. Nunca un conteo desnudo (*"cero referencias a X"*): un conteo no distingue el residuo real de la mención legítima, así que o falla con hits inocentes o se cierra a ojo. La clasificación se declara **al redactar el criterio**, no al ejecutarlo, con una razón de una línea por hit al verificar.
3. **Declara su límite honesto** — qué clase de residuo el patrón **no puede ver** por construcción (el caso típico: una sede que describe el concepto sin nombrarlo con ninguno de los términos). Se enuncia junto al criterio para que el cierre **no lo reporte como demostrado**: lo que la búsqueda no alcanza lo cubre la lectura de las sedes enumeradas, y eso se dice, no se asume.

**Dueño del residuo — cuando un bullet re-verifica el barrido de otro ítem.** En una cadena de ítems que comparten archivos, el último suele re-correr el barrido del primero sobre el estado final del árbol. Ese bullet **es dueño del residuo que detecte**: se corrige en el ítem que lo re-verifica, nunca en el que ya cerró. Sin esa atribución escrita el defecto queda huérfano — quien lo habría arreglado ya cerró, y quien lo encontró puede declarar que no es suyo.

> **Qué falla cuando la regla no se aplica — los tres puntos ciegos que hereda un patrón derivado del diff.** (1) La **grafía alterna** del término: el patrón ve la forma que el autor tocó y deja colgando las demás. (2) La **sede doctrinal** que nombra el mismo concepto con otras palabras, y que puede reconstruir por escrito lo que el cambio acaba de retirar — invisible a todo patrón armado con los tokens del código. (3) La **condensación al citar el artefacto**: un resumen que pierde una variante de grafía vuelve invisibles al criterio derivado justo las sedes que sólo esa variante alcanzaba — de ahí el *variante por variante* del componente 1. En los tres casos el criterio pasa en verde sin haber mirado el residuo.

---

## Decomposition — 3 steps (detect → classify → attribute)

> There is **no** directory grouping. The author already decomposed the work; the orchestrator honors that decomposition (the same way greenfield epic composition is orchestrator-direct, SKILL §12). The split is frozen into `parsed-plan.md` here (RF1).

> 🔴 **What RF1 means, stated exactly (it used to be ambiguous):** **no phase re-splits on its own** — Phase 1, 3, 4, 5, 6 and 7 all read the frozen decomposition and never re-derive it. The **two checkpoints where the user explicitly re-splits** (CP-split-proposal option 2, CP1 option 2) are the declared exception, and they **re-freeze**: they re-emit `parsed-plan.md` rather than mutating it in place. This is the same pattern [`readiness-gates.md`](readiness-gates.md) §Invalidation already applies when the plan file itself is edited (recompute `split_discretion` → re-freeze); this adds a second trigger, not a new mechanism.

### Decomposition hash — the re-freeze is computable, not a judgment

`parsed-plan.md` carries a **`> **Decomposition hash:**`** field in its blockquote header (**not** YAML frontmatter — see [`examples/sample-plan.expected-parsed-plan.md`](examples/sample-plan.expected-parsed-plan.md), the parser's calibration reference), computed in Phase 0.5 alongside `Split discretion:`:

```
SHA-256 over the ordered set { units[].title, units[].files[] }
```

🔴 **The name carries the qualifier on purpose:** that header already has a `> **Hash:**` — the hash of the **plan file**, which feeds `validar` drift detection and which a re-split does **not** move. Two undistinguished hashes would collide with the `Plan hash` that travels into the issues.

**Who reads it:** the Phase 3.5 adversarial panel (SKILL §12.5) uses it as its re-entry trigger. Hash changed → the panel re-runs; hash unchanged → CP1 re-presents without re-review (a change of ordering, of epic grouping, or of wording moves nothing the panel judged). Arithmetic, not judgment — two evaluations over the same decomposition decide the same.

**What the re-freeze recomposes — re-hashing alone is not enough:**

| Frozen datum | On re-split |
| --- | --- |
| `Decomposition hash:` · `Split discretion:` | recompute |
| `Risk budget:` | **recompute — y sólo puede SUBIR.** Un re-split cambia la agrupación, pero puede **ampliar la unión de archivos atribuidos** (una unidad partida gana paths que antes no reclamaba, y una fusión los conserva). Se re-agrega el riesgo sobre la unión nueva y se conserva `max(previo, nuevo)`: el presupuesto de un run nunca baja a media corrida, ni siquiera cuando la unión se achica — un tier que pudiera bajar dejaría el panel ya corrido en un nivel que la corrida ya no declara |
| `scr_matches` | 🔴 **re-propagate** — it is frozen *per issue* (§Phase 0.6), keyed to a unit the split may have destroyed, and the Phase 7.6 sweep STOPs when the manifest carries it and the issue has no `Refs (design)`. Re-run the Phase 0.6 route matching over the new units (orchestrator-direct, cheap) |
| `ui_touching` · design-signal note | **no action** — both read the **union** of attributed files, which a split/merge preserves |

**`validar` and decomposition drift.** `validar` never re-parses (below), so a backlog whose decomposition no longer derives from the plan would report `UNCHANGED` forever — harmless while re-splitting at CP1 was rare, but the Phase 3.5 convergent gate makes it a main path (the cycle actively pushes the user to adjust).

🔴 **The durable home is `COVERAGE-MATRIX.md`, not the manifest.** The manifest lives in `backlog-artifacts/{run-id}/` and Phase 8 **deletes it** (`SKILL.md §20`), while `validar` runs in a *later* run — a hash stamped only there is gone before anyone can compare it. That is why the plan-file hash works today: it rides in each issue's `> **Plan source:** … (hash: …)` blockquote, which is durable. So Phase 8 writes `Decomposition hash:` into `COVERAGE-MATRIX.md` alongside the plan-hash it already stores (`SKILL.md §15`), and `validar` compares **both**. Keeping the field in the manifest as well is fine — that copy is the intra-run audit trail, not the drift signal.

### Step 1 — Unit detection (deterministic when the plan has structure)

Detect the work units by visible structure, in this order (a unit = a candidate issue):

- (a) numbered findings / items (`1.`, `### 2.`, `### RED FLAG 3`)
- (b) `### ` sub-headings under a work section
- (c) `## Workstream X` / top-level work sections
- (d) list items under a section named like "Issues / Findings / Changes / Work items"

Same structured plan → same detected units (reproducible). **Flat prose (no visible structure)** → group by cohesive concern with judgment (size guardrail SKILL §23) — the only non-deterministic case; it surfaces at CP-split-proposal.

> **Shared with `/design add` (back-pointer, C5).** This Step 1 unit-detection mechanic is the SSOT shared with the `tk-design` day-2 parser — `.claude/skills/tk-design/methodology/day2-plan-input.md §Step 1` cites it by cross-ref rather than duplicating. Step 2 (classification) and Step 3 (attribution) diverge by design: backlog classifies `issue` / `prose-non-issue` and attributes to **files**; design classifies `ui-unit` / `non-ui-unit` / `prose` and attributes to **screens by route**. If this step changes, keep the design cross-ref valid.

> **Second external producer: `/implement` remediation plans (back-pointer, C5).** `tk-implement` Phase 5.2 writes machine-consumable plans that land here — `templates/REMEDIATION-PLAN.template.md` (this skill) encodes the requirements as authoring rules so the emitted file is consumable **without manual editing**. Two constraints it depends on, both of which would fail SILENTLY if they changed unannounced:
>
> 1. **§Step 2 is first-match-wins and the process-heading row is first.** The template therefore mandates imperative-verb headings per item (never the bucket name, never the question form) — a heading that reads as *Decisiones · Riesgos · Fuera de alcance · Verificación* is dropped **before** its `Files:` list is ever read.
> 2. **The two hard-requirements** (≥1 file in a LIST · a verification section) are per-item in that template, and it declares that an item with no derivable file must not reach the plan at all — one would STOP the whole run.
>
> **If §Step 2's skip-list or the hard-requirements change, update that template too.** Its failure mode is not an error: it is a silently discarded item, in the one workflow whose purpose is that pending work stops getting lost.

### Refutación previa del productor — campo opcional `Refutado:` (RF-prev)

Cuando el plan lo escribe `/implement` Phase 5.2, **parte** de sus ítems ya pasaron por la refutación de deuda de `tk-implement §4.7.2.1` (*¿Existe? ¿Es nuevo? ¿Importa? ¿Qué prioridad?*). Ese trabajo se pierde en la frontera entre workflows salvo que viaje en el archivo: `/backlog` corre en otra sesión y **lo único que recibe es el plan**.

🔴 **"Parte", no "todos" — y el parser no puede distinguirlo solo.** Esa refutación corre sobre la deuda que salió **fuera** de la frontera del epic; la de **dentro** (la que necesita decisión) no pasa por ella. Por eso el marcador es **por ítem** y no por archivo ni por procedencia: un plan de `/implement` puede traer unos ítems con la línea y otros sin ella, y eso es correcto, no una inconsistencia. `tk-implement §5.2` prohíbe explícitamente estamparla en el plan del propio epic.

- **Autoría (`templates/REMEDIATION-PLAN.template.md`):** un ítem puede llevar una línea `Refutado: <la consulta que corrió>` — misma clase de evidencia cerrada de [`fx-execution-policy §7`](../../fx-execution-policy/SKILL.md). La escribe **el productor al emitir** (el plan es inmutable después: su hash alimenta `validar`).
- **Parser:** la línea se adjunta a la unidad como `refuted_by` y viaja congelada a `parsed-plan.md`, igual que `files` o `scr_matches`. El canal vive en las DOS representaciones del contrato: el campo `refuted_by?` de `type PlanIssue` (§Parser contract) y la línea `- refuted_by:` bajo el issue en el bloque de §Output.
- **Consumidor:** el panel de Phase 3.5 la recibe en su prompt para **no re-preguntar *¿existe?*** sobre esos ítems y concentrarse en descomposición, orden y piezas faltantes (`SKILL.md §12.5`).
- **Canal hermano — la verificación del propio run:** el grounding de Phase 3.4 (`grounding-auditor`, `SKILL.md §12.4`) viaja por esta misma vía — su bloque se agrega a `parsed-plan.md` (§Output). Coexisten sin competir: `Refutado:` transporta lo que el **productor** verificó al emitir; el grounding, lo que el **run** verificó al entrar. El panel consume los dos igual.
- 🔴 **Opcional y degrada seguro:** un plan sin la línea —escrito a mano, o por una versión previa de `/implement`— hace que el panel pregunte **todo**. La ausencia nunca se lee como "ya refutado"; es el default correcto, no un caso de error.

> **Por qué un campo y no una bandera de "plan ya refutado":** el campo transporta **qué** se refutó y **con qué consulta**, verificable ítem por ítem; una bandera dejaría que el productor decidiera el alcance de la revisión del consumidor. La decisión y su razón viven en el `CHANGELOG.md`.

### Step 2 — Unit classification (ENUMERATED rules, first match top-to-bottom — N5)

🔴 **Structure does NOT imply issue** (4 `## Workstream` can be 2 issues + 2 process sections — e.g. distribution plan → PUB-001/PUB-002, not 4). Classify each detected unit by table so it's reproducible headless:

| Signal (first match wins) | Classification |
| --- | --- |
| **explicit issue marker** — the unit carries a literal `Issue: sí` / `Issue: yes` line | **issue** (skip the semantic pass entirely) |
| **process heading** — semantic ES/EN match: Context/Contexto · Background/Antecedentes · Sequencing/Secuencia · Rollout · Risks/Riesgos · Verification/Verificación · Out of scope/Fuera de alcance · Critical files/Archivos críticos · Decisions/Decisiones | **prose-non-issue** (skip) |
| resolves **≥1 file** (§File attribution) and describes a change | **issue** |
| borderline with ≥1 file | **fail-closed → issue** (better an issue the human closes than lost work) |
| **0 files but describes an implementable change** (not a process heading) | **STOP / surface** — NEVER silent skip (interactive: CP-split catches it; headless: STOP avoids losing work) |

Classification is **rule-based**, not open judgment → reproducible for structured plans. The residual borderline is **fail-closed (counts as issue)** — never a silent drop.

> **Why the explicit marker sits FIRST.** The semantic pass is a heuristic over how a heading is *phrased*, and phrasing is exactly what a machine producer cannot always control: an item legitimately titled *"Definir si el borrado es lógico o definitivo"* or *"Riesgo de race condition en el filtro"* reads as Decisiones / Riesgos and gets dropped **before** its `Files:` list is ever read — first-match-wins, so carrying files does not rescue it. For a **human-written** plan that is the right default (structure does not imply issue). For a **machine-written** one it is a silent data loss, and the producer knows perfectly well that the unit is an issue.
>
> The marker is **opt-in and additive**: a plan without it classifies exactly as before, so nothing that works today changes. It is meant for producers that emit plans programmatically —`tk-implement` remediation plans are the first— and it is deliberately a positive assertion: no marker can ever turn an issue INTO prose, only the reverse. A human who writes it by hand is making the same assertion on purpose.

### Step 3 — File attribution (two forms, list-based only)

Files of each issue come from **lists**, never from arbitrary prose mentions:

1. **Inline file list in the unit body** (a `Files:` line or a bullet list of paths inside the unit) → that unit.
2. **Central `## Critical files`** (or equivalent) with **per-unit/concern annotation** — `cli/package.json — publish config (A)` · `plan-mode-input.md — … (B), (A), RF1` → attribute each path to the unit(s) its annotation names. A path with multiple annotations → **many-to-many** (the input to §Shared-file sequencing).

🔴 **Only files enumerated in a LIST count as modify-targets.** Inline prose mentions / citations (`foo.ts:82`, `(SKILL §15)`, "see `bar.ts` for the pattern") are **read references, NOT targets** — never attributed (else a `## Pre-checks` section or a citation would spawn a phantom issue — G3).

A 1-line intent annotation per path becomes the first descriptor line of the issue's `§6 Contexto Técnico`.

---

## Resolución del presupuesto por riesgo (Phase 0.5, plan-mode)

> Contrato de la resolución que `SKILL.md §7` cita como sub-paso de Phase 0.5. La **tabla de tiers** —qué panel compra cada nivel— vive en [`../SKILL.md`](../SKILL.md) §24 y **no se reproduce aquí**: esta sección especifica cómo se obtiene el número, no qué compra.

**Cuándo:** después de congelar la descomposición, antes de CP-split-proposal. Sólo en `add <plan>` / `extend-epic`; en `nuevo` / `extend` / `validar` no hay plan que enumere superficie y el panel es el exento-fijo declarado en §24.

**Insumo — la enumeración CRUDA de archivos atribuidos, sólo paths.** La unión de `units[].files[]` del artefacto congelado, tal cual, sin filtro ni juicio sobre intención. Mecanismo prestado de [`tk-implement §2.2`](../../tk-implement/SKILL.md), que resuelve su riesgo plan-time sobre la enumeración cruda del bullet `Files to create/modify` por la razón que ahí quedó escrita: **el sesgo conservador protege la autorización y es la dirección insegura para revisar** — un path mencionado con reservas no debe producir un presupuesto menor. Aquí no se autoriza nada: sólo se compra escrutinio, así que la enumeración entra completa.

**Agregación:** la de [`fx-execution-policy §4.1`](../../fx-execution-policy/SKILL.md) sobre el registry del kit ∪ el override del proyecto, renglón `risk = máximo`. **La fórmula no se transcribe** — una copia queda muda el día que esa sección gane un renglón. El renglón `require` **no se consume**, y la razón de esa exención vive en [`../SKILL.md`](../SKILL.md) §16.

**Salida — el tier resuelto se CONGELA con su origen** en el header de `parsed-plan.md` (§Output), junto a `Split discretion:` y `Decomposition hash:`. 🔴 **Necesita esa ranura durable porque el valor cruza turnos:** se computa en el turno 1, puede subir en el turno 2 (`meta-foundation`), se consume en el turno 2 (§12.5) y se narra en los turnos 3 y 6 (CP1 y CP2). Sin sede, cada consumidor lo re-derivaría —o lo perdería— entre turnos. El espejo intra-run vive en el manifest ([`../templates/ISSUE-MANIFEST.template.md`](../templates/ISSUE-MANIFEST.template.md) §Risk budget), de donde CP1/CP2 lo narran, y el espejo **durable** en la sección `## Plan Review` del epic file ([`epic-shape.md`](epic-shape.md) §Plan Review append), que es lo único que sobrevive al cleanup de Phase 8.

**Casos de fallo — ninguno compra el mínimo (fail-toward-scrutiny):**

| Caso                                                        | Resolución                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Registry del kit ausente o no parseable                     | **tier completo**, con la causa narrada en CP1. **No aborta**                |
| Override del proyecto presente pero ilegible                | **tier completo** + warning nombrando el archivo                            |
| Bullet / lista de archivos de una unidad no parseable       | **tier completo** — sin datos, presupuesto máximo                           |
| Override ausente                                            | caso **normal**, sin mensaje: el piso del kit aplica solo                   |

> 🔴 **«Tier completo» tiene valor numérico: es la fila `riesgo ≥3` de [`../SKILL.md`](../SKILL.md) §24, nunca la fila `greenfield`.** Esa última es un modo sin plan, y adoptarla aquí convocaría lentes sin objeto en plan-mode. Los tres casos de fallo registran, con la forma del [`../templates/ISSUE-MANIFEST.template.md`](../templates/ISSUE-MANIFEST.template.md) §Risk budget: `risk_resolved: 3` · `risk_origin: fallback — {la causa}` · `origin_scope: —` (ninguna regla del registry fijó el máximo) · `resolution: fallback-completo` + `fallback_reason`. Con un entero, el upgrade de `meta-foundation` (*sólo sube*) y el re-freeze `max(previo, nuevo)` comparan como en cualquier otra corrida; con «máximo» en prosa, no habría contra qué comparar.

> 🔴 **Por qué aquí el fallback NO aborta, a diferencia de [`tk-implement §4.6`](../../tk-implement/SKILL.md).** Allá el registry **autoriza acciones** —qué paths sensibles quedan pre-aprobados—, así que un registry ilegible tiene que parar: autorizar a ciegas es la dirección insegura. Aquí el registry sólo decide **cuánto escrutinio se compra**, y el fallback compra el máximo. Un run con el panel completo es estrictamente seguro; abortarlo sería castigar al usuario por un archivo del kit que él no rompió. La asimetría es deliberada y se declara para que nadie la "corrija" por simetría.

**Upgrade en Phase 3 — `meta-foundation`, y sólo hacia arriba.** El grafo `depends_on` no existe todavía en Phase 0.5, así que esa señal plan-time se evalúa en Phase 3 con el grafo global ya computado, y **re-congela** el campo antes del spawn de §12.5. El umbral es el que declara [`fx-execution-policy §6`](../../fx-execution-policy/SKILL.md) (**3 o más** dependientes) — se cita, no se recopia. 🔴 **El universo del grafo son los issues que ESTE run emite, más los preexistentes del epic destino en `extend-epic`.** Contando sólo los nuevos, un plan de tres unidades no alcanzaría nunca el umbral; incluir el epic destino es la dirección que agrega escrutinio, coherente con el fail-toward-scrutiny del resto de la fase. `no-adr` está declarada pero **no es computable** (el campo ADR no existe en el shape de issue del kit) y no participa. 🔴 **La señal sólo sube el tier; nunca lo baja** — un presupuesto que pudiera bajar a mitad del run haría que el orden de evaluación cambiara el resultado.

**Narración obligatoria.** El tier resuelto viaja al usuario en CP1 y en el resumen de CP2 con formato por-regla-con-origen, y **en lenguaje plano** (`CC.md §3`): las dos composiciones se nombran por lo que revisan, nunca por su número de sección ni de fase.

```
Presupuesto: riesgo {N} por {regla o señal} ({kit|proyecto}) → revisión del plan: {panel} · validación de los issues escritos: {panel}
```

Con `resolution: fallback-completo` no hay regla que nombrar y la línea nombra **la causa** en su lugar: `Presupuesto: riesgo 3 por falta de datos ({la causa}) → revisión del plan: {panel} · validación de los issues escritos: {panel}`.

Un recorte no narrado es indistinguible de un olvido ([`fx-workflow-authoring §8`](../../fx-workflow-authoring/SKILL.md)). 🔴 **La forma plana rige el canal al usuario, no el durable:** el campo `Presupuesto:` de la sección `## Plan Review` del epic file conserva los IDs de sección y fase, porque su lector es `/implement` ([`epic-shape.md`](epic-shape.md) §Plan Review append).

---

## Epic composition heuristic (orchestrator-direct)

Deterministic precedence (NO ambiguity — see plan §C):

1. **1 plan = 1 epic** (default).
2. **Explicit author intent:** plan has top-level `## Epic: <name>` headings → 1 heading = 1 epic.
3. Otherwise → 1 epic (no auto-split by "different domains" — too ambiguous).

The previous heuristic "≥3 stages with distinct domains" was removed in v6.3.0 (review M-06: "distinct domain" was undefined).

---

## Issue split inside the epic

From the frozen decomposition:

1. **1 classified issue-unit = 1 issue** (from §Decomposition; NOT "1 file group = 1 issue").
2. **+1 `e2e-flow` integration issue** when a verification bullet is `cross_issue` — it references files/concerns of ≥2 issue-units. Attribution is **by content** (what the bullet spans), **not by where it's written** — an integration test written inside the finding that motivates it still triggers the e2e (RF2-a/N3).
3. **Issue ordering & parallelism** come from the shared-file graph (§Shared-file sequencing), NOT from "sequential by default".

Each issue's blockquote header carries `> **Source tier:** plan-mode` so downstream `/implement` can adjust its validation.

## Shared-file sequencing (many-to-many → connected components)

A file may belong to several issues (the per-finding shape). That overlap is **allowed** and drives ordering, not an error:

- Build a graph: two issues share an edge iff they have ≥1 file in common.
- **Each connected component → one `sequential_chain`** (handles the transitive case A∩B, B∩C, A∩C=∅ → all three in one chain).
- **Order within a chain = ascending issue NNN (= plan order)** → satisfies the sweep invariant "no issue depends on a higher NNN".
- Issues with **no** file overlap → `parallelizable_issues`.
- A `sequential_chain` may be **non-contiguous** in NNN (e.g. `[1,5]` while `[2,3,4]` are parallelizable) — valid, the sweep must NOT "fix" the gap (see numbering-and-topology §Parallelism marking, nota N4).

Safe because within an epic `/implement` already runs issues serial (imp-issue-executor); `parallelizable` only protects a future `/implement-epic` fan-out.

---

## Epic slug derivation (NEW M-04 fix)

- **Descriptive filename** (anything except the non-descriptive list below) → use filename slug directly. Example: `add-export.md` → `EPIC-NN-add-export`.
- **Non-descriptive filename** (matches regex `^(plan|temp|wip|draft|untitled|notes|scratch)(-\d+)?\.md$`) → AskUserQuestion inline for a slug. Without this, a headless run hangs on legitimate filenames.
- **`## Epic: <name>` heading present** → use that as authoritative slug (Epic 2 of the composition heuristic above).

---

## ui_touching detection (plan-mode)

En greenfield el flag `ui_touching: yes` viene de las SCRs del design. En plan-mode no hay SCRs — Phase 3 infiere de la **unión de los archivos de todos los issues derivados** (RF2-c; ya NO "paths del grupo"):

| File-path pattern matches                           | `ui_touching` |
| --------------------------------------------------- | ------------- |
| `src/components/**/*.{tsx,jsx}` (excl `__tests__/`) | yes           |
| `src/app/(protected)/**`                            | yes           |
| `src/app/(public)/**/page.tsx`                      | yes           |
| `.claude/skills/*/ui*`                              | yes           |
| Cualquier otro path                                 | no (default)  |

Si cualquier issue del epic matchea → epic `ui_touching: yes` → Phase 3 pre-asigna un `ui-critic` issue como tail del epic.

### Regla simple para `extend-epic` (counter monotónico)

Si `extend-epic <plan>` agrega ≥1 file UI al epic existente, Phase 3 emite **1 nuevo `ui-critic` issue al tail del epic** con counter monotónico:

```
{DOMAIN}-{NNN}-ui-critic         ← primer ui-critic del epic (sea greenfield o extend-epic sobre epic sin previos)
{DOMAIN}-{NNN}-ui-critic-2       ← segundo (extend-epic agregando UI sobre epic que ya tenía ui-critic)
{DOMAIN}-{NNN}-ui-critic-3       ← tercero
...
```

**Algoritmo (Phase 3 inline, sin lógica de inspección de status):**

1. Lista issues del epic con slug que matchea `^ui-critic-{epic-slug}(-\d+)?$` — la forma que el paso 3 construye. (El patrón anterior, `^ui-critic(-\d+)?$`, nunca matcheaba un slug real porque el epic-slug va pegado: `max` siempre daba `0` y el segundo `extend-epic` con UI colisionaba con el archivo del primero.)
2. Encuentra el max counter (el primer sin suffix = `1`; los demás con suffix `-N` = `N`).
3. Si `max == 0` (cero ui-critic previos) → slug = `ui-critic-{epic-slug}`.
4. Si `max >= 1` → slug = `ui-critic-{epic-slug}-{max + 1}`.

Sin fechas en slugs (mantiene la convención canónica `{DOMAIN}-{NNN}-{kebab-slug}`). Sin colisión por doble `extend-epic` mismo día (el counter incrementa). El uso de `max + 1` (no `count + 1`) tolera gaps por renames manuales del user — siempre apunta al siguiente disponible.

**Trade-off cuantificado:** si hay un `ui-critic` original `📋 Backlog` o `🚧 In Progress` y se hace `extend-epic` agregando UI, el epic termina con **2 issues `ui-critic` pendientes**. Cuando `/implement` los corra (Phase 3 SERIAL), cada uno gana 1 spawn de `imp-issue-executor` completo → **~5-10 min extra + costo de API equivalente a 1 issue normal**. NO es marginal — es un issue ejecutable adicional.

**Mitigación opcional del user:** si el ui-critic original cubre conceptualmente los nuevos files (no son scope distinto), el user puede cerrar manualmente el ui-critic `-2` como `❌ Won't Do` con justificación en su §Implementation Evidence. Esto requiere decisión del user — el workflow NO infiere automáticamente porque no puede saber el scope conceptual sin leer ambos issues.

**Alternativa NO adoptada** (defer a PR futuro si emerge real pain): editar el issue file del ui-critic pendiente para append los nuevos paths a su `## Files to review`. Requiere lógica de edit del issue file existente (el agent `bkl-issue-specer` no lo hace hoy). El trade-off actual (counter monotónico + 2 issues) es más simple.

### DoR test-gate per-issue (el motor de gates del DoR)

Corre igual en plan-mode (detection por scope `src/components/**` en **los archivos atribuidos a cada issue**, no en una sección global). Sin otros cambios.

### Epic-level test cohesion

La regla `cross_issue` (un verification bullet que cruza ≥2 issues → +1 `e2e-flow` issue, atribuido por contenido — RF2-a/N3) cubre integration tests; sin nuevo checkpoint.

---

## Phase 0.6 — Design signal (plan-mode only)

> Runs between Phase 0.5 (plan parse) and CP-split-proposal, in `add <plan>` and `extend-epic EPIC-NN <plan>` only (skipped in `nuevo` / `extend` / `validar`). Orchestrator-direct — operates over the frozen `parsed-plan.md` from Phase 0.5; it reads `16_DESIGN/SCR-*.md` to match screens, but never re-derives the split. Record mechanics (narration, granularity, the `gate_decisions` entry) live in [`readiness-gates.md`](readiness-gates.md) §Phase 0.6 — Design signal; this section is the **detection + matching + manifest-field** spec.

The pipeline that turns a Plan Mode plan into backlog issues enters the pipeline AT backlog, **skipping `/design`**. So a day-2 plan that introduces new UI arrives with no SCR (screen/pantalla design contract) — the issues would emit with no design ref and nothing said about it. Phase 0.6 answers two questions over the plan: whether it is design-significant, and whether a covering SCR already exists. No covering SCR → the fact is **recorded and narrated** (never a block). A covering SCR → fill `Refs (design)` from the match.

### Detection — Step 1: ¿design-significant?

Over the **union of all attributed files of all plan-derived issues** (the same input as `ui_touching` detection, frozen in `parsed-plan.md`), classify whether the plan introduces a design-significant screen. **Fires** vs **does NOT fire** are enumerated rules (reproducible headless):

| Signal (first match wins)                                                                                           | Design-significant? |
| ------------------------------------------------------------------------------------------------------------------- | :-----------------: |
| New page file under `src/app/(public)/**/page.tsx` or `src/app/(protected)/**/page.tsx` (path not on disk pre-run)  |    **yes — siempre** |
| Existing page/screen with a **structural change described** in the unit body (layout reshape, new view, route added) |       **yes**       |
| Borderline (a `page.tsx` exists but the structural change is described vaguely)                                      | **yes — fail-toward-signal** |
| Component-only change: `src/components/**` con NO page nueva                                                         |         no          |
| Backend / data: `src/lib/**`, `src/app/api/**`                                                                      |         no          |
| Tests (`tests/**`, `__tests__/`), copy tweaks, a single field added to an existing form                              |         no          |
| Any other path                                                                                                      |     no (default)    |

The principle is **fail-toward-signal on borderline**: the rules document what does NOT fire (the exclusion list above), not an exhaustive list of what does. When in doubt the detection fires — the cost of a note nobody needed is one line; the cost of UI entering the backlog with nothing said about it is a screen whose absence of spec surfaces only when someone looks at it rendered.

#### Divergencia declarada vs `ui_touching`

Phase 0.6 detection and the `ui_touching` table (§ui_touching detection) read the **same file paths** but answer **different questions** — they intentionally diverge and must coexist:

| Aspect          | `ui_touching` (§ui_touching detection)                          | Phase 0.6 design signal (here)                                     |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Question        | ¿el epic toca UI? → ¿pre-asignar `ui-critic` issue?             | ¿el plan introduce UI **estructuralmente nueva sin SCR**?          |
| `src/components/**` sin page nueva | **yes** (un component cambia → ui-critic vale)   | **no** (component-only no es pantalla nueva — sin señal)          |
| New page under `src/app/(protected)/**` | yes                                       | yes                                                                |
| Purpose         | Visual review of rendered UI at `/implement` time               | Name the missing design spec (SCR) at emission time                |

🔴 **Do NOT collapse the two.** `ui_touching` deliberately includes component-only (a component change still warrants a `ui-critic` pass); the design signal deliberately excludes it (changing an existing component is not a new screen needing a fresh SCR). Same paths, opposite answer on the component-only case — by design.

### Detection — Step 2: ¿sin spec? (SCR matching)

For each design-significant screen from Step 1, look for a covering SCR in `16_DESIGN/SCR-*.md`:

1. **By route** (primary) — read each SCR's frontmatter `route` field; match against the screen's route, derived from the new `page.tsx` path (`src/app/(protected)/dashboard/page.tsx` → `/protected/dashboard`, route-group parens stripped). Exact route match → covered.
2. **By slug** (fallback, only when no `route` frontmatter) — match the screen's path slug (`dashboard`) against the SCR filename slug (`SCR-012-dashboard.md` → `dashboard`).

- **Match found** → record `scr_matches: [SCR-XXX]` for the affected issue(s) in `parsed-plan.md` (frozen). This propagates to the manifest `screens:` field and then to `Refs (design)` (see §Refs propagation).
- **No match** → the screen enters the signal (Step 1 said design-significant, Step 2 found no SCR).

🔴 **Limitación documentada — existencia, no frescura.** The match verifies that an SCR **with the route exists**, not that the SCR is **up to date** with the plan. An SCR that predates a structural change in the plan still counts as covered. Reconciling SCR freshness vs plan is out of scope here (future `validar` day-2). The match is an existence check.

### Signal outcome → `gate_decisions` (same DoR gate list, `type: design-spec`)

When ≥1 screen has no covering SCR, the signal is recorded **once per run** (one entry listing all of them — §readiness-gates.md):

```yaml
gate_decisions:
  - { type: design-spec, screens: [dashboard, settings], decision: recorded, justification: '<auto-texto determinista>' }
```

- The `justification` is **deterministic auto-text**, not user input, and Phase 4 stamps it into the `DoR Waivers` field of **each affected issue** (carry 0.6 → manifest → emission).
- **Nothing stops.** There is no question, no waiver prompt and no headless block for this cause, in any mode. A run that wants the design spec first runs **`/design add <plan>`** explicitly (the day-2 design mode — `tk-design/methodology/day2-plan-input.md`) and then `/backlog add <plan>`; the workflow never chains it on its own.
- Phase 0.6 writes into the **existing `gate_decisions` list** (the one the component test-gate uses) with the `type: design-spec` value — it adds no engine and no gate. Full record mechanics: [`readiness-gates.md`](readiness-gates.md) §Phase 0.6 — Design signal.

### `scr_matches` — `parsed-plan.md` + manifest field

- **`scr_matches`** — per design-significant screen, the SCR(s) that cover it (empty when none does). Frozen in `parsed-plan.md` (RF1 — computed once in Phase 0.6, read downstream, never recomputed unless the plan is edited). The manifest's per-issue `screens:` field is derived from it.

### Refs propagation (`scr_matches` → `Refs (design)`)

When `scr_matches` is non-empty for an issue, the manifest entry's `screens:` field carries the SCR ID(s); `bkl-issue-specer` emits them verbatim into the issue's `Refs (design): SCR-XXX · —` line (replacing today's `— · —`). See [`issue-shape.md`](issue-shape.md) §`Refs (design)` from `scr_matches`. The Phase 7.6 sweep gains a row: `scr_matches` present in the manifest ⟹ `Refs (design)` present in the emitted issue (SKILL §18).

### Graduación de rigor (SSOT en `day2-classification.md`)

> La graduación de rigor — qué cuenta como design-significant (Step 1) y qué se excluye — tiene su **SSOT** en [`.claude/skills/tk-design/methodology/day2-classification.md §Rigor graduation`](../../tk-design/methodology/day2-classification.md). Esta sección cross-refiere; la exclusion list completa (page files nuevos siempre disparan; component-only / backend / tests / copy tweaks / campo suelto NO disparan; borderline → fail-toward-signal) vive allá. La detección de Step 1 arriba aplica esa graduación.

La graduación documenta **qué NO dispara** (la exclusion list), no una lista exhaustiva de qué sí — coherente con el principio fail-toward-signal. El borderline siempre dispara.

### Práctica del plan curado (pre-paso recomendado, NO gate)

> Antes de correr `/backlog add <plan>` sobre un plan day-2 significativo, la práctica recomendada es un **review adversarial manual del plan en un chat fresco** (pegar el plan crudo en una sesión nueva y pedir una crítica). Es un **pre-paso recomendado, no un gate del workflow** — el workflow no lo exige ni lo verifica. La red de seguridad real del workflow es CP1 (revisión del manifest) + el panel de Phase 3.5 + el sweep 7.6, y aguas abajo el `ui-critic` reactivo de `/implement`. El plan curado sube la calidad del input; esas compuertas protegen el output.

### Re-entrada determinista (barata)

Cada run es atómico: la re-entrada se hace con un **run nuevo** (run-id nuevo), y el parser re-procesa el plan desde cero — si el plan no cambió produce un `scr_matches` idéntico (re-parse determinista). Cuando un run STOPea por otra causa, sus artifacts quedan en disco como forenses y no se reutilizan ([`readiness-gates.md`](readiness-gates.md) §Artifact preservation on STOP).

---

## CP-split-proposal checkpoint

After Phase 0.5 parses the plan and proposes a split, the orchestrator surfaces a **plan-mode-only** checkpoint (skipped in `nuevo`/`extend`/`validar`):

```
🛑 CP-split-proposal — Split propuesto del plan

Clasifiqué el plan en {N} issues (de {U} unidades detectadas; {U-N} eran prosa de proceso):
  - {issue 1: title, file count} → 1 issue
  - {issue 2: title, file count} → 1 issue
  - ...
{+ K integration issue(s) por verification bullets cross-issue.}
{Archivos compartidos → chains: {chain list}.}
{Si split_discretion=present:} Agrupé por juicio (prosa sin estructura visible en el plan): {unit list}.

Total propuesto: {E} epic(s) (1 por heading `## Epic:`; default 1) + {N+K} issues.

| 1 | Aprobar — proceder a Phase 1 (registry build)  |
| 2 | Ajustar — quiero unir/separar algunos issues   |
| 3 | Cancelar                                        |
```

**Skip by low ambiguity (`split_discretion`):** the flag is computed once here in Phase 0.5 and frozen in `parsed-plan.md`.

- **`none` → CP-split-proposal does NOT appear** (auto-approves to Phase 1). Every classified unit came from the plan's **visible structure** (Step 1 detection — numbering / `###` / `## Workstream` / lists). Subsumes the old `exactly-1` case, plan-dictated splits/merges, and deterministic auto issues (ui-critic by `ui_touching`; e2e-flow by a cross-issue verification bullet). No split judgment to review.
- **`present` → surfaces.** ≥1 unit was **flat prose with no visible structure** grouped by concern with judgment (Step 1, line "Flat prose … the only non-deterministic case"). The narration adds a line naming those judgment-grouped units.

**Fail-safe:** with `none`, merge/split is still available at **CP1** (`Edit`). The skip removes the double approval, not the control.

**Headless (`present`, no interactive user):** auto-approve and continue (**fail-open**) + manifest caveat (prose grouping unreviewed). Safety net = CP1 is still reviewable. NOT the `SETUP-002` fail-*closed* pattern — here the decision is internal grouping CP1 catches, so the flow continues with a caveat.

**Option 2 sub-flow:** AskUserQuestion multi-select per issue: `merge with adjacent` / `split into N` / `mark as integration issue` / `reclassify as prose`. Default conservative (no merges).

---

## STOP conditions

Only when content that cannot be invented is genuinely absent (no magic heading-name STOP — B):

- **No files anywhere** (0 valid paths in any list across the whole plan) → STOP "el plan no enumera archivos a modificar".
- **No verification/tests section** (recognizable by content, any name; 0 bullets) → STOP "el plan necesita ≥1 bullet de verificación para derivar Gherkin".
- **Unit-level (N2):** a unit classified as an issue (not a process heading) that resolves **0 files** → STOP/surface "la unidad «{title}» describe un cambio pero no lista archivos" — NEVER silent-skip it as prose (that's the silent-drop the classification table forbids).
- Plan filename matches the non-descriptive regex AND user provides no slug at the AskUserQuestion → STOP.

---

## Output: `parsed-plan.md`

Written to `project/backlog-artifacts/{run-id}/parsed-plan.md` for `bkl-context-analyst` to read in Phase 1. Shape:

> This is the **frozen decomposition** (RF1). Downstream phases read it; they never re-derive the split.

```markdown
# Parsed plan: <filename>

> **Source:** <absolute path>
> **Hash:** <sha-256>
> **Parsed at:** <ISO timestamp>
> **Epic count:** 1
> **Units detected:** U · **Issues classified:** N · **Prose skipped:** U−N
> **Split discretion:** none|present ({1-line reason — frozen here, read downstream, never recomputed unless the plan is edited})
> **Decomposition hash:** <sha-256 over the ordered set { units[].title, units[].files[] } — the Phase 3.5 re-entry trigger; see §Decomposition hash>
> **Risk budget:** <N — la regla o señal del registry que lo produjo, con su origen (kit|proyecto); frozen here, only ever raised (§Resolución del presupuesto por riesgo). Fija las composiciones de §12.5 y Phase 7 por la tabla de SKILL §24>

## Context

(narrative context, by content — source for §1 Objetivo, RF3)

## Issues (frozen decomposition)

### Issue 1 — <title>

- body: (the unit's prose — source for §1 Objetivo + §6 Edge Cases, RF3)
- refuted_by: <the producer's `Refutado:` query, verbatim — §RF-prev. Line OMITTED when the item has no `Refutado:` line; absence is NEVER read as "already refuted">
- files:
  - path/to/file.md — intent (if provided)
  - ...

### Issue 2 — ...

## Verification bullets

- bullet 1 (cross-issue: no | issues: [Issue 1])
- bullet 2 (cross-issue: yes | issues: [Issue 1, Issue 2]) → e2e-flow issue
- ...

## Shared-file chains (topology input)

- chain: [Issue 1, Issue 3]   # share `path/to/file.md`
- parallelizable: [Issue 2]

## Extras (non-required sections)

- ## Risks: (verbatim)

## Grounding (Phase 3.4 — appended post-freeze)

(ABSENT at Phase 0.5 parse time. The orchestrator appends this block after the Phase 3.4
grounding runs — SKILL §12.4: one row per claim, with cita textual + clase
HECHO/INFERENCIA/SUPUESTO/DESCONOCIDO + consulta corrida + veredicto. Additive: it does NOT
touch the frozen decomposition (RF1) and does NOT move `Decomposition hash:`, which is
computed over { units[].title, units[].files[] } only.)
```

> **Calibration reference:** [`examples/sample-plan.md`](examples/sample-plan.md) + its hand-checked [`examples/sample-plan.expected-parsed-plan.md`](examples/sample-plan.expected-parsed-plan.md) exercise the full flow (process-heading skip · central `## Critical files` attribution · shared-file non-contiguous chain · cross-issue e2e). It's an authoring/review reference, NOT a CI assertion — the split is LLM judgment.

---

## Anti-patterns

- **Parsing inside `bkl-context-analyst`.** The agent has a closed contract (read artifacts → emit registry). Plan parsing is orchestration logic; putting it in the agent violates `fx-workflow-authoring §8`.
- **Inferring missing sections.** If the plan doesn't have `## Verification`, the orchestrator doesn't synthesize one — it STOPs and asks the author to add it. Synthesized Verification bullets produce hallucinated Gherkin downstream.
- **Auto-splitting epics by "domain"**. Removed in v6.3.0. Use `## Epic:` headings if you want multiple epics in one plan.
- **Splitting issues by directory.** Removed (v6.6.0). The orchestrator honors the author's decomposition (detect → classify → attribute); there is no directory grouping and no `top_dir`/`file group` concept.
- **Harvesting file paths from prose (G3).** Only paths in a **list** (central `## Critical files` or a per-unit `Files:` list) are modify-targets. Inline citations (`foo.ts:82`, `(SKILL §15)`) are read references → never spawn an issue.
- **Silent-dropping a work unit with 0 files (N2).** A unit that describes a change but lists no files STOPs/surfaces — it is NOT reclassified to prose silently (only process headings skip).
- **Skipping CP-split when `split_discretion == present`** (flat prose grouped by judgment went unreviewed). If the decomposition came from the plan's visible structure (`none`), the plan is authority and a merge is still available at CP1 — that case is skipped legitimately, not an anti-pattern.
- **Collapsing the design-significance detection (Phase 0.6) into `ui_touching`.** They read the same paths but answer different questions — `ui_touching` includes component-only (drives `ui-critic`), the design detection excludes it (a component change is not a new screen needing a fresh SCR). Merging them either over-signals component edits or leaves new screens unnamed.
- **Turning the design signal into a question.** It records and narrates; it never asks and never blocks, in any mode. Re-adding a prompt would restore a decision whose answer is constant, and the demonstration it pretends to provide already lives at `/implement` (visual-evidence harness + `ui-critic`, over rendered UI).
- **Treating an existing SCR match as a freshness guarantee.** The match is an existence check (route/slug), not a freshness check. A stale SCR counts as covered — that's a documented limitation, not a bug to "fix" by inventing a freshness heuristic here.

---

_TimeKast Factory — tk-backlog · plan-mode-input_
