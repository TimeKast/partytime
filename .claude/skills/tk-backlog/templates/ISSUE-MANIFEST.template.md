# Issue Manifest — run {{run-id}}

> **Transitorio** (ephemeral) — lives in `project/backlog-artifacts/{{run-id}}/`. Emitted by Phase 3, drives CP1, is the input contract for Phase 4 `bkl-issue-specer` (**consumed grouped by epic** — the orchestrator passes each epic's sub-list to one specer instance), and records exact created-this-run paths for CP2 Reject rollback. Cleaned up in Phase 8. Gitignored.

> A `.json` sibling carries the same data machine-readable; this `.md` is the human-readable view.

## Planned issues

| ID             | Epic        | Title              | Layers    |  Size flag   | Skills (count) | depends_on        | ui_critic? |
| -------------- | ----------- | ------------------ | --------- | :----------: | :------------: | ----------------- | :--------: |
| {{SETUP-001}}  | EPIC-00     | trivial-bootstrap  | infra     |      —       |       2        | —                 |     no     |
| {{DOMAIN-NNN}} | {{EPIC-01}} | {{título}}         | DB+API+UI | ⚠️ ≥3 layers |       6        | {{DOMAIN-NNN}}    |     no     |
| {{DOMAIN-NNN}} | {{EPIC-01}} | ui-critic-{{slug}} | review    |      —       |       3        | {{las UI issues}} |    yes     |

## Per-issue refs (Phase 4 input)

```yaml
- id: { { DOMAIN-NNN } }
  epic: { { EPIC-NN-slug } }
  features: [{ { FT-XX } }]
  screens: [{ { SCR-XXX } }]
  entities: [{ { ENT-XX } }]
  actions: [{ { actionName } }]
  personas: [{ { PER-XXX } }]
  ac_refs: [{ { AC-XX.Y } }]
  packet: 15_IMPLEMENTATION_PACKETS/FT-{{XX}}.md
  depends_on: [{ { DOMAIN-NNN } }]
  skills: [{ { sk-…, kb-… } }]
  layers: [{ { db, api, ui } }]
  size_flag: { { none | ">=3 layers" | "effort>=L" } }
  status: { { backlog } }
  ui_critic: { { false } }
  template: { { ISSUE | SETUP-ISSUE | UI-CRITIC-ISSUE | E2E-FLOW-ISSUE } }
  source_kind: { { discovery | plan } }
  # backlog-central sync fields (BSYNC-007) — see § below:
  uuid: { { v4-uuid } }                      # minted Phase 3; bkl-issue-specer stamps it verbatim (never re-generates)
  moscow: { { must | should | could | — } } # from 03_DEEP_DIVE when present, — if absent (bkl-context-analyst)
  board: story                               # backlog-central board bucket; default `story`
```

> **Backlog-central sync fields (`uuid` / `moscow` / `board`, BSYNC-007).** Phase 3 mints a v4 `uuid` per issue **and** per epic (stable local↔remote mapping for `factory backlog push` — never re-invented downstream); `bkl-issue-specer` emits it into `> **Backlog UUID:**` **verbatim** (re-generating it would duplicate elements in the central backlog). `moscow` carries the business priority `bkl-context-analyst` loaded from `03_DEEP_DIVE` (`—` when the deep dive has none). `board` defaults to `story`. `moscow` is issue-only; `board` rides on all issue templates; `uuid` rides on issues **and** epics. Legacy manifests without these keys stay valid (downstream tolerates absence).

> **Plan-mode entries (`source_kind: plan`)** carry **no** discovery refs. Instead each entry has: `title` + `body` (unit prose → §1 Objetivo + §6 Edge Cases, RF3), `files: [...]` (attributed modify-targets, list-based — **no** `file_group`/`top_dir`), `intent`, `plan_source` + `plan_hash`, `verification_bullets`. A file may appear in **≥2** entries (many-to-many) — that overlap drives the chains below.
>
> **`screens:` in plan-mode** — populated from `scr_matches` of the Phase 0.6 design signal ([`../methodology/plan-mode-input.md`](../methodology/plan-mode-input.md) §Phase 0.6 — Design signal) when a design-significant screen matched an existing `16_DESIGN/SCR-*.md` (by route, fallback slug). `bkl-issue-specer` emits these into `Refs (design): SCR-XXX · —` verbatim. Empty when no SCR matched (the screen went into the signal note, or there was no design-significant screen).

## Risk budget (plan-mode — Phase 0.5, upgrade en Phase 3)

> El presupuesto de revisión resuelto para este run: el nivel de riesgo que el registry asigna a los archivos que el plan **enumera** y las composiciones que compró (tabla única en [`../SKILL.md`](../SKILL.md) §24). **Espejo intra-run** — el congelado vive en el header de `parsed-plan.md` (`Risk budget:`) y el durable en la sección `## Plan Review` del epic file ([`../methodology/epic-shape.md`](../methodology/epic-shape.md) §Plan Review append). Es de donde CP1 y el resumen de CP2 sacan su línea de narración. 🔴 El valor **sólo sube**: `meta-foundation` en Phase 3 y un re-freeze por re-split o re-parse pueden escalarlo, nunca bajarlo.

```yaml
risk_budget:
  risk_resolved: 2 # nivel agregado (fx-execution-policy §4.1, renglón `risk = máximo`, kit ∪ override)
  risk_origin: '{{la regla o señal que lo produjo + su origen — p.ej. regla `.claude/**` (kit); con `fallback-completo`: `fallback — {la causa}`}}'
  origin_scope: kit | proyecto | — # de qué registry salió la regla que fijó el máximo; `—` con `fallback-completo` (ninguna regla lo fijó)
  resolution: registry | fallback-completo # `fallback-completo` = registry ausente/ilegible o enumeración no parseable → tier completo, con la causa en `fallback_reason`
  fallback_reason: '{{sólo con resolution: fallback-completo — la causa que se narra en CP1}}'
  upgraded_by: '{{meta-foundation (N dependientes) | re-split | re-parse | override §9.1 (área sensible declarada) | — }}' # sólo se registra si SUBIÓ el nivel; vocabulario CERRADO — un disparador de invalidación nuevo agrega su valor aquí
  panel_12_5: [architect] # la composición que corrió en §12.5
  panel_phase_7: [quality-engineer] # la composición que corre en Phase 7
  not_convened: # las lentes que el tier NO convocó → filas `status: not-convened` de la sección durable
    - { reviewer: project-planner, phase: '3.5' }
    - { reviewer: architect, phase: '7' }
```

> 🔴 **`not_convened` no es información redundante con `panel_*`.** El consumidor aguas abajo distingue *lente no convocada* de *revisor caído* (`plan_review.failed_reviewers`) y de *lente que corrió limpia*, y esas tres producen la misma ausencia de hallazgos. Enumerar explícitamente lo que **no** se convocó es lo que hace la distinción legible sin re-derivar el tier. Viaja a la sección durable del epic file; el manifest lo borra Phase 8.
>
> 🔴 **`phase` no es opcional: el recorte es POR FASE, y la misma lente puede correr en una y no en la otra.** El ejemplo de arriba es un run de tier ≤2 con `split_discretion: none`: `architect` **sí** revisa el plan en §12.5 y **no** valida los issues escritos en Phase 7. Sin el par, una fila `not-convened` de `architect` dentro de la sección titulada `Plan Review (Phase 3.5 — …)` se leería como *"no revisó el plan"*, que es falso. El campo enumera lo que el **tier** retiró; los lentes que el recorte por origen deja fuera de Phase 7 en plan-mode (`product-owner`, `project-planner` — [`../SKILL.md`](../SKILL.md) §16) no dependen del presupuesto y no entran aquí.

## Grounding (plan-mode — Phase 3.4)

> Durable record of the pre-adversarial premise verification (SKILL §12.4, `grounding-auditor`). One entry per claim, with **the query behind every `HECHO`**. The §12.5 panel consumes this as its input contract: a confirmed `HECHO` with a cited query is not re-litigated (salvo evidencia contradictoria); a refuted `HECHO` enters as an established `rompe` finding; `SUPUESTO`/`DESCONOCIDO` arrive marked as unverified (adds scrutiny). 🔴 Absence of this block is NEVER read as "verified" — the panel asks everything.

```yaml
grounding:
  status: clean | failed # failed = agente caído / vacío / sin clasificación → NUNCA se lee como limpio: caveat nombrado en el resumen de CP1; en headless entra al bloque `grounding_gate` como `action`
  claims:
    - claim: '{{la afirmación del plan — cita textual + ubicación}}'
      class: HECHO | INFERENCIA | SUPUESTO | DESCONOCIDO
      verdict: confirmada | refutada # sólo HECHO — un refutado llega al panel como hallazgo `rompe` ya establecido
      query_run: '{{la consulta corrida — obligatoria en todo HECHO (mandato del agente); en DESCONOCIDO, la que lo resolvería}}'
      basis: '{{sólo INFERENCIA — la cadena declarada (premisas → conclusión) que el panel de §12.5 ataca; sin esta ranura, el registro durable perdería la cadena que el card obliga a declarar}}' # opcional en las demás clases
```

> **Headless:** un `HECHO` refutado fail-closea el run ANTES del panel y emite el bloque `grounding_gate` ([`../methodology/readiness-gates.md`](../methodology/readiness-gates.md) §Headless fail-closed — shape SSOT; reusa el patrón de `plan_review_gate`). `SUPUESTO`/`DESCONOCIDO` nunca abortan.

## Plan review findings (plan-mode — Phase 3.5 panel)

> Durable record of the pre-emission adversarial panel (SKILL §12.5). Audit trail: every finding, its class, and **the query that sustains it**. Resolved `decisión` findings ALSO land in `gate_decisions` (the DoR gate machinery), same as any other decision of the run.

```yaml
plan_review:
  decomposition_hash: { { sha-256 } } # from parsed-plan.md — the panel's re-entry trigger. El espejo DURABLE para `validar` va en COVERAGE-MATRIX.md: este manifest lo borra Phase 8
  cp1_presentations: 1 # cap: 2 re-presentaciones con hallazgos vivos. 🔴 SE ARRASTRA al re-emitir el manifest (CP1 opción 2) — nunca vuelve a 0
  findings:
    - reviewer: architect | project-planner
      class: rompe | está mal | decisión
      class_origin: { { la clase que emitió el revisor, si el orquestador re-clasificó } }
      reclass_reason: '{{motivo — obligatorio si class != class_origin; se muestra en CP1 junto al ítem}}'
      claim: '{{la afirmación del plan que se refuta}}'
      query_run: '{{el grep / archivo leído — clase de evidencia cerrada, fx-execution-policy §7}}'
      status: live | resolved | dismissed
      carried_over: false # true SOLO si una re-corrida del panel ya no lo levantó (SKILL §12.5 §Carry-over)
  # Un revisor caído NO es un panel limpio (SKILL §12.5 §Fallo de un revisor):
  failed_reviewers: [] # p.ej. [{ reviewer: project-planner, status: failed }] → caveat en CP1 + `action` del bloque headless
```

> 🔴 **`carried_over: true` no lo pone una afirmación, lo pone una re-pasada.** Sólo lo gana un hallazgo que desapareció de una **re-corrida real** del panel (hash cambiado → panel re-corrido). Un hallazgo cerrado por una edición que no movió el sustrato queda `resolved` con `carried_over: false`, y Phase 7 lo mira con ojos frescos — recortar el barrido de validación sería recortar rigor, no subprocesos (`fx-workflow-authoring §8`).
>
> **Headless:** un `rompe` con `query_run` fail-closea el run y emite el bloque `plan_review_gate` ([`../methodology/readiness-gates.md`](../methodology/readiness-gates.md) §Headless fail-closed — shape SSOT). Sin `query_run` degrada a caveat. Un `decisión` nunca aborta headless.

## Shared-file chains (plan-mode topology input)

> Connected components over the "issues share ≥1 file" graph → each component is one `sequential_chain`; the rest are `parallelizable`. May be **non-contiguous** in NNN (valid — numbering-and-topology nota N4).

```yaml
sequential_chains:
  - [{{DOMAIN-001}}, {{DOMAIN-005}}] # share {{path}}
parallelizable_issues: [{{DOMAIN-002}}, {{DOMAIN-003}}, {{DOMAIN-004}}]
```

## Gate decisions (DoR test-gate — FX-003)

> **Three entry types** share this list, same FX-003 machinery — and only two of them record a decision. `type: component` — per-issue UI test-gate (one entry per gated issue), a decision. `type: plan-review` — a finding of the Phase 3.5 panel that the **user** closed at CP1 (`SKILL.md §12.5`), one entry per closed finding, a decision. `type: design-spec` — the Phase 0.6 design **signal** ([`../methodology/readiness-gates.md`](../methodology/readiness-gates.md) §Phase 0.6 — Design signal): a **record**, not a choice — nobody is asked. It lands **once per run** with a `screens: [...]` list, and its auto-text is stamped into the `DoR Waivers` field of each affected issue in Phase 4.

```yaml
gate_decisions:
  - {
      issue: { { DOMAIN-NNN } },
      type: component,
      decision: { { y | justify | n } },
      justification: '{{… | }}',
    }
  # Phase 0.6 design signal — one entry per run, lists every screen with no covering SCR:
  - {
      type: design-spec,
      screens: [{ { dashboard, settings } }],
      decision: recorded, # único valor — registra un hecho del run, no una elección
      justification: '{{auto-texto determinista}}',
    }
  # Phase 3.5 plan review — one entry per finding the USER closed at CP1:
  - {
      type: plan-review,
      finding_ref: { { reviewer + claim } },
      decision: { { dismissed | risk-accepted } },
      justification: '{{≥20 chars — texto del user, obligatorio}}',
    }
```

> **`design-spec` no pide texto del user** — su justificación es auto-texto determinista de la señal de diseño ([`../methodology/readiness-gates.md`](../methodology/readiness-gates.md) §Phase 0.6). `plan-review` **sí** exige texto del user, igual que la rama `justify` del test-gate (`component`): cerrar un hallazgo que rompe o una decisión es un acto deliberado, y la exigencia de texto no se deroga al presentar las opciones de forma estructurada (`CC.md §3`).

## Design signal note (Phase 0.6)

> Written by the Phase 0.6 design signal when ≥1 design-significant screen has no covering SCR. It is a **note**: the run continues in every mode (fluido, `--step`, headless) and the same fact travels durably in each affected issue's `DoR Waivers`. The screens the run DID cover ride in each entry's `screens:` field instead, as `Refs (design)`. Detail: [`../methodology/readiness-gates.md`](../methodology/readiness-gates.md) §Phase 0.6 — Design signal.

```yaml
design_signal:
  screens: [{ { dashboard, settings } }] # design-significant screens with no covering SCR
  note: 'el plan trae {{N}} pantalla(s) sin SCR — los issues nacen sin diseño, con su registro en DoR Waivers'
```

## Created-this-run paths (for CP2 Reject rollback)

> Populated **from each epic-specer's successful return report** (per-issue `{id, path, status: written}`) — NOT at dispatch. A crashed/partial spawn records only confirmed-written paths; the orchestrator reconciles `issues/` vs this set post-batch (SKILL §13: _missing_ keyed by `id` → re-spawn only those ids, _orphan_ keyed by path → clean). Reject deletes EXACTLY these paths (nothing else), then re-runs `pnpm update-board`. In `add` mode, pre-existing files are NOT listed here, so they're never touched.

```yaml
created_paths:
  - project/backlog/v{{VERSION}}/epics/{{EPIC-NN-slug}}.md
  - project/backlog/v{{VERSION}}/issues/{{DOMAIN-NNN-slug}}.md
```
