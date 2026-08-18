# EPIC-003 — Verificación de asistencia por email (opcional por evento)

- **Status:** Implemented (pendiente: migración 0009 en Neon)
- **Goal:** Toggle por evento para exigir que el invitado confirme su email
  con un clic antes de quedar confirmado; sin fricción cuando está apagado.
- **Stories:** US-006, US-007
- **Issues:** ISSUE-007, ISSUE-008, ISSUE-009
- **Milestone:** Payments + verification + check-in
- **Depends on:** EPIC-002
- **Done when:** flujo completo verificado (RSVP → email → clic → confirmed),
  reactivaciones resetean verificación, y la suite completa pasa.
- **Tier de riesgo:** 3 (tokens de un solo factor para invitados anónimos).
  Una review enfocada al cerrar el epic.

## User stories

- **US-006** — Como organizador, activo verificación por email en mi evento
  para filtrar registros con correos falsos o con typos.
- **US-007** — Como invitado, verifico mi correo con un clic y quedo
  confirmado, con posibilidad de reenviar el link si no me llegó.

## Decisión clave

En eventos de pago la verificación explícita NO aplica: el pago la supersede
(ver PLAN §2). Este epic solo cambia el flujo de eventos gratis con el toggle
encendido. Patrón de token: `password_reset_tokens` (hash-only + expiry +
timing-safe), nunca el patrón del cancel-token.

## Delivery evidence (2026-08-18)

- ISSUE-007, 008 y 009 completadas (Sonnet ejecutor, Fable 5 auditor).
- Review Tier 3 (tokens): hash-only storage, verificación atómica en una
  sentencia (carrera de doble verify resuelta en DB), branch
  requires_verification calculado fresco dentro del CTE de invitación (cierra
  TOCTOU), resend opaco 202 con doble rate-limit, same-origin en verify y
  resend, matriz de reactivación demostrada por tests con análisis de
  alcanzabilidad ("no existe camino que conserve verified_at con email
  distinto al verificado").
- Suite verde en cada commit (489 → 516 tests en el cierre del epic).
