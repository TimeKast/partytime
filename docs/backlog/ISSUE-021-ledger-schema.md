# ISSUE-021 — Migración 0012: tablas del ledger financiero

- **Epic:** EPIC-006
- **Priority:** P0
- **Story points:** 5
- **Status:** Ready — **reabierto y re-especificado 2026-08-19** por la
  resolución de P2a (PLAN §2.6): se agregan `event_participants.kind`, su
  unique parcial y `events.ledger_stripe_is_participant`. NO ejecutar contra
  la spec anterior. (P1a confirmada el mismo día: participantes = registro
  libre por evento, PLAN §2.1/§10.)
- **Dependencies:** ninguna funcional (0012 se numera después de 0011; schema es single-owner)
- **User stories:** US-014
- **Agents:** backend-specialist, database (via /database)
- **Skills:** implement, database
- **Write-set:** `drizzle/0012_event_ledger.sql`, `lib/schema.ts`,
  `lib/migration-preflight.ts`, `lib/event-ledger-migration-contract.ts`
  (nuevo), `scripts/verify-db-contract.ts`, journal. Solape: `lib/schema.ts`
  es exclusivo de este issue en su wave.

## Objetivo

Las 4 tablas del ledger con integridad cross-evento a nivel DB, más el toggle
de modo Stripe en `events` (PLAN §2.6b). Sin queries, APIs ni UI todavía
(ISSUE-023+; el nodo Stripe se **provisiona** en ISSUE-023, aquí solo se
modela). Sin columnas nuevas en `rsvps`.

## Cambios exactos

### Migración `drizzle/0012_event_ledger.sql` + `lib/schema.ts`

Convenciones obligatorias (mismas del schema actual): IDs `text` con
`$defaultFn(generateId)`; `event_id` guarda el **slug** con
`references(() => events.slug, { onUpdate: 'cascade', onDelete: 'restrict' })`
(gotcha #1); enums chicos con `check()`, no tipos ENUM de Postgres;
comentarios en el schema documentando las decisiones no obvias (citar
PLAN-EPIC-006.md).

En `events` (PLAN §2.6b):
- `ledger_stripe_is_participant` boolean NOT NULL DEFAULT false — `true`:
  el nodo Stripe entra al grafo de deudas como cualquier participante ("la
  cuenta es de alguien"); `false` (default): Stripe es fondo del evento, sus
  cifras van en sección aparte del summary y puede quedar remanente de
  utilidad. Comentario en schema citando PLAN §2.6. NO se expone por
  `/api/events` (gotcha #6): solo por la API del ledger.

Tabla `event_participants`:
- `id` text PK generateId
- `event_id` text NOT NULL → FK `events.slug` (cascade/restrict)
- `kind` varchar(10) NOT NULL DEFAULT 'person', CHECK
  `kind in ('person','stripe')` — `'stripe'` es el participante virtual del
  evento (PLAN §2.6a): existe en ambos modos, representa el dinero cobrado
  por la app; el modo solo cambia la presentación.
- **unique parcial** `(event_id) WHERE kind = 'stripe'` — máximo un nodo
  Stripe por evento; es el ancla del INSERT idempotente de
  `ensureStripeParticipant` (ISSUE-023, gotcha #9)
- `name` varchar(120) NOT NULL, CHECK `char_length(btrim(name)) between 2 and 120`
- `email` varchar(255) NULL (solo contacto, sin flujo de email en MVP)
- `user_id` text NULL → FK `users.id` ON DELETE SET NULL (link opcional;
  siempre NULL para `kind='stripe'`)
- `is_active` boolean NOT NULL DEFAULT true (desactivar en vez de borrar;
  el nodo Stripe nunca se desactiva — lo protege la API, ISSUE-023)
- `created_by` text NOT NULL (patrón `rsvp_invitation_links.created_by`: sin
  FK a users por el super admin de entorno)
- `created_at` timestamp NOT NULL DEFAULT now()
- unique `(event_id, lower(name))` — identidad estable, sin typos duplicados
- unique `(id, event_id)` — **ancla de las FKs compuestas** de abajo
- índice `(event_id)`

Tabla `event_transactions`:
- `id` text PK generateId
- `event_id` text NOT NULL → FK `events.slug` (cascade/restrict)
- `type` varchar(10) NOT NULL, CHECK `type in ('expense','income')`
- `participant_id` text NOT NULL — quién **pagó** el gasto / quién **recibió**
  el ingreso
- **FK compuesta** `(participant_id, event_id)` →
  `event_participants (id, event_id)` ON DELETE RESTRICT — un participante de
  otro evento no puede colarse ni por bug de aplicación
- `description` varchar(200) NOT NULL, CHECK trim 1..200
- `amount_cents` integer NOT NULL, CHECK `amount_cents > 0` (el cap de
  99,999,999 es de la API, gotcha #7 del PLAN)
- `currency` varchar(10) NOT NULL (uniformidad por evento se valida en API)
- `occurred_on` date NOT NULL (fecha del gasto/ingreso, capturada por el admin)
- `note` varchar(500) NULL
- `created_by` text NOT NULL, `created_at`/`updated_at` timestamps NOT NULL
  DEFAULT now()
- `deleted_at` timestamp NULL, `deleted_by` text NULL (soft-delete, PLAN §2.9)
- unique `(id, event_id)` (ancla para la FK compuesta de shares)
- índices `(event_id)` y `(event_id, type)`

Tabla `event_transaction_shares`:
- `id` text PK generateId
- `transaction_id` text NOT NULL; `event_id` text NOT NULL
- **FK compuesta** `(transaction_id, event_id)` →
  `event_transactions (id, event_id)` ON DELETE CASCADE (las shares mueren
  con su movimiento; el soft-delete del padre las excluye del cálculo)
- `participant_id` text NOT NULL; **FK compuesta** `(participant_id, event_id)`
  → `event_participants (id, event_id)` ON DELETE RESTRICT
- `share_cents` integer NOT NULL, CHECK `share_cents > 0` (participante con
  share 0 simplemente no se incluye)
- unique `(transaction_id, participant_id)`
- índices `(transaction_id)` y `(participant_id)`
- Comentario en schema: `Σ share_cents = amount_cents` se garantiza en la
  sentencia CTE de escritura + tests (no expresable como CHECK multi-fila;
  misma filosofía que el enum de `rsvp_payments.status`).

Tabla `event_settlements`:
- `id` text PK generateId
- `event_id` text NOT NULL → FK `events.slug` (cascade/restrict)
- `from_participant_id` text NOT NULL, `to_participant_id` text NOT NULL —
  ambos con **FK compuesta** `(x, event_id)` → `event_participants (id, event_id)`
  ON DELETE RESTRICT; CHECK `from_participant_id <> to_participant_id`
- `amount_cents` integer NOT NULL, CHECK `> 0`
- `currency` varchar(10) NOT NULL
- `settled_on` date NOT NULL (cuándo se hizo el pago)
- `note` varchar(500) NULL
- `created_by` text NOT NULL, `created_at`/`updated_at` DEFAULT now()
- `deleted_at`/`deleted_by` NULL (soft-delete)
- índice `(event_id)`

Exportar tipos `$inferSelect`/`$inferInsert` de las 4 tablas al final de
`lib/schema.ts` (patrón existente).

### Guardarraíles + journal

- Contrato dedicado `lib/event-ledger-migration-contract.ts` (patrón
  `lib/rsvp-payments-migration-contract.ts`): estado semántico esperado de las
  4 tablas (columnas, checks, uniques, FKs compuestas) + función
  `invalidLedgerSemantics`.
- Integrarlo en `lib/migration-preflight.ts` y `scripts/verify-db-contract.ts`
  (mismo cableado que payments/checkin) y registrar 0012 en el journal.
- `pnpm db:preflight` debe pasar. Aplicar solo en rama Neon desechable
  (runbook 0008); prod queda para el rollout coordinado.

## Acceptance criteria

```gherkin
Given la migración 0012 en rama Neon desechable
When corren pnpm db:preflight y verify-db-contract
Then pasan y existen las 4 tablas con sus uniques, checks y FKs compuestas,
  mas la columna events.ledger_stripe_is_participant con DEFAULT false

Given dos inserts de participante kind='stripe' para el mismo evento
Then el unique parcial deja exactamente una fila (y eventos distintos pueden
  tener cada uno la suya)

Given un participante del evento A
When se intenta insertar un movimiento del evento B con ese participant_id
Then la FK compuesta lo rechaza a nivel DB

Given dos altas concurrentes del participante "Ana" en el mismo evento
Then el unique (event_id, lower(name)) deja exactamente una fila

Given un movimiento con shares
When se borra físicamente el movimiento (solo en test de FK)
Then las shares caen en cascada; y borrar un participante referenciado falla (RESTRICT)

Given un settlement con from == to
Then el CHECK lo rechaza
```

## Tests requeridos

`tests/event-ledger-schema.test.ts`: contrato semántico (patrón de los tests
de contrato de 0010/0011), tipos exportados, y validación de que
`invalidLedgerSemantics` detecta cada desviación (tabla faltante, FK compuesta
ausente, check ausente, unique parcial del nodo Stripe ausente, columna
`ledger_stripe_is_participant` ausente o con default incorrecto).
