# Acceptance Scenarios — {{project}}

> **Produced by:** main orchestrator (Phase 6.1 synthesis post-brief, after 02 + 03 + 05 ready).
> **Consumed by:** `/backlog` (cada issue lleva AC), `/implement` (define done), `/design` (interaction flow context).
> **Schema canónico:** [`methodology/acceptance-scenarios.md`](../methodology/acceptance-scenarios.md).
> **Path canónico:** `project/planning/06_ACCEPTANCE_SCENARIOS.md`.

> **NO fresh reasoning.** Este doc es **transcripción + expansión Gherkin** del deep-dive Tier L §2 + US del brief §3.3 (FULL INDEX, no top 5). Brief §3.3 y deep-dive Tier L §2 colapsan a pointer hacia este doc — SSOT canónico de AC.

**Run date:** {{YYYY-MM-DD}}
**Source:** brief §3.3 (FULL US index) + 03_DEEP_DIVE.md Tier L §2 (AC per feature) + 02_PERSONAS (actor refs) + 05_RBAC_MATRIX (security scope refs).

---

## Refs cuádruples convention

Cada scenario lleva inline una linea de refs:

```
Refs: [FT-X] [BR-X: F{N}] [ENT-X] [US-X] [PER-X]
```

- **FT-X** — feature al que pertenece (de 03_DEEP_DIVE.md)
- **BR-X: F{N}** — business rule + firm decision que la rule locked (refs compactas self-contained)
- **ENT-X** — entity central al scenario (de 03_DEEP_DIVE.md Data field)
- **US-X** — user story que cubre (de brief §3.3 + index aquí)
- **PER-X** — persona ejecutora (de 02_PERSONAS.md)

**NO referencias IDs del design** (SCR-XXX, CMP-XXX, FLW-XXX, DD-XXX) — esos viven en `/design` output.

---

## US-001 — {{User Story title}}

**Persona:** PER-001 ({{rol}}) — actor primario
**Story:** Como `{persona}` quiero `{capability}` para `{outcome}`.

### Scenario: Happy path — {{descriptive scenario name}}

```gherkin
Refs: [FT-07] [BR-AUTH-03: F12] [ENT-USER] [US-001] [PER-001]

Given que {persona} está autenticado como `{role}`
  And tiene scope `{own/team/global}` sobre `{ENT-X}`
When realiza la acción `{X}`
Then el sistema {expected behavior}
  And persiste cambio en `{ENT-X}`
  And emite event `{Y}` si aplica
```

### Scenario: Edge — {{descriptive edge case}}

```gherkin
Refs: [FT-07] [BR-AUTH-04: F13] [ENT-USER] [US-001] [PER-001]

Given que {persona} está autenticado
  And {precondición edge case}
When realiza la acción `{X}`
Then el sistema rechaza con error `{Z}`
  And NO persiste cambio
  And loggea security event si aplica
```

### Notes / decisions

{{Inline notes — DECISION/SPIKE refs si applica. Ejemplo:

- "Edge case de concurrent edit aún sin scope claro — DECISION-008 (¿last-write-wins o optimistic locking?) pendiente."}}

---

## US-002 — ...

(repetir shape per US del brief §3.3 — full index)

---

## Completeness Gate

| Check                                                                     | Result      |
| ------------------------------------------------------------------------- | ----------- |
| Coverage: `count(scenarios) ≥ count(US-XXX) × min_scenarios_per_us`       | PASS / FAIL |
| ≥1 happy + ≥1 edge per US-XXX                                             | PASS / FAIL |
| US-XXX universe alineado con brief §3.3 FULL INDEX (no top 5)             | PASS / FAIL |
| Refs cuádruples `[FT-X] [BR-X: F{N}] [ENT-X] [US-X] [PER-X]` per scenario | PASS / FAIL |
| Error scenarios alineados con 10_API_SURFACE error codes catalog          | PASS / FAIL |

**Overall:** PASS / FAIL

Si fail → orchestrator re-ensambla scenarios faltantes; NO re-spawn.

---

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions |
| ------------ | ------------------------------- | ------------------ |
| `/design`    | `ready` / `partial` / `blocked` | —                  |
| `/backlog`   | (idem)                          |                    |
| `/implement` | (idem)                          |                    |

### Notes

{{Si status=partial: lista DECISION/SPIKE que desbloquean cuál US/scenario. Ejemplo:

- "/backlog partial: US-005 scenarios pendientes hasta DECISION-009 (pricing tier limits)."}}

---

_TimeKast Factory — tk-discovery template · 06_ACCEPTANCE_SCENARIOS_
