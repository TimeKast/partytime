import { NextRequest, NextResponse } from 'next/server'
import { updateRSVP, validateCancelToken, getRSVPById, getEventBySlug, isSeatAddingChange } from '@/lib/queries'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { rsvpId, token, name, email, phone, plusOne, plusOneName, reconfirm } = body

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

    // Preparar datos a actualizar
    const updateData: any = {
      name,
      email,
      phone,
      plusOne: plusOne || false,
      plusOneName: plusOne ? (plusOneName?.trim() || null) : null
    }

    // Si se está reconfirmando, cambiar status a 'confirmed'
    if (reconfirm && currentRSVP.status === 'cancelled') {
      updateData.status = 'confirmed'
    }

    // A2-H04: este endpoint era ciego al evento — con un link válido se podía
    // re-confirmar o añadir un +1 en un evento cerrado o desactivado. Los
    // cambios que AÑADEN asientos respetan el estado de cierre; las ediciones
    // seat-neutral y las que liberan asientos nunca se bloquean.
    if (isSeatAddingChange(currentRSVP, updateData)) {
      const event = await getEventBySlug(currentRSVP.eventId)
      if (!event || !event.isActive || event.rsvpClosed) {
        return NextResponse.json(
          { error: event?.rsvpClosedMessage || 'Las inscripciones para este evento están cerradas' },
          { status: 400 }
        )
      }
    }

    // Actualizar RSVP
    const updatedRSVP = await updateRSVP(rsvpId, updateData)

    return NextResponse.json({
      success: true,
      message: reconfirm ? 'Asistencia reconfirmada exitosamente' : 'RSVP actualizado exitosamente',
      rsvp: updatedRSVP
    })

  } catch (error: any) {
    console.error('Error en POST /api/rsvp/update:', error)

    // A2-H02: reconfirmar o añadir +1 en un evento lleno lo rechaza el
    // trigger de capacidad — 409 con mensaje claro, no un 500 genérico.
    if (error.message?.includes('capacidad máxima')) {
      return NextResponse.json(
        { error: 'El evento está lleno — no hay lugares disponibles para este cambio' },
        { status: 409 }
      )
    }

    if (error.message?.includes('Ya existe un RSVP')) {
      return NextResponse.json(
        { error: 'Ya existe un RSVP con este email para este evento' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Error al actualizar RSVP', details: error.message },
      { status: 500 }
    )
  }
}
