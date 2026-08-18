import { NextRequest, NextResponse } from 'next/server'
import { cancelRSVP, RSVP_ALREADY_CANCELLED_MESSAGE } from '@/lib/queries'

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

    // ISSUE-006: cancelling an already-cancelled RSVP is a terminal no-op —
    // 410 Gone instead of silently succeeding again.
    if (error.message === RSVP_ALREADY_CANCELLED_MESSAGE) {
      return NextResponse.json(
        { error: 'Este RSVP ya estaba cancelado' },
        { status: 410 }
      )
    }

    return NextResponse.json(
      { error: 'Error al cancelar RSVP', details: error.message },
      { status: 500 }
    )
  }
}
