/**
 * ISSUE-024 (EPIC-006) — app/api/admin/ledger/config/route.ts: the
 * `events.ledger_stripe_is_participant` toggle (PLAN §2.6b) plus
 * `stripeIncomeRegisteredCents` for the UI's double-counting warning
 * (gotcha #9). Route-level only: mocks `@/lib/ledger-queries` wholesale.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    validateSession: vi.fn(),
    userHasEventAccess: vi.fn(),
    getEventBySlug: vi.fn(),
    getLedgerStripeMode: vi.fn(),
    setLedgerStripeMode: vi.fn(),
    getLedgerSnapshot: vi.fn(),
    computeStripeRegisteredIncomeCents: vi.fn(),
}))

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
    getLedgerStripeMode: mocks.getLedgerStripeMode,
    setLedgerStripeMode: mocks.setLedgerStripeMode,
    getLedgerSnapshot: mocks.getLedgerSnapshot,
    computeStripeRegisteredIncomeCents: mocks.computeStripeRegisteredIncomeCents,
}))

const storedEvent = { id: 'event-id', slug: 'fiesta' }

function withOrigin(headers: Record<string, string> = {}) {
    return { 'Content-Type': 'application/json', Origin: 'http://localhost', ...headers }
}

function getRequest(eventId = 'fiesta') {
    return new NextRequest(`http://localhost/api/admin/ledger/config?eventId=${eventId}`)
}

function patchRequest(body: object, headers: Record<string, string> = withOrigin()) {
    return new NextRequest('http://localhost/api/admin/ledger/config', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
    })
}

describe('GET /api/admin/ledger/config', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.getLedgerStripeMode.mockResolvedValue(false)
        mocks.getLedgerSnapshot.mockResolvedValue({ currency: 'MXN', transactions: [], shares: [], settlements: [], participants: [] })
        mocks.computeStripeRegisteredIncomeCents.mockReturnValue(0)
    })

    it('401s with no session', async () => {
        mocks.validateSession.mockResolvedValue(null)
        const { GET } = await import('@/app/api/admin/ledger/config/route')
        const response = await GET(getRequest())
        expect(response.status).toBe(401)
    })

    it('a viewer can read the config — 200', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true })

        const { GET } = await import('@/app/api/admin/ledger/config/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.userHasEventAccess).toHaveBeenCalledWith('user-1', 'event-id', 'viewer')
        expect(data).toMatchObject({ success: true, stripeIsParticipant: false, stripeIncomeRegisteredCents: 0 })
    })

    it('a user with no access gets 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { GET } = await import('@/app/api/admin/ledger/config/route')
        const response = await GET(getRequest())

        expect(response.status).toBe(403)
        expect(mocks.getLedgerStripeMode).not.toHaveBeenCalled()
    })

    it('exposes exactly {success, stripeIsParticipant, stripeIncomeRegisteredCents} — the raw column name never leaks', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'super_admin' })

        const { GET } = await import('@/app/api/admin/ledger/config/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(Object.keys(data).sort()).toEqual(['stripeIncomeRegisteredCents', 'stripeIsParticipant', 'success'].sort())
        expect(JSON.stringify(data)).not.toContain('ledgerStripeIsParticipant')
        expect(JSON.stringify(data)).not.toContain('ledger_stripe_is_participant')
    })

    it('reflects a registered-income delta from the snapshot (the UI double-counting warning input, gotcha #9)', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'super_admin' })
        mocks.computeStripeRegisteredIncomeCents.mockReturnValue(12345)

        const { GET } = await import('@/app/api/admin/ledger/config/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(data.stripeIncomeRegisteredCents).toBe(12345)
    })

    it('responds with Cache-Control: no-store', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'super_admin' })

        const { GET } = await import('@/app/api/admin/ledger/config/route')
        const response = await GET(getRequest())

        expect(response.headers.get('Cache-Control')).toBe('no-store')
    })
})

describe('PATCH /api/admin/ledger/config', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.setLedgerStripeMode.mockResolvedValue(true)
        mocks.getLedgerStripeMode.mockResolvedValue(true)
        mocks.getLedgerSnapshot.mockResolvedValue({ currency: 'MXN', transactions: [], shares: [], settlements: [], participants: [] })
        mocks.computeStripeRegisteredIncomeCents.mockReturnValue(0)
    })

    it('rejects a cross-site PATCH (no Origin/Referer) with 403', async () => {
        const { PATCH } = await import('@/app/api/admin/ledger/config/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', stripeIsParticipant: true }, { 'Content-Type': 'application/json' }))
        expect(response.status).toBe(403)
        expect(mocks.setLedgerStripeMode).not.toHaveBeenCalled()
    })

    it('a viewer (no manager access) is rejected with 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { PATCH } = await import('@/app/api/admin/ledger/config/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', stripeIsParticipant: true }))

        expect(response.status).toBe(403)
        expect(mocks.setLedgerStripeMode).not.toHaveBeenCalled()
    })

    it('a manager flips the mode — 200, response mirrors the GET shape', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { PATCH } = await import('@/app/api/admin/ledger/config/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', stripeIsParticipant: true }))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.setLedgerStripeMode).toHaveBeenCalledWith('fiesta', true)
        expect(data).toMatchObject({ success: true, stripeIsParticipant: true, stripeIncomeRegisteredCents: 0 })
    })

    it('does NOT block the mode change when Stripe income is already registered — no confirm flag required (PLAN §2.6c: the warning is UI-only)', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.computeStripeRegisteredIncomeCents.mockReturnValue(99999)

        const { PATCH } = await import('@/app/api/admin/ledger/config/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', stripeIsParticipant: false }))

        expect(response.status).toBe(200)
        expect(mocks.setLedgerStripeMode).toHaveBeenCalledWith('fiesta', false)
    })

    it('rejects a non-boolean stripeIsParticipant with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { PATCH } = await import('@/app/api/admin/ledger/config/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', stripeIsParticipant: 'true' }))

        expect(response.status).toBe(400)
        expect(mocks.setLedgerStripeMode).not.toHaveBeenCalled()
    })

    it('rejects unknown extra body keys with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { PATCH } = await import('@/app/api/admin/ledger/config/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', stripeIsParticipant: true, extra: 1 }))

        expect(response.status).toBe(400)
        expect(mocks.setLedgerStripeMode).not.toHaveBeenCalled()
    })
})
