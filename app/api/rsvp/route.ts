import { NextRequest, NextResponse } from 'next/server'
import eventConfig from '@/event-config.json'
import { isDatabaseConfigured } from '@/lib/db'
import { validateAdminAuth, getUnauthorizedResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Mock storage para modo demo
const mockRsvps: any[] = []

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, phone, plusOne = false, eventSlug } = body

    // Validar campos requeridos
    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      )
    }

    // Determine eventId: use eventSlug if provided, otherwise fall back to static config
    let eventId = eventConfig.event.id

    // Check if database is configured
    if (isDatabaseConfigured()) {
      const { saveRSVP, getEventBySlug } = await import('@/lib/queries')

      // If eventSlug was provided, look up the event
      if (eventSlug) {
        const event = await getEventBySlug(eventSlug)
        if (event) {
          eventId = event.slug

          // Check if event accepts RSVPs
          if (!event.isActive) {
            return NextResponse.json(
              { error: 'Las inscripciones para este evento están cerradas' },
              { status: 400 }
            )
          }
        } else {
          return NextResponse.json(
            { error: 'Evento no encontrado' },
            { status: 404 }
          )
        }
      }

      const rsvp = await saveRSVP({
        name,
        email,
        phone,
        plusOne,
        eventId,
      })

      return NextResponse.json(
        {
          success: true,
          message: '¡RSVP confirmado exitosamente!',
          rsvp,
        },
        { status: 201 }
      )
    } else {
      // Modo demo - guardar en memoria
      console.log('⚠️  Modo DEMO - Configura DATABASE_URL para producción')

      const mockRsvp = {
        id: `demo-${Date.now()}`,
        name,
        email,
        phone,
        plusOne,
        eventId: eventSlug || eventConfig.event.id,
        createdAt: new Date().toISOString(),
        status: 'confirmed'
      }

      mockRsvps.push(mockRsvp)

      return NextResponse.json(
        {
          success: true,
          message: '¡RSVP confirmado!',
          rsvp: mockRsvp,
          note: 'Modo Demo: Configura DATABASE_URL en .env.local para guardar datos permanentemente'
        },
        { status: 201 }
      )
    }
  } catch (error: any) {
    console.error('Error en POST /api/rsvp:', error)

    // Manejar error de duplicado
    if (error.message?.includes('Ya existe un RSVP')) {
      return NextResponse.json(
        { error: 'Ya confirmaste tu asistencia anteriormente' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Error al procesar el RSVP. Por favor intenta de nuevo.' },
      { status: 500 }
    )
  }
}

// Endpoint para obtener todos los RSVPs (REQUIERE AUTENTICACIÓN ADMIN)
export async function GET(request: NextRequest) {
  // H-004: Proteger endpoint que expone datos personales
  if (!validateAdminAuth(request)) {
    return getUnauthorizedResponse()
  }

  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId') || eventConfig.event.id

    if (isDatabaseConfigured()) {
      const { getRSVPsByEvent } = await import('@/lib/queries')
      const rsvps = await getRSVPsByEvent(eventId)

      return NextResponse.json({
        success: true,
        count: rsvps.length,
        rsvps,
        eventId,
      })
    } else {
      // Modo demo - filter by eventId
      const filtered = mockRsvps.filter(r => r.eventId === eventId)
      return NextResponse.json({
        success: true,
        count: filtered.length,
        rsvps: filtered,
        eventId,
        note: 'Modo Demo: Datos en memoria temporal'
      })
    }
  } catch (error) {
    console.error('Error en GET /api/rsvp:', error)
    return NextResponse.json(
      { error: 'Error al obtener RSVPs' },
      { status: 500 }
    )
  }
}
