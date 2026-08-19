/**
 * ISSUE-011 (EPIC-004) — Stripe Checkout flow: pure param builder + query
 * layer (lib/queries.ts's new pending_payment/rsvp_payments helpers and the
 * saveRsvpWithInvitation requires_payment CTE branch). Mirrors the mocking
 * pattern of tests/email-verification.test.ts (mocks @/lib/db, runs the REAL
 * lib/queries.ts, asserts on the generated SQL/drizzle calls) — route-level
 * acceptance criteria (Stripe SDK mocked, the POST/GET handlers driven end to
 * end) live in tests/rsvp-payment-route.test.ts, which mocks @/lib/queries
 * wholesale and therefore cannot share this file (see that file's header and
 * tests/email-verification.test.ts:1-12 for why).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    PENDING_PAYMENT_RSVP_TTL_MS,
    buildCheckoutSessionParams,
    isCheckoutSessionConfirmedExpired,
} from '@/lib/stripe-checkout'
import { deriveRsvpPaymentPricing } from '@/lib/payment-config'

describe('lib/stripe-checkout.ts — buildCheckoutSessionParams (pure, ISSUE-011)', () => {
    const baseInput = {
        rsvpId: 'rsvp-1',
        eventSlug: 'fiesta',
        email: 'alex@example.com',
        eventTitle: 'Fiesta de Alex',
        unitAmountCents: 25000,
        quantity: 1 as const,
        currency: 'MXN',
    }

    it('uses mode:payment with exactly one line item at the derived amount, in a lower-cased currency', () => {
        const params = buildCheckoutSessionParams(baseInput)

        expect(params.mode).toBe('payment')
        expect(params.line_items).toHaveLength(1)
        const [lineItem] = params.line_items!
        expect(lineItem.quantity).toBe(1)
        expect(lineItem.price_data).toMatchObject({
            currency: 'mxn', // Stripe requires lower-cased ISO codes
            unit_amount: 25000,
        })
        expect(lineItem.price_data!.product_data).toMatchObject({
            name: 'Reservación — Fiesta de Alex',
        })
    })

    it('keeps the per-person unit amount and sends quantity 2 for an RSVP with a companion', () => {
        const params = buildCheckoutSessionParams({ ...baseInput, quantity: 2 })

        const [lineItem] = params.line_items!
        expect(lineItem.quantity).toBe(2)
        expect(lineItem.price_data).toMatchObject({
            currency: 'mxn',
            unit_amount: 25000,
        })
    })

    it('locks the guest email as customer_email', () => {
        const params = buildCheckoutSessionParams(baseInput)
        expect(params.customer_email).toBe('alex@example.com')
    })

    it('carries rsvpId/eventSlug metadata on BOTH the session and the payment intent', () => {
        const params = buildCheckoutSessionParams(baseInput)
        expect(params.metadata).toEqual({ rsvpId: 'rsvp-1', eventSlug: 'fiesta' })
        expect(params.payment_intent_data).toEqual({ metadata: { rsvpId: 'rsvp-1', eventSlug: 'fiesta' } })
    })

    it('expires the Checkout Session ~30 minutes from now', () => {
        const before = Math.floor(Date.now() / 1000)
        const params = buildCheckoutSessionParams(baseInput)
        const after = Math.floor(Date.now() / 1000)

        expect(params.expires_at).toBeGreaterThanOrEqual(before + 30 * 60)
        expect(params.expires_at).toBeLessThanOrEqual(after + 30 * 60)
    })

    it('builds success/cancel URLs off NEXT_PUBLIC_APP_URL, with the literal Stripe template placeholder intact', () => {
        const original = process.env.NEXT_PUBLIC_APP_URL
        process.env.NEXT_PUBLIC_APP_URL = 'https://partytime.example.com'
        try {
            const params = buildCheckoutSessionParams(baseInput)
            expect(params.success_url).toBe(
                'https://partytime.example.com/fiesta/pago?state=success&session_id={CHECKOUT_SESSION_ID}',
            )
            expect(params.cancel_url).toBe('https://partytime.example.com/fiesta/pago?state=cancelled')
        } finally {
            if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL
            else process.env.NEXT_PUBLIC_APP_URL = original
        }
    })

    it('falls back to localhost when NEXT_PUBLIC_APP_URL is unset', () => {
        const original = process.env.NEXT_PUBLIC_APP_URL
        delete process.env.NEXT_PUBLIC_APP_URL
        try {
            const params = buildCheckoutSessionParams(baseInput)
            expect(params.success_url).toContain('http://localhost:3000/fiesta/pago?state=success')
        } finally {
            if (original !== undefined) process.env.NEXT_PUBLIC_APP_URL = original
        }
    })

    it('uses a 35-minute TTL for the pending_payment RSVP row — a 5-minute margin over the 30-minute Checkout Session', () => {
        expect(PENDING_PAYMENT_RSVP_TTL_MS).toBe(35 * 60 * 1000)
    })
})

describe('isCheckoutSessionConfirmedExpired — Stripe ledger reconciliation', () => {
    it('accepts only an explicitly expired and unpaid Checkout', () => {
        expect(isCheckoutSessionConfirmedExpired({ status: 'expired', payment_status: 'unpaid' })).toBe(true)
    })

    it.each([
        ['complete', 'paid'],
        ['open', 'unpaid'],
        ['expired', 'paid'],
        [null, 'unpaid'],
    ] as const)('rejects an unsafe or unverifiable %s/%s Checkout state', (status, paymentStatus) => {
        expect(isCheckoutSessionConfirmedExpired({ status, payment_status: paymentStatus })).toBe(false)
    })
})

describe('deriveRsvpPaymentPricing — per-person recovery fee', () => {
    it('charges one unit for a persisted RSVP without a companion', () => {
        expect(deriveRsvpPaymentPricing(
            { priceAmount: 250 },
            { plusOne: false },
        )).toEqual({
            unitAmountCents: 25000,
            quantity: 1,
            totalAmountCents: 25000,
        })
    })

    it('charges two units for a persisted RSVP with a companion', () => {
        expect(deriveRsvpPaymentPricing(
            { priceAmount: 250 },
            { plusOne: true },
        )).toEqual({
            unitAmountCents: 25000,
            quantity: 2,
            totalAmountCents: 50000,
        })
    })
})

const { executeMock, selectMock, insertMock, updateMock } = vi.hoisted(() => ({
    executeMock: vi.fn(),
    selectMock: vi.fn(),
    insertMock: vi.fn(),
    updateMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
    db: { execute: executeMock, select: selectMock, insert: insertMock, update: updateMock },
    rsvps: {},
    events: {},
    appSettings: {},
    rsvpInvitationLinks: {},
    rsvpPayments: {},
}))

import {
    RSVP_PAYMENT_STATUS,
    RSVP_STATUS,
    createRsvpPaymentRecord,
    expirePendingPaymentRsvp,
    expireRsvpPaymentRecord,
    getActivePaymentForRsvp,
    getRsvpPlusOneForPaymentValidation,
    getRsvpPaymentStatusBySessionId,
    hasRsvpPaymentLockingPartySize,
    RSVP_PAYMENT_PARTY_SIZE_LOCKED_MESSAGE,
    saveRSVPPendingPayment,
    saveRsvpWithInvitation,
    updateRSVP,
} from '@/lib/queries'

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

function camelRsvp(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rsvp-1',
        eventId: 'fiesta',
        name: 'Alex',
        email: 'alex@example.com',
        phone: '+525500000000',
        plusOne: false,
        plusOneName: null,
        status: RSVP_STATUS.CONFIRMED,
        emailSent: null,
        emailHistory: [],
        cancelToken: null,
        createdAt: new Date('2026-08-17T00:00:00.000Z'),
        pendingExpiresAt: null,
        verifiedAt: null,
        verificationTokenHash: null,
        verificationExpiresAt: null,
        ...overrides,
    }
}

function rawRsvpRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rsvp-1',
        event_id: 'fiesta',
        name: 'Alex',
        email: 'alex@example.com',
        phone: '+525500000000',
        plus_one: false,
        plus_one_name: null,
        status: RSVP_STATUS.CONFIRMED,
        email_sent: null,
        email_history: [],
        cancel_token: null,
        created_at: '2026-08-17T00:00:00.000Z',
        pending_expires_at: null,
        verified_at: null,
        verification_token_hash: null,
        verification_expires_at: null,
        ...overrides,
    }
}

function mockSelectOnce(rows: unknown[]) {
    selectMock.mockReturnValueOnce({
        from: vi.fn(() => ({
            where: vi.fn(() => ({
                limit: vi.fn(async () => rows),
            })),
        })),
    })
}

function mockInsertReturning(rows: unknown[]) {
    insertMock.mockReturnValueOnce({
        values: vi.fn(() => ({
            returning: vi.fn(async () => rows),
        })),
    })
}

function mockUpdateReturning(rows: unknown[]) {
    updateMock.mockReturnValueOnce({
        set: vi.fn(() => ({
            where: vi.fn(() => ({
                returning: vi.fn(async () => rows),
            })),
        })),
    })
}

const pendingExpiresAt = new Date('2026-08-17T00:35:00.000Z')

describe('saveRSVPPendingPayment (ISSUE-011, public flow)', () => {
    beforeEach(() => {
        executeMock.mockReset()
        selectMock.mockReset()
        insertMock.mockReset()
        updateMock.mockReset()
    })

    it('inserts a fresh row as pending_payment with the given TTL', async () => {
        mockSelectOnce([])
        mockInsertReturning([camelRsvp({
            status: RSVP_STATUS.PENDING_PAYMENT,
            pendingExpiresAt,
        })])

        const rsvp = await saveRSVPPendingPayment({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, pendingExpiresAt)

        expect(rsvp.status).toBe(RSVP_STATUS.PENDING_PAYMENT)
        expect(rsvp.pendingExpiresAt).toEqual(pendingExpiresAt)
        const insertedValues = (insertMock.mock.results[0]!.value.values as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(insertedValues).toMatchObject({ status: RSVP_STATUS.PENDING_PAYMENT, pendingExpiresAt })
    })

    // ISSUE-011 Gherkin: "el mismo email reintenta mientras su pending sigue
    // vivo / Then se reutiliza la fila ... solo hay una sesión activa" — at
    // the query layer this is "the SAME row id comes back, status unchanged,
    // TTL refreshed", regardless of what the route does with Stripe next.
    it('reuses an existing pending_payment row in place, refreshing its TTL (no new row, no duplicate error)', async () => {
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.PENDING_PAYMENT, pendingExpiresAt: new Date('2026-08-17T00:10:00.000Z') })])
        const refreshedExpiry = new Date('2026-08-17T01:00:00.000Z')
        mockUpdateReturning([camelRsvp({ status: RSVP_STATUS.PENDING_PAYMENT, pendingExpiresAt: refreshedExpiry })])

        const rsvp = await saveRSVPPendingPayment({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, refreshedExpiry)

        expect(rsvp.id).toBe('rsvp-1')
        expect(rsvp.status).toBe(RSVP_STATUS.PENDING_PAYMENT)
        expect(rsvp.pendingExpiresAt).toEqual(refreshedExpiry)
        expect(insertMock).not.toHaveBeenCalled()
        expect(executeMock).not.toHaveBeenCalled()
    })

    it('rejects changing plusOne when reusing an already-pending_payment row', async () => {
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.PENDING_PAYMENT, plusOne: false })])

        await expect(saveRSVPPendingPayment({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: true, plusOneName: 'Sam', eventId: 'fiesta',
        }, pendingExpiresAt)).rejects.toThrow(RSVP_PAYMENT_PARTY_SIZE_LOCKED_MESSAGE)

        expect(updateMock).not.toHaveBeenCalled()
        expect(insertMock).not.toHaveBeenCalled()
    })

    it('allows a different plusOne after the prior pending row has expired', async () => {
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.EXPIRED, plusOne: false })])
        mockUpdateReturning([camelRsvp({
            status: RSVP_STATUS.PENDING_PAYMENT,
            plusOne: true,
            plusOneName: 'Sam',
            pendingExpiresAt,
        })])

        const rsvp = await saveRSVPPendingPayment({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: true, plusOneName: 'Sam', eventId: 'fiesta',
        }, pendingExpiresAt)

        expect(rsvp).toMatchObject({ status: RSVP_STATUS.PENDING_PAYMENT, plusOne: true })
        const updateArgs = (updateMock.mock.results[0]!.value.set as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(updateArgs).toMatchObject({ plusOne: true, plusOneName: 'Sam' })
    })

    it.each([RSVP_STATUS.CANCELLED, RSVP_STATUS.EXPIRED, RSVP_STATUS.PENDING_VERIFICATION])(
        'reactivates an existing %s row into pending_payment on re-submit, clearing any stray verification state',
        async previousStatus => {
            mockSelectOnce([camelRsvp({
                status: previousStatus,
                verificationTokenHash: 'a'.repeat(64),
                verificationExpiresAt: new Date('2026-08-19T00:00:00.000Z'),
            })])
            mockUpdateReturning([camelRsvp({ status: RSVP_STATUS.PENDING_PAYMENT, pendingExpiresAt })])

            const rsvp = await saveRSVPPendingPayment({
                name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
                plusOne: false, eventId: 'fiesta',
            }, pendingExpiresAt)

            expect(rsvp.status).toBe(RSVP_STATUS.PENDING_PAYMENT)
            const updateArgs = (updateMock.mock.results[0]!.value.set as ReturnType<typeof vi.fn>).mock.calls[0][0]
            // Payment supersedes verification (PLAN §2): a row moving into
            // pending_payment never carries a stray verification token.
            expect(updateArgs.verificationTokenHash).toBeNull()
            expect(updateArgs.verificationExpiresAt).toBeNull()
            expect(insertMock).not.toHaveBeenCalled()
        },
    )

    it('rejects a duplicate when the existing row is already confirmed (dedupe, same as the free flow)', async () => {
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.CONFIRMED })])

        await expect(saveRSVPPendingPayment({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, pendingExpiresAt)).rejects.toThrow('Ya existe un RSVP con este email para este evento')

        expect(updateMock).not.toHaveBeenCalled()
        expect(insertMock).not.toHaveBeenCalled()
    })

    it('two concurrent re-submits: the loser (predicate no longer matches) is treated as a duplicate', async () => {
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.PENDING_PAYMENT })])
        mockUpdateReturning([]) // optimistic predicate lost the race — 0 rows

        await expect(saveRSVPPendingPayment({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, pendingExpiresAt)).rejects.toThrow('Ya existe un RSVP con este email para este evento')
    })

    it('translates a capacity-trigger abort into the shared CAPACITY_FULL message', async () => {
        mockSelectOnce([])
        insertMock.mockReturnValueOnce({
            values: vi.fn(() => ({
                returning: vi.fn(async () => {
                    throw Object.assign(new Error('Failed query'), {
                        cause: Object.assign(new Error('CAPACITY_FULL'), { code: 'P0001' }),
                    })
                }),
            })),
        })

        await expect(saveRSVPPendingPayment({
            name: 'Alex', email: 'alex@example.com', phone: '+525500000000',
            plusOne: false, eventId: 'fiesta',
        }, pendingExpiresAt)).rejects.toThrow('El evento ha alcanzado su capacidad máxima')
    })
})

describe('expirePendingPaymentRsvp (ISSUE-011)', () => {
    beforeEach(() => executeMock.mockReset())

    it('flips a pending_payment row to expired and restores its invitation link, if any, in one statement', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.EXPIRED, pending_expires_at: null })] })

        const rsvp = await expirePendingPaymentRsvp('rsvp-1')

        expect(rsvp).toMatchObject({ id: 'rsvp-1', status: RSVP_STATUS.EXPIRED })
        expect(executeMock).toHaveBeenCalledTimes(1)
        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('expired_rsvp AS')
        expect(statement).toContain(RSVP_STATUS.PENDING_PAYMENT)
        expect(statement).toContain('restored_link AS')
        expect(statement).toContain('used_at = NULL')
        expect(statement).toContain('revoked_at IS NULL')
    })

    it('returns null (never mutates) when the row is not a live pending_payment row', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })
        await expect(expirePendingPaymentRsvp('rsvp-1')).resolves.toBeNull()
    })
})

describe('rsvp_payments row helpers (ISSUE-011)', () => {
    beforeEach(() => {
        executeMock.mockReset()
        selectMock.mockReset()
        insertMock.mockReset()
        updateMock.mockReset()
    })

    it('getActivePaymentForRsvp returns the most recent still-created row for that RSVP', async () => {
        selectMock.mockReturnValueOnce({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn(() => ({
                        limit: vi.fn(async () => [{ id: 'pay-1', rsvpId: 'rsvp-1', status: RSVP_PAYMENT_STATUS.CREATED, stripeSessionId: 'cs_old' }]),
                    })),
                })),
            })),
        })

        const payment = await getActivePaymentForRsvp('rsvp-1')
        expect(payment).toMatchObject({ id: 'pay-1', stripeSessionId: 'cs_old' })
    })

    it('getActivePaymentForRsvp returns null when there is none', async () => {
        selectMock.mockReturnValueOnce({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn(() => ({
                        limit: vi.fn(async () => []),
                    })),
                })),
            })),
        })

        await expect(getActivePaymentForRsvp('rsvp-1')).resolves.toBeNull()
    })

    it('expireRsvpPaymentRecord flips only a still-created row (idempotent guard for the future webhook)', async () => {
        const whereMock = vi.fn(async () => undefined)
        updateMock.mockReturnValueOnce({ set: vi.fn(() => ({ where: whereMock })) })

        await expireRsvpPaymentRecord('pay-1')

        expect(updateMock).toHaveBeenCalledTimes(1)
        expect(whereMock).toHaveBeenCalledTimes(1)
    })

    it('createRsvpPaymentRecord inserts a created row with the exact amount/currency passed in', async () => {
        mockInsertReturning([{
            id: 'pay-2', rsvpId: 'rsvp-1', eventId: 'fiesta', stripeSessionId: 'cs_new',
            amountCents: 25000, currency: 'MXN', status: RSVP_PAYMENT_STATUS.CREATED,
        }])

        const payment = await createRsvpPaymentRecord({
            rsvpId: 'rsvp-1', eventId: 'fiesta', stripeSessionId: 'cs_new', amountCents: 25000, currency: 'MXN',
        })

        expect(payment).toMatchObject({ stripeSessionId: 'cs_new', amountCents: 25000, currency: 'MXN' })
        const insertedValues = (insertMock.mock.results[0]!.value.values as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(insertedValues.status).toBe(RSVP_PAYMENT_STATUS.CREATED)
    })

    it('reads plusOne with FOR SHARE after insert so a concurrent RSVP UPDATE must finish first', async () => {
        executeMock.mockResolvedValueOnce({ rows: [{ plus_one: true }] })

        await expect(getRsvpPlusOneForPaymentValidation('rsvp-1')).resolves.toBe(true)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('SELECT plus_one')
        expect(statement).toContain('FROM rsvps')
        expect(statement).toContain('FOR SHARE')
        expect(statement).not.toContain('email')
        expect(statement).not.toContain('stripe_session_id')
    })

    it('returns null when the locked RSVP row no longer exists', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })
        await expect(getRsvpPlusOneForPaymentValidation('missing')).resolves.toBeNull()
    })

    it('hasRsvpPaymentLockingPartySize projects only created/paid existence', async () => {
        executeMock
            .mockResolvedValueOnce({ rows: [{ locks_party_size: true }] })
            .mockResolvedValueOnce({ rows: [{ locks_party_size: false }] })

        await expect(hasRsvpPaymentLockingPartySize('rsvp-1')).resolves.toBe(true)
        await expect(hasRsvpPaymentLockingPartySize('rsvp-2')).resolves.toBe(false)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('SELECT EXISTS')
        expect(statement).toContain(RSVP_PAYMENT_STATUS.CREATED)
        expect(statement).toContain(RSVP_PAYMENT_STATUS.PAID)
        expect(statement).not.toContain(RSVP_PAYMENT_STATUS.EXPIRED)
        expect(statement).not.toContain(RSVP_PAYMENT_STATUS.REFUNDED)
        expect(statement).not.toContain('stripe_session_id')
    })

    it('updateRSVP atomically rejects plusOne writes for pending_payment or created/paid payment rows', async () => {
        let capturedPredicate: unknown
        updateMock.mockReturnValueOnce({
            set: vi.fn(() => ({
                where: vi.fn((predicate: unknown) => {
                    capturedPredicate = predicate
                    return { returning: vi.fn(async () => []) }
                }),
            })),
        })
        mockSelectOnce([camelRsvp({ status: RSVP_STATUS.PENDING_PAYMENT, plusOne: false })])

        await expect(updateRSVP(
            'rsvp-1',
            { plusOne: true },
            { rejectPaymentLockedPlusOneChange: true },
        )).rejects.toThrow(RSVP_PAYMENT_PARTY_SIZE_LOCKED_MESSAGE)

        const predicate = sqlTextOf(capturedPredicate)
        expect(predicate).toContain(RSVP_STATUS.PENDING_PAYMENT)
        expect(predicate).toContain('NOT EXISTS')
        expect(predicate).toContain('rsvp_payments')
        expect(predicate).toContain(RSVP_PAYMENT_STATUS.CREATED)
        expect(predicate).toContain(RSVP_PAYMENT_STATUS.PAID)
        expect(predicate).not.toContain(RSVP_PAYMENT_STATUS.EXPIRED)
        expect(predicate).not.toContain(RSVP_PAYMENT_STATUS.REFUNDED)
    })

    it('getRsvpPaymentStatusBySessionId returns ONLY the status field — no PII, no rsvp id', async () => {
        const fieldsMock = vi.fn()
        selectMock.mockImplementationOnce((fields: unknown) => {
            fieldsMock(fields)
            return {
                from: vi.fn(() => ({
                    where: vi.fn(() => ({
                        limit: vi.fn(async () => [{ status: RSVP_PAYMENT_STATUS.PAID }]),
                    })),
                })),
            }
        })

        const status = await getRsvpPaymentStatusBySessionId('cs_test123')

        expect(status).toBe(RSVP_PAYMENT_STATUS.PAID)
        // The drizzle projection object passed to db.select() has exactly one key.
        expect(Object.keys(fieldsMock.mock.calls[0][0])).toEqual(['status'])
    })

    it('getRsvpPaymentStatusBySessionId returns null for an unknown session id', async () => {
        selectMock.mockReturnValueOnce({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    limit: vi.fn(async () => []),
                })),
            })),
        })

        await expect(getRsvpPaymentStatusBySessionId('cs_unknown')).resolves.toBeNull()
    })
})

describe('saveRsvpWithInvitation — requires_payment supersedes requires_verification (ISSUE-011)', () => {
    beforeEach(() => executeMock.mockReset())

    const baseInput = {
        tokenHash: 'a'.repeat(64),
        eventId: 'fiesta',
        name: 'Alex',
        email: 'alex@example.com',
        phone: '+525500000000',
        plusOne: false,
        plusOneName: null,
        verificationCandidate: { tokenHash: 'b'.repeat(64), expiresAt: new Date('2026-08-18T00:00:00.000Z') },
        paymentCandidate: { expiresAt: pendingExpiresAt },
    }

    it('computes requires_payment fresh from payment_required AND NOT is_courtesy, and requires_verification excludes it', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.PENDING_PAYMENT })] })

        await saveRsvpWithInvitation(baseInput)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('invitation_event.payment_required AND NOT candidate.is_courtesy')
        expect(statement).toContain('AS requires_payment')
        expect(statement).toContain('NOT (invitation_event.payment_required AND NOT candidate.is_courtesy)')
        expect(statement.match(/requires_payment/g)!.length).toBeGreaterThanOrEqual(4)
    })

    it('returns a pending_payment row as-is when the CTE decided requires_payment (is_courtesy=false path)', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({
            status: RSVP_STATUS.PENDING_PAYMENT,
            pending_expires_at: pendingExpiresAt.toISOString(),
            verification_token_hash: null,
        })] })

        const rsvp = await saveRsvpWithInvitation(baseInput)

        expect(rsvp).toMatchObject({ status: RSVP_STATUS.PENDING_PAYMENT })
        expect(rsvp!.verificationTokenHash).toBeNull()
        expect(rsvp!.pendingExpiresAt).toEqual(pendingExpiresAt)
    })

    it('a courtesy link (default is_courtesy=true) on a paid event still bypasses straight to confirmed', async () => {
        executeMock.mockResolvedValueOnce({ rows: [rawRsvpRow({ status: RSVP_STATUS.CONFIRMED })] })

        const rsvp = await saveRsvpWithInvitation(baseInput)

        expect(rsvp).toMatchObject({ status: RSVP_STATUS.CONFIRMED })
        // is_courtesy defaults true at the schema level (rsvp_invitation_links
        // DEFAULT true) — this only pins that the CTE's status/pending_expires_at
        // CASE chain checks requires_payment FIRST, so a bypass is possible at all.
        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement.indexOf('requires_payment')).toBeLessThan(statement.lastIndexOf('requires_verification'))
    })
})
