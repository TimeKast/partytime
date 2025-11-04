import { NextRequest, NextResponse } from 'next/server'
import { getEventStats } from '@/lib/cosmosdb'
import eventConfig from '@/event-config.json'

// Endpoint para obtener estadísticas del evento
export async function GET(request: NextRequest) {
  try {
    const stats = await getEventStats(eventConfig.event.id)

    return NextResponse.json({
      success: true,
      eventId: eventConfig.event.id,
      stats,
    })
  } catch (error) {
    console.error('Error en GET /api/stats:', error)
    return NextResponse.json(
      { error: 'Error al obtener estadísticas' },
      { status: 500 }
    )
  }
}
