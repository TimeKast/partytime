import { describe, it, expect, vi, beforeEach } from 'vitest'

const { executeMock, insertMock, selectMock, deleteMock } = vi.hoisted(() => ({
    executeMock: vi.fn(),
    insertMock: vi.fn(),
    selectMock: vi.fn(),
    deleteMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
    db: {
        execute: executeMock,
        insert: insertMock,
        select: selectMock,
        delete: deleteMock,
    },
    passwordResetTokens: {
        userId: 'userId', tokenHash: 'tokenHash', expiresAt: 'expiresAt',
        consumedAt: 'consumedAt', createdAt: 'createdAt', requestIp: 'requestIp',
    },
    users: { id: 'userId', email: 'email', name: 'name', isActive: 'isActive' },
}))

import {
    createResetToken,
    countRecentUnconsumedTokens,
    issueResetTokenIfAllowed,
    getResetTokenUserContext,
    consumeResetToken,
    cleanupExpiredResetTokens,
} from '@/lib/password-reset-queries'

function sqlTextOf(query: unknown): string {
    // Mirror drizzle's SQL query object shape (queryChunks: (string | object)[])
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

describe('createResetToken', () => {
    it('inserts a row with the provided fields', async () => {
        const valuesMock = vi.fn(async () => undefined)
        insertMock.mockReturnValue({ values: valuesMock })

        await createResetToken({
            userId: 'user-1',
            tokenHash: 'hash-abc',
            expiresAt: new Date('2026-01-01T00:30:00Z'),
            requestIp: '1.2.3.4',
        })

        expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            tokenHash: 'hash-abc',
            requestIp: '1.2.3.4',
        }))
    })
})

describe('countRecentUnconsumedTokens', () => {
    it('returns the count of unconsumed tokens issued since the given time', async () => {
        const whereMock = vi.fn(async () => [{ count: 2 }])
        selectMock.mockReturnValue({ from: vi.fn(() => ({ where: whereMock })) })

        const count = await countRecentUnconsumedTokens('user-1', new Date('2026-01-01T00:00:00Z'))

        expect(count).toBe(2)
    })

    it('returns 0 when there are no matching rows', async () => {
        selectMock.mockReturnValue({ from: vi.fn(() => ({ where: vi.fn(async () => []) })) })
        const count = await countRecentUnconsumedTokens('user-1', new Date())
        expect(count).toBe(0)
    })
})

describe('issueResetTokenIfAllowed', () => {
    beforeEach(() => executeMock.mockReset())

    it('uses one locking statement to enforce the cap and insert', async () => {
        executeMock.mockResolvedValue({ rows: [{ id: 'token-1' }] })

        await expect(issueResetTokenIfAllowed({
            userId: 'user-1',
            tokenHash: 'hash-abc',
            expiresAt: new Date('2026-01-01T00:30:00Z'),
            requestIp: '1.2.3.4',
            since: new Date('2026-01-01T00:00:00Z'),
            maxRecentTokens: 3,
        })).resolves.toBe(true)

        expect(executeMock).toHaveBeenCalledTimes(1)
        const sqlText = sqlTextOf(executeMock.mock.calls[0][0])
        expect(sqlText).toContain('locked_user AS MATERIALIZED')
        expect(sqlText).toContain('FOR UPDATE')
        expect(sqlText).toContain('available_slot AS MATERIALIZED')
        expect(sqlText).toContain('INSERT INTO password_reset_tokens')
        expect(sqlText).toContain('consumed_at IS NULL')
        expect(sqlText).toContain('ON CONFLICT (user_id, issuance_slot)')
        expect(sqlText).toContain('DO NOTHING')
    })

    it('returns false when the account is ineligible or at the issuance cap', async () => {
        executeMock.mockResolvedValue({ rows: [] })
        await expect(issueResetTokenIfAllowed({
            userId: '__password_reset_decoy__',
            tokenHash: 'hash-decoy',
            expiresAt: new Date(),
            since: new Date(),
            maxRecentTokens: 3,
        })).resolves.toBe(false)
    })

    it('allows only the configured number of winners across parallel issuance attempts', async () => {
        let issued = 0
        executeMock.mockImplementation(async () => {
            if (issued >= 3) return { rows: [] }
            issued += 1
            return { rows: [{ id: `token-${issued}` }] }
        })

        const attempts = await Promise.all(Array.from({ length: 6 }, (_, index) =>
            issueResetTokenIfAllowed({
                userId: 'user-1',
                tokenHash: `hash-${index}`,
                expiresAt: new Date('2026-01-01T00:30:00Z'),
                since: new Date('2026-01-01T00:00:00Z'),
                maxRecentTokens: 3,
            }),
        ))

        expect(attempts.filter(Boolean)).toHaveLength(3)
        expect(executeMock).toHaveBeenCalledTimes(6)
    })
})

describe('cleanupExpiredResetTokens', () => {
    it('deletes expired token rows', async () => {
        const whereMock = vi.fn(async () => undefined)
        deleteMock.mockReturnValue({ where: whereMock })

        await cleanupExpiredResetTokens()

        expect(deleteMock).toHaveBeenCalled()
        expect(whereMock).toHaveBeenCalled()
    })
})

describe('getResetTokenUserContext', () => {
    it('returns identity context only through the valid-token/active-user query', async () => {
        const limitMock = vi.fn(async () => [{ userId: 'user-1', email: 'alex@example.com', name: 'Alex' }])
        const whereMock = vi.fn(() => ({ limit: limitMock }))
        const innerJoinMock = vi.fn(() => ({ where: whereMock }))
        selectMock.mockReturnValue({ from: vi.fn(() => ({ innerJoin: innerJoinMock })) })

        await expect(getResetTokenUserContext('hash-abc')).resolves.toEqual({
            userId: 'user-1', email: 'alex@example.com', name: 'Alex',
        })
        expect(innerJoinMock).toHaveBeenCalled()
        expect(whereMock).toHaveBeenCalled()
    })
})

describe('consumeResetToken (forgot-password reset, SI2/A2)', () => {
    beforeEach(() => executeMock.mockReset())

    it('issues one statement that atomically claims the token, updates the password and revokes all sessions', async () => {
        executeMock.mockResolvedValue({ rows: [{ user_id: 'user-1' }] })

        const result = await consumeResetToken('token-hash-abc', 'new-hash')

        expect(result).toEqual({ userId: 'user-1' })
        expect(executeMock).toHaveBeenCalledTimes(1)
        const sqlText = sqlTextOf(executeMock.mock.calls[0][0])
        expect(sqlText).toContain('consumed_at IS NULL')
        expect(sqlText).toContain('expires_at > now()')
        expect(sqlText).toContain('RETURNING')
        expect(sqlText).toContain('must_change_password = false')
        expect(sqlText).toContain('DELETE FROM user_sessions')
        expect(sqlText).toContain('is_active = true')
        expect(sqlText).toContain('eligible_user AS MATERIALIZED')
        expect(sqlText).toContain('FOR UPDATE OF target')
        expect(sqlText).toContain('invalidated_reset_tokens AS')
        expect(sqlText).toContain('SET consumed_at = now(), issuance_slot = NULL')
        expect(sqlText.match(/UPDATE password_reset_tokens/g)).toHaveLength(1)
        expect(sqlText).toContain('WHERE token_hash =')
    })

    it('returns null when the token is already consumed, expired, or unknown', async () => {
        executeMock.mockResolvedValue({ rows: [] })
        const result = await consumeResetToken('bad-hash', 'new-hash')
        expect(result).toBeNull()
    })

    it('yields exactly one success out of two concurrent consumption attempts on the same token', async () => {
        // Simulates Postgres row-level atomicity: the mock's state mutation
        // happens synchronously inside the (no-internal-await) async function
        // body, so the first of two same-tick calls always wins — exactly
        // like a real single `UPDATE ... WHERE consumed_at IS NULL RETURNING`.
        let consumed = false
        executeMock.mockImplementation(async () => {
            if (consumed) return { rows: [] }
            consumed = true
            return { rows: [{ user_id: 'user-1' }] }
        })

        const [first, second] = await Promise.all([
            consumeResetToken('token-hash-abc', 'new-hash-a'),
            consumeResetToken('token-hash-abc', 'new-hash-b'),
        ])

        const successes = [first, second].filter(r => r !== null)
        expect(successes).toHaveLength(1)
        expect(successes[0]).toEqual({ userId: 'user-1' })
    })
})
