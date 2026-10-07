# Methodology — index

> **Cómo leer este archivo:** este es un thin index. El contenido conceptual del methodology vive en sub-files topic-scoped dentro de `methodology/`. NO es prerequisito para ejecutar el workflow — `SKILL.md` tiene todo lo operacional. Leer los sub-files on-demand cuando necesites schema específico.
>
> **Subprocess prompts deben citar el path del sub-file relevante**, no este index.

---

## Sub-files

**Pre-existentes:**

- [Source classification](methodology/source-classification.md) — taxonomy SoT/Reference/Legacy/Context, 4 dimensiones de ingesta (A/B/C/D), Estilo C tripwire (polished-by-LLM), output al scratchpad.
- [Intake](methodology/intake.md) — bulk attachments rule, media-type strategies (Tier 1 / Tier 1-fallback / Tier 2), modos D0/D1/D2, Reconciliation Appendix A mechanics, per-file Explore Schema, invalidation handling cross-phase.
- [Freeze map](methodology/freeze-map.md) — 5 buckets schema (Firm/Open/Contradictions/Recommendations/Post-MVP), confidence tags inline, anti-drift rules, quantitative completeness gate, HIGH findings classification del Phase 7 Challenge Pass.
- [Deep dive](methodology/deep-dive.md) — 11 sections schema del brief, 8-fields per-feature schema, S/M/L tier semantics + classification rules.
- [Kit leverage](methodology/kit-leverage.md) — `dsc-kit-analyst` output schema, coverage aggregation, drift surfacing, trigger rule (`sk_active`).
- [Factory tickets](methodology/factory-tickets.md) — puntero a la convención canónica de factory-tickets (shape, tipos, naming, ciclo de vida, trigger rules), que vive en la skill `fx-factory-tickets`; aquí quedan solo las pipeline rules locales del run (`/discovery`) + bibliografía interna.

**v10 (canonical artifacts numerados + tracking issues + readiness gate):**

- [ID Registry](methodology/id-registry.md) — registry canonical de prefixes (F bare / FT-NN / PER-XXX / ENT-XXX / US-XXX / BR-DOMAIN-NN / OQ-XXX / ADR-XXX / DECISION-XXX / SPIKE-XXX). Distinción F vs FT explícita. Refs cuádruples convention para 06_ACCEPTANCE_SCENARIOS.
- [Personas](methodology/personas.md) — derivar PER-XXX de brief §2 + deep-dive Users; JTBD shape; quantitative gate (≥90% coverage of brief §2 roles).
- [Architecture](methodology/architecture.md) — 5 secciones (Topology / SK delta / Module boundaries / Integration contracts / Cache posture); ADRs como refs inline (NO §ADR index); ships con cliente como deliverable.
- [RBAC matrix](methodology/rbac-matrix.md) — resource SSOT (`entities ∪ routes`), actions canonical CRUD+list, scope values (own/team/global), multi-pass workflow (post-03 + post-04).
- [Acceptance scenarios](methodology/acceptance-scenarios.md) — transcripción + Gherkin expansion del deep-dive Tier L §2 + US del brief §3.3 FULL INDEX (no top 5); refs cuádruples per scenario.
- [Implementation-readiness](methodology/implementation-readiness.md) — gate doctrine multi-consumer; status parseable `ready | partial | blocked`; 3 caminos formales (resolver inline / spike / defer) con DECISION/SPIKE/ADR tracking.

---

_TimeKast Factory — Discovery methodology (thin index — content lives in `methodology/*.md` sub-files)_
