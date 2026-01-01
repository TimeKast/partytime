import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { getRSVPById, updateRSVP } from '@/lib/queries'

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

  try {
    const body = await request.json()
    const { rsvpId, updates } = body

    if (!rsvpId) {
      return NextResponse.json(
        { error: 'rsvpId es requerido' },
        { status: 400 }
      )
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No hay cambios para actualizar' },
        { status: 400 }
      )
    }

    // Fetch RSVP to get its eventId for permission check
    const rsvp = await getRSVPById(rsvpId)
    if (!rsvp) {
      return NextResponse.json(
        { error: 'RSVP no encontrado' },
        { status: 404 }
      )
    }

    // Check permissions
    if (currentUser.role !== 'super_admin') {
      const { hasAccess } = await userHasEventAccess(currentUser.id, rsvp.eventId, 'manager')
      if (!hasAccess) {
        return NextResponse.json({ success: false, error: 'No tienes permiso para modificar este RSVP' }, { status: 403 })
      }
    }

    // Actualizar RSVP sin enviar email
    await updateRSVP(rsvpId, updates)

    return NextResponse.json({
      success: true,
      message: 'RSVP actualizado exitosamente'
    })

  } catch (error: any) {
    console.error('Error en POST /api/admin/update-rsvp:', error)
    return NextResponse.json(
      { error: 'Error al actualizar RSVP', details: error.message },
      { status: 500 }
    )
  }
}
