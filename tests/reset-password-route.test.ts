import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    hashPassword: vi.fn(async () => 'hashed-new'),
    consumeResetToken: vi.fn(),
    getResetTokenUserContext: vi.fn(),
}))

vi.mock('@/lib/auth-utils', () => ({ hashPassword: mocks.hashPassword }))
vi.mock('@/lib/password-reset-queries', () => ({
    consumeResetToken: mocks.consumeResetToken,
    getResetTokenUserContext: mocks.getResetTokenUserContext,
}))

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost:3000', ...headers },
        body: JSON.stringify(body),
    })
}

async function callRoute(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/auth/reset-password/route')
    return POST(buildRequest(body, headers))
}

describe('POST /api/auth/reset-password', () => {
    beforeEach(() => {
        mocks.hashPassword.mockClear()
        mocks.consumeResetToken.mockReset()
        mocks.consumeResetToken.mockResolvedValue({ userId: 'user-1' })
        mocks.getResetTokenUserContext.mockReset().mockResolvedValue({
            userId: 'user-1',
            email: 'alex@example.com',
            name: 'Alex Gmora',
        })
    })

    it('returns 400 (generic) on an explicit cross-origin request without consuming anything', async () => {
        const res = await callRoute(
            { token: 'raw-token', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' },
            { origin: 'https://evil.example.com' },
        )
        expect(res.status).toBe(400)
        expect(mocks.consumeResetToken).not.toHaveBeenCalled()
    })

    it('returns 400 when required fields are missing', async () => {
        const res = await callRoute({ token: 'raw-token' })
        expect(res.status).toBe(400)
    })

    it('returns 400 when new and confirm passwords do not match', async () => {
        const res = await callRoute({ token: 'raw-token', newPassword: 'Correct-Horse9', confirmPassword: 'Different-Horse9' })
        expect(res.status).toBe(400)
    })

    it('returns 400 with policyErrors when the new password fails the server policy', async () => {
        const res = await callRoute({ token: 'raw-token', newPassword: 'short', confirmPassword: 'short' })
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.policyErrors.length).toBeGreaterThan(0)
        expect(mocks.consumeResetToken).not.toHaveBeenCalled()
    })

    it('hashes the raw token (never sends the raw value to the query layer) and consumes it', async () => {
        await callRoute({ token: 'raw-token-value', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' })
        const [tokenHashArg, newHashArg] = mocks.consumeResetToken.mock.calls[0]
        expect(tokenHashArg).not.toBe('raw-token-value')
        expect(tokenHashArg).toMatch(/^[0-9a-f]{64}$/)
        expect(newHashArg).toBe('hashed-new')
    })

    it('applies identity-aware password policy before consuming the token', async () => {
        const res = await callRoute({
            token: 'raw-token',
            newPassword: 'AlexGmora-Password9!',
            confirmPassword: 'AlexGmora-Password9!',
        })

        expect(res.status).toBe(400)
        expect((await res.json()).policyErrors).toContain('contains_identity')
        expect(mocks.consumeResetToken).not.toHaveBeenCalled()
    })

    it('returns the same generic error for unknown, expired, and already-consumed tokens', async () => {
        mocks.getResetTokenUserContext.mockResolvedValue(null)
        const res = await callRoute({ token: 'bad-token', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' })
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.error).toBe('El enlace es inválido o expiró.')
    })

    it('on success: returns 200 with no auto-login side channel (no user/session in response)', async () => {
        const res = await callRoute({ token: 'raw-token', newPassword: 'Correct-Horse9', confirmPassword: 'Correct-Horse9' })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.success).toBe(true)
        expect(data.user).toBeUndefined()
        expect(data.token).toBeUndefined()
        expect(res.headers.get('set-cookie')).toBeNull()
    })
})
