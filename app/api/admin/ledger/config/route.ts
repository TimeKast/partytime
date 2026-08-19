import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { userHasEventAccess } from '@/lib/user-queries'
import {
    computeStripeRegisteredIncomeCents,
    getLedgerSnapshot,
    getLedgerStripeMode,
    setLedgerStripeMode,
} from '@/lib/ledger-queries'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

type SessionUser = NonNullable<Awaited<ReturnType<typeof validateSession>>>
type EventRecord = NonNullable<Awaited<ReturnType<typeof import('@/lib/queries').getEventBySlug>>>

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    const allowed = new Set(keys)
    return Object.keys(value).every(key => allowed.has(key))
}

function validIdentifier(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 200
}

async function authenticate(): Promise<SessionUser | null> {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('rp_session')?.value
    return sessionToken ? validateSession(sessionToken) : null
}

/** Same RBAC shape as the other ledger routes (ISSUE-023/018). */
async function authorizeEvent(
    user: SessionUser,
    eventSlugOrId: string,
    requiredRole: 'manager' | 'viewer',
): Promise<{ event: EventRecord } | { response: NextResponse }> {
    const { getEventBySlug } = await import('@/lib/queries')
    const event = await getEventBySlug(eventSlugOrId)
    if (!event) {
        return { response: NextResponse.json({ success: false, error: 'Evento no encontrado' }, { status: 404, headers: NO_STORE_HEADERS }) }
    }

    if (user.role !== 'super_admin') {
        const { hasAccess } = await userHasEventAccess(user.id, event.id, requiredRole)
        if (!hasAccess) {
            return { response: NextResponse.json({ success: false, error: 'No tienes permiso para acceder al ledger de este evento' }, { status: 403, headers: NO_STORE_HEADERS }) }
        }
    }

    return { event }
}

/**
 * `stripeIncomeRegisteredCents` feeds the UI's "cambiaste de modo con
 * ingresos ya registrados al nodo Stripe" warning (PLAN §2.6c / gotcha #9)
 * — computed fresh from the live snapshot, never cached/materialized.
 */
async function configDto(eventSlug: string): Promise<{ stripeIsParticipant: boolean; stripeIncomeRegisteredCents: number }> {
    const [stripeIsParticipant, snapshot] = await Promise.all([
        getLedgerStripeMode(eventSlug),
        getLedgerSnapshot(eventSlug),
    ])
    return {
        stripeIsParticipant,
        stripeIncomeRegisteredCents: computeStripeRegisteredIncomeCents(snapshot),
    }
}

/**
 * GET /api/admin/ledger/config?eventId=...
 * Viewer-readable.
 */
export async function GET(request: NextRequest) {
    const currentUser = await authenticate()
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401, headers: NO_STORE_HEADERS })
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Base de datos no configurada' }, { status: 503, headers: NO_STORE_HEADERS })
    }

    const eventId = request.nextUrl.searchParams.get('eventId')
    if (!validIdentifier(eventId)) {
        return NextResponse.json({ success: false, error: 'eventId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, eventId.trim(), 'viewer')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        return NextResponse.json(
            { success: true, ...(await configDto(event.slug)) },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        console.error('Error reading ledger config')
        return NextResponse.json({ success: false, error: 'Error al obtener la configuración del ledger' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * PATCH /api/admin/ledger/config
 * Body: { eventId, stripeIsParticipant } — manager-only. Flips
 * `events.ledger_stripe_is_participant` (PLAN §2.6b); never blocks on
 * unregistered Stripe income (that confirmation is the UI's job, PLAN §5
 * gotcha #9). Responds the same shape as GET.
 */
export async function PATCH(request: NextRequest) {
    if (!assertSameOrigin(request)) {
        return NextResponse.json({ success: false, error: 'Origen no permitido' }, { status: 403, headers: NO_STORE_HEADERS })
    }

    const currentUser = await authenticate()
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401, headers: NO_STORE_HEADERS })
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Base de datos no configurada' }, { status: 503, headers: NO_STORE_HEADERS })
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    if (!isRecord(body) || !hasOnlyKeys(body, ['eventId', 'stripeIsParticipant'])) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId)) {
        return NextResponse.json({ success: false, error: 'eventId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (typeof body.stripeIsParticipant !== 'boolean') {
        return NextResponse.json({ success: false, error: 'stripeIsParticipant debe ser booleano' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        await setLedgerStripeMode(event.slug, body.stripeIsParticipant)

        console.info(JSON.stringify({
            event: 'ledger_config.updated',
            eventId: event.slug,
            stripeIsParticipant: body.stripeIsParticipant,
            actorId: currentUser.id,
        }))

        return NextResponse.json(
            { success: true, ...(await configDto(event.slug)) },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        console.error('Error updating ledger config')
        return NextResponse.json({ success: false, error: 'Error al actualizar la configuración del ledger' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}
