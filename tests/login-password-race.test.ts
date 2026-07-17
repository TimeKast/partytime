import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    getUserByEmail: vi.fn(),
    verifyPassword: vi.fn(),
    createSession: vi.fn(),
    createSessionIfPasswordUnchanged: vi.fn(),
    cookieSet: vi.fn(),
    bcryptCompare: vi.fn(),
}))

vi.mock('bcryptjs', () => ({
    default: {
        hashSync: vi.fn(() => 'dummy-hash'),
        compare: mocks.bcryptCompare,
    },
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ set: mocks.cookieSet })),
}))

vi.mock('@/lib/auth-utils', () => ({
    verifyPassword: mocks.verifyPassword,
    createSession: mocks.createSession,
    createSessionIfPasswordUnchanged: mocks.createSessionIfPasswordUnchanged,
    SESSION_COOKIE_NAME: 'rp_session',
    getSessionCookieOptions: vi.fn(() => ({ path: '/', httpOnly: true })),
}))

vi.mock('@/lib/user-queries', () => ({ getUserByEmail: mocks.getUserByEmail }))

const dbUser = {
    id: 'user-1',
    email: 'alex@example.com',
    passwordHash: 'exact-observed-hash',
    name: 'Alex',
    role: 'manager',
    isActive: true,
}

function request() {
    return new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '192.0.2.44',
        },
        body: JSON.stringify({ email: dbUser.email, password: 'old-password' }),
    })
}

describe('POST /api/auth/login password-reset race (H1)', () => {
    beforeEach(() => {
        mocks.getUserByEmail.mockReset().mockResolvedValue(dbUser)
        mocks.verifyPassword.mockReset().mockResolvedValue(true)
        mocks.createSession.mockReset()
        mocks.createSessionIfPasswordUnchanged.mockReset().mockResolvedValue({
            token: 'bound-session-token',
            expiresAt: new Date('2027-01-01T00:00:00Z'),
        })
        mocks.cookieSet.mockReset()
        mocks.bcryptCompare.mockReset()
    })

    it('passes the exact verified hash to conditional creation before setting a cookie', async () => {
        const { POST } = await import('@/app/api/auth/login/route')
        const response = await POST(request())

        expect(response.status).toBe(200)
        expect(mocks.createSessionIfPasswordUnchanged).toHaveBeenCalledWith(
            'user-1', 'exact-observed-hash', false, undefined, '192.0.2.44',
        )
        expect(mocks.cookieSet).toHaveBeenCalledWith(
            'rp_session', 'bound-session-token', expect.any(Object),
        )
    })

    it('returns generic 401 and never sets a cookie when reset wins first', async () => {
        mocks.createSessionIfPasswordUnchanged.mockResolvedValue(null)
        const { POST } = await import('@/app/api/auth/login/route')
        const response = await POST(request())

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            error: 'Credenciales inválidas',
        })
        expect(mocks.cookieSet).not.toHaveBeenCalled()
        expect(mocks.createSession).not.toHaveBeenCalled()
    })
})
