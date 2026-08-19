# PLAN — Cobro con Stripe, verificación por email y portal de check-in

- **Fecha:** 2026-08-18
- **Epics:** EPIC-002 (estados pendientes), EPIC-003 (verificación email), EPIC-004 (Stripe), EPIC-005 (check-in)
- **Issues:** ISSUE-005..ISSUE-019
- **Origen del plan:** sesión Fable 5 (tier ≥ Opus; cumple regla "Opus planea, Sonnet ejecuta")

## 1. Resumen ejecutivo

Dos features nuevas sobre la app de eventos:

1. **Cobro opcional por RSVP vía Stripe** — un evento puede exigir pago para
   confirmar asistencia. Checkout hosted de Stripe (redirect), webhook de
   confirmación, asiento reservado mientras el pago está pendiente.
2. **Portal de check-in** — pantalla `/checkin/[slug]` protegida con password
   sencillo por evento, compartible con staff sin cuenta (recepción/seguridad),
   para marcar llegadas y notas en tiempo real.

Más una tercera capacidad de soporte que José planteó como duda de diseño:

3. **Verificación de email del asistente** — opcional por evento.

## 2. Decisión de diseño: ¿verificación de email obligatoria cuando hay cobro?

**Pregunta de José:** si el evento cobra con Stripe, ¿debería ser obligatorio
verificar el email antes?

**Decisión: NO como paso previo explícito. El pago ES la verificación.**

Razones:

- Stripe Checkout ya captura y usa el email (recibo de pago). Nosotros pasamos
  el email del RSVP como `customer_email` **bloqueado** en la sesión de
  Checkout, así el recibo de Stripe y nuestra confirmación van a la misma
  dirección. Un typo de email se descubre porque el recibo no llega — y el
  pago exitoso prueba intención real mucho más fuerte que un clic en un link.
- Un paso extra de "verifica tu correo" ANTES de pagar agrega fricción justo
  en el punto de conversión: checkouts abandonados = dinero perdido.
- Al recibir `checkout.session.completed` marcamos el RSVP `confirmed` **y**
  `verified_at = now()` en la misma sentencia. Verificación implícita.

Reglas resultantes:

| Evento | Verificación email | Flujo |
|---|---|---|
| Gratis, toggle OFF | ninguna (comportamiento actual) | RSVP → confirmed |
| Gratis, toggle ON | explícita por link | RSVP → pending_verification → clic → confirmed |
| De pago | implícita por pago | RSVP → pending_payment → webhook → confirmed + verified |

Si `payment_required = true`, el toggle `email_verification_enabled` se ignora
(el pago lo supersede). La UI de admin lo comunica.

### 2.1 Links privados de invitación: flags por link (decisión de José, 2026-08-18)

Cada link privado lleva DOS flags que el organizador elige al crearlo
(columnas en `rsvp_invitation_links`, ambas DEFAULT true):

- `is_courtesy` — cortesía: el invitado NO paga aunque el evento sea de pago.
  Con `false` en evento de pago, el invitado pasa por Stripe igual que el
  flujo público.
- `skip_verification` — el invitado NO verifica email aunque el evento tenga
  verificación activada. Con `false`, pasa por `pending_verification`.

Matriz de decisión al registrar vía link (el pago supersede verificación,
igual que en el flujo público):

| Evento de pago + `is_courtesy=false` | → `pending_payment` → Stripe → confirmed+verified |
|---|---|
| Si no, verificación ON + `skip_verification=false` | → `pending_verification` → clic → confirmed |
| Si no (defaults) | → `confirmed` directo (comportamiento actual) |

**Restauración de links:** el consumo del link sigue siendo atómico al crear
el RSVP (nada de links "reservados"). Pero si la fila pendiente creada por un
link **expira** sin pagar/verificar, la expiración (lazy o por webhook)
**restaura el link** en la misma sentencia (`used_at=NULL`,
`used_rsvp_id=NULL`, solo si no está revocado ni vencido) para que el
invitado pueda reintentar con su mismo link.

## 3. Arquitectura

### 3.1 Estados de RSVP (EPIC-002, fundacional)

`rsvps.status` hoy: `confirmed | cancelled`. Se agregan:

- `pending_verification` — esperando clic en link de verificación (TTL 24 h)
- `pending_payment` — esperando webhook de Stripe (TTL 35 min, alineado a la
  expiración de 30 min de la sesión de Checkout + margen)
- `expired` — pendiente que venció; libera asiento; el email queda libre para
  reintentar (se reactiva la misma fila por el unique `(event_id, lower(email))`)

**Capacidad:** el trigger `enforce_event_capacity()` (drizzle/0002) pasa a
contar `confirmed + pending_payment + pending_verification` — los pendientes
**reservan asiento** para no sobrevender durante el checkout. La transición
pending→confirmed es neutra en asientos (ambos cuentan), así el trigger no
rechaza la confirmación.

**Expiración lazy, sin cron nuevo:** columna `rsvps.pending_expires_at`.
Antes de cada intento de RSVP sobre un evento se ejecuta un UPDATE que expira
los pendientes vencidos de ese evento (una sentencia, patrón CTE). Además el
webhook `checkout.session.expired` expira su fila directamente. No dependemos
de la frecuencia de crons de Vercel.

### 3.2 Verificación por email (EPIC-003)

- Patrón de token: **copiar `password_reset_tokens`** (hash-only SHA-256,
  expiry, comparación timing-safe) — NO el patrón débil del cancel-token.
  Se usan columnas en `rsvps`: `verification_token_hash`,
  `verification_expires_at`, `verified_at` (reissue = overwrite).
- Flujo: RSVP → fila `pending_verification` + email con link
  `/verify/[slug]?token=...` → `POST /api/rsvp/verify` valida y confirma en
  una sentencia → email de confirmación normal (el existente).
- Reenvío permitido con rate-limit (`lib/bounded-rate-limiter.ts`).
- Reactivaciones (`saveRSVPOnce`, `saveRsvpWithInvitation` en
  `lib/queries.ts`) **resetean** el estado de verificación si cambió el email.

### 3.3 Stripe (EPIC-004)

- **Stripe Checkout hosted (redirect)** — cero PCI scope, sin Stripe.js en el
  frontend, sin `NEXT_PUBLIC_STRIPE_*`. Solo `STRIPE_SECRET_KEY` y
  `STRIPE_WEBHOOK_SECRET` server-side.
- **Fuente única de precio:** `payment_required` (bool nuevo en `events`)
  exige `price_enabled && price_amount > 0`. `price_amount * 100` es la cuota
  unitaria por persona en `price_currency` (whitelist MXN/USD); Checkout usa
  `quantity=1|2` desde el RSVP persistido y guarda como `amount_cents` el total
  unitario × cantidad. Nunca hay un monto editable paralelo que pueda
  divergir entre display y cobro. Antes de enviar el RSVP, el modal público
  presenta la cuota por persona y recalcula el total visible al marcar +1;
  links de cortesía no presentan cobro.
- Tabla nueva `rsvp_payments` (sigue convención `event_id = slug`):
  id, rsvp_id, event_id, stripe_session_id (unique), stripe_payment_intent_id,
  amount_cents, currency, status (`created|paid|expired|refunded`),
  created_at, paid_at, refunded_at.
- **Webhook** `POST /api/webhooks/stripe` (runtime nodejs, `req.text()` para
  firma): `checkout.session.completed` → una sola sentencia CTE (neon-http no
  tiene transacciones interactivas; patrón `saveRsvpWithInvitation`,
  `lib/queries.ts:259`) que marca pago `paid`, RSVP `confirmed` +
  `verified_at`, condicionada a idempotencia por `stripe_session_id`.
  `checkout.session.expired` → expira pago y RSVP.
- Reembolsos: manuales en el dashboard de Stripe (MVP). `charge.refunded`
  solo registra `refunded` en `rsvp_payments`; no cancela el RSVP solo
  (decisión del organizador).

### 3.4 Portal de check-in (EPIC-005)

- Página pública `/checkin/[slug]` con gate de **password sencillo por
  evento** que fija el organizador (bcrypt en `events.checkin_password_hash`).
- Al validar el password se emite cookie HMAC firmada, **scoped al evento**,
  TTL 24 h, que incluye `checkin_password_updated_at` en el payload — rotar
  el password invalida todas las sesiones del staff. Secret nuevo
  `CHECKIN_SESSION_SECRET`. Comparaciones con `lib/timing-safe.ts`;
  rate-limit de intentos con `lib/bounded-rate-limiter.ts`.
- El staff ve **PII mínima**: nombre, +1 y nombre del +1, email enmascarado
  (`j***@g***.com`, solo para desambiguar homónimos), estado de llegada y
  nota. **Sin teléfono, sin email completo.**
- Acciones: marcar/desmarcar llegada del invitado y de su +1 por separado,
  editar nota corta. `rsvps` gana `checked_in_at`, `plus_one_checked_in_at`,
  `checked_in_by` (nombre libre que el staff teclea al entrar), `checkin_note`.
- Refresh por polling (10–15 s), contadores X/Y llegados, búsqueda por nombre.
  Mobile-first (recepción usa teléfono).
- Headers `no-store` + `noindex` como `/invite` (`next.config.js`).
- Admin: estado operativo visible desde el dashboard para viewer/manager,
  acceso directo al portal, toggle/set/rotate password solo para manager y
  stats/export PDF/Excel con columnas de check-in. Settings usa navegación
  por pestañas y disclosures mobile-first para evitar una página monolítica.

## 4. Cambios de schema (migraciones 0009+, secuenciales, single-owner)

- **0009** (ISSUE-005): `rsvps.pending_expires_at`, `verified_at`,
  `verification_token_hash`, `verification_expires_at`;
  `events.email_verification_enabled`;
  `rsvp_invitation_links.is_courtesy` + `skip_verification`;
  reemplazo de `enforce_event_capacity()`.
- **0010** (ISSUE-010): `events.payment_required`; tabla `rsvp_payments`.
- **0011** (ISSUE-015): `events.checkin_enabled`, `checkin_password_hash`,
  `checkin_password_updated_at`; `rsvps.checked_in_at`,
  `plus_one_checked_in_at`, `checked_in_by`, `checkin_note`.

Cada migración debe actualizar **los tres guardarraíles**:
`lib/migration-preflight.ts`, `lib/migration-semantic-contract.ts`,
`scripts/verify-db-contract.ts`, y pasar `pnpm db:preflight`. Ensayar primero
en rama Neon desechable (patrón del rollout de 0008, ver
`docs/PRODUCTION_MIGRATION_RUNBOOK.md`).

## 5. Gotchas conocidos (leer antes de ejecutar cualquier issue)

1. `rsvps.event_id` guarda el **slug**, no el UUID (`lib/schema.ts:109-150`).
   Toda tabla/query nueva sigue esa convención.
2. Neon HTTP **no tiene transacciones interactivas** — toda mutación
   multi-tabla es una sola sentencia CTE (patrón `lib/queries.ts:259-340`).
3. Unique `(event_id, lower(email))`: una fila pendiente ocupa el slot del
   email. Re-submit con mismo email = refrescar la fila pendiente (nuevo
   token / nueva sesión de Checkout), no insertar.
4. El trigger de capacidad corre `BEFORE INSERT OR UPDATE OF status,
   plus_one` — cualquier estado nuevo que "cuente asiento" debe entrar en su
   fórmula o habrá oversell/undersell.
5. El trabajo **sin commitear** del keyring de invitaciones
   (`lib/rsvp-invitation.ts`, `lib/queries.ts`,
   `app/api/admin/rsvp-invitations/route.ts`, `.env.example`) toca los mismos
   archivos que estos epics. **PRE-1: commitearlo/aterrizarlo antes de
   empezar** (su mitad de UI en `InvitationLinkManager.tsx` sigue pendiente).
6. `lib/resend.ts` es un Proxy lazy que no truena sin API key — el cliente
   Stripe debe copiar ese patrón para no romper build/CI.
7. Los emails salientes filtran por status/flags — auditar TODOS los
   consumidores de `status` al introducir estados nuevos (ISSUE-006).

## 6. Secuencia de ejecución y paralelismo (safe-parallelism)

- **PRE-1:** aterrizar el trabajo en vuelo del keyring (fuera de estos epics).
- **Wave 1 (serie):** ISSUE-005 → ISSUE-006 → ISSUE-020 (fundación de
  estados y flags de links; schema es single-owner).
- **Wave 2 (paralelo, write-sets disjuntos):**
  - Track A: EPIC-003 (ISSUE-007 → 008 → 009)
  - Track B: EPIC-004 (ISSUE-010 → 011 → 012 → 013 → 014)
  - Track C: EPIC-005 (ISSUE-015 → 016 → 017 → 018)
  - Las migraciones 0010 y 0011 se numeran/aplican en serie aunque el código
    de sus tracks corra en paralelo (coordinación single-owner de schema).
  - Solape conocido: ISSUE-013 y ISSUE-018 tocan admin/export — secuenciar
    entre sí al final.
- **Wave 3:** ISSUE-019 (hardening cancel-token, P1, independiente).
- Gates después de cada wave: `pnpm lint && pnpm test && pnpm build` +
  `pnpm db:preflight` cuando hubo migración.

## 7. Clasificación de riesgo (risk-aware-audits)

| Epic | Tier | Review |
|---|---|---|
| EPIC-002 estados+trigger capacidad | 3 | 1 review enfocada (oversell) |
| EPIC-003 verificación email | 3 | 1 review enfocada (tokens) |
| EPIC-004 Stripe (dinero) | **4** | 1 pass completa acotada + verificación de fixes |
| EPIC-005 check-in | 3 | 1 review enfocada (auth/PII) |
| ISSUE-019 hardening | 2 | sin segundo auditor |

## 8. Variables de entorno nuevas

```
STRIPE_SECRET_KEY=            # sk_live_... / sk_test_...
STRIPE_WEBHOOK_SECRET=        # whsec_...
CHECKIN_SESSION_SECRET=       # 64 hex, firma de cookies del portal check-in
```

## 9. Fuera de alcance (MVP)

- Reembolsos automáticos / self-service (manual en dashboard Stripe).
- Múltiples tiers de precio por evento; descuentos; cupones.
- Modo offline del portal de check-in (solo polling online).
- QR de ticket por asistente (candidato natural a epic futuro: el cancel-token
  endurecido de ISSUE-019 puede servir de base al QR).
