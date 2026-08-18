import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { hashRsvpInvitationToken } from '@/lib/rsvp-invitation'

const mocks = vi.hoisted(() => ({
    cookieValue: 'session-token' as string | undefined,
    databaseConfigured: true,
    validateSession: vi.fn(),
    userHasEventAccess: vi.fn(),
    getEventBySlug: vi.fn(),
    createRsvpInvitationLink: vi.fn(),
    listRsvpInvitationLinks: vi.fn(),
    revokeRsvpInvitationLink: vi.fn(),
    getRsvpInvitationEvent: vi.fn(),
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: () => mocks.cookieValue ? { value: mocks.cookieValue } : undefined,
    })),
}))

vi.mock('@/lib/auth-utils', () => ({ validateSession: mocks.validateSession }))
vi.mock('@/lib/user-queries', () => ({ userHasEventAccess: mocks.userHasEventAccess }))
vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    createRsvpInvitationLink: mocks.createRsvpInvitationLink,
    listRsvpInvitationLinks: mocks.listRsvpInvitationLinks,
    revokeRsvpInvitationLink: mocks.revokeRsvpInvitationLink,
    getRsvpInvitationEvent: mocks.getRsvpInvitationEvent,
}))
vi.mock('@/lib/public-event', () => ({
    buildPublicEventDto: (event: { slug: string; title: string }) => ({
        slug: event.slug,
        title: event.title,
        isActive: true,
        rsvpClosed: true,
    }),
}))

const event = { id: 'event-uuid', slug: 'fiesta', title: 'Fiesta privada' }
const futureExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
const link = {
    id: 'link-1',
    eventId: 'fiesta',
    expiresAt: futureExpiry,
    usedAt: null,
    usedRsvpId: null,
    usedRsvpName: null,
    revokedAt: null,
    revokedBy: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-08-17T00:00:00.000Z'),
}

function adminRequest(method: string, body?: unknown, origin = 'http://localhost:3000') {
    return new NextRequest('http://localhost:3000/api/admin/rsvp-invitations', {
        method,
        headers: {
            origin,
            host: 'localhost:3000',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
}

describe('/api/admin/rsvp-invitations', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.cookieValue = 'session-token'
        mocks.databaseConfigured = true
        mocks.validateSession.mockResolvedValue({ id: 'admin-1', role: 'super_admin' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true, role: 'manager' })
        mocks.getEventBySlug.mockResolvedValue(event)
        mocks.createRsvpInvitationLink.mockResolvedValue(link)
        mocks.listRsvpInvitationLinks.mockResolvedValue([link])
        mocks.revokeRsvpInvitationLink.mockResolvedValue(true)
    })

    it('fails closed on cross-origin and missing-origin mutations before auth', async () => {
        const { POST } = await import('@/app/api/admin/rsvp-invitations/route')
        const crossOrigin = await POST(adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: futureExpiry.toISOString(),
        }, 'https://evil.example'))
        const missingOriginRequest = adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: futureExpiry.toISOString(),
        })
        missingOriginRequest.headers.delete('origin')
        const missingOrigin = await POST(missingOriginRequest)

        expect([crossOrigin.status, missingOrigin.status]).toEqual([403, 403])
        expect(mocks.validateSession).not.toHaveBeenCalled()
    })

    it('requires an assigned manager or super admin for the event', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'manager' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false, role: null })
        const { POST } = await import('@/app/api/admin/rsvp-invitations/route')

        const response = await POST(adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: futureExpiry.toISOString(),
        }))

        expect(response.status).toBe(403)
        expect(mocks.createRsvpInvitationLink).not.toHaveBeenCalled()
        expect(mocks.userHasEventAccess).toHaveBeenCalledWith('manager-1', 'event-uuid', 'manager')
    })

    it('stores only the digest and reveals the raw URL exactly in the creation response', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const { POST } = await import('@/app/api/admin/rsvp-invitations/route')
        const response = await POST(adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: futureExpiry.toISOString(),
        }))
        const payload = await response.json()

        expect(response.status).toBe(201)
        const issuedUrl = new URL(payload.url)
        const rawToken = new URLSearchParams(issuedUrl.hash.slice(1)).get('token')!
        expect(issuedUrl.pathname).toBe('/invite')
        expect(issuedUrl.search).toBe('')
        expect(mocks.createRsvpInvitationLink).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'fiesta',
            tokenHash: hashRsvpInvitationToken(rawToken),
            createdBy: 'admin-1',
        }))
        expect(payload.link).not.toHaveProperty('tokenHash')
        expect(JSON.stringify(payload.link)).not.toContain(rawToken)
        const auditLog = info.mock.calls.flat().join(' ')
        expect(auditLog).toContain('rsvp_invitation.created')
        expect(auditLog).toContain('link-1')
        expect(auditLog).not.toContain(rawToken)
        expect(auditLog).not.toContain(hashRsvpInvitationToken(rawToken))
        info.mockRestore()
    })

    it('lists no token hash and revokes only with the authorized event linkage', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const { GET, DELETE } = await import('@/app/api/admin/rsvp-invitations/route')
        const listed = await GET(new NextRequest(
            'http://localhost:3000/api/admin/rsvp-invitations?eventSlug=fiesta',
        ))
        const listPayload = await listed.json()
        const revoked = await DELETE(adminRequest('DELETE', { eventSlug: 'fiesta', id: 'link-1' }))

        expect(listed.status).toBe(200)
        expect(listPayload.links[0]).not.toHaveProperty('tokenHash')
        expect(listPayload.links[0].status).toBe('active')
        expect(revoked.status).toBe(200)
        expect(mocks.revokeRsvpInvitationLink).toHaveBeenCalledWith('link-1', 'fiesta', 'admin-1')
        expect(info.mock.calls.flat().join(' ')).toContain('rsvp_invitation.revoked')
        info.mockRestore()
    })

    it('returns the consuming guest reference only through the authorized admin listing', async () => {
        mocks.listRsvpInvitationLinks.mockResolvedValueOnce([{
            ...link,
            usedAt: new Date('2026-08-18T12:00:00.000Z'),
            usedRsvpId: 'rsvp-1',
            usedRsvpName: 'Ana Invitada',
        }])
        const { GET } = await import('@/app/api/admin/rsvp-invitations/route')

        const response = await GET(new NextRequest(
            'http://localhost:3000/api/admin/rsvp-invitations?eventSlug=fiesta',
        ))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(payload.links[0]).toMatchObject({
            status: 'used',
            usedRsvpId: 'rsvp-1',
            usedRsvpName: 'Ana Invitada',
        })
        expect(payload.links[0]).not.toHaveProperty('tokenHash')
    })

    it('rejects unknown input keys and expiry beyond 365 days', async () => {
        const { POST } = await import('@/app/api/admin/rsvp-invitations/route')
        const unknown = await POST(adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: futureExpiry.toISOString(), token: 'client-secret',
        }))
        const tooLate = await POST(adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString(),
        }))

        expect(unknown.status).toBe(400)
        expect(tooLate.status).toBe(400)
        expect(mocks.createRsvpInvitationLink).not.toHaveBeenCalled()
    })
})

function validationRequest(body: unknown, origin?: string) {
    return new NextRequest('http://localhost:3000/api/rsvp-invitations/validate', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(origin ? { origin, host: 'localhost:3000' } : {}),
        },
        body: JSON.stringify(body),
    })
}

describe('POST /api/rsvp-invitations/validate', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getRsvpInvitationEvent.mockResolvedValue({
            ...event,
            hostEmail: 'private@example.com',
            tokenHash: 'never-public',
        })
    })

    it('hashes the body token and returns only the allowlisted public event DTO', async () => {
        const token = 'a'.repeat(43)
        const { POST } = await import('@/app/api/rsvp-invitations/validate/route')
        const response = await POST(validationRequest({ token }))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(mocks.getRsvpInvitationEvent).toHaveBeenCalledWith(hashRsvpInvitationToken(token))
        expect(payload).toEqual({
            success: true,
            event: { slug: 'fiesta', title: 'Fiesta privada', isActive: true, rsvpClosed: true },
        })
        expect(JSON.stringify(payload)).not.toContain('never-public')
        expect(JSON.stringify(payload)).not.toContain('private@example.com')
    })

    it('uses one indistinguishable 404 for malformed, used, expired or revoked links', async () => {
        const { POST } = await import('@/app/api/rsvp-invitations/validate/route')
        const malformed = await POST(validationRequest({ token: 'bad' }))
        mocks.getRsvpInvitationEvent.mockResolvedValueOnce(null)
        const unavailable = await POST(validationRequest({ token: 'b'.repeat(43) }))

        expect([malformed.status, unavailable.status]).toEqual([404, 404])
        expect(await malformed.json()).toEqual(await unavailable.json())
    })

    it('rejects explicit cross-origin validation without hashing the bearer', async () => {
        const token = 'c'.repeat(43)
        const { POST } = await import('@/app/api/rsvp-invitations/validate/route')
        const response = await POST(validationRequest({ token }, 'https://evil.example'))

        expect(response.status).toBe(403)
        expect(mocks.getRsvpInvitationEvent).not.toHaveBeenCalled()
    })
})
