/**
 * ISSUE-007 (EPIC-003) — email verification backend, lib + query layer.
 * Mirrors the mocking pattern of tests/rsvp-invitation.test.ts (mocks
 * @/lib/db, asserts on the generated SQL) and tests/pending-states.test.ts.
 * Route-level acceptance criteria live in the sibling
 * tests/rsvp-public-verification-route.test.ts,
 * tests/rsvp-invitation-rsvp-route.test.ts (skip_verification bypass/pending),
 * tests/rsvp-verify-route.test.ts and tests/rsvp-resend-verification-route.test.ts
 * — Vitest scopes `vi.mock('@/lib/queries', ...)` per file, so route tests
 * that mock the whole query layer cannot share a file with these tests,
 * which need the REAL lib/queries.ts running against a mocked @/lib/db.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    VERIFICATION_TOKEN_BYTES,
    VERIFICATION_TOKEN_TTL_MS,
    buildVerificationUrl,
    generateVerificationToken,
    hashVerificationToken,
    isValidVerificationToken,
} from '@/lib/verification'

describe('lib/verification.ts', () => {
    it('generates 32 random URL-safe bytes and hashes them as SHA-256 hex', () => {
        const token = generateVerificationToken()
        const other = generateVerificationToken()

        expect(token).not.toBe(other)
        expect(isValidVerificationToken(token)).toBe(true)
        expect(Buffer.from(token, 'base64url')).toHaveLength(VERIFICATION_TOKEN_BYTES)
        expect(hashVerificationToken(token)).toMatch(/^[a-f0-9]{64}$/)
    })

    it.each(['', 'abc', 'a'.repeat(42), 'a'.repeat(44), 'x+y'.padEnd(43, 'a'), null, undefined, 123])(
        'rejects malformed raw token %j',
        token => expect(isValidVerificationToken(token)).toBe(false),
    )

    it('validates format BEFORE hashing — throws on a malformed token instead of hashing it', () => {
        expect(() => hashVerificationToken('not-valid')).toThrow('Invalid verification token')
    })

    it('uses a 24-hour TTL constant', () => {
        expect(VERIFICATION_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000)
    })

    it('builds the verify URL from NEXT_PUBLIC_APP_URL, the slug and the raw token', () => {
        const original = process.env.NEXT_PUBLIC_APP_URL
        process.env.NEXT_PUBLIC_APP_URL = 'https://partytime.example.com'
        const token = generateVerificationToken()

        expect(buildVerificationUrl('fiesta', token)).toBe(
            `https://partytime.example.com/verify/fiesta?token=${token}`,
        )

        process.env.NEXT_PUBLIC_APP_URL = original
    })

    it('falls back to localhost when NEXT_PUBLIC_APP_URL is unset', () => {
        const original = process.env.NEXT_PUBLIC_APP_URL
        delete process.env.NEXT_PUBLIC_APP_URL
        const token = generateVerificationToken()

        expect(buildVerificationUrl('fiesta', token)).toBe(`http://localhost:3000/verify/fiesta?token=${token}`)

        process.env.NEXT_PUBLIC_APP_URL = original
    })
})

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

import { RSVP_STATUS, reissueVerificationToken, saveRSVP, saveRsvpWithInvitation, verifyRsvpByToken } from '@/lib/queries'

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

function mockSelectExisting(rows: unknown[]) {
    selectMock.mockReturnValueOnce({
        from: vi.fn(() => ({
            where: vi.fn(() => ({
                limit: vi.fn(async () => rows),
            })),
        })),
    })
}

function mockInsertReturning(rows: unknown[]) {
    insertMock.mockReturnValueOnce({
        values: vi.fn(() => ({
            returning: vi.fn(async () => rows),
        })),
    })
}

// ISSUE-009: db.update() is no longer used by the reactivation branch (it
// now issues one raw db.execute UPDATE — see the CASE-based statement
// asserted below), so `updateMock` is only ever asserted as NOT called in
// this file. No `mockUpdateReturning` helper is needed anymore.

const verification = { tokenHash: 'b'.repeat(64), expiresAt: new Date('2026-08-19T00:00:00.000Z') }

describe('saveRSVP with verification issuance (ISSUE-007)', () => {
    beforeEach(() => {
        executeMock.mockReset()
        selectMock.mockReset()
        insertMock.mockReset()
        updateMock.mockReset()
    })

    it('inserts a fresh row as pending_verification with the given token hash and shared TTL expiry', async () => {
        mockSelectExisting([])
        mockInsertReturning([camelRsvp({
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verificationTokenHash: verification.tokenHash,
            verificationExpiresAt: verification.expiresAt,
            pendingExpiresAt: verification.expiresAt,
        })])

        const rsvp = await saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, verification)

        expect(rsvp.status).toBe(RSVP_STATUS.PENDING_VERIFICATION)
        expect(rsvp.verificationTokenHash).toBe(verification.tokenHash)
        expect(rsvp.verificationExpiresAt).toEqual(verification.expiresAt)
        expect(rsvp.pendingExpiresAt).toEqual(verification.expiresAt)

        expect(insertMock).toHaveBeenCalledTimes(1)
        const insertedValues = (insertMock.mock.results[0]!.value.values as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(insertedValues).toMatchObject({
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verificationTokenHash: verification.tokenHash,
            verificationExpiresAt: verification.expiresAt,
            pendingExpiresAt: verification.expiresAt,
        })
    })

    it('without a verification argument, inserts as confirmed (unchanged default behavior)', async () => {
        mockSelectExisting([])
        mockInsertReturning([camelRsvp()])

        const rsvp = await saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        })

        expect(rsvp.status).toBe(RSVP_STATUS.CONFIRMED)
        const insertedValues = (insertMock.mock.results[0]!.value.values as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(insertedValues.verificationTokenHash).toBeNull()
        expect(insertedValues.pendingExpiresAt).toBeNull()
    })

    // ISSUE-007 Gherkin: "Given re-submit del mismo email con fila pendiente
    // propia / When llega el segundo POST /api/rsvp / Then se refresca el
    // token en la misma fila (no hay duplicado ni CAPACITY_FULL falso)".
    // ISSUE-009 (EPIC-003): the reactivation branch now issues a single raw
    // UPDATE (db.execute), not drizzle's typed db.update — see
    // tests/verification-reactivation.test.ts for the full reset/preserve
    // matrix this statement implements. These three tests keep pinning the
    // ISSUE-007 behaviors they were written for, updated to the new mocking
    // shape.
    it('re-submit on an existing pending_verification row refreshes the SAME row with a new token (no duplicate error)', async () => {
        const previousRow = camelRsvp({
            id: 'rsvp-1',
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verificationTokenHash: 'a'.repeat(64),
            verificationExpiresAt: new Date('2026-08-18T12:00:00.000Z'),
            pendingExpiresAt: new Date('2026-08-18T12:00:00.000Z'),
        })
        mockSelectExisting([previousRow])
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
            id: 'rsvp-1',
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verification_token_hash: verification.tokenHash,
            verification_expires_at: verification.expiresAt.toISOString(),
            pending_expires_at: verification.expiresAt.toISOString(),
        })] })

        const rsvp = await saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, verification)

        expect(rsvp.id).toBe('rsvp-1')
        expect(insertMock).not.toHaveBeenCalled()
        expect(updateMock).not.toHaveBeenCalled()
        expect(executeMock).toHaveBeenCalledTimes(1)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement.match(/UPDATE rsvps/g)).toHaveLength(1)
        expect(statement).toContain('RETURNING *')
        expect(statement).toContain(verification.tokenHash)

        expect(rsvp.status).toBe(RSVP_STATUS.PENDING_VERIFICATION)
        expect(rsvp.verificationTokenHash).toBe(verification.tokenHash)
        expect(rsvp.verificationExpiresAt).toEqual(verification.expiresAt)
        expect(rsvp.pendingExpiresAt).toEqual(verification.expiresAt)
        expect(rsvp.verifiedAt).toBeNull()
    })

    it.each([RSVP_STATUS.CANCELLED, RSVP_STATUS.EXPIRED])(
        'reactivates an existing %s row (never verified) into pending_verification on re-submit',
        async previousStatus => {
            // camelRsvp() defaults verifiedAt to null — the "never verified"
            // half of the ISSUE-009 matrix; the "was verified" half is
            // covered by tests/verification-reactivation.test.ts.
            mockSelectExisting([camelRsvp({ status: previousStatus })])
            executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
                status: RSVP_STATUS.PENDING_VERIFICATION,
                verification_token_hash: verification.tokenHash,
            })] })

            const rsvp = await saveRSVP({
                name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
                plusOne: false, eventId: 'fiesta',
            }, verification)

            expect(rsvp.status).toBe(RSVP_STATUS.PENDING_VERIFICATION)
            expect(insertMock).not.toHaveBeenCalled()
            expect(updateMock).not.toHaveBeenCalled()
        },
    )

    it('rejects a duplicate when the existing row is already confirmed, even with a verification candidate', async () => {
        mockSelectExisting([camelRsvp({ status: RSVP_STATUS.CONFIRMED })])

        await expect(saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, verification)).rejects.toThrow('Ya existe un RSVP con este email para este evento')

        expect(updateMock).not.toHaveBeenCalled()
        expect(insertMock).not.toHaveBeenCalled()
        expect(executeMock).not.toHaveBeenCalled()
    })

    it('two concurrent re-submits: the loser (predicate no longer matches) is treated as a duplicate', async () => {
        mockSelectExisting([camelRsvp({ status: RSVP_STATUS.PENDING_VERIFICATION })])
        executeMock.mockResolvedValueOnce({ rows: [] }) // optimistic predicate lost the race — 0 rows

        await expect(saveRSVP({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, verification)).rejects.toThrow('Ya existe un RSVP con este email para este evento')
    })
})

describe('verifyRsvpByToken (ISSUE-007)', () => {
    beforeEach(() => executeMock.mockReset())

    it('uses exactly one SQL statement validating status, hash and expiry, and confirms + clears verification columns', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
            status: RSVP_STATUS.CONFIRMED,
            verified_at: '2026-08-18T00:00:00.000Z',
            verification_token_hash: null,
            verification_expires_at: null,
            pending_expires_at: null,
        })] })

        const rsvp = await verifyRsvpByToken('fiesta', 'a'.repeat(64))

        expect(executeMock).toHaveBeenCalledTimes(1)
        expect(rsvp).toMatchObject({ id: 'rsvp-1', status: RSVP_STATUS.CONFIRMED })
        expect(rsvp!.verificationTokenHash).toBeNull()
        expect(rsvp!.verificationExpiresAt).toBeNull()
        expect(rsvp!.pendingExpiresAt).toBeNull()

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('SET status = ')
        expect(statement).toContain(RSVP_STATUS.CONFIRMED)
        expect(statement).toContain('verified_at = now()')
        expect(statement).toContain('verification_token_hash = NULL')
        expect(statement).toContain('verification_expires_at = NULL')
        expect(statement).toContain('pending_expires_at = NULL')
        expect(statement).toContain('WHERE event_id = ')
        expect(statement).toContain('AND status = ')
        expect(statement).toContain(RSVP_STATUS.PENDING_VERIFICATION)
        expect(statement).toContain('AND verification_token_hash = ')
        expect(statement).toContain('a'.repeat(64))
        expect(statement).toContain('verification_expires_at > now()')
        expect(statement).toContain('RETURNING')
        // Exactly one UPDATE statement — single-table, no CTE needed.
        expect(statement.match(/UPDATE rsvps/g)).toHaveLength(1)
    })

    // Gherkin: "Given un token vencido, ya usado, o de otro evento / When se
    // intenta verificar / Then falla cerrado (410/400) sin mutar la fila" —
    // all three cases share the same shape at the query layer: the UPDATE's
    // WHERE predicate matches zero rows, so nothing is mutated.
    it('returns null without mutating anything for an expired/used/wrong-event token', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })
        await expect(verifyRsvpByToken('fiesta', 'a'.repeat(64))).resolves.toBeNull()
        expect(executeMock).toHaveBeenCalledTimes(1)
    })

    // Gherkin: "carrera (dos verify concurrentes del mismo token → exactamente
    // uno confirma)". Simulates Postgres row-level atomicity the same way
    // tests/password-reset-queries.test.ts's consumeResetToken race test does:
    // the mock's state mutation happens synchronously inside the
    // no-internal-await async function body, so the first of two same-tick
    // calls always wins — exactly like a single `UPDATE ... WHERE status =
    // pending_verification RETURNING`.
    it('yields exactly one success out of two concurrent verify attempts on the same token', async () => {
        let consumed = false
        executeMock.mockImplementation(async () => {
            if (consumed) return { rows: [] }
            consumed = true
            return { rows: [rawRsvpRow({ status: RSVP_STATUS.CONFIRMED })] }
        })

        const [first, second] = await Promise.all([
            verifyRsvpByToken('fiesta', 'a'.repeat(64)),
            verifyRsvpByToken('fiesta', 'a'.repeat(64)),
        ])

        const successes = [first, second].filter(r => r !== null)
        expect(successes).toHaveLength(1)
    })

    it('never compares the token as a JS string equality — the hash flows straight into the SQL parameter', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })
        const tokenHash = 'f'.repeat(64)
        await verifyRsvpByToken('fiesta', tokenHash)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain(tokenHash)
    })
})

describe('reissueVerificationToken (ISSUE-007 resend)', () => {
    beforeEach(() => executeMock.mockReset())

    it('reissues token hash and expiries on the guest\'s own pending_verification row', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verification_token_hash: 'c'.repeat(64),
            verification_expires_at: '2026-08-19T00:00:00.000Z',
            pending_expires_at: '2026-08-19T00:00:00.000Z',
        })] })

        const rsvp = await reissueVerificationToken({
            eventId: 'fiesta', email: 'Alex@Example.com',
            tokenHash: 'c'.repeat(64), expiresAt: new Date('2026-08-19T00:00:00.000Z'),
        })

        expect(rsvp).toMatchObject({ id: 'rsvp-1', verificationTokenHash: 'c'.repeat(64) })
        expect(executeMock).toHaveBeenCalledTimes(1)
        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('SET verification_token_hash =')
        expect(statement).toContain('AND status = ')
        expect(statement).toContain(RSVP_STATUS.PENDING_VERIFICATION)
        expect(statement).toContain('lower(email) =')
        expect(statement).toContain('alex@example.com') // lower-cased before the query
        expect(statement.match(/UPDATE rsvps/g)).toHaveLength(1)
    })

    it('returns null when there is no matching pending row (unknown email, wrong event, or already confirmed)', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })

        const rsvp = await reissueVerificationToken({
            eventId: 'fiesta', email: 'nobody@example.com',
            tokenHash: 'd'.repeat(64), expiresAt: new Date('2026-08-19T00:00:00.000Z'),
        })

        expect(rsvp).toBeNull()
    })
})

describe('saveRsvpWithInvitation — skip_verification branching (ISSUE-007)', () => {
    beforeEach(() => executeMock.mockReset())

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

    it('computes requires_verification fresh from the event flag AND NOT the link skip_verification flag — never from caller-supplied state', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.CONFIRMED })] })

        await saveRsvpWithInvitation(baseInput)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('invitation_event.email_verification_enabled AND NOT candidate.skip_verification')
        expect(statement).toContain('AS requires_verification')
        // Both the reactivation and insert branches read requires_verification
        // via a subquery/column reference, never a literal true/false baked in
        // by the caller.
        expect(statement.match(/requires_verification/g)!.length).toBeGreaterThanOrEqual(4)
    })

    // Gherkin: "evento con verificación activada e invitación privada con
    // skip_verification=true (default) / When el invitado del link registra
    // / Then queda confirmed directo (bypass)". At the query layer this is a
    // property of requires_verification's SQL definition (already asserted
    // above); this test pins the CASE branches use it for status AND for
    // the verification columns, so a bypass never leaves a stray token hash.
    it('the CASE branches gate status AND every verification column on the same requires_verification flag', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.CONFIRMED })] })

        await saveRsvpWithInvitation(baseInput)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement.match(/CASE WHEN[\s\S]{0,40}requires_verification/g)!.length).toBeGreaterThanOrEqual(4)
        expect(statement).toContain('THEN ')
        expect(statement).toContain(RSVP_STATUS.PENDING_VERIFICATION)
        expect(statement).toContain(' ELSE ')
        expect(statement).toContain(RSVP_STATUS.CONFIRMED)
        expect(statement).toContain(' END')
        expect(statement).toContain(verification.tokenHash)
    })

    it('returns a pending_verification row as-is when the CTE decided requires_verification (skip_verification=false path)', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verification_token_hash: verification.tokenHash,
            verification_expires_at: verification.expiresAt.toISOString(),
            pending_expires_at: verification.expiresAt.toISOString(),
        })] })

        const rsvp = await saveRsvpWithInvitation(baseInput)

        expect(rsvp).toMatchObject({
            status: RSVP_STATUS.PENDING_VERIFICATION,
            verificationTokenHash: verification.tokenHash,
        })
    })

    it('returns a confirmed row as-is when the CTE decided bypass (skip_verification=true or event verification off)', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.CONFIRMED })] })

        const rsvp = await saveRsvpWithInvitation(baseInput)

        expect(rsvp).toMatchObject({ status: RSVP_STATUS.CONFIRMED })
        expect(rsvp!.verificationTokenHash).toBeNull()
    })
})
