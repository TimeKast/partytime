import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { verifyPassword, createSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth-utils'
import { getUserByEmail } from '@/lib/user-queries'
import { timingSafeEqualStr } from '@/lib/timing-safe'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Best-effort in-memory rate limiter (FS-08). In a serverless deployment each
// instance keeps its own map, so this throttles bursts against a warm instance
// rather than being a globally authoritative limit. A durable store (KV/DB) is
// tracked as a follow-up; combined with the anti-enumeration below it raises the
// cost of online brute force meaningfully.
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCK_MS = 15 * 60 * 1000
type Attempt = { count: number; firstAt: number; lockedUntil: number }
const attempts = new Map<string, Attempt>()

function rateKey(ip: string, email: string): string {
    return `${ip}|${email.toLowerCase()}`
}
function isLocked(key: string, now: number): boolean {
    const a = attempts.get(key)
    return !!a && a.lockedUntil > now
}
function recordFailure(key: string, now: number): void {
    const a = attempts.get(key) ?? { count: 0, firstAt: now, lockedUntil: 0 }
    if (now - a.firstAt > WINDOW_MS) { a.count = 0; a.firstAt = now }
    a.count++
    if (a.count >= MAX_ATTEMPTS) a.lockedUntil = now + LOCK_MS
    attempts.set(key, a)
    // Opportunistic cleanup so the map cannot grow unbounded.
    if (attempts.size > 5000) {
        for (const [k, v] of attempts) {
            if (v.lockedUntil < now && now - v.firstAt > WINDOW_MS) attempts.delete(k)
        }
    }
}

// A valid bcrypt hash used to spend ~the same time on the "user does not exist"
// path as on the "user exists" path, so timing does not reveal which emails are
// registered (FS-16).
const DUMMY_HASH = bcrypt.hashSync('unused-account-placeholder', 12)

/**
 * POST /api/auth/login
 * Authenticates a user and creates a session.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, password, rememberMe = false } = body

        if (!email || !password) {
            return NextResponse.json(
                { success: false, error: 'Email y contraseña son requeridos' },
                { status: 400 }
            )
        }

        const forwarded = request.headers.get('x-forwarded-for')
        const ipAddress = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
        const key = rateKey(ipAddress, email)
        const now = Date.now()

        if (isLocked(key, now)) {
            return NextResponse.json(
                { success: false, error: 'Demasiados intentos fallidos. Intenta de nuevo más tarde.' },
                { status: 429 }
            )
        }

        const superAdminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME
        const superAdminPassword = process.env.ADMIN_PASSWORD

        const dbUser = await getUserByEmail(email)

        let authedUser: typeof dbUser | null = null
        let isSuperAdmin = false

        if (dbUser) {
            const passwordOk = await verifyPassword(password, dbUser.passwordHash)
            // A disabled account is treated exactly like a bad password: no
            // distinct status/message that would reveal the account exists.
            if (passwordOk && dbUser.isActive) {
                authedUser = dbUser
            }
        } else {
            // Always spend the bcrypt cost to equalize timing vs. the branch above.
            await bcrypt.compare(password, DUMMY_HASH)
            if (
                superAdminEmail && superAdminPassword &&
                timingSafeEqualStr(email, superAdminEmail) &&
                timingSafeEqualStr(password, superAdminPassword)
            ) {
                isSuperAdmin = true
            }
        }

        if (!authedUser && !isSuperAdmin) {
            recordFailure(key, now)
            // Single generic message for every failure mode (FS-16).
            return NextResponse.json(
                { success: false, error: 'Credenciales inválidas' },
                { status: 401 }
            )
        }

        // Success — reset the failure counter for this key.
        attempts.delete(key)

        const userAgent = request.headers.get('user-agent') || undefined
        const ip = ipAddress === 'unknown' ? undefined : ipAddress

        if (isSuperAdmin) {
            const { token, expiresAt } = await createSession('super_admin_env', rememberMe, userAgent, ip)
            const cookieStore = await cookies()
            cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt))
            return NextResponse.json({
                success: true,
                user: { id: 'super_admin_env', email: superAdminEmail, name: 'Super Admin', role: 'super_admin' },
            })
        }

        const { token, expiresAt } = await createSession(authedUser!.id, rememberMe, userAgent, ip)
        const cookieStore = await cookies()
        cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt))

        return NextResponse.json({
            success: true,
            user: {
                id: authedUser!.id,
                email: authedUser!.email,
                name: authedUser!.name,
                role: authedUser!.role,
            },
        })

    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json(
            { success: false, error: 'Error al iniciar sesión' },
            { status: 500 }
        )
    }
}
