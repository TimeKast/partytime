# Execution Order — Backlog v{{VERSION}}

> **SSOT of execution order.** Topological sort across epics + Wave assignment + parallelism hints. `BOARD.md` is alphabetical and does NOT reflect this order. Generated in Phase 5.

## Waves

A Wave = a set of issues with all dependencies satisfied by prior Waves; issues within a Wave can run in parallel.

### Wave 1 (no upstream deps)

| Issue          | Epic              | Effort | Parallelizable | Depends on |
| -------------- | ----------------- | ------ | :------------: | ---------- |
| {{SETUP-001}}  | EPIC-00-bootstrap | {{S}}  |       no       | —          |
| {{DOMAIN-NNN}} | {{EPIC-NN}}       | {{M}}  |       ✓        | —          |

### Wave 2

| Issue          | Epic        | Effort | Parallelizable | Depends on     |
| -------------- | ----------- | ------ | :------------: | -------------- |
| {{DOMAIN-NNN}} | {{EPIC-NN}} | {{M}}  |       ✓        | {{DOMAIN-NNN}} |

{{... more waves}}

## Global topological order (flat)

```
{{SETUP-001}} → {{SETUP-002}} → {{DOMAIN-NNN}} → {{DOMAIN-NNN}} → ...
```

## Parallelism hints (for /implement-epic or manual fan-out)

- **Wave 1 width:** {{K}} issues can run concurrently.
- **Critical path:** {{SETUP-001 → ... → DOMAIN-NNN}} ({{N}} issues, ~{{NN}} SP).
- **Parallelizable singletons:** {{list}}.
- **Sequential chains:** {{list of chains}}.

## Cross-epic dependencies

| Issue          | Depends on (cross-epic) | Reason              |
| -------------- | ----------------------- | ------------------- |
| {{DOMAIN-NNN}} | {{DOMAIN-MMM}}          | {{e.g. needs auth}} |

<!-- Ciclos cross-epic son blockers → DECISION-BACKLOG-XXX. Este archivo asume grafo acíclico. -->
