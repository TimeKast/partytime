/**
 * ISSUE-016 (EPIC-005) — query-layer acceptance criteria for
 * `getCheckinGuestsByEvent` and `markCheckinGuest` in lib/queries.ts. Mocks
 * only `@/lib/db` and runs the REAL lib/queries.ts (same split as
 * tests/stripe-webhook-queries.test.ts / tests/stripe-webhook.test.ts and
 * tests/verification-reactivation.test.ts — a whole-module
 * `vi.mock('@/lib/queries', ...)`, used by tests/checkin-api.test.ts's
 * route-level half, cannot coexist with a real, `@/lib/db`-backed
 * lib/queries.ts in one file).
 *
 * This is the file that actually proves markCheckinGuest's branching
 * (not_found vs forbidden vs not_confirmed vs plus_one_not_allowed vs
 * marked), the checked_in_by/note tri-state write semantics, and the
 * last-write-wins concurrency shape the issue's Gherkin describes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { selectMock, updateMock } = vi.hoisted(() => ({
    selectMock: vi.fn(),
    updateMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
    db: { select: selectMock, update: updateMock, execute: vi.fn(), insert: vi.fn() },
    rsvps: {},
    events: {},
    appSettings: {},
    rsvpInvitationLinks: {},
    rsvpPayments: {},
}))

import { RSVP_STATUS, getCheckinGuestsByEvent, markCheckinGuest } from '@/lib/queries'

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

function camelRsvp(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rsvp-1',
        eventId: 'fiesta',
        name: 'Ana Pérez',
        email: 'ana@example.com',
        phone: '+525500000000',
        plusOne: true,
        plusOneName: 'Beto',
        status: RSVP_STATUS.CONFIRMED,
        emailSent: null,
        emailHistory: [],
        cancelToken: null,
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

function mockSelectOnce(rows: unknown[]) {
    const whereSpy = vi.fn(() => ({ limit: vi.fn(async () => rows) }))
    selectMock.mockReturnValueOnce({ from: vi.fn(() => ({ where: whereSpy })) })
    return whereSpy
}

function mockUpdateOnce(rows: unknown[]) {
    const setSpy = vi.fn((_values: Record<string, unknown>) => ({ where: vi.fn(() => ({ returning: vi.fn(async () => rows) })) }))
    updateMock.mockReturnValueOnce({ set: setSpy })
    return setSpy
}

beforeEach(() => {
    selectMock.mockReset()
    updateMock.mockReset()
})

describe('getCheckinGuestsByEvent (ISSUE-016)', () => {
    it('queries by exactly confirmed/pending_payment/pending_verification for the given event, excluding cancelled/expired', async () => {
        const whereSpy = vi.fn(async (_condition: unknown) => [camelRsvp()])
        selectMock.mockReturnValueOnce({ from: vi.fn(() => ({ where: whereSpy })) })

        const rows = await getCheckinGuestsByEvent('fiesta')

        expect(rows).toEqual([camelRsvp()])
        const condition = whereSpy.mock.calls[0][0]
        const text = sqlTextOf(condition)
        expect(text).toContain('confirmed')
        expect(text).toContain('pending_payment')
        expect(text).toContain('pending_verification')
        expect(text).not.toContain('cancelled')
        expect(text).not.toContain('"expired"')
    })
})

describe('markCheckinGuest (ISSUE-016)', () => {
    it('returns not_found when no row with that id exists at all', async () => {
        mockSelectOnce([])
        const result = await markCheckinGuest({
            rsvpId: 'missing', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: undefined,
        })
        expect(result).toEqual({ outcome: 'not_found' })
        expect(updateMock).not.toHaveBeenCalled()
    })

    // Given cookie válida del evento A / When marca un rsvp del evento B / Then 403 sin datos.
    it('returns forbidden when the row exists but belongs to a DIFFERENT event', async () => {
        mockSelectOnce([camelRsvp({ eventId: 'otra-fiesta' })])
        const result = await markCheckinGuest({
            rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: undefined,
        })
        expect(result).toEqual({ outcome: 'forbidden' })
        expect(updateMock).not.toHaveBeenCalled()
    })

    it.each([RSVP_STATUS.CANCELLED, RSVP_STATUS.EXPIRED])('returns not_found for a %s row (nothing left to mark)', async (status) => {
        mockSelectOnce([camelRsvp({ status })])
        const result = await markCheckinGuest({
            rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: undefined,
        })
        expect(result).toEqual({ outcome: 'not_found' })
        expect(updateMock).not.toHaveBeenCalled()
    })

    // Given un invitado pending_payment / When el staff intenta marcarlo / Then 409 "aún no confirmado".
    it.each([RSVP_STATUS.PENDING_PAYMENT, RSVP_STATUS.PENDING_VERIFICATION])('returns not_confirmed for a %s row', async (status) => {
        mockSelectOnce([camelRsvp({ status })])
        const result = await markCheckinGuest({
            rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: undefined,
        })
        expect(result).toEqual({ outcome: 'not_confirmed' })
        expect(updateMock).not.toHaveBeenCalled()
    })

    it('returns plus_one_not_allowed when target=plusOne but the rsvp has no plus one', async () => {
        mockSelectOnce([camelRsvp({ plusOne: false })])
        const result = await markCheckinGuest({
            rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'plusOne', checkedIn: true, staffName: 'Ana', note: undefined,
        })
        expect(result).toEqual({ outcome: 'plus_one_not_allowed' })
        expect(updateMock).not.toHaveBeenCalled()
    })

    it('marking the guest IN sets checked_in_at and checked_in_by, leaves plus_one_checked_in_at untouched', async () => {
        mockSelectOnce([camelRsvp()])
        const setSpy = mockUpdateOnce([camelRsvp({ checkedInAt: new Date('2026-08-18T20:00:00.000Z'), checkedInBy: 'Ana' })])

        const result = await markCheckinGuest({
            rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: undefined,
        })

        expect(result.outcome).toBe('marked')
        const setValues = setSpy.mock.calls[0][0]
        expect(setValues).toEqual(expect.objectContaining({ checkedInAt: expect.any(Date), checkedInBy: 'Ana' }))
        expect(setValues).not.toHaveProperty('plusOneCheckedInAt')
        expect(setValues).not.toHaveProperty('checkinNote') // note: undefined -> untouched
    })

    it('marking the guest OUT (unmark) nulls checked_in_at but does NOT touch checked_in_by (conserva el último actor)', async () => {
        mockSelectOnce([camelRsvp({ checkedInAt: new Date(), checkedInBy: 'Ana' })])
        const setSpy = mockUpdateOnce([camelRsvp({ checkedInAt: null, checkedInBy: 'Ana' })])

        await markCheckinGuest({
            rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: false, staffName: 'Beto', note: undefined,
        })

        const setValues = setSpy.mock.calls[0][0]
        expect(setValues).toEqual({ checkedInAt: null })
        expect(setValues).not.toHaveProperty('checkedInBy')
    })

    it('marking the plusOne IN sets plus_one_checked_in_at and checked_in_by, leaves checked_in_at untouched', async () => {
        mockSelectOnce([camelRsvp({ plusOne: true })])
        const setSpy = mockUpdateOnce([camelRsvp({ plusOneCheckedInAt: new Date(), checkedInBy: 'Ana' })])

        const result = await markCheckinGuest({
            rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'plusOne', checkedIn: true, staffName: 'Ana', note: undefined,
        })

        expect(result.outcome).toBe('marked')
        const setValues = setSpy.mock.calls[0][0]
        expect(setValues).toEqual(expect.objectContaining({ plusOneCheckedInAt: expect.any(Date), checkedInBy: 'Ana' }))
        expect(setValues).not.toHaveProperty('checkedInAt')
    })

    it('the guest and plus-one timestamps are independent — marking both leaves two separate columns set', async () => {
        mockSelectOnce([camelRsvp({ plusOne: true })])
        const guestSetSpy = mockUpdateOnce([camelRsvp({ checkedInAt: new Date(), checkedInBy: 'Ana' })])
        await markCheckinGuest({ rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: undefined })
        expect(guestSetSpy.mock.calls[0][0]).not.toHaveProperty('plusOneCheckedInAt')

        mockSelectOnce([camelRsvp({ plusOne: true, checkedInAt: new Date() })])
        const plusOneSetSpy = mockUpdateOnce([camelRsvp({ plusOneCheckedInAt: new Date(), checkedInBy: 'Ana' })])
        await markCheckinGuest({ rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'plusOne', checkedIn: true, staffName: 'Ana', note: undefined })
        expect(plusOneSetSpy.mock.calls[0][0]).not.toHaveProperty('checkedInAt')
    })

    describe('note tri-state', () => {
        it('note: undefined never touches checkin_note', async () => {
            mockSelectOnce([camelRsvp()])
            const setSpy = mockUpdateOnce([camelRsvp()])
            await markCheckinGuest({ rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: undefined })
            expect(setSpy.mock.calls[0][0]).not.toHaveProperty('checkinNote')
        })

        it('note: null clears checkin_note', async () => {
            mockSelectOnce([camelRsvp({ checkinNote: 'old note' })])
            const setSpy = mockUpdateOnce([camelRsvp({ checkinNote: null })])
            await markCheckinGuest({ rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: null })
            expect(setSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ checkinNote: null }))
        })

        it('note: a string overwrites checkin_note', async () => {
            mockSelectOnce([camelRsvp()])
            const setSpy = mockUpdateOnce([camelRsvp({ checkinNote: 'Llegó en taxi' })])
            await markCheckinGuest({ rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Ana', note: 'Llegó en taxi' })
            expect(setSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ checkinNote: 'Llegó en taxi' }))
        })
    })

    // Given dos staff marcando al mismo invitado casi simultáneo / Then gana
    // el último write sin error. The UPDATE's WHERE is scoped to `id` alone
    // (no re-checked status predicate) precisely so this never surfaces as an
    // error — whichever call's UPDATE reaches Postgres last simply overwrites
    // the previous one's columns, exactly like every other single-row
    // last-write-wins UPDATE in this file (e.g. updateRSVP).
    it('two concurrent marks for the same guest both resolve to "marked" with no error (last write wins, no locks)', async () => {
        mockSelectOnce([camelRsvp()])
        const firstSetSpy = mockUpdateOnce([camelRsvp({ checkedInAt: new Date(), checkedInBy: 'Staff A' })])
        const first = await markCheckinGuest({ rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Staff A', note: undefined })

        mockSelectOnce([camelRsvp({ checkedInAt: new Date(), checkedInBy: 'Staff A' })])
        const secondSetSpy = mockUpdateOnce([camelRsvp({ checkedInAt: new Date(), checkedInBy: 'Staff B' })])
        const second = await markCheckinGuest({ rsvpId: 'rsvp-1', eventSlug: 'fiesta', target: 'guest', checkedIn: true, staffName: 'Staff B', note: undefined })

        expect(first.outcome).toBe('marked')
        expect(second.outcome).toBe('marked')
        expect(firstSetSpy).toHaveBeenCalledTimes(1)
        expect(secondSetSpy).toHaveBeenCalledTimes(1)
        expect(second.outcome === 'marked' && second.rsvp.checkedInBy).toBe('Staff B')
    })
})
