import { describe, it, expect, vi, beforeEach } from 'vitest'

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
    db: { execute: executeMock },
    users: {},
    userEventAssignments: {},
    events: {},
}))

import { changePasswordKeepingSession, adminResetPassword } from '@/lib/user-queries'

describe('changePasswordKeepingSession (self-change, A1)', () => {
    beforeEach(() => executeMock.mockReset())

    it('issues a single statement combining the password update and except-token session revocation', async () => {
        executeMock.mockResolvedValue({
            rows: [{ token: 'replacement-token', expires_at: new Date('2027-01-01T00:00:00Z') }],
        })

        const ok = await changePasswordKeepingSession('user-1', 'old-hash', 'new-hash', 'keep-token')

        expect(ok).toEqual({
            token: 'replacement-token',
            expiresAt: new Date('2027-01-01T00:00:00Z'),
        })
        expect(executeMock).toHaveBeenCalledTimes(1)
        const query = executeMock.mock.calls[0][0]
        const sqlText = query.queryChunks.map((chunk: unknown) =>
            typeof chunk === 'string' ? chunk : JSON.stringify(chunk)
        ).join('')
        expect(sqlText).toContain('WITH updated_user AS')
        expect(sqlText).toContain('must_change_password = false')
        expect(sqlText).toContain('deleted_sessions AS')
        expect(sqlText).toContain('DELETE FROM user_sessions')
        expect(sqlText).toContain('replacement_session AS')
        expect(sqlText).toContain('INSERT INTO user_sessions')
        expect(sqlText).not.toContain('UPDATE user_sessions')
        expect(sqlText).toContain('password_hash =')
        expect(sqlText).toContain('current_session.token =')
        expect(sqlText).toContain('current_session.expires_at > now()')
        expect(sqlText).toContain('invalidated_reset_tokens AS')
        expect(sqlText).toContain('UPDATE password_reset_tokens')
        expect(sqlText).toContain('consumed_at IS NULL')
    })

    it('returns false when no matching user row was updated (RETURNING is empty)', async () => {
        executeMock.mockResolvedValue({ rows: [] })
        const ok = await changePasswordKeepingSession('missing-user', 'old-hash', 'new-hash', 'keep-token')
        expect(ok).toBeNull()
    })
})

describe('adminResetPassword (admin/forgot reset, A2)', () => {
    beforeEach(() => executeMock.mockReset())

    it('issues a single statement combining the password update, force-flag and full session revocation', async () => {
        executeMock.mockResolvedValue({ rows: [{ id: 'user-1' }] })

        const ok = await adminResetPassword('user-1', 'observed-hash', 'temp-hash')

        expect(ok).toBe(true)
        expect(executeMock).toHaveBeenCalledTimes(1)
        const query = executeMock.mock.calls[0][0]
        const sqlText = query.queryChunks.map((chunk: unknown) =>
            typeof chunk === 'string' ? chunk : JSON.stringify(chunk)
        ).join('')
        expect(sqlText).toContain('must_change_password = true')
        expect(sqlText).toContain('is_active = true')
        expect(sqlText).toContain('target.password_hash =')
        expect(sqlText).toContain('DELETE FROM user_sessions')
        expect(sqlText).not.toContain('token <>')
        expect(sqlText).toContain('invalidated_reset_tokens AS')
        expect(sqlText).toContain('UPDATE password_reset_tokens')
        expect(sqlText).toContain('consumed_at IS NULL')
    })

    it('returns false when the target user does not exist', async () => {
        executeMock.mockResolvedValue({ rows: [] })
        const ok = await adminResetPassword('missing-user', 'observed-hash', 'temp-hash')
        expect(ok).toBe(false)
    })

    it('allows only one winner for two resets using the same observed hash', async () => {
        let won = false
        executeMock.mockImplementation(async () => {
            if (won) return { rows: [] }
            won = true
            return { rows: [{ id: 'user-1' }] }
        })

        const results = await Promise.all([
            adminResetPassword('user-1', 'same-observed-hash', 'temp-hash-a'),
            adminResetPassword('user-1', 'same-observed-hash', 'temp-hash-b'),
        ])

        expect(results.filter(Boolean)).toHaveLength(1)
        expect(executeMock).toHaveBeenCalledTimes(2)
    })
})
