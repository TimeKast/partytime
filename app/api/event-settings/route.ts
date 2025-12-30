import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import eventConfig from '@/event-config.json'

export const dynamic = 'force-dynamic'

/**
 * GET /api/event-settings?eventId=X
 * Obtiene la configuración de un evento específico desde la base de datos
 */
export async function GET(request: NextRequest) {
  try {
    // Get eventId from query params, or use default
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId') || eventConfig.event.id

    const dbUrl = process.env.DATABASE_URL

    if (dbUrl) {
      try {
        const sql = neon(dbUrl)

        // Query directa sin ORM
        const rows = await sql`SELECT * FROM event_settings WHERE event_id = ${eventId}`

        if (rows.length > 0) {
          const row = rows[0]

          return NextResponse.json({
            success: true,
            settings: {
              eventId: row.event_id,
              title: row.title,
              subtitle: row.subtitle || '',
              date: row.date || '',
              time: row.time || '',
              location: row.location || '',
              details: row.details || '',
              price: {
                enabled: row.price_enabled || false,
                amount: row.price_amount || 0,
                currency: row.price_currency || 'MXN'
              },
              capacity: {
                enabled: row.capacity_enabled || false,
                limit: row.capacity_limit || 0
              },
              backgroundImage: {
                url: row.background_image_url || '/background.png'
              },
              theme: {
                primaryColor: row.primary_color || '#FF1493',
                secondaryColor: row.secondary_color || '#00FFFF',
                accentColor: row.accent_color || '#FFD700'
              }
            },
            source: 'database'
          })
        }
      } catch (dbError) {
        console.error('Error al consultar base de datos:', dbError)
      }
    }

    // Return default/empty config for new events
    return NextResponse.json({
      success: true,
      settings: {
        eventId: eventId,
        title: '',
        subtitle: '',
        date: '',
        time: '',
        location: '',
        details: '',
        price: {
          enabled: false,
          amount: 0,
          currency: 'MXN'
        },
        capacity: {
          enabled: false,
          limit: 0
        },
        backgroundImage: {
          url: '/background.png'
        },
        theme: {
          primaryColor: '#FF1493',
          secondaryColor: '#00FFFF',
          accentColor: '#FFD700'
        }
      },
      source: 'new'
    })

  } catch (error) {
    console.error('Error al obtener configuración del evento:', error)
    return NextResponse.json({
      success: false,
      message: 'Error al obtener configuración'
    }, { status: 500 })
  }
}
