import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import {
  getRSVPById,
  updateRSVP,
  getEventBySlug,
  hasRsvpPaymentLockingPartySize,
  RSVP_PAYMENT_PARTY_SIZE_LOCKED_MESSAGE,
} from '@/lib/queries'

export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json()
    const { rsvpId, updates } = body

    if (!rsvpId) {
      return NextResponse.json(
        { error: 'rsvpId es requerido' },
        { status: 400 }
      )
    }

    if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No hay cambios para actualizar' },
        { status: 400 }
      )
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'plusOne') && typeof updates.plusOne !== 'boolean') {
      return NextResponse.json(
        { error: 'El campo de acompañante debe ser verdadero o falso' },
        { status: 400 }
      )
    }

    // Fetch RSVP to get its eventId for permission check
    const rsvp = await getRSVPById(rsvpId)
    if (!rsvp) {
      return NextResponse.json(
        { error: 'RSVP no encontrado' },
        { status: 404 }
      )
    }

    // Resolve slug to UUID for permission check
    const event = await getEventBySlug(rsvp.eventId)
    const eventUUID = event?.id || rsvp.eventId

    // Check permissions using UUID
    if (currentUser.role !== 'super_admin') {
      const { hasAccess } = await userHasEventAccess(currentUser.id, eventUUID, 'manager')
      if (!hasAccess) {
        return NextResponse.json({ success: false, error: 'No tienes permiso para modificar este RSVP' }, { status: 403 })
      }
    }

    // FS-27: allowlist the mutable fields server-side. `updates` is runtime
    // `any`, and updateRSVP's `Pick<...>` type is erased at runtime, so without
    // this filter a caller could set eventId/emailHistory/cancelToken/etc.
    const ALLOWED_FIELDS = ['name', 'email', 'phone', 'plusOne', 'plusOneName', 'status'] as const
    const sanitizedUpdates: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        sanitizedUpdates[key] = updates[key]
      }
    }
    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos válidos para actualizar' },
        { status: 400 }
      )
    }

    const plusOneChanged = Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'plusOne')
      && sanitizedUpdates.plusOne !== (rsvp.plusOne === true)

    // An unchanged plusOne is only a stale snapshot, not an intended write.
    // Omit it so this request cannot revert a concurrent party-size change
    // that subsequently became locked by a created/paid Checkout.
    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'plusOne') && !plusOneChanged) {
      delete sanitizedUpdates.plusOne
    }

    if (plusOneChanged && await hasRsvpPaymentLockingPartySize(rsvpId)) {
      return NextResponse.json(
        { error: RSVP_PAYMENT_PARTY_SIZE_LOCKED_MESSAGE },
        { status: 409 }
      )
    }

    // Actualizar RSVP sin enviar email
    if (Object.keys(sanitizedUpdates).length > 0) {
      await updateRSVP(rsvpId, sanitizedUpdates, {
        rejectPaymentLockedPlusOneChange: plusOneChanged,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'RSVP actualizado exitosamente'
    })

  } catch (error: any) {
    console.error('Error en POST /api/admin/update-rsvp:', error)

    if (error.message === RSVP_PAYMENT_PARTY_SIZE_LOCKED_MESSAGE) {
      return NextResponse.json(
        { error: RSVP_PAYMENT_PARTY_SIZE_LOCKED_MESSAGE },
        { status: 409 }
      )
    }

    // A2-H02: el trigger de capacidad también aplica a ediciones de admin
    // (reconfirmar / añadir +1 en evento lleno) — 409, no 500.
    if (error.message?.includes('capacidad máxima')) {
      return NextResponse.json(
        { error: 'El evento está lleno — este cambio excede el límite de invitados' },
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
