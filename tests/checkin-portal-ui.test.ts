/**
 * ISSUE-017 (EPIC-005) — UI of the check-in portal (`app/checkin/[slug]/`).
 *
 * Part 1 exercises `checkin-portal-logic.ts`'s pure functions directly with
 * real assertions (this project's vitest config runs `environment: 'node'`,
 * no jsdom — see vitest.config.ts — so every side-effecting boundary in that
 * module, fetch/sessionStorage/Date, is injected, which is exactly what lets
 * it be unit tested here without rendering React at all).
 *
 * Part 2 follows the source-string contract pattern already used for other
 * client pages with no DOM available (tests/rsvp-email-verification-ux.test.ts
 * for /verify, tests/checkin-api.test.ts for the API layer) to assert how
 * page.tsx/GuestRow.tsx wire those pure functions together.
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CheckinGuestDto } from '@/lib/checkin-guests'
import {
    applyOptimisticMark,
    clearStoredStaffName,
    computeArrivalCount,
    filterGuests,
    guestMatchesSearch,
    interpretAuthResponse,
    isCheckinMarkable,
    isGuestFullyArrived,
    matchesQuickFilter,
    normalizeSearchText,
    performOptimisticMark,
    readStoredStaffName,
    replaceGuestById,
    staffStorageKey,
    writeStoredStaffName,
    type MarkResponseLike,
} from '@/app/checkin/[slug]/checkin-portal-logic'

function guestFixture(overrides: Partial<CheckinGuestDto> = {}): CheckinGuestDto {
    return {
        id: 'rsvp-1',
        name: 'Ana Pérez',
        plusOne: false,
        plusOneName: null,
        maskedEmail: 'a***@g***.com',
        checkedInAt: null,
        plusOneCheckedInAt: null,
        checkedInBy: null,
        checkinNote: null,
        status: 'confirmed',
        ...overrides,
    }
}

function jsonResponse(status: number, body: unknown): MarkResponseLike {
    return { status, json: async () => body }
}

// ============================================================
// Part 1 — checkin-portal-logic.ts pure-function contract
// ============================================================

describe('normalizeSearchText / guestMatchesSearch (ISSUE-017: accent-insensitive search)', () => {
    it('strips diacritics and lowercases', () => {
        expect(normalizeSearchText('Álvaro')).toBe('alvaro')
        expect(normalizeSearchText('José María')).toBe('jose maria')
        // NFD decomposes 'ñ' into 'n' + a combining tilde (U+0303), which
        // falls inside the stripped diacritic range too — same technique
        // this codebase already documents for accent-insensitive matching.
        expect(normalizeSearchText('  Ñoño  ')).toBe('nono')
    })

    it('matches a guest by an accent-free, case-insensitive substring of the name', () => {
        const guest = guestFixture({ name: 'Ana Pérez' })
        expect(guestMatchesSearch(guest, 'ana')).toBe(true)
        expect(guestMatchesSearch(guest, 'PEREZ')).toBe(true) // no accent typed, still matches "Pérez"
        expect(guestMatchesSearch(guest, 'pérez')).toBe(true) // accent typed too
        expect(guestMatchesSearch(guest, 'zzz')).toBe(false)
    })

    it('also matches against the plus-one name when present', () => {
        const guest = guestFixture({ name: 'Ana Pérez', plusOne: true, plusOneName: 'Beto Gómez' })
        expect(guestMatchesSearch(guest, 'gomez')).toBe(true)
        expect(guestMatchesSearch(guest, 'beto')).toBe(true)
    })

    it('an empty/whitespace-only query matches everyone', () => {
        expect(guestMatchesSearch(guestFixture(), '   ')).toBe(true)
    })
})

describe('computeArrivalCount (ISSUE-017: "37 / 120 llegados")', () => {
    it('counts a checked-in guest and their checked-in +1 as two separate seats', () => {
        const guests = [
            guestFixture({ id: '1', plusOne: true, checkedInAt: '2026-08-18T20:00:00.000Z', plusOneCheckedInAt: '2026-08-18T20:01:00.000Z' }),
        ]
        expect(computeArrivalCount(guests)).toEqual({ arrived: 2, totalSeats: 2 })
    })

    it('a +1 who has not arrived yet still reserves a seat in the denominator but not the numerator', () => {
        const guests = [
            guestFixture({ id: '1', plusOne: true, checkedInAt: '2026-08-18T20:00:00.000Z', plusOneCheckedInAt: null }),
        ]
        expect(computeArrivalCount(guests)).toEqual({ arrived: 1, totalSeats: 2 })
    })

    it('only counts confirmed rows — pending_payment/pending_verification never reserve a seat', () => {
        const guests = [
            guestFixture({ id: '1', status: 'confirmed', checkedInAt: '2026-08-18T20:00:00.000Z' }),
            guestFixture({ id: '2', status: 'pending_payment' }),
            guestFixture({ id: '3', status: 'pending_verification', plusOne: true }),
        ]
        expect(computeArrivalCount(guests)).toEqual({ arrived: 1, totalSeats: 1 })
    })

    it('sums across the whole guest list, matching the issue example shape (X / Y)', () => {
        const guests = [
            guestFixture({ id: '1', checkedInAt: '2026-08-18T20:00:00.000Z' }),
            guestFixture({ id: '2', plusOne: true, checkedInAt: '2026-08-18T20:05:00.000Z', plusOneCheckedInAt: '2026-08-18T20:05:00.000Z' }),
            guestFixture({ id: '3' }), // not arrived
            guestFixture({ id: '4', plusOne: true }), // not arrived, +1 not arrived either
        ]
        // seats: 1 + 2 + 1 + 2 = 6; arrived: 1 + 2 + 0 + 0 = 3
        expect(computeArrivalCount(guests)).toEqual({ arrived: 3, totalSeats: 6 })
    })

    it('an empty guest list is 0 / 0', () => {
        expect(computeArrivalCount([])).toEqual({ arrived: 0, totalSeats: 0 })
    })
})

describe('isGuestFullyArrived / matchesQuickFilter / filterGuests (Todos / Falta por llegar / Ya llegaron)', () => {
    it('a solo guest is fully arrived once their own check is set', () => {
        const guest = guestFixture({ checkedInAt: '2026-08-18T20:00:00.000Z' })
        expect(isGuestFullyArrived(guest)).toBe(true)
    })

    it('a guest with a +1 is only fully arrived once BOTH seats are checked', () => {
        const bothPending = guestFixture({ plusOne: true })
        const onlyGuest = guestFixture({ plusOne: true, checkedInAt: '2026-08-18T20:00:00.000Z' })
        const both = guestFixture({ plusOne: true, checkedInAt: '2026-08-18T20:00:00.000Z', plusOneCheckedInAt: '2026-08-18T20:01:00.000Z' })

        expect(isGuestFullyArrived(bothPending)).toBe(false)
        expect(isGuestFullyArrived(onlyGuest)).toBe(false)
        expect(isGuestFullyArrived(both)).toBe(true)
    })

    it('a pending_* row is never "arrived", regardless of any stale timestamp', () => {
        const guest = guestFixture({ status: 'pending_payment', checkedInAt: '2026-08-18T20:00:00.000Z' })
        expect(isGuestFullyArrived(guest)).toBe(false)
    })

    it('filterGuests combines the search query and the quick filter (AND, not OR)', () => {
        const guests = [
            guestFixture({ id: '1', name: 'Ana Arrived', checkedInAt: '2026-08-18T20:00:00.000Z' }),
            guestFixture({ id: '2', name: 'Ana Pending' }),
            guestFixture({ id: '3', name: 'Beto Arrived', checkedInAt: '2026-08-18T20:00:00.000Z' }),
        ]

        expect(filterGuests(guests, 'ana', 'all').map(g => g.id)).toEqual(['1', '2'])
        expect(filterGuests(guests, 'ana', 'arrived').map(g => g.id)).toEqual(['1'])
        expect(filterGuests(guests, 'ana', 'pending').map(g => g.id)).toEqual(['2'])
        expect(filterGuests(guests, '', 'arrived').map(g => g.id)).toEqual(['1', '3'])
    })

    it('matchesQuickFilter("all") always returns true regardless of arrival state', () => {
        expect(matchesQuickFilter(guestFixture(), 'all')).toBe(true)
        expect(matchesQuickFilter(guestFixture({ checkedInAt: '2026-08-18T20:00:00.000Z' }), 'all')).toBe(true)
    })
})

describe('isCheckinMarkable (pending_* rows are read-only)', () => {
    it('only "confirmed" is markable', () => {
        expect(isCheckinMarkable('confirmed')).toBe(true)
        expect(isCheckinMarkable('pending_payment')).toBe(false)
        expect(isCheckinMarkable('pending_verification')).toBe(false)
    })
})

describe('applyOptimisticMark / replaceGuestById', () => {
    const fixedNow = () => new Date('2026-08-18T20:15:00.000Z')

    it('marking the guest IN stamps checkedInAt and checkedInBy', () => {
        const guest = guestFixture()
        const updated = applyOptimisticMark(guest, 'guest', true, 'Ana Staff', undefined, fixedNow)
        expect(updated.checkedInAt).toBe('2026-08-18T20:15:00.000Z')
        expect(updated.checkedInBy).toBe('Ana Staff')
    })

    it('marking the guest OUT clears checkedInAt but leaves checkedInBy untouched (last actor persists)', () => {
        const guest = guestFixture({ checkedInAt: '2026-08-18T20:00:00.000Z', checkedInBy: 'Previous Staff' })
        const updated = applyOptimisticMark(guest, 'guest', false, 'Ana Staff', undefined, fixedNow)
        expect(updated.checkedInAt).toBeNull()
        expect(updated.checkedInBy).toBe('Previous Staff')
    })

    it('marking the +1 only touches plusOneCheckedInAt, never the guest\'s own checkedInAt', () => {
        const guest = guestFixture({ plusOne: true, checkedInAt: '2026-08-18T20:00:00.000Z' })
        const updated = applyOptimisticMark(guest, 'plusOne', true, 'Ana Staff', undefined, fixedNow)
        expect(updated.checkedInAt).toBe('2026-08-18T20:00:00.000Z') // untouched
        expect(updated.plusOneCheckedInAt).toBe('2026-08-18T20:15:00.000Z')
    })

    it('an omitted note (undefined) leaves checkinNote untouched; a provided note (including null) overwrites it', () => {
        const guest = guestFixture({ checkinNote: 'Llegó en taxi' })
        expect(applyOptimisticMark(guest, 'guest', true, 'Ana', undefined, fixedNow).checkinNote).toBe('Llegó en taxi')
        expect(applyOptimisticMark(guest, 'guest', true, 'Ana', null, fixedNow).checkinNote).toBeNull()
        expect(applyOptimisticMark(guest, 'guest', true, 'Ana', 'Nueva nota', fixedNow).checkinNote).toBe('Nueva nota')
    })

    it('replaceGuestById swaps only the matching row, preserving list order', () => {
        const guests = [guestFixture({ id: '1', name: 'A' }), guestFixture({ id: '2', name: 'B' })]
        const updated = replaceGuestById(guests, guestFixture({ id: '2', name: 'B updated' }))
        expect(updated.map(g => g.name)).toEqual(['A', 'B updated'])
        expect(updated).not.toBe(guests) // new array, no mutation
    })
})

describe('performOptimisticMark — optimistic UI with rollback on failure', () => {
    it('renders the optimistic row via the callback BEFORE the POST resolves', async () => {
        const guests = [guestFixture({ id: 'r1' })]
        const seenStates: CheckinGuestDto[][] = []
        let resolvePost!: (value: MarkResponseLike) => void
        const pending = new Promise<MarkResponseLike>(resolve => { resolvePost = resolve })

        const promise = performOptimisticMark(
            guests,
            { rsvpId: 'r1', target: 'guest', checkedIn: true, staffName: 'Ana Staff' },
            () => pending,
            optimistic => seenStates.push(optimistic),
        )

        // The optimistic callback must have fired synchronously, before we
        // ever resolve the network call.
        expect(seenStates).toHaveLength(1)
        expect(seenStates[0][0].checkedInAt).not.toBeNull()
        expect(seenStates[0][0].checkedInBy).toBe('Ana Staff')

        resolvePost(jsonResponse(200, { success: true, guest: guestFixture({ id: 'r1', checkedInAt: '2026-08-18T20:20:00.000Z', checkedInBy: 'Ana Staff' }) }))
        const outcome = await promise
        expect(outcome.ok).toBe(true)
        expect(outcome.guests[0].checkedInAt).toBe('2026-08-18T20:20:00.000Z')
    })

    it('ISSUE-017 acceptance criterion: a network failure (rejected fetch) rolls the optimistic update back to the ORIGINAL state', async () => {
        const guests = [guestFixture({ id: 'r1', checkedInAt: null })]

        const outcome = await performOptimisticMark(
            guests,
            { rsvpId: 'r1', target: 'guest', checkedIn: true, staffName: 'Ana Staff' },
            () => Promise.reject(new Error('network down')),
            () => {},
        )

        expect(outcome.ok).toBe(false)
        expect(outcome.sessionExpired).toBe(false)
        expect(outcome.errorMessage).toBeTruthy()
        // Rolled back: identical to the pre-tap state, not the optimistic guess.
        expect(outcome.guests).toEqual(guests)
        expect(outcome.guests[0].checkedInAt).toBeNull()
    })

    it('a non-2xx response (e.g. 409 not_confirmed) also rolls back and surfaces the server error message', async () => {
        const guests = [guestFixture({ id: 'r1', checkedInAt: null })]

        const outcome = await performOptimisticMark(
            guests,
            { rsvpId: 'r1', target: 'guest', checkedIn: true, staffName: 'Ana Staff' },
            () => Promise.resolve(jsonResponse(409, { success: false, error: 'Este invitado aún no confirmado no se puede marcar como llegado' })),
            () => {},
        )

        expect(outcome.ok).toBe(false)
        expect(outcome.sessionExpired).toBe(false)
        expect(outcome.errorMessage).toBe('Este invitado aún no confirmado no se puede marcar como llegado')
        expect(outcome.guests).toEqual(guests)
    })

    it('a 401 rolls back AND reports sessionExpired (caller must bounce to the gate)', async () => {
        const guests = [guestFixture({ id: 'r1', checkedInAt: null })]

        const outcome = await performOptimisticMark(
            guests,
            { rsvpId: 'r1', target: 'guest', checkedIn: true, staffName: 'Ana Staff' },
            () => Promise.resolve(jsonResponse(401, { success: false, error: 'Sesión de check-in inválida o expirada' })),
            () => {},
        )

        expect(outcome.sessionExpired).toBe(true)
        expect(outcome.ok).toBe(false)
        expect(outcome.guests).toEqual(guests)
    })

    it('marking the guest then the +1 are two independent calls that do not clobber each other\'s optimistic state', async () => {
        const guests = [guestFixture({ id: 'r1', plusOne: true })]

        const guestOutcome = await performOptimisticMark(
            guests,
            { rsvpId: 'r1', target: 'guest', checkedIn: true, staffName: 'Ana' },
            () => Promise.resolve(jsonResponse(200, { success: true, guest: guestFixture({ id: 'r1', plusOne: true, checkedInAt: '2026-08-18T20:00:00.000Z', checkedInBy: 'Ana' }) })),
            () => {},
        )
        const plusOneOutcome = await performOptimisticMark(
            guestOutcome.guests,
            { rsvpId: 'r1', target: 'plusOne', checkedIn: true, staffName: 'Ana' },
            () => Promise.resolve(jsonResponse(200, { success: true, guest: guestFixture({ id: 'r1', plusOne: true, checkedInAt: '2026-08-18T20:00:00.000Z', plusOneCheckedInAt: '2026-08-18T20:02:00.000Z', checkedInBy: 'Ana' }) })),
            () => {},
        )

        expect(plusOneOutcome.guests[0].checkedInAt).toBe('2026-08-18T20:00:00.000Z')
        expect(plusOneOutcome.guests[0].plusOneCheckedInAt).toBe('2026-08-18T20:02:00.000Z')
    })

    it('an unknown rsvpId (not in the current list) is a no-op that reports failure without throwing', async () => {
        const guests = [guestFixture({ id: 'r1' })]
        const outcome = await performOptimisticMark(
            guests,
            { rsvpId: 'does-not-exist', target: 'guest', checkedIn: true, staffName: 'Ana' },
            () => Promise.resolve(jsonResponse(200, { success: true, guest: guestFixture() })),
            () => {},
        )
        expect(outcome.ok).toBe(false)
        expect(outcome.guests).toEqual(guests)
    })
})

describe('interpretAuthResponse (POST /api/checkin/auth outcomes)', () => {
    it('200 + {success, staffName} -> success', async () => {
        const outcome = await interpretAuthResponse(jsonResponse(200, { success: true, staffName: 'Ana Staff' }))
        expect(outcome).toEqual({ kind: 'success', staffName: 'Ana Staff' })
    })

    it('404 (opaque: event missing OR portal off) -> unavailable', async () => {
        expect(await interpretAuthResponse(jsonResponse(404, { success: false, error: 'No encontrado' })))
            .toEqual({ kind: 'unavailable' })
    })

    it('401 -> invalid_credentials (no detail leaked to the caller)', async () => {
        expect(await interpretAuthResponse(jsonResponse(401, { success: false, error: 'Credenciales inválidas' })))
            .toEqual({ kind: 'invalid_credentials' })
    })

    it('429 -> rate_limited', async () => {
        expect(await interpretAuthResponse(jsonResponse(429, { success: false, error: 'Demasiados intentos fallidos.' })))
            .toEqual({ kind: 'rate_limited' })
    })

    it('any other status (400/500/503) -> generic error', async () => {
        expect(await interpretAuthResponse(jsonResponse(503, { success: false }))).toEqual({ kind: 'error' })
        expect(await interpretAuthResponse(jsonResponse(500, {}))).toEqual({ kind: 'error' })
    })
})

describe('sessionStorage helpers — staffName only, never the password', () => {
    class MemoryStorage {
        private store = new Map<string, string>()
        getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
        setItem(key: string, value: string) { this.store.set(key, value) }
        removeItem(key: string) { this.store.delete(key) }
    }

    beforeEach(() => {
        ;(globalThis as unknown as { window: { sessionStorage: MemoryStorage } }).window = { sessionStorage: new MemoryStorage() }
    })

    afterEach(() => {
        delete (globalThis as { window?: unknown }).window
    })

    it('round-trips a staff name under a slug-scoped key', () => {
        writeStoredStaffName('fiesta', 'Ana Staff')
        expect(readStoredStaffName('fiesta')).toBe('Ana Staff')
        expect(staffStorageKey('fiesta')).toBe('checkin-staff-name-fiesta')
    })

    it('different slugs never see each other\'s stored staff name', () => {
        writeStoredStaffName('fiesta', 'Ana Staff')
        expect(readStoredStaffName('otra-fiesta')).toBeNull()
    })

    it('clearStoredStaffName removes it', () => {
        writeStoredStaffName('fiesta', 'Ana Staff')
        clearStoredStaffName('fiesta')
        expect(readStoredStaffName('fiesta')).toBeNull()
    })

    it('is a no-op (never throws) when window is unavailable (SSR)', () => {
        delete (globalThis as { window?: unknown }).window
        expect(() => writeStoredStaffName('fiesta', 'Ana')).not.toThrow()
        expect(readStoredStaffName('fiesta')).toBeNull()
        expect(() => clearStoredStaffName('fiesta')).not.toThrow()
    })
})

// ============================================================
// Part 2 — page.tsx / GuestRow.tsx source-string wiring contract
// ============================================================

const pageSource = readFileSync('app/checkin/[slug]/page.tsx', 'utf8')
const guestRowSource = readFileSync('app/checkin/[slug]/GuestRow.tsx', 'utf8')
const cssSource = readFileSync('app/checkin/[slug]/checkin.module.css', 'utf8')

describe('app/checkin/[slug]/page.tsx wiring (ISSUE-017)', () => {
    it('never sends the password anywhere except the auth POST body, and never persists it', () => {
        expect(pageSource).toContain("fetch('/api/checkin/auth'")
        expect(pageSource).toContain('password: passwordInput')
        // The page never touches window.sessionStorage directly — only via
        // the imported helpers, and only ever with staffName, never the password.
        expect(pageSource).not.toContain('window.sessionStorage')
        expect(pageSource).toContain('writeStoredStaffName(slug, outcome.staffName)')
        expect(pageSource).not.toMatch(/writeStoredStaffName\([^)]*password/i)
        expect(pageSource).toContain("setPasswordInput('')")
    })

    it('gate submit interprets every documented outcome (success/unavailable/invalid/rate-limited/error)', () => {
        expect(pageSource).toContain("case 'success':")
        expect(pageSource).toContain("case 'unavailable':")
        expect(pageSource).toContain("case 'invalid_credentials':")
        expect(pageSource).toContain("'Contraseña incorrecta.'")
        expect(pageSource).toContain("case 'rate_limited':")
        expect(pageSource).toContain('Demasiados intentos. Espera unos minutos e intenta de nuevo.')
    })

    it('fetches the guest list from the documented endpoint and bounces to the gate on 401', () => {
        expect(pageSource).toContain("fetch(`/api/checkin/guests?slug=${encodeURIComponent(slug)}`")
        expect(pageSource).toContain('response.status === 401')
        expect(pageSource).toContain("returnToGate('Tu sesión expiró. Vuelve a iniciar sesión.')")
        expect(pageSource).toContain('clearStoredStaffName(slug)')
    })

    it('polls every 12s and pauses while the tab is hidden', () => {
        expect(pageSource).toContain('const POLL_INTERVAL_MS = 12000')
        expect(pageSource).toContain('setInterval(() => {')
        expect(pageSource).toContain('if (document.hidden) return')
        expect(pageSource).toContain('POLL_INTERVAL_MS)')
        expect(pageSource).toContain('clearInterval(interval)')
    })

    it('the header shows the sticky counter and search, and offers the three quick filters', () => {
        expect(pageSource).toContain('styles.listHeader')
        expect(pageSource).toContain('llegados')
        expect(pageSource).toContain("placeholder=\"Buscar por nombre…\"")
        expect(pageSource).toContain('Todos')
        expect(pageSource).toContain('Falta por llegar')
        expect(pageSource).toContain('Ya llegaron')
    })

    it('marks go through performOptimisticMark against POST /api/checkin/mark, never mutating guests directly', () => {
        expect(pageSource).toContain('performOptimisticMark(')
        expect(pageSource).toContain("fetch('/api/checkin/mark'")
        expect(pageSource).toContain('JSON.stringify({ slug, rsvpId, target, checkedIn')
    })

    it('renders the opaque "Portal no disponible" screen, not a password-specific message, when the event/portal is unavailable', () => {
        expect(pageSource).toContain('Portal no disponible')
        expect(pageSource).toContain('eventUnavailable')
    })
})

describe('app/checkin/[slug]/GuestRow.tsx wiring (ISSUE-017)', () => {
    it('renders name, +1 badge with name, masked email, and the pending badge', () => {
        expect(guestRowSource).toContain('guest.name')
        expect(guestRowSource).toContain('guest.plusOneName')
        expect(guestRowSource).toContain('guest.maskedEmail')
        expect(guestRowSource).toContain('no confirmado')
    })

    it('pending_* (non-markable) rows disable both the seat checks and the note button', () => {
        const markableCheck = guestRowSource.indexOf('isCheckinMarkable(guest.status)')
        expect(markableCheck).toBeGreaterThan(-1)
        expect(guestRowSource).toContain('disabled={!markable}')
        expect(guestRowSource).toContain('disabled={disabled || busy}')
    })

    it('a marked seat shows the arrival time and "por {staffName}"', () => {
        expect(guestRowSource).toContain('formatArrivalTime(checkedAtIso)')
        expect(guestRowSource).toContain('` · por ${checkedInBy}`')
    })

    it('the note input caps at 500 chars and commits on blur', () => {
        expect(guestRowSource).toContain('const MAX_NOTE_LENGTH = 500')
        expect(guestRowSource).toContain('maxLength={MAX_NOTE_LENGTH}')
        expect(guestRowSource).toContain('onBlur={commitNote}')
    })

    it('each seat check button is a real button (not a div/span) so it is keyboard/tap accessible', () => {
        expect(guestRowSource.match(/type="button"/g)?.length).toBeGreaterThanOrEqual(2)
    })
})

describe('app/checkin/[slug]/checkin.module.css (ISSUE-017: tap targets and mobile safety)', () => {
    it('every tappable control (seat check, note button, filter) is at least 44px', () => {
        expect(cssSource).toContain('min-height: 44px;')
        expect(cssSource).toMatch(/\.noteButton\s*{[^}]*width: 44px;/)
        expect(cssSource).toMatch(/\.noteButton\s*{[^}]*height: 44px;/)
    })

    it('avoids the iOS auto-zoom-on-focus trap by never sizing text inputs under 16px', () => {
        expect(cssSource).not.toMatch(/font-size:\s*(?:[0-9]|1[0-5])px/)
    })

    it('is mobile-safe: no horizontal scroll, safe-area insets respected', () => {
        expect(cssSource).toContain('overflow-x: clip;')
        expect(cssSource).not.toMatch(/overflow-x:\s*(?:auto|scroll)/)
        expect(cssSource).toContain('env(safe-area-inset-top)')
        expect(cssSource).toContain('env(safe-area-inset-bottom)')
        expect(cssSource).toContain('@media (max-width: 480px)')
    })

    it('uses the light fintech palette and semantic green arrival state', () => {
        expect(cssSource).toContain('--ci-bg: #f6f7f9;')
        expect(cssSource).toContain('--ci-surface: #fff;')
        expect(cssSource).toContain('--ci-primary: #1e40af;')
        expect(cssSource).toContain('--ci-success: #047857;')
        expect(cssSource).not.toMatch(/#(?:0f0f10|111113|17171a|fffdf7|f5f0e5)/i)
    })

    it('keeps the sticky controls and quick filters visible without a horizontal carousel', () => {
        expect(cssSource).toMatch(/\.listHeader\s*\{[^}]*position:\s*sticky;/)
        expect(cssSource).toMatch(/\.filterRow\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/)
        expect(cssSource).toMatch(/@media \(max-width: 340px\)[\s\S]*?\.filterRow\s*\{[^}]*grid-template-columns:\s*1fr 1fr;/)
    })
})
