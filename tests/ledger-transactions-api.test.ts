/**
 * ISSUE-023 (EPIC-006) — app/api/admin/ledger/transactions/route.ts.
 *
 * Route-level only: mocks `@/lib/ledger-queries` wholesale (same two-file
 * split rationale as tests/ledger-participants-api.test.ts — see that file's
 * header comment). Uses the REAL `@/lib/event-ledger.ts` (assertValidShares/
 * splitEqual, ISSUE-022) since those are pure functions with no I/O.
 * tests/ledger-transactions-queries.test.ts is the companion file that
 * drives the REAL lib/ledger-queries.ts (mocking only `@/lib/db`) to prove
 * the guarded CTE / invariant / soft-delete behavior itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
    class LedgerParticipantNotFoundError extends Error {
        constructor(readonly participantIds: string[]) {
            super(`Uno o más participantes no pertenecen a este evento o están inactivos: ${participantIds.join(', ')}`)
            this.name = 'LedgerParticipantNotFoundError'
        }
    }
    class LedgerSharesMismatchError extends Error {
        constructor(message: string) {
            super(message)
            this.name = 'LedgerSharesMismatchError'
        }
    }
    class LedgerCurrencyMismatchError extends Error {
        constructor(readonly currentCurrency: string) {
            super(`Este evento ya tiene movimientos en ${currentCurrency}; no se puede mezclar monedas en el mismo ledger`)
            this.name = 'LedgerCurrencyMismatchError'
        }
    }
    class LedgerTransactionNotFoundError extends Error {
        constructor() {
            super('Movimiento no encontrado')
            this.name = 'LedgerTransactionNotFoundError'
        }
    }

    return {
        validateSession: vi.fn(),
        userHasEventAccess: vi.fn(),
        getEventBySlug: vi.fn(),
        listTransactions: vi.fn(),
        createTransactionWithShares: vi.fn(),
        updateTransactionWithShares: vi.fn(),
        softDeleteTransaction: vi.fn(),
        LedgerParticipantNotFoundError,
        LedgerSharesMismatchError,
        LedgerCurrencyMismatchError,
        LedgerTransactionNotFoundError,
    }
})

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: vi.fn(() => ({ value: 'session-token' })),
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
}))

vi.mock('@/lib/user-queries', () => ({
    userHasEventAccess: mocks.userHasEventAccess,
}))

vi.mock('@/lib/db', () => ({
    isDatabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
}))

vi.mock('@/lib/ledger-queries', () => ({
    listTransactions: mocks.listTransactions,
    createTransactionWithShares: mocks.createTransactionWithShares,
    updateTransactionWithShares: mocks.updateTransactionWithShares,
    softDeleteTransaction: mocks.softDeleteTransaction,
    LedgerParticipantNotFoundError: mocks.LedgerParticipantNotFoundError,
    LedgerSharesMismatchError: mocks.LedgerSharesMismatchError,
    LedgerCurrencyMismatchError: mocks.LedgerCurrencyMismatchError,
    LedgerTransactionNotFoundError: mocks.LedgerTransactionNotFoundError,
}))

const storedEvent = { id: 'event-id', slug: 'fiesta' }

function transactionRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'tx-1',
        eventId: 'fiesta',
        type: 'expense',
        participantId: 'participant-1',
        description: 'Renta del salón',
        amountCents: 100000,
        currency: 'MXN',
        occurredOn: '2026-08-19',
        note: null,
        createdBy: 'manager-1',
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
        updatedAt: new Date('2026-08-19T00:00:00.000Z'),
        shares: [{ participantId: 'participant-1', shareCents: 50000 }, { participantId: 'participant-2', shareCents: 50000 }],
        ...overrides,
    }
}

function withOrigin(headers: Record<string, string> = {}) {
    return { 'Content-Type': 'application/json', Origin: 'http://localhost', ...headers }
}

function getRequest(eventId = 'fiesta') {
    return new NextRequest(`http://localhost/api/admin/ledger/transactions?eventId=${eventId}`)
}

function postRequest(body: object, headers: Record<string, string> = withOrigin()) {
    return new NextRequest('http://localhost/api/admin/ledger/transactions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })
}

function patchRequest(body: object, headers: Record<string, string> = withOrigin()) {
    return new NextRequest('http://localhost/api/admin/ledger/transactions', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
    })
}

function deleteRequest(body: object, headers: Record<string, string> = withOrigin()) {
    return new NextRequest('http://localhost/api/admin/ledger/transactions', {
        method: 'DELETE',
        headers,
        body: JSON.stringify(body),
    })
}

const baseExpenseBody = {
    eventId: 'fiesta',
    type: 'expense',
    participantId: 'participant-1',
    description: 'Renta del salón',
    amountCents: 100000,
    currency: 'MXN',
    occurredOn: '2026-08-19',
    shares: [
        { participantId: 'participant-1', shareCents: 50000 },
        { participantId: 'participant-2', shareCents: 50000 },
    ],
}

describe('GET /api/admin/ledger/transactions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.listTransactions.mockResolvedValue([transactionRow()])
    })

    it('401s with no session', async () => {
        mocks.validateSession.mockResolvedValue(null)
        const { GET } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await GET(getRequest())
        expect(response.status).toBe(401)
    })

    it('a viewer can list transactions — 200', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true })

        const { GET } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.userHasEventAccess).toHaveBeenCalledWith('user-1', 'event-id', 'viewer')
        expect(data.transactions).toHaveLength(1)
    })

    it('a user with no access gets 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { GET } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await GET(getRequest())

        expect(response.status).toBe(403)
        expect(mocks.listTransactions).not.toHaveBeenCalled()
    })

    it('DTO carries exactly {id, type, participantId, description, amountCents, currency, occurredOn, note, createdBy, createdAt, updatedAt, shares} — never eventId/deletedAt/deletedBy', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'super_admin' })

        const { GET } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(Object.keys(data.transactions[0]).sort()).toEqual([
            'amountCents', 'createdAt', 'createdBy', 'currency', 'description', 'id',
            'note', 'occurredOn', 'participantId', 'shares', 'type', 'updatedAt',
        ].sort())
        expect(data.transactions[0].shares).toEqual([
            { participantId: 'participant-1', shareCents: 50000 },
            { participantId: 'participant-2', shareCents: 50000 },
        ])
        expect(JSON.stringify(data)).not.toContain('deletedAt')
        expect(JSON.stringify(data)).not.toContain('deletedBy')
    })
})

describe('POST /api/admin/ledger/transactions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.createTransactionWithShares.mockResolvedValue(transactionRow())
    })

    it('rejects a cross-site POST (no Origin/Referer) with 403 before any validation', async () => {
        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest(baseExpenseBody, { 'Content-Type': 'application/json' }))
        expect(response.status).toBe(403)
        expect(mocks.createTransactionWithShares).not.toHaveBeenCalled()
    })

    it('a viewer (no manager access) is rejected with 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest(baseExpenseBody))

        expect(response.status).toBe(403)
        expect(mocks.createTransactionWithShares).not.toHaveBeenCalled()
    })

    it('a manager creates an expense with explicit shares — 201', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest(baseExpenseBody))
        const data = await response.json()

        expect(response.status).toBe(201)
        expect(mocks.createTransactionWithShares).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'fiesta',
            type: 'expense',
            participantId: 'participant-1',
            amountCents: 100000,
            currency: 'MXN',
            occurredOn: '2026-08-19',
            createdBy: 'manager-1',
            shares: baseExpenseBody.shares,
        }))
        expect(data.transaction.id).toBe('tx-1')
    })

    it('shares that do not sum to amountCents are rejected with 400 BEFORE reaching the data layer (assertValidShares in the route)', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest({
            ...baseExpenseBody,
            shares: [{ participantId: 'participant-1', shareCents: 40000 }, { participantId: 'participant-2', shareCents: 50000 }],
        }))

        expect(response.status).toBe(400)
        expect(mocks.createTransactionWithShares).not.toHaveBeenCalled()
    })

    it('splitMode "equal" with amount 1000 and 3 participants derives 334/333/333 server-side via splitEqual (never trusts a client total)', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest({
            eventId: 'fiesta',
            type: 'income',
            participantId: 'participant-1',
            description: 'Cobro grupal',
            amountCents: 1000,
            currency: 'MXN',
            occurredOn: '2026-08-19',
            splitMode: 'equal',
            participantIds: ['b', 'a', 'c'],
        }))

        expect(response.status).toBe(201)
        const call = mocks.createTransactionWithShares.mock.calls[0][0]
        expect(call.shares.sort((x: any, y: any) => (x.participantId < y.participantId ? -1 : 1))).toEqual([
            { participantId: 'a', shareCents: 334 },
            { participantId: 'b', shareCents: 333 },
            { participantId: 'c', shareCents: 333 },
        ])
    })

    it('a Stripe-payer expense with a normal person reparto is accepted with no special handling', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest({
            ...baseExpenseBody,
            participantId: 'stripe-1',
        }))

        expect(response.status).toBe(201)
        expect(mocks.createTransactionWithShares).toHaveBeenCalledWith(expect.objectContaining({ participantId: 'stripe-1' }))
    })

    it('rejects amountCents above the sanity cap (99,999,999) with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest({ ...baseExpenseBody, amountCents: 100_000_000, shares: [{ participantId: 'participant-1', shareCents: 100_000_000 }] }))

        expect(response.status).toBe(400)
        expect(mocks.createTransactionWithShares).not.toHaveBeenCalled()
    })

    it('rejects a currency outside the MXN/USD whitelist with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest({ ...baseExpenseBody, currency: 'EUR' }))

        expect(response.status).toBe(400)
        expect(mocks.createTransactionWithShares).not.toHaveBeenCalled()
    })

    it('rejects a malformed occurredOn (invalid calendar date) with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest({ ...baseExpenseBody, occurredOn: '2026-02-30' }))

        expect(response.status).toBe(400)
        expect(mocks.createTransactionWithShares).not.toHaveBeenCalled()
    })

    it('a cross-event participant id in the shares maps LedgerParticipantNotFoundError to 400 with no rows created', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.createTransactionWithShares.mockRejectedValue(new mocks.LedgerParticipantNotFoundError(['other-event-participant']))

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest(baseExpenseBody))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.success).toBe(false)
    })

    it('a currency mismatch against the ledger\'s already-fixed currency maps to 400 with the current currency in the message', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.createTransactionWithShares.mockRejectedValue(new mocks.LedgerCurrencyMismatchError('MXN'))

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest({ ...baseExpenseBody, currency: 'USD', shares: baseExpenseBody.shares }))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('MXN')
    })

    it('rejects unknown extra body keys with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await POST(postRequest({ ...baseExpenseBody, unexpected: true }))

        expect(response.status).toBe(400)
        expect(mocks.createTransactionWithShares).not.toHaveBeenCalled()
    })
})

describe('PATCH /api/admin/ledger/transactions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.updateTransactionWithShares.mockResolvedValue(transactionRow({ description: 'Renta actualizada' }))
    })

    it('a viewer is rejected with 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { PATCH } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await PATCH(patchRequest({ ...baseExpenseBody, transactionId: 'tx-1' }))

        expect(response.status).toBe(403)
        expect(mocks.updateTransactionWithShares).not.toHaveBeenCalled()
    })

    it('a manager updates a movement — 200', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { PATCH } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await PATCH(patchRequest({ ...baseExpenseBody, transactionId: 'tx-1', description: 'Renta actualizada' }))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.updateTransactionWithShares).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'tx-1' }))
        expect(data.transaction.description).toBe('Renta actualizada')
    })

    it('a soft-deleted or cross-event target maps LedgerTransactionNotFoundError to 404', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.updateTransactionWithShares.mockRejectedValue(new mocks.LedgerTransactionNotFoundError())

        const { PATCH } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await PATCH(patchRequest({ ...baseExpenseBody, transactionId: 'ghost' }))

        expect(response.status).toBe(404)
    })
})

describe('DELETE /api/admin/ledger/transactions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
    })

    it('rejects a cross-site DELETE (no Origin/Referer) with 403', async () => {
        const { DELETE } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await DELETE(deleteRequest({ eventId: 'fiesta', transactionId: 'tx-1' }, { 'Content-Type': 'application/json' }))
        expect(response.status).toBe(403)
    })

    it('a viewer is rejected with 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { DELETE } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await DELETE(deleteRequest({ eventId: 'fiesta', transactionId: 'tx-1' }))

        expect(response.status).toBe(403)
        expect(mocks.softDeleteTransaction).not.toHaveBeenCalled()
    })

    it('a manager soft-deletes a movement — 200, deletedBy is the acting user', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.softDeleteTransaction.mockResolvedValue(true)

        const { DELETE } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await DELETE(deleteRequest({ eventId: 'fiesta', transactionId: 'tx-1' }))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(mocks.softDeleteTransaction).toHaveBeenCalledWith('tx-1', 'fiesta', 'manager-1')
    })

    it('a second DELETE on an already-deleted movement responds 404 (idempotent)', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.softDeleteTransaction.mockResolvedValue(false)

        const { DELETE } = await import('@/app/api/admin/ledger/transactions/route')
        const response = await DELETE(deleteRequest({ eventId: 'fiesta', transactionId: 'tx-1' }))

        expect(response.status).toBe(404)
    })
})
