# Challenge Pass — {{project_slug}}

> **Produced by:** main orchestrator (Phase 7.2 of `/discovery`) consolidando outputs de los 3 reviewers paralelos (`architect`, `product-owner`, `project-planner`).
> **Consumed by:** main orchestrator en Phase 7.4 Gap Round 2 + Phase 7.5 re-synth + CP2.
> **Lifecycle:** audit-only — archivado a `project/discovery-artifacts/_audit/challenge-pass.md` en Phase 8 close.

**Run date:** {{YYYY-MM-DD}}
**Brief draft auditado:** `project/planning/00_DISCOVERY_BRIEF.md` (Phase 6 first-pass output)

---

## architect — verdict {{🟢 / ⚠️ / 🔴}}

**Lens:** irreversible architectural decisions, tech risks, constraints bypassed. NO produce ADR aquí — flag risks only.

### Findings

| Severity | Finding       | Reference (brief §) | Recommendation                                         |
| -------- | ------------- | ------------------- | ------------------------------------------------------ |
| HIGH     | {{finding 1}} | §{{N}}              | {{ADR required / refactor scope / accept with caveat}} |
| MED      | {{finding 2}} | §{{N}}              | {{...}}                                                |
| LOW      | {{finding 3}} | §{{N}}              | {{...}}                                                |

### Cross-impacts

- {{impact 1: cómo finding A condiciona finding B}}
- {{impact 2}}

---

## product-owner — verdict {{🟢 / ⚠️ / 🔴}}

**Lens:** user-intent preservation, scope drift, MVP boundary integrity, MoSCoW prioritization soundness, features without clear user problem (and vice versa).

### Findings

| Severity | Finding       | Reference (brief §) | Recommendation                                              |
| -------- | ------------- | ------------------- | ----------------------------------------------------------- |
| HIGH     | {{finding 1}} | §{{N}}              | {{stakeholder decision needed / scope-cut / re-prioritize}} |
| MED      | {{finding 2}} | §{{N}}              | {{...}}                                                     |
| LOW      | {{finding 3}} | §{{N}}              | {{...}}                                                     |

---

## project-planner — verdict {{🟢 / ⚠️ / 🔴}}

**Lens:** timeline realism, hidden dependencies, premature commitments, rollback paths, descope plan viability.

### Findings

| Severity | Finding       | Reference (brief §) | Recommendation                                 |
| -------- | ------------- | ------------------- | ---------------------------------------------- |
| HIGH     | {{finding 1}} | §{{N}}              | {{descope item / parallelize / extend window}} |
| MED      | {{finding 2}} | §{{N}}              | {{...}}                                        |
| LOW      | {{finding 3}} | §{{N}}              | {{...}}                                        |

---

## skeptical-client — verdict {{🟢 / ⚠️ / 🔴}}

**Lens (OVERRIDE MODE — NOT proposal/commercial):** review brief + 04_ARCHITECTURE desde lente del cliente que recibirá el deliverable técnico post-handoff. Detecta promesas vagas sin métrica observable, jerga técnica disfrazada de business value, features sin conexión al dolor de §1.2, decisiones architecture no defendibles por el tech team del cliente.

**Scope:** `00_DISCOVERY_BRIEF.md` + `04_ARCHITECTURE.md` only.

**Out of scope:** ROI / commercial viability / business case / detalles implementación interna / scope MVP / timeline.

### Findings

| Severity | Finding       | Reference (brief § o 04 §) | Recommendation                                                  |
| -------- | ------------- | -------------------------- | --------------------------------------------------------------- |
| HIGH     | {{finding 1}} | §{{N}}                     | {{aterrizar con métrica / quitar jerga / linkear a §1.2 dolor}} |
| MED      | {{finding 2}} | §{{N}}                     | {{...}}                                                         |
| LOW      | {{finding 3}} | §{{N}}                     | {{...}}                                                         |

---

## Impact map audit lines (Phase 6.2 reconciliation trace)

<!-- Sección requerida por SKILL.md §Phase 6.2. Audit trail de no-ops + decisiones de skip
     en el impact map post-GR2. Sin estas líneas, los no-ops son invisibles y skipables. -->

```
{{lista de audit lines, una por línea — formato:
impact_map_check: 00 validated no-op for {topic} | derivatives no-op for {list}
01_reconcile: no-op confirmed for {topic}
derivative_skip: 04 not re-synth — no logs route surface introduced
...}}
```

---

## Stakeholder decisions surfaced (Gap Round 2 candidates)

<!-- Filtrar de los HIGH findings los que requieren decisión del user (vs implementation decisions
     que el orchestrator/tech lead resuelve). Estos van a Phase 7.4 mini-batch. -->

| #     | Pregunta para stakeholder | Owner finding                | Buckets afectados             |
| ----- | ------------------------- | ---------------------------- | ----------------------------- |
| GR2-1 | {{pregunta concreta}}     | {{architect / PO / planner}} | {{schema / scope / timeline}} |

---

## ADRs flagged

<!-- Architect HIGH findings que requieren ADR. Crear `project/planning/decisions/ADR-{NN}.md` (type: adr, status: proposed) usando `templates/tracking-issue.template.md`. Phase 7 architect agent valida y transition a `accepted` o `rejected`. -->

| ADR-ID     | Topic     | Change cost   | Rationale                |
| ---------- | --------- | ------------- | ------------------------ |
| ADR-{{NN}} | {{topic}} | high / medium | {{por qué requiere ADR}} |

---

_TimeKast Factory — Challenge Pass (tk-discovery Phase 7.2 · audit-only)_
