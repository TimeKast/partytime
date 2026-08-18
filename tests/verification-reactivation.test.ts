/**
 * ISSUE-009 (EPIC-003) — reset of verification state on reactivation/email
 * change. Closes the gaps ISSUE-007 (verification) and ISSUE-020/invites
 * left open: a row must never stay "verified" once it is associated with an
 * email its owner never proved.
 *
 * Two describe blocks mirror the two mocking styles already established by
 * the epic's other test files:
 *   - saveRSVP / saveRsvpWithInvitation: mock @/lib/db, run the REAL
 *     lib/queries.ts (same pattern as tests/email-verification.test.ts and
 *     tests/rsvp-invitation.test.ts) and assert on the generated SQL.
 *   - app/api/rsvp/update route: also mocks only @/lib/db (not
 *     @/lib/queries) so the route drives the REAL getRSVPById/updateRSVP —
 *     the thing actually being pinned is the route's OWN decision to add
 *     `verifiedAt: null` to the update payload, not lib/queries.ts's
 *     plumbing (already covered elsewhere).
 *
 * Reachability of the issue's matrix (cancelled/expired × mismo/distinto
 * email × público/invite × verificado antes o no), given the
 * `rsvps_event_email_unique` index on (event_id, lower(email))
 * (lib/schema.ts):
 *
 *   - Both saveRSVPOnce's reactivation lookup and saveRsvpWithInvitation's
 *     `existing_rsvp` CTE find a row ONLY via `lower(email) = <the NEW
 *     submission's lowercased email>`. So the row that gets reactivated
 *     ALWAYS already has the same lower(email) as the new submission — a
 *     genuinely different email can never reactivate an existing row through
 *     either path. It either finds no row (fresh INSERT, unrelated to any
 *     other row's verification state) or a DIFFERENT row already keyed to
 *     that other email (which has its own independent history).
 *   - So "email distinto" in the issue's Gherkin is only reachable via the
 *     INSERT branch, which never inherits verification state from anywhere
 *     — trivially satisfies "no existe camino que conserve verified_at con
 *     email distinto al verificado". The interesting axis for the
 *     REACTIVATION branch is therefore just: was the row (found by matching,
 *     possibly differently-cased, email) verified before or not.
 *   - `expired` rows can never have `verified_at IS NOT NULL`:
 *     expireStalePendingRsvps only expires `pending_payment`/
 *     `pending_verification` rows, and verifyRsvpByToken only ever sets
 *     verified_at while flipping `pending_verification` → `confirmed` — a
 *     row that reached `expired` never passed through a state that could
 *     have set verified_at. Likewise a `pending_verification` row being
 *     re-submitted always has verified_at NULL (it never finished
 *     verifying). So the "was verified, re-registers, keeps verification"
 *     case is reachable ONLY via a `cancelled` row that was previously
 *     `confirmed` with verified_at set.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { executeMock, selectMock, insertMock, updateMock } = vi.hoisted(() => ({
    executeMock: vi.fn(),
    selectMock: vi.fn(),
    insertMock: vi.fn(),
    updateMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
    db: { execute: executeMock, select: selectMock, insert: insertMock, update: updateMock },
    rsvps: {},
    events: {},
    appSettings: {},
    rsvpInvitationLinks: {},
}))

import {
    RSVP_STATUS,
    generateCancelToken,
    saveRSVP,
    saveRsvpWithInvitation,
} from '@/lib/queries'

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

function camelRsvp(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rsvp-1',
        eventId: 'fiesta',
        name: 'Alex',
        email: 'alex@example.com',
        phone: '+525500000000',
        plusOne: false,
        plusOneName: null,
        status: RSVP_STATUS.CONFIRMED,
        emailSent: null,
        emailHistory: [],
        cancelToken: null,
        createdAt: new Date('2026-08-17T00:00:00.000Z'),
        pendingExpiresAt: null,
        verifiedAt: null,
        verificationTokenHash: null,
        verificationExpiresAt: null,
        ...overrides,
    }
}

function rawRsvpRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rsvp-1',
        event_id: 'fiesta',
        name: 'Alex',
        email: 'alex@example.com',
        phone: '+525500000000',
        plus_one: false,
        plus_one_name: null,
        status: RSVP_STATUS.CONFIRMED,
        email_sent: null,
        email_history: [],
        cancel_token: null,
        created_at: '2026-08-17T00:00:00.000Z',
        pending_expires_at: null,
        verified_at: null,
        verification_token_hash: null,
        verification_expires_at: null,
        ...overrides,
    }
}

function mockSelectOnce(rows: unknown[]) {
    selectMock.mockReturnValueOnce({
        from: vi.fn(() => ({
            where: vi.fn(() => ({
                limit: vi.fn(async () => rows),
            })),
        })),
    })
}

function mockUpdateOnce(rows: unknown[]) {
    updateMock.mockReturnValueOnce({
        set: vi.fn(() => ({
            where: vi.fn(() => ({
                returning: vi.fn(async () => rows),
            })),
        })),
    })
}

const verification = { tokenHash: 'b'.repeat(64), expiresAt: new Date('2026-08-19T00:00:00.000Z') }
const verifiedAt = new Date('2026-08-10T00:00:00.000Z')

beforeEach(() => {
    executeMock.mockReset()
    selectMock.mockReset()
    insertMock.mockReset()
    updateMock.mockReset()
})

describe('saveRSVPOnce reactivation — verification reset matrix (ISSUE-009)', () => {
    // Given a cancelled row previously verified with a@x.com
    // When it re-registers with the EXACT same email (case-insensitive)
    // Then it lands confirmed, verified_at preserved, no new token/email.
    it('preserves verified_at and lands directly on confirmed when the SAME (case-insensitive) email was already verified', async () => {
        mockSelectOnce([camelRsvp({
            status: RSVP_STATUS.CANCELLED,
            email: 'Alex@Example.com', // different casing than the resubmission below
            verifiedAt,
        })])
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
            status: RSVP_STATUS.CONFIRMED,
            verified_at: verifiedAt.toISOString(),
            verification_token_hash: null,
            verification_expires_at: null,
            pending_expires_at: null,
        })] })

        const rsvp = await saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, verification)

        expect(insertMock).not.toHaveBeenCalled()
        expect(updateMock).not.toHaveBeenCalled()
        expect(executeMock).toHaveBeenCalledTimes(1)

        // The decision is made from the ROW'S OWN stored columns inside the
        // UPDATE, not from a JS-read value — same TOCTOU-closing shape as
        // ISSUE-007's requires_verification CTE.
        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('lower(email) =')
        expect(statement).toContain('alex@example.com')
        expect(statement).toContain('verified_at IS NOT NULL')
        expect(statement).toContain('CASE WHEN')
        expect(statement).toContain(RSVP_STATUS.CONFIRMED)
        // verified_at's THEN branch re-reads the column, never a JS literal.
        expect(statement).toContain('verified_at = CASE WHEN')
        expect(statement).toContain('THEN verified_at ELSE NULL END')
        expect(statement.match(/UPDATE rsvps/g)).toHaveLength(1)
        expect(statement).toContain('RETURNING *')

        expect(rsvp.status).toBe(RSVP_STATUS.CONFIRMED)
        expect(rsvp.verifiedAt).toEqual(verifiedAt)
        expect(rsvp.verificationTokenHash).toBeNull()
        expect(rsvp.verificationExpiresAt).toBeNull()
        expect(rsvp.pendingExpiresAt).toBeNull()
    })

    // Given a cancelled row that was NEVER verified (e.g. registered while
    // the event didn't require verification, or verification never
    // completed) When it re-registers Then it goes back to
    // pending_verification with a brand-new token.
    it('issues a fresh token and stays pending_verification when the row was never verified, even with the same email', async () => {
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.CANCELLED, verifiedAt: null })])
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verification_token_hash: verification.tokenHash,
            verification_expires_at: verification.expiresAt.toISOString(),
            pending_expires_at: verification.expiresAt.toISOString(),
        })] })

        const rsvp = await saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, verification)

        expect(rsvp.status).toBe(RSVP_STATUS.PENDING_VERIFICATION)
        expect(rsvp.verifiedAt).toBeNull()
        expect(rsvp.verificationTokenHash).toBe(verification.tokenHash)
    })

    // Given the same "already verified with this email" row, but the event
    // does NOT require verification for this attempt (no `verification`
    // candidate passed) Then verified_at is still cleared — the exception
    // only applies while verification is actually in play.
    it('does NOT preserve verified_at when this attempt does not require verification at all', async () => {
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.CANCELLED, verifiedAt })])
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.CONFIRMED, verified_at: null })] })

        const rsvp = await saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        } /* no verification candidate */)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        // requiresVerification (false) is bound as the first operand of the
        // AND chain — the CASE can never take the THEN branch regardless of
        // the row's own verified_at.
        expect(statement).toContain('verified_at IS NOT NULL')
        expect(rsvp.status).toBe(RSVP_STATUS.CONFIRMED)
        expect(rsvp.verifiedAt).toBeNull()
    })

    // expired rows can never carry verified_at (see file-level reachability
    // note) — pin that the ONLY reachable expired-reactivation outcome is a
    // fresh pending_verification, regardless of requiresVerification.
    it('reactivating an expired row always issues a fresh token (expired rows are never verified)', async () => {
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.EXPIRED, verifiedAt: null })])
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verification_token_hash: verification.tokenHash,
        })] })

        const rsvp = await saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, verification)

        expect(rsvp.status).toBe(RSVP_STATUS.PENDING_VERIFICATION)
        expect(rsvp.verificationTokenHash).toBe(verification.tokenHash)
    })

    // "email distinto" is unreachable through the reactivation branch (see
    // file-level note): submitting a different email than any cancelled/
    // verified row finds NO existing row for THAT email and falls through
    // to a plain INSERT — which has no way to inherit another row's
    // verification state.
    it('a different email never reactivates another row\'s verification — it always falls through to a fresh INSERT', async () => {
        // No row exists for b@y.com, even though some OTHER row (a@x.com,
        // not looked up here) might be cancelled+verified.
        mockSelectOnce([])
        insertMock.mockReturnValueOnce({
            values: vi.fn(() => ({
                returning: vi.fn(async () => [camelRsvp({
                    email: 'b@y.com',
                    status: RSVP_STATUS.PENDING_VERIFICATION,
                    verificationTokenHash: verification.tokenHash,
                    verifiedAt: null,
                })]),
            })),
        })

        const rsvp = await saveRSVP({
            name: 'Bailey', email: 'b@y.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, verification)

        expect(executeMock).not.toHaveBeenCalled()
        expect(updateMock).not.toHaveBeenCalled()
        expect(insertMock).toHaveBeenCalledTimes(1)
        expect(rsvp.status).toBe(RSVP_STATUS.PENDING_VERIFICATION)
        expect(rsvp.verifiedAt).toBeNull()
    })
})

describe('saveRsvpWithInvitation reactivation — verified_at always reset (ISSUE-009)', () => {
    const baseInput = {
        tokenHash: 'a'.repeat(64),
        eventId: 'fiesta',
        name: 'Alex',
        email: 'alex@example.com',
        phone: '+525500000000',
        plusOne: false,
        plusOneName: null,
        verificationCandidate: verification,
    }

    // Unlike saveRSVPOnce, the invitation flow's reactivation branch has NO
    // "same email, already verified" exception: an invite can bypass
    // straight to confirmed without the guest ever proving the address on
    // THIS attempt, so a carried-over verified_at would misrepresent that.
    it('sets verified_at = NULL unconditionally in the UPDATE, never gated behind a CASE', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.CONFIRMED, verified_at: null })] })

        await saveRsvpWithInvitation(baseInput)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        const reactivatedCte = statement.slice(
            statement.indexOf('reactivated_rsvp AS ('),
            statement.indexOf('inserted_rsvp AS ('),
        )
        // Exactly one reference to verified_at in the reactivation branch,
        // and it is a flat NULL assignment — not wrapped in its own CASE.
        expect(reactivatedCte.match(/verified_at/g)).toHaveLength(1)
        expect(reactivatedCte).toMatch(/verified_at\s*=\s*NULL,/)
    })

    it('a bypassed (skip_verification) reactivation returns confirmed with verified_at null even for a previously-verified email', async () => {
        // The row this hits in a real DB was cancelled+verified before
        // (case-insensitively same email as the invite submission — see
        // file-level reachability note); the UPDATE's flat `verified_at =
        // NULL` guarantees the RETURNING row (and therefore this mock) can
        // never legitimately carry a non-null verified_at here.
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.CONFIRMED, verified_at: null })] })

        const rsvp = await saveRsvpWithInvitation(baseInput)

        expect(rsvp).toMatchObject({ status: RSVP_STATUS.CONFIRMED })
        expect(rsvp!.verifiedAt).toBeNull()
    })
})

describe('POST /api/rsvp/update — clears verified_at on email change, never degrades status (ISSUE-009)', () => {
    // This route (cancel-token edit) DOES allow changing the email today —
    // see app/api/rsvp/route.ts's updateData.email = email, unconditional.
    // These tests drive the REAL route + REAL getRSVPById/updateRSVP against
    // a mocked @/lib/db (same style as the two describe blocks above); only
    // @/lib/db is mocked, so this pins the ROUTE's own decision to add
    // `verifiedAt: null`, not lib/queries.ts's plumbing.

    it('leaves verified_at untouched when the email is unchanged (case-insensitive)', async () => {
        const currentRow = camelRsvp({ status: RSVP_STATUS.CONFIRMED, email: 'alex@example.com', verifiedAt })
        const token = generateCancelToken('rsvp-1', 'alex@example.com')

        mockSelectOnce([currentRow]) // getRSVPById
        mockUpdateOnce([{ ...currentRow, name: 'Alex Updated' }]) // updateRSVP

        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(new NextRequest('http://localhost:3000/api/rsvp/update', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                rsvpId: 'rsvp-1', token, name: 'Alex Updated',
                email: 'Alex@Example.com', // same address, different casing
                phone: '+525500000000', plusOne: false,
            }),
        }))

        expect(response.status).toBe(200)
        const setPayload = (updateMock.mock.results[0]!.value.set as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect('verifiedAt' in setPayload).toBe(false)
    })

    it('clears verified_at when the email changes, WITHOUT degrading a confirmed RSVP to pending', async () => {
        const currentRow = camelRsvp({ status: RSVP_STATUS.CONFIRMED, email: 'alex@example.com', verifiedAt })
        const token = generateCancelToken('rsvp-1', 'alex@example.com')

        mockSelectOnce([currentRow]) // getRSVPById
        mockUpdateOnce([{ ...currentRow, email: 'new@example.com', verifiedAt: null }]) // updateRSVP

        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(new NextRequest('http://localhost:3000/api/rsvp/update', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                rsvpId: 'rsvp-1', token, name: 'Alex',
                email: 'new@example.com',
                phone: '+525500000000', plusOne: false,
            }),
        }))

        expect(response.status).toBe(200)
        const setPayload = (updateMock.mock.results[0]!.value.set as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(setPayload.verifiedAt).toBeNull()
        // MVP decision (ISSUE-009): no status key is sent at all here — the
        // RSVP is never pushed back to pending_verification by this route.
        expect('status' in setPayload).toBe(false)

        const payload = await response.json()
        expect(payload.rsvp.verifiedAt).toBeNull()
    })

    it('reconfirming a cancelled RSVP while ALSO changing the email lands confirmed with verified_at cleared', async () => {
        const currentRow = camelRsvp({ status: RSVP_STATUS.CANCELLED, email: 'alex@example.com', verifiedAt })
        const token = generateCancelToken('rsvp-1', 'alex@example.com')
        const openEvent = {
            id: 'event-uuid', slug: 'fiesta', isActive: true, rsvpClosed: false, rsvpClosedMessage: null,
        }

        mockSelectOnce([currentRow]) // getRSVPById
        mockSelectOnce([openEvent]) // getEventBySlug (seat-adding change: cancelled -> confirmed)
        mockUpdateOnce([{ ...currentRow, status: RSVP_STATUS.CONFIRMED, email: 'new@example.com', verifiedAt: null }])

        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(new NextRequest('http://localhost:3000/api/rsvp/update', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                rsvpId: 'rsvp-1', token, name: 'Alex',
                email: 'new@example.com',
                phone: '+525500000000', plusOne: false, reconfirm: true,
            }),
        }))

        expect(response.status).toBe(200)
        const setPayload = (updateMock.mock.results[0]!.value.set as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(setPayload.status).toBe(RSVP_STATUS.CONFIRMED)
        expect(setPayload.verifiedAt).toBeNull()
    })
})
