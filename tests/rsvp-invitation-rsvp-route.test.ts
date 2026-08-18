import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { hashRsvpInvitationToken } from '@/lib/rsvp-invitation'

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
    // ISSUE-007: the route now expires stale pending rows for the resolved
    // event before touching capacity/the unique (event, email) slot.
    expireStalePendingRsvps: mocks.expireStalePendingRsvps,
    // ISSUE-006: the route now destructures RSVP_STATUS from this same
    // dynamic import to gate confirmation emails on rsvp.status === CONFIRMED.
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

const token = 'c'.repeat(43)
const event = {
    id: 'event-uuid',
    slug: 'fiesta',
    isActive: true,
    rsvpClosed: true,
    rsvpClosedMessage: 'RSVP público cerrado',
    requirePlusOneName: false,
    emailConfirmationEnabled: false,
    title: 'Fiesta',
    displayTitle: '',
}
const rsvp = {
    id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
    phone: '+525500000000', plusOne: false, plusOneName: null,
    status: 'confirmed', emailSent: null, emailHistory: [], cancelToken: null,
    createdAt: new Date('2026-08-17T00:00:00.000Z'),
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
            invitationToken: token,
            ...overrides,
        }),
    })
}

describe('POST /api/rsvp with invitationToken', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(event)
        mocks.saveRsvpWithInvitation.mockResolvedValue(rsvp)
        mocks.saveRSVP.mockResolvedValue(rsvp)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.send.mockResolvedValue({ error: null })
        mocks.recordEmailSent.mockResolvedValue(true)
    })

    it('bypasses only rsvpClosed and delegates the linked write to the atomic query', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.saveRSVP).not.toHaveBeenCalled()
        // ISSUE-007: the route now always attaches a verification candidate
        // on the invitation path — the CTE decides whether to use it.
        expect(mocks.saveRsvpWithInvitation).toHaveBeenCalledWith({
            tokenHash: hashRsvpInvitationToken(token),
            eventId: 'fiesta',
            name: 'Alex',
            email: 'alex@example.com',
            phone: '+525500000000',
            plusOne: false,
            plusOneName: null,
            verificationCandidate: {
                tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                expiresAt: expect.any(Date),
            },
        })
        expect(mocks.expireStalePendingRsvps).toHaveBeenCalledWith('fiesta')
        const auditLog = info.mock.calls.flat().join(' ')
        expect(auditLog).toContain('rsvp_invitation.consumed')
        expect(auditLog).toContain('rsvp-1')
        expect(auditLog).not.toContain(token)
        expect(auditLog).not.toContain(hashRsvpInvitationToken(token))
        expect(auditLog).not.toContain('alex@example.com')
        info.mockRestore()
    })

    it('fails closed without mutating when the token is unavailable or linked elsewhere', async () => {
        mocks.saveRsvpWithInvitation.mockResolvedValue(null)
        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(409)
        expect(mocks.saveRsvpWithInvitation).toHaveBeenCalledTimes(1)
        expect(mocks.saveRSVP).not.toHaveBeenCalled()
    })

    it('never bypasses event inactivity or required plus-one validation', async () => {
        const { POST } = await import('@/app/api/rsvp/route')
        mocks.getEventBySlug.mockResolvedValueOnce({ ...event, isActive: false })
        const inactive = await POST(request())

        mocks.getEventBySlug.mockResolvedValueOnce({ ...event, requirePlusOneName: true })
        const missingPlusOne = await POST(request({ plusOne: true, plusOneName: '   ' }))

        expect([inactive.status, missingPlusOne.status]).toEqual([400, 400])
        expect(mocks.saveRsvpWithInvitation).not.toHaveBeenCalled()
    })

    it('rejects malformed tokens before event lookup', async () => {
        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request({ invitationToken: 'short' }))

        expect(response.status).toBe(409)
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
        expect(mocks.saveRsvpWithInvitation).not.toHaveBeenCalled()
    })

    it('fails closed in demo mode instead of simulating one-time consumption', async () => {
        mocks.databaseConfigured = false
        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(503)
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
        expect(mocks.saveRsvpWithInvitation).not.toHaveBeenCalled()
    })

    it('keeps the legacy non-token path closed when RSVP is closed', async () => {
        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request({ invitationToken: undefined }))

        expect(response.status).toBe(400)
        expect(mocks.saveRSVP).not.toHaveBeenCalled()
        expect(mocks.saveRsvpWithInvitation).not.toHaveBeenCalled()
    })
})

// ISSUE-007 (PLAN-EPICS-002-005.md §2.1) Gherkin:
// "Given evento con verificación activada e invitación privada con
// skip_verification=true (default) / When el invitado del link registra /
// Then queda confirmed directo (bypass)"
// "Given evento con verificación activada e invitación con
// skip_verification=false / When el invitado del link registra / Then
// queda pending_verification con el link consumido, y si expira sin
// verificar el link se restaura" (restoration itself is
// expireStalePendingRsvps' job, already covered in tests/pending-states.test.ts
// and exercised at the route layer above via expireStalePendingRsvps being
// called first on every attempt).
//
// The actual skip_verification branching decision lives inside
// saveRsvpWithInvitation's atomic CTE (tests/email-verification.test.ts).
// At the route layer, both scenarios are indistinguishable from the route's
// point of view except by the STATUS saveRsvpWithInvitation returns — so
// these tests drive that return value directly, the same way
// tests/rsvp-invitation-rsvp-route.test.ts already treats saveRsvpWithInvitation
// as an opaque atomic boundary.
describe('POST /api/rsvp with invitationToken — skip_verification bypass/pending (ISSUE-007)', () => {
    const verifyingEvent = { ...event, rsvpClosed: false, emailConfirmationEnabled: true, emailVerificationEnabled: true }

    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(verifyingEvent)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.send.mockResolvedValue({ error: null })
        mocks.recordEmailSent.mockResolvedValue(true)
    })

    it('always attaches a verification candidate on the invitation path, even when the event does not verify', async () => {
        mocks.getEventBySlug.mockResolvedValue({ ...event, rsvpClosed: false, emailVerificationEnabled: false })
        mocks.saveRsvpWithInvitation.mockResolvedValue(rsvp)

        const { POST } = await import('@/app/api/rsvp/route')
        await POST(request())

        const [callArgs] = mocks.saveRsvpWithInvitation.mock.calls[0]
        expect(callArgs.verificationCandidate.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('bypass (skip_verification=true or default): confirmed directly, only the confirmation email goes out', async () => {
        mocks.saveRsvpWithInvitation.mockResolvedValue({ ...rsvp, status: 'confirmed' })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(payload.status).toBe('confirmed')
        expect(mocks.send).toHaveBeenCalledTimes(1)
        const [sendArgs] = mocks.send.mock.calls[0]
        expect(sendArgs.subject).not.toContain('Confirma tu asistencia')
        expect(mocks.recordEmailSent).toHaveBeenCalledWith('rsvp-1', 'confirmation')
    })

    it('pending (skip_verification=false): pending_verification with the link consumed, only the verification email goes out', async () => {
        mocks.saveRsvpWithInvitation.mockResolvedValue({ ...rsvp, status: 'pending_verification' })

        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(payload.status).toBe('pending_verification')
        // The link was still consumed atomically by saveRsvpWithInvitation —
        // the route made exactly one call, regardless of the resulting status.
        expect(mocks.saveRsvpWithInvitation).toHaveBeenCalledTimes(1)
        expect(mocks.send).toHaveBeenCalledTimes(1)
        const [sendArgs] = mocks.send.mock.calls[0]
        expect(sendArgs.subject).toBe('Confirma tu asistencia a Fiesta')
        expect(mocks.recordEmailSent).toHaveBeenCalledWith('rsvp-1', 'verification')
        expect(mocks.recordEmailSent).not.toHaveBeenCalledWith('rsvp-1', 'confirmation')
    })
})
