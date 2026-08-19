import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { isDatabaseConfigured } from '@/lib/db'
import { userHasEventAccess } from '@/lib/user-queries'
import {
    LedgerInvariantError,
    computeBalances,
    partitionStripeView,
    simplifyDebts,
} from '@/lib/event-ledger'
import {
    computeStripeRegisteredIncomeCents,
    getLedgerSnapshot,
    getLedgerStripeMode,
    getStripePaidTotal,
} from '@/lib/ledger-queries'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

type SessionUser = NonNullable<Awaited<ReturnType<typeof validateSession>>>
type EventRecord = NonNullable<Awaited<ReturnType<typeof import('@/lib/queries').getEventBySlug>>>
type InvolvesStripe = 'from' | 'to' | null

function validIdentifier(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 200
}

async function authenticate(): Promise<SessionUser | null> {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('rp_session')?.value
    return sessionToken ? validateSession(sessionToken) : null
}

/** Same RBAC shape as the other ledger routes (ISSUE-023/018). GET is viewer-readable (PLAN §2.7 / P1b confirmed). */
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
 * GET /api/admin/ledger/summary?eventId=...
 *
 * Orchestrates getLedgerSnapshot -> computeBalances -> simplifyDebts ->
 * partitionStripeView (ISSUE-022, used as-is — this route never
 * re-implements ledger math) and shapes the exact JSON contract of
 * ISSUE-024.md: totals, the mode-specific `stripe` section, balances and
 * suggested transfers. Never caches (financial data, PLAN §3.3).
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

        const [stripeIsParticipant, snapshot, stripePaidCents] = await Promise.all([
            getLedgerStripeMode(event.slug),
            getLedgerSnapshot(event.slug),
            getStripePaidTotal(event.slug),
        ])
        const stripeMode: 'participant' | 'fund' = stripeIsParticipant ? 'participant' : 'fund'

        const stripeParticipant = snapshot.participants.find(participant => participant.kind === 'stripe') ?? null
        const stripeParticipantId = stripeParticipant?.id ?? null

        let balances
        try {
            balances = computeBalances(snapshot.transactions, snapshot.shares, snapshot.settlements)
        } catch (err) {
            if (err instanceof LedgerInvariantError) {
                console.error(JSON.stringify({
                    event: 'ledger_summary.invariant_violation',
                    eventId: event.slug,
                    deltaCents: err.deltaCents,
                }))
                return NextResponse.json(
                    { success: false, error: 'Los saldos del ledger no cuadran — contacta soporte', code: 'LEDGER_INVARIANT' },
                    { status: 500, headers: NO_STORE_HEADERS },
                )
            }
            throw err
        }

        const transfers = simplifyDebts(balances)
        const partition = partitionStripeView(balances, transfers, stripeParticipantId, stripeMode)

        // --- totals (PLAN §2.6b: expenses include Stripe-paid ones; manual
        // income excludes what the Stripe node itself received) ---
        let expensesCents = 0
        let manualIncomeCents = 0
        for (const transaction of snapshot.transactions) {
            if (transaction.type === 'expense') {
                expensesCents += transaction.amountCents
            } else if (transaction.participantId !== stripeParticipantId) {
                manualIncomeCents += transaction.amountCents
            }
        }
        const netCents = manualIncomeCents + stripePaidCents - expensesCents

        // --- stripe section: exactly one shape per mode (ISSUE-024.md) ---
        let stripeSection: Record<string, unknown>
        if (stripeMode === 'participant') {
            const registeredIncomeCents = computeStripeRegisteredIncomeCents(snapshot)
            stripeSection = {
                participantId: stripeParticipantId,
                unregisteredPaidCents: stripePaidCents - registeredIncomeCents,
            }
        } else {
            let stripePaidExpensesCents = 0
            let withdrawnCents = 0
            let contributionsCents = 0
            for (const transaction of snapshot.transactions) {
                if (transaction.type === 'expense' && transaction.participantId === stripeParticipantId) {
                    stripePaidExpensesCents += transaction.amountCents
                }
            }
            for (const settlement of snapshot.settlements) {
                if (settlement.fromParticipantId === stripeParticipantId) {
                    withdrawnCents += settlement.amountCents
                } else if (settlement.toParticipantId === stripeParticipantId) {
                    // Cash flowing back INTO the fund (PLAN §2.6b resolución
                    // 2026-08-19): a debtor settling their share of a
                    // Stripe-covered expense. Omitting this from
                    // remainderCents undercounted real cash the fund holds.
                    contributionsCents += settlement.amountCents
                }
            }
            const collectedCents = stripePaidCents
            // partitionStripeView.stripeBalanceCents (ISSUE-022): the node's
            // ledger balance once partitioned out — negative = fund still
            // owes pending withdrawals, positive = pending contributions
            // owed to the fund. Only meaningful once the node is
            // provisioned and actually partitioned out (mode==='partitioned');
            // otherwise there's nothing pending yet.
            const pendingCents = partition.mode === 'partitioned' ? partition.stripeBalanceCents : 0
            stripeSection = {
                participantId: stripeParticipantId,
                collectedCents,
                stripePaidExpensesCents,
                withdrawnCents,
                contributionsCents,
                remainderCents: collectedCents + contributionsCents - stripePaidExpensesCents - withdrawnCents,
                pendingCents,
            }
        }

        // --- balances: identity mode keeps the Stripe node inline; a real
        // partition (fund mode with a provisioned Stripe node) reports the
        // Stripe node only through `stripe` above, never in `balances`
        // (PLAN §2.6b table). Inactive participants with a zero balance are
        // omitted; active participants always show (even at zero). ---
        const balanceEntries = partition.mode === 'identity' ? partition.balances : partition.personBalances
        const stripeIsPartitionedOut = partition.mode === 'partitioned'

        const balancesOut: Array<{ participantId: string; name: string; kind: string; balanceCents: number; isActive: boolean }> = []
        for (const participant of snapshot.participants) {
            if (stripeIsPartitionedOut && participant.kind === 'stripe') continue
            const balanceCents = balanceEntries.get(participant.id) ?? 0
            if (!participant.isActive && balanceCents === 0) continue
            balancesOut.push({
                participantId: participant.id,
                name: participant.name,
                kind: participant.kind,
                balanceCents,
                isActive: participant.isActive,
            })
        }
        // Deterministic order: saldo desc, tie-break by name — plain string
        // comparison (never localeCompare, which is locale/ICU-dependent).
        balancesOut.sort((a, b) => {
            if (b.balanceCents !== a.balanceCents) return b.balanceCents - a.balanceCents
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
        })

        // --- suggestedTransfers: one shape regardless of mode — always
        // carries `involvesStripe` (null when the partition never ran, i.e.
        // participant mode or no Stripe node yet). partitionStripeView is
        // presentation-only (never recomputes), so these are the SAME
        // transfers `simplifyDebts` produced over the full graph. ---
        const suggestedTransfers = partition.mode === 'identity'
            ? partition.transfers.map(transfer => ({
                fromParticipantId: transfer.fromParticipantId,
                toParticipantId: transfer.toParticipantId,
                amountCents: transfer.amountCents,
                involvesStripe: null as InvolvesStripe,
            }))
            : partition.transfers.map(transfer => ({
                fromParticipantId: transfer.fromParticipantId,
                toParticipantId: transfer.toParticipantId,
                amountCents: transfer.amountCents,
                involvesStripe: transfer.involvesStripe,
            }))

        // Settled iff every balance in the full graph (persons AND Stripe)
        // is zero. Because Σ balances = 0 always holds, "every person's
        // balance is individually zero" (the fund-mode definition) forces
        // the Stripe node to zero too — so this single check is correct for
        // both modes without branching (PLAN §2.6b "settled" row).
        const settled = suggestedTransfers.length === 0

        return NextResponse.json(
            {
                success: true,
                currency: snapshot.currency,
                stripeMode,
                totals: {
                    expensesCents,
                    manualIncomeCents,
                    stripePaidCents,
                    netCents,
                },
                stripe: stripeSection,
                balances: balancesOut,
                suggestedTransfers,
                settled,
            },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        console.error('Error building ledger summary')
        return NextResponse.json({ success: false, error: 'Error al obtener el resumen del ledger' }, { status: 500, headers: NO_STORE_HEADERS })
    }
}
