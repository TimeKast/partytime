# EPIC-003 — Verificación de asistencia por email (opcional por evento)

- **Status:** Pending
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
