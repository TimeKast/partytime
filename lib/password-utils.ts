import { randomBytes, randomInt, createHash } from 'crypto'
import { validatePasswordPolicy, type PasswordPolicyContext } from './password-policy'

/**
 * Generate a 256-bit reset token. `raw` is emailed to the user and never
 * persisted; `hash` (SHA-256 of `raw`) is what gets stored (SI1/A4/A5).
 */
export function generateResetToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('hex')
    return { raw, hash: hashResetToken(raw) }
}

export function hashResetToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex')
}

// Ambiguous look-alike characters (0/O, 1/l/I) are excluded so a temp
// password read aloud or copied by hand is not misread.
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALL = LOWER + UPPER + DIGITS
const TEMP_PASSWORD_LENGTH = 20

function pickRandomChar(charset: string): string {
    return charset[randomInt(charset.length)]
}

function shuffle(chars: string[]): string[] {
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1)
            ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    return chars
}

/**
 * Generate an alphanumeric temp password that always contains an uppercase
 * letter, a lowercase letter and a number, with no ambiguous characters.
 */
export function generateTemporaryPassword(context: PasswordPolicyContext = {}): string {
    for (let attempt = 0; attempt < 100; attempt++) {
        const required = [
            pickRandomChar(LOWER),
            pickRandomChar(UPPER),
            pickRandomChar(DIGITS),
        ]
        const rest = Array.from(
            { length: TEMP_PASSWORD_LENGTH - required.length },
            () => pickRandomChar(ALL),
        )
        const candidate = shuffle([...required, ...rest]).join('')
        if (validatePasswordPolicy(candidate, context).ok) return candidate
    }

    throw new Error('Unable to generate a policy-compliant temporary password')
}
