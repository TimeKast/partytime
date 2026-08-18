import Stripe from 'stripe'

let client: Stripe | null = null

function getStripe(): Stripe {
    if (!client) {
        const key = process.env.STRIPE_SECRET_KEY
        if (!key) {
            console.warn('⚠️  STRIPE_SECRET_KEY no configurado. Los cobros no funcionarán.')
        }
        // Stripe's constructor throws ("Neither apiKey nor config.authenticator
        // provided") on a falsy key, same as Resend's. Use a placeholder when
        // the key is absent so importing this module during `next build` / CI
        // (which has no secret) never crashes at module load — mirrors
        // lib/resend.ts (PLAN-EPICS-002-005.md gotcha #6). A request made with
        // the placeholder key simply fails at request time against Stripe's API.
        client = new Stripe(key || 'sk_test_placeholder_no_key', {
            // Pinned to the installed SDK's own default API version (not a
            // hand-copied string) so a `stripe` upgrade can never silently
            // drift the pinned version out of sync with what the SDK's request
            // helpers/type definitions actually expect.
            apiVersion: Stripe.API_VERSION,
        })
    }
    return client
}

// Lazy proxy: the Stripe client is not constructed until the first property
// access (i.e. the first real API call), so merely importing this module is
// side-effect free — same pattern as lib/resend.ts's `resend` export.
export const stripe = new Proxy({} as Stripe, {
    get(_target, prop) {
        const instance = getStripe()
        const value = instance[prop as keyof Stripe]
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(instance) : value
    },
})

/** Whether real Stripe calls will work, without ever exposing the key itself. */
export function isStripeConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY
}
