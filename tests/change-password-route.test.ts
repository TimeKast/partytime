import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    validateSession: vi.fn(),
    hashPassword: vi.fn(async () => 'hashed-new'),
    verifyPassword: vi.fn(),
    changePasswordKeepingSession: vi.fn(),
    cookieSet: vi.fn(),
    cookieValue: undefined as string | undefined,
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (_name: string) => (mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
        set: mocks.cookieSet,
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
    hashPassword: mocks.hashPassword,
    verifyPassword: mocks.verifyPassword,
    SESSION_COOKIE_NAME: 'rp_session',
    getSessionCookieOptions: vi.fn(() => ({ path: '/', httpOnly: true })),
}))

vi.mock('@/lib/user-queries', () => ({
    changePasswordKeepingSession: mocks.changePasswordKeepingSession,
}))

const regularUser = {
    id: 'user-1',
    email: 'alex@example.com',
    passwordHash: 'stored-hash',
    name: 'Alex Gmora',
    role: 'manager',
    isActive: true,
}

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3000',
            host: 'localhost:3000',
            ...headers,
        },
        body: JSON.stringify(body),
    })
}

async function callRoute(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/auth/change-password/route')
    return POST(buildRequest(body, headers))
}

describe('POST /api/auth/change-password', () => {
    beforeEach(() => {
        mocks.validateSession.mockReset()
        mocks.hashPassword.mockClear()
        mocks.verifyPassword.mockReset()
        mocks.changePasswordKeepingSession.mockReset()
        mocks.cookieSet.mockReset()
        mocks.cookieValue = 'session-token'
        mocks.validateSession.mockResolvedValue(regularUser)
        mocks.verifyPassword.mockResolvedValue(true)
        mocks.changePasswordKeepingSession.mockResolvedValue({
            token: 'replacement-session-token',
            expiresAt: new Date('2027-01-01T00:00:00Z'),
        })
    })

    it('fails closed on a cross-origin request (403), before touching the session', async () => {
        const res = await callRoute(
            { currentPassword: 'a', newPassword: 'b', confirmPassword: 'b' },
            { origin: 'https://evil.example.com' },
        )
        expect(res.status).toBe(403)
        expect(mocks.validateSession).not.toHaveBeenCalled()
    })

    it('returns 401 when there is no session cookie', async () => {
        mocks.cookieValue = undefined
        const res = await callRoute({ currentPassword: 'a', newPassword: 'b', confirmPassword: 'b' })
        expect(res.status).toBe(401)
    })

    it('returns 401 when the session is invalid/expired', async () => {
        mocks.validateSession.mockResolvedValue(null)
        const res = await callRoute({ currentPassword: 'a', newPassword: 'b', confirmPassword: 'b' })
        expect(res.status).toBe(401)
    })

    it('refuses the synthetic env-based super admin (403, SI8)', async () => {
        mocks.validateSession.mockResolvedValue({ ...regularUser, id: 'super_admin_env' })
        const res = await callRoute({ currentPassword: 'a', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' })
        expect(res.status).toBe(403)
        const data = await res.json()
        expect(data.error).toMatch(/entorno/)
    })

    it('returns 400 when required fields are missing', async () => {
        const res = await callRoute({ currentPassword: 'a' })
        expect(res.status).toBe(400)
    })

    it('returns 400 when new and confirm passwords do not match', async () => {
        const res = await callRoute({ currentPassword: 'a', newPassword: 'Correct-Horse9', confirmPassword: 'Different-Horse9' })
        expect(res.status).toBe(400)
    })

    it('returns 400 with policyErrors when the new password fails the server policy', async () => {
        const res = await callRoute({ currentPassword: 'a', newPassword: 'short', confirmPassword: 'short' })
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.policyErrors.length).toBeGreaterThan(0)
    })

    it('returns 400 when the current password is wrong', async () => {
        mocks.verifyPassword.mockResolvedValue(false)
        const res = await callRoute({ currentPassword: 'wrong', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' })
        expect(res.status).toBe(400)
    })

    it('returns 400 when the new password equals the current password', async () => {
        const res = await callRoute({ currentPassword: 'Correct-Horse9', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' })
        expect(res.status).toBe(400)
    })

    it('on success: hashes, atomically updates keeping the current session, and returns 200', async () => {
        const res = await callRoute({ currentPassword: 'old-pass', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.success).toBe(true)
        expect(mocks.changePasswordKeepingSession).toHaveBeenCalledWith(
            'user-1',
            'stored-hash',
            'hashed-new',
            'session-token',
        )
        expect(mocks.cookieSet).toHaveBeenCalledWith(
            'rp_session', 'replacement-session-token', expect.any(Object),
        )
    })

    it('returns 400 when the atomic compare-and-swap reports stale auth state', async () => {
        mocks.changePasswordKeepingSession.mockResolvedValue(null)
        const res = await callRoute({ currentPassword: 'old-pass', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' })
        expect(res.status).toBe(400)
    })

    it('fails closed when Origin and Referer are both missing', async () => {
        const request = buildRequest(
            { currentPassword: 'old-pass', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' },
        )
        request.headers.delete('origin')
        const { POST } = await import('@/app/api/auth/change-password/route')
        const res = await POST(request)
        expect(res.status).toBe(403)
        expect(mocks.validateSession).not.toHaveBeenCalled()
    })

    it('never logs a bound session token when the query layer throws', async () => {
        mocks.changePasswordKeepingSession.mockRejectedValue(
            new Error('Query failed params: session-token'),
        )
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await callRoute({
            currentPassword: 'old-pass',
            newPassword: 'Correct-Horse9',
            confirmPassword: 'Correct-Horse9',
        })

        expect(res.status).toBe(500)
        expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('session-token')
        errorSpy.mockRestore()
    })
})
