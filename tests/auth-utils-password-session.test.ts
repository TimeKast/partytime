import { beforeEach, describe, expect, it, vi } from 'vitest'

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
    db: { execute: executeMock },
    users: {},
    userSessions: {},
}))

import {
    createSessionIfPasswordUnchanged,
    generatePasswordBoundSessionToken,
    isSessionTokenValidForPassword,
} from '@/lib/auth-utils'

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

describe('password-bound conditional session creation (H1)', () => {
    beforeEach(() => executeMock.mockReset())

    it('uses one exact-hash locking statement to conditionally insert the session', async () => {
        executeMock.mockResolvedValue({ rows: [{ token: 'inserted' }] })
        const session = await createSessionIfPasswordUnchanged(
            'user-1', 'observed-bcrypt-hash', true, 'test-agent', '192.0.2.10',
        )

        expect(session).not.toBeNull()
        expect(executeMock).toHaveBeenCalledTimes(1)
        const sqlText = sqlTextOf(executeMock.mock.calls[0][0])
        expect(sqlText).toContain('eligible_user AS MATERIALIZED')
        expect(sqlText).toContain('target.password_hash =')
        expect(sqlText).toContain('target.is_active = true')
        expect(sqlText).toContain('FOR UPDATE OF target')
        expect(sqlText).toContain('INSERT INTO user_sessions')
        expect(sqlText).toContain('FROM eligible_user')
    })

    it('returns null when reset won first and the observed hash no longer matches', async () => {
        executeMock.mockResolvedValue({ rows: [] })
        await expect(createSessionIfPasswordUnchanged(
            'user-1', 'stale-hash', false,
        )).resolves.toBeNull()
    })

    it('invalidates a login-first session after reset even if reset misses its row', async () => {
        executeMock.mockResolvedValue({ rows: [{ token: 'inserted' }] })
        const session = await createSessionIfPasswordUnchanged(
            'user-1', 'hash-before-reset', false,
        )

        expect(session).not.toBeNull()
        expect(isSessionTokenValidForPassword(session!.token, 'hash-before-reset')).toBe(true)
        // Models reset committing after login's INSERT while the reset's older
        // statement snapshot cannot physically see/delete that new row.
        expect(isSessionTokenValidForPassword(session!.token, 'hash-after-reset')).toBe(false)
    })
})

describe('password-bound session token parsing', () => {
    it('accepts only the exact current hash', () => {
        const token = generatePasswordBoundSessionToken('current-hash')
        expect(isSessionTokenValidForPassword(token, 'current-hash')).toBe(true)
        expect(isSessionTokenValidForPassword(token, 'changed-hash')).toBe(false)
    })

    it('fails closed for malformed bound tokens while preserving legacy tokens', () => {
        expect(isSessionTokenValidForPassword('legacy-opaque-token', 'any-hash')).toBe(true)
        expect(isSessionTokenValidForPassword('bad.bound.token', 'any-hash')).toBe(false)
        expect(isSessionTokenValidForPassword('not-hex.also-not-hex', 'any-hash')).toBe(false)
    })
})
