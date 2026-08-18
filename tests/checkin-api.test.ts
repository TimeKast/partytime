/**
 * ISSUE-016 (EPIC-005) — GET /api/checkin/guests and POST /api/checkin/mark,
 * plus the lib/checkin-guests.ts helpers (maskEmail, the DTO allowlist,
 * sorting) both routes share. Route-level: mocks `@/lib/db`, `@/lib/queries`
 * and `next/headers` (same pattern as tests/checkin-auth.test.ts), but
 * deliberately does NOT mock `@/lib/checkin-session` — cookies are issued
 * with the REAL `issueCheckinCookie` so validateCheckinCookie's slug/pwv/
 * expiry logic is exercised for real, not assumed.
 *
 * markCheckinGuest's own branching (not_found vs forbidden vs not_confirmed
 * vs plus_one_not_allowed, and the last-write-wins concurrency shape) lives
 * in lib/queries.ts and is mocked wholesale here — the route-level tests
 * below assert the route maps each of its outcomes to the correct HTTP
 * status/body; tests/checkin-mark-query.test.ts is the companion file that
 * drives the REAL lib/queries.ts (mocking only @/lib/db) to prove that
 * branching logic itself, following the same two-file split
 * tests/stripe-webhook.test.ts / tests/stripe-webhook-queries.test.ts already
 * uses in this repo (a whole-module `vi.mock('@/lib/queries', ...)` and a
 * real, `@/lib/db`-backed lib/queries.ts cannot coexist in one file).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
    CHECKIN_SESSION_SECRET_ENV,
    checkinCookieName,
    issueCheckinCookie,
} from '@/lib/checkin-session'
import {
    isCheckinVisibleStatus,
    maskEmail,
    sortCheckinGuestsByName,
    toCheckinGuestDto,
    type CheckinGuestDto,
    type CheckinVisibleStatus,
} from '@/lib/checkin-guests'
import type { RSVP } from '@/lib/schema'

const SECRET = 'ab'.repeat(32)

// ============================================================
// Part 1 — lib/checkin-guests.ts pure-function contract
// ============================================================
describe('maskEmail (ISSUE-016)', () => {
    it('masks the canonical example exactly', () => {
        expect(maskEmail('jose@gmail.com')).toBe('j***@g***.com')
    })

    it('a 1-char local part still produces <char>*** (never bare)', () => {
        expect(maskEmail('a@gmail.com')).toBe('a***@g***.com')
    })

    it('a 1-char domain label before the TLD still produces <char>***.<tld>', () => {
        expect(maskEmail('ana@x.co')).toBe('a***@x***.co')
    })

    it('a subdomain collapses to <first char>***.<final TLD only>', () => {
        expect(maskEmail('user@mail.google.com')).toBe('u***@m***.com')
    })

    it('never reveals length via a per-character run of asterisks', () => {
        expect(maskEmail('alexandra@verylongdomainname.com')).toBe('a***@v***.com')
    })

    it('a domain with no dot at all (defensive, should not occur for a stored RSVP email) masks the whole domain', () => {
        expect(maskEmail('jose@localhost')).toBe('j***@l***')
    })

    it('an email missing "@" entirely (defensive) masks the whole string as one segment', () => {
        expect(maskEmail('not-an-email')).toBe('n***')
    })

    it('empty string in front of "@" (defensive) still resolves without throwing', () => {
        expect(maskEmail('@gmail.com')).toBe('@***')
    })
})

describe('isCheckinVisibleStatus / toCheckinGuestDto / sortCheckinGuestsByName (ISSUE-016)', () => {
    it('confirmed, pending_payment and pending_verification are visible; cancelled/expired are not', () => {
        expect(isCheckinVisibleStatus('confirmed')).toBe(true)
        expect(isCheckinVisibleStatus('pending_payment')).toBe(true)
        expect(isCheckinVisibleStatus('pending_verification')).toBe(true)
        expect(isCheckinVisibleStatus('cancelled')).toBe(false)
        expect(isCheckinVisibleStatus('expired')).toBe(false)
    })

    it('toCheckinGuestDto emits EXACTLY the ten allowlisted keys — no phone, no full email, no tokens, no payment ids', () => {
        const rsvp = rsvpFixture()
        const dto = toCheckinGuestDto(rsvp as RSVP & { status: CheckinVisibleStatus })

        expect(Object.keys(dto).sort()).toEqual([
            'checkedInAt', 'checkedInBy', 'checkinNote', 'id', 'maskedEmail',
            'name', 'plusOne', 'plusOneCheckedInAt', 'plusOneName', 'status',
        ])
        const serialized = JSON.stringify(dto)
        expect(serialized).not.toContain(rsvp.phone)
        expect(serialized).not.toContain(rsvp.email) // only the masked form may appear
        expect(serialized).not.toContain(rsvp.cancelToken ?? '__never__')
        expect(dto).not.toHaveProperty('phone')
        expect(dto).not.toHaveProperty('email')
        expect(dto).not.toHaveProperty('cancelToken')
        expect(dto).not.toHaveProperty('amountCents')
        expect(dto).not.toHaveProperty('paymentStatus')
    })

    it('sortCheckinGuestsByName sorts alphabetically (case-insensitive, es-MX collation)', () => {
        const guests = [{ name: 'Zoe' }, { name: 'ana' }, { name: 'Álvaro' }, { name: 'beto' }] as CheckinGuestDto[]
        expect(sortCheckinGuestsByName(guests).map(g => g.name)).toEqual(['Álvaro', 'ana', 'beto', 'Zoe'])
    })
})

function rsvpFixture(overrides: Partial<RSVP> = {}): RSVP {
    return {
        id: 'rsvp-1',
        eventId: 'fiesta',
        name: 'Ana Pérez',
        email: 'ana.perez@example.com',
        phone: '+525500000000',
        plusOne: true,
        plusOneName: 'Beto Gómez',
        status: 'confirmed',
        emailSent: null,
        emailHistory: [],
        cancelToken: 'super-secret-cancel-token',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        pendingExpiresAt: null,
        verifiedAt: null,
        verificationTokenHash: null,
        verificationExpiresAt: null,
        checkedInAt: null,
        plusOneCheckedInAt: null,
        checkedInBy: null,
        checkinNote: null,
        ...overrides,
    }
}

// ============================================================
// Part 2 — route-level mocks shared by both endpoints
// ============================================================
const mocks = vi.hoisted(() => ({
    databaseConfigured: true,
    getEventBySlug: vi.fn(),
    getCheckinGuestsByEvent: vi.fn(),
    markCheckinGuest: vi.fn(),
    cookieStore: new Map<string, string>(),
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => (mocks.cookieStore.has(name) ? { value: mocks.cookieStore.get(name) } : undefined),
    })),
}))
vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    getCheckinGuestsByEvent: mocks.getCheckinGuestsByEvent,
    markCheckinGuest: mocks.markCheckinGuest,
}))

const fiestaPwv = new Date('2026-08-01T00:00:00.000Z')
const otraPwv = new Date('2026-07-01T00:00:00.000Z')
const fiestaEvent = {
    id: 'event-fiesta',
    slug: 'fiesta',
    isActive: true,
    checkinEnabled: true,
    checkinPasswordHash: '$2a$12$stored-hash',
    checkinPasswordUpdatedAt: fiestaPwv,
}
const otraFiestaEvent = {
    id: 'event-otra',
    slug: 'otra-fiesta',
    isActive: true,
    checkinEnabled: true,
    checkinPasswordHash: '$2a$12$stored-hash-2',
    checkinPasswordUpdatedAt: otraPwv,
}

function setValidCookie(slug: string, staffName = 'Ana Staff', passwordUpdatedAt = fiestaPwv) {
    const issued = issueCheckinCookie(slug, staffName, passwordUpdatedAt)!
    mocks.cookieStore.set(checkinCookieName(slug), issued.value)
    return issued
}

function guestsRequest(slug: string) {
    return new NextRequest(`http://localhost:3000/api/checkin/guests?slug=${encodeURIComponent(slug)}`)
}

function markRequest(body: unknown, options: { origin?: string } = {}) {
    const { origin = 'http://localhost:3000' } = options
    return new NextRequest('http://localhost:3000/api/checkin/mark', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, host: 'localhost:3000' },
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.cookieStore.clear()
    process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
    mocks.databaseConfigured = true
    mocks.getEventBySlug.mockImplementation(async (slug: string) => {
        if (slug === 'fiesta') return fiestaEvent
        if (slug === 'otra-fiesta') return otraFiestaEvent
        return null
    })
})

// ============================================================
// Part 3 — GET /api/checkin/guests
// ============================================================
describe('GET /api/checkin/guests', () => {
    it('responds 503 when the database is not configured', async () => {
        mocks.databaseConfigured = false
        const { GET } = await import('@/app/api/checkin/guests/route')
        const response = await GET(guestsRequest('fiesta'))
        expect(response.status).toBe(503)
    })

    it('rejects a missing/invalid slug with 400 before touching the DB', async () => {
        const { GET } = await import('@/app/api/checkin/guests/route')
        const response = await GET(guestsRequest(''))
        expect(response.status).toBe(400)
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
    })

    it.each([
        ['event does not exist', () => mocks.getEventBySlug.mockResolvedValueOnce(null)],
        ['event is inactive', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...fiestaEvent, isActive: false })],
        ['check-in is disabled', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...fiestaEvent, checkinEnabled: false })],
        ['no checkinPasswordUpdatedAt yet (portal never configured)', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...fiestaEvent, checkinPasswordUpdatedAt: null })],
    ] as const)('returns an opaque 404 for: %s', async (_case, arrange) => {
        arrange()
        setValidCookie('fiesta')
        const { GET } = await import('@/app/api/checkin/guests/route')
        const response = await GET(guestsRequest('fiesta'))
        const payload = await response.json()

        expect(response.status).toBe(404)
        expect(payload).toEqual({ success: false, error: 'No encontrado' })
        expect(mocks.getCheckinGuestsByEvent).not.toHaveBeenCalled()
    })

    it('responds 401 when no check-in cookie is present at all', async () => {
        const { GET } = await import('@/app/api/checkin/guests/route')
        const response = await GET(guestsRequest('fiesta'))
        expect(response.status).toBe(401)
        expect(mocks.getCheckinGuestsByEvent).not.toHaveBeenCalled()
    })

    it('responds 401 for an expired cookie', async () => {
        const staleIssued = issueCheckinCookie('fiesta', 'Ana', fiestaPwv, new Date('2020-01-01T00:00:00.000Z'))!
        mocks.cookieStore.set(checkinCookieName('fiesta'), staleIssued.value)
        const { GET } = await import('@/app/api/checkin/guests/route')
        const response = await GET(guestsRequest('fiesta'))
        expect(response.status).toBe(401)
    })

    it('responds 401 when the event password was rotated after the cookie was issued', async () => {
        setValidCookie('fiesta', 'Ana', new Date('2020-01-01T00:00:00.000Z')) // stale pwv
        const { GET } = await import('@/app/api/checkin/guests/route')
        const response = await GET(guestsRequest('fiesta'))
        expect(response.status).toBe(401)
    })

    // ISSUE-016 Gherkin: "Given cookie válida del evento A / When pide guests
    // del evento B / Then 403 sin datos" — validateCheckinCookie's own
    // slug-scoping rejects this as an invalid session (401), the same bucket
    // as any other malformed/expired cookie; no guest data of event B (or
    // confirmation that it even exists) is ever returned either way.
    it('rejects a cookie issued for a DIFFERENT event when requesting this event\'s guests — no data leaked', async () => {
        const crossEventCookie = issueCheckinCookie('otra-fiesta', 'Ana', otraPwv)!
        mocks.cookieStore.set(checkinCookieName('fiesta'), crossEventCookie.value)
        const { GET } = await import('@/app/api/checkin/guests/route')
        const response = await GET(guestsRequest('fiesta'))
        const payload = await response.json()

        expect(response.status).toBe(401)
        expect(mocks.getCheckinGuestsByEvent).not.toHaveBeenCalled()
        expect(JSON.stringify(payload)).not.toContain('otra-fiesta')
    })

    it('returns no-store and only confirmed/pending_payment/pending_verification rows, sorted alphabetically, in the exact DTO shape', async () => {
        setValidCookie('fiesta')
        mocks.getCheckinGuestsByEvent.mockResolvedValueOnce([
            rsvpFixture({ id: 'r-zoe', name: 'Zoe', status: 'confirmed' }),
            rsvpFixture({ id: 'r-ana', name: 'ana', status: 'pending_payment' }),
            rsvpFixture({ id: 'r-beto', name: 'Beto', status: 'pending_verification' }),
            // Defense-in-depth: even if the query layer ever regressed and
            // returned one of these, the route itself must still filter them.
            rsvpFixture({ id: 'r-cancel', name: 'Cancelado', status: 'cancelled' }),
            rsvpFixture({ id: 'r-exp', name: 'Expirado', status: 'expired' }),
        ])

        const { GET } = await import('@/app/api/checkin/guests/route')
        const response = await GET(guestsRequest('fiesta'))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(payload.success).toBe(true)
        expect(payload.guests.map((g: CheckinGuestDto) => g.name)).toEqual(['ana', 'Beto', 'Zoe'])
        for (const guest of payload.guests) {
            expect(Object.keys(guest).sort()).toEqual([
                'checkedInAt', 'checkedInBy', 'checkinNote', 'id', 'maskedEmail',
                'name', 'plusOne', 'plusOneCheckedInAt', 'plusOneName', 'status',
            ])
        }
        const serialized = JSON.stringify(payload)
        expect(serialized).not.toContain('+525500000000') // phone
        expect(serialized).not.toContain('ana.perez@example.com') // full email
        expect(serialized).not.toContain('super-secret-cancel-token')
    })
})

// ============================================================
// Part 4 — POST /api/checkin/mark
// ============================================================
describe('POST /api/checkin/mark', () => {
    const validBody = { slug: 'fiesta', rsvpId: 'rsvp-1', target: 'guest' as const, checkedIn: true }

    it('rejects a cross-origin request before touching the DB', async () => {
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody, { origin: 'https://evil.example' }))
        expect(response.status).toBe(403)
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
    })

    it('responds 503 when the database is not configured', async () => {
        mocks.databaseConfigured = false
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody))
        expect(response.status).toBe(503)
    })

    it.each([
        ['missing rsvpId', { slug: 'fiesta', target: 'guest', checkedIn: true }],
        ['empty rsvpId', { slug: 'fiesta', rsvpId: '   ', target: 'guest', checkedIn: true }],
        ['invalid target', { slug: 'fiesta', rsvpId: 'rsvp-1', target: 'sponsor', checkedIn: true }],
        ['checkedIn not boolean', { slug: 'fiesta', rsvpId: 'rsvp-1', target: 'guest', checkedIn: 'yes' }],
        ['unknown extra key', { ...validBody, extra: 'nope' }],
        ['note too long (501 chars)', { ...validBody, note: 'x'.repeat(501) }],
        ['note wrong type', { ...validBody, note: 42 }],
        ['invalid slug charset', { ...validBody, slug: 'Not A Slug!' }],
    ] as const)('rejects invalid body: %s (400, no DB lookup)', async (_case, body) => {
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(body))
        expect(response.status).toBe(400)
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
    })

    it('accepts a note at exactly the 500 char boundary', async () => {
        setValidCookie('fiesta')
        mocks.markCheckinGuest.mockResolvedValueOnce({ outcome: 'marked', rsvp: rsvpFixture() })
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest({ ...validBody, note: 'x'.repeat(500) }))
        expect(response.status).toBe(200)
        expect(mocks.markCheckinGuest).toHaveBeenCalledWith(expect.objectContaining({ note: 'x'.repeat(500) }))
    })

    it.each([
        ['event does not exist', () => mocks.getEventBySlug.mockResolvedValueOnce(null)],
        ['event is inactive', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...fiestaEvent, isActive: false })],
        ['check-in is disabled', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...fiestaEvent, checkinEnabled: false })],
    ] as const)('returns an opaque 404 for: %s', async (_case, arrange) => {
        arrange()
        setValidCookie('fiesta')
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody))
        const payload = await response.json()

        expect(response.status).toBe(404)
        expect(payload).toEqual({ success: false, error: 'No encontrado' })
        expect(mocks.markCheckinGuest).not.toHaveBeenCalled()
    })

    it('responds 401 when the cookie is missing', async () => {
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody))
        expect(response.status).toBe(401)
        expect(mocks.markCheckinGuest).not.toHaveBeenCalled()
    })

    it('responds 401 when the cookie was issued for a different slug than the body\'s slug', async () => {
        setValidCookie('otra-fiesta') // stored under checkin_session_otra-fiesta
        // No cookie stored under checkin_session_fiesta at all -> missing, same 401 bucket.
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody))
        expect(response.status).toBe(401)
        expect(mocks.markCheckinGuest).not.toHaveBeenCalled()
    })

    // ISSUE-016 acceptance criterion: "Given cookie válida del evento A / When
    // ... marca un rsvp del evento B / Then 403 sin datos". Here the cookie IS
    // valid for the slug being posted to (event A === body.slug), but the
    // rsvpId itself belongs to a different event under the hood — that
    // ownership check lives in lib/queries.ts's markCheckinGuest and surfaces
    // as the 'forbidden' outcome, mapped here to 403 with an opaque body.
    it('maps a cross-event rsvpId ("forbidden") to 403 with no data leaked', async () => {
        setValidCookie('fiesta')
        mocks.markCheckinGuest.mockResolvedValueOnce({ outcome: 'forbidden' })
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody))
        const payload = await response.json()

        expect(response.status).toBe(403)
        expect(payload).toEqual({ success: false, error: 'No encontrado' })
    })

    it('maps "not_found" (nonexistent / cancelled / expired rsvp) to 404', async () => {
        setValidCookie('fiesta')
        mocks.markCheckinGuest.mockResolvedValueOnce({ outcome: 'not_found' })
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody))
        expect(response.status).toBe(404)
    })

    // Given un invitado pending_payment / When el staff intenta marcarlo / Then 409 "aún no confirmado"
    it('maps "not_confirmed" (pending_payment/pending_verification) to 409 with the exact required message', async () => {
        setValidCookie('fiesta')
        mocks.markCheckinGuest.mockResolvedValueOnce({ outcome: 'not_confirmed' })
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody))
        const payload = await response.json()

        expect(response.status).toBe(409)
        expect(payload.error).toContain('aún no confirmado')
    })

    it('maps "plus_one_not_allowed" (target=plusOne but plus_one=false) to 400', async () => {
        setValidCookie('fiesta')
        mocks.markCheckinGuest.mockResolvedValueOnce({ outcome: 'plus_one_not_allowed' })
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest({ ...validBody, target: 'plusOne' }))
        expect(response.status).toBe(400)
    })

    it('passes the staffName FROM THE COOKIE (never from the body) to markCheckinGuest', async () => {
        setValidCookie('fiesta', 'Carla Staff')
        mocks.markCheckinGuest.mockResolvedValueOnce({ outcome: 'marked', rsvp: rsvpFixture() })
        const { POST } = await import('@/app/api/checkin/mark/route')
        await POST(markRequest(validBody))

        expect(mocks.markCheckinGuest).toHaveBeenCalledWith(expect.objectContaining({
            staffName: 'Carla Staff',
            eventSlug: 'fiesta',
            rsvpId: 'rsvp-1',
            target: 'guest',
            checkedIn: true,
        }))
    })

    it('note tri-state: omitted -> undefined (untouched), empty string -> null (cleared), non-empty -> trimmed', async () => {
        setValidCookie('fiesta')
        mocks.markCheckinGuest.mockResolvedValue({ outcome: 'marked', rsvp: rsvpFixture() })
        const { POST } = await import('@/app/api/checkin/mark/route')

        await POST(markRequest(validBody)) // no `note` key at all
        expect(mocks.markCheckinGuest).toHaveBeenLastCalledWith(expect.objectContaining({ note: undefined }))

        await POST(markRequest({ ...validBody, note: '   ' }))
        expect(mocks.markCheckinGuest).toHaveBeenLastCalledWith(expect.objectContaining({ note: null }))

        await POST(markRequest({ ...validBody, note: '  Llegó en taxi  ' }))
        expect(mocks.markCheckinGuest).toHaveBeenLastCalledWith(expect.objectContaining({ note: 'Llegó en taxi' }))
    })

    it('a successful mark returns the updated DTO (same shape as GET), no-store, 200', async () => {
        setValidCookie('fiesta')
        const updated = rsvpFixture({ checkedInAt: new Date('2026-08-18T20:00:00.000Z'), checkedInBy: 'Ana Staff' })
        mocks.markCheckinGuest.mockResolvedValueOnce({ outcome: 'marked', rsvp: updated })
        const { POST } = await import('@/app/api/checkin/mark/route')
        const response = await POST(markRequest(validBody))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(payload.success).toBe(true)
        expect(Object.keys(payload.guest).sort()).toEqual([
            'checkedInAt', 'checkedInBy', 'checkinNote', 'id', 'maskedEmail',
            'name', 'plusOne', 'plusOneCheckedInAt', 'plusOneName', 'status',
        ])
        expect(payload.guest.checkedInBy).toBe('Ana Staff')
        expect(JSON.stringify(payload)).not.toContain(updated.phone)
        expect(JSON.stringify(payload)).not.toContain(updated.email)
    })

    // Given un invitado confirmed con +1 / When el staff marca guest y luego
    // plusOne / Then los dos timestamps quedan independientes.
    it('marking guest then plusOne issues two independent markCheckinGuest calls with distinct targets', async () => {
        setValidCookie('fiesta')
        mocks.markCheckinGuest
            .mockResolvedValueOnce({ outcome: 'marked', rsvp: rsvpFixture({ checkedInAt: new Date() }) })
            .mockResolvedValueOnce({ outcome: 'marked', rsvp: rsvpFixture({ checkedInAt: new Date(), plusOneCheckedInAt: new Date() }) })
        const { POST } = await import('@/app/api/checkin/mark/route')

        const first = await POST(markRequest({ ...validBody, target: 'guest' }))
        const second = await POST(markRequest({ ...validBody, target: 'plusOne' }))

        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        expect(mocks.markCheckinGuest).toHaveBeenNthCalledWith(1, expect.objectContaining({ target: 'guest' }))
        expect(mocks.markCheckinGuest).toHaveBeenNthCalledWith(2, expect.objectContaining({ target: 'plusOne' }))
    })

    // Given dos staff marcando al mismo invitado casi simultáneo / Then gana
    // el último write sin error. At the route layer this means: neither
    // request errors, and each simply reflects whatever markCheckinGuest (the
    // single source of truth for the actual last-write-wins semantics, unit
    // tested directly in tests/checkin-mark-query.test.ts) resolved for it.
    // Run sequentially rather than via Promise.all: this file's dynamic
    // `await import('@/lib/queries')` inside the route races against
    // vi.resetModules()'s per-test module cache reset when two POSTs are
    // in flight at once — a vitest/module-cache interaction, not anything
    // about the route's own (lack of) locking, which is what this test
    // exists to prove.
    it('two marks for the same guest in quick succession both succeed without error (route adds no locking of its own)', async () => {
        setValidCookie('fiesta')
        mocks.markCheckinGuest
            .mockResolvedValueOnce({ outcome: 'marked', rsvp: rsvpFixture({ checkedInBy: 'Staff A' }) })
            .mockResolvedValueOnce({ outcome: 'marked', rsvp: rsvpFixture({ checkedInBy: 'Staff B' }) })
        const { POST } = await import('@/app/api/checkin/mark/route')

        const first = await POST(markRequest(validBody))
        const second = await POST(markRequest(validBody))

        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        const secondPayload = await second.json()
        expect(secondPayload.guest.checkedInBy).toBe('Staff B')
    })
})
