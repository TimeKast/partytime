import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { hashPassword, validateSession } from '@/lib/auth-utils'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { userHasEventAccess } from '@/lib/user-queries'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 64

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

/**
 * Same RBAC shape as app/api/admin/rsvp-invitations/route.ts's authorizeEvent:
 * super_admin always passes; anyone else needs at least 'manager' on this
 * event (ISSUE-015: "RBAC mínimo manager del evento").
 */
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
            return { response: NextResponse.json({ success: false, error: 'No tienes permiso para acceder al check-in de este evento' }, { status: 403, headers: NO_STORE_HEADERS }) }
        }
    }

    return { event }
}

function checkinStatusDto(event: EventRecord) {
    return {
        enabled: event.checkinEnabled,
        hasPassword: !!event.checkinPasswordHash,
        updatedAt: event.checkinPasswordUpdatedAt,
    }
}

/**
 * GET /api/admin/checkin-config?eventSlug=...
 * Read-only status — never returns the password hash itself.
 */
export async function GET(request: NextRequest) {
    const currentUser = await authenticate()
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401, headers: NO_STORE_HEADERS })
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Base de datos no configurada' }, { status: 503, headers: NO_STORE_HEADERS })
    }

    const eventSlug = request.nextUrl.searchParams.get('eventSlug')
    if (!validIdentifier(eventSlug)) {
        return NextResponse.json({ success: false, error: 'eventSlug es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        // Reading portal readiness and arrival visibility is available to any
        // assigned event user, including viewers. Mutations remain manager-only
        // in PATCH below.
        const authorization = await authorizeEvent(currentUser, eventSlug.trim(), 'viewer')
        if ('response' in authorization) return authorization.response

        return NextResponse.json(
            { success: true, checkin: checkinStatusDto(authorization.event) },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        console.error('Error reading check-in config')
        return NextResponse.json({ success: false, error: 'Error al obtener la configuración de check-in' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * PATCH /api/admin/checkin-config
 * Body: { eventSlug, action: 'enable' | 'disable' | 'setPassword', password? }
 * A dedicated route rather than folding into event-settings/update: that
 * contract has no notion of a write-only field, and the plaintext password
 * must never round-trip through a general "read the current settings, patch
 * them, send the whole object back" flow (ISSUE-015).
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

    if (!isRecord(body) || !hasOnlyKeys(body, ['eventSlug', 'action', 'password'])) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventSlug)) {
        return NextResponse.json({ success: false, error: 'eventSlug es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.action !== 'enable' && body.action !== 'disable' && body.action !== 'setPassword') {
        return NextResponse.json({ success: false, error: "action debe ser 'enable', 'disable' o 'setPassword'" }, { status: 400, headers: NO_STORE_HEADERS })
    }

    if (body.action === 'setPassword') {
        if (
            typeof body.password !== 'string'
            || body.password.length < MIN_PASSWORD_LENGTH
            || body.password.length > MAX_PASSWORD_LENGTH
        ) {
            return NextResponse.json(
                { success: false, error: `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres` },
                { status: 400, headers: NO_STORE_HEADERS },
            )
        }
    } else if (body.password !== undefined) {
        // enable/disable never take a password — reject rather than silently
        // ignore an unexpected field that could indicate a client bug.
        return NextResponse.json({ success: false, error: 'password solo aplica a la acción setPassword' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventSlug.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const { updateEvent } = await import('@/lib/queries')
        let updated: EventRecord

        if (body.action === 'enable') {
            updated = await updateEvent(event.id, { checkinEnabled: true })
        } else if (body.action === 'disable') {
            updated = await updateEvent(event.id, { checkinEnabled: false })
        } else {
            // setPassword — bcrypt cost 12, same as lib/auth-utils.ts's user
            // password hashing. The plaintext is read once here and never
            // persisted, returned, or logged; hash + updatedAt are written in
            // the same UPDATE so they can never observably disagree (a cookie
            // issued against a stale pwv would otherwise be possible).
            const passwordHash = await hashPassword(body.password as string)
            updated = await updateEvent(event.id, {
                checkinPasswordHash: passwordHash,
                checkinPasswordUpdatedAt: new Date(),
            })
        }

        console.info(JSON.stringify({
            event: 'checkin_config.updated',
            eventId: event.slug,
            action: body.action,
            actorId: currentUser.id,
        }))

        return NextResponse.json(
            { success: true, checkin: checkinStatusDto(updated) },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        // Never log the plaintext password, its hash, or a driver error with
        // bound parameters.
        console.error('Error updating check-in config')
        return NextResponse.json({ success: false, error: 'Error al actualizar la configuración de check-in' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}
