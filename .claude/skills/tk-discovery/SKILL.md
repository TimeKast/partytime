---
name: tk-discovery
description: Documentation-family workflow that extracts project truth from stakeholder interviews and source documents, preserving firm decisions and detecting drift, to produce a high-fidelity Discovery Brief and project-config as SSOT for downstream phases. Primary invocation is the `/discovery [nuevo|con-docs|validar]` slash command; do not run this skill directly outside that command.
family: documentation
model: opus
parallelism_unit: pass
concurrency_cap: 1
merge_strategy: orchestrator-merge
auditor_step: true
last-verified: 2026-09-23
user-invocable: false
---

# /discovery — Product Discovery Workflow

> **Propósito:** entender correctamente un proyecto y producir un Discovery Brief (§1-§11) + project-config confiables como SSOT para `/proposal`, `/design`, `/backlog`, `/implement`.
> **Architectural principle:** consumer de los artifacts es Claude AI (no humanos). Optimizar para info preservation > compaction; single-pass per archivo en su purpose; zero duplication entre artifacts (project-config always-on cubre identity/commercial/ops; brief cubre QUÉ construir; freeze-map cubre F-codes canónicos; deep-dive cubre per-feature spec con BR/F-code refs inline-resolved).
> **Anterior:** — (entry point del pipeline)
> **Siguiente:** `/design` → `/backlog` → `/implement` (primary chain); `/proposal` (on-demand)

---

## Principio rector

> **Info preservation > Discover > Compact.**
>
> Un brief con 13/13 secciones ricas vale más que uno compacto con info perdida. El costo de re-discovery en /docs es peor que un brief largo. Compactación solo aplica a features **objetivamente triviales** (SK-shipped end-to-end). Todo lo demás se documenta completo en Discovery.

> **Outcome target — primera sesión densa objetivo:** capturar el máximo de verdad del producto y producir el primer SSOT implementable. **Éxito = "capturado o trackeado"**, NO "todo resuelto". Si salen blockers reales (decisiones cliente-side, spikes técnicos), quedan trackeados como `DECISION-XXX`/`SPIKE-XXX` en `project/planning/decisions/` — NO se inventan ni se asumen tácitamente. La sesión cierra cuando el brief + canonical artifacts pasan quantitative gates + Implementation-readiness section refleja status real (incluyendo `partial`/`blocked` donde aplique).

---

## Tone guidance (user-facing)

Este workflow habla con un humano durante 8 fases. No con una máquina.

- **Prosa antes que tabla.** Cuando presentes findings, checkpoints, batches — explica por qué importa antes de tirar la tabla. Las tablas son estructura, no reemplazo de comunicación.
- **Checkpoints conversacionales, no auditoría.** CP1 y CP2 abren espacio para conversación; no fuerces `1=sí, 2=no` inmediato si el user quiere clarificar en medio.
- **Compact default, verbose opt-in.** CPs presentan 3-4 líneas críticas por default. Si el user declaró `/discovery con-docs verbose=true` en Phase 0, ampliar con coverage map + plan detallado + invalidation rules.
- **Batch checkpoint con opción de sub-ronda.** Cada batch cierra con `1=continuar / 2=revisar OQs / 3=ahondar en FT-X`. La opción 3 es parte normal del flujo, no edge case.
- **Explicar reasoning.** Si descartas una option, di por qué. Si flaggeas un risk, di el impacto concreto. No asumas que el user lee en ceros y unos.

### 🔴 Plain language discipline (cross-workflow MANDATORY)

> Aplica a **TODO output user-facing del discovery**: checkpoints, questions, presentations, agent result summaries — no solo Tier L. Audience baseline: developer mid-level que NO leyó freeze-map ni ADRs ni agent reports completos.

**Reglas:**

- **Definir términos técnicos inline la primera vez.** Ejemplo en vez de "polymorphic schema" → "schema polimórfico (una sola tabla con shape variable por tipo de fila)". En vez de "advisory lock" → "advisory lock (mecanismo de PostgreSQL para evitar que dos procesos corran al mismo tiempo)".
- **Acronyms con expansión primera vez.** ADR primera vez = "ADR (Architecture Decision Record — record de decisión arquitectural)". RBAC primera vez = "RBAC (Role-Based Access Control — permisos por rol)".
- **Ejemplos concretos antes de abstracciones.** Si dices "polymorphic pick payload" da primero un ejemplo: "ej: un pick puede ser ATS o O/U; ambos viven en la misma tabla con shape distinto en `payload`".
- **`change_cost` en lenguaje de impacto.** No solo "HIGH" — explicar: "cambiar esto post-implementation requiere ~3 días de migration + data backfill".
- **Aplica a:** Phase 1.1 bootstrap derivation · CP1 inline review · Phase 3 Gap Interview question batches · Phase 4a Tiering presentation · Phase 4b post-all checkpoint · Phase 4c sub-ronda questions + Tier L §0 Plain Language Summary entries · Phase 7 GR2 stakeholder question batch · CP2 Plan Mode synthesis.
- **Sub-agent prompts (intake-analyst/freeze-map-extractor/feature-specer/kit-analyst/architect/PO/planner/skeptical-client) PUEDEN usar lenguaje técnico internamente** (agent-to-agent comm es OK). Pero orchestrator wrapping de sub-agent results para user DEBE ser plain (ver §Agent return summary abajo).

### 🔴 Agent return summary (cross-phase MANDATORY antes de cualquier checkpoint)

> User NUNCA lee agent reports completos. Si presentas checkpoint/pregunta post-agent sin antes resumir → user blindsided. Hard rule.

**Aplica DESPUÉS de cada agent return (single o batch), ANTES de presentar checkpoint o pregunta al user:**

- Phase 1.2.3 (post 6 `dsc-intake-analyst` concat)
- Phase 2 (post `dsc-freeze-map-extractor`)
- Phase 4b (post 4 `dsc-feature-specer` batch concat)
- Phase 5 (post `dsc-kit-analyst`)
- Phase 7.1 (post 4 challenge-pass agents return + pre-GR2 dispatch)

**Shape del summary (4 partes, plain language, NO agent-jargon):**

1. **Top 3 findings** — los hallazgos más importantes del batch, 1-2 líneas cada uno.
2. **Critical decisions surfaced** — qué requiere input del user (decision points, not noise).
3. **What was confirmed** — lo que NO cambia (reduce cognitive load del user — "no necesitas releer estas partes").
4. **Pointer al detail full** — path + line range si user quiere bucear (ej: `challenge-pass.md §2 lines 45-80`).

**Anti-pattern explícito:** presentar "según el agent X encontró 5 hallazgos HIGH..." sin resumir esos 5 en 3-4 líneas plain ANTES. Si haces esto, el user no puede responder informadamente al checkpoint.

---

## 🔴 6 Anti-Drift Rules (no negociables)

1. **NUNCA** cambiar stakeholder, deadline, scope, ownership sin autorización explícita del user.
2. **NUNCA** reinterpretar exclusiones del source package ("esto está out of scope" se mantiene out).
3. **NUNCA** mergear o renombrar entidades sin declararlo y confirmarlo.
4. **NUNCA** llenar gaps con contenido plausible — marcar como `[INFERRED]` o `[OQ]`.
5. **NUNCA** tratar Reference/Legacy/Context como SoT — respetar la jerarquía.
6. **NUNCA** procesar attachments parcialmente en silencio ("silent sampling" prohibido).

**Source Hierarchy:** `SoT > Reference > Legacy > Context`. Detalle en [methodology/source-classification.md](methodology/source-classification.md).

**Confidence Tags:** `Confirmed` (default, sin marker) / `[INFERRED]` / `[ASSUMPTION]` / `[OQ]`. **Inline en la prosa** es obligatorio, no basta tabla Assumptions. Detalle en [methodology/freeze-map.md §4](methodology/freeze-map.md).

---

## Turn boundaries (contrato con el usuario)

Multi-turn iterativo NO significa "corre lo que puedas en cada turn". Cada turn cierra con **punto de espera explícito**. No avanzar sin respuesta del user.

| Turn     | Fases que ejecuta                                                        | Cierra con                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**    | Phase 0 + Phase 1 (Document Gate → Intake)                               | 🔴 **Document Gate primero** (1.0.1): si `project/intake/` está vacío → pide documentos + subirlos a intake, STOP (sesga a con-docs). Si hay docs (o el user confirma que no hay) → sigue al **Bootstrap batch**. STOP.                                                                       |
| **2**    | Phase 2 Freeze Map → CP1                                                 | Plan inline + STOP. **Bounded 1-2 turns max** (material vs non-material rule — ver §CP1). Cambios materiales re-presentan solo secciones impactadas; non-material aplican delta + confirmación corta.                                                                                        |
| **3**    | Phase 3 Gap Interview                                                    | Gap batch. STOP. **Multi-label gaps** (`blocks-4a/4b/4c/6/design/implement`) con earliest-blocking resolution. Soft cap 10-12 Qs por batch — split por earliest-tag groups si supera cap. Tags downstream-only NO bloquean discovery (quedan como OQ-derivadas). NO cap por discovery total. |
| **4a**   | Phase 4a Tiering pass                                                    | Tiering presentation. STOP para user approval.                                                                                                                                                                                                                                               |
| **4b**   | Phase 4b batches Tier S/M (single-message multi-Agent parallel dispatch) | **Single post-all checkpoint** (NO per-batch STOPs). Cierra con `1=continuar Tier L / 2=revisar OQs / 3=ahondar en FT-X`. Ver Phase 4b rationale.                                                                                                                                            |
| **4c.K** | Phase 4c Tier L dedicated                                                | 1 FT per turn con sub-ronda clarificación obligatoria.                                                                                                                                                                                                                                       |
| **N+1**  | Phase 5 + Phase 6 + Phase 7                                              | Procesamiento silencioso encadenado.                                                                                                                                                                                                                                                         |
| **N+2**  | Phase 7 Gap Round 2 (si aplica)                                          | Mini-batch stakeholder decisions post-Challenge. STOP.                                                                                                                                                                                                                                       |
| **N+3**  | Phase 7.6 Pre-CP2 Canonical State Sweep + CP2                            | Hard gate (frontmatter + status cells + `partial`/`blocked` sin tracking ID). Si pasa → `EnterPlanMode` + CP2.synthesis + `ExitPlanMode` (formal).                                                                                                                                           |
| **N+4**  | Phase 8 Close (post-approval)                                            | Escribe archivos finales. FIN.                                                                                                                                                                                                                                                               |

**Violaciones:** ejecutar Phase 2 + Phase 3 mismo turn. Ejecutar CP1/CP2 sin aprobación + saltar. Tomar decisiones stakeholder tácitamente en CP2 sin Gap Round 2.

**Excepción:** Turn N+1 encadena 5→6→7 porque (a) Phase 5 dispatch a `dsc-kit-analyst` corre sin input del user, (b) Phase 6 es orchestrator-direct sin pause natural, (c) Phase 7 architect/PO/planner/skeptical-client corren paralelo sin input.

---

## TodoWrite obligatorio

Al iniciar (Turn 1), crear TodoWrite con items para Phase 0-8 + CP1 + CP2 + Gap Round 2. Un solo `in_progress` a la vez.

---

## Flow overview

```
Phase 0 (detect) → Phase 1 (intake + cross-file recon) → Phase 2 (freeze map) → 🛑 CP1
  → Phase 3 (gaps) → Phase 4a (tiering) → Phase 4b (Tier S/M batches parallel) → Phase 4c (Tier L dedicated)
  → Phase 5 (sk-leverage always emit; N/A if !SK_ACTIVE) → Phase 6 (synthesis 6.1 + 6.2 re-synth + 6.3 handoff packets) → Phase 7 (challenge pass + Gap Round 2 + pre-CP2 sweep) → 🛑 CP2
  → Phase 8 (close)
```

---

## Phase 0 — Mode Detection

**Acciones:**

1. **Parse slash arg + intake scan:**
   - Mode: `nuevo` (from scratch) / `con-docs` (con docs) / `validar` (validate existing).
   - `verbose=true` flag (opcional): activa CP verbose mode. Default compact.
   - **Intake drop-location scan (lo PRIMERO):** contar archivos en `<target-repo>/project/intake/` excluyendo `.gitkeep` (drop location canónico que viaja con el kit — los derivados dumpean ahí el material inicial; ver [methodology/intake.md §1](methodology/intake.md)). Setear `intake_has_docs = (N ≥ 1)` + capturar la lista de nombres (para el prompt confirmatorio del gate). **La resolución D0 vs D1 la decide el Document Gate (Phase 1.0.1), que SIEMPRE corre** (salvo `validar` → **D2**): con docs → STOP confirmatorio ("detecté estos, ¿es todo o subes más?"); sin docs → STOP pidiendo documentos. El sesgo del workflow es **hacia con-docs** (D1 es mucho más preciso). Aplica también con arg `nuevo`/`con-docs`.
2. **SK_ACTIVE detect + version drift:**
   - `jq -r '.factoryVersion // empty' <target-repo>/package.json` → `target_factory_version`
   - `jq -r '.factoryVersion // empty' <factory-repo>/package.json` → `current_factory_version` (factory repo = TimeKast-Factory submodule path o env-config)
   - `SK_ACTIVE = target_factory_version != ""`
   - **Drift flag:** if `SK_ACTIVE=true AND target_factory_version != current_factory_version` → set `factory_version_drift = true` para surface en Phase 1.1 P1 (item 5b).
3. **Anunciar estado** al user: mode + SK_ACTIVE + intake (`N archivos detectados en project/intake/` o `vacío`) + verbose si aplica.
4. **Generar `RUN_ID`** (`{timestamp}-{slug}`) y crear `project/discovery-artifacts/${RUN_ID}/`. Es el valor que el cleanup de Phase 8 (5d) exige: su guard `[ -n "${RUN_ID}" ]` sale sin limpiar si nadie lo definió, así que este paso es lo que hace que la limpieza corra.

---

## Phase 1 — Intake (bootstrap + cross-file reconciliation)

**Propósito:** capturar contexto mínimo viable + procesar source package.

### 1.0 Document Gate + Pre-read

#### 1.0.1 🔴 Document Gate (SIEMPRE primero — sesga a con-docs)

🔴 **Regla dura:** lo **PRIMERO** que hace `/discovery` es **escanear `project/intake/`**. NUNCA arranca el bootstrap sin pasar por este gate. Con material, el discovery es mucho más preciso (deriva decisiones de fuentes vs inferirlas en la entrevista). El gate empuja activamente hacia **D1 (con-docs)**. Aplica en `nuevo` / `con-docs` / arg-vacío. **Skip solo si `validar` (D2).**

> 🗣️ **Wording user-facing:** al user se le habla de **"modo con documentos"** / **"modo sin documentos"**. NUNCA "desde cero" / "from scratch" (suena a que empieza peor). Internamente el modo sin documentos es **D0**; el copy nunca lo expone así.

- **Si `intake_has_docs = true`** (Phase 0 detectó N≥1 archivos) → **STOP confirmatorio** (NO entrar a D1 en silencio — dar chance de agregar más material):

  ```
  📂 Detecté estos documentos en project/intake/:
    - {file-1}
    - {file-2}
    - … (los N)

  ¿Es todo el material que tienes y arrancamos con estos, o vas a subir más antes de empezar?
  ```

  Tras la respuesta:
  - "es todo" → modo **D1** → pre-read (1.0.2).
  - "subo más" → esperar, **re-escanear** `project/intake/`, luego modo **D1** → pre-read (1.0.2).

- **Si `intake_has_docs = false`** (intake vacío) → preguntar por documentos y **STOP**:

  ```
  Escaneé project/intake/ y está vacío. ¿Tienes documentos del proyecto? Transcripts de
  reuniones, briefs, specs, mockups/wireframes, emails, notas sueltas, hojas de Excel —
  lo que sea.

  → Si tienes: súbelos a `project/intake/` y avísame. Con material el discovery es mucho
    más preciso (modo con documentos): derivo las decisiones de tus fuentes en vez de
    inferirlas.
  → Si no tienes: dímelo y arrancamos en modo sin documentos (te guío con una entrevista).
  ```

  Tras la respuesta, **re-escanear** `project/intake/`:
  - Aparecieron archivos (o el user dio paths) → modo **D1** → pre-read (1.0.2).
  - El user confirma que no tiene → modo **D0** (interno; al user: "modo sin documentos") → 1.1 (path D0).

> El gate es **un solo STOP** al inicio del Turn 1 (confirmatorio si había docs, o pidiendo docs si no). Una vez que el user responde, el modo queda resuelto y el workflow avanza — no re-preguntar en loop.

#### 1.0.2 Pre-read lightweight (D1 only — skip si D0)

**Si mode = D0 (el user confirmó que no hay material):** skip el pre-read, ir directo a 1.1 (path D0).

**Si mode = D1 (con source package):** antes de preguntarle al user a ciegas, leer `INDEX.md` (si existe) + headers de cada source file + first ~50 lines del archivo principal del package. El source package = los archivos de `project/intake/` (drop location default, scanneado en Phase 0) **+** cualquier path adicional que el user haya provisto. Objetivo: identificar qué bootstrap items (de los 12 de 1.1) son source-answerable vs gaps reales. NO procesar a fondo — eso es 1.2 formal intake con `dsc-intake-analyst`.

**Output mental del orchestrator:** mapping `{item_index → source-answer-status}` con tags `[from {file} §{X}]` / `[INFERRED]` / `[OQ]` para cada uno de los 12 items.

> **Rationale:** preguntar 12 Qs ciegos cuando el source ya responde N de ellos desperdicia turns + degrada calidad (bootstrap derived del source > bootstrap improvisado por user). Mismo principio que el pre-question check estricto de Phase 3.

### 1.1 Bootstrap (1 ronda — D0 conversacional / D1 derivation+confirm)

Los 12 items de bootstrap son los mismos en ambos modos:

1. Problema / North Star (dolor, audiencia, métrica de éxito)
2. **Stakeholders** (decisores) — rol + nombre + scope
3. **Team members** (ejecutores) — rol + nombre + responsabilidades
4. Deadline objetivo
5. **Si SK_ACTIVE=true:** SKIP plataforma (PWA default). Else preguntar web / PWA / mobile / API.
   5b. **Factory version effective (mandatory si SK_ACTIVE=true):** target project's pinned `factoryVersion` vs current Factory version (capturados en Phase 0). - Si match → confirmable como Firm sin pregunta extra. - Si drift detected (`factory_version_drift=true` from Phase 0) → user decide upfront: - **(a) Migrate target to current pre-discovery** (recommended si target stale por meses) - **(b) Stay pinned + run Phase 5 vs target's pinned version inventory** (preserve target snapshot) - **(c) Advisory mode** (run vs current Factory, accept findings as advisory — useful when target SK version is significantly stale and full migration is out of scope for this discovery cycle) - Decision **MUST be captured before Phase 1.2** — drives Phase 5 `target_repo` config + downstream re-run flag (si user elige b o c, Phase 8 close emite `re-run Phase 5 pre-Wave-3` action item).
6. Known constraints (stack preferido, integraciones obligatorias, compliance). **NO preguntar budget/currency — eso vive en `/proposal`.**
7. Docs disponibles (paths si D1) — `project/intake/` se escanea **siempre** como source package default (Phase 0); los paths que el user agregue complementan fuentes que viven en otro lado, no las reemplazan.
   - **7.1 Origen del material:** ¿crudo (apuntes, transcripciones, emails, docs originales) o polished-by-LLM (rewrite, "polish")? Si pasaron por LLM y conservas los crudos → comparte ambos (el agent hace cross-verification).
8. **JTBD por persona:** para cada rol de usuario final, 1 línea `como {rol}, quiero {acción} para {resultado}`.
9. **Kit divergence flag:** stack SK completo / parcial / custom. Alimenta §8.3/§8.4 del brief.
10. **Design System Strategy:** skin shippeado del kit / Custom via Claude Design / Client DS. Alimenta §11.2.
11. **Delivery structure:** commercial type (fixed-scope / T&M / milestones / internal) + infra ownership + stakeholder authority sobre scope/deadline. **NO currency — eso es `/proposal`.**
12. **Support Context:** si hay overrides del default TimeKast (chatbot feedback + push a tech lead + no SLA formal), capturar. Si no → default aplica.

🔴 **NO preguntar "calidad vs deadline"** — es dogma hardcoded (`BR-PROJECT-001`).

#### Path D0 (from scratch)

Pregunta los 12 items en prosa conversacional, no como lista seca. Agrupa por tema cuando tenga sentido. STOP al cierre — esperar respuesta del user antes de 1.2.

#### Path D1 (con source package)

Presentar al user el bootstrap **derivado** del pre-read (1.0.2):

1. **Items confirmados** — `[from {file} §{X}]` con cita literal: pedir confirmación rápida (`OK / ajustar`).
2. **Items inferred** — `[INFERRED]` con razonamiento: pedir confirmación más explícita.
3. **Gaps reales** — `[OQ]`: lista compact de los items que el source NO responde. **Solo estos requieren respuesta del user.**

Format example:

```
He leído el source package y derivé el bootstrap. Confirma o ajusta:

## Confirmados (de docs)
1. Problema/North Star — [from {{source}}.md §1] "{{1-line problem statement}}". OK?
2. Stakeholders — [from {{source}}.md §2] {{Name}} (PO), {{Name}} (tech lead). OK?
5b. Factory version — [from {{target-repo}}/package.json] target = {{target_factory_version}}; current = {{current_factory_version}}.
   {{si drift detected}} ⚠️ Drift detected. ¿(a) migrate target / (b) stay pinned + Phase 5 vs target / (c) advisory mode?
... (N items)

## Inferred (no explícito pero el source sugiere)
N. Kit divergence — [INFERRED] SK completo (no veo override). OK?

## Gaps reales (necesito tu input)
M. Support Context — el source no menciona. ¿Default TimeKast (chatbot + push a tech lead + no SLA) o tienes overrides?
```

STOP al cierre. User responde gaps + confirma/ajusta. El bootstrap validado pasa a 1.2.

> **Rationale:** turns reducidos (user solo responde gaps reales), bootstrap quality eleva (derivado del source, no improvisado), consistente con pre-question check de Phase 3.

### 1.2 Procesamiento silencioso tras respuesta

#### 1.2.1 Media-type classification pre-pass

- Por cada file del source: detect extension + magic bytes heuristic
- Agrupar por strategy [methodology/intake.md §2.1](methodology/intake.md): Tier 1 (structured text / transcript / visual / tabular `.csv`) / Tier 1-fallback (texto plano legible sin strategy dedicada — `.yml`/`.sh`/`.toml`… → extrae como Reference, NO drift) / Tier 2 (`.docx`/`.pdf`/`.xlsx`/unknown-no-texto → drift ticket)

#### 1.2.2 Batch planning (determinístico + adaptive single-source)

**Adaptive single-source short-circuit:** if `N(source files) == 1` AND the file is Tier 1 structured-text or transcript (not visual / not Tier 2), the orchestrator performs **inline extraction directly** per `methodology/intake.md §10` schema and writes the per-file report to `project/discovery-artifacts/explore-pass/001-{slug}.md`. NO agent dispatch. Skip Phase 1.2.5 cross-file reconciliation entirely (no pairs to reconcile with a single source). Proceed directly to Phase 1.3 asset sweep.

For all other cases (`N >= 2`, visual sources, mixed-media packages), apply the standard agent-dispatch flow below:

Per-agent caps (lo primero que se cumpla):

- ≤5 text files
- ≤10 images
- ≤300KB agregado

Reglas:

- **Images > 10** → auto-split en sub-batches ≤10. Cada sub-batch = 1 `dsc-intake-analyst` paralelo. No user-interrupt.
- **Text files > 5 O >300KB** → split análogo.
- Text + images del mismo source se pueden mezclar respetando caps.
- **Circuit breaker:** si math requiere **>20 agents parallel** → flag al user pre-dispatch: "Source package requiere N agents (excede heurística 20); ¿procesar todo en paralelo, partir en passes secuenciales, o recortar scope?". Único user-interrupt de Phase 1. Rationale: image batches lightweight + Anthropic API maneja 20+ concurrent sin issue empírico; cap conservador de 10 perdía paralelismo en source packages grandes.

#### 1.2.3 Spawn `dsc-intake-analyst`(s)

Single message, N tool calls. **Cada prompt DEBE anteponer:**

```
Consulta antes de empezar:
- .claude/skills/tk-discovery/methodology/intake.md (Tier 1 strategies + media-type classification + per-file output schema §10)
```

- Cada agent recibe: `file_paths` + `batch_id` + `slug` + `output_path` + `project_slug`
- output_path: `project/discovery-artifacts/explore-pass/{batch_id}-{slug}.md`
- Tier 2 / unknown → `intake-drift` factory-ticket a `project/factory/intake-drift-{YYYY-MM-DD}-{project-slug}-{NNN}.md`
- Ver [`.claude/agents/dsc-intake-analyst.md`](../../agents/dsc-intake-analyst.md) para contract completo.

#### 1.2.4 Post-dispatch concatenation

- Main orchestrator lee `project/discovery-artifacts/explore-pass/*.md`
- Orchestrator concatena los outputs per-batch y escribe `project/discovery-artifacts/explore-pass.md` consolidado via Write tool
- Si drift tickets emitidos (count ≥1) → surface al user; count ≥3 → escalation per [methodology/intake.md §2.1](methodology/intake.md)

#### 1.2.5 Cross-file reconciliation pass (main orchestrator)

**Skip condition:** if Phase 1.2.2 short-circuited due to `N(source files) == 1`, skip this sub-step entirely — there are no file pairs to reconcile.

**Responsabilidad del orchestrator, NO del agent.** Después del concat (cuando N ≥ 2):

1. Read `explore-pass.md` consolidado
2. Detectar contradicciones cross-file:
   - Estilo-C drift (polished docs hardening or amplifying claims relative to their raw counterparts, e.g., a polished plan document vs a raw notes/brain-dump source)
   - Decisions en file A vs file B
   - Tensions que `dsc-intake-analyst` flaggeó como hints pero no resolvió (cross-file está fuera de su scope)
3. Persistir a `project/discovery-artifacts/cross-file-reconciliation.md` con estructura:
   - **Contradictions detected:** pares (file A §N: claim X) vs (file B §M: claim Y) + propuesta de resolución (default firm vs Phase 3 batch)
   - **Estilo-C drift:** si hay par crudo+polished, listar 3-5 puntos donde polished endurece/amplía crudo
   - **Cross-file patterns:** patterns repetidos que sugieren decisión consolidada
4. Este archivo se vuelve input adicional para Phase 2 `dsc-freeze-map-extractor`

### 1.3 Asset sweep (siempre, independiente del mode)

```bash
# Imágenes/iconos/logos del target repo:
# (-prune corta entrada a node_modules/.next/.git/dist/build; -not -path filtra después de descender → más lento)
find <target-repo> \( -path "*/node_modules" -o -path "*/.next" -o -path "*/.git" -o -path "*/dist" -o -path "*/build" \) -prune \
  -o -type f \( -name "*.svg" -o -name "*.png" -o -name "*.jpg" -o -name "*.ico" -o -name "*.webp" \) -print | head -50

# Tokens / Tailwind / theme:
find <target-repo> \( -path "*/node_modules" -o -path "*/.next" -o -path "*/.git" -o -path "*/dist" -o -path "*/build" \) -prune \
  -o -type f \( -name "tailwind.config.*" -o -name "globals.css" -o -name "theme.ts" -o -name "theme.tsx" \) -print
```

Reportar resultados como input para §9 Branding y §11 Visual Direction. Hex colors detectados en tokens → freeze como `D{N} Paleta detectada en {path}: {hex}` (change_cost Low).

**Bulk attachments rule:** procesar TODO material relevante. Ver [methodology/intake.md §2](methodology/intake.md).

---

## Phase 2 — Freeze Map (delegated to `dsc-freeze-map-extractor`)

**Propósito:** extraer 5 buckets (Firm / Open / Contradictions / Recommendations / Post-MVP) desde explore-pass + bootstrap + cross-file-reconciliation.

**Acciones del orchestrator:**

1. Compose agent input:
   - `explore_pass_path` = `project/discovery-artifacts/explore-pass.md`
   - `cross_file_recon_path` = `project/discovery-artifacts/cross-file-reconciliation.md`
   - `bootstrap_answers` = dict con respuestas Phase 1
   - `asset_sweep_summary` = output del sweep §1.3
   - `template_path` = `.claude/skills/tk-discovery/templates/01_FREEZE_MAP.template.md`
   - `output_path` = `project/planning/01_FREEZE_MAP.md`
   - `project_slug`

2. Spawn `dsc-freeze-map-extractor` (1 Agent call, serial — no paralelo). **El prompt DEBE anteponer:**

   ```
   Consulta antes de empezar:
   - .claude/skills/tk-discovery/methodology/freeze-map.md (5-bucket schema + confidence tags + anti-drift rules)
   ```

   Ver [`.claude/agents/dsc-freeze-map-extractor.md`](../../agents/dsc-freeze-map-extractor.md) para contract.

3. Orchestrator lee el output para context propio (usará en CP1 presentation).

> **Schema canónico:** ver [methodology/freeze-map.md §3](methodology/freeze-map.md) para detalle de 5 buckets.

---

## 🛑 CHECKPOINT 1 — Post-Intake Review (inline + STOP)

**Mecanismo:** presentar plan de continuación inline en formato compact (template abajo) + STOP explícito. Esperar approval verbal del user antes de avanzar.

> **Por qué inline + STOP aquí (no Plan Mode):** CP1 es **review conversacional post-intake** — top 3 critical signals + plan corto. Ceremony de Plan Mode aquí no agrega valor; user lee + responde rápido. Reservamos Plan Mode formal para CP2 (donde la synthesis multi-fuente justifica la pausa).

**Compact mode (default):**

```markdown
## 🛑 CP1 — Post-Intake Review

### Critical signals (top 3 max)

- {signal 1 con impacto concreto}
- {signal 2}
- {signal 3}

### Plan de continuación

Phase 3 Gap Interview ({N questions). Phase 4a Tiering. Phase 4b/c per-tier. Phase 5 {SK / N/A}. Phase 6+7 encadenados. CP2.

### Opciones

| #   | Acción                                          |
| --- | ----------------------------------------------- |
| 1   | continuar a Phase 3 Gap Interview               |
| 2   | ajustar Freeze Map antes de continuar           |
| 3   | ahondar en {{signal-id}} (sub-ronda focalizada) |
```

**Verbose mode** (solo si user declaró `verbose=true`): agregar coverage map 13 filas + plan detallado con subagents + invalidation rules + output expected paths.

### 🔴 Regla de invalidación del intake

Si durante CP1 el user aporta info que invalida el intake, regresar a la fase correspondiente ANTES de re-presentar plan:

- **Docs nuevos** → Phase 1 (re-clasifica) → Phase 2 → re-presenta CP1 (turn nuevo, intake invalidado)
- **Stakeholder/constraint no capturado** → actualiza intake → re-ejecuta Phase 2 → re-presenta CP1
- **Contradicción nueva sobre firm** → actualiza Freeze Map → re-presenta CP1
- **Decisión sobre opciones del plan** → resuelve en CP1 sin rebote (mismo turn)

### 🚦 CP1 bounded — material vs non-material adjustments

**CP1 NO es open-ended N turns.** Por default cierra en 1-2 turns máximo. Reglas para iteración:

| Tipo de ajuste pedido por user                                  | Material?           | Acción del orchestrator                                                                                             |
| --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Cambio de scope (alcance MVP, deadlines críticos)               | 🔴 **Material**     | Re-presentar **solo las secciones impactadas** del plan (no CP1 completa). Esperar approval explícito de ese delta. |
| Cambio de stakeholder / constraints durables                    | 🔴 **Material**     | Update intake answers → re-ejecutar Phase 2 con context actualizado → re-presentar CP1 (turn nuevo)                 |
| Re-interpretación de source (SoT change, dock reclassification) | 🔴 **Material**     | Aplicar regla de invalidación arriba (Phase 1/2 según aplique)                                                      |
| Ajuste de wording / clarificación de un critical signal         | 🟢 **Non-material** | Aplicar delta inline + pedir **confirmación corta** (sin re-presentar plan entero). Si user OK → proceder.          |
| Toggle verbose mode / format adjustment                         | 🟢 **Non-material** | Aplicar y proceder; NO requiere re-approval.                                                                        |
| Aclaración de duda sobre opción 1/2/3                           | 🟢 **Non-material** | Responder a la pregunta + re-presentar las 3 opciones limpias. NO loop.                                             |

**Hard rule:** orchestrator NUNCA "asume" approval en cambios materiales. Cualquier ajuste material requiere una elección explícita post-delta (estructurada, o numérica por el fallback de tabla — §7.0). Cambios non-material confirmados con "OK", "procede" inline.

**Solo tras una elección explícita del user** (opción `1`, `2` o `3` en el path principal; OK/sí en confirmación post-non-material delta) → orchestrator ejecuta la opción correspondiente.

> **Cómo se presentan esas tres opciones** (`CC.md §3` + [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md)): estructuradas (`AskUserQuestion`) como **default interactivo**; **tabla numerada 1/2/3 como fallback** cuando el runtime no tiene la tool — y por esa vía, texto libre ambiguo (`continúa`, `dale`) NO cuenta y se re-presentan las opciones. **Headless:** ni tool ni tabla; el CP resuelve por su fallback declarado y **no intenta** `AskUserQuestion` (sin usuario bloquea). Este workflow es familia documental: sin este estatus quedaba exento en silencio del cambio, igual que las reglas peer.

---

## Phase 3 — Gap Interview

**Propósito:** cerrar gaps reales con preguntas targeted.

**Reglas:**

- Mínimo: `max(3, 🟡_sections + contradictions)`. **NUNCA 0 para D1.** Input rico = mejores preguntas, no menos.
- **NO hay cap por discovery total** — si hay 25 gaps reales, se hacen las 25 preguntas. Reducir cantidad total de questions = reducir calidad del brief.
- **Soft cap por batch (UX):** target 10-12 preguntas por batch presentado al user. Es UX, no reducción de scope.
- Each batch único — no trickle dentro de un batch.

### Gap classification — multi-label + earliest-blocking

Cada gap puede llevar **N tags simultáneos** en formato `gap:blocks-{phase|consumer},blocks-{phase|consumer},...`. NO single-label severity (Alto/Medio/Bajo subjetivo) — la clasificación es objetiva por **blocking surface**.

**Tags posibles:**

| Tag                | Bloquea                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| `blocks-4a`        | Phase 4a tiering (feature scope, FT identity, tier criteria)                          |
| `blocks-4b`        | Phase 4b feature spec (Data field, Rules field per FT)                                |
| `blocks-4c`        | Phase 4c Tier L sub-rondas (state machines, polymorphic schemas)                      |
| `blocks-6`         | Phase 6 synthesis (cross-artifact derivations: PER+RBAC, ENT+RBAC, glossary)          |
| `blocks-design`    | Downstream `/design` (visual decisions, interaction flows) — **NO bloquea discovery** |
| `blocks-implement` | Downstream `/implement` (impl details) — **NO bloquea discovery**                     |

**Resolution rule — earliest-blocking wins:**

Si gap tiene `blocks-4a,blocks-6,blocks-design`, orchestrator resuelve en Phase 3 batch que precede a Phase 4a (la fase con número más bajo entre tags discovery-internal). Tags downstream-only (`blocks-design`, `blocks-implement`) NO bloquean discovery — quedan como `OQ-derivada` en `01_FREEZE_MAP.md §Open Questions` con consumer impact documentado.

**Example:** "Auditor role read-only logs" → `gap:blocks-4a (FT identity if logging is own feature),blocks-4b (Users field in affected FTs),blocks-6 (PER+RBAC cross-derivation),blocks-design (audit UI flows)` → resuelve en Phase 3 batch 1 (antes de Phase 4a).

**Batch split rule (si total > soft cap):**

- Split por **earliest-tag groups**: todos los `blocks-4a` primero, después `blocks-4b`, etc.
- Cada batch sub-presentado al user con header indicando qué earliest-tag cubre.
- Tags downstream-only batchen al final como "Optional / can defer" — user decide responder o dejar como OQ-derivada.

**🔴 Hard rule:** Phase 4a/4b/4c/6 NUNCA corren con gaps que tienen al menos uno de sus tags sin resolución. Cero races conceptuales.

### 🔴 Pre-question check (estricto)

Para cada OQ candidata, ANTES de incluirla en la batch:

1. Buscar en `project/planning/01_FREEZE_MAP.md §Firm Decisions` + `project/discovery-artifacts/explore-pass.md` si source tiene respuesta explícita (cita literal).
2. **Si hay respuesta explícita:** NO ofrecer alternativas. Presentar como:
   > "El source dice: `{cita literal con path §X}`. ¿Confirmo como Firm o ajustas?"
3. **Si respuesta parcial:** presentar la parcial + preguntar solo el complement.
4. **Solo si source no dice nada:** ofrecer alternativas `(a)/(b)/(c)/(d)`.

Violar este check es **workflow error**.

### Tension sweep al cerrar cada sub-batch

Después de registrar las resoluciones de un sub-batch, ejecutar checklist **silencioso**:

1. Para cada par (Fa, Fb) dentro del sub-batch: ¿compatibles bajo todas las transiciones del sistema?
2. Para cada Fc, cruzarla con firm decisions existentes {F1..Fn}: ¿contradicción implícita o edge case no cubierto?
3. Si tensión no resuelta → clasificar como `OQ-D{N} derivada` + presentar al user mismo turn.
4. Documentar en `project/planning/01_FREEZE_MAP.md §Derived OQs`.

**Regla:** no declarar sub-batch completo sin correr tension sweep. Si una tensión llega a Phase 7, es workflow error.

---

## Phase 4 — Feature Deep-Dive (3 sub-phases: tiering → Tier S/M parallel → Tier L dedicated)

### Phase 4a — Tiering pass (main orchestrator, 1 turn interactivo)

**Propósito:** clasificar N features en S/M/L usando criterios objetivos antes de procesar.

**Criterios objetivos:**

- **Tier S (SK-trivial, Configure-only):** feature-flag level, kit ships end-to-end, `sk-features-index` lista la feature. Acción Configure. Ejemplos: auth providers base, email templates transaccionales, notifications infra base.
- **Tier M (Extend):** kit ships + requiere custom fields/wrappers/integrations. `sk-*` skill referenciable, acción Extend. Ejemplos: RBAC role extension, invite flow custom, audit log con fields específicos.
- **Tier L (Build custom, irreversible):** kit no ships, schema-level decisions, domain-specific mechanics. Acción Build. Ejemplos: scoring engines, polymorphic schemas, domain automation, complex state machines.

### Stack-gravity check (dos casos distintos de "duda")

> Anti-pattern: clasificar todo a Configure/Extend porque "el kit lo cubre seguro" cuando feature realmente captura mecánica de dominio. Anti-anti-pattern opuesto: inflar todo a Build "por las dudas".

- **Caso A — Mecánica de dominio no cubierta por SK:** si feature captura state machine custom, polymorphic schema, scoring logic, vendor-specific contract, o cualquier mecánica que `sk-features-index` NO shippe **end-to-end exacto** (no adyacente), elige tier **más alto** (Configure → Extend, Extend → Build). Costo de re-tier downstream (en `/implement`) > costo de over-provision en Phase 4b.
- **Caso B — Falta de evidencia para clasificar:** si la duda es "no estoy seguro si kit shippa exactamente X", **NO** inflar a Build. Tag la feature como `[OQ-tier]` + revisar `sk-features-index` antes de cerrar Phase 4a. Resolver con evidencia, no con safety margin.

**Default:** cuando duda mecánica → más alto. Cuando duda evidencia → OQ + verificar antes de elegir.

**Acciones:**

1. Read `project/planning/01_FREEZE_MAP.md` + preliminary feature list del explore-pass
2. Classify cada FT con tier + razón
3. Presentar al user tabla tier classification (compact prose + tabla)
4. Cerrar el turn con 3 opciones explícitas (slim default — NO walk-through forzado):
   - `1=approve all` — proceder a Phase 4b con la classification tal cual (path primario)
   - `2=ajustar FT-X` — re-tier features específicas; user lista cuáles y nuevo tier; orchestrator aplica delta sin re-presentar tabla completa
   - `3=walk-through completo` — opt-in only si user duda del tiering general; revisión feature por feature

**Output:** `tier_classification` dict (FT → S/M/L) que alimenta Phase 4b/4c.

### Phase 4b — Batch sweep Tier S/M (parallel, delegated to `dsc-feature-specer`)

**Propósito:** producir specs per-feature para Tier S/M en paralelo, **todos los batches en una sola message** — wall-clock = `max(batch time)`, no `sum(batches)`.

**Acciones del orchestrator:**

1. Agrupar Tier S/M features en batches ≤5 FTs each. Asignar `batch_id` por batch (`b1`, `b2`, …).
2. Per batch, compose input contract:
   - `freeze_map_path`, `explore_pass_path`, `batch_id`, `batch_features`, `tier_classification`, `template_path` = `03_DEEP_DIVE.template.md`, `output_path` = `project/discovery-artifacts/deep-dive-batch-{batch_id}.md`
3. **Single-message multi-Agent dispatch:** spawn TODOS los batches en paralelo en una sola message — N `dsc-feature-specer` Agent calls simultáneos (uno por batch). **NO Tier L en estos batches** (el agent aborta si recibe uno). Cada prompt DEBE anteponer:

   ```
   Consulta antes de empezar:
   - .claude/skills/sk-features-index/SKILL.md (mapping canónico Tier S → sk-{skill})
   ```

   **Concurrency rules:**
   - Cap concurrente: 10 specers simultáneos.
   - Si `N(batches) > 10`: partir en 2 waves seriales internamente, sin user checkpoint entre waves (la 2nd wave dispara automáticamente al cerrar la 1st).
   - Si `N(features Tier S/M) > 50` (raro): flag al user pre-dispatch igual que el circuit breaker de Phase 1.2.2.

4. Al completar todos los batches (wave única o multi-wave), orchestrator concatena los outputs per-batch y escribe `project/planning/03_DEEP_DIVE.md` consolidado via Write tool.
5. **Single post-all checkpoint** (no per-batch checkpoints): `[total] features done across N batches. 1=continuar a Phase 4c Tier L / 2=revisar OQs por feature / 3=ahondar en FT-X`.

> **Rationale:** per-batch checkpoints producían `sum(batches)` wall-clock por user round-trip entre cada uno. Single-message dispatch + single checkpoint hace que un set de 20 features Tier S/M (4 batches) baje de ~32 min serial a ~8 min paralelo. Si user necesita revisar mid-flight, la opción `3=ahondar en FT-X` post-todos cubre el caso sin romper el paralelismo.

Ver [`.claude/agents/dsc-feature-specer.md`](../../agents/dsc-feature-specer.md) para contract.

### Phase 4c — Tier L dedicated sessions (main orchestrator, interactive)

**Propósito:** capturar specs detallados + sub-ronda clarificación con user para features Build-custom irreversibles.

**Por cada Tier L feature:**

1. Main orchestrator produce 8-fields entry en prosa extendida (no delegar al agent — requiere back-and-forth). El entry sigue el slot template de `03_DEEP_DIVE.template.md` con §0-§9.

   **§0 Plain Language Summary MANDATORY** (per [§Plain language discipline](#-plain-language-discipline-cross-workflow-mandatory) arriba): 2-3 párrafos SIN jergón técnico. Audience: dev mid-level que NO leyó freeze-map ni ADRs. La feature explicada como si fuera para un PO no-técnico. Ejemplo: en vez de "polymorphic pick payload with parent_pick_id reference", escribir "cuando el usuario hace una predicción, queda guardada hasta que el partido empieza; en algunos torneos puede ligar 2 predicciones del mismo juego".

2. **Sub-ronda obligatoria:** preguntar al user **minimum 2 clarificaciones específicas, no upper bound — ask until the feature's architectural surface is resolved**.

   **Jargon reduction en sub-ronda Qs** (per cross-workflow plain language discipline arriba): definir términos técnicos inline first-use; acronyms con expansión; ejemplos concretos antes de abstracciones; `change_cost` en lenguaje de impacto ("cambiar esto post-implementation requiere ~3 días de migration") no solo "HIGH".

3. **Change cost annotation per sub-ronda Q:** orchestrator annotate cada sub-ronda question con `[change_cost: high|medium|low]` ANTES de presentar al user. Heurística:
   - **HIGH:** schema-level (column shape, polymorphism, JSONB structure) · state machine transitions (multi-state lockdown invariants, irreversible status flips) · idempotency / recomputation contract · cross-source consistency (multi-API reconciliation) · audit / versioning strategy
   - **MEDIUM:** UI exposure decisions (wizard knob vs hidden) · default values per scope (per format vs per instance)
   - **LOW:** copy strings · operational ergonomics (logs format, retry params within bounded ranges)

4. **Auto-emit ADR file al lock decision:** cuando user responde a un sub-ronda con `change_cost: high` → orchestrator immediately escribe `project/planning/decisions/ADR-{NN}.md` (template `tracking-issue.template.md`, `type: adr`, status: `proposed`). NO defer a Phase 7 architect. **Phase 7 architect agent reads `project/planning/decisions/ADR-*.md` (filter type: adr, status: proposed) como input** — su trabajo se vuelve validación + tradeoff articulation + **el veredicto** `accepted` / `rejected`, NO discovery. 🔴 **El `status:` lo escribe el ORQUESTADOR**, no el agente: `architect` es read-only (sin `Edit`/`Write` — ver su card) y devuelve el veredicto como texto, igual que el resto de su output; el orquestador lo aplica al `ADR-{NN}.md` al consolidar Phase 7. Mismo reparto que la creación del archivo, arriba.

5. **Detection rules for §8 CALC + §9 State Machine (MANDATORY checks):**
   - **§8 CALC required** si feature involucra: scoring, pricing, eligibility, ranking, normalization, allocation, recommendation, threshold, fee computation, interest, discount, quota, score calculation, weighted average, margin. → Si match en feature description / 8-fields entries / ADRs AND §8 omitido sin nota N/A justificada → **Quantitative gate FAIL**.
   - **§9 State Machine required** si feature involucra: status enum, transition, lock, lifecycle, deadline, eligibility-window, approval-flow, re-entry, activation, freeze, publish, archive, cancel, state lock. → Si match AND §9 omitido sin N/A → **Gate FAIL**.
   - Orchestrator scans feature description + 8-fields entries + ADRs against keyword list pre-emit del 03_DEEP_DIVE Tier L entry.
   - Si NO aplica → §8 o §9 con nota explícita `<!-- N/A — {razón concreta} -->`.

6. **§3 Data model deltas FULL inline (NO sketch).** Per entidad afectada: full structured table (campo/tipo PostgreSQL/nullable/default/desc) + índices + constraints (FK, UNIQUE, CHECK, RAISE EXCEPTION triggers). NO defer a /docs.

7. **§4.5 Action contracts inline.** Per server action o route handler: signature + path + RBAC + Zod input schema literal + ActionResult output + errors emitted + side effects. NO defer a /docs.

8. Append a `project/planning/03_DEEP_DIVE.md` en la sección Tier L (slot template completo §0-§9).

9. Batch checkpoint `1=siguiente Tier L / 2=revisar` entre sessions.

**Cluster rule (architectural blast radius):** when two Tier L features share data model, state machine, or vendor surface (e.g., features that consume the same JSONB economics blob, or features that share an idempotency / state-machine contract), they may be addressed in a single turn. Present the union of their sub-ronda questions together. Each feature retains its full sub-ronda question count and depth. If a hard dependency requires locking one feature's decisions before posing the next feature's questions, partition the turn into sub-batches; do not split into separate turns unless the user requests it.

**Cluster vs solo guidance:**

- Foundation features (multi-role architecture, RBAC structure) — typically solo (everything inherits)
- Schema + math features that share data shape — may cluster
- Engine features that share state-machine + idempotency + vendor surface — may cluster
- Compliance / regulatory features — typically solo (regulatory complexity)

**Regla:** NO se puede saltar Phase 4c. Cada Tier L feature necesita su sub-ronda — clustering is about turn structure, not question count.

### Workflow-drift candidates (post-Phase-4)

Si al cerrar Phase 4 un FT Tier L tiene Edge bucket >500 chars, O ≥2 FTs Tier L sugieren el schema 8-fields no basta → surface como `workflow-drift` factory-ticket candidate (orchestrator surfacea al user en Phase 8 close, user decide emitir).

> **Schema canónico + tiering rules:** ver [methodology/deep-dive.md §11](methodology/deep-dive.md).

---

## Phase 5 — SK Leverage Analysis (ALWAYS EMIT)

> **v10 change:** Phase 5 **NUNCA skip**. Siempre emite `project/planning/07_SK_LEVERAGE.md`. Si `sk_active=false`, body lleva nota explícita "N/A — proyecto sin Starter Kit". Esto elimina ambigüedad de numbering downstream (AI agent siempre encuentra el archivo en path estable).

### Branch por `sk_active`

**Si `sk_active=true`:**

1. Compose input contract para `dsc-kit-analyst`:
   - `freeze_map_path` = `project/planning/01_FREEZE_MAP.md`, `deep_dive_path` = `project/planning/03_DEEP_DIVE.md`, `target_repo`, `template_path` = `07_SK_LEVERAGE.template.md`, `output_path` = `project/planning/07_SK_LEVERAGE.md`, `project_slug`
2. Spawn `dsc-kit-analyst` (1 Agent call, serial). **El prompt DEBE anteponer:**

   ```
   Consulta antes de empezar:
   - .claude/skills/sk-features-index/SKILL.md (catálogo canónico de sistemas shipped por el kit)
   - .claude/skills/tk-discovery/methodology/kit-leverage.md (SK leverage analysis schema)
   ```

3. Agent escribe output directo (tiene `Write` tool). Orchestrator lee el output post-completion.
4. SK Drift Tickets → `project/factory/sk-drift-{YYYY-MM-DD}-{project-slug}-{NNN}.md`

**Si `sk_active=false`:**

Orchestrator-direct write (no agent spawn) — emit minimum doc con nota N/A:

```markdown
# SK Leverage — {{project}}

> **N/A — Este proyecto no usa Starter Kit.**
> Sin kit base que aprovechar; toda la implementación es custom. Ver `04_ARCHITECTURE.md §2 SK delta` para confirmación.

## Implementation-readiness

| Consumer     | Status   | Blocking decisions |
| ------------ | -------- | ------------------ |
| `/design`    | ready ✅ | —                  |
| `/backlog`   | ready ✅ | —                  |
| `/implement` | ready ✅ | —                  |
```

Path canónico: `project/planning/07_SK_LEVERAGE.md` (siempre). Ver [`.claude/agents/dsc-kit-analyst.md`](../../agents/dsc-kit-analyst.md) + [methodology/kit-leverage.md](methodology/kit-leverage.md).

---

## Phase 6 — Synthesis (orchestrator-direct, no agent spawn)

**Propósito:** ensamblar los canonical artifacts derivados (`00`, `02`, `04`, `05`, `06`, `08`, `09`, `10`) escribiendo directo a `project/planning/` desde el primer write — sin draft intermedio, sin agent spawn.

**Por qué orchestrator-direct:** post-Phase 5, el orchestrator ya tiene en context `01_FREEZE_MAP.md` + `03_DEEP_DIVE.md` + `07_SK_LEVERAGE.md` + `cross-file-reconciliation.md` (+ `challenge-pass.md` si se re-synth post-Phase 7). Re-ensamble cross-secciones es Write tool work + structure templates — NO requiere fresh-agent reasoning. Spawn agent acá costaba ~40 min + double-context (agent + orchestrator) sin ganancia.

**Phase 6 corre dos veces a lo largo del workflow.** First-pass (6.1) precede a Phase 7 Challenge Pass; re-synth (6.2) corre solo si Gap Round 2 introdujo cambios materiales. Mismas mecanismos (Write tool, quantitative gate), distintos inputs y momento.

### 6.1 First-pass synthesis

**Inputs:**

- `project/planning/01_FREEZE_MAP.md` (con §Firm Decisions: Enforcement + Target + Test ref columns per Fase-1)
- `project/planning/03_DEEP_DIVE.md` (Tier M 8-fields incl `Action contracts` field + Tier L slot template §0-§9 incl §3 full data model + §4.5 Action contracts + §8 CALC + §9 State Machine per Fase-1)
- `project/planning/07_SK_LEVERAGE.md` (always present; N/A si `sk_active=false`)
- `project/discovery-artifacts/cross-file-reconciliation.md` (si Phase 1.2.5 corrió)
- ADRs en `project/planning/decisions/ADR-*.md` (schema decisions + algorithm decisions + state machine decisions)
- Templates:
  - `.claude/skills/tk-discovery/templates/00_DISCOVERY_BRIEF.template.md`
  - `.claude/skills/tk-discovery/templates/02_PERSONAS.template.md`
  - `.claude/skills/tk-discovery/templates/04_ARCHITECTURE.template.md`
  - `.claude/skills/tk-discovery/templates/05_RBAC_MATRIX.template.md`
  - `.claude/skills/tk-discovery/templates/06_ACCEPTANCE_SCENARIOS.template.md`
  - `.claude/skills/tk-discovery/templates/08_GLOSSARY.template.md`
  - `.claude/skills/tk-discovery/templates/09_DATA_MODEL.template.md` (NEW Fase-1)
  - `.claude/skills/tk-discovery/templates/10_API_SURFACE.template.md` (NEW Fase-1)

**Acciones (registry-first flow — Fase-1 update):**

> 🔴 **Kit-specifics discipline (aplica a TODOS los emits 04/05/09/10).** Al escribir cualquier dato
> específico del Starter Kit — path de un archivo del kit, firma de un wrapper (`withAuth`/`withSelf`),
> nombres de columnas de audit, forma de un enum, prefixes de human-id, nombres de helpers —, **NO lo
> inventes ni lo afirmes con falsa precisión** (especialización de la regla #4 de arriba). Anclalo a su
> fuente as-built:
>
> - auth wrappers / firma / Route ACL → `sk-api`, `sk-security`, o `project/reference/API.md`
> - columnas de audit / enums / human-id prefixes → `sk-db`, o `project/reference/SCHEMA.md`
> - símbolos e import paths as-built → `project/reference/HOOKS.md`
>
> Si el reference aún no existe (greenfield pre-código), márcalo `[INFERRED — verify as-built]` (Confidence
> Tags §arriba) en vez de afirmarlo como hecho. Un kit-specific equivocado se propaga a 4 artifacts
> durables y solo lo caza `/backlog` 2 fases después.

1. **Build shared registry (internal — no disk artifact)** aggregating from:
   - Brief §4.1 ENT-XXX skeleton (Phase 1.1 bootstrap)
   - ADRs schema decisions + algorithm specs + state machine definitions (Phase 4c sub-rondas)
   - 03_DEEP_DIVE Tier M `Data` field (now full per Fase-1) + `Action contracts` field (NEW)
   - 03_DEEP_DIVE Tier L slot template §3 (full data model) + §4.5 (Action contracts) per Fase-1
   - 04_ARCHITECTURE §3 routes inventory expanded (auth strategy + input/output/error codes per Fase-1)
   - 05_RBAC_MATRIX (roles × resource × action)
   - 06_ACCEPTANCE_SCENARIOS error scenarios (catalog of error codes emitted)
   - 01_FREEZE_MAP Enforcement/Target/Test fields per Firm

   Registry shape (in-memory):

   ```
   {
     entities: [{ id, name, fields[], indices[], constraints[], refs_upstream }],
     enums: [{ name, values[], used_by[] }],
     actions: [{ name, ft_id, path, rbac, input_zod, output_shape, errors[], side_effects[] }],
     routes: [{ pattern, method, handler_type, auth, input, output, errors[] }],
     error_codes: [{ code, http, when, message, emitted_from[] }],
     relationships: [{ from_entity, to_entity, cardinality, semantic_name }]
   }
   ```

2. **Emit 09_DATA_MODEL.md from registry** (orchestrator-direct Write tool). Per-entity full structured tables + Mermaid ER diagram + enums consolidated + soft-delete pattern + audit pattern + index strategy hints. Phase 6.1 step 2.

3. **Emit 10_API_SURFACE.md from registry** (orchestrator-direct Write tool). Per-FT server actions surface (signature + Zod input literal + ActionResult output + errors + side effects) + route handlers surface + error codes catalog consolidado. Phase 6.1 step 3.

4. **Emit 00_DISCOVERY_BRIEF.md** (NO draft path) referencing registry. §3.2.bis Feature Dependency Graph (Mermaid from 03_DEEP_DIVE UPSTREAM/DOWNSTREAM fields, NOT from 09) + §4.2 ER diagram (Mermaid from shared registry, SAME source as 09 §1 — no circular dep). Phase 6.1 step 4.

5. **Emit derivative artifacts** desde registry + previous artifacts: `02_PERSONAS.md`, `04_ARCHITECTURE.md`, `05_RBAC_MATRIX.md`, `06_ACCEPTANCE_SCENARIOS.md`, `08_GLOSSARY.md`. `05_RBAC_MATRIX.md` corre en dos pases: primero entities, luego routes desde `04_ARCHITECTURE.md §3` (expanded per Fase-1).

6. **Quantitative gates inline post-write per artifact:**
   - **00:** FT/BR/entities/pantallas vs WIP esperado · §3.2.bis Mermaid covers all FTs · §4.2 ER covers all ENTs
   - **02:** PER coverage (todos los roles del freeze map tienen persona)
   - **04:** §3 routes expanded — todos los handlers documentados con auth + input + output + errors
   - **05:** entities + routes × actions coverage ≥90%
   - **06:** US coverage + refs cuádruples por scenario + error scenarios alineados con 10 catalog
   - **08:** glossary refs (terms mencionados en otros artifacts presentes)
   - **09 (NEW):** 100% ENTs declarados en brief §4.1 + 03_DEEP_DIVE Data fields cubiertos · enums consolidated sin duplicados · Mermaid ER renders sin parsing errors
   - **10 (NEW):** todas las server actions + route handlers de 03_DEEP_DIVE Action contracts + 04 §3 routes cubiertas · error codes catalog consolidado sin duplicados (deduplicar por code; emitted_from list todos los emitters)

   Si FAIL → orchestrator re-ensambla artifact afectado (Write tool sobreescribe in-place), re-gate. NO re-spawn de agent.

**Output:** canonical artifacts v1 (`00`, `02`, `04`, `05`, `06`, `08`, `09`, `10`) — input para Phase 7 Challenge Pass. **11 canonicales totales** post-Fase-1 (counting `01 freeze-map` + `03 deep-dive` + `07 sk-leverage` que se generaron pre-Phase-6).

### 6.2 Re-synth post-Phase-7 (condicional, single source of truth)

> **Spec note:** Phase 7.5 referencia esta sub-fase. Toda la mecánica del re-synth post-GR2 vive aquí — no duplicar en Phase 7. Phase 7.5 simplemente delega a Phase 6.2.

**Trigger:** solo si Gap Round 2 (Phase 7.4) introdujo **cambios materiales** al brief.

**"Cambios materiales" = ANY de:**

- ≥3 firms modificados respecto al brief v1
- ≥1 firm que afecta §1 (Problem/North Star), §3 (Scope MVP), §6 (Data model / entidades) o §8 (Delivery / commercial / tiering) del brief
- ≥1 reclasificación MoSCoW (M ↔ S ↔ C ↔ W)

Si ninguna de las anteriores aplica → skip 6.2, brief v1 sigue siendo canonical.

**Inputs:** los de 6.1 + `project/discovery-artifacts/challenge-pass.md` (now persisted) + GR2 resolutions.

### Impact map universal (Phase 6.2 — TODO cambio material)

> **Regla universal:** todo cambio material **reconcilia `01_FREEZE_MAP.md` al bucket correcto** (NO siempre Firm) + **valida `00_DISCOVERY_BRIEF.md`** (index consistency check) + identifica derivados impactados.

**Bucket-mapping por outcome de GR2 / Phase 7 resolution:**

| Outcome                                           | Acción en `01_FREEZE_MAP.md`                                                                          | Plus action                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| User confirma decisión concreta                   | Append/update `§Firm Decisions` con F-code + `change_cost`                                            | —                                                                                      |
| Pregunta queda sin resolver                       | Append/update `§Open Questions` con OQ-XXX                                                            | —                                                                                      |
| Surface contradicción entre fuentes no resuelta   | Append `§Contradictions` con citas literales                                                          | —                                                                                      |
| User explora opción sin comprometerse             | Append `§Recommendations` (not yet firm)                                                              | —                                                                                      |
| User explícitamente difiere a futuro              | `§Post-MVP / Future` row + (si tracking necesario) crear `project/planning/decisions/DECISION-XXX.md` | —                                                                                      |
| User decide "no change, lo que está ya está bien" | **NO-op explícito**                                                                                   | Audit line en `challenge-pass.md` summary: `01_reconcile: no-op confirmed for {topic}` |

**Validación universal de 00 (audit-friendly):**

Por cada resolution categorizada, orchestrator verifica refs en 00 sections impactadas (§2.1 PER index, §3.3 US index, §4 ENT index, §5 integraciones). Si no-op:

> **Audit line obligatoria:** `challenge-pass.md` summary section incluye `impact_map_check: 00 validated no-op for {topic} | derivatives no-op for {list}`. Sin esta línea, el "validate 00" check es invisible y skipable.

**Dimension-specific derivatives (re-synth obligatorio si change material toca esa dimensión):**

| Cambio material                                                             | Derivados (re-synth obligatorio)                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope MVP (features add/remove, deadline, descope)                          | `00 §1/§3/§8` + `03` (FT scope/Tier) + `06` (US, scenarios) + `10` (si feature aporta/quita server actions del API surface)                                                                      |
| Roles / personas (PER add/remove/rename)                                    | `02` (PER definitions) + `05` (RBAC roles axis) + `06` (PER refs en scenarios) + **`10` (si auth strategy cambia per action)**                                                                   |
| Data model (ENT add/remove, schema change)                                  | `03` (Data field per FT) + `05` (entities axis) + `04 §3` (module boundaries si nuevas tablas) + `06` (ENT refs) + **`09` (re-emit from updated registry)** + **`00 §4.2` ER diagram (re-emit)** |
| Architecture surface (component, integration, route, ADR resuelto/rejected) | `04` (secciones aplicables) + `05` (routes axis si module boundaries cambian) + `07` (SK delta si sk_active) + **`10` (re-emit si actions/routes/error codes cambiaron)**                        |
| Action signature / Zod schema / error codes change                          | `03 §4.5 Action contracts` (Tier L) + `03 Action contracts` field (Tier M) + **`10` (re-emit from registry)** + `05` (RBAC scope si auth cambia) + `06` (error scenarios refs)                   |
| Glossary / terminology                                                      | `08` (terms table) + cross-check refs en 02/03/04/05/06/09/10                                                                                                                                    |
| Business Rules (BR add/change/reverse)                                      | `01 §Firm Decisions` (Enforcement/Target/Test ref si BR es enforceable runtime) + `03` (Rules field per FT) + `06` (BR refs en scenarios)                                                        |

**Strategy selection (Edit-in-place vs Write completo, per artifact):**

Calcular `delta_pct = LOC_changed_lines / LOC_total_artifact` per artifact impactado (no global).

| Condición                                                                                                       | Strategy                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `delta_pct < 30%` AND no architectural-firm change (no §6 data model, no §1 problem statement, no §3 MVP scope) | **Edit** (sección por sección, Edit tool sobre el path canónico) — 5-10× más rápido en output tokens, menor risk de regresión del v1 |
| `delta_pct >= 30%` OR architectural-firm change                                                                 | **Write completo** (re-ensamble) sobre el path canónico del artifact afectado                                                        |

**Acciones (orden):**

1. **Categorizar resolutions** post-GR2/Phase 7 por dimensión (scope/roles/data/arch/glossary/BR) + outcome (Firm/OQ/Contradiction/Recommendation/Post-MVP/no-op).
2. **Reconcile 01:** route to correct bucket per outcome table.
3. **Validate 00:** check sections impactadas; if no-op → write audit line.
4. **Identificar derivados** por dimension via tabla. Per derivative: aplicar `delta_pct` threshold.
5. **Re-correr quantitative gates** per artifact updated.
6. **Si ≥4 artifacts impactados:** registrar en `challenge-pass.md` summary, NO crear pseudo-checkpoint. Orchestrator procede sin esperar respuesta (transparency != consent).

**Output:** brief canónico v2 + N artifacts derivados re-synth — sobreescriben v1 in-place. Plus audit trail en `challenge-pass.md` summary.

### 6.3 Downstream Handoff Packets

> **Propósito:** convertir prosa de 00-10 en contratos parseables que `/design`, `/backlog`, `/implement` consumen sin re-interpretación. Phase 6.3 corre post-6.1 (always) + post-6.2 si re-synth ocurrió (re-emite los packets afectados por el cambio material).

**Outputs (T3 — expanded):**

- `project/planning/11_CLIENT_QUESTIONS.md` — subset client-owned OQs (filter from `01_FREEZE_MAP §Open Questions` + Phase 7.4 GR2 unresolved + deep-dive Tier L sub-rondas unresolved, `owner_type=cliente`).
- `project/planning/12_BACKLOG_READINESS.md` — per-FT roll-up: `ready`/`partial`/`spike-only`/`blocked` + blocker IDs + decision/spike to unblock + aggregate `Backlog can proceed: YES/WITH-CAVEAT/NO`. Producer: Phase 6.3 step 5.
- `project/planning/13_OQ_BY_FT_MATRIX.md` — ALL OQs (cliente + tech + internal) en matriz operacional `OQ × FTs blocked × Owner × Consumer × Default × Deadline × Tracking`.
- `project/planning/14_DOMAIN_REGISTRY_LOCKS.md` — explicit enumeration de registries de dominio (reports/cron/roles/navigation/movement-types/KPIs/dashboards) marcados `locked` o `partial`. NO auto-scanner — gap round detecta enum-pattern abierto y pregunta. Producer: Phase 6.3 step 6.
- `project/planning/15_IMPLEMENTATION_PACKETS/FT-XX.md` — **one file per Tier S/M/L FT** con Status/Wave/Depends/Blocks/Primary files/Entities/Actions/RBAC/AC refs/Tests/Blockers/Defaults/DoD. Self-contained handoff packet — `/implement` lee solo el packet sin saltar archivos. Producer: Phase 6.3 step 7.

> **Downstream context:** consumers que lean 11/13 cruzan refs FT-NN contra `03_DEEP_DIVE.md` y entities/actions contra `09_DATA_MODEL.md` / `10_API_SURFACE.md`. Para el kit dependency map del derived project (componentes/hooks consumidos en cada FT) → `project/reference/CODEBASE.md` + `project/reference/INVENTORY.md` (autogenerated en el target repo, no aquí).

**Acciones (en orden):**

1. **Build OQ registry (in-memory — no disk artifact)** aggregando:
   - `01_FREEZE_MAP §Open Questions` rows (post-Phase 2 emit)
   - Deep-dive Tier L sub-rondas unresolved (Phase 4c output — `OQ-XXX` IDs)
   - Phase 7.4 GR2 unresolved (si Phase 7 corrió; first-pass desde freeze-map + deep-dive solamente)

   Registry shape:

   ```
   {
     id: "OQ-001",
     owner_type: "cliente" | "tech" | "internal",
     owner_name: "{concrete person or 'TimeKast team'}",
     question: "{full text}",
     context: "{1-2 sentence summary from upstream}",
     options: ["a) ...", "b) ..."] | [],
     blocks_fts: ["FT-09", "FT-10"],
     blocks_consumer: "/design" | "/backlog" | "/implement",
     default_allowed: "none — must resolve" | "{explicit default}",
     deadline: "YYYY-MM-DD" | "pre-W5",
     tracking_id: "DECISION-NNN" | "SPIKE-NNN" | null,
   }
   ```

2. **Emit `13_OQ_BY_FT_MATRIX.md`** desde registry (all OQs). Producer: Phase 6.3 step 2 (orchestrator-direct Write tool, no agent spawn). Template: `.claude/skills/tk-discovery/templates/13_OQ_BY_FT_MATRIX.template.md`.

3. **Emit `11_CLIENT_QUESTIONS.md`** filtrando registry por `owner_type=cliente`. Producer: Phase 6.3 step 3 (orchestrator-direct Write tool). Template: `.claude/skills/tk-discovery/templates/11_CLIENT_QUESTIONS.template.md`. Body section per OQ con context + question + options + owner + default + deadline + tracking. Self-contained.

4. **Emit `14_DOMAIN_REGISTRY_LOCKS.md`** desde Firm Decisions + Tier L specs + ADRs (orchestrator-direct Write tool). Template: `.claude/skills/tk-discovery/templates/14_DOMAIN_REGISTRY_LOCKS.template.md`. Sections per dominio (reports/cron/roles/navigation/movement-types/KPIs). Cada section status `locked` o `partial` (con tracking ID si partial). **Detector rule:** orchestrator NO infiere enumeración. Si freeze-map o deep-dive contiene vagueness pattern (`5-7 reportes`, `varios tipos`, `opcional`) sin enumeración, eso es OQ pendiente — surface en Gap Round o `13_OQ_BY_FT_MATRIX` con `Default allowed: none — must resolve`. No auto-scanner (high false-positive risk).

5. **Emit `12_BACKLOG_READINESS.md`** desde 03_DEEP_DIVE (FT inventory) + 13_OQ_BY_FT_MATRIX (per-FT blockers cross-ref) + 01_FREEZE_MAP (F-codes status) + decisions/ (DECISION/SPIKE/ADR status) (orchestrator-direct Write tool). Template: `.claude/skills/tk-discovery/templates/12_BACKLOG_READINESS.template.md`. Per-FT row: Status (`ready`/`partial`/`spike-only`/`blocked`) + Blocking ID(s) + Blocking consumer + Decision/Spike to unblock. Aggregate `Backlog can proceed: YES/WITH-CAVEAT/NO`. Wave alignment opcional si `project-config §11` declara waves.

6. **Emit `15_IMPLEMENTATION_PACKETS/FT-XX.md`** per FT (one file per Tier S/M/L FT — `mkdir -p project/planning/15_IMPLEMENTATION_PACKETS` first; Write tool each FT). Template: `.claude/skills/tk-discovery/templates/15_IMPLEMENTATION_PACKET.template.md`. Schema fields:
   - **Status** ← 12_BACKLOG_READINESS row
   - **Wave** ← project-config §11 (if applicable)
   - **Depends on / Blocks** ← 03_DEEP_DIVE UPSTREAM/DOWNSTREAM fields (FT graph)
   - **Primary files** ← 04_ARCHITECTURE §3 routes + 09_DATA_MODEL anchors + sk-\* skill refs
   - **Entities** ← 09_DATA_MODEL ENT-XXX refs filtered by FT
   - **Actions/routes** ← 10_API_SURFACE actions filtered by FT
   - **RBAC** ← 05_RBAC_MATRIX role × resource × action entries filtered by FT entities
   - **Acceptance scenarios** ← 06_ACCEPTANCE_SCENARIOS US-XXX refs filtered by FT
   - **Tests required** ← derived from AC complexity (interaction → component; cross-page → E2E; pure logic → unit)
   - **Open blockers** ← 12_BACKLOG_READINESS Blocking ID(s) for this FT
   - **Defaults allowed** ← 13_OQ_BY_FT_MATRIX `Default allowed` per OQ blocking this FT
   - **Definition of done** ← 06 AC + 12 Status==ready criteria

   **🔴 Contract source rule (extraction-only, NO new reasoning):** si packet field contradicts su source → emission FAILS. Source-of-truth hierarchy: `03_DEEP_DIVE` > `12_BACKLOG_READINESS` > `15_IMPLEMENTATION_PACKETS`. Conflict examples:
   - Packet `Status: ready` PERO `12_BACKLOG_READINESS` dice `partial` → FAIL ("Conflict source-of-truth FT-XX: 16 says ready, 12 says partial. Fix 12 first.")
   - Packet `Status: ready` AND `Open blockers != []` → FAIL (inconsistencia obvia)
   - Packet `Depends on` con prosa (no IDs only) → FAIL (validator regex: `^[A-Z]+-\d+(, [A-Z]+-\d+)*$`)

7. **Quantitative gates inline post-write (T3 extended):**
   - **11:** row count == count of OQs con `owner_type=cliente` · cada OQ tiene `Context` + `Question` no-vacíos
   - **12:** row count == count(FT-NN en 03_DEEP_DIVE) · cada `partial/blocked/spike-only` tiene tracking ID · aggregate `Backlog can proceed` ∈ {YES, WITH-CAVEAT, NO}
   - **13:** row count == registry size · cero filas con `Blocks FTs` vacío · cero filas con `Owner name = TBD/?` · cero filas con `Default allowed = none — must resolve` AND `Tracking = —` (hard fail)
   - **14:** cada section §1-§6 marcada `locked` o `partial` · roles registry §3 set-equal a `05_RBAC_MATRIX §Authorization Model Lock §Canonical roles`
   - **16:** count(FT files) == count(FT-NN en 03_DEEP_DIVE Tier S/M/L) · `Depends on` / `Blocks` regex `^[A-Z]+-\d+(, [A-Z]+-\d+)*$` (IDs only) · cero packets con `Status: ready` AND `Open blockers != []`
   - Si FAIL → orchestrator surfacea al user con detalle (`FT-XX violates gate Y`) y propone fix; NO procede a Phase 7 hasta que el gate pasa.

> **Note:** Phase 8 does NOT copy a draft to a canonical path — the canonical brief is written directly to `project/planning/00_DISCOVERY_BRIEF.md` from Phase 6. No intermediate draft path exists.

> **Edge case CP2 reject:** canónico queda con data del run rechazado. Mitigación: re-correr `/discovery` sobreescribe. Scenario raro, reversible.

---

## Phase 7 — Challenge Pass (4 agents PARALELO + persist + Gap Round 2)

### 7.1 Parallel dispatch

Single message, 4 `Agent` tool calls en paralelo + 1 `ToolSearch` call para pre-cargar primitivas de Plan Mode (CP2 las requiere). **Cada prompt DEBE citar paths explícitos de skills relevantes** (CC.md §2 — subagents no reciben el listado de skills por description injection).

**Pre-dispatch:** orchestrator escanea `project/planning/00_DISCOVERY_BRIEF.md` para identificar dominios mencionados (crons, PWA, tokens, MCP, etc.) y agrega los `kb-*` condicionales a la lista del `architect`.

**Co-dispatch tool pre-load:** en la misma message del Phase 7 dispatch, agregar `ToolSearch select:EnterPlanMode,ExitPlanMode`. Para cuando los 4 agents terminan + GR2 procesa, las primitivas de Plan Mode ya están cargadas → CP2 entra inmediatamente sin "waiting for tools". Ahorra latencia menor pero elimina UX gap entre fin de Phase 7 y entrada a CP2.

```
Agent(subagent_type=architect, model=opus, phase="Phase 7 — challenge pass", prompt="
Consulta antes de empezar (paths repo-relative):
- .claude/skills/sk-features-index/SKILL.md (baseline kit shipped)
- .claude/skills/kb-ssot-registries/SKILL.md (registry/SSOT patterns)
- .claude/skills/sk-db/SKILL.md (data model risks)
- .claude/skills/sk-security/SKILL.md (auth/RBAC/Zod risks)
[Condicional según dominios del brief — el orchestrator decide pre-dispatch:]
- .claude/skills/kb-cron-jobs/SKILL.md (si scope toca crons/jobs)
- .claude/skills/sk-pwa/SKILL.md (si scope toca PWA / SW)
- .claude/skills/sk-skins/SKILL.md (si scope toca tokens/DS)

Audit project/planning/00_DISCOVERY_BRIEF.md for irreversible architectural decisions, tech risks, constraints bypassed. Don't produce ADR — flag risks only.

Adicionalmente revisar (T3 handoff packets):
- project/planning/12_BACKLOG_READINESS.md — validate cada FT con `Status != ready` tiene tracking ID + Blocking consumer coherente
- project/planning/13_OQ_BY_FT_MATRIX.md — validate cero filas con `Default allowed: none — must resolve` AND `Tracking: —`
- project/planning/14_DOMAIN_REGISTRY_LOCKS.md — validate roles registry §3 set-equal a `05_RBAC_MATRIX §Authorization Model Lock §Canonical roles`; validate registries con `status: partial` tienen tracking ID
- project/planning/15_IMPLEMENTATION_PACKETS/FT-*.md — validate cada FT packet coherente con 12_BACKLOG_READINESS (Status match) y 03_DEEP_DIVE (no fields contradicen upstream)
- project/planning/decisions/ADR-*.md — validate cada ADR con `blocks: [...]` non-empty tiene `status: accepted` o `rejected` (NO `proposed`)

Adicionalmente — Stack-gravity check: identifica features clasificadas como Tier S/M (Configure/Extend)
que captura mecánica de dominio genuina del proyecto (state machines custom, polymorphic schemas,
scoring logic, vendor-specific contracts). Esas son candidates a Build (Tier L) reclassification —
bandera como `arch-finding: stack-gravity-detected` si aplica.

NO inflar por duda: si la duda es 'no estoy seguro si el kit shippa exactamente X', NO marques
stack-gravity-detected. En su lugar, marca `[OQ-tier]` para verificación contra sk-features-index.
Stack-gravity = mecánica concreta de dominio no cubierta, no falta de evidencia.
")

Agent(subagent_type=product-owner, model=opus, phase="Phase 7 — challenge pass", prompt="
Consulta antes de empezar:
- .claude/skills/sk-features-index/SKILL.md (qué shippa el kit — para distinguir scope genuino nuevo vs feature-flag toggle del kit)

Review project/planning/00_DISCOVERY_BRIEF.md for user-intent preservation, scope drift, MVP boundary integrity, MoSCoW soundness.

Adicionalmente cross-check con T3 handoff packets:
- project/planning/11_CLIENT_QUESTIONS.md — validate cada OQ-cliente tiene Owner + Default + Deadline + tracking; flag si una OQ open afecta user intent core
- project/planning/12_BACKLOG_READINESS.md — flag features con `Status: spike-only` o `blocked` que mapean a MVP scope (descope candidates)
- project/planning/14_DOMAIN_REGISTRY_LOCKS.md — flag registries `partial` que afectan MVP user value (e.g., reports partial limita Wave 1)
")

Agent(subagent_type=project-planner, model=opus, phase="Phase 7 — challenge pass", prompt="
Consulta antes de empezar:
- .claude/skills/sk-features-index/SKILL.md (kit-shipped systems aceleran timeline; features Build-from-scratch tier L pesan en estimación)
- .claude/skills/tk-discovery/methodology/deep-dive.md (semantics de Tier S/M/L para validar realismo del descope plan)

Review project/planning/00_DISCOVERY_BRIEF.md for timeline realism, hidden dependencies, premature commitments, rollback paths.

Adicionalmente cross-check con T3 handoff packets:
- project/planning/12_BACKLOG_READINESS.md — validate wave alignment table consistente con `project-config §11`; flag si Wave 1 contiene FTs `blocked` o `spike-only` (timeline risk hard)
- project/planning/15_IMPLEMENTATION_PACKETS/FT-*.md — validate `Depends on` graph no tiene ciclos · validate critical path FTs (`Blocks` non-empty) tienen `Status: ready`
- project/planning/13_OQ_BY_FT_MATRIX.md — flag OQs con `Deadline` antes de Wave correspondiente (timeline impossible)
")

Agent(subagent_type=skeptical-client, model=opus, phase="Phase 7 — challenge pass", prompt="
🚨 OVERRIDE MODE: discovery deliverable review (NOT proposal/commercial review).

Tu agent file está scoped a proposals comerciales con ROI framing. Este prompt OVERRIDE-EA ese scope. Ignora completamente:
- ROI análisis / business value framing comercial
- 'antes vs después' commercial
- Output checklist comercial estándar (executive summary review, etc.)

En su lugar, eres revisor de DELIVERABLE TÉCNICO al cliente:
- El cliente recibe el repo + project/planning/ stripped del kit
- Va a leer 00_DISCOVERY_BRIEF.md + 04_ARCHITECTURE.md sin contexto Factory
- Tu job: detectar que esos docs son creíbles + alineados con su dolor real + sin promesas vagas

Consulta antes de empezar:
- .claude/skills/sk-features-index/SKILL.md (para distinguir feature genuina vs jerga técnica empaquetada como capability)

Review estos dos artifacts:
- project/planning/00_DISCOVERY_BRIEF.md
- project/planning/04_ARCHITECTURE.md
- project/planning/11_CLIENT_QUESTIONS.md (validate phrasing accessible al cliente; flag jerga factory residual o vagueness que cliente no podría responder)
- project/planning/14_DOMAIN_REGISTRY_LOCKS.md (flag registries con `status: partial` que el cliente debería confirmar — surface ahí explícito antes de stripping)

Flag (HIGH/MED/LOW):
- Promesas vagas sin métrica observable ('mejora UX', 'optimiza performance', 'experiencia moderna')
- Jerga técnica disfrazada de business value
- Features en brief sin conexión clara al dolor de §1.2 Problema que Resuelve
- Decisiones architecture en 04 que cliente NO podría defender post-handoff (cliente queda con repo + 04 stripped del kit)
- Assumptions sobre cliente no confirmadas en source package

NO flag:
- Detalles implementación interna (scope architect)
- Issues scope/MVP boundary (scope product-owner)
- Issues timeline/dependencies (scope project-planner)
- ROI / commercial viability / business case (OUT OF SCOPE — no eres /proposal)

Output: findings inline severidad HIGH/MED/LOW siguiendo pattern de architect/PO/planner. NO produces ADR.
")
```

> 🔴 **`/discovery` NO consume `.claude/policy/quality-gates.json` — la exención queda escrita, no implícita.** El panel de esta fase son estos cuatro revisores, fijos, en toda corrida; **no** deriva de `panel_by_risk`.
>
> **Por qué, y no es pereza:** las reglas del registry matchean globs de código bajo `src/`. Un run de `/discovery` escribe documentos de planeación — no matchearía ninguna, resolvería riesgo 0, y el `panel_by_risk` de ese nivel está **vacío**: cero revisores, en todas las corridas. Derivar el panel de ahí sería perder los cuatro que esta fase necesita.
>
> **Tampoco se cablea la evaluación plan-time**, aunque exista como doctrina general ([`fx-execution-policy §6`](../fx-execution-policy/SKILL.md)): la partición diff-time/plan-time es doctrina del kit, la exención es decisión de este workflow. Los cuatro revisores de aquí no son un panel de riesgo — son lentes de producto, arquitectura, plan y cliente sobre un brief, y ninguna escala de riesgo de código los convoca ni los sustituye.

### 7.2 Persist findings

Orchestrator consolida los 4 outputs en `project/discovery-artifacts/challenge-pass.md` con 4 sub-secciones (architect / product-owner / project-planner / skeptical-client verdicts + findings HIGH/MED/LOW). Esto permite que el orchestrator lo consuma como input explícito post-Gap-Round-2 al re-ensamblar el brief (Phase 7.5).

### 7.3 Gate de veredicto (pre-Gap-Round-2)

Si hay cualquier `🔴`:

1. **architect 🔴** → ADRs requeridos. Listar en CP2 §"ADRs pendientes pre-backlog" con deadline per ADR.
2. **product-owner 🔴** → escalar findings High como "PB{N} pre-backlog renegotiation". Bloquean `/backlog`.
3. **project-planner 🔴** → **bloquear CP2** hasta que `project/planning/00_DISCOVERY_BRIEF.md` contenga §8.7 Descope Plan aterrizado (tiering S/M/L + triggers) + §8.8 Post-MVP milestones.

### 7.3.bis ADR lifecycle gate (T2)

**🔴 Hard gate pre-CP2:** `count(ADRs WHERE status='proposed' AND blocks != []) == 0`

Verificación:

```bash
# Pseudo-verification (orchestrator ejecuta inline)
for adr in project/planning/decisions/ADR-*.md; do
  status=$(yaml-get $adr status)
  blocks=$(yaml-get $adr blocks)
  if [[ "$status" == "proposed" && "$blocks" != "[]" ]]; then
    FAIL: "$adr is still 'proposed' but blocks consumers $blocks — must resolve to accepted/rejected"
  fi
done
```

Si fail → orchestrator listea las ADRs ofensoras + bloquea CP2 entry. Architect agent debe re-revisar; user decide:

- (a) `status: accepted` clean (Decision + Consequences completos + 04 bakeado)
- (b) `status: accepted` with caveat → emit nuevo `SPIKE-XXX` o `DECISION-XXX` para la caveat
- (c) `status: rejected` → Status notes explica
- (d) Move ADR a `blocks: []` (advisory only) — documentar por qué

Detalle: `methodology/implementation-readiness.md §4b ADR lifecycle post-CP2`.

Re-correr gate cuantitativo post-edit si se re-sintetiza.

### 7.4 Gap Round 2 (stakeholder decisions)

**🔴 OBLIGATORIO si agents surfacean HIGH findings que requieren decisión del stakeholder.**

Filtrar HIGH findings en 2 buckets:

- **(a) Stakeholder decisions** (requieren el user, no implementation): ej ADR architectural preference, descope strategy under timeline pressure, North Star quantitative metric, vendor selection between committed alternatives
- **(b) Implementation decisions** (ADRs, gates, patterns — orchestrator/tech lead los resuelve): ej domain engine golden-fixture test gate pre-release, idempotency strategy, partitioning policy

Compose mini-Gap-Round-2 batch único con bucket (a) questions. Pre-question check estricto (no ofrecer alternativas si source responde). User responde → orchestrator updatea `project/planning/00_DISCOVERY_BRIEF.md` + `project/planning/01_FREEZE_MAP.md` Phase 3 Resolutions section + persiste audit notes a `project/discovery-artifacts/`.

**CP2 es estrictamente "approve close"**, nunca aprobar decisiones tácitas que debieron ser Gap Round 2.

Si no hay HIGH stakeholder decisions → skip Round 2, ir directo a CP2.

### 7.5 Re-synthesize if needed → see Phase 6.2

Si Gap Round 2 introdujo cambios materiales al brief, el re-synth se ejecuta per **Phase 6.2 Re-synth post-Phase-7 (condicional, single source of truth)** — esa sub-fase es el SSOT del re-synth path (criterio de "cambios materiales", strategy Edit-vs-Write, quantitative gate). No duplicar mecánica acá.

### 7.6 Pre-CP2 Canonical State Sweep

> **🔴 HARD GATE pre-CP2.** Si falla, CP2 no entra (no `EnterPlanMode`). Resolver violations antes de continuar.

> **Por qué pre-CP2 y no Phase 8:** si la sweep corre post-CP2 approval, el user aprueba estado roto y luego falla — peor UX que detectar antes. Esta gate es el último filtro objetivo previo a la synthesis genuina de CP2.

**Scan EXCLUSIVO sobre (NO scan de prosa libre):**

1. **Frontmatter de durables** (`00`-`11`, `13`, `decisions/*`) — fail si encuentra:
   - `status: pending`
   - `status: tentative`
   - `status: hypothesis`

2. **Celdas `Status:` de tablas Implementation-readiness en cada artifact** — fail si valor ∉ `{ready, partial, blocked}`.

3. **`partial` o `blocked` sin tracking ID adjacent** — regex: `(partial|blocked)` no seguido dentro de 200 chars por `(DECISION|SPIKE|ADR)-\d+` → fail. Aplica a TODOS los durables.

4. **`13_OQ_BY_FT_MATRIX` rows con `Default allowed = none — must resolve` AND `Tracking = —`** → fail (gate de Phase 6.3 step 4 ya cubre esto en el emit; sweep lo re-verifica post potencial re-synth en 7.5).

**NO scan de:**

- Prosa libre (false-positive risk: "we propose X as next step" vs `status: proposed`)
- Comentarios `<!-- ... -->`
- Code fences

Eso queda al architect agent en Phase 7.1 (semantic review, no regex).

**Action si fail:**

1. Orchestrator imprime las violations específicas con file:line + el tracking ID que falta.
2. Si > 3 violations → bloquea CP2 entry; user debe resolver (probablemente reabrir GR2 con preguntas específicas, o crear DECISION/SPIKE files para los unbacked partials).
3. Si ≤ 3 violations triviales (e.g., 1 ADR olvidó status update post-Phase 7.1 architect) → orchestrator propone fix inline ("crear `decisions/DECISION-008.md` para OQ-XXX? Y/N").

---

## 🛑 CHECKPOINT 2 — Pre-Close Review (Plan Mode formal)

**Mecanismo:** **Plan Mode FORMAL obligatorio.** Orchestrator invoca `EnterPlanMode` (cargar tool si deferred), redacta synthesis estructurada (§CP2.synthesis abajo) en plan buffer, luego `ExitPlanMode` para approval del user.

> **Por qué Plan Mode aquí (no inline + STOP):** CP2 = **synthesis multi-fuente crítica** — consolida `challenge-pass.md` (4 agentes) + Gap Round 2 + freeze-map updates + descope plan + drift report. La pausa formal del Plan Mode forza al agente a dejar de generate-and-go y producir synthesis genuina (vs checklist perfunctorio). Este es el último gate antes de close — la ceremony se gana el costo.

> **Pre-load:** ya realizado en Phase 7.1 dispatch (co-dispatch tool pre-load). Si por algún motivo Phase 7 no se ejecutó este turn, cargar acá: `ToolSearch select:EnterPlanMode,ExitPlanMode`.

### CP2.synthesis — structured plan content (rich, NOT checklist)

El plan buffer en Plan Mode debe contener **synthesis genuina**, no checklist mecánico. Estructura mínima (6 secciones):

#### 1. Findings synthesis (¿qué surfaced y qué importa?)

Lectura interpretativa de los 4 agentes + GR2:

- **Architect HIGH** → ¿qué decisions schema-level quedaron blindadas vs cuáles necesitan ADRs? Agrupa por blast radius. ¿Hay `stack-gravity-detected` findings con Tier S/M que deberían ser L?
- **PO HIGH** → ¿user-intent preservado? ¿scope drift catched? ¿MVP boundary íntegra post-GR2?
- **Planner HIGH** → ¿timeline aterrizable post-descope? ¿critical path libre de single-thread bottlenecks?
- **Skeptical-client HIGH** → ¿brief + 04 defendibles desde lente cliente? ¿promesas vagas eliminadas o aterrizadas con métrica? ¿features alineadas al dolor de §1.2? ¿architecture decisions sostenibles post-handoff?

NO repetir verdicts table — interpretar.

#### 2. Cross-cutting impacts

Identificar findings que se afectan mutuamente (ej: "ADR-001 monolithic JSONB bloquea L1 + L4 + L6 docs entries simultáneamente — sequencing dependency"). Listar 3-5 cross-impacts críticos.

#### 3. Sequencing rationale

¿En qué orden se deben atacar los ADRs + remaining OQs? ¿Por qué? Justificar dependencies.

#### 4. Risk-weighted prioritization

Top 3 risks post-discovery con mitigation status (firm in brief vs deferred a downstream vs unresolved).

#### 5. Handoff packets per downstream phase

Qué necesita cada fase downstream:

- **`/proposal`:** scope locked + commercial terms ready?
- **`/design`:** §11 Visual Direction Seeds + design system strategy + reference assets inventory + ADR queue + Tier L state-spec hints
- **`/backlog`:** SK leverage % + descope plan triggers + critical path features first + golden fixtures list

#### 6. Plan de cierre Phase 8 (action items — compact default)

```markdown
## 🛑 CP2 — Pre-Close Review

### Quantitative gate

FT {X/Y} · BR {X/Y} · Entities {X/Y} · Pantallas {X/Y} — ✅ / 🔴

### Challenge Pass + Gap Round 2

architect {✅/⚠️/🔴} · PO {✅/⚠️/🔴} · planner {✅/⚠️/🔴}
Stakeholder decisions resolved: {N/M}
ADRs identificados: {N}

### Drift Report

{items vs source: harmless / risky / unauthorized count}

### Plan de cierre

1. Brief canónico ya existe (escrito directo en Phase 6) — verificar path
2. Generar `project-config.md` con BR-PROJECT-001 hardcoded
3. Cleanup transitionals (batch files + explore-pass/ subdirectory) **y borrado de `§Resolved During Discovery` del brief** (Phase 8 paso 3 — el rastro queda en git + `_audit/challenge-pass.md`)
4. Retention durable consolidados en `project/planning/`
5. Surface factory-tickets si hay
6. Offer user: recopilar notas externas para factory-tickets
7. NO commit (GIT.md §2 requiere autorización explícita)
```

**Verbose mode:** ampliar cada sección con detalle (debugging / deep-review only).

---

## Phase 8 — Close (post-approval)

**Pre-requisito:** CP2 aprobado via `ExitPlanMode` (Plan Mode formal — ver CP2 §Mecanismo).

**Acciones:**

1. **Brief canónico ya escrito en Phase 6** (`project/planning/00_DISCOVERY_BRIEF.md`) — verificar que existe + último contenido refleja CP2 approved. Si Phase 7.5 corrió post-CP2 (raro), re-write una vez más in-place.

2. **GR2-traceability check (precondición pre-stripping):** for every Gap Round 2 stakeholder decision resolved during Phase 7.4, verify it is reflected as a Firm in the brief proper (in §1, §3, §6, etc.) AND/OR as a Firm row in `project/planning/01_FREEZE_MAP.md`. If any GR2 decision exists ONLY in the brief's `§Resolved During Discovery` section (journey form) → elevate it to Firm form FIRST. Without this check, the next stripping step would erase the decision.

3. **Strip workflow-history narrative from durable artifacts** (post-CP2-approval, pre-archival):
   - **Brief:** delete the entire `§Resolved During Discovery` section. Audit trail of how decisions arrived is preserved in git log + `challenge-pass.md` (now archived per step 5).
   - **`project/planning/01_FREEZE_MAP.md`:** collapse `§Phase 3 Resolutions` and `§Phase 7 GR2 Resolutions` into a single line: `> Last canonical update: {date} post {phase}. Full audit trail in challenge-pass.md (archived).`
   - **`project/planning/decisions/ADR-*.md`:** per-file tracking issues (type: adr). NO single-file queue; cada ADR es un file separado con frontmatter (`status`, `change_cost`, `alternatives_considered`). Phase 8 stripping no aplica al directorio `decisions/` (durable working state).
   - **`project/planning/03_DEEP_DIVE.md` Tier L entries:** drop the `> Sub-ronda captured: Q1=A · Q2=A · Q3=C` header lines. Replace with `> ADRs flagged: ADR-X, ADR-Y, ADR-Z` if ADRs were emitted; otherwise drop entirely.

4. **Generar project-config.md + Authorization Model Lock keyword scan** usando templates:
   - **🔴 Frontmatter YAML gate (HARD FAIL · pre-write):** primer bloque del archivo DEBE ser `---` + YAML válido + `---`, con TODOS los required fields per [`templates/project-config.template.md` §"Frontmatter YAML (OBLIGATORIO)"](templates/project-config.template.md): `project`, `client`, `stakeholder`, `project_type`, `structure_version: '2.0'`, `locale`, `timezone`, `sk_active`, `design_system`, `stack`, `deadline`. Si cualquier campo missing → re-emit antes de continuar. Verificación: la primera línea de `project/planning/project-config.md` (tool **Read**, limit: 1) == `---` AND parse-YAML del bloque retorna los 11 keys. NO proceder al body si la gate falla; corregir el frontmatter primero.
   - §8.1 Stakeholders + §8.2 Team members OBLIGATORIOS
   - §10 incluye `BR-PROJECT-001` hardcoded
   - §14 Delivery Model **sin currency** (eso es `/proposal`)
   - Pipeline Status: Discovery ✅, Design/Backlog/Code ⬜ (per `PIPELINE_CURRENT_TRUTH §1` cadena real — proposal y docs api/data-model son on-demand off primary path, NO listar en tabla)
   - **🔴 Authorization Model Lock keyword scan (HARD FAIL):** scan `project/planning/05_RBAC_MATRIX.md §"Authorization Model Lock"` keyword-by-field per `methodology/rbac-matrix.md §7`. Fields scoped:
     - `Canonical roles` / `Scope model` / `Role derivation rules` → fail si contiene `tentative`, `hypothesis`, `?`, `unclear`, `TBD` (case-insensitive). `Canonical roles` adicionalmente fail en `3 vs 4`, `deprecated`.
     - `Forbidden states` → **whitelist** — NO scan keywords; "deprecated role cannot access X" es legítimo aquí.
     - `Route ACL source` / `Server-side scope helper` → fail si empty.
       Si fail → orchestrator imprime el field + keyword + línea; user resuelve (Gap Round local OR DECISION-XXX OR mover phrasing legítimo a `Forbidden states`).

5. **Archive audit-only artifacts + cleanup transitional artifacts** (orchestrator ejecuta inline post-step-3 stripping):

   **5a.** Mueve los 3 audit artifacts (`challenge-pass.md`, `cross-file-reconciliation.md`, `explore-pass.md`) a `project/discovery-artifacts/{run-id}/_audit/` (audit trail preservado, fuera del path consumido por downstream phases).

   **5b.** Elimina los batch intermedios `deep-dive-batch-*.md` (ya concatenados a `project/planning/03_DEEP_DIVE.md`).

   **5c.** Elimina el subdirectory `project/discovery-artifacts/{run-id}/explore-pass/` (per-agent reports ya consolidados a `_audit/explore-pass.md`).

   **5d.** Cleanup del `{run-id}/` preservando `_audit/` + flag check `--keep-artifacts` (orden importa: el move-to-`_audit/` de 5a debe completarse ANTES de este sweep, sino el `find ! -name '_audit'` borraría los 3 audit artifacts que aún no se movieron):

   ```bash
   # Pre-condiciones (contrato del orchestrator):
   #   ${ARGUMENTS}  — args del slash command (puede estar vacío)
   #   ${RUN_ID}     — timestamp+slug generado en Phase 0. Guard defensivo abajo
   #                  previene catástrofe si la invariante falla por bug futuro.
   [ -n "${RUN_ID}" ] && [ -d "project/discovery-artifacts/${RUN_ID}" ] || exit 0

   if echo "${ARGUMENTS:-}" | grep -qE '(^|[[:space:]])--keep-artifacts([[:space:]]|$)'; then
     echo "ℹ️  artifacts del run ${RUN_ID} conservados completos (--keep-artifacts)"
   else
     # Cleanup parcial: borra todo en {run-id}/ excepto _audit/ (poblado en 5a)
     find "project/discovery-artifacts/${RUN_ID}" -mindepth 1 -maxdepth 1 \
       ! -name '_audit' -exec rm -rf {} +
     echo "🧹 ${RUN_ID} transitional limpiados; _audit/ preservado"
   fi
   ```

6. **Retention policy:** durables consumed by downstream phases (`/design`, `/backlog`, `/implement`) live in `project/planning/` + `project/planning/decisions/`. Factory-tickets are durable too but belong to ANOTHER lifecycle — they live in `project/factory/`, are consumed by `factory ticket push` rather than by any downstream phase, and travel in their own commit (`GIT.md §3.5.1`). Audit-only artifacts live in `project/discovery-artifacts/_audit/` (preserved for retroactive audit but not loaded by downstream agents).

7. **Factory-tickets surface:** si hay `intake-drift` / `sk-drift` / `workflow-drift` candidates en `project/factory/` → mostrar resumen al user ("📩 N tickets en `project/factory/*.md`"). Workflow-drift candidates requieren confirmation explícita del user antes de emitir.

8. **Offer notes harvest:** preguntar al user "¿Quieres compartir tus notas externas para factory-ticketizar gaps reales del workflow?" — opt-in. Si sí → user pasa notas inline → orchestrator las procesa y emite tickets correspondientes.

9. **Cierre — `CP-commit`** (`GIT.md §3.5`): ofrecer al user `1. nada / 2. commit / 3. commit + push`. `git add` de los durables (`project/planning/` + `project/planning/decisions/`), subject `docs(discovery): …`, sin push salvo opción 3. Guard de main + degrade headless a opción 2 por `GIT.md §3.5`.
   🔴 **Si los pasos 7-8 emitieron factory-tickets, van en un SEGUNDO commit** `docs(factory): …` sobre `project/factory/` — nunca dentro del `docs(discovery):`. `GIT.md §3.5.1` es el SSOT. Sigue siendo **un** CP-commit: la opción que eligió el user aplica a los dos. Sin tickets emitidos, no hay segundo commit.

---

## Archivos de output

### Durable — consumed by downstream phases (`/design`, `/backlog`, `/implement`)

| Path                                                 | Lifecycle                                                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project/planning/00_DISCOVERY_BRIEF.md`             | **Durable** — SSOT primario downstream (escrito directo en Phase 6)                                                                                            |
| `project/planning/project-config.md`                 | **Durable** — config always-on                                                                                                                                   |
| `project/planning/01_FREEZE_MAP.md`                  | **Durable** — firm decisions trazables                                                                                                                           |
| `project/planning/02_PERSONAS.md`                    | **Durable** — personas PER-XXX + JTBD + access context                                                                                                           |
| `project/planning/03_DEEP_DIVE.md`                   | **Durable** — 8-fields FT specs consumidas por `/design` + `/backlog`                                                                                              |
| `project/planning/04_ARCHITECTURE.md`                | **Durable** — topology + SK delta + module boundaries + integration contracts + cache posture                                                                    |
| `project/planning/05_RBAC_MATRIX.md`                 | **Durable** — entity/route resources × canonical actions                                                                                                         |
| `project/planning/06_ACCEPTANCE_SCENARIOS.md`        | **Durable** — Gherkin scenarios con refs FT/BR/F/ENT/US/PER                                                                                                      |
| `project/planning/07_SK_LEVERAGE.md`                 | **Durable** — kit leverage map para `/backlog` (always present; N/A si `sk_active=false`)                                                                        |
| `project/planning/08_GLOSSARY.md`                    | **Durable** — glosario incremental de dominio                                                                                                                    |
| `project/planning/09_DATA_MODEL.md`                  | **Durable** — full per-entity schema tables + Mermaid ER + enums (Fase-1, emitted Phase 6.1 step 2 from shared registry)                                         |
| `project/planning/10_API_SURFACE.md`                 | **Durable** — server actions surface + route handlers surface + error codes catalog (Fase-1, emitted Phase 6.1 step 3 from shared registry)                      |
| `project/planning/11_CLIENT_QUESTIONS.md`            | **Durable** — subset client-owned OQs (filtered view of 13). Producer: Phase 6.3 step 3. Stakeholder Q&A pre-`/design`.                                          |
| `project/planning/12_BACKLOG_READINESS.md`           | **Durable** — per-FT roll-up (Status + Blocking ID + decision/spike to unblock + aggregate `Backlog can proceed`). Producer: Phase 6.3 step 5.                   |
| `project/planning/13_OQ_BY_FT_MATRIX.md`             | **Durable** — operational matrix `OQ × FTs blocked × Owner × Consumer × Default × Deadline × Tracking`. Producer: Phase 6.3 step 2.                              |
| `project/planning/14_DOMAIN_REGISTRY_LOCKS.md`       | **Durable** — registries de dominio (reports/cron/roles/navigation/movement-types/KPIs) locked o partial. Producer: Phase 6.3 step 4.                            |
| `project/planning/15_IMPLEMENTATION_PACKETS/FT-*.md` | **Durable** — per-FT self-contained handoff packets (one file per Tier S/M/L FT). Source-of-truth hierarchy: 03_DEEP_DIVE > 12 > 16. Producer: Phase 6.3 step 6. |
| `project/planning/decisions/ADR-*.md`                | **Durable** — ADRs flagged at Phase 4c sub-ronda time (change_cost=high), drafted inline (`architect`), consumed by `/design`                                                   |
| `project/factory/*.md`                               | **Durable** — factory-tickets. `{type}` es un slug kebab-case libre; `intake-drift`, `sk-drift` y `workflow-drift` son los tres que los **agentes emiten solos** (`fx-factory-tickets §3`)                    |

### Audit-only — archived at Phase 8 close (preserved for retroactive audit, NOT loaded by downstream agents)

| Path                                                              | Lifecycle                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `project/discovery-artifacts/_audit/challenge-pass.md`            | **Audit-only** — Phase 7 findings + 3-agent verdicts (moved here at Phase 8 step 5)         |
| `project/discovery-artifacts/_audit/cross-file-reconciliation.md` | **Audit-only** — Phase 1.2.5 polished-vs-raw drift detection (moved here at Phase 8 step 5) |
| `project/discovery-artifacts/_audit/explore-pass.md`              | **Audit-only** — consolidated per-file extraction trail (moved here at Phase 8 step 5)      |

### Transitional — cleaned at Phase 8 close

| Path                                               | Lifecycle                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `project/discovery-artifacts/explore-pass/*`       | **Transitional** — per-agent intake reports (eliminados al cierre de Phase 8) |
| `project/discovery-artifacts/deep-dive-batch-*.md` | **Transitional** — batch intermedios (eliminados al cierre de Phase 8)        |

---

## Invalidation handling cross-phase

### Source-arrival post-CP1 (incremental intake)

If new source material arrives after CP1 has been presented (e.g., the user obtains additional documents from a stakeholder mid-Phase-3), the orchestrator computes the impact on the existing freeze-map BEFORE deciding how to incorporate it:

1. **Compute delta:**
   - `new_firms_to_add` + `firms_to_modify` + `firms_to_remove`
   - `new_OQs_introduced` + `OQs_to_resolve` (from new evidence)
   - `new_contradictions` + `contradictions_to_resolve`
   - `delta_pct = total_changes / current_freeze_map_firm_count`

2. **Apply threshold-based decision:**
   - **`delta_pct < 30%`** → orchestrator does in-place patch (`Edit` tool on `project/planning/01_FREEZE_MAP.md` directly): append new Firms, move resolved OQs to a new `§Phase 3 Resolutions` row, update specific Contradictions. No agent re-dispatch. Typical cost: 2-3 minutes orchestrator work.
   - **`delta_pct >= 30%`** → STOP and prompt the user:

     ```
     Source nuevo afecta {X%} del freeze-map (umbral 30%).
     Above this threshold, in-place patches risk inconsistencies between Firms.

     Recommend re-running Phase 2 from scratch (`dsc-freeze-map-extractor` regen, ~10 min agent compute) for a coherent freeze-map.

     Procedo con regeneración completa, o prefieres patch incremental (con riesgo de inconsistencia)?
     ```

   - User decides. The threshold (30%) is heuristic; the user override is authoritative.

3. **After patch or regen:** re-run cross-file reconciliation (Phase 1.2.5) ONLY if `N(source files)` is now ≥ 2. Update `cross-file-reconciliation.md` accordingly.

### Firm-vs-resolution invalidation

Si orchestrator detecta que una resolution downstream invalida un Firm upstream (ej: Phase 4 Tier L sub-ronda revela Firm F-N del Freeze Map era incorrecto):

**Detección objetiva:** re-read del Firm citado vs nueva resolution. Si contradicen literal → invalidation confirmed.

**Prompt al user (nunca automático):**

```
⚠️ Contradicción detectada entre Firm F{N} (Phase 2) y resolution en Phase {X}.

F{N}: {quote}
Phase {X} reveals: {evidence}

Opciones:
1. Backtrack → regresar a Phase 2, update Firm F{N}, re-run Phase 3-{X}
2. Override → mantener Firm, documentar dissent en §Drift Report del brief
3. Resolve now → proponer nueva Firm F{N}', re-run solo Phase {X} con contexto actualizado
```

User decide. Si backtrack → orchestrator salta a Phase 2 con invalidation flag + cambios aplicados + re-corre phases intermedias.

---

## Subagent delegation (resumen)

| Fase | Subagent                                                               | Paralelismo                                                | Cuándo                                                                                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `dsc-intake-analyst` (N parallel ≤20)                                  | Paralelo (cap 20) — batching determinístico per-agent caps | Siempre                                                                                                                                                                                                                                                               |
| 2    | `dsc-freeze-map-extractor`                                             | Serial                                                     | Siempre                                                                                                                                                                                                                                                               |
| 4b   | `dsc-feature-specer` (N parallel per batch)                            | Paralelo                                                   | Siempre (Tier S/M only)                                                                                                                                                                                                                                               |
| 5    | `dsc-kit-analyst`                                                      | Serial                                                     | Solo si SK_ACTIVE=true                                                                                                                                                                                                                                                |
| 6    | _(none — orchestrator-direct Write)_                                   | —                                                          | Synthesis sin agent spawn                                                                                                                                                                                                                                             |
| 7    | `architect` + `product-owner` + `project-planner` + `skeptical-client` | Paralelo                                                   | Siempre · `architect` consume `project/planning/decisions/ADR-*.md` (filter type: adr, status: proposed) — valida y **emite el veredicto** `accepted`/`rejected` (el `status:` lo escribe el orquestador — `architect` es read-only), NO redescubre · `skeptical-client` review `00 + 04` desde lente cliente (override mode — NO commercial/ROI) |

**Agents scoped a `/discovery` tienen prefix `dsc-*`** per convención de taxonomy (ver CLAUDE.md §Convenciones). Generic agents (architect/PO/planner) no llevan prefix.

---

_TimeKast Factory — tk-discovery workflow (documentation family)_
