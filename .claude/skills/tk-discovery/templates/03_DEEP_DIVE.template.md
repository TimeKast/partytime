# Deep-Dive — {{project}}

> **Produced by:** `dsc-feature-specer` agents (Phase 4b, paralelos) + main orchestrator (Phase 4c Tier L dedicated sessions).
> **Consumed by:** `dsc-kit-analyst` (Phase 5), main orchestrator at Phase 6 (synthesis), `/docs` + `/implement` phases downstream.
> **Schema canónico:** [`methodology.md §11`](../methodology.md) (8 fields per-feature).
>
> **Architectural rule for `Rules` field:** when populating BR refs in Rules, the F-code referenced at the END of each BR DEBE include parenthesized 1-line meaning (`(F{N}: {what it locks})`). Bare F-codes force `/implement` consumers to grep `01_FREEZE_MAP.md` for basic semantic. Self-contained at citation site = single-pass per /implement task.

**Run date:** {{YYYY-MM-DD}}
**Feature count:** {{N FTs total}} · {{S}} Tier S · {{M}} Tier M · {{L}} Tier L

---

## Tiering classification (Phase 4a output)

<!-- Tabla de clasificación que sale de Phase 4a. Guía cómo se procesa cada feature en 4b/4c:
     - Tier S = SK-trivial (Configure), 1-fila compact (no 8-fields)
     - Tier M = Extend (kit base + custom), 8-fields estándar
     - Tier L = Build custom (irreversible, state-machine-worthy), 8-fields + sub-ronda clarificación con user

     Columna MoSCoW = prioridad de NEGOCIO por feature, ORTOGONAL al Tier de complejidad S/M/L
     (un Tier S puede ser `must` y un Tier L `could`). Es un campo ADICIONAL — no reemplaza el Tier.
     La deriva `dsc-feature-specer` del freeze-map (NO se infiere aguas abajo):
     - Firm / MVP → `must` (core del release) o `should` (importante, no bloqueante del MVP)
     - matiz / refinamiento → `could`
     - Post-MVP → su prioridad eventual (`must` / `should` / `could`); NUNCA se degrada a "won't" automáticamente
       (Post-MVP = "no en este release", no "no lo haremos")
     - sin señal derivable del freeze-map → `—`
     Valores válidos: `must` | `should` | `could` | `—` (nunca "won't"). El consumidor downstream
     `bkl-context-analyst` (/backlog) lee esta columna per-FT. Un deep dive legacy SIN la columna → el
     consumidor degrada a `—` sin crashear (tolerancia ya declarada en `bkl-context-analyst`). -->

| FT-ID | Nombre             | Tier | MoSCoW | Razón                                                        |
| ----- | ------------------ | ---- | ------ | ------------------------------------------------------------ |
| FT-01 | {{Auth triple}}    | S    | must   | SK ships end-to-end, feature-flag level                      |
| FT-11 | {{Scoring engine}} | L    | should | Build custom, schema-level decisions, needs /docs state spec |

---

## Tier S features (compact 1-row)

<!-- Solo nombre + SK skill ref + 1-línea descripción. 8-fields overkill aquí. -->

| FT-ID | Feature                                            | SK skill      | 1-línea                                             |
| ----- | -------------------------------------------------- | ------------- | --------------------------------------------------- |
| FT-01 | Auth triple (password + magic-link + Google OAuth) | `sk-security` | Plug NextAuth providers, env-gated, no custom logic |

---

## Tier M features (8-fields compact)

### FT-{{NN}} — {{Feature name}}

| Field                | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Happy**            | {{Flujo principal step-by-step}}                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Edge**             | {{Error/edge cases + cómo se manejan. Si ≥3 estados → usar sub-bullets numerados.}}                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Auto/manual**      | {{Qué dispara auto vs manual user action}}                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Ref**              | {{App similar o screenshot o doc referenciado}}                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Users**            | {{Roles RBAC que interactúan + permisos}}                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Data**             | {{Per entidad afectada: full structured fields (campo / tipo PostgreSQL / nullable / default / descripción) + índices propuestos + constraints (FK, UNIQUE, CHECK). NO "sketch" — captura completa. Phase 6.1 agrega 09_DATA_MODEL desde aquí.}}                                                                                                                                                                                                                                           |
| **Rules**            | {{BR-IDs aplicables (BR-{DOMAIN}-{NN} format) con 1-line summary cada uno. F-code citado al final con paréntesis explicit: `(F{N}: {what it locks})`. Ejemplo: `BR-LB-01 email NEVER in leaderboard payload (F110: fairness invariant — pii nunca en endpoint público)`.}}                                                                                                                                                                                                                 |
| **Action contracts** | {{Por cada server action o route handler del feature: `action_name(input)` signature · Path (`src/lib/actions/{domain}/{action}.ts` o `src/app/api/{path}/route.ts`) · RBAC (`withAuth({...})` config o `withSelf` o `public`) · Input Zod schema literal · Output `ActionResult<DataShape>` con `DataShape` definido · Errors emitted (code + HTTP + user message) · Side effects (`revalidatePath`, `notify`, `audit_events INSERT`, etc). Phase 6.1 agrega 10_API_SURFACE desde aquí.}} |
| **Layout impact**    | `true` \| `false` — ¿esta feature requiere layout custom (panel lateral nuevo, wizard multi-step, columna de tabla con render custom, split view) vs. layout default que ya shippea el kit? Si es Configure puro sobre primitivas existentes → `false`. Si requiere reshape estructural → `true`. Consumido por `tk-design` Phase 4 (SCR classification) — `true` fuerza tier `custom` aunque sea Configure-heavy. **Default si no aplica:** `false`.                                      |

---

## Tier L features (8-fields compact + §0 Plain Language + §8 CALC + §9 State Machine inline en slot template)

### FT-{{NN}} — {{Feature name}} (compact pre-slot)

> El slot template detallado (con §0 + §8 + §9) está más abajo. Esta tabla compact es overview pre-detail.

| Field                | Detalle                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Happy**            | {{Flujo principal}}                                                                                                                                                                                                                            |
| **Edge**             | {{Estados + transiciones como bullets de alto nivel. Full state machine en §9 del slot template.}}                                                                                                                                             |
| **Auto/manual**      | {{Triggers}}                                                                                                                                                                                                                                   |
| **Ref**              | {{Reference doc / source §}}                                                                                                                                                                                                                   |
| **Users**            | {{Roles}}                                                                                                                                                                                                                                      |
| **Data**             | {{Per entidad afectada: full structured fields (campo / tipo PostgreSQL / nullable / default / descripción) + índices + constraints (FK + UNIQUE + CHECK + RAISE EXCEPTION triggers). Full detail en §3 del slot template. NO defer a /docs.}} |
| **Rules**            | {{BR-IDs críticas con 1-line summary cada uno + F-code parenthesized inline al final (`(F{N}: {meaning})`). Self-contained — `/implement` no debe forzar grep a freeze-map.}}                                                                  |
| **Action contracts** | {{Per server action o route handler: signature + path + RBAC + Zod input literal + Output ActionResult + Errors + Side effects. Full detail en §4.5 del slot template.}}                                                                       |
| **Layout impact**    | `true` \| `false` — ¿requiere layout custom (Tier L casi siempre `true` por definición — reshape estructural)? Consumido por `tk-design` Phase 4. Si Tier L con `false` justificar en una línea (raro).                                        |

**⚠️ Needs /docs elaboration (lo que sí queda para `/docs` workflow downstream):**

- [ ] Golden fixtures spec (per-format/per-scenario)
- [ ] Sequence diagrams para flujos críticos multi-actor (3+ actores en interacción async)
- [ ] {{otros hints específicos de esta feature}}

> **Items ya inline en este artifact (NO defer a /docs):**
>
> - State machine diagram → §9 del slot template (cuando aplica per detection rules)
> - API contract derivado de schema → §4.5 Action contracts + agregado en 10_API_SURFACE
> - Algorithm spec (CALC formulas) → §8 del slot template (cuando aplica per detection rules)
> - Schema completo per entidad → §3 del slot template

**Phase 4c sub-ronda clarifications resueltas (user-validated):**

- Q-L{{N}}.{{n}} `[change_cost: {{high|medium|low}}]` → ({{a/b/c/d}}) {{user response}}
  {{si change_cost=high → flagged as ADR-{{NN}} en `project/planning/decisions/ADR-{{NN}}.md` (type: adr, status: proposed)}}

---

## Tier L entry slots (parametrized — orchestrator fills from sub-ronda Q-As + ADR queue + freeze-map firms)

> Use this template for Tier L entries written in Phase 4c. **§0 + §1** require genuine prose synthesis; **§2-§7** fill from structured inputs; **§8 CALC + §9 State Machine** are detection-gated (mandatory si feature matchea trigger keywords listadas abajo, omitible con nota N/A si no aplica). Slot `{{free-text-expand-here}}` available within any section if a feature has nuance the structure can't capture.

```markdown
## FT-{{ID}} — {{Title}} (Tier L · L{{N}})

> **ADRs flagged:** ADR-{{XX}}, ADR-{{YY}}, ADR-{{ZZ}}
> **Inherits from:** {{parent FT name(s) + which decisions cascade to this feature}}
> **Consumed by:** {{child FT name(s) + how they consume this feature}}

### 0. Plain Language Summary

<!-- 2-3 párrafos accesibles. NO jergón técnico (no "polymorphic", "idempotent eval", "lockdown enforcement layer", "discriminated union", "advisory lock"). Audience: developer mid-level que NO leyó freeze-map ni ADRs. Si feature involucra mecánica de dominio, explicar la mecánica como si fuera para un PO no-técnico.

Ejemplo: en vez de "polymorphic pick payload with parent_pick_id reference", escribir "cuando el usuario hace una predicción, queda guardada hasta que el partido empieza; en algunos torneos puede ligar 2 predicciones del mismo juego (over/under + against-the-spread)". -->

{{plain-language synthesis 2-3 párrafos sin jergón}}

### 1. What this feature establishes

<!-- 1-2 paragraphs of synthesis explaining the feature's purpose + why it's Tier L (architectural blast radius). This is the technical version del §0. -->

{{prose synthesis}}

### 2. Acceptance criteria (high-level)

<!-- Bullets derived from sub-ronda answers + freeze-map firms. Reference ADRs inline. -->

- {{AC bullet}} `[{{F-code or ADR ref}}]`
- {{AC bullet}}
- {{AC bullet}}
  {{free-text-expand-here}}

### 3. Data model deltas (full — NOT sketch)

<!-- Per entidad afectada: full structured table + índices + constraints. NO defer a /docs.
     Phase 6.1 builds shared registry desde aquí + agregates 09_DATA_MODEL.
     Pseudo-PostgreSQL syntax accepted (tipos canonical + nullable/default explicit). -->

#### Entity: `{{table_name}}`

| Campo     | Tipo PostgreSQL | Nullable  | Default           | Descripción |
| --------- | --------------- | --------- | ----------------- | ----------- |
| id        | uuid            | ❌        | gen_random_uuid() | PK          |
| {{campo}} | {{tipo}}        | {{✅/❌}} | {{default}}       | {{1-line}}  |

**Índices:**

- `{{table}}_pkey` PRIMARY KEY (id)
- `{{table}}_{{col}}_idx` btree ({{col}})
- ... (UNIQUE, GIN, partial indexes as needed)

**Constraints:**

- FK ({{col}}) → {{other_table}}({{other_col}})
- CHECK ({{condition}})
- BEFORE UPDATE trigger: RAISE EXCEPTION '{{error_code}}' si {{condition}}

{{repeat per affected entity}}
{{free-text-expand-here}}

### 4. Dependencies + downstream feature consumption

<!-- Compact table or graph. Auto-fillable from cross-feature context. -->

- **{{FT-X}}** — {{how this feature is consumed}}
- **{{FT-Y}}** — {{how this feature is consumed}}

### 4.5. Action contracts

<!-- Per server action or route handler: signature + path + RBAC + Zod input literal + ActionResult output + errors + side effects.
     Phase 6.1 builds shared registry desde aquí + agregates 10_API_SURFACE. -->

#### `{{actionName}}(input)`

- **Path:** `src/lib/actions/{{domain}}/{{action-file}}.ts` (o `src/app/api/{{path}}/route.ts`)
- **RBAC:** `withAuth({ resource: '{{ent}}', action: '{{verb}}', schema, revalidate })` (o `withSelf` o `public` o `CRON_SECRET`) — el scope own/team/global NO es param; se realiza en el handler (`withSelf` / ownership-check)
- **Input (Zod schema literal):**

  \`\`\`typescript
  z.object({
  {{field}}: z.{{type}}().{{constraints}},
  ...
  })
  \`\`\`

- **Output:** `ActionResult<{{DataShape}}>` con `{{DataShape}} = { ... }`
- **Errors emitted:**
  - `{{ERROR_CODE_1}}` (HTTP {{422|403|404}}) — {{cuándo}} → user message: "{{texto}}"
  - `{{ERROR_CODE_2}}` (HTTP ...) — ...
- **Side effects:** `revalidatePath('{{path}}')`, `notify({{...}})`, `audit_events INSERT`, etc.

{{repeat per server action}}

#### Route handlers (si aplica)

- **`{{METHOD}} {{path}}`** — auth: {{strategy}} · input: {{shape}} · output: {{shape}} · errors: {{list}}

### 5. SK leverage hints (for Phase 5)

<!-- Bullets per sk-* skill referenced. Prospective if no derived repo yet. -->

- **`{{sk-skill-name}}`** — {{how used / what's leveraged}}
- {{drift expected vs sk-features-index}}

### 6. Edge cases / OQs deferred to /docs

<!-- Bullet list of remaining open questions for /docs phase. -->

- {{OQ statement}}
- {{OQ statement}}
  {{free-text-expand-here}}

### 7. Risks + adjacent decisions

<!-- H1/H2/M1 risks derived from sub-ronda Qs tagged HIGH-change_cost. Each: 1-2 sentences. -->

- **Risk H1 (HIGH):** {{1-2 sentence concern + mitigation reference}}
- **Risk H2 (HIGH):** {{...}}
- **Risk M1 (MEDIUM):** {{...}}
  {{free-text-expand-here}}

### 8. CALC formulas

<!-- DETECTION-GATED MANDATORY:
     Required cuando feature involucra: scoring / pricing / eligibility / ranking /
     normalization / allocation / recommendation / threshold / fee computation /
     interest / discount / quota / score calculation / weighted average / margin.

     Si NO aplica → reemplazar contenido entero con: `<!-- N/A — feature sin algoritmos deterministicos -->`

     Quantitative gate FAIL si feature matchea keywords AND sección omitida sin N/A justified. -->

#### CALC-{{NN}}: {{nombre del cálculo}}

- **Descripción:** {{1-línea}}
- **Cuándo se ejecuta:** {{trigger — eg post-event, cron, on-demand}}
- **Pseudo-código o TS-snippet:**

  \`\`\`typescript
  function {{calcName}}(input: {{Type}}): {{ReturnType}} {
  // {{steps}}
  }
  \`\`\`

- **Inputs:**

  | Variable | Tipo     | Descripción |
  | -------- | -------- | ----------- |
  | {{var}}  | {{type}} | {{desc}}    |

- **Output:** {{type}} · Rango: {{range}}

- **Ejemplos:**
  - Input: `{{example_input}}` → Output: `{{example_output}}` ({{razón}})
  - Input: `{{...}}` → Output: `{{...}}`
  - Input: `{{...}}` → Output: `{{...}}` (edge case)

{{repeat per CALC-XX}}

### 9. State Machine

<!-- DETECTION-GATED MANDATORY:
     Required cuando feature involucra: status enum / transition / lock / lifecycle /
     deadline / eligibility-window / approval-flow / re-entry / activation / freeze /
     publish / archive / cancel / state lock.

     Si NO aplica → reemplazar contenido entero con: `<!-- N/A — feature sin states -->`

     Quantitative gate FAIL si feature matchea keywords AND sección omitida sin N/A justified. -->

**Diagram (ASCII — no mermaid, más portable for AI consumer):**

\`\`\`
{{state-A}} ──{{trigger}}──▶ {{state-B}} ──{{trigger}}──▶ {{state-C}}
│
{{trigger}}
▼
{{state-D}}
\`\`\`

**Transitions table:**

| From        | To          | Trigger           | Conditions                                  | Reversible? | Error si falla |
| ----------- | ----------- | ----------------- | ------------------------------------------- | ----------- | -------------- |
| {{state-A}} | {{state-B}} | {{event/action}}  | {{precondiciones — count, role, time, etc}} | ✅/❌       | {{ERROR_CODE}} |
| {{state-B}} | {{state-C}} | {{...}}           | {{...}}                                     | ❌          | {{ERROR_CODE}} |
| {{state-B}} | {{state-D}} | {{cancel/reject}} | {{...}}                                     | ❌          | —              |

{{free-text-expand-here}}
```

> **Filling discipline:**
>
> - **§0 Plain Language Summary** + **§1 What this feature establishes** son las únicas secciones que requieren genuine prose. §0 sin jergón; §1 técnico OK.
> - **§2-§4, §4.5, §6, §7** mostly auto-derive from inputs (sub-ronda answers, ADR queue, freeze-map firms, cross-feature dependencies, action signatures captured durante 4c).
> - **§5** references `sk-*` skills by name; verify with `sk-features-index` before locking.
> - **§8 CALC + §9 State Machine** detection-gated. Orchestrator scans feature description + 8-fields entries + ADRs against keyword lists pre-emit. Si match → required. Si NO match → reemplazar contenido con N/A nota explícita.
> - Resist filling slots with prose-from-scratch when structured inputs exist.

---

## Business Rules introducidas

<!-- Enumeración completa de BRs surfaced en todos los FT entries.
     Format: BR-{DOMAIN}-{NN}. Domains: AUTH, ID, DUMMY, INV, SINV, TRN, OFF, FMT,
     PICK, LOCK, AP, CANCEL, SCORE, LB, BD, AUTO, NOTIF, ADM, UM, ADS, SURV, RT, etc.
     NO reducir a "top 5-10" — enumerar completo. /docs elabora sin re-descovery. -->

| BR-ID      | Regla             |
| ---------- | ----------------- |
| BR-AUTH-01 | {{regla literal}} |

---

## Factory-ticket candidates (workflow-drift)

<!-- Si el Edge bucket de un FT Tier L excede 500 chars, O si ≥2 FTs Tier L requieren
     diagrams que el 8-fields no captura — surface como candidate `workflow-drift` ticket.
     Orchestrator decide emitir en Phase 8 con user approval. -->

| FT-ID | Trigger | Evidence |
| ----- | ------- | -------- |
|       |         |          |

---

## Completeness Gate

| Check                                                                                                   | Result      |
| ------------------------------------------------------------------------------------------------------- | ----------- |
| Tier S features: nombre + SK skill ref + 1-line descripción presentes                                   | PASS / FAIL |
| Tier M features: 8-fields compact completos por FT (Data + Action contracts + Rules + Users + Edge + …) | PASS / FAIL |
| Tier L features: 8-fields + §0 Plain Language Summary + §3 full data model + §4.5 Action contracts      | PASS / FAIL |
| Tiering classification: columna MoSCoW poblada por FT (`must`/`should`/`could`/`—`, derivada del freeze-map)   | PASS / FAIL |
| CALC formulas + State Machine inline en Tier L cuando keyword-gated (scoring/transition/lock/lifecycle) | PASS / FAIL |
| BR refs llevan `(F{N}: {what it locks})` parenthesized meaning inline                                   | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions |
| ------------ | ------------------------------- | ------------------ |
| `/design`    | `ready` / `partial` / `blocked` | —                  |
| `/backlog`   | (idem)                          |                    |
| `/implement` | (idem)                          |                    |

### Notes

{{Si status=partial per FT: lista qué FT está bloqueado y por qué (DECISION/SPIKE/ADR ID). Ejemplo: `FT-07 partial: ADR-002 (scoring engine algorithm) pending`.}}

---

_TimeKast Factory — Deep-Dive (tk-discovery Phase 4 · tiered by complexity)_
