import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { userHasEventAccess } from '@/lib/user-queries'
import {
    LedgerCurrencyMismatchError,
    LedgerParticipantNotFoundError,
    LedgerSettlementNotFoundError,
    LedgerSettlementSameParticipantError,
    createSettlement,
    listSettlements,
    softDeleteSettlement,
    updateSettlement,
    type LedgerSettlementRecord,
} from '@/lib/ledger-queries'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const NOTE_MAX_LENGTH = 500
// PLAN-EPIC-006.md §5 gotcha #7: a sanity cap (~$1M) to catch capture typos —
// the DB CHECK only enforces amount_cents > 0. Same cap as transactions
// (app/api/admin/ledger/transactions/route.ts).
const AMOUNT_CENTS_CAP = 99_999_999
// PLAN §2.8: whitelist, one currency per ledger.
const LEDGER_CURRENCIES = ['MXN', 'USD'] as const

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

function validAmountCents(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= AMOUNT_CENTS_CAP
}

function validCurrency(value: unknown): value is typeof LEDGER_CURRENCIES[number] {
    return typeof value === 'string' && (LEDGER_CURRENCIES as readonly string[]).includes(value)
}

function isValidIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) return false
    return date.toISOString().slice(0, 10) === value
}

function validOptionalNote(value: unknown): value is string | null | undefined {
    if (value === undefined || value === null) return true
    return typeof value === 'string' && value.length <= NOTE_MAX_LENGTH
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

/** Explicit allowlist — never a spread of the Drizzle row (no eventId/deletedAt/deletedBy/updatedAt leak). Matches the exact key list in ISSUE-024.md. */
function settlementDto(settlement: LedgerSettlementRecord) {
    return {
        id: settlement.id,
        fromParticipantId: settlement.fromParticipantId,
        toParticipantId: settlement.toParticipantId,
        amountCents: settlement.amountCents,
        currency: settlement.currency,
        settledOn: settlement.settledOn,
        note: settlement.note,
        createdBy: settlement.createdBy,
        createdAt: settlement.createdAt,
    }
}

function mapLedgerWriteError(err: unknown): NextResponse | null {
    if (err instanceof LedgerSettlementSameParticipantError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (err instanceof LedgerParticipantNotFoundError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (err instanceof LedgerCurrencyMismatchError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (err instanceof LedgerSettlementNotFoundError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 404, headers: NO_STORE_HEADERS })
    }
    return null
}

/**
 * GET /api/admin/ledger/settlements?eventId=...
 * Viewer-readable. Active settlements, `settled_on` desc.
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

        const settlements = await listSettlements(event.slug)
        return NextResponse.json(
            { success: true, settlements: settlements.map(settlementDto) },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        console.error('Error listing ledger settlements')
        return NextResponse.json({ success: false, error: 'Error al obtener los settlements' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * POST /api/admin/ledger/settlements
 * Body: { eventId, fromParticipantId, toParticipantId, amountCents,
 *         currency, settledOn, note? }. Manager-only. Not validated against
 *         any suggested transfer — participants can settle partial or
 *         arbitrary amounts (PLAN §2.2). The Stripe node is a valid
 *         from/to with no special branch (PLAN §2.6a): a settlement whose
 *         `from` is Stripe is a withdrawal, whose `to` is Stripe is a
 *         contribution to the fund.
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

    const allowedKeys = ['eventId', 'fromParticipantId', 'toParticipantId', 'amountCents', 'currency', 'settledOn', 'note']
    if (!isRecord(body) || !hasOnlyKeys(body, allowedKeys)) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId)) {
        return NextResponse.json({ success: false, error: 'eventId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (typeof body.fromParticipantId !== 'string' || body.fromParticipantId.trim().length === 0) {
        return NextResponse.json({ success: false, error: 'fromParticipantId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (typeof body.toParticipantId !== 'string' || body.toParticipantId.trim().length === 0) {
        return NextResponse.json({ success: false, error: 'toParticipantId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    // Cheap fail-fast before any DB round-trip; createSettlement re-checks
    // this itself as defense in depth (the DB CHECK is a last resort, not
    // the primary signal — PLAN gotcha and lib/ledger-queries.ts comment).
    if (body.fromParticipantId === body.toParticipantId) {
        return NextResponse.json({ success: false, error: 'fromParticipantId y toParticipantId no pueden ser el mismo participante' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validAmountCents(body.amountCents)) {
        return NextResponse.json({ success: false, error: `amountCents debe ser un entero positivo hasta ${AMOUNT_CENTS_CAP}` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validCurrency(body.currency)) {
        return NextResponse.json({ success: false, error: `currency debe ser una de: ${LEDGER_CURRENCIES.join(', ')}` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!isValidIsoDate(body.settledOn)) {
        return NextResponse.json({ success: false, error: 'settledOn debe ser una fecha ISO válida (YYYY-MM-DD)' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validOptionalNote(body.note)) {
        return NextResponse.json({ success: false, error: `note debe tener a lo más ${NOTE_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const created = await createSettlement({
            eventId: event.slug,
            fromParticipantId: body.fromParticipantId,
            toParticipantId: body.toParticipantId,
            amountCents: body.amountCents,
            currency: body.currency,
            settledOn: body.settledOn,
            note: body.note ?? null,
            createdBy: currentUser.id,
        })

        console.info(JSON.stringify({
            event: 'ledger_settlement.created',
            eventId: event.slug,
            settlementId: created.id,
            actorId: currentUser.id,
        }))

        return NextResponse.json(
            { success: true, settlement: settlementDto(created) },
            { status: 201, headers: NO_STORE_HEADERS },
        )
    } catch (err) {
        const mapped = mapLedgerWriteError(err)
        if (mapped) return mapped
        console.error('Error creating ledger settlement')
        return NextResponse.json({ success: false, error: 'Error al registrar el settlement' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * PATCH /api/admin/ledger/settlements
 * Same shape as POST plus `settlementId`. Manager-only. 404 if the target is
 * soft-deleted or belongs to another event.
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

    const allowedKeys = ['eventId', 'settlementId', 'fromParticipantId', 'toParticipantId', 'amountCents', 'currency', 'settledOn', 'note']
    if (!isRecord(body) || !hasOnlyKeys(body, allowedKeys)) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId) || !validIdentifier(body.settlementId)) {
        return NextResponse.json({ success: false, error: 'eventId y settlementId son requeridos' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (typeof body.fromParticipantId !== 'string' || body.fromParticipantId.trim().length === 0) {
        return NextResponse.json({ success: false, error: 'fromParticipantId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (typeof body.toParticipantId !== 'string' || body.toParticipantId.trim().length === 0) {
        return NextResponse.json({ success: false, error: 'toParticipantId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.fromParticipantId === body.toParticipantId) {
        return NextResponse.json({ success: false, error: 'fromParticipantId y toParticipantId no pueden ser el mismo participante' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validAmountCents(body.amountCents)) {
        return NextResponse.json({ success: false, error: `amountCents debe ser un entero positivo hasta ${AMOUNT_CENTS_CAP}` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validCurrency(body.currency)) {
        return NextResponse.json({ success: false, error: `currency debe ser una de: ${LEDGER_CURRENCIES.join(', ')}` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!isValidIsoDate(body.settledOn)) {
        return NextResponse.json({ success: false, error: 'settledOn debe ser una fecha ISO válida (YYYY-MM-DD)' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validOptionalNote(body.note)) {
        return NextResponse.json({ success: false, error: `note debe tener a lo más ${NOTE_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const updated = await updateSettlement({
            eventId: event.slug,
            settlementId: body.settlementId.trim(),
            fromParticipantId: body.fromParticipantId,
            toParticipantId: body.toParticipantId,
            amountCents: body.amountCents,
            currency: body.currency,
            settledOn: body.settledOn,
            note: body.note ?? null,
            createdBy: currentUser.id,
        })

        console.info(JSON.stringify({
            event: 'ledger_settlement.updated',
            eventId: event.slug,
            settlementId: updated.id,
            actorId: currentUser.id,
        }))

        return NextResponse.json(
            { success: true, settlement: settlementDto(updated) },
            { headers: NO_STORE_HEADERS },
        )
    } catch (err) {
        const mapped = mapLedgerWriteError(err)
        if (mapped) return mapped
        console.error('Error updating ledger settlement')
        return NextResponse.json({ success: false, error: 'Error al actualizar el settlement' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * DELETE /api/admin/ledger/settlements
 * Body: { eventId, settlementId } — manager-only. Soft-delete (`deleted_by`
 * = the acting user); idempotent — a second DELETE on an already-deleted (or
 * foreign/missing) id responds 404.
 */
export async function DELETE(request: NextRequest) {
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

    if (!isRecord(body) || !hasOnlyKeys(body, ['eventId', 'settlementId'])) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId) || !validIdentifier(body.settlementId)) {
        return NextResponse.json({ success: false, error: 'eventId y settlementId son requeridos' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const deleted = await softDeleteSettlement(body.settlementId.trim(), event.slug, currentUser.id)
        if (!deleted) {
            return NextResponse.json({ success: false, error: 'Settlement no encontrado' }, { status: 404, headers: NO_STORE_HEADERS })
        }

        console.info(JSON.stringify({
            event: 'ledger_settlement.deleted',
            eventId: event.slug,
            settlementId: body.settlementId,
            actorId: currentUser.id,
        }))

        return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS })
    } catch {
        console.error('Error deleting ledger settlement')
        return NextResponse.json({ success: false, error: 'Error al eliminar el settlement' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}
