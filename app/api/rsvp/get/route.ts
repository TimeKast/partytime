import { NextRequest, NextResponse } from 'next/server'
import { getRSVPById, validateCancelToken } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rsvpId = searchParams.get('rsvpId')
    const token = searchParams.get('token')

    if (!rsvpId || !token) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: rsvpId, token' },
        { status: 400 }
      )
    }

    // Obtener RSVP
    const rsvp = await getRSVPById(rsvpId)

    if (!rsvp) {
      return NextResponse.json(
        { error: 'RSVP no encontrado' },
        { status: 404 }
      )
    }

    // Validar token
    const isValidToken = validateCancelToken(token, rsvpId, rsvp.email)

    if (!isValidToken) {
      return NextResponse.json(
        { error: 'Token inválido o expirado' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      rsvp: {
        id: rsvp.id,
        name: rsvp.name,
        email: rsvp.email,
        phone: rsvp.phone,
        plusOne: rsvp.plusOne,
        status: rsvp.status,
        eventId: rsvp.eventId
      }
    })

  } catch (error: any) {
    console.error('Error en GET /api/rsvp/get:', error)
    return NextResponse.json(
      { error: 'Error al obtener RSVP', details: error.message },
      { status: 500 }
    )
  }
}
