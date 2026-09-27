# tk-backlog — Epic Shape

> Anatomy of an epic file + composition heuristics + the Topology SSOT. Canonical shape in [`../templates/EPIC.template.md`](../templates/EPIC.template.md). Live behavior in [`../SKILL.md`](../SKILL.md) §4.4, §10, §19.

---

## Filename + ID

`epics/EPIC-NN-{slug}.md`. `NN` = topological position (`EPIC-00` reserved for bootstrap). Number-at-front → `epics/` lists in logical order. Hook-safe (epic glob `EPIC-*.md`).

## Blockquote header

```markdown
# EPIC-01-auth: Autenticación y sesión

> **Status:** 📋 Backlog
> **Milestone:** v1
> **Priority:** P0
> **Total Issues:** 4 (AUTH-003..AUTH-006)
> **Story Points:** ~18
> **UI Touching:** yes
```

`UI Touching: yes` → a `ui-critic` issue is pre-assigned (Phase 3) and materialized as the chain tail ([`ui-critic-integration.md`](ui-critic-integration.md)).

## Body sections

1. **Objetivo** — what the epic delivers + why it's one cohesive unit.
2. **Issues table** — status emoji · ID · title · effort · `Depends on` · parallelizable mark. Orchestrator fills this post-Phase-4, in **global-number order** (so the table reads in execution order even though the raw folder doesn't).
3. **`## Topology`** — the SSOT of parallelism (below).
4. **Scope** — incluido / excluido.
5. **Dependencias entre epics** — which epics block this one.
6. **Implementation Evidence** — post-hoc, escrita por `/implement` Phase 3 al cerrar issues (resumen plain "qué se construyó", 3-5 líneas).
7. **QC Report (Phase 4 — {ISO 8601 UTC})** — post-hoc, appendeada por `/implement` Phase 4 (audit detallado del epic completado: AC coverage table + checks integrados `pnpm verify`/`build`/`test:e2e` + áreas sensibles). Ver §QC Report append abajo.
8. **Plan Review (Phase 3.5 — {ISO 8601 UTC})** — post-hoc **plan-mode only**, estampada por `/backlog` Phase 8 (el tercer append del epic y el **primero cuyo escritor es `/backlog`** — QC Report y QC Delta los escribe `/implement`). Ver §Plan Review append abajo.

## §QC Report append (post-hoc, Phase 4)

El subagent `quality-engineer` (`tools: Read, Grep, Glob, Bash` — sin Write/Edit) corre en Phase 4 de `/implement` y emite el QC report como **output de su turn**. El orchestrator inline captura el output y appendea al body del epic file con:

```bash
printf '\n%s\n' "${SUBAGENT_OUTPUT}" >> "${EPIC_FILE}"
```

Cero buffer en disco para el QC report final — vive solo en memoria del turn entre subagent y orchestrator append. Los logs de `pnpm verify`/`build`/`test:e2e` que el subagent lee SÍ son buffers temporales en `project/implement-artifacts/{run-id}/` (cleanup canónico de Phase 5 los borra).

**Shape de la sección** (template en `tk-implement/templates/EPIC-QC-REPORT.template.md`):

```markdown
## QC Report (Phase 4 — 2026-05-29T15:30:00Z)

### AC coverage (por issue)

...

### Verificación integrada del epic

...

### Áreas sensibles — cómo quedaron

...
```

**Si el epic se reabre y re-corre Phase 4:** orchestrator appendea una nueva sección con timestamp fresh (no sobrescribe la anterior). El git history del epic file muestra la evolución cronológica de los runs.

**`## QC Delta (Phase 4.7 — {ISO 8601 UTC})` — segundo append post-hoc.** Cuando `/implement` corrige deuda del epic (`tk-implement §Phase 4.7`), el árbol cambia **después** de que el QC report ya se appendeó. El delta se anexa con el mismo mecanismo (append, nunca sobrescribir) y es el **artefacto durable de la deuda del run**: qué se corrigió, qué se convirtió en issue, qué quedó fuera de la frontera del epic, una subsección `### Observaciones (no son deuda)` con las `mejora` y lo que el filtro de refutación retiró (una línea por ítem, con motivo — la única sede de ese material: nunca la tabla de CP-B ni un plan de remediación), el registro de re-clasificaciones del orquestador, y un verdict que **supersede** al del QC report previo — que se conserva como historial del árbol anterior, no como estado actual.

- Lo produce `quality-engineer` re-spawneado sobre el delta (no el orquestador, que es quien clasificó y aplicó los fixes); el orquestador sólo appendea, igual que en Phase 4.2.
- Puede haber **varios** por epic (uno por vuelta); el más reciente manda.
- Es lo que lee el guard de Phase 0 de `/implement` para no responder "nada que hacer" sobre un epic pausado con deuda registrada.

**Sanity check en Phase 5** (antes del commit final): orchestrator verifica que `grep -c '^## QC Report (Phase 4' "${EPIC_FILE}" >= 1`. Si falla → STOP con recovery path manual (paste del output o re-correr Phase 4). Ver `tk-implement/SKILL.md §Phase 5` para el detalle.

**Redundancia conceptual aceptada vs §Implementation Evidence:**

- §Implementation Evidence = resumen plain de qué se construyó (3-5 líneas, escrito Phase 3 al cerrar issues).
- §QC Report (Phase 4) = audit detallado (tables + checks + áreas sensibles, escrito Phase 4).

Son complementarias, no duplicadas.

## §Plan Review append (post-hoc, plan-mode only — tercer append, primero escrito por `/backlog`)

Cuando el run es plan-mode (`add <plan>` / `extend-epic`), Phase 8 de `/backlog` estampa en el epic file la salida durable del grounding (`SKILL.md §12.4`) + panel adversarial (`§12.5`), que de otro modo muere con el manifest en el cleanup de artifacts. Consumidor: `tk-implement §2.2` — el panel plan-time de `/implement` la lee para no re-litigar lo ya resuelto. Mecánica del estampado y restricciones de rendering: [`../SKILL.md`](../SKILL.md) §20 (Phase 8).

- **Dos vías de escritura, una sola forma:** en `add <plan>` la sección nace del template [`EPIC-PLAN-SOURCE.template.md`](../templates/EPIC-PLAN-SOURCE.template.md) y Phase 8 la llena; en `extend-epic` no hay template — Phase 8 la **appendea** con el mismo `printf '\n%s\n' … >> "${EPIC_FILE}"` de los otros dos appends. 🔴 NUNCA vive en `EPIC.template.md` (greenfield): Phase 3.4/3.5 son plan-mode only, y un heading vacío en un epic de discovery le diría al consumidor "aquí va lo ya resuelto".

**Shape de la sección:**

```markdown
## Plan Review (Phase 3.5 — 2026-08-31T18:00:00Z)

> **Cubre:** DOMAIN-004, DOMAIN-005, DOMAIN-006
> **CP1:** 2 presentaciones
> **Presupuesto:** riesgo 2 vía `.claude/**` (kit) → §12.5: architect + project-planner (`split_discretion: present`) · Phase 7: quality-engineer

| Reviewer        | Clase | Claim                                        | Consulta corrida       | Status   | Grounding                       |
| --------------- | ----- | -------------------------------------------- | ---------------------- | -------- | ------------------------------- |
| architect           | rompe | el wrapper que el plan extiende no existe | grep -rn "withExport" | resolved     | HECHO refutado — misma consulta |
| project-planner     | —     | —                                         | —                     | failed       | —                               |
| architect (Phase 7) | —     | —                                         | —                     | not-convened | —                               |

### Gate decisions

| Decisión                        | Resolución                    | Decomposition hash |
| ------------------------------- | ----------------------------- | ------------------ |
| índice parcial vs tabla espejo  | índice parcial (user, CP1)    | abc123def456       |
```

- 🔴 **La composición que los ejemplos de arriba muestran se DERIVA de [`../SKILL.md`](../SKILL.md) §24 — no la declara este archivo.** Un ejemplo trae la fila `architect (Phase 7) · not-convened` porque su encabezado declara riesgo 2, y esa es la fila del tier ≤2 en §24. Si esa tabla cambia, los ejemplos se re-derivan de ella; nunca al revés. Se dice para que un ejemplo stale se lea como lo que es —un ejemplo desactualizado— y no como una segunda sede de la composición.
- **Ancla de timestamp obligatoria** — como QC Report/QC Delta, existe para poder repetirse: un segundo `extend-epic <plan>` appendea otra sección y el consumidor las distingue con `grep` anclado al heading. Sin ella, dos headings idénticos.
- **Tres formas de fila, no una:** *hallazgo* (`reviewer`, `class`, `claim`, `query_run`, `status: live / resolved / dismissed`, resultado del grounding asociado); *caveat de caída* (`reviewer`, `status: failed` — **cuarto valor del enum, declarado**, sin las demás columnas); y *lente no convocada* (`reviewer` **calificado por la fase que no la convocó**, `status: not-convened` — **quinto valor**, también sin las demás columnas). El caveat de caída cruza SIEMPRE que un revisor cayó: sin esa fila el consumidor leería un panel limpio donde hubo un revisor caído (fail-open), o el estampador emitiría un `status` fuera del vocabulario.
- **Forma de la fila `not-convened`** — misma tabla, mismo vocabulario, sólo el `reviewer` poblado **y calificado por la fase que no lo convocó**; el encabezado dice por qué:

  ```markdown
  > **Presupuesto:** riesgo 2 vía `.claude/**` (kit) → §12.5: architect · Phase 7: quality-engineer

  | project-planner (Phase 3.5) | —     | —                        | —                      | not-convened | —                               |
  | architect (Phase 7)         | —     | —                        | —                      | not-convened | —                               |
  ```

- 🔴 **La fase califica la fila y no es decoración.** El presupuesto recorta lentes **por fase**, no por corrida: en tier ≤2 `architect` **sí** revisa el plan en §12.5 y **no** valida los issues escritos en Phase 7. Sin la calificación, esa fila —dentro de una sección titulada `Plan Review (Phase 3.5 — …)`— se leería como *"no revisó el plan"*, que es falso, y el consumidor de [`../../tk-implement/SKILL.md`](../../tk-implement/SKILL.md) §2.2 pondría ojos frescos sobre la lente equivocada. El espejo intra-run lleva el mismo par (`not_convened: [{reviewer, phase}]` — [`../templates/ISSUE-MANIFEST.template.md`](../templates/ISSUE-MANIFEST.template.md) §Risk budget).
- **Qué enumeran estas filas: lo que el TIER retiró.** Los lentes que el recorte por **origen del input** deja fuera de Phase 7 en plan-mode (`product-owner` y `project-planner` — [`../SKILL.md`](../SKILL.md) §16) no son parte de este registro: no dependen del presupuesto, y §16 declara su ausencia para el modo, cualquiera sea el tier.
- 🔴 **`not-convened` ≠ `failed` ≠ una lente que corrió limpia — y la distinción se REGISTRA, nunca se deduce de una fila ausente.** Un revisor que el presupuesto por riesgo no convocó ([`../SKILL.md`](../SKILL.md) §24) produce, sin esta fila, una sección **idéntica** a la de un panel donde esa lente corrió y no encontró nada. El consumidor aguas abajo ([`../../tk-implement/SKILL.md`](../../tk-implement/SKILL.md) §2.2) está escrito para detectar la caída (`failed` → *"un panel con caveat NO es un panel limpio"*); un revisor **nunca convocado** entraría por la puerta que ese párrafo no cubre, y sería el mismo fail-open reabierto — esta vez viajando a toda la flota vía `factory update`. La fila lleva el `reviewer` y nada más; **el porqué vive en el `Presupuesto:` del encabezado**, que dice qué tier se resolvió y qué lentes compró.
- **El campo `Presupuesto:` del encabezado es obligatorio en plan-mode** y trae el nivel, la regla o señal del registry que lo produjo con su origen (`kit`/`proyecto`), y las dos composiciones que fijó. Es el único lugar donde la cobertura del panel queda enunciada de forma positiva: las filas dicen qué encontró cada lente, este campo dice **cuáles hubo**. Su ausencia se lee como una sección de una versión previa del workflow — el consumidor la trata como cobertura no declarada y mira con ojos frescos, nunca como cobertura completa. 🔴 **Este canal es durable y su lector es [`../../tk-implement/SKILL.md`](../../tk-implement/SKILL.md) §2.2, no el usuario: conserva los IDs de sección y fase (`§12.5`, `Phase 7`).** La línea homónima que `/backlog` narra en CP1 y CP2 va en lenguaje plano (`CC.md §3`: *revisión del plan* / *validación de los issues escritos*); son dos canales con lectores distintos, y el durable no se «corrige» a la forma del otro.
- **`resolved` es DERIVADO, nunca afirmado** (`SKILL.md §12.5` §Carry-over): sólo lo que una re-corrida del panel no volvió a levantar. Cerrado sin re-corrida → queda `live`; descartado por el user → `dismissed` + entrada en Gate decisions con el `Decomposition hash` vigente al resolverse (el dato de frescura que `/implement` consulta).
- **`Cubre:` declara el alcance** — los issues emitidos por el run que produjo el panel, y el **único** lugar de la sección donde viajan IDs de issue. Es lo que permite al consumidor intersectar contra su SELECTION SET: un epic de discovery extendido por `extend-epic` **adquiere** una sección que cubre sólo la extensión.
- **La ausencia tiene semántica escrita:** sin sección, no hubo panel — el consumidor no recibe carry-over y sus revisores miran con ojos frescos. Es el default correcto, no un caso de error (misma regla que `Refutado:` en [`plan-mode-input.md`](plan-mode-input.md) §Refutación previa).
- **El placeholder sin llenar TAMBIÉN significa "no hubo panel".** Un run `add <plan>` abortado entre el skeleton (Phase 3) y el estampado (Phase 8) deja durable la sección con sus `{{placeholders}}`: el consumidor la trata exactamente como la ausencia — ojos frescos, cero carry-over (un `Cubre:` placeholder no intersecta nada y ningún `{{status}}` matchea `resolved`, pero la regla se declara aquí para no depender de ese matching literal ni de que nadie "arregle" un placeholder a mano).
- **Rendering (hard — [`../SKILL.md`](../SKILL.md) §3/§3.1):** `status` como palabra, nunca glyph · ningún `✅` sobrevive en el cuerpo (el estampador sanea el texto copiado) · `claim` sin IDs de issue en crudo.

## `## Topology` — SSOT of parallelism

```yaml
parallelizable_issues: [AUTH-003, AUTH-004] # zero-dep singletons within the epic
sequential_chains: # each chain serial; chains run parallel to each other
  - [AUTH-005, AUTH-006]
```

- This block is the **single source of truth** for parallelism. The per-issue `> **Parallelizable:**` line is derived; the Phase 7.6 sweep enforces `issue.parallelizable ⟺ issue ∈ parallelizable_issues`.
- Set-equality invariant: `parallelizable_issues ∪ sequential_chains.flat() == {all issue IDs in the epic}`.
- Within the epic, no issue depends on one with a higher global number (topological).
- Enables a future `/implement-epic` to spawn one `/implement` per chain head + per parallelizable singleton.

A small ASCII/Mermaid topology graph may accompany the block for human reading (non-authoritative).

## Composition heuristics (Phase 3, orchestrator-direct)

### Greenfield (`nuevo` / `extend`)

- **1 entity CRUD set → 1 epic** (`EPIC-NN-{entity}-management`).
- **1 dashboard / reports surface → 1 epic.**
- **Cross-cutting → dedicated epic:** auth setup, RBAC seed, email templates, cron registries, notifications wiring.
- **Setup → `EPIC-00-bootstrap`** (`nuevo` only — see [`setup-epic.md`](setup-epic.md)).
- Mirror the navigation registry (`14_DOMAIN_REGISTRY_LOCKS §Navigation`) where it implies natural feature groupings.

Epics are numbered topologically: an epic whose issues block another's go first.

### Plan-source composition (`add <plan>` / `extend-epic`)

Deterministic precedence (no ambiguity by design — see [`plan-mode-input.md`](plan-mode-input.md) §Epic composition heuristic):

1. **1 plan = 1 epic** (default).
2. Plan has top-level `## Epic: <name>` headings → 1 heading = 1 epic.
3. Otherwise → 1 epic.

`extend-epic EPIC-NN <plan>` skips epic creation entirely — issues append to the target epic. The epic's Topology block updates, `Total Issues` and `Story Points` re-derive.

**Plan-source epics use [`../templates/EPIC-PLAN-SOURCE.template.md`](../templates/EPIC-PLAN-SOURCE.template.md)** — same body sections as `EPIC.template.md` **plus the `## Plan Review` placeholder section** (plan-mode only — see §Plan Review append), and the blockquote adds three lines that anchor provenance:

```markdown
> **Source tier:** plan-mode
> **Plan source:** ~/.claude/plans/add-export.md#approach
> **Plan hash:** abc1234defgh
```

Body §Objetivo derives from the plan's `## Context` + `## Approach` (3-5 plain-language lines). §Scope derives from `## Approach`. The other sections are identical to greenfield epics.

**Epic slug derivation** (NEW M-04 fix):

- Descriptive filename (anything except the non-descriptive list below) → use filename slug directly. `add-export.md` → `EPIC-NN-add-export`.
- Non-descriptive filename matches regex `^(plan|temp|wip|draft|untitled|notes|scratch)(-\d+)?\.md$` → AskUserQuestion inline for a slug.
- `## Epic: <name>` heading present → use that as authoritative slug.

## `extend` mode

The composer (orchestrator-direct) decides whether new work fits an existing epic (extend its Issues table + Topology) or warrants a new `EPIC-NN`. Existing epic numbers are never renumbered.

---

_TimeKast Factory — tk-backlog v1 · epic-shape_
