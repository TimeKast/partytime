import { describe, it, expect, vi, beforeEach } from 'vitest'

const { executeMock, insertMock, selectMock, hashPasswordMock } = vi.hoisted(() => ({
    executeMock: vi.fn(),
    insertMock: vi.fn(),
    selectMock: vi.fn(),
    hashPasswordMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
    db: { execute: executeMock, insert: insertMock, select: selectMock },
    users: { id: 'id', email: 'email' },
    userEventAssignments: {},
    events: {},
}))

vi.mock('@/lib/auth-utils', () => ({
    generatePasswordBoundSessionToken: vi.fn(() => 'replacement-token'),
    hashPassword: hashPasswordMock,
}))

import * as userQueries from '@/lib/user-queries'
import {
    UserPasswordPolicyError,
    createUser,
    changePasswordKeepingSession,
    adminResetPassword,
} from '@/lib/user-queries'

describe('createUser password policy boundary', () => {
    beforeEach(() => {
        insertMock.mockReset()
        selectMock.mockReset()
        hashPasswordMock.mockReset()
    })

    it('rejects an invalid password with a structured error before hashing or inserting', async () => {
        await expect(createUser({
            email: 'alex@example.com',
            name: 'Alex Gmora',
            password: 'alex1234',
        })).rejects.toEqual(expect.objectContaining({
            name: 'UserPasswordPolicyError',
            code: 'PASSWORD_POLICY_VIOLATION',
            policyErrors: expect.arrayContaining(['missing_uppercase', 'contains_identity']),
        }))

        expect(hashPasswordMock).not.toHaveBeenCalled()
        expect(insertMock).not.toHaveBeenCalled()
    })

    it('accepts a compliant 8-character password without a symbol', async () => {
        const createdUser = {
            id: 'user-1',
            email: 'new.user@example.com',
            name: 'New User',
            role: 'viewer',
        }
        const limitMock = vi.fn(async () => [])
        selectMock.mockReturnValue({
            from: vi.fn(() => ({
                where: vi.fn(() => ({ limit: limitMock })),
            })),
        })
        const returningMock = vi.fn(async () => [createdUser])
        const valuesMock = vi.fn(() => ({ returning: returningMock }))
        insertMock.mockReturnValue({ values: valuesMock })
        hashPasswordMock.mockResolvedValue('hashed-valid-password')

        await expect(createUser({
            email: 'new.user@example.com',
            name: 'New User',
            password: 'Valid123',
        })).resolves.toBe(createdUser)

        expect(hashPasswordMock).toHaveBeenCalledWith('Valid123')
        expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
            email: 'new.user@example.com',
            name: 'New User',
            passwordHash: 'hashed-valid-password',
        }))
    })

    it('does not export the unused raw-password update bypass', () => {
        expect(userQueries).not.toHaveProperty('updateUserPassword')
        expect(UserPasswordPolicyError).toBeTypeOf('function')
    })
})

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
