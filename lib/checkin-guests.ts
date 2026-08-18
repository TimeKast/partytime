import type { RSVP } from './schema'

/**
 * ISSUE-016 (EPIC-005): statuses visible to check-in staff.
 * cancelled/expired carry no seat and are irrelevant to check-in — excluded
 * from both GET /api/checkin/guests and, via lib/queries.ts's
 * markCheckinGuest, from what a slug's guest list can ever match at all.
 * pending_payment/pending_verification ARE included (read-only): the staff
 * must be able to see the guest exists without being able to mark them in —
 * only a `confirmed` row is ever markable (enforced separately in
 * markCheckinGuest, not here).
 */
export const CHECKIN_VISIBLE_STATUSES = ['confirmed', 'pending_payment', 'pending_verification'] as const
export type CheckinVisibleStatus = typeof CHECKIN_VISIBLE_STATUSES[number]

export function isCheckinVisibleStatus(status: string): status is CheckinVisibleStatus {
    return (CHECKIN_VISIBLE_STATUSES as readonly string[]).includes(status)
}

/** Narrows a whole RSVP row by its status — used to filter a raw query result. */
export function isCheckinVisibleRow(rsvp: RSVP): rsvp is RSVP & { status: CheckinVisibleStatus } {
    return isCheckinVisibleStatus(rsvp.status)
}

/**
 * The ONLY shape ever sent to the check-in portal — GET /api/checkin/guests
 * and POST /api/checkin/mark's response both use this exact allowlist.
 * Deliberately excludes phone, full email, cancel token and any payment id
 * (ISSUE-016 acceptance criterion: "ninguna respuesta contiene phone ni
 * email completo").
 */
export interface CheckinGuestDto {
    id: string
    name: string
    plusOne: boolean
    plusOneName: string | null
    maskedEmail: string
    checkedInAt: string | null
    plusOneCheckedInAt: string | null
    checkedInBy: string | null
    checkinNote: string | null
    status: CheckinVisibleStatus
}

function maskSegment(value: string): string {
    // A fixed '***' regardless of the remaining length — the mask must never
    // reveal how long the original segment was (a per-char run of asterisks
    // would leak exactly that).
    return value.length === 0 ? '***' : `${value[0]}***`
}

function maskDomain(domain: string): string {
    const lastDotIndex = domain.lastIndexOf('.')
    if (lastDotIndex <= 0 || lastDotIndex === domain.length - 1) {
        // No real TLD to preserve (defensive — should not happen for a
        // stored RSVP email, which app/api/rsvp validates before insert).
        return maskSegment(domain)
    }
    const rest = domain.slice(0, lastDotIndex)
    const tld = domain.slice(lastDotIndex + 1)
    return `${maskSegment(rest)}.${tld}`
}

/**
 * ISSUE-016: 'jose@gmail.com' -> 'j***@g***.com'. The first letter of the
 * local part and of the domain (everything before its FINAL '.', which may
 * itself contain dots for a subdomain — e.g. 'mail.google.com' ->
 * 'm***.com') survive; everything else becomes a fixed '***'. The final TLD
 * label is kept in full so the masked address still reads as a real one.
 */
export function maskEmail(email: string): string {
    const atIndex = email.indexOf('@')
    if (atIndex <= 0 || atIndex === email.length - 1) {
        // Malformed input (should not happen for a stored RSVP email) — mask
        // conservatively rather than ever leak it unmasked.
        return maskSegment(email)
    }
    const local = email.slice(0, atIndex)
    const domain = email.slice(atIndex + 1)
    return `${maskSegment(local)}@${maskDomain(domain)}`
}

/**
 * Shared allowlist mapping used by both GET /api/checkin/guests (every
 * visible row) and POST /api/checkin/mark's response (the single updated
 * row) — same DTO shape both ways, per ISSUE-016.
 */
export function toCheckinGuestDto(rsvp: RSVP & { status: CheckinVisibleStatus }): CheckinGuestDto {
    return {
        id: rsvp.id,
        name: rsvp.name,
        plusOne: rsvp.plusOne === true,
        plusOneName: rsvp.plusOneName,
        maskedEmail: maskEmail(rsvp.email),
        checkedInAt: rsvp.checkedInAt ? rsvp.checkedInAt.toISOString() : null,
        plusOneCheckedInAt: rsvp.plusOneCheckedInAt ? rsvp.plusOneCheckedInAt.toISOString() : null,
        checkedInBy: rsvp.checkedInBy,
        checkinNote: rsvp.checkinNote,
        status: rsvp.status,
    }
}

// Same collator settings as lib/rsvp-list.ts's nameCollator — kept as its own
// instance here since that module cannot be imported from a route this file
// is shared with without pulling in client-bundle-unsafe code, and vice
// versa; duplicating a single `new Intl.Collator(...)` call is cheaper than
// reorganizing either module's boundaries for this.
const checkinNameCollator = new Intl.Collator('es-MX', {
    sensitivity: 'base',
    numeric: true,
    usage: 'sort',
})

/** ISSUE-016: "Orden: alfabético por nombre" — applied once, in one place. */
export function sortCheckinGuestsByName(guests: readonly CheckinGuestDto[]): CheckinGuestDto[] {
    return [...guests].sort((a, b) => checkinNameCollator.compare(a.name, b.name))
}
