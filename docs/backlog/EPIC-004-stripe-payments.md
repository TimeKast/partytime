# EPIC-004 — Cobro por RSVP con Stripe Checkout

- **Status:** Pending
- **Goal:** Un evento puede exigir pago para confirmar asistencia; el cobro
  ocurre en Stripe Checkout hosted y la confirmación llega por webhook,
  idempotente y sin sobreventa de asientos.
- **Stories:** US-008, US-009, US-010
- **Issues:** ISSUE-010, ISSUE-011, ISSUE-012, ISSUE-013, ISSUE-014
- **Milestone:** Payments + verification + check-in
- **Depends on:** EPIC-002
- **Done when:** flujo pagado end-to-end verde con Stripe CLI (checkout →
  webhook → confirmed+verified), expiración libera asientos, admin ve pagos,
  y la suite completa pasa.
- **Tier de riesgo:** **4 (dinero real)**. Una pass completa acotada de review
  + verificación dirigida de los fixes antes de declarar cerrado.

## User stories

- **US-008** — Como organizador, marco mi evento como "de pago" y el monto
  mostrado es exactamente el que se cobra (fuente única: `price_amount`).
- **US-009** — Como invitado, pago con tarjeta en Stripe y recibo recibo de
  Stripe + confirmación del evento en el mismo correo que registré.
- **US-010** — Como organizador, veo el estado de pago de cada invitado en el
  admin y en los exports.

## Decisiones clave (ver PLAN §3.3)

- Checkout hosted por redirect: sin Stripe.js, sin PCI scope, sin claves
  públicas. `customer_email` va **bloqueado** con el email del RSVP.
- Pago exitoso ⇒ `confirmed` + `verified_at` en una sola sentencia CTE
  (verificación implícita, PLAN §2).
- `pending_payment` reserva asiento con TTL 35 min; expiración lazy + webhook
  `checkout.session.expired`.
- Reembolsos manuales en dashboard Stripe (MVP); `charge.refunded` solo
  registra.
