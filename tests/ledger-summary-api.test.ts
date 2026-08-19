/**
 * ISSUE-024 (EPIC-006) — app/api/admin/ledger/summary/route.ts.
 *
 * Route-level: mocks `@/lib/ledger-queries` (getLedgerSnapshot,
 * getLedgerStripeMode, getStripePaidTotal, computeStripeRegisteredIncomeCents)
 * wholesale, but drives the REAL `@/lib/event-ledger.ts`
 * (computeBalances/simplifyDebts/partitionStripeView/LedgerInvariantError,
 * ISSUE-022) — same "use the pure engine as-is" rationale as
 * tests/ledger-transactions-api.test.ts uses for assertValidShares/splitEqual.
 * This is the file that proves the ISSUE-024.md acceptance gherkins end to
 * end through the real math, not a re-derivation of it.
 *
 * Fund-mode Stripe scenarios (ISSUE-024.md "Resolución 2026-08-19"): the
 * Architect adjudicated the original gherkin's label in favor of this file's
 * real-engine result — `settlement.from` gets `+amount`, `.to` gets
 * `-amount` (lib/event-ledger.ts), no special case for `kind='stripe'`. Two
 * scenarios below cover both directions: the node as DEBTOR (an expense
 * shared 100% to the node — "cubierto por el evento" — leaves it at a
 * negative balance, so the suggestion is `Stripe→X`, `involvesStripe:'from'`,
 * "retiro sugerido") and as CREDITOR (a withdrawal with no expense backing
 * it — `Stripe→A` with nothing else registered — leaves the node positive,
 * so the suggestion is `X→Stripe`, `involvesStripe:'to'`, "aporte al
 * fondo"). `remainderCents`/`contributionsCents`/`pendingCents` were added in
 * the same resolution — see the route's inline comments for the formula.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
    validateSession: vi.fn(),
    userHasEventAccess: vi.fn(),
    getEventBySlug: vi.fn(),
    getLedgerSnapshot: vi.fn(),
    getLedgerStripeMode: vi.fn(),
    getStripePaidTotal: vi.fn(),
    computeStripeRegisteredIncomeCents: vi.fn(),
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: vi.fn(() => ({ value: 'session-token' })),
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
}))

vi.mock('@/lib/user-queries', () => ({
    userHasEventAccess: mocks.userHasEventAccess,
}))

vi.mock('@/lib/db', () => ({
    isDatabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
}))

vi.mock('@/lib/ledger-queries', () => ({
    getLedgerSnapshot: mocks.getLedgerSnapshot,
    getLedgerStripeMode: mocks.getLedgerStripeMode,
    getStripePaidTotal: mocks.getStripePaidTotal,
    computeStripeRegisteredIncomeCents: mocks.computeStripeRegisteredIncomeCents,
}))

const storedEvent = { id: 'event-id', slug: 'fiesta' }

function participant(overrides: Record<string, unknown> = {}) {
    return {
        id: 'p',
        eventId: 'fiesta',
        kind: 'person',
        name: 'Participant',
        email: null,
        userId: null,
        isActive: true,
        createdBy: 'creator',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        ...overrides,
    }
}

function getRequest(eventId = 'fiesta') {
    return new NextRequest(`http://localhost/api/admin/ledger/summary?eventId=${eventId}`)
}

function mockAuth(role: 'super_admin' | 'user' = 'super_admin', hasAccess = true) {
    mocks.validateSession.mockResolvedValue({ id: 'user-1', role })
    mocks.userHasEventAccess.mockResolvedValue({ hasAccess })
}

// --- ISSUE-022's base gherkin scenario: expense 900 by A (equal 300/300/300)
// + income 300 to B (equal 100/100/100). No Stripe node in this scenario. ---
const A = participant({ id: 'participant-a', name: 'A' })
const B = participant({ id: 'participant-b', name: 'B' })
const C = participant({ id: 'participant-c', name: 'C' })

function baseSnapshot(overrides: Partial<{
    transactions: unknown[]
    shares: unknown[]
    settlements: unknown[]
    participants: unknown[]
    currency: string | null
}> = {}) {
    return {
        currency: 'MXN',
        transactions: [
            { id: 'tx-expense', type: 'expense', participantId: 'participant-a', amountCents: 900, deletedAt: null },
            { id: 'tx-income', type: 'income', participantId: 'participant-b', amountCents: 300, deletedAt: null },
        ],
        shares: [
            { transactionId: 'tx-expense', participantId: 'participant-a', shareCents: 300 },
            { transactionId: 'tx-expense', participantId: 'participant-b', shareCents: 300 },
            { transactionId: 'tx-expense', participantId: 'participant-c', shareCents: 300 },
            { transactionId: 'tx-income', participantId: 'participant-a', shareCents: 100 },
            { transactionId: 'tx-income', participantId: 'participant-b', shareCents: 100 },
            { transactionId: 'tx-income', participantId: 'participant-c', shareCents: 100 },
        ],
        settlements: [],
        participants: [A, B, C],
        ...overrides,
    }
}

describe('GET /api/admin/ledger/summary', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.getLedgerStripeMode.mockResolvedValue(false)
        mocks.getStripePaidTotal.mockResolvedValue(0)
        mocks.computeStripeRegisteredIncomeCents.mockReturnValue(0)
        mocks.getLedgerSnapshot.mockResolvedValue(baseSnapshot())
    })

    it('401s with no session', async () => {
        mocks.validateSession.mockResolvedValue(null)
        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        expect(response.status).toBe(401)
    })

    it('a viewer can read the summary — 200', async () => {
        mockAuth('user', true)
        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        expect(response.status).toBe(200)
        expect(mocks.userHasEventAccess).toHaveBeenCalledWith('user-1', 'event-id', 'viewer')
    })

    it('a user with no access gets 403', async () => {
        mockAuth('user', false)
        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        expect(response.status).toBe(403)
        expect(mocks.getLedgerSnapshot).not.toHaveBeenCalled()
    })

    it('responds with Cache-Control: no-store', async () => {
        mockAuth()
        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        expect(response.headers.get('Cache-Control')).toBe('no-store')
    })

    it('gasto 900 de A + ingreso 300 a B → balances A=+700 B=-500 C=-200, suggestedTransfers [B→A 500, C→A 200], settled=false', async () => {
        mockAuth()
        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(response.status).toBe(200)
        // expense 900 paid by A (equal 300/300/300) + income 300 received by
        // B (equal 100/100/100): A = 900-300+100=700, B = -300-300+100=-500,
        // C = -300+100=-200 — sorted saldo desc: A, C, B.
        expect(data.balances).toEqual([
            { participantId: 'participant-a', name: 'A', kind: 'person', balanceCents: 700, isActive: true },
            { participantId: 'participant-c', name: 'C', kind: 'person', balanceCents: -200, isActive: true },
            { participantId: 'participant-b', name: 'B', kind: 'person', balanceCents: -500, isActive: true },
        ])
        expect(data.suggestedTransfers).toEqual([
            { fromParticipantId: 'participant-b', toParticipantId: 'participant-a', amountCents: 500, involvesStripe: null },
            { fromParticipantId: 'participant-c', toParticipantId: 'participant-a', amountCents: 200, involvesStripe: null },
        ])
        expect(data.settled).toBe(false)
    })

    it('un settlement registrado B→A de 500 → el saldo de B es 0, solo se sugiere C→A 200', async () => {
        mockAuth()
        mocks.getLedgerSnapshot.mockResolvedValue(baseSnapshot({
            settlements: [{ fromParticipantId: 'participant-b', toParticipantId: 'participant-a', amountCents: 500, deletedAt: null }],
        }))

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        const bBalance = data.balances.find((b: { participantId: string }) => b.participantId === 'participant-b')
        expect(bBalance.balanceCents).toBe(0)
        expect(data.suggestedTransfers).toEqual([
            { fromParticipantId: 'participant-c', toParticipantId: 'participant-a', amountCents: 200, involvesStripe: null },
        ])
    })

    it('settlements que dejan todos los saldos en 0 → settled=true y suggestedTransfers=[]', async () => {
        mockAuth()
        mocks.getLedgerSnapshot.mockResolvedValue(baseSnapshot({
            settlements: [
                { fromParticipantId: 'participant-b', toParticipantId: 'participant-a', amountCents: 500, deletedAt: null },
                { fromParticipantId: 'participant-c', toParticipantId: 'participant-a', amountCents: 200, deletedAt: null },
            ],
        }))

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(data.settled).toBe(true)
        expect(data.suggestedTransfers).toEqual([])
        for (const balance of data.balances) {
            expect(balance.balanceCents).toBe(0)
        }
    })

    it('rsvp_payments con dos pagos paid de 25000 y uno expired → totals.stripePaidCents=50000 y ningún balance cambia por sí solo', async () => {
        mockAuth()
        mocks.getStripePaidTotal.mockResolvedValue(50000) // getStripePaidTotal itself only ever sums status='paid' rows (proven by lib/ledger-queries.ts + the real-DB smoke test) — the route just trusts its return value.
        const before = baseSnapshot()
        mocks.getLedgerSnapshot.mockResolvedValue(before)

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(data.totals.stripePaidCents).toBe(50000)
        // Balances are still exactly the base-scenario ones — stripePaidCents
        // never enters computeBalances (it only reads event_transactions /
        // event_transaction_shares / event_settlements).
        expect(data.balances.find((b: { participantId: string }) => b.participantId === 'participant-a').balanceCents).toBe(700)
    })

    const FUND_STRIPE_KEYS = ['collectedCents', 'contributionsCents', 'participantId', 'pendingCents', 'remainderCents', 'stripePaidExpensesCents', 'withdrawnCents'].sort()

    it('modo fund: gasto self-covered por Stripe + retiro Stripe→A 600 sin deuda previa → nodo ACREEDOR, sugerencia A→Stripe involvesStripe="to" (aporte al fondo)', async () => {
        mockAuth()
        mocks.getLedgerStripeMode.mockResolvedValue(false) // fund mode
        mocks.getStripePaidTotal.mockResolvedValue(8000)
        const stripeNode = participant({ id: 'stripe-1', kind: 'stripe', name: 'Stripe' })
        mocks.getLedgerSnapshot.mockResolvedValue({
            currency: 'MXN',
            transactions: [
                { id: 'tx-stripe-expense', type: 'expense', participantId: 'stripe-1', amountCents: 5000, deletedAt: null },
            ],
            shares: [
                { transactionId: 'tx-stripe-expense', participantId: 'stripe-1', shareCents: 5000 },
            ],
            settlements: [
                { fromParticipantId: 'stripe-1', toParticipantId: 'participant-a', amountCents: 600, deletedAt: null },
            ],
            participants: [A, stripeNode],
        })

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(data.stripeMode).toBe('fund')
        // The Stripe node never appears in `balances` in fund mode.
        expect(data.balances).toEqual([
            { participantId: 'participant-a', name: 'A', kind: 'person', balanceCents: -600, isActive: true },
        ])
        expect(data.stripe).toEqual({
            participantId: 'stripe-1',
            collectedCents: 8000,
            stripePaidExpensesCents: 5000,
            withdrawnCents: 600,
            contributionsCents: 0,
            remainderCents: 8000 + 0 - 5000 - 600,
            pendingCents: 600,
        })
        // Exactly one shape for fund mode — the participant-mode key never leaks.
        expect(Object.keys(data.stripe).sort()).toEqual(FUND_STRIPE_KEYS)
        // Real engine result: the self-covered expense nets to zero for Stripe,
        // and the withdrawal (with nothing backing it) makes Stripe a net
        // creditor of 600 — so the one remaining suggestion is A contributing
        // back to the fund.
        expect(data.suggestedTransfers).toEqual([
            { fromParticipantId: 'participant-a', toParticipantId: 'stripe-1', amountCents: 600, involvesStripe: 'to' },
        ])
    })

    it('modo fund: gasto 600 pagado por A con share 100% al nodo Stripe ("cubierto por el evento") → nodo DEUDOR, sugerencia Stripe→A involvesStripe="from" (retiro sugerido)', async () => {
        mockAuth()
        mocks.getLedgerStripeMode.mockResolvedValue(false) // fund mode
        mocks.getStripePaidTotal.mockResolvedValue(3000)
        const stripeNode = participant({ id: 'stripe-1', kind: 'stripe', name: 'Stripe' })
        mocks.getLedgerSnapshot.mockResolvedValue({
            currency: 'MXN',
            transactions: [
                { id: 'tx-covered-expense', type: 'expense', participantId: 'participant-a', amountCents: 600, deletedAt: null },
            ],
            shares: [
                { transactionId: 'tx-covered-expense', participantId: 'stripe-1', shareCents: 600 },
            ],
            settlements: [],
            participants: [A, stripeNode],
        })

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(data.stripeMode).toBe('fund')
        // A advanced the expense but its share was assigned entirely to the
        // Stripe node ("cubierto por el evento") — A is owed, the fund owes A.
        expect(data.balances).toEqual([
            { participantId: 'participant-a', name: 'A', kind: 'person', balanceCents: 600, isActive: true },
        ])
        expect(data.stripe).toEqual({
            participantId: 'stripe-1',
            collectedCents: 3000,
            stripePaidExpensesCents: 0,
            withdrawnCents: 0,
            contributionsCents: 0,
            remainderCents: 3000,
            pendingCents: -600,
        })
        expect(Object.keys(data.stripe).sort()).toEqual(FUND_STRIPE_KEYS)
        expect(data.suggestedTransfers).toEqual([
            { fromParticipantId: 'stripe-1', toParticipantId: 'participant-a', amountCents: 600, involvesStripe: 'from' },
        ])
        expect(data.settled).toBe(false)
    })

    it('modo fund: tras registrar el retiro que salda al deudor, A=0, pendingCents=0 y remainderCents baja el monto retirado', async () => {
        mockAuth()
        mocks.getLedgerStripeMode.mockResolvedValue(false) // fund mode
        mocks.getStripePaidTotal.mockResolvedValue(3000)
        const stripeNode = participant({ id: 'stripe-1', kind: 'stripe', name: 'Stripe' })
        mocks.getLedgerSnapshot.mockResolvedValue({
            currency: 'MXN',
            transactions: [
                { id: 'tx-covered-expense', type: 'expense', participantId: 'participant-a', amountCents: 600, deletedAt: null },
            ],
            shares: [
                { transactionId: 'tx-covered-expense', participantId: 'stripe-1', shareCents: 600 },
            ],
            settlements: [
                // The suggested retiro from the previous test, now registered.
                { fromParticipantId: 'stripe-1', toParticipantId: 'participant-a', amountCents: 600, deletedAt: null },
            ],
            participants: [A, stripeNode],
        })

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(data.balances).toEqual([
            { participantId: 'participant-a', name: 'A', kind: 'person', balanceCents: 0, isActive: true },
        ])
        expect(data.stripe.pendingCents).toBe(0)
        expect(data.stripe.remainderCents).toBe(3000 - 0 - 600)
        expect(data.suggestedTransfers).toEqual([])
        expect(data.settled).toBe(true)
    })

    it('modo participant: el nodo Stripe aparece en balances, unregisteredPaidCents refleja el delta sin registrar, settled requiere que TODO (incluido Stripe) esté en 0', async () => {
        mockAuth()
        mocks.getLedgerStripeMode.mockResolvedValue(true) // participant mode
        mocks.getStripePaidTotal.mockResolvedValue(12000)
        mocks.computeStripeRegisteredIncomeCents.mockReturnValue(10000)
        const stripeNode = participant({ id: 'stripe-1', kind: 'stripe', name: 'Stripe' })
        const bParticipant = participant({ id: 'participant-b', name: 'B' })
        mocks.getLedgerSnapshot.mockResolvedValue({
            currency: 'MXN',
            transactions: [
                { id: 'tx-stripe-income', type: 'income', participantId: 'stripe-1', amountCents: 10000, deletedAt: null },
            ],
            shares: [
                { transactionId: 'tx-stripe-income', participantId: 'participant-a', shareCents: 5000 },
                { transactionId: 'tx-stripe-income', participantId: 'participant-b', shareCents: 5000 },
            ],
            settlements: [
                // Partial withdrawal — the fund gave some of it back to A.
                { fromParticipantId: 'stripe-1', toParticipantId: 'participant-a', amountCents: 3000, deletedAt: null },
            ],
            participants: [A, bParticipant, stripeNode],
        })

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(data.stripeMode).toBe('participant')
        expect(data.balances.some((b: { participantId: string }) => b.participantId === 'stripe-1')).toBe(true)
        expect(data.stripe).toEqual({ participantId: 'stripe-1', unregisteredPaidCents: 12000 - 10000 })
        expect(Object.keys(data.stripe).sort()).toEqual(['participantId', 'unregisteredPaidCents'].sort())
        // stripe-1: -10000 (income) + 3000 (settlement payer) = -7000 — not
        // zero, so settled is false and Stripe's own balance is what's
        // keeping the ledger open, demonstrating "TODO incluido Stripe".
        const stripeBalance = data.balances.find((b: { participantId: string }) => b.participantId === 'stripe-1')
        expect(stripeBalance.balanceCents).toBe(-7000)
        expect(data.settled).toBe(false)
    })

    it('cambiar de modo vía config y repetir el GET summary cambia la forma de `stripe` sin que el snapshot subyacente cambie', async () => {
        mockAuth()
        const snapshot = baseSnapshot()
        mocks.getLedgerSnapshot.mockResolvedValue(snapshot)

        mocks.getLedgerStripeMode.mockResolvedValueOnce(true)
        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const participantModeResponse = await GET(getRequest())
        const participantModeData = await participantModeResponse.json()
        expect(participantModeData.stripeMode).toBe('participant')
        expect(Object.keys(participantModeData.stripe)).toContain('unregisteredPaidCents')

        mocks.getLedgerStripeMode.mockResolvedValueOnce(false)
        const fundModeResponse = await GET(getRequest())
        const fundModeData = await fundModeResponse.json()
        expect(fundModeData.stripeMode).toBe('fund')
        expect(Object.keys(fundModeData.stripe)).toContain('remainderCents')

        // Same snapshot both times — the mode change is presentation-only.
        expect(mocks.getLedgerSnapshot).toHaveBeenCalledTimes(2)
        expect(participantModeData.balances.map((b: { participantId: string }) => b.participantId).sort())
            .toEqual(fundModeData.balances.map((b: { participantId: string }) => b.participantId).sort())
    })

    it('LedgerInvariantError (datos corruptos: shares que no cuadran) → 500 con code LEDGER_INVARIANT, nunca saldos inventados', async () => {
        mockAuth()
        mocks.getLedgerSnapshot.mockResolvedValue({
            currency: 'MXN',
            transactions: [{ id: 'tx-corrupt', type: 'expense', participantId: 'participant-a', amountCents: 1000, deletedAt: null }],
            // Shares only sum to 900, not 1000 — corrupt, should never happen
            // through the guarded write CTEs, but the route must refuse to
            // report invented balances if it ever does.
            shares: [{ transactionId: 'tx-corrupt', participantId: 'participant-b', shareCents: 900 }],
            settlements: [],
            participants: [A, B],
        })

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(response.status).toBe(500)
        expect(data.success).toBe(false)
        expect(data.code).toBe('LEDGER_INVARIANT')
    })

    it('participantes desactivados con saldo distinto de 0 SÍ aparecen; desactivados con saldo 0 se omiten', async () => {
        mockAuth()
        const inactiveWithDebt = participant({ id: 'participant-d', name: 'D', isActive: false })
        const inactiveZero = participant({ id: 'participant-e', name: 'E', isActive: false })
        mocks.getLedgerSnapshot.mockResolvedValue({
            currency: 'MXN',
            transactions: [
                { id: 'tx1', type: 'expense', participantId: 'participant-a', amountCents: 100, deletedAt: null },
            ],
            shares: [
                { transactionId: 'tx1', participantId: 'participant-d', shareCents: 100 },
            ],
            settlements: [],
            participants: [A, inactiveWithDebt, inactiveZero],
        })

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        const ids = data.balances.map((b: { participantId: string }) => b.participantId)
        expect(ids).toContain('participant-d') // inactive, balance != 0
        expect(ids).not.toContain('participant-e') // inactive, balance 0 — omitted
    })

    it('currency is null when the ledger has no movements yet', async () => {
        mockAuth()
        mocks.getLedgerSnapshot.mockResolvedValue({ currency: null, transactions: [], shares: [], settlements: [], participants: [] })

        const { GET } = await import('@/app/api/admin/ledger/summary/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(data.currency).toBeNull()
        expect(data.settled).toBe(true)
    })
})

describe('lib/ledger-queries.ts never writes to rsvp_payments (PLAN §7 review focus)', () => {
    it('only ever SELECTs from rsvpPayments — no insert/update/delete call touches it', () => {
        const source = readFileSync(path.join(process.cwd(), 'lib', 'ledger-queries.ts'), 'utf-8')

        expect(source).toMatch(/from\(rsvpPayments\)/)
        expect(source).not.toMatch(/\.insert\(rsvpPayments/)
        expect(source).not.toMatch(/\.update\(rsvpPayments/)
        expect(source).not.toMatch(/\.delete\(rsvpPayments/)
        expect(source).not.toMatch(/INSERT INTO rsvp_payments/i)
        expect(source).not.toMatch(/UPDATE rsvp_payments/i)
        expect(source).not.toMatch(/DELETE FROM rsvp_payments/i)
    })
})
