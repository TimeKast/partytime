---
name: tk-design
description: Documentation-family workflow that converts discovery output (00-14 + 15_IMPLEMENTATION_PACKETS) into an executable UI contract at slot 16 — per-screen layout + SK component bindings + states + copy — consumed by /backlog and /implement. Also supports a day-2 `add <plan>` mode that parses a Plan Mode plan against an existing app and emits/updates SCRs with provenance. Primary invocation is `/design [nuevo|con-direccion|validar|add <plan>]`.
family: documentation
model: opus
parallelism_unit: batch
concurrency_cap: 6
batch_size_default: 4
merge_strategy: orchestrator-write-after
auditor_step: true
last-verified: 2026-09-22
user-invocable: false
---

# tk-design — `/design` Workflow Skill

> Documentation-family workflow. Converts the durable output of `/discovery` (15+ canonical artifacts at slots `00..14` + `15_IMPLEMENTATION_PACKETS/FT-XX.md`) into an **executable UI contract** at slot 16 (`16_DESIGN.md` index + `16_DESIGN/SCR-XXX.md` per-screen + `16_DESIGN/components/CMP-XXX.md` extensions + `16_DESIGN/flows/FLW-XXX.md` multi-screen flows). The output is consumed by `/backlog` and `/implement`.

> **Slash command:** `/design [nuevo|con-direccion|validar|add <plan>]` (thin wrapper at `.claude/commands/design.md`).

> **Por qué `model: opus`** (eje A — verificabilidad, [`fx-execution-policy §3`](../fx-execution-policy/SKILL.md)): la salida de este workflow es el **contrato de pantallas**, y `/backlog` e `/implement` lo consumen **sin re-validarlo**. Un error aquí no lo atrapa ninguna máquina — se propaga dos fases y aparece como código mal construido. Es síntesis load-bearing, no extracción: el alias se pinnea, no se hereda.

---

## 1. When to use

Invoke after `/discovery` has emitted a complete set of canonical artifacts (see §7 Hard gate). `/design` blocks `/backlog`: an empty `16_DESIGN.md` means backlog has no SSOT for screen-level work.

**Use for:** new projects post-discovery; visual refresh of an existing app where discovery was re-run; validation of an existing design contract.

**Don't use for:** Visual direction discovery alone (use `kb-visual-direction` skill standalone). Component scaffolding (use `/implement` after `/design`). PoC sketches with no discovery output (run `/discovery` first).

---

## 2. Tone guidance — plain language discipline

> **Source-of-truth:** `.claude/rules/CC.md §3 Plain language al usuario (kit-wide)`. Esa regla es always-on. Esta sección la extiende con vocab específico de design.

**Vocab to define inline on first use per turn:**

- **SCR** (pantalla / screen) — un contrato per-pantalla en `16_DESIGN/SCR-XXX-{slug}.md`.
- **CMP** (componente / component) — una extensión sobre primitivas del kit en `16_DESIGN/components/CMP-XXX-{slug}.md`.
- **FLW** (flujo / flow) — un flujo multi-pantalla en `16_DESIGN/flows/FLW-XXX-{slug}.md`.
- **FT** (feature) — una funcionalidad declarada en `03_DEEP_DIVE.md`.
- **Tier** (en SCR classification) — `kit-pure` (stub) / `kit-extended` (light spec) / `custom` (full spec).

**CP narration pattern** (every checkpoint):

1. 2-3 líneas plain explicando QUÉ acaba de pasar y POR QUÉ importa.
2. Conteo en términos de negocio (no IDs crudos).
3. Boundary cases / decisiones que requieren atención del user, listados explícitamente.
4. Opciones explícitas y excluyentes — estructuradas (`AskUserQuestion`) por default, tabla numerada 1/2/3 como fallback sin la tool (`CC.md §3` + [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md)).

**Anti-patterns:**

- ❌ Mostrar dump técnico de agent findings al user sin resumir en 3-4 líneas plain primero.
- ❌ Listar 36 SCRs en CP sin agrupación + boundary highlighting.
- ❌ Citar `Phase 7.5 blocker resolution loop excede 2 iteraciones` en CP sin re-expresar plain.

**Agent return summaries:** cada `Agent()` call al recibir resultado, el orchestrator extrae 2-3 líneas plain al user. Raw report queda en `project/design-artifacts/` para audit.

---

## 3. Modes

Four modes, dispatched in Phase 0:

| Mode            | Semantics                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nuevo`         | Fresh run from Phase 1. If `16_DESIGN.md` exists → STOP, ask user to use `validar` or confirm overwrite via Phase 0 cleanup pre-flight.                                                                                                         |
| `con-direccion` | Visual direction already resolved upstream — consumes `00_DISCOVERY_BRIEF.md §11.2 Design System Strategy` (3 checkboxes). Claude-Design / Client-DS skip Phase 2 + CP1 (locked). "Usar un skin shipeado del kit" skips **only if the brief named a concrete registry skin**; if it just picked the strategy, Phase 2 + CP1 run so the user picks the skin (see `methodology/visual-direction-handoff.md §1.2`).                   |
| `validar`       | Read-only over existing `project/planning/16_DESIGN*`. Runs Phase 8 + emits a findings report to `project/design-artifacts/validar-reports/`. Zero writes to durable artifacts unless user re-invokes with `nuevo` or `--apply-validar-report`. |
| `add <plan>`    | **Day-2 iteration.** Parses a Plan Mode plan against the **existing app** (`src/app/` tree + code as-built), not the 00-15 discovery slots. Detects the touched screens, seeds `16_DESIGN.md` if absent, classifies each screen against what's built, and emits/updates SCRs **with provenance** — then offers to chain `/backlog add <plan>`. Additive: never overwrites an existing `16_DESIGN.md` wholesale. Runs Phases 0/0.5/1/3-delta/5/7/8/8.6/9 with CP saltos (CP1-seed conditional → CP3 → CP4; the greenfield CP2 does not run). |

Slash invocation `/design` with no args → Phase 0 asks the user to pick a mode.

---

## 4. Inputs consumed

| Source                                                                       | Used for                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project-config.md`                                                          | `SK_ACTIVE` flag · branding assets · stack confirm · UI language default (es-MX unless override)                                                                                                |
| `project/planning/00_DISCOVERY_BRIEF.md`                                     | Visual Direction Seeds (§11.1-§11.3) · features scope · BR canvas · North Star                                                                                                                  |
| `project/planning/01_FREEZE_MAP.md`                                          | Firm UI decisions: branding, idioma, theme support, density preferences, post-MVP exclusions                                                                                                    |
| `project/planning/02_PERSONAS.md`                                            | PER-XXX → contexts of use, devices, frequency, expertise level                                                                                                                                  |
| `project/planning/03_DEEP_DIVE.md`                                           | FT-XX 8-field specs incl. `UI sketches` text + JTBD + **`Layout impact: bool`** (drives tier classification)                                                                     |
| `project/planning/04_ARCHITECTURE.md`                                        | Topology + cache posture + module boundaries (affects route structure)                                                                                                                          |
| `project/planning/05_RBAC_MATRIX.md`                                         | Role-gated visual treatment + NavItem `roles[]`                                                                                                                                                 |
| `project/planning/06_ACCEPTANCE_SCENARIOS.md`                                | Gherkin → happy paths each SCR must support (buttons, validations, states)                                                                                                                      |
| `project/planning/07_SK_LEVERAGE.md`                                         | **Phase 4 classifier source** — sub-feature × {Configure/Extend/Build} × {S/M/L/XL} drives tier election                                                                                        |
| `project/planning/09_DATA_MODEL.md`                                          | Entities → table columns, form fields, detail page layout                                                                                                                                       |
| `project/planning/10_API_SURFACE.md`                                         | Server actions → button handlers, form submits, error states (codes → copy)                                                                                                                     |
| `project/planning/12_BACKLOG_READINESS.md`                                   | Per-FT readiness signals. If FT marked `partial`/`blocked` upstream, `/design` propagates: SCR/CMP/FLW depending on that FT marks `partial` in §10 Consumer Readiness with tracking ID adjacent |
| `project/planning/13_OQ_BY_FT_MATRIX.md`                                     | OQs with `Consumer: /design` → workflow Open Questions; OQs with `Consumer: /implement` → affect downstream packet refs                                                                         |
| `project/planning/14_DOMAIN_REGISTRY_LOCKS.md`                               | Navigation registry + reports registry + roles + KPIs (locked artifacts to honor)                                                                                                               |
| `project/planning/15_IMPLEMENTATION_PACKETS/FT-*.md`                         | Self-contained per-feature packets. **`layout_impact: bool` field propagated from `03_DEEP_DIVE.md`** (Phase 4 classifier reads this field).                                                    |
| `project/reference/INVENTORY.md` (autogen)                                   | Components already in code. Optional with warning.                                                                                                                                              |
| `project/reference/HOOKS.md` (autogen)                                       | Helpers/hooks available. Same optional-with-warning treatment.                                                                                                                                  |
| `project/reference/SCHEMA.md` (autogen)                                      | As-built data model (tables/columns/enums). Optional with warning. In `add <plan>` (plan-code) it's the source of entities when discovery `09` is absent.                                       |
| `project/reference/API.md` (autogen)                                         | As-built API surface (actions + routes). Optional with warning. In `add <plan>` it's the source of actions when discovery `10` is absent.                                                       |
| **SK skills (Read on-demand):**                                              |                                                                                                                                                                                                 |
| `sk-features-index`                                                          | Mapping features → kit shipped (what NOT to reinvent)                                                                                                                                           |
| `sk-ui` / `sk-tokens-neomorphism` / `sk-navigation` / `sk-project-structure` | Kit catalogs (primitives, tokens, NavItem, URL convention)                                                                                                                                      |
| `kb-design-engineering` / `kb-dataviz`                                       | Portable patterns                                                                                                                                                                               |
| `kb-visual-direction`                                                        | Skin family picker + visual posture (Phase 2)                                                                                                                                                   |

---

## 5. Outputs produced

```
project/planning/
├── 16_DESIGN.md                       # Index + Visual Direction final + IA + SK migration table
└── 16_DESIGN/
    ├── SCR-001-{slug}.md              # Per-screen contract (one per route)
    │                                  # Shape depends on tier (kit-pure stub / kit-extended light / custom full)
    ├── SCR-002-{slug}.md
    ├── …
    ├── components/
    │   ├── CMP-001-{slug}.md          # Per-component extension (only if criterion §CMP-Detection passes)
    │   └── …
    └── flows/
        └── FLW-001-{slug}.md          # Multi-screen flow (≥2 screens involved)

project/design-artifacts/
├── design-registry-{run_id}/
│   ├── per-ft/                        # Phase 1 output — one shard per FT (NO monolithic file)
│   │   ├── FT-S01.md
│   │   └── …
│   └── per-scr/                       # Phase 4 output — one shard per non-kit-pure SCR (concatenated from per-ft)
│       ├── SCR-002.md
│       └── …
└── scr-classification-{run_id}.md     # Phase 4 audit (tier per SCR + justification)
```

> **Condicional (solo si el usuario confirma en §20.1.2):** `project/factory/ui-extension-{YYYY-MM-DD}-{project-slug}-{NNN}.md` — un factory-ticket por extensión delgada de `sk-ui` (criterio C) que el usuario elija emitir. Shape canónico de [`fx-factory-tickets §4`](../fx-factory-tickets/SKILL.md). Headless: no se emite (las propuestas quedan listadas en `16_DESIGN.md §1.2`).

> **Modificado (no creado):** `project/planning/project-config.md` — Phase 9 cierra la fila `Design` de §2 Pipeline Status (`⬜ Pendiente → ✅ Completo`, 1 celda). Read-first → Edit condicional; skip si `is_factory`/`validar`/ya-`✅`/sección ausente.

### 5.1 `16_DESIGN.md` sections (index)

| §   | Section                  | Content                                                                                                                                             |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| §0  | Visual Direction (final) | Skin family decided + rationale anchored to `00 §11.1 Postura Visual`                                                                               |
| §1  | Design System Anchors    | SK token compatibility table + elevation/typography stance + UI language                                                                            |
| §2  | Information Architecture | Sitemap (tree) + URL convention + breadcrumb policy + sidebar/BottomNav decision                                                                    |
| §3  | Screen Map               | Table SCR-XXX × route × roles × FT refs × persona refs × packet refs × **tier** (kit-pure/kit-extended/custom) × **binding** (sk-{skill} si aplica) |
| §4  | Flow Map                 | Table FLW-XXX × screens involved × trigger × success/error paths                                                                                    |
| §5  | Component Extensions     | List CMP-XXX × based-on × why-extend × where-used                                                                                                   |
| §6  | Copy Direction           | Tone + voice + es-MX rules + reusable label patterns + i18n preparedness                                                                            |
| §7  | Cross-cutting States     | Empty/Loading/Error/Auth patterns reusable                                                                                                          |
| §8  | Kit-bindings table       | Pantallas `kit-pure` listadas con binding al skill correspondiente. Sustituye los SCR files completos para esas pantallas.         |
| §9  | Validation Checklist     | Coverage gate output (every FT/persona in ≥1 SCR? RBAC consistent?)                                                                                 |
| §10 | Consumer Readiness       | `ready / partial / blocked` for `/backlog`, `/implement` with tracking IDs                                                                          |

### 5.2 Per-file shapes (tier-aware)

| Tier           | Shape               | Template                          | Specer                              |
| -------------- | ------------------- | --------------------------------- | ----------------------------------- |
| `kit-pure`     | Stub ≤5 líneas body | `templates/SCR.template.stub.md`  | Orchestrator direct (no agent)      |
| `kit-extended` | Light 5 secciones   | `templates/SCR.template.light.md` | `dsg-screen-specer-light` (batches) |
| `custom`       | Full 13 secciones   | `templates/SCR.template.md`       | `dsg-screen-specer-full` (batches)  |

Detalle por shape en `methodology/screen-contract-shape.md`.

---

## 6. Turn boundaries

| Turn | Phases executed                                                                      | Stops with                    |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------- |
| 1    | Phase 0 (mode + cleanup pre-flight + readiness gate) + Phase 1 (per-FT shards)       | Inline progress               |
| 2    | Phase 2 (Visual Direction, if `nuevo` only)                                          | **CP1** inline checkpoint     |
| 3    | Phase 3 (IA)                                                                         | **CP2** inline checkpoint     |
| 4    | Phase 3.5 (cross-cutting vocab) + Phase 4 (SCR classification + skill-gap validator) | **CP3** inline checkpoint     |
| 5    | Phase 5 (per-screen contracts batched: pure direct + light + full)                   | Auto-completion notifications |
| 6    | Phase 6 (component extensions, if M > 0)                                             | Auto-completion notifications |
| 7    | Phase 7 (light reinforce)                                                            | Inline                        |
| 8    | Phase 8 (5 validators parallel)                                                      | Auto-completion notifications |
| 9    | Phase 8.5 (Blocker Resolution Round, if needed) + Phase 8.6 (Pre-CP4 Sweep)          | Auto + Sweep PASS check       |
| 10   | **CP4** Plan Mode formal                                                             | EnterPlanMode → user decision |
| 11   | Phase 9 (emit + handoff + tickets `ui-extension` + notes harvest, ambos opt-in)       | Done — recommend `/backlog`   |

`con-direccion` mode skips Phase 2 + CP1. `validar` mode skips Phases 1-7 (only runs Phase 8 + report).

### 6.1 `add <plan>` mode turn boundaries (day-2)

The day-2 mode runs a reduced phase set against the existing app. Turn boundaries:

| Turn | Phases executed (`add` mode)                                                                                  | Stops with                          |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1    | Phase 0 day-2 (config + plan legible + `src/app/` tree; `needs_seed` detect) + Phase 2-seed (if `needs_seed`) | **CP1-seed** inline (only if seeded) |
| 2    | Phase 0.5 (day-2 parser → frozen `parsed-design-plan.md`) + Phase 1 (`source_mode: plan-code` shards)         | Inline progress                     |
| 3    | Phase 3-delta (index reconcile — sticky IDs `max+1`) + Phase 4 day-2 (classification — action matrix × tier, §12.3) | **CP3** inline checkpoint           |
| 4    | Phase 5 (per-screen contracts, provenance passthrough) + Phase 7 (only if §6/§7 populated; else skip w/ note) | Auto-completion notifications       |
| 5    | Phase 8 (validators, `source_mode: plan-code` caveat) + Phase 8.6 (day-2 guards)                              | Auto + Sweep PASS check             |
| 6    | **CP4** (headless → inline auto-approve conservador + caveat)                                                  | Plan Mode / inline decision         |
| 7    | Phase 9 (emit index delta + Pipeline Status `🟡 Parcial (seed)` + offer to chain `/backlog add`)              | Done — offer `/backlog add <plan>`  |

> **CP numbering has saltos in `add` mode (do NOT let the announce confuse).** The greenfield CP1 (visual direction) and CP2 (IA) **do not run**. In their place: a conditional **CP1-seed** (only when Phase 2-seed runs because `16_DESIGN.md` was absent), then **CP3** (classification + reconcile preview), then **CP4** (final). So the sequence is `CP1-seed? → CP3 → CP4` — CP2 is intentionally absent. Phase 6 (CMP) runs only if Phase 5 surfaces M>0 component extensions (same trigger as greenfield).
>
> **Headless chain (closes without a hole).** CP1-seed / CP3 / CP4 each declare a headless default (auto-approve conservador + caveat — see each phase), so this workflow runs end-to-end headless on its own. **Nothing upstream chains it automatically:** `/backlog` records UI without a spec as a narrated signal and continues, so a run that wants the design spec first invokes `/design add <plan>` explicitly. This repo ships the contract + defaults; an external headless orchestrator may drive the sequencing, and its trigger is its own. The residual risk that specs reach the SSOT without human reading is **C2 — declared in §26 Out of scope / risks, not sold as a mitigation**.

---

## 7. Phase 0 — Cleanup pre-flight + mode detect + readiness hard gate

### 7.1 Cleanup pre-flight
**Skipped entirely in `validar` mode** — that mode promises zero durable writes (§7 modes table), and offering to delete `16_DESIGN/**` before dispatch would break that promise. Run BEFORE readiness gate. Checks for output of a previous abortive `/design` run with the **Glob** tool (3 patterns):

- `project/planning/16_DESIGN.md`
- `project/planning/16_DESIGN/**`
- `project/design-artifacts/**`

Outcome:

- If all three return empty → no-op, continue to readiness gate.
- If exists → `AskUserQuestion` (default interactivo; tabla numerada como fallback sin la tool — `CC.md §3`), plain language:

```
Encontré output de /design previo:
  - 16_DESIGN.md (parcial)
  - 16_DESIGN/ ({N} archivos SCR)
  - design-artifacts/ (registry + classification de run abortado)

### Opciones
| 1 | Backup a 16_DESIGN.backup-{timestamp}/ + remove (recommended) |
| 2 | Remove direct (irreversible)                                  |
| 3 | Cancel — quiero inspeccionar antes                            |
```

- Default opt 1: backup-then-remove. Solo después de confirmación se ejecuta `mv ... 16_DESIGN.backup-{ts}/` + remove de los originales.
- Opt 2 requires extra confirm ("¿estás seguro? Esto borra sin backup.").
- Opt 3 ends the workflow.

NO `rm -rf` sobre artefactos durables (`16_DESIGN.md` / `16_DESIGN/`) bajo ninguna circunstancia — el remedio es backup-then-remove con confirmación. Los artefactos efímeros del run (`project/design-artifacts/${RUN_ID}`) sí se limpian con `rm -rf` en §20.3, con el guard de `RUN_ID` no vacío.

### 7.2 Hard gate on tk-discovery output

Required artifacts (workflow STOPs inline if any missing):

- `project-config.md`, `00_DISCOVERY_BRIEF.md`, `01_FREEZE_MAP.md`, `02_PERSONAS.md`, `03_DEEP_DIVE.md`, `04_ARCHITECTURE.md`, `05_RBAC_MATRIX.md`, `06_ACCEPTANCE_SCENARIOS.md`, `07_SK_LEVERAGE.md`, `08_GLOSSARY.md`, `09_DATA_MODEL.md`, `10_API_SURFACE.md`, `12_BACKLOG_READINESS.md`, `13_OQ_BY_FT_MATRIX.md`, `14_DOMAIN_REGISTRY_LOCKS.md`, `15_IMPLEMENTATION_PACKETS/` (≥1 FT-XX.md).

Optional: `11_CLIENT_QUESTIONS.md` (absent in projects without client interview round).

**STOP message (plain language):**

```
❌ No puedo continuar — falta output de /discovery.

Estos archivos son required pero no existen:
  - [list of missing paths]

Corre `/discovery validar` para regenerar los slots faltantes.
```

### 7.3 Mode dispatch

- **`nuevo`** → proceed to Phase 1.
- **`con-direccion`** → read `00_DISCOVERY_BRIEF.md §11.2 Design System Strategy`. Claude-Design / Client-DS checkbox → skip Phase 2 + CP1 (locked). "Skin shippeado del kit" → skip **only if a concrete registry skin was named**; else run Phase 2 + CP1 to pick it. Ambiguous / no checkbox → STOP, redirect to `nuevo`. (Detail: `methodology/visual-direction-handoff.md §1.2`.)
- **`validar`** → load `16_DESIGN.md` + `16_DESIGN/`. Skip Phases 1-7. Jump to Phase 8.
- **`add <plan>`** → day-2 path (§7.5).

### 7.5 `add <plan>` mode — day-2 requirements + `needs_seed` detect

The day-2 mode does **NOT** require the 00-15 discovery slots (an existing app being iterated rarely has them fresh). Its required inputs are different:

- **`project-config.md`** — stack confirm + branding + `is_factory` guard.
- **A legible plan file** (the `<plan>` arg) — parsed in Phase 0.5 (`day2-plan-input.md`). Illegible → STOP.
- **The `src/app/` route tree on disk** — Glob `src/app/**/page.tsx`. Empty → STOP "no encuentro rutas en `src/app/`; `/design add` itera sobre una app existente".

The discovery hard gate (§7.2) is **skipped** in `add` mode — it gates greenfield only.

**`needs_seed` detection:** Glob `project/planning/16_DESIGN.md`.

- **Absent** → set `needs_seed: true`. Phase 2-seed (§7.7 — `templates/16_DESIGN.seed.template.md`) runs first to emit a minimal `16_DESIGN.md` (§2 sitemap + §3 Screen Map from `navigation.ts` + route tree; §0/§1 from `15_DESIGN.md` legacy harvest or kit defaults from `globals.css`). CP1-seed gates the extraction.
- **Present** → `needs_seed: false`. Proceed additively — the index is **never overwritten wholesale**; Phase 3-delta reconciles into it.

**Cleanup pre-flight in `add` mode (additive):** the §7.1 cleanup pre-flight is **modo-aditivo** — it does NOT touch an existing `16_DESIGN.md` / `16_DESIGN/` (those are the app's durable design contract being extended, not abortive-run output). It only cleans a stale `design-artifacts/{run-id}/` from a prior aborted day-2 run, per R-NEW-1 (backup-then-remove, never `rm -rf` the parent).

### 7.4 `SK_ACTIVE=false` handling

- `§1 Design System Anchors` reduces to `{idioma, custom token strategy}` (no SK migration table).
- All SCRs classified as `custom` automatically (no kit-pure or kit-extended possible without kit).
- `§5 Component Extensions` becomes PRIMARY catalog.

### 7.7 Phase 2-seed — Minimal `16_DESIGN.md` from code (`add` mode, only if `needs_seed`)

> Runs only in `add <plan>` mode, **right after Phase 0** (which set `needs_seed: true` because `16_DESIGN.md` was absent — §7.5) and **before** Phase 0.5 (the plan parser). Orchestrator main loop — **no agent**: this is a linear extraction pass over the app's own code (sitemap + Screen Map from `navigation.ts` + route Glob + legacy harvest or kit-default placeholder), which is orchestration logic with the full context in the main loop (`fx-workflow-authoring §8` — no input that would contaminate context, no closeable input/output contract to isolate). Output shape FROZEN: [`templates/16_DESIGN.seed.template.md`](templates/16_DESIGN.seed.template.md).
>
> **Additive guard (never overwrites):** Phase 2-seed runs **only** when `needs_seed: true`. If `16_DESIGN.md` already exists (`needs_seed: false`), this whole phase is **skipped** — Phase 3-delta reconciles into the existing index instead (§7.5). The §7.1 cleanup pre-flight is modo-aditivo in `add` mode and never touches an existing `16_DESIGN.md` (§7.5). So an app with documented SCRs is never re-seeded.

**Extraction steps (orchestrator-direct, in order):**

1. **Sitemap (§2).** Glob `src/app/(public)/**/page.tsx` + `src/app/(protected)/**/page.tsx`; build the ASCII route tree. Record the **Glob limitation** honestly: custom route groups (`(auth)`, `(legal)`, ungrouped top-level) fall outside the pattern → flag for manual review at CP1-seed (do not silently drop them).
2. **Screen Map (§3) from `navigation.ts` + the route tree.** Read `src/config/navigation.ts` — each item + its `children` → a Screen Map row (route × `roles[]` copied as-observed). Cross-fill with any Glob route not present in navigation (e.g. a detail page). **Assign a sticky `SCR-NNN` ID to every discovered route** in order (main nav → role-gated → modals). `Features`/`Personas`/`Packet` = `—`; `Tier` left blank (Phase 4 day-2 fills it). This is the **first ID minting** for the app — Phase 3-delta later reads the `max SCR-NNN` and only mints `max+1` for **new** plan screens (no collision — §7.5 / §21.1).
3. **Visual Direction (§0) — harvest or honest placeholder (C10 barrier).**
   - **Legacy `15_DESIGN.md` present** → harvest §0 (skin family + rationale + posture), **cross-checked against `src/app/globals.css`**: the code is the **token arbiter** — on any conflict the code value wins, the legacy value is recorded as superseded. Record harvest coverage (which sections came from legacy, which were absent → placeholder). Add the legacy path to `seed_sources`.
   - **No legacy file** → emit the **honest placeholder**: an explicit note "no se ha definido dirección visual del proyecto" + the kit-default tokens **extracted from `globals.css`** (every cell traces to a `--*` declaration), marked "observed, not chosen". 🔴 **Never invent** a skin family, color, typography, spacing, or motion value. The `seeded_from_code: true` frontmatter + the in-section note are the barrier (the placeholder must NOT read as a decided direction).
4. **§8 Kit-bindings — exact matches only.** Read `.claude/skills/sk-features-index/SKILL.md` (reference only). Add a §8 binding row **only** for a route that maps to a feature explicitly listed there (login → `sk-security`, notifications → `sk-notifications`, …). Any route without an exact kit-shipped match is left out of §8 and noted `— (no exact kit-shipped match; classify in Phase 4)` — **never guess a binding**.
5. **Write the seed** to `project/planning/16_DESIGN.md` using `templates/16_DESIGN.seed.template.md` (frontmatter `seeded_from_code: true` + `seed_sources` + `status: partial`).

**CP1-seed — Seed extraction approval (inline checkpoint).**

> CP1-seed is the **only** checkpoint specific to the seed; it gates the extraction before Phase 0.5 consumes the §3 IDs. Numbering note: in `add` mode the greenfield CP1 (visual direction) and CP2 (IA) do **not** run — CP1-seed is conditional (only when seeded) and is followed by CP3 then CP4 (§6.1). Reuses `fx-workflow-authoring/templates/checkpoint-inline.template.md`.

Plain language CP narration:

```
🛑 CP1-seed — Índice mínimo extraído del código

No encontré 16_DESIGN.md, así que generé un índice base desde tu código:
  • {N} pantallas detectadas (navigation.ts + rutas src/app) — IDs SCR-001..SCR-0NN asignados
  • Dirección visual: {cosechada de 15_DESIGN.md legacy | placeholder honesto — sin dirección definida, solo defaults del kit}
  • {K} bindings kit-shipped exactos (login → sk-security, …); el resto queda sin clasificar (Phase 4)

Para tu revisión:
  • Rutas fuera de (public)|(protected) que el Glob NO captó (revisar manual): {lista o "ninguna"}
  • §0 es {un harvest del legacy | un placeholder — NO una dirección decidida}

### Opciones
| 1 | Aprobar extracción — continúo a parsear el plan (Phase 0.5)        |
| 2 | Corregir — ajusto rutas/IDs/bindings antes de continuar           |
| 3 | Cancelar — termina el run; no se consume el seed                  |
```

- **Opt 2** → user indica las correcciones (rutas faltantes, binding equivocado, ID a re-ordenar); orchestrator parcha el `16_DESIGN.md` seed in place y re-presenta CP1-seed.
- **Opt 3** → ends the run. The seed `16_DESIGN.md` queda escrito (es el primer índice del app, no efímero) pero ninguna fase downstream lo consume.

**Headless default (no TTY):** auto-approve **conservador** — el seed se acepta tal cual se extrajo (extracción es determinista sobre el código; no hay decisión inventada que validar) + **caveat en el manifest** (`day-2 seed auto-aprobado headless — revisión humana del índice pendiente`, incluyendo el §0 placeholder si aplica). Es un eslabón de la cadena headless (§6.1); el riesgo residual de que el índice (incl. §0 placeholder) llegue al SSOT sin lectura humana es **C2 (§26), declarado, no mitigado**.

---

## 7.6 Phase 0.5 — Day-2 plan parser (`add` mode only, orchestrator-direct)

> Runs only in `add <plan>` mode, after Phase 0 (+ Phase 2-seed if `needs_seed`), before Phase 1 dispatch. Orchestrator main loop — **no agent** (plan parsing is orchestration logic, `fx-workflow-authoring §8`). Full contract: [`methodology/day2-plan-input.md`](methodology/day2-plan-input.md). Output shape FROZEN: [`templates/parsed-design-plan.template.md`](templates/parsed-design-plan.template.md).

The parser reads the plan, runs the three steps below, and **freezes** the decomposition into `project/design-artifacts/{run-id}/parsed-design-plan.md` + a SHA-256 of the plan bytes. Downstream phases read the frozen artifact — none re-decides the classification or attribution.

### 7.6.1 Shared vs own (C5)

| Step                        | Owner                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| **Step 1 — unit detection** | **SHARED** with `tk-backlog` — cross-ref `.claude/skills/tk-backlog/methodology/plan-mode-input.md §Step 1`. NOT duplicated. |
| **Step 2 — classification** | **OWN** — `ui-unit` / `non-ui-unit` / `prose` (NOT backlog's `issue` / `prose-non-issue`).      |
| **Step 3 — attribution**    | **OWN** — unit → screen(s) **by route** (NOT → files, which is backlog's concern).              |

🔴 The shared Step 1 is cited by cross-ref with a reciprocal back-pointer in `plan-mode-input.md`. That file is in active churn — re-verify the back-pointer resolves on any refactor (watch-item C5). The own classification + attribution live in `day2-plan-input.md`; they intentionally diverge from backlog's split.

### 7.6.2 STOP / redirect

- **Plan illegible** (no detectable unit) → STOP.
- **`ui-unit` with no resolvable screen** (no route/slug) → STOP "la unidad «{title}» describe UI pero no resuelve una pantalla". Nothing is frozen (atomic — no `parsed-design-plan.md` written). NEVER silent-skip.
- **Plan with zero ui-units** (all `non-ui-unit` / `prose`) → **exit with redirect** to `/backlog add <plan>`. No design artifact generated.

The frozen `parsed-design-plan.md` carries the screens by route with `as_built` (existing `page.tsx` or `new`), leaving `day2_action` (Phase 4 day-2 — DSGN-002) and `scr_id` (Phase 3-delta) blank for downstream assignment.

---

## 8. Phase 1 — Per-FT shards (no monolith)

Delegated: `dsg-context-analyst` (serial, 1 invocation).

The agent reads all required artifacts + on-demand SK skills, and emits **one shard per FT** in `project/design-artifacts/design-registry-{run-id}/per-ft/FT-XX.md`.

**No monolithic registry file**. Phase 4 concatenates per-FT shards into per-SCR shards on-demand.

Shape per shard: `tk-design/templates/registry-shard.template.md` (§1-§7 + §9, `shard_type: per-ft`).

Agent returns 5-8 line plain-language summary to orchestrator. Orchestrator does NOT inline the shards — they're read by Phase 4 + Phase 5.

### 8.1 `add` mode dispatch — `source_mode: plan-code` branch

In `add <plan>` mode the same `dsg-context-analyst` runs a different branch: `source_mode: plan-code` (the `discovery` branch is greenfield). Instead of the 00-15 slots it reads the frozen `parsed-design-plan.md` + the as-built `page.tsx` files of each target screen + `INVENTORY.md` / `HOOKS.md` / `navigation.ts`, and emits **per-SCR day-2 shards** (`shard_type: per-scr-day2`) carrying a caveat (`no FT/persona refs — plan-code source`) that the Phase 8 validators read. The branch + caveat + as-built handling are specced in `dsg-context-analyst`; the contract row is in §22.

---

## 9. Phase 2 — Visual Direction finalization

Only runs in `nuevo` mode. Skipped in `con-direccion` and `validar`.

- Orchestrator reads `00_DISCOVERY_BRIEF.md §11.1 Postura Visual` and `§11.2 Design System Strategy`.
- Orchestrator **reads the shipped-skin registry `src/config/skins.ts`** — extract the keys of `export const SKINS` (the available skins) + the current `ACTIVE_SKIN`. This list is **dynamic — NEVER hardcode skin names**; a skin added to the registry later must appear here automatically. (Read-only: `/design` never edits `skins.ts` — that's a code-phase job, see the boundary note below.)
- Orchestrator **loads (Read) `.claude/skills/kb-visual-direction/SKILL.md`** and applies its §2 Required process, incl. **Step 0 (shipped skins first)**: map the product posture to the registry skins — a shipped skin that fits wins over defining a new direction.
- Emits `16_DESIGN.md §0 Visual Direction` (final) + `§1 Design System Anchors` (initial draft). Record the decision in the `visual_direction` frontmatter: the **shipped skin name** (a `SKINS` key) if one was chosen, or the conceptual family / `custom` if a new direction was taken.

### CP1 — Visual Direction approval

Plain language CP narration. Present the **shipped skins from the registry** as concrete candidates first, then the escape to a custom direction:

```
🛑 CP1 — Dirección visual propuesta

Recomendado: {shipped skin name | familia conceptual (custom)}
Razón: {2-3 sentences anchored to 00 §11.1}
Migración SK: {0 (skin ya shippeado) / X tokens to extend / N/A}

Skins shipeados disponibles (de src/config/skins.ts): {skin-a, skin-b, …} — activo hoy: {ACTIVE_SKIN}

### Opciones
| 1 | Aprobar el recomendado — proceder a Phase 3                                          |
| 2 | Elegir otro skin shipeado — de la lista de disponibles                              |
| 3 | Otra dirección (custom) — definir una skin family nueva (kb-visual-direction §3)     |
| 4 | Cancelar — termina el workflow                                                       |
```

> **Extensibilidad:** la lista de skins disponibles sale del registry en runtime, no hardcodeada — al agregar un skin a `src/config/skins.ts` aparece solo en CP1. La opción 3 preserva el camino de dirección nueva/custom cuando ningún skin shippeado encaja.
> **Boundary:** elegir el skin aquí solo **registra la decisión** en `16_DESIGN §0` (`visual_direction`). El switch real (`ACTIVE_SKIN` + `pnpm generate:skin`) lo aplica la fase Code — `/implement` vía el issue de setup que `/backlog` emite (§SETUP). `/design` nunca toca `src/`.

---

## 10. Phase 3 — Information Architecture

- Build sitemap from `14_DOMAIN_REGISTRY_LOCKS §Navigation` + `05_RBAC_MATRIX` + `03_DEEP_DIVE` (implicit routes).
- Decide sidebar/BottomNav allocation per `sk-navigation` rules.
- Emit `16_DESIGN.md §2 Information Architecture` + `§3 Screen Map` + `§4 Flow Map`.

### 10.1 SCR ID assignment (deterministic, sticky)

Same as v1: parse existing `§3 Screen Map` for sticky IDs + tombstones. New IDs assigned in order (main nav → admin → modals). IDs sticky once assigned.

### CP2 — IA approval

Plain language CP narration:

```
🛑 CP2 — Arquitectura de información propuesta

Screen Map: {N} pantallas
  - {X} pantallas de navegación principal
  - {Y} pantallas admin / role-gated
  - {Z} modales / overlays

Sidebar (desktop): {N} items
BottomNav (mobile): {Y} tabs + Más sheet ({Z} items)
Flow Map: {F} flujos multi-pantalla

### Opciones
| 1 | Aprobar — proceder a Phase 3.5 + Phase 4 (classification)     |
| 2 | Editar — agregar/quitar pantallas, cambiar allocation          |
| 3 | Cancelar — termina el workflow                                 |
```

### 10.2 Phase 3-delta — Index reconcile (`add` mode only, orchestrator-direct)

> Runs only in `add <plan>` mode, replacing the greenfield Phase 3 (full IA build) + CP2. Orchestrator-direct. This is **the only phase that assigns SCR IDs in day-2** — without it, the next run re-assigns IDs already in use (real collision). Its approval travels in CP3 (not a CP2 — CP2 does not run in `add` mode).

Reconciles the existing `16_DESIGN.md` (or the freshly-seeded one) against the screens the plan touches (frozen in `parsed-design-plan.md §2`):

1. **Sticky ID assignment (`max+1`).** Parse `§3 Screen Map` for the existing rows, read the **max `SCR-NNN`** already present (including tombstones — a tombstoned ID is never reused). Each **new** screen (no covering SCR by route/slug) gets `max+1`, `max+2`, … in plan order. IDs are sticky once assigned and written into `parsed-design-plan.md §2 scr_id` (frozen). A **second parse of the same plan reads the already-updated max → produces the same `max+1`** (no collision) — this is the determinism the AC requires.
2. **New rows in §3.** Append a Screen Map row per new screen (route × roles × tier × binding) — Features/Personas/Packet = `—` (plan-code source has no FT/persona chain).
3. **Update existing rows on backfill/regen.** For a screen the plan touches that already has an SCR (regen) or exists in code without a spec (backfill): update its **tier** + **File** cells in §3 in place. ID is preserved (sticky); the row is not duplicated.
4. **§4 Flow Map.** If the plan introduces a multi-screen flow → add the FLW row (sticky FLW-NNN, same `max+1` discipline).
5. **§8 Kit-bindings.** For new `kit-pure` screens → add the binding row (sk-{skill}).
6. **§10 Consumer Readiness refresh** — recompute the `ready / partial / blocked` lines for the touched screens.

> **`day2_action` (nueva / regenerar / backfill)** is assigned in Phase 4 day-2 classification (§12.3 — action matrix in [`methodology/day2-classification.md`](methodology/day2-classification.md)); Phase 3-delta consumes it to decide new-row vs in-place-update.

---

## 11. Phase 3.5 — Cross-cutting vocabulary

Emit `§6 Copy Direction` + `§7 Cross-cutting States` **before** Phase 4 classifier. Provides shared vocab for downstream phases.

**Output:**

- `§6 Copy Direction` — es-MX rules + reusable label patterns + i18n preparedness.
- `§7 Cross-cutting States` — empty/loading/error/auth patterns.

Source: `14_DOMAIN_REGISTRY_LOCKS` + per-FT shards + `08_GLOSSARY.md` + `project-config.md §branding.tone`.

---

## 12. Phase 4 — SCR classification
> **Why this phase exists:** without classification, every SCR (including pure kit-shipped ones like login) gets a 200+ line full spec. With it, only `custom` screens pay the full cost; `kit-pure` and `kit-extended` get stub/light treatment.

Run AFTER Phase 3.5 cross-cutting vocab, BEFORE Phase 5 per-screen contracts. Orchestrator inline (no agent — fast pass).

### 12.1 Steps

1. **Lookup FT → 07_SK_LEVERAGE:** map each SCR's `features[]` to rows in `07_SK_LEVERAGE.md`. Each row has `action: Configure | Extend | Build` × `effort: S | M | L | XL`.

2. **Customization signal:** apply rule from `methodology/screen-contract-shape.md §Tier election rule`:
   - **Project-level defaults DON'T count:** es-MX copy, theme tokens, branding logos applied via theme provider.
   - **Per-screen customizations COUNT:** layout reshape, flow divergence, data presentation custom, role-specific divergence, state deltas vs §7.

3. **Tier assignment** (rules in order, first match wins):
   - **Rule 1:** any mapped FT has `layout_impact: true` → tier `custom`.
   - **Rule 2:** any `Build` row referenced → tier `custom`.
   - **Rule 3:** majority `Extend` (Extend count > Configure count) → tier `custom`.
   - **Rule 4:** some `Extend` with per-screen customizations (without layout impact) → tier `kit-extended`.
   - **Rule 5:** 100% `Configure` + cero per-screen customizations → tier `kit-pure`.
   - **Rule 6:** borderline ambiguity → default-conservative `custom` (fail-toward-custom).

4. **Per-SCR shard build:** concatenate per-FT shards (Phase 1 output) for this SCR's mapped FTs. **Dedup** entities/actions/RBAC slices. Declare `skills_consult: [...]` derived from packet content (NOT hardcoded table — see `dsg-context-analyst` for derivation rules).

5. **Skill-gap validator:** lint heurístico sobre shard content vs expected skill hints. Marca `skills_warning` cuando aplica:
   - Shard menciona `chart` / `viz` / `KPI` → expect `kb-dataviz`. Missing → flag.
   - Shard menciona `DataTable` / `columnas` / `pagination` → expect `sk-ui`. Missing → flag.
   - Shard menciona `Form` / `Zod` → expect `sk-ui` form kit. Missing → flag.

   **Crítico:** este validator NO es SSOT del skill-to-screen-type mapping. Es lint sobre datos derivados que surface gaps al user en CP3 para decisión consciente.

6. **Audit trail:** write `project/design-artifacts/scr-classification-{run_id}.md` per `templates/scr-classification.template.md`.

### 12.2 CP3 — Classification approval

Plain language CP narration:

```
🛑 CP3 — Clasificación de pantallas

Clasifiqué las {N} pantallas en 3 tiers:
  • {A} kit-pure — pantallas que ya shippea el kit sin customization
    → stub de 5 líneas, sin spec completo
  • {B} kit-extended — kit + extensiones específicas (campos custom, validation custom)
    → spec light de 5 secciones
  • {C} custom — pantallas a diseñar desde cero (dashboards, admin tooling)
    → spec full de 13 secciones

Detecté {X} skill-gaps en packets (skills relevantes faltantes):
  • SCR-XXX {nombre} — falta {skill} (mencionado en contenido del shard)
  • ...

Casos en borderline para tu revisión:
  • SCR-YYY {nombre} — clasificado {tier} porque {razón breve}. ¿Confirmas?
  • ...

### Opciones
| 1 | Aprobar clasificación + completar skill-gaps (recommended)         |
| 2 | Aprobar pero NO completar skill-gaps (degradación informada)       |
| 3 | Override per-screen — quiero subir/bajar algunas de tier           |
| 4 | Cancelar — quiero revisar packets antes de continuar               |
```

**Opt 3 sub-flow — AskUserQuestion schema explícito (headless-safe):**

```yaml
questions:
  - question: '¿Qué pantallas quieres subir/bajar de tier?'
    header: 'Override tier'
    multiSelect: true
    options:
      # Solo SCRs no-custom listadas (kit-pure + kit-extended).
      # Para cada SCR: label="{SCR-ID} {slug} — {current_tier}", description="Sube a {next_tier} si ...".
      - label: 'SCR-001 login — kit-pure'
        description: 'Sube a kit-extended si la pantalla necesita extension específica del login (e.g., OTP custom).'
      # ... (one option per non-custom SCR, max 30 visible; if > 30 → batch in groups of 30)
```

Headless behavior:

- Si `len(non-custom-SCRs) == 0` → opt 3 NO se muestra al user (skip directly).
- Si `len > 30` → batch en grupos de 30 + scroll indicator en narration.
- Sin selección (user deja vacío + envía) → no-op equivalente a opt 1 sin completar gaps.
- Target tier per override: orchestrator auto-promueve al next tier inmediato (kit-pure → kit-extended; kit-extended → custom). NO se permite bajar de custom a kit-pure (sería pérdida de info; require explicit re-classify).

**Opt 2 effect:** per-SCR shards mantienen `skills_warning: [...]` + `skills_warning_acknowledged: true`. Specer recibe set incompleto + ack flag → emite warning inline en el spec generado.

### 12.3 Phase 4 day-2 branch + CP3 in `add` mode

In `add <plan>` mode the greenfield Phase 4 tier election (FT → `07_SK_LEVERAGE` lookup) does NOT apply — there is no FT chain. Instead, for each screen frozen in `parsed-design-plan.md §2`, the classifier runs the **day-2 action matrix + tier signals** (SSOT: [`methodology/day2-classification.md`](methodology/day2-classification.md)) and writes `day2_action` into `parsed-design-plan.md §2` (consumed by Phase 3-delta for new-row vs in-place-update):

1. **Action (deterministic, 4 cells).** `¿existe en código?` (`as_built` real `page.tsx` vs `new`) × `¿tiene SCR?` (covering SCR by route, fallback slug) → `nueva` / `regenerar` / `backfill`. These cells are the assert surface of `verify-scr-classifier.ts` (day-2 action fixtures).
2. **Tier (judgment, fail-toward-custom).** From the plan delta + as-built code signals (`day2-classification.md §Tier signals`): nueva con layout propio → custom; delta que reshapea layout → custom; backfill de kit-mount + customizations → kit-extended; ruta kit-shipped pura → kit-pure; borderline → custom (fail-toward-custom). Tier is NOT asserted — judgment lives in the worked examples.
3. **Regen tier rule.** On `regenerar` conserve the existing tier; raise automatically if the delta adds a custom-layout signal; lower ONLY with an explicit CP3 override (never silent — Phase 8.6 guards against auto-downgrade).
4. **Value framing.** Surface order in CP3 = nueva > regenerar > backfill (`day2-classification.md §Value framing`) so review prioritizes the prescriptive cases; a backfill's as-built is descriptive, its prescriptive value is the plan delta.

CP3 then carries the **day-2 classification + the Phase 3-delta reconcile preview**. The narration adds:

```
🛑 CP3 — Clasificación day-2 (acción × tier) + reconcile

Pantallas tocadas por el plan ({N}):
  • {SCR-ID/route} {slug} — nueva × custom — {1-line reason}        ← mayor valor (spec proactivo)
  • {SCR-ID} {slug} — regenerar × kit-extended (conservado) — {reason}
  • {route} {slug} — backfill × kit-pure — {reason}                 ← higiene; valor en el delta

Borderlines (fail-toward-custom — confirma):
  • {route} {slug} — clasificado custom porque {señales mixtas}. ¿Confirmas?

Reconcile preview (Phase 3-delta):
  • IDs nuevos (max+1): {SCR-NNN} para {nuevas}
  • Updates in place (sticky ID): {SCR-MMM} tier/File para {regen/backfill}

### Opciones
| 1 | Aprobar clasificación + reconcile (recommended)                    |
| 2 | Aprobar sin completar skill-gaps (degradación informada)           |
| 3 | Override per-screen — forzar acción o tier de alguna pantalla      |
| 4 | Cancelar — quiero revisar el plan antes de continuar               |
```

The numbered options mirror §12.2 (approve / approve-without-gaps / override per-screen / cancel). An **override of the `day2_action` or a tier downgrade at CP3** (e.g. user forces `regenerar` where the classifier said `backfill`, or lowers `custom` → `kit-pure`) writes an **append-only tombstone** to `parsed-design-plan.md §4` (§21.1), never rewriting the live decision in place. A tier **downgrade** is the only change that requires the override — raises happen automatically.

**Headless default:** auto-approve conservador (fail-toward-custom on borderline tiers; **no destructive tier downgrades** — the regen rule forbids silent lowering) + manifest caveat (`day-2 classification unreviewed`). This is one link of the headless chain (§6.1); the residual risk that specs reach the SSOT unread is **C2 (§26), declared not mitigated**.

---

## 13. Phase 5 — Per-screen contracts (batched, tier-aware)

Dispatch per tier from Phase 4 classification:

| Tier           | Dispatch                                      | Output                                  |
| -------------- | --------------------------------------------- | --------------------------------------- |
| `kit-pure`     | Orchestrator direct (NO agent spawn)          | Stub file ≤5 líneas (template stub)     |
| `kit-extended` | `dsg-screen-specer-light` (batched N targets) | Light file 5 secciones (template light) |
| `custom`       | `dsg-screen-specer-full` (batched N targets)  | Full file 13 secciones (template full)  |

### 13.1 Batching rule

- `batch_size: 4` default. Configurable via frontmatter `batch_size_default`. Tunable per-run vía orchestrator param.
- **Tier wins, cohesion best-effort within tier.** Don't mix tiers in one batch.
- Cap concurrente: 6 (CC native).
- For N targets of a given tier: `ceil(N / batch_size)` batches dispatched per message.

**Example dispatch (KK BI: 2 pure + 4 extended + 30 custom):**

1. Orchestrator emits 2 stubs serially (~1 min).
2. Single message dispatches: 1 light batch (4 SCRs) + 6 full batches (5 SCRs each, cap-6 parallel).
3. Total wall-clock: ~1 + max(10 light, 18 full) = ~19 min.

### 13.2 Failure mode

**Per-target atomicity:**

- Each specer emits each archivo INDEPENDIENTEMENTE.
- Specer returns `results: { target: SCR-XXX, status: ok|error, error_msg? }[]`.
- Si una SCR del batch falla → solo esa entrada queda `error`, las otras se escriben.
- Archivos parciales NUNCA se borran (idempotente — re-spawn overrides).

**Orchestrator post-batch integrity check:**

- Stat cada path esperado en `targets[]`.
- Para cada esperado-pero-faltante o marcado `error` → re-spawn en batch de 1.
- **Max 2 re-spawn attempts por target.** Después → STOP-with-surface al user.

**Context overflow:**

- Si batch entero falla con token-limit error → orchestrator divide en 2 (e.g., 5 → 2+3) y re-spawna.
- **Max 1 split por batch.** Si sub-batches también fallan → degradar a per-1.

**Mobile-first lint per-archivo** (custom tier only):

- Parse cada SCR custom emitido. Verificar `375px` keyword + box-drawing chars.
- Missing → re-spawn ese SCR individual con `corrective_feedback`. Max 2 attempts.

### 13.3 Per-agent input

See agent contracts in §19 below. Each specer receives:

- `targets[]` array (4-5 SCRs).
- `shard_paths[]` (per-SCR shard for each target).
- `shared_vocab_path` (= `16_DESIGN.md` for §6 + §7 read).
- `template_path` (full or light).
- `skills_consult[]` (union of targets' shard skills, deduped).
- `output_dir` (= `project/planning/16_DESIGN/`).

**`add` mode adds provenance to the per-agent input.** In `add <plan>` mode each specer also receives the screen's `provenance` (`source_tier`, `plan_source` = path#anchor + hash sha-12, `day2_action`) so it can stamp the SCR frontmatter and, on `regenerar`/`backfill`, handle the as-built block from the per-scr-day2 shard. The provenance passthrough + as-built handling live on the specer side (`dsg-screen-specer-full`/`-light`); this section declares the input contract that carries them.

### 13.4 Orchestrator post-batch checks

- **Cross-reference:** every FT in `03_DEEP_DIVE.md` appears in ≥1 SCR? Every persona in ≥1 SCR? RBAC matrix vs SCR access consistent?
- **Integrity:** all expected files exist + lint passes per §13.2.

---

## 14. Phase 6 — Component extensions

Delegated: `dsg-component-specer` × M (parallel, cap 4). Only runs if M > 0.

Trigger: SCRs from Phase 5 list components not in `sk-ui` or `INVENTORY.md` that pass CMP-Detection criterion (A/B/C — see `methodology/component-extension-policy.md`).

Each agent produces `16_DESIGN/components/CMP-XXX-{slug}.md`.

Phase 6 emits `16_DESIGN.md §5 Component Extensions` table.

**Criterion C (thin sk-ui extension):** if a component is a thin extension used in ≥2 screens → the variant belongs to the **kit**, not to this project: no local `CMP-XXX` (don't fork the kit for thin cases). Phase 6 **accumulates** the proposal as a line in `16_DESIGN.md §1.2 Extension proposals` and emits **nothing** here — the run isn't validated yet and Phase 7/8 can still re-classify (`methodology/component-extension-policy.md §5`). The accumulated list is offered for emission as `ui-extension` factory-tickets at the close of the run (§20.1.2).

---

## 15. Phase 7 — Cross-cutting reinforcement (light)

§6 + §7 already emitted in Phase 3.5. Phase 7 only reinforces / closes:

- Verifies each SCR's `## States` + `## Copy` doesn't contradict shared patterns.
- Resolves copy conflicts. Apply via inline checkpoint if LOW-impact; defer to CP4 Edit cycle if HIGH-impact.

**`add` mode:** Phase 3.5 does not run in day-2 (no greenfield IA build), so Phase 7 runs **only if §6 Copy Direction + §7 Cross-cutting States already exist populated** in the existing/seeded `16_DESIGN.md`. If a fresh seed left them as placeholders → **skip Phase 7 with a 1-line note** (there is no populated shared vocab to reinforce against). Surface the skip in the CP4 narration.

---

## 16. Phase 8 — Adversarial validation (5 validators parallel)

5 generic agents, single message (parallel batch). Scopes non-overlapping:

| Agent              | Scope                                                        | Block if…                                           |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------- |
| `ui-critic`        | Visual + IA + DS compliance + Quality scorecard 8-dim        | FAIL on DS1/DS2/DS4/DS6                             |
| `product-owner`    | Feature/persona/scope alignment + FT readiness chain         | Missing FT/persona coverage → blocker               |
| `skeptical-client` | Copy clarity es-MX + client-facing credibility               | Critical copy ambiguity → blocker                   |
| `architect`        | `04_ARCHITECTURE.md` + `sk-project-structure` URL convention | Route convention break / module not in 04 → blocker |
| `project-planner`  | Timing + dependency chains + Wave assignment                 | Hidden dependency cycle / impossible wave → blocker |

Orchestrator synthesizes Top findings by severity. **Plain language summary 3-4 lines ANTES de listar findings raw** (anti-pattern enforcement per CC.md §3).

**Shape de invocación de los cinco** ([`fx-workflow-authoring §8`](../fx-workflow-authoring/SKILL.md)): los cinco corren en **`opus`** — es el modelo que sus fichas declaran tras la recalibración de modelos, y el spawn lo pasa **explícito** en vez de heredarlo, para que bajar una ficha por descuido no degrade un pase adversarial en silencio. Cada uno declara además su `phase` (`Phase 8 — adversarial validation`) y cita en su prompt los paths de skills que su lente necesita (`CC.md §2`):

| Validador | Skills a citar en el prompt |
| --- | --- |
| `ui-critic` | `sk-skins`, `kb-design-engineering`, `sk-tokens-neomorphism` |
| `product-owner` | `sk-features-index` |
| `skeptical-client` | — (su lente es copy es-MX; sin skill de dominio que citar) |
| `architect` | `sk-project-structure`, `kb-ssot-registries` |
| `project-planner` | `sk-features-index` |

> 🔴 **`ui-critic` audita aquí ESPECIFICACIONES, no pantallas — y su check DS4 sale "no demostrado", nunca Pass.** El agente declara un contrato de entrada: recibe el **manifest de evidencia visual** que produce el harness [`fx-visual-evidence`](../fx-visual-evidence/SKILL.md) (`pnpm evidence:visual`), marca cada hallazgo `código leído` o `pantalla vista`, y **sin manifest** reporta el check multi-tema (DS4) como **no demostrado**. En esta fase no hay manifest **por construcción**: no existe pantalla renderizada que capturar — los SCR son markdown y el código todavía no se escribió.
>
> **No es bloqueante aquí, y por eso hay que decirlo:** un DS4 "no demostrado" sobre especificaciones es el resultado correcto, no un hallazgo que resolver antes de CP4. Queda declarado para que nadie lo lea como un Pass real — la verificación multi-tema sobre pantallas vivas ocurre en `/implement` §4.4, con el harness corrido. El orquestador **no** invoca el harness en esta fase (no hay app que fotografiar) y **sí** le dice al agente, en el prompt, que no hay manifest para esta corrida.

> 🔴 **`/design` NO consume `.claude/policy/quality-gates.json` — la exención queda escrita, no implícita.** Estos cinco validadores son el panel de esta fase, fijos en toda corrida; **no** derivan de `panel_by_risk`.
>
> **Por qué:** las reglas del registry matchean globs de código bajo `src/`. Un run de `/design` escribe el contrato de UI en documentos de planeación — no matchearía ninguna, resolvería riesgo 0, y el `panel_by_risk` de ese nivel está **vacío**. Derivar el panel de ahí daría **cero validadores en toda corrida**, justo en la fase que existe para atrapar deriva de diseño.
>
> **Tampoco se cablea la evaluación plan-time**, aunque exista como doctrina general ([`fx-execution-policy §6`](../fx-execution-policy/SKILL.md)): la partición diff-time/plan-time es doctrina del kit; la exención es decisión de este workflow. Los cinco de aquí son lentes de diseño, producto, copy, arquitectura y plan sobre un contrato de UI — ninguna escala de riesgo de código los convoca ni los sustituye.

### 16.1 `add` mode — `source_mode: plan-code` validator mapping

In `add <plan>` mode there is no FT/persona chain (plan-code source). The per-scr-day2 shards carry a caveat (`no FT/persona refs — plan-code source`) the validators read. The scope mapping shifts:

| Agent              | `add` mode scope (plan-code)                                                         |
| ------------------ | ----------------------------------------------------------------------------------- |
| `product-owner`    | Coverage **vs the plan** — every ui-unit in ≥1 SCR, no invented scope (not FT/persona). |
| `architect`        | URL convention + `sk-project-structure` + the **code as-built** (not `04_ARCHITECTURE`). |
| `ui-critic`        | No change — visual + IA + DS compliance.                                             |
| `skeptical-client` | No change — copy clarity es-MX.                                                      |
| `project-planner`  | Dependencies **between the emitted SCR/CMP** (not Wave assignment from discovery).    |

---

## 17. Phase 8.5 — Blocker Resolution Round

Only runs if Phase 8 produced ≥1 blocker. 1 round only.

- Map each blocker to specific target.
- Targeted re-emit (orchestrator-direct or re-invoke specer for affected IDs only).
- Selective re-run of affected validators only.

**If blockers remain after 1 round:** CP4 stays blocked by default. Path to `partial`: user explicitly approves defer at CP4 → generates `decisions/DECISION-DESIGN-XXX-{slug}.md`.

---

## 18. Phase 8.6 — Pre-CP4 Canonical State Sweep

Before `EnterPlanMode`, state check on durable output:

| Criterion                                                | If FAIL                            |
| -------------------------------------------------------- | ---------------------------------- |
| Frontmatter valid in each `SCR-XXX.md`                   | STOP, force fix                    |
| §3 Screen Map rows parseable                             | STOP, force re-emit                |
| Each `partial`/`blocked` in §10 has tracking ID adjacent | STOP, force classify               |
| Coverage of FT/persona vs `02`, `03`, `05` consistent    | WARNING (no STOP) — surface in CP4 |

### 18.1 `add` mode guards (day-2)

| Criterion (`add` mode)                                              | Behavior                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Coverage of FT/persona vs `02`/`03`/`05`                            | **SKIP (declared)** — no discovery chain in plan-code source.       |
| Each plan-derived SCR carries `provenance` (source_tier, plan_source hash, day2_action) | STOP, force stamp — provenance is the audit trail for day-2 specs. |
| §3 Screen Map row exists for each touched screen with its sticky ID  | STOP, force re-reconcile (Phase 3-delta)                            |

---

## 19. CP4 — Plan Mode formal

Enter Plan Mode with synthesized state.

**Plan Mode body (plain language):**

- Coverage summary (FT × SCR matrix, persona × SCR matrix).
- Tier distribution (X pure + Y extended + Z custom).
- Blockers cerrados (from Phase 8.5).
- Warnings.
- Deferred decisions.
- `ui-critic` scorecard.

**Numbered table:**

| Opt | Action                                                           |
| --- | ---------------------------------------------------------------- |
| 1   | **Aceptar** → Phase 9 emit + handoff                             |
| 2   | **Editar** → return to Phase 8.5 with items marked (1 cycle max) |
| 3   | **Round Manual** → re-execute Phase 8.5 override of 1-round cap  |
| 4   | **Rechazar** → workflow ends; no final writes                    |

### 19.1 CP4 in `add` mode — headless conservador

In `add <plan>` mode CP4 keeps the same numbered options interactively. **Headless** (no interactive user): CP4 degrades to an **inline auto-approve conservador** — it does NOT enter Plan Mode (no TTY to confirm), it accepts the emitted SCRs if Phase 8 produced no unresolved blocker, and records a **caveat in the manifest** (`day-2 SCRs auto-approved headless — human review pending`).

🔴 **The auto-approve is the residual risk C2, NOT a mitigation.** In headless, day-2 SCRs (including reverse-engineered backfills) reach the SSOT with only the Phase 8 validators + the caveat as the safety net — no human reading. This is accepted under the kit philosophy "defaults, nunca skip" and is **declared in §26 (risk C2)**; it is not presented as solved. The emitted SCRs stay auditable by their `provenance` frontmatter (`plan_source` hash, `day2_action`).

---

## 20. Phase 9 — Emit + handoff + notes harvest

### 20.1 Emit

- Write `§9 Validation Checklist` from product-owner's coverage report.
- Write `§10 Consumer Readiness` with tracking IDs.
- Write `§8 Kit-bindings table` listing kit-pure SCRs.
- Persist `16_DESIGN.md` + `16_DESIGN/SCR-*.md` + components + flows.
- **Cerrar la fila `Design` en `project/planning/project-config.md` §2 Pipeline Status.** Cumple el contrato del template (`Cada workflow actualiza su fila al cerrar`). NO es un Edit a ciegas — flujo **Read-first → branch**:
  - **Guards (skip sin tocar nada):** modo `validar` (no llega a Phase 9) · `is_factory: true` (tabla schema-v2 propia del Factory).
  - **Read** `project-config.md`, localizar `## 2. Pipeline Status` y la fila cuyo primer campo es `Design`.
  - **Sección/fila ausente** → warning de 1 línea + continuar (no falla). **Celda ya `✅ Completo`** → skip real (no-op). **Distinta** → `Edit` con `old_string` **literal de la línea leída** (padding incluido), **1 sola celda**: Estado → `✅ Completo` (la celda Documento `16_DESIGN.md` ya es correcta).
  - Surface en el handoff: _"Marqué Design ✅ en project-config."_ (o el warning).
- Recommend → `/backlog`.

### 20.1.1 `add` mode emit (day-2)

In `add <plan>` mode Phase 9 emits the **index delta** (the new/updated §3 rows + §4/§8/§10 changes from Phase 3-delta), not a full `16_DESIGN.md` rewrite, plus the per-screen SCRs with provenance frontmatter. Two `add`-specific differences:

- **Pipeline Status cell `🟡 Parcial (seed)`.** When Phase 0 ran a seed (`needs_seed: true`), the `Design` row in `project-config.md §2` is set to `🟡 Parcial (seed)` (not `✅ Completo`) — the index is seeded + day-2-extended, not a full greenfield design. Same Read-first → Edit-conditional flow + guards as §20.1 (skip `is_factory`, no-op if already the target value, warning if row absent). The defensive insert applies only if the row is missing.
- **Chain offer.** End the run with a numbered offer to chain into backlog:

```
✔ Emití/actualicé {N} SCRs day-2 con provenance. ¿Sigues a backlog?

### Opciones
| 1 | Sí — corre `/backlog add <plan>` ahora (los issues saldrán con Refs (design) llenos) |
| 2 | No — cierro el run aquí                                                                |
```

Headless: skip the offer (nobody to accept it; the next run is invoked explicitly — §6.1) + manifest note.

### 20.1.2 Extension proposals → factory-tickets `ui-extension` (todos los modos)

Las propuestas de criterio C acumuladas en Phase 6 (más lo que Phase 7/8 haya re-clasificado) viven como líneas de `16_DESIGN.md §1.2 Extension proposals`. **§1.2 sigue listándolas, se emitan o no** — es el registro de diseño; el ticket es el canal hacia el Factory.

Con N ≥ 1 propuestas, el orquestador las presenta y pregunta **cuáles emitir**. Opciones **explícitas y excluyentes** (`CC.md §3`): estructuradas por default (multi-select sobre las N propuestas + "ninguna"), tabla numerada como fallback cuando el runtime no ofrece la tool. Se puede elegir un **subconjunto**.

```
✔ El diseño dejó {N} extensiones delgadas de `sk-ui` que pertenecen al kit, no a este proyecto.
   ¿Cuáles emito como factory-ticket? (números, `todas`, o `0`)

### Opciones
| 1 | `Badge` + variante `pulse` — usada en SCR-004, SCR-011     |
| 2 | `Tabs` + overflow horizontal scrollable — SCR-007, SCR-019 |
| 0 | Ninguna — quedan sólo listadas en §1.2                     |
```

Por cada propuesta elegida:

- Escribir `project/factory/ui-extension-{YYYY-MM-DD}-{project-slug}-{NNN}.md` con el **shape canónico** de [`fx-factory-tickets §4`](../fx-factory-tickets/SKILL.md) — fuente única, no un shape propio. `{NNN}` incremental dentro de tipo+fecha+proyecto (slot ocupado → incrementa). Nace `**Estado:** abierto` + `**GitHub issue:** —`; `**Source agent:**` = el orquestador de `/design`; `**Trigger context:**` = los SCR que usan la variante.
- **Qué llena cada sección** ya está escrito en [`methodology/component-extension-policy.md §2.3`](methodology/component-extension-policy.md) — se reúsa, no se redefine aquí.
- Anotar en la línea de esa propuesta en §1.2 el path del ticket emitido. Las no elegidas quedan listadas sin anotación (y pueden emitirse en un run posterior).

🔴 **Headless: lista y NO emite.** Sin usuario que confirme no hay emisión: `ui-extension` es de los tipos *surfaceado-luego-emitido* porque su condición es de **juicio** ("la extensión es lo bastante chica como para pertenecer al kit"), y `fx-factory-tickets §5` reserva la emisión automática a lo verificable. Las propuestas se quedan en §1.2 y el orquestador lo declara en **una línea** del handoff (`"{N} propuestas de extensión de sk-ui listadas en §1.2; sin emitir (headless)"`). **No** se degrada a emisión automática.

**Nunca bloquea** (`fx-factory-tickets §2`): el emit del diseño ya ocurrió. N = 0 → ni pregunta ni línea. `validar` no llega a Phase 9.

### 20.2 Notes harvest (mirror tk-discovery Phase 8 close)

Opt-in at end of run:

```
¿Quieres compartir tus notas externas para factory-ticketizar gaps reales del workflow de design?

### Opciones
| 1 | Sí, voy a pegar notas inline                                  |
| 2 | No, cierra el run sin tickets                                 |
```

Si user opta 1 → user pastes notes inline → orchestrator emits typed factory-tickets en `project/factory/` siguiendo el shape canónico de [`fx-factory-tickets`](../fx-factory-tickets/SKILL.md). El `{type}` es un slug libre en kebab-case (esa skill, §3), así que aquí aplican `tk-design-drift` (propio de este workflow) además de `sk-drift` / `workflow-drift` — el shape y el `{NNN}` del filename son los mismos para los tres.

### 20.3 Cleanup del `{run-id}/` (NEW post-`workflow-drift` ticket)

Cleanup canónico del subdirectorio del run actual con flag check `--keep-artifacts`. Respeta R-NEW-1 — borra solo `{run-id}/`, nunca el dir padre.

```bash
# Pre-condiciones (contrato del orchestrator):
#   ${ARGUMENTS}  — args del slash command (puede estar vacío)
#   ${RUN_ID}     — timestamp+slug generado en Phase 0. Guard defensivo abajo
#                  previene catástrofe si la invariante falla por bug futuro.
[ -n "${RUN_ID}" ] && [ -d "project/design-artifacts/${RUN_ID}" ] || exit 0

if echo "${ARGUMENTS:-}" | grep -qE '(^|[[:space:]])--keep-artifacts([[:space:]]|$)'; then
  echo "ℹ️  artifacts del run ${RUN_ID} conservados (--keep-artifacts)"
else
  rm -rf "project/design-artifacts/${RUN_ID}" && \
    echo "🧹 ${RUN_ID} limpiado"
fi
```

### 20.4 Cierre — `CP-commit` (`GIT.md §3.5`)

Tras el cleanup (NO antes — no commitear artifacts efímeros), ofrecer `1. nada / 2. commit / 3. commit + push`. `git add` de los durables (`project/planning/16_DESIGN.md` + `16_DESIGN/` + la fila cerrada en `project-config.md`), subject `docs(design): …`, sin push salvo opción 3 (branch actual, NUNCA main). Guard de main + degrade headless a opción 2 por `GIT.md §3.5`.

🔴 **Los factory-tickets de §20.1.2 y §20.2 NO van en ese commit.** Si el run emitió alguno, cierra con un **segundo** commit `docs(factory): …` sobre `project/factory/` — `GIT.md §3.5.1` es el SSOT y explica por qué. Sigue siendo **un** CP-commit: la opción que eligió el user aplica a los dos commits.

---

## 21. §10 Invalidation handling
> Per `fx-workflow-authoring §10`. Política explícita para cada caso de cambio post-CP.

| Caso                                                                      | Política                                                                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User override-ea SCR de tier X → Y en CP3 (Phase 4)                       | Patch al per-SCR shard del SCR afectado + actualización de `scr-classification-{run_id}.md` (append-only log) + re-derive `skills_consult`. NO re-clasifica otras SCRs. |
| User dice "no completar" en skill-gap CP3                                 | Shard mantiene `skills_warning: [...]` + `skills_warning_acknowledged: true`. Specer recibe set incompleto + ack flag → emite `> ⚠ Skill gap acknowledged...` inline.   |
| Phase 8 validator dice "SCR-XXX mis-classified"                           | 1-2 SCRs afectadas → patch incremental (mismo flow que override CP3). ≥3 afectadas → AskUserQuestion `[1] Backtrack a Phase 4 / [2] Patch incremental / [3] Continue`.  |
| Phase 8 validator dice "shard dedup falló — entidad duplicada en SCR-XXX" | Patch al shard solamente, no re-spec del SCR. Specer continua con shard corregido en re-spawn.                                                                          |
| Phase 8.5 blocker resolution loop excede 2 iteraciones                    | STOP-with-surface: `[1] Manual rewrite del SCR + paste inline / [2] Mark FAIL en §9 + continue / [3] Cancel run`.                                                       |
| User cambia branding global mid-run (entre Phase 3 y Phase 5)             | **NOT supported V1.** Branding lock es Phase 1 input; cambios post-Phase-1 requieren re-run completo. Documented limitation.                                            |

**Anti-pattern enforcement:** specer NUNCA modifica per-FT shards (read-only). Invalidations escriben al per-SCR shard o al classification audit, no al per-FT base.

### 21.1 `add` mode invalidation (day-2)

| Caso (`add` mode)                                              | Política                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan editado mid-run** (the `<plan>` file changed on disk)   | **Re-hash + diff** against `parsed-design-plan.md` hash. **≤2 screens affected** → patch incremental (re-attribute only the changed screens, keep the rest frozen). **≥3 screens affected** → AskUserQuestion `[1] Backtrack a Phase 0.5 (re-parse) / [2] Patch incremental / [3] Cancel`. The hash is the only drift signal — the parser is not re-run blindly. |
| **User override-ea `day2_action` en CP3** (e.g. backfill→regen) | **Append-only tombstone** to `parsed-design-plan.md §4` recording the superseded decision; the live decision in §2 is updated. Never rewritten in place. Re-derive the affected screen's tier/reconcile only — not the whole parse.               |
| **Phase 3-delta finds a route already covered by an SCR**      | Treat as backfill/regen (update tier+File in place), NOT a new ID — sticky ID preserved. No collision.                                                                                                                                          |

**Anti-pattern enforcement (`add` mode):** Phase 3-delta is the **only** ID-assigner in day-2; no other phase mints SCR IDs. A second parse of an unchanged plan reads the already-updated `max` → reproduces the same IDs (no collision).

---

## 22. §11 Agent contracts
Declarados en `.md` de cada agent. Tabla aquí para referencia rápida del orchestrator.

| Item                       | `dsg-context-analyst`             | `dsg-screen-specer-light`                           | `dsg-screen-specer-full`                            | `dsg-component-specer`            |
| -------------------------- | --------------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------- |
| **Model**                  | `sonnet`                          | `sonnet`                                            | `opus`                                              | `sonnet`                         |
| **Justificación**          | Multi-source synthesis denso      | Batch paralelo + template estructurado + low ratio  | Multi-source synthesis denso + ASCII generation     | Multi-source binding              |
| **Tools allowlist**        | Read, Grep, Glob, Write           | Read, Grep, Glob, Write                             | Read, Grep, Glob, Write                             | Read, Grep, Glob, Write           |
| **Input contract section** | ✅ obligatoria                    | ✅ obligatoria                                      | ✅ obligatoria                                      | ✅ obligatoria                    |
| **Return summary section** | ✅ obligatoria — 5-8 líneas plain | ✅ obligatoria — 1 línea per target + summary plain | ✅ obligatoria — 1 línea per target + summary plain | ✅ obligatoria — 5-8 líneas plain |
| **Cuándo NO usar section** | ✅ obligatoria                    | ✅ obligatoria                                      | ✅ obligatoria                                      | ✅ obligatoria                    |
| **Skill grounding inject** | ✅ paths in prompt                | ✅ paths in prompt                                  | ✅ paths in prompt                                  | ✅ paths in prompt                |
| **Phase**                  | 1                                 | 5                                                   | 5 (+ 8.5 re-spawn)                                  | 6 (+ 8.5 re-spawn)                |
| **Parallelism**            | Serial 1×                         | Batched, cap 6 concurrent                           | Batched, cap 6 concurrent                           | Parallel, cap 4 concurrent        |
| **`add` mode delta**       | `source_mode: discovery \| plan-code` branch; plan-code reads `parsed-design-plan.md` + as-built code, emits `per-scr-day2` shards w/ caveat (DSGN-004) | `provenance` passthrough + as-built block handling on regen/backfill (DSGN-005/007) | `provenance` passthrough + as-built block handling on regen/backfill (DSGN-005/007) | No change (greenfield-only trigger) |

> **`add` mode delta lives in the day-2 agents.** This section declares the **contract rows** the day-2 mode depends on (`source_mode` branch on the analyst; `provenance` passthrough on the specers); the agent `.md` edits implementing them live in `dsg-context-analyst` / `dsg-screen-specer-*`. The greenfield contracts above are unchanged.

**Skill grounding inject pattern (CC.md §2 mandatory):**

```yaml
prompt: |
  {task description}

  Consulta antes de empezar:
  - .claude/skills/tk-design/methodology/screen-contract-shape.md
  - .claude/skills/tk-design/templates/SCR.template.{light|full|stub}.md
  - [each skill in skills_consult, full repo-relative path]
```

---

## 23. Subprocess delegation summary

| Agent                     | Phase   | Parallelism            | Input                                                                      | Output                                           |
| ------------------------- | ------- | ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `dsg-context-analyst`     | 1       | serial 1×              | All 15+ discovery artifacts + INVENTORY/HOOKS optional                     | `design-registry-{run_id}/per-ft/FT-*.md` shards |
| `dsg-screen-specer-light` | 5 + 8.5 | parallel ≤6 batches    | `kit-extended` targets[] + shard paths + 16_DESIGN §6+§7 + skills_consult  | `16_DESIGN/SCR-*-{slug}.md` (light, 5 secciones) |
| `dsg-screen-specer-full`  | 5 + 8.5 | parallel ≤6 batches    | `custom` targets[] + shard paths + 16_DESIGN §6+§7 + skills_consult        | `16_DESIGN/SCR-*-{slug}.md` (full, 13 secciones) |
| `dsg-component-specer`    | 6 + 8.5 | parallel ≤4 concurrent | CMP-XXX target + based-on primitive + sk-tokens-neomorphism + used-in SCRs | `16_DESIGN/components/CMP-*-{slug}.md`           |

**Generic agents reused in Phase 8 (5 validators):**

- `ui-critic`, `product-owner`, `skeptical-client`, `architect`, `project-planner`.

**`add` mode (day-2) delta:** the same agents run with a `source_mode: plan-code` branch — `dsg-context-analyst` reads `parsed-design-plan.md` + as-built code and emits `per-scr-day2` shards; the specers receive `provenance` and handle the as-built block on regen/backfill. The 5 Phase 8 validators run with the plan-code scope mapping (§16.1). No new agent is introduced (the dual-mode branch follows the `bkl-context-analyst` precedent — `fx-workflow-authoring §8`); the branch edits are DSGN-004/005/007.

---

## 24. Skill prefix and subagent naming

- Skill: `tk-design` (Documentation-family workflow).
- Subagents: `dsg-*` prefix.
  - `dsg-context-analyst.md`
  - `dsg-screen-specer-light.md`  - `dsg-screen-specer-full.md`  - `dsg-component-specer.md`
- Generic agents reused: `ui-critic`, `product-owner`, `skeptical-client`, `architect`, `project-planner`.

---

## 25. Templates and checkpoint reuse

- `templates/16_DESIGN.template.md` — index shape (sections §0..§10).
- `templates/SCR.template.md` — per-screen contract full (13 secciones, tier `custom`).
- `templates/SCR.template.light.md` — per-screen contract light (5 secciones, tier `kit-extended`).
- `templates/SCR.template.stub.md` — per-screen stub (≤5 líneas, tier `kit-pure`).
- `templates/CMP.template.md` — per-component extension.
- `templates/FLW.template.md` — per multi-screen flow.
- `templates/registry-shard.template.md` — per-FT / per-SCR shard shape.
- `templates/scr-classification.template.md` — Phase 4 audit shape.
- `templates/parsed-design-plan.template.md` — frozen day-2 parse shape (`add` mode Phase 0.5): header w/ SHA-256 + UI/non-UI units + append-only override tombstones.
- `templates/16_DESIGN.seed.template.md` — minimal seed index shape (`add` mode Phase 2-seed, only if `needs_seed`): `seeded_from_code: true` frontmatter + §0/§1/§2/§3/§8 only (partial-by-design; §0 is a legacy harvest or an honest kit-default placeholder, never an invented direction).

Checkpoints reuse:

- CP1 + CP2 + CP3 → `fx-workflow-authoring/templates/checkpoint-inline.template.md`.
- CP4 → `fx-workflow-authoring/templates/checkpoint-planmode.template.md`.

---

## 26. Out of scope + day-2 residual risks

### 26.1 Out of scope

- Claude Design / cloud rendering integration.
- Figma export / SVG generation.
- Storybook scaffolding.
- Per-screen i18n key extraction.
- Specialized `dsg-design-*` validators with restricted tools (v2 if real-run pain emerges).
- Extracción de plain-language discipline a un bloque compartido (decisión usuario: vive inline en CC.md §3 kit-wide + extensión §2 aquí).
- **`add` mode out of scope:** delta mode of discovery / full Screen-Map-vs-code reconciliation (future `validar` day-2); day-2 data-model changes (advisory ADR-ref only); the external orchestrator that sequences the workflows.

### 26.2 Day-2 residual risks (honest — declared, not mitigated)

> These are **declarations of residual risk**, not solved problems. The `add` mode ships with them accepted under the kit philosophy "defaults, nunca skip".

- **C2 — CP4 headless = specs sin lectura humana entrando al SSOT.** In headless, day-2 SCRs (including reverse-engineered backfills) are emitted with only the Phase 8 validators + the manifest caveat as the net — no human reading (§19.1). Accepted v1. The SCRs stay auditable by their `provenance` frontmatter. **Not a mitigation — a declared residual risk.**
- **C5 — two parsers with a shared base.** Step 1 (unit detection) is shared with `tk-backlog` by cross-ref + back-pointer; classification + attribution diverge by design. `plan-mode-input.md` is in active churn — drift watch-item (§7.6.1).
- **Backfill staleness.** A backfilled SCR mirrors code and drifts at the first out-of-pipeline change; the gate verifies existence, not freshness. Partial mitigation: entrance A regenerates; future `validar` day-2 would reconcile.

---

## 27. Methodology index

- `methodology/visual-direction-handoff.md` — Phase 2 consumption.
- `methodology/screen-contract-shape.md` — anatomy del SCR (3 shapes: stub / light / full) + tier election rule.
- `methodology/scr-classifier-fixtures.md` — 8 worked examples para harness validation.
- `methodology/component-extension-policy.md` — CMP-Detection criteria.
- `methodology/wireframe-conventions.md` — ASCII grammar.
- `methodology/copy-discipline.md` — es-MX rules.
- `methodology/readiness-gates.md` — CPs + Phase 8.5/8.6 detail.
- `methodology/day2-plan-input.md` — `add` mode Phase 0.5 parser contract: shared Step 1 (cross-ref to `tk-backlog`) + own classification (ui-unit/non-ui-unit/prose) + attribution (unit → screen by route) + STOP/redirect + rigor graduation.
- `methodology/day2-classification.md` — day-2 action matrix (nueva/regenerar/backfill) + day-2 tier signals (fail-toward-custom) + regen tier rule + value framing + CMP/FLW plan-derived rules + rigor graduation SSOT + hand-checked worked examples.

---

_TimeKast Factory — tk-design v6.3.0 (day-2 `add <plan>` mode: parser + seed + index reconcile + provenance)_
