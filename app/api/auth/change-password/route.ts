import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    validateSession,
    hashPassword,
    verifyPassword,
    SESSION_COOKIE_NAME,
    getSessionCookieOptions,
} from '@/lib/auth-utils'
import { changePasswordKeepingSession } from '@/lib/user-queries'
import { validatePasswordPolicy } from '@/lib/password-policy'
import { assertSameOrigin } from '@/lib/origin-check'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/change-password
 * Self-service password change (A1). Keeps the current session, revokes all
 * other sessions for this user. The synthetic env-based super admin has no
 * DB row/password and cannot use this flow (SI8).
 */
export async function POST(request: NextRequest) {
    try {
        // Cookie-authenticated mutation: fail closed on bad/missing Origin (SI7).
        if (!assertSameOrigin(request)) {
            return NextResponse.json({ success: false, error: 'Origen no permitido' }, { status: 403 })
        }

        const cookieStore = await cookies()
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
        }

        const user = await validateSession(token)
        if (!user) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
        }

        if (user.id === 'super_admin_env') {
            return NextResponse.json(
                { success: false, error: 'Esta cuenta se administra por configuración del entorno.' },
                { status: 403 },
            )
        }

        const body = await request.json()
        const { currentPassword, newPassword, confirmPassword } = body

        if (!currentPassword || !newPassword || !confirmPassword) {
            return NextResponse.json({ success: false, error: 'Todos los campos son requeridos' }, { status: 400 })
        }

        if (newPassword !== confirmPassword) {
            return NextResponse.json({ success: false, error: 'Las contraseñas nuevas no coinciden' }, { status: 400 })
        }

        const policy = validatePasswordPolicy(newPassword, { email: user.email, name: user.name })
        if (!policy.ok) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'La contraseña no cumple los requisitos de seguridad',
                    policyErrors: policy.errors,
                },
                { status: 400 },
            )
        }

        const currentOk = await verifyPassword(currentPassword, user.passwordHash)
        if (!currentOk) {
            return NextResponse.json({ success: false, error: 'La contraseña actual es incorrecta' }, { status: 400 })
        }

        if (newPassword === currentPassword) {
            return NextResponse.json(
                { success: false, error: 'La nueva contraseña debe ser diferente a la actual' },
                { status: 400 },
            )
        }

        const newHash = await hashPassword(newPassword)
        const updated = await changePasswordKeepingSession(user.id, user.passwordHash, newHash, token)
        if (!updated) {
            return NextResponse.json(
                { success: false, error: 'La sesión o contraseña cambió. Vuelve a iniciar sesión.' },
                { status: 400 },
            )
        }

        cookieStore.set(
            SESSION_COOKIE_NAME,
            updated.token,
            getSessionCookieOptions(updated.expiresAt),
        )

        return NextResponse.json({
            success: true,
            message: '✅ Contraseña actualizada. Se cerraron tus otras sesiones activas.',
        })
    } catch {
        console.error('Change password request failed')
        return NextResponse.json({ success: false, error: 'Error al cambiar la contraseña' }, { status: 500 })
    }
}
