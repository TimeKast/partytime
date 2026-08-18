# EPIC-004 — Cobro por RSVP con Stripe Checkout

- **Status:** Implemented (pendiente: ensayo E2E manual con claves test + migraciones 0010 en Neon)
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

## Delivery evidence (2026-08-18)

- ISSUE-010..014 implementadas (Sonnet ejecutor, Fable 5 auditor por issue).
- Suite integrada: 643/643 tests; lint, tsc y build limpios en cada commit.
- **Review Tier 4 (Fable 5) sobre el diff del epic — hallazgos:**
  - **F1 (corregido y verificado):** carrera de doble sesión — dos POSTs
    concurrentes podían dejar dos Checkout Sessions vivas y permitir doble
    cobro. Fix: elección post-insert de sobreviviente (fila 'created' más
    antigua gana; el perdedor expira su sesión y su fila, 409 reintentable).
    `electSurvivingCreatedPayment` en lib/queries.ts + tests.
  - Verificados sin hallazgo: firma sobre raw body, fail-closed sin secret,
    idempotencia por condición de status, replay, pago-tras-expirar con
    recheck de capacidad vía trigger, PAYMENT_WITHOUT_SEAT preserva el cobro,
    email post-mutación no fatal, fuente única de precio (int cents), sin
    PII/secretos en logs, rate-limit de la rama de pago.
- Hardening checklist verificada con evidencia en
  docs/features/payments/E2E_RUNBOOK.md (§Hardening verification).
- **Pendiente para producción:** ensayar E2E_RUNBOOK.md con claves test de
  Stripe (requiere que José configure la cuenta), aplicar 0009/0010 en rama
  Neon desechable → prod según PRODUCTION_MIGRATION_RUNBOOK.md, y crear el
  webhook en el dashboard.
