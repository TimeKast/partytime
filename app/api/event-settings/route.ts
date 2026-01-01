import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import eventConfig from '@/event-config.json'

export const dynamic = 'force-dynamic'

/**
 * GET /api/event-settings?eventId=X
 * Obtiene la configuración de un evento específico
 * Now reads directly from the 'events' table (consolidated)
 * Requiere autenticación y verifica permisos para usuarios no super_admin
 */
export async function GET(request: NextRequest) {
  try {
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

    // Get eventId from query params, or use default
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId') || eventConfig.event.id

    const { getEventBySlug } = await import('@/lib/queries')
    const event = await getEventBySlug(eventId)

    if (event) {
      // Check permissions for non-super-admin users
      if (currentUser.role !== 'super_admin') {
        const { hasAccess } = await userHasEventAccess(currentUser.id, event.id, 'viewer')
        if (!hasAccess) {
          return NextResponse.json({ 
            success: false, 
            error: 'No tienes permiso para ver la configuración de este evento' 
          }, { status: 403 })
        }
      }

      // Extract theme from jsonb or use defaults
      const theme = (event.theme as any) || {}

      return NextResponse.json({
        success: true,
        settings: {
          eventId: event.slug,
          title: event.title,
          subtitle: event.subtitle || '',
          date: event.date || '',
          time: event.time || '',
          location: event.location || '',
          details: event.details || '',
          price: {
            enabled: event.priceEnabled || false,
            amount: event.priceAmount || 0,
            currency: event.priceCurrency || 'MXN'
          },
          capacity: {
            enabled: event.capacityEnabled || false,
            limit: event.capacityLimit || 0
          },
          backgroundImage: {
            url: event.backgroundImageUrl || '/background.png'
          },
          theme: {
            primaryColor: theme.primaryColor || '#FF1493',
            secondaryColor: theme.secondaryColor || '#00FFFF',
            accentColor: theme.accentColor || '#FFD700'
          }
        },
        source: 'database'
      })
    }

    // Return default/empty config for new events or fallback to static config
    return NextResponse.json({
      success: true,
      settings: {
        eventId: eventId,
        title: eventConfig.event.title,
        subtitle: eventConfig.event.subtitle,
        date: eventConfig.event.date,
        time: eventConfig.event.time,
        location: eventConfig.event.location,
        details: eventConfig.event.details,
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
          url: eventConfig.event.backgroundImage || '/background.png'
        },
        theme: {
          primaryColor: eventConfig.theme?.primaryColor || '#FF1493',
          secondaryColor: eventConfig.theme?.secondaryColor || '#00FFFF',
          accentColor: eventConfig.theme?.accentColor || '#FFD700'
        }
      },
      source: 'config'
    })

  } catch (error) {
    console.error('Error al obtener configuración del evento:', error)
    return NextResponse.json({
      success: false,
      message: 'Error al obtener configuración'
    }, { status: 500 })
  }
}
