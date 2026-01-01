import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { getRSVPsByEvent } from '@/lib/queries'
import eventConfig from '@/event-config.json'

export const dynamic = 'force-dynamic'

// Endpoint para obtener estadísticas del evento
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
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId') || eventConfig.event.id

    // Check permissions
    if (currentUser.role !== 'super_admin') {
      const { hasAccess } = await userHasEventAccess(currentUser.id, eventId, 'viewer')
      if (!hasAccess) {
        return NextResponse.json({ success: false, error: 'No tienes permiso para ver las estadísticas de este evento' }, { status: 403 })
      }
    }

    const rsvps = await getRSVPsByEvent(eventId)

    const stats = {
      totalConfirmed: rsvps.length,
      confirmed: rsvps.filter(r => r.status === 'confirmed').length,
      cancelled: rsvps.filter(r => r.status === 'cancelled').length
    }

    return NextResponse.json({
      success: true,
      eventId,
      stats
    })
  } catch (error) {
    console.error('Error en GET /api/stats:', error)
    return NextResponse.json(
      { error: 'Error al obtener estadísticas' },
      { status: 500 }
    )
  }
}
