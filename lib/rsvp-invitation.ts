import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const RSVP_INVITATION_TOKEN_BYTES = 32
export const RSVP_INVITATION_MAX_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/
const KEY_VERSION_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const KEY_SECRET_PATTERN = /^[a-fA-F0-9]{64}$/
const MAX_TOKEN_KEYS = 8
const DERIVATION_CONTEXT = 'partytime:rsvp-invitation:v1'

export const RSVP_INVITATION_TOKEN_KEYS_ENV = 'RSVP_INVITATION_TOKEN_KEYS'

export type RsvpInvitationStatus = 'active' | 'used' | 'revoked' | 'expired'
export type RsvpInvitationUrlAvailability =
    | 'available'
    | 'not_recoverable'
    | 'configuration_unavailable'

interface RsvpInvitationTokenKey {
    version: string
    secret: Buffer
}

type RsvpInvitationTokenKeyring =
    | { ok: true; keys: RsvpInvitationTokenKey[] }
    | { ok: false }

export type RsvpInvitationTokenRecovery =
    | { status: 'available'; token: string }
    | { status: 'not_recoverable' }
    | { status: 'configuration_unavailable' }

export function generateRsvpInvitationToken(): string {
    return randomBytes(RSVP_INVITATION_TOKEN_BYTES).toString('base64url')
}

export function isValidRsvpInvitationToken(token: unknown): token is string {
    return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

export function hashRsvpInvitationToken(token: string): string {
    if (!isValidRsvpInvitationToken(token)) {
        throw new Error('Invalid RSVP invitation token')
    }
    return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isRsvpInvitationTokenHash(value: unknown): value is string {
    return typeof value === 'string' && SHA256_HEX_PATTERN.test(value)
}

/**
 * Parse a bounded, versioned keyring such as:
 * `v2:<64 hex chars>,v1:<64 hex chars>`.
 *
 * The first key is active for issuance. Older keys remain usable only to
 * reconstruct links created with them. Any malformed entry invalidates the
 * whole keyring so issuance and recovery fail closed.
 */
function parseRsvpInvitationTokenKeyring(value: string | undefined): RsvpInvitationTokenKeyring {
    if (!value) return { ok: false }

    const entries = value.split(',')
    if (entries.length === 0 || entries.length > MAX_TOKEN_KEYS) return { ok: false }

    const versions = new Set<string>()
    const keys: RsvpInvitationTokenKey[] = []
    for (const entry of entries) {
        const separator = entry.indexOf(':')
        if (separator <= 0 || entry.indexOf(':', separator + 1) !== -1) return { ok: false }

        const version = entry.slice(0, separator)
        const secretHex = entry.slice(separator + 1)
        if (
            !KEY_VERSION_PATTERN.test(version)
            || !KEY_SECRET_PATTERN.test(secretHex)
            || versions.has(version)
        ) {
            return { ok: false }
        }

        versions.add(version)
        keys.push({ version, secret: Buffer.from(secretHex, 'hex') })
    }

    return { ok: true, keys }
}

function deriveRsvpInvitationToken(
    key: RsvpInvitationTokenKey,
    linkId: string,
    eventBindingId: string,
): string {
    const payload = `${DERIVATION_CONTEXT}\0${key.version}\0${linkId}\0${eventBindingId}`
    return createHmac('sha256', key.secret).update(payload, 'utf8').digest('base64url')
}

/**
 * Issue a bearer that can later be reconstructed by an authorized admin.
 * No bearer or reversible ciphertext needs to be persisted; the DB continues
 * to store only its SHA-256 digest. Returns null when the dedicated keyring is
 * absent or malformed.
 */
export function issueRecoverableRsvpInvitationToken(
    linkId: string,
    eventBindingId: string,
    serializedKeyring = process.env[RSVP_INVITATION_TOKEN_KEYS_ENV],
): string | null {
    if (!linkId || !eventBindingId) return null
    const keyring = parseRsvpInvitationTokenKeyring(serializedKeyring)
    if (!keyring.ok) return null
    return deriveRsvpInvitationToken(keyring.keys[0], linkId, eventBindingId)
}

/**
 * Reconstruct only tokens whose digest proves they were issued by one of the
 * configured keys. Random legacy tokens (and tokens whose retired key is no
 * longer configured) remain valid if already known, but are not recoverable.
 */
export function recoverRsvpInvitationToken(
    input: { id: string; eventBindingId: string; tokenHash: string },
    serializedKeyring = process.env[RSVP_INVITATION_TOKEN_KEYS_ENV],
): RsvpInvitationTokenRecovery {
    const keyring = parseRsvpInvitationTokenKeyring(serializedKeyring)
    if (!keyring.ok) return { status: 'configuration_unavailable' }
    if (!input.id || !input.eventBindingId || !isRsvpInvitationTokenHash(input.tokenHash)) {
        return { status: 'not_recoverable' }
    }

    const storedDigest = Buffer.from(input.tokenHash, 'hex')
    for (const key of keyring.keys) {
        const token = deriveRsvpInvitationToken(key, input.id, input.eventBindingId)
        const candidateDigest = Buffer.from(hashRsvpInvitationToken(token), 'hex')
        if (timingSafeEqual(candidateDigest, storedDigest)) {
            return { status: 'available', token }
        }
    }

    return { status: 'not_recoverable' }
}

/**
 * Parse an API expiry value and enforce the capability lifetime boundary.
 * The upper bound is measured from the server's current instant, not from a
 * client-supplied timestamp.
 */
export function parseRsvpInvitationExpiry(value: unknown, now = new Date()): Date | null {
    if (typeof value !== 'string' || value.trim() === '') return null

    const expiresAt = new Date(value)
    if (!Number.isFinite(expiresAt.getTime())) return null

    const lifetime = expiresAt.getTime() - now.getTime()
    if (lifetime <= 0 || lifetime > RSVP_INVITATION_MAX_LIFETIME_MS) return null
    return expiresAt
}

export function getRsvpInvitationStatus(input: {
    expiresAt: Date
    usedAt: Date | null
    revokedAt: Date | null
}, now = new Date()): RsvpInvitationStatus {
    if (input.revokedAt) return 'revoked'
    if (input.usedAt) return 'used'
    if (input.expiresAt.getTime() <= now.getTime()) return 'expired'
    return 'active'
}
