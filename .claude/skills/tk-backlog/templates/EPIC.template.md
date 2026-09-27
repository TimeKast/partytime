# {{EPIC-NN-slug}}: {{Nombre del epic}}

> **Status:** 📋 Backlog
> **Milestone:** {{v{X} | M{N}}}
> **Priority:** {{P0 | P1 | P2}}
> **Total Issues:** {{N}} ({{DOMAIN-NNN..DOMAIN-MMM}})
> **Story Points:** ~{{NN}}
> **UI Touching:** {{yes | no}}
> **Backlog UUID:** {{uuid}}

<!--
  - EPIC-NN: NN topological, EPIC-00 reserved for bootstrap. Number-at-front → epics/ sorts logically.
  - UI Touching: yes → a ui-critic issue is pre-assigned (Phase 3) + chain tail (Phase 4).
  - Backlog UUID: v4 minted in Phase 3, stamped verbatim (backlog-central sync — BSYNC-007). NOT read by update-board.ts.
-->

## Objetivo

{{Qué entrega el epic + por qué es una unidad cohesiva.}}

## Issues

<!-- Orchestrator fills post-Phase-4, en orden de número global (lee en orden de ejecución). -->

| Status | ID             | Título     | Effort | Depends on     | Par?  |
| ------ | -------------- | ---------- | ------ | -------------- | :---: |
| 📋     | {{DOMAIN-NNN}} | {{título}} | {{M}}  | {{—}}          | {{✓}} |
| 📋     | {{DOMAIN-NNN}} | {{título}} | {{S}}  | {{DOMAIN-NNN}} | {{}}  |

## Topology

<!-- SSOT de paralelismo. Per-issue `Parallelizable:` deriva de aquí (sweep enforced). -->

```yaml
parallelizable_issues: [{ { DOMAIN-NNN } }, { { DOMAIN-NNN } }]
sequential_chains:
  - [{ { DOMAIN-NNN } }, { { DOMAIN-NNN } }]
```

Invariante: `parallelizable_issues ∪ sequential_chains.flat() == {todos los issue IDs del epic}`.

```
{{ASCII/Mermaid topology graph opcional — no autoritativo, solo lectura humana}}
```

## Scope

**Incluido:** {{...}}
**Excluido:** {{...}}

## Dependencias entre epics

- {{Depende de EPIC-NN porque ...}} | Ninguna.

## Implementation Evidence

_Pendiente._
