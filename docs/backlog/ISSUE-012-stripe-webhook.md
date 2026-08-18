# ISSUE-012 — Webhook de Stripe: confirmación idempotente y expiración

- **Epic:** EPIC-004
- **Priority:** P0
- **Story points:** 8
- **Status:** Pending
- **Dependencies:** ISSUE-011
- **User stories:** US-009
- **Agents:** backend-specialist, security-auditor
- **Skills:** implement, backend, sk-security

## Objetivo

`POST /api/webhooks/stripe` — la ÚNICA autoridad que confirma RSVPs pagados.
Idempotente, firmado, y con mutaciones multi-tabla en una sola sentencia
(neon-http sin transacciones — patrón `saveRsvpWithInvitation`,
`lib/queries.ts:259-340`).

## Cambios exactos

### `app/api/webhooks/stripe/route.ts` (nuevo)

- `export const runtime = 'nodejs'` (el SDK de Stripe no es edge-safe aquí).
- Leer el body CRUDO con `await req.text()` y verificar firma:
  `stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)`.
  Firma inválida → 400. Sin secret configurado → 503.
- Eventos manejados (switch por `event.type`; los demás → 200 ignorado):

**`checkout.session.completed`** (también manejar
`checkout.session.async_payment_succeeded` por paridad — OXXO/SPEI si se
habilitan después):
- Extraer `session.id`, `session.metadata.rsvpId`, `payment_intent`.
- Llamar `fulfillPaidRsvp(sessionId, paymentIntentId)` en `lib/queries.ts`:
  **una sentencia CTE** que:
  1. UPDATE `rsvp_payments` SET status='paid', paid_at=now(),
     stripe_payment_intent_id WHERE stripe_session_id=$1 AND status='created'
     (la condición de status ES la idempotencia — replay no re-muta)
  2. encadenado: UPDATE `rsvps` SET status='confirmed', verified_at=now(),
     pending_expires_at=NULL WHERE id = (rsvp del payment) AND
     status='pending_payment'
  3. RETURNING datos para el email.
- Si la CTE afectó filas: enviar email de confirmación (el existente,
  `generateConfirmationEmail`) fuera de la sentencia, con
  try/catch — fallo de email NO debe hacer fallar el webhook (Stripe
  reintentaría y el email se duplicaría). Registrar en `email_history` tipo
  `'confirmation'`.
- Si no afectó filas (replay o carrera): 200 silencioso.
- **Caso borde a cubrir:** webhook llega DESPUÉS de que la expiración lazy
  marcó la fila `expired` (pago en el segundo 29:59). La CTE debe aceptar
  también `status='expired'` en el paso 2 SI el asiento sigue disponible —
  el trigger de capacidad corre en el UPDATE y lanza CAPACITY_FULL si ya no
  cabe. Capturar P0001: marcar el pago `paid` igualmente y loggear
  `PAYMENT_WITHOUT_SEAT` para reembolso manual — nunca tragar el error en
  silencio. (Ver test dedicado.)

**`checkout.session.expired`**:
- CTE: `rsvp_payments` → 'expired' (si 'created') + `rsvps` → 'expired'
  (si 'pending_payment') + **restaurar el link de invitación** si la fila
  venía de uno (`used_rsvp_id` = fila expirada, no revocado ni vencido —
  misma lógica que `expireStalePendingRsvps`, PLAN §2.1). Idempotente igual.

**`charge.refunded`**:
- UPDATE `rsvp_payments` SET status='refunded', refunded_at=now() por
  `payment_intent`. NO cancela el RSVP (decisión del organizador, PLAN §3.3).

- Responder siempre 2xx en manejo exitoso/ignorado; 5xx solo en errores
  transitorios reales (para que Stripe reintente).

### Registro del endpoint

- Documentar en `.env.example` y en `docs/SETUP_GUIDE.md`: crear el webhook
  en el dashboard de Stripe apuntando a
  `https://{dominio}/api/webhooks/stripe` con los 4 event types, y pegar el
  `whsec_`. Para dev local: `stripe listen --forward-to
  localhost:3000/api/webhooks/stripe`.
- `next.config.js`: `no-store` para la ruta (paridad con otras superficies).

## Acceptance criteria

```gherkin
Given un checkout.session.completed con firma válida y pago 'created'
When llega el webhook
Then en UNA sentencia el pago queda paid y el RSVP confirmed+verified, y sale un email de confirmación

Given el mismo evento re-entregado por Stripe (replay)
When llega de nuevo
Then responde 200 sin re-mutar ni re-enviar email

Given firma inválida o body alterado
Then 400 sin tocar la base

Given session.expired de un pending vigente
Then pago y RSVP quedan expired y el asiento se libera

Given el pago se completa cuando la fila ya estaba expired y AÚN hay asiento
Then el RSVP se re-confirma y el pago queda paid

Given el pago se completa cuando ya NO hay asiento
Then el pago queda paid, el RSVP no se confirma, y se loggea PAYMENT_WITHOUT_SEAT

Given dos webhooks concurrentes del mismo session_id
Then exactamente uno muta (condición de status en la CTE)
```

## Tests requeridos

`tests/stripe-webhook.test.ts`: TODOS los criterios de arriba, con firma real
computada con el helper del SDK (`stripe.webhooks.generateTestHeaderString`)
sobre un secret de test — no mockear la verificación de firma.

## No hacer

- No enviar el email dentro de la sentencia ni antes de mutar.
- No usar el body parseado para la firma (raw text obligatorio).
- No confirmar RSVPs desde ningún otro endpoint.
