/**
 * ISSUE-018 (EPIC-005): a client-side "suggest a password" helper for the
 * admin check-in settings section (app/admin/components/CheckinSettings.tsx).
 *
 * Deliberately NOT a cryptographic secret generator: the organizer sees the
 * suggestion in a plain, editable text field and can retype/replace it
 * before saving, and the real security boundary is server-side —
 * MIN/MAX_PASSWORD_LENGTH validation plus bcrypt hashing in
 * app/api/admin/checkin-config/route.ts. Math.random() keeps this file
 * dependency-free and safe to import from a 'use client' component (unlike
 * lib/auth-utils.ts's generateSessionToken, this never needs a Node 'crypto'
 * fallback that would otherwise have to be kept out of the browser bundle).
 *
 * Kept OUT of lib/checkin-*.ts on purpose — ISSUE-018 must not touch that
 * family of files (checkin auth/session/guests/mark, owned by
 * ISSUE-015/016/017).
 */

// A small, neutral word list — no proper nouns, no words that could read as
// offensive/ambiguous when concatenated. 30 entries is enough that picking 3
// distinct ones gives 30*29*28 = 24,360 orderings, plenty for a *suggestion*
// the organizer can still edit.
const SUGGESTION_WORDS = [
    'sol', 'luna', 'mar', 'rio', 'flor', 'nube', 'viento', 'fuego',
    'tierra', 'cielo', 'piedra', 'arbol', 'playa', 'monte', 'lago', 'estrella',
    'pajaro', 'coral', 'selva', 'desierto', 'volcan', 'cascada', 'sendero', 'bosque',
    'nieve', 'lluvia', 'trueno', 'arena', 'isla', 'valle',
] as const

export type PasswordSuggestionKind = 'words' | 'digits'

function randomIndex(exclusiveMax: number): number {
    return Math.floor(Math.random() * exclusiveMax)
}

/** Three distinct words from SUGGESTION_WORDS, hyphen-joined (e.g. "sol-mar-nube"). */
export function generateWordsSuggestion(): string {
    const pool = [...SUGGESTION_WORDS]
    const picked: string[] = []
    for (let i = 0; i < 3 && pool.length > 0; i++) {
        const index = randomIndex(pool.length)
        picked.push(pool[index])
        pool.splice(index, 1)
    }
    return picked.join('-')
}

/** Six random digits (e.g. "384726") — always exactly 6 characters, 0-9 only. */
export function generateDigitsSuggestion(): string {
    let digits = ''
    for (let i = 0; i < 6; i++) digits += randomIndex(10).toString()
    return digits
}

export function generatePasswordSuggestion(kind: PasswordSuggestionKind): string {
    return kind === 'digits' ? generateDigitsSuggestion() : generateWordsSuggestion()
}
