import Stripe from 'stripe'

/**
 * Which Stripe account mode an event charges in (`events.stripe_mode`).
 *
 * - `live` charges real money with `STRIPE_SECRET_KEY`.
 * - `test` uses `STRIPE_TEST_SECRET_KEY`: Stripe's hosted Checkout in test mode,
 *   test cards only, no money moves. Meant for demo events.
 *
 * The mode is chosen per EVENT when a Checkout Session is created, but every
 * follow-up call about an existing session (expire/retrieve) must use the mode
 * that session was CREATED in (`rsvp_payments.livemode`), never the event's
 * current mode: a session only exists in the account mode that created it.
 */
export type StripeMode = 'live' | 'test'

export const STRIPE_MODES: readonly StripeMode[] = ['live', 'test']

export function isStripeMode(value: unknown): value is StripeMode {
    return value === 'live' || value === 'test'
}

/** The mode a stored payment was created in, from `rsvp_payments.livemode`. */
export function stripeModeOfLivemode(livemode: boolean): StripeMode {
    return livemode ? 'live' : 'test'
}

const SECRET_KEY_ENV: Record<StripeMode, string> = {
    live: 'STRIPE_SECRET_KEY',
    test: 'STRIPE_TEST_SECRET_KEY',
}

const WEBHOOK_SECRET_ENV: Record<StripeMode, string> = {
    live: 'STRIPE_WEBHOOK_SECRET',
    test: 'STRIPE_TEST_WEBHOOK_SECRET',
}

const clients: Partial<Record<StripeMode, Stripe>> = {}

function secretKeyOf(mode: StripeMode): string | undefined {
    return process.env[SECRET_KEY_ENV[mode]] || undefined
}

/**
 * The Stripe client for one account mode. Constructed lazily on first use, so
 * importing this module during `next build` / CI (which has no secret) never
 * crashes at module load — mirrors lib/resend.ts (PLAN-EPICS-002-005.md
 * gotcha #6). Stripe's constructor throws on a falsy key, so an absent key
 * gets a placeholder that simply fails at request time; callers are expected
 * to gate on `isStripeConfigured(mode)` first and fail closed.
 */
export function stripeFor(mode: StripeMode): Stripe {
    let client = clients[mode]
    if (!client) {
        const key = secretKeyOf(mode)
        if (!key) {
            console.warn(`⚠️  ${SECRET_KEY_ENV[mode]} no configurado. Los cobros en modo ${mode} no funcionarán.`)
        }
        client = new Stripe(key || 'sk_test_placeholder_no_key', {
            // Pinned to the installed SDK's own default API version (not a
            // hand-copied string) so a `stripe` upgrade can never silently
            // drift the pinned version out of sync with what the SDK's request
            // helpers/type definitions actually expect.
            apiVersion: Stripe.API_VERSION,
        })
        clients[mode] = client
    }
    return client
}

/** Whether real Stripe calls will work in this mode, without ever exposing the key itself. */
export function isStripeConfigured(mode: StripeMode = 'live'): boolean {
    return !!secretKeyOf(mode)
}

/**
 * The webhook signing secrets that are configured, live first. The webhook
 * route tries each one against the raw body; the mode whose secret verifies the
 * signature is the only mode that delivery is allowed to act on.
 */
export function configuredWebhookSecrets(): Array<{ mode: StripeMode; secret: string }> {
    const secrets: Array<{ mode: StripeMode; secret: string }> = []
    for (const mode of STRIPE_MODES) {
        const secret = process.env[WEBHOOK_SECRET_ENV[mode]]
        if (secret) secrets.push({ mode, secret })
    }
    return secrets
}
