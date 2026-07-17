import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession, hashPassword, SESSION_COOKIE_NAME } from '@/lib/auth-utils'
import { getUserById, adminResetPassword } from '@/lib/user-queries'
import { generateTemporaryPassword } from '@/lib/password-utils'
import { assertSameOrigin } from '@/lib/origin-check'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/users/[id]/reset-password
 * Admin one-time temporary-password reset (A2/A9, super_admin only). Forces
 * a password change on next login and revokes ALL of the target user's
 * sessions. The synthetic env-based super admin has no DB row, so it 404s
 * here just like any other unknown id (SI8).
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        if (!assertSameOrigin(request)) {
            return NextResponse.json({ success: false, error: 'Origen no permitido' }, { status: 403 })
        }

        const { id } = await params
        const cookieStore = await cookies()
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
        }

        const currentUser = await validateSession(token)
        if (!currentUser || currentUser.role !== 'super_admin') {
            return NextResponse.json({ success: false, error: 'Acceso denegado' }, { status: 403 })
        }

        const targetUser = await getUserById(id)
        if (!targetUser || !targetUser.isActive) {
            return NextResponse.json({ success: false, error: 'Usuario no encontrado' }, { status: 404 })
        }

        const temporaryPassword = generateTemporaryPassword({ email: targetUser.email, name: targetUser.name })
        const newHash = await hashPassword(temporaryPassword)
        const updated = await adminResetPassword(id, targetUser.passwordHash, newHash)
        if (!updated) {
            // A concurrent reset/password change won the compare-and-swap.
            // Never reveal this request's now-unusable temporary password.
            return NextResponse.json(
                { success: false, error: 'La contraseña cambió durante la solicitud. Intenta de nuevo.' },
                { status: 409 },
            )
        }

        // One-time reveal (SI5): this is the only place the temp password is
        // ever returned. Never logged, never persisted in plaintext.
        return NextResponse.json({
            success: true,
            temporaryPassword,
            message: 'Contraseña temporal generada. Compártela de forma segura — no se volverá a mostrar.',
        })
    } catch {
        console.error('Admin reset password request failed')
        return NextResponse.json({ success: false, error: 'Error al restablecer la contraseña' }, { status: 500 })
    }
}
