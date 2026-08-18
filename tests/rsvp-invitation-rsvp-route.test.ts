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
}))

vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    saveRSVP: mocks.saveRSVP,
    saveRsvpWithInvitation: mocks.saveRsvpWithInvitation,
    recordEmailSent: mocks.recordEmailSent,
    generateCancelToken: mocks.generateCancelToken,
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
    resend: { emails: { send: vi.fn() } },
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
    })

    it('bypasses only rsvpClosed and delegates the linked write to the atomic query', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const { POST } = await import('@/app/api/rsvp/route')
        const response = await POST(request())

        expect(response.status).toBe(201)
        expect(mocks.saveRSVP).not.toHaveBeenCalled()
        expect(mocks.saveRsvpWithInvitation).toHaveBeenCalledWith({
            tokenHash: hashRsvpInvitationToken(token),
            eventId: 'fiesta',
            name: 'Alex',
            email: 'alex@example.com',
            phone: '+525500000000',
            plusOne: false,
            plusOneName: null,
        })
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
