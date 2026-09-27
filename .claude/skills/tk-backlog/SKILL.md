---
name: tk-backlog
description: Documentation-family workflow that converts /discovery + /design outputs into self-contained backlog issues and epics (topological order, skills allowlist, DoR/DoD test plans) consumed by /implement; `add <plan>` / `extend-epic` do the same from a Plan Mode plan. At close it can push the backlog to the central tracker (needs BACKLOG_API_KEY) and, on approval, extend the project's quality-gates override. Primary invocation: `/backlog [nuevo|extend|add <plan>|extend-epic EPIC-NN <plan>|validar]`.
family: documentation
model: opus
parallelism_unit: batch # grano = epic (1 specer/epic, §13); el enum (none|batch|pass) no tiene 'epic'
concurrency_cap: 1
merge_strategy: orchestrator-write-after
auditor_step: true
last-verified: 2026-09-23
user-invocable: false
---

# tk-backlog — `/backlog` Workflow Skill

> Documentation-family workflow. Converts the durable output of `/discovery` (15+ canonical artifacts `00..14` + `15_IMPLEMENTATION_PACKETS/FT-XX.md`) and `/design` (`16_DESIGN.md` + `16_DESIGN/SCR-XXX-{slug}.md` + `components/` + `flows/`) into an **executable backlog**: self-contained issues + epics with explicit cross-refs (FT × ENT × AC × PER × SCR × actions × RBAC × tests), topological ordering, parallel/sequential markings, and a per-issue skills allowlist. The output is consumed **directly by `/implement`** — no re-derivation, no artifact-hopping. Primary consumer is an AI (Claude Code / Codex).

> Plan-mode entry points (`add <plan>` and `extend-epic EPIC-NN <plan>`) consume a Plan Mode plan file instead of discovery+design, producing the same backlog shape (same 11-section issue template, same epic Topology SSOT). Same downstream `/implement` contract.

> **Slash command:** `/backlog [nuevo|extend|add <plan>|extend-epic EPIC-NN <plan>|validar]` (thin wrapper at `.claude/commands/backlog.md`).

---

## 1. When to use

Invoke after `/design` has emitted a complete UI contract at slot 16, OR after a Plan Mode plan has been approved for a smaller scoped change. `/backlog` is the bridge between either input source and `/implement`: it turns specs into executable work units.

**Use for:** fresh backlog bootstrap of a new project post-design (`nuevo`); adding epics/issues mid-implementation from discovery+design delta (`extend`); turning a Plan Mode plan into 1+ epics (1 per `## Epic:` heading; default 1) + N issues (`add <plan>`); appending plan-derived issues to an existing epic (`extend-epic`); auditing an existing backlog against current upstream (`validar`).

**Don't use for:** creating one-off issues by hand (still via this skill — `SK.md §5`); design work (run `/design` first); implementing an issue (`/implement ISSUE-ID`).

---

## 2. Tono + Plain Language rule (user-facing)

Todo lo que el **user** ve va en lenguaje claro, audiencia = developer mid-level que NO leyó discovery/design upstream. Aplica a: CP1, CP-split-proposal, CP2, los resúmenes de Phase 1/3/7 al user, y los STOP messages. Hereda `CC.md §3` (kit-wide rule). Extensión específica a vocab backlog:

### Vocab a definir inline (primer uso por turno)

| Término                | Definición plain                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| EPIC                   | grupo cohesivo de issues que entregan una capacidad ("EPIC-01 Auth: login + sesión + roles")        |
| ISSUE                  | unidad de trabajo ejecutable por un run de `/implement`                                             |
| issue-manifest         | el plan de issues propuestos antes de escribir archivos (vive en `backlog-artifacts/`)              |
| CP1                    | checkpoint inline donde apruebas el plan del backlog antes de emitir issues                         |
| CP-split-proposal      | checkpoint plan-mode donde apruebas cómo el orchestrator partió el plan en issues                   |
| CP2                    | checkpoint formal en Plan Mode al final, con coverage + blockers + decisión Accept/Edit/Reject      |
| epic-compound          | numeración por epic, step=1: filename `EPIC-01-AUTH-003-...` (default activo, tree-ordered)  |
| global gap-10 (legacy) | shortform `AUTH-010, AUTH-020, …` con gaps — legacy, no se emite en kit actual                  |
| ui-critic pre-asignado | issue auto-generado por cada epic UI-touching, materializado al final de la cadena                  |
| coverage matrix        | tabla que verifica que cada FT/SCR/persona del discovery aparece en ≥1 issue                        |
| extension_mode         | flag interno que dice si el backlog viene de discovery+design (`greenfield`) o plan (`operational`) |
| grounding (verificación de premisas) | pase que verifica contra el repo lo que el plan afirma —clasifica cada afirmación como hecho/inferencia/supuesto/desconocido— **antes** de que el panel intente romperlo (§12.4) |
| panel de revisión del plan | los revisores que atacan el plan **antes** de escribir issues, buscando en qué se equivoca (§12.5); cuántos corren lo fija el presupuesto por riesgo |
| presupuesto por riesgo | cuántos pases de revisión compra la corrida — sale del nivel de riesgo que el registry del kit asigna a los archivos que el plan **enumera**, resuelto antes de empezar (§24) |
| hallazgo que **rompe**  | el plan afirma algo falso sobre el código, o falta una pieza sin la cual lo demás no funciona      |
| hallazgo **menor**      | defecto real pero que no impide avanzar — un orden subóptimo, una unidad que convendría partir     |
| hallazgo de **decisión** | no está mal: hay que elegir entre dos caminos legítimos, y esa elección es tuya, no del agente      |

### Pattern de narration de CP (4 pasos plain)

1. **Qué se hizo** (1-2 líneas — sin IDs crudos, en términos de negocio).
2. **Estado actual** (counts agrupados, no enumerados — "12 issues en 3 epics", no listar los 12).
3. **Decisión pendiente** (qué necesitas del user).
4. **Opciones explícitas y excluyentes** — nunca checkboxes, nunca prosa ambigua. Estructuradas (`AskUserQuestion`) como default interactivo; tabla numerada 1/2/3 como fallback sin la tool; headless resuelve por el fail-open/fail-closed de cada CP. Detalle → `CC.md §3` + [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md).

### Anti-patterns

- **Listar 40 IDs sin agrupar.** Agrupar por epic + count. Los IDs van al manifest, no al user.
- **Citar "Phase 7.5" o "Phase 8" sin re-expresar.** El user no necesita saber qué fase es — necesita saber qué pasó y qué falta.
- **Dumpear validator reports raw.** Cada validator devuelve hasta 200 líneas técnicas; el orchestrator extrae 3 líneas plain antes de surfacear.
- **En plan-mode, omitir el por qué la coverage matrix NO se mide.** Hay que decirlo plain: "este backlog viene de un plan, no de discovery completo — los validadores corrieron con scope reducido por eso."

---

## 3. 🔑 Tooling compatibility (hard constraints — read before emitting anything)

Two repo primitives dictate ID and metadata format. Violating them silently breaks production tooling.

### 3.1 Commit hook — `.claude/hooks/validate-commit.sh`

Extracts issue IDs from the `Closes:` footer with `grep -oE '[A-Za-z]+-[0-9]+'`, then matches them against backlog files via token-boundary `grep` over `*/issues/*.md` (after the v6.2.x PR0 fix). The relevant constraints for backlog emission:

- The **canonical `Issue ID:` blockquote field** is a single shortform token `{DOMAIN}-{NNN}` (e.g. `AUTH-003`). This is what the hook validates against, what `update-board.ts` parses, and what `Closes:` commit footers reference.
- **Tokens of shape `^EPIC-[0-9]+$` are skipped by the hook** — epics are not closeable issues. This means `Closes: EPIC-01-AUTH-003` works in compound projects: the hook skips `EPIC-01` and validates only `AUTH-003`.
- **Filename shape:** `EPIC-NN-{DOMAIN}-{NNN}-{slug}.md` (`epic-compound` convention — tree ordering by epic). Legacy backlogs with shortform filenames (`{DOMAIN}-{NNN}-{slug}.md`) remain hook-compatible — the token-boundary `grep` matches both forms.
- IDs must be **unique within an epic** (`epic-compound` scope). See §15 (numbering).
- Each issue **must contain an `## Implementation Evidence` section** — the hook refuses `Closes:` without it (unchanged).

### 3.2 Board parser — `scripts/tools/update-board.ts`

Parses **blockquote metadata**, not YAML frontmatter:

```
> **Issue ID:** …   > **Status:** …   > **Priority:** …   > **Story Points:** …   > **Epic:** …
```

→ Issues use a **blockquote header** (§4.3), not YAML. `update-board.ts` is **never modified**. Rich AI-consumable refs ride as **extra blockquote lines** that the parser ignores and Claude reads. `update-board.ts` sorts issues by `id.localeCompare` (alphabetical) — so **BOARD.md is NOT in execution order**; the canonical execution order lives only in `EXECUTION-ORDER.md` + each epic's Issues table.

---

## 4. Modes

Five modes, dispatched in Phase 0. Conventions (layout + id) per-project, detected in Phase 0.1 ([`methodology/derived-project-conventions.md`](methodology/derived-project-conventions.md)):

| Mode                             | Source                                       | Output                                            | `extension_mode` |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------- | ---------------- |
| `nuevo`                          | discovery (00-15) + design (16)              | fresh backlog dir + `EPIC-00-bootstrap`           | `greenfield`     |
| `extend`  | latest backlog + delta from discovery/design | new epics/issues continue numbering convention    | `greenfield`     |
| `add <plan-file>` NEW            | Plan Mode plan (.md)                         | 1+ epics (1 per `## Epic:`; default 1) + N issues | `operational`    |
| `extend-epic EPIC-NN <plan>` NEW | Plan + target epic                           | issues appended to EPIC-NN, epic Topology updated | `operational`    |
| `validar`                        | existing backlog vs upstream                 | drift report read-only (FT/SCR hash + plan-hash + **decomposition-hash**, plan-mode) | inherited        |

`extension_mode` is detected in Phase 0.1 and shapes Phase 1 (which artifacts `bkl-context-analyst` reads), Phase 6 (coverage gate scope), and Phase 7 (validator scope). Detail: [`methodology/derived-project-conventions.md`](methodology/derived-project-conventions.md) §0.1.c.

The two plan-mode modes (`add <plan>` / `extend-epic`) additionally run **Phase 0.6 — Design signal** (between Phase 0.5 and CP-split-proposal): it detects design-significant UI without a covering SCR and **records** it (CP1 note + deterministic auto-text in `DoR Waivers` + manifest note — never a STOP), and fills `Refs (design)` when a covering SCR matches. `nuevo` / `extend` / `validar` do NOT run Phase 0.6 (greenfield already has the design contract from `/design`). Detail: §Phase 0.6 below + [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Phase 0.6 — Design signal.

Slash invocation `/backlog` with no args → Phase 0 asks the user to pick a mode.

**Remediation plans from `/implement` (second external producer of plan-mode input).** When `/implement` closes an epic with pending debt (Phase 5.2 partial close), it writes machine-consumable plans that feed these same two modes — no new mode, no special casing:

| Debt | Mode | Why |
| ---- | ---- | --- |
| **Inside** the epic's boundary — breaks one of its own ACs, or is a defect in code it wrote | `extend-epic EPIC-NN <plan>` | The work belongs to that epic; it stays `🚧 In Progress` until it lands |
| **Outside** the boundary — surfaced along the way, not what the epic promised | `add <plan>` → **new debt epic** | Not that epic's debt. If a debt epic is already **open** in the active layout, `extend-epic` it instead; otherwise `add` creates one. At most one open at a time, and it closes normally once implemented |

The plans are written from [`templates/REMEDIATION-PLAN.template.md`](templates/REMEDIATION-PLAN.template.md), which encodes this skill's parser requirements as authoring rules — per-item imperative headings (the skip-list of [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Step 2 is first-match-wins and would silently drop a heading that reads as *Decisiones · Riesgos · Fuera de alcance*), ≥1 file in a list per item, and ≥1 verification bullet per item. They live TRACKED at `project/backlog/{LAYOUT}/remediation/EPIC-NN-{run-id}.md` and are **immutable once written** — the file hash feeds `validar` drift detection, so a re-edited plan would report `CHANGED` forever.

---

## 5. Inputs & outputs

### 5.1 Inputs consumed

Full table in [`methodology/input-contract.md`](methodology/input-contract.md). Summary of what gates Phase 0 per `extension_mode`:

- **`greenfield` (nuevo/extend) — Required (STOP if missing):** `project-config.md`, `00`–`07`, `09`, `10`, `12`, `13`, `14`, `15_IMPLEMENTATION_PACKETS/` (≥1 FT), `16_DESIGN.md`, `16_DESIGN/` (≥1 `SCR-XXX-{slug}.md`).
- **`operational` (add/extend-epic) — Required:** `project-config.md`, the plan file. NO magic heading names — only **≥1 file enumerated** (any list) + **a verification section** (any name) are hard-required; everything else read by content (see [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Required plan content).
- **Optional-with-warning (no STOP):** `08_GLOSSARY`, `11_CLIENT_QUESTIONS`, `16_DESIGN/components/`, `16_DESIGN/flows/`, `project/reference/{INVENTORY,HOOKS,CODEBASE,SCHEMA,API}.md` (`SCHEMA`/`API` = data model + API surface as-built; en `operational` son la fuente de Entities/Actions cuando no hay `09`/`10`).
- **Skills (Read on-demand):** `sk-features-index` (does the kit ship X?), plus the per-issue allowlist sources (§16).
- **Rules:** `.claude/rules/DOR_DOD.md` (DoR/DoD gates), `SK.md §4.2` (test pyramid).

### 5.2 Outputs produced

```
project/backlog/{LAYOUT}/                # layout from Phase 0.1 — v{X} / M{X} / sprint-{N} / milestone-{N}
├── README.md                            # Overview + version rationale          (templates/README.template.md)
├── EXECUTION-ORDER.md                   # SSOT of execution order + Waves        (templates/EXECUTION-ORDER.template.md)
├── MILESTONE-MAP.md                     # Epics → Milestones                     (templates/MILESTONE-MAP.template.md)
├── COVERAGE-MATRIX.md                   # Metrics + coverage + source hashes     (templates/COVERAGE-MATRIX.template.md)
├── epics/
│   ├── EPIC-00-bootstrap.md             # ONLY in `nuevo`
│   ├── EPIC-01-{slug}.md                # greenfield → EPIC.template.md
│   ├── EPIC-NN-{slug}.md                # plan-mode → EPIC-PLAN-SOURCE.template.md
│   └── …
└── issues/
    ├── SETUP-001-bootstrap.md           # ONLY in `nuevo`
    ├── SETUP-002-go-live.md
    ├── EPIC-01-AUTH-003-{slug}.md                  # epic-compound convention (active default)
    ├── EPIC-01-AUTH-004-ui-critic-{epic-slug}.md   # auto-emitted if epic.ui_touching
    ├── EPIC-02-MOV-007-e2e-flow-{flw-slug}.md      # when a FLW spans ≥3 SCRs
    └── …

project/backlog/BOARD.md                 # Auto-rollup all versions (pnpm update-board) — alphabetical, NOT exec order
project/backlog-artifacts/{run-id}/      # Ephemeral: registry + issue manifest (gitignored; cleaned in Phase 8)
    ├── backlog-registry.md
    ├── parsed-plan.md                   # plan-mode only — orchestrator emits, agent reads
    └── backlog-issue-manifest-{run-id}.{json,md}
```

> **Modificado (no creado):** `project/planning/project-config.md` — Phase 8 cierra la fila `Backlog` de §2 Pipeline Status (`⬜ Pendiente → ✅ Completo` + celda Documento → layout real). Read-first → Edit condicional; skip si `is_factory`/`validar`/ya-`✅`/sección ausente.

### 5.3 Issue header — blockquote (see [`templates/ISSUE.template.md`](templates/ISSUE.template.md), [`methodology/issue-shape.md`](methodology/issue-shape.md))

```markdown
# AUTH-003: Login con magic link

> **Issue ID:** AUTH-003
> **Epic:** [EPIC-01-auth](../epics/EPIC-01-auth.md)
> **Priority:** P0
> **Effort:** M · **Story Points:** 5
> **Status:** 📋 Backlog
> **Skills:** `sk-security`, `sk-api`, `sk-ui`
> **Depends on:** — · **Parallelizable:** yes
> **DoR Waivers:** —
>
> **Refs (discovery):** FT-01 · PER-01 · AC-01.1,AC-01.2
> **Refs (design):** SCR-03 · ENT-USER
> **Refs (contract):** signIn,requestMagicLink · [packet](.../15_IMPLEMENTATION_PACKETS/FT-01.md)
```

For plan-mode issues, **two additional blockquote lines** anchor the source (separate from the Refs lines — provenance, not refs):

```markdown
> **Source tier:** plan-mode
> **Plan source:** ~/.claude/plans/add-export.md#approach (hash: abc1234)
```

`Source tier: plan-mode` allows downstream `/implement` to distinguish plan-derived from discovery-derived issues. `Plan source` enables `validar` drift detection (compare current plan hash against stored).

- First 5 fields (`Issue ID`/`Status`/`Priority`/`Story Points`/`Epic`) are what `update-board.ts` reads — exact format mandatory.
- `Status` uses emoji+word — repo convention, NOT YAML enums. The 6 canonical states live in [`methodology/issue-shape.md`](methodology/issue-shape.md) § Status vocabulary (SSOT — reference, never redefine).
- `Parallelizable` is **derived** from the epic Topology SSOT (§15); the sweep validates coherence.
- `DoR Waivers` carries **two kinds of text, and they are told apart by a literal prefix**: the test-AC gate waiver justification (§18, el motor de gates del DoR), written as-is; and the design-signal record (§7.6), which always opens with `design-spec —`. Only the first waives anything — the second registers a fact of the run and never relieves an AC.
- **3 grouped `Refs (...)` lines** consolidate discovery/design/contract refs (see [`methodology/issue-shape.md`](methodology/issue-shape.md) §Blockquote header). Slot order within each line is fixed; empty slots are `—`. Phase 6 coverage gate reads these lines.
- Body sections (11) defined in [`methodology/issue-shape.md`](methodology/issue-shape.md). `## Implementation Evidence` is **mandatory** (commit hook).

### 5.4 Epic header — blockquote (see [`templates/EPIC.template.md`](templates/EPIC.template.md) + [`templates/EPIC-PLAN-SOURCE.template.md`](templates/EPIC-PLAN-SOURCE.template.md))

```markdown
# EPIC-01-auth: Autenticación y sesión

> **Status:** 📋 Backlog
> **Milestone:** v1
> **Priority:** P0
> **Total Issues:** 4 (AUTH-003..AUTH-006)
> **Story Points:** ~18
> **UI Touching:** yes
```

Plan-mode epics use [`templates/EPIC-PLAN-SOURCE.template.md`](templates/EPIC-PLAN-SOURCE.template.md), which adds `Source tier: plan-mode` + `Plan source` + `Plan hash` lines but keeps the same body sections.

Body: Objetivo · Issues table · `## Topology` (SSOT of parallelism) · Scope · Dependencias entre epics · Implementation Evidence (post-hoc).

---

## 6. Turn boundaries

| Turn | Phases                                                                                        | Stops with                                      |
| ---- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1    | Phase 0 (mode + gate) + Phase 0.1 (conventions) + Phase 0.5 (plan parse **+ presupuesto por riesgo**, plan-mode) + Phase 0.6 (design signal, plan-mode) + Phase 1 | **CP-split-proposal** (plan-mode, if ≥2 groups) → **sugerencia de override** (§9.1, si detecta dominio sensible no cubierto) |
| 2    | Phase 2 (setup, nuevo) + Phase 3 (epics + upgrade del tier por `meta-foundation`) + **Phase 3.4** (grounding, plan-mode) + **Phase 3.5** (panel adversarial, plan-mode) | Inline progress · **headless: STOP `grounding_gate` ante un `HECHO` refutado (§12.4) · STOP `plan_review_gate` ante un `rompe` con evidencia** |
| 3    | **CP1** inline (issue manifest preview)                                                       | User input                                      |
| 4    | Phase 4 (issue emission — **1 specer/epic**, epics paralelo) + Phase 5 + Phase 6              | Per-epic completion notifications               |
| 5    | Phase 7 (validación adversarial — panel por modo y, en plan-mode, por tier de riesgo §24) + Phase 7.5 + Phase 7.6 | Sweep PASS check                                |
| 6    | **CP2** Plan Mode formal                                                                      | EnterPlanMode → user decision                   |
| 7    | Phase 8 (emit + handoff)                                                                      | Done — recommend `/implement`                   |

`extend` collapses turns 2+3 (CP1 simplified inline). `add <plan>` and `extend-epic` add Phase 0.6 (design signal) + CP-split-proposal in turn 1 (the design signal never stops the run; CP-split-proposal skipped if only 1 group). `validar` runs Phase 0 + Phase 0.1 + Phase 1 + drift diff + report only (read-only).

Use **TodoWrite** from Turn 1.

### Modo de ejecución — fluido (default) / `--step` (`fx-workflow-authoring §7.1`)

Default **fluido**: un checkpoint para SOLO ante señal real; sin señal auto-avanza con resumen. `--step` restaura el STOP en cada CP. (Aplica a los modos que escriben; `validar` es read-only → sin auto-accept.)

| Checkpoint            | `--step` | fluido (default) — para SOLO si…                                                        |
| --------------------- | -------- | --------------------------------------------------------------------------------------- |
| CP-split-proposal     | para si `present` | nunca por sí solo: `none` auto siempre; `present` → auto-advance + caveat (CP1 lo cacha) |
| señal de diseño (UI s/SCR) | corre igual | **no es checkpoint** — es detección: **nunca para**, en ningún modo. La UI sin SCR se narra en una línea del resumen de CP1 y queda registrada como auto-texto en `DoR Waivers` + nota en el manifest |
| test-gate (el motor de gates del DoR)    | `[y/n/justify]` | **nunca** — default obvio: auto-agrega la AC de test (= `y`)                            |
| CP1 plan review       | para 1/2/3 | shortfall de cobertura, blockers, size-flags, **o `rompe`/`decisión` del panel §12.5**; limpio → auto-advance + resumen |
| grounding (Phase 3.4) | corre igual | **no es checkpoint** — es fase: corre siempre en plan-mode antes del panel y, **con usuario presente, nunca para por sí sola** (su clasificación alimenta §12.5 y CP1). 🔴 **En headless SÍ para**: un `HECHO` refutado —que por mandato siempre cita su consulta— emite `grounding_gate: blocked` y aborta sin escribir issues (§12.4) |
| panel adversarial (§12.5) | corre igual | **no es checkpoint** — es fase: corre siempre en plan-mode y, **con usuario presente, nunca para por sí sola** (sus hallazgos gatean CP1). 🔴 **En headless SÍ para**: un `rompe` con evidencia emite `plan_review_gate: blocked` y aborta sin escribir issues |
| CP2 final             | para Plan Mode | coverage-shortfall **o** blockers; limpio (overlap-WARNING se surfacea) → auto-accept   |
| sugerencia de override (§9.1) | para sí/no | **siempre que dispare** (dominio sensible no cubierto = señal real §4) — para en fluido y `--step`; en modo `validar` (read-only) NO propone ni escribe: solo reporta la detección en su output |

> **WARNING — overlap vs shortfall:** el overlap de shared-file (`§18`) es rutinario → se **muestra en el resumen y auto-avanza**; solo el **coverage-shortfall real** (FT/SCR/persona o file sin issue) **para** CP2. "No silencioso" ≠ "debe parar".

---

## 7. Phase 0 — Mode detect + readiness hard gate

- Parse `$ARGUMENTS`: `nuevo` / `extend` / `add <plan>` / `extend-epic EPIC-NN <plan>` / `validar`. Empty → ask inline. **Execution-mode flags:** `--step` (override del modo fluido — para en cada checkpoint), `--verbose` (amplía resumen/STOP). Default = **fluido** ([`fx-workflow-authoring §7.1`](../fx-workflow-authoring/SKILL.md) — ver tabla §6).
- **`is_factory: true`** in `project-config.md` → `nuevo` STOPs (the Factory is a meta-project; it doesn't get a fresh derived backlog). Template leaves `is_factory` absent/false by default; absence = not-factory.
- **Phase 0.1 sub-step — convention detection** (runs in every mode): determines `layout_pattern`, `id_convention`, `extension_mode`. See [`methodology/derived-project-conventions.md`](methodology/derived-project-conventions.md). Emits `project_conventions` block consumed by all downstream phases. STOPs if layout/id mixed and user doesn't disambiguate.
- **Phase 0.5 sub-step — plan parsing** (plan-mode only, `add` / `extend-epic`): orchestrator-direct — reads the plan, **detects → classifies → attributes** the work units, and **freezes** the decomposition into `parsed-plan.md` (RF1; downstream phases never re-split). STOPs only if no files anywhere / no verification section / a work-unit lists 0 files (N2). Detail: [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md).
- **Phase 0.5 sub-step — resolución del presupuesto por riesgo** (plan-mode only, `add` / `extend-epic`): con la descomposición ya congelada, el orquestador agrega el riesgo del registry del kit ∪ el override del proyecto ([`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md), `risk = máximo`) sobre la enumeración **CRUDA** de los archivos atribuidos del plan —sólo paths, mecanismo prestado de [`tk-implement §2.2`](../tk-implement/SKILL.md)— y **congela el tier resuelto con su origen** en el header de `parsed-plan.md`. Ese tier fija las composiciones de §12.5 y de Phase 7 según la tabla única de §24. Registry ausente / no parseable, override ilegible o bullet de archivos no parseable → **tier completo**, que es la fila `riesgo ≥3` de §24 y se registra como `risk_resolved: 3`, con la causa narrada (fail-toward-scrutiny: sin datos se compra escrutinio máximo, nunca el mínimo). 🔴 **El contrato de resolución vive en [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Resolución del presupuesto por riesgo** — aquí se cita, no se reproduce.
- **Phase 0.6 sub-step — design signal** (plan-mode only, `add` / `extend-epic`): orchestrator-direct — over the frozen `parsed-plan.md`, detects design-significant UI without a covering SCR and records it (CP1 note + `DoR Waivers` auto-text + manifest note; no STOP in any mode); fills `scr_matches` when a covering SCR exists. Runs between Phase 0.5 and CP-split-proposal. Detail: §Phase 0.6 below.
- **Hard gate (`greenfield`):** all required artifacts (§5.1). Optional-with-warning ones emit a caveat into `COVERAGE-MATRIX.md §Consumer Readiness`. STOP if a required artifact is missing → redirect to `/discovery validar` or `/design nuevo`.
- **Hard gate (`operational`, plan-mode):** plan file readable + Phase 0.5 parse succeeded + (for `extend-epic`) target `EPIC-NN` exists and is open.
- **Hard gate (`extend`):** existing `project/backlog/{LAYOUT}/` with `epics/` + `issues/`. STOP if absent → use `nuevo`.
- **Version pick (`nuevo`):** next free `{LAYOUT}` slot per `layout_pattern` (e.g. `v6.0/` exists → next `v7.0/`; `M3/` exists → next `M4/`). STOP if the target dir exists.

STOP message shape mirrors `tk-design §7.2`. No degraded/legacy mode.

Detail: [`methodology/readiness-gates.md`](methodology/readiness-gates.md).

---

## 7.6 Phase 0.6 — Design signal (plan-mode only)

`add <plan>` and `extend-epic` only (skipped in `nuevo` / `extend` / `validar`). Runs between Phase 0.5 (plan parse) and CP-split-proposal. Orchestrator-direct over the frozen `parsed-plan.md` — it never re-derives the split. A Plan Mode plan enters the pipeline AT backlog, skipping `/design`, so new UI arrives with no SCR (screen design contract): this phase **names that fact** so it travels with the issues instead of passing unobserved, and fills `Refs (design)` when a covering SCR does exist.

**Two-step detection** (over the union of all attributed files, the same input as `ui_touching`):

1. **¿design-significant?** New `page.tsx` under `src/app/(public|protected)/**` → always; an existing page/screen with a structural change described in the unit body → yes; borderline → **fail-toward-signal** (fires). Does NOT fire: component-only (`src/components/**` without a new page), backend/data (`src/lib/**`, `src/app/api/**`), tests, copy tweaks, a single field on an existing form.
2. **¿sin spec?** Match each design-significant screen against `16_DESIGN/SCR-*.md` by frontmatter `route` (fallback: filename slug). Match → covered; record `scr_matches: [SCR-XXX]` (→ `Refs (design)`). No match → the screen is recorded as UI without a design spec.

**Outcome — a narrated signal, never a STOP** (identical in fluido, `--step` and headless):

- **Screens with no covering SCR** → one line in the CP1 summary (*"el plan trae {N} pantalla(s) sin SCR — los issues nacen sin diseño, con su registro en `DoR Waivers`"*) + **one** `type: design-spec` entry per run in `manifest.gate_decisions` listing all of them, whose justification is **deterministic auto-text** (e.g. `sin SCR al emitir — ui-critic reactivo en /implement`); Phase 4 stamps that text into the `DoR Waivers` field of each affected issue (never empty — it is the durable record). The same note lands in the manifest as `design_signal`. Nothing blocks and no run aborts for this cause: the pre-assigned reactive `ui-critic` issue is what demonstrates the UI later, at `/implement`, with rendered evidence.
- **Covering SCR matched** → `scr_matches` frozen in `parsed-plan.md` → manifest `screens:` → `bkl-issue-specer` emits `Refs (design): SCR-XXX · —` verbatim. Sweep 7.6 verifies the ref is present when the match exists.

> **Divergence vs `ui_touching` (declared):** this detection excludes component-only UI; `ui_touching` includes it. Same paths, different question (new-screen-needing-SCR vs touches-UI-needing-ui-critic). They coexist by design — see [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Divergencia declarada.

Detail (detection rules, SCR matching, divergence, freshness limitation, graduación de rigor provisional N6, plan curado): [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Phase 0.6 — Design signal. Record mechanics (granularity, `gate_decisions` entry, narration): [`methodology/readiness-gates.md`](methodology/readiness-gates.md) §Phase 0.6 — Design signal.

---

## 8. CP-split-proposal — Plan split preview (plan-mode only)

`add <plan>` and `extend-epic` only. After Phase 0.5 parses the plan, the orchestrator surfaces the proposed split before paying Phase 1+:

```
🛑 CP-split-proposal — Split propuesto del plan

Clasifiqué el plan en {N} issues (de {U} unidades detectadas; {U−N} eran prosa de proceso):
  - {issue 1: title, file count} → 1 issue
  - {issue 2: title, file count} → 1 issue
  - ...
{+ K integration issue(s) por verification bullets cross-issue.}
{Archivos compartidos → chains: {chain list}.}
{Si split_discretion=present:} Agrupé por juicio (prosa sin estructura visible en el plan): {unit list}.

Detecté ui_touching: {yes|no} (unión de los archivos de los issues bajo src/components/** o src/app/**).
{Si yes:} → Phase 3 pre-asignará 1 `ui-critic` issue al final del epic.
{Si extend-epic con ui-critic previo:} → counter monotónico (-2, -3, ...).

Total propuesto: {E} epic(s) (1 por heading `## Epic:`; default 1) + {N+K+ui_critic_extra} issues.

| 1 | Aprobar — proceder a Phase 1 (registry build)  |
| 2 | Ajustar — quiero unir/separar algunos issues   |
| 3 | Cancelar                                        |
```

**Skip by low ambiguity (`split_discretion`):** the orchestrator computes `split_discretion` once in Phase 0.5 and freezes it in `parsed-plan.md` (§9).

- **`none` → auto-approve to Phase 1 (checkpoint NOT surfaced).** Every classified unit came from the plan's **visible structure** (numbering / `###` / `## Workstream` / lists). Subsumes the old `exactly-1` case, plan-dictated splits/merges (e.g. "split 01 → 01a/01b"), and deterministic auto issues (ui-critic by `ui_touching`; e2e-flow by a cross-issue verification bullet). There was no split judgment to review.
- **`present` → surfaces en `--step`; auto-advance + caveat en fluido.** The plan has ≥1 unit of **flat prose with no visible structure** that the orchestrator grouped by concern with judgment (`methodology/plan-mode-input.md` §Decomposition Step 1 — "the only non-deterministic case"). En **`--step`** el checkpoint surfacea, nombrando las unidades agrupadas por juicio (gate accionable, no re-conteo). En **modo fluido** (default) la agrupación de prosa **NO es señal real** — CP1 la cacha (es reviewable) → auto-approve + caveat en el manifest (igual que headless). En `--step` se revisa explícito.

**Fail-safe:** with `none` (o `present` en fluido), merge/split is still available at **CP1** (`Edit`). El auto-advance quita la doble aprobación, no el control.

**Headless (`present`, no interactive user):** auto-approve and continue (**fail-open**) + record a manifest caveat (prose grouping went unreviewed). Mismo comportamiento que fluido interactivo (convergen). The safety net is that **CP1 is still reviewable** — the executable plan is not written blind. This is NOT the `SETUP-002` pattern (that is fail-*closed* — §10): here the decision is internal grouping that CP1 catches, so the flow continues with a caveat.

**Option 2 sub-flow:** AskUserQuestion multi-select per issue (`merge with adjacent` / `split into N` / `mark as integration issue` / `reclassify as prose`). Default conservative.

Detail: [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §CP-split-proposal.

---

## 9. Phase 1 — Context load + registry build

Delegated: **`bkl-context-analyst`** (serial, 1×, `model: opus` — el de su ficha; **no** `inherit`) — spawnea **siempre**, sin excepción por tamaño del run (criterio de aislamiento de contexto, [`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md); un plan `operational` de 3 issues aísla igual que uno de 16). El registry que produce alimenta las fases 3-8 en los dos `extension_mode`.

Input branches by `extension_mode` (NOT a new agent mode — same closed contract, different artifacts to read):

- **`greenfield`:** reads discovery (00-15) + design (16) + reference autogens + `sk-features-index`.
- **`operational`:** reads `parsed-plan.md` (emitted in Phase 0.5) + existing backlog state + reference autogens + `sk-features-index`. Emits `## Caveats: extension_mode=operational — no FT/SCR/persona refs available` so Phase 6/7 skip coverage checks.

Either way the agent builds a registry: `features_with_packets` (greenfield only), `screens_with_features` (greenfield only), `components`, `flows`, `actions`, `entities`, `rbac_matrix`, `sk_shipped`, `existing_components`, `existing_helpers`, plus **`source_hashes`** (content hash per consumed FT/SCR/ENT/AC for greenfield; plan-file hash for operational).

Writes `project/backlog-artifacts/{run-id}/backlog-registry.md` (ephemeral, gitignored). Returns a 5-8 line plain-language summary; orchestrator does NOT inline the registry.

In `extend` / `extend-epic` modes the agent also indexes existing backlog state (epics, issues, **max ID per convention**, FT/SCR already covered — `greenfield` only).

### 9.1 Checkpoint de sugerencia de override (condicional)

Con el registry ya devuelto, el orquestador escanea `## Entities` + `## Actions` + `## RBAC matrix` (`greenfield`: alimentados por `09_DATA_MODEL.md` / `10_API_SURFACE.md` / `05_RBAC_MATRIX.md`; `operational`: por `SCHEMA.md` / `API.md`) buscando vocabulario de dominio sensible del proyecto que el registry genérico del kit no conoce — pagos/cobros/facturación, PII (datos personales sensibles), salud. Detección por keyword sobre nombres de entidad/acción/feature — señal computable, no juicio libre (mismo principio que las señales de [`fx-execution-policy §6`](../fx-execution-policy/SKILL.md): "se siente sensible" no es una señal).

Por cada dominio detectado, el orquestador resuelve si el path que ese dominio ocuparía (`src/features/{domain}/**` / `src/lib/actions/{domain}/**`, inferido del nombre de la entidad/feature) ya matchea una regla del registry del kit (`.claude/policy/quality-gates.json`) con riesgo ≥3. Si sí → el dominio **ya está cubierto** (ej.: el proyecto declara "auth" como sensible, que ya es riesgo 4 nativo) y **no se propone override redundante**. Si ninguna regla lo cubre → candidato a override.

```
🛑 CP — Área sensible detectada, sin regla de gate

El proyecto declara {dominio} ({FT-XX/ENT-XX de referencia}) — el registry genérico
del kit no tiene una regla para `{path propuesto}`.

¿Declaro `{path propuesto}` como área sensible del proyecto?

| 1 | Sí — agrégala a quality-gates.project.json  |
| 2 | No — dejo el piso genérico del kit          |
```

- **Nunca se crea solo** (`CODING.md §8`): clasificar un dominio como sensible es juicio de negocio. Sin respuesta `1` explícita, `.claude/policy/quality-gates.project.json` no se toca — mismo fail-safe declarado en [`fx-execution-policy §4.2`](../fx-execution-policy/SKILL.md) ("sin declarar nada nunca rompe").
- **Con `1`:** el orquestador agrega la entrada (`when.paths` + `risk` + `require`, mismo shape que el default del kit). 🔴 **De los dos campos que endurecen, en ESTE workflow sólo muerde el `risk`:** sube el tier del presupuesto (§24) y con él la composición que corre. El `require` viaja en la entrada porque el shape es el del kit, pero `/backlog` está exento de ese renglón (§16) — los revisores que nombre rigen en el **cierre de `/implement`**, no aquí. Se dice al proponer la entrada, no después: sin esto el user aprueba creyendo que compra lentes en esta corrida al override — patrón `*.project.*`, dev-owned, excluido de distribución, descubrible vía la guía de retrofit `declare-project-sensitive-areas` — y la commitea junto al cierre del run (`GIT.md §3.5`, patrón `CP-commit`). Si el override no existía, nace como registry **válido para el linter**: scaffold completo con `panel_by_risk` (5 niveles vacíos) + `rules` con la entrada — mismo contrato que la opción de un clic de `tk-implement §4.8` y que el ejemplo de la guía de retrofit; `pnpm skill:lint` en verde antes del commit.
- 🔴 **Con `1`, el `Risk budget:` congelado en Phase 0.5 se re-agrega antes de seguir** (plan-mode): el override recién escrito entra a la unión kit ∪ override, y sin re-agregarlo el endurecimiento que este checkpoint acaba de comprar no valdría en la corrida que lo declaró — que es justo cuando aparece el dominio sensible. Mecánica y `max(previo, nuevo)`: [`methodology/readiness-gates.md`](methodology/readiness-gates.md) §Invalidation (tercer disparador).
- **Con `2` o sin respuesta:** el run continúa con el piso genérico del kit — nada se rompe.
- **Headless:** no se propone — no hay quién apruebe. La detección queda registrada como nota en el manifest (`sensitive_domain_detected: {dominio} — sin override, revisar manualmente`), fail-safe (misma forma que la señal de diseño de §7.6: la detección se registra como nota, nunca se crea nada sin aprobación).
- **Modo `validar` (read-only):** este checkpoint NO propone ni escribe — solo reporta la detección en su output, como el resto de las fases bajo ese modo.
- **Múltiples dominios en la misma corrida → una sola tabla**, una fila por dominio (mismo patrón que CP-split-proposal — no N checkpoints seguidos).

---

## 10. Phase 2 — Setup gates planning (`nuevo` only)

Emit `EPIC-00-bootstrap` with **2 consolidated issues** (+ a conditional `SETUP-003` when the design chose a shipped skin ≠ the active one — see below). Full detail + the `SK.md §7.1` cross-reference in [`methodology/setup-epic.md`](methodology/setup-epic.md).

| ID          | Slug      | What                                                                                                                                                                                                                                                                                  | Nature                                                  |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `SETUP-001` | bootstrap | `pnpm install` + `pnpm db:generate` (mint the initial `0000`) + **provision** (`/implement` loads `tk-provision` inline: Neon → CP2 deploy substrate, Vercel or Railway → DNS/Resend → env wizard) + `pnpm verify` **without e2e**                                                                       | Run by `/implement` via `tk-provision` inline (CP2 gate) |
| `SETUP-002` | go-live   | Verify the first deploy+migrate landed on the repo's destination (`main` deployed, `migrate` ran — in `vercel-build` on Vercel, in the pre-deploy on Railway —, tables exist, domain live) + create the super_admin invite on `main` (`npx @timekast/factory invite-admin --target main --app-url=<prod>`)                                                                | Automatable by `/implement` — post-deploy verification  |

> **Why this is safe (`SK.md §7.1` holds):** provision mutates Neon/Vercel or Railway/GitHub through their **APIs with the rail tokens**, never `vercel link` / `vercel env pull` (the overwrite-without-diff vectors §7.1 forbids); it writes `.env.local` controlledly. The old "cloud bootstrap is a manual runbook because §7.1" framing is gone — provision automates the cloud work safely. The legacy runbook (`vercel link`, manual Neon, `setup-e2e.ts`) is removed.
>
> **Headless:** `SETUP-001` is **fail-closed** — `tk-provision`'s CP2 has no approver, so it emits the runbook doc and the issue stays `🚫 Blocked` (never silently provisioned).

> **`SETUP-003` (conditional skin switch):** after SETUP-002, read `visual_direction` from `16_DESIGN.md §0` (frontmatter) + `ACTIVE_SKIN` from `src/config/skins.ts` (read-only — `/backlog` never edits it). Emit `SETUP-003-apply-skin` **iff** `visual_direction` ∈ keys(`SKINS`) **and** `visual_direction !== ACTIVE_SKIN` — AC: set `ACTIVE_SKIN` + `pnpm generate:skin` + `pnpm verify` + commit. Else omit it (active skin kept, or a custom/non-registry direction). `/implement` running the issue is the **only** place `src/config/skins.ts` is written — SSOT chain Design decides → Backlog materializes → Code applies. Detail in [`methodology/setup-epic.md`](methodology/setup-epic.md).

Topology: `sequential_chains: [[SETUP-001, SETUP-002]]` (append `SETUP-003` when emitted), `parallelizable_issues: []`.

`--skip-bootstrap` flag opts out of `EPIC-00` if the project is already bootstrapped.

---

## 11. CP1 — Plan Review (inline)

CP1 previews the backlog **before any issue file is written** — its data source is the **issue manifest** (`backlog-issue-manifest-{run-id}.{json,md}`, emitted by Phase 3, see [`templates/ISSUE-MANIFEST.template.md`](templates/ISSUE-MANIFEST.template.md)). The manifest lists, per planned issue: ID, epic, refs (FT/SCR/ENT/AC/personas/actions for greenfield; attributed files for plan-mode), `depends_on`, layers, **size-flag** (§23), skills, status, `ui_critic?`.

```
🛑 CP1 — Backlog plan proposed

Version: {LAYOUT}    Epics: {N}    Issues: {M} (incl {S} setup, {U} ui-critic, {E} e2e-flow)
Coverage: FT {a}/{A} · SCR {b}/{B} · personas {c}/{C}                  (greenfield only)
Source:   plan-mode — {path/to/plan.md}                                 (operational only)
Size flags: {K} issues cross ≥3 layers (split suggested) — listed below

Presupuesto: riesgo {N} por {regla o señal} ({kit|proyecto}) → revisión del plan: {panel} · validación de los issues escritos: {panel}   (plan-mode only)
Revisión del plan: {B} rompen · {W} menores · {D} por decidir              (plan-mode only)
Diseño: el plan trae {N} pantalla(s) sin SCR — nacen sin diseño, con su registro en DoR Waivers   (plan-mode, solo si {N} > 0)

Pick:
  1. Approve — proceed to Phase 4 (emit issues)         [no se ofrece si hay ≥1 hallazgo que rompe vivo]
  2. Edit — adjust epics/issues/splits inline (orchestrator re-emits manifest + re-freezes parsed-plan)
  3. Descartar un hallazgo — con justificación escrita del user (≥20 chars)   (plan-mode only)
  4. Cancel — workflow ends (no durable writes yet)
```

🔴 **Narración obligatoria del presupuesto (plan-mode, en CP1 y en el resumen de CP2 — §19).** La línea `Presupuesto:` de arriba se emite **siempre**, pare CP1 o auto-avance, con el formato **por-regla-con-origen** de [`tk-implement §4.6`](../tk-implement/SKILL.md): el nivel, la regla o señal del registry que lo produjo (con su origen `kit`/`proyecto`) y las dos composiciones que compró. Si `meta-foundation` subió el tier en Phase 3, la línea lo dice. 🔴 **Va en lenguaje plano (`CC.md §3`): las dos composiciones se nombran por lo que revisan —*revisión del plan* y *validación de los issues escritos*—, nunca por su número de sección ni de fase**, que es el anti-pattern de §2 (*citar «Phase 7.5» o «Phase 8» sin re-expresar*). El vocabulario ya está en la tabla de §2 (`panel de revisión del plan`, `presupuesto por riesgo`). Con `resolution: fallback-completo` no hay regla que nombrar y la línea nombra **la causa** en su lugar ([`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Resolución del presupuesto por riesgo). **Un recorte no narrado es indistinguible de un olvido** — es el principio 1 de `fx-execution-policy §7` aplicado a este eje, y el mismo que [`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md) exige a todo workflow que recorte spawns.

**Gating por el panel de Phase 3.5 (plan-mode):**

- 🔴 **`rompe` vivo → la opción 1 no se ofrece** hasta ajustar el plan o descartar el hallazgo explícitamente. Sin esto el panel es una alarma que sólo avisa, con más costo.
- 🔴 **`decisión` → CP1 para siempre** (fluido incluido) y la presenta como fila con opciones excluyentes: el agente no puede descartarla solo (`fx-execution-policy §4.4`). No bloquea aprobar — bloquea **auto-avanzar**.
- **`está mal` → entra al resumen y auto-avanza** en fluido, como el overlap de shared-file.
- **Opción 3 (Descartar) es la salida del gate, y la cierra el user, no el agente.** Un hallazgo `rompe` o `decisión` sólo se descarta con **justificación escrita del user (≥20 chars)**, que se registra en `gate_decisions` (`type: plan-review`, `decision: dismissed`). 🔴 Sin esta opción el gate no termina: si el user ajusta algo que el hash **no** mide —orden, agrupación en epics, redacción—, el panel no re-corre, el contador no sube y el `rompe` sigue vivo, así que la única salida sería cancelar. La exigencia de texto **no se deroga** al presentar las opciones de forma estructurada (`CC.md §3`): las opciones van estructuradas, el descarte sigue pidiendo la razón escrita. Y no contradice *"el agente no puede descartar una `decisión` solo"* (`fx-execution-policy §4.4`) — precisamente porque quien la cierra es el user.
- 🔴 **Resumen plain antes de pedir la decisión** (`CC.md §3` + §2 de este skill): el orquestador presenta cada hallazgo en 2-3 líneas de lenguaje plano —qué afirma el plan, qué se encontró y qué cambia— **antes** de la fila de decisión. La `query_run` (un grep, un archivo leído) va como evidencia de respaldo, nunca como el cuerpo del mensaje.
- **Opción 2 (Edit) re-congela**: re-emite el manifest **y** `parsed-plan.md` con `Decomposition hash:` + `Split discretion:` recomputados, más la re-propagación de `scr_matches` ([`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Decomposition hash). Si el hash cambió, el panel re-corre (cap: 2 re-entradas).

**Modo (`fx-workflow-authoring §7.1`):** en **`--step`** CP1 para con la tabla 1/2/3 (arriba). En **fluido** (default), si el manifest está **limpio** — cobertura completa (sin shortfall), sin blockers, sin size-flags, y **sin `rompe` ni `decisión` del panel de §12.5** — CP1 **auto-avanza** a Phase 4 con un resumen breve (Version · Epics · Issues · `✅ cobertura completa` · **la línea de diseño de §7.6, si el run registró pantallas sin SCR**); con `--verbose`, el resumen incluye la tabla completa. 🔴 **La línea de diseño viaja en el resumen del auto-avance, no lo impide:** es señal narrada, no checkpoint — un manifest limpio con pantallas sin SCR sigue auto-avanzando. Sin este campo la nota no tendría dónde renderizarse justo en el modo default, y "señal narrada" se quedaría sin la mitad que narra. Si hay **shortfall de cobertura, blockers, size-flags, o un hallazgo `rompe`/`decisión` del panel** (señal real §1/§4) → CP1 **para** con la tabla.

> ℹ️ **Aclaración de texto, no cambio de comportamiento:** en **plan-mode** la línea de cobertura se reemplaza por `Source: plan-mode` (abajo) y Phase 6 corre **después** de CP1, así que el shortfall de cobertura no es una causa alcanzable ahí. Las causas efectivas de parada en plan-mode son, post-cambio: blockers, size-flags, `rompe` y `decisión`. El fail-safe de edición sigue disponible: aunque auto-avance, no se escribió ningún issue todavía (los writes son Phase 4).

`extend` mode: simplified inline (delta only). Plan-mode (`add` / `extend-epic`): coverage line replaced with `Source: plan-mode — <path>`. Reuses `fx-workflow-authoring/templates/checkpoint-inline.template.md`.

---

## 12. Phase 3 — Epic composition (orchestrator-direct, NO subagent)

Epic composition is a **global orchestration decision** (consumes the Phase 1 registry + the parsed plan if operational) → main loop, not delegated (`fx-workflow-authoring §8`).

**`greenfield` heuristics** (detail in [`methodology/epic-shape.md`](methodology/epic-shape.md)):

- 1 entity CRUD set → 1 epic (`EPIC-NN-{entity}-management`).
- 1 dashboard / reports surface → 1 epic.
- Cross-cutting (auth setup, RBAC seed, email templates, cron registries) → dedicated epic.
- Setup → `EPIC-00-bootstrap` (`nuevo` only).

**`operational` (plan-mode) heuristics** (detail in [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Epic composition):

1. **1 plan = 1 epic** (default).
2. Plan has top-level `## Epic: <name>` headings → 1 heading = 1 epic.
3. Otherwise → 1 epic.

`extend-epic EPIC-NN <plan>` skips epic creation entirely — issues append to the target epic, the epic's Topology block updates, `Total Issues` and `Story Points` re-derive.

**Issue split inside epic (plan-mode, orchestrator-direct — detect → classify → attribute):**

- The orchestrator reads the plan and emits **1 issue per classified work-unit** (NOT by directory). Classification is rule-based (process heading → skip; ≥1 file → issue; borderline → fail-closed issue; work-unit with 0 files → STOP/surface, never silent-skip — N2). Frozen in `parsed-plan.md`.
- A verification bullet that is **cross-issue** (references files of ≥2 issues, by content — RF2-a/N3) → +1 `e2e-flow`-style integration issue.
- **Shared file (in ≥2 issues) → those issues land in one `sequential_chain`** (connected components); no overlap → `parallelizable`. Detail: [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Shared-file sequencing.
- Epic slug: filename slug unless filename matches the non-descriptive regex (`^(plan|temp|wip|draft|untitled|notes|scratch)(-\d+)?\.md$`) — then AskUserQuestion inline.

Phase 3 numbers epics topologically (`EPIC-01`, `EPIC-02`, …), emits **epic skeleton files** (header + Objetivo + scope; Issues table empty until Phase 4), and emits the **issue manifest** that drives CP1 — including pre-assigned IDs + slugs (§15), **pre-computed dependency edges (including cross-epic edges — Phase 3 sees the global graph, so each issue's `depends_on` is complete)**, and the **ui-critic issue pre-assigned** for every `ui_touching` epic (so it enters the validated graph, not bolted on at the end). The per-epic specer (§13) writes `depends_on` and the filename slug **verbatim from the manifest** — it does NOT re-derive them and does NOT need to see sibling epics.

**`ui_touching` detection en plan-mode** — infiere de file paths (`src/components/**`, `src/app/(protected)/**`, etc — ver [`methodology/plan-mode-input.md §ui_touching detection`](methodology/plan-mode-input.md)). Phase 3 pre-asigna `ui-critic` issue como tail si `ui_touching: yes`. Para `extend-epic` con files UI, emite 1 nuevo `ui-critic` con counter monotónico (`-2`, `-3`, ...) — primer ui-critic del epic NO lleva counter. Sin lógica de inspección de status de ui-critics previos (trade-off cuantificado en methodology: 2 ui-critic pendientes = ~5-10 min + costo API equivalente a 1 issue).

**Upgrade del tier por `meta-foundation` (plan-mode, antes de spawnear §12.5).** El grafo `depends_on` no existe en Phase 0.5, así que la señal plan-time `meta-foundation` ([`fx-execution-policy §6`](../fx-execution-policy/SKILL.md), que declara su umbral: un issue con **3 o más** dependientes) se evalúa **aquí**, con el grafo global ya computado por esta fase. 🔴 **El universo sobre el que se cuentan esos dependientes son los issues que ESTE run emite, más los preexistentes del epic destino en `extend-epic`.** Contando sólo los nuevos, un plan de tres unidades no alcanzaría nunca el umbral; incluir el epic destino es la dirección que agrega escrutinio, la misma que gobierna el resto de la fase. 🔴 **Sólo puede SUBIR el tier resuelto, jamás bajarlo**, y el nuevo valor se re-congela en `parsed-plan.md` **antes** del spawn de §12.5: un tier que se moviera después dejaría el panel comprado con un número viejo. `no-adr` está declarada pero **no es computable** —el campo ADR no existe en el shape de issue del kit, con la razón escrita en `fx-execution-policy §6`— así que no participa del cálculo. El upgrade se narra en CP1 con su origen, igual que el tier inicial (§11).

---

## 12.4 Phase 3.4 — Grounding de premisas (pre-adversarial — plan-mode only)

> **Qué pregunta:** *¿las premisas del plan son ciertas?* — nunca *¿dónde se rompe?* (esa es §12.5, que corre después y consume esta salida). Separación a propósito: primero se verifica que el plan **describe la realidad del repo**; el escrutinio adversarial ataca después sobre premisas ya clasificadas, en vez de excavar escenarios alrededor de un supuesto que nadie comprobó. Igual que §12.5, corre **sólo** en `add <plan>` / `extend-epic` — no en `nuevo` / `extend` / `validar`.

**Insumo: el `parsed-plan.md` congelado.** Por eso esta fase **no depende de Phase 3**: su insumo se congela en Phase 0.5 (el parse), y la agrupación en epics no cambia lo que el plan afirma. Que corra entre Phase 3 y §12.5 es orden del turno (§6) — su salida tiene que estar lista cuando el panel spawnea —, no una dependencia de datos.

**Spawn — 1× [`grounding-auditor`](../../agents/grounding-auditor.md)** (genérico, read-only; su contrato I/O vive en su card y aquí se consume, no se redefine). Shape de invocación ([`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md)): `phase` declarada (`Phase 3.4 — grounding de premisas`), **`opus` explícito** —el de su ficha, pasado en el spawn en vez de heredado—, y los paths de skills citados en el prompt (`CC.md §2`): `.claude/skills/fx-execution-policy/SKILL.md` (la clase de evidencia cerrada de §7 que cada `HECHO` cita). El prompt lleva además el **contrato de contexto de 6 campos** (`fx-workflow-authoring §8`), con el campo *fase del proyecto* **derivado mecánicamente, nunca a mano**: override de `project/planning/project-config.md ## 1. Identity` primero (`branching: develop-first` → post-release · `branching: main-first` → pre-release), `package.json` `version` como fallback.

Input del agente (per su card): `artifact` = el `parsed-plan.md` congelado · `claim_scope` = default (todas las afirmaciones verificables) · `repo_context` = los autogens de `project/reference/` que apliquen. Devuelve cada afirmación con **exactamente una** clase — `HECHO` (confirmada o refutada, **citando la consulta corrida**) / `INFERENCIA` / `SUPUESTO` / `DESCONOCIDO` — y ningún remedio: qué hacer con una premisa refutada lo deciden §12.5 + CP1.

### Persistencia — el orquestador escribe, el agente no

El reporte llega inline (el agente es read-only). El orquestador lo persiste en **dos** lugares:

- **`manifest.grounding`** — la clasificación con su consulta por afirmación ([`templates/ISSUE-MANIFEST.template.md`](templates/ISSUE-MANIFEST.template.md) §Grounding).
- **`parsed-plan.md`** — el bloque `## Grounding (Phase 3.4 — appended post-freeze)` se **agrega** al artefacto congelado ([`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Output). Aditivo, no un re-freeze: no toca la descomposición (RF1 intacto) ni mueve `Decomposition hash:`, que se computa sólo sobre `{ units[].title, units[].files[] }`.

### Re-corridas — las afirmaciones son del plan, no del split

Un re-split en CP1 (opción 2) **no** re-corre el grounding: cambia la agrupación, no lo que el plan afirma (misma lógica que `ui_touching` en la tabla de re-freeze de [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Decomposition hash). Lo único que lo invalida es una **edición del plan file** (re-parse de Phase 0.5 — [`methodology/readiness-gates.md`](methodology/readiness-gates.md) §Invalidation): plan nuevo → premisas nuevas → grounding re-corre.

### Degradación segura + fallo del agente — nunca se lee como "limpio"

- 🔴 **La ausencia de clasificación nunca se lee como "ya verificado".** Un run sin grounding —agente caído, clasificación parcial— hace que el panel pregunte **todo**. Es el default correcto, no un caso de error (mismo criterio que RF-prev, [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Refutación previa).
- 🔴 Si el agente **cae, devuelve vacío o no emite clasificación**, eso NO es un grounding limpio (mismo cierre que §12.5 tiene para su panel): se registra como caveat explícito en `manifest.grounding` (`status: failed`), se **nombra en el resumen de CP1**, y en headless entra al bloque del gate como `action`.

### Headless — fail-closed atado a evidencia

Sin usuario que lea, la fase resuelve por su fallback declarado (shape SSOT: [`methodology/readiness-gates.md`](methodology/readiness-gates.md) §Headless fail-closed — `grounding_gate`; reusa el patrón de `plan_review_gate`, no una mecánica nueva de gate): un **`HECHO` refutado** —que por mandato del agente siempre cita su consulta, así que el disparo es reproducible, nunca juicio— emite `grounding_gate: {status: blocked, …}` a stdout + manifest y aborta sin escribir issues. `SUPUESTO` / `DESCONOCIDO` **nunca** abortan: llegan marcados al panel, que es la dirección segura (agrega escrutinio). Con usuario presente la fase no para por sí sola: la premisa refutada llega a CP1 como hallazgo `rompe` vía §12.5 (§Contrato de entrada, abajo).

---

## 12.5 Phase 3.5 — Plan review panel (adversarial, pre-emisión — plan-mode only)

> **Qué refuta:** el **plan y su descomposición**, no los issues (que aún no existen). Corre sobre el `parsed-plan.md` congelado + el issue manifest de Phase 3, **antes** de CP1. En `nuevo` / `extend` / `validar` **no corre**: el input de esos modos es discovery + design, ya refutado por los paneles de sus propios workflows — lo que Phase 7 valida ahí es la **derivación** (¿el backlog cubre los FT/SCR/personas?), no la fuente. El input de plan-mode no lo revisó nadie, y de ahí este panel.

Generic agents, single message, non-overlapping lenses. **La fase corre siempre** en `add <plan>` / `extend-epic` — sin predicado de volumen y sin bandera de procedencia (un flag de "ya refutado" haría que el alcance de esta revisión lo decidiera el productor del plan, no su consumidor). **Cuántos revisores la componen lo fija el tier resuelto en Phase 0.5** (tabla normativa en §24; lo de aquí es su DERIVADA — si divergen, gana §24): en tier ≤2 corre `architect`, que absorbe la pregunta 3, y `project-planner` se suma **sólo** con `split_discretion: present`; en tier ≥3 corren los dos con las cuatro preguntas repartidas. No-write discipline (`fx-workflow-authoring §9`): "Emit findings inline. Zero Write/Edit — orchestrator writes outputs."

**Shape de invocación** ([`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md)): los revisores que compongan el panel corren en **`opus` explícito** —el de sus fichas, pasado en el spawn en vez de heredado— con su `phase` declarada (`Phase 3.5 — plan review`), el contrato de contexto de 6 campos, y los paths de skills que su lente necesita citados en el prompt (`CC.md §2`):

| Revisor | Lente | Cuándo corre | Skills a citar en el prompt |
| --- | --- | --- | --- |
| `architect` | Preguntas 1 y 2 — **más la 3 en tier ≤2**, que absorbe explícitamente | siempre | `.claude/skills/fx-execution-policy/SKILL.md` · `.claude/skills/kb-ssot-registries/SKILL.md` |
| `project-planner` | Preguntas 3 y 4 en tier ≥3 · **sólo la 4** cuando entra en tier ≤2 | tier ≥3: siempre · tier ≤2: sólo con `split_discretion: present` | `.claude/skills/sk-features-index/SKILL.md` |

> 🔴 **Ninguna pregunta se pierde por el tier: la 3 la absorbe `architect` en ≤2, y la 4 conserva su gatillo propio (`split_discretion`), idéntico en los dos tiers.** El recorte es de revisores, jamás de preguntas. La titularidad de la 3 es **condicional al tier** y está escrita en la fila de arriba y en §Las 4 preguntas, en vez de quedar implícita: es la única de las cuatro que ninguna señal gatea, así que sin la absorción desaparecería de toda corrida de tier ≤2 con `split_discretion: none` — justo el caso mayoritario.

> **Subconjunto declarado y cerrado, nunca un juicio por corrida** (`tk-implement §2.2`). `product-owner` y `quality-engineer` quedan fuera porque juzgan cobertura de producto y DoR/DoD **del issue escrito** — el objeto de Phase 7, que aquí no existe. **Esto NO es el light path retirado** (`CHANGELOG.md`, `QGATE-003`): aquél era un predicado de **volumen** evaluado por corrida que se quedó pegado al crecer el conteo. El tier de §24 es una propiedad del **input** —el riesgo que el registry asigna a los archivos que el plan enumera—, resuelta antes de empezar y verificable sin correr nada; ningún conteo de unidades de trabajo entra en él.

### Contrato de entrada — la clasificación del grounding (Phase 3.4, §12.4)

El panel **recibe en su prompt** la salida de §12.4: las premisas del plan clasificadas, con la consulta que sostiene cada `HECHO`. Cambia lo que la pregunta 1 re-litiga, nunca el alcance de las otras tres:

- **`HECHO` confirmado con consulta citada** → el panel **no re-pregunta *¿existe?*** sobre él, salvo que traiga **evidencia contradictoria** propia (misma clase cerrada de `fx-execution-policy §7`). Las preguntas 2-4 (piezas faltantes, orden, split) corren igual sobre él.
- **`HECHO` refutado** → entra como hallazgo `rompe` **ya establecido**, con `query_run` = la consulta del grounding — el panel no lo re-deriva; puede sumarle consecuencias.
- **`INFERENCIA`** → llega con su cadena declarada; el panel puede atacar la cadena, no re-verificar los `HECHO` de los que deriva.
- **`SUPUESTO` / `DESCONOCIDO`** → llegan **marcados como no verificados**, lo que **agrega** escrutinio: el panel sabe exactamente qué premisas nadie comprobó. (Que el panel luego confirme como real un `SUPUESTO` es correcto por diseño, no un falso positivo del grounding.)
- 🔴 **La ausencia de clasificación nunca se lee como "ya verificado"** (§12.4): sin grounding —agente caído, run parcial— el panel pregunta **todo**, como antes de que la fase existiera.

### Las 4 preguntas

1. **¿El supuesto se sostiene contra el repo?** La unidad dice "extender X": ¿X existe y es como el plan lo describe? 🔴 Cada hallazgo registra **la consulta que corrió** (el grep, el archivo leído) — clase de evidencia cerrada de [`fx-execution-policy §7`](../fx-execution-policy/SKILL.md) (*test rojo · línea de log · resultado de una búsqueda en el código; nada más califica*). Es lo que distingue haber buscado de haber parafraseado el plan, y lo que hace reproducible el disparo headless.
2. **¿Falta una pieza para que el conjunto funcione?** Dependencia real no declarada: una migración que nadie corre, un punto de extensión que no existe, un archivo que hay que tocar y ninguna unidad reclama.
3. **¿El orden es viable?** Distinto de la topología: no si el grafo es sólido (eso es Phase 7), sino si el trabajo se puede hacer en ese orden **sin dejar el repo roto entre dos issues**. 🔴 **Su titular depende del tier, y por eso se declara:** en tier ≥3 la hace `project-planner`; en tier ≤2 la **absorbe `architect`**, que es quien corre. Ninguna señal la gatea —a diferencia de la 4—, así que sin esa absorción explícita se perdería entera en el tier reducido, y con ella la premisa sobre la que §16 saca a `project-planner` de Phase 7.
4. **¿Alguna unidad es en realidad dos, o dos son una?** 🔴 **Sólo si `split_discretion: present`** (leído del `parsed-plan.md` congelado). Con `none` toda unidad salió de la estructura visible del plan y el plan es autoridad — la pregunta es peso muerto. Con `present` hubo prosa plana agrupada por juicio y **en fluido CP-split-proposal no surfacea** (§8), así que ese juicio llega a CP1 sin haber sido atacado: no duplica CP-split, lo cubre donde se auto-aprueba. **En tier ≤2 esta señal es además lo único que convoca a `project-planner`** (§24): sin ella, su otra pregunta ya tiene dueño y el spawn no compraría una lente nueva.

**Qué está FUERA de alcance** (campo obligatorio del contrato de spawn — su ausencia hace que el filtro trabaje de más sacando hallazgos ajenos):

- ❌ Diseñar el remedio. Se refuta la afirmación; el ajuste lo decide el user en CP1.
- ❌ Juzgar títulos, DoR/DoD, plan de tests o cobertura de producto (Phase 7, sobre issues escritos).
- ❌ Proponer alcance nuevo que el plan no trae.
- ❌ Reescribir la agrupación en epics (decisión de Phase 3).
- ❌ Emitir un audit de timeline: el objeto no tiene deadline. 🔴 `project-planner` debe recibir el **output shape explícito** en el prompt (hallazgos con clase + la consulta corrida), porque el default de su ficha es un audit de fechas.

### Clase de hallazgo — se importa por puntero, no se define aquí

SSOT: [`fx-execution-policy §4.4`](../fx-execution-policy/SKILL.md) sobre la tabla de triage de `tk-implement §4.7.1`/`§4.7.3`. **Se importa la clase, NO el `loop_by_risk`** — son dos cosas distintas del mismo archivo, y confundirlas reabriría la exención de §16.

| Clase | Qué es | Efecto en CP1 (§11) |
| --- | --- | --- |
| `rompe` (`breaks`) | El plan afirma algo falso sobre el repo, o falta una pieza sin la cual el conjunto no funciona | 🔴 **Impide la opción de aprobar** |
| `está mal` (`wrong`) | Defecto real no bloqueante — orden subóptimo, unidad que convendría partir | Entra al resumen y **auto-avanza** en fluido |
| `decisión` (`decision`) | Exige elegir entre alternativas legítimas | 🔴 **Para CP1 siempre**, como fila con opciones excluyentes. El agente **no puede descartarla solo** |

**Mapeo pedido en el prompt** (*quien detecta clasifica*, `tk-implement §4.7.1`). Ninguno de los dos declara escala de severidad en su ficha, así que el mapeo va explícito:

| Fuente | Escala nativa | Mapeo pedido |
| --- | --- | --- |
| `architect` | tabla de opciones + `ADR requerido: Sí/No` | supuesto falsado contra el repo o pieza faltante → `rompe` · defecto no bloqueante → `está mal` · lo que exija elegir (incl. `ADR requerido: Sí`) → `decisión` |
| `project-planner` | severidad **por hallazgo**: `LOW / MEDIUM / HIGH` (columna `Risk` de su mapa de dependencias) | `HIGH` → `rompe` · `LOW`/`MEDIUM` → `está mal` · lo que exija elegir → `decisión` |

> 🔴 **No mapear el veredicto de la ficha de `project-planner`** (`✅ APROBADO / ⚠️ AJUSTES MENORES / 🔴 REQUIERE REVISIÓN`): es un **agregado por conteos** de la corrida, no la clase del hallazgo. Mapearlo convertiría en `rompe` a todos los hallazgos de una corrida con un solo `HIGH`.

El orquestador puede re-clasificar, nunca en silencio: `{origen} → {final} · {motivo}` se registra y se muestra en CP1 junto al ítem.

### Salida durable + ciclo

- Hallazgos → `manifest.plan_review: [{reviewer, class, claim, query_run, status}]` (audit). Las `decisión` resueltas → `manifest.gate_decisions`.
  - 🔴 El manifest muere en el cleanup de Phase 8. Lo que debe sobrevivirlo —hallazgos, caveats, `gate_decisions`, contador de CP1 **y el presupuesto resuelto con las lentes que NO se convocaron**— lo estampa Phase 8 (§20) como sección durable `## Plan Review (Phase 3.5 — {ISO 8601 UTC})` en el epic file, ANTES de borrar artifacts. Shape SSOT: [`methodology/epic-shape.md`](methodology/epic-shape.md) §Plan Review append. 🔴 **Una lente que el tier no convocó se registra, nunca se deduce de una fila ausente:** el consumidor aguas abajo ([`tk-implement §2.2`](../tk-implement/SKILL.md)) está escrito para detectar un revisor **caído**, y un panel recortado sin registro se leería como un panel limpio — el mismo fail-open, entrando por otra puerta.
- **Re-spawn sólo si cambia el sustrato**, medido por el `Decomposition hash:` de `parsed-plan.md` ([`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Decomposition hash). Aritmética, no juicio: hash distinto → re-corre el panel; hash igual → CP1 se re-presenta sin volver a revisar (ajuste de orden, de agrupación en epics o de redacción).
- 🔴 **Cap duro: 2 re-presentaciones de CP1 con hallazgos vivos.** En la **tercera** CP1 ofrece explícitamente *continuar aceptando el riesgo*, registrado en `gate_decisions`.
  - **El eje es la presentación de CP1, no la re-corrida del panel** — son cosas distintas y contarlas mal deja el loop abierto: el panel sólo re-corre si el hash cambia, mientras CP1 se re-presenta también cuando **no** cambia (ajuste de orden, de agrupación, de redacción). Contar re-corridas dejaría sin tope justo el camino que no mueve el hash.
  - 🔴 **El contador se arrastra.** Vive en `manifest.cp1_presentations`, y la opción 2 **re-emite el manifest** — así que el re-emit debe **copiar el valor previo e incrementarlo**, nunca partir de cero. Un contador que se resetea en el mismo acto que lo incrementa no cuenta nada.
  - El trigger semántico evita re-spawns inútiles; el cap evita el loop infinito. Los otros tres loops del workflow ya tienen cap (§17 = 1 ronda, §18 = 1 ciclo, CP2 = 3 rondas); éste sería el único sin él, a dos `opus` por vuelta.
- **Con usuario presente, Phase 4 no arranca** mientras quede un `rompe` sin resolver o sin descartar explícitamente, ni una `decisión` sin decidir.
- 🔴 **Headless (sin usuario) — tres ramas, no una.** El contrato vive aquí y su shape SSOT en [`methodology/readiness-gates.md`](methodology/readiness-gates.md) §Headless fail-closed (`plan_review_gate`):

| Hallazgo | Headless |
| --- | --- |
| `rompe` **con** `query_run` | 🔴 **STOP** — emite `plan_review_gate: {status: blocked, …}` a stdout + manifest. No se escribe ningún issue |
| `rompe` **sin** `query_run` | caveat en el manifest → **continúa**. Sin evidencia de la clase cerrada el disparo no sería reproducible, y este workflow no tiene gates que disparen por juicio |
| `decisión` | caveat en el manifest → **continúa**. No hay quién decida; CP1 la cacha cuando hay usuario |

> **Asimetría declarada a propósito:** en interactivo un `rompe` bloquea la opción 1 **cite o no cite** su consulta — el user puede pedirle al revisor que la sustente, o descartarlo por la opción 3. En headless no hay quién haga ninguna de las dos, así que el fail-closed se reserva a lo reproducible. La pregunta 1 sigue exigiendo la consulta en los dos runtimes; lo que cambia es el castigo por omitirla.

### Fallo de un revisor — nunca se lee como "limpio"

🔴 Si un revisor **cae, devuelve vacío o no emite hallazgos clasificados**, eso NO es un panel limpio: se registra como caveat explícito en `manifest.plan_review` (`reviewer: <nombre>, status: failed`), se nombra en el resumen de CP1, y en headless el revisor caído **SÍ dispara el bloque `plan_review_gate`** — aborta con `status: blocked`, cero hallazgos, y la caída narrada en `action` (fail-closed decidido: el caveat no tiene lector en headless, y continuar sería el fail-open que esta regla cierra; en interactivo el caveat + CP1 siguen como siempre). El `grounding_gate` de §12.4 hereda esta misma semántica por su "mismo cierre que §12.5". Sin esta regla un spawn caído produce cero hallazgos → manifest limpio → auto-advance, que es un fail-**open** silencioso sobre un gate que acaba de declararse fail-closed.

### Carry-over a Phase 7 — se DERIVA de una re-pasada, nunca de una afirmación

> **En tier ≤2 este carry-over no aplica, y se declara para que la ausencia no se lea como olvido:** su destinatario es `architect`, que en ese tier no corre en Phase 7 (§16). No es una dedup que se saltó — es que no hay a quién pasarle nada.

🔴 Sólo entran al prompt de Phase 7 (como *"ya resuelto en el panel pre-emisión — no re-levantar"*) los hallazgos que **una re-corrida del panel no volvió a levantar**: el hash cambió, el panel corrió otra vez, y el hallazgo desapareció. Un hallazgo cerrado por un ajuste que **no** movió el sustrato —y que por tanto no re-spawneó el panel— **no se carry-overea**: Phase 7 lo mira con ojos frescos.

> **Por qué la distinción no es cosmética:** la resolución de un `rompe` es la edición del user, no una pasada limpia del panel. Sin esta regla, un `rompe` puede quedar marcado como resuelto sin que ningún revisor lo haya vuelto a mirar, y encima con `architect` y `project-planner` —los dos únicos que podrían cacharlo en Phase 7— instruidos para callar. Eso es recortar **rigor**, no subprocesos, que es lo que [`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md) prohíbe por nombre: *"Jamás se recortan la planeación, los gates, el barrido de validación ni los checkpoints."*

**Ahorro sin bandera — por campo, no por deseo.** Un ítem cuyo plan traiga la línea `Refutado: <consulta>` ([`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) §Refutación previa, RF-prev) llega al prompt del panel con esa consulta, y el panel **no re-pregunta *¿existe?*** sobre él. La escribe el productor al emitir (`templates/REMEDIATION-PLAN.template.md`) y el parser la congela en `parsed-plan.md` — sin ese campo el dato no cruza la frontera entre workflows, porque `/backlog` corre en otra sesión y lo único que recibe es el archivo.

- 🔴 **La ausencia nunca se lee como "ya refutado":** un plan sin la línea —escrito a mano, o por una versión previa de `/implement`— hace que el panel pregunte **todo**. Es el default correcto, no un caso de error.
- **No es un skip:** la refutación de `/implement` refuta **ítems de deuda**, no la descomposición ni el orden ni las piezas faltantes. Las preguntas 2, 3 y 4 corren igual sobre un plan enteramente refutado.
- **Dos canales que coexisten, no compiten:** `Refutado:` transporta la verificación del **productor** del plan (cruza la frontera entre workflows dentro del archivo); la clasificación de §12.4 es la verificación **del propio run**. Mismo consumo en el panel: un ítem con cualquiera de las dos consultas citadas no se re-pregunta *¿existe?*.

---

## 13. Phase 4 — Issue emission (heavy, batched)

Delegated: **`bkl-issue-specer`** × **(número de epics)** — **one agent per epic** (each emits all the issues of its epic), epics run in parallel (**cap 6 concurrent** per message — mirrors `tk-design §13.1`; >6 epics → 2 olas). The parallelism unit is the **epic**, not the issue: amortiza el cold-start + las lecturas compartidas sobre los issues del epic. `model: opus` — tier `synthesize` ([`fx-execution-policy §3`](../fx-execution-policy/SKILL.md)): el paralelismo masivo no baja el tier, porque lo que la máquina valida aquí es la **forma** del archivo (el sweep de §18), no el criterio que el issue contiene; un AC equivocado sale limpio del sweep y lo paga `/implement`. **Es el subagente más caro del workflow y así se declara** — el presupuesto de §24 lo cuenta.

**Split heuristics (precedence matters — [`methodology/issue-shape.md`](methodology/issue-shape.md)):**

- **CRUD entity is the unit:** 1 CRUD set = 1 issue that **references multiple SCRs** (list/create/edit/detail together). Matches `sk-crud-scaffold`. (`greenfield` only.)
- `1 SCR = 1 issue` applies only to **standalone non-CRUD screens** (dashboards, reports, settings, landing). (`greenfield` only.)
- 1 standalone server action = 1 issue.
- CMP-XXX criterion B = 1 issue; criterion A folds into its SCR issue.
- A FLW spanning ≥3 SCRs → 1 dedicated `e2e-flow` issue.
- **Plan-mode:** 1 classified work-unit = 1 issue (orchestrator detect→classify→attribute, frozen in `parsed-plan.md`); cross-issue verification bullet → 1 `e2e-flow` issue; shared-file issues → one `sequential_chain` (connected components).

**`bkl-issue-specer` spawnea siempre, un agente por epic** (arriba), sin excepción por volumen — mismo criterio de aislamiento de contexto que Phase 1 ([`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md)): un epic de 1 issue lo aísla igual que uno de 20.

**Numbering is pre-assigned by the orchestrator before dispatch** (§15). Each `bkl-issue-specer` receives, from the manifest, the **sub-list of its epic's entries** (each: pre-assigned ID + sibling IDs + dependency edges read-only + **source kind** `discovery`|`plan` + target refs + packet or parsed-plan path + skills allowlist hints). The `depends_on` edges — **including cross-epic ones** — are pre-computed in the manifest by Phase 3 (§12, global graph), so a per-epic agent writes the `Depends on` IDs from its entries **without needing to see other epics' issues**; the closure of those edges into execution order is Phase 5.

**Plan-mode template choice:** the agent uses the same `ISSUE.template.md` canonical (11 sections, no lighter variant). The blockquote header gains `> **Source tier:** plan-mode` + `> **Plan source:** <path>#<anchor> (hash: <sha-12>)`. Per-section derivation rules in [`methodology/issue-shape.md`](methodology/issue-shape.md) §Plan-source issue body and `bkl-issue-specer` §source_kind handling.

Each agent emits **the N files of its epic** (one per entry) to `project/backlog/{LAYOUT}/issues/` (durable), deriving each filename from `id_convention` (`EPIC-NN-{DOMAIN}-{NNN}-{slug}.md`). The agent reads shared context (registry, template, common skills) **once** and iterates; on a per-entry failure it continues and flags the failed id in its return.

**Manifest `materialized` is updated from each agent's successful return report** (per-issue `{id, path, status: written}`) — **NOT pre-populated at dispatch**. So a crashed/partial spawn leaves the manifest recording only what was confirmed written; the orchestrator re-spawns the epic for the missing ids (idempotent overwrite).

**Pre-dispatch guards:** (a) **set-equality** — `∪(epic.issues) == manifest.issues` (no issue unassigned, no dup, no orphan) → STOP if mismatch; (b) **epic with 0 issues → skip** (no spawn).

**Post-batch (Phase 4 completion):** orchestrator (1) updates `materialized` from the returns, (2) **reconciles** `issues/` dir vs `manifest.materialized` — _missing_ keyed **by `id`** (the canonical shortform token, sweep-validated; filename derives deterministically from id+slug, so a slug quirk never produces a false-missing) → **re-spawn the epic's specer with `issues` = only the missing ids** (list-of-N, idempotent overwrite — never re-emits issues already written OK); _orphan/leftover_ keyed **by path** (a file on disk NOT in `materialized`, e.g. from a CP1 renumber the re-spawn didn't overwrite under the new `{NNN}`) → flag + clean (the sweep §18 re-checks this), then (3) fills each epic's `Issues table` + `## Topology` SSOT.

---

## 14. Phase 5 — Cross-epic refs + dependency closure

Orchestrator-direct:

- Resolve transitive `Depends on` (X→Y→Z ⇒ X depends on Z, surfaced in EXECUTION-ORDER).
- Detect cycles → FAIL emits `decisions/DECISION-BACKLOG-XXX-{slug}.md` blocker.
- Emit `EXECUTION-ORDER.md`: global topological sort + Wave assignment + parallelism hints. **This file is the SSOT of execution order** (BOARD.md is alphabetical, §3.2).

---

## 15. Phase 6 — Coverage gate (orchestrator-direct)

Coverage is measured **by reference in blockquote**, NOT by "dedicated issue" (a grouped CRUD issue covers several SCRs).

**`greenfield` checks:**

| Check                                                             | On FAIL                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Each FT in `03_DEEP_DIVE.md` referenced by ≥1 issue (`Features:`) | List missing → user resolves inline or defers (DECISION-BACKLOG-XXX) |
| Each SCR in `16_DESIGN/` referenced by ≥1 issue (`Screens:`)      | List missing                                                         |
| Each CMP-XXX (criterion A/B) referenced by ≥1 issue               | List missing                                                         |
| Each FLW-XXX (≥3 SCRs) has an `e2e-flow` issue referencing it     | List missing                                                         |
| Each MVP persona referenced by ≥1 issue (`Personas:`)             | List orphan personas                                                 |
| Each RBAC role exercised by ≥1 issue                              | List unused roles (warning, not blocker)                             |
| Each `ui_touching` epic has a `ui-critic` issue                   | (already pre-assigned in Phase 3 — sweep verifies)                   |

**`operational` (plan-mode) checks** — narrower (no FT/SCR/persona refs available by construction):

| Check                                                                  | On FAIL                         |
| ---------------------------------------------------------------------- | ------------------------------- |
| Each enumerated file covered by ≥1 issue                               | List orphan files               |
| Each issue resolves ≥1 file (§6 Contexto Técnico non-empty — N2)       | List empty issues               |
| Shared file (in ≥2 issues) → those issues NOT both `parallelizable`    | List bad overlap → fix topology |
| Each verification bullet covered by ≥1 AC across the epic              | List orphan bullets             |
| Each `ui_touching` epic has a `ui-critic` issue (if applicable)        | List missing                    |

Coverage results + counts + `source_hashes` (greenfield) / plan-hash **+ `Decomposition hash:`** (operational) are written to `COVERAGE-MATRIX.md` in Phase 8. 🔴 El decomposition-hash necesita **este** hogar y no el manifest: el manifest vive en `backlog-artifacts/{run-id}/` y §20 lo borra al cerrar, mientras `validar` corre en una corrida posterior — un hash que sólo viviera ahí desaparecería antes de que alguien pudiera compararlo.

---

## 16. Phase 7 — Adversarial validation (panel por modo y, en plan-mode, por tier de riesgo)

Generic agents, single message, non-overlapping scopes. No-write discipline (prompt-enforced, `fx-workflow-authoring §9`): "Emit findings inline. Zero Write/Edit — orchestrator writes outputs."

**La composición la deciden `extension_mode` y, en plan-mode, el tier resuelto en Phase 0.5. Es declarada y cerrada — nunca un juicio por corrida.** La tabla normativa de tiers vive en §24; **la de aquí es su derivada — si divergen, gana §24**:

| `extension_mode` | Panel                                                                          | Por qué                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `greenfield`     | `product-owner` · `architect` · `project-planner` · `quality-engineer`         | No hay fase previa que revise nada: Phase 3.5 es plan-mode only. Cada lente entra una sola vez en toda la corrida. **Exento-fijo declarado:** no hay plan que enumere superficie, así que no hay tier que resolver (§24). |
| `operational`, tier ≥3 | `architect` · `quality-engineer`                                          | Los otros dos ya no aportan una pasada nueva aquí — ver el primer recorte abajo.                                        |
| `operational`, tier ≤2 | `quality-engineer`                                                        | Encima del recorte por origen, el presupuesto por riesgo de §24 retira también a `architect`. **Su costo va declarado abajo, sin suavizarlo.** |

🔴 **Dos recortes, dos ejes — y ninguno de los dos es el tamaño del run** (esa prohibición sigue intacta — §24). El primero es por **origen del input** y sale de que en plan-mode existe [`§12.5`](#125-phase-35--plan-review-panel-adversarial-pre-emisión--plan-mode-only) y en `greenfield` no. El segundo es el **tier de riesgo** de §24, resuelto sobre los archivos que el plan enumera. Se acumulan: el origen decide qué lentes tienen objeto nuevo, el tier decide cuántas de ésas se pagan. El recorte por origen:

- **`project-planner` sale** porque en plan-mode ya corrió en Phase 3.5 sobre **el mismo sustrato** (archivos atribuidos, topología del grafo shared-file). El carry-over de abajo existe justamente porque si no, levanta el mismo hallazgo dos veces. Lo estructural que sí cambia entre las dos fases —que la topología emitida respete el orden— lo valida **mecánicamente** el coverage gate de Phase 6, no un lente.
  - 🔴 **Esa premisa sigue siendo cierta bajo el presupuesto por riesgo, y lo es por construcción, no por inercia.** En tier ≤2 `project-planner` puede no spawnearse en §12.5, pero su pregunta de orden —la 3, *¿el trabajo se puede hacer en ese orden sin dejar el repo roto entre dos issues?*— la **absorbe `architect`** por mandato explícito (§12.5 §Las 4 preguntas). Si esa absorción se retirara, este bullet quedaría afirmando algo falso justo en el tier reducido: nadie habría mirado el orden antes de escribir los issues, y `project-planner` tampoco lo mira después.
- **`product-owner` sale** porque en `operational` su check principal ya venía saltado (**SKIP coverage matrix** — no hay refs de discovery contra qué medir). Le quedaba title clarity + scope-creep vs los límites del plan, y el scope-creep contra el plan es exactamente lo que Phase 3.5 pregunta al refutar el plan como plan.
- **`architect` y `quality-engineer` se quedan** porque su objeto sí es nuevo: los **issues escritos**, que en Phase 3.5 todavía no existían. `quality-engineer` además es quien hace cumplir `DOR_DOD.md` por issue, y nadie más lo hace en toda la corrida.

> 🔴 **Lo que estos recortes NO derogan:** que el plan y los issues escritos son **objetos distintos** y que **ninguna revisión sustituye a la otra**. Lo que el origen retira son los dos lentes cuyo objeto en plan-mode **no cambió** entre Phase 3.5 y Phase 7.
>
> - **En tier ≥3 la universal rige entera:** `architect` corre en las **dos** fases y no se dedupea.
> - 🔴 **En tier ≤2 los issues escritos quedan SIN lente arquitectural, y ése es el costo — se declara, no se disfraza.** `quality-engineer` **no** ocupa ese lugar: no hace ninguno de los tres chequeos de `architect` (route convention vs `sk-project-structure`, schema impact, SK leverage), y escribir que lo cubre contradiría la universal de arriba dentro de la misma sección que la enuncia. Lo que se compra a cambio, dicho como es: en ese tier la superficie que el plan enumera no matchea **ninguna** regla de riesgo ≥3 del registry —ni rutas de API, ni schema, ni auth, ni la doctrina always-on del cerebro—, así que los tres chequeos tienen poco que morder; y `architect` **sí** revisó el plan en §12.5, con las preguntas 1, 2 y 3. Lo que queda descubierto es el salto del plan al issue escrito en esa lente, y no lo cubre nadie más.
> - **El carry-over §12.5→Phase 7 no aplica en tier ≤2**, y no por dedup: no hay `architect` en Phase 7 a quien pasárselo. Se declara para que la ausencia no se lea como un olvido del estampado.
> - **Se registra, no se deduce:** la sección durable `## Plan Review` del epic file estampa el presupuesto resuelto y **qué lentes no se convocaron**, para que aguas abajo un panel recortado no se confunda con uno limpio ([`methodology/epic-shape.md`](methodology/epic-shape.md) §Plan Review append).

**Shape de invocación** ([`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md)): los que compongan el panel corren con **el modelo de su ficha, explícito** —pasado en el spawn en vez de heredado, para que bajar una ficha por descuido no degrade un pase adversarial en silencio: `opus` para todos, que es el tier `review` completo ([`fx-execution-policy §3`](../fx-execution-policy/SKILL.md))— con su `phase` declarada (`Phase 7 — adversarial validation`) y los paths de skills que su lente necesita citados en el prompt (`CC.md §2`):

| Validador | Modos en que corre | Skills a citar en el prompt |
| --- | --- | --- |
| `architect` | `greenfield` · plan-mode **tier ≥3** | `.claude/skills/fx-execution-policy/SKILL.md` · `.claude/skills/kb-ssot-registries/SKILL.md` |
| `quality-engineer` | todos los paneles de la tabla de arriba | `.claude/skills/sk-testing-nextjs/SKILL.md` · `.claude/rules/DOR_DOD.md` |
| `product-owner` | sólo `greenfield` | `.claude/skills/sk-features-index/SKILL.md` |
| `project-planner` | sólo `greenfield` | `.claude/skills/sk-features-index/SKILL.md` |

> Los mismos paths aplican al re-emit correctivo de **Phase 7.5/7.6**: es el mismo validador re-spawneado sobre un subconjunto, no un rol distinto. Each receives repo-relative skill paths + the `extension_mode` flag (drives conditional scope).

> 🔴 **Carry-over del panel de §12.5 (plan-mode, tier ≥3 — en tier ≤2 no hay destinatario, §24).** Aplica a **`architect`**, el único que corre en las **dos** fases sobre el mismo sustrato (archivos atribuidos, topología del grafo shared-file): sin esto levanta el mismo hallazgo en CP1 y otra vez en CP2. (`project-planner` ya no llega a Phase 7 en plan-mode — §16 —, así que para él la colisión desaparece en vez de gestionarse.) Su prompt recibe la lista de hallazgos del panel marcados *"ya resuelto — no re-levantar"*, junto al `extension_mode`. 🔴 **Sólo entran los que una re-corrida del panel no volvió a levantar** — nunca los cerrados por una edición que no movió el sustrato (§12.5 §Carry-over): el carry-over se deriva de una re-pasada, jamás de una afirmación, porque recortar el barrido de validación es recortar rigor (`fx-workflow-authoring §8`).

| Agent              | `greenfield` scope                                                                              | `operational` (plan-mode) scope                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `product-owner`    | FT/persona/AC coverage matrix · MoSCoW priorities · scope creep · issue title clarity           | **No corre** (§16): su check principal ya venía saltado por falta de refs de discovery, y el scope-creep contra el plan lo cubre Phase 3.5. |
| `architect`        | Route convention vs `sk-project-structure` · schema impact vs `09_DATA_MODEL` · SK leverage     | **Tier ≥3:** same checks, but schema impact derives from the issues' attributed files (no `09_DATA_MODEL`). **Tier ≤2: no corre** (§24) — el costo de esa lente ausente va declarado arriba. |
| `project-planner`  | Topological soundness · `parallelizable_issues` + `sequential_chains` validity · Wave realism   | **No corre** (§16): mismo sustrato que ya revisó en Phase 3.5; la topología emitida la valida el coverage gate de Phase 6.  |
| `quality-engineer` | DoR/DoD per issue · 3-layer test plan · component AC for UI-interactive · E2E AC for cross-page | Same, but the DoR gate UI detection reads §6 Contexto Técnico file paths, not SCR keywords.       |

Skipped checks emit `// skipped — plan-mode input, no discovery refs` line in validator **internal** report → orchestrator extracts plain language for CP narration (NO surface the technical comment raw per `CC.md §3`): "el panel corrió con scope reducido porque este backlog viene de un plan, no de discovery completo: la cobertura de producto ya se revisó al refutar el plan, y el orden lo revisó el panel pre-emisión antes de escribir los issues —con `project-planner`, o con `architect` absorbiendo esa pregunta cuando el presupuesto por riesgo no lo convocó."

**El panel que fijan el modo y el tier corre completo; el tamaño del run no lo mueve.** Dos planes `operational` con la misma superficie enumerada llegan a Phase 7 con el mismo panel, traigan 3 issues o 16 — no hay umbral de conteo que reduzca el panel a un subconjunto (el predicado que lo hacía se retiró — ver el `CHANGELOG.md` co-locado). 🔴 **La distinción no es cosmética:** el modo y el tier son propiedades del **input** (¿hubo discovery? ¿corrió Phase 3.5? ¿qué riesgo asigna el registry a los archivos que el plan enumera?), conocidas antes de empezar y verificables; el tamaño es una propiedad del **resultado**, y recortar por él haría que un run grande —el que más riesgo acumula— sea justo el que menos se revisa. Phase 7.5 rutea igual en todos los casos: el blocker va al validador que lo levantó, sin distinción por tamaño.

### Fallo de un validador — nunca se lee como "validación limpia"

🔴 Si un validador **cae, devuelve vacío o no emite hallazgos clasificados**, eso NO es una validación limpia — molde de §12.5 §Fallo de un revisor, aplicado aquí: se registra como caveat explícito, se **nombra en CP2** junto al veredicto, y en **headless la corrida aborta con la causa narrada**, nunca continúa en silencio — emitiendo el bloque estructurado `validation_gate` a stdout + manifest ([`methodology/readiness-gates.md`](methodology/readiness-gates.md) §Headless fail-closed; reusa el shape primario de `plan_review_gate`, no una mecánica nueva de gate). Sin bloque, un abort es indistinguible de un crash, que es la razón escrita de ese contrato. Aplica a los tres paneles de la tabla de arriba, en los dos `extension_mode`.

> **Por qué la regla pesa más cuanto más chico es el panel.** Un validador caído produce cero hallazgos, y cero hallazgos se lee como panel limpio → auto-accept. Con varias lentes la redundancia enmascara el hueco. Con **un** validador en tier ≤2 no hay nada que lo enmascare: leer su caída como silencio limpio deja la corrida entera sin validación post-emisión y nadie se entera. Sin esta pieza, el conjunto del tier ≤2 no sería seguro.

> 🔴 **`/backlog` consume UN renglón del registry y queda exento del otro — los dos casos escritos, ninguno implícito.** La agregación de [`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md) tiene **dos** renglones independientes (`risk = máximo` · `require = unión ∪ panel_by_risk[risk]`). Declarar la exención sobre uno solo dejaría el otro resuelto por omisión, que es justo lo que esta nota existe para impedir:
>
> - **`risk` — CONSUMIDO** (plan-mode). Es lo que fija el presupuesto de §24: se resuelve en Phase 0.5 sobre los archivos que el plan **enumera**, nunca sobre lo que el run escribe. Evaluado por su output —markdown en `project/backlog/**`, sin paths de código— resolvería riesgo 0 siempre ([`fx-execution-policy §6`](../fx-execution-policy/SKILL.md), "un workflow documental evaluado por lo que escribe daría riesgo 0 siempre"). En `greenfield` no hay plan que enumere: ese modo sigue exento-fijo, con su panel declarado en la tabla de arriba.
> - **`require` — EXENTO, con razón propia.** Los revisores que ese renglón convoca tienen otro **objeto**: `fx-factory-reviewer` audita el artefacto del cerebro **como quedó escrito** (la regla `.claude/**` lo pone en su `require`), `security-auditor` el **diff** de código, `ui-critic` la **UI renderizada**. Ninguno de los tres tiene objeto en este workflow: `/backlog` cierra antes de que exista un diff, y lo que emite es backlog, no cerebro ni UI. Los dos que **sí** tienen objeto aquí —`architect` y `quality-engineer`— ya los convoca la composición declarada de §12.5/§16, así que la unión no agregaría una lente nueva: agregaría lentes sin nada que mirar, el modo de falla que [`fx-execution-policy §7`](../fx-execution-policy/SKILL.md) prohíbe.
> - **Qué pasa con un override de proyecto — dicho, no dejado implícito.** El nivel entra por la unión kit ∪ override ([`§4.2`](../fx-execution-policy/SKILL.md)), así que un derivado que **suba el `risk`** de sus paths sensibles sí compra más escrutinio aquí: un plan que los enumere resuelve un tier más alto y paga la composición completa. Lo que **no** surte efecto en `/backlog` es agregar nombres al `require` o al `panel_by_risk`: ese endurecimiento vale para el cierre de `/implement` (`§4.6`/`§4.8`), no para este workflow. Se declara para que nadie compre un endurecimiento inerte sin enterarse.
>
> **El PANEL sigue sin cablearse a `panel_by_risk`, y la razón no cambió:** sus niveles `"0"` y `"1"` están **vacíos**, así que derivar de ahí dejaría una corrida sin ningún revisor. Lo derivado del registry es el **conteo de pases** (el nivel); las composiciones de cada tier son declaradas y cerradas en §24. Lo único que §12.5 toma además de `fx-execution-policy` es la **taxonomía de clases** de su `§4.4` — por puntero, e independiente del `loop_by_risk`.

**`ui-critic` is NOT in Phase 7.** It runs at epic-close (`/implement` time, on rendered UI) via the pre-assigned `ui-critic` issue (§17). Phase 7 validates structure, not visuals.

---

## 17. Phase 7.5 — Blocker Resolution Round (1 cycle, mirror tk-design)

Only if Phase 7 produced ≥1 blocker. **1 round.** Targeted re-emit (re-invoke `bkl-issue-specer` with a **1-issue list** for each offending ID — same per-epic agent, batch of one, idempotent overwrite) + selective validator re-run (route blocker → `architect` only, etc.). Surviving blockers → CP2 with explicit defer option (`DECISION-BACKLOG-XXX`). Detail: [`methodology/readiness-gates.md`](methodology/readiness-gates.md).

---

## 18. Phase 7.6 — Pre-CP2 Canonical State Sweep

| Criterion                                                                                                                            | If FAIL                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Blockquote header valid per issue (Issue ID, Epic, Priority, Status, Skills, 3 `Refs (...)` lines, DoR Waivers)                      | STOP, re-spawn `bkl-issue-specer`                          |
| `Issue ID:` is shortform `^[A-Za-z]+-[0-9]+$`; ID unique per convention scope (global or per-epic)                                   | STOP, re-name/re-number                                    |
| Filename matches `id_convention` shape (shortform or compound)                                                                       | STOP, re-name                                              |
| `## Implementation Evidence` present per issue (commit hook needs it)                                                                | STOP, re-emit                                              |
| `manifest.materialized` == `issues/` dir — _missing_ keyed by `id`, _orphan_ keyed by path (reconcilia crash parcial / renumber CP1) | STOP, reconcile (re-spawn only missing ids / clean orphan) |
| No issue depends on another with a higher global number within the same epic                                                         | STOP, force re-topo                                        |
| `parallelizable_issues ∪ sequential_chains.flat() == epic.issues` (set equality)                                                     | STOP, fix mapping                                          |
| Per-issue `> **Parallelizable:**` ⟺ membership in epic Topology SSOT                                                                 | STOP, fix                                                  |
| Each `partial`/`blocked` issue has a tracking ID adjacent                                                                            | STOP, force user classify                                  |
| Coverage matrix ≥1 issue per FT/SCR/persona (greenfield) OR per enumerated file (operational) + shared-file overlap ⟹ not-both-parallelizable, consistent with §15                        | WARNING — surface in CP2                                   |
| Plan-mode: every issue has `Source tier: plan-mode` + `Plan source` + `Plan hash` lines                                              | STOP, re-emit                                              |
| Plan-mode: every issue's `§6 Contexto Técnico` resolves ≥1 file (no empty issue — N2)                                                | STOP, re-emit / re-classify                                |
| Plan-mode design signal: `scr_matches` present in the manifest for an issue ⟹ `Refs (design)` is populated (not `— · —`) in that issue (Phase 0.6) | STOP, re-emit with the ref                       |

Sweep PASS → CP2. FAIL → re-emit + re-sweep (max 1 cycle).

---

## 19. CP2 — Plan Mode formal

Mirror `tk-design §19`. Enter Plan Mode with full synthesis (coverage matrix, blockers cerrados, deferred decisions, metrics). **En plan-mode el resumen incluye además la línea del presupuesto resuelto**, con el mismo formato por-regla-con-origen de CP1 (§11) y en el mismo lenguaje plano —*revisión del plan* / *validación de los issues escritos*, nunca `§12.5` ni `Phase 7` crudos— y se emite tanto si CP2 para en Plan Mode como si auto-acepta; un recorte que sólo se narró al principio del run no llega al lector de la decisión final. Numbered options:

| Option | Action                                                            |
| ------ | ----------------------------------------------------------------- |
| 1      | **Accept** → Phase 8 finalize.                                    |
| 2      | **Edit** → return to Phase 7.5 with marked items (1 cycle).       |
| 3      | **Manual Round 2** → re-execute Phase 7.5 (override 1-round cap). |
| 4      | **Reject** → rollback + workflow ends.                            |

**Reject rollback (durable + manifest-precise):** delete **exactly the paths the manifest recorded as created this run** (epics + issues) — nothing else — then re-run `pnpm update-board`. In `extend` / `extend-epic` modes this only removes the new files; pre-existing issues are untouched (the manifest distinguishes them).

> 🔴 **Rollback anti-pattern:** never `rm` by version glob, never `git checkout`/`git restore`. Only delete the exact manifest path list (avoids wiping prior work).

**Modo (`fx-workflow-authoring §7.1`):** CP2 es Plan Mode formal en **`--step`**. En **fluido** (default), su output es **reversible** (issues/epics regenerables — el Reject borra exactamente las paths del manifest), así que si Phase 7.6 cerró **sin blockers y sin coverage-shortfall** → CP2 **auto-acepta** (resumen plain de cobertura + métricas, en vez de abrir Plan Mode) y pasa a Phase 8. Un **overlap-WARNING** (shared-file, §18) NO para — se surfacea en el resumen. Con **blockers o coverage-shortfall** (señal real §1) → CP2 **para** en Plan Mode como arriba. (Auto-accept de output reversible declarado en `fx-workflow-authoring §7.1` + el comentario del template planmode.)

Cycle state machine max 3 rounds (1 auto + 1 Edit + 1 Manual Round 2). Reuses `fx-workflow-authoring/templates/checkpoint-planmode.template.md`.

---

## 20. Phase 8 — Emit + handoff

- Finalize epic files (Issues table + Topology populated).
  - **Estampado del carry-over del panel (plan-mode only — `add <plan>` / `extend-epic`).** Sub-paso de este mismo finalize — mismo escritor, mismo objeto — y 🔴 **obligatoriamente ANTES de `pnpm update-board`, del `rm -rf` de artifacts (de ahí sale el dato) y del `git add` del `CP-commit`** (para que entre en el commit de cierre). El orquestador escribe en el epic file la sección durable **`## Plan Review (Phase 3.5 — {ISO 8601 UTC})`** con lo que §12.4/§12.5 dejaron en el manifest efímero (`plan_review`, `gate_decisions`, `cp1_presentations` y el **`risk_budget`** de Phase 0.5 — el presupuesto resuelto con las lentes que el tier no convocó): es el canal que `/implement §2.2` consume para no re-litigar lo ya resuelto **y para saber qué NO se revisó**. Tercer append post-hoc del epic y el primero escrito por `/backlog` — anatomía SSOT en [`methodology/epic-shape.md`](methodology/epic-shape.md) §Plan Review append (ahí viven el shape de fila, el enum de `status` y la semántica de ausencia). En `nuevo` / `extend` / `validar` NO se estampa nada: sin panel no hay sección, y la ausencia ya significa "no hubo panel".
    - **Mecánica reusada, no inventada:** en `add <plan>` el epic nació de [`templates/EPIC-PLAN-SOURCE.template.md`](templates/EPIC-PLAN-SOURCE.template.md), que trae la sección con placeholders — este sub-paso la llena. En `extend-epic` no corrió template (el epic preexiste): se **appendea** con el mecanismo de los dos precedentes (`printf '\n%s\n' "${SECTION}" >> "${EPIC_FILE}"` — QC Report / QC Delta). 🔴 El ancla de timestamp en el heading NO es opcional: existe para poder repetirse — un segundo `extend-epic <plan>` sobre el mismo epic appendea una segunda sección, y `/implement` las distingue con un `grep` anclado al heading; sin timestamp, dos headings idénticos y el consumidor no sabe cuál leer.
    - **El campo `Cubre:` es obligatorio y es el ÚNICO lugar de la sección donde viajan IDs de issue:** enumera los issues emitidos por ESTE run (el alcance que el panel revisó). En `extend-epic` el epic preexiste y la sección cubre sólo la extensión; `/implement §2.2` intersecta este campo contra su SELECTION SET — lo cubierto entra como carry-over, lo no cubierto se mira con ojos frescos.
    - **El `status` de cada fila proviene del manifest, con `resolved` DERIVADO, nunca afirmado** (§12.5 §Carry-over): `resolved` sólo si una re-corrida del panel (hash movido) no volvió a levantar el hallazgo; cerrado por un ajuste que no movió el hash → queda `live` (nadie lo volvió a mirar); descartado por el user → `dismissed`, con su entrada en Gate decisions. El caveat de revisor caído cruza como **fila propia con `status: failed`** — cuarto valor del enum, sin `class`/`claim`/`query_run`. Omitir esa fila sería el fail-open de §12.5 §Fallo de un revisor, reabierto en el canal durable: el consumidor leería un panel limpio donde hubo un revisor caído. **La lente que el presupuesto por riesgo no convocó cruza como fila propia con `status: not-convened`** — quinto valor del enum, también sin `class`/`claim`/`query_run`, y con la fase que no la convocó calificando al `reviewer`; omitirla reabre el mismo fail-open por la puerta de la lente ausente ([`methodology/epic-shape.md`](methodology/epic-shape.md) §Plan Review append).
    - **Cada entrada de Gate decisions viaja con el `Decomposition hash` vigente al resolverse/descartarse** — es el dato contra el que `/implement` mide frescura (el predicado de drift vive allá, no aquí; este workflow sólo garantiza que el hash cruce).
    - 🔴 **Rendering — tres restricciones duras, no una, porque la sección COPIA texto ajeno y el epic file es superficie del hook (§3, §3.1):**
      1. `status` renderiza como **palabra** (`live` / `resolved` / `dismissed` / `failed` / `not-convened`), nunca como glyph.
      2. **El estampador SANEA el texto copiado: ningún `✅` sobrevive en el cuerpo, venga de donde venga.** `project-planner` emite nativamente filas de su mapa de dependencias con `✅` junto a IDs, y `claim` transporta por construcción lo que el revisor afirmó — un `✅` pegado a un token con forma de ID dentro del epic file es exactamente el patrón que `validate-commit.sh` lee como cierre.
      3. **`claim` no cita IDs de issue en crudo.** El hook resuelve `EPIC_FILE` con un fallback `grep -lE "<ID>"` sobre *todos* los epics, y 294 de 638 issues del repo tienen nombre legacy que activa esa rama: un ID en prosa puede hacer que un epic ajeno gane el `head -1` y bloquee un commit legítimo señalando el epic equivocado. Los IDs viajan **sólo** en `Cubre:`.
- Write `EXECUTION-ORDER.md` + `MILESTONE-MAP.md` + `README.md` + `COVERAGE-MATRIX.md`.
- The pre-assigned `ui-critic` issues are already materialized (Phase 4) — no late bolt-on.
- `pnpm update-board` (rollup to `project/backlog/BOARD.md`).
- **Cerrar la fila `Backlog` en `project/planning/project-config.md` §2 Pipeline Status.** Cumple el contrato del template (`Cada workflow actualiza su fila al cerrar`). NO es un Edit a ciegas — flujo **Read-first → branch**:
  - **Guards (skip sin tocar nada):** modo `validar` (read-only) · `is_factory: true` (el Factory tiene su propia tabla schema-v2 por diseño).
  - **Read** `project-config.md`, localizar la sección `## 2. Pipeline Status` y la fila cuyo primer campo es `Backlog`.
  - **Sección/fila ausente** (derivado bootstrapeado sin `/discovery`, o config custom) → warning de 1 línea + continuar (no falla el workflow).
  - **Celda Estado ya `✅ Completo`** → skip real (no-op, no se emite Edit) — caso re-run `extend`.
  - **Celda Estado distinta** → `Edit` con `old_string` **copiado literal de la línea leída** (padding incluido), actualizando **2 celdas**: Estado → `✅ Completo` y Documento → `project/backlog/{LAYOUT}/` (layout de Phase 0).
- Cleanup canónico del `{run-id}/` con flag check `--keep-artifacts`. Respeta R-NEW-1 (borra solo `{run-id}/`, nunca el dir padre):

  ```bash
  # Pre-condiciones (contrato del orchestrator):
  #   ${ARGUMENTS}  — args del slash command (puede estar vacío)
  #   ${RUN_ID}     — timestamp+slug generado en Phase 0. Guard defensivo abajo
  #                  previene catástrofe si la invariante falla por bug futuro.
  [ -n "${RUN_ID}" ] && [ -d "project/backlog-artifacts/${RUN_ID}" ] || exit 0

  if echo "${ARGUMENTS:-}" | grep -qE '(^|[[:space:]])--keep-artifacts([[:space:]]|$)'; then
    echo "ℹ️  artifacts del run ${RUN_ID} conservados (--keep-artifacts)"
  else
    rm -rf "project/backlog-artifacts/${RUN_ID}" && \
      echo "🧹 ${RUN_ID} limpiado (registry + manifest + parsed-plan eran ephemeral)"
  fi
  ```

- Surface en el resumen de handoff: _"Marqué Backlog ✅ en project-config."_ (o el warning, si aplicó el fallback).
- **Central backlog sync — estampado de UUIDs (paso a, PRE-commit).** Antes del `git add` del `CP-commit`, `npx @timekast/factory backlog push --stamp` sobre los issues durables del run: reconcilia el backlog con el central y **estampa de vuelta los UUIDs** en los archivos locales, de modo que entran al **mismo** commit de cierre (no un commit follow-up). Best-effort/fail-soft — **jamás bloquea el CP-commit** (mismo principio que [`tk-deploy §7.5.6`](../tk-deploy/SKILL.md): observability best-effort que nunca aborta el flujo que la invoca). Guards (skip sin tocar nada):
  - **`is_factory: true`** (este repo — guard D9) → skip: el Factory nunca sincroniza su propio backlog al central. En ESTE repo el paso (a) siempre skipea.
  - CLI `@timekast/factory` no disponible en el entorno (`command -v` falla) → nota, sin estampar.
  - **Preflight `BACKLOG_CENTRAL` (local, sin red, una vez por run — evaluarlo ANTES de invocar `npx`):** el alta del proyecto en el central **no es automática** (requiere `factory provision --services=backlog` a mano), así que el default de la flota es `off`. Con `off` → **cero invocaciones de `npx`** en los pasos (a) y (b), una nota de 1 línea, sin salir a npm a resolver el paquete para que el CLI degrade a exit 0.

    🔴 **El bloque bash NO vive aquí — hacer `Read` de [`fx-backlog-central`](../fx-backlog-central/SKILL.md) § _El bloque canónico del preflight_ y evaluarlo ahí mismo.** Es su SSOT (lo comparte con `tk-implement`, que lo lee igual). El `Read` es **explícito y obligatorio** (`CC.md §2`): esa skill se auto-carga por triggers semánticos de usuario que **no** coinciden con este momento del cierre, así que el auto-routing no garantiza tenerla cargada aquí.
  - `--stamp` falla a media corrida (red caída) → nota; el commit sigue sin los UUIDs nuevos y el próximo `push` los estampa en su momento.
- **Cierre — `CP-commit`** (`GIT.md §3.5`): tras el cleanup, ofrecer `1. nada / 2. commit / 3. commit + push`. `git add` de los durables (`project/backlog/{LAYOUT}/` + la fila cerrada en `project-config.md` + `.claude/policy/quality-gates.project.json` si §9.1 agregó una entrada con aprobación), subject `docs(backlog): …`, sin push salvo opción 3 (branch actual, NUNCA main). Guard de main + degrade headless a opción 2 por `GIT.md §3.5`. ℹ️ `BOARD.md` lo auto-commitea el pre-commit (lint-staged corre `update-board` + `git add BOARD.md` cuando el commit toca `issues/*.md`) — no hace falta agregarlo al `git add` explícito. ℹ️ El paso (a) ya estampó los UUIDs sobre los issues durables, así que entran en este mismo `git add`.
- **Central backlog sync — reflejo read-only (paso b, POST-commit).** Tras el `CP-commit`, `npx @timekast/factory backlog push` (read-only) refleja el backlog al central. Mismo carácter best-effort/fail-soft que el paso (a). Guards (skip sin tocar nada):
  - **`is_factory: true`** (guard D9) → skip: el Factory nunca pushea su propio backlog. **En ESTE repo el paso (b) siempre skipea.**
  - opción `1. nada` del CP-commit (queda local, sin commit) → skip: sin commit no hay estado durable que reflejar.
  - **`BACKLOG_CENTRAL=off`** (mismo preflight del paso (a), ya evaluado — no re-evaluar) → skip sin invocar `npx`.
  - CLI no disponible o key inválida con `on` → skip-con-nota (`push` retorna exit 0 + nota; el flujo no se bloquea).
  - con `on` y commit hecho → `npx @timekast/factory backlog push` + narración plain del resumen (issues creados/actualizados en el central).
- **Headless (paso a + paso b):** idéntico al interactivo — mismos guards fail-soft, **sin prompts nuevos**: ni `--stamp` ni el push read-only piden input; el único gate del cierre sigue siendo el `CP-commit` existente (que en headless degrada a opción 2 por `GIT.md §3.5`).
- Recommend → `/implement {first P0-ready issue}`.

---

## 21. Numbering, topology & ui-critic

Detail in [`methodology/numbering-and-topology.md`](methodology/numbering-and-topology.md) + [`methodology/ui-critic-integration.md`](methodology/ui-critic-integration.md) + [`methodology/derived-project-conventions.md`](methodology/derived-project-conventions.md).

### ID scheme — convention-flexible

**Single active convention:**

| Convention      | Filename                           | `Issue ID:` blockquote        | Numbering scope           |
| --------------- | ---------------------------------- | ----------------------------- | ------------------------- |
| `epic-compound` | `EPIC-NN-{DOMAIN}-{NNN}-{slug}.md` | `{DOMAIN}-{NNN}` (shortform!) | per-epic within `EPIC-NN` |

**Key insight:** `Issue ID:` blockquote uses shortform `{DOMAIN}-{NNN}`; the compound prefix lives only in the filename. The hook validates against the shortform token via token-boundary `grep` over `*/issues/*.md`.

- **Epics:** `EPIC-NN-{slug}` (`EPIC-00` reserved for bootstrap). Number at front → `epics/` lists in logical order. Epic tokens `^EPIC-[0-9]+$` are SKIPPED by the hook (not closeable issues).
- **`{DOMAIN}`** = uppercase domain code (`AUTH`, `MOV`, `SETUP`, …).
- **`{NNN}`** = zero-padded 3 digits, **step=1** (`001, 002, 003, …`). Ceiling 999 issues per epic (20× margin vs any realistic epic).
- Special types carry the role in the slug, not the ID: `AUTH-004-ui-critic-{epic-slug}`, `MOV-007-e2e-flow-{flw-slug}`.
- `extend` / `extend-epic` continues from `max(existing within scope) + 1` linearly. Legacy backlogs (`global-gap-10`) get the same `max+1` treatment — see [`methodology/numbering-and-topology.md`](methodology/numbering-and-topology.md) §Legacy mode.

### Topology (epic = SSOT)

The epic `## Topology` block is the single source of truth for parallelism:

```yaml
parallelizable_issues: [AUTH-003, AUTH-004] # zero-dep singletons within the epic
sequential_chains: # each chain serial; chains run parallel to each other
  - [AUTH-005, AUTH-006]
```

Per-issue `> **Parallelizable:**` is derived; the sweep (§18) enforces coherence. Within an epic, no issue depends on one with a higher number. Across epics, cycles are blockers.

### ui-critic

For each `ui_touching` epic, a `ui-critic` issue is **pre-assigned in Phase 3** (enters CP1 + Phase 6/7/7.6 + EXECUTION-ORDER) and materialized in Phase 4 as the last node of the epic's sequential chain — **emitted within its epic's `bkl-issue-specer` batch** (the agent emits all of the epic's issues, ui-critic included), not a separate spawn. It invokes the `ui-critic` agent at `/implement` time on rendered UI. Opt-in per-issue: user flags a UI-heavy issue at CP1/CP2 → emit an extra `ui-critic` issue inline.

---

## 22. Tests integration + DoR gate (closes el motor de gates del DoR)

Per `SK.md §4.2` + `DOR_DOD.md` (DoR §"Si aplica"). Detail: [`methodology/test-plan-rules.md`](methodology/test-plan-rules.md).

| Issue characteristic                            | Required AC                               |
| ----------------------------------------------- | ----------------------------------------- |
| Pure function / helper / validation             | Unit test AC                              |
| UI interactive (handlers / state / conditional) | **Component test (RTL) AC — DoR blocker** |
| Cross-page / auth / RBAC                        | **E2E (Playwright) AC — DoR blocker**     |
| Cross-screen flow ≥3 SCRs                       | Dedicated `e2e-flow` issue                |
| Pure refactor / docs                            | Unit AC optional · component/E2E exempt   |

**DoR test-gate (per-issue, runs in `nuevo`/`add`/`extend-epic` — every mode that emits issues):** when an issue touches interactive UI (keyword/scope detection per the DoR gate — `greenfield` looks at SCR keywords + scope `src/components/**`; `operational` looks at each issue's attributed file paths under `src/components/**` / `src/app/**` / `.claude/skills/*/ui*`). **Comportamiento por modo (`fx-workflow-authoring §7.1`):**

- **`--step`** → pregunta `¿AC de <capa> test? [y/n/justify]`:
  - `y` → adds the AC stub **of the layer that path class maps to** (`test-plan-rules.md` §AC layer): component (RTL) for `src/components/**`, E2E (Playwright) for a page/layout, unit for `src/app/api/**`. An issue spanning classes gets one AC per class.
  - `justify` (≥20 chars) → records the reason in the issue's `> **DoR Waivers:**` field.
  - `n` or justification <20 chars → **block** the issue (no file written).
- **Fluido (default)** → el default correcto es obvio (agregar el test recomendado = la dirección segura, no es señal real) → **auto-agrega la AC de la capa que corresponda** (= `y`), sin preguntar. El bypass `justify`/`n` solo está disponible en `--step`.

> El modo decide **si** se agrega la AC; la capa la decide el path, igual en fluido y en `--step`. Estampar el stub de componente sobre un `page.tsx` produce una AC que apunta a `tests/unit/components/`, donde esa página no vive — no es redundante, es incumplible.

> ⚠️ Este es el **test-gate** (per-issue), distinto de la **señal de diseño** (per-run, §7.6), que no es un gate: no pregunta ni para en ningún modo — registra la UI sin SCR como nota + auto-texto en `DoR Waivers`. Ambos escriben en el mismo campo del DoR; solo el test-gate decide algo. Ver `DOR_DOD.md` §Enforcement.

Every gate decision is logged machine-readable in the manifest (`gate_decisions: [{issue, type, decision, justification}]`). Gherkin §5 scenarios map 1-to-1 to test cases where applicable. Tests live in the issue's DoD by default (exception: `e2e-flow`).

---

## 23. Issue-size guardrail (autonomy + measurability)

Default issue = vertical slice (schema + action + UI + tests). To keep each issue reliably completable in one `/implement` run (consumer = AI, one run per issue until `/implement-epic` exists):

- **Flag, not block:** if an issue crosses **≥3 layers** (DB + API + UI) **or** effort ≥ L, CP1 marks it and **suggests** a split into a sequential chain (`{DOMAIN}-NNN-schema` → `-api` → `-ui`). User decides at CP1. Not forced — just made visible, since issue size bounds autonomous success rate.

---

## 24. Subprocess delegation summary

| Agent                 | Phase   | Parallelism                        | Model     | Tools                   | Output                                                            |
| --------------------- | ------- | ---------------------------------- | --------- | ----------------------- | ----------------------------------------------------------------- |
| `bkl-context-analyst` | 1       | serial (1×)                        | `opus`    | Read, Grep, Glob, Write | `project/backlog-artifacts/{run-id}/backlog-registry.md`          |
| `bkl-issue-specer`    | 4 + 7.5 | **1 per epic** (≤6 epics paralelo) | `opus`    | Read, Grep, Glob, Write | N `issues/{filename}` (los issues de su epic) por `id_convention` |
| `architect`           | **3.5** (plan-mode) | single message con el resto del panel; **siempre** en la composición de §12.5 | `opus` explícito | Read, Grep, Glob, Bash | hallazgos con clase + la consulta corrida → `manifest.plan_review` (no-write) |
| `project-planner`     | **3.5** (plan-mode) | íd.; entra **sólo cuando el tier lo convoca** (tabla de abajo)              | `opus` explícito | Read, Grep, Glob, Bash | íd. (no-write) |
| `grounding-auditor`   | **3.4** (plan-mode) | serial (1×, antes del panel)   | `opus` explícito | Read, Grep, Glob, Bash | clasificación `HECHO`/`INFERENCIA`/`SUPUESTO`/`DESCONOCIDO` con consulta por afirmación → `manifest.grounding` + bloque `## Grounding` en `parsed-plan.md` (no-write: el orquestador persiste) |

Orchestrator-direct: Phase 0.1 (convention detection), Phase 0.5 (plan parsing + resolución del presupuesto por riesgo, plan-mode), Phase 3 (epic composition + issue split + upgrade del tier por `meta-foundation`), Phase 5 (dependency closure), Phase 6 (coverage gate). Phase 3.4 = grounding de premisas (`grounding-auditor`, plan-mode only, read-only — §12.4). Phase 3.5 = panel adversarial pre-emisión (plan-mode only, no-write). Phase 7 validators = generic, no-write, receive `extension_mode` flag. `ui-critic` not in Phase 7 (epic-close). Las composiciones de §12.5 y Phase 7 salen de la tabla de abajo — **ésta es su única sede; §12.5 y §16 la citan, nunca la recopian**.

### El presupuesto de revisión plan-mode deriva del riesgo — tabla única de tiers

**El eje es el RIESGO, jamás el volumen.** El nivel lo resuelve Phase 0.5 con la agregación de [`fx-execution-policy §4.1`](../fx-execution-policy/SKILL.md) (kit ∪ override, `risk = máximo`) sobre la enumeración **cruda** de los archivos que el plan enumera, y Phase 3 sólo puede **subirlo** por `meta-foundation` (§12). Es la escala que [`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md) manda leer en vez de inventar un trigger propio: *"cuántos subprocesos vale la pena gastar en un run es una decisión de escala, y esa escala ya existe"*.

| Tier                          | §12.5 — panel pre-emisión (sobre el PLAN)                                                                                     | Phase 7 — validación (sobre los ISSUES escritos)                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **riesgo ≤2** (plan-mode)     | `architect` — preguntas 1, 2 y **3** (absorbe la 3) · `project-planner` **sólo** con `split_discretion: present` (pregunta 4) | `quality-engineer`                                                                  |
| **riesgo ≥3** (plan-mode)     | `architect` (preguntas 1 y 2) + `project-planner` (preguntas 3 y 4)                                                            | `architect` + `quality-engineer`                                                    |
| **`greenfield`** (sin plan)   | no corre — §12.5 es plan-mode only                                                                                             | `product-owner` · `architect` · `project-planner` · `quality-engineer` (exento-fijo) |

🔴 **Ésta es la tabla NORMATIVA; las de `§12.5` y `§16` son DERIVADAS de ella — si divergen, gana ésta.** Las dos sedes conservan su tabla porque son el punto de entrada natural de sus fases y un lector que llega ahí necesita saber qué panel corre sin saltar; el precio de esa legibilidad es la duplicación, y la cláusula de precedencia es lo que la vuelve inocua. Mismo molde que [`fx-execution-policy §5`](../fx-execution-policy/SKILL.md) usa entre su tabla de niveles y el registry JSON: no se finge que la copia no existe, se declara cuál manda. **Al cambiar una composición se edita aquí primero**, y las derivadas se re-derivan de ésta — nunca al revés.

**El resto del presupuesto no depende del tier:** 1 `bkl-context-analyst` (Phase 1) + 1 grounding de §12.4 + 1 `bkl-issue-specer` por epic (Phase 4) + hasta 2 re-corridas del panel por el cap de re-entrada de CP1 (el grounding no re-corre en un re-split — sólo si el plan file se edita, §12.4). En `greenfield` no hay §12.4 ni §12.5.

🔴 **Lista cerrada — lo que NUNCA escala con el tier.** El recorte es de **subprocesos de revisión**, jamás de rigor ([`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md): *"jamás se recortan la planeación, los gates, el barrido de validación ni los checkpoints"*). Corren idénticos en todos los niveles:

- El **grounding** de §12.4 y su fail-closed headless (`grounding_gate`).
- **`bkl-context-analyst`** y **`bkl-issue-specer`** — su criterio de spawn es aislamiento de contexto, no revisión; recortarlos sería otro eje y no está abierto.
- El **barrido canónico de Phase 7.6** y el coverage gate de Phase 6.
- **CP1 y CP2** con sus caps (2 re-presentaciones · 3 rondas) y su gating por clase de hallazgo.
- El **fail-closed headless** de `grounding_gate` y `plan_review_gate`.
- El **eje de evidencia** (`query_run` de la clase cerrada de `fx-execution-policy §7`) y la semántica de revisor/validador caído (§12.5, §16).

**El volumen del run no recorta nada, y esto no reabre el light path** (`CHANGELOG.md`, `QGATE-003`): aquél era un predicado de **tamaño** (`≤8 issues`) evaluado por corrida, que se quedó pegado al crecer el conteo. El tier de esta tabla se deriva del **registry** sobre la superficie que el plan enumera — una propiedad del input, verificable antes de empezar, que no cambia si el mismo plan produce 3 issues o 16. Ningún predicado de volumen entra por esta vía.

---

## 25. Out of scope (v1)

- Auto-execution of setup issues by `/backlog` (run by `/implement` / human).
- Auto-provisioning by `/backlog` — it emits `SETUP-001`; `/implement` runs the provisioning via `tk-provision` (REST + rail tokens, never `vercel link`/`vercel env pull` — `SK.md §7.1`).
- `/implement-epic` workflow (future — v1 emits topology + parallelism marks; consumer = `/implement`, one issue).
- Auto-migration of legacy `global-gap-10` backlogs to step=1 numbering (future `/backlog migrate-to-step1` if real-run pain; legacy backlogs continue with `max+1` linear).
- i18n key extraction (literal es-MX per `tk-design`; future `tk-i18n`).
- Cross-version migration of issues.
- `ui-critic` embedded in Phase 7 (runs at epic-close).
- Specialized `bkl-*` validators with restricted tools (v2 if real-run pain).
- `/goal` integration (batch emission, not autonomous loop).
- **codex integration as adversarial second-opinion in Phase 7** (deferred to plan posterior — requires agent purpose-built or correct reuse of `architect`/`code-archaeologist` with adversarial prompt; `codex:codex-rescue` is fix/diagnosis-focused, not adversarial review).
- **Multi-round adversarial review loop** with cap dinámico + anti-scope-creep filters + "saneado" definition (deferred together with codex integration).

---

## 26. Methodology index

Detail lives in companion files; see `methodology.md` for the index. Highlights:

- [`methodology/input-contract.md`](methodology/input-contract.md) — full input table per `extension_mode` + how each artifact is consumed.
- [`methodology/issue-shape.md`](methodology/issue-shape.md) — blockquote header + 11 body sections + split-heuristic precedence + Plan-source issue body variant.
- [`methodology/epic-shape.md`](methodology/epic-shape.md) — epic header + Topology SSOT + composition heuristics + Plan-source composition.
- [`methodology/setup-epic.md`](methodology/setup-epic.md) — `EPIC-00-bootstrap` + the `SK.md §7.1` absolute rule.
- [`methodology/numbering-and-topology.md`](methodology/numbering-and-topology.md) — convention modes + global IDs + topological rules + parallelism marking.
- [`methodology/derived-project-conventions.md`](methodology/derived-project-conventions.md) — Phase 0.1 detection matrix + `extension_mode` flag.
- [`methodology/plan-mode-input.md`](methodology/plan-mode-input.md) — plan parser contract + epic/issue composition + CP-split-proposal + Phase 0.6 design signal (detection + SCR matching + `scr_matches` field) + **`Decomposition hash:` y el alcance exacto de RF1** (qué se recompone en un re-split).
- [`methodology/skills-allowlist.md`](methodology/skills-allowlist.md) — per-issue skills resolution (cap 3, `sk-*` first, no `kb-*` sibling).
- [`methodology/test-plan-rules.md`](methodology/test-plan-rules.md) — 3 layers + DoR gate (el motor de gates del DoR) + when E2E flow splits.
- [`methodology/ui-critic-integration.md`](methodology/ui-critic-integration.md) — per-epic auto-emit + opt-in per-issue.
- [`methodology/readiness-gates.md`](methodology/readiness-gates.md) — CP1/CP-split-proposal/CP2 + Phase 0.6 design signal record mechanics + **headless `plan_review_gate` shape SSOT (panel de §12.5) + `grounding_gate` (Phase 3.4, §12.4)** + cycle state machine (pre-emisión y post-emisión) + invalidation handling.

---

_TimeKast Factory — tk-backlog v6.10.0 (presupuesto de revisión plan-mode derivado del riesgo de la superficie enumerada)_
