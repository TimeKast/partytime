import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/validate
 * Validates admin credentials (session-based)
 */
export async function GET(request: NextRequest) {
    const cookieStore = await cookies()
    const token = cookieStore.get('rp_session')?.value

    if (!token) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }

    const currentUser = await validateSession(token)
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
    }

    return NextResponse.json({
        success: true,
        message: 'Autenticación válida'
    })
}
