import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
    hashRsvpInvitationToken,
    issueRecoverableRsvpInvitationToken,
} from '@/lib/rsvp-invitation'

const mocks = vi.hoisted(() => ({
    cookieValue: 'session-token' as string | undefined,
    databaseConfigured: true,
    validateSession: vi.fn(),
    userHasEventAccess: vi.fn(),
    getEventBySlug: vi.fn(),
    createRsvpInvitationLink: vi.fn(),
    listRsvpInvitationLinks: vi.fn(),
    getRsvpInvitationLinkForAdmin: vi.fn(),
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
    getRsvpInvitationLinkForAdmin: mocks.getRsvpInvitationLinkForAdmin,
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

const event = { id: 'event-uuid', slug: 'fiesta', title: 'Fiesta privada', emailVerificationEnabled: false }
const originalTokenKeys = process.env.RSVP_INVITATION_TOKEN_KEYS
const tokenKeys = `v1:${'11'.repeat(32)}`
const futureExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
const recoverableToken = issueRecoverableRsvpInvitationToken('link-1', 'event-uuid', tokenKeys)!
const link = {
    id: 'link-1',
    eventId: 'fiesta',
    tokenHash: hashRsvpInvitationToken(recoverableToken),
    expiresAt: futureExpiry,
    isCourtesy: true,
    skipVerification: true,
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
        process.env.RSVP_INVITATION_TOKEN_KEYS = tokenKeys
        mocks.cookieValue = 'session-token'
        mocks.databaseConfigured = true
        mocks.validateSession.mockResolvedValue({ id: 'admin-1', role: 'super_admin' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true, role: 'manager' })
        mocks.getEventBySlug.mockResolvedValue(event)
        mocks.createRsvpInvitationLink.mockResolvedValue(link)
        mocks.listRsvpInvitationLinks.mockResolvedValue([link])
        mocks.getRsvpInvitationLinkForAdmin.mockResolvedValue(link)
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
        expect(issuedUrl.pathname).toBe('/invite/fiesta')
        expect(issuedUrl.search).toBe('')
        expect(issuedUrl.href.split('#')[0]).not.toContain(rawToken)
        expect(issuedUrl.hash).toBe(`#token=${rawToken}`)
        expect(mocks.createRsvpInvitationLink).toHaveBeenCalledWith(expect.objectContaining({
            id: expect.any(String),
            eventId: 'fiesta',
            tokenHash: hashRsvpInvitationToken(rawToken),
            createdBy: 'admin-1',
            // ISSUE-020: omitted in the request body, both default to true —
            // "confirmed directly" for every unflagged link.
            isCourtesy: true,
            skipVerification: true,
        }))
        expect(payload.link).not.toHaveProperty('tokenHash')
        expect(payload.link).toMatchObject({ isCourtesy: true, skipVerification: true })
        expect(JSON.stringify(payload.link)).not.toContain(rawToken)
        const auditLog = info.mock.calls.flat().join(' ')
        expect(auditLog).toContain('rsvp_invitation.created')
        expect(auditLog).toContain('link-1')
        expect(auditLog).not.toContain(rawToken)
        expect(auditLog).not.toContain(hashRsvpInvitationToken(rawToken))
        info.mockRestore()
    })

    it('persists explicit isCourtesy/skipVerification overrides and rejects non-boolean flags', async () => {
        const { POST } = await import('@/app/api/admin/rsvp-invitations/route')
        const response = await POST(adminRequest('POST', {
            eventSlug: 'fiesta',
            expiresAt: futureExpiry.toISOString(),
            isCourtesy: false,
            skipVerification: false,
        }))

        expect(response.status).toBe(201)
        expect(mocks.createRsvpInvitationLink).toHaveBeenCalledWith(expect.objectContaining({
            isCourtesy: false,
            skipVerification: false,
        }))

        const nonBoolean = await POST(adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: futureExpiry.toISOString(), isCourtesy: 'false',
        }))
        const nonBooleanOther = await POST(adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: futureExpiry.toISOString(), skipVerification: 1,
        }))

        expect([nonBoolean.status, nonBooleanOther.status]).toEqual([400, 400])
    })

    it('uses the authorized canonical event slug instead of the request alias in the public path', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const { POST } = await import('@/app/api/admin/rsvp-invitations/route')
        const response = await POST(adminRequest('POST', {
            eventSlug: 'event-uuid', expiresAt: futureExpiry.toISOString(),
        }))
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(new URL(payload.url).pathname).toBe('/invite/fiesta')
        expect(mocks.getEventBySlug).toHaveBeenCalledWith('event-uuid')
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
        expect(listPayload.links[0].urlAvailability).toBe('available')
        expect(listPayload.links[0]).toMatchObject({ isCourtesy: true, skipVerification: true })
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
            urlAvailability: 'not_recoverable',
            usedRsvpId: 'rsvp-1',
            usedRsvpName: 'Ana Invitada',
        })
        expect(payload.links[0]).not.toHaveProperty('tokenHash')
    })

    it('recovers one URL on demand with same-origin, auth, RBAC and event binding', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const { PATCH } = await import('@/app/api/admin/rsvp-invitations/route')
        const response = await PATCH(adminRequest('PATCH', { eventSlug: 'event-uuid', id: 'link-1' }))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(mocks.getRsvpInvitationLinkForAdmin).toHaveBeenCalledWith('link-1', 'fiesta')
        expect(mocks.getEventBySlug).toHaveBeenCalledWith('event-uuid')
        expect(new URL(payload.url).pathname).toBe('/invite/fiesta')
        expect(new URLSearchParams(new URL(payload.url).hash.slice(1)).get('token')).toBe(recoverableToken)
        expect(JSON.stringify(payload)).not.toContain(link.tokenHash)
        const auditLog = info.mock.calls.flat().join(' ')
        expect(auditLog).toContain('rsvp_invitation.copied')
        expect(auditLog).toContain('link-1')
        expect(auditLog).toContain('fiesta')
        expect(auditLog).toContain('admin-1')
        expect(auditLog).not.toContain(recoverableToken)
        expect(auditLog).not.toContain(link.tokenHash)
        expect(auditLog).not.toContain(payload.url)
        info.mockRestore()
    })

    it('rejects cross-origin recovery before auth and does not read a link', async () => {
        const { PATCH } = await import('@/app/api/admin/rsvp-invitations/route')
        const response = await PATCH(adminRequest(
            'PATCH',
            { eventSlug: 'fiesta', id: 'link-1' },
            'https://evil.example',
        ))

        expect(response.status).toBe(403)
        expect(mocks.validateSession).not.toHaveBeenCalled()
        expect(mocks.getRsvpInvitationLinkForAdmin).not.toHaveBeenCalled()
    })

    it('marks legacy random links as unavailable without exposing their digest', async () => {
        const legacyToken = 'z'.repeat(43)
        mocks.getRsvpInvitationLinkForAdmin.mockResolvedValueOnce({
            ...link,
            tokenHash: hashRsvpInvitationToken(legacyToken),
        })
        const { PATCH } = await import('@/app/api/admin/rsvp-invitations/route')
        const response = await PATCH(adminRequest('PATCH', { eventSlug: 'fiesta', id: 'link-1' }))
        const payload = await response.json()

        expect(response.status).toBe(409)
        expect(payload.urlAvailability).toBe('not_recoverable')
        expect(JSON.stringify(payload)).not.toContain(hashRsvpInvitationToken(legacyToken))
        expect(JSON.stringify(payload)).not.toContain(legacyToken)
    })

    it.each([
        ['used', { usedAt: new Date('2026-08-18T12:00:00.000Z') }],
        ['revoked', { revokedAt: new Date('2026-08-18T12:00:00.000Z') }],
        ['expired', { expiresAt: new Date('2026-08-17T00:00:00.000Z') }],
    ] as const)('rejects a %s link before consulting the recovery keyring', async (_state, override) => {
        delete process.env.RSVP_INVITATION_TOKEN_KEYS
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        mocks.getRsvpInvitationLinkForAdmin.mockResolvedValueOnce({ ...link, ...override })
        const { PATCH } = await import('@/app/api/admin/rsvp-invitations/route')

        const response = await PATCH(adminRequest('PATCH', { eventSlug: 'fiesta', id: 'link-1' }))
        const payload = await response.json()
        const serialized = JSON.stringify(payload)

        expect(response.status).toBe(409)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(payload).toEqual({
            success: false,
            error: 'Este link ya no está activo',
            urlAvailability: 'not_recoverable',
        })
        expect(payload).not.toHaveProperty('url')
        expect(serialized).not.toContain(recoverableToken)
        expect(serialized).not.toContain(link.tokenHash)
        // Missing config would produce a 503/error log if recovery ran.
        expect(error).not.toHaveBeenCalled()
        expect(info).not.toHaveBeenCalled()
        info.mockRestore()
        error.mockRestore()
    })

    it('fails closed before issuance when the dedicated keyring is missing', async () => {
        delete process.env.RSVP_INVITATION_TOKEN_KEYS
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const { POST } = await import('@/app/api/admin/rsvp-invitations/route')
        const response = await POST(adminRequest('POST', {
            eventSlug: 'fiesta', expiresAt: futureExpiry.toISOString(),
        }))
        const payload = await response.json()

        expect(response.status).toBe(503)
        expect(payload.urlAvailability).toBe('configuration_unavailable')
        expect(mocks.createRsvpInvitationLink).not.toHaveBeenCalled()
        expect(error.mock.calls.flat().join(' ')).not.toContain(tokenKeys)
        error.mockRestore()
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

afterAll(() => {
    if (originalTokenKeys === undefined) delete process.env.RSVP_INVITATION_TOKEN_KEYS
    else process.env.RSVP_INVITATION_TOKEN_KEYS = originalTokenKeys
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
            event: {
                ...event,
                hostEmail: 'private@example.com',
                tokenHash: 'never-public',
            },
            isCourtesy: true,
            skipVerification: true,
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
            requiresPayment: false,
            requiresVerification: false,
        })
        expect(JSON.stringify(payload)).not.toContain('never-public')
        expect(JSON.stringify(payload)).not.toContain('private@example.com')
        expect(JSON.stringify(payload)).not.toContain('isCourtesy')
        expect(JSON.stringify(payload)).not.toContain('skipVerification')
    })

    it('surfaces requiresVerification only when the event verifies and the link does not skip it', async () => {
        mocks.getRsvpInvitationEvent.mockResolvedValueOnce({
            event: { ...event, emailVerificationEnabled: true },
            isCourtesy: true,
            skipVerification: false,
        })
        const { POST } = await import('@/app/api/rsvp-invitations/validate/route')
        const response = await POST(validationRequest({ token: 'd'.repeat(43) }))
        const payload = await response.json()

        expect(payload.requiresPayment).toBe(false)
        expect(payload.requiresVerification).toBe(true)
    })

    it('never surfaces requiresVerification when the link skips it, even if the event verifies', async () => {
        mocks.getRsvpInvitationEvent.mockResolvedValueOnce({
            event: { ...event, emailVerificationEnabled: true },
            isCourtesy: true,
            skipVerification: true,
        })
        const { POST } = await import('@/app/api/rsvp-invitations/validate/route')
        const response = await POST(validationRequest({ token: 'e'.repeat(43) }))
        const payload = await response.json()

        expect(payload.requiresVerification).toBe(false)
    })

    // ISSUE-010: paymentRequired now exists on events; a non-courtesy link on
    // a paid event must surface requiresPayment=true and supersede
    // verification (PLAN §2.1), same as the public flow.
    it('surfaces requiresPayment when the event requires payment and the link is not a courtesy', async () => {
        mocks.getRsvpInvitationEvent.mockResolvedValueOnce({
            event: { ...event, paymentRequired: true, emailVerificationEnabled: true },
            isCourtesy: false,
            skipVerification: false,
        })
        const { POST } = await import('@/app/api/rsvp-invitations/validate/route')
        const response = await POST(validationRequest({ token: 'f'.repeat(43) }))
        const payload = await response.json()

        expect(payload.requiresPayment).toBe(true)
        expect(payload.requiresVerification).toBe(false)
    })

    it('never charges a courtesy link even on a paid event', async () => {
        mocks.getRsvpInvitationEvent.mockResolvedValueOnce({
            event: { ...event, paymentRequired: true },
            isCourtesy: true,
            skipVerification: true,
        })
        const { POST } = await import('@/app/api/rsvp-invitations/validate/route')
        const response = await POST(validationRequest({ token: 'g'.repeat(43) }))
        const payload = await response.json()

        expect(payload.requiresPayment).toBe(false)
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
