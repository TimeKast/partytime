import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    cookieValue: 'session-token' as string | undefined,
    validateSession: vi.fn(),
    getAllEvents: vi.fn(),
    createEvent: vi.fn(),
    getUserEventAssignments: vi.fn(),
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: vi.fn(() => mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
}))

vi.mock('@/lib/db', () => ({
    isDatabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/queries', () => ({
    getAllEvents: mocks.getAllEvents,
    createEvent: mocks.createEvent,
}))

vi.mock('@/lib/user-queries', () => ({
    getUserEventAssignments: mocks.getUserEventAssignments,
}))

function storedEvent(overrides: Record<string, unknown> = {}) {
    return {
        id: 'event-1',
        slug: 'fiesta',
        title: 'Fiesta',
        subtitle: 'Una noche especial',
        date: '18 de agosto',
        time: '20:00',
        location: 'Terraza',
        isActive: true,
        checkinEnabled: true,
        checkinPasswordHash: '$2a$12$HASH_SENTINEL_MUST_NOT_LEAK',
        checkinPasswordUpdatedAt: new Date('2026-08-18T18:00:00.000Z'),
        // Proves the response is an allowlist, not merely a one-field denylist.
        internalSecret: 'INTERNAL_SENTINEL_MUST_NOT_LEAK',
        hostEmail: 'private-host@example.com',
        ...overrides,
    }
}

const expectedSafeEvent = {
    id: 'event-1',
    slug: 'fiesta',
    title: 'Fiesta',
    subtitle: 'Una noche especial',
    date: '18 de agosto',
    time: '20:00',
    location: 'Terraza',
    isActive: true,
    accessRole: 'manager',
    checkin: {
        enabled: true,
        hasPassword: true,
        updatedAt: '2026-08-18T18:00:00.000Z',
    },
}

describe('GET /api/events — authenticated admin DTO allowlist', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mocks.cookieValue = 'session-token'
        mocks.getAllEvents.mockResolvedValue([storedEvent()])
        mocks.getUserEventAssignments.mockResolvedValue([])
    })

    it('returns the explicit safe DTO to a super_admin and never serializes a DB hash or unknown internal field', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'root', role: 'super_admin' })

        const { GET } = await import('@/app/api/events/route')
        const response = await GET(new NextRequest('http://localhost/api/events'))
        const rawBody = await response.text()
        const data = JSON.parse(rawBody)

        expect(response.status).toBe(200)
        expect(data).toEqual({ success: true, count: 1, events: [expectedSafeEvent] })
        expect(rawBody).not.toContain('HASH_SENTINEL_MUST_NOT_LEAK')
        expect(rawBody).not.toContain('INTERNAL_SENTINEL_MUST_NOT_LEAK')
        expect(rawBody).not.toContain('checkinPasswordHash')
        expect(rawBody).not.toContain('internalSecret')
        expect(rawBody).not.toContain('private-host@example.com')
        expect(mocks.getUserEventAssignments).not.toHaveBeenCalled()
    })

    it('keeps only assigned events for a regular user and preserves the viewer accessRole in the same safe DTO', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'viewer-1', role: 'user' })
        mocks.getAllEvents.mockResolvedValue([
            storedEvent(),
            storedEvent({ id: 'event-2', slug: 'otra-fiesta', title: 'Otra fiesta' }),
        ])
        mocks.getUserEventAssignments.mockResolvedValue([
            { event: { id: 'event-1' }, assignment: { role: 'viewer' } },
        ])

        const { GET } = await import('@/app/api/events/route')
        const response = await GET(new NextRequest('http://localhost/api/events'))
        const rawBody = await response.text()
        const data = JSON.parse(rawBody)

        expect(response.status).toBe(200)
        expect(data).toEqual({
            success: true,
            count: 1,
            events: [{ ...expectedSafeEvent, accessRole: 'viewer' }],
        })
        expect(mocks.getUserEventAssignments).toHaveBeenCalledWith('viewer-1')
        expect(rawBody).not.toContain('HASH_SENTINEL_MUST_NOT_LEAK')
        expect(rawBody).not.toContain('INTERNAL_SENTINEL_MUST_NOT_LEAK')
    })
})

describe('POST /api/events — response uses the same safe DTO', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mocks.cookieValue = 'session-token'
        mocks.validateSession.mockResolvedValue({ id: 'root', role: 'super_admin' })
        mocks.createEvent.mockResolvedValue(storedEvent({ slug: 'nueva-fiesta', title: 'Nueva fiesta' }))
    })

    it('never echoes a server-only field returned unexpectedly by createEvent', async () => {
        const { POST } = await import('@/app/api/events/route')
        const response = await POST(new NextRequest('http://localhost/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'nueva-fiesta', title: 'Nueva fiesta' }),
        }))
        const rawBody = await response.text()
        const data = JSON.parse(rawBody)

        expect(response.status).toBe(201)
        expect(data.event).toEqual({
            ...expectedSafeEvent,
            slug: 'nueva-fiesta',
            title: 'Nueva fiesta',
        })
        expect(rawBody).not.toContain('HASH_SENTINEL_MUST_NOT_LEAK')
        expect(rawBody).not.toContain('INTERNAL_SENTINEL_MUST_NOT_LEAK')
    })
})
