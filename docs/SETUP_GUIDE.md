# Setup Guide

Guías de configuración puntuales que no caben cómodamente en el `README.md`
principal. Hoy solo cubre el webhook de Stripe (ISSUE-012); si crece, se
divide en archivos por tema.

## Webhook de Stripe (`POST /api/webhooks/stripe`)

Cobro con Stripe es opcional por evento (`payment_required`, ver
[`docs/backlog/PLAN-EPICS-002-005.md`](backlog/PLAN-EPICS-002-005.md) §3.3).
Este endpoint es la **única autoridad** que confirma un RSVP pagado — nada
más en la app pone `rsvps.status = 'confirmed'` a partir de un pago.

### Producción / staging (dashboard de Stripe)

1. En el [dashboard de Stripe](https://dashboard.stripe.com/webhooks) →
   **Developers → Webhooks → Add endpoint**.
2. URL del endpoint: `https://{tu-dominio}/api/webhooks/stripe`.
3. Selecciona exactamente estos 4 event types (el endpoint ignora — responde
   200 sin hacer nada — cualquier otro tipo que Stripe te ofrezca):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded` (paridad para métodos
     asíncronos como OXXO/SPEI, si se habilitan más adelante)
   - `checkout.session.expired`
   - `charge.refunded`
4. Al crear el endpoint, Stripe te muestra el **Signing secret**
   (`whsec_...`) una sola vez. Cópialo a `STRIPE_WEBHOOK_SECRET` en las
   variables de entorno del deploy (Vercel → Settings → Environment
   Variables). Sin esta variable configurada el endpoint responde `503` a
   toda entrega — nunca procesa un evento sin poder verificar su firma.
5. Verifica en el dashboard, pestaña del endpoint, que las entregas de
   prueba lleguen con `200 received: true`.

### Desarrollo local (Stripe CLI)

No crees un endpoint de dashboard para tu máquina local — usa la Stripe CLI,
que reenvía eventos reales a `localhost` y genera su propio `whsec_` efímero
por sesión:

```bash
# Una sola vez: instala y autentica la CLI
brew install stripe/stripe-cli/stripe
stripe login

# Con `next dev` corriendo en otra terminal:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

El comando imprime algo como:

```
Ready! Your webhook signing secret is whsec_xxxxxxxx...
```

Copia ese valor a `STRIPE_WEBHOOK_SECRET` en `.env.local` (reemplaza el
`whsec_` de dashboard/producción; son secretos distintos) y reinicia
`next dev`. Para disparar un evento manualmente sin correr el flujo de
checkout completo:

```bash
stripe trigger checkout.session.completed
```

### Qué hace cada evento (referencia rápida)

Ver el detalle completo (incluyendo casos borde de idempotencia/carrera) en
[`docs/backlog/ISSUE-012-stripe-webhook.md`](backlog/ISSUE-012-stripe-webhook.md).

| Evento | Efecto |
|---|---|
| `checkout.session.completed` / `checkout.session.async_payment_succeeded` | `rsvp_payments` → `paid`; RSVP → `confirmed` + `verified_at`; email de confirmación |
| `checkout.session.expired` | `rsvp_payments` → `expired`; RSVP → `expired`; se libera el asiento y se restaura el link de invitación privado, si venía de uno |
| `charge.refunded` | `rsvp_payments` → `refunded` + `refunded_at`. NO cancela el RSVP — es decisión manual del organizador |
| Cualquier otro tipo | 200, ignorado |

### Reenvíos manuales / debugging

Cada evento en el dashboard de Stripe tiene un botón **Resend**. Como el
endpoint es idempotente por `stripe_session_id` / `stripe_payment_intent_id`,
reenviar un evento ya procesado responde 200 sin volver a mutar nada ni
reenviar el email de confirmación.
