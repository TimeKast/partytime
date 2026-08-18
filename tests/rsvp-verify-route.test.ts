/**
 * ISSUE-007 (EPIC-003) — POST /api/rsvp/verify. Mirrors the mocking pattern
 * of tests/rsvp-invitation-route.test.ts's validate-route tests (mocks
 * @/lib/queries entirely, same-origin + no-store contract).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { generateVerificationToken } from '@/lib/verification'

const mocks = vi.hoisted(() => ({
    databaseConfigured: true,
    verifyRsvpByToken: vi.fn(),
    getEventBySlug: vi.fn(),
    generateCancelToken: vi.fn(() => 'cancel-token-abc'),
    recordEmailSent: vi.fn(),
    send: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => mocks.databaseConfigured }))
vi.mock('@/lib/queries', () => ({
    verifyRsvpByToken: mocks.verifyRsvpByToken,
    getEventBySlug: mocks.getEventBySlug,
    generateCancelToken: mocks.generateCancelToken,
    recordEmailSent: mocks.recordEmailSent,
}))
vi.mock('@/lib/resend', () => ({
    resend: { emails: { send: mocks.send } },
    FROM_EMAIL: 'noreply@example.com',
}))

const event = {
    id: 'event-uuid', slug: 'fiesta', title: 'Fiesta', displayTitle: '',
    emailConfirmationEnabled: false, // ISSUE-007: irrelevant here — post-verify always sends.
}
const confirmedRsvp = {
    id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com',
    phone: '+525500000000', plusOne: false, plusOneName: null,
    status: 'confirmed', verifiedAt: new Date('2026-08-18T12:00:00.000Z'),
}

function request(body: unknown, origin?: string) {
    return new NextRequest('http://localhost:3000/api/rsvp/verify', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(origin ? { origin, host: 'localhost:3000' } : {}),
        },
        body: JSON.stringify(body),
    })
}

describe('POST /api/rsvp/verify (ISSUE-007)', () => {
    const validToken = generateVerificationToken()

    beforeEach(() => {
        vi.clearAllMocks()
        mocks.databaseConfigured = true
        mocks.verifyRsvpByToken.mockResolvedValue(confirmedRsvp)
        mocks.getEventBySlug.mockResolvedValue(event)
        mocks.send.mockResolvedValue({ error: null })
        mocks.recordEmailSent.mockResolvedValue(true)
    })

    // Gherkin: "Given el link de verificación vigente / When el invitado lo
    // abre (POST verify) / Then la fila pasa a confirmed con verified_at, el
    // token queda limpio y llega el email de confirmación".
    it('confirms and ALWAYS sends the confirmation email, independent of emailConfirmationEnabled', async () => {
        const response = await callRoute({ slug: 'fiesta', token: validToken })
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(payload).toEqual({
            success: true,
            rsvp: {
                id: 'rsvp-1', name: 'Alex', email: 'alex@example.com',
                plusOne: false, plusOneName: null, status: 'confirmed',
            },
        })

        expect(mocks.verifyRsvpByToken).toHaveBeenCalledWith('fiesta', expect.stringMatching(/^[a-f0-9]{64}$/))
        expect(mocks.send).toHaveBeenCalledTimes(1)
        const [sendArgs] = mocks.send.mock.calls[0]
        expect(sendArgs.to).toBe('alex@example.com')
        expect(sendArgs.subject).toBe('Confirmación - Fiesta')
        expect(mocks.recordEmailSent).toHaveBeenCalledWith('rsvp-1', 'confirmation')
    })

    it('never sends the confirmation email body containing the verification token', async () => {
        await callRoute({ slug: 'fiesta', token: validToken })
        const [sendArgs] = mocks.send.mock.calls[0]
        expect(sendArgs.html).not.toContain(validToken)
    })

    // Gherkin: "Given un token vencido, ya usado, o de otro evento / When se
    // intenta verificar / Then falla cerrado (410/400) sin mutar la fila".
    it('returns 410 without sending an email when the query layer reports no match (expired/used/wrong event)', async () => {
        mocks.verifyRsvpByToken.mockResolvedValue(null)
        const response = await callRoute({ slug: 'fiesta', token: validToken })

        expect(response.status).toBe(410)
        expect(mocks.send).not.toHaveBeenCalled()
        expect(mocks.recordEmailSent).not.toHaveBeenCalled()
    })

    it('returns 400 for a malformed token WITHOUT calling verifyRsvpByToken (format validated before hashing)', async () => {
        const response = await callRoute({ slug: 'fiesta', token: 'short' })

        expect(response.status).toBe(400)
        expect(mocks.verifyRsvpByToken).not.toHaveBeenCalled()
    })

    it.each([
        [{ token: 'a'.repeat(43) }],
        [{ slug: 'fiesta' }],
        [{ slug: '', token: 'a'.repeat(43) }],
        [{ slug: 'fiesta', token: 'a'.repeat(43), extra: 'x' }],
    ])('returns 400 for an incomplete/malformed body %j', async body => {
        const response = await callRoute(body)
        expect(response.status).toBe(400)
        expect(mocks.verifyRsvpByToken).not.toHaveBeenCalled()
    })

    it('rejects an explicit cross-origin request before touching the query layer', async () => {
        const response = await callRoute({ slug: 'fiesta', token: validToken }, 'https://evil.example')

        expect(response.status).toBe(403)
        expect(mocks.verifyRsvpByToken).not.toHaveBeenCalled()
    })

    it('returns 503 when the database is not configured', async () => {
        mocks.databaseConfigured = false
        const response = await callRoute({ slug: 'fiesta', token: validToken })

        expect(response.status).toBe(503)
        expect(mocks.verifyRsvpByToken).not.toHaveBeenCalled()
    })

    // Gherkin: "carrera (dos verify concurrentes → uno confirma)" at the
    // route layer — the query layer's atomicity is the actual guarantee
    // (proven directly with a true Promise.all race against the mocked
    // @/lib/db in tests/email-verification.test.ts, where verifyRsvpByToken
    // runs for real). Vitest/Vite's dynamic-`import()` mock resolution is
    // not safely re-entrant across two truly concurrent first-touch
    // `await import('@/lib/queries')` calls from the same tick (reproduced
    // independently against the existing, unrelated ISSUE-006 invitation
    // route code — not something introduced here), so this route-level test
    // instead asserts the OBSERVABLE consequence sequentially: once
    // verifyRsvpByToken has "consumed" the token, a second attempt
    // deterministically gets 410, exactly what the query layer's atomicity
    // guarantees a second concurrent caller would also see.
    it('a second verify attempt against an already-consumed token gets 410, never a second 200', async () => {
        let consumed = false
        mocks.verifyRsvpByToken.mockImplementation(async () => {
            if (consumed) return null
            consumed = true
            return confirmedRsvp
        })

        const first = await callRoute({ slug: 'fiesta', token: validToken })
        const second = await callRoute({ slug: 'fiesta', token: validToken })

        expect(first.status).toBe(200)
        expect(second.status).toBe(410)
        expect(mocks.send).toHaveBeenCalledTimes(1)
    })

    it('does not fail the verify response when the confirmation email send fails', async () => {
        mocks.send.mockResolvedValue({ error: { message: 'provider down' } })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const response = await callRoute({ slug: 'fiesta', token: validToken })

        expect(response.status).toBe(200)
        expect(mocks.recordEmailSent).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })
})

async function callRoute(body: unknown, origin?: string) {
    const { POST } = await import('@/app/api/rsvp/verify/route')
    return POST(request(body, origin))
}
