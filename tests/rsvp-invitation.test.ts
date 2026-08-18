import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    RSVP_INVITATION_MAX_LIFETIME_MS,
    generateRsvpInvitationToken,
    getRsvpInvitationStatus,
    hashRsvpInvitationToken,
    issueRecoverableRsvpInvitationToken,
    isRsvpInvitationTokenHash,
    isValidRsvpInvitationToken,
    parseRsvpInvitationExpiry,
    recoverRsvpInvitationToken,
} from '@/lib/rsvp-invitation'

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
    db: { execute: executeMock },
    rsvps: {},
    events: {},
    appSettings: {},
    rsvpInvitationLinks: {},
}))

import { saveRsvpWithInvitation } from '@/lib/queries'

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

const input = {
    tokenHash: 'a'.repeat(64),
    eventId: 'fiesta',
    name: 'Alex',
    email: 'alex@example.com',
    phone: '+525500000000',
    plusOne: false,
    plusOneName: null,
}

const returnedRsvp = {
    id: 'rsvp-1',
    event_id: 'fiesta',
    name: 'Alex',
    email: 'alex@example.com',
    phone: '+525500000000',
    plus_one: false,
    plus_one_name: null,
    status: 'confirmed',
    email_sent: null,
    email_history: [],
    cancel_token: null,
    created_at: '2026-08-17T00:00:00.000Z',
}

describe('RSVP invitation token helpers', () => {
    it('generates 32 random URL-safe bytes and hashes them as SHA-256 hex', () => {
        const token = generateRsvpInvitationToken()
        const other = generateRsvpInvitationToken()

        expect(token).not.toBe(other)
        expect(isValidRsvpInvitationToken(token)).toBe(true)
        expect(Buffer.from(token, 'base64url')).toHaveLength(32)
        expect(hashRsvpInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/)
        expect(isRsvpInvitationTokenHash(hashRsvpInvitationToken(token))).toBe(true)
    })

    it.each(['', 'abc', 'a'.repeat(42), 'a'.repeat(44), 'x+y'.padEnd(43, 'a')])(
        'rejects malformed raw token %j',
        token => expect(isValidRsvpInvitationToken(token)).toBe(false),
    )

    it('accepts only future expiry instants up to 365 days', () => {
        const now = new Date('2026-01-01T00:00:00.000Z')
        const valid = new Date(now.getTime() + RSVP_INVITATION_MAX_LIFETIME_MS)
        const tooLate = new Date(valid.getTime() + 1)

        expect(parseRsvpInvitationExpiry(valid.toISOString(), now)).toEqual(valid)
        expect(parseRsvpInvitationExpiry(now.toISOString(), now)).toBeNull()
        expect(parseRsvpInvitationExpiry(tooLate.toISOString(), now)).toBeNull()
        expect(parseRsvpInvitationExpiry('not-a-date', now)).toBeNull()
    })

    it('uses terminal state precedence for admin status', () => {
        const future = new Date('2027-01-01T00:00:00.000Z')
        const now = new Date('2026-01-01T00:00:00.000Z')
        expect(getRsvpInvitationStatus({ expiresAt: future, usedAt: null, revokedAt: null }, now)).toBe('active')
        expect(getRsvpInvitationStatus({ expiresAt: now, usedAt: null, revokedAt: null }, now)).toBe('expired')
        expect(getRsvpInvitationStatus({ expiresAt: future, usedAt: now, revokedAt: null }, now)).toBe('used')
        expect(getRsvpInvitationStatus({ expiresAt: future, usedAt: now, revokedAt: now }, now)).toBe('revoked')
    })

    it('reconstructs a deterministic bearer with its versioned dedicated key', () => {
        const v1 = `v1:${'11'.repeat(32)}`
        const token = issueRecoverableRsvpInvitationToken('link-1', 'event-uuid', v1)

        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(recoverRsvpInvitationToken({
            id: 'link-1',
            eventBindingId: 'event-uuid',
            tokenHash: hashRsvpInvitationToken(token!),
        }, v1)).toEqual({ status: 'available', token })
    })

    it('keeps old keys recoverable after rotation and uses the first key for issuance', () => {
        const v1 = `v1:${'11'.repeat(32)}`
        const rotated = `v2:${'22'.repeat(32)},${v1}`
        const oldToken = issueRecoverableRsvpInvitationToken('link-1', 'event-uuid', v1)!
        const newToken = issueRecoverableRsvpInvitationToken('link-1', 'event-uuid', rotated)!

        expect(newToken).not.toBe(oldToken)
        expect(recoverRsvpInvitationToken({
            id: 'link-1',
            eventBindingId: 'event-uuid',
            tokenHash: hashRsvpInvitationToken(oldToken),
        }, rotated)).toEqual({ status: 'available', token: oldToken })
    })

    it('fails closed for malformed config and marks random legacy tokens as non-recoverable', () => {
        const legacyToken = generateRsvpInvitationToken()
        const record = {
            id: 'legacy-link',
            eventBindingId: 'event-uuid',
            tokenHash: hashRsvpInvitationToken(legacyToken),
        }

        expect(issueRecoverableRsvpInvitationToken('link-1', 'fiesta', undefined)).toBeNull()
        expect(issueRecoverableRsvpInvitationToken('link-1', 'fiesta', 'v1:not-hex')).toBeNull()
        expect(recoverRsvpInvitationToken(record, undefined)).toEqual({
            status: 'configuration_unavailable',
        })
        expect(recoverRsvpInvitationToken(record, `v1:${'11'.repeat(32)}`)).toEqual({
            status: 'not_recoverable',
        })
    })

    it('binds recovery to both the immutable link id and immutable event identity', () => {
        const keyring = `v1:${'33'.repeat(32)}`
        const token = issueRecoverableRsvpInvitationToken('link-1', 'event-uuid', keyring)!
        const tokenHash = hashRsvpInvitationToken(token)

        expect(recoverRsvpInvitationToken({
            id: 'link-2', eventBindingId: 'event-uuid', tokenHash,
        }, keyring).status)
            .toBe('not_recoverable')
        expect(recoverRsvpInvitationToken({
            id: 'link-1', eventBindingId: 'other-event-uuid', tokenHash,
        }, keyring).status)
            .toBe('not_recoverable')
    })
})

describe('saveRsvpWithInvitation atomic contract', () => {
    beforeEach(() => executeMock.mockReset())

    it('uses exactly one SQL statement for conditional claim, RSVP write and consumption', async () => {
        executeMock.mockResolvedValueOnce({ rows: [returnedRsvp] })

        await expect(saveRsvpWithInvitation(input)).resolves.toMatchObject({ id: 'rsvp-1', eventId: 'fiesta' })
        expect(executeMock).toHaveBeenCalledTimes(1)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('eligible_invitation AS MATERIALIZED')
        expect(statement).toContain('FOR UPDATE OF candidate')
        expect(statement).toContain('candidate.event_id =')
        expect(statement).toContain('candidate.used_at IS NULL')
        expect(statement).toContain('candidate.revoked_at IS NULL')
        expect(statement).toContain('candidate.expires_at > now()')
        expect(statement).toContain('invitation_event.is_active = true')
        const existingRsvp = statement.slice(
            statement.indexOf('existing_rsvp AS MATERIALIZED'),
            statement.indexOf('reactivated_rsvp AS'),
        )
        expect(existingRsvp).toContain('EXISTS (SELECT 1 FROM eligible_invitation)')
        expect(existingRsvp.indexOf('EXISTS (SELECT 1 FROM eligible_invitation)'))
            .toBeLessThan(existingRsvp.indexOf('FOR UPDATE OF target'))
        expect(statement).toContain('reactivated_rsvp AS')
        expect(statement).toContain('inserted_rsvp AS')
        expect(statement).toContain('ON CONFLICT DO NOTHING')
        expect(statement).toContain('claimed_invitation AS')
        expect(statement).toContain('EXISTS (SELECT 1 FROM successful_rsvp)')
        expect(statement).toContain('used_rsvp_id = (SELECT id FROM successful_rsvp LIMIT 1)')
        expect(statement.match(/UPDATE rsvp_invitation_links/g)).toHaveLength(1)
    })

    it('returns null without claiming when the token is unavailable or RSVP cannot win', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })
        await expect(saveRsvpWithInvitation(input)).resolves.toBeNull()
    })

    it('allows at most one winner across concurrent attempts for the same token', async () => {
        let consumed = false
        executeMock.mockImplementation(async () => {
            if (consumed) return { rows: [] }
            consumed = true
            return { rows: [returnedRsvp] }
        })

        const results = await Promise.all([
            saveRsvpWithInvitation(input),
            saveRsvpWithInvitation({ ...input, name: 'Second attempt' }),
        ])

        expect(results.filter(Boolean)).toHaveLength(1)
        expect(executeMock).toHaveBeenCalledTimes(2)
    })

    it('translates a capacity-trigger abort without issuing a second statement', async () => {
        const root = Object.assign(new Error('CAPACITY_FULL'), { code: 'P0001' })
        executeMock.mockRejectedValueOnce(Object.assign(new Error('Failed query'), { cause: root }))

        await expect(saveRsvpWithInvitation(input)).rejects.toThrow('capacidad máxima')
        expect(executeMock).toHaveBeenCalledTimes(1)
    })

    // ISSUE-006/ISSUE-020 (PLAN-EPICS-002-005.md §2.1): with the per-link
    // flags at their DEFAULT (is_courtesy/skip_verification = true, matching
    // `input` above, which never sets them), a private-link RSVP must land
    // straight on `confirmed` — today's behaviour. ISSUE-020 makes the CTE
    // read is_courtesy/skip_verification (so ISSUE-007/011 can consume them),
    // but does not yet BRANCH the inserted status on them — that still lands
    // with ISSUE-007 (verification) and ISSUE-011 (payment). Pins: (1) the
    // CTE hardcodes RSVP_STATUS.CONFIRMED for both the reactivation and
    // insert branches with no pending_payment/pending_verification path yet,
    // and (2) it now selects (read-only) but never conditions on those flags.
    it('ISSUE-020: reads is_courtesy/skip_verification read-only but the CTE still bypasses straight to confirmed', async () => {
        executeMock.mockResolvedValueOnce({ rows: [returnedRsvp] })

        await expect(saveRsvpWithInvitation(input)).resolves.toMatchObject({
            id: 'rsvp-1',
            status: 'confirmed',
        })

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        // Both branches (reactivated_rsvp's SET status = ..., inserted_rsvp's
        // SELECT ...status column) resolve unconditionally to 'confirmed'.
        expect(statement.match(/confirmed/g)).toHaveLength(2)
        expect(statement).not.toContain('pending_payment')
        expect(statement).not.toContain('pending_verification')
        // ISSUE-020: now selected read-only in eligible_invitation...
        expect(statement).toContain('candidate.is_courtesy')
        expect(statement).toContain('candidate.skip_verification')
        // ...but never referenced anywhere else in the statement (no WHERE/
        // CASE/SET branches on them) — still fully inert for status today.
        // (Each appears twice: once in the explanatory SQL comment, once in
        // the eligible_invitation SELECT list — never in a predicate/SET.)
        expect(statement.match(/is_courtesy/g)).toHaveLength(2)
        expect(statement.match(/skip_verification/g)).toHaveLength(2)
        expect(statement).not.toMatch(/WHERE[\s\S]*is_courtesy/)
        expect(statement).not.toMatch(/SET[\s\S]*is_courtesy/)
    })
})
