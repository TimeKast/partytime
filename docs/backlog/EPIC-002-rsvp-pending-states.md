# EPIC-002 — Fundación de estados RSVP pendientes

- **Status:** Implemented (pendiente: migración 0009 en Neon)
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

## Delivery evidence (2026-08-18)

- ISSUE-005, 006 y 020 completadas (Sonnet ejecutor, Fable 5 auditor).
- Review Tier 3 (oversell): trigger seat-neutral en transiciones
  pending→confirmed verificado por test; CTE de expiración lazy restaura
  links; guardarraíles de migración ensanchan hashes sin romper clasificación
  histórica. Dos bugs reales encontrados en el barrido de consumidores
  (bulk email sin guard de status; filas pendientes invisibles en admin) y
  corregidos. Hallazgo posterior (ISSUE-011): reactivación por invitación no
  aceptaba filas expired — corregido y fijado por test.
- Suite verde en cada commit (420 → 428 tests en el cierre del epic).
