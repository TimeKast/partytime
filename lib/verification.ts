/**
 * RSVP email verification token (ISSUE-007, EPIC-003). Copies the
 * password_reset_tokens pattern (hash-only, reissue = overwrite) — NOT the
 * cancel-token pattern (see lib/queries.ts generateCancelToken). See
 * docs/backlog/ISSUE-007-email-verification-backend.md and
 * PLAN-EPICS-002-005.md §3.2.
 */

import { createHash, randomBytes } from 'node:crypto'

export const VERIFICATION_TOKEN_BYTES = 32
// Same TTL for verification_expires_at and pending_expires_at (rsvps table):
// if the guest never clicks, the pending row expires and releases its seat.
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function generateVerificationToken(): string {
    return randomBytes(VERIFICATION_TOKEN_BYTES).toString('base64url')
}

export function isValidVerificationToken(token: unknown): token is string {
    return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

/**
 * Only the SHA-256 hex digest is ever persisted (rsvps.verification_token_hash);
 * the raw token is emailed once and never logged. Format is validated BEFORE
 * hashing so an attacker-controlled string never reaches the digest step —
 * the hash comparison itself then happens as a plain SQL WHERE equality
 * (64 hex chars, not a secret-length string comparison — see
 * verifyRsvpByToken in lib/queries.ts), same reasoning already applied to
 * consumeResetToken/hashRsvpInvitationToken.
 */
export function hashVerificationToken(token: string): string {
    if (!isValidVerificationToken(token)) {
        throw new Error('Invalid verification token')
    }
    return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function buildVerificationUrl(slug: string, token: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return `${baseUrl}/verify/${slug}?token=${token}`
}
