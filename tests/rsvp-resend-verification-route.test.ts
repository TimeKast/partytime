/**
 * ISSUE-007 (EPIC-003) — POST /api/rsvp/resend-verification. Mirrors the
 * mocking pattern of tests/forgot-password-route.test.ts (same anti-
 * enumeration budget: fake timers + response floor, bounded rate limiter).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    databaseConfigured: true,
    getEventBySlug: vi.fn(),
    expireStalePendingRsvps: vi.fn(),
    reissueVerificationToken: vi.fn(),
    recordEmailSent: vi.fn(),
    send: vi.fn(),
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
    backgroundTasks: [] as Promise<unknown>[],
}))

vi.mock('@vercel/functions', () => ({
    waitUntil: (promise: Promise<unknown>) => {
        mocks.backgroundTasks.push(promise)
        mocks.waitUntil(promise)
    },
}))
vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    expireStalePendingRsvps: mocks.expireStalePendingRsvps,
    reissueVerificationToken: mocks.reissueVerificationToken,
    recordEmailSent: mocks.recordEmailSent,
}))
vi.mock('@/lib/resend', () => ({
    resend: { emails: { send: mocks.send } },
    FROM_EMAIL: 'noreply@example.com',
}))

const verifyingEvent = {
    id: 'event-uuid', slug: 'fiesta', title: 'Fiesta', displayTitle: '',
    emailVerificationEnabled: true,
}
const pendingRsvp = {
    id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
    status: 'pending_verification',
}

let requestSequence = 0

// The route's rate limiters (per IP and per (slug, email)) are module-level
// singletons that persist for the lifetime of this test file — every test
// that sends more than one request for the SAME email must use an email
// unique to that test, or an earlier test's budget silently bleeds in.
function uniqueEmail(label: string): string {
    return `${label}-${++requestSequence}@example.com`
}

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/rsvp/resend-verification', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            host: 'localhost:3000',
            'x-forwarded-for': `192.0.2.${++requestSequence}`,
            ...headers,
        },
        body: JSON.stringify(body),
    })
}

async function callRoute(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/rsvp/resend-verification/route')
    const response = POST(buildRequest(body, headers))
    await vi.advanceTimersByTimeAsync(400)
    return response
}

describe('POST /api/rsvp/resend-verification (ISSUE-007)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.getEventBySlug.mockResolvedValue(verifyingEvent)
        mocks.expireStalePendingRsvps.mockResolvedValue([])
        mocks.reissueVerificationToken.mockResolvedValue(pendingRsvp)
        mocks.send.mockResolvedValue({ error: null })
        mocks.recordEmailSent.mockResolvedValue(true)
        mocks.backgroundTasks.length = 0
    })

    afterEach(async () => {
        await vi.runAllTimersAsync()
        await Promise.all(mocks.backgroundTasks)
        vi.useRealTimers()
    })

    it('returns 202 with the opaque response for a pending row that exists (reissues + resends)', async () => {
        const email = uniqueEmail('reissue')
        const res = await callRoute({ slug: 'fiesta', email })
        const data = await res.json()

        expect(res.status).toBe(202)
        expect(data.success).toBe(true)
        expect(res.headers.get('cache-control')).toBe('no-store')
        expect(mocks.expireStalePendingRsvps).toHaveBeenCalledWith('fiesta')
        expect(mocks.reissueVerificationToken).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'fiesta', email, tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }))
        await Promise.all(mocks.backgroundTasks)
        expect(mocks.send).toHaveBeenCalledTimes(1)
        const [sendArgs] = mocks.send.mock.calls[0]
        expect(sendArgs.to).toBe('alex@example.com') // reissueVerificationToken's returned row owns the send target
        expect(sendArgs.subject).toBe('Confirma tu asistencia a Fiesta')
        expect(mocks.recordEmailSent).toHaveBeenCalledWith('rsvp-1', 'verification')
    })

    // Gherkin: "Siempre responde 202 (sin revelar existencia)."
    it.each([
        ['unknown email (no pending row)', () => mocks.reissueVerificationToken.mockResolvedValue(null)],
        ['event not found', () => mocks.getEventBySlug.mockResolvedValue(null)],
        ['event does not have verification enabled', () => mocks.getEventBySlug.mockResolvedValue({ ...verifyingEvent, emailVerificationEnabled: false })],
        ['database not configured', () => { mocks.databaseConfigured = false }],
    ])('returns the identical opaque 202 for: %s', async (_label, setup) => {
        setup()
        const res = await callRoute({ slug: 'fiesta', email: uniqueEmail('nobody') })
        const data = await res.json()

        expect(res.status).toBe(202)
        expect(data.success).toBe(true)
        expect(mocks.send).not.toHaveBeenCalled()
    })

    it('rejects an explicit cross-origin request with the same opaque 202', async () => {
        const res = await callRoute(
            { slug: 'fiesta', email: uniqueEmail('cross-origin') },
            { origin: 'https://evil.example.com' },
        )
        expect(res.status).toBe(202)
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
    })

    it('returns 400 for missing slug or email (structural validation, not an enumeration signal)', async () => {
        const missingEmail = await callRoute({ slug: 'fiesta' })
        const missingSlug = await callRoute({ email: uniqueEmail('missing-slug') })

        expect([missingEmail.status, missingSlug.status]).toEqual([400, 400])
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
    })

    // Gherkin: "Given 6 solicitudes de reenvío seguidas del mismo email /
    // When llega la sexta / Then el rate-limiter la corta y la respuesta
    // sigue siendo 202 opaca."
    it('cuts the 6th same-email request via the rate limiter but still returns 202 opaque', async () => {
        const email = uniqueEmail('rate-limit-email')
        const headers = { 'x-forwarded-for': '198.51.100.50' }
        for (let i = 0; i < 5; i++) {
            const res = await callRoute({ slug: 'fiesta', email }, headers)
            expect(res.status).toBe(202)
        }
        expect(mocks.reissueVerificationToken).toHaveBeenCalledTimes(5)

        mocks.reissueVerificationToken.mockClear()
        mocks.getEventBySlug.mockClear()
        const sixth = await callRoute({ slug: 'fiesta', email }, headers)
        const data = await sixth.json()

        expect(sixth.status).toBe(202)
        expect(data.success).toBe(true)
        // Rate-limited before any DB work.
        expect(mocks.getEventBySlug).not.toHaveBeenCalled()
        expect(mocks.reissueVerificationToken).not.toHaveBeenCalled()
    })

    it('rate-limits by (slug, email) independent of the requester IP', async () => {
        const email = uniqueEmail('rate-limit-ip')
        for (let i = 0; i < 5; i++) {
            await callRoute({ slug: 'fiesta', email })
        }
        mocks.reissueVerificationToken.mockClear()

        const sixthDifferentIp = await callRoute(
            { slug: 'fiesta', email },
            { 'x-forwarded-for': '203.0.113.99' },
        )

        expect(sixthDifferentIp.status).toBe(202)
        expect(mocks.reissueVerificationToken).not.toHaveBeenCalled()
    })

    it('still returns the opaque 202 when the email provider throws', async () => {
        mocks.send.mockRejectedValue(new Error('resend down'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const res = await callRoute({ slug: 'fiesta', email: uniqueEmail('provider-down') })

        expect(res.status).toBe(202)
        errorSpy.mockRestore()
    })

    it('never returns the raw token anywhere in the response body', async () => {
        const res = await callRoute({ slug: 'fiesta', email: uniqueEmail('token-leak') })
        const data = await res.json()
        await Promise.all(mocks.backgroundTasks)
        const [sendArgs] = mocks.send.mock.calls[0]
        const sentUrl = new URL(sendArgs.html.match(/href="([^"]+)"/)![1])
        const rawToken = sentUrl.searchParams.get('token')!

        expect(JSON.stringify(data)).not.toContain(rawToken)
    })
})
