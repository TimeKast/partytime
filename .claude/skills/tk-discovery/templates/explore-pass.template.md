# Explore Pass — Batch {{batch_id}} ({{slug}})

> **Produced by:** `dsc-intake-analyst` agent (Phase 1 of `/discovery`, paralelo per batch).
> **Consumed by:** main orchestrator (Phase 1 cross-file reconciliation + Phase 1 concatenation → `explore-pass.md`) · `dsc-freeze-map-extractor` (Phase 2) via `explore-pass.md` consolidado.
> **Schema canónico:** [`methodology.md §10`](../methodology.md).

**Batch id:** {{01 / 02 / ...}}
**Slug:** {{text-docs / screenshots-01-10 / ...}}
**Files processed:** {{N}}

---

## File: {{repo-relative path}}

### Media-type detected

- **Extension:** {{.md / .png / .docx / ...}}
- **Magic-bytes result:** {{confirmed / mismatch / n/a}}
- **Classification:** Tier 1 (structured text | transcript | visual | tabular `.csv`) / Tier 1-fallback (texto plano legible sin strategy dedicada) / Tier 2 ({{docx/pdf/xlsx/unknown-no-texto}})

### Classification (source hierarchy)

- **Role:** SoT (primary) / SoT (crudo) / Reference / Legacy / Context
- **Justification:** {{quote del autor declarando rol, O inference con evidence}}

### Extracted decisions (claims made in this file)

<!-- Decisions literales del file. Citar §N + quote. Aplicar 4-dim detector (methodology §1.1):
     dim A (explicit decision) · dim B (firm tag) · dim C (implicit claim vía bullet pattern) · dim D (standard field gap) -->

- {{decision 1 — quote con anchor}}
- ...

### Extracted questions (gaps in this file — declared OQs)

- {{question 1 literal}}

### Intra-file tensions (same file, contradictory statements)

- {{§N says X vs §M says Y}}

### Implicit claims (dim C — bullet patterns)

<!-- Claims no tagged como firm pero que emergen de patterns de bullets/table.
     Pueden ser firm pero requieren validation con PO. -->

- {{claim + pattern que lo sugiere}}

### Standard-field gaps (dim D)

<!-- Fields estándar de un brief discovery que este file NO cubre.
     Ej: "no North Star quantitative", "no stakeholder declarado", "no deadline". -->

- {{gap}}

### Transcription notes

<!-- Secciones verbatim de spec-heavy content. Para structured text: transcribir literal
     las partes que son decision-dense. Para visual: describir imagen + UI elements + semantic grouping.
     Para transcript: attribute por speaker. -->

- {{nota}}

### Escalations (factory-tickets emitted from this file)

<!-- Si Tier 2 / unknown → intake-drift ticket emitted a project/factory/.
     Listar path del ticket + summary. -->

- {{ticket path + reason}}

---

## File: {{next file path}}

... (repetir schema por file)

---

## Batch summary (meta)

**Total files processed:** {{N}}
**Tier 1:** {{count}} (structured: {{X}}, transcript: {{Y}}, visual: {{Z}}, tabular: {{W}})
**Tier 1-fallback:** {{count}}
**Tier 2 drift tickets emitted:** {{count}}
**Media-type anomalies:** {{none / list}}
**Output path:** `project/discovery-artifacts/explore-pass/{{batch_id}}-{{slug}}.md`

### Cross-file signals detected (para el main orchestrator en Phase 1 reconciliation)

<!-- NO es reconciliation completa — eso lo hace el orchestrator post-concat.
     Aquí: hints que el agent vio que pueden aplicar cross-file (ej: "polished doc hardens raw counterpart on claim X" — Estilo-C drift hint).
     El orchestrator lee estos hints al armar cross-file-reconciliation.md. -->

1. {{hint 1}}
2. ...

---

_End batch {{batch_id}}-{{slug}} · produced by dsc-intake-analyst_
