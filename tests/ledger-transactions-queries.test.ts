/**
 * ISSUE-023 (EPIC-006) — lib/ledger-queries.ts transaction functions:
 * listTransactions, createTransactionWithShares, updateTransactionWithShares,
 * softDeleteTransaction.
 *
 * Query-layer only: mocks `@/lib/db` and drives the REAL
 * lib/ledger-queries.ts (companion to tests/ledger-transactions-api.test.ts
 * — see that file's header comment for why the two cannot share a file).
 *
 * Covers the single-CTE-statement invariants (PLAN-EPIC-006.md §5 gotcha #2):
 * the SQL text itself gates the write on participant eligibility, the
 * shares-sum invariant and currency uniformity, and — when the guarded
 * statement returns nothing — the typed-error diagnosis that follows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

function fakeColumn(name: string) {
    return { name }
}

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

const mocks = vi.hoisted(() => {
    const chain: any = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(),
        orderBy: vi.fn(),
        set: vi.fn(),
        returning: vi.fn(),
    }
    chain.from.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.limit.mockReturnValue(chain)
    chain.orderBy.mockReturnValue(chain)
    chain.set.mockReturnValue(chain)

    return {
        chain,
        select: vi.fn(() => chain),
        update: vi.fn(() => chain),
        execute: vi.fn(),
    }
})

vi.mock('@/lib/db', () => ({
    db: { select: mocks.select, update: mocks.update, execute: mocks.execute },
    isDatabaseConfigured: () => true,
    eventParticipants: {
        id: fakeColumn('id'),
        eventId: fakeColumn('event_id'),
        kind: fakeColumn('kind'),
        isActive: fakeColumn('is_active'),
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
    mocks.chain.set.mockReturnValue(mocks.chain)
    mocks.chain.returning.mockReset()
    mocks.chain.orderBy.mockImplementation(() => Promise.resolve([]))
    mocks.chain.limit.mockImplementation(() => Promise.resolve([]))
}

function rawTransactionRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'tx-1',
        event_id: 'fiesta',
        type: 'expense',
        participant_id: 'participant-1',
        description: 'Renta del salón',
        amount_cents: 100000,
        currency: 'MXN',
        occurred_on: '2026-08-19',
        note: null,
        created_by: 'manager-1',
        created_at: new Date('2026-08-19T00:00:00.000Z'),
        updated_at: new Date('2026-08-19T00:00:00.000Z'),
        ...overrides,
    }
}

const baseInput = {
    eventId: 'fiesta',
    type: 'expense' as const,
    participantId: 'participant-1',
    description: 'Renta del salón',
    amountCents: 100000,
    currency: 'MXN',
    occurredOn: '2026-08-19',
    note: null,
    createdBy: 'manager-1',
    shares: [
        { participantId: 'participant-1', shareCents: 50000 },
        { participantId: 'participant-2', shareCents: 50000 },
    ],
}

describe('createTransactionWithShares', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetChain()
    })

    it('never touches the DB when the shares do not sum to amountCents (assertValidShares runs first)', async () => {
        const { createTransactionWithShares } = await import('@/lib/ledger-queries')

        await expect(createTransactionWithShares({
            ...baseInput,
            shares: [{ participantId: 'participant-1', shareCents: 40000 }, { participantId: 'participant-2', shareCents: 50000 }],
        })).rejects.toThrow()
        expect(mocks.execute).not.toHaveBeenCalled()
    })

    it('never touches the DB when shares repeat the same participant', async () => {
        const { createTransactionWithShares, LedgerSharesMismatchError } = await import('@/lib/ledger-queries')

        await expect(createTransactionWithShares({
            ...baseInput,
            shares: [{ participantId: 'participant-1', shareCents: 50000 }, { participantId: 'participant-1', shareCents: 50000 }],
        })).rejects.toBeInstanceOf(LedgerSharesMismatchError)
        expect(mocks.execute).not.toHaveBeenCalled()
    })

    it('the guarded CTE gates the INSERT on participant eligibility, the shares-sum invariant and currency uniformity', async () => {
        mocks.execute.mockResolvedValue({ rows: [rawTransactionRow()] })

        const { createTransactionWithShares } = await import('@/lib/ledger-queries')
        await createTransactionWithShares(baseInput)

        const statement = sqlTextOf(mocks.execute.mock.calls[0][0])
        expect(statement).toContain('WITH input_shares(share_id, participant_id, share_cents)')
        expect(statement).toContain('scoped_participant_ids')
        expect(statement).toContain('is_active = true')
        expect(statement).toContain('write_guard')
        expect(statement).toContain('currency_conflict')
        expect(statement).toContain('INSERT INTO event_transactions')
        expect(statement).toContain('WHERE (SELECT ok FROM write_guard)')
        expect(statement).toContain('INSERT INTO event_transaction_shares')
        expect(statement).not.toContain('DELETE FROM') // create never deletes existing shares (that's the update path)
    })

    it('a successful write returns the transaction plus the exact shares it was given', async () => {
        mocks.execute.mockResolvedValue({ rows: [rawTransactionRow()] })

        const { createTransactionWithShares } = await import('@/lib/ledger-queries')
        const result = await createTransactionWithShares(baseInput)

        expect(result.id).toBe('tx-1')
        expect(result.amountCents).toBe(100000)
        expect(result.shares).toEqual(baseInput.shares)
    })

    it('when the guarded write returns nothing because a share participant is inactive/foreign, throws LedgerParticipantNotFoundError naming it', async () => {
        mocks.execute.mockResolvedValue({ rows: [] }) // guarded INSERT blocked
        // Diagnostic re-SELECT of eligible participants: only participant-1 is eligible.
        mocks.chain.where.mockImplementationOnce(() => mocks.chain) // pass-through for the select().from().where() chain builder
        mocks.select.mockImplementationOnce(() => ({
            from: () => ({ where: () => Promise.resolve([{ id: 'participant-1' }]) }),
        }))

        const { createTransactionWithShares, LedgerParticipantNotFoundError } = await import('@/lib/ledger-queries')

        const error = await createTransactionWithShares(baseInput).catch(err => err)
        expect(error).toBeInstanceOf(LedgerParticipantNotFoundError)
        expect((error as InstanceType<typeof LedgerParticipantNotFoundError>).participantIds).toEqual(['participant-2'])
    })

    it('when every participant is eligible and shares matched but the write still failed, and the currency differs from the ledger\'s fixed currency, throws LedgerCurrencyMismatchError naming it', async () => {
        mocks.execute.mockResolvedValue({ rows: [] })
        // Diagnostic: both participants eligible.
        mocks.select
            .mockImplementationOnce(() => ({
                from: () => ({ where: () => Promise.resolve([{ id: 'participant-1' }, { id: 'participant-2' }]) }),
            }))
            // Diagnostic currency lookup: an existing active transaction fixed the ledger at MXN.
            .mockImplementationOnce(() => ({
                from: () => ({ where: () => ({ limit: () => Promise.resolve([{ currency: 'MXN' }]) }) }),
            }))

        const { createTransactionWithShares, LedgerCurrencyMismatchError } = await import('@/lib/ledger-queries')

        const error = await createTransactionWithShares({ ...baseInput, currency: 'USD' }).catch(err => err)
        expect(error).toBeInstanceOf(LedgerCurrencyMismatchError)
        expect((error as InstanceType<typeof LedgerCurrencyMismatchError>).currentCurrency).toBe('MXN')
    })
})

describe('updateTransactionWithShares', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetChain()
    })

    it('the guarded CTE checks the target exists/is not soft-deleted/belongs to the event, and fully replaces shares (delete-then-insert)', async () => {
        mocks.execute.mockResolvedValue({ rows: [rawTransactionRow()] })

        const { updateTransactionWithShares } = await import('@/lib/ledger-queries')
        await updateTransactionWithShares({ ...baseInput, transactionId: 'tx-1' })

        const statement = sqlTextOf(mocks.execute.mock.calls[0][0])
        expect(statement).toContain('target AS MATERIALIZED')
        expect(statement).toContain('deleted_at IS NULL')
        expect(statement).toContain('EXISTS (SELECT 1 FROM target)')
        expect(statement).toContain('UPDATE event_transactions')
        expect(statement).toContain('DELETE FROM event_transaction_shares')
        expect(statement).toContain('INSERT INTO event_transaction_shares')
    })

    it('a soft-deleted or cross-event target (guarded write returns nothing, and a fresh re-check confirms it is missing) throws LedgerTransactionNotFoundError', async () => {
        mocks.execute.mockResolvedValue({ rows: [] })
        // Diagnostic target existence re-check finds nothing.
        mocks.select.mockImplementationOnce(() => ({
            from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
        }))

        const { updateTransactionWithShares, LedgerTransactionNotFoundError } = await import('@/lib/ledger-queries')

        const error = await updateTransactionWithShares({ ...baseInput, transactionId: 'ghost' }).catch(err => err)
        expect(error).toBeInstanceOf(LedgerTransactionNotFoundError)
    })

    it('a successful update returns the updated transaction with the new shares', async () => {
        mocks.execute.mockResolvedValue({ rows: [rawTransactionRow({ description: 'Renta actualizada' })] })

        const { updateTransactionWithShares } = await import('@/lib/ledger-queries')
        const result = await updateTransactionWithShares({ ...baseInput, transactionId: 'tx-1' })

        expect(result.description).toBe('Renta actualizada')
        expect(result.shares).toEqual(baseInput.shares)
    })
})

describe('listTransactions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetChain()
    })

    it('an event with no movements never queries the shares table (short-circuits on empty)', async () => {
        mocks.chain.orderBy.mockResolvedValueOnce([])

        const { listTransactions } = await import('@/lib/ledger-queries')
        const result = await listTransactions('fiesta')

        expect(result).toEqual([])
        expect(mocks.select).toHaveBeenCalledTimes(1)
    })

    it('groups shares under their own transaction only — never cross-contaminates between movements', async () => {
        mocks.chain.orderBy.mockResolvedValueOnce([
            { id: 'tx-1', eventId: 'fiesta', type: 'expense', participantId: 'p1', description: 'A', amountCents: 100, currency: 'MXN', occurredOn: '2026-08-19', note: null, createdBy: 'm1', createdAt: new Date(), updatedAt: new Date() },
            { id: 'tx-2', eventId: 'fiesta', type: 'income', participantId: 'p2', description: 'B', amountCents: 200, currency: 'MXN', occurredOn: '2026-08-18', note: null, createdBy: 'm1', createdAt: new Date(), updatedAt: new Date() },
        ])
        mocks.select.mockImplementationOnce(() => mocks.chain).mockImplementationOnce(() => ({
            from: () => ({ where: () => Promise.resolve([
                { transactionId: 'tx-1', participantId: 'p1', shareCents: 100 },
                { transactionId: 'tx-2', participantId: 'p2', shareCents: 200 },
            ]) }),
        }))

        const { listTransactions } = await import('@/lib/ledger-queries')
        const result = await listTransactions('fiesta')

        expect(result.find(t => t.id === 'tx-1')?.shares).toEqual([{ participantId: 'p1', shareCents: 100 }])
        expect(result.find(t => t.id === 'tx-2')?.shares).toEqual([{ participantId: 'p2', shareCents: 200 }])
    })
})

describe('softDeleteTransaction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetChain()
    })

    it('the first DELETE marks deleted_at/deleted_by and returns true', async () => {
        mocks.chain.returning.mockResolvedValueOnce([{ id: 'tx-1' }])

        const { softDeleteTransaction } = await import('@/lib/ledger-queries')
        const result = await softDeleteTransaction('tx-1', 'fiesta', 'manager-1')

        expect(result).toBe(true)
        expect(mocks.chain.set).toHaveBeenCalledWith(expect.objectContaining({ deletedBy: 'manager-1' }))
    })

    it('a second DELETE on the same already-soft-deleted id matches zero rows (guarded by deleted_at IS NULL) and returns false — idempotent', async () => {
        mocks.chain.returning.mockResolvedValueOnce([])

        const { softDeleteTransaction } = await import('@/lib/ledger-queries')
        const result = await softDeleteTransaction('tx-1', 'fiesta', 'manager-1')

        expect(result).toBe(false)
    })
})
