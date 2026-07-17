import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    getUserByEmail: vi.fn(),
    generateResetToken: vi.fn(() => ({ raw: 'raw-token-abc', hash: 'hash-token-abc' })),
    issueResetTokenIfAllowed: vi.fn<(input: {
        userId: string
        tokenHash: string
        expiresAt: Date
        requestIp?: string
        since: Date
        maxRecentTokens: number
    }) => Promise<boolean>>(async () => true),
    send: vi.fn<(input: {
        to: string
        from: string
        subject: string
        html: string
        text: string
    }) => Promise<{ data: { id: string } }>>(async () => ({ data: { id: 'email-1' } })),
    bcryptCompare: vi.fn(async () => false),
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
    backgroundTasks: [] as Promise<unknown>[],
}))

vi.mock('@vercel/functions', () => ({
    waitUntil: (promise: Promise<unknown>) => {
        mocks.backgroundTasks.push(promise)
        mocks.waitUntil(promise)
    },
}))

vi.mock('bcryptjs', () => ({
    default: {
        hashSync: vi.fn(() => 'dummy-hash'),
        compare: mocks.bcryptCompare,
    },
}))

vi.mock('@/lib/user-queries', () => ({ getUserByEmail: mocks.getUserByEmail }))
vi.mock('@/lib/password-utils', () => ({ generateResetToken: mocks.generateResetToken }))
vi.mock('@/lib/password-reset-queries', () => ({
    issueResetTokenIfAllowed: mocks.issueResetTokenIfAllowed,
}))
vi.mock('@/lib/resend', () => ({
    resend: { emails: { send: mocks.send } },
    FROM_EMAIL: 'noreply@resend.dev',
}))

const activeUser = { id: 'user-1', email: 'alex@example.com', name: 'Alex Gmora', isActive: true }
let requestSequence = 0

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            host: 'localhost:3000',
            'x-forwarded-for': `192.0.2.${++requestSequence}`,
            ...headers,
        },
        body: JSON.stringify(body),
    })
}

async function callRoute(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/auth/forgot-password/route')
    const response = POST(buildRequest(body, headers))
    await vi.advanceTimersByTimeAsync(1200)
    return response
}

describe('POST /api/auth/forgot-password', () => {
    const originalAdminEmail = process.env.ADMIN_EMAIL
    const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

    beforeEach(() => {
        vi.useFakeTimers()
        mocks.getUserByEmail.mockReset()
        mocks.generateResetToken.mockClear()
        mocks.issueResetTokenIfAllowed.mockReset().mockResolvedValue(true)
        mocks.send.mockReset().mockResolvedValue({ data: { id: 'email-1' } })
        mocks.bcryptCompare.mockClear()
        mocks.waitUntil.mockReset()
        mocks.backgroundTasks.length = 0
        process.env.ADMIN_EMAIL = 'admin@example.com'
        process.env.NEXT_PUBLIC_APP_URL = 'https://partytime.example.com'
    })

    afterEach(async () => {
        await vi.runAllTimersAsync()
        await Promise.all(mocks.backgroundTasks)
        vi.useRealTimers()
        process.env.ADMIN_EMAIL = originalAdminEmail
        process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    })

    it('returns 400 when email is missing', async () => {
        const res = await callRoute({})
        expect(res.status).toBe(400)
    })

    it('rejects an oversized JSON body before bcrypt, user lookup, or DB work', async () => {
        const res = await callRoute({
            email: activeUser.email,
            padding: 'x'.repeat(5000),
        })

        expect(res.status).toBe(413)
        expect(mocks.bcryptCompare).not.toHaveBeenCalled()
        expect(mocks.getUserByEmail).not.toHaveBeenCalled()
        expect(mocks.issueResetTokenIfAllowed).not.toHaveBeenCalled()
        expect(mocks.generateResetToken).not.toHaveBeenCalled()
    })

    it('rejects an oversized declared content length before expensive work', async () => {
        const res = await callRoute(
            { email: activeUser.email },
            { 'content-length': '5000' },
        )

        expect(res.status).toBe(413)
        expect(mocks.bcryptCompare).not.toHaveBeenCalled()
        expect(mocks.getUserByEmail).not.toHaveBeenCalled()
        expect(mocks.issueResetTokenIfAllowed).not.toHaveBeenCalled()
    })

    it('silently no-ops an explicit cross-origin request but still returns the generic 200', async () => {
        const res = await callRoute({ email: 'alex@example.com' }, { origin: 'https://evil.example.com' })
        expect(res.status).toBe(200)
        expect(mocks.getUserByEmail).not.toHaveBeenCalled()
    })

    it('returns the generic response for an unknown email, without sending anything', async () => {
        mocks.getUserByEmail.mockResolvedValue(null)
        const res = await callRoute({ email: 'nobody@example.com' })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.success).toBe(true)
        expect(mocks.send).not.toHaveBeenCalled()
        expect(mocks.issueResetTokenIfAllowed).toHaveBeenCalledWith(expect.objectContaining({
            userId: '__password_reset_decoy__',
        }))
    })

    it('returns the identical generic response for the env-based super admin email after comparable work', async () => {
        mocks.getUserByEmail.mockResolvedValue(null)
        const res = await callRoute({ email: 'admin@example.com' })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.message).toBe('Si el correo existe en nuestro sistema, se enviará un enlace para restablecer tu contraseña.')
        expect(mocks.getUserByEmail).toHaveBeenCalledWith('admin@example.com')
        expect(mocks.bcryptCompare).toHaveBeenCalledTimes(1)
        expect(mocks.send).not.toHaveBeenCalled()
    })

    it('returns the generic response for an inactive user, without sending anything', async () => {
        mocks.getUserByEmail.mockResolvedValue({ ...activeUser, isActive: false })
        const res = await callRoute({ email: activeUser.email })
        expect(res.status).toBe(200)
        expect(mocks.send).not.toHaveBeenCalled()
    })

    it('matches the exact generic response text across unknown/env-admin/inactive branches (anti-enumeration parity)', async () => {
        mocks.getUserByEmail.mockResolvedValue(null)
        const unknown = await (await callRoute({ email: 'nobody@example.com' })).json()

        mocks.getUserByEmail.mockResolvedValue({ ...activeUser, isActive: false })
        const inactive = await (await callRoute({ email: activeUser.email })).json()

        const envAdmin = await (await callRoute({ email: 'admin@example.com' })).json()

        expect(unknown).toEqual(inactive)
        expect(inactive).toEqual(envAdmin)
    })

    it('performs the same dummy bcrypt work for unknown, inactive, env-admin, and active accounts', async () => {
        mocks.getUserByEmail.mockResolvedValue(null)
        await callRoute({ email: 'unknown@example.com' })

        mocks.getUserByEmail.mockResolvedValue({ ...activeUser, isActive: false })
        await callRoute({ email: 'inactive@example.com' })

        mocks.getUserByEmail.mockResolvedValue(null)
        await callRoute({ email: 'admin@example.com' })

        mocks.getUserByEmail.mockResolvedValue(activeUser)
        await callRoute({ email: activeUser.email })

        expect(mocks.bcryptCompare).toHaveBeenCalledTimes(4)
    })

    it('for a known active user: issues a hashed token with ~30min expiry and emails the raw token link', async () => {
        mocks.getUserByEmail.mockResolvedValue(activeUser)
        const before = Date.now()

        const res = await callRoute({ email: activeUser.email })

        expect(res.status).toBe(200)
        expect(mocks.issueResetTokenIfAllowed).toHaveBeenCalledTimes(1)
        const [createArgs] = mocks.issueResetTokenIfAllowed.mock.calls[0]
        expect(createArgs.userId).toBe('user-1')
        expect(createArgs.tokenHash).toBe('hash-token-abc')
        const ttlMs = createArgs.expiresAt.getTime() - before
        expect(ttlMs).toBeGreaterThan(29 * 60 * 1000)
        expect(ttlMs).toBeLessThan(31 * 60 * 1000)

        expect(mocks.send).toHaveBeenCalledTimes(1)
        const [sendArgs] = mocks.send.mock.calls[0]
        expect(sendArgs.to).toBe('alex@example.com')
        expect(sendArgs.from).toBe('Party Time! <noreply@resend.dev>')
        expect(sendArgs.html).toContain('raw-token-abc')
        expect(sendArgs.text).toContain('raw-token-abc')
        expect(sendArgs.html).toContain('https://partytime.example.com/reset-password?token=raw-token-abc')
    })

    it('never logs or returns the raw token in the HTTP response body', async () => {
        mocks.getUserByEmail.mockResolvedValue(activeUser)
        const res = await callRoute({ email: activeUser.email })
        const data = await res.json()
        expect(JSON.stringify(data)).not.toContain('raw-token-abc')
    })

    it('skips issuing a new token when the per-user throttle is exceeded (A8), still returning generic 200', async () => {
        mocks.getUserByEmail.mockResolvedValue(activeUser)
        mocks.issueResetTokenIfAllowed.mockResolvedValue(false)

        const res = await callRoute({ email: activeUser.email })

        expect(res.status).toBe(200)
        expect(mocks.issueResetTokenIfAllowed).toHaveBeenCalledTimes(1)
        expect(mocks.send).not.toHaveBeenCalled()
    })

    it('best-effort rate limits repeated requests for the same IP/email without changing the response', async () => {
        mocks.getUserByEmail.mockResolvedValue(activeUser)
        const headers = { 'x-forwarded-for': '198.51.100.24' }

        const responses: Array<Record<string, unknown>> = []
        for (let index = 0; index < 5; index++) {
            responses.push(await (await callRoute({ email: activeUser.email }, headers)).json())
        }

        expect(mocks.getUserByEmail).toHaveBeenCalledTimes(5)
        expect(mocks.bcryptCompare).toHaveBeenCalledTimes(5)
        expect(mocks.issueResetTokenIfAllowed).toHaveBeenCalledTimes(5)
        expect(mocks.send).toHaveBeenCalledTimes(5)

        mocks.getUserByEmail.mockClear()
        mocks.bcryptCompare.mockClear()
        mocks.issueResetTokenIfAllowed.mockClear()
        mocks.send.mockClear()
        responses.push(await (await callRoute({ email: activeUser.email }, headers)).json())

        expect(responses.every(response => response.message === responses[0].message)).toBe(true)
        expect(mocks.getUserByEmail).not.toHaveBeenCalled()
        expect(mocks.bcryptCompare).not.toHaveBeenCalled()
        expect(mocks.issueResetTokenIfAllowed).not.toHaveBeenCalled()
        expect(mocks.send).not.toHaveBeenCalled()
    })

    it('pads missing, inactive, env-admin, and active responses to the same minimum envelope', async () => {
        mocks.send.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 2500))
            return { data: { id: 'email-1' } }
        })

        const elapsed: number[] = []
        const cases = [
            { email: 'missing@example.com', user: null },
            { email: 'inactive@example.com', user: { ...activeUser, email: 'inactive@example.com', isActive: false } },
            { email: 'admin@example.com', user: null },
            { email: activeUser.email, user: activeUser },
        ]

        for (const testCase of cases) {
            mocks.getUserByEmail.mockResolvedValueOnce(testCase.user)
            const startedAt = Date.now()
            await callRoute({ email: testCase.email })
            elapsed.push(Date.now() - startedAt)
        }

        expect(elapsed).toEqual([1200, 1200, 1200, 1200])
        expect(mocks.waitUntil).toHaveBeenCalledTimes(1)
    })

    it('still returns the generic 200 when the email provider throws', async () => {
        mocks.getUserByEmail.mockResolvedValue(activeUser)
        mocks.send.mockRejectedValue(new Error('resend down'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await callRoute({ email: activeUser.email })

        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.success).toBe(true)
        errorSpy.mockRestore()
    })
})
