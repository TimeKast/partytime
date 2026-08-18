/**
 * ISSUE-012 (EPIC-004) — route-level acceptance criteria for
 * `POST /api/webhooks/stripe`: signature verification (using the REAL
 * `stripe.webhooks.constructEvent`/`generateTestHeaderString` — constructEvent
 * itself is never mocked, per the issue's explicit "no mockees constructEvent"
 * instruction), event-type dispatch, idempotency-at-dispatch, and the
 * confirmation-email side effect. Mocks `@/lib/queries` wholesale and drives
 * the REAL route handler (same pattern as tests/rsvp-payment-route.test.ts) —
 * cannot share a file with the query-layer CTE tests
 * (tests/stripe-webhook-queries.test.ts), which mock `@/lib/db` and run the
 * REAL `lib/queries.ts` (see that file's header, and
 * tests/stripe-checkout.test.ts / tests/rsvp-payment-route.test.ts for the
 * same split applied to ISSUE-011).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Stripe from 'stripe'

const mocks = vi.hoisted(() => ({
    databaseConfigured: true,
    fulfillPaidRsvp: vi.fn(),
    expireRsvpPaymentBySessionId: vi.fn(),
    markRsvpPaymentRefunded: vi.fn(),
    getEventBySlug: vi.fn(),
    generateCancelToken: vi.fn(),
    recordEmailSent: vi.fn(),
    send: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    fulfillPaidRsvp: mocks.fulfillPaidRsvp,
    expireRsvpPaymentBySessionId: mocks.expireRsvpPaymentBySessionId,
    markRsvpPaymentRefunded: mocks.markRsvpPaymentRefunded,
    getEventBySlug: mocks.getEventBySlug,
    generateCancelToken: mocks.generateCancelToken,
    recordEmailSent: mocks.recordEmailSent,
}))
vi.mock('@/lib/resend', () => ({
    resend: { emails: { send: mocks.send } },
    FROM_EMAIL: 'noreply@example.com',
}))
// @/lib/stripe is deliberately left UNMOCKED: this suite's whole point is
// exercising the real Stripe SDK's signature verification.

const WEBHOOK_SECRET = 'whsec_test_secret_for_issue_012'

// A separate, standalone Stripe instance used ONLY to produce realistic
// signed test payloads (`generateTestHeaderString` does not call the Stripe
// API — no real key needed). This is intentionally NOT the app's `@/lib/stripe`
// client; using the SDK's own helper directly is what "no mockees
// constructEvent" means in practice — the route verifies a REAL signature.
const signer = new Stripe('sk_test_signing_helper_only', { apiVersion: Stripe.API_VERSION })

function stripeEventPayload(type: string, dataObject: Record<string, unknown>, id = 'evt_test_1'): string {
    return JSON.stringify({
        id,
        object: 'event',
        api_version: Stripe.API_VERSION,
        created: Math.floor(Date.now() / 1000),
        type,
        data: { object: dataObject },
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
    })
}

function signedHeader(payload: string, secret: string = WEBHOOK_SECRET): string {
    return signer.webhooks.generateTestHeaderString({ payload, secret })
}

function webhookRequest(payload: string, signatureHeader: string | undefined): NextRequest {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (signatureHeader !== undefined) headers['stripe-signature'] = signatureHeader
    return new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers,
        body: payload,
    })
}

const checkoutSession = {
    id: 'cs_test_123',
    object: 'checkout.session',
    payment_intent: 'pi_test_123',
    metadata: { rsvpId: 'rsvp-1', eventSlug: 'fiesta' },
}

const confirmedRsvp = {
    id: 'rsvp-1',
    eventId: 'fiesta',
    name: 'Alex',
    email: 'alex@example.com',
    phone: '+525500000000',
    plusOne: false,
    plusOneName: null,
    status: 'confirmed',
}

const paidEvent = {
    id: 'event-uuid',
    slug: 'fiesta',
    title: 'Fiesta',
    displayTitle: '',
    priceEnabled: true,
    priceAmount: 250,
    priceCurrency: 'MXN',
}

let originalWebhookSecret: string | undefined

beforeEach(() => {
    vi.clearAllMocks()
    mocks.databaseConfigured = true
    originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
})

afterEach(() => {
    if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
    else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret
})

describe('POST /api/webhooks/stripe — signature verification (ISSUE-012)', () => {
    it('responds 503 and never reaches any handler when STRIPE_WEBHOOK_SECRET is not configured', async () => {
        delete process.env.STRIPE_WEBHOOK_SECRET
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload, 'whsec_irrelevant')))

        expect(response.status).toBe(503)
        expect(mocks.fulfillPaidRsvp).not.toHaveBeenCalled()
    })

    it('responds 400 when the stripe-signature header is missing entirely', async () => {
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, undefined))

        expect(response.status).toBe(400)
        expect(mocks.fulfillPaidRsvp).not.toHaveBeenCalled()
    })

    it('responds 400 for a signature computed with the WRONG secret, without touching the database', async () => {
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload, 'whsec_totally_different')))

        expect(response.status).toBe(400)
        expect(mocks.fulfillPaidRsvp).not.toHaveBeenCalled()
    })

    it('responds 400 when the body is altered after signing (tampered payload, valid-looking header)', async () => {
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)
        const validHeaderForOriginalPayload = signedHeader(payload)
        const tamperedPayload = payload.replace('cs_test_123', 'cs_tampered_999')

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(tamperedPayload, validHeaderForOriginalPayload))

        expect(response.status).toBe(400)
        expect(mocks.fulfillPaidRsvp).not.toHaveBeenCalled()
    })

    it('accepts a correctly signed, unmodified payload (control case proving the helpers above are exercising real verification)', async () => {
        mocks.fulfillPaidRsvp.mockResolvedValue({ outcome: 'replay', rsvp: null })
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
        expect(mocks.fulfillPaidRsvp).toHaveBeenCalledWith('cs_test_123', 'pi_test_123')
    })
})

describe('POST /api/webhooks/stripe — checkout.session.completed / async_payment_succeeded (ISSUE-012)', () => {
    beforeEach(() => {
        mocks.getEventBySlug.mockResolvedValue(paidEvent)
        mocks.generateCancelToken.mockReturnValue('cancel-token-abc')
        mocks.send.mockResolvedValue({ error: null })
    })

    it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])(
        '%s: fulfills the payment, and sends exactly one confirmation email',
        async eventType => {
            mocks.fulfillPaidRsvp.mockResolvedValue({ outcome: 'confirmed', rsvp: confirmedRsvp })
            const payload = stripeEventPayload(eventType, checkoutSession)

            const { POST } = await import('@/app/api/webhooks/stripe/route')
            const response = await POST(webhookRequest(payload, signedHeader(payload)))
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body).toEqual({ received: true })
            expect(mocks.fulfillPaidRsvp).toHaveBeenCalledWith('cs_test_123', 'pi_test_123')
            expect(mocks.send).toHaveBeenCalledTimes(1)
            expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: 'alex@example.com' })
            expect(mocks.recordEmailSent).toHaveBeenCalledWith('rsvp-1', 'confirmation')
        },
    )

    // Given el mismo evento re-entregado por Stripe (replay)
    it('a replay (fulfillPaidRsvp reports the payment step already matched zero rows) responds 200 without sending an email or recording one', async () => {
        mocks.fulfillPaidRsvp.mockResolvedValue({ outcome: 'replay', rsvp: null })
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
        expect(mocks.send).not.toHaveBeenCalled()
        expect(mocks.recordEmailSent).not.toHaveBeenCalled()
    })

    // Given el pago se completa cuando ya NO hay asiento
    it('payment_without_seat responds 200 (never 5xx — Stripe must not retry an outcome that will never change), without sending an email', async () => {
        mocks.fulfillPaidRsvp.mockResolvedValue({ outcome: 'payment_without_seat', rsvp: null })
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
        expect(mocks.send).not.toHaveBeenCalled()
    })

    // Given un fallo al enviar el email de confirmación
    it('an email-send failure (thrown) never fails the webhook — the mutation already committed', async () => {
        mocks.fulfillPaidRsvp.mockResolvedValue({ outcome: 'confirmed', rsvp: confirmedRsvp })
        mocks.send.mockRejectedValue(new Error('resend is down'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({ received: true })
        expect(mocks.fulfillPaidRsvp).toHaveBeenCalledTimes(1)
        expect(mocks.recordEmailSent).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('an email-send failure (non-throwing Resend error) also never fails the webhook, and is not recorded as sent', async () => {
        mocks.fulfillPaidRsvp.mockResolvedValue({ outcome: 'confirmed', rsvp: confirmedRsvp })
        mocks.send.mockResolvedValue({ error: { message: 'invalid recipient' } })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
        expect(mocks.recordEmailSent).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('if the event somehow has no target event row, skips the email gracefully (still 200)', async () => {
        mocks.fulfillPaidRsvp.mockResolvedValue({ outcome: 'confirmed', rsvp: confirmedRsvp })
        mocks.getEventBySlug.mockResolvedValue(null)
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
        expect(mocks.send).not.toHaveBeenCalled()
    })
})

describe('POST /api/webhooks/stripe — checkout.session.expired (ISSUE-012)', () => {
    // Given session.expired de un pending vigente / Then pago y RSVP quedan
    // expired y el asiento se libera (mutation itself lives in
    // lib/queries.ts, exercised at the query layer — this asserts dispatch).
    it('delegates to expireRsvpPaymentBySessionId with the Checkout Session id', async () => {
        mocks.expireRsvpPaymentBySessionId.mockResolvedValue({ id: 'rsvp-1', status: 'expired' })
        const payload = stripeEventPayload('checkout.session.expired', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
        expect(mocks.expireRsvpPaymentBySessionId).toHaveBeenCalledWith('cs_test_123')
        expect(mocks.fulfillPaidRsvp).not.toHaveBeenCalled()
    })

    it('a no-op expiry (replay, or nothing to expire) still responds 200', async () => {
        mocks.expireRsvpPaymentBySessionId.mockResolvedValue(null)
        const payload = stripeEventPayload('checkout.session.expired', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
    })
})

describe('POST /api/webhooks/stripe — charge.refunded (ISSUE-012)', () => {
    const refundedCharge = {
        id: 'ch_test_1',
        object: 'charge',
        payment_intent: 'pi_test_123',
    }

    // Given charge.refunded / Then marca refunded sin tocar rsvp
    it('marks the payment refunded by payment_intent id, and never touches the RSVP mutation paths', async () => {
        mocks.markRsvpPaymentRefunded.mockResolvedValue(true)
        const payload = stripeEventPayload('charge.refunded', refundedCharge)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
        expect(mocks.markRsvpPaymentRefunded).toHaveBeenCalledWith('pi_test_123')
        expect(mocks.fulfillPaidRsvp).not.toHaveBeenCalled()
        expect(mocks.expireRsvpPaymentBySessionId).not.toHaveBeenCalled()
    })

    it('a charge without a payment_intent id is a safe no-op (still 200)', async () => {
        const payload = stripeEventPayload('charge.refunded', { ...refundedCharge, payment_intent: null })

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(200)
        expect(mocks.markRsvpPaymentRefunded).not.toHaveBeenCalled()
    })
})

describe('POST /api/webhooks/stripe — unhandled event types (ISSUE-012)', () => {
    it('ignores an event type outside the 4 handled ones, responding 200 without calling any query helper', async () => {
        const payload = stripeEventPayload('payment_intent.succeeded', { id: 'pi_unrelated' })

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({ received: true })
        expect(mocks.fulfillPaidRsvp).not.toHaveBeenCalled()
        expect(mocks.expireRsvpPaymentBySessionId).not.toHaveBeenCalled()
        expect(mocks.markRsvpPaymentRefunded).not.toHaveBeenCalled()
    })
})

describe('POST /api/webhooks/stripe — database availability (ISSUE-012)', () => {
    it('responds 503 without calling any handler when the database is not configured, even with a valid signature', async () => {
        mocks.databaseConfigured = false
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(503)
        expect(mocks.fulfillPaidRsvp).not.toHaveBeenCalled()
    })

    it('a real infra failure while handling a verified event responds 5xx so Stripe retries', async () => {
        mocks.fulfillPaidRsvp.mockRejectedValue(new Error('connection refused'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const payload = stripeEventPayload('checkout.session.completed', checkoutSession)

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const response = await POST(webhookRequest(payload, signedHeader(payload)))

        expect(response.status).toBe(500)
        errorSpy.mockRestore()
    })
})
