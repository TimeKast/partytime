# Data Model — {{project}}

> **Produced by:** main orchestrator (Phase 6.1 step 2 — registry-first synthesis).
> **Consumed by:** `/design` (form data shapes), `/backlog` (issue refs por ENT), `/implement` (Drizzle schemas + migrations literal).
> **Schema canónico:** este template ES el schema — no hay doc metodológico adicional en el kit; el detalle se define inline en el documento.
> **Path canónico:** `project/planning/09_DATA_MODEL.md`.
>
> **Source aggregation:** built from shared registry in Phase 6.1 step 1. Inputs: brief §4.1 ENT-XXX skeleton + ADRs schema decisions + 03_DEEP_DIVE Tier M `Data` field (full per Fase-1) + 03_DEEP_DIVE Tier L slot template §3 (full data model) + 01_FREEZE_MAP §Firm Decisions Enforcement column (DB-level firms surfaceadas aquí).
>
> **NO new info inventada** — pure restructure desde existing artifacts. Si una columna o constraint aparece aquí pero NO en upstream artifacts, es bug del flujo de captura — fix upstream antes de re-emit.

**Run date:** {{YYYY-MM-DD}}

---

## §1 ER Diagram

> Built from shared registry. SAME source que `00_DISCOVERY_BRIEF.md §4.2` (single SSOT — no circular dep).

```mermaid
erDiagram
  {{ENTIDAD_A}} ||--o{ {{ENTIDAD_B}} : "{{1:N relación nombrada}}"
  {{ENTIDAD_B}} }o--o{ {{ENTIDAD_C}} : "{{N:M via join table}}"
  {{ENTIDAD_A}} ||--|| {{ENTIDAD_D}} : "{{1:1}}"
  {{ENTIDAD_E}} ||--o{ {{ENTIDAD_A}} : "FK"
  %% etc. — orchestrator fills desde registry.relationships[]
```

**Relationship semantics:**

- `||--||` — 1:1 mandatory (e.g., `user ↔ user_profile`)
- `||--o{` — 1:N optional on dependent side (e.g., `user → posts`)
- `}o--o{` — N:M via join table (e.g., `users ↔ groups via memberships`)

---

## §2 Entities

> One subsection per ENT-XXX. Order: foundational entities first, then dependent.

### ENT-{{NNN}} — {{table_name}}

**Descripción:** {{1-line}}
**CRUD:** {{CRUD / CR / CRU / Read-only / Seed}}
**Refs upstream:** BR-{{XXX-NN}}, FT-{{NN}}, ADR-{{NN}} (qué declara/locks esta entidad)

| Campo              | Tipo PostgreSQL | Nullable | Default             | Descripción                 |
| ------------------ | --------------- | -------- | ------------------- | --------------------------- |
| id                 | uuid            | ❌       | `gen_random_uuid()` | PK                          |
| {{col}}            | {{type}}        | ❌/✅    | {{default o `—`}}   | {{1-line semantic}}         |
| created_at         | timestamptz     | ❌       | `now()`             | Audit (sk-db `auditFields`) |
| modified_at        | timestamptz     | ❌       | `now()`             | Audit (sk-db `auditFields`) |
| ... (per registry) |                 |          |                     |                             |

**Índices:**

- `{{table}}_pkey` PRIMARY KEY (id)
- `{{table}}_{{col}}_unique` UNIQUE ({{col}}) — {{razón: enforces F-N invariant}}
- `{{table}}_{{col}}_idx` btree ({{col}}) — query pattern: {{cuál}}
- `{{table}}_gin_{{jsonb_col}}` GIN ({{jsonb_col}}) — si feature query patterns lo justifican
- {{etc — orchestrator fills desde registry.entities[].indices[]}}

**Constraints:**

- FK ({{col}}) → {{other_table}}({{other_col}}) — {{ON DELETE CASCADE / SET NULL / RESTRICT}}
- CHECK ({{condition}}) — enforces F-{{N}} {{summary}}
- BEFORE UPDATE trigger: RAISE EXCEPTION '{{ERROR_CODE}}' si {{condition}} — enforces F-{{N}}

**Soft delete:** {{Sí (deleted_at column + filter) / No (hard delete) / N/A (immutable append-only)}}

{{repeat per ENT-XXX}}

---

## §3 Enums consolidated

> All enum types referenced across schemas. TS-style declaration matches Drizzle pgEnum output.

```typescript
// {{enum-domain-1}}
enum {{EnumName1}} {
  VALUE_A = 'value_a',
  VALUE_B = 'value_b',
  VALUE_C = 'value_c',
}

// {{enum-domain-2}}
enum {{EnumName2}} {
  ...
}

// ... (per registry.enums[])
```

**Enum usage cross-table:**

- `{{EnumName1}}` used by: {{table}}.{{col}} · {{table}}.{{col}}
- `{{EnumName2}}` used by: {{table}}.{{col}}

---

## §4 Soft delete pattern

| Tabla       | Campo soft delete | Filter rule                | Razón                                          |
| ----------- | ----------------- | -------------------------- | ---------------------------------------------- |
| {{table_X}} | `deleted_at`      | `WHERE deleted_at IS NULL` | {{e.g., users — preserve history per F-NN}}    |
| {{table_Y}} | (none — hard)     | N/A                        | {{razón hard delete OK — no audit obligation}} |

**Convention:** kit-shipped `sk-db softDeleteFields` aporta `deleted_at` + helpers (`notDeleted()`). Reusar cuando aplique.

---

## §5 Audit pattern

| Tabla                      | Audit campos                                           | Kit pattern                            |
| -------------------------- | ------------------------------------------------------ | -------------------------------------- |
| {{ALL except seed tables}} | `created_at`, `modified_at`, `created_by`, `modified_by` | `sk-db auditFields` (mandatory)        |
| {{table_X}}                | + custom: `archived_at`, `archived_by`                 | custom delta — flagged en 04 §SK delta |

**Convention:** TODA mutable tabla usa `sk-db auditFields` por default. Custom audit columns son delta documentado en `04_ARCHITECTURE §SK delta`.

---

## §6 Index strategy hints

> Recomendaciones basadas en query patterns esperados (per 03_DEEP_DIVE FT specs + 04_ARCHITECTURE module boundaries). NO full optimization — eso es Phase /implement con `EXPLAIN ANALYZE` sobre data real.

**Pattern 1: list + filter query (common para list pages):**

- {{table}}.{{filter_col}} btree → cover query patterns en FT-{{NN}}
- composite ({{col_A}}, {{col_B}}) si filter siempre incluye ambos

**Pattern 2: foreign key lookup (joins):**

- FK columns indexed por default (PostgreSQL) — verify `EXPLAIN` post-implement

**Pattern 3: JSONB path queries (cuando aplica):**

- GIN sobre `{{col}}` si feature query patterns acceden paths específicos

**Pattern 4: time-series queries:**

- btree (created_at DESC) para "recent N" patterns
- partial index ({{condition}}) si la mayoría de queries filtran por subset

**Anti-pattern (NO indexar):**

- Columnas con alta cardinalidad pero raramente filtered (audit log columns)
- Boolean columns (cardinality=2) — usar partial indexes en su lugar si query pattern justifica

---

## Completeness Gate

| Check                                                                               | Result      |
| ----------------------------------------------------------------------------------- | ----------- |
| 100% ENTs declarados en brief §4.1 + 03_DEEP_DIVE Data fields cubiertos             | PASS / FAIL |
| Enums consolidated sin duplicados                                                   | PASS / FAIL |
| Mermaid ER renders sin parsing errors                                               | PASS / FAIL |
| Soft-delete + audit pattern + index strategy hints documented per ENT cuando aplica | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                    | Blocking decisions                                            |
| ------------ | ------------------------- | ------------------------------------------------------------- |
| `/design`    | ready / partial / blocked | {{DECISION/SPIKE refs o —}} (data shapes for forms)           |
| `/backlog`   | ready / partial / blocked | {{DECISION/SPIKE refs o —}} (issues reference ENT-XXX paths)  |
| `/implement` | ready / partial / blocked | {{DECISION/SPIKE refs o —}} (Drizzle schemas copy-paste-able) |

---

_TimeKast Factory — tk-discovery template · 09_DATA_MODEL (Fase 1 — emitted Phase 6.1 step 2 from shared registry)_
