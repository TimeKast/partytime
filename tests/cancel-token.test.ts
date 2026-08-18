import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import nodeCrypto, { createHash } from 'node:crypto'

// ISSUE-019: HMAC hardening of the cancel-token. Locks in:
//   - new format is a full 64-hex-char HMAC-SHA256, never truncated
//   - legacy 32-hex-char format (pre-2026-08-18 emails) still validates,
//     but only while CANCEL_TOKEN_SECRET is configured
//   - no CANCEL_TOKEN_SECRET => generate/validate throw, and the three
//     cancel-token routes (get/update/cancel) fail closed with 503
//   - no plain `===` on token strings — comparisons go through
//     crypto.timingSafeEqual (lib/timing-safe.ts)

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
    db: { select: selectMock },
    rsvps: {},
    events: {},
    appSettings: {},
    rsvpInvitationLinks: {},
    rsvpPayments: {},
}))

import {
    generateCancelToken,
    validateCancelToken,
    CANCEL_TOKEN_SECRET_MISSING_MESSAGE,
} from '@/lib/queries'

const SECRET = 'test-cancel-token-secret'
const ORIGINAL_SECRET = process.env.CANCEL_TOKEN_SECRET

function restoreSecret() {
    if (ORIGINAL_SECRET === undefined) delete process.env.CANCEL_TOKEN_SECRET
    else process.env.CANCEL_TOKEN_SECRET = ORIGINAL_SECRET
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

/** Reference implementation of the pre-ISSUE-019 scheme, for test fixtures only. */
function legacyToken(rsvpId: string, email: string, secret: string): string {
    return createHash('sha256').update(`${rsvpId}-${email}-${secret}`).digest('hex').substring(0, 32)
}

describe('cancel token (ISSUE-019 — HMAC hardening)', () => {
    beforeEach(() => {
        process.env.CANCEL_TOKEN_SECRET = SECRET
        selectMock.mockReset()
    })

    afterEach(() => {
        restoreSecret()
        vi.restoreAllMocks()
    })

    describe('generateCancelToken', () => {
        it('is deterministic for the same rsvpId + email', () => {
            const a = generateCancelToken('rsvp-1', 'guest@example.com')
            const b = generateCancelToken('rsvp-1', 'guest@example.com')
            expect(a).toBe(b)
        })

        it('produces a full 64-hex-char HMAC-SHA256 digest, not truncated', () => {
            const token = generateCancelToken('rsvp-1', 'guest@example.com')
            expect(token).toHaveLength(64)
            expect(token).toMatch(/^[a-f0-9]{64}$/)
        })

        it('differs when the email differs', () => {
            expect(generateCancelToken('rsvp-1', 'a@example.com')).not.toBe(
                generateCancelToken('rsvp-1', 'b@example.com'),
            )
        })

        it('differs when the rsvpId differs', () => {
            expect(generateCancelToken('rsvp-1', 'guest@example.com')).not.toBe(
                generateCancelToken('rsvp-2', 'guest@example.com'),
            )
        })

        it('is deterministic across different email casing (email is lowercased before hashing)', () => {
            const lower = generateCancelToken('rsvp-1', 'guest@example.com')
            const upper = generateCancelToken('rsvp-1', 'GUEST@EXAMPLE.COM')
            const mixed = generateCancelToken('rsvp-1', 'Guest@Example.Com')
            expect(upper).toBe(lower)
            expect(mixed).toBe(lower)
        })
    })

    describe('validateCancelToken — new format', () => {
        it('validates a matching token and rejects a wrong one', () => {
            const token = generateCancelToken('rsvp-1', 'guest@example.com')
            expect(validateCancelToken(token, 'rsvp-1', 'guest@example.com')).toBe(true)
            expect(validateCancelToken('a'.repeat(64), 'rsvp-1', 'guest@example.com')).toBe(false)
        })

        it('rejects a well-formed but unrelated 64-char hex string', () => {
            expect(validateCancelToken('0'.repeat(64), 'rsvp-1', 'guest@example.com')).toBe(false)
        })
    })

    describe('validateCancelToken — legacy 32-char format (pre-2026-08-18 emails)', () => {
        // TODO(2026-08-18): retire this describe block along with the legacy
        // branch in lib/queries.ts's validateCancelToken once the next mass
        // event has concluded and no outstanding legacy links remain in the wild.
        it('accepts the legacy 32-hex-char token when CANCEL_TOKEN_SECRET is configured', () => {
            const legacy = legacyToken('rsvp-1', 'guest@example.com', SECRET)
            expect(legacy).toHaveLength(32)
            expect(validateCancelToken(legacy, 'rsvp-1', 'guest@example.com')).toBe(true)
        })

        it('rejects a legacy-shaped token that does not match', () => {
            expect(validateCancelToken('0'.repeat(32), 'rsvp-1', 'guest@example.com')).toBe(false)
        })

        it('both the new HMAC token and the legacy token validate for the same rsvp/email', () => {
            const modern = generateCancelToken('rsvp-1', 'guest@example.com')
            const legacy = legacyToken('rsvp-1', 'guest@example.com', SECRET)
            expect(validateCancelToken(modern, 'rsvp-1', 'guest@example.com')).toBe(true)
            expect(validateCancelToken(legacy, 'rsvp-1', 'guest@example.com')).toBe(true)
        })

        it('never validates a token minted with the old hardcoded default-secret fallback', () => {
            // Pre-ISSUE-019, an unconfigured CANCEL_TOKEN_SECRET fell back to the
            // literal 'default-secret'. That literal is gone from the source; a
            // token computed against it must never validate, even with a real
            // secret configured.
            const defaultSecretToken = legacyToken('rsvp-1', 'guest@example.com', 'default-secret')
            expect(validateCancelToken(defaultSecretToken, 'rsvp-1', 'guest@example.com')).toBe(false)
        })
    })

    describe('timing-safe comparison', () => {
        it('routes the new-format comparison through crypto.timingSafeEqual, not ===', () => {
            const spy = vi.spyOn(nodeCrypto, 'timingSafeEqual')
            const token = generateCancelToken('rsvp-1', 'guest@example.com')
            validateCancelToken(token, 'rsvp-1', 'guest@example.com')
            expect(spy).toHaveBeenCalled()
        })

        it('routes the legacy-format comparison through crypto.timingSafeEqual, not ===', () => {
            const spy = vi.spyOn(nodeCrypto, 'timingSafeEqual')
            const legacy = legacyToken('rsvp-1', 'guest@example.com', SECRET)
            validateCancelToken(legacy, 'rsvp-1', 'guest@example.com')
            expect(spy).toHaveBeenCalled()
        })

        it('has no === at all in the cancel-token functions (generate/legacy/validate)', async () => {
            const fs = await import('node:fs')
            const path = await import('node:path')
            const source = fs.readFileSync(
                path.join(process.cwd(), 'lib/queries.ts'),
                'utf8',
            )
            // Isolate the token-handling region (generateCancelToken through the
            // end of validateCancelToken, right before "Event Functions") so this
            // doesn't false-positive on unrelated `===` elsewhere in the file.
            const start = source.indexOf('export function generateCancelToken')
            const end = source.indexOf('// Event Functions', start)
            expect(start).toBeGreaterThan(-1)
            expect(end).toBeGreaterThan(start)
            const tokenRegion = source.slice(start, end)
            // Excludes the decorative "// ====...====" section-separator
            // comments (long runs of '=' chars), matching only an actual
            // strict-equality operator (exactly 3 '=' not adjacent to more).
            expect(tokenRegion).not.toMatch(/(?<!=)===(?!=)/)
        })
    })

    describe('fail-closed when CANCEL_TOKEN_SECRET is not configured', () => {
        beforeEach(() => {
            delete process.env.CANCEL_TOKEN_SECRET
        })

        it('generateCancelToken throws instead of falling back to a default secret', () => {
            expect(() => generateCancelToken('rsvp-1', 'guest@example.com')).toThrow(
                CANCEL_TOKEN_SECRET_MISSING_MESSAGE,
            )
        })

        it('validateCancelToken throws instead of silently rejecting', () => {
            expect(() => validateCancelToken('anything', 'rsvp-1', 'guest@example.com')).toThrow(
                CANCEL_TOKEN_SECRET_MISSING_MESSAGE,
            )
        })

        it('no default-secret-derived token validates, because validation itself throws', () => {
            const defaultSecretToken = legacyToken('rsvp-1', 'guest@example.com', 'default-secret')
            expect(() => validateCancelToken(defaultSecretToken, 'rsvp-1', 'guest@example.com')).toThrow()
        })
    })

    describe('the three cancel-token routes fail closed (503) without CANCEL_TOKEN_SECRET', () => {
        const rsvpRow = {
            id: 'rsvp-1',
            eventId: 'fiesta',
            name: 'Alex',
            email: 'guest@example.com',
            phone: '+525500000000',
            plusOne: false,
            plusOneName: null,
            status: 'confirmed',
            emailSent: null,
            emailHistory: [],
            createdAt: new Date('2026-08-17T00:00:00.000Z'),
        }

        beforeEach(() => {
            delete process.env.CANCEL_TOKEN_SECRET
        })

        it('GET /api/rsvp/get -> 503', async () => {
            mockSelectOnce([rsvpRow]) // getRSVPById

            const { GET } = await import('@/app/api/rsvp/get/route')
            const response = await GET(
                new NextRequest('http://localhost:3000/api/rsvp/get?rsvpId=rsvp-1&token=anything'),
            )

            expect(response.status).toBe(503)
        })

        it('POST /api/rsvp/update -> 503', async () => {
            mockSelectOnce([rsvpRow]) // getRSVPById

            const { POST } = await import('@/app/api/rsvp/update/route')
            const response = await POST(
                new NextRequest('http://localhost:3000/api/rsvp/update', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        rsvpId: 'rsvp-1',
                        token: 'anything',
                        name: 'Alex',
                        email: 'guest@example.com',
                        phone: '+525500000000',
                        plusOne: false,
                    }),
                }),
            )

            expect(response.status).toBe(503)
        })

        it('POST /api/rsvp/cancel -> 503', async () => {
            mockSelectOnce([rsvpRow]) // getRSVPById inside cancelRSVP

            const { POST } = await import('@/app/api/rsvp/cancel/route')
            const response = await POST(
                new NextRequest('http://localhost:3000/api/rsvp/cancel', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ rsvpId: 'rsvp-1', token: 'anything' }),
                }),
            )

            expect(response.status).toBe(503)
        })
    })
})
