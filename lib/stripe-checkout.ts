import type Stripe from 'stripe'
import type { RsvpPaymentQuantity } from '@/lib/payment-config'

/**
 * ISSUE-011 (EPIC-004): the Stripe Checkout session itself always expires 30
 * minutes after creation (`expires_at` below — Stripe's own minimum). The
 * `rsvps.pending_expires_at` TTL for a `pending_payment` row is 35 minutes —
 * a 5-minute margin so the lazy sweep (`expireStalePendingRsvps`) never races
 * a still-open Checkout session closed (PLAN-EPICS-002-005.md §3.1).
 */
export const PENDING_PAYMENT_RSVP_TTL_MS = 35 * 60 * 1000
const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60

export interface CheckoutSessionInput {
    rsvpId: string
    eventSlug: string
    email: string
    eventTitle: string
    /** Per-person recovery fee; the caller persists unit × quantity as total. */
    unitAmountCents: number
    /** One RSVP owner, plus one companion when present on the persisted RSVP. */
    quantity: RsvpPaymentQuantity
    /** Whitelisted, stored casing (e.g. 'MXN') — lower-cased below for Stripe. */
    currency: string
}

/**
 * A Checkout may be superseded only after Stripe itself proves that the
 * session is expired and unpaid. `status = expired` alone is not enough for
 * ledger safety if an unexpected/partial response says money was collected;
 * the webhook remains the only authority allowed to turn our row `paid`.
 */
export function isCheckoutSessionConfirmedExpired(
    session: Pick<Stripe.Checkout.Session, 'status' | 'payment_status'>,
): boolean {
    return session.status === 'expired' && session.payment_status === 'unpaid'
}

/**
 * Pure builder for `stripe.checkout.sessions.create`'s params — no Stripe SDK
 * or DB access here, so the shape (amount/currency/email/metadata/urls) is
 * unit-testable without mocking either (tests/stripe-checkout.test.ts).
 */
export function buildCheckoutSessionParams(input: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    // ISSUE-011: metadata carried on both the session AND the payment intent —
    // the webhook (ISSUE-012) needs rsvpId/eventSlug regardless of which
    // object it reads first.
    const metadata = { rsvpId: input.rsvpId, eventSlug: input.eventSlug }

    return {
        mode: 'payment',
        customer_email: input.email,
        line_items: [
            {
                price_data: {
                    // Stripe requires a lower-cased ISO currency code; the
                    // stored/display casing (event.priceCurrency) stays
                    // uppercase everywhere else in the app.
                    currency: input.currency.toLowerCase(),
                    unit_amount: input.unitAmountCents,
                    product_data: {
                        name: `Reservación — ${input.eventTitle}`,
                    },
                },
                quantity: input.quantity,
            },
        ],
        metadata,
        payment_intent_data: { metadata },
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
        success_url: `${baseUrl}/${input.eventSlug}/pago?state=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/${input.eventSlug}/pago?state=cancelled`,
    }
}
