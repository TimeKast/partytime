import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import {
    getCheckinCookieOptions,
    isCheckinSessionConfigured,
    issueCheckinCookie,
} from '@/lib/checkin-session'
import { BoundedFixedWindowRateLimiter } from '@/lib/bounded-rate-limiter'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

// ISSUE-015: "usar el mismo presupuesto que app/api/auth/login/route.ts para
// consistencia" — 5 attempts / 15 min, mirrored exactly. Separate limiters
// for IP and slug so a single guest hammering one event's portal cannot
// consume every other IP's budget, and vice versa.
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const checkinIpLimiter = new BoundedFixedWindowRateLimiter({
    maxAttempts: MAX_ATTEMPTS,
    windowMs: WINDOW_MS,
    maxEntries: 5000,
})
const checkinSlugLimiter = new BoundedFixedWindowRateLimiter({
    maxAttempts: MAX_ATTEMPTS,
    windowMs: WINDOW_MS,
    maxEntries: 1000,
})

const SLUG_PATTERN = /^[a-z0-9-]{1,100}$/
const MAX_PASSWORD_LENGTH = 200

// A valid bcrypt hash used to spend ~the same time on every "portal is not
// available" branch (event missing/inactive/checkin disabled/no password
// hash configured yet) as on a real "wrong password" compare, so timing
// cannot distinguish those cases from each other (same technique as
// app/api/auth/login/route.ts's DUMMY_HASH).
const DUMMY_HASH = bcrypt.hashSync('checkin-portal-timing-placeholder', 12)

// Every rejection reason that must be indistinguishable from "this event has
// no check-in portal" shares this exact body and status. A fresh
// NextResponse is built per call — a shared module-level instance would have
// its (single-use) body stream exhausted after the first request reads it.
function opaqueNotFound(): NextResponse {
    return NextResponse.json(
        { success: false, error: 'No encontrado' },
        { status: 404, headers: NO_STORE_HEADERS },
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requestIpOf(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for')
    const firstHop = forwarded?.split(',', 1)[0]?.trim()
    return firstHop ? firstHop.slice(0, 64) : 'unknown'
}

interface ValidBody {
    slug: string
    password: string
    staffName: string
}

function parseBody(body: unknown): ValidBody | null {
    if (!isRecord(body) || Object.keys(body).length !== 3) return null
    if (typeof body.slug !== 'string' || !SLUG_PATTERN.test(body.slug)) return null
    if (typeof body.password !== 'string' || body.password.length === 0 || body.password.length > MAX_PASSWORD_LENGTH) {
        return null
    }
    if (typeof body.staffName !== 'string') return null
    const staffName = body.staffName.trim()
    if (staffName.length < 2 || staffName.length > 120) return null

    return { slug: body.slug, password: body.password, staffName }
}

/**
 * POST /api/checkin/auth
 * Authenticates check-in staff against the event's shared password and
 * issues an HMAC-signed, event-scoped session cookie (lib/checkin-session.ts).
 * No accounts, no admin session required — this is the public staff-facing
 * gate for /checkin/[slug] (ISSUE-017).
 */
export async function POST(request: NextRequest) {
    // Public unauth route: no ambient credential rides on this request, so a
    // missing Origin/Referer (non-browser client) is tolerated the same way
    // forgot-password and /api/rsvp/verify already do; an explicit cross-site
    // Origin still fails closed.
    if (!assertSameOrigin(request, { allowMissing: true })) {
        return NextResponse.json(
            { success: false, error: 'Origen no permitido' },
            { status: 403, headers: NO_STORE_HEADERS },
        )
    }

    // Fail closed before touching the DB or accepting any input: an
    // unconfigured secret can never mint a cookie, so there is nothing this
    // request could legitimately do.
    if (!isCheckinSessionConfigured()) {
        return NextResponse.json(
            { success: false, error: 'El portal de check-in no está disponible' },
            { status: 503, headers: NO_STORE_HEADERS },
        )
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json(
            { success: false, error: 'Base de datos no configurada' },
            { status: 503, headers: NO_STORE_HEADERS },
        )
    }

    let rawBody: unknown
    try {
        rawBody = await request.json()
    } catch {
        return NextResponse.json(
            { success: false, error: 'Solicitud inválida' },
            { status: 400, headers: NO_STORE_HEADERS },
        )
    }

    const parsed = parseBody(rawBody)
    if (!parsed) {
        return NextResponse.json(
            { success: false, error: 'Solicitud inválida' },
            { status: 400, headers: NO_STORE_HEADERS },
        )
    }
    const { slug, password, staffName } = parsed

    // Rate limit BEFORE any DB lookup or bcrypt compare (acceptance
    // criterion: "el rate-limiter corta antes de la siguiente verificación
    // bcrypt"). Every attempt counts toward both budgets, success or failure.
    const now = Date.now()
    const ipLimited = checkinIpLimiter.isLimited(requestIpOf(request), now)
    const slugLimited = checkinSlugLimiter.isLimited(slug, now)
    if (ipLimited || slugLimited) {
        return NextResponse.json(
            { success: false, error: 'Demasiados intentos fallidos. Intenta de nuevo más tarde.' },
            { status: 429, headers: NO_STORE_HEADERS },
        )
    }

    try {
        const { getEventBySlug } = await import('@/lib/queries')
        const event = await getEventBySlug(slug)

        const portalUnavailable = !event
            || !event.isActive
            || !event.checkinEnabled
            || !event.checkinPasswordHash
            || !event.checkinPasswordUpdatedAt

        if (portalUnavailable) {
            // Spend the same bcrypt cost as a real compare so a timing
            // side-channel cannot distinguish "no such event"/"inactive"/
            // "check-in disabled"/"no password set yet" from each other —
            // all four must be indistinguishable 404s (issue acceptance
            // criterion).
            await bcrypt.compare(password, DUMMY_HASH)
            return opaqueNotFound()
        }

        const passwordOk = await bcrypt.compare(password, event.checkinPasswordHash!)
        if (!passwordOk) {
            return NextResponse.json(
                { success: false, error: 'Credenciales inválidas' },
                { status: 401, headers: NO_STORE_HEADERS },
            )
        }

        const issued = issueCheckinCookie(slug, staffName, event.checkinPasswordUpdatedAt!)
        if (!issued) {
            // Only reachable if the secret was rotated to something invalid
            // or the slug fails the charset check between the guards above
            // and here — defensive fail-closed, never silently degrade.
            return NextResponse.json(
                { success: false, error: 'El portal de check-in no está disponible' },
                { status: 503, headers: NO_STORE_HEADERS },
            )
        }

        const cookieStore = await cookies()
        cookieStore.set(issued.name, issued.value, getCheckinCookieOptions(issued.maxAgeSeconds))

        return NextResponse.json(
            { success: true, staffName },
            { status: 200, headers: NO_STORE_HEADERS },
        )
    } catch {
        console.error('Error authenticating check-in staff')
        return NextResponse.json(
            { success: false, error: 'Error al iniciar sesión de check-in' },
            { status: 500, headers: NO_STORE_HEADERS },
        )
    }
}
