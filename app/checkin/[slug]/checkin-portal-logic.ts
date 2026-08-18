/**
 * ISSUE-017 (EPIC-005): pure, DOM-free logic for the check-in portal UI
 * (`app/checkin/[slug]/page.tsx`). Kept separate from the page component so
 * it can be unit tested directly under this project's `environment: 'node'`
 * Vitest setup (vitest.config.ts has no jsdom — see tests/checkin-api.test.ts
 * for the same pure-function-first pattern applied to lib/checkin-guests.ts).
 *
 * Nothing here touches `fetch`, `window`, `document` or React — every
 * side-effecting boundary (the actual POST, `sessionStorage`, `setInterval`)
 * is injected as a parameter so callers (real or test doubles) supply it.
 */
import type { CheckinGuestDto, CheckinVisibleStatus } from '@/lib/checkin-guests'

export type CheckinMarkTarget = 'guest' | 'plusOne'
export type CheckinQuickFilter = 'all' | 'pending' | 'arrived'

// ============================================================
// Search — accent/case-insensitive name matching
// ============================================================

const DIACRITIC_PATTERN = /[̀-ͯ]/g

/**
 * ISSUE-017: "búsqueda por nombre normalizada sin acentos (String.normalize
 * ('NFD') + strip diacritics, case-insensitive)". NFD decomposes each
 * accented character into a base letter + a combining diacritical mark
 * (U+0300-U+036F), which the regex then strips.
 */
export function normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(DIACRITIC_PATTERN, '').toLowerCase().trim()
}

export function guestMatchesSearch(guest: CheckinGuestDto, rawQuery: string): boolean {
    const query = normalizeSearchText(rawQuery)
    if (query.length === 0) return true
    if (normalizeSearchText(guest.name).includes(query)) return true
    if (guest.plusOneName && normalizeSearchText(guest.plusOneName).includes(query)) return true
    return false
}

// ============================================================
// Arrival counter — "X / Y llegados"
// ============================================================

export interface CheckinArrivalCount {
    arrived: number
    totalSeats: number
}

/**
 * ISSUE-017: "Y = total asientos de filas confirmed" and "invitado
 * marcado=1, +1 marcado=1" — only `confirmed` rows hold a real seat (a
 * pending_* row is visible but not seated yet, mirroring
 * CHECKIN_VISIBLE_STATUSES's own comment in lib/checkin-guests.ts). Each
 * confirmed guest contributes 1 seat to the denominator, +1 more if
 * plusOne=true, regardless of whether that seat has arrived; `arrived` sums
 * each seat's own independent checked-in flag.
 */
export function computeArrivalCount(guests: readonly CheckinGuestDto[]): CheckinArrivalCount {
    let arrived = 0
    let totalSeats = 0
    for (const guest of guests) {
        if (guest.status !== 'confirmed') continue
        totalSeats += 1
        if (guest.checkedInAt) arrived += 1
        if (guest.plusOne) {
            totalSeats += 1
            if (guest.plusOneCheckedInAt) arrived += 1
        }
    }
    return { arrived, totalSeats }
}

// ============================================================
// Quick filters — Todos / Falta por llegar / Ya llegaron
// ============================================================

/**
 * A pending_* row is never "arrived" (it cannot be marked at all) and is
 * never "fully arrived" either — it always counts toward "Falta por
 * llegar" until it becomes confirmed and gets marked.
 */
export function isGuestFullyArrived(guest: CheckinGuestDto): boolean {
    if (guest.status !== 'confirmed') return false
    const guestArrived = guest.checkedInAt !== null
    const plusOneArrived = guest.plusOne ? guest.plusOneCheckedInAt !== null : true
    return guestArrived && plusOneArrived
}

export function matchesQuickFilter(guest: CheckinGuestDto, filter: CheckinQuickFilter): boolean {
    if (filter === 'all') return true
    if (filter === 'arrived') return isGuestFullyArrived(guest)
    return !isGuestFullyArrived(guest) // 'pending'
}

export function filterGuests(
    guests: readonly CheckinGuestDto[],
    query: string,
    quickFilter: CheckinQuickFilter,
): CheckinGuestDto[] {
    return guests.filter(guest => guestMatchesSearch(guest, query) && matchesQuickFilter(guest, quickFilter))
}

// ============================================================
// Mark eligibility — pending_* rows are read-only
// ============================================================

export function isCheckinMarkable(status: CheckinVisibleStatus): boolean {
    return status === 'confirmed'
}

export function replaceGuestById(guests: readonly CheckinGuestDto[], updated: CheckinGuestDto): CheckinGuestDto[] {
    return guests.map(guest => (guest.id === updated.id ? updated : guest))
}

/**
 * Builds the OPTIMISTIC row shown immediately on tap/blur, before the POST
 * resolves. Mirrors lib/queries.ts's markCheckinGuest exactly: marking IN
 * stamps `checkedInBy`; unmarking leaves the last actor as-is; `note`
 * (when provided) always applies to the shared `checkinNote` field
 * regardless of target, same as the real column.
 */
export function applyOptimisticMark(
    guest: CheckinGuestDto,
    target: CheckinMarkTarget,
    checkedIn: boolean,
    staffName: string,
    note: string | null | undefined = undefined,
    now: () => Date = () => new Date(),
): CheckinGuestDto {
    const timestampField = target === 'guest'
        ? { checkedInAt: checkedIn ? now().toISOString() : null }
        : { plusOneCheckedInAt: checkedIn ? now().toISOString() : null }

    return {
        ...guest,
        ...timestampField,
        checkedInBy: checkedIn ? staffName : guest.checkedInBy,
        ...(note !== undefined ? { checkinNote: note } : {}),
    }
}

// ============================================================
// Optimistic mark orchestration (with rollback)
// ============================================================

export interface MarkResponseLike {
    status: number
    json: () => Promise<unknown>
}

export interface PerformMarkInput {
    rsvpId: string
    target: CheckinMarkTarget
    checkedIn: boolean
    staffName: string
    /** undefined = leave the note untouched; string/null = update it too. */
    note?: string | null
}

export interface MarkOutcome {
    guests: CheckinGuestDto[]
    ok: boolean
    /** True when the POST itself reports the session as no longer valid (401). */
    sessionExpired: boolean
    errorMessage: string | null
}

function isCheckinGuestDto(value: unknown): value is CheckinGuestDto {
    return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

/**
 * ISSUE-017 acceptance criterion: "Given el POST de marca falla (red) / Then
 * la UI revierte el optimistic update". `onOptimisticUpdate` is invoked
 * SYNCHRONOUSLY (before any `await`) with the optimistic array so a caller
 * can render it immediately; the returned `guests` always reflects the
 * final, reconciled state — the original array on any failure/network
 * error/401, or the server's own updated DTO on success (never the raw
 * optimistic guess, which could drift from what the server actually stored,
 * e.g. the checkedInAt timestamp).
 */
export async function performOptimisticMark(
    guests: readonly CheckinGuestDto[],
    input: PerformMarkInput,
    sendMark: () => Promise<MarkResponseLike>,
    onOptimisticUpdate: (guests: CheckinGuestDto[]) => void,
): Promise<MarkOutcome> {
    const original = [...guests]
    const current = guests.find(guest => guest.id === input.rsvpId)
    if (!current) {
        return { guests: original, ok: false, sessionExpired: false, errorMessage: 'Invitado no encontrado en la lista actual.' }
    }

    const optimisticGuest = applyOptimisticMark(current, input.target, input.checkedIn, input.staffName, input.note)
    onOptimisticUpdate(replaceGuestById(guests, optimisticGuest))

    try {
        const response = await sendMark()

        if (response.status === 401) {
            return { guests: original, ok: false, sessionExpired: true, errorMessage: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
        }

        if (response.status < 200 || response.status >= 300) {
            let message = 'No se pudo actualizar. Intenta de nuevo.'
            try {
                const body = await response.json()
                if (typeof body === 'object' && body !== null && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
                    message = (body as { error: string }).error
                }
            } catch {
                // Body wasn't JSON — keep the generic message.
            }
            return { guests: original, ok: false, sessionExpired: false, errorMessage: message }
        }

        const body = await response.json()
        const guestDto = typeof body === 'object' && body !== null && 'guest' in body
            ? (body as { guest: unknown }).guest
            : null
        if (!isCheckinGuestDto(guestDto)) {
            return { guests: original, ok: false, sessionExpired: false, errorMessage: 'Respuesta inválida del servidor.' }
        }

        return { guests: replaceGuestById(guests, guestDto), ok: true, sessionExpired: false, errorMessage: null }
    } catch {
        return { guests: original, ok: false, sessionExpired: false, errorMessage: 'No se pudo conectar. Intenta de nuevo.' }
    }
}

// ============================================================
// Gate (screen 1) — interpreting POST /api/checkin/auth
// ============================================================

export type CheckinAuthOutcome =
    | { kind: 'success'; staffName: string }
    | { kind: 'unavailable' }
    | { kind: 'invalid_credentials' }
    | { kind: 'rate_limited' }
    | { kind: 'error' }

export async function interpretAuthResponse(response: MarkResponseLike): Promise<CheckinAuthOutcome> {
    if (response.status === 200) {
        try {
            const body = await response.json()
            if (
                typeof body === 'object' && body !== null
                && 'success' in body && (body as { success: unknown }).success === true
                && 'staffName' in body && typeof (body as { staffName: unknown }).staffName === 'string'
            ) {
                return { kind: 'success', staffName: (body as { staffName: string }).staffName }
            }
        } catch {
            // Fall through to the generic error below.
        }
        return { kind: 'error' }
    }
    if (response.status === 404) return { kind: 'unavailable' }
    if (response.status === 401) return { kind: 'invalid_credentials' }
    if (response.status === 429) return { kind: 'rate_limited' }
    return { kind: 'error' }
}

// ============================================================
// sessionStorage — staffName only, NEVER the password (browser-only, no-ops on the server)
// ============================================================

const STAFF_STORAGE_KEY_PREFIX = 'checkin-staff-name-'

export function staffStorageKey(slug: string): string {
    return `${STAFF_STORAGE_KEY_PREFIX}${slug}`
}

export function readStoredStaffName(slug: string): string | null {
    if (typeof window === 'undefined') return null
    try {
        return window.sessionStorage.getItem(staffStorageKey(slug))
    } catch {
        return null
    }
}

export function writeStoredStaffName(slug: string, staffName: string): void {
    if (typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(staffStorageKey(slug), staffName)
    } catch {
        // Best-effort only (e.g. private-browsing storage quota) — the
        // session still works for this tab via in-memory React state.
    }
}

export function clearStoredStaffName(slug: string): void {
    if (typeof window === 'undefined') return
    try {
        window.sessionStorage.removeItem(staffStorageKey(slug))
    } catch {
        // Nothing to do — worst case the stale key lingers until overwritten.
    }
}
