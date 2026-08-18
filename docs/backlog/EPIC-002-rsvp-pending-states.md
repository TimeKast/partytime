# EPIC-002 — Fundación de estados RSVP pendientes

- **Status:** Pending
- **Goal:** Introducir los estados `pending_verification`, `pending_payment` y
  `expired` con reserva de asiento y expiración lazy, sin romper ningún
  consumidor actual de `status`.
- **Stories:** (habilitador técnico de US-006..US-010)
- **Issues:** ISSUE-005, ISSUE-006, ISSUE-020
- **Milestone:** Payments + verification + check-in
- **Done when:** los criterios de ambas issues están verificados y la suite
  completa + `pnpm db:preflight` pasan con la migración 0009 aplicada.
- **Tier de riesgo:** 3 (trigger de capacidad → riesgo de oversell/undersell).
  Una review enfocada al cerrar el epic.

## Contexto

Hoy `rsvps.status` solo usa `confirmed`/`cancelled` y la capacidad se aplica
con el trigger `enforce_event_capacity()` (`drizzle/0002`). EPIC-003 y
EPIC-004 necesitan filas "pendientes" que reserven asiento con TTL. Este epic
es prerequisito de ambos y se ejecuta primero, en serie (schema single-owner).

Ver PLAN-EPICS-002-005.md §3.1 y §5 (gotchas) antes de tocar código.
