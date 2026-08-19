/**
 * ISSUE-023 (EPIC-006) — lib/ledger-queries.ts participant functions:
 * createParticipant, updateParticipant, ensureStripeParticipant.
 *
 * Query-layer only: mocks `@/lib/db` and drives the REAL
 * lib/ledger-queries.ts (companion to tests/ledger-participants-api.test.ts
 * — see that file's header comment for why the two cannot share a file).
 *
 * Explicitly covers the concurrency scenario the task calls out: two GET
 * requests racing `ensureStripeParticipant` on a brand-new event must leave
 * exactly one `kind='stripe'` row — see "ensureStripeParticipant" describe
 * block below.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

function fakeColumn(name: string) {
    return { name }
}

const mocks = vi.hoisted(() => {
    const chain: any = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(),
        orderBy: vi.fn(),
        values: vi.fn(),
        set: vi.fn(),
        returning: vi.fn(),
    }
    chain.from.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.limit.mockReturnValue(chain)
    chain.orderBy.mockReturnValue(chain)
    chain.values.mockReturnValue(chain)
    chain.set.mockReturnValue(chain)

    return {
        chain,
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        execute: vi.fn(),
    }
})

vi.mock('@/lib/db', () => ({
    db: { select: mocks.select, insert: mocks.insert, update: mocks.update, execute: mocks.execute },
    isDatabaseConfigured: () => true,
    eventParticipants: {
        id: fakeColumn('id'),
        eventId: fakeColumn('event_id'),
        kind: fakeColumn('kind'),
        name: fakeColumn('name'),
        email: fakeColumn('email'),
        userId: fakeColumn('user_id'),
        isActive: fakeColumn('is_active'),
        createdBy: fakeColumn('created_by'),
        createdAt: fakeColumn('created_at'),
    },
    eventTransactions: {
        id: fakeColumn('id'),
        eventId: fakeColumn('event_id'),
        deletedAt: fakeColumn('deleted_at'),
        currency: fakeColumn('currency'),
        occurredOn: fakeColumn('occurred_on'),
        createdAt: fakeColumn('created_at'),
    },
    eventTransactionShares: {
        transactionId: fakeColumn('transaction_id'),
        participantId: fakeColumn('participant_id'),
        shareCents: fakeColumn('share_cents'),
    },
    eventSettlements: {
        eventId: fakeColumn('event_id'),
        deletedAt: fakeColumn('deleted_at'),
        currency: fakeColumn('currency'),
    },
}))

function resetChain() {
    mocks.chain.from.mockReturnValue(mocks.chain)
    mocks.chain.where.mockReturnValue(mocks.chain)
    mocks.chain.limit.mockReturnValue(mocks.chain)
    mocks.chain.orderBy.mockReturnValue(mocks.chain)
    mocks.chain.values.mockReturnValue(mocks.chain)
    mocks.chain.set.mockReturnValue(mocks.chain)
    mocks.chain.returning.mockReset()
    mocks.chain.limit.mockImplementation(() => Promise.resolve([]))
}

function stripeParticipantRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'stripe-1',
        event_id: 'fiesta',
        kind: 'stripe',
        name: 'Stripe',
        email: null,
        user_id: null,
        is_active: true,
        created_by: 'user-1',
        created_at: new Date('2026-08-19T00:00:00.000Z'),
        ...overrides,
    }
}

describe('createParticipant', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetChain()
    })

    it('rejects the reserved "Stripe" name (case-insensitive, trimmed) without ever calling db.insert', async () => {
        const { createParticipant, LedgerParticipantNameConflictError } = await import('@/lib/ledger-queries')

        await expect(createParticipant({
            eventId: 'fiesta',
            name: '  stripe  ',
            createdBy: 'user-1',
        })).rejects.toBeInstanceOf(LedgerParticipantNameConflictError)
        expect(mocks.insert).not.toHaveBeenCalled()
    })

    it('creates a kind=person participant, trimming the name and defaulting email/userId to null', async () => {
        mocks.chain.returning.mockResolvedValue([{
            id: 'participant-1', eventId: 'fiesta', kind: 'person', name: 'Ana',
            email: null, userId: null, isActive: true, createdBy: 'user-1', createdAt: new Date(),
        }])

        const { createParticipant } = await import('@/lib/ledger-queries')
        const created = await createParticipant({ eventId: 'fiesta', name: '  Ana  ', createdBy: 'user-1' })

        expect(mocks.chain.values).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'fiesta', kind: 'person', name: 'Ana', email: null, userId: null, createdBy: 'user-1',
        }))
        expect(created.name).toBe('Ana')
    })

    it('a duplicate name (unique violation) maps to LedgerParticipantNameConflictError, never a raw DB error', async () => {
        const dbError = Object.assign(new Error('duplicate key value violates unique constraint "event_participants_event_name_unique"'), { code: '23505' })
        mocks.chain.returning.mockRejectedValue(dbError)

        const { createParticipant, LedgerParticipantNameConflictError } = await import('@/lib/ledger-queries')

        await expect(createParticipant({ eventId: 'fiesta', name: 'Ana', createdBy: 'user-1' }))
            .rejects.toBeInstanceOf(LedgerParticipantNameConflictError)
    })
})

describe('updateParticipant', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetChain()
    })

    it('the guarded UPDATE targets only kind=person — when it touches zero rows AND the target is the Stripe node, throws LedgerStripeParticipantImmutableError', async () => {
        mocks.chain.returning.mockResolvedValue([]) // guarded UPDATE matched nothing (kind='stripe' excluded it)
        mocks.chain.limit.mockImplementation(() => Promise.resolve([{ kind: 'stripe' }])) // diagnostic re-select

        const { updateParticipant, LedgerStripeParticipantImmutableError } = await import('@/lib/ledger-queries')

        await expect(updateParticipant('fiesta', 'stripe-1', { isActive: false }))
            .rejects.toBeInstanceOf(LedgerStripeParticipantImmutableError)
    })

    it('returns null when the participant does not exist or belongs to another event', async () => {
        mocks.chain.returning.mockResolvedValue([])
        mocks.chain.limit.mockImplementation(() => Promise.resolve([])) // diagnostic re-select finds nothing

        const { updateParticipant } = await import('@/lib/ledger-queries')
        const result = await updateParticipant('fiesta', 'ghost', { isActive: false })

        expect(result).toBeNull()
    })

    it('renames a kind=person participant successfully', async () => {
        mocks.chain.returning.mockResolvedValue([{
            id: 'participant-1', eventId: 'fiesta', kind: 'person', name: 'Ana María',
            email: null, userId: null, isActive: true, createdBy: 'user-1', createdAt: new Date(),
        }])

        const { updateParticipant } = await import('@/lib/ledger-queries')
        const result = await updateParticipant('fiesta', 'participant-1', { name: 'Ana María' })

        expect(mocks.chain.set).toHaveBeenCalledWith({ name: 'Ana María' })
        expect(result?.name).toBe('Ana María')
    })

    it('a rename to an already-used name maps the unique violation to LedgerParticipantNameConflictError', async () => {
        const dbError = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
        mocks.chain.returning.mockRejectedValue(dbError)

        const { updateParticipant, LedgerParticipantNameConflictError } = await import('@/lib/ledger-queries')

        await expect(updateParticipant('fiesta', 'participant-2', { name: 'Ana' }))
            .rejects.toBeInstanceOf(LedgerParticipantNameConflictError)
    })
})

describe('ensureStripeParticipant — idempotency (ISSUE-023 gotcha #9)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetChain()
    })

    it('a fresh event: the guarded INSERT wins and returns the new Stripe row', async () => {
        mocks.execute.mockResolvedValueOnce({ rows: [stripeParticipantRow()] })

        const { ensureStripeParticipant } = await import('@/lib/ledger-queries')
        const result = await ensureStripeParticipant('fiesta', 'user-1')

        expect(result).toMatchObject({ id: 'stripe-1', kind: 'stripe', name: 'Stripe' })
        expect(mocks.select).not.toHaveBeenCalled() // no fallback SELECT needed — the INSERT itself returned the row
    })

    it('two concurrent GETs on a brand-new event: the SECOND call\'s guarded INSERT hits the partial-unique ON CONFLICT DO NOTHING (empty RETURNING) and falls back to SELECT — both calls resolve the SAME single Stripe row, never a duplicate', async () => {
        // First caller's INSERT wins the race.
        mocks.execute.mockResolvedValueOnce({ rows: [stripeParticipantRow()] })
        // Second caller's INSERT loses to ON CONFLICT DO NOTHING (RETURNING empty).
        mocks.execute.mockResolvedValueOnce({ rows: [] })
        // Second caller's fallback SELECT finds the row the first caller committed.
        mocks.chain.limit.mockImplementationOnce(() => Promise.resolve([{
            id: 'stripe-1', eventId: 'fiesta', kind: 'stripe', name: 'Stripe',
            email: null, userId: null, isActive: true, createdBy: 'user-1', createdAt: new Date('2026-08-19T00:00:00.000Z'),
        }]))

        const { ensureStripeParticipant } = await import('@/lib/ledger-queries')
        const [first, second] = await Promise.all([
            ensureStripeParticipant('fiesta', 'user-1'),
            ensureStripeParticipant('fiesta', 'user-2'),
        ])

        expect(first.id).toBe('stripe-1')
        expect(second.id).toBe('stripe-1')
        expect(mocks.execute).toHaveBeenCalledTimes(2) // exactly one INSERT attempt per call — no retry loop
        expect(mocks.select).toHaveBeenCalledTimes(1) // only the loser needs the fallback read
    })

    it('the ON CONFLICT clause targets the exact partial unique index predicate (event_id) WHERE kind = \'stripe\'', async () => {
        mocks.execute.mockResolvedValueOnce({ rows: [stripeParticipantRow()] })

        const { ensureStripeParticipant } = await import('@/lib/ledger-queries')
        await ensureStripeParticipant('fiesta', 'user-1')

        const statementChunks = (mocks.execute.mock.calls[0][0] as { queryChunks: unknown[] }).queryChunks
        const statement = statementChunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
        expect(statement).toContain("ON CONFLICT (event_id) WHERE kind = 'stripe' DO NOTHING")
        expect(statement).toContain("kind, name, email, user_id, is_active, created_by")
    })
})
