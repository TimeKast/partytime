import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { userHasEventAccess } from '@/lib/user-queries'
import {
    LedgerParticipantNameConflictError,
    LedgerStripeParticipantImmutableError,
    createParticipant,
    ensureStripeParticipant,
    listParticipants,
    updateParticipant,
} from '@/lib/ledger-queries'
import type { EventParticipant } from '@/lib/schema'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const NAME_MIN_LENGTH = 2
const NAME_MAX_LENGTH = 120
const EMAIL_MAX_LENGTH = 255

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

function validName(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length >= NAME_MIN_LENGTH && value.trim().length <= NAME_MAX_LENGTH
}

function validOptionalEmail(value: unknown): value is string | null | undefined {
    if (value === undefined || value === null) return true
    return typeof value === 'string' && value.trim().length <= EMAIL_MAX_LENGTH
}

async function authenticate(): Promise<SessionUser | null> {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('rp_session')?.value
    return sessionToken ? validateSession(sessionToken) : null
}

/**
 * Same RBAC shape as app/api/admin/checkin-config/route.ts's authorizeEvent
 * (ISSUE-018): super_admin always passes; anyone else needs at least
 * `requiredRole` on this event (PLAN-EPIC-006.md §2.7: viewer reads,
 * manager/super_admin mutates).
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
            return { response: NextResponse.json({ success: false, error: 'No tienes permiso para acceder al ledger de este evento' }, { status: 403, headers: NO_STORE_HEADERS }) }
        }
    }

    return { event }
}

/** Explicit allowlist — never a spread of the Drizzle row (no eventId/createdBy leak). */
function participantDto(participant: EventParticipant) {
    return {
        id: participant.id,
        kind: participant.kind,
        name: participant.name,
        email: participant.email,
        userId: participant.userId,
        isActive: participant.isActive,
        createdAt: participant.createdAt,
    }
}

/**
 * GET /api/admin/ledger/participants?eventId=...
 * Viewer-readable. Lazily provisions the event's Stripe participant node
 * before listing (PLAN §2.6a) — a system row, safe to create on a viewer's
 * read so the dropdown always includes it.
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

        await ensureStripeParticipant(event.slug, currentUser.id)
        const participants = await listParticipants(event.slug)

        return NextResponse.json(
            { success: true, participants: participants.map(participantDto) },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        console.error('Error listing ledger participants')
        return NextResponse.json({ success: false, error: 'Error al obtener los participantes' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * POST /api/admin/ledger/participants
 * Body: { eventId, name, email?, userId? } — manager-only. Always creates
 * `kind='person'`; "Stripe" is a reserved name (409), same as any other
 * duplicate (case-insensitive) within the event.
 */
export async function POST(request: NextRequest) {
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

    if (!isRecord(body) || !hasOnlyKeys(body, ['eventId', 'name', 'email', 'userId'])) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId)) {
        return NextResponse.json({ success: false, error: 'eventId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validName(body.name)) {
        return NextResponse.json({ success: false, error: `El nombre debe tener entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validOptionalEmail(body.email)) {
        return NextResponse.json({ success: false, error: 'email inválido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.userId !== undefined && body.userId !== null && typeof body.userId !== 'string') {
        return NextResponse.json({ success: false, error: 'userId inválido' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const created = await createParticipant({
            eventId: event.slug,
            name: body.name,
            email: body.email ?? null,
            userId: (body.userId as string | null | undefined) ?? null,
            createdBy: currentUser.id,
        })

        console.info(JSON.stringify({
            event: 'ledger_participant.created',
            eventId: event.slug,
            participantId: created.id,
            actorId: currentUser.id,
        }))

        return NextResponse.json(
            { success: true, participant: participantDto(created) },
            { status: 201, headers: NO_STORE_HEADERS },
        )
    } catch (err) {
        if (err instanceof LedgerParticipantNameConflictError) {
            return NextResponse.json({ success: false, error: err.message }, { status: 409, headers: NO_STORE_HEADERS })
        }
        const { unwrapDbError } = await import('@/lib/queries')
        if (unwrapDbError(err).code === '23503') {
            return NextResponse.json({ success: false, error: 'userId inválido' }, { status: 400, headers: NO_STORE_HEADERS })
        }
        console.error('Error creating ledger participant')
        return NextResponse.json({ success: false, error: 'Error al crear el participante' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * PATCH /api/admin/ledger/participants
 * Body: { eventId, participantId, name?, email?, isActive? } — manager-only.
 * 422 if the target is `kind='stripe'` (never renamed/deactivated).
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

    if (!isRecord(body) || !hasOnlyKeys(body, ['eventId', 'participantId', 'name', 'email', 'isActive'])) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId) || !validIdentifier(body.participantId)) {
        return NextResponse.json({ success: false, error: 'eventId y participantId son requeridos' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.name === undefined && body.email === undefined && body.isActive === undefined) {
        return NextResponse.json({ success: false, error: 'Nada que actualizar' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.name !== undefined && !validName(body.name)) {
        return NextResponse.json({ success: false, error: `El nombre debe tener entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.email !== undefined && !validOptionalEmail(body.email)) {
        return NextResponse.json({ success: false, error: 'email inválido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
        return NextResponse.json({ success: false, error: 'isActive debe ser booleano' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const updated = await updateParticipant(event.slug, body.participantId.trim(), {
            name: body.name as string | undefined,
            email: body.email as string | null | undefined,
            isActive: body.isActive as boolean | undefined,
        })

        if (!updated) {
            return NextResponse.json({ success: false, error: 'Participante no encontrado' }, { status: 404, headers: NO_STORE_HEADERS })
        }

        console.info(JSON.stringify({
            event: 'ledger_participant.updated',
            eventId: event.slug,
            participantId: updated.id,
            actorId: currentUser.id,
        }))

        return NextResponse.json(
            { success: true, participant: participantDto(updated) },
            { headers: NO_STORE_HEADERS },
        )
    } catch (err) {
        if (err instanceof LedgerStripeParticipantImmutableError) {
            return NextResponse.json({ success: false, error: err.message }, { status: 422, headers: NO_STORE_HEADERS })
        }
        if (err instanceof LedgerParticipantNameConflictError) {
            return NextResponse.json({ success: false, error: err.message }, { status: 409, headers: NO_STORE_HEADERS })
        }
        console.error('Error updating ledger participant')
        return NextResponse.json({ success: false, error: 'Error al actualizar el participante' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}
