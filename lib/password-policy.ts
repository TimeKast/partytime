/**
 * Server-authoritative password policy (A3). Client-side hints must mirror
 * this but never substitute for it — always validate here before hashing.
 */

const MIN_LENGTH = 12
const MAX_BYTES = 72 // bcrypt truncates/ignores input past 72 bytes.

// Small static denylist of common passwords. Checked case-insensitively
// against the full password, independent of the class/length checks above —
// a common password can otherwise satisfy every other rule.
const DENYLIST = [
    'password123!',
    'password123',
    'password1234',
    'correcthorsebattery',
    'qwertyuiop123',
    '123456789012',
    'letmein12345',
    'admin1234567',
    'partytime123',
]

export interface PasswordPolicyContext {
    email?: string | null
    name?: string | null
}

export interface PasswordPolicyResult {
    ok: boolean
    errors: string[]
}

function utf8ByteLength(value: string): number {
    return Buffer.byteLength(value, 'utf8')
}

function characterLength(value: string): number {
    return Array.from(value).length
}

function countClasses(password: string): number {
    const classes = [
        /[a-z]/.test(password),
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        /[^a-zA-Z0-9]/.test(password),
    ]
    return classes.filter(Boolean).length
}

function identityFragments(context: PasswordPolicyContext): string[] {
    const fragments: string[] = []
    const emailLocalPart = context.email?.split('@')[0]?.trim()
    if (emailLocalPart) fragments.push(emailLocalPart.toLowerCase())

    const name = context.name?.trim()
    if (name) {
        fragments.push(name.toLowerCase())
        for (const part of name.split(/\s+/)) {
            if (part.length >= 3) fragments.push(part.toLowerCase())
        }
    }
    return fragments.filter(fragment => fragment.length >= 3)
}

export function validatePasswordPolicy(
    password: string,
    context: PasswordPolicyContext = {},
): PasswordPolicyResult {
    const errors: string[] = []
    const normalized = password.trim().toLowerCase()

    if (characterLength(password) < MIN_LENGTH) {
        errors.push('too_short')
    }
    if (utf8ByteLength(password) > MAX_BYTES) {
        errors.push('too_long')
    }
    if (countClasses(password) < 3) {
        errors.push('too_few_classes')
    }
    if (identityFragments(context).some(fragment => normalized.includes(fragment))) {
        errors.push('contains_identity')
    }
    if (DENYLIST.includes(normalized)) {
        errors.push('denylisted')
    }

    return { ok: errors.length === 0, errors }
}
