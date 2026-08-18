/**
 * ISSUE-007 (EPIC-003) — POST /api/rsvp, public flow (no invitationToken)
 * against an event with email_verification_enabled=true. Mirrors the
 * mocking pattern of tests/rsvp-invitation-rsvp-route.test.ts (mocks
 * @/lib/queries entirely, drives the real route handler).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    databaseConfigured: true,
    getEventBySlug: vi.fn(),
    saveRSVP: vi.fn(),
    saveRsvpWithInvitation: vi.fn(),
    recordEmailSent: vi.fn(),
    generateCancelToken: vi.fn(),
    expireStalePendingRsvps: vi.fn(),
    send: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    saveRSVP: mocks.saveRSVP,
    saveRsvpWithInvitation: mocks.saveRsvpWithInvitation,
    recordEmailSent: mocks.recordEmailSent,
    generateCancelToken: mocks.generateCancelToken,
    expireStalePendingRsvps: mocks.expireStalePendingRsvps,
    // ISSUE-011: the route now also destructures these on the pending_payment
    // branch — unused here (this event never sets payment_required), but
    // vi.mock requires every named export the route destructures to exist.
    // See tests/rsvp-payment-route.test.ts for the payment-branch coverage.
    saveRSVPPendingPayment: vi.fn(),
    getActivePaymentForRsvp: vi.fn(),
    expireRsvpPaymentRecord: vi.fn(),
    createRsvpPaymentRecord: vi.fn(),
    expirePendingPaymentRsvp: vi.fn(),
    RSVP_STATUS: {
        CONFIRMED: 'confirmed',
        CANCELLED: 'cancelled',
        PENDING_PAYMENT: 'pending_payment',
        PENDING_VERIFICATION: 'pending_verification',
        EXPIRED: 'expired',
    },
}))
vi.mock('@/lib/resend', () => ({
    resend: { emails: { send: mocks.send } },
    FROM_EMAIL: 'noreply@example.com',
}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/auth-utils', () => ({ validateSession: vi.fn() }))
vi.mock('@/lib/user-queries', () => ({ userHasEventAccess: vi.fn() }))

const verifyingEvent = {
    id: 'event-uuid',
    slug: 'fiesta',
    isActive: true,
    rsvpClosed: false,
    rsvpClosedMessage: null,
    requirePlusOneName: false,
    emailConfirmationEnabled: true,
    emailVerificationEnabled: true,
    title: 'Fiesta',
    displayTitle: '',
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

describe('POST /api/rsvp — public verification flow (ISSUE-007)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(verifyingEvent)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.send.mockResolvedValue({ error: null })
        mocks.recordEmailSent.mockResolvedValue(true)
    })

    // Gherkin: "Given evento gratis con email_verification_enabled=true /
    // When un invitado hace RSVP válido / Then la fila queda
    // pending_verification con token hash-only y recibe email de
    // verificación (no el de confirmación)".
    it('creates a pending_verification row, sends the verification email (not confirmation), and responds pending_verification', async () => {
        mocks.saveRSVP.mockResolvedValue({
            id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
            phone: '+525500000000', plusOne: false, plusOneName: null,
            status: 'pending_verification', emailSent: null, emailHistory: [], cancelToken: null,
            createdAt: new Date('2026-08-18T00:00:00.000Z'),
        })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(payload.status).toBe('pending_verification')
        expect(payload.rsvp.status).toBe('pending_verification')

        // expireStalePendingRsvps runs before the write.
        expect(mocks.expireStalePendingRsvps).toHaveBeenCalledWith('fiesta')

        // saveRSVP receives a verification issuance (hash-only, never the raw token).
        expect(mocks.saveRSVP).toHaveBeenCalledTimes(1)
        const [rsvpInput, verificationArg] = mocks.saveRSVP.mock.calls[0]
        expect(rsvpInput).toMatchObject({ name: 'Alex', email: 'alex@example.com', eventId: 'fiesta' })
        expect(verificationArg.tokenHash).toMatch(/^[a-f0-9]{64}$/)
        expect(verificationArg.expiresAt).toBeInstanceOf(Date)

        // Only ONE email goes out — the verification email, not confirmation.
        expect(mocks.send).toHaveBeenCalledTimes(1)
        const [sendArgs] = mocks.send.mock.calls[0]
        expect(sendArgs.to).toBe('alex@example.com')
        expect(sendArgs.subject).toBe('Confirma tu asistencia a Fiesta')
        expect(sendArgs.html).toContain('/verify/fiesta?token=')
        expect(mocks.recordEmailSent).toHaveBeenCalledWith('rsvp-1', 'verification')
        expect(mocks.recordEmailSent).not.toHaveBeenCalledWith('rsvp-1', 'confirmation')
    })

    it('never logs or leaks the raw verification token in the HTTP response', async () => {
        mocks.saveRSVP.mockResolvedValue({
            id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
            phone: '+525500000000', plusOne: false, plusOneName: null,
            status: 'pending_verification', emailSent: null, emailHistory: [], cancelToken: null,
            createdAt: new Date('2026-08-18T00:00:00.000Z'),
        })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())
        const payload = await response.json()
        const [sendArgs] = mocks.send.mock.calls[0]
        const sentUrl = new URL(sendArgs.html.match(/href="([^"]+)"/)![1])
        const rawToken = sentUrl.searchParams.get('token')!

        expect(JSON.stringify(payload)).not.toContain(rawToken)
    })

    it('when the event does not require verification, keeps the confirmed flow unchanged (regression)', async () => {
        mocks.getEventBySlug.mockResolvedValue({ ...verifyingEvent, emailVerificationEnabled: false })
        mocks.saveRSVP.mockResolvedValue({
            id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
            phone: '+525500000000', plusOne: false, plusOneName: null,
            status: 'confirmed', emailSent: null, emailHistory: [], cancelToken: null,
            createdAt: new Date('2026-08-18T00:00:00.000Z'),
        })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(payload.status).toBe('confirmed')
        // saveRSVP called WITHOUT a verification issuance.
        const [, verificationArg] = mocks.saveRSVP.mock.calls[0]
        expect(verificationArg).toBeUndefined()
        expect(mocks.recordEmailSent).toHaveBeenCalledWith('rsvp-1', 'confirmation')
    })

    // Gherkin: "Given re-submit del mismo email con fila pendiente propia /
    // When llega el segundo POST /api/rsvp / Then se refresca el token en la
    // misma fila (no hay duplicado ni CAPACITY_FULL falso)". At the route
    // layer this shows up as: saveRSVP is called again (same shape), and a
    // fresh token is issued each time — the route never special-cases a
    // "second" request, it just always asks saveRSVP to refresh-or-create.
    it('re-submitting issues a fresh token candidate each time (query layer owns same-row refresh)', async () => {
        mocks.saveRSVP.mockResolvedValue({
            id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
            phone: '+525500000000', plusOne: false, plusOneName: null,
            status: 'pending_verification', emailSent: null, emailHistory: [], cancelToken: null,
            createdAt: new Date('2026-08-18T00:00:00.000Z'),
        })

        const { POST } = await import('@/app/api/rsvp/route')
        await POST(request())
        await POST(request())

        expect(mocks.saveRSVP).toHaveBeenCalledTimes(2)
        const [, firstVerification] = mocks.saveRSVP.mock.calls[0]
        const [, secondVerification] = mocks.saveRSVP.mock.calls[1]
        expect(firstVerification.tokenHash).not.toBe(secondVerification.tokenHash)
        expect(mocks.send).toHaveBeenCalledTimes(2)
    })

    it('does not fail the RSVP when the verification email send fails', async () => {
        mocks.send.mockResolvedValue({ error: { message: 'provider down' } })
        mocks.saveRSVP.mockResolvedValue({
            id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
            phone: '+525500000000', plusOne: false, plusOneName: null,
            status: 'pending_verification', emailSent: null, emailHistory: [], cancelToken: null,
            createdAt: new Date('2026-08-18T00:00:00.000Z'),
        })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.recordEmailSent).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })
})
