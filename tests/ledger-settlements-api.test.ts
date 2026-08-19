/**
 * ISSUE-024 (EPIC-006) — app/api/admin/ledger/settlements/route.ts.
 *
 * Route-level only: mocks `@/lib/ledger-queries` wholesale (same two-file
 * split rationale as tests/ledger-transactions-api.test.ts — a whole-module
 * vi.mock('@/lib/ledger-queries') and a real, @/lib/db-backed
 * lib/ledger-queries.ts cannot coexist in one file). The real single-CTE SQL
 * guard/currency/eligibility behavior of createSettlement/updateSettlement
 * is proven against a real Postgres database by the ad hoc smoke script run
 * for this issue (see the PR description), not re-derived here with a
 * hand-rolled Drizzle mock.
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
    class LedgerCurrencyMismatchError extends Error {
        constructor(readonly currentCurrency: string) {
            super(`Este evento ya tiene movimientos en ${currentCurrency}; no se puede mezclar monedas en el mismo ledger`)
            this.name = 'LedgerCurrencyMismatchError'
        }
    }
    class LedgerSettlementSameParticipantError extends Error {
        constructor() {
            super('fromParticipantId y toParticipantId no pueden ser el mismo participante')
            this.name = 'LedgerSettlementSameParticipantError'
        }
    }
    class LedgerSettlementNotFoundError extends Error {
        constructor() {
            super('Settlement no encontrado')
            this.name = 'LedgerSettlementNotFoundError'
        }
    }

    return {
        validateSession: vi.fn(),
        userHasEventAccess: vi.fn(),
        getEventBySlug: vi.fn(),
        listSettlements: vi.fn(),
        createSettlement: vi.fn(),
        updateSettlement: vi.fn(),
        softDeleteSettlement: vi.fn(),
        LedgerParticipantNotFoundError,
        LedgerCurrencyMismatchError,
        LedgerSettlementSameParticipantError,
        LedgerSettlementNotFoundError,
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
    listSettlements: mocks.listSettlements,
    createSettlement: mocks.createSettlement,
    updateSettlement: mocks.updateSettlement,
    softDeleteSettlement: mocks.softDeleteSettlement,
    LedgerParticipantNotFoundError: mocks.LedgerParticipantNotFoundError,
    LedgerCurrencyMismatchError: mocks.LedgerCurrencyMismatchError,
    LedgerSettlementSameParticipantError: mocks.LedgerSettlementSameParticipantError,
    LedgerSettlementNotFoundError: mocks.LedgerSettlementNotFoundError,
}))

const storedEvent = { id: 'event-id', slug: 'fiesta' }

function settlementRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'settlement-1',
        eventId: 'fiesta',
        fromParticipantId: 'participant-b',
        toParticipantId: 'participant-a',
        amountCents: 50000,
        currency: 'MXN',
        settledOn: '2026-08-19',
        note: null,
        createdBy: 'manager-1',
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
        updatedAt: new Date('2026-08-19T00:00:00.000Z'),
        ...overrides,
    }
}

function withOrigin(headers: Record<string, string> = {}) {
    return { 'Content-Type': 'application/json', Origin: 'http://localhost', ...headers }
}

function getRequest(eventId = 'fiesta') {
    return new NextRequest(`http://localhost/api/admin/ledger/settlements?eventId=${eventId}`)
}

function postRequest(body: object, headers: Record<string, string> = withOrigin()) {
    return new NextRequest('http://localhost/api/admin/ledger/settlements', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })
}

function patchRequest(body: object, headers: Record<string, string> = withOrigin()) {
    return new NextRequest('http://localhost/api/admin/ledger/settlements', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
    })
}

function deleteRequest(body: object, headers: Record<string, string> = withOrigin()) {
    return new NextRequest('http://localhost/api/admin/ledger/settlements', {
        method: 'DELETE',
        headers,
        body: JSON.stringify(body),
    })
}

const baseSettlementBody = {
    eventId: 'fiesta',
    fromParticipantId: 'participant-b',
    toParticipantId: 'participant-a',
    amountCents: 50000,
    currency: 'MXN',
    settledOn: '2026-08-19',
}

describe('GET /api/admin/ledger/settlements', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.listSettlements.mockResolvedValue([settlementRow()])
    })

    it('401s with no session', async () => {
        mocks.validateSession.mockResolvedValue(null)
        const { GET } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await GET(getRequest())
        expect(response.status).toBe(401)
    })

    it('a viewer can list settlements — 200', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true })

        const { GET } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.userHasEventAccess).toHaveBeenCalledWith('user-1', 'event-id', 'viewer')
        expect(data.settlements).toHaveLength(1)
    })

    it('a user with no access gets 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { GET } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await GET(getRequest())

        expect(response.status).toBe(403)
        expect(mocks.listSettlements).not.toHaveBeenCalled()
    })

    it('responds with Cache-Control: no-store', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'super_admin' })

        const { GET } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await GET(getRequest())

        expect(response.headers.get('Cache-Control')).toBe('no-store')
    })

    it('DTO carries exactly {id, fromParticipantId, toParticipantId, amountCents, currency, settledOn, note, createdBy, createdAt} — never eventId/updatedAt/deletedAt/deletedBy', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'super_admin' })

        const { GET } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(Object.keys(data.settlements[0]).sort()).toEqual([
            'amountCents', 'createdAt', 'createdBy', 'currency', 'fromParticipantId',
            'id', 'note', 'settledOn', 'toParticipantId',
        ].sort())
        expect(JSON.stringify(data)).not.toContain('updatedAt')
        expect(JSON.stringify(data)).not.toContain('deletedAt')
        expect(JSON.stringify(data)).not.toContain('deletedBy')
    })
})

describe('POST /api/admin/ledger/settlements', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.createSettlement.mockResolvedValue(settlementRow())
    })

    it('rejects a cross-site POST (no Origin/Referer) with 403 before any validation', async () => {
        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest(baseSettlementBody, { 'Content-Type': 'application/json' }))
        expect(response.status).toBe(403)
        expect(mocks.createSettlement).not.toHaveBeenCalled()
    })

    it('a viewer (no manager access) is rejected with 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest(baseSettlementBody))

        expect(response.status).toBe(403)
        expect(mocks.createSettlement).not.toHaveBeenCalled()
    })

    it('a manager registers a settlement — 201', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest(baseSettlementBody))
        const data = await response.json()

        expect(response.status).toBe(201)
        expect(mocks.createSettlement).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'fiesta',
            fromParticipantId: 'participant-b',
            toParticipantId: 'participant-a',
            amountCents: 50000,
            currency: 'MXN',
            settledOn: '2026-08-19',
            createdBy: 'manager-1',
        }))
        expect(data.settlement.id).toBe('settlement-1')
    })

    it('a settlement is not validated against any suggested transfer — an arbitrary/partial amount is accepted with no extra check', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, amountCents: 137 }))

        expect(response.status).toBe(201)
        expect(mocks.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 137 }))
    })

    it('fromParticipantId === toParticipantId is rejected 400 BEFORE reaching the data layer', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, toParticipantId: 'participant-b' }))

        expect(response.status).toBe(400)
        expect(mocks.createSettlement).not.toHaveBeenCalled()
    })

    it('the Stripe node is a valid from participant — a withdrawal — with no special handling', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, fromParticipantId: 'stripe-1' }))

        expect(response.status).toBe(201)
        expect(mocks.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ fromParticipantId: 'stripe-1' }))
    })

    it('the Stripe node is a valid to participant — a contribution to the fund — with no special handling', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, toParticipantId: 'stripe-1' }))

        expect(response.status).toBe(201)
        expect(mocks.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ toParticipantId: 'stripe-1' }))
    })

    it('rejects amountCents above the sanity cap (99,999,999) with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, amountCents: 100_000_000 }))

        expect(response.status).toBe(400)
        expect(mocks.createSettlement).not.toHaveBeenCalled()
    })

    it('rejects a currency outside the MXN/USD whitelist with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, currency: 'EUR' }))

        expect(response.status).toBe(400)
        expect(mocks.createSettlement).not.toHaveBeenCalled()
    })

    it('rejects a malformed settledOn (invalid calendar date) with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, settledOn: '2026-02-30' }))

        expect(response.status).toBe(400)
        expect(mocks.createSettlement).not.toHaveBeenCalled()
    })

    it('a cross-event participant id maps LedgerParticipantNotFoundError to 400 with no rows created', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.createSettlement.mockRejectedValue(new mocks.LedgerParticipantNotFoundError(['other-event-participant']))

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest(baseSettlementBody))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.success).toBe(false)
    })

    it('a currency mismatch against the ledger\'s already-fixed currency maps to 400 with the current currency in the message', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.createSettlement.mockRejectedValue(new mocks.LedgerCurrencyMismatchError('MXN'))

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, currency: 'USD' }))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('MXN')
    })

    it('rejects unknown extra body keys with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await POST(postRequest({ ...baseSettlementBody, unexpected: true }))

        expect(response.status).toBe(400)
        expect(mocks.createSettlement).not.toHaveBeenCalled()
    })
})

describe('PATCH /api/admin/ledger/settlements', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.updateSettlement.mockResolvedValue(settlementRow({ amountCents: 60000 }))
    })

    it('a viewer is rejected with 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { PATCH } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await PATCH(patchRequest({ ...baseSettlementBody, settlementId: 'settlement-1' }))

        expect(response.status).toBe(403)
        expect(mocks.updateSettlement).not.toHaveBeenCalled()
    })

    it('a manager updates a settlement — 200', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { PATCH } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await PATCH(patchRequest({ ...baseSettlementBody, settlementId: 'settlement-1', amountCents: 60000 }))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.updateSettlement).toHaveBeenCalledWith(expect.objectContaining({ settlementId: 'settlement-1', amountCents: 60000 }))
        expect(data.settlement.amountCents).toBe(60000)
    })

    it('fromParticipantId === toParticipantId is rejected 400 BEFORE reaching the data layer', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { PATCH } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await PATCH(patchRequest({ ...baseSettlementBody, settlementId: 'settlement-1', toParticipantId: baseSettlementBody.fromParticipantId }))

        expect(response.status).toBe(400)
        expect(mocks.updateSettlement).not.toHaveBeenCalled()
    })

    it('a soft-deleted or cross-event target maps LedgerSettlementNotFoundError to 404', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.updateSettlement.mockRejectedValue(new mocks.LedgerSettlementNotFoundError())

        const { PATCH } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await PATCH(patchRequest({ ...baseSettlementBody, settlementId: 'ghost' }))

        expect(response.status).toBe(404)
    })
})

describe('DELETE /api/admin/ledger/settlements', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
    })

    it('rejects a cross-site DELETE (no Origin/Referer) with 403', async () => {
        const { DELETE } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await DELETE(deleteRequest({ eventId: 'fiesta', settlementId: 'settlement-1' }, { 'Content-Type': 'application/json' }))
        expect(response.status).toBe(403)
    })

    it('a viewer is rejected with 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { DELETE } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await DELETE(deleteRequest({ eventId: 'fiesta', settlementId: 'settlement-1' }))

        expect(response.status).toBe(403)
        expect(mocks.softDeleteSettlement).not.toHaveBeenCalled()
    })

    it('a manager soft-deletes a settlement — 200, deletedBy is the acting user', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.softDeleteSettlement.mockResolvedValue(true)

        const { DELETE } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await DELETE(deleteRequest({ eventId: 'fiesta', settlementId: 'settlement-1' }))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(mocks.softDeleteSettlement).toHaveBeenCalledWith('settlement-1', 'fiesta', 'manager-1')
    })

    it('a second DELETE on an already-deleted settlement responds 404 (idempotent)', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.softDeleteSettlement.mockResolvedValue(false)

        const { DELETE } = await import('@/app/api/admin/ledger/settlements/route')
        const response = await DELETE(deleteRequest({ eventId: 'fiesta', settlementId: 'settlement-1' }))

        expect(response.status).toBe(404)
    })
})
