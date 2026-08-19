/**
 * ISSUE-023 (EPIC-006) — data layer for the event financial ledger:
 * participants + transactions (with their shares). Dedicated module — NOT
 * folded into lib/queries.ts (PLAN-EPIC-006.md §3.3): ISSUE-024 extends this
 * same file with settlements/summary, so the two issues share a write-set
 * and run in series (safe-parallelism).
 *
 * Every read/calc query in this module MUST filter out soft-deleted rows
 * through `activeLedgerRows` (gotcha #4: a forgotten filter silently
 * corrupts balances) rather than repeating `isNull(col)` ad hoc.
 *
 * `createTransactionWithShares`/`updateTransactionWithShares` follow the
 * single-CTE-statement pattern of `saveRsvpWithInvitation`
 * (lib/queries.ts:363): neon-http has no interactive transactions, so the
 * parent movement and its shares are written by one guarded statement that
 * inserts/updates nothing at all when the invariants don't hold (gotcha #2).
 * The composite FKs from migration 0012 are the second candado.
 */

import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import {
    db,
    events,
    eventParticipants,
    eventSettlements,
    eventTransactionShares,
    eventTransactions,
    rsvpPayments,
} from './db'
import { isUniqueViolationError } from './queries'
import { assertValidShares } from './event-ledger'
import type { LedgerSettlement, LedgerShare, LedgerTransaction } from './event-ledger'
import type { EventParticipant } from './schema'

// ---------------------------------------------------------------------------
// Typed errors — routes map each to the specific HTTP status the ISSUE-023
// acceptance criteria require (409/422/400/404), never a bare 500.
// ---------------------------------------------------------------------------

/** 409 — a participant name (case-insensitive) is already taken in this event, including the reserved "Stripe" name. */
export class LedgerParticipantNameConflictError extends Error {
    constructor(readonly attemptedName: string) {
        super(`Ya existe un participante con el nombre "${attemptedName}" en este evento`)
        this.name = 'LedgerParticipantNameConflictError'
    }
}

/** 422 — the Stripe virtual participant can never be renamed, deactivated or reactivated (PLAN §2.6a). */
export class LedgerStripeParticipantImmutableError extends Error {
    constructor() {
        super('El participante Stripe no se puede renombrar ni desactivar')
        this.name = 'LedgerStripeParticipantImmutableError'
    }
}

/** 400 — one or more participant ids do not belong to this event or are inactive (payer or a share). */
export class LedgerParticipantNotFoundError extends Error {
    constructor(readonly participantIds: string[]) {
        super(`Uno o más participantes no pertenecen a este evento o están inactivos: ${participantIds.join(', ')}`)
        this.name = 'LedgerParticipantNotFoundError'
    }
}

/** 400 — the shares breakdown does not add up to amountCents, or repeats a participant. */
export class LedgerSharesMismatchError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'LedgerSharesMismatchError'
    }
}

/** 400 — currency does not match the ledger's already-fixed currency (PLAN §2.8). */
export class LedgerCurrencyMismatchError extends Error {
    constructor(readonly currentCurrency: string) {
        super(`Este evento ya tiene movimientos en ${currentCurrency}; no se puede mezclar monedas en el mismo ledger`)
        this.name = 'LedgerCurrencyMismatchError'
    }
}

/** 404 — the target movement doesn't exist, is soft-deleted, or belongs to another event. */
export class LedgerTransactionNotFoundError extends Error {
    constructor() {
        super('Movimiento no encontrado')
        this.name = 'LedgerTransactionNotFoundError'
    }
}

/** 400 — a settlement's `from` and `to` participant cannot be the same (PLAN §3.1/ISSUE-024: same rule as movements). Checked BEFORE the DB write (mirrors `assertNoDuplicateShareParticipants`); the DB's own CHECK constraint is defense in depth against a race, never the primary signal. */
export class LedgerSettlementSameParticipantError extends Error {
    constructor() {
        super('fromParticipantId y toParticipantId no pueden ser el mismo participante')
        this.name = 'LedgerSettlementSameParticipantError'
    }
}

/** 404 — the target settlement doesn't exist, is soft-deleted, or belongs to another event. */
export class LedgerSettlementNotFoundError extends Error {
    constructor() {
        super('Settlement no encontrado')
        this.name = 'LedgerSettlementNotFoundError'
    }
}

function requireDb() {
    if (!db) throw new Error('Database not configured')
    return db
}

// ---------------------------------------------------------------------------
// Central soft-delete predicate (gotcha #4) — every listing/calc query below
// goes through this instead of inlining `isNull(...)`.
// ---------------------------------------------------------------------------

export function activeLedgerRows(deletedAtColumn: PgColumn): SQL {
    return isNull(deletedAtColumn)
}

// ---------------------------------------------------------------------------
// Row mappers for raw db.execute(...) results (snake_case columns) — the
// create/update CTEs and ensureStripeParticipant bypass drizzle's typed
// select, same reasoning as lib/queries.ts's mapRsvpRow.
// ---------------------------------------------------------------------------

function mapParticipantRow(row: Record<string, unknown>): EventParticipant {
    return {
        id: String(row.id),
        eventId: String(row.event_id),
        kind: String(row.kind) as EventParticipant['kind'],
        name: String(row.name),
        email: row.email == null ? null : String(row.email),
        userId: row.user_id == null ? null : String(row.user_id),
        isActive: row.is_active === true,
        createdBy: String(row.created_by),
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    }
}

export interface LedgerTransactionRecord {
    id: string
    eventId: string
    type: 'expense' | 'income'
    participantId: string
    description: string
    amountCents: number
    currency: string
    occurredOn: string
    note: string | null
    createdBy: string
    createdAt: Date
    updatedAt: Date
}

function mapTransactionRow(row: Record<string, unknown>): LedgerTransactionRecord {
    return {
        id: String(row.id),
        eventId: String(row.event_id),
        type: String(row.type) as LedgerTransactionRecord['type'],
        participantId: String(row.participant_id),
        description: String(row.description),
        amountCents: Number(row.amount_cents),
        currency: String(row.currency),
        occurredOn: row.occurred_on instanceof Date
            ? row.occurred_on.toISOString().slice(0, 10)
            : String(row.occurred_on),
        note: row.note == null ? null : String(row.note),
        createdBy: String(row.created_by),
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
        updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at)),
    }
}

export interface TransactionShareRecord {
    participantId: string
    shareCents: number
}

export interface TransactionWithShares extends LedgerTransactionRecord {
    shares: TransactionShareRecord[]
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

/** All participants of the event (active and inactive — inactive ones must stay visible so a manager can reactivate them). */
export async function listParticipants(eventId: string): Promise<EventParticipant[]> {
    const database = requireDb()
    return database.select().from(eventParticipants)
        .where(eq(eventParticipants.eventId, eventId))
        .orderBy(asc(eventParticipants.name))
}

export interface CreateParticipantInput {
    eventId: string
    name: string
    email?: string | null
    userId?: string | null
    createdBy: string
}

const RESERVED_PARTICIPANT_NAME = 'stripe'

/**
 * Always creates `kind='person'`. Rejects the reserved "Stripe" name
 * up front (defense in depth even when the Stripe node hasn't been
 * lazily provisioned yet for this event — PLAN §2.6a) and translates the
 * unique-name-per-event violation into a typed 409.
 */
export async function createParticipant(input: CreateParticipantInput): Promise<EventParticipant> {
    const database = requireDb()
    const trimmedName = input.name.trim()

    if (trimmedName.toLowerCase() === RESERVED_PARTICIPANT_NAME) {
        throw new LedgerParticipantNameConflictError(trimmedName)
    }

    try {
        const [created] = await database.insert(eventParticipants).values({
            eventId: input.eventId,
            kind: 'person',
            name: trimmedName,
            email: input.email?.trim() || null,
            userId: input.userId ?? null,
            createdBy: input.createdBy,
        }).returning()
        return created
    } catch (err) {
        if (isUniqueViolationError(err)) {
            throw new LedgerParticipantNameConflictError(trimmedName)
        }
        throw err
    }
}

export interface UpdateParticipantInput {
    name?: string
    email?: string | null
    isActive?: boolean
}

/**
 * Renames/(de)activates a `kind='person'` participant. The Stripe node is
 * protected by the SAME guarded UPDATE (`kind = 'person'` in the WHERE
 * clause, not a separate check-then-act) so a concurrent PATCH can never
 * observably slip through — this function only does a follow-up SELECT to
 * report *why* zero rows were touched (not found vs. protected Stripe node).
 * Returns `null` when the participant does not exist (or belongs to another
 * event); throws `LedgerStripeParticipantImmutableError` for the Stripe node.
 */
export async function updateParticipant(
    eventId: string,
    participantId: string,
    updates: UpdateParticipantInput,
): Promise<EventParticipant | null> {
    const database = requireDb()

    const setValues: Partial<{ name: string; email: string | null; isActive: boolean }> = {}
    if (updates.name !== undefined) setValues.name = updates.name.trim()
    if (updates.email !== undefined) setValues.email = updates.email?.trim() || null
    if (updates.isActive !== undefined) setValues.isActive = updates.isActive

    if (Object.keys(setValues).length === 0) {
        return diagnoseParticipantMutationTarget(eventId, participantId)
    }

    try {
        const [updated] = await database.update(eventParticipants)
            .set(setValues)
            .where(and(
                eq(eventParticipants.id, participantId),
                eq(eventParticipants.eventId, eventId),
                eq(eventParticipants.kind, 'person'),
            ))
            .returning()
        if (updated) return updated
    } catch (err) {
        if (isUniqueViolationError(err)) {
            throw new LedgerParticipantNameConflictError(setValues.name ?? participantId)
        }
        throw err
    }

    return diagnoseParticipantMutationTarget(eventId, participantId)
}

async function diagnoseParticipantMutationTarget(
    eventId: string,
    participantId: string,
): Promise<EventParticipant | null> {
    const database = requireDb()
    const [existing] = await database.select().from(eventParticipants)
        .where(and(eq(eventParticipants.id, participantId), eq(eventParticipants.eventId, eventId)))
        .limit(1)

    if (!existing) return null
    if (existing.kind === 'stripe') throw new LedgerStripeParticipantImmutableError()
    return existing
}

/**
 * Lazily provisions the event's single virtual Stripe participant
 * (PLAN §2.6a). Idempotent via `ON CONFLICT` against the partial unique
 * index `event_participants_stripe_kind_unique` (drizzle/0012): two
 * concurrent callers race on the INSERT, exactly one wins, and the loser's
 * `RETURNING` comes back empty — that loser then re-SELECTs the winner's
 * row instead of erroring. Never a separate "SELECT then INSERT if missing"
 * (that would race).
 */
export async function ensureStripeParticipant(eventId: string, createdBy: string): Promise<EventParticipant> {
    const database = requireDb()
    const id = randomUUID()

    let row: Record<string, unknown> | undefined
    try {
        const result = await database.execute(sql`
            INSERT INTO event_participants (id, event_id, kind, name, email, user_id, is_active, created_by)
            VALUES (${id}, ${eventId}, 'stripe', 'Stripe', NULL, NULL, true, ${createdBy})
            ON CONFLICT (event_id) WHERE kind = 'stripe' DO NOTHING
            RETURNING *
        `)
        row = result.rows[0] as Record<string, unknown> | undefined
    } catch (err) {
        // In an extremely tight race, Postgres can evaluate the
        // (event_id, lower(name)) unique index before the partial "stripe"
        // arbiter's DO NOTHING applies, surfacing a violation on the
        // reserved "Stripe" name instead of silently skipping. Same
        // recovery as createParticipant: the row now exists, fall through
        // to the re-SELECT below instead of failing the caller.
        if (!isUniqueViolationError(err)) throw err
    }
    if (row) return mapParticipantRow(row)

    const [existing] = await database.select().from(eventParticipants)
        .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.kind, 'stripe')))
        .limit(1)

    if (!existing) {
        // Unreachable in practice: DO NOTHING only fires when a conflicting
        // row already exists, so a concurrent SELECT must find it.
        throw new Error(`ensureStripeParticipant: no Stripe participant found for event ${eventId} after ON CONFLICT DO NOTHING`)
    }

    return existing
}

// ---------------------------------------------------------------------------
// Transactions + shares
// ---------------------------------------------------------------------------

/** Active movements with their shares, newest first. Two queries (not a join) kept simple/predictable — a ledger has tens/hundreds of rows, never millions (PLAN §2.4). */
export async function listTransactions(eventId: string): Promise<TransactionWithShares[]> {
    const database = requireDb()

    const transactions = await database.select().from(eventTransactions)
        .where(and(
            eq(eventTransactions.eventId, eventId),
            activeLedgerRows(eventTransactions.deletedAt),
        ))
        .orderBy(desc(eventTransactions.occurredOn), desc(eventTransactions.createdAt))

    if (transactions.length === 0) return []

    const ids = transactions.map(transaction => transaction.id)
    const shareRows = await database.select({
        transactionId: eventTransactionShares.transactionId,
        participantId: eventTransactionShares.participantId,
        shareCents: eventTransactionShares.shareCents,
    })
        .from(eventTransactionShares)
        .where(inArray(eventTransactionShares.transactionId, ids))

    const sharesByTransaction = new Map<string, TransactionShareRecord[]>()
    for (const share of shareRows) {
        const list = sharesByTransaction.get(share.transactionId) ?? []
        list.push({ participantId: share.participantId, shareCents: share.shareCents })
        sharesByTransaction.set(share.transactionId, list)
    }

    return transactions.map(transaction => ({
        id: transaction.id,
        eventId: transaction.eventId,
        type: transaction.type as LedgerTransactionRecord['type'],
        participantId: transaction.participantId,
        description: transaction.description,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        occurredOn: transaction.occurredOn,
        note: transaction.note,
        createdBy: transaction.createdBy,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        shares: sharesByTransaction.get(transaction.id) ?? [],
    }))
}

export interface TransactionShareInput {
    participantId: string
    shareCents: number
}

export interface CreateTransactionInput {
    eventId: string
    type: 'expense' | 'income'
    participantId: string
    description: string
    amountCents: number
    currency: string
    occurredOn: string
    note?: string | null
    createdBy: string
    shares: TransactionShareInput[]
}

function assertNoDuplicateShareParticipants(shares: TransactionShareInput[]): void {
    const ids = shares.map(share => share.participantId)
    if (new Set(ids).size !== ids.length) {
        throw new LedgerSharesMismatchError('El reparto no puede repetir el mismo participante')
    }
}

function scopedParticipantIds(payerParticipantId: string, shares: TransactionShareInput[]): string[] {
    return Array.from(new Set([payerParticipantId, ...shares.map(share => share.participantId)]))
}

async function getLedgerCurrency(
    eventId: string,
    options: { excludeTransactionId?: string; excludeSettlementId?: string } = {},
): Promise<string | null> {
    const database = requireDb()

    const transactionConditions = [
        eq(eventTransactions.eventId, eventId),
        activeLedgerRows(eventTransactions.deletedAt),
    ]
    if (options.excludeTransactionId) transactionConditions.push(ne(eventTransactions.id, options.excludeTransactionId))

    const [transactionRow] = await database.select({ currency: eventTransactions.currency })
        .from(eventTransactions)
        .where(and(...transactionConditions))
        .limit(1)
    if (transactionRow) return transactionRow.currency

    const settlementConditions = [
        eq(eventSettlements.eventId, eventId),
        activeLedgerRows(eventSettlements.deletedAt),
    ]
    if (options.excludeSettlementId) settlementConditions.push(ne(eventSettlements.id, options.excludeSettlementId))

    const [settlementRow] = await database.select({ currency: eventSettlements.currency })
        .from(eventSettlements)
        .where(and(...settlementConditions))
        .limit(1)
    return settlementRow?.currency ?? null
}

/**
 * Runs after a guarded write returned zero rows to determine, and throw,
 * the SPECIFIC typed reason (never a bare 500): missing target movement
 * (update only), ineligible participant(s), shares/amount mismatch, or a
 * currency conflict. Always throws — the `never` return type documents that
 * for callers.
 */
async function diagnoseTransactionWriteFailure(
    input: CreateTransactionInput,
    options: { transactionId?: string; requireExistingTarget?: boolean } = {},
): Promise<never> {
    const database = requireDb()

    if (options.requireExistingTarget && options.transactionId) {
        const [target] = await database.select({ id: eventTransactions.id }).from(eventTransactions)
            .where(and(
                eq(eventTransactions.id, options.transactionId),
                eq(eventTransactions.eventId, input.eventId),
                activeLedgerRows(eventTransactions.deletedAt),
            ))
            .limit(1)
        if (!target) throw new LedgerTransactionNotFoundError()
    }

    const scopedIds = scopedParticipantIds(input.participantId, input.shares)
    const eligible = await database.select({ id: eventParticipants.id }).from(eventParticipants)
        .where(and(
            eq(eventParticipants.eventId, input.eventId),
            eq(eventParticipants.isActive, true),
            inArray(eventParticipants.id, scopedIds),
        ))
    const eligibleIds = new Set(eligible.map(row => row.id))
    const missingOrInactive = scopedIds.filter(id => !eligibleIds.has(id))
    if (missingOrInactive.length > 0) {
        throw new LedgerParticipantNotFoundError(missingOrInactive)
    }

    const shareSum = input.shares.reduce((sum, share) => sum + share.shareCents, 0)
    if (shareSum !== input.amountCents) {
        throw new LedgerSharesMismatchError(
            `El reparto suma ${shareSum} centavos pero el monto del movimiento es ${input.amountCents}`,
        )
    }

    const currentCurrency = await getLedgerCurrency(input.eventId, { excludeTransactionId: options.transactionId })
    if (currentCurrency && currentCurrency !== input.currency) {
        throw new LedgerCurrencyMismatchError(currentCurrency)
    }

    // Every guarded condition passed on this fresh re-read — the original
    // failure was a genuine race (something changed between the guarded
    // statement and this diagnostic). Surface the closest typed error
    // rather than a bare 500; the caller should retry.
    throw new LedgerSharesMismatchError(
        'No se pudo registrar el movimiento: los datos cambiaron durante la operación, intenta de nuevo',
    )
}

/**
 * Inserts a movement and its shares in ONE CTE statement (gotcha #2):
 * the write only happens when (a) the payer and every share participant
 * belong to this event and are active, (b) Σ share_cents = amount_cents,
 * and (c) currency matches the ledger's already-fixed currency (or this is
 * the first movement) — all three re-checked here even though the API route
 * already calls `assertValidShares` before reaching this function (defense
 * in depth against a race between that check and this write).
 */
export async function createTransactionWithShares(input: CreateTransactionInput): Promise<TransactionWithShares> {
    const database = requireDb()

    assertValidShares(input.amountCents, input.shares.map(share => share.shareCents))
    assertNoDuplicateShareParticipants(input.shares)

    const transactionId = randomUUID()
    const shareRows = input.shares.map(share => ({ id: randomUUID(), ...share }))
    const sharesValues = sql.join(
        shareRows.map(share => sql`(${share.id}::text, ${share.participantId}::text, ${share.shareCents}::integer)`),
        sql`, `,
    )

    const result = await database.execute(sql`
        WITH input_shares(share_id, participant_id, share_cents) AS (
            VALUES ${sharesValues}
        ),
        scoped_participant_ids AS MATERIALIZED (
            SELECT ${input.participantId}::text AS participant_id
            UNION
            SELECT participant_id FROM input_shares
        ),
        eligibility AS (
            SELECT
                (SELECT count(*) FROM scoped_participant_ids) AS expected_count,
                (SELECT count(*) FROM event_participants
                   WHERE event_id = ${input.eventId}
                     AND is_active = true
                     AND id IN (SELECT participant_id FROM scoped_participant_ids)) AS eligible_count
        ),
        currency_conflict AS (
            SELECT (
                EXISTS (
                    SELECT 1 FROM event_transactions
                    WHERE event_id = ${input.eventId} AND deleted_at IS NULL AND currency <> ${input.currency}
                )
                OR EXISTS (
                    SELECT 1 FROM event_settlements
                    WHERE event_id = ${input.eventId} AND deleted_at IS NULL AND currency <> ${input.currency}
                )
            ) AS conflict
        ),
        write_guard AS (
            SELECT (
                (SELECT expected_count FROM eligibility) = (SELECT eligible_count FROM eligibility)
                AND (SELECT coalesce(sum(share_cents), 0) FROM input_shares) = ${input.amountCents}
                AND NOT (SELECT conflict FROM currency_conflict)
            ) AS ok
        ),
        inserted_transaction AS (
            INSERT INTO event_transactions (
                id, event_id, type, participant_id, description, amount_cents, currency, occurred_on, note, created_by
            )
            SELECT
                ${transactionId}, ${input.eventId}, ${input.type}, ${input.participantId}, ${input.description},
                ${input.amountCents}, ${input.currency}, ${input.occurredOn}::date, ${input.note ?? null}, ${input.createdBy}
            WHERE (SELECT ok FROM write_guard)
            RETURNING *
        ),
        inserted_shares AS (
            INSERT INTO event_transaction_shares (id, transaction_id, event_id, participant_id, share_cents)
            SELECT input_shares.share_id, inserted_transaction.id, ${input.eventId}, input_shares.participant_id, input_shares.share_cents
            FROM input_shares, inserted_transaction
            RETURNING id
        )
        SELECT * FROM inserted_transaction
    `)

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) {
        await diagnoseTransactionWriteFailure(input)
    }

    return {
        ...mapTransactionRow(row as Record<string, unknown>),
        shares: shareRows.map(({ participantId, shareCents }) => ({ participantId, shareCents })),
    }
}

export interface UpdateTransactionInput extends CreateTransactionInput {
    transactionId: string
}

/**
 * Same single-CTE shape as `createTransactionWithShares`: updates the
 * parent movement AND fully replaces its shares (delete-then-insert) in one
 * statement, guarded by the same three invariants PLUS "the target movement
 * exists, is not soft-deleted, and belongs to this event". Nothing is
 * written when any condition fails.
 */
export async function updateTransactionWithShares(input: UpdateTransactionInput): Promise<TransactionWithShares> {
    const database = requireDb()

    assertValidShares(input.amountCents, input.shares.map(share => share.shareCents))
    assertNoDuplicateShareParticipants(input.shares)

    const shareRows = input.shares.map(share => ({ id: randomUUID(), ...share }))
    const sharesValues = sql.join(
        shareRows.map(share => sql`(${share.id}::text, ${share.participantId}::text, ${share.shareCents}::integer)`),
        sql`, `,
    )

    const result = await database.execute(sql`
        WITH input_shares(share_id, participant_id, share_cents) AS (
            VALUES ${sharesValues}
        ),
        target AS MATERIALIZED (
            SELECT id FROM event_transactions
            WHERE id = ${input.transactionId} AND event_id = ${input.eventId} AND deleted_at IS NULL
        ),
        scoped_participant_ids AS MATERIALIZED (
            SELECT ${input.participantId}::text AS participant_id
            UNION
            SELECT participant_id FROM input_shares
        ),
        eligibility AS (
            SELECT
                (SELECT count(*) FROM scoped_participant_ids) AS expected_count,
                (SELECT count(*) FROM event_participants
                   WHERE event_id = ${input.eventId}
                     AND is_active = true
                     AND id IN (SELECT participant_id FROM scoped_participant_ids)) AS eligible_count
        ),
        currency_conflict AS (
            SELECT (
                EXISTS (
                    SELECT 1 FROM event_transactions
                    WHERE event_id = ${input.eventId} AND deleted_at IS NULL
                      AND id <> ${input.transactionId} AND currency <> ${input.currency}
                )
                OR EXISTS (
                    SELECT 1 FROM event_settlements
                    WHERE event_id = ${input.eventId} AND deleted_at IS NULL AND currency <> ${input.currency}
                )
            ) AS conflict
        ),
        write_guard AS (
            SELECT (
                EXISTS (SELECT 1 FROM target)
                AND (SELECT expected_count FROM eligibility) = (SELECT eligible_count FROM eligibility)
                AND (SELECT coalesce(sum(share_cents), 0) FROM input_shares) = ${input.amountCents}
                AND NOT (SELECT conflict FROM currency_conflict)
            ) AS ok
        ),
        updated_transaction AS (
            UPDATE event_transactions
            SET type = ${input.type},
                participant_id = ${input.participantId},
                description = ${input.description},
                amount_cents = ${input.amountCents},
                currency = ${input.currency},
                occurred_on = ${input.occurredOn}::date,
                note = ${input.note ?? null},
                updated_at = now()
            WHERE id IN (SELECT id FROM target) AND (SELECT ok FROM write_guard)
            RETURNING *
        ),
        deleted_shares AS (
            DELETE FROM event_transaction_shares
            WHERE transaction_id IN (SELECT id FROM updated_transaction)
            RETURNING id
        ),
        inserted_shares AS (
            INSERT INTO event_transaction_shares (id, transaction_id, event_id, participant_id, share_cents)
            SELECT input_shares.share_id, updated_transaction.id, ${input.eventId}, input_shares.participant_id, input_shares.share_cents
            FROM input_shares, updated_transaction
            -- Forces Postgres to fully materialize (and thus complete) the
            -- deleted_shares DELETE before this INSERT runs: data-modifying
            -- CTEs are always materialized, and referencing one here creates
            -- the dependency Postgres needs to sequence them. Without this,
            -- delete and insert race within the same statement and the old
            -- shares' rows can still be present when the new ones are
            -- inserted, tripping event_transaction_shares_transaction_participant_unique.
            WHERE (SELECT count(*) FROM deleted_shares) >= 0
            RETURNING id
        )
        SELECT * FROM updated_transaction
    `)

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) {
        await diagnoseTransactionWriteFailure(input, {
            transactionId: input.transactionId,
            requireExistingTarget: true,
        })
    }

    return {
        ...mapTransactionRow(row as Record<string, unknown>),
        shares: shareRows.map(({ participantId, shareCents }) => ({ participantId, shareCents })),
    }
}

/** Marks a movement `deleted_at`/`deleted_by` — never a physical DELETE (PLAN §2.9). Idempotent: a second call on an already-deleted (or foreign/missing) id returns `false`. */
export async function softDeleteTransaction(id: string, eventId: string, deletedBy: string): Promise<boolean> {
    const database = requireDb()
    const [deleted] = await database.update(eventTransactions)
        .set({ deletedAt: new Date(), deletedBy })
        .where(and(
            eq(eventTransactions.id, id),
            eq(eventTransactions.eventId, eventId),
            activeLedgerRows(eventTransactions.deletedAt),
        ))
        .returning({ id: eventTransactions.id })
    return !!deleted
}

// ---------------------------------------------------------------------------
// ISSUE-024 — Settlements (payments between participants that reduce
// balances, PLAN §2.9/§3.1). A Stripe withdrawal/contribution is an ordinary
// settlement with the Stripe node as `from`/`to` — no special branch here
// (PLAN §2.6a), matching how `createTransactionWithShares` treats the Stripe
// node as just another eligible participant.
// ---------------------------------------------------------------------------

export interface LedgerSettlementRecord {
    id: string
    eventId: string
    fromParticipantId: string
    toParticipantId: string
    amountCents: number
    currency: string
    settledOn: string
    note: string | null
    createdBy: string
    createdAt: Date
    updatedAt: Date
}

function mapSettlementRow(row: Record<string, unknown>): LedgerSettlementRecord {
    return {
        id: String(row.id),
        eventId: String(row.event_id),
        fromParticipantId: String(row.from_participant_id),
        toParticipantId: String(row.to_participant_id),
        amountCents: Number(row.amount_cents),
        currency: String(row.currency),
        settledOn: row.settled_on instanceof Date
            ? row.settled_on.toISOString().slice(0, 10)
            : String(row.settled_on),
        note: row.note == null ? null : String(row.note),
        createdBy: String(row.created_by),
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
        updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at)),
    }
}

/** Active settlements, newest `settled_on` first (tie-break newest `created_at`). */
export async function listSettlements(eventId: string): Promise<LedgerSettlementRecord[]> {
    const database = requireDb()
    const rows = await database.select().from(eventSettlements)
        .where(and(
            eq(eventSettlements.eventId, eventId),
            activeLedgerRows(eventSettlements.deletedAt),
        ))
        .orderBy(desc(eventSettlements.settledOn), desc(eventSettlements.createdAt))

    return rows.map(row => ({
        id: row.id,
        eventId: row.eventId,
        fromParticipantId: row.fromParticipantId,
        toParticipantId: row.toParticipantId,
        amountCents: row.amountCents,
        currency: row.currency,
        settledOn: row.settledOn,
        note: row.note,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }))
}

export interface CreateSettlementInput {
    eventId: string
    fromParticipantId: string
    toParticipantId: string
    amountCents: number
    currency: string
    settledOn: string
    note?: string | null
    createdBy: string
}

/**
 * Runs after a guarded write returned zero rows to determine, and throw, the
 * SPECIFIC typed reason (never a bare 500): missing target settlement
 * (update only), ineligible participant(s), or a currency conflict.
 * `fromParticipantId === toParticipantId` is checked by the caller BEFORE
 * this is ever reached (mirrors `diagnoseTransactionWriteFailure`). Always
 * throws — the `never` return type documents that for callers.
 */
async function diagnoseSettlementWriteFailure(
    input: CreateSettlementInput,
    options: { settlementId?: string; requireExistingTarget?: boolean } = {},
): Promise<never> {
    const database = requireDb()

    if (options.requireExistingTarget && options.settlementId) {
        const [target] = await database.select({ id: eventSettlements.id }).from(eventSettlements)
            .where(and(
                eq(eventSettlements.id, options.settlementId),
                eq(eventSettlements.eventId, input.eventId),
                activeLedgerRows(eventSettlements.deletedAt),
            ))
            .limit(1)
        if (!target) throw new LedgerSettlementNotFoundError()
    }

    const scopedIds = Array.from(new Set([input.fromParticipantId, input.toParticipantId]))
    const eligible = await database.select({ id: eventParticipants.id }).from(eventParticipants)
        .where(and(
            eq(eventParticipants.eventId, input.eventId),
            eq(eventParticipants.isActive, true),
            inArray(eventParticipants.id, scopedIds),
        ))
    const eligibleIds = new Set(eligible.map(row => row.id))
    const missingOrInactive = scopedIds.filter(id => !eligibleIds.has(id))
    if (missingOrInactive.length > 0) {
        throw new LedgerParticipantNotFoundError(missingOrInactive)
    }

    const currentCurrency = await getLedgerCurrency(input.eventId, { excludeSettlementId: options.settlementId })
    if (currentCurrency && currentCurrency !== input.currency) {
        throw new LedgerCurrencyMismatchError(currentCurrency)
    }

    // Every guarded condition passed on this fresh re-read — the original
    // failure was a genuine race (something changed between the guarded
    // statement and this diagnostic). Surface the closest typed error rather
    // than a bare 500; the caller should retry.
    throw new LedgerParticipantNotFoundError(scopedIds)
}

/**
 * Inserts a settlement in ONE guarded statement (same shape as
 * `createTransactionWithShares`, gotcha #2): the write only happens when (a)
 * `from`/`to` both belong to this event and are active, and (b) currency
 * matches the ledger's already-fixed currency (or this is the first
 * movement). `from === to` is rejected up front — before touching the DB —
 * even though `event_settlements_from_to_check` also guards it at the DB
 * layer (defense in depth against a race, not the primary signal: a raw
 * check-constraint violation is a 500-shaped Postgres error, not the typed
 * 400 the API contract requires).
 */
export async function createSettlement(input: CreateSettlementInput): Promise<LedgerSettlementRecord> {
    const database = requireDb()

    if (input.fromParticipantId === input.toParticipantId) {
        throw new LedgerSettlementSameParticipantError()
    }

    const settlementId = randomUUID()

    const result = await database.execute(sql`
        WITH eligibility AS (
            SELECT count(*) AS eligible_count FROM event_participants
            WHERE event_id = ${input.eventId}
              AND is_active = true
              AND id IN (${input.fromParticipantId}::text, ${input.toParticipantId}::text)
        ),
        currency_conflict AS (
            SELECT (
                EXISTS (
                    SELECT 1 FROM event_transactions
                    WHERE event_id = ${input.eventId} AND deleted_at IS NULL AND currency <> ${input.currency}
                )
                OR EXISTS (
                    SELECT 1 FROM event_settlements
                    WHERE event_id = ${input.eventId} AND deleted_at IS NULL AND currency <> ${input.currency}
                )
            ) AS conflict
        ),
        write_guard AS (
            SELECT (
                (SELECT eligible_count FROM eligibility) = 2
                AND NOT (SELECT conflict FROM currency_conflict)
            ) AS ok
        )
        INSERT INTO event_settlements (
            id, event_id, from_participant_id, to_participant_id, amount_cents, currency, settled_on, note, created_by
        )
        SELECT
            ${settlementId}, ${input.eventId}, ${input.fromParticipantId}, ${input.toParticipantId},
            ${input.amountCents}, ${input.currency}, ${input.settledOn}::date, ${input.note ?? null}, ${input.createdBy}
        WHERE (SELECT ok FROM write_guard)
        RETURNING *
    `)

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) {
        await diagnoseSettlementWriteFailure(input)
    }

    return mapSettlementRow(row as Record<string, unknown>)
}

export interface UpdateSettlementInput extends CreateSettlementInput {
    settlementId: string
}

/**
 * Same single-guarded-statement shape as `updateTransactionWithShares`,
 * minus the shares dance (settlements have no child rows, so there is no
 * DELETE+INSERT sequencing gotcha to route around here).
 */
export async function updateSettlement(input: UpdateSettlementInput): Promise<LedgerSettlementRecord> {
    const database = requireDb()

    if (input.fromParticipantId === input.toParticipantId) {
        throw new LedgerSettlementSameParticipantError()
    }

    const result = await database.execute(sql`
        WITH target AS MATERIALIZED (
            SELECT id FROM event_settlements
            WHERE id = ${input.settlementId} AND event_id = ${input.eventId} AND deleted_at IS NULL
        ),
        eligibility AS (
            SELECT count(*) AS eligible_count FROM event_participants
            WHERE event_id = ${input.eventId}
              AND is_active = true
              AND id IN (${input.fromParticipantId}::text, ${input.toParticipantId}::text)
        ),
        currency_conflict AS (
            SELECT (
                EXISTS (
                    SELECT 1 FROM event_transactions
                    WHERE event_id = ${input.eventId} AND deleted_at IS NULL AND currency <> ${input.currency}
                )
                OR EXISTS (
                    SELECT 1 FROM event_settlements
                    WHERE event_id = ${input.eventId} AND deleted_at IS NULL
                      AND id <> ${input.settlementId} AND currency <> ${input.currency}
                )
            ) AS conflict
        ),
        write_guard AS (
            SELECT (
                EXISTS (SELECT 1 FROM target)
                AND (SELECT eligible_count FROM eligibility) = 2
                AND NOT (SELECT conflict FROM currency_conflict)
            ) AS ok
        )
        UPDATE event_settlements
        SET from_participant_id = ${input.fromParticipantId},
            to_participant_id = ${input.toParticipantId},
            amount_cents = ${input.amountCents},
            currency = ${input.currency},
            settled_on = ${input.settledOn}::date,
            note = ${input.note ?? null},
            updated_at = now()
        WHERE id IN (SELECT id FROM target) AND (SELECT ok FROM write_guard)
        RETURNING *
    `)

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) {
        await diagnoseSettlementWriteFailure(input, {
            settlementId: input.settlementId,
            requireExistingTarget: true,
        })
    }

    return mapSettlementRow(row as Record<string, unknown>)
}

/** Marks a settlement `deleted_at`/`deleted_by` — never a physical DELETE (PLAN §2.9). Idempotent: a second call on an already-deleted (or foreign/missing) id returns `false`. */
export async function softDeleteSettlement(id: string, eventId: string, deletedBy: string): Promise<boolean> {
    const database = requireDb()
    const [deleted] = await database.update(eventSettlements)
        .set({ deletedAt: new Date(), deletedBy })
        .where(and(
            eq(eventSettlements.id, id),
            eq(eventSettlements.eventId, eventId),
            activeLedgerRows(eventSettlements.deletedAt),
        ))
        .returning({ id: eventSettlements.id })
    return !!deleted
}

// ---------------------------------------------------------------------------
// ISSUE-024 — Ledger snapshot for the calc engine (lib/event-ledger.ts) and
// the read-only Stripe totals/config surface (PLAN §2.6/§3.3).
// ---------------------------------------------------------------------------

export interface LedgerSnapshot {
    /** The ledger's fixed currency (PLAN §2.8), or `null` when the event has no movements yet. */
    currency: string | null
    transactions: LedgerTransaction[]
    shares: LedgerShare[]
    settlements: LedgerSettlement[]
    /** ALL participants of the event, active and inactive (PLAN §2.9: an inactive participant with a non-zero balance must still be presentable). */
    participants: EventParticipant[]
}

/**
 * Reads active transactions (with shares), active settlements and every
 * participant of the event, shaped as direct input for
 * `computeBalances`/`simplifyDebts` (ISSUE-022). Reuses `listTransactions` /
 * `listSettlements` / `listParticipants` rather than re-querying — those
 * already encode the soft-delete filter (gotcha #4) exactly once.
 */
export async function getLedgerSnapshot(eventId: string): Promise<LedgerSnapshot> {
    const [transactionsWithShares, settlementRecords, participants] = await Promise.all([
        listTransactions(eventId),
        listSettlements(eventId),
        listParticipants(eventId),
    ])

    const transactions: LedgerTransaction[] = transactionsWithShares.map(transaction => ({
        id: transaction.id,
        type: transaction.type,
        participantId: transaction.participantId,
        amountCents: transaction.amountCents,
        // Both listTransactions/listSettlements already filter out
        // soft-deleted rows — deletedAt is always null here. computeBalances
        // re-checks this defensively regardless (gotcha #4).
        deletedAt: null,
    }))

    const shares: LedgerShare[] = transactionsWithShares.flatMap(transaction =>
        transaction.shares.map(share => ({
            transactionId: transaction.id,
            participantId: share.participantId,
            shareCents: share.shareCents,
        })),
    )

    const settlements: LedgerSettlement[] = settlementRecords.map(settlement => ({
        fromParticipantId: settlement.fromParticipantId,
        toParticipantId: settlement.toParticipantId,
        amountCents: settlement.amountCents,
        deletedAt: null,
    }))

    const currency = transactionsWithShares[0]?.currency ?? settlementRecords[0]?.currency ?? null

    return { currency, transactions, shares, settlements, participants }
}

/**
 * Σ `amount_cents` of `rsvp_payments` with `status = 'paid'` for this event.
 * **Read-only** — this is the single point where the ledger reads
 * `rsvp_payments`; it is never written from anywhere in this module (PLAN
 * §7 review focus: the ledger must never mutate Stripe payment records).
 */
export async function getStripePaidTotal(eventId: string): Promise<number> {
    const database = requireDb()
    const [row] = await database.select({
        total: sql<string>`coalesce(sum(${rsvpPayments.amountCents}), 0)`,
    })
        .from(rsvpPayments)
        .where(and(
            eq(rsvpPayments.eventId, eventId),
            eq(rsvpPayments.status, 'paid'),
        ))
    return Number(row?.total ?? 0)
}

/** Σ active income transactions received by the event's Stripe node — the "already registered" side of `stripe.unregisteredPaidCents` (PLAN §2.6a/§2.6c). Pure given a snapshot; no extra I/O. */
export function computeStripeRegisteredIncomeCents(snapshot: LedgerSnapshot): number {
    const stripeParticipant = snapshot.participants.find(participant => participant.kind === 'stripe')
    if (!stripeParticipant) return 0

    let total = 0
    for (const transaction of snapshot.transactions) {
        if (transaction.type === 'income' && transaction.participantId === stripeParticipant.id) {
            total += transaction.amountCents
        }
    }
    return total
}

/** Reads `events.ledger_stripe_is_participant` (PLAN §2.6b toggle) by event slug. */
export async function getLedgerStripeMode(eventId: string): Promise<boolean> {
    const database = requireDb()
    const [row] = await database.select({ ledgerStripeIsParticipant: events.ledgerStripeIsParticipant })
        .from(events)
        .where(eq(events.slug, eventId))
        .limit(1)
    if (!row) throw new Error(`getLedgerStripeMode: event not found for slug ${eventId}`)
    return row.ledgerStripeIsParticipant
}

/**
 * Writes `events.ledger_stripe_is_participant`. Pure presentation toggle
 * (PLAN §2.6c): flips how the summary partitions the SAME persisted
 * movements — never touches `event_transactions`/`event_settlements`, and
 * the API layer never blocks the change on unregistered Stripe income (that
 * warning lives in the UI only).
 */
export async function setLedgerStripeMode(eventId: string, stripeIsParticipant: boolean): Promise<boolean> {
    const database = requireDb()
    const [updated] = await database.update(events)
        .set({ ledgerStripeIsParticipant: stripeIsParticipant, updatedAt: new Date() })
        .where(eq(events.slug, eventId))
        .returning({ ledgerStripeIsParticipant: events.ledgerStripeIsParticipant })
    if (!updated) throw new Error(`setLedgerStripeMode: event not found for slug ${eventId}`)
    return updated.ledgerStripeIsParticipant
}
