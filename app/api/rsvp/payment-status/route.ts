import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

// ISSUE-011: Stripe's own Checkout Session id format (`cs_...`) — validated
// BEFORE any DB lookup so a malformed/garbage id never reaches a query.
const SESSION_ID_PATTERN = /^cs_[a-zA-Z0-9_]+$/

/**
 * GET /api/rsvp/payment-status?session_id=cs_...
 *
 * The ONLY thing `app/[slug]/pago/page.tsx` is allowed to poll: a bare
 * `{ status }`, read straight off `rsvp_payments` by its unique
 * `stripe_session_id` — no rsvp id, name, email, or amount ever leaves this
 * route (PLAN §3.3 / ISSUE-011 Gherkin "no filtra nada más que el estado").
 * Never mutates anything; the webhook (ISSUE-012) is the only writer.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')

    if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
        return NextResponse.json(
            { error: 'session_id inválido' },
            { status: 400, headers: NO_STORE_HEADERS },
        )
    }

    if (!isDatabaseConfigured()) {
        return NextResponse.json(
            { error: 'Base de datos no configurada' },
            { status: 503, headers: NO_STORE_HEADERS },
        )
    }

    try {
        const { getRsvpPaymentStatusBySessionId } = await import('@/lib/queries')
        const status = await getRsvpPaymentStatusBySessionId(sessionId)

        if (!status) {
            return NextResponse.json(
                { error: 'No encontrado' },
                { status: 404, headers: NO_STORE_HEADERS },
            )
        }

        return NextResponse.json({ status }, { headers: NO_STORE_HEADERS })
    } catch {
        // Never log the session id alongside a driver error with bound values.
        console.error('Error fetching RSVP payment status')
        return NextResponse.json(
            { error: 'Error al consultar el estado del pago' },
            { status: 500, headers: NO_STORE_HEADERS },
        )
    }
}
