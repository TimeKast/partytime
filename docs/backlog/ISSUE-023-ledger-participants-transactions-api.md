# ISSUE-023 — APIs de participantes y movimientos del ledger

- **Epic:** EPIC-006
- **Priority:** P0
- **Story points:** 5
- **Status:** Planned (P1b confirmada 2026-08-19: viewer lee, manager muta —
  desbloqueado; rev. mismo día por P2a: nodo Stripe, PLAN §2.6)
- **Dependencies:** ISSUE-021, ISSUE-022
- **User stories:** US-014
- **Agents:** backend-specialist
- **Skills:** implement, backend, sk-api
- **Write-set:** `lib/ledger-queries.ts` (**crea** — ISSUE-024 lo extiende
  después, por eso van en serie), `app/api/admin/ledger/participants/route.ts`,
  `app/api/admin/ledger/transactions/route.ts`, tests. No toca
  `lib/queries.ts` ni `app/admin/`.

## Objetivo

Alta/lectura/edición de participantes y de movimientos (gastos/ingresos) con
su reparto, con RBAC y los invariantes de dinero validados en servidor. Sin
settlements ni summary (ISSUE-024) ni UI (ISSUE-025).

## Cambios exactos

### `lib/ledger-queries.ts` (nuevo)

- Módulo dedicado (NO engordar `lib/queries.ts` — decisión PLAN §3.3).
- Predicado central `activeLedgerRows` (= `deleted_at IS NULL`) reutilizado
  por toda query de lectura/cálculo (gotcha #4: un filtro olvidado corrompe
  saldos).
- `listParticipants(eventId)`, `createParticipant(...)` (siempre
  `kind='person'`; maneja el conflicto del unique `(event_id, lower(name))`
  → error tipado para 409), `updateParticipant(...)` (rename respetando el
  unique, toggle `is_active`; **rechaza cualquier PATCH sobre
  `kind='stripe'`** — el nodo Stripe no se renombra/desactiva, gotcha #9).
- `ensureStripeParticipant(eventId)` — provisión lazy del nodo Stripe (PLAN
  §2.6a): INSERT `kind='stripe'`, name 'Stripe', **idempotente** vía
  `ON CONFLICT` sobre el unique parcial `(event_id) WHERE kind='stripe'`
  (dos requests concurrentes ⇒ una sola fila). Se invoca desde el GET de
  participantes (así el dropdown siempre lo incluye) — nunca desde rutas de
  solo lectura ajenas al ledger.
- `listTransactions(eventId)` — movimientos activos con sus shares (join),
  orden `occurred_on desc, created_at desc`.
- `createTransactionWithShares(...)` — **una sola sentencia CTE**
  (neon-http sin transacciones interactivas, patrón
  `saveRsvpWithInvitation`, `lib/queries.ts:259`): inserta el movimiento y
  sus shares condicionado a que (a) todos los `participant_id` pertenezcan al
  evento y estén activos, y (b) `Σ share_cents = amount_cents` — si algo no
  cuadra, la sentencia no inserta nada y la función lanza error tipado (400).
  Las FKs compuestas de 0021 son el segundo candado.
- `updateTransactionWithShares(...)` — misma sentencia única: update del
  padre + delete/insert de shares (reemplazo completo del reparto),
  condicionado al mismo invariante y a `deleted_at IS NULL`.
- `softDeleteTransaction(id, eventId, deletedBy)` — marca `deleted_at`,
  jamás DELETE físico.
- Validación de moneda del ledger (PLAN §2.8): la sentencia de create/update
  exige que `currency` coincida con la de cualquier movimiento o settlement
  activo existente del evento (o que sea el primero); mismatch → error tipado
  con la moneda vigente en el mensaje.

### `app/api/admin/ledger/participants/route.ts` (GET/POST/PATCH)

- Auth patrón `app/api/admin/checkin-config/route.ts` (ISSUE-018): sesión
  válida + `userHasEventAccess` (`lib/user-queries.ts:354`). **GET acepta rol
  `viewer`; POST/PATCH exigen mínimo `manager`** (pendiente P1b — si José
  restringe, subir GET a manager, un solo punto de cambio).
- GET: llama `ensureStripeParticipant` antes de listar (provisión lazy e
  idempotente del nodo — aceptable también con rol viewer: es una fila de
  sistema, no dato del usuario).
- POST body `{ eventId, name, email?, userId? }` — name trim 2..120; 409 si
  el nombre ya existe (case-insensitive; aplica también contra el nodo
  "Stripe" — nombre reservado).
- PATCH `{ eventId, participantId, name?, email?, isActive? }` — 422 si el
  target es `kind='stripe'`.
- DTO allowlist `{ id, kind, name, email, userId, isActive, createdAt }` —
  nunca filas Drizzle completas; test de keys exactas (patrón `hasOnlyKeys`).

### `app/api/admin/ledger/transactions/route.ts` (GET/POST/PATCH/DELETE)

- Misma auth/RBAC que participants.
- POST body `{ eventId, type: 'expense'|'income', participantId, description,
  amountCents, currency, occurredOn, note?, shares: Array<{ participantId,
  shareCents }> }`.
  - Validar con `assertValidShares` de `lib/event-ledger.ts` (ISSUE-022)
    ANTES de tocar la DB; la CTE revalida (defensa en profundidad).
  - `amountCents` entero, > 0, ≤ 99,999,999 (gotcha #7); `currency` whitelist
    MXN/USD; `occurredOn` fecha ISO válida; shares no vacías, participantes
    sin duplicar.
  - El nodo Stripe es **válido como `participantId` (pagó/recibió) y en
    shares**, en ambos modos del toggle (PLAN §2.6a): gasto pagado desde la
    cuenta Stripe = payer Stripe; cobros Stripe entrando al grafo = income
    recibido por Stripe. Sin branch por `kind` en la validación — es un
    participante más (activo siempre).
  - Helper de conveniencia: si el cliente manda `splitMode: 'equal'` con
    `participantIds`, el server llama `splitEqual` — el reparto SIEMPRE se
    deriva/valida en servidor, nunca se confía el total del cliente.
- PATCH: mismo shape + `transactionId`; 404 si soft-deleted o de otro evento.
- DELETE `{ eventId, transactionId }` → soft-delete con `deleted_by` =
  usuario de la sesión; idempotente (segundo DELETE → 404).
- DTO por movimiento: `{ id, type, participantId, description, amountCents,
  currency, occurredOn, note, createdBy, createdAt, updatedAt,
  shares: [{ participantId, shareCents }] }` — test de keys exactas.

## Acceptance criteria

```gherkin
Given un viewer del evento
When hace GET de participantes o movimientos
Then 200; y cualquier POST/PATCH/DELETE responde 403

Given un manager y shares que no suman amount_cents
When POST transactions
Then 400 sin insertar nada (ni el movimiento ni shares parciales)

Given un participantId de otro evento en las shares
When POST transactions
Then 400/409 y la DB no tiene filas nuevas (CTE + FK compuesta)

Given un ledger cuyo primer movimiento fue en MXN
When se intenta registrar un movimiento en USD
Then 400 con mensaje que indica la moneda vigente

Given un movimiento existente
When DELETE
Then queda soft-deleted, desaparece del GET y un segundo DELETE responde 404

Given splitMode 'equal' con monto 1000 y 3 participantes
Then el server persiste shares 334/333/333 (largest remainder de ISSUE-022)

Given dos GET concurrentes de participantes en un evento recién creado
Then queda exactamente un nodo kind='stripe' y ambos GET lo incluyen

Given un PATCH de rename/desactivación sobre el nodo Stripe
Then 422 sin cambios

Given un POST de gasto con payer = nodo Stripe y reparto entre A,B
Then se persiste como cualquier movimiento (sin lógica especial)
```

## Tests requeridos

`tests/ledger-participants-api.test.ts` y `tests/ledger-transactions-api.test.ts`:
RBAC por método, keys exactas de DTOs, invariante de shares (unit sobre el SQL
generado + validación previa), moneda uniforme, soft-delete, 409 de nombre
duplicado (incluido "Stripe" reservado), cap de monto, cross-evento
rechazado, idempotencia de `ensureStripeParticipant`, 422 al mutar el nodo
Stripe, movimientos con payer/shares Stripe aceptados.
