import type Stripe from 'stripe'

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
    /**
     * Always `derivePaymentAmountCents(event)` (lib/payment-config.ts) — the
     * SAME value the caller also persists on the `rsvp_payments` row, never a
     * second independently-computed amount (PLAN §3.3 "Fuente única de
     * precio").
     */
    amountCents: number
    /** Whitelisted, stored casing (e.g. 'MXN') — lower-cased below for Stripe. */
    currency: string
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
                    unit_amount: input.amountCents,
                    product_data: {
                        name: `Reservación — ${input.eventTitle}`,
                    },
                },
                quantity: 1,
            },
        ],
        metadata,
        payment_intent_data: { metadata },
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
        success_url: `${baseUrl}/${input.eventSlug}/pago?state=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/${input.eventSlug}/pago?state=cancelled`,
    }
}
