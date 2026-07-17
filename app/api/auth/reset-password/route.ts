import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/auth-utils'
import { consumeResetToken, getResetTokenUserContext } from '@/lib/password-reset-queries'
import { hashResetToken } from '@/lib/password-utils'
import { validatePasswordPolicy } from '@/lib/password-policy'
import { assertSameOrigin } from '@/lib/origin-check'

export const dynamic = 'force-dynamic'

const GENERIC_INVALID_TOKEN_ERROR = 'El enlace es inválido o expiró.'

/**
 * POST /api/auth/reset-password
 * Completes the forgot-password flow (A2/SI2/SI3). Atomically claims the
 * single-use token, updates the password, clears the forced-change flag and
 * revokes ALL of the user's sessions. No auto-login — the user must sign in
 * with the new password. Public unauth route: rejects an explicit
 * cross-site Origin but tolerates a missing one (SI7).
 */
export async function POST(request: NextRequest) {
    try {
        if (!assertSameOrigin(request, { allowMissing: true })) {
            return NextResponse.json({ success: false, error: GENERIC_INVALID_TOKEN_ERROR }, { status: 400 })
        }

        const body = await request.json()
        const { token, newPassword, confirmPassword } = body

        if (!token || !newPassword || !confirmPassword) {
            return NextResponse.json({ success: false, error: 'Todos los campos son requeridos' }, { status: 400 })
        }

        if (newPassword !== confirmPassword) {
            return NextResponse.json({ success: false, error: 'Las contraseñas no coinciden' }, { status: 400 })
        }

        const tokenHash = hashResetToken(token)
        const context = await getResetTokenUserContext(tokenHash)
        if (!context) {
            return NextResponse.json({ success: false, error: GENERIC_INVALID_TOKEN_ERROR }, { status: 400 })
        }

        const policy = validatePasswordPolicy(newPassword, { email: context.email, name: context.name })
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

        const newHash = await hashPassword(newPassword)
        const result = await consumeResetToken(tokenHash, newHash)
        if (!result) {
            // Covers unknown/expired/already-consumed tokens with one generic
            // message (no distinguishing which — avoids leaking token state).
            return NextResponse.json({ success: false, error: GENERIC_INVALID_TOKEN_ERROR }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            message: '✅ Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.',
        })
    } catch {
        console.error('Reset password request failed')
        return NextResponse.json({ success: false, error: 'Error al restablecer la contraseña' }, { status: 500 })
    }
}
