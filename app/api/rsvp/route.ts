import { NextRequest, NextResponse } from 'next/server'
import eventConfig from '@/event-config.json'

// Mock storage para modo demo
const mockRsvps: any[] = []

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, phone } = body

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

    // Verificar si Cosmos DB está configurado
    const hasCosmosConfig = process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY

    if (hasCosmosConfig) {
      // Usar Cosmos DB real
      const { saveRSVP } = await import('@/lib/cosmosdb')
      
      const rsvp = await saveRSVP({
        name,
        email,
        phone,
        eventId: eventConfig.event.id,
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
      console.log('⚠️  Modo DEMO - Configura Azure Cosmos DB para producción')
      
      const mockRsvp = {
        id: `demo-${Date.now()}`,
        name,
        email,
        phone,
        eventId: eventConfig.event.id,
        createdAt: new Date().toISOString(),
        status: 'confirmed'
      }
      
      mockRsvps.push(mockRsvp)

      return NextResponse.json(
        {
          success: true,
          message: '¡RSVP confirmado!',
          rsvp: mockRsvp,
          note: 'Modo Demo: Configura Azure Cosmos DB en .env.local para guardar datos permanentemente'
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

// Endpoint para obtener todos los RSVPs
export async function GET(request: NextRequest) {
  try {
    const hasCosmosConfig = process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY

    if (hasCosmosConfig) {
      const { getRSVPsByEvent } = await import('@/lib/cosmosdb')
      const rsvps = await getRSVPsByEvent(eventConfig.event.id)

      return NextResponse.json({
        success: true,
        count: rsvps.length,
        rsvps,
      })
    } else {
      // Modo demo
      return NextResponse.json({
        success: true,
        count: mockRsvps.length,
        rsvps: mockRsvps,
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
