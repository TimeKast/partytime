# ISSUE-004 — Verificar contratos integrados y documentar evidencia

- **Epic:** EPIC-001
- **Priority:** P2
- **Story points:** 3
- **Status:** Completed
- **Dependencies:** ISSUE-001, ISSUE-002, ISSUE-003
- **User stories:** US-001..US-005
- **Agents:** test-engineer, security-auditor
- **Skills:** testing, security

## Acceptance criteria

```gherkin
Given la implementación integrada
When se ejecutan tests, typecheck, build, preflight DB y smokes principales
Then cada gate queda en verde o documenta una limitación reproducible

Given que el cambio toca autorización, esquema y concurrencia
When se realiza la revisión Tier 3 focalizada
Then no quedan findings bloqueantes en hash, RBAC, expiración ni atomicidad
```

## Evidence

- `pnpm test`: 375/375.
- `pnpm exec tsc --noEmit`: PASS.
- `pnpm lint`: PASS con 3 warnings preexistentes.
- `pnpm build`: PASS.
- `git diff --check`: PASS.
- Auditoría Tier 3: 0 Critical, 0 High; los 3 Medium y 1 Low originales fueron corregidos y verificados de forma dirigida.
- Rama Neon desechable: preflight `registered-current-schema`, `verify:db` PASS y semántica completa de `0008` PASS.
- Smoke HTTP: validate 200 → RSVP 201 → validate 404 → segundo RSVP 409.
- Concurrencia real: 2 consumidores → 1 ganador, 1 RSVP y correlación `used_rsvp_id`; fixtures 0 al finalizar.

## Production rollout boundary

- No quedan gates de implementación abiertos en esta issue.
- La rama temporal fue descartada; producción no recibió la migración ni el código.
- Aplicar `0008`, verificar y desplegar requiere una autorización operacional separada conforme al runbook.
