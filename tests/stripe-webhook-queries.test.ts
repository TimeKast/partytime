/**
 * ISSUE-012 (EPIC-004) — query-layer acceptance criteria for the Stripe
 * webhook's mutations: `fulfillPaidRsvp`, `expireRsvpPaymentBySessionId`, and
 * `markRsvpPaymentRefunded` in lib/queries.ts. Mocks `@/lib/db` and runs the
 * REAL lib/queries.ts (same mocking pattern as tests/stripe-checkout.test.ts's
 * query-layer half) — split from tests/stripe-webhook.test.ts's route-level
 * tests (which mock `@/lib/queries` wholesale and use the REAL
 * `@/lib/stripe` signature verification) because a whole-module
 * `vi.mock('@/lib/queries', ...)` and a real, `@/lib/db`-backed
 * `lib/queries.ts` cannot coexist in one file — the exact same reason
 * tests/rsvp-payment-route.test.ts and tests/stripe-checkout.test.ts are two
 * files for ISSUE-011.
 *
 * These tests are the ones that actually prove the Gherkin edge cases: the
 * idempotency condition baked into the CTE's WHERE clause, the CAPACITY_FULL
 * fallback (dinero cobrado, sin asiento → PAYMENT_WITHOUT_SEAT), and the
 * `pending_payment` + `expired` re-confirmation branch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { executeMock, updateMock } = vi.hoisted(() => ({
    executeMock: vi.fn(),
    updateMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
    db: { execute: executeMock, select: vi.fn(), insert: vi.fn(), update: updateMock },
    rsvps: {},
    events: {},
    appSettings: {},
    rsvpInvitationLinks: {},
    rsvpPayments: {},
}))

import {
    RSVP_PAYMENT_STATUS,
    RSVP_STATUS,
    expireRsvpPaymentBySessionId,
    fulfillPaidRsvp,
    markRsvpPaymentRefunded,
} from '@/lib/queries'

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
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
        verified_at: '2026-08-17T00:05:00.000Z',
        verification_token_hash: null,
        verification_expires_at: null,
        ...overrides,
    }
}

function capacityFullError() {
    return Object.assign(new Error('Failed query'), {
        cause: Object.assign(new Error('CAPACITY_FULL'), { code: 'P0001' }),
    })
}

describe('fulfillPaidRsvp (ISSUE-012)', () => {
    beforeEach(() => executeMock.mockReset())

    // Given un checkout.session.completed con firma válida y pago 'created'
    // Then en UNA sentencia el pago queda paid y el RSVP confirmed+verified
    it('one statement: marks the payment paid AND confirms the RSVP (pending_payment -> confirmed)', async () => {
        executeMock.mockResolvedValueOnce({
            rows: [{
                payment_id: 'pay-1',
                payment_rsvp_id: 'rsvp-1',
                ...rawRsvpRow({ status: RSVP_STATUS.CONFIRMED }),
            }],
        })

        const result = await fulfillPaidRsvp('cs_test_1', 'pi_test_1')

        expect(result.outcome).toBe('confirmed')
        expect(result.rsvp).toMatchObject({ id: 'rsvp-1', status: RSVP_STATUS.CONFIRMED })
        expect(executeMock).toHaveBeenCalledTimes(1)

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('paid_payment AS')
        expect(statement).toContain('confirmed_rsvp AS')
        // The idempotency condition IS the status guard on the payment row.
        expect(statement).toContain(RSVP_PAYMENT_STATUS.CREATED)
        // Both branches — still pending, or already lazily expired — are
        // eligible for re-confirmation when the payment lands.
        expect(statement).toContain(RSVP_STATUS.PENDING_PAYMENT)
        expect(statement).toContain(RSVP_STATUS.EXPIRED)
    })

    // Given el pago se completa cuando la fila ya estaba expired y AÚN hay
    // asiento / Then el RSVP se re-confirma y el pago queda paid
    it('re-confirms an RSVP whose row had already lazily expired, as long as the seat is still available', async () => {
        // The mocked row shape is identical to the pending_payment case above
        // — the distinguishing behavior is that the CTE's WHERE clause
        // includes 'expired', asserted above; this pins the outcome contract
        // for that branch specifically.
        executeMock.mockResolvedValueOnce({
            rows: [{
                payment_id: 'pay-1',
                payment_rsvp_id: 'rsvp-1',
                ...rawRsvpRow({ status: RSVP_STATUS.CONFIRMED, verified_at: '2026-08-17T00:10:00.000Z' }),
            }],
        })

        const result = await fulfillPaidRsvp('cs_test_1', 'pi_test_1')

        expect(result.outcome).toBe('confirmed')
        expect(result.rsvp?.status).toBe(RSVP_STATUS.CONFIRMED)
        expect(result.rsvp?.verifiedAt).toBeInstanceOf(Date)
    })

    // Given el mismo evento re-entregado por Stripe (replay)
    // Then responde 200 sin re-mutar
    it('a replay (payment already paid) matches zero rows in the payment CTE and no-ops', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })

        const result = await fulfillPaidRsvp('cs_test_1', 'pi_test_1')

        expect(result).toEqual({ outcome: 'replay', rsvp: null })
    })

    // Given dos webhooks concurrentes del mismo session_id
    // Then exactamente uno muta (condición de status en la CTE)
    it('two concurrent deliveries of the same session_id: exactly one mutates, the other replays', async () => {
        executeMock
            .mockResolvedValueOnce({
                rows: [{
                    payment_id: 'pay-1',
                    payment_rsvp_id: 'rsvp-1',
                    ...rawRsvpRow({ status: RSVP_STATUS.CONFIRMED }),
                }],
            })
            .mockResolvedValueOnce({ rows: [] })

        const [first, second] = await Promise.all([
            fulfillPaidRsvp('cs_test_1', 'pi_test_1'),
            fulfillPaidRsvp('cs_test_1', 'pi_test_1'),
        ])

        expect(executeMock).toHaveBeenCalledTimes(2)
        const outcomes = [first.outcome, second.outcome].sort()
        expect(outcomes).toEqual(['confirmed', 'replay'])
    })

    it('payment succeeds but the rsvp no longer matches (e.g. cancelled mid-payment): PAYMENT_WITHOUT_SEAT, payment stays paid, logged without PII', async () => {
        // LEFT JOIN with no confirmed_rsvp match: the joined row carries the
        // payment ids but every rsvps.* column (aliased down to `id` here)
        // comes back NULL.
        executeMock.mockResolvedValueOnce({
            rows: [{ payment_id: 'pay-1', payment_rsvp_id: 'rsvp-1', id: null }],
        })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const result = await fulfillPaidRsvp('cs_test_1', 'pi_test_1')

        expect(result).toEqual({ outcome: 'payment_without_seat', rsvp: null })
        expect(errorSpy).toHaveBeenCalledTimes(1)
        const logged = JSON.parse(errorSpy.mock.calls[0][0] as string)
        expect(logged).toEqual({ event: 'PAYMENT_WITHOUT_SEAT', rsvpId: 'rsvp-1', stripeSessionId: 'cs_test_1' })
        expect(Object.keys(logged)).toEqual(['event', 'rsvpId', 'stripeSessionId']) // no email/name/session object
        errorSpy.mockRestore()
    })

    // Given el pago se completa cuando ya NO hay asiento
    // Then el pago queda paid, el RSVP no se confirma, y se loggea PAYMENT_WITHOUT_SEAT
    it('capacity trigger aborts the whole statement: a fallback statement re-marks ONLY the payment paid, and PAYMENT_WITHOUT_SEAT is logged', async () => {
        executeMock.mockRejectedValueOnce(capacityFullError())
        executeMock.mockResolvedValueOnce({ rows: [{ id: 'pay-1', rsvp_id: 'rsvp-1' }] })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const result = await fulfillPaidRsvp('cs_test_1', 'pi_test_1')

        expect(result).toEqual({ outcome: 'payment_without_seat', rsvp: null })
        expect(executeMock).toHaveBeenCalledTimes(2)
        const fallbackStatement = sqlTextOf(executeMock.mock.calls[1][0])
        // The fallback is single-table — nothing left in it for the capacity
        // trigger (which only fires on rsvps) to abort.
        expect(fallbackStatement).not.toContain('confirmed_rsvp')
        expect(fallbackStatement).toContain(RSVP_PAYMENT_STATUS.CREATED)
        const paymentWithoutSeatLog = errorSpy.mock.calls
            .map(call => call[0])
            .find(arg => typeof arg === 'string' && arg.includes('PAYMENT_WITHOUT_SEAT'))
        expect(paymentWithoutSeatLog).toBeDefined()
        expect(JSON.parse(paymentWithoutSeatLog as string)).toEqual({
            event: 'PAYMENT_WITHOUT_SEAT', rsvpId: 'rsvp-1', stripeSessionId: 'cs_test_1',
        })
        errorSpy.mockRestore()
    })

    it('the capacity-full fallback itself matching zero rows (lost a race to another delivery) replays instead of double-logging', async () => {
        executeMock.mockRejectedValueOnce(capacityFullError())
        executeMock.mockResolvedValueOnce({ rows: [] })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const result = await fulfillPaidRsvp('cs_test_1', 'pi_test_1')

        expect(result).toEqual({ outcome: 'replay', rsvp: null })
        expect(errorSpy).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('propagates a genuine (non-capacity) DB error, so the webhook route can 5xx and let Stripe retry', async () => {
        executeMock.mockRejectedValueOnce(new Error('connection refused'))

        await expect(fulfillPaidRsvp('cs_test_1', 'pi_test_1')).rejects.toThrow('connection refused')
        expect(executeMock).toHaveBeenCalledTimes(1) // not the deadlock-retry path, not the capacity fallback
    })
})

describe('expireRsvpPaymentBySessionId (ISSUE-012)', () => {
    beforeEach(() => executeMock.mockReset())

    // Given session.expired de un pending vigente
    // Then pago y RSVP quedan expired y el asiento se libera
    it('one statement: expires the payment, expires the RSVP, and restores its invitation link (not revoked/not expired)', async () => {
        executeMock.mockResolvedValueOnce({
            rows: [rawRsvpRow({ status: RSVP_STATUS.EXPIRED, pending_expires_at: null, verified_at: null })],
        })

        const rsvp = await expireRsvpPaymentBySessionId('cs_test_1')

        expect(rsvp).toMatchObject({ id: 'rsvp-1', status: RSVP_STATUS.EXPIRED })
        expect(executeMock).toHaveBeenCalledTimes(1)
        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('expired_payment AS')
        expect(statement).toContain('expired_rsvp AS')
        expect(statement).toContain('restored_link AS')
        expect(statement).toContain('used_at = NULL')
        expect(statement).toContain('revoked_at IS NULL')
        expect(statement).toContain(RSVP_PAYMENT_STATUS.CREATED)
        expect(statement).toContain(RSVP_STATUS.PENDING_PAYMENT)
    })

    it('a replay (payment already expired/paid) matches zero rows and no-ops', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })
        await expect(expireRsvpPaymentBySessionId('cs_test_1')).resolves.toBeNull()
    })

    it('payment expires but the rsvp already moved on (e.g. the lazy sweep beat the webhook to it): returns null', async () => {
        executeMock.mockResolvedValueOnce({ rows: [{ id: null }] })
        await expect(expireRsvpPaymentBySessionId('cs_test_1')).resolves.toBeNull()
    })
})

describe('markRsvpPaymentRefunded (ISSUE-012)', () => {
    beforeEach(() => {
        executeMock.mockReset()
        updateMock.mockReset()
    })

    // Given charge.refunded / Then UPDATE rsvp_payments ... por payment_intent,
    // NO cancela el RSVP
    it('marks a paid payment row refunded by payment_intent id, in a single UPDATE that never reaches rsvps', async () => {
        const returningMock = vi.fn(async () => [{ id: 'pay-1' }])
        const whereMock = vi.fn(() => ({ returning: returningMock }))
        updateMock.mockReturnValueOnce({ set: vi.fn(() => ({ where: whereMock })) })

        const refunded = await markRsvpPaymentRefunded('pi_test_1')

        expect(refunded).toBe(true)
        expect(updateMock).toHaveBeenCalledTimes(1)
        // No CTE/execute call at all — proof this never touches rsvps.
        expect(executeMock).not.toHaveBeenCalled()
    })

    it('a duplicate refund event (already refunded, so status != paid) matches zero rows and returns false', async () => {
        const returningMock = vi.fn(async () => [])
        const whereMock = vi.fn(() => ({ returning: returningMock }))
        updateMock.mockReturnValueOnce({ set: vi.fn(() => ({ where: whereMock })) })

        await expect(markRsvpPaymentRefunded('pi_test_1')).resolves.toBe(false)
    })
})
