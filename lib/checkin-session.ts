import { createHmac } from 'node:crypto'
import { timingSafeEqualStr } from './timing-safe'

/**
 * ISSUE-015/EPIC-005: HMAC-signed, event-scoped session cookie for the
 * check-in portal (staff have no user account — one shared password per
 * event). Fail-closed by design: every issuing/validating function returns
 * null/false when CHECKIN_SESSION_SECRET is absent or malformed. There is
 * intentionally NO fallback secret (the cancel-token anti-patch this issue
 * explicitly avoids) — an unconfigured secret must make check-in
 * unavailable (503), never silently insecure.
 */

export const CHECKIN_SESSION_SECRET_ENV = 'CHECKIN_SESSION_SECRET'
export const CHECKIN_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h

const SECRET_PATTERN = /^[a-fA-F0-9]{64}$/
// Same charset events.slug is validated against at creation time
// (lib/event-api-contract.ts) — a slug outside this set could never be a
// real event, and cookie names must not carry characters requiring escaping.
const SLUG_PATTERN = /^[a-z0-9-]+$/

export interface CheckinCookiePayload {
    slug: string
    staffName: string
    /** Password version: passwordUpdatedAt.getTime() at issuance time. */
    pwv: number
    /** Absolute expiry, epoch milliseconds. */
    exp: number
}

export type CheckinCookieValidation =
    | { ok: true; payload: CheckinCookiePayload }
    | {
        ok: false
        reason: 'unavailable' | 'malformed' | 'expired' | 'slug_mismatch' | 'password_rotated'
    }

export interface IssuedCheckinCookie {
    name: string
    value: string
    maxAgeSeconds: number
}

function loadSecret(raw: string | undefined = process.env[CHECKIN_SESSION_SECRET_ENV]): Buffer | null {
    if (!raw || !SECRET_PATTERN.test(raw)) return null
    return Buffer.from(raw, 'hex')
}

export function isCheckinSessionConfigured(): boolean {
    return loadSecret() !== null
}

export function checkinCookieName(slug: string): string {
    return `checkin_session_${slug}`
}

/**
 * Fixed key order — never derived from Object.keys/spread — so the signed
 * representation can never be silently reordered by a future edit.
 */
function canonicalPayloadJson(payload: CheckinCookiePayload): string {
    return JSON.stringify({
        slug: payload.slug,
        staffName: payload.staffName,
        pwv: payload.pwv,
        exp: payload.exp,
    })
}

function signPayload(secret: Buffer, payloadJson: string): string {
    return createHmac('sha256', secret).update(payloadJson, 'utf8').digest('base64url')
}

function isCheckinCookiePayload(value: unknown): value is CheckinCookiePayload {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    return (
        typeof record.slug === 'string'
        && typeof record.staffName === 'string'
        && typeof record.pwv === 'number' && Number.isFinite(record.pwv)
        && typeof record.exp === 'number' && Number.isFinite(record.exp)
    )
}

/**
 * Returns null when CHECKIN_SESSION_SECRET is absent/malformed (fail closed)
 * or the slug fails the event-slug charset. Callers must treat null as "the
 * check-in portal is not available" (503), never fall back to an unsigned
 * cookie.
 */
export function issueCheckinCookie(
    slug: string,
    staffName: string,
    passwordUpdatedAt: Date,
    now: Date = new Date(),
): IssuedCheckinCookie | null {
    const secret = loadSecret()
    if (!secret) return null
    if (!SLUG_PATTERN.test(slug)) return null

    const payload: CheckinCookiePayload = {
        slug,
        staffName,
        pwv: passwordUpdatedAt.getTime(),
        exp: now.getTime() + CHECKIN_SESSION_MAX_AGE_MS,
    }
    const payloadJson = canonicalPayloadJson(payload)
    const signature = signPayload(secret, payloadJson)
    const value = `${Buffer.from(payloadJson, 'utf8').toString('base64url')}.${signature}`

    return {
        name: checkinCookieName(slug),
        value,
        maxAgeSeconds: Math.floor(CHECKIN_SESSION_MAX_AGE_MS / 1000),
    }
}

/**
 * Validates a cookie value against the exact slug it must be scoped to and
 * the event's CURRENT checkin_password_updated_at. Rotating the password
 * changes `pwv` and invalidates every previously issued cookie without any
 * DB write of its own (PLAN-EPICS-002-005.md §3.4).
 */
export function validateCheckinCookie(
    cookieValue: string | null | undefined,
    slug: string,
    currentPasswordUpdatedAt: Date,
    now: Date = new Date(),
): CheckinCookieValidation {
    const secret = loadSecret()
    if (!secret) return { ok: false, reason: 'unavailable' }
    if (!cookieValue) return { ok: false, reason: 'malformed' }

    const separator = cookieValue.indexOf('.')
    if (separator <= 0 || cookieValue.indexOf('.', separator + 1) !== -1) {
        return { ok: false, reason: 'malformed' }
    }
    const payloadPart = cookieValue.slice(0, separator)
    const signaturePart = cookieValue.slice(separator + 1)
    if (!payloadPart || !signaturePart) return { ok: false, reason: 'malformed' }

    let payloadJson: string
    try {
        payloadJson = Buffer.from(payloadPart, 'base64url').toString('utf8')
    } catch {
        return { ok: false, reason: 'malformed' }
    }

    const expectedSignature = signPayload(secret, payloadJson)
    // Timing-safe: both operands hashed to a fixed digest first (lib/timing-safe.ts),
    // so an attacker cannot use timing to learn how many leading bytes of a
    // forged signature happen to match.
    if (!timingSafeEqualStr(signaturePart, expectedSignature)) {
        return { ok: false, reason: 'malformed' }
    }

    let payload: unknown
    try {
        payload = JSON.parse(payloadJson)
    } catch {
        return { ok: false, reason: 'malformed' }
    }
    if (!isCheckinCookiePayload(payload)) return { ok: false, reason: 'malformed' }

    if (payload.exp <= now.getTime()) return { ok: false, reason: 'expired' }
    if (payload.slug !== slug) return { ok: false, reason: 'slug_mismatch' }
    if (payload.pwv !== currentPasswordUpdatedAt.getTime()) return { ok: false, reason: 'password_rotated' }

    return { ok: true, payload }
}

/** Cookie options for a successfully issued check-in session. */
export function getCheckinCookieOptions(maxAgeSeconds: number): {
    httpOnly: boolean
    secure: boolean
    sameSite: 'lax'
    path: string
    maxAge: number
} {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: maxAgeSeconds,
    }
}
