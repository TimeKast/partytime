import { NextRequest, NextResponse } from 'next/server'
import { getAppSetting, saveAppSetting } from '@/lib/queries'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'


/**
 * GET /api/admin/settings
 * Permite obtener configuraciones globales de la app
 */
export async function GET(request: NextRequest) {
    // Check auth
    const cookieStore = await cookies()
    const token = cookieStore.get('rp_session')?.value

    if (!token) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }

    const currentUser = await validateSession(token)
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
    }

    try {
        const homeEventId = await getAppSetting('home_event_id')

        return NextResponse.json({
            success: true,
            settings: {
                home_event_id: homeEventId
            }
        })
    } catch (error: any) {
        return NextResponse.json(
            { error: 'Error al obtener configuraciones', details: error.message },
            { status: 500 }
        )
    }
}

/**
 * POST /api/admin/settings
 * Permite guardar configuraciones globales de la app
 */
export async function POST(request: NextRequest) {
    // Check auth
    const cookieStore = await cookies()
    const token = cookieStore.get('rp_session')?.value

    if (!token) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }

    const currentUser = await validateSession(token)
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
    }

    // Only super_admin can change global settings
    if (currentUser.role !== 'super_admin') {
        return NextResponse.json({ success: false, error: 'Acceso denegado. Se requiere ser Super Admin.' }, { status: 403 })
    }

    try {
        const body = await request.json()
        const { id, value } = body

        if (!id || value === undefined) {
            return NextResponse.json(
                { error: 'Faltan campos requeridos: id, value' },
                { status: 400 }
            )
        }

        await saveAppSetting(id, value)

        // Limpiar caché de la home
        if (id === 'home_event_id') {
            revalidatePath('/')
        }

        return NextResponse.json({

            success: true,
            message: 'Configuración guardada correctamente'
        })
    } catch (error: any) {
        return NextResponse.json(
            { error: 'Error al guardar configuración', details: error.message },
            { status: 500 }
        )
    }
}
