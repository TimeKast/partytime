import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    validateSession: vi.fn(),
    hashPassword: vi.fn(async () => 'hashed-temp'),
    getUserById: vi.fn(),
    adminResetPassword: vi.fn(),
    cookieValue: undefined as string | undefined,
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (_name: string) => (mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
    hashPassword: mocks.hashPassword,
    SESSION_COOKIE_NAME: 'rp_session',
}))

vi.mock('@/lib/user-queries', () => ({
    getUserById: mocks.getUserById,
    adminResetPassword: mocks.adminResetPassword,
}))

const superAdmin = { id: 'admin-1', email: 'admin@example.com', role: 'super_admin', name: 'Admin', isActive: true }
const targetUser = {
    id: 'user-2', email: 'target@example.com', passwordHash: 'observed-target-hash',
    role: 'viewer', name: 'Target', isActive: true,
}

function buildRequest(headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/admin/users/user-2/reset-password', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', host: 'localhost:3000', ...headers },
    })
}

async function callRoute(id: string, headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/admin/users/[id]/reset-password/route')
    return POST(buildRequest(headers), { params: Promise.resolve({ id }) })
}

describe('POST /api/admin/users/[id]/reset-password', () => {
    beforeEach(() => {
        mocks.validateSession.mockReset()
        mocks.hashPassword.mockClear()
        mocks.getUserById.mockReset()
        mocks.adminResetPassword.mockReset()
        mocks.cookieValue = 'admin-session-token'
        mocks.validateSession.mockResolvedValue(superAdmin)
        mocks.getUserById.mockResolvedValue(targetUser)
        mocks.adminResetPassword.mockResolvedValue(true)
    })

    it('fails closed on cross-origin request (403)', async () => {
        const res = await callRoute('user-2', { origin: 'https://evil.example.com' })
        expect(res.status).toBe(403)
        expect(mocks.validateSession).not.toHaveBeenCalled()
    })

    it('fails closed when Origin and Referer are both missing', async () => {
        const request = buildRequest()
        request.headers.delete('origin')
        const { POST } = await import('@/app/api/admin/users/[id]/reset-password/route')
        const res = await POST(request, { params: Promise.resolve({ id: 'user-2' }) })
        expect(res.status).toBe(403)
        expect(mocks.validateSession).not.toHaveBeenCalled()
    })

    it('returns 401 without a session', async () => {
        mocks.cookieValue = undefined
        const res = await callRoute('user-2')
        expect(res.status).toBe(401)
    })

    it('returns 403 for a non-super_admin caller', async () => {
        mocks.validateSession.mockResolvedValue({ ...targetUser, role: 'manager' })
        const res = await callRoute('user-2')
        expect(res.status).toBe(403)
    })

    it('returns 404 for an unknown user id', async () => {
        mocks.getUserById.mockResolvedValue(null)
        const res = await callRoute('does-not-exist')
        expect(res.status).toBe(404)
    })

    it('returns 404 for an inactive DB user without generating a temporary password', async () => {
        mocks.getUserById.mockResolvedValue({ ...targetUser, isActive: false })
        const res = await callRoute('user-2')
        expect(res.status).toBe(404)
        expect(mocks.hashPassword).not.toHaveBeenCalled()
        expect(mocks.adminResetPassword).not.toHaveBeenCalled()
    })

    it('returns 404 for the synthetic env-based super admin id (SI8/A9 — no DB row)', async () => {
        mocks.getUserById.mockResolvedValue(null) // getUserById never returns a row for super_admin_env
        const res = await callRoute('super_admin_env')
        expect(res.status).toBe(404)
        expect(mocks.adminResetPassword).not.toHaveBeenCalled()
    })

    it('resets a real DB super_admin target (A9 — allowed)', async () => {
        mocks.getUserById.mockResolvedValue({ ...targetUser, id: 'other-admin', role: 'super_admin' })
        const res = await callRoute('other-admin')
        expect(res.status).toBe(200)
    })

    it('on success: returns a one-time temporaryPassword and never logs it', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await callRoute('user-2')
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(typeof data.temporaryPassword).toBe('string')
        expect(data.temporaryPassword.length).toBeGreaterThanOrEqual(16)
        expect(mocks.adminResetPassword).toHaveBeenCalledWith(
            'user-2', 'observed-target-hash', 'hashed-temp',
        )

        const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ')
        expect(allLoggedText).not.toContain(data.temporaryPassword)

        logSpy.mockRestore()
        errorSpy.mockRestore()
    })

    it('returns a non-secret 409 when the compare-and-swap loses a password race', async () => {
        mocks.adminResetPassword.mockResolvedValue(false)
        const res = await callRoute('user-2')
        expect(res.status).toBe(409)
        const data = await res.json()
        expect(data.temporaryPassword).toBeUndefined()
        expect(JSON.stringify(data)).not.toContain('hashed-temp')
    })

    it('reveals exactly one usable temporary password across concurrent resets', async () => {
        let won = false
        mocks.adminResetPassword.mockImplementation(async () => {
            if (won) return false
            won = true
            return true
        })

        const responses = await Promise.all([callRoute('user-2'), callRoute('user-2')])
        const bodies = await Promise.all(responses.map(response => response.json()))

        expect(responses.map(response => response.status).sort()).toEqual([200, 409])
        expect(bodies.filter(body => typeof body.temporaryPassword === 'string')).toHaveLength(1)
        const conflict = bodies.find(body => body.success === false)
        expect(conflict.temporaryPassword).toBeUndefined()
        expect(mocks.adminResetPassword).toHaveBeenCalledTimes(2)
        expect(mocks.adminResetPassword).toHaveBeenNthCalledWith(
            1, 'user-2', 'observed-target-hash', 'hashed-temp',
        )
        expect(mocks.adminResetPassword).toHaveBeenNthCalledWith(
            2, 'user-2', 'observed-target-hash', 'hashed-temp',
        )
    })
})
