import { NextRequest, NextResponse } from 'next/server'
import { updateRSVP, validateCancelToken, CANCEL_TOKEN_SECRET_MISSING_MESSAGE, getRSVPById, getEventBySlug, isSeatAddingChange, RSVP_STATUS } from '@/lib/queries'

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

    // ISSUE-006: an expired pending row has nothing left to update via this
    // guest-facing cancel-token link — the seat (and any invitation link) was
    // already released/restored by expireStalePendingRsvps. cancelled stays
    // editable (reconfirm flow below) and pending_* rows keep accepting plain
    // contact edits, unchanged from before.
    if (currentRSVP.status === RSVP_STATUS.EXPIRED) {
      return NextResponse.json(
        { error: 'RSVP no encontrado' },
        { status: 404 }
      )
    }

    // Preparar datos a actualizar
    const trimmedEmail = email.trim()
    const updateData: any = {
      name,
      email: trimmedEmail,
      phone,
      plusOne: plusOne || false,
      plusOneName: plusOne ? (plusOneName?.trim() || null) : null
    }

    // ISSUE-009 (EPIC-003): this route DOES allow the guest to change their
    // email via the cancel-token link. A changed email invalidates whatever
    // ownership proof `verified_at` represented — the person clicking the
    // verification link may not be the owner of the NEW address. MVP
    // decision (see docs/backlog/ISSUE-009-verification-reactivation-reset.md):
    // do NOT degrade an already-confirmed RSVP back to pending here, only
    // clear verified_at. Compared case-insensitively so re-saving the same
    // address with different casing does not spuriously reset it.
    if (trimmedEmail.toLowerCase() !== currentRSVP.email.trim().toLowerCase()) {
      updateData.verifiedAt = null
    }

    // Si se está reconfirmando, cambiar status a 'confirmed'
    if (reconfirm && currentRSVP.status === RSVP_STATUS.CANCELLED) {
      updateData.status = RSVP_STATUS.CONFIRMED
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

    // ISSUE-019: an unconfigured CANCEL_TOKEN_SECRET must fail closed with a
    // distinct status, not look like a generic 500 or a "token inválido" 403.
    if (error.message === CANCEL_TOKEN_SECRET_MISSING_MESSAGE) {
      return NextResponse.json(
        { error: 'Servicio no disponible' },
        { status: 503 }
      )
    }

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
