import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
    CHECKIN_SESSION_SECRET_ENV,
    checkinCookieName,
    issueCheckinCookie,
    isCheckinSessionConfigured,
    validateCheckinCookie,
} from '@/lib/checkin-session'

const SECRET = 'ab'.repeat(32) // 64 hex chars
const originalSecret = process.env[CHECKIN_SESSION_SECRET_ENV]

function restoreSecret() {
    if (originalSecret === undefined) delete process.env[CHECKIN_SESSION_SECRET_ENV]
    else process.env[CHECKIN_SESSION_SECRET_ENV] = originalSecret
}

// ============================================================
// Part 1 — lib/checkin-session.ts (cookie issue/validate contract)
// ============================================================
describe('lib/checkin-session.ts', () => {
    afterEach(() => restoreSecret())

    it('fails closed (returns null / unavailable) when CHECKIN_SESSION_SECRET is unset', () => {
        delete process.env[CHECKIN_SESSION_SECRET_ENV]
        expect(isCheckinSessionConfigured()).toBe(false)
        expect(issueCheckinCookie('fiesta', 'Ana', new Date())).toBeNull()
        expect(validateCheckinCookie('anything.here', 'fiesta', new Date())).toEqual({
            ok: false,
            reason: 'unavailable',
        })
    })

    it('fails closed when CHECKIN_SESSION_SECRET is malformed (not 64 hex chars)', () => {
        process.env[CHECKIN_SESSION_SECRET_ENV] = 'not-hex-and-too-short'
        expect(issueCheckinCookie('fiesta', 'Ana', new Date())).toBeNull()
        expect(isCheckinSessionConfigured()).toBe(false)
    })

    it('never falls back to a default/hardcoded secret — issuance requires the env var every time', () => {
        delete process.env[CHECKIN_SESSION_SECRET_ENV]
        expect(issueCheckinCookie('fiesta', 'Ana', new Date())).toBeNull()
    })

    it('issues a cookie named checkin_session_<slug> that validates for the exact same slug and pwv', () => {
        process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
        const passwordUpdatedAt = new Date('2026-08-01T00:00:00.000Z')
        const now = new Date('2026-08-18T12:00:00.000Z')

        const issued = issueCheckinCookie('fiesta', 'Ana Staff', passwordUpdatedAt, now)
        expect(issued).not.toBeNull()
        expect(issued!.name).toBe(checkinCookieName('fiesta'))
        expect(issued!.maxAgeSeconds).toBe(24 * 60 * 60)

        const validation = validateCheckinCookie(issued!.value, 'fiesta', passwordUpdatedAt, now)
        expect(validation).toEqual({
            ok: true,
            payload: {
                slug: 'fiesta',
                staffName: 'Ana Staff',
                pwv: passwordUpdatedAt.getTime(),
                exp: now.getTime() + 24 * 60 * 60 * 1000,
            },
        })
    })

    it('rejects a cookie presented for a different slug than it was issued for (slug cruzado)', () => {
        process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
        const passwordUpdatedAt = new Date('2026-08-01T00:00:00.000Z')
        const issued = issueCheckinCookie('fiesta', 'Ana', passwordUpdatedAt)!

        expect(validateCheckinCookie(issued.value, 'otra-fiesta', passwordUpdatedAt))
            .toEqual({ ok: false, reason: 'slug_mismatch' })
    })

    it('rejects a cookie once the password has been rotated (pwv mismatch) without any DB write', () => {
        process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
        const issuedAt = new Date('2026-08-01T00:00:00.000Z')
        const rotatedAt = new Date('2026-08-10T00:00:00.000Z')
        const issued = issueCheckinCookie('fiesta', 'Ana', issuedAt)!

        expect(validateCheckinCookie(issued.value, 'fiesta', rotatedAt))
            .toEqual({ ok: false, reason: 'password_rotated' })
    })

    it('rejects an expired cookie', () => {
        process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
        const passwordUpdatedAt = new Date('2026-08-01T00:00:00.000Z')
        const issuedAt = new Date('2026-08-01T00:00:00.000Z')
        const issued = issueCheckinCookie('fiesta', 'Ana', passwordUpdatedAt, issuedAt)!

        const justAfterExpiry = new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000 + 1)
        expect(validateCheckinCookie(issued.value, 'fiesta', passwordUpdatedAt, justAfterExpiry))
            .toEqual({ ok: false, reason: 'expired' })
    })

    it('rejects a tampered signature (timing-safe compare fails closed)', () => {
        process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
        const passwordUpdatedAt = new Date('2026-08-01T00:00:00.000Z')
        const issued = issueCheckinCookie('fiesta', 'Ana', passwordUpdatedAt)!
        const [payloadPart] = issued.value.split('.')
        const tampered = `${payloadPart}.${'A'.repeat(43)}`

        expect(validateCheckinCookie(tampered, 'fiesta', passwordUpdatedAt))
            .toEqual({ ok: false, reason: 'malformed' })
    })

    it('rejects a cookie signed under one secret when validated under a different secret (rotation invalidates all sessions)', () => {
        process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
        const passwordUpdatedAt = new Date('2026-08-01T00:00:00.000Z')
        const issued = issueCheckinCookie('fiesta', 'Ana', passwordUpdatedAt)!

        process.env[CHECKIN_SESSION_SECRET_ENV] = 'cd'.repeat(32)
        expect(validateCheckinCookie(issued.value, 'fiesta', passwordUpdatedAt))
            .toEqual({ ok: false, reason: 'malformed' })
    })

    it('rejects malformed cookie shapes (missing/empty parts)', () => {
        process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
        const now = new Date()
        for (const bad of [null, undefined, '', 'no-dot-here', '.missing-payload', 'missing-sig.']) {
            expect(validateCheckinCookie(bad as string | null, 'fiesta', now))
                .toEqual({ ok: false, reason: 'malformed' })
        }
    })
})

// ============================================================
// Route-level mocks shared by /api/checkin/auth and
// /api/admin/checkin-config — one registration per module per file.
// ============================================================
const mocks = vi.hoisted(() => ({
    databaseConfigured: true,
    getEventBySlug: vi.fn(),
    updateEvent: vi.fn(),
    cookieSet: vi.fn(),
    cookieGetValue: 'session-token' as string | undefined,
    bcryptCompare: vi.fn(),
    bcryptHashSync: vi.fn(() => 'dummy-hash'),
    validateSession: vi.fn(),
    userHasEventAccess: vi.fn(),
    hashPassword: vi.fn(async (password: string) => `hashed(${password})`),
}))

vi.mock('bcryptjs', () => ({
    default: {
        hashSync: mocks.bcryptHashSync,
        compare: mocks.bcryptCompare,
    },
}))
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        set: mocks.cookieSet,
        get: () => mocks.cookieGetValue ? { value: mocks.cookieGetValue } : undefined,
    })),
}))
vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    updateEvent: mocks.updateEvent,
}))
vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
    hashPassword: mocks.hashPassword,
}))
vi.mock('@/lib/user-queries', () => ({ userHasEventAccess: mocks.userHasEventAccess }))

// ============================================================
// Part 2 — POST /api/checkin/auth
// ============================================================
const configuredEvent = {
    id: 'event-uuid',
    slug: 'fiesta',
    isActive: true,
    checkinEnabled: true,
    checkinPasswordHash: '$2a$12$stored-hash-placeholder',
    checkinPasswordUpdatedAt: new Date('2026-08-01T00:00:00.000Z'),
}

function authRequest(body: unknown, options: { ip?: string; origin?: string } = {}) {
    const { ip = '198.51.100.10', origin = 'http://localhost:3000' } = options
    return new NextRequest('http://localhost:3000/api/checkin/auth', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin,
            host: 'localhost:3000',
            'x-forwarded-for': ip,
        },
        body: JSON.stringify(body),
    })
}

describe('POST /api/checkin/auth', () => {
    beforeEach(() => {
        // Fresh module instance per test: the route's rate limiters
        // (checkinIpLimiter/checkinSlugLimiter) are module-scoped singletons,
        // and several tests intentionally exhaust a budget — resetting the
        // module registry keeps every test's IP/slug attempt count isolated.
        vi.resetModules()
        vi.clearAllMocks()
        process.env[CHECKIN_SESSION_SECRET_ENV] = SECRET
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(configuredEvent)
        mocks.bcryptCompare.mockResolvedValue(true)
    })
    afterEach(() => restoreSecret())

    it('computes its timing-equalization DUMMY_HASH at bcrypt cost 12 (same cost as lib/auth-utils.ts)', async () => {
        await import('@/app/api/checkin/auth/route')
        expect(mocks.bcryptHashSync).toHaveBeenCalledWith(expect.any(String), 12)
    })

    it('responds 503 (fail closed) when CHECKIN_SESSION_SECRET is not configured', async () => {
        delete process.env[CHECKIN_SESSION_SECRET_ENV]
        const { POST } = await import('@/app/api/checkin/auth/route')
        const response = await POST(authRequest(
            { slug: 'fiesta', password: 'fiesta2026', staffName: 'Ana' },
            { ip: '203.0.113.1' },
        ))

        expect(response.status).toBe(503)
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
    })

    it('rejects an explicit cross-origin request before checking the secret or touching the DB', async () => {
        const { POST } = await import('@/app/api/checkin/auth/route')
        const response = await POST(authRequest(
            { slug: 'fiesta', password: 'fiesta2026', staffName: 'Ana' },
            { ip: '203.0.113.2', origin: 'https://evil.example' },
        ))

        expect(response.status).toBe(403)
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
    })

    it('issues a valid signed cookie scoped to the slug on a correct password + staff name', async () => {
        const { POST } = await import('@/app/api/checkin/auth/route')
        const response = await POST(authRequest(
            { slug: 'fiesta', password: 'fiesta2026', staffName: 'Ana Staff' },
            { ip: '203.0.113.3' },
        ))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(payload).toEqual({ success: true, staffName: 'Ana Staff' })
        expect(mocks.cookieSet).toHaveBeenCalledTimes(1)
        const [cookieName, cookieValue, cookieOptions] = mocks.cookieSet.mock.calls[0]
        expect(cookieName).toBe(checkinCookieName('fiesta'))
        expect(cookieOptions).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60 })

        const validation = validateCheckinCookie(cookieValue, 'fiesta', configuredEvent.checkinPasswordUpdatedAt)
        expect(validation.ok).toBe(true)
    })

    it.each([
        ['event does not exist', () => mocks.getEventBySlug.mockResolvedValueOnce(null)],
        ['event is inactive', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...configuredEvent, isActive: false })],
        ['check-in is disabled', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...configuredEvent, checkinEnabled: false })],
        ['no password hash configured yet', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...configuredEvent, checkinPasswordHash: null })],
        ['checkinPasswordUpdatedAt missing despite a hash (inconsistent state)', () => mocks.getEventBySlug.mockResolvedValueOnce({ ...configuredEvent, checkinPasswordUpdatedAt: null })],
    ] as const)('returns the exact same opaque 404 for: %s', async (_case, arrange) => {
        arrange()
        const { POST } = await import('@/app/api/checkin/auth/route')
        const response = await POST(authRequest(
            { slug: 'fiesta', password: 'whatever', staffName: 'Ana' },
            { ip: `203.0.113.${Math.floor(Math.random() * 200) + 10}` },
        ))
        const payload = await response.json()

        expect(response.status).toBe(404)
        expect(payload).toEqual({ success: false, error: 'No encontrado' })
        // Timing-equalization: the dummy compare still runs on every opaque branch.
        expect(mocks.bcryptCompare).toHaveBeenCalledWith('whatever', 'dummy-hash')
    })

    it('produces byte-identical 404 bodies across every opaque reason (indistinguishable from the outside)', async () => {
        const { POST } = await import('@/app/api/checkin/auth/route')

        mocks.getEventBySlug.mockResolvedValueOnce(null)
        const missing = await POST(authRequest({ slug: 'no-such-event', password: 'x', staffName: 'Ana' }, { ip: '203.0.113.20' }))
        mocks.getEventBySlug.mockResolvedValueOnce({ ...configuredEvent, checkinEnabled: false })
        const disabled = await POST(authRequest({ slug: 'fiesta', password: 'x', staffName: 'Ana' }, { ip: '203.0.113.21' }))

        expect(missing.status).toBe(disabled.status)
        expect(await missing.json()).toEqual(await disabled.json())
    })

    it('returns 401 (not the opaque 404) for a wrong password against a real, configured portal', async () => {
        mocks.bcryptCompare.mockResolvedValueOnce(false)
        const { POST } = await import('@/app/api/checkin/auth/route')
        const response = await POST(authRequest(
            { slug: 'fiesta', password: 'wrong-password', staffName: 'Ana' },
            { ip: '203.0.113.30' },
        ))

        expect(response.status).toBe(401)
        expect(mocks.cookieSet).not.toHaveBeenCalled()
    })

    it('rejects staffName outside the 2-120 char bound before ever touching the DB', async () => {
        const { POST } = await import('@/app/api/checkin/auth/route')
        const tooShort = await POST(authRequest({ slug: 'fiesta', password: 'x', staffName: 'A' }, { ip: '203.0.113.40' }))
        const tooLong = await POST(authRequest({ slug: 'fiesta', password: 'x', staffName: 'A'.repeat(121) }, { ip: '203.0.113.41' }))

        expect([tooShort.status, tooLong.status]).toEqual([400, 400])
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
    })

    it('the IP rate limiter cuts before the next bcrypt verification once 5 attempts from the same IP are spent', async () => {
        const { POST } = await import('@/app/api/checkin/auth/route')
        const ip = '203.0.113.50'

        for (let attempt = 0; attempt < 5; attempt++) {
            mocks.getEventBySlug.mockResolvedValueOnce(null) // distinct slugs, opaque 404 each time
            const response = await POST(authRequest(
                { slug: `evento-${attempt}`, password: 'x', staffName: 'Ana' },
                { ip },
            ))
            expect(response.status).toBe(404)
        }
        expect(mocks.bcryptCompare).toHaveBeenCalledTimes(5)

        const sixth = await POST(authRequest({ slug: 'evento-6', password: 'x', staffName: 'Ana' }, { ip }))
        expect(sixth.status).toBe(429)
        // No further DB lookup or bcrypt work once the budget is spent — the
        // limiter cuts before either (acceptance criterion).
        expect(mocks.getEventBySlug).toHaveBeenCalledTimes(5)
        expect(mocks.bcryptCompare).toHaveBeenCalledTimes(5)
    })

    it('the per-slug rate limiter cuts independently of IP once 5 attempts against one slug are spent', async () => {
        const { POST } = await import('@/app/api/checkin/auth/route')
        mocks.bcryptCompare.mockResolvedValue(false) // wrong password each time -> 401, not opaque

        for (let attempt = 0; attempt < 5; attempt++) {
            const response = await POST(authRequest(
                { slug: 'popular-fiesta', password: 'wrong', staffName: 'Ana' },
                { ip: `198.51.100.${attempt}` }, // different IP every time
            ))
            expect(response.status).toBe(401)
        }

        const sixth = await POST(authRequest(
            { slug: 'popular-fiesta', password: 'wrong', staffName: 'Ana' },
            { ip: '198.51.100.99' },
        ))
        expect(sixth.status).toBe(429)
        expect(mocks.getEventBySlug).toHaveBeenCalledTimes(5)
    })
})

// ============================================================
// Part 3 — admin check-in config (RBAC + password hygiene)
// ============================================================
const adminEvent = {
    id: 'event-uuid',
    slug: 'fiesta',
    checkinEnabled: false,
    checkinPasswordHash: null as string | null,
    checkinPasswordUpdatedAt: null as Date | null,
}

function adminConfigRequest(method: string, body?: unknown, origin = 'http://localhost:3000') {
    return new NextRequest('http://localhost:3000/api/admin/checkin-config', {
        method,
        headers: {
            origin,
            host: 'localhost:3000',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
}

describe('/api/admin/checkin-config', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.cookieGetValue = 'session-token'
        mocks.getEventBySlug.mockResolvedValue(adminEvent)
        mocks.updateEvent.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
            ...adminEvent,
            ...patch,
        }))
        mocks.hashPassword.mockImplementation(async (password: string) => `hashed(${password})`)
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'manager' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true, role: 'manager' })
    })

    it('requires authentication', async () => {
        mocks.cookieGetValue = undefined
        const { GET } = await import('@/app/api/admin/checkin-config/route')
        const response = await GET(new NextRequest('http://localhost:3000/api/admin/checkin-config?eventSlug=fiesta'))
        expect(response.status).toBe(401)
    })

    it('forbids a viewer (no manager access) from reading or changing check-in config', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'viewer-1', role: 'manager' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false, role: 'viewer' })
        const { GET, PATCH } = await import('@/app/api/admin/checkin-config/route')

        const getResponse = await GET(new NextRequest('http://localhost:3000/api/admin/checkin-config?eventSlug=fiesta'))
        const patchResponse = await PATCH(adminConfigRequest('PATCH', { eventSlug: 'fiesta', action: 'enable' }))

        expect(getResponse.status).toBe(403)
        expect(patchResponse.status).toBe(403)
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })

    it('allows a manager to enable check-in and read the resulting status (no hash exposed)', async () => {
        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(adminConfigRequest('PATCH', { eventSlug: 'fiesta', action: 'enable' }))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.updateEvent).toHaveBeenCalledWith('event-uuid', { checkinEnabled: true })
        expect(payload).toEqual({ success: true, checkin: { enabled: true, hasPassword: false, updatedAt: null } })
    })

    it('a super_admin bypasses userHasEventAccess entirely', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'root', role: 'super_admin' })
        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(adminConfigRequest('PATCH', { eventSlug: 'fiesta', action: 'disable' }))

        expect(response.status).toBe(200)
        expect(mocks.userHasEventAccess).not.toHaveBeenCalled()
    })

    it('setPassword hashes via lib/auth-utils.hashPassword and never returns/logs the plaintext or hash', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(adminConfigRequest('PATCH', {
            eventSlug: 'fiesta', action: 'setPassword', password: 'correcthorsebattery',
        }))
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.hashPassword).toHaveBeenCalledWith('correcthorsebattery')
        expect(mocks.updateEvent).toHaveBeenCalledWith('event-uuid', {
            checkinPasswordHash: 'hashed(correcthorsebattery)',
            checkinPasswordUpdatedAt: expect.any(Date),
        })
        expect(JSON.stringify(payload)).not.toContain('correcthorsebattery')
        expect(JSON.stringify(payload)).not.toContain('hashed(')
        expect(payload.checkin).not.toHaveProperty('hash')
        expect(payload.checkin).not.toHaveProperty('checkinPasswordHash')
        expect(infoSpy.mock.calls.flat().join(' ')).not.toContain('correcthorsebattery')
        expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('correcthorsebattery')
        errorSpy.mockRestore()
        infoSpy.mockRestore()
    })

    it('GET never exposes the hash, only enabled/hasPassword/updatedAt', async () => {
        mocks.getEventBySlug.mockResolvedValue({
            ...adminEvent,
            checkinEnabled: true,
            checkinPasswordHash: '$2a$12$super-secret-hash',
            checkinPasswordUpdatedAt: new Date('2026-08-01T00:00:00.000Z'),
        })
        const { GET } = await import('@/app/api/admin/checkin-config/route')
        const response = await GET(new NextRequest('http://localhost:3000/api/admin/checkin-config?eventSlug=fiesta'))
        const payload = await response.json()

        expect(payload).toEqual({
            success: true,
            checkin: { enabled: true, hasPassword: true, updatedAt: '2026-08-01T00:00:00.000Z' },
        })
        expect(JSON.stringify(payload)).not.toContain('super-secret-hash')
    })

    it('rejects a setPassword outside the 6-64 char bound', async () => {
        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const tooShort = await PATCH(adminConfigRequest('PATCH', { eventSlug: 'fiesta', action: 'setPassword', password: '12345' }))
        const tooLong = await PATCH(adminConfigRequest('PATCH', { eventSlug: 'fiesta', action: 'setPassword', password: 'x'.repeat(65) }))

        expect([tooShort.status, tooLong.status]).toEqual([400, 400])
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })

    it('rejects a password field on enable/disable actions', async () => {
        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(adminConfigRequest('PATCH', { eventSlug: 'fiesta', action: 'enable', password: 'sneaky' }))

        expect(response.status).toBe(400)
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })

    it('rejects cross-origin PATCH before authentication', async () => {
        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(adminConfigRequest(
            'PATCH',
            { eventSlug: 'fiesta', action: 'enable' },
            'https://evil.example',
        ))

        expect(response.status).toBe(403)
        expect(mocks.validateSession).not.toHaveBeenCalled()
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })
})

describe('lib/auth-utils.ts — bcrypt cost reused by check-in setPassword (ISSUE-015)', () => {
    it('setPassword calls lib/auth-utils.hashPassword, which hashes at SALT_ROUNDS=12 — same cost, not a duplicated constant', () => {
        const authUtilsSource = readFileSync('lib/auth-utils.ts', 'utf8')
        expect(authUtilsSource).toContain('const SALT_ROUNDS = 12')
        expect(authUtilsSource).toContain('bcrypt.hash(password, SALT_ROUNDS)')

        const routeSource = readFileSync('app/api/admin/checkin-config/route.ts', 'utf8')
        expect(routeSource).toContain("import { hashPassword, validateSession } from '@/lib/auth-utils'")
        expect(routeSource).toContain('await hashPassword(')
        // No second, independently-editable bcrypt cost constant in this route.
        expect(routeSource).not.toMatch(/bcrypt\.hash\(/)
    })
})
