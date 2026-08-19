import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { userHasEventAccess } from '@/lib/user-queries'
import { assertValidShares, splitEqual } from '@/lib/event-ledger'
import {
    LedgerCurrencyMismatchError,
    LedgerParticipantNotFoundError,
    LedgerSharesMismatchError,
    LedgerTransactionNotFoundError,
    createTransactionWithShares,
    listTransactions,
    softDeleteTransaction,
    updateTransactionWithShares,
    type TransactionShareInput,
    type TransactionWithShares,
} from '@/lib/ledger-queries'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const DESCRIPTION_MIN_LENGTH = 1
const DESCRIPTION_MAX_LENGTH = 200
const NOTE_MAX_LENGTH = 500
// PLAN-EPIC-006.md §5 gotcha #7: a sanity cap (~$1M) to catch capture typos —
// the DB CHECK only enforces amount_cents > 0.
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

function validDescription(value: unknown): value is string {
    if (typeof value !== 'string') return false
    const trimmed = value.trim()
    return trimmed.length >= DESCRIPTION_MIN_LENGTH && trimmed.length <= DESCRIPTION_MAX_LENGTH
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

/** Same RBAC shape as the ledger participants route / ISSUE-018's checkin-config. */
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

/** Explicit allowlist — never a spread of the Drizzle row (no eventId/deletedAt/deletedBy leak). */
function transactionDto(transaction: TransactionWithShares) {
    return {
        id: transaction.id,
        type: transaction.type,
        participantId: transaction.participantId,
        description: transaction.description,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        occurredOn: transaction.occurredOn,
        note: transaction.note,
        createdBy: transaction.createdBy,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        shares: transaction.shares,
    }
}

function parseShareEntry(value: unknown): TransactionShareInput | null {
    if (!isRecord(value) || !hasOnlyKeys(value, ['participantId', 'shareCents'])) return null
    if (typeof value.participantId !== 'string' || value.participantId.trim().length === 0) return null
    if (typeof value.shareCents !== 'number' || !Number.isInteger(value.shareCents) || value.shareCents <= 0) return null
    return { participantId: value.participantId, shareCents: value.shareCents }
}

/**
 * Resolves the `shares` field of a POST/PATCH body: either an explicit
 * `shares: [{ participantId, shareCents }]` array, or the convenience
 * `splitMode: 'equal'` + `participantIds` shape — the reparto is ALWAYS
 * derived/validated on the server (`splitEqual`), never trusted from a
 * client-computed total (PLAN §2.3/ISSUE-023 spec).
 */
function resolveShares(
    body: Record<string, unknown>,
    amountCents: number,
): { shares: TransactionShareInput[] } | { error: string } {
    if (body.splitMode !== undefined) {
        if (body.splitMode !== 'equal') {
            return { error: "splitMode solo soporta 'equal'" }
        }
        if (body.shares !== undefined) {
            return { error: 'No se puede combinar splitMode con shares' }
        }
        if (
            !Array.isArray(body.participantIds)
            || body.participantIds.length === 0
            || !body.participantIds.every((id): id is string => typeof id === 'string' && id.trim().length > 0)
        ) {
            return { error: 'participantIds es requerido con splitMode equal' }
        }
        try {
            const split = splitEqual(amountCents, body.participantIds as string[])
            return { shares: Array.from(split.entries()).map(([participantId, shareCents]) => ({ participantId, shareCents })) }
        } catch (err) {
            return { error: err instanceof Error ? err.message : 'No se pudo calcular el reparto equitativo' }
        }
    }

    if (body.participantIds !== undefined) {
        return { error: "participantIds solo aplica con splitMode 'equal'" }
    }
    if (!Array.isArray(body.shares) || body.shares.length === 0) {
        return { error: 'shares es requerido' }
    }
    const parsedShares = body.shares.map(parseShareEntry)
    if (parsedShares.some(share => share === null)) {
        return { error: 'shares inválido: cada entrada requiere participantId y shareCents (entero positivo)' }
    }
    return { shares: parsedShares as TransactionShareInput[] }
}

function mapLedgerWriteError(err: unknown): NextResponse | null {
    if (err instanceof LedgerParticipantNotFoundError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (err instanceof LedgerSharesMismatchError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (err instanceof LedgerCurrencyMismatchError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (err instanceof LedgerTransactionNotFoundError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 404, headers: NO_STORE_HEADERS })
    }
    return null
}

/**
 * GET /api/admin/ledger/transactions?eventId=...
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

        const transactions = await listTransactions(event.slug)
        return NextResponse.json(
            { success: true, transactions: transactions.map(transactionDto) },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        console.error('Error listing ledger transactions')
        return NextResponse.json({ success: false, error: 'Error al obtener los movimientos' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * POST /api/admin/ledger/transactions
 * Body: { eventId, type, participantId, description, amountCents, currency,
 *         occurredOn, note?, shares } (or splitMode:'equal' + participantIds
 *         instead of shares). Manager-only. The Stripe virtual participant is
 *         a valid participantId/share participant here with no special
 *         branch (PLAN §2.6a) — it is simply always active.
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

    const allowedKeys = ['eventId', 'type', 'participantId', 'description', 'amountCents', 'currency', 'occurredOn', 'note', 'shares', 'splitMode', 'participantIds']
    if (!isRecord(body) || !hasOnlyKeys(body, allowedKeys)) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId)) {
        return NextResponse.json({ success: false, error: 'eventId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.type !== 'expense' && body.type !== 'income') {
        return NextResponse.json({ success: false, error: "type debe ser 'expense' o 'income'" }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (typeof body.participantId !== 'string' || body.participantId.trim().length === 0) {
        return NextResponse.json({ success: false, error: 'participantId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validDescription(body.description)) {
        return NextResponse.json({ success: false, error: `description debe tener entre ${DESCRIPTION_MIN_LENGTH} y ${DESCRIPTION_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validAmountCents(body.amountCents)) {
        return NextResponse.json({ success: false, error: `amountCents debe ser un entero positivo hasta ${AMOUNT_CENTS_CAP}` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validCurrency(body.currency)) {
        return NextResponse.json({ success: false, error: `currency debe ser una de: ${LEDGER_CURRENCIES.join(', ')}` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!isValidIsoDate(body.occurredOn)) {
        return NextResponse.json({ success: false, error: 'occurredOn debe ser una fecha ISO válida (YYYY-MM-DD)' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validOptionalNote(body.note)) {
        return NextResponse.json({ success: false, error: `note debe tener a lo más ${NOTE_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_STORE_HEADERS })
    }

    const sharesResult = resolveShares(body, body.amountCents)
    if ('error' in sharesResult) {
        return NextResponse.json({ success: false, error: sharesResult.error }, { status: 400, headers: NO_STORE_HEADERS })
    }
    const { shares } = sharesResult

    // ISSUE-023 spec: validated BEFORE touching the DB; the write CTE
    // re-validates as defense in depth.
    try {
        assertValidShares(body.amountCents, shares.map(share => share.shareCents))
    } catch (err) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'shares inválido' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const created = await createTransactionWithShares({
            eventId: event.slug,
            type: body.type,
            participantId: body.participantId,
            description: body.description,
            amountCents: body.amountCents,
            currency: body.currency,
            occurredOn: body.occurredOn,
            note: body.note ?? null,
            createdBy: currentUser.id,
            shares,
        })

        console.info(JSON.stringify({
            event: 'ledger_transaction.created',
            eventId: event.slug,
            transactionId: created.id,
            actorId: currentUser.id,
        }))

        return NextResponse.json(
            { success: true, transaction: transactionDto(created) },
            { status: 201, headers: NO_STORE_HEADERS },
        )
    } catch (err) {
        const mapped = mapLedgerWriteError(err)
        if (mapped) return mapped
        console.error('Error creating ledger transaction')
        return NextResponse.json({ success: false, error: 'Error al registrar el movimiento' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * PATCH /api/admin/ledger/transactions
 * Same shape as POST plus `transactionId`. Manager-only. 404 if the target
 * is soft-deleted or belongs to another event.
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

    const allowedKeys = ['eventId', 'transactionId', 'type', 'participantId', 'description', 'amountCents', 'currency', 'occurredOn', 'note', 'shares', 'splitMode', 'participantIds']
    if (!isRecord(body) || !hasOnlyKeys(body, allowedKeys)) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId) || !validIdentifier(body.transactionId)) {
        return NextResponse.json({ success: false, error: 'eventId y transactionId son requeridos' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (body.type !== 'expense' && body.type !== 'income') {
        return NextResponse.json({ success: false, error: "type debe ser 'expense' o 'income'" }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (typeof body.participantId !== 'string' || body.participantId.trim().length === 0) {
        return NextResponse.json({ success: false, error: 'participantId es requerido' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validDescription(body.description)) {
        return NextResponse.json({ success: false, error: `description debe tener entre ${DESCRIPTION_MIN_LENGTH} y ${DESCRIPTION_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validAmountCents(body.amountCents)) {
        return NextResponse.json({ success: false, error: `amountCents debe ser un entero positivo hasta ${AMOUNT_CENTS_CAP}` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validCurrency(body.currency)) {
        return NextResponse.json({ success: false, error: `currency debe ser una de: ${LEDGER_CURRENCIES.join(', ')}` }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!isValidIsoDate(body.occurredOn)) {
        return NextResponse.json({ success: false, error: 'occurredOn debe ser una fecha ISO válida (YYYY-MM-DD)' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validOptionalNote(body.note)) {
        return NextResponse.json({ success: false, error: `note debe tener a lo más ${NOTE_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_STORE_HEADERS })
    }

    const sharesResult = resolveShares(body, body.amountCents)
    if ('error' in sharesResult) {
        return NextResponse.json({ success: false, error: sharesResult.error }, { status: 400, headers: NO_STORE_HEADERS })
    }
    const { shares } = sharesResult

    try {
        assertValidShares(body.amountCents, shares.map(share => share.shareCents))
    } catch (err) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'shares inválido' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const updated = await updateTransactionWithShares({
            eventId: event.slug,
            transactionId: body.transactionId.trim(),
            type: body.type,
            participantId: body.participantId,
            description: body.description,
            amountCents: body.amountCents,
            currency: body.currency,
            occurredOn: body.occurredOn,
            note: body.note ?? null,
            createdBy: currentUser.id,
            shares,
        })

        console.info(JSON.stringify({
            event: 'ledger_transaction.updated',
            eventId: event.slug,
            transactionId: updated.id,
            actorId: currentUser.id,
        }))

        return NextResponse.json(
            { success: true, transaction: transactionDto(updated) },
            { headers: NO_STORE_HEADERS },
        )
    } catch (err) {
        const mapped = mapLedgerWriteError(err)
        if (mapped) return mapped
        console.error('Error updating ledger transaction')
        return NextResponse.json({ success: false, error: 'Error al actualizar el movimiento' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}

/**
 * DELETE /api/admin/ledger/transactions
 * Body: { eventId, transactionId } — manager-only. Soft-delete
 * (`deleted_by` = the acting user); idempotent — a second DELETE on an
 * already-deleted (or foreign/missing) id responds 404.
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

    if (!isRecord(body) || !hasOnlyKeys(body, ['eventId', 'transactionId'])) {
        return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (!validIdentifier(body.eventId) || !validIdentifier(body.transactionId)) {
        return NextResponse.json({ success: false, error: 'eventId y transactionId son requeridos' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    try {
        const authorization = await authorizeEvent(currentUser, body.eventId.trim(), 'manager')
        if ('response' in authorization) return authorization.response
        const { event } = authorization

        const deleted = await softDeleteTransaction(body.transactionId.trim(), event.slug, currentUser.id)
        if (!deleted) {
            return NextResponse.json({ success: false, error: 'Movimiento no encontrado' }, { status: 404, headers: NO_STORE_HEADERS })
        }

        console.info(JSON.stringify({
            event: 'ledger_transaction.deleted',
            eventId: event.slug,
            transactionId: body.transactionId,
            actorId: currentUser.id,
        }))

        return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS })
    } catch {
        console.error('Error deleting ledger transaction')
        return NextResponse.json({ success: false, error: 'Error al eliminar el movimiento' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}
