import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail } from '@/lib/user-queries'
import { generateResetToken } from '@/lib/password-utils'
import { issueResetTokenIfAllowed } from '@/lib/password-reset-queries'
import { generatePasswordResetEmail, PASSWORD_RESET_EMAIL_SUBJECT } from '@/lib/password-reset-email'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { assertSameOrigin } from '@/lib/origin-check'
import { timingSafeEqualStr } from '@/lib/timing-safe'
import { BoundedFixedWindowRateLimiter } from '@/lib/bounded-rate-limiter'
import { waitUntil } from '@vercel/functions'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000
const THROTTLE_WINDOW_MS = 15 * 60 * 1000
const MAX_ACTIVE_TOKENS_PER_WINDOW = 3
const MAX_IN_MEMORY_ATTEMPTS = 5
const MAX_TRACKED_IPS = 2048
const MAX_JSON_BYTES = 4 * 1024
const MAX_EMAIL_LENGTH = 320
const RESPONSE_FLOOR_MS = 1200
const DECOY_USER_ID = '__password_reset_decoy__'

const forgotIpLimiter = new BoundedFixedWindowRateLimiter({
    maxAttempts: MAX_IN_MEMORY_ATTEMPTS,
    windowMs: THROTTLE_WINDOW_MS,
    maxEntries: MAX_TRACKED_IPS,
})
const DUMMY_HASH = bcrypt.hashSync('password-reset-timing-placeholder', 12)

const GENERIC_RESPONSE = {
    success: true,
    message: 'Si el correo existe en nuestro sistema, se enviará un enlace para restablecer tu contraseña.',
}

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

async function genericResponse(startedAt: number) {
    await waitForResponseFloor(startedAt)
    return NextResponse.json(GENERIC_RESPONSE)
}

/**
 * POST /api/auth/forgot-password
 * Always returns the same generic response regardless of whether the email
 * exists, is the env-based super admin, is inactive, or is throttled (SI6) —
 * this is the anti-enumeration contract. Public unauth route: rejects an
 * explicit cross-site Origin but tolerates a missing one (SI7).
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now()
    try {
        if (!assertSameOrigin(request, { allowMissing: true })) {
            return genericResponse(startedAt)
        }

        const requestIp = requestIpOf(request)
        if (forgotIpLimiter.isLimited(requestIp, Date.now())) {
            // Reject before parsing JSON, bcrypt, user lookup, token
            // generation, or DB issuance while preserving the generic body.
            return genericResponse(startedAt)
        }

        const parsed = await readLimitedJson(request)
        if (!parsed.ok) {
            return parsed.oversized
                ? NextResponse.json({ success: false, error: 'Solicitud demasiado grande' }, { status: 413 })
                : NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 })
        }

        const body = parsed.value as { email?: unknown } | null
        const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
        if (!email || email.length > MAX_EMAIL_LENGTH) {
            return NextResponse.json({ success: false, error: 'Email requerido' }, { status: 400 })
        }

        // Every syntactically usable request pays the same bcrypt work and DB
        // lookup before account-specific branching (SI6). Email delivery still
        // necessarily adds provider latency for real accounts, but cheap early
        // paths no longer expose env/missing/inactive users.
        await bcrypt.compare(email, DUMMY_HASH)
        const user = await getUserByEmail(email)
        const superAdminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME
        const isEnvAdmin = !!superAdminEmail && timingSafeEqualStr(email, superAdminEmail.toLowerCase().trim())
        // Every usable request executes the same atomic DB-shaped issuance
        // statement. A decoy id makes non-active/env/rate-limited branches a
        // safe no-op while preserving response-work parity.
        const since = new Date(Date.now() - THROTTLE_WINDOW_MS)
        const { raw, hash } = generateResetToken()
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)
        const targetUserId = !isEnvAdmin && user?.isActive ? user.id : DECOY_USER_ID
        const issued = await issueResetTokenIfAllowed({
            userId: targetUserId,
            tokenHash: hash,
            expiresAt,
            requestIp: requestIp === 'unknown' ? undefined : requestIp,
            since,
            maxRecentTokens: MAX_ACTIVE_TOKENS_PER_WINDOW,
        })

        if (!issued || !user || targetUserId === DECOY_USER_ID) {
            return genericResponse(startedAt)
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const resetUrl = `${baseUrl}/reset-password?token=${raw}`
        const { html, text } = generatePasswordResetEmail({ name: user.name, resetUrl })

        const delivery = resend.emails.send({
                from: `Party Time! <${FROM_EMAIL}>`,
                to: user.email,
                subject: PASSWORD_RESET_EMAIL_SUBJECT,
                html,
                text,
            })
            .then(() => undefined)
            .catch(() => {
                // Non-sensitive log only — never the raw token or recipient PII.
                console.error('Password reset email send failed')
            })

        // Extends the Vercel function lifetime without adding provider latency
        // to the public response and without a naked/untracked promise.
        waitUntil(delivery)

        return genericResponse(startedAt)
    } catch {
        console.error('Forgot password request failed')
        return genericResponse(startedAt)
    }
}
