# E2E Runbook — Stripe Checkout payment flow (ISSUE-014 / EPIC-004)

Reproducible guion manual para verificar el flujo de pago completo (RSVP →
Stripe Checkout → webhook → confirmed) en **Stripe test mode**. Este runbook
NO se ejecuta en CI — es una checklist manual que José (o quien tenga las
claves test de Stripe) corre antes de cerrar EPIC-004, y cada vez que cambie
algo en la ruta de pago (`app/api/rsvp/route.ts` rama `pending_payment`,
`app/api/webhooks/stripe/route.ts`, `lib/stripe-checkout.ts`,
`lib/payment-config.ts`).

Lo automatizable (contrato de la ruta, shape de los params de Checkout,
idempotencia del webhook a nivel de query, rate-limit de la rama de pago) ya
vive en `tests/` con el SDK de Stripe mockeado — ver
`tests/rsvp-payment-route.test.ts`, `tests/stripe-checkout.test.ts`,
`tests/stripe-webhook.test.ts`, `tests/stripe-webhook-queries.test.ts`,
`tests/stripe-config.test.ts`, `tests/paid-plus-one-lock.test.ts`. Este
documento cubre lo que esos tests NO pueden probar: la integración real contra
la API de Stripe.

## Prerequisitos exactos

1. **Cuenta de Stripe en test mode** con acceso al dashboard
   (https://dashboard.stripe.com/test/apikeys).
2. **Stripe CLI** instalada y autenticada:
   ```bash
   brew install stripe/stripe-cli/stripe
   stripe login
   ```
3. **Variables de entorno** en `.env.local` (ver `.env.example` §PAGOS y
   `docs/SETUP_GUIDE.md`):
   ```bash
   DATABASE_URL=postgresql://...                # requerido, DB real (no in-memory demo mode)
   STRIPE_SECRET_KEY=sk_test_...                 # dashboard → Developers → API keys
   STRIPE_WEBHOOK_SECRET=whsec_...                # generado por `stripe listen` (ver paso 5) — NO el de dashboard/producción
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   RESEND_API_KEY=re_...                          # para verificar el email de confirmación
   ```
4. **Un evento de prueba** creado en `/admin` con:
   - Sección 💵 Precio: "Mostrar cuota de recuperación" ON, Monto = `10` (MXN
     — barato para no gastar de más ni siquiera en test mode), "💳 Requiere
     pago para confirmar" ON.
   - Sección 👥 Capacidad: "Limitar capacidad y mostrar cupo" ON, Límite de
     Personas = `1` (necesario para el escenario 4).
   - Anota el slug del evento: `stripe-e2e-20260818` (ejecución 2026-08-18).
5. **Servidor dev + listener corriendo en dos terminales separadas**:
   ```bash
   # Terminal A
   pnpm dev

   # Terminal B — imprime su propio whsec_ efímero, cópialo a STRIPE_WEBHOOK_SECRET
   # y reinicia `pnpm dev` en la Terminal A después de pegarlo.
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
6. **Tarjetas de prueba de Stripe** (https://stripe.com/docs/testing):
   - Pago exitoso: `4242 4242 4242 4242`, cualquier fecha futura, cualquier
     CVC, cualquier código postal.
   - No se necesita tarjeta de fallo para estos escenarios (todos ejercitan
     el camino de éxito/expiración/replay/capacidad, no un decline).

---

## Escenario 1 — Checkout feliz

**Objetivo:** RSVP en evento de pago → redirect a Checkout → pagar con
`4242…` → webhook → `confirmed` + email de confirmación.

- [x] 1.1 Ir a `http://localhost:3000/{slug}`, llenar el formulario de RSVP
      con un email real donde puedas revisar la bandeja (o usar el inbox de
      Resend en modo test/sandbox).
- [x] 1.2 Confirmar que la respuesta de `POST /api/rsvp` trae
      `status: "pending_payment"` y un `checkoutUrl` de
      `checkout.stripe.com`, y que el navegador redirige ahí.
- [x] 1.3 En la página hosted de Stripe, pagar con `4242 4242 4242 4242`.
- [x] 1.4 Verificar en la Terminal B (`stripe listen`) que llega
      `checkout.session.completed` con `200 received: true`.
- [x] 1.5 Verificar que el navegador termina en `/{slug}/pago?state=success&session_id=cs_...`
      y que la página muestra el estado confirmado (puede tardar hasta
      `POLL_ATTEMPTS(3) × POLL_INTERVAL_MS(2500ms)` ≈ 7.5s en pasar de
      "verificando" a "confirmado" mientras el polling a
      `GET /api/rsvp/payment-status` alcanza al webhook).
- [x] 1.6 Verificar en `/admin` (tabla de RSVPs del evento) que la fila pasó
      a `confirmed` y muestra el pago.
- [x] 1.7 Verificar que llegó el email de confirmación a la bandeja usada en
      1.1, con el link de cancelación.
- [x] 1.8 En el dashboard de Stripe (test mode → Payments), verificar que el
      cargo aparece como `Succeeded` por el total correcto (sin acompañante:
      monto por persona × 1 × 100).

**Fecha ejecutado:** 2026-08-18 **Resultado:** ☒ PASS ☐ FAIL — notas:
Rama Neon desechable, servidor en `localhost:3001` porque el puerto 3000 estaba
ocupado por el bridge local de WhatsApp. Checkout real test-mode por MXN 10.00
(`amount_total=1000`), `checkout.session.completed` → HTTP 200, RSVP
`confirmed`, pago `paid`, `paid_at` presente y Resend aceptó un único correo
al inbox de prueba `delivered@resend.dev` (`email_history_count=1`). La página
de retorno quedó en “Pago recibido”. La fila se verificó directamente en la
base aislada (misma fuente de `/admin`) y el cargo mediante Stripe API test.

---

## Escenario 1B — Cuota por persona con acompañante

**Objetivo:** un RSVP con +1 debe cobrar dos cuotas, persistir el mismo total
y congelar la cantidad mientras el pago esté abierto o completado.

> Este escenario se añadió tras la corrección del 2026-08-18 y está pendiente
> de una nueva corrida real. Usa un evento dedicado con capacidad mínima 2 o
> eleva temporalmente el límite; el evento de capacidad 1 del escenario 4 no
> puede aceptar titular + acompañante.

- [ ] 1B.1 Configurar cuota de `10 MXN`, `payment_required=true` y capacidad
      disponible de al menos 2 lugares.
- [ ] 1B.2 Abrir el modal, marcar acompañante y verificar **antes de enviar**
      que el resumen cambia de 1 cuota / `$10 MXN` a 2 cuotas / total
      `$20 MXN`; el CTA debe decir “Continuar al pago”.
- [ ] 1B.3 Enviar el RSVP, confirmar el redirect y verificar en Checkout que
      el precio unitario es `MXN 10.00`, la cantidad es `2` y el total es
      `MXN 20.00`.
- [ ] 1B.4 Pagar con `4242 4242 4242 4242` y esperar el webhook 200.
- [ ] 1B.5 Verificar en `/admin` que el RSVP está `confirmed`, conserva el +1
      y el total de pago mostrado es `MXN 20.00`.
- [ ] 1B.6 Verificar en DB/Stripe test que `rsvp_payments.amount_cents=2000`
      y que el cargo exitoso tiene `amount_total=2000`.
- [ ] 1B.7 Mientras el RSVP/sesión de prueba esté `pending_payment`/`created`, intentar
      cambiar el flag +1 desde el editor invitado y desde admin: ambos deben
      responder 409 con mensaje claro; tras expirar la sesión debe permitirse.
- [ ] 1B.8 Reenviar el webhook completado y comprobar de nuevo que no hay
      segundo email ni segundo cargo.

**Fecha ejecutado:** pendiente **Resultado:** ☐ PASS ☐ FAIL — notas:
Pendiente ejecutar contra Stripe test mode después de desplegar esta
corrección.

---

## Escenario 2 — Abandono / expiración de Checkout

**Objetivo:** abandonar el checkout (o forzar su expiración) → el asiento se
libera.

- [x] 2.1 Repetir 1.1–1.2 con un email DISTINTO al del escenario 1 (para no
      chocar con el `UNIQUE(event, email)` de `rsvps`).
- [x] 2.2 En la página hosted de Stripe, **no pagar** — copiar el
      `session_id` de la URL de retorno (queda en `cancel_url` si haces
      click en "atrás", o léelo del log de `POST /api/rsvp` /
      `createRsvpPaymentRecord`) y expirarlo manualmente en vez de esperar
      los 30 minutos reales:
      ```bash
      stripe trigger checkout.session.expired
      # o, más preciso (expira la sesión real, no una sintética):
      stripe checkout sessions expire cs_test_...   # requiere Stripe CLI >= 1.19
      ```
      Si tu versión de la CLI no soporta `checkout sessions expire`, usa
      `stripe trigger checkout.session.expired` (genera un evento sintético
      con un `session.id` de ejemplo — no golpeará tu fila real, así que en
      ese caso valida el manejador end-to-end contra `tests/stripe-webhook.test.ts`
      y limita esta verificación manual a confirmar que el evento llega con
      200; ver nota abajo) o simplemente espera los 30 minutos reales de
      vida de la Checkout Session.
- [x] 2.3 Verificar en Terminal B que llega `checkout.session.expired` con
      `200 received: true`.
- [x] 2.4 Verificar en `/admin` que la fila de RSVP pasó a `expired` (no
      queda `pending_payment` huérfana) y que `rsvp_payments.status` quedó
      `expired`.
- [x] 2.5 Si el evento tiene `capacityLimit`, verificar que el cupo mostrado
      al público subió de nuevo (el asiento se liberó).
- [x] 2.6 Repetir el RSVP con el MISMO email de 2.1 — debe permitir un nuevo
      intento de pago (la fila anterior ya no bloquea por email duplicado).

**Fecha ejecutado:** 2026-08-18 **Resultado:** ☒ PASS ☐ FAIL — notas:
Se expiró la Checkout Session real con Stripe CLI. El listener recibió
`checkout.session.expired` y respondió HTTP 200; RSVP y pago quedaron
`expired`, `pending_expires_at` se limpió, el asiento se liberó y el mismo
email obtuvo una nueva sesión `pending_payment`. Esa sesión de reintento se
expiró también durante la limpieza.

---

## Escenario 3 — Replay del webhook

**Objetivo:** reenviar el mismo evento (`stripe events resend`) no debe
duplicar el efecto (no doble email, no doble mutación).

- [x] 3.1 Completar el Escenario 1 hasta que la fila quede `confirmed`.
- [x] 3.2 Anotar el `Event ID` (`evt_...`) del `checkout.session.completed`
      que confirmó el pago (visible en el dashboard de Stripe → Developers →
      Events, o en el log de la Terminal B).
- [x] 3.3 Reenviarlo:
      ```bash
      stripe events resend evt_...
      ```
      o, desde el dashboard, el botón **Resend** en el detalle del evento.
- [x] 3.4 Verificar en Terminal B que el reenvío también responde
      `200 received: true` (no debe fallar ni reintentar Stripe).
- [x] 3.5 Verificar en `/admin` que la fila SIGUE en `confirmed` (mismo
      `paid_at`, no se movió) — el UPDATE con `WHERE status = 'created'`
      (ver `lib/queries.ts::fulfillPaidRsvp`) hace que el replay actualice
      cero filas.
- [x] 3.6 Verificar que NO llegó un segundo email de confirmación (revisar
      la bandeja o el dashboard de Resend).
- [x] 3.7 (Opcional, evidencia extra) Revisar logs del servidor — no debe
      aparecer un segundo `recordEmailSent` ni un segundo cargo en Stripe.

**Fecha ejecutado:** 2026-08-18 **Resultado:** ☒ PASS ☐ FAIL — notas:
Como `stripe events resend` solo reenvía a endpoints públicos registrados y
el objetivo de esta corrida era `localhost`, se recuperó el mismo evento real
de Stripe y se reenvió su payload exacto con una firma nueva generada por el
SDK contra el `whsec_` efímero del listener. Respondió HTTP 200; `status`,
`paid_at` y `email_sent` no cambiaron y `email_history_count` permaneció en 1.

---

## Escenario 4 — Carrera de capacidad (capacityLimit = 1)

**Objetivo:** con el evento de prueba en capacidad 1, dos invitados
simultáneos → uno paga, el otro recibe `CAPACITY_FULL` antes de llegar a
Stripe.

- [x] 4.1 Confirmar que el evento de prueba tiene `capacityLimit = 1` y
      capacidad actual libre (0 RSVPs `confirmed`/`pending_payment` activos;
      limpia cualquier fila de los escenarios anteriores primero, o usa un
      evento de prueba dedicado solo para este escenario).
- [x] 4.2 Invitado A: `POST /api/rsvp` con email A → debe obtener
      `pending_payment` + `checkoutUrl` (ocupa el único asiento vía el
      trigger `enforce_event_capacity` en el INSERT).
- [x] 4.3 Invitado B (SIN que A haya pagado ni expirado): `POST /api/rsvp`
      con email B (mismo evento) → debe recibir `409` con
      `"El evento está lleno — se alcanzó el límite de invitados"` (ver
      `app/api/rsvp/route.ts` catch de `capacidad máxima`) — nunca llega a
      llamar `stripe.checkout.sessions.create` para B.
      ```bash
      curl -s -X POST http://localhost:3000/api/rsvp \
        -H 'content-type: application/json' \
        -d '{"name":"B","email":"b@example.com","phone":"+525500000001","eventSlug":"{slug}"}' \
        -w '\n%{http_code}\n'
      ```
- [x] 4.4 Invitado A completa el pago con `4242…` → confirma normalmente
      (Escenario 1).
- [x] 4.5 (Variante) Repetir 4.2–4.3 pero dejando que la sesión de A EXPIRE
      (Escenario 2) antes de que B reintente — B debe poder ahora obtener el
      asiento liberado.
- [x] 4.6 (Nota de honestidad) Este escenario prueba la carrera a nivel de
      **trigger de capacidad de Postgres** (atómico por diseño — no hay
      ventana real de doble-venta incluso con dos requests verdaderamente
      simultáneos, porque el UPDATE/INSERT que cuenta capacidad corre dentro
      de la misma sentencia SQL). Simular la concurrencia real con dos
      `curl` disparados a la vez es opcional/extra evidencia; el caso
      determinista (A ya tiene el asiento, B llega después) en 4.2–4.3 ya
      cubre el contrato observable.

**Fecha ejecutado:** 2026-08-18 **Resultado:** ☒ PASS ☐ FAIL — notas:
Con capacidad 1, A obtuvo `pending_payment`; B recibió 409 con el mensaje
exacto de capacidad y no se creó RSVP ni pago para B. A pagó y terminó en
“Pago recibido”. En la variante, A2 ocupó el asiento, B2 recibió 409, A2 se
expiró por Stripe con webhook 200 y B2 obtuvo después una nueva Checkout
Session 201. La sesión final de B2 se expiró durante la limpieza.

---

## Limpieza post-runbook

- [x] Cancelar/reembolsar en el dashboard de Stripe cualquier cargo de
      prueba que haya quedado (no afecta dinero real en test mode, pero
      mantiene el dashboard legible).
- [x] Borrar o archivar el evento de prueba en `/admin` si no se va a
      reusar.
- [x] Detener `stripe listen` (Terminal B) y `pnpm dev` (Terminal A).

Limpieza 2026-08-18: dos reembolsos test-mode por 1000 MXN-centavos cada uno;
ambos `charge.refunded` respondieron HTTP 200. Se detuvieron los procesos y se
eliminó la rama Neon desechable `br-lively-frog-ahs0ml91`, con lo que también
se eliminó el evento sintético.

---

## Hardening verification (ISSUE-014)

Checklist del issue, verificada con evidencia real (grep/lectura/tests) el
**2026-08-18**. Comandos ejecutados desde la raíz del repo
(`/Users/bob/TimeKast/partytime`).

### 1. Ningún log imprime `STRIPE_SECRET_KEY`, `whsec_`, ni el objeto session completo

**Estado: PASS**

```bash
$ grep -n "console\." app/api/rsvp/route.ts app/api/rsvp/payment-status/route.ts \
    app/api/webhooks/stripe/route.ts lib/stripe.ts lib/stripe-checkout.ts lib/payment-config.ts
```

Resultado: todos los `console.error`/`console.warn`/`console.info` en la
ruta de pago logean únicamente: nombres de error (`error instanceof Error ?
error.name : 'UnknownError'`), mensajes estáticos en español, o IDs internos
no sensibles (`rsvpId`, `eventId`, `stripeSessionId` — nunca el secreto ni
PII). Ejemplos puntuales:

- `app/api/webhooks/stripe/route.ts:55` — solo `err.name`, nunca el body ni
  la firma.
- `lib/queries.ts::logPaymentWithoutSeat` (usado por `fulfillPaidRsvp`) —
  explícitamente comentado "no PII (no email/name), and never the raw
  Stripe session object".
- `lib/stripe.ts:9` — el único `console.warn` de este archivo es un aviso
  genérico de que la key NO está configurada (`'⚠️  STRIPE_SECRET_KEY no
  configurado...'`), nunca imprime el valor.

```bash
$ grep -rn "STRIPE_SECRET_KEY\|whsec_" app lib --include="*.ts" --include="*.tsx" \
    | grep -v "process.env.STRIPE_SECRET_KEY\|process.env.STRIPE_WEBHOOK_SECRET"
```

Resultado: cero coincidencias fuera de las dos referencias esperadas a
`process.env.*` (que leen la var, nunca la loguean) y un comentario/label de
UI en `app/admin/page.tsx` que solo menciona el NOMBRE de la variable
(`"falta STRIPE_SECRET_KEY"`), nunca su valor.

### 2. `payment-status`: `no-store`, formato `cs_` validado, sin PII

**Estado: PASS** (ya estaba correcto, se verificó sin necesidad de cambios)

- `app/api/rsvp/payment-status/route.ts:6` — `NO_STORE_HEADERS = {
  'Cache-Control': 'no-store' }`, aplicado en las 4 respuestas de la ruta
  (200/400/404/500/503).
- `app/api/rsvp/payment-status/route.ts:10,25` —
  `SESSION_ID_PATTERN = /^cs_[a-zA-Z0-9_]+$/`, validado ANTES de cualquier
  lookup a DB.
- `lib/queries.ts::getRsvpPaymentStatusBySessionId` — `db.select({ status:
  rsvpPayments.status })...` — proyección explícita de una sola columna, no
  `select *`; imposible devolver PII aunque cambie el shape de la tabla.
- Confirmado en tests: `tests/rsvp-payment-route.test.ts` describe `GET
  /api/rsvp/payment-status (ISSUE-011)` — 5 tests cubren no-store, rechazo
  de formato inválido antes de la DB, 404 sin filtrar nada extra, y 503 sin
  DB configurada.

### 3. Montos: nunca floats, todo integer cents

**Estado: PASS**

```bash
$ grep -n "priceAmount\|amountCents" lib/schema.ts
```

Resultado: `priceAmount: integer('price_amount')` (evento, unidades enteras
de la moneda) y `amountCents: integer('amount_cents').notNull()`
(`rsvp_payments`, con `CHECK (amount_cents > 0)`). Ambas columnas son
`integer` de punta a punta — no hay `numeric`/`decimal`/`float` en el camino
de pago.

`lib/payment-config.ts::derivePaymentAmountCents` — `(event.priceAmount ??
0) * 100`, multiplicación entera sobre entero, sin división ni redondeo.
`deriveRsvpPaymentPricing` multiplica esa cuota unitaria por `quantity=1|2`
derivada del RSVP persistido; el resultado entero es el total guardado en
`rsvp_payments.amount_cents` (`Number.isFinite`/`toFixed`/`parseFloat` no
aparecen en este archivo).

```bash
$ grep -rn "parseFloat\|toFixed\|Number(" app/api/rsvp/route.ts \
    app/api/rsvp/payment-status/route.ts app/api/webhooks/stripe/route.ts \
    lib/stripe.ts lib/stripe-checkout.ts lib/payment-config.ts
```

Resultado: cero coincidencias. El único `Number(...)` relacionado con pagos
en todo el repo está en `lib/queries.ts:1278`
(`amountCents: row.amount_cents == null ? null : Number(row.amount_cents)`)
— convierte el valor ya-entero que Postgres devuelve como string/bigint a
`number` de JS para el DTO admin, no reintroduce decimales.

### 4. `.env.example` documenta las vars de Stripe y el runbook de webhook

**Estado: PASS con una nota de precisión sobre el texto del issue**

`.env.example` §"PAGOS - STRIPE" documenta `STRIPE_SECRET_KEY` y
`STRIPE_WEBHOOK_SECRET`, con comentarios inline que:
- explican que son opcionales (solo eventos con cobro) y server-side only
  (nunca `NEXT_PUBLIC_STRIPE_*`, con la razón: Checkout es hosted por
  redirect);
- listan los 4 event types a seleccionar en el dashboard;
- remiten a `docs/SETUP_GUIDE.md` para el detalle completo del runbook de
  webhook (dashboard producción + Stripe CLI local).

Nota: el texto del issue dice "documenta las 3 vars" pero
`grep -rn "process.env.STRIPE" app lib` solo encuentra **2** variables
consumidas en todo el código: `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`
(no existe un tercer `STRIPE_*` en el repo — no hay publishable key ni
price ID hardcodeado, consistente con el diseño "Checkout es hosted, cero
Stripe.js en el frontend" documentado en `lib/stripe-checkout.ts`). La
tercera variable relevante para construir las URLs de éxito/cancelación del
checkout es `NEXT_PUBLIC_APP_URL`, que ya está documentada en
`.env.example` bajo su propia sección "URL PÚBLICA" (compartida con
emails/OG, no exclusiva de pagos). No se agregó una variable ficticia para
cuadrar el número — se documenta lo que el código realmente consume.

### 5. Webhook no bloqueado por middleware/auth; timeout suficiente

**Estado: PASS**

```bash
$ ls middleware.ts   # No such file or directory
```

No existe `middleware.ts` en el repo — no hay ningún matcher global que
pueda interceptar `/api/webhooks/stripe`.

`next.config.js` solo define `headers()` (no `redirects()`/`rewrites()` que
puedan desviar el POST); la entrada específica para
`/api/webhooks/stripe` solo añade `Cache-Control: private, no-store,
max-age=0`, documentada como "belt-and-suspenders" ya que la ruta ya fija
su propio `no-store` en cada respuesta.

`app/api/webhooks/stripe/route.ts` no importa ni depende de
`validateSession`/`cookies` — a diferencia de `GET /api/rsvp` (que sí
requiere sesión admin), el webhook es público por diseño y se autentica
exclusivamente por la firma HMAC de Stripe (`stripe.webhooks.constructEvent`
con `STRIPE_WEBHOOK_SECRET`), fail-closed (503) si el secret no está
configurado.

Timeout: la ruta no define `export const maxDuration`, por lo que hereda el
default de Vercel (10s en plan Hobby / 15s Pro por función, salvo
`vercel.json` diga lo contrario). `vercel.json` solo configura el cron
(`/api/cron/send-reminders`), sin overrides de `functions`/`maxDuration`
para el webhook. El handler hace una sola query DB (una sentencia CTE) más,
en el camino feliz, un envío a Resend — sin llamadas de red adicionales a
Stripe. El default es suficiente para ese trabajo; no se detectó necesidad
de un `maxDuration` explícito.

### 6. Rate-limit de la rama de pago en `POST /api/rsvp`

**Estado: NO EXISTÍA — AGREGADO en esta sesión**

Antes de este cambio, `POST /api/rsvp` no tenía ningún rate limiter (el
único uso existente de `lib/bounded-rate-limiter.ts` en el repo era en
`/api/auth/forgot-password` y `/api/rsvp/resend-verification`) — nada
impedía spamear la creación de Checkout Sessions.

**Cambio:** `app/api/rsvp/route.ts` — nuevo
`BoundedFixedWindowRateLimiter` module-level (`paymentBranchRateLimiter`),
presupuesto **5 intentos / 10 minutos**, clave `${ip}:${eventId}` (IP vía
`X-Forwarded-For`, primer hop, igual normalización que
`resend-verification`'s `requestIpOf`). El check corre como lo PRIMERO
dentro de la rama `rsvp.status === RSVP_STATUS.PENDING_PAYMENT` — antes de
`getActivePaymentForRsvp`, `stripe.checkout.sessions.expire` y
`stripe.checkout.sessions.create` — así que un request limitado nunca toca
la red de Stripe. Responde `429` con
`{ error: 'Demasiados intentos de pago para este evento. Intenta de nuevo en unos minutos.' }`
(mensaje reintentable, mismo estilo que el 429 existente de
`/api/auth/login`).

**Presupuesto del RSVP gratis: intacto.** El limiter nuevo es una instancia
separada, solo referenciada dentro del `if (rsvp.status ===
RSVP_STATUS.PENDING_PAYMENT)`; la rama gratis (`saveRSVP` /
`saveRsvpWithInvitation` sin pago) nunca la toca.

**Limitación conocida y documentada (no bloqueante):** el check corre
DESPUÉS de que la fila `pending_payment` ya fue persistida/reusada
(`saveRSVPPendingPayment` o la CTE de `saveRsvpWithInvitation`) — no antes.
Esto es intencional: en el camino de invitación, si el request resulta en
pago o no lo decide la CTE misma leyendo `invitation_event.payment_required
AND NOT candidate.is_courtesy` en el momento del INSERT (ver comentario en
`app/api/rsvp/route.ts` sobre `verificationCandidate`/`paymentCandidate`) —
la ruta no puede saberlo de antemano sin duplicar esa decisión fuera de la
CTE, algo explícitamente prohibido para esta tarea (no tocar el CTE de
fulfillment/webhook). El limiter por tanto protege específicamente la
llamada a la API de Stripe (el objetivo literal del ítem del issue:
"no se puede spamear creación de sesiones de Checkout"), no el consumo de
capacidad/fila en DB por sí solo — ese es un problema más amplio de
rate-limiting general de `POST /api/rsvp` (aplica igual a la rama gratis),
fuera del alcance de este issue.

**Tests nuevos** — `tests/rsvp-payment-route.test.ts`, describe `POST
/api/rsvp — payment branch rate limit (ISSUE-014)` (5 tests):
1. corta el 6º intento desde la misma IP+evento con 429 retryable, sin
   tocar Stripe una 6ª vez;
2. el camino de invitación comparte el mismo presupuesto IP+evento (la CTE
   corre igual, pero Stripe nunca se llama en el intento bloqueado);
3. una IP distinta no hereda el budget agotado de otra;
4. un slug de evento distinto no hereda el budget agotado de otro;
5. la rama gratis (`paymentRequired: false`) nunca es limitada — 8
   requests seguidos desde la misma IP, todos 201.

Evidencia de ejecución:

```bash
$ npx vitest run tests/rsvp-payment-route.test.ts
 ✓ tests/rsvp-payment-route.test.ts (21 tests) 52ms
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

### Verificación de suite completa post-cambio

```bash
$ pnpm lint
✔ No ESLint warnings or errors

$ pnpm test
 Test Files  62 passed (62)
      Tests  641 passed (641)

$ npx tsc --noEmit
(sin output — 0 errores)

$ pnpm build
✓ Compiled successfully
✓ Generating static pages (18/18)
```

### Archivos tocados por el hardening de esta sesión

- `app/api/rsvp/route.ts` — nuevo rate limiter de la rama de pago
  (`paymentBranchRateLimiter`, `requestIpOf`, check al entrar a
  `PENDING_PAYMENT`).
- `tests/rsvp-payment-route.test.ts` — nuevo describe con 5 tests para el
  rate limiter; `request()`/`invitationRequest()` ahora aceptan headers
  override y generan una IP única por default (mismo patrón que
  `tests/rsvp-resend-verification-route.test.ts`) para que las llamadas
  existentes no compartan accidentalmente el presupuesto del limiter nuevo.
- `docs/features/payments/E2E_RUNBOOK.md` — este archivo (nuevo).

Ningún archivo del webhook (`app/api/webhooks/stripe/route.ts`) ni del CTE
de fulfillment (`lib/queries.ts::fulfillPaidRsvp` y vecinos) fue modificado.
