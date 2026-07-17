import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    validateSession: vi.fn(),
    getUserEventAssignments: vi.fn(async () => []),
    cookieValue: 'session-token' as string | undefined,
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: () => mocks.cookieValue ? { value: mocks.cookieValue } : undefined,
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
    SESSION_COOKIE_NAME: 'rp_session',
}))

vi.mock('@/lib/user-queries', () => ({
    getUserEventAssignments: mocks.getUserEventAssignments,
}))

describe('GET /api/auth/me password lifecycle contract', () => {
    beforeEach(() => {
        mocks.cookieValue = 'session-token'
        mocks.validateSession.mockReset().mockResolvedValue({
            id: 'user-1',
            email: 'alex@example.com',
            name: 'Alex',
            role: 'manager',
            isActive: true,
            mustChangePassword: true,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            lastLoginAt: null,
        })
        mocks.getUserEventAssignments.mockClear()
    })

    it('serializes mustChangePassword for a real DB user', async () => {
        const { GET } = await import('@/app/api/auth/me/route')
        const response = await GET()
        expect(response.status).toBe(200)
        expect((await response.json()).user.mustChangePassword).toBe(true)
    })

    it('serializes false for the synthetic environment admin', async () => {
        mocks.validateSession.mockResolvedValue({
            id: 'super_admin_env',
            email: 'admin@example.com',
            name: 'Super Admin',
            role: 'super_admin',
            isActive: true,
            mustChangePassword: false,
            createdAt: new Date(),
            lastLoginAt: new Date(),
        })

        const { GET } = await import('@/app/api/auth/me/route')
        const response = await GET()
        expect((await response.json()).user.mustChangePassword).toBe(false)
    })
})
