/**
 * ISSUE-023 (EPIC-006) — app/api/admin/ledger/participants/route.ts.
 *
 * Route-level only: mocks `@/lib/ledger-queries` wholesale (same two-file
 * split rationale documented in tests/checkin-api.test.ts / tests/stripe-webhook.test.ts
 * — "a whole-module vi.mock('@/lib/ledger-queries') and a real,
 * @/lib/db-backed lib/ledger-queries.ts cannot coexist in one file"). The
 * REAL typed error classes are re-exported from the mock (constructed in
 * `vi.hoisted`) so the route's `instanceof` mapping is exercised for real.
 * tests/ledger-participants-queries.test.ts is the companion file that
 * drives the REAL lib/ledger-queries.ts (mocking only `@/lib/db`) to prove
 * createParticipant/updateParticipant/ensureStripeParticipant themselves,
 * including the ensureStripeParticipant concurrency/idempotency case.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
    class LedgerParticipantNameConflictError extends Error {
        constructor(readonly attemptedName: string) {
            super(`Ya existe un participante con el nombre "${attemptedName}" en este evento`)
            this.name = 'LedgerParticipantNameConflictError'
        }
    }
    class LedgerStripeParticipantImmutableError extends Error {
        constructor() {
            super('El participante Stripe no se puede renombrar ni desactivar')
            this.name = 'LedgerStripeParticipantImmutableError'
        }
    }

    return {
        validateSession: vi.fn(),
        userHasEventAccess: vi.fn(),
        getEventBySlug: vi.fn(),
        unwrapDbError: vi.fn(() => ({ code: undefined, message: '' })),
        listParticipants: vi.fn(),
        createParticipant: vi.fn(),
        updateParticipant: vi.fn(),
        ensureStripeParticipant: vi.fn(),
        LedgerParticipantNameConflictError,
        LedgerStripeParticipantImmutableError,
    }
})

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: vi.fn(() => ({ value: 'session-token' })),
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
}))

vi.mock('@/lib/user-queries', () => ({
    userHasEventAccess: mocks.userHasEventAccess,
}))

vi.mock('@/lib/db', () => ({
    isDatabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    unwrapDbError: mocks.unwrapDbError,
}))

vi.mock('@/lib/ledger-queries', () => ({
    listParticipants: mocks.listParticipants,
    createParticipant: mocks.createParticipant,
    updateParticipant: mocks.updateParticipant,
    ensureStripeParticipant: mocks.ensureStripeParticipant,
    LedgerParticipantNameConflictError: mocks.LedgerParticipantNameConflictError,
    LedgerStripeParticipantImmutableError: mocks.LedgerStripeParticipantImmutableError,
}))

const storedEvent = { id: 'event-id', slug: 'fiesta' }

function participantRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'participant-1',
        eventId: 'fiesta',
        kind: 'person',
        name: 'Ana',
        email: 'ana@example.com',
        userId: null,
        isActive: true,
        createdBy: 'user-1',
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
        ...overrides,
    }
}

function getRequest(eventId = 'fiesta') {
    return new NextRequest(`http://localhost/api/admin/ledger/participants?eventId=${eventId}`)
}

function postRequest(body: object, withOrigin = true) {
    return new NextRequest('http://localhost/api/admin/ledger/participants', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(withOrigin ? { Origin: 'http://localhost' } : {}),
        },
        body: JSON.stringify(body),
    })
}

function patchRequest(body: object, withOrigin = true) {
    return new NextRequest('http://localhost/api/admin/ledger/participants', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            ...(withOrigin ? { Origin: 'http://localhost' } : {}),
        },
        body: JSON.stringify(body),
    })
}

describe('GET /api/admin/ledger/participants', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.ensureStripeParticipant.mockResolvedValue(participantRow({ id: 'stripe-1', kind: 'stripe', name: 'Stripe', email: null }))
        mocks.listParticipants.mockResolvedValue([participantRow()])
    })

    it('401s with no session', async () => {
        mocks.validateSession.mockResolvedValue(null)
        const { GET } = await import('@/app/api/admin/ledger/participants/route')
        const response = await GET(getRequest())
        expect(response.status).toBe(401)
        expect(mocks.listParticipants).not.toHaveBeenCalled()
    })

    it('a viewer (viewer-level access) can list participants — 200', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true })

        const { GET } = await import('@/app/api/admin/ledger/participants/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.userHasEventAccess).toHaveBeenCalledWith('user-1', 'event-id', 'viewer')
        expect(mocks.ensureStripeParticipant).toHaveBeenCalledWith('fiesta', 'user-1')
        expect(mocks.listParticipants).toHaveBeenCalledWith('fiesta')
        expect(data.success).toBe(true)
        expect(data.participants).toHaveLength(1)
    })

    it('a user with no access on the event gets 403 and never reaches the ledger queries', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { GET } = await import('@/app/api/admin/ledger/participants/route')
        const response = await GET(getRequest())

        expect(response.status).toBe(403)
        expect(mocks.ensureStripeParticipant).not.toHaveBeenCalled()
        expect(mocks.listParticipants).not.toHaveBeenCalled()
    })

    it('DTO carries exactly {id, kind, name, email, userId, isActive, createdAt} — never eventId/createdBy', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'super_admin' })

        const { GET } = await import('@/app/api/admin/ledger/participants/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(Object.keys(data.participants[0]).sort()).toEqual(
            ['createdAt', 'email', 'id', 'isActive', 'kind', 'name', 'userId'].sort(),
        )
        expect(JSON.stringify(data)).not.toContain('createdBy')
        // A super_admin bypasses the per-event lookup entirely.
        expect(mocks.userHasEventAccess).not.toHaveBeenCalled()
    })
})

describe('POST /api/admin/ledger/participants', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.createParticipant.mockResolvedValue(participantRow())
    })

    it('rejects a cross-site POST (no Origin/Referer) with 403 before touching auth', async () => {
        const { POST } = await import('@/app/api/admin/ledger/participants/route')
        const response = await POST(postRequest({ eventId: 'fiesta', name: 'Ana' }, false))
        expect(response.status).toBe(403)
        expect(mocks.createParticipant).not.toHaveBeenCalled()
    })

    it('a viewer (no manager access) is rejected with 403 — POST is manager-only', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { POST } = await import('@/app/api/admin/ledger/participants/route')
        const response = await POST(postRequest({ eventId: 'fiesta', name: 'Ana' }))
        const data = await response.json()

        expect(response.status).toBe(403)
        expect(data.success).toBe(false)
        expect(mocks.userHasEventAccess).toHaveBeenCalledWith('user-1', 'event-id', 'manager')
        expect(mocks.createParticipant).not.toHaveBeenCalled()
    })

    it('a manager creates a participant — 201, createdBy is the acting user, eventId is the slug', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true })

        const { POST } = await import('@/app/api/admin/ledger/participants/route')
        const response = await POST(postRequest({ eventId: 'fiesta', name: '  Ana  ', email: 'ana@example.com' }))
        const data = await response.json()

        expect(response.status).toBe(201)
        expect(mocks.createParticipant).toHaveBeenCalledWith({
            eventId: 'fiesta',
            name: '  Ana  ',
            email: 'ana@example.com',
            userId: null,
            createdBy: 'manager-1',
        })
        expect(data.participant.id).toBe('participant-1')
    })

    it('rejects a name shorter than 2 characters without calling createParticipant', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/participants/route')
        const response = await POST(postRequest({ eventId: 'fiesta', name: 'A' }))

        expect(response.status).toBe(400)
        expect(mocks.createParticipant).not.toHaveBeenCalled()
    })

    it('rejects unknown extra body keys with 400', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { POST } = await import('@/app/api/admin/ledger/participants/route')
        const response = await POST(postRequest({ eventId: 'fiesta', name: 'Ana', role: 'admin' }))

        expect(response.status).toBe(400)
        expect(mocks.createParticipant).not.toHaveBeenCalled()
    })

    it('a duplicate name (case-insensitive, including the reserved "Stripe" name) maps to 409', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.createParticipant.mockRejectedValue(new mocks.LedgerParticipantNameConflictError('Stripe'))

        const { POST } = await import('@/app/api/admin/ledger/participants/route')
        const response = await POST(postRequest({ eventId: 'fiesta', name: 'Stripe' }))
        const data = await response.json()

        expect(response.status).toBe(409)
        expect(data.success).toBe(false)
    })
})

describe('PATCH /api/admin/ledger/participants', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
    })

    it('a viewer (no manager access) is rejected with 403', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { PATCH } = await import('@/app/api/admin/ledger/participants/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', participantId: 'participant-1', isActive: false }))

        expect(response.status).toBe(403)
        expect(mocks.updateParticipant).not.toHaveBeenCalled()
    })

    it('a manager renames a participant — 200', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.updateParticipant.mockResolvedValue(participantRow({ name: 'Ana María' }))

        const { PATCH } = await import('@/app/api/admin/ledger/participants/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', participantId: 'participant-1', name: 'Ana María' }))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(mocks.updateParticipant).toHaveBeenCalledWith('fiesta', 'participant-1', {
            name: 'Ana María',
            email: undefined,
            isActive: undefined,
        })
        expect(data.participant.name).toBe('Ana María')
    })

    it('rejects a body with no mutable field present — 400, never calls updateParticipant', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })

        const { PATCH } = await import('@/app/api/admin/ledger/participants/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', participantId: 'participant-1' }))

        expect(response.status).toBe(400)
        expect(mocks.updateParticipant).not.toHaveBeenCalled()
    })

    it('renaming/deactivating the Stripe node responds 422 with no changes', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.updateParticipant.mockRejectedValue(new mocks.LedgerStripeParticipantImmutableError())

        const { PATCH } = await import('@/app/api/admin/ledger/participants/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', participantId: 'stripe-1', isActive: false }))
        const data = await response.json()

        expect(response.status).toBe(422)
        expect(data.success).toBe(false)
    })

    it('a missing/cross-event participant responds 404', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.updateParticipant.mockResolvedValue(null)

        const { PATCH } = await import('@/app/api/admin/ledger/participants/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', participantId: 'ghost', isActive: false }))

        expect(response.status).toBe(404)
    })

    it('renaming to an already-used name maps to 409', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'super_admin' })
        mocks.updateParticipant.mockRejectedValue(new mocks.LedgerParticipantNameConflictError('Ana'))

        const { PATCH } = await import('@/app/api/admin/ledger/participants/route')
        const response = await PATCH(patchRequest({ eventId: 'fiesta', participantId: 'participant-2', name: 'Ana' }))

        expect(response.status).toBe(409)
    })
})
