import { NextRequest, NextResponse } from 'next/server'
import eventConfig from '@/event-config.json'

export const dynamic = 'force-dynamic'

// Endpoint para obtener estadísticas del evento
export async function GET(request: NextRequest) {
  try {
    const hasFirestoreConfig = process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_PRIVATE_KEY && process.env.GOOGLE_CLOUD_CLIENT_EMAIL

    if (hasFirestoreConfig) {
      const { getEventStats } = await import('@/lib/firestore')
      const stats = await getEventStats(eventConfig.event.id)

      return NextResponse.json({
        success: true,
        eventId: eventConfig.event.id,
        stats,
      })
    } else {
      // Modo demo
      return NextResponse.json({
        success: true,
        eventId: eventConfig.event.id,
        stats: {
          totalConfirmed: 0,
          confirmed: 0,
          cancelled: 0
        },
        note: 'Modo Demo: Configura Google Cloud Firestore para estadísticas reales'
      })
    }
  } catch (error) {
    console.error('Error en GET /api/stats:', error)
    return NextResponse.json(
      { error: 'Error al obtener estadísticas' },
      { status: 500 }
    )
  }
}
