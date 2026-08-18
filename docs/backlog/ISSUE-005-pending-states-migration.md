# ISSUE-005 — Migración 0009: estados pendientes, TTL y trigger de capacidad

- **Epic:** EPIC-002
- **Priority:** P0
- **Story points:** 5
- **Status:** Completed (2026-08-18)
- **Dependencies:** PRE-1 (aterrizar trabajo en vuelo del keyring de invitaciones)
- **User stories:** habilitador de US-006..US-010
- **Agents:** backend-specialist, database (via /database)
- **Skills:** implement, database, migration

## Objetivo

Crear la migración `0009` y el soporte en código para los estados
`pending_verification`, `pending_payment` y `expired`, con reserva de asiento
y expiración lazy. **Sin UI ni flujos nuevos todavía** — solo schema, trigger
y helpers de queries.

## Cambios exactos

### Schema (`lib/schema.ts` + `drizzle/0009_pending_states.sql`)

En `rsvps`:
- `pending_expires_at` timestamp NULL — TTL de la fila pendiente.
- `verified_at` timestamp NULL.
- `verification_token_hash` varchar(64) NULL — SHA-256 hex, hash-only.
- `verification_expires_at` timestamp NULL.

En `events`:
- `email_verification_enabled` boolean NOT NULL DEFAULT false.

En `rsvp_invitation_links` (flags por link, PLAN §2.1):
- `is_courtesy` boolean NOT NULL DEFAULT true
- `skip_verification` boolean NOT NULL DEFAULT true

### Trigger (misma migración, `CREATE OR REPLACE FUNCTION enforce_event_capacity()`)

Partir del cuerpo actual en `drizzle/0002_enforce_event_capacity.sql`. La
fórmula de asientos pasa de contar `status = 'confirmed'` a contar
`status IN ('confirmed', 'pending_payment', 'pending_verification')`.
Todo lo demás (lock `FOR NO KEY UPDATE` sobre `events`, +1 por `plus_one`,
excepción `CAPACITY_FULL` P0001) queda igual.

Nota: la transición pending→confirmed es neutra (ambos cuentan), por lo que el
trigger `BEFORE UPDATE OF status` no rechazará confirmaciones legítimas.
Verificarlo con test.

### Helpers (`lib/queries.ts`)

- `expireStalePendingRsvps(eventSlug)`: **una sola sentencia CTE** que
  (a) expira pendientes vencidos: `UPDATE rsvps SET status='expired',
  pending_expires_at=NULL WHERE event_id=$1 AND status IN
  ('pending_payment','pending_verification') AND pending_expires_at < now()`,
  y (b) encadenado, **restaura los links de invitación** de esas filas:
  `UPDATE rsvp_invitation_links SET used_at=NULL, used_rsvp_id=NULL WHERE
  used_rsvp_id IN (filas expiradas) AND revoked_at IS NULL AND
  (expires_at IS NULL OR expires_at > now())` (PLAN §2.1 — el invitado puede
  reintentar con su mismo link). Retorna filas expiradas. Se llamará al
  inicio de `POST /api/rsvp` (cablearlo en ISSUE-007/011; aquí solo el
  helper + test).
- Constantes exportadas de estados: `RSVP_STATUS = { CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled', PENDING_PAYMENT: 'pending_payment',
  PENDING_VERIFICATION: 'pending_verification', EXPIRED: 'expired' }` —
  reemplazar strings mágicos en `lib/queries.ts` donde ya existan.

### Guardarraíles de migración (obligatorio, mismo PR)

- `lib/migration-preflight.ts` — registrar columnas nuevas en el schema
  esperado (las columnas price ya están listadas en :82 como referencia de
  formato).
- `lib/migration-semantic-contract.ts` — contrato del trigger actualizado.
- `scripts/verify-db-contract.ts` — verificación de columnas + trigger.
- `drizzle/meta/_journal.json` — entrada 0009.

## Acceptance criteria

```gherkin
Given un evento con capacity_limit=2 y 1 confirmed + 1 pending_payment vigente
When un tercer invitado intenta RSVP
Then el trigger lanza CAPACITY_FULL y el API responde 409

Given una fila pending_payment cuyo pending_expires_at ya pasó
When corre expireStalePendingRsvps(slug)
Then la fila queda status='expired' y su asiento se libera (un nuevo RSVP entra)

Given una fila pendiente vencida creada vía link de invitación
When corre expireStalePendingRsvps(slug)
Then el link queda restaurado (used_at NULL) salvo que esté revocado o vencido

Given una fila pending_verification vigente
When se actualiza a confirmed
Then el trigger NO rechaza la transición (asientos netos sin cambio)

Given la migración 0009 aplicada en rama Neon desechable
When corre pnpm db:preflight y scripts/verify-db-contract.ts
Then ambos clasifican el schema como esperado y pasan
```

## Tests requeridos

- `tests/pending-states.test.ts`: fórmula de capacidad con mezcla de estados,
  expiración lazy, transición neutra, y carrera: dos RSVPs concurrentes al
  último asiento con un pending vigente → exactamente uno gana.
- Actualizar tests existentes de capacidad si asumen solo confirmed.

## No hacer

- No tocar `POST /api/rsvp` (flujos en ISSUE-007/011).
- No agregar columnas de pago ni de check-in (migraciones 0010/0011).
- No aplicar a producción: solo rama Neon desechable + runbook
  (`docs/PRODUCTION_MIGRATION_RUNBOOK.md`).
