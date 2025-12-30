import { NextRequest, NextResponse } from 'next/server'
import { cancelRSVP } from '@/lib/queries'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { rsvpId, token } = body

    if (!rsvpId || !token) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: rsvpId, token' },
        { status: 400 }
      )
    }

    // Cancelar RSVP (valida el token internamente)
    const cancelledRSVP = await cancelRSVP(rsvpId, token)

    return NextResponse.json({
      success: true,
      message: 'RSVP cancelado exitosamente',
      rsvp: cancelledRSVP
    })

  } catch (error: any) {
    console.error('Error en POST /api/rsvp/cancel:', error)

    if (error.message === 'Token inválido') {
      return NextResponse.json(
        { error: 'Token inválido o expirado' },
        { status: 403 }
      )
    }

    if (error.message === 'RSVP no encontrado') {
      return NextResponse.json(
        { error: 'RSVP no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Error al cancelar RSVP', details: error.message },
      { status: 500 }
    )
  }
}
