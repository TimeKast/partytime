import { describe, expect, it } from 'vitest'
import {
    PAYMENT_CURRENCY_WHITELIST,
    checkPaymentRequiredEligibility,
    derivePaymentAmountCents,
    isWhitelistedPaymentCurrency,
} from '@/lib/payment-config'
import {
    REQUIRED_HISTORICAL_OBJECTS,
    REQUIRED_IMAGE_POSITION_OBJECTS,
    REQUIRED_PASSWORD_LIFECYCLE_OBJECTS,
    REQUIRED_PAYMENTS_OBJECTS,
    REQUIRED_PENDING_STATES_OBJECTS,
    REQUIRED_PRESENTATION_OBJECTS,
    REQUIRED_RSVP_INVITATION_OBJECTS,
    classifyMigrationPreflight,
    type MigrationObjectState,
} from '@/lib/migration-preflight'
import {
    HISTORICAL_SEMANTIC_CHECK_NAMES,
    PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES,
    PENDING_STATES_SEMANTIC_CHECK_NAMES,
    type HistoricalSemanticState,
    type PasswordLifecycleSemanticState,
    type PendingStatesSemanticState,
} from '@/lib/migration-semantic-contract'
import {
    RSVP_INVITATION_SEMANTIC_CHECK_NAMES,
    type RsvpInvitationSemanticState,
} from '@/lib/rsvp-invitation-migration-contract'
import {
    PAYMENTS_SEMANTIC_CHECK_NAMES,
    type PaymentsSemanticState,
} from '@/lib/rsvp-payments-migration-contract'

describe('derivePaymentAmountCents (ISSUE-010 acceptance criterion)', () => {
    it('derives exactly 25000 cents from a $250 MXN price', () => {
        expect(derivePaymentAmountCents({ priceAmount: 250 })).toBe(25000)
    })

    it('derives 0 for an unset/zero price', () => {
        expect(derivePaymentAmountCents({ priceAmount: 0 })).toBe(0)
        expect(derivePaymentAmountCents({ priceAmount: null })).toBe(0)
    })

    it('is always exactly price_amount * 100 — never a second, independently-editable amount', () => {
        for (const amount of [1, 99, 500, 1234]) {
            expect(derivePaymentAmountCents({ priceAmount: amount })).toBe(amount * 100)
        }
    })
})

describe('payment currency whitelist', () => {
    it('whitelists exactly MXN and USD', () => {
        expect(PAYMENT_CURRENCY_WHITELIST).toEqual(['MXN', 'USD'])
        expect(isWhitelistedPaymentCurrency('MXN')).toBe(true)
        expect(isWhitelistedPaymentCurrency('USD')).toBe(true)
    })

    it('rejects any other currency and non-string values', () => {
        expect(isWhitelistedPaymentCurrency('EUR')).toBe(false)
        expect(isWhitelistedPaymentCurrency('mxn')).toBe(false) // case-sensitive, matches stored price_currency casing
        expect(isWhitelistedPaymentCurrency('')).toBe(false)
        expect(isWhitelistedPaymentCurrency(undefined)).toBe(false)
        expect(isWhitelistedPaymentCurrency(null)).toBe(false)
        expect(isWhitelistedPaymentCurrency(100)).toBe(false)
    })
})

describe('checkPaymentRequiredEligibility — cross-field validation (PLAN §3.3)', () => {
    it('is eligible only with price enabled, a positive amount and a whitelisted currency', () => {
        expect(checkPaymentRequiredEligibility({
            priceEnabled: true,
            priceAmount: 250,
            priceCurrency: 'MXN',
        })).toEqual({ eligible: true })
    })

    it('rejects when price_enabled is false', () => {
        const result = checkPaymentRequiredEligibility({
            priceEnabled: false,
            priceAmount: 250,
            priceCurrency: 'MXN',
        })
        expect(result.eligible).toBe(false)
    })

    it('rejects a $0 or negative amount', () => {
        for (const priceAmount of [0, -1]) {
            const result = checkPaymentRequiredEligibility({ priceEnabled: true, priceAmount, priceCurrency: 'MXN' })
            expect(result.eligible).toBe(false)
        }
    })

    it('rejects a non-whitelisted currency', () => {
        const result = checkPaymentRequiredEligibility({
            priceEnabled: true,
            priceAmount: 250,
            priceCurrency: 'EUR',
        })
        expect(result.eligible).toBe(false)
    })

    it('rejects a null/missing price state (event never configured a price)', () => {
        const result = checkPaymentRequiredEligibility({
            priceEnabled: null,
            priceAmount: null,
            priceCurrency: null,
        })
        expect(result.eligible).toBe(false)
    })
})

describe('lib/stripe.ts — lazy client (ISSUE-010 acceptance criterion: no STRIPE_SECRET_KEY never crashes build/CI)', () => {
    it('importing the module without STRIPE_SECRET_KEY does not throw', async () => {
        const original = process.env.STRIPE_SECRET_KEY
        delete process.env.STRIPE_SECRET_KEY
        try {
            await expect(import('@/lib/stripe')).resolves.toBeDefined()
        } finally {
            if (original !== undefined) process.env.STRIPE_SECRET_KEY = original
        }
    })

    it('isStripeConfigured() reflects whether STRIPE_SECRET_KEY is set, without ever exposing it', async () => {
        const { isStripeConfigured } = await import('@/lib/stripe')
        const original = process.env.STRIPE_SECRET_KEY

        try {
            delete process.env.STRIPE_SECRET_KEY
            expect(isStripeConfigured()).toBe(false)

            process.env.STRIPE_SECRET_KEY = 'sk_test_123'
            expect(isStripeConfigured()).toBe(true)
        } finally {
            if (original === undefined) delete process.env.STRIPE_SECRET_KEY
            else process.env.STRIPE_SECRET_KEY = original
        }
    })

    it('a property access on the lazy proxy without a real key constructs a placeholder client instead of throwing', async () => {
        const original = process.env.STRIPE_SECRET_KEY
        delete process.env.STRIPE_SECRET_KEY
        try {
            const { stripe } = await import('@/lib/stripe')
            // Stripe's constructor throws synchronously on a falsy key
            // ("Neither apiKey nor config.authenticator provided") — this
            // would surface here, on first property access, if lib/stripe.ts
            // ever passed the raw env value straight through instead of the
            // resend.ts-style placeholder fallback.
            expect(() => stripe.checkout).not.toThrow()
            expect(stripe.checkout).toBeTruthy()
        } finally {
            if (original !== undefined) process.env.STRIPE_SECRET_KEY = original
        }
    })
})

describe('migration preflight — payments tier compatibility (ISSUE-010)', () => {
    it('exposes exactly the events.payment_required + rsvp_payments objects migration 0010 adds', () => {
        expect(REQUIRED_PAYMENTS_OBJECTS.tables).toEqual(['rsvp_payments'])
        expect(REQUIRED_PAYMENTS_OBJECTS.columns).toContain('events.payment_required')
        expect(REQUIRED_PAYMENTS_OBJECTS.columns).toContain('rsvp_payments.stripe_session_id')
        expect(REQUIRED_PAYMENTS_OBJECTS.constraints).toContain('rsvp_payments_amount_cents_check')
        expect(REQUIRED_PAYMENTS_OBJECTS.indexes).toEqual([
            'rsvp_payments_rsvp_id_idx',
            'rsvp_payments_event_id_status_idx',
        ])
    })

    // Full end-to-end object state for a database that has run every
    // migration through 0010 — the acceptance criterion's "corren db:preflight
    // y verify-db-contract / Then pasan y rsvp_payments existe con su unique
    // de sesión", exercised at the classifier-unit level (a live Postgres run
    // against a disposable Neon branch is `pnpm test:db:capacity-semantics` /
    // `pnpm db:preflight`, out of scope for this suite).
    const validHistoricalSemantics = Object.fromEntries(
        HISTORICAL_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as HistoricalSemanticState
    const validPasswordLifecycleSemantics = Object.fromEntries(
        PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as PasswordLifecycleSemanticState
    const validRsvpInvitationSemantics = Object.fromEntries(
        RSVP_INVITATION_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as RsvpInvitationSemanticState
    const validPendingStatesSemantics = Object.fromEntries(
        PENDING_STATES_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as PendingStatesSemanticState
    const validPaymentsSemantics = Object.fromEntries(
        PAYMENTS_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as PaymentsSemanticState

    const objectsThrough0010: MigrationObjectState = {
        tables: [...REQUIRED_HISTORICAL_OBJECTS.tables],
        columns: [...REQUIRED_HISTORICAL_OBJECTS.columns],
        constraints: [...REQUIRED_HISTORICAL_OBJECTS.constraints],
        indexes: [...REQUIRED_HISTORICAL_OBJECTS.indexes],
        triggers: [...REQUIRED_HISTORICAL_OBJECTS.triggers],
        functions: [...REQUIRED_HISTORICAL_OBJECTS.functions],
        historicalSemantics: validHistoricalSemantics,
        duplicateEventEmailGroups: 0,
        orphanRsvps: 0,
        presentationColumns: [...REQUIRED_PRESENTATION_OBJECTS.columns],
        presentationConstraints: [...REQUIRED_PRESENTATION_OBJECTS.constraints],
        imagePositionColumns: [...REQUIRED_IMAGE_POSITION_OBJECTS.columns],
        imagePositionConstraints: [...REQUIRED_IMAGE_POSITION_OBJECTS.constraints],
        passwordLifecycleTables: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.tables],
        passwordLifecycleColumns: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.columns],
        passwordLifecycleConstraints: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.constraints],
        passwordLifecycleIndexes: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.indexes],
        passwordLifecycleSemantics: validPasswordLifecycleSemantics,
        rsvpInvitationTables: [...REQUIRED_RSVP_INVITATION_OBJECTS.tables],
        rsvpInvitationColumns: [...REQUIRED_RSVP_INVITATION_OBJECTS.columns],
        rsvpInvitationConstraints: [...REQUIRED_RSVP_INVITATION_OBJECTS.constraints],
        rsvpInvitationIndexes: [...REQUIRED_RSVP_INVITATION_OBJECTS.indexes],
        rsvpInvitationSemantics: validRsvpInvitationSemantics,
        pendingStatesColumns: [...REQUIRED_PENDING_STATES_OBJECTS.columns],
        pendingStatesSemantics: validPendingStatesSemantics,
        paymentsTables: [...REQUIRED_PAYMENTS_OBJECTS.tables],
        paymentsColumns: [...REQUIRED_PAYMENTS_OBJECTS.columns],
        paymentsConstraints: [...REQUIRED_PAYMENTS_OBJECTS.constraints],
        paymentsIndexes: [...REQUIRED_PAYMENTS_OBJECTS.indexes],
        paymentsSemantics: validPaymentsSemantics,
    }

    const registryThrough0010 = Array.from({ length: 11 }, (_, index) => ({
        hash: `hash-${index}`,
        createdAt: index,
    }))

    it('classifies a database that ran through 0010 as registered-current-schema, with rsvp_payments unique session id verified', () => {
        expect(REQUIRED_PAYMENTS_OBJECTS.constraints).toContain('rsvp_payments_stripe_session_id_unique')

        const result = classifyMigrationPreflight({
            drizzleRegistry: registryThrough0010,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedCurrentRegistry: registryThrough0010,
            objects: objectsThrough0010,
        })

        expect(result).toMatchObject({
            classification: 'registered-current-schema',
            canApply0010: false,
            missingPaymentsObjects: [],
            invalidPaymentsSemantics: [],
        })
    })

    it('fails closed (registered-inconsistent-schema) when the payments objects are missing entirely from an otherwise-registered database', () => {
        const registryThrough0009 = registryThrough0010.slice(0, 10)
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryThrough0010,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            // Explicitly disagrees with drizzleRegistry's length (11 entries,
            // i.e. 0010 ran) — so the "ready to apply 0010" registry match
            // fails and this cannot fall through to registered-pending-states-ready.
            expectedPendingStatesRegistry: registryThrough0009,
            expectedCurrentRegistry: registryThrough0010,
            objects: {
                ...objectsThrough0010,
                paymentsTables: [],
                paymentsColumns: [],
                paymentsConstraints: [],
                paymentsIndexes: [],
                paymentsSemantics: Object.fromEntries(
                    PAYMENTS_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
                ) as PaymentsSemanticState,
            },
        })

        // The registry says 0010 ran (11 entries), but the objects say it
        // didn't (paymentsAbsent) — same "registry ahead of objects" failure
        // mode migration-safety.test.ts exercises for the historical tiers.
        expect(result.classification).toBe('registered-inconsistent-schema')
    })
})
