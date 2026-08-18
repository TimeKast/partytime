import { NextRequest, NextResponse } from 'next/server'
import { getRSVPById, validateCancelToken, CANCEL_TOKEN_SECRET_MISSING_MESSAGE, RSVP_STATUS } from '@/lib/queries'
import { buildRsvpGetDto } from './dto'

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

    // ISSUE-006: an expired pending row released its seat (and its
    // invitation link, if any, was already restored) — there is nothing left
    // to show the guest here, so treat it like a missing RSVP. cancelled and
    // pending_* rows keep loading normally: cancelled is required for the
    // existing reconfirm-via-link flow (see app/cancel/[rsvpId]/page.tsx and
    // the admin "re-invitación" emails), and a pending guest must be able to
    // view/cancel their own row.
    if (rsvp.status === RSVP_STATUS.EXPIRED) {
      return NextResponse.json(
        { error: 'RSVP no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      rsvp: buildRsvpGetDto(rsvp)
    })

  } catch (error: any) {
    console.error('Error en GET /api/rsvp/get:', error)

    // ISSUE-019: an unconfigured CANCEL_TOKEN_SECRET must fail closed with a
    // distinct status, not look like a generic 500 or a "token inválido" 403.
    if (error.message === CANCEL_TOKEN_SECRET_MISSING_MESSAGE) {
      return NextResponse.json(
        { error: 'Servicio no disponible' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: 'Error al obtener RSVP', details: error.message },
      { status: 500 }
    )
  }
}
