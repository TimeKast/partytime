/**
 * ISSUE-013 (EPIC-004) — payments visibility in the admin list and exports.
 *
 * Two halves, same split rationale as tests/stripe-webhook-queries.test.ts /
 * tests/rsvp-payment-route.test.ts (a whole-module `vi.mock('@/lib/queries')`
 * and a real, `@/lib/db`-backed `lib/queries.ts` cannot coexist in one file):
 *
 *   1. Query-layer: `getRSVPsByEvent`'s new `includePayments` join — mocks
 *      `@/lib/db` and runs the REAL lib/queries.ts, asserting the SQL shape,
 *      the DTO shape (no PII beyond what the pre-existing RSVP shape already
 *      had, no stripe_session_id/stripe_payment_intent_id) and that the
 *      pre-ISSUE-013 (`includePayments` omitted) path never touches
 *      `db.execute` at all.
 *   2. Pure lib/rsvp-list.ts logic: the payment filter, the paid-count/
 *      amount-collected aggregation (centavos → mayores), and the
 *      formatting/summary helpers — no DB involved.
 *
 * A third, lighter section source-inspects the UI wiring (RsvpTable/
 * RsvpFilters/app/admin/page.tsx) the same way tests/admin-refinement-ui.test.ts
 * does, to lock in the "columns/filter only for a payment_required event"
 * and "PDF never gets raw emoji" acceptance criteria without a full RTL
 * render of the 2600-line admin page.
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

// ISSUE-013: mocked at module scope (same pattern/rationale as
// tests/stripe-webhook-queries.test.ts) — vi.mock must be hoistable to the
// top of the file, so it cannot live inside a describe() callback. The other
// two describe blocks below (lib/rsvp-list.ts pure logic, UI source
// contracts) never touch @/lib/db, so mocking it file-wide is harmless for
// them.
const mocks = vi.hoisted(() => {
    const chain = { from: vi.fn(), where: vi.fn(), orderBy: vi.fn() }
    chain.from.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    return {
        chain,
        select: vi.fn(() => chain),
        execute: vi.fn(),
    }
})

vi.mock('@/lib/db', () => ({
    db: { select: mocks.select, execute: mocks.execute, insert: vi.fn(), update: vi.fn() },
    isDatabaseConfigured: () => true,
    rsvps: { id: 'rsvps.id', eventId: 'rsvps.eventId', createdAt: 'rsvps.createdAt' },
    events: {},
    appSettings: {},
    rsvpInvitationLinks: {},
    rsvpPayments: { rsvpId: 'rsvp_payments.rsvp_id' },
}))

describe('getRSVPsByEvent — ISSUE-013 payments join (query layer)', () => {
    function rawFreeRsvpRow(overrides: Record<string, unknown> = {}) {
        return {
            id: 'rsvp-1', event_id: 'fiesta', name: 'Alex', email: 'alex@example.com',
            phone: '+525500000000', plus_one: false, plus_one_name: null, status: 'confirmed',
            email_sent: null, email_history: [], cancel_token: null,
            created_at: '2026-08-17T00:00:00.000Z', pending_expires_at: null, verified_at: null,
            verification_token_hash: null, verification_expires_at: null,
            ...overrides,
        }
    }

    beforeEach(() => {
        mocks.select.mockClear()
        mocks.execute.mockReset()
        mocks.chain.from.mockClear().mockReturnValue(mocks.chain)
        mocks.chain.where.mockClear().mockReturnValue(mocks.chain)
        mocks.chain.orderBy.mockReset()
    })

    it('includePayments omitted (default): a plain select, never touches db.execute, rows carry no payment keys at all', async () => {
        mocks.chain.orderBy.mockResolvedValue([
            { id: 'rsvp-1', eventId: 'fiesta', name: 'Alex', email: 'alex@example.com', status: 'confirmed', createdAt: new Date() },
        ])

        const { getRSVPsByEvent } = await import('@/lib/queries')
        const rows = await getRSVPsByEvent('fiesta')

        expect(mocks.execute).not.toHaveBeenCalled()
        expect(mocks.select).toHaveBeenCalledTimes(1)
        expect(rows).toHaveLength(1)
        expect(rows[0]).not.toHaveProperty('paymentStatus')
        expect(rows[0]).not.toHaveProperty('amountCents')
        expect(rows[0]).not.toHaveProperty('paidAt')
        expect(rows[0]).not.toHaveProperty('currency')
    })

    it('includePayments: true — joins the LATEST rsvp_payments row per rsvp via a LATERAL join, never a plain select', async () => {
        mocks.execute.mockResolvedValue({ rows: [] })

        const { getRSVPsByEvent } = await import('@/lib/queries')
        await getRSVPsByEvent('fiesta', { includePayments: true })

        expect(mocks.select).not.toHaveBeenCalled()
        expect(mocks.execute).toHaveBeenCalledTimes(1)

        const statement = sqlTextOf(mocks.execute.mock.calls[0][0])
        expect(statement).toContain('LEFT JOIN LATERAL')
        expect(statement).toContain('rsvp_payments')
        expect(statement).toContain('ORDER BY created_at DESC')
        expect(statement).toContain('LIMIT 1')
        expect(statement).toContain('rsvps.event_id')
    })

    it('the joined DTO shape carries ONLY status/paid_at/amount_cents/currency — never stripe_session_id or stripe_payment_intent_id (no extra PII)', async () => {
        mocks.execute.mockResolvedValue({ rows: [] })

        const { getRSVPsByEvent } = await import('@/lib/queries')
        await getRSVPsByEvent('fiesta', { includePayments: true })

        const statement = sqlTextOf(mocks.execute.mock.calls[0][0])
        expect(statement).not.toContain('stripe_session_id')
        expect(statement).not.toContain('stripe_payment_intent_id')
        expect(statement).not.toContain('refunded_at')
    })

    it('a row with a paid payment maps amount_cents/currency/paid_at/status onto the RSVP (numbers/Dates, not raw SQL strings)', async () => {
        mocks.execute.mockResolvedValue({
            rows: [rawFreeRsvpRow({
                payment_status: 'paid',
                paid_at: '2026-08-17T01:00:00.000Z',
                amount_cents: 25000,
                currency: 'MXN',
            })],
        })

        const { getRSVPsByEvent } = await import('@/lib/queries')
        const rows = await getRSVPsByEvent('fiesta', { includePayments: true })

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            id: 'rsvp-1',
            paymentStatus: 'paid',
            amountCents: 25000,
            currency: 'MXN',
        })
        expect(rows[0].paidAt).toBeInstanceOf(Date)
        expect(rows[0]).not.toHaveProperty('stripeSessionId')
        expect(rows[0]).not.toHaveProperty('stripePaymentIntentId')
    })

    it('a courtesy-confirmed row with no matching rsvp_payments row (LATERAL join found nothing) maps every payment field to null, not undefined/absent', async () => {
        mocks.execute.mockResolvedValue({
            rows: [rawFreeRsvpRow({
                payment_status: null,
                paid_at: null,
                amount_cents: null,
                currency: null,
            })],
        })

        const { getRSVPsByEvent } = await import('@/lib/queries')
        const rows = await getRSVPsByEvent('fiesta', { includePayments: true })

        expect(rows[0]).toMatchObject({
            paymentStatus: null,
            paidAt: null,
            amountCents: null,
            currency: null,
        })
    })
})

describe('lib/rsvp-list.ts — ISSUE-013 payment filter and collected-amount aggregation (pure)', () => {
    it('centavos → mayores: formats amount_cents as a grouped, two-decimal amount with the currency code', async () => {
        const { formatCentsAsCurrency } = await import('@/lib/rsvp-list')

        expect(formatCentsAsCurrency(25000, 'MXN')).toBe('$250.00 MXN')
        expect(formatCentsAsCurrency(100050, 'MXN')).toBe('$1,000.50 MXN')
        expect(formatCentsAsCurrency(99, 'USD')).toBe('$0.99 USD')
        expect(formatCentsAsCurrency(0, 'MXN')).toBe('$0.00 MXN')
    })

    it('filterAndSortRsvps: filters by paymentStatus, and leaves every row untouched when omitted or "all" (backward compatible)', async () => {
        const { filterAndSortRsvps } = await import('@/lib/rsvp-list')
        const rsvps = [
            { id: '1', name: 'A', email: 'a@x.com', phone: '1', plusOne: false, createdAt: '2026-08-01T00:00:00Z', status: 'confirmed' as const, paymentStatus: 'paid' as const },
            { id: '2', name: 'B', email: 'b@x.com', phone: '2', plusOne: false, createdAt: '2026-08-02T00:00:00Z', status: 'pending_payment' as const, paymentStatus: 'created' as const },
            { id: '3', name: 'C', email: 'c@x.com', phone: '3', plusOne: false, createdAt: '2026-08-03T00:00:00Z', status: 'expired' as const, paymentStatus: 'expired' as const },
        ]
        const baseOptions = { searchTerm: '', status: 'all' as const, plusOne: 'all' as const, email: 'all' as const, sort: 'name-asc' as const }

        expect(filterAndSortRsvps(rsvps, { ...baseOptions, paymentStatus: 'paid' }).map(r => r.id)).toEqual(['1'])
        expect(filterAndSortRsvps(rsvps, { ...baseOptions, paymentStatus: 'all' }).map(r => r.id)).toEqual(['1', '2', '3'])
        expect(filterAndSortRsvps(rsvps, baseOptions).map(r => r.id)).toEqual(['1', '2', '3'])
    })

    it('buildRsvpListView: aggregates paidPaymentsCount and amountCollectedByCurrency ONLY from paid rows, grouped by currency, within the current filtered set', async () => {
        const { buildRsvpListView } = await import('@/lib/rsvp-list')
        const rsvps = [
            { id: '1', name: 'A', email: 'a@x.com', phone: '1', plusOne: false, createdAt: '2026-08-01T00:00:00Z', status: 'confirmed' as const, paymentStatus: 'paid' as const, amountCents: 25000, currency: 'MXN' },
            { id: '2', name: 'B', email: 'b@x.com', phone: '2', plusOne: false, createdAt: '2026-08-02T00:00:00Z', status: 'confirmed' as const, paymentStatus: 'paid' as const, amountCents: 15000, currency: 'MXN' },
            { id: '3', name: 'C', email: 'c@x.com', phone: '3', plusOne: false, createdAt: '2026-08-03T00:00:00Z', status: 'expired' as const, paymentStatus: 'expired' as const },
            { id: '4', name: 'D', email: 'd@x.com', phone: '4', plusOne: false, createdAt: '2026-08-04T00:00:00Z', status: 'confirmed' as const, paymentStatus: 'paid' as const, amountCents: 5000, currency: 'USD' },
            { id: '5', name: 'E', email: 'e@x.com', phone: '5', plusOne: false, createdAt: '2026-08-05T00:00:00Z', status: 'cancelled' as const },
        ]
        const view = buildRsvpListView(rsvps, {
            searchTerm: '', status: 'all', plusOne: 'all', email: 'all', sort: 'name-asc', page: 1, pageSize: 25,
        })

        expect(view.paidPaymentsCount).toBe(3)
        expect(view.amountCollectedByCurrency).toEqual({ MXN: 40000, USD: 5000 })
    })

    it('buildRsvpListView: a free-event shape (no paymentStatus on any row) never counts a payment', async () => {
        const { buildRsvpListView } = await import('@/lib/rsvp-list')
        const rsvps = [
            { id: '1', name: 'A', email: 'a@x.com', phone: '1', plusOne: false, createdAt: '2026-08-01T00:00:00Z', status: 'confirmed' as const },
        ]
        const view = buildRsvpListView(rsvps, {
            searchTerm: '', status: 'all', plusOne: 'all', email: 'all', sort: 'name-asc', page: 1, pageSize: 25,
        })

        expect(view.paidPaymentsCount).toBe(0)
        expect(view.amountCollectedByCurrency).toEqual({})
    })

    it('describePaymentsCollected: "N pagados · $X,XXX MXN recaudados", multi-currency joined with " + "', async () => {
        const { describePaymentsCollected } = await import('@/lib/rsvp-list')

        expect(describePaymentsCollected(3, { MXN: 40000 })).toBe('3 pagados · $400.00 MXN recaudados')
        expect(describePaymentsCollected(0, {})).toBe('0 pagados · $0.00 MXN recaudados')
        expect(describePaymentsCollected(4, { MXN: 40000, USD: 5000 })).toBe('4 pagados · $400.00 MXN + $50.00 USD recaudados')
    })

    it('describeRsvpListView: appends "Pago: <label>" only when paymentStatus is set and not "all" — omitted keeps the pre-ISSUE-013 sentence byte-for-byte', async () => {
        const { describeRsvpListView } = await import('@/lib/rsvp-list')
        const baseOptions = { searchTerm: '', status: 'all' as const, plusOne: 'all' as const, email: 'all' as const, sort: 'name-asc' as const }

        expect(describeRsvpListView(baseOptions)).toBe(
            'Búsqueda: ninguna · Estado: Todos · Acompañante: Todos · Email: Todos · Orden: Nombre A–Z',
        )
        expect(describeRsvpListView({ ...baseOptions, paymentStatus: 'all' })).toBe(
            'Búsqueda: ninguna · Estado: Todos · Acompañante: Todos · Email: Todos · Orden: Nombre A–Z',
        )
        expect(describeRsvpListView({ ...baseOptions, paymentStatus: 'paid' })).toBe(
            'Búsqueda: ninguna · Estado: Todos · Acompañante: Todos · Email: Todos · Orden: Nombre A–Z · Pago: Pagado',
        )
    })
})

describe('UI wiring — ISSUE-013 (source contracts, same style as tests/admin-refinement-ui.test.ts)', () => {
    it('RsvpTable only renders the payment column/badges when showPayment is true, and flags PAYMENT_WITHOUT_SEAT', () => {
        const table = read('app/admin/components/table/RsvpTable.tsx')

        expect(table).toContain('showPayment: boolean')
        expect(table).toContain('{showPayment && <th scope="col">Pago</th>}')
        expect(table).toContain('isPaymentWithoutSeat')
        expect(table).toContain('Pagó sin lugar — requiere reembolso manual en Stripe')
        expect(table).toContain("rsvp.status === 'expired' || rsvp.status === 'cancelled'")
    })

    it('RsvpFilters only renders the payment filter select when showPaymentFilter is true', () => {
        const filters = read('app/admin/components/table/RsvpFilters.tsx')

        expect(filters).toContain('showPaymentFilter: boolean')
        expect(filters).toContain('{showPaymentFilter && (')
        expect(filters).toContain('aria-label="Filtrar por estado de pago"')
    })

    it('app/admin/page.tsx gates every payment surface (table column, filter, exports, aggregate) behind configForm.paymentRequired', () => {
        const page = read('app/admin/page.tsx')

        expect(page).toContain('showPayment={configForm.paymentRequired}')
        expect(page).toContain('showPaymentFilter={configForm.paymentRequired}')
        expect(page).toContain('const showPaymentColumns = configForm.paymentRequired')
        expect((page.match(/showPayment=\{configForm\.paymentRequired\}/g) ?? []).length).toBe(5)
    })

    it('the PDF export never emits a raw payment-status label without stripEmojis (jsPDF has no Unicode/emoji support)', () => {
        const page = read('app/admin/page.tsx')
        const pdfFnStart = page.indexOf('const exportInformativeList = ()')
        const excelFnStart = page.indexOf('const exportExcelList = ()')
        const pdfFn = page.slice(pdfFnStart, excelFnStart)

        expect(pdfFn).toContain("stripEmojis(rsvpPaymentStatusLabel(rsvp.paymentStatus))")
        expect(pdfFn).toContain('stripEmojis(formatCentsAsCurrency(rsvp.amountCents, rsvp.currency))')
        expect(pdfFn).toContain("'Estado de pago', 'Monto', 'Fecha de pago'")
    })

    it('the Excel export adds the same three payment columns, conditionally, without stripEmojis (XLSX handles Unicode natively)', () => {
        const page = read('app/admin/page.tsx')
        const excelFnStart = page.indexOf('const exportExcelList = ()')
        const excelFn = page.slice(excelFnStart)

        expect(excelFn).toContain("['Estado de pago', 'Monto', 'Fecha de pago']")
        expect(excelFn).toContain('rsvpPaymentStatusLabel(rsvp.paymentStatus)')
        expect(excelFn).toContain('formatCentsAsCurrency(rsvp.amountCents, rsvp.currency)')
    })
})
