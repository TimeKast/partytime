import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { saveRSVP } from '@/lib/queries'
import eventConfig from '@/event-config.json'

const demoRSVPs = [
  {
    name: 'José Assem',
    email: 'joseassem@gmail.com',
    phone: '+52 1 55 1234 5678',
    plusOne: true,
    eventId: eventConfig.event.id
  },
  {
    name: 'María González',
    email: 'maria.gonzalez@example.com',
    phone: '+52 1 55 2345 6789',
    plusOne: false,
    eventId: eventConfig.event.id
  },
  {
    name: 'Carlos Ramírez',
    email: 'carlos.ramirez@example.com',
    phone: '+52 1 55 3456 7890',
    plusOne: true,
    eventId: eventConfig.event.id
  },
  {
    name: 'Ana López',
    email: 'ana.lopez@example.com',
    phone: '+52 1 55 4567 8901',
    plusOne: false,
    eventId: eventConfig.event.id
  },
  {
    name: 'Luis Martínez',
    email: 'luis.martinez@example.com',
    phone: '+52 1 55 5678 9012',
    plusOne: true,
    eventId: eventConfig.event.id
  },
  {
    name: 'Laura Fernández',
    email: 'laura.fernandez@example.com',
    phone: '+52 1 55 6789 0123',
    plusOne: false,
    eventId: eventConfig.event.id
  },
  {
    name: 'Pedro Sánchez',
    email: 'pedro.sanchez@example.com',
    phone: '+52 1 55 7890 1234',
    plusOne: true,
    eventId: eventConfig.event.id
  }
]

export async function POST() {
  // Check auth
  const cookieStore = await cookies()
  const token = cookieStore.get('rp_session')?.value

  if (!token) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const currentUser = await validateSession(token)
  if (!currentUser || currentUser.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Acceso denegado' }, { status: 403 })
  }
  try {
    const results = []

    for (const rsvp of demoRSVPs) {
      const result = await saveRSVP(rsvp)
      results.push({
        name: rsvp.name,
        id: result.id,
        success: true
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Datos demo agregados exitosamente',
      count: results.length,
      rsvps: results
    })
  } catch (error) {
    console.error('Error agregando datos demo:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error agregando datos demo',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
