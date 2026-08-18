import { createHash, randomBytes } from 'node:crypto'

export const RSVP_INVITATION_TOKEN_BYTES = 32
export const RSVP_INVITATION_MAX_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/

export type RsvpInvitationStatus = 'active' | 'used' | 'revoked' | 'expired'

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
