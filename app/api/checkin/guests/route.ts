import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isDatabaseConfigured } from '@/lib/db'
import { checkinCookieName, validateCheckinCookie } from '@/lib/checkin-session'
import {
    isCheckinVisibleRow,
    sortCheckinGuestsByName,
    toCheckinGuestDto,
} from '@/lib/checkin-guests'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
// Same charset as lib/checkin-session.ts's SLUG_PATTERN / events.slug.
const SLUG_PATTERN = /^[a-z0-9-]{1,100}$/

/**
 * Every rejection reason that must be indistinguishable from "this event has
 * no check-in portal" — same opaque body/status as app/api/checkin/auth's
 * portalUnavailable branch.
 */
function opaqueNotFound(): NextResponse {
    return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404, headers: NO_STORE_HEADERS })
}

function unauthorized(): NextResponse {
    return NextResponse.json(
        { success: false, error: 'Sesión de check-in inválida o expirada' },
        { status: 401, headers: NO_STORE_HEADERS },
    )
}

/**
 * GET /api/checkin/guests?slug=<event-slug>
 * Staff-facing guest list for the check-in portal (ISSUE-016). Requires a
 * valid checkin_session_<slug> cookie for THIS exact slug — a cookie issued
 * for a different event fails validateCheckinCookie's slug/pwv check and is
 * rejected the same way an absent/expired one is (401), never leaking
 * whether the other event even exists.
 */
export async function GET(request: NextRequest) {
    if (!isDatabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Base de datos no configurada' }, { status: 503, headers: NO_STORE_HEADERS })
    }

    const slug = request.nextUrl.searchParams.get('slug')
    if (!slug || !SLUG_PATTERN.test(slug)) {
        return NextResponse.json({ success: false, error: 'slug es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const { getEventBySlug } = await import('@/lib/queries')
        const event = await getEventBySlug(slug)

        // Load the event FIRST — validateCheckinCookie needs its current
        // checkin_password_updated_at (pwv) to know whether the cookie is
        // still valid (a password rotation invalidates every outstanding
        // session without any DB write of its own — lib/checkin-session.ts).
        if (!event || !event.isActive || !event.checkinEnabled || !event.checkinPasswordUpdatedAt) {
            return opaqueNotFound()
        }

        const cookieStore = await cookies()
        const cookieValue = cookieStore.get(checkinCookieName(slug))?.value
        const validation = validateCheckinCookie(cookieValue, slug, event.checkinPasswordUpdatedAt)
        if (!validation.ok) return unauthorized()

        const { getCheckinGuestsByEvent } = await import('@/lib/queries')
        const rows = await getCheckinGuestsByEvent(event.slug)
        const guests = sortCheckinGuestsByName(
            rows.filter(isCheckinVisibleRow).map(toCheckinGuestDto),
        )

        return NextResponse.json({ success: true, guests }, { headers: NO_STORE_HEADERS })
    } catch {
        console.error('Error listing check-in guests')
        return NextResponse.json({ success: false, error: 'Error al obtener la lista de invitados' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}
