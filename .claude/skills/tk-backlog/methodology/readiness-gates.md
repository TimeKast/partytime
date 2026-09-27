# tk-backlog — Readiness Gates (CP-split-proposal/CP1/CP2 + cycle state machine + invalidation)

> **Presentación de opciones** (`CC.md §3` + [`fx-workflow-authoring §7.0`](../../fx-workflow-authoring/SKILL.md)): estructuradas (`AskUserQuestion`) como default interactivo; la tabla de abajo es el **fallback** cuando el runtime no tiene la tool. **Headless:** ninguna de las dos — el CP resuelve por su fail-open/fail-closed declarado y **no intenta** la tool.

> Aplica a **todos** los gates de este archivo, cualquiera sea el formato en que su tabla esté escrita.

> Checkpoint mechanics, the blocker-resolution cycle, and invalidation handling. Live behavior in [`../SKILL.md`](../SKILL.md) §8 (CP-split-proposal), §11 (CP1), §17–§19 (Phase 7.5/7.6/CP2). Checkpoint templates reused from `fx-workflow-authoring/templates/`.

---

## extension_mode flag — propagation

Phase 0.1 detects `extension_mode` ∈ `{greenfield, operational}` ([`derived-project-conventions.md`](derived-project-conventions.md) §0.1.c) and persists it in the registry. It propagates to:

- **Phase 1 (bkl-context-analyst):** picks input set — discovery+design (`greenfield`) or `parsed-plan.md` (`operational`). Emits `## Caveats: extension_mode=operational — no FT/SCR/persona refs available` in `operational` mode.
- **CP1:** narration swaps coverage line (`Coverage: FT a/A · SCR b/B · personas c/C` in `greenfield`) for source line (`Source: plan-mode — <path>` in `operational`).
- **Phase 6 (coverage gate):** switches check set (FT/SCR/persona coverage for `greenfield`; file-group/Verification-bullet coverage for `operational`).
- **Phase 7 (validators):** each validator receives `extension_mode` in its prompt and skips upstream-dependent checks in `operational` mode (`product-owner` skips coverage matrix, `quality-engineer` swaps UI-keyword detection for file-path detection). **Quiénes componen el panel** lo deciden `extension_mode` **y**, en `operational`, el tier de riesgo resuelto en Phase 0.5 — tabla única en [`../SKILL.md`](../SKILL.md) §24.
- **CP2:** la narración explica la validación de scope reducido cuando el modo es `operational`, **y nombra el panel que efectivamente corrió con su origen** — nunca un conteo fijo, que sería falso en uno de los dos tiers (lenguaje plain: *"el panel corrió con scope reducido porque este backlog viene de un plan, no de discovery completo; el presupuesto de esta corrida fue riesgo {N} vía {regla del registry}"*). El presupuesto resuelto viaja en el resumen de CP2 pare o auto-acepte ([`../SKILL.md`](../SKILL.md) §19).

`validar` inherits `extension_mode` from the existing backlog dir metadata. If the dir was created in plan-mode (issues carry `Source tier: plan-mode`), `validar` checks plan-file hash drift in addition to (or instead of) FT/SCR hash drift.

---

## Phase 0.6 — Design signal (plan-mode only)

The **record mechanics** of the design signal. Detection (¿design-significant? + SCR matching) and the `scr_matches` field semantics live in [`plan-mode-input.md`](plan-mode-input.md) §Phase 0.6 — Design signal. This section is the SSOT for the **narration, the granularity and the `gate_decisions` entry**.

- **When:** between Phase 0.5 (plan parse) and CP-split-proposal. Plan-mode only (`add <plan>` / `extend-epic`); skipped in `nuevo` / `extend` / `validar`.
- **Fires when:** ≥1 design-significant screen (Step 1) has **no covering SCR** (Step 2) — detection in [`plan-mode-input.md`](plan-mode-input.md).
- **Mechanism:** it is **not a checkpoint**. It asks nothing and stops nothing — in fluido, in `--step` and in headless alike. It writes into the same `manifest.gate_decisions` list the DoR gates use, adding the `type: design-spec` value as a **record**, not as a decision.

### Granularity — UNA nota por run

One run → **one** entry listing **all** the screens without a spec (even if the plan introduces 3 new screens). The record lands **once** in `manifest.gate_decisions` as a single `type: design-spec` entry with a `screens: [...]` list — a per-screen record would multiply lines without adding information.

### Narración — una línea en el resumen de CP1

```
ℹ️ El plan trae {N} pantalla(s) sin SCR que las cubra:
   - {screen 1: route / path}
   - {screen 2: route / path}
   Los issues nacen sin contrato de pantalla, con su registro en `DoR Waivers`;
   el ui-critic reactivo los revisa en /implement con evidencia renderizada.
```

The line rides in the CP1 summary — it never turns CP1 into a stop by itself (CP1 keeps its own stop criteria: coverage shortfall, blockers, size-flags, panel findings).

### El registro — `gate_decisions` + `DoR Waivers`

```yaml
gate_decisions:
  - {
      type: design-spec,
      screens: [dashboard, settings],
      decision: recorded,
      justification: '<auto-texto determinista>',
    }
```

- **`justification` is deterministic auto-text** — it MUST open with the literal prefix `design-spec —`, e.g. `design-spec — sin SCR al emitir; ui-critic reactivo en /implement`. Never user text: nobody is asked. 🔴 **The prefix is load-bearing, not cosmetic.** `DoR Waivers` is a single plain-text field that also carries the test-gate waiver, and the `type` that tells them apart lives only in `manifest.gate_decisions`, which Phase 8 deletes. Downstream the field travels as an opaque string ([`imp-issue-executor`](../../../agents/imp-issue-executor.md) receives `dor_waivers`), and its consumer reads a non-empty field as *"a test was deliberately waived — do not demand it"*. Without the prefix, this record — which waives nothing — would read as authorization to skip a test the issue declares in its own ACs. Phase 4 stamps it into the `DoR Waivers` field of **each affected issue** (carry 0.6 → manifest → emission), so the fact is durable in the backlog and not only in the ephemeral manifest.
- **`decision: recorded` is the single value of this type.** The entry registers a fact of the run, not a choice — the other two types of the list (`component`, `plan-review`) do record a user's decision; this one does not. Consumers that read `gate_decisions` as "decisions the user made" must exclude `design-spec` (see [`../../tk-implement/SKILL.md`](../../tk-implement/SKILL.md) §2.2 carry-over).
- The pre-assigned reactive `ui-critic` issue stays: that is the eslabón that demonstrates the UI, at `/implement`, with rendered evidence.

### Headless — mismo comportamiento, sin fallback que declarar

No mode asks anything, so there is **no fail-open/fail-closed to declare** — that is the whole of it, and it is why this section is short. What differs is only *where the signal is readable*: headless does not present CP1 (§CP1 — **Headless**), so the narrated line has no surface and does not render. The two **durable** halves travel unchanged: the `design_signal` note in the manifest and the `design-spec —` record in each affected issue's `DoR Waivers`. Nothing is lost that a later reader needs; the run continues to CP-split-proposal. UI without a spec is demonstrated at `/implement` by the visual-evidence harness + `ui-critic`, never by blocking the emission.

---

## Headless block shapes — the gates that DO stop

Three gates of this workflow fail-closed in headless mode and emit a structured block to stdout + manifest. `plan_review_gate` is the **primary shape**; `grounding_gate` and `validation_gate` reuse it. Artifact preservation (below) applies to all three.

### Headless fail-closed — `plan_review_gate` block (shape SSOT)

The Phase 3.5 panel (SKILL §12.5) has no interactive user in headless mode. It **fail-closes on `rompe`**, emitting a structured `plan_review_gate` block to **both stdout and the manifest**. This is the **primary headless block shape of this workflow** — `grounding_gate` below reuses it. The consumer is an external headless orchestrator (outside this repo) — this repo ships the **contract**, not the orchestrator: without a block, an aborted run is indistinguishable from a crash.

```yaml
plan_review_gate:
  status: 'blocked' # the only state of this block — it is the HEADLESS contract, and headless grants no waivers
  findings:
    - reviewer: 'architect'
      class: 'rompe'
      claim: '<the plan assertion that was falsified>'
      query_run: '<the grep / file read that sustains it>'
  action: 'adjust the plan, then re-run /backlog add <plan>'
```

🔴 **The trigger is tied to evidence, not to judgment.** A `rompe` blocks headless **only if it cites a `query_run`** of the closed evidence class ([`fx-execution-policy §7`](../../fx-execution-policy/SKILL.md): *test rojo · línea de log · resultado de una búsqueda en el código; nada más califica*). A `rompe` without one degrades to a manifest caveat and the run continues. Without this, the panel would be the **first** gate of this workflow whose firing is an agent's judgment rather than an enumerated rule — the same plan could emit on one run and abort on the next, breaking the reproducibility every other enumerated rule of this workflow has (the design-significance detection of §Phase 0.6: *"enumerated rules, reproducible headless"*; §9.1 override suggestion: *"señal computable, no juicio libre"*).

- **No `waived` in this block.** Headless emits only `blocked`; the interactive *continue accepting the risk* decision lands in `manifest.gate_decisions`.
- **A `decisión` finding does NOT abort headless** — there is nobody to decide, so it is recorded as a manifest caveat and the run continues. Same criterion as the CP-split-proposal fail-*open*: the decision is internal and CP1 catches it when a user is present.

### Headless fail-closed — `grounding_gate` block (shape SSOT)

The Phase 3.4 grounding (SKILL §12.4, `grounding-auditor`) runs **before** the panel and has no interactive user in headless mode. It **fail-closes on a refuted `HECHO`**, emitting a structured `grounding_gate` block to **both stdout and the manifest** — same consumer and same contract logic as `plan_review_gate` above. This **reuses that gate's shape and pattern**; it is NOT a new gate mechanic.

```yaml
grounding_gate:
  status: 'blocked' # the only state of this block — headless grants no waivers (same split as plan_review_gate)
  claims:
    - claim: '<the plan assertion the grounding refuted>'
      query_run: '<the query that refuted it — cited by mandate on every HECHO>'
  action: 'adjust the plan, then re-run /backlog add <plan>'
```

- **The trigger is tied to evidence by construction:** every `HECHO` cites its query (the agent's closed mandate), so a refuted `HECHO` always carries the closed-class evidence ([`fx-execution-policy §7`](../../fx-execution-policy/SKILL.md)) that makes the firing reproducible — never an agent's judgment. Same criterion as the `plan_review_gate` `rompe`-with-`query_run` branch.
- **`SUPUESTO` / `DESCONOCIDO` never abort** — they reach the §12.5 panel marked as unverified, which ADDS scrutiny. Absence of classification is never read as "verified" (SKILL §12.4).
- **A fallen/empty grounding is NOT a clean grounding** (same closure §12.5 declares for its fallen reviewer): caveat in `manifest.grounding` (`status: failed`), named in the CP1 summary. **In headless the fallen auditor DOES emit this block** — abort with `status: 'blocked'`, `claims: []`, and the fall narrated in `action` (fail-closed, decided: the caveat has no reader in headless, and continuing would be the silent fail-open this gate exists to close; interactive keeps the caveat + CP1 flow).
- **Interactive:** the phase never stops on its own — a refuted `HECHO` reaches CP1 as an established `rompe` finding via the §12.5 panel (SKILL §12.5 §Contrato de entrada), so CP1's existing gating handles it.

### Headless fail-closed — `validation_gate` block

The Phase 7 validators (SKILL §16) have no interactive user in headless mode. A validator that **falls, returns empty, or emits no classified findings** is never read as a clean validation, and with a single validator in tier ≤2 there is no redundancy to mask it — so headless **aborts** and emits a structured `validation_gate` block to **both stdout and the manifest**. This **reuses the `plan_review_gate` shape and pattern**; it is NOT a new gate mechanic. Without a block, an aborted run is indistinguishable from a crash — the same contract logic the primary shape declares.

```yaml
validation_gate:
  status: 'blocked' # the only state of this block — headless grants no waivers (same split as plan_review_gate)
  failed_validators:
    - validator: 'quality-engineer'
      reason: '<fell / returned empty / emitted no classified findings>'
  action: 'the validation panel did not complete — the Phase 4 issues this run wrote are still on disk and a re-run does NOT overwrite them (IDs continue from max+1, numbering-and-topology.md): delete them first, then re-run the same command this run was started with'
```

- **The trigger is the fallen validator, not the tier.** It applies to the three panels of SKILL §16, in both `extension_mode` values; the tier only changes how many lenses there were to lose.
- **Blockers found by a validator that DID run are NOT this gate:** they route through Phase 7.5 and reach CP2 as usual. This block fires only when a lens produced nothing at all.
- **Interactive keeps the caveat + CP2 flow** — the caveat is named next to the verdict and the user decides. Same split as `grounding_gate`.
- **Phase 8 never runs on this abort:** nothing is finalized (no epic Issues table, no board rollup, no cleanup). The Phase 4 issues stay on disk alongside the artifacts (below).

### Artifact preservation on STOP

Applies to the STOPs this workflow still has: `plan_review_gate` (Phase 3.5), `grounding_gate` (Phase 3.4), `validation_gate` (Phase 7) and an interactive cancel at a checkpoint. When one of them STOPs, `backlog-artifacts/{run-id}/` **stays on disk** — the cleanup only runs in **Phase 8** of a complete run (SKILL §20; the Phase 8 `rm -rf` guard never executes when the run STOPs before it). Re-entry is a **new run** (new run-id): the parser re-processes the plan deterministically, producing identical `scr_matches` if the plan is unchanged. The aborted run's artifacts remain as forensics; they are not reused.

---

## CP-split-proposal — Plan split preview (plan-mode only)

- **When:** after Phase 0.5 plan parse, before Phase 1 registry build.
- **Source:** `parsed-plan.md` emitted by Phase 0.5 orchestrator-direct parser ([`plan-mode-input.md`](plan-mode-input.md)).
- **Shows:** N issues classified (from U detected units; U−N prose skipped) + K integration issues (cross-issue verification bullets) + shared-file chains + total proposed (1 epic + N+K issues).
- **Options:** `1 Approve` (proceed to Phase 1) / `2 Adjust` (merge/split issues / reclassify via AskUserQuestion multi-select) / `3 Cancel` (no durable writes yet).
- **Skip by `split_discretion`** (computed once in Phase 0.5, frozen in `parsed-plan.md`, read — never recomputed unless the plan is edited): **`none`** (every unit from the plan's visible structure — subsumes the old `exactly-1` case + plan-dictated splits + deterministic auto issues) → auto-approve, checkpoint not surfaced; **`present`** (≥1 unit was flat prose grouped by judgment) → surfaces **en `--step`**; en **modo fluido** (default) la agrupación de prosa no es señal real → auto-approve + caveat (CP1 lo cacha — converge con headless). Fail-safe: with `none` (o `present` en fluido), merge/split stays available at CP1 (`Edit`).
- **Headless (`present`, no interactive user):** auto-approve and continue (**fail-open**) + manifest caveat (prose grouping unreviewed); CP1 stays reviewable. Mismo comportamiento que fluido interactivo. NOT the `SETUP-002` fail-*closed* pattern (which abstains and emits a doc) — here the decision is internal grouping CP1 catches.
- **Only in `add <plan>` and `extend-epic EPIC-NN <plan>`.** Skipped in `nuevo` / `extend` / `validar`.

Plain-language narration template:

```
🛑 CP-split-proposal — Split propuesto del plan

Clasifiqué el plan en {N} issues (de {U} unidades; {U−N} eran prosa de proceso):
  - {issue 1: title, file count} → 1 issue
  - {issue 2: title, file count} → 1 issue
  - ...
{+ K integration issue(s) por verification bullets cross-issue.}
{Archivos compartidos → chains: {chain list}.}

Total propuesto: {E} epic(s) (1 por heading `## Epic:`; default 1) + {N+K} issues.

| 1 | Aprobar — proceder a Phase 1 (registry build) |
| 2 | Ajustar — quiero unir/separar algunos issues  |
| 3 | Cancelar                                       |
```

Option 2 sub-flow: AskUserQuestion multi-select per issue with default conservative (no merges) — see [`plan-mode-input.md`](plan-mode-input.md) §CP-split-proposal.

---

## CP1 — Plan Review (inline)

- **When:** after Phase 3 (epics + issue manifest), before any issue file is written.
- **Source:** the issue manifest (`backlog-issue-manifest-{run-id}`), NOT durable issue files (they don't exist yet).
- **Shows:** version, epic count, issue count (incl setup/ui-critic/e2e-flow), size-flags (§23 issues crossing ≥3 layers), and — in plan-mode — the **design-signal line** when the run recorded screens with no covering SCR (§Phase 0.6). Coverage line depends on `extension_mode`:
  - `greenfield` → `Coverage: FT {a}/{A} · SCR {b}/{B} · personas {c}/{C}`
  - `operational` → `Source: plan-mode — {path/to/plan.md}` (coverage line replaced)
- **Options:** `1 Approve` / `2 Edit` (re-emit manifest **+ re-freeze `parsed-plan.md`**) / `3 Descartar un hallazgo` (plan-mode, requires the user's written justification ≥20 chars) / `4 Cancel` (no durable writes yet).
- **Plan review gating (plan-mode, from the Phase 3.5 panel — SKILL §12.5):**
  - 🔴 `rompe` vivo → **option 1 is not offered** until the plan is adjusted or the finding is explicitly dismissed.
  - 🔴 `decisión` → CP1 **stops always** (fluido included), presented as a row with mutually-exclusive options: the agent cannot dismiss that class on its own (`fx-execution-policy §4.4`).
  - `está mal` → summary line, auto-advances in fluido.
  - **Option 2 re-freezes:** re-emits the manifest **and** `parsed-plan.md` with `Decomposition hash:` + `Split discretion:` recomputed and `scr_matches` re-propagated (see [`plan-mode-input.md`](plan-mode-input.md) §Decomposition hash). Hash changed → the panel re-runs.
  - **Option 3 is the gate's exit, and the user closes it — never the agent.** Dismissing a `rompe` or a `decisión` takes the user's **written** justification (≥20 chars), recorded in `gate_decisions` as `type: plan-review, decision: dismissed`. 🔴 Without it the gate does not terminate: an edit that the hash does not measure (ordering, epic grouping, wording) leaves the finding live, the panel does not re-run, the counter does not move, and Cancel would be the only enumerated way out. Presenting the options through the structured path does **not** waive the written justification (`CC.md §3`).
  - 🔴 **Cap: 2 CP1 re-presentations with live findings** — the axis is the **presentation**, not the panel re-run (the panel only re-runs when the hash changes; CP1 re-presents either way, so counting re-runs would leave the no-hash-change path untopped). The counter lives in `manifest.cp1_presentations` and **must be carried over** when option 2 re-emits the manifest — a counter that resets in the same act that increments it counts nothing. On the third presentation CP1 offers the explicit *continue accepting the risk* option, recorded in `gate_decisions`.
- **Design signal (plan-mode, from Phase 0.6):** when the run recorded design-significant screens with no covering SCR, the CP1 summary carries **one line** naming the count — *"el plan trae {N} pantalla(s) sin SCR — los issues nacen sin diseño, con su registro en `DoR Waivers`"*. 🔴 **It is surfaced, never asked:** it presents no option, gates nothing, and its presence alone never keeps fluido from auto-advancing (a clean manifest still auto-advances — the line rides along in the brief summary). Producer: §Phase 0.6 above.
- **Grounding caveat (plan-mode, from Phase 3.4 — SKILL §12.4):** a fallen/partial grounding (`manifest.grounding.status: failed`) is **named in the CP1 summary** — the user must know the panel asked everything because nobody verified the premises, not because they came back verified clean.
- **Modo (`fx-workflow-authoring §7.1`):** fluido (default) **auto-avanza** con resumen si el manifest está limpio (cobertura completa, sin blockers, sin size-flags, **y sin `rompe` ni `decisión` del panel de §12.5**); **para** con la tabla ante shortfall/blocker/size-flag **o un hallazgo `rompe`/`decisión`** (señal §1/§4), o en `--step`. Fail-safe intacto: aún no se escribió ningún issue.
- **Headless:** CP1 no se presenta. Las tres ramas del panel (`rompe` con evidencia → STOP; `rompe` sin evidencia → caveat; `decisión` → caveat) resuelven por el contrato de §Headless fail-closed — `plan_review_gate`.
- `extend` mode: simplified inline, delta only.
- Template: `fx-workflow-authoring/templates/checkpoint-inline.template.md`.

## CP2 — Plan Mode formal

- **When:** after Phase 7 + 7.5 + 7.6 sweep PASS. Durable issues already written (decision: directo + deshacer).
- **Shows:** coverage matrix, blockers cerrados, deferred decisions, metrics (from `COVERAGE-MATRIX.md`).
- **Options:** `1 Accept` (Phase 8 finalize) / `2 Edit` (→ Phase 7.5, 1 cycle) / `3 Manual Round 2` (override cap) / `4 Reject` (rollback).
- **Modo (`fx-workflow-authoring §7.1`):** output **reversible** (issues regenerables — Reject borra exactamente las paths del manifest) → fluido **auto-acepta** con resumen si Phase 7.6 cerró **sin blockers y sin coverage-shortfall**. Un **overlap-WARNING de shared-file** (§Pre-CP2 sweep — rutinario) se **surfacea en el resumen sin parar**; **coverage-shortfall real** o blockers → **para** en Plan Mode (señal §1). `--step` siempre abre Plan Mode.
- Template: `fx-workflow-authoring/templates/checkpoint-planmode.template.md`.

### Reject rollback — manifest-precise

On Reject, delete **exactly the paths the manifest recorded as created this run** (epics + issues), nothing else, then re-run `pnpm update-board`. In `add` mode this removes only the new files; prior issues are untouched (the manifest distinguishes created-this-run from pre-existing).

> 🔴 **Anti-pattern:** never `rm` by version glob, never `git checkout`/`git restore` for rollback. Only the exact manifest path list. (`GIT.md` / `CC.md §6` forbid destructive globs anyway.)

## Phase 7.5 — Blocker Resolution Round (1 cycle)

Only if Phase 7 produced ≥1 blocker. Map each blocker to a target (`{ISSUE-ID}`, `EPIC-NN`, topology-level). **Targeted re-emit** — re-invoke `bkl-issue-specer` with a **1-issue list** per offending ID (same per-epic agent, batch of one, idempotent overwrite; not a full Phase 4 re-batch). Then **selective validator re-run**:

- Coverage/scope blocker → `product-owner` only.
- Route/schema blocker → `architect` only.
- Topology/dependency blocker → `project-planner` only.
- DoR/DoD/test blocker → `quality-engineer` only.
- ≥3 cross-validator blockers → full Phase 7 re-batch.

Surviving blockers after 1 round → CP2 stays blocked by default. Only path to `partial`: explicit user defer at CP2 → `decisions/DECISION-BACKLOG-XXX-{slug}.md` (owner/criterion/due) + `Status` marked accordingly with tracking ID adjacent.

## Phase 7.6 — Pre-CP2 Canonical State Sweep

See SKILL Phase 7.6 for the full table. STOP-on-FAIL criteria: blockquote header validity, ID single-token + global uniqueness + filename=ID-prefix, `## Implementation Evidence` presence, topological order, topology set-equality, parallelizable coherence, tracking IDs for partial/blocked, **`scr_matches` in the manifest ⟹ `Refs (design)` present in the emitted issue** (the design-signal Refs propagation, plan-mode). Coverage shortfall = WARNING (surfaced at CP2). FAIL → re-emit + re-sweep (max 1 cycle).

**Emission-integrity reconciliation (per-epic specer model — home of the post-Phase-4 reconciliation step).** Because Phase 4 spawns **one `bkl-issue-specer` per epic** (each emits its epic's N issues) and `manifest.materialized` is populated **from each specer's successful return** (not at dispatch), the sweep also reconciles `manifest.materialized` against the real `issues/` dir:

- **Missing** — keyed **by `id`** (the canonical shortform token, sweep-validated; the filename derives deterministically from id+slug, so a slug quirk never produces a false-missing). Absent on disk → crashed/partial spawn → **re-spawn the epic's specer with `issues` = only the missing ids** (list-of-N, idempotent overwrite — never re-emits issues already written OK).
- **Orphan / leftover** — keyed **by path** (a file on disk NOT in `manifest.materialized`, e.g. left by a CP1 renumber the re-spawn didn't overwrite under the new `{NNN}`) → flag + clean.

This is what makes the per-epic emission atomic-enough for the manifest-precise CP2 rollback: after reconciliation, `issues/` == `manifest.materialized` exactly.

## Cycle state machine

**Pre-emission cycle (plan-mode only — Phase 3.5 panel → CP1):**

```
Phase 3 (epics + manifest)
   └─ Phase 3.4 grounding (grounding-auditor → premise classification; input frozen at Phase 0.5)
   └─ Phase 3.5 panel (architect + project-planner — consumes the grounding classification)
         │ findings?
         ├─ none / only `está mal` → CP1 (auto-advance in fluido)
         └─ `rompe` and/or `decisión` → CP1 STOPS
                  │ user picks
                  ├─ 1 Approve   → only offered when no `rompe` is live
                  ├─ 2 Edit      → re-freeze parsed-plan (hash + split_discretion + scr_matches)
                  │                  ├─ hash changed   → panel re-runs → CP1   (cp1_presentations++)
                  │                  └─ hash unchanged → re-present CP1, no re-review (cp1_presentations++)
                  ├─ 3 Descartar → user's written justification → finding dismissed → CP1
                  └─ 4 Cancel    → end (no durable writes yet)
```

ℹ️ **The grounding does NOT re-run on a re-split** (either branch of option 2): its claims are the plan file's, not the split's (SKILL §12.4). It re-runs only when the plan file itself is edited (§Invalidation below — a re-parse means new premises).

🔴 **`cp1_presentations` increments on BOTH branches** — that is the whole point of counting presentations instead of panel re-runs: the `hash unchanged` branch is precisely the one a re-run counter would never top. The counter is carried over when option 2 re-emits the manifest.

Max total: **2 re-presentations with live findings**; the third forces Approve (with *continue accepting the risk* recorded in `gate_decisions`), a dismissal via option 3, or Cancel. Rationale: the semantic trigger prevents useless re-spawns, the numeric cap prevents the infinite loop with a user who does move the substrate every round — each round costs two `opus`.

**Post-emission cycle:**

```
Phase 7 (panel por modo + tier — SKILL §24)
   │ blockers?
   ├─ no  → Phase 7.6 Sweep → CP2
   └─ yes → Phase 7.5 (auto, 1 cycle)
               │ remain?
               ├─ no  → Phase 7.6 Sweep → CP2
               └─ yes → CP2 (blockers visible)
                          │ user picks
                          ├─ 1 Accept → Phase 8 (partial if defer explicit + DECISION-BACKLOG-XXX)
                          ├─ 2 Edit (max 1) → Phase 7.5 → CP2
                          ├─ 3 Manual Round 2 (max 1) → Phase 7.5 → CP2
                          └─ 4 Reject → rollback → end
```

Max total: 1 auto + 1 Edit + 1 Manual Round 2 = **3 rounds** before forcing Accept (with defer) or Reject.

## Invalidation handling (info arriving after a checkpoint)

- **Upstream changed after CP1** (discovery/design re-run mid-flow, `greenfield`): re-run Phase 1 registry + Phase 3 manifest; re-present CP1. Cheap — no durable writes yet.
- **Plan edited after Phase 0.5** (`operational`): re-run Phase 0.5 plan parse → **recompute `split_discretion` and the `Risk budget:`** → re-freeze in `parsed-plan.md`. 🔴 **El presupuesto sólo puede SUBIR en un re-parse** (`max(previo, nuevo)`): un plan editado puede enumerar paths más sensibles y eso escala el panel, pero un tier que bajara dejaría al panel ya corrido en un nivel que la corrida ya no declara. Si subió, la línea del presupuesto se re-narra en CP1 con su nuevo origen. If it flipped to `present`, CP-split-proposal now surfaces; if it stays `none`, silent re-freeze (no checkpoint — the frozen flag is the only thing that decides surfacing, so a stale `present` checkpoint is never assumed). The hash check at Phase 1 entry catches mid-flow plan edits. A re-parse also invalidates the Phase 3.4 grounding — new plan, new premises → the grounding re-runs (SKILL §12.4).
- **User re-splits at CP-split-proposal (option 2) or CP1 (option 2)** (`operational`): re-emit `parsed-plan.md` — recompute `Decomposition hash:`, `Split discretion:` **and the `Risk budget:`**, and **re-propagate `scr_matches`** over the new units (Phase 0.6 matching is orchestrator-direct and cheap). 🔴 **El `Risk budget:` se re-agrega sobre la unión NUEVA de archivos atribuidos y se conserva `max(previo, nuevo)`:** un re-split que amplíe esa unión —una unidad partida que gana paths, una fusión que los conserva— **sólo puede subir** el tier; nunca bajarlo. Detalle: [`plan-mode-input.md`](plan-mode-input.md) §Decomposition hash (tabla de re-freeze) + §Resolución del presupuesto por riesgo. 🔴 **Re-propagating `scr_matches` is not optional:** it is frozen *per issue* and the Phase 7.6 sweep STOPs when the manifest carries it and the emitted issue has no `Refs (design)` — after a split, a `scr_matches` still keyed to a destroyed unit title either fails that sweep or stamps the ref on the wrong issue. `ui_touching` and the design-signal note do **not** need re-deriving: both read the **union** of attributed files, which a split/merge preserves.
- **Override written at §9.1 (`operational`)**: the sensitive-area checkpoint runs **after** Phase 0.5 froze the `Risk budget:`, so an answer `1` — which writes a new rule into `quality-gates.project.json` — invalidates that value. **Re-aggregate the `Risk budget:` over the same enumeration** of attributed files, with the kit ∪ override registry as it now stands, keeping `max(previo, nuevo)`; if it went up, re-narrate the budget line at CP1 with its new origin (`proyecto`). Nothing else re-freezes: the plan did not change, so the enumeration, the `Decomposition hash:` and `Split discretion:` are untouched. Without this trigger the run that **declares** the sensitive area would be the one run that does not buy the scrutiny it just declared (SKILL §9.1).
- **User edits scope at CP2 (Edit)**: targeted re-emit of affected issues (Phase 7.5 path), re-sweep, re-present CP2. Don't regen untouched issues.
- **New FT/SCR discovered after Accept (`greenfield`)**: that's a new run — `/backlog extend` (continues the existing convention's numbering).
- **Plan author wants more issues on the same epic (`operational`)**: `/backlog extend-epic EPIC-NN <new-plan>` (appends to existing epic, doesn't fork the epic numbering).

---

_TimeKast Factory — tk-backlog · readiness-gates_
