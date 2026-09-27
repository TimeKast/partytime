# Coverage Matrix — Backlog v{{VERSION}}

> Auditable manifest of metrics + coverage + upstream source hashes. Machine-parseable for automation. Generated in Phase 8 (coverage data from Phase 6). Consumed by `validar` for drift detection.

## Metrics

| Métrica                    | Valor                                     |
| -------------------------- | ----------------------------------------- |
| Epics                      | {{N}}                                     |
| Issues                     | {{M}}                                     |
| Story Points (total)       | {{NN}}                                    |
| Issues by priority         | P0 {{a}} · P1 {{b}} · P2 {{c}} · P3 {{d}} |
| Parallelism width (Wave 1) | {{K}}                                     |
| Critical path length       | {{N}} issues / ~{{NN}} SP                 |
| Sequential chains          | {{C}}                                     |

## Coverage

| Dimension          | Cubierto / Total | Huérfanos                     |
| ------------------ | :--------------: | ----------------------------- |
| Features (FT)      |   {{a}}/{{A}}    | {{FT-XX sin issue \| —}}      |
| Screens (SCR)      |   {{b}}/{{B}}    | {{SCR-XXX sin issue \| —}}    |
| Components (CMP)   |   {{c}}/{{C}}    | {{CMP-XXX sin issue \| —}}    |
| Personas (MVP)     |   {{d}}/{{D}}    | {{PER-XXX sin issue \| —}}    |
| RBAC roles         |   {{e}}/{{E}}    | {{role sin issue (warning)}}  |
| Flows (FLW ≥3 SCR) |   {{f}}/{{F}}    | {{FLW-XXX sin e2e-flow \| —}} |

## Consumer Readiness

- {{ready | partial | blocked}} for `/implement`.
- Caveats: {{INVENTORY.md missing — "don't rebuild" ran conservative \| —}}
- Deferred decisions: {{DECISION-BACKLOG-XXX-slug \| —}}

## Source Hashes (for `validar` drift detection)

> Content hash per consumed upstream artifact. `validar` diffs current vs stored → `CHANGED` (semantic change), beyond `GAP`/`STALE`.

| Artifact ref               | Hash     |
| -------------------------- | -------- |
| {{03_DEEP_DIVE FT-01}}     | {{sha…}} |
| {{16_DESIGN SCR-03}}       | {{sha…}} |
| {{09_DATA_MODEL ENT-USER}} | {{sha…}} |
| {{06_AC AC-01.1}}          | {{sha…}} |

## Gate decisions (DoR test-gate — FX-003)

```yaml
gate_decisions:
  - { issue: { { DOMAIN-NNN } }, type: component, decision: y }
  - {
      issue: { { DOMAIN-NNN } },
      type: component,
      decision: justify,
      justification: '{{razón ≥20 chars}}',
    }
```
