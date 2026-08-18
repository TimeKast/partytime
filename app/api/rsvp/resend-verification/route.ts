import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { BoundedFixedWindowRateLimiter } from '@/lib/bounded-rate-limiter'
import {
    VERIFICATION_TOKEN_TTL_MS,
    buildVerificationUrl,
    generateVerificationToken,
    hashVerificationToken,
} from '@/lib/verification'
import { generateVerificationEmail, buildVerificationEmailSubject } from '@/lib/verification-email'
import { buildEventEmailData } from '@/lib/event-email-data'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { waitUntil } from '@vercel/functions'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

// Same issuance budget as /api/auth/forgot-password (PLAN-EPICS-002-005.md
// §3.2 / ISSUE-007): 5 attempts per 15-minute window, per key.
const THROTTLE_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_TRACKED_KEYS = 2048
const MAX_JSON_BYTES = 2 * 1024
const MAX_EMAIL_LENGTH = 320
// Lighter than forgot-password's 1200ms floor (no bcrypt work here), but
// still enough to blunt a timing side channel between "found a pending row,
// queued an email" and "rate-limited / not found / not eligible".
const RESPONSE_FLOOR_MS = 400

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

// ISSUE-007: ALWAYS 202 opaque — ver Gherkin "sin revelar existencia".
// Never varies with whether the (slug, email) pair actually has a pending
// row, whether the event has verification enabled, or whether a rate limit
// tripped. Only truly malformed input (missing/invalid JSON, missing
// fields) gets a distinct 4xx, mirroring forgot-password's precedent.
const OPAQUE_RESPONSE = {
    success: true,
    message: 'Si tu RSVP está pendiente de verificación, te reenviamos el enlace.',
}

const resendIpLimiter = new BoundedFixedWindowRateLimiter({
    maxAttempts: MAX_ATTEMPTS,
    windowMs: THROTTLE_WINDOW_MS,
    maxEntries: MAX_TRACKED_KEYS,
})
const resendEmailLimiter = new BoundedFixedWindowRateLimiter({
    maxAttempts: MAX_ATTEMPTS,
    windowMs: THROTTLE_WINDOW_MS,
    maxEntries: MAX_TRACKED_KEYS,
})

function requestIpOf(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for')
    const firstHop = forwarded?.split(',', 1)[0]?.trim()
    return firstHop ? firstHop.slice(0, 64) : 'unknown'
}

type LimitedJsonResult =
    | { ok: true; value: unknown }
    | { ok: false; oversized: boolean }

async function readLimitedJson(request: NextRequest): Promise<LimitedJsonResult> {
    const contentLength = request.headers.get('content-length')
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_JSON_BYTES) {
        return { ok: false, oversized: true }
    }

    if (!request.body) return { ok: true, value: null }

    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        totalBytes += value.byteLength
        if (totalBytes > MAX_JSON_BYTES) {
            await reader.cancel()
            return { ok: false, oversized: true }
        }
        chunks.push(value)
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }

    try {
        return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) }
    } catch {
        return { ok: false, oversized: false }
    }
}

async function waitForResponseFloor(startedAt: number): Promise<void> {
    const remaining = RESPONSE_FLOOR_MS - (Date.now() - startedAt)
    if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining))
    }
}

async function opaqueResponse(startedAt: number): Promise<NextResponse> {
    await waitForResponseFloor(startedAt)
    return NextResponse.json(OPAQUE_RESPONSE, { status: 202, headers: NO_STORE_HEADERS })
}

/**
 * POST /api/rsvp/resend-verification
 * Body { slug, email }. Always responds 202 with the same opaque body,
 * regardless of whether the event exists, has verification enabled, has a
 * matching pending row, or was rate-limited — the anti-enumeration contract
 * (ISSUE-007 Gherkin). Rate-limited per (slug, email) AND per IP.
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now()
    try {
        if (!assertSameOrigin(request, { allowMissing: true })) {
            return opaqueResponse(startedAt)
        }
        if (!isDatabaseConfigured()) {
            return opaqueResponse(startedAt)
        }

        const requestIp = requestIpOf(request)
        if (resendIpLimiter.isLimited(requestIp, Date.now())) {
            // Reject before parsing JSON, DB lookup, token generation, or
            // email dispatch, while preserving the generic opaque body.
            return opaqueResponse(startedAt)
        }

        const parsed = await readLimitedJson(request)
        if (!parsed.ok) {
            return parsed.oversized
                ? NextResponse.json({ success: false, error: 'Solicitud demasiado grande' }, { status: 413, headers: NO_STORE_HEADERS })
                : NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400, headers: NO_STORE_HEADERS })
        }

        const body = parsed.value as { slug?: unknown; email?: unknown } | null
        const slug = typeof body?.slug === 'string' ? body.slug.trim() : ''
        const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
        if (!slug || !email || email.length > MAX_EMAIL_LENGTH) {
            return NextResponse.json({ success: false, error: 'Datos requeridos' }, { status: 400, headers: NO_STORE_HEADERS })
        }

        const emailKey = `${slug}:${email}`
        if (resendEmailLimiter.isLimited(emailKey, Date.now())) {
            return opaqueResponse(startedAt)
        }

        const { getEventBySlug, expireStalePendingRsvps, reissueVerificationToken, recordEmailSent } = await import('@/lib/queries')

        const event = await getEventBySlug(slug)
        if (!event || !event.emailVerificationEnabled) {
            return opaqueResponse(startedAt)
        }

        // Sweep this event's stale pending rows first so a technically-expired
        // (but not yet lazily swept) row never gets a resurrected token.
        await expireStalePendingRsvps(event.slug)

        const token = generateVerificationToken()
        const tokenHash = hashVerificationToken(token)
        const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS)

        const rsvp = await reissueVerificationToken({
            eventId: event.slug,
            email,
            tokenHash,
            expiresAt,
        })
        if (!rsvp) {
            return opaqueResponse(startedAt)
        }

        const verificationUrl = buildVerificationUrl(event.slug, token)
        const eventData = buildEventEmailData(event)
        const { html, text } = generateVerificationEmail({
            name: rsvp.name,
            eventTitle: eventData.title,
            verificationUrl,
        })

        const delivery = resend.emails.send({
                from: `Party Time! <${FROM_EMAIL}>`,
                to: rsvp.email,
                subject: buildVerificationEmailSubject(eventData.title),
                html,
                text,
            })
            .then(async ({ error }) => {
                if (!error) {
                    await recordEmailSent(rsvp.id, 'verification')
                } else {
                    console.error('Verification resend email send failed')
                }
            })
            .catch(() => {
                console.error('Verification resend email send failed')
            })

        // Extends the Vercel function lifetime without adding provider latency
        // to the public response and without a naked/untracked promise.
        waitUntil(delivery)

        return opaqueResponse(startedAt)
    } catch {
        console.error('Resend verification request failed')
        return opaqueResponse(startedAt)
    }
}
