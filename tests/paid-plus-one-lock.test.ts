/**
 * Monetary invariant: once an RSVP has a `created` or `paid` Stripe payment,
 * neither the guest cancel-token editor nor the authenticated admin editor may
 * change the companion flag without repricing. Expired/refunded rows do not
 * lock it, and contact/name edits remain available. Query-layer atomic guard lives in
 * tests/stripe-checkout.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const PAYMENT_LOCK_MESSAGE = 'No puedes cambiar el acompañante mientras hay un pago en curso o completado'

const mocks = vi.hoisted(() => ({
    getRSVPById: vi.fn(),
    getEventBySlug: vi.fn(),
    hasRsvpPaymentLockingPartySize: vi.fn(),
    updateRSVP: vi.fn(),
    validateCancelToken: vi.fn(),
    isSeatAddingChange: vi.fn(),
    cookies: vi.fn(),
    validateSession: vi.fn(),
    userHasEventAccess: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
    getRSVPById: mocks.getRSVPById,
    getEventBySlug: mocks.getEventBySlug,
    hasRsvpPaymentLockingPartySize: mocks.hasRsvpPaymentLockingPartySize,
    updateRSVP: mocks.updateRSVP,
    validateCancelToken: mocks.validateCancelToken,
    isSeatAddingChange: mocks.isSeatAddingChange,
    CANCEL_TOKEN_SECRET_MISSING_MESSAGE: 'CANCEL_TOKEN_SECRET is not configured',
    RSVP_PAYMENT_PARTY_SIZE_LOCKED_MESSAGE: PAYMENT_LOCK_MESSAGE,
    RSVP_STATUS: {
        CONFIRMED: 'confirmed',
        CANCELLED: 'cancelled',
        PENDING_PAYMENT: 'pending_payment',
        PENDING_VERIFICATION: 'pending_verification',
        EXPIRED: 'expired',
    },
}))

vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/lib/auth-utils', () => ({ validateSession: mocks.validateSession }))
vi.mock('@/lib/user-queries', () => ({ userHasEventAccess: mocks.userHasEventAccess }))

const currentRsvp = {
    id: 'rsvp-1',
    eventId: 'fiesta',
    name: 'Alex',
    email: 'alex@example.com',
    phone: '+525500000000',
    plusOne: false,
    plusOneName: null,
    status: 'confirmed',
}

function guestRequest(overrides: Record<string, unknown> = {}) {
    return new NextRequest('http://localhost:3000/api/rsvp/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            rsvpId: 'rsvp-1',
            token: 'valid-token',
            name: 'Alex',
            email: 'alex@example.com',
            phone: '+525500000000',
            plusOne: false,
            ...overrides,
        }),
    })
}

function adminRequest(updates: Record<string, unknown>) {
    return new NextRequest('http://localhost:3000/api/admin/update-rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rsvpId: 'rsvp-1', updates }),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRSVPById.mockResolvedValue(currentRsvp)
    mocks.hasRsvpPaymentLockingPartySize.mockResolvedValue(true)
    mocks.updateRSVP.mockResolvedValue(currentRsvp)
    mocks.validateCancelToken.mockReturnValue(true)
    mocks.isSeatAddingChange.mockReturnValue(false)
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: 'session-token' })) })
    mocks.validateSession.mockResolvedValue({ id: 'admin-1', role: 'super_admin' })
    mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true })
})

describe('POST /api/rsvp/update — payment party-size lock', () => {
    it.each(['created', 'paid'])('returns a human 409 when payment status is %s', async paymentStatus => {
        mocks.hasRsvpPaymentLockingPartySize.mockResolvedValue(
            paymentStatus === 'created' || paymentStatus === 'paid',
        )
        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(guestRequest({ plusOne: true, plusOneName: 'Sam' }))

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toMatchObject({ error: PAYMENT_LOCK_MESSAGE })
        expect(mocks.hasRsvpPaymentLockingPartySize).toHaveBeenCalledWith('rsvp-1')
        expect(mocks.updateRSVP).not.toHaveBeenCalled()
    })

    it('also blocks removing a companion after payment', async () => {
        mocks.getRSVPById.mockResolvedValue({ ...currentRsvp, plusOne: true, plusOneName: 'Sam' })

        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(guestRequest({ plusOne: false }))

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toMatchObject({ error: PAYMENT_LOCK_MESSAGE })
        expect(mocks.updateRSVP).not.toHaveBeenCalled()
    })

    it.each(['expired', 'refunded'])('allows a companion change when payment status is %s', async () => {
        mocks.hasRsvpPaymentLockingPartySize.mockResolvedValue(false)
        mocks.updateRSVP.mockResolvedValue({ ...currentRsvp, plusOne: true, plusOneName: 'Sam' })

        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(guestRequest({ plusOne: true, plusOneName: 'Sam' }))

        expect(response.status).toBe(200)
        expect(mocks.updateRSVP).toHaveBeenCalledWith(
            'rsvp-1',
            expect.objectContaining({ plusOne: true, plusOneName: 'Sam' }),
            { rejectPaymentLockedPlusOneChange: true },
        )
    })

    it('allows non-monetary edits when the paid RSVP keeps the same companion flag', async () => {
        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(guestRequest({ name: 'Alex Updated', plusOne: false }))

        expect(response.status).toBe(200)
        expect(mocks.hasRsvpPaymentLockingPartySize).not.toHaveBeenCalled()
        const [, updateData, options] = mocks.updateRSVP.mock.calls[0]
        expect(updateData).toMatchObject({ name: 'Alex Updated' })
        expect(updateData).not.toHaveProperty('plusOne')
        expect(options).toEqual({ rejectPaymentLockedPlusOneChange: false })
    })

    it('preserves a guest companion-name edit without rewriting unchanged party size', async () => {
        mocks.getRSVPById.mockResolvedValue({ ...currentRsvp, plusOne: true, plusOneName: 'Sam' })

        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(guestRequest({ plusOne: true, plusOneName: 'Taylor' }))

        expect(response.status).toBe(200)
        const [, updateData] = mocks.updateRSVP.mock.calls[0]
        expect(updateData).toMatchObject({ plusOneName: 'Taylor' })
        expect(updateData).not.toHaveProperty('plusOne')
    })

    it('maps an atomic-guard race to the same 409', async () => {
        mocks.hasRsvpPaymentLockingPartySize.mockResolvedValue(false)
        mocks.updateRSVP.mockRejectedValue(new Error(PAYMENT_LOCK_MESSAGE))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(guestRequest({ plusOne: true }))

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toMatchObject({ error: PAYMENT_LOCK_MESSAGE })
        errorSpy.mockRestore()
    })

    it('rejects a non-boolean companion value at the API boundary', async () => {
        const { POST } = await import('@/app/api/rsvp/update/route')
        const response = await POST(guestRequest({ plusOne: 'true' }))

        expect(response.status).toBe(400)
        expect(mocks.getRSVPById).not.toHaveBeenCalled()
    })
})

describe('POST /api/admin/update-rsvp — payment party-size lock', () => {
    it.each(['created', 'paid'])('returns a human 409 when payment status is %s', async paymentStatus => {
        mocks.hasRsvpPaymentLockingPartySize.mockResolvedValue(
            paymentStatus === 'created' || paymentStatus === 'paid',
        )
        const { POST } = await import('@/app/api/admin/update-rsvp/route')
        const response = await POST(adminRequest({ plusOne: true, plusOneName: 'Sam' }))

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toMatchObject({ error: PAYMENT_LOCK_MESSAGE })
        expect(mocks.hasRsvpPaymentLockingPartySize).toHaveBeenCalledWith('rsvp-1')
        expect(mocks.updateRSVP).not.toHaveBeenCalled()
    })

    it('also blocks admin from removing a companion after payment', async () => {
        mocks.getRSVPById.mockResolvedValue({ ...currentRsvp, plusOne: true, plusOneName: 'Sam' })

        const { POST } = await import('@/app/api/admin/update-rsvp/route')
        const response = await POST(adminRequest({ plusOne: false, plusOneName: null }))

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toMatchObject({ error: PAYMENT_LOCK_MESSAGE })
        expect(mocks.updateRSVP).not.toHaveBeenCalled()
    })

    it.each(['expired', 'refunded'])('allows a companion change when payment status is %s', async () => {
        mocks.hasRsvpPaymentLockingPartySize.mockResolvedValue(false)

        const { POST } = await import('@/app/api/admin/update-rsvp/route')
        const response = await POST(adminRequest({ plusOne: true, plusOneName: 'Sam' }))

        expect(response.status).toBe(200)
        expect(mocks.updateRSVP).toHaveBeenCalledWith(
            'rsvp-1',
            { plusOne: true, plusOneName: 'Sam' },
            { rejectPaymentLockedPlusOneChange: true },
        )
    })

    it('allows non-monetary admin edits on a paid RSVP', async () => {
        const { POST } = await import('@/app/api/admin/update-rsvp/route')
        const response = await POST(adminRequest({ name: 'Alex Updated', plusOne: false }))

        expect(response.status).toBe(200)
        expect(mocks.hasRsvpPaymentLockingPartySize).not.toHaveBeenCalled()
        expect(mocks.updateRSVP).toHaveBeenCalledWith(
            'rsvp-1',
            { name: 'Alex Updated' },
            { rejectPaymentLockedPlusOneChange: false },
        )
    })

    it('preserves an admin companion-name edit without rewriting unchanged party size', async () => {
        mocks.getRSVPById.mockResolvedValue({ ...currentRsvp, plusOne: true, plusOneName: 'Sam' })

        const { POST } = await import('@/app/api/admin/update-rsvp/route')
        const response = await POST(adminRequest({ plusOne: true, plusOneName: 'Taylor' }))

        expect(response.status).toBe(200)
        expect(mocks.updateRSVP).toHaveBeenCalledWith(
            'rsvp-1',
            { plusOneName: 'Taylor' },
            { rejectPaymentLockedPlusOneChange: false },
        )
    })

    it('treats an unchanged plusOne-only admin payload as a no-op', async () => {
        const { POST } = await import('@/app/api/admin/update-rsvp/route')
        const response = await POST(adminRequest({ plusOne: false }))

        expect(response.status).toBe(200)
        expect(mocks.hasRsvpPaymentLockingPartySize).not.toHaveBeenCalled()
        expect(mocks.updateRSVP).not.toHaveBeenCalled()
    })

    it('maps an atomic-guard race to the same 409', async () => {
        mocks.hasRsvpPaymentLockingPartySize.mockResolvedValue(false)
        mocks.updateRSVP.mockRejectedValue(new Error(PAYMENT_LOCK_MESSAGE))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const { POST } = await import('@/app/api/admin/update-rsvp/route')
        const response = await POST(adminRequest({ plusOne: true }))

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toMatchObject({ error: PAYMENT_LOCK_MESSAGE })
        errorSpy.mockRestore()
    })

    it('rejects a non-boolean companion value at the API boundary', async () => {
        const { POST } = await import('@/app/api/admin/update-rsvp/route')
        const response = await POST(adminRequest({ plusOne: 1 }))

        expect(response.status).toBe(400)
        expect(mocks.updateRSVP).not.toHaveBeenCalled()
    })
})
