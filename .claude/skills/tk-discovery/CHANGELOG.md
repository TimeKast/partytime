# tk-discovery — Changelog

> Audit trail for the `/discovery` workflow and its supporting files (skill body, methodology, templates, scoped agents). Convention: [Keep a Changelog](https://keepachangelog.com).
>
> **Scope rule:** `fx-workflow-authoring §11` decides which workflows carry a CHANGELOG — this header only points there (for declarative skills the authority is `fx-skill-author §8`). Body stays ahistorical; evolution lives here.

---

## [Unreleased] — date TBD upon merge

### Changed

- **Phase 0 + CP2 + `intake.md §1` — audit SkillSpector 2026-09-20.** Phase 0 lista la generación de `RUN_ID` (sin ella el cleanup de Phase 8 salía sin limpiar); el plan de cierre de CP2 declara el borrado de `§Resolved During Discovery`; el intake advierte que el material del cliente queda en el historial de git y que decidirlo es del equipo.

### Added (MoSCoW estructurado por feature en el deep dive — 2026-07-09)

- **Columna `MoSCoW` en la tabla `Tiering classification` del deep dive** — cada FT ahora nace con su prioridad de negocio (`must` / `should` / `could` / `—`) junto al Tier de complejidad (S/M/L). Es un campo **adicional y ortogonal** al Tier (un Tier S puede ser `must`, un Tier L `could`); NO reemplaza el `Tiering classification` existente. `dsc-feature-specer` deriva el valor del freeze-map: Firm/MVP → `must` / `should`; matiz / refinamiento → `could`; Post-MVP conserva su prioridad eventual y **nunca** se degrada a "won't" automáticamente ("no en este release" ≠ "no lo haremos"); sin señal derivable → `—`. El consumidor downstream `bkl-context-analyst` (workflow `/backlog`) lee la columna per-FT en vez de re-inferir la prioridad. Un deep dive legacy sin la columna → el consumidor degrada a `—` sin fallar el run. Touched: `templates/03_DEEP_DIVE.template.md` (§ Tiering classification: columna nueva + comentario de derivación + fila del Completeness Gate), `agents/dsc-feature-specer.md` (nueva sección "MoSCoW derivation" + línea `MoSCoW derived` en el return summary). See templates/03_DEEP_DIVE.template.md §Tiering classification.

### Added (intake Tier 1-fallback — 2026-07-02)

- **Tier 1-fallback para texto plano sin strategy dedicada** — nueva regla en `methodology/intake.md §2.1` que llena el **seam** entre Tier 1 y Tier 2: un archivo puede no matchear ninguna strategy de Tier 1 y aún así no pertenecer a Tier 2. Discriminador objetivo = **¿se lee limpio ya?**, no la extensión. Texto plano legible (`.yml`/`.yaml`/`.sh`/`.toml`/`.env.example`, config declarativa, shell comentado) → extrae best-effort con el detector 4-dim pero clasificado como **Reference** por defecto (nunca SoT — infra-as-code informa arquitectura, no fija producto), **sin** `intake-drift` ticket y **sin** `[OQ]`. Binario/scan/encoding-roto/unknown-no-texto siguen en Tier 2 (drift + `[OQ]`). Regla general — evita enumerar una fila por extensión novel. Origen: un `intake-drift` ticket de un derivado (archivos de infra — `docker-compose.yml` + shell scripts — caían en vacío de clasificación). Touched: `methodology/intake.md` (§2.1 doctrina + bloque Tier 1-fallback + §10 enum `Media-type detected`), `agents/dsc-intake-analyst.md` (Mandate, description, step 2 classify, step 3 strategies), `SKILL.md` (Phase 1.2.1 grouping), `templates/explore-pass.template.md` (Classification line).
- **Fix drift `.csv` en el agente** — `dsc-intake-analyst.md` listaba `.csv` bajo Tier 2 (línea classify) y omitía su strategy Tabular en step 3, contradiciendo la tabla canónica `intake.md §2.1` (que lo tiene en Tier 1). Resincronizado: `.csv` movido a Tier 1 + strategy Tabular text agregada al step 3.

### Added (intake drop-location — 2026-06-16)

- **🔴 Document Gate (lo primero, SIEMPRE)** — antes que nada `/discovery` escanea `project/intake/` y **STOP**: si hay documentos → confirma listándolos (`detecté estos, ¿es todo o subes más?` — no entra a D1 en silencio); si está vacío → pide subirlos. Recién tras la respuesta decide el modo. Sesga activamente hacia **modo con documentos** (D1 es mucho más preciso). 🗣️ Copy user-facing: **"modo con documentos"** / **"modo sin documentos"** — nunca "desde cero" (D0 es solo el nombre interno). Aplica en `nuevo`/`con-docs`/arg-vacío; skip solo en `validar`. Nueva sección `SKILL.md` Phase 1.0.1 (gate) + 1.0.2 (pre-read); turn-boundary Turn 1 actualizado.
- **`project/intake/` default drop location** — carpeta canónica (con `.gitkeep`, viaja con el kit) donde los derivados dumpean las fuentes iniciales (transcripts, PDFs, screenshots, Excels) antes de correr `/discovery`. El workflow la escanea **siempre** en Phase 0 (detección) + Phase 1 (intake). Si ya tiene archivos, el gate se satisface y entra a D1 directo. Los paths explícitos del user la **complementan**, no la reemplazan. Contenido versionado (no gitignored). Convención documentada en `methodology/intake.md §1`. Touched: `SKILL.md` (Phase 0, 1.0.1/1.0.2, 1.1 item 7, Turn boundaries), `methodology/intake.md` (§1), `commands/discovery.md`.
- **Fix upstream (tk-deploy/factory-exclusions §3):** el `.gitkeep` de los dirs estructurales de `project/` ahora **sobrevive** el selective-merge a main (restore post-DENY) — antes el loop `git rm -rf project/<dir>/` lo borraba pese a la fila PRESERVE §2. Sin esto, el drop location viajaba solo en el canal beta (tag en develop); el tarball **stable** se buildea del árbol de main, donde el `.gitkeep` no existía. Arregla los 4 dirs (`intake`/`backlog`/`factory`/`proposals`) de una vez.

### Added (v11 — 2026-05-25 — Doctrine refinement post-Codex review)

- **Phase 6.2 Impact map universal** — reconcilia `01_FREEZE_MAP.md` al bucket correcto (Firm/OQ/Contradictions/Recommendations/Post-MVP/no-op) por outcome de GR2 resolution, no siempre a Firm. Plus universal validate 00 + dimension-specific derivatives table (scope/roles/data/arch/glossary/BR → re-synth obligatorio per dimensión). Audit lines obligatorias en `challenge-pass.md` summary para no-ops (`impact_map_check:`, `01_reconcile:`, `derivative_skip:`).
- **Phase 4a Stack-gravity check** — distinción dos casos de "duda": (A) mecánica de dominio no cubierta por SK → elige tier más alto; (B) falta de evidencia → tag `[OQ-tier]` + verificar contra `sk-features-index`. Anti-inflation: NO inflar a Build por evidencia ausente.
- **Phase 7.1 architect prompt** — explicit challenge `stack-gravity-detected` finding type para Tier S/M con mecánica de dominio.
- **Phase 3 multi-label gap classification** — cada gap puede llevar N tags simultáneos (`blocks-4a/4b/4c/6/design/implement`). Resolution rule: **earliest-blocking wins**. Tags downstream-only (design/implement) NO bloquean discovery — quedan como OQ-derivada. Soft cap 10-12 Qs por batch; split por earliest-tag groups si > cap.
- **Phase 7.1 skeptical-client (4to reviewer)** — added a multi-pass parallel review en Phase 7. Scope: `00_DISCOVERY_BRIEF.md` + `04_ARCHITECTURE.md` only. Override mode en prompt (NO ROI/commercial framing — agent file scoped a proposals comerciales). Detecta promesas vagas sin métrica, jerga técnica disfrazada, features sin conexión al dolor §1.2, decisiones architecture no defendibles post-handoff.
- **CP2.synthesis 4-agent interpretation** — synthesis incluye skeptical-client HIGH findings en addition a architect/PO/planner.
- **`templates/challenge-pass.template.md`** — agregado skeptical-client reviewer section (4 reviewer blocks total) + Impact map audit lines section.
- **Doctrina Firm Decisions** (en `methodology/freeze-map.md`) — Firm = current canonical con source + change_cost, NO dogma. NO se locks por paso de tiempo; lo que aumenta es change_cost (no inmutabilidad).
- **"Primera sesión densa objetivo" framing** — replace "una sesión" wording que sonaba a guarantee. Éxito = "capturado o trackeado", NO "todo resuelto".

### Changed (v11)

- **Field rename `reversibility` → `change_cost`** — semánticamente alineado con uso lingüístico común (high = caro de cambiar). Touched 7+ archivos (SKILL.md, methodology/{freeze-map,id-registry,architecture}, templates/{01_FREEZE_MAP, 03_DEEP_DIVE, 00_DISCOVERY_BRIEF, tracking-issue, challenge-pass}, agents/dsc-freeze-map-extractor). Acceptance criterion grep-based (0 residual matches kit-vivo). NO migration de runs históricos (convention v10: no backwards compat).
- **`commands/discovery.md` description** — actualizada a "una sesión densa objetivo" framing + "capturado o trackeado" éxito statement.
- **Phase 7 section header** "3 agents PARALELO" → "4 agents PARALELO" + sweep de "los 3 outputs/agentes" → "los 4" throughout SKILL.md.
- **Subprocess delegation summary table** — Phase 7 row include skeptical-client con scope nota (review 00+04, override mode).

### Removed (v11)

- **Severity classification subjetiva** (Alto/Medio/Bajo) para gaps de Phase 3 — superseded por objective multi-label tags por consumer/blocking phase.

### Added (v10 — 2026-05-23 — Discovery expansion + Pipeline truth consolidation)

- **Canonical numbered paths in `project/planning/`** (00-08): brief → freeze-map → personas → deep-dive → architecture → RBAC matrix → acceptance scenarios → SK leverage → glossary. Zero forward-refs (each doc N cites only 00..N-1, except 05_RBAC which has documented forward-ref to 04 via routes — mitigated with multi-pass emit).
- **`decisions/` directory consolidates DECISION + SPIKE + ADR** as per-file tracking issues with `type` field. `adr-queue.md` template DELETED — superseded by `tracking-issue.template.md` (unified) + per-file `decisions/{TYPE}-NNN.md`.
- **`04_ARCHITECTURE.md` system description (5 secciones)** — Topology / SK delta / Module boundaries / Integration contracts / Cache posture. NO §ADR index (single source of truth = `decisions/ADR-*.md`); ADRs aparecen como refs inline `(ver ADR-XXX)` en consecuencias bakeadas. Ships con cliente como deliverable.
- **F vs FT namespace separation formalized** — F{N} bare = Firm Decisions (freeze-map); FT-NN = Feature Tickets (deep-dive). Distinción documentada en `methodology/id-registry.md`.
- **`07_SK_LEVERAGE.md` always-required policy** — Phase 5 NUNCA skip. Si `sk_active=false`, body lleva nota explícita "N/A — proyecto sin Starter Kit". Elimina ambigüedad de numbering.
- **§3.3 brief = FULL INDEX de US-XXX** (no top 5 — gate de 06_ACCEPTANCE_SCENARIOS depende de cobertura completa).
- **RBAC resource SSOT** explicitly defined as `entities (ENT-XXX de 03_DEEP_DIVE) ∪ routes (de 04_ARCHITECTURE §3 module boundaries)`. Actions canonical `{create, read, update, delete, list}`.
- **Implementation-readiness gate doctrine** — sección obligatoria al final de cada canonical artifact con tabla `Consumer × Status × Blocking`. Status parseable `ready | partial | blocked`. 3 caminos formales: resolver inline / spike / defer.
- **`tracking-issue.template.md` unified** — single template para DECISION/SPIKE/ADR con type variants y conditional fields (ADR-only: reversibility, alternatives_considered).
- **Methodology sub-files (6 nuevos):** personas, architecture, rbac-matrix, acceptance-scenarios, implementation-readiness, id-registry.

### Changed (v10)

- **Phase 5 (SK Leverage)** — branch por `sk_active`: true → spawn `dsc-kit-analyst`; false → orchestrator-direct write con nota "N/A". Ambos casos emiten `project/planning/07_SK_LEVERAGE.md`.
- **Phase 4c ADR auto-emit** — al lock decision con `reversibility: high`, orchestrator emite `project/planning/decisions/ADR-{NN}.md` (type: adr, status: proposed). Phase 7 architect valida + transition a accepted/rejected.
- **Phase 6.1 synthesis emits 5 canonical artifacts derivados** (02_PERSONAS, 04_ARCHITECTURE, 05_RBAC_MATRIX, 06_ACCEPTANCE_SCENARIOS, 08_GLOSSARY) orchestrator-direct con quantitative gates per-artifact. NO re-emite 01/03/07 (esos vienen de Phase 2/4/5).
- **`tk-discovery/SKILL.md` "Siguiente:" frontmatter** → `/design → /backlog → /implement` (primary chain); `/proposal`, `/docs api`, `/docs data-model`, `/audit`, `/evolve`, `/retro` (on-demand).
- **`{discovery-dir}` placeholders REMOVIDOS** — convention única: canonical en `project/planning/`, ephemeral en `project/discovery-artifacts/` (Phase 8 strip OK).
- **Brief template §2.1, §2.2, §3.3, §4, §8.4** colapsan a pointers hacia 02_PERSONAS, 05_RBAC_MATRIX, 06_ACCEPTANCE_SCENARIOS, 03_DEEP_DIVE entities, 04_ARCHITECTURE.
- **project-config.template.md frontmatter v2** — bump `structure_version: '1.0'` → `'2.0'` (line 26 emit-block + line 278 explainer); agregado `sk_active` campo; `discovery_root` removido (hardcoded path).
- **3 templates renamed:** `freeze-map.template.md` → `01_FREEZE_MAP.template.md`; `deep-dive.template.md` → `03_DEEP_DIVE.template.md`; `sk-leverage.template.md` → `07_SK_LEVERAGE.template.md`. Output paths cambian de `discovery-artifacts/` → `project/planning/NN_NAME.md`.
- **`CORE.md §3 SSOT Chain promotion`** — extraída de §1 subsección a §3 propio. Regla de Oro renumerada de §3 a §4. Tabla §3 = cadena nueva (Discovery → Design → Backlog → Code; on-demand: /proposal, /docs, /audit, /evolve, /retro).
- **`ARCHITECTURE.md` (kit doc) §3 SSOT Chain** colapsada a pointer hacia `CORE.md §3`. Línea 29 corregida (`§3 Tier de skills` → `§1.X Prioridad de Skills`).

### Removed (v10)

- **`adr-queue.template.md`** — superseded por `tracking-issue.template.md` (unified) + per-file `decisions/ADR-NNN.md`.
- **`discovery_root` field del frontmatter v2** — innecesario; hardcoded `project/planning/` para todos los proyectos nuevos.
- **§14 Delivery Model "13 secciones exactas" constraint** — PR-009 era backlog stale, no SSOT. §14 queda intact en project-config.template.md.
- **Archive (mover a `project/planning/_archive/`):** factory_evolution_master_plan_v2_consolidated.md, DISCOVERY-factory-product-architecture.md, RFC-FACTORY-DISTRIBUTION-CLI.md, future_ideas/, project/WORKFLOWS_MASTER_PLAN.md.

### Added

- **R1** Tier L sub-rondas may share a single turn when features share architectural blast radius (data model, state machine, vendor surface). Question floor remains per-feature; no upper bound on questions per sub-ronda. See SKILL.md §Phase 4c.
- **R2** Source-arrival post-CP1: orchestrator computes delta size against current freeze-map. Below 30% threshold → in-place patch. At or above 30% → prompt user to choose between in-place patch vs full regeneration. See SKILL.md §Invalidation handling cross-phase.
- **R3** Adaptive intake: when N source files == 1, orchestrator performs inline extraction and skips Phase 1.2.5 cross-file reconciliation. When N ≥ 2, standard agent dispatch + cross-file reconciliation apply. See SKILL.md §Phase 1.2.2 and §Phase 1.2.5.
- **R4** Tier L entry template with parametrized slots in `templates/03_DEEP_DIVE.template.md`. Section §1 ("What this establishes") is the only slot requiring genuine prose synthesis; sections §2–§7 fill from sub-ronda Q-As, ADR queue rows, and freeze-map firms. Slot `{free-text-expand-here}` available for nuance.
- **CHANGELOG** — this file. Audit trail for tk-discovery workflow changes.

### Changed

- **R5** Phase 8 close includes a stripping sub-step prior to closure: remove journey narrative from durable artifacts (brief Resolved-section, freeze-map Resolutions sections, deep-dive Tier L sub-ronda headers). Per-file `decisions/ADR-*.md` stays durable. See SKILL.md §Phase 8 step 3.
- **R5** Output lifecycle reclassified: `challenge-pass.md`, `cross-file-reconciliation.md`, and `explore-pass.md` are audit-only and archive to `discovery-artifacts/_audit/` at Phase 8 close. They are not consumed by downstream phases. See SKILL.md §Archivos de output and §Phase 8 step 5.
- **R5.2** Phase 8 step 2 (GR2-traceability check): before stripping `§Resolved During Discovery` from the brief, orchestrator verifies that every Gap Round 2 stakeholder decision is reflected as a Firm in the brief proper or in `freeze-map.md`. If only present in the journey-form section, elevate to Firm form first.
- **R6** Skill body and methodology body are ahistorical: instructions describe current behavior without comparing to prior versions or referencing internal calibration runs. Version evolution narrative lives in this CHANGELOG, not in the executable skill body.

### Removed

- Project-name leakage from skill body, methodology body, templates, and scoped agent contracts. References to specific client and calibration-project names replaced with generic placeholders (`{project-slug}`, `{source}`).
- Workflow-evolution tags stripped: `(NEW v...)` markers, `post-refactor` notes, version-refinements header blocks, and `Closes WD-...` footers.
- Domain-content leakage from a calibration project (heuristic examples and edge case templates) replaced with generic equivalents in `SKILL.md` Phase 4c reversibility heuristic, `templates/tracking-issue.template.md`, and `agents/dsc-feature-specer.md`.
- Stale references to a `dsc-brief-synthesizer` agent that does not exist (Phase 6 is orchestrator-direct). Stripped from `templates/01_FREEZE_MAP.template.md`, `templates/07_SK_LEVERAGE.template.md`, and `agents/dsc-feature-specer.md`.
- Bounded-range ceiling on Tier L sub-ronda question count (`2-4 clarificaciones`) replaced with floor-only formulation (`minimum 2, no upper bound`).

### Refactor

Workflow internal cleanup that pairs with the Performance bucket. Targets context-loading cost of subprocesses and removes a spec drift between Phase 6.2 and Phase 7.5 detected during this audit.

- **R12** Phase 6.2 / Phase 7.5 spec drift fixed. Both sub-phases previously defined the same post-GR2 re-synth operation, which left the orchestrator with two duplicated specs to reconcile. Phase 6.2 is now the single source of truth (criterio de "cambios materiales", Edit-vs-Write strategy, quantitative gate); Phase 7.5 collapses to a one-line reference back to 6.2.
- **R13** Phase 6.2 re-synth introduces an explicit "material changes" predicate (≥3 firms modified OR ≥1 firm affecting brief §1/§3/§6/§8 OR ≥1 MoSCoW reclassification) and an Edit-vs-Write strategy threshold: `delta_pct < 30%` AND no architectural-firm change → Edit incremental (section-by-section); otherwise Write full re-synth. Edit is materially faster in output tokens for the typical GR2 patch and reduces regression risk on v1 content.
- **R14** `methodology.md` (640 LOC) split into a `methodology/` sub-folder of six topical sub-files: `source-classification.md` (former §1), `intake.md` (former §2 + §6 + §7 + §10 + §16), `freeze-map.md` (former §3 + §4 + §8 + §15), `deep-dive.md` (former §5 + §11), `kit-leverage.md` (former §12), `factory-tickets.md` (former §13 + §14). `methodology.md` is preserved as a thin index pointing to each sub-file (not deleted) for back-compat with older instruction refs and human readers. Each subprocess prompt now cites the specific sub-file path it needs, reducing context cost per agent invocation. SKILL.md and the four `dsc-*` agent files updated to cite the sub-file paths.
- **R15** `fx-workflow-authoring` doctrine updated to reflect the lessons here so the next `tk-*` author is not forced to re-discover them: §11 Companions decision tree row clarifies the methodology single-file vs sub-folder decision criteria + the "thin index, do not delete" rule on split; §8 Subprocess delegation gains a "Model selection per agent" subsection codifying when to override `inherit` to `sonnet` (alias — the `model:` field accepts only `sonnet`/`opus`/`haiku`/`inherit`, never full model IDs); §14 heavy-workflow checklist gains a model-selection row.

### Performance

Wall-clock optimizations targeting the 3+ hour baseline observed in production runs. Estimated combined impact: -40 to -60 min per discovery (the larger PR2 refactor adds another -10 to -20 min via methodology context pruning).

- **R7** Phase 4b dispatches all Tier S/M batches in a single message (parallel) instead of one batch at a time with per-batch user checkpoint. Wall-clock = `max(batch time)` rather than `sum`. Single post-all-batches checkpoint replaces per-batch checkpoints. Concurrency cap: 10 simultaneous specers; partition into 2 internal serial waves if N > 10. See SKILL.md §Phase 4b.
- **R8** Phase 1.2.2 circuit breaker raised from 10 → 20 concurrent intake agents. Anthropic API handles 20+ concurrent calls in practice; conservative cap was losing parallelism on large source packages. User-facing prompt before dispatch preserved.
- **R9** Phase 1.3 asset sweep migrated from `-not -path` post-filter to `-prune` directory-cut for `node_modules`, `.next`, `.git`, `dist`, `build`. Saves seconds-to-minutes on large monorepos because traversal stops at the directory entry instead of descending then filtering.
- **R10** Phase 7 challenge dispatch co-loads Plan Mode primitives (`EnterPlanMode`, `ExitPlanMode`) via `ToolSearch` in the same message as the 3-agent dispatch. By the time agents finish + GR2 processes, CP2 enters without a tool-loading gap. Pre-load note in CP2 §Mecanismo updated to reflect new dispatch site.
- **R11** `dsc-intake-analyst` and `dsc-feature-specer` set `model: sonnet` (overriding `inherit`). The `model:` field accepts only the aliases `sonnet`/`opus`/`haiku`/`inherit` (never full model IDs); the alias resolves to the latest Sonnet at run time. Both agents run structured-text extraction following fixed schemas in massively-parallel patterns; Sonnet handles this profile well and runs ~3-5× faster than Opus. Other discovery agents (`dsc-freeze-map-extractor`, `dsc-kit-analyst`, `architect`, `product-owner`, `project-planner`) keep `inherit` because their tasks involve denser cross-source reasoning where Opus depth is justified.

### Rationale

Post-mortem of a recent production discovery run (~4-hour duration) surfaced three observations:

- Workflow-evolution narrative in the skill body confused the executing agent: retrospective phrasing read as current behavior instruction.
- Project-name and calibration-project leakage in examples compromised skill portability across new projects.
- Journey narrative in durable artifacts created cognitive noise for downstream phases (`/docs`, `/design`, `/backlog`, `/implement`) which need final state, not the path taken to reach it.

### Verification path

- Grep for client project names, calibration project IDs, and workflow-evolution vocabulary returns zero hits across `SKILL.md`, `methodology.md`, `templates/*.md`, and `agents/dsc-*.md`.
- Skill body and methodology body contain no version-evolution tags or retrospective phrasing.
- Phase 8 close step list includes stripping and audit-archival action items.
- Phase 4c rule states minimum question count, no upper bound.

---

## How to add an entry

When making a change to `SKILL.md`, `methodology.md`, `templates/*.md`, or scoped `agents/dsc-*.md`:

1. Choose semantic version slot under `[Unreleased]` if no release is scheduled, or create a new versioned section above `[Unreleased]` (e.g., `## [5.1.0] — 2026-MM-DD`).
2. Bucket the change: **Added** (new behaviors), **Changed** (modified behaviors), **Deprecated** (still works, slated for removal), **Removed** (deleted), **Fixed** (bug fixes), **Security** (security-relevant).
3. Write the entry as a behavior delta — what the workflow does now that it didn't do before, or vice versa. Use generic phrasing — no specific project names or calibration IDs.
4. Reference the exact section/file modified (e.g., `See SKILL.md §Phase 4c`) so future readers can locate the change.
5. If the change has user-visible consequences during a `/discovery` run, note them under "Verification path."
