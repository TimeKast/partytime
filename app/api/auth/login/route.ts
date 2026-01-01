import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyPassword, createSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth-utils'
import { getUserByEmail } from '@/lib/user-queries'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/login
 * Authenticates a user and creates a session
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, password, rememberMe = false } = body

        // Validate input
        if (!email || !password) {
            return NextResponse.json(
                { success: false, error: 'Email y contraseña son requeridos' },
                { status: 400 }
            )
        }

        // Check for super admin (environment variables) as fallback
        const superAdminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME
        const superAdminPassword = process.env.ADMIN_PASSWORD

        let user = null
        let isSuperAdmin = false

        // First, try database user
        const dbUser = await getUserByEmail(email)

        if (dbUser) {
            // Verify password
            const isValidPassword = await verifyPassword(password, dbUser.passwordHash)
            if (!isValidPassword) {
                return NextResponse.json(
                    { success: false, error: 'Credenciales inválidas' },
                    { status: 401 }
                )
            }

            // Check if user is active
            if (!dbUser.isActive) {
                return NextResponse.json(
                    { success: false, error: 'Cuenta desactivada' },
                    { status: 403 }
                )
            }

            user = dbUser
        } else if (superAdminEmail && superAdminPassword &&
            email === superAdminEmail && password === superAdminPassword) {
            // Fallback to environment variable super admin
            isSuperAdmin = true
        } else {
            return NextResponse.json(
                { success: false, error: 'Credenciales inválidas' },
                { status: 401 }
            )
        }

        // Create session
        const userAgent = request.headers.get('user-agent') || undefined
        const forwarded = request.headers.get('x-forwarded-for')
        const ipAddress = forwarded ? forwarded.split(',')[0].trim() : undefined

        if (isSuperAdmin) {
            // For super admin via env vars, create a special token
            const { token, expiresAt } = await createSession(
                'super_admin_env',
                rememberMe,
                userAgent,
                ipAddress
            )

            // Set cookie
            const cookieStore = await cookies()
            cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt))

            return NextResponse.json({
                success: true,
                user: {
                    id: 'super_admin_env',
                    email: superAdminEmail,
                    name: 'Super Admin',
                    role: 'super_admin',
                },
            })
        }

        // Database user session
        const { token, expiresAt } = await createSession(
            user!.id,
            rememberMe,
            userAgent,
            ipAddress
        )

        // Set cookie
        const cookieStore = await cookies()
        cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt))

        return NextResponse.json({
            success: true,
            user: {
                id: user!.id,
                email: user!.email,
                name: user!.name,
                role: user!.role,
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
