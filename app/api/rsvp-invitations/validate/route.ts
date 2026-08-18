import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { buildPublicEventDto } from '@/lib/public-event'
import {
    hashRsvpInvitationToken,
    isValidRsvpInvitationToken,
} from '@/lib/rsvp-invitation'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const UNAVAILABLE = { success: false, error: 'Link de invitación inválido o vencido' }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate a bearer capability from a request body, never from a URL. Missing
 * Origin is allowed for non-browser clients because no ambient credential is
 * involved; an explicit cross-origin browser request still fails closed.
 */
export async function POST(request: NextRequest) {
    if (!assertSameOrigin(request, { allowMissing: true })) {
        return NextResponse.json(
            { success: false, error: 'Origen no permitido' },
            { status: 403, headers: NO_STORE_HEADERS },
        )
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json(
            { success: false, error: 'Base de datos no configurada' },
            { status: 503, headers: NO_STORE_HEADERS },
        )
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(UNAVAILABLE, { status: 404, headers: NO_STORE_HEADERS })
    }

    if (!isRecord(body) || Object.keys(body).length !== 1 || !isValidRsvpInvitationToken(body.token)) {
        return NextResponse.json(UNAVAILABLE, { status: 404, headers: NO_STORE_HEADERS })
    }

    try {
        const { getRsvpInvitationEvent } = await import('@/lib/queries')
        const event = await getRsvpInvitationEvent(hashRsvpInvitationToken(body.token))
        if (!event) {
            return NextResponse.json(UNAVAILABLE, { status: 404, headers: NO_STORE_HEADERS })
        }

        return NextResponse.json(
            { success: true, event: buildPublicEventDto(event) },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        // Do not log the raw token, digest or a driver error with bound values.
        console.error('Error validating RSVP invitation link')
        return NextResponse.json(
            { success: false, error: 'Error al validar el link de invitación' },
            { status: 500, headers: NO_STORE_HEADERS },
        )
    }
}
