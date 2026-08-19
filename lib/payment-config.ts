import type { Event as DatabaseEvent, RSVP as DatabaseRsvp } from '@/lib/schema'

/**
 * ISSUE-010/EPIC-004: the only currencies Stripe Checkout is wired to accept
 * for this app. PLAN-EPICS-002-005.md §3.3: "Fuente única de precio" — the
 * amount to charge is always derived, never a second independently-editable
 * field that could diverge from what the guest sees on the invitation page.
 */
export const PAYMENT_CURRENCY_WHITELIST = ['MXN', 'USD'] as const
export type PaymentCurrency = typeof PAYMENT_CURRENCY_WHITELIST[number]

export function isWhitelistedPaymentCurrency(currency: unknown): currency is PaymentCurrency {
    return typeof currency === 'string'
        && (PAYMENT_CURRENCY_WHITELIST as readonly string[]).includes(currency)
}

/**
 * Derive the per-person unit amount in cents from the single editable event
 * fee. `deriveRsvpPaymentPricing` multiplies this unit by the persisted party
 * size to produce rsvp_payments.amountCents; no second editable charge field
 * exists — see lib/schema.ts and PLAN-EPICS-002-005.md §3.3.
 */
export function derivePaymentAmountCents(event: Pick<DatabaseEvent, 'priceAmount'>): number {
    return (event.priceAmount ?? 0) * 100
}

export type RsvpPaymentQuantity = 1 | 2

export interface RsvpPaymentPricing {
    /** Per-person recovery fee sent to Stripe as `unit_amount`. */
    unitAmountCents: number
    /** One seat for the RSVP owner, plus one when the persisted RSVP has a companion. */
    quantity: RsvpPaymentQuantity
    /** Exact amount charged and persisted in `rsvp_payments.amount_cents`. */
    totalAmountCents: number
}

/**
 * Derive the complete Checkout pricing from the event fee and the RSVP row
 * that actually reserved capacity. Using the persisted RSVP (rather than the
 * request body) keeps Stripe quantity aligned with the database/capacity
 * authority even if the write path normalizes or rejects input in the future.
 */
export function deriveRsvpPaymentPricing(
    event: Pick<DatabaseEvent, 'priceAmount'>,
    rsvp: Pick<DatabaseRsvp, 'plusOne'>,
): RsvpPaymentPricing {
    const unitAmountCents = derivePaymentAmountCents(event)
    const quantity: RsvpPaymentQuantity = rsvp.plusOne === true ? 2 : 1

    return {
        unitAmountCents,
        quantity,
        totalAmountCents: unitAmountCents * quantity,
    }
}

export interface PaymentEligibilityInput {
    priceEnabled: boolean | null
    priceAmount: number | null
    priceCurrency: string | null
}

export type PaymentEligibilityResult =
    | { eligible: true }
    | { eligible: false; reason: string }

/**
 * The cross-field validation payment_required depends on (PLAN §3.3 /
 * ISSUE-010): payment_required=true is only ever valid alongside
 * price_enabled=true, price_amount>0 and a whitelisted price_currency. Shared
 * by lib/event-api-contract.ts (full-update path) and
 * app/api/admin/event-settings/update/route.ts (partial-update path) so both
 * enforce the identical rule, the way ISSUE-008 kept emailVerificationEnabled
 * consistent across both call sites.
 */
export function checkPaymentRequiredEligibility(input: PaymentEligibilityInput): PaymentEligibilityResult {
    if (input.priceEnabled !== true) {
        return {
            eligible: false,
            reason: 'No puedes requerir pago sin una cuota de recuperación habilitada',
        }
    }
    if (!Number.isFinite(input.priceAmount) || Number(input.priceAmount) <= 0) {
        return {
            eligible: false,
            reason: 'No puedes requerir pago con un monto de $0',
        }
    }
    if (!isWhitelistedPaymentCurrency(input.priceCurrency)) {
        return {
            eligible: false,
            reason: 'La moneda de cobro no es válida (solo MXN o USD)',
        }
    }
    return { eligible: true }
}
