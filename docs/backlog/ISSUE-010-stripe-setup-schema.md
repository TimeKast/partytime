# ISSUE-010 — Setup Stripe: dependencia, cliente lazy, migración 0010 y config de evento

- **Epic:** EPIC-004
- **Priority:** P0
- **Story points:** 3
- **Status:** Pending
- **Dependencies:** ISSUE-005, ISSUE-006
- **User stories:** US-008
- **Agents:** backend-specialist, database (via /database)
- **Skills:** implement, database, backend

## Objetivo

Base de pagos sin flujo todavía: dependencia, cliente, schema y el flag de
evento con su UI de admin.

## Cambios exactos

### Dependencia y cliente

- `pnpm add stripe` (SDK server-side; NO `@stripe/stripe-js` — usamos
  Checkout hosted por redirect).
- `lib/stripe.ts` (nuevo): cliente lazy con Proxy, **copiando el patrón de
  `lib/resend.ts`** — importar el módulo nunca truena sin
  `STRIPE_SECRET_KEY` (build/CI safe); `apiVersion` pineada a la actual del
  SDK instalado. Export `isStripeConfigured()`.
- `.env.example`: `STRIPE_SECRET_KEY=`, `STRIPE_WEBHOOK_SECRET=` con
  comentario de dónde obtenerlas.

### Migración `drizzle/0010_rsvp_payments.sql` + `lib/schema.ts`

En `events`:
- `payment_required` boolean NOT NULL DEFAULT false.

Tabla nueva `rsvp_payments`:
- `id` uuid PK DEFAULT gen_random_uuid()
- `rsvp_id` integer NOT NULL → FK `rsvps.id` ON DELETE RESTRICT
- `event_id` varchar NOT NULL → FK `events.slug` ON UPDATE CASCADE
  (misma convención slug que `rsvps.event_id` — gotcha #1 del PLAN)
- `stripe_session_id` varchar(255) NOT NULL UNIQUE  ← clave de idempotencia
- `stripe_payment_intent_id` varchar(255) NULL
- `amount_cents` integer NOT NULL CHECK (amount_cents > 0)
- `currency` varchar(10) NOT NULL
- `status` varchar(20) NOT NULL DEFAULT 'created'  — `created|paid|expired|refunded`
- `created_at` timestamp NOT NULL DEFAULT now(), `paid_at`, `refunded_at` NULL
- índice sobre `rsvp_id` y sobre `(event_id, status)`

Actualizar los tres guardarraíles (`lib/migration-preflight.ts`,
`lib/migration-semantic-contract.ts`, `scripts/verify-db-contract.ts`) y el
journal, igual que ISSUE-005. Aplicar solo en rama Neon desechable.

### Validación de config de evento

- En el contrato de settings (`lib/event-api-contract.ts` + ruta de settings):
  `payment_required=true` **solo** es válido si `price_enabled=true`,
  `price_amount > 0` y `price_currency ∈ {MXN, USD}`. Al desactivar
  `price_enabled` con `payment_required=true` → 400 con mensaje claro.
- El monto a cobrar SIEMPRE se deriva: `amount_cents = price_amount * 100`.
  No existe un segundo campo de monto (fuente única, PLAN §3.3).

### Admin UI

- Toggle "Requiere pago para confirmar" en settings del evento, solo
  habilitado si hay precio configurado; helper text: "Se cobrará exactamente
  el precio mostrado ($X MXN) vía Stripe. Los links privados de invitación
  no pagan." Aviso si `isStripeConfigured()` es false (exponer flag por la
  ruta admin, nunca la key).

## Acceptance criteria

```gherkin
Given un entorno sin STRIPE_SECRET_KEY
When corre pnpm build y la suite
Then nada truena (cliente lazy) y el admin muestra el aviso de no configurado

Given price_enabled=false o price_amount=0
When el admin intenta activar payment_required
Then el API responde 400 y la UI lo previene

Given la migración 0010 en rama Neon desechable
When corren db:preflight y verify-db-contract
Then pasan y rsvp_payments existe con su unique de sesión

Given un evento con precio $250 MXN y payment_required
Then el monto derivado es exactamente 25000 centavos MXN (test unitario)
```

## Tests requeridos

`tests/stripe-config.test.ts`: derivación de monto, whitelist de moneda,
validación cruzada de settings, cliente lazy sin env.
