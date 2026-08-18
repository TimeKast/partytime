# ISSUE-014 — E2E del flujo pagado + hardening y documentación de operación

- **Epic:** EPIC-004
- **Priority:** P1
- **Story points:** 5
- **Status:** Completed (2026-08-18)
- **Dependencies:** ISSUE-012, ISSUE-013
- **User stories:** US-008, US-009
- **Agents:** quality-engineer, security-auditor
- **Skills:** testing, sk-e2e, security

## Objetivo

Cerrar EPIC-004 con verificación end-to-end real y la pasada de review Tier 4
(dinero) del PLAN §7.

## Alcance

### E2E con Stripe test mode

- Guion reproducible en `docs/features/payments/E2E_RUNBOOK.md` (nuevo):
  levantar dev con claves test + `stripe listen`, y recorrer:
  1. RSVP en evento de pago → redirect a Checkout → pagar con `4242 4242
     4242 4242` → webhook → confirmed + email.
  2. Abandonar checkout → esperar/forzar `session.expired` (`stripe trigger
     checkout.session.expired` o expirar por API) → asiento liberado.
  3. Replay del webhook (`stripe events resend`) → sin doble efecto.
  4. Capacidad 1: dos invitados simultáneos → uno paga, el otro recibe
     CAPACITY_FULL antes de llegar a Stripe.
- Automatizar lo automatizable en `tests/` (con SDK mockeado donde no haya
  red); lo manual queda como checklist en el runbook con resultados anotados.

### Hardening checklist (verificar, y corregir si falla)

- [ ] Ningún log imprime `STRIPE_SECRET_KEY`, `whsec_`, ni el objeto session
      completo (puede traer PII).
- [ ] `payment-status` endpoint: `no-store`, formato `cs_` validado, sin PII.
- [ ] Montos: nunca floats — todo integer cents de punta a punta.
- [ ] `.env.example` documenta las 3 vars y el runbook de webhook.
- [ ] Vercel: la ruta webhook no está detrás de auth/middleware que la
      bloquee; timeout suficiente (default OK, verificar).
- [ ] Rate-limit del POST /api/rsvp aplica también a la rama de pago
      (no se puede spamear creación de sesiones de Checkout; usar
      `lib/bounded-rate-limiter.ts` por IP+slug si no existe ya).

### Review Tier 4

- Una pasada completa acotada de review sobre el diff del epic (un solo
  workflow dueño de la review, según `risk-aware-audits.md`) + verificación
  dirigida de cada fix. Registrar hallazgos y cierre en
  `docs/backlog/EPIC-004-stripe-payments.md` (sección Delivery evidence).

## Acceptance criteria

```gherkin
Given el runbook E2E ejecutado en test mode
Then los 4 escenarios pasan y quedan anotados con fecha y resultado

Given la checklist de hardening
Then cada ítem está verificado con evidencia (grep/test/manual)

Given la review Tier 4
Then hallazgos evaluados uno por uno, fixes verificados, evidencia en el EPIC
```
