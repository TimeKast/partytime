import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { userHasEventAccess } from '@/lib/user-queries'
import {
    generateRsvpInvitationToken,
    getRsvpInvitationStatus,
    hashRsvpInvitationToken,
    parseRsvpInvitationExpiry,
} from '@/lib/rsvp-invitation'

export const dynamic = 'force-dynamic'

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

async function authorizeEvent(
    user: SessionUser,
    eventSlugOrId: string,
): Promise<{ event: EventRecord } | { response: NextResponse }> {
    const { getEventBySlug } = await import('@/lib/queries')
    const event = await getEventBySlug(eventSlugOrId)
    if (!event) {
        return { response: NextResponse.json({ success: false, error: 'Evento no encontrado' }, { status: 404 }) }
    }

    if (user.role !== 'super_admin') {
        const { hasAccess } = await userHasEventAccess(user.id, event.id, 'manager')
        if (!hasAccess) {
            return { response: NextResponse.json({ success: false, error: 'No tienes permiso para gestionar links de este evento' }, { status: 403 }) }
        }
    }

    return { event }
}

function linkDto(link: {
    id: string
    eventId: string
    expiresAt: Date
    usedAt: Date | null
    usedRsvpId: string | null
    revokedAt: Date | null
    revokedBy: string | null
    createdBy: string
    createdAt: Date
}) {
    return {
        ...link,
        status: getRsvpInvitationStatus(link),
    }
}

function invitationUrl(request: NextRequest, rawToken: string): string {
    let base = request.nextUrl.origin
    if (process.env.NEXT_PUBLIC_APP_URL) {
        try {
            base = new URL(process.env.NEXT_PUBLIC_APP_URL).origin
        } catch {
            // A malformed optional base URL must not prevent issuance; the
            // request's already-parsed same-origin URL is the safe fallback.
        }
    }
    const url = new URL('/invite', base)
    // Fragments never reach the HTTP request line, CDN/origin logs or Referer.
    // The client extracts the capability once and immediately scrubs the URL.
    url.hash = `token=${encodeURIComponent(rawToken)}`
    return url.toString()
}

export async function GET(request: NextRequest) {
    const currentUser = await authenticate()
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Base de datos no configurada' }, { status: 503 })
    }

    const eventSlug = request.nextUrl.searchParams.get('eventSlug')
    if (!validIdentifier(eventSlug)) {
        return NextResponse.json({ success: false, error: 'eventSlug es requerido' }, { status: 400 })
    }

    try {
        const authorization = await authorizeEvent(currentUser, eventSlug.trim())
        if ('response' in authorization) return authorization.response

        const { listRsvpInvitationLinks } = await import('@/lib/queries')
        const links = await listRsvpInvitationLinks(authorization.event.slug)
        return NextResponse.json({ success: true, links: links.map(linkDto) })
    } catch {
        console.error('Error listing RSVP invitation links')
        return NextResponse.json({ success: false, error: 'Error al obtener links de invitación' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    if (!assertSameOrigin(request)) {
        return NextResponse.json({ success: false, error: 'Origen no permitido' }, { status: 403 })
    }

    const currentUser = await authenticate()
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Base de datos no configurada' }, { status: 503 })
    }

    try {
        const body: unknown = await request.json()
        if (!isRecord(body) || !hasOnlyKeys(body, ['eventSlug', 'expiresAt'])) {
            return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400 })
        }
        if (!validIdentifier(body.eventSlug)) {
            return NextResponse.json({ success: false, error: 'eventSlug es requerido' }, { status: 400 })
        }
        const expiresAt = parseRsvpInvitationExpiry(body.expiresAt)
        if (!expiresAt) {
            return NextResponse.json({ success: false, error: 'La vigencia debe ser futura y no mayor a 365 días' }, { status: 400 })
        }

        const authorization = await authorizeEvent(currentUser, body.eventSlug.trim())
        if ('response' in authorization) return authorization.response

        const rawToken = generateRsvpInvitationToken()
        const { createRsvpInvitationLink } = await import('@/lib/queries')
        const link = await createRsvpInvitationLink({
            eventId: authorization.event.slug,
            tokenHash: hashRsvpInvitationToken(rawToken),
            expiresAt,
            createdBy: currentUser.id,
        })
        console.info(JSON.stringify({
            event: 'rsvp_invitation.created',
            linkId: link.id,
            eventId: authorization.event.slug,
            actorId: currentUser.id,
        }))

        return NextResponse.json({
            success: true,
            link: linkDto(link),
            url: invitationUrl(request, rawToken),
        }, { status: 201 })
    } catch {
        // Driver errors may include bound parameters. Do not log the digest of
        // the bearer token (or any raw request metadata).
        console.error('Error creating RSVP invitation link')
        return NextResponse.json({ success: false, error: 'Error al crear el link de invitación' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    if (!assertSameOrigin(request)) {
        return NextResponse.json({ success: false, error: 'Origen no permitido' }, { status: 403 })
    }

    const currentUser = await authenticate()
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Base de datos no configurada' }, { status: 503 })
    }

    try {
        const body: unknown = await request.json()
        if (!isRecord(body) || !hasOnlyKeys(body, ['eventSlug', 'id'])) {
            return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400 })
        }
        if (!validIdentifier(body.eventSlug) || !validIdentifier(body.id)) {
            return NextResponse.json({ success: false, error: 'eventSlug e id son requeridos' }, { status: 400 })
        }

        const authorization = await authorizeEvent(currentUser, body.eventSlug.trim())
        if ('response' in authorization) return authorization.response

        const { revokeRsvpInvitationLink } = await import('@/lib/queries')
        const linkId = body.id.trim()
        const revoked = await revokeRsvpInvitationLink(
            linkId,
            authorization.event.slug,
            currentUser.id,
        )
        if (!revoked) {
            return NextResponse.json({ success: false, error: 'El link no existe o ya no está activo' }, { status: 409 })
        }

        console.info(JSON.stringify({
            event: 'rsvp_invitation.revoked',
            linkId,
            eventId: authorization.event.slug,
            actorId: currentUser.id,
        }))

        return NextResponse.json({ success: true })
    } catch {
        console.error('Error revoking RSVP invitation link')
        return NextResponse.json({ success: false, error: 'Error al revocar el link de invitación' }, { status: 500 })
    }
}
