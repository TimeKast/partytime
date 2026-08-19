# ISSUE-011 — Flujo de Checkout: pending_payment + sesión Stripe + retorno

- **Epic:** EPIC-004
- **Priority:** P0
- **Story points:** 5
- **Status:** Completed (2026-08-18)
- **Dependencies:** ISSUE-010
- **User stories:** US-009
- **Agents:** backend-specialist, frontend-specialist
- **Skills:** implement, backend, sk-api

## Objetivo

Del submit del RSVP al redirect a Stripe, y las páginas de retorno. La
confirmación real llega SOLO por webhook (ISSUE-012) — las páginas de retorno
son informativas, nunca mutan estado.

## Flujo exacto (`app/api/rsvp/route.ts` POST, rama de pago)

La rama de pago aplica cuando `event.paymentRequired` Y (no hay
`invitationToken`, O el link tiene `is_courtesy=false` — PLAN §2.1). Un link
cortesía (default) confirma directo sin Stripe. En el caso invite+pago, el
link se consume atómicamente al crear la fila `pending_payment` (CTE de
`saveRsvpWithInvitation`) y se restaura si la fila expira sin pagar
(ISSUE-005/012).

1. `await expireStalePendingRsvps(slug)` (ya cableado si ISSUE-007 se hizo;
   si no, cablearlo aquí — es idempotente).
2. Validaciones normales (nombre/email/phone/+1) intactas.
3. Crear/refrescar fila `pending_payment` con
   `pending_expires_at = now() + 35 min` vía `saveRSVPOnce` extendido:
   - email nuevo → INSERT pending (el trigger de capacidad puede rechazar →
     409 CAPACITY_FULL, igual que hoy).
   - fila propia `pending_payment` vigente → reutilizarla solo con el mismo
     tamaño de grupo; **expirar la sesión Stripe anterior** y crear una nueva
     únicamente cuando Stripe confirme `expired` + `unpaid`. Si reporta
     `open`/`complete` o no puede verificarse, conservar la fila `created`, no
     crear otra Checkout y responder 409 reintentable.
   - fila `confirmed` existente → 409 "ya estás registrado" (comportamiento
     dedupe actual).
4. Crear Checkout Session:
   - `mode: 'payment'`, `line_items` con `price_data` inline:
     `{ currency, unit_amount: priceAmount*100, product_data: { name:
     "Reservación — {event.name}" } }`. `quantity` sale de la fila RSVP ya
     persistida: `1` para el titular y `2` cuando `plus_one=true`. La cuota es
     por persona; nunca se confía en el body del cliente para fijar cantidad.
   - `customer_email`: email del RSVP (queda bloqueado en Checkout).
   - `metadata: { rsvpId, eventSlug }` y también en `payment_intent_data.metadata`.
   - `expires_at`: now + 30 min (mínimo de Stripe).
   - `success_url: {APP_URL}/{slug}/pago?state=success&session_id={CHECKOUT_SESSION_ID}`,
     `cancel_url: {APP_URL}/{slug}/pago?state=cancelled`.
5. Insertar fila `rsvp_payments` status `created` con `stripe_session_id`,
   `amount_cents = unit_amount * quantity`, `currency`.
6. Responder `{ status: 'pending_payment', checkoutUrl: session.url }`.
7. Errores de Stripe (red/API) → NO dejar pending huérfano sin sesión:
   marcar la fila `expired` en el catch y responder 502 con mensaje
   reintentable.

## Frontend

- El DTO público expone el booleano seguro `paymentRequired` (sin registros ni
  IDs de Stripe). `RSVPModal.tsx` muestra antes del submit la cuota por persona
  y el total dinámico de 1/2 cuotas; al marcar +1 actualiza el total anunciado
  con `aria-live`. Los links de cortesía usan su `requiresPayment` efectivo y
  no muestran cuota ni resumen de cobro.
- Respuesta `pending_payment` → copy "Te llevamos a un pago seguro con
  Stripe…" y `window.location.assign(checkoutUrl)`.
- `app/[slug]/pago/page.tsx` (nuevo, client): lee `state`:
  - `success`: "¡Pago recibido! Tu lugar está confirmado — te llegará el
    comprobante de Stripe y tu confirmación por correo." Poll ligero
    (2-3 intentos) a un endpoint de status por `session_id` para mostrar
    check verde cuando el webhook ya procesó; si aún no, copy "se está
    confirmando, revisa tu correo en unos minutos". **Nunca** confiar en el
    query param para marcar nada.
  - `cancelled`: "No se completó el pago. Tu lugar se libera en unos minutos;
    puedes intentar de nuevo." con CTA de reabrir el modal.
- Endpoint de status: `GET /api/rsvp/payment-status?session_id=` → responde
  SOLO `{ status: 'created'|'paid'|'expired' }` leyendo `rsvp_payments`
  (sin PII, `no-store`, validar formato del id `cs_...`).

## Acceptance criteria

```gherkin
Given evento con payment_required y capacidad disponible
When el invitado envía RSVP válido
Then queda pending_payment con TTL 35min, existe rsvp_payments 'created' y el modal redirige al url de Stripe

Given el mismo email reintenta mientras su pending sigue vivo
When llega el segundo POST
Then se reutiliza la fila, la sesión anterior se expira en Stripe y solo hay una sesión activa

Given Stripe API caída
When el POST intenta crear la sesión
Then la fila no queda pending huérfana (queda expired) y el invitado recibe error reintentable

Given un invitado con link privado cortesía (is_courtesy=true, default) en evento de pago
Then confirma directo sin pasar por Stripe

Given un invitado con link privado NO cortesía en evento de pago
Then queda pending_payment con el link consumido y redirige a Stripe; si la sesión expira sin pagar, el link se restaura

Given un RSVP persistido con acompañante
When se crea Checkout
Then Stripe cobra dos unidades de la cuota por persona y rsvp_payments.amount_cents guarda ese total

Given un RSVP pending_payment, un Checkout created o un pago paid
When invitado o admin intenta agregar o quitar el acompañante
Then la API responde 409 y no desincroniza la cantidad ya cotizada/cobrada

Given la página de éxito con session_id ajeno o basura
Then el endpoint de status no filtra nada más que el estado y valida formato
```

## Tests requeridos

`tests/stripe-checkout.test.ts`, `tests/rsvp-payment-route.test.ts` y
`tests/paid-plus-one-lock.test.ts` mockeando el SDK/query layer: creación de
sesión con cuota/cantidad/total correctos, autoridad del RSVP persistido,
reuso de fila pendiente, cierre de carreras de party-size, bypass de invite y
payment-status sin PII.

## No hacer

- No confirmar nada en success_url (solo el webhook confirma).
- No usar Stripe.js/Elements ni claves públicas.

## Corrección posterior a entrega — 2026-08-18

Se reemplazó la decisión MVP “precio por RSVP” por “cuota por persona” tras
feedback E2E. La ruta ahora relee el RSVP después de crear el registro de pago
y descarta con 409 una Checkout cuya cantidad haya quedado obsoleta por una
carrera. Los cambios reales de `plus_one` quedan bloqueados de forma atómica
desde `pending_payment` y mientras exista un pago `created` o `paid`;
`expired`/`refunded` permiten una nueva selección. La expiración de una sesión
anterior se reconcilia contra Stripe y nunca falsea `expired` ante un estado
`open`, `complete` o no verificable.
