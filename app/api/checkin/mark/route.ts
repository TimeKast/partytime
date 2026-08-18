import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { checkinCookieName, validateCheckinCookie } from '@/lib/checkin-session'
import { isCheckinVisibleRow, toCheckinGuestDto } from '@/lib/checkin-guests'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const SLUG_PATTERN = /^[a-z0-9-]{1,100}$/
const MAX_NOTE_LENGTH = 500
const MAX_RSVP_ID_LENGTH = 200

function opaqueNotFound(): NextResponse {
    return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404, headers: NO_STORE_HEADERS })
}

function unauthorized(): NextResponse {
    return NextResponse.json(
        { success: false, error: 'Sesión de check-in inválida o expirada' },
        { status: 401, headers: NO_STORE_HEADERS },
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    const allowed = new Set(keys)
    return Object.keys(value).every(key => allowed.has(key))
}

interface ParsedMarkBody {
    slug: string
    rsvpId: string
    target: 'guest' | 'plusOne'
    checkedIn: boolean
    /** undefined = leave checkin_note untouched, null = clear it, string = set it (already trimmed). */
    note: string | null | undefined
}

function parseBody(body: unknown): ParsedMarkBody | null {
    if (!isRecord(body) || !hasOnlyKeys(body, ['slug', 'rsvpId', 'target', 'checkedIn', 'note'])) return null
    if (typeof body.slug !== 'string' || !SLUG_PATTERN.test(body.slug)) return null
    if (typeof body.rsvpId !== 'string') return null
    const rsvpId = body.rsvpId.trim()
    if (rsvpId.length === 0 || rsvpId.length > MAX_RSVP_ID_LENGTH) return null
    if (body.target !== 'guest' && body.target !== 'plusOne') return null
    if (typeof body.checkedIn !== 'boolean') return null

    let note: string | null | undefined
    if (body.note === undefined) {
        note = undefined
    } else if (typeof body.note === 'string') {
        const trimmed = body.note.trim()
        if (trimmed.length > MAX_NOTE_LENGTH) return null
        // Empty string clears the note (-> NULL); anything else is stored trimmed.
        note = trimmed.length === 0 ? null : trimmed
    } else {
        return null
    }

    return { slug: body.slug, rsvpId, target: body.target, checkedIn: body.checkedIn, note }
}

/**
 * POST /api/checkin/mark
 * Body: { slug, rsvpId, target: 'guest'|'plusOne', checkedIn, note? }
 * Toggles one guest's (or their plus-one's) check-in mark (ISSUE-016).
 * Cookie-authenticated mutation — same-origin is required (unlike the public
 * /api/checkin/auth login, there IS an ambient credential here for a
 * cross-site request to ride on).
 */
export async function POST(request: NextRequest) {
    if (!assertSameOrigin(request)) {
        return NextResponse.json({ success: false, error: 'Origen no permitido' }, { status: 403, headers: NO_STORE_HEADERS })
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Base de datos no configurada' }, { status: 503, headers: NO_STORE_HEADERS })
    }

    let rawBody: unknown
    try {
        rawBody = await request.json()
    } catch {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    const parsed = parseBody(rawBody)
    if (!parsed) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const { getEventBySlug } = await import('@/lib/queries')
        const event = await getEventBySlug(parsed.slug)
        if (!event || !event.isActive || !event.checkinEnabled || !event.checkinPasswordUpdatedAt) {
            return opaqueNotFound()
        }

        const cookieStore = await cookies()
        const cookieValue = cookieStore.get(checkinCookieName(parsed.slug))?.value
        const validation = validateCheckinCookie(cookieValue, parsed.slug, event.checkinPasswordUpdatedAt)
        if (!validation.ok) return unauthorized()

        const { markCheckinGuest } = await import('@/lib/queries')
        const result = await markCheckinGuest({
            rsvpId: parsed.rsvpId,
            eventSlug: event.slug,
            target: parsed.target,
            checkedIn: parsed.checkedIn,
            staffName: validation.payload.staffName,
            note: parsed.note,
        })

        switch (result.outcome) {
            case 'not_found':
                return NextResponse.json({ success: false, error: 'RSVP no encontrado' }, { status: 404, headers: NO_STORE_HEADERS })
            // ISSUE-016 acceptance criterion: a valid cookie for THIS slug
            // reaching an rsvpId that belongs to a DIFFERENT event is 403,
            // with no data about that other event leaked in the body.
            case 'forbidden':
                return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 403, headers: NO_STORE_HEADERS })
            case 'not_confirmed':
                return NextResponse.json({ success: false, error: 'Este invitado aún no confirmado no se puede marcar como llegado' }, { status: 409, headers: NO_STORE_HEADERS })
            case 'plus_one_not_allowed':
                return NextResponse.json({ success: false, error: 'Este invitado no tiene acompañante registrado' }, { status: 400, headers: NO_STORE_HEADERS })
            case 'marked': {
                if (!isCheckinVisibleRow(result.rsvp)) {
                    // Unreachable: markCheckinGuest only reaches 'marked' after
                    // confirming status === 'confirmed', which is always
                    // check-in-visible. Kept as a defensive, fail-closed guard
                    // rather than an unchecked cast onto the response DTO.
                    console.error('markCheckinGuest returned a non-visible-status row')
                    return NextResponse.json({ success: false, error: 'Error al actualizar el check-in' }, { status: 500, headers: NO_STORE_HEADERS })
                }
                return NextResponse.json({ success: true, guest: toCheckinGuestDto(result.rsvp) }, { headers: NO_STORE_HEADERS })
            }
        }
    } catch {
        console.error('Error marking check-in')
        return NextResponse.json({ success: false, error: 'Error al actualizar el check-in' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}
