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

const PAYMENT_LOCK_MESSAGE = 'No puedes cambiar el acompañante mientras hay un pago en curso o completado'

const mocks = vi.hoisted(() => ({
    databaseConfigured: true,
    getEventBySlug: vi.fn(),
    getRsvpPlusOneForPaymentValidation: vi.fn(),
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
    electSurvivingCreatedPayment: vi.fn(),
    send: vi.fn(),
    stripeSessionsCreate: vi.fn(),
    stripeSessionsExpire: vi.fn(),
    stripeSessionsRetrieve: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    getRsvpPlusOneForPaymentValidation: mocks.getRsvpPlusOneForPaymentValidation,
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
    electSurvivingCreatedPayment: mocks.electSurvivingCreatedPayment,
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
                retrieve: mocks.stripeSessionsRetrieve,
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

// ISSUE-014: the payment branch now carries its own IP+event rate limiter
// (module-level singleton, persists for this file's lifetime). Every call
// below defaults to a UNIQUE X-Forwarded-For so unrelated tests never share
// its budget — same convention as tests/rsvp-resend-verification-route.test.ts's
// requestSequence/uniqueEmail. Tests that specifically exercise the limiter
// pass a shared `headers['x-forwarded-for']` on purpose.
let requestSequence = 0

function request(overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `192.0.2.${++requestSequence}`,
            ...headers,
        },
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
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(false)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.saveRSVPPendingPayment.mockResolvedValue(pendingPaymentRsvp)
        mocks.getActivePaymentForRsvp.mockResolvedValue(null)
        mocks.stripeSessionsCreate.mockResolvedValue({ id: 'cs_new123', url: 'https://checkout.stripe.com/pay/cs_new123' })
        mocks.stripeSessionsExpire.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' })
        mocks.createRsvpPaymentRecord.mockResolvedValue({ id: 'pay-1', stripeSessionId: 'cs_new123' })
        mocks.electSurvivingCreatedPayment.mockResolvedValue('pay-1')
    })

    // Tier-4 review finding F1: concurrent double-session guard.
    it('loses the post-insert survivor election: expires its own session and row, responds 409 retryable', async () => {
        mocks.electSurvivingCreatedPayment.mockResolvedValue('pay-other-older')
        mocks.stripeSessionsExpire.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(409)
        expect(mocks.stripeSessionsExpire).toHaveBeenCalledWith('cs_new123')
        expect(mocks.expireRsvpPaymentRecord).toHaveBeenCalledWith('pay-1')
        const payload = await response.json()
        expect(payload.checkoutUrl).toBeUndefined()
    })

    it('keeps a losing concurrent row created when Stripe still reports its session open', async () => {
        mocks.electSurvivingCreatedPayment.mockResolvedValue('pay-other-older')
        mocks.stripeSessionsExpire.mockRejectedValue(new Error('timeout'))
        mocks.stripeSessionsRetrieve.mockResolvedValue({ status: 'open', payment_status: 'unpaid' })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(409)
        expect(mocks.expireRsvpPaymentRecord).not.toHaveBeenCalled()
        errorSpy.mockRestore()
        warnSpy.mockRestore()
    })

    it('wins the survivor election (own row is oldest): responds 201 with the checkout URL and expires nothing', async () => {
        mocks.electSurvivingCreatedPayment.mockResolvedValue('pay-1')

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.stripeSessionsExpire).not.toHaveBeenCalled()
        expect(mocks.expireRsvpPaymentRecord).not.toHaveBeenCalled()
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
        expect(sessionParams.line_items[0].quantity).toBe(1)
        expect(sessionParams.metadata).toEqual({ rsvpId: 'rsvp-1', eventSlug: 'fiesta' })

        expect(mocks.createRsvpPaymentRecord).toHaveBeenCalledWith({
            rsvpId: 'rsvp-1', eventId: 'fiesta', stripeSessionId: 'cs_new123', amountCents: 25000, currency: 'MXN',
        })
    })

    it('charges the per-person fee twice when the persisted RSVP includes a companion', async () => {
        mocks.saveRSVPPendingPayment.mockResolvedValue({
            ...pendingPaymentRsvp,
            plusOne: true,
            plusOneName: 'Sam',
        })
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(true)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request({ plusOne: true, plusOneName: 'Sam' }))

        expect(response.status).toBe(201)
        const [sessionParams] = mocks.stripeSessionsCreate.mock.calls[0]
        expect(sessionParams.line_items[0].price_data.unit_amount).toBe(25000)
        expect(sessionParams.line_items[0].quantity).toBe(2)
        expect(mocks.createRsvpPaymentRecord).toHaveBeenCalledWith({
            rsvpId: 'rsvp-1', eventId: 'fiesta', stripeSessionId: 'cs_new123', amountCents: 50000, currency: 'MXN',
        })
    })

    it('uses the persisted RSVP, not the request body, as the Checkout quantity authority', async () => {
        mocks.saveRSVPPendingPayment.mockResolvedValue({ ...pendingPaymentRsvp, plusOne: true })
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(true)

        const { POST } = await import('@/app/api/rsvp/route')
        await POST(request({ plusOne: false }))

        const [sessionParams] = mocks.stripeSessionsCreate.mock.calls[0]
        expect(sessionParams.line_items[0].quantity).toBe(2)
        expect(mocks.createRsvpPaymentRecord).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 50000 }))
    })

    it('invalidates the new Checkout when party size changed before its payment row locked edits', async () => {
        // Session was priced from the persisted false value returned by save,
        // but a concurrent edit landed before createRsvpPaymentRecord inserted
        // the `created` lock row. The post-insert FOR SHARE read waits for that
        // UPDATE and observes its committed true value.
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(true)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request({ plusOne: false }))
        const payload = await response.json()

        expect(response.status).toBe(409)
        expect(payload.error).toContain('acompañante cambió')
        expect(payload.checkoutUrl).toBeUndefined()
        expect(mocks.stripeSessionsExpire).toHaveBeenCalledWith('cs_new123')
        expect(mocks.expireRsvpPaymentRecord).toHaveBeenCalledWith('pay-1')
        expect(mocks.electSurvivingCreatedPayment).not.toHaveBeenCalled()
        expect(mocks.createRsvpPaymentRecord.mock.invocationCallOrder[0])
            .toBeLessThan(mocks.getRsvpPlusOneForPaymentValidation.mock.invocationCallOrder[0])
    })

    it('reconciles a failed race-session expiration as expired/unpaid before expiring its row', async () => {
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(true)
        mocks.stripeSessionsExpire.mockRejectedValue(new Error('already expired'))
        mocks.stripeSessionsRetrieve.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request({ plusOne: false }))

        expect(response.status).toBe(409)
        expect(mocks.stripeSessionsRetrieve).toHaveBeenCalledWith('cs_new123')
        expect(mocks.expireRsvpPaymentRecord).toHaveBeenCalledWith('pay-1')
        errorSpy.mockRestore()
    })

    it('keeps the mismatched payment row created when Stripe reports complete/paid', async () => {
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(true)
        mocks.stripeSessionsExpire.mockRejectedValue(new Error('already completed'))
        mocks.stripeSessionsRetrieve.mockResolvedValue({ status: 'complete', payment_status: 'paid' })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request({ plusOne: false }))

        expect(response.status).toBe(409)
        expect(mocks.expireRsvpPaymentRecord).not.toHaveBeenCalled()
        expect(mocks.electSurvivingCreatedPayment).not.toHaveBeenCalled()
        errorSpy.mockRestore()
        warnSpy.mockRestore()
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
        mocks.stripeSessionsExpire.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.stripeSessionsExpire).toHaveBeenCalledWith('cs_old999')
        expect(mocks.expireRsvpPaymentRecord).toHaveBeenCalledWith('pay-old')
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(1)
    })

    it('maps a party-size change on an existing pending_payment RSVP to the shared 409 before Stripe', async () => {
        mocks.saveRSVPPendingPayment.mockRejectedValue(new Error(PAYMENT_LOCK_MESSAGE))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request({ plusOne: true }))
        const payload = await response.json()

        expect(response.status).toBe(409)
        expect(payload.error).toBe(PAYMENT_LOCK_MESSAGE)
        expect(mocks.getActivePaymentForRsvp).not.toHaveBeenCalled()
        expect(mocks.stripeSessionsExpire).not.toHaveBeenCalled()
        expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('a failed previous-session expiration continues only after retrieve confirms expired/unpaid', async () => {
        mocks.getActivePaymentForRsvp.mockResolvedValue({ id: 'pay-old', stripeSessionId: 'cs_old999' })
        mocks.stripeSessionsExpire.mockRejectedValue(new Error('already expired'))
        mocks.stripeSessionsRetrieve.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.stripeSessionsRetrieve).toHaveBeenCalledWith('cs_old999')
        expect(mocks.expireRsvpPaymentRecord).toHaveBeenCalledWith('pay-old')
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(1)
        errorSpy.mockRestore()
    })

    it.each([
        ['complete', 'paid'],
        ['open', 'unpaid'],
        ['expired', 'paid'],
    ])('keeps the previous row created and creates no replacement when retrieve reports %s/%s', async (status, paymentStatus) => {
        mocks.getActivePaymentForRsvp.mockResolvedValue({ id: 'pay-old', stripeSessionId: 'cs_old999' })
        mocks.stripeSessionsExpire.mockRejectedValue(new Error('cannot expire'))
        mocks.stripeSessionsRetrieve.mockResolvedValue({ status, payment_status: paymentStatus })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())
        const payload = await response.json()

        expect(response.status).toBe(409)
        expect(payload.checkoutUrl).toBeUndefined()
        expect(mocks.expireRsvpPaymentRecord).not.toHaveBeenCalled()
        expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled()
        errorSpy.mockRestore()
        warnSpy.mockRestore()
    })

    it('keeps the previous row created and creates no replacement when Stripe state cannot be verified', async () => {
        mocks.getActivePaymentForRsvp.mockResolvedValue({ id: 'pay-old', stripeSessionId: 'cs_old999' })
        mocks.stripeSessionsExpire.mockRejectedValue(new Error('timeout'))
        mocks.stripeSessionsRetrieve.mockRejectedValue(new Error('timeout'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(409)
        expect(mocks.expireRsvpPaymentRecord).not.toHaveBeenCalled()
        expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled()
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

function invitationRequest(overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return request({ invitationToken: token, ...overrides }, headers)
}

describe('POST /api/rsvp — invitation payment branch (ISSUE-011)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(paidEvent)
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(false)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.getActivePaymentForRsvp.mockResolvedValue(null)
        mocks.stripeSessionsCreate.mockResolvedValue({ id: 'cs_invite1', url: 'https://checkout.stripe.com/pay/cs_invite1' })
        mocks.stripeSessionsExpire.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' })
        mocks.createRsvpPaymentRecord.mockResolvedValue({ id: 'pay-2', stripeSessionId: 'cs_invite1' })
        mocks.electSurvivingCreatedPayment.mockResolvedValue('pay-2')
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

    it('a non-courtesy link charges two per-person units when its persisted RSVP includes a companion', async () => {
        mocks.saveRsvpWithInvitation.mockResolvedValue({ ...pendingPaymentRsvp, status: 'pending_payment', plusOne: true })
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(true)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(invitationRequest({ plusOne: true }))

        expect(response.status).toBe(201)
        const [sessionParams] = mocks.stripeSessionsCreate.mock.calls[0]
        expect(sessionParams.line_items[0].price_data.unit_amount).toBe(25000)
        expect(sessionParams.line_items[0].quantity).toBe(2)
        expect(mocks.createRsvpPaymentRecord).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 50000 }))
    })

    it('a courtesy link (default) on a paid event bypasses Stripe entirely and confirms directly', async () => {
        mocks.saveRsvpWithInvitation.mockResolvedValue({ ...pendingPaymentRsvp, status: 'confirmed', plusOne: true })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(invitationRequest({ plusOne: true }))
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

describe('POST /api/rsvp — payment branch rate limit (ISSUE-014)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(paidEvent)
        mocks.getRsvpPlusOneForPaymentValidation.mockResolvedValue(false)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.saveRSVPPendingPayment.mockResolvedValue(pendingPaymentRsvp)
        mocks.getActivePaymentForRsvp.mockResolvedValue(null)
        mocks.stripeSessionsCreate.mockResolvedValue({ id: 'cs_new123', url: 'https://checkout.stripe.com/pay/cs_new123' })
        mocks.stripeSessionsExpire.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' })
        mocks.createRsvpPaymentRecord.mockResolvedValue({ id: 'pay-1', stripeSessionId: 'cs_new123' })
        mocks.electSurvivingCreatedPayment.mockResolvedValue('pay-1')
    })

    // Budget is 5 attempts / 10 minutes, keyed by IP+event (see
    // app/api/rsvp/route.ts's paymentBranchRateLimiter — a module-level
    // singleton that persists for this whole test file). Every scenario
    // below that exhausts a budget MUST use an IP unique to that test, or an
    // earlier test's spent budget silently bleeds into this describe's
    // later tests (same hazard called out by uniqueEmail() in
    // tests/rsvp-resend-verification-route.test.ts).
    let rateLimitIpSeq = 0
    function freshIpHeaders(): Record<string, string> {
        return { 'x-forwarded-for': `203.0.113.${++rateLimitIpSeq}` }
    }

    it('cuts the 6th payment-branch request from the same IP+event before it ever reaches Stripe, with a retryable 429', async () => {
        const ipHeaders = freshIpHeaders()
        const { POST } = await import('@/app/api/rsvp/route')

        for (let i = 0; i < 5; i++) {
            const response = await POST(request({}, ipHeaders))
            expect(response.status).toBe(201)
        }
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(5)

        const sixth = await POST(request({}, ipHeaders))
        const payload = await sixth.json()

        expect(sixth.status).toBe(429)
        expect(payload.error).toBeTruthy()
        // Rate-limited BEFORE any further Stripe/DB work in this branch.
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(5)
        expect(mocks.getActivePaymentForRsvp).toHaveBeenCalledTimes(5)
        expect(mocks.createRsvpPaymentRecord).toHaveBeenCalledTimes(5)
    })

    it('rate-limits the invitation-path payment branch too, sharing the same IP+event budget as the public path', async () => {
        const ipHeaders = freshIpHeaders()
        mocks.saveRsvpWithInvitation.mockResolvedValue({ ...pendingPaymentRsvp, status: 'pending_payment' })
        const { POST } = await import('@/app/api/rsvp/route')

        for (let i = 0; i < 5; i++) {
            const response = await POST(request({}, ipHeaders))
            expect(response.status).toBe(201)
        }

        // Same IP, same event slug, but the invitation path this time — still
        // shares the budget already spent above (keyed by IP+event, not by
        // caller path or rsvp id). The CTE that consumes the invitation link
        // and decides pending_payment necessarily still runs (the route can't
        // know the outcome ahead of calling it — see the comment on the rate
        // limit check itself); what the budget guards is the Stripe call.
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(5)
        const sixth = await POST(invitationRequest({}, ipHeaders))
        expect(sixth.status).toBe(429)
        expect(mocks.saveRsvpWithInvitation).toHaveBeenCalledTimes(1)
        // Still 5 — the 6th (invitation-path) request never reaches Stripe.
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(5)
    })

    it('does not rate-limit a different requester IP against the same event', async () => {
        const exhaustedIp = freshIpHeaders()
        const otherIp = freshIpHeaders()
        const { POST } = await import('@/app/api/rsvp/route')

        for (let i = 0; i < 5; i++) {
            await POST(request({}, exhaustedIp))
        }
        mocks.stripeSessionsCreate.mockClear()

        const otherIpResponse = await POST(request({}, otherIp))
        expect(otherIpResponse.status).toBe(201)
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(1)
    })

    it('does not rate-limit a different event slug from the same IP', async () => {
        const ipHeaders = freshIpHeaders()
        const otherEvent = { ...paidEvent, slug: 'otra-fiesta' }
        mocks.getEventBySlug.mockImplementation((slug: string) =>
            Promise.resolve(slug === 'otra-fiesta' ? otherEvent : paidEvent))
        const { POST } = await import('@/app/api/rsvp/route')

        for (let i = 0; i < 5; i++) {
            await POST(request({}, ipHeaders))
        }
        mocks.stripeSessionsCreate.mockClear()

        const otherEventResponse = await POST(request({ eventSlug: 'otra-fiesta' }, ipHeaders))
        expect(otherEventResponse.status).toBe(201)
        expect(mocks.stripeSessionsCreate).toHaveBeenCalledTimes(1)
    })

    it('never rate-limits the free RSVP branch, which never reaches this limiter', async () => {
        const ipHeaders = freshIpHeaders()
        mocks.getEventBySlug.mockResolvedValue({ ...paidEvent, paymentRequired: false })
        mocks.saveRSVP.mockResolvedValue({ ...pendingPaymentRsvp, status: 'confirmed' })
        const { POST } = await import('@/app/api/rsvp/route')

        for (let i = 0; i < 8; i++) {
            const response = await POST(request({}, ipHeaders))
            expect(response.status).toBe(201)
        }
        expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled()
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
