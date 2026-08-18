/**
 * ISSUE-011 (EPIC-004) — route-level acceptance criteria for the Stripe
 * Checkout flow: POST /api/rsvp's payment branch and GET
 * /api/rsvp/payment-status. Mocks @/lib/queries and @/lib/stripe wholesale
 * and drives the REAL route handlers (same pattern as
 * tests/rsvp-invitation-rsvp-route.test.ts / rsvp-public-verification-route.test.ts)
 * — cannot share a file with tests/stripe-checkout.test.ts's query-layer
 * tests, which need the REAL lib/queries.ts running against a mocked
 * @/lib/db (see that file's header).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    databaseConfigured: true,
    getEventBySlug: vi.fn(),
    saveRSVP: vi.fn(),
    saveRsvpWithInvitation: vi.fn(),
    saveRSVPPendingPayment: vi.fn(),
    getActivePaymentForRsvp: vi.fn(),
    expireRsvpPaymentRecord: vi.fn(),
    createRsvpPaymentRecord: vi.fn(),
    expirePendingPaymentRsvp: vi.fn(),
    getRsvpPaymentStatusBySessionId: vi.fn(),
    recordEmailSent: vi.fn(),
    generateCancelToken: vi.fn(),
    expireStalePendingRsvps: vi.fn(),
    send: vi.fn(),
    stripeSessionsCreate: vi.fn(),
    stripeSessionsExpire: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    saveRSVP: mocks.saveRSVP,
    saveRsvpWithInvitation: mocks.saveRsvpWithInvitation,
    saveRSVPPendingPayment: mocks.saveRSVPPendingPayment,
    getActivePaymentForRsvp: mocks.getActivePaymentForRsvp,
    expireRsvpPaymentRecord: mocks.expireRsvpPaymentRecord,
    createRsvpPaymentRecord: mocks.createRsvpPaymentRecord,
    expirePendingPaymentRsvp: mocks.expirePendingPaymentRsvp,
    getRsvpPaymentStatusBySessionId: mocks.getRsvpPaymentStatusBySessionId,
    recordEmailSent: mocks.recordEmailSent,
    generateCancelToken: mocks.generateCancelToken,
    expireStalePendingRsvps: mocks.expireStalePendingRsvps,
    RSVP_STATUS: {
        CONFIRMED: 'confirmed',
        CANCELLED: 'cancelled',
        PENDING_PAYMENT: 'pending_payment',
        PENDING_VERIFICATION: 'pending_verification',
        EXPIRED: 'expired',
    },
}))
vi.mock('@/lib/stripe', () => ({
    stripe: {
        checkout: {
            sessions: {
                create: mocks.stripeSessionsCreate,
                expire: mocks.stripeSessionsExpire,
            },
        },
    },
}))
vi.mock('@/lib/resend', () => ({
    resend: { emails: { send: mocks.send } },
    FROM_EMAIL: 'noreply@example.com',
}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/auth-utils', () => ({ validateSession: vi.fn() }))
vi.mock('@/lib/user-queries', () => ({ userHasEventAccess: vi.fn() }))

const paidEvent = {
    id: 'event-uuid',
    slug: 'fiesta',
    isActive: true,
    rsvpClosed: false,
    rsvpClosedMessage: null,
    requirePlusOneName: false,
    emailConfirmationEnabled: false,
    emailVerificationEnabled: false,
    paymentRequired: true,
    priceEnabled: true,
    priceAmount: 250,
    priceCurrency: 'MXN',
    title: 'Fiesta',
    displayTitle: '',
}

const pendingPaymentRsvp = {
    id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
    phone: '+525500000000', plusOne: false, plusOneName: null,
    status: 'pending_payment', emailSent: null, emailHistory: [], cancelToken: null,
    createdAt: new Date('2026-08-18T00:00:00.000Z'),
}

function request(overrides: Record<string, unknown> = {}) {
    return new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            name: 'Alex',
            email: 'alex@example.com',
            phone: '+525500000000',
            plusOne: false,
            eventSlug: 'fiesta',
            ...overrides,
        }),
    })
}

describe('POST /api/rsvp — public payment branch (ISSUE-011)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(paidEvent)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.saveRSVPPendingPayment.mockResolvedValue(pendingPaymentRsvp)
        mocks.getActivePaymentForRsvp.mockResolvedValue(null)
        mocks.stripeSessionsCreate.mockResolvedValue({ id: 'cs_new123', url: 'https://checkout.stripe.com/pay/cs_new123' })
        mocks.createRsvpPaymentRecord.mockResolvedValue({ id: 'pay-1', stripeSessionId: 'cs_new123' })
    })

    it('creates a Checkout Session with the derived amount/currency/email and responds pending_payment with the checkout URL', async () => {
        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(payload.status).toBe('pending_payment')
        expect(payload.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_new123')

        expect(mocks.saveRSVP).not.toHaveBeenCalled()
        expect(mocks.saveRSVPPendingPayment).toHaveBeenCalledTimes(1)

        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(1)
        const [sessionParams] = mocks.stripeSessionsCreate.mock.calls[0]
        expect(sessionParams.customer_email).toBe('alex@example.com')
        expect(sessionParams.line_items[0].price_data).toMatchObject({ currency: 'mxn', unit_amount: 25000 })
        expect(sessionParams.metadata).toEqual({ rsvpId: 'rsvp-1', eventSlug: 'fiesta' })

        expect(mocks.createRsvpPaymentRecord).toHaveBeenCalledWith({
            rsvpId: 'rsvp-1', eventId: 'fiesta', stripeSessionId: 'cs_new123', amountCents: 25000, currency: 'MXN',
        })
    })

    it('never generates/sends a verification email when payment is required — payment supersedes verification', async () => {
        mocks.getEventBySlug.mockResolvedValue({ ...paidEvent, emailVerificationEnabled: true })

        const { POST } = await import('@/app/api/rsvp/route')
        await POST(request())

        expect(mocks.send).not.toHaveBeenCalled()
    })

    // ISSUE-011 Gherkin: "el mismo email reintenta mientras su pending sigue
    // vivo / Then ... la sesión anterior se expira en Stripe y solo hay una
    // sesión activa".
    it('re-submit with an existing active Checkout Session: expires the old session and marks its row expired before creating a new one', async () => {
        mocks.getActivePaymentForRsvp.mockResolvedValue({ id: 'pay-old', stripeSessionId: 'cs_old999' })
        mocks.stripeSessionsExpire.mockResolvedValue({})

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.stripeSessionsExpire).toHaveBeenCalledWith('cs_old999')
        expect(mocks.expireRsvpPaymentRecord).toHaveBeenCalledWith('pay-old')
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(1)
    })

    it('a best-effort failure expiring the previous session never blocks creating the new one', async () => {
        mocks.getActivePaymentForRsvp.mockResolvedValue({ id: 'pay-old', stripeSessionId: 'cs_old999' })
        mocks.stripeSessionsExpire.mockRejectedValue(new Error('already expired'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.expireRsvpPaymentRecord).toHaveBeenCalledWith('pay-old')
        errorSpy.mockRestore()
    })

    // ISSUE-011 Gherkin: "Stripe API caída / Then la fila no queda pending
    // huérfana (queda expired) y el invitado recibe error reintentable".
    it('a Stripe API error creating the session releases the seat (expired) and responds 502 reintentable', async () => {
        mocks.stripeSessionsCreate.mockRejectedValue(new Error('ECONNRESET'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())
        const payload = await response.json()

        expect(response.status).toBe(502)
        expect(payload.error).toBeTruthy()
        expect(mocks.expirePendingPaymentRsvp).toHaveBeenCalledWith('rsvp-1')
        expect(mocks.createRsvpPaymentRecord).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('a session created without a redirect URL is treated the same as a Stripe error (never left orphaned)', async () => {
        mocks.stripeSessionsCreate.mockResolvedValue({ id: 'cs_no_url' })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(502)
        expect(mocks.expirePendingPaymentRsvp).toHaveBeenCalledWith('rsvp-1')
        expect(mocks.createRsvpPaymentRecord).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('an existing confirmed RSVP is still a plain 409 dedupe, without ever touching Stripe', async () => {
        mocks.saveRSVPPendingPayment.mockRejectedValue(new Error('Ya existe un RSVP con este email para este evento'))

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(409)
        expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled()
    })

    it('an event without payment_required keeps the free-flow path untouched (regression)', async () => {
        mocks.getEventBySlug.mockResolvedValue({ ...paidEvent, paymentRequired: false })
        mocks.saveRSVP.mockResolvedValue({ ...pendingPaymentRsvp, status: 'confirmed' })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.saveRSVPPendingPayment).not.toHaveBeenCalled()
        expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled()
    })
})

const token = 'c'.repeat(43)

function invitationRequest(overrides: Record<string, unknown> = {}) {
    return request({ invitationToken: token, ...overrides })
}

describe('POST /api/rsvp — invitation payment branch (ISSUE-011)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(paidEvent)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.getActivePaymentForRsvp.mockResolvedValue(null)
        mocks.stripeSessionsCreate.mockResolvedValue({ id: 'cs_invite1', url: 'https://checkout.stripe.com/pay/cs_invite1' })
        mocks.createRsvpPaymentRecord.mockResolvedValue({ id: 'pay-2', stripeSessionId: 'cs_invite1' })
    })

    it('a non-courtesy link on a paid event redirects to Stripe (link already consumed atomically by the CTE)', async () => {
        mocks.saveRsvpWithInvitation.mockResolvedValue({ ...pendingPaymentRsvp, status: 'pending_payment' })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(invitationRequest())
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(payload.status).toBe('pending_payment')
        expect(payload.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_invite1')
        expect(mocks.saveRsvpWithInvitation).toHaveBeenCalledTimes(1)
        const [callArgs] = mocks.saveRsvpWithInvitation.mock.calls[0]
        expect(callArgs.paymentCandidate.expiresAt).toBeInstanceOf(Date)
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(1)
    })

    it('a courtesy link (default) on a paid event bypasses Stripe entirely and confirms directly', async () => {
        mocks.saveRsvpWithInvitation.mockResolvedValue({ ...pendingPaymentRsvp, status: 'confirmed' })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(invitationRequest())
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(payload.status).toBe('confirmed')
        expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled()
    })

    it('a Stripe failure on the invitation path also releases the seat (and restores the link) via expirePendingPaymentRsvp', async () => {
        mocks.saveRsvpWithInvitation.mockResolvedValue({ ...pendingPaymentRsvp, status: 'pending_payment' })
        mocks.stripeSessionsCreate.mockRejectedValue(new Error('ECONNRESET'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(invitationRequest())

        expect(response.status).toBe(502)
        expect(mocks.expirePendingPaymentRsvp).toHaveBeenCalledWith('rsvp-1')
        errorSpy.mockRestore()
    })
})

describe('GET /api/rsvp/payment-status (ISSUE-011)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
    })

    function statusRequest(query: string) {
        return new NextRequest(`http://localhost:3000/api/rsvp/payment-status${query}`)
    }

    it('returns ONLY the status field for a known session id, with no-store', async () => {
        mocks.getRsvpPaymentStatusBySessionId.mockResolvedValue('paid')

        const { GET } = await import('@/app/api/rsvp/payment-status/route')
        const response = await GET(statusRequest('?session_id=cs_test_abc123'))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(payload).toEqual({ status: 'paid' })
        expect(response.headers.get('Cache-Control')).toBe('no-store')
    })

    it('rejects a malformed session_id BEFORE any DB lookup', async () => {
        const { GET } = await import('@/app/api/rsvp/payment-status/route')
        const response = await GET(statusRequest('?session_id=not-a-real-id'))

        expect(response.status).toBe(400)
        expect(mocks.getRsvpPaymentStatusBySessionId).not.toHaveBeenCalled()
    })

    it('rejects a missing session_id', async () => {
        const { GET } = await import('@/app/api/rsvp/payment-status/route')
        const response = await GET(statusRequest(''))
        expect(response.status).toBe(400)
    })

    it('404s for a well-formed but unknown session id, without leaking anything else', async () => {
        mocks.getRsvpPaymentStatusBySessionId.mockResolvedValue(null)

        const { GET } = await import('@/app/api/rsvp/payment-status/route')
        const response = await GET(statusRequest('?session_id=cs_test_unknown'))
        const payload = await response.json()

        expect(response.status).toBe(404)
        expect(payload).not.toHaveProperty('status')
    })

    it('503s when the database is not configured', async () => {
        mocks.databaseConfigured = false

        const { GET } = await import('@/app/api/rsvp/payment-status/route')
        const response = await GET(statusRequest('?session_id=cs_test_abc123'))

        expect(response.status).toBe(503)
        expect(mocks.getRsvpPaymentStatusBySessionId).not.toHaveBeenCalled()
    })
})
