import { NextRequest, NextResponse } from 'next/server'
import { updateRSVP, validateCancelToken, getRSVPById } from '@/lib/firestore'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { rsvpId, token, name, email, phone, plusOne } = body

    if (!rsvpId || !token || !name || !email || !phone) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      )
    }

    // Obtener RSVP actual
    const currentRSVP = await getRSVPById(rsvpId)

    if (!currentRSVP) {
      return NextResponse.json(
        { error: 'RSVP no encontrado' },
        { status: 404 }
      )
    }

    // Validar token con el email ACTUAL (no el nuevo)
    const isValidToken = validateCancelToken(token, rsvpId, currentRSVP.email)
    
    if (!isValidToken) {
      return NextResponse.json(
        { error: 'Token inválido o expirado' },
        { status: 403 }
      )
    }

    // Actualizar RSVP
    const updatedRSVP = await updateRSVP(rsvpId, {
      name,
      email,
      phone,
      plusOne: plusOne || false
    })

    return NextResponse.json({
      success: true,
      message: 'RSVP actualizado exitosamente',
      rsvp: updatedRSVP
    })

  } catch (error: any) {
    console.error('Error en POST /api/rsvp/update:', error)
    return NextResponse.json(
      { error: 'Error al actualizar RSVP', details: error.message },
      { status: 500 }
    )
  }
}
