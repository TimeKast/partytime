import { describe, expect, it, vi } from 'vitest'
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
    CHECKIN_SEMANTIC_CHECK_NAMES,
    HISTORICAL_SEMANTIC_CHECK_NAMES,
    PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES,
    PENDING_STATES_SEMANTIC_CHECK_NAMES,
    type CheckinSemanticState,
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
import {
    LEDGER_SEMANTIC_CHECK_NAMES,
    type LedgerSemanticState,
} from '@/lib/event-ledger-migration-contract'
import {
    STRIPE_MODE_SEMANTIC_CHECK_NAMES,
    type StripeModeSemanticState,
} from '@/lib/stripe-mode-migration-contract'

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

    it('isStripeConfigured() needs the live key AND the live webhook secret, without ever exposing either', async () => {
        const { isStripeConfigured } = await import('@/lib/stripe')
        try {
            vi.stubEnv('STRIPE_SECRET_KEY', '')
            vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_live')
            expect(isStripeConfigured()).toBe(false)

            vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')
            expect(isStripeConfigured()).toBe(true)

            // Key without webhook secret: guests could pay but the payment
            // would never confirm — not configured.
            vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
            expect(isStripeConfigured()).toBe(false)
        } finally {
            vi.unstubAllEnvs()
        }
    })

    it('requesting a client for either mode without its key constructs a placeholder client instead of throwing', async () => {
        const originalLive = process.env.STRIPE_SECRET_KEY
        const originalTest = process.env.STRIPE_TEST_SECRET_KEY
        delete process.env.STRIPE_SECRET_KEY
        delete process.env.STRIPE_TEST_SECRET_KEY
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        try {
            const { stripeFor } = await import('@/lib/stripe')
            // Stripe's constructor throws synchronously on a falsy key
            // ("Neither apiKey nor config.authenticator provided") — this
            // would surface here if lib/stripe.ts ever passed the raw env
            // value straight through instead of the resend.ts-style
            // placeholder fallback.
            for (const mode of ['live', 'test'] as const) {
                expect(() => stripeFor(mode)).not.toThrow()
                expect(stripeFor(mode).checkout).toBeTruthy()
            }
        } finally {
            warnSpy.mockRestore()
            if (originalLive !== undefined) process.env.STRIPE_SECRET_KEY = originalLive
            if (originalTest !== undefined) process.env.STRIPE_TEST_SECRET_KEY = originalTest
        }
    })

    it('isStripeConfigured(mode) reads each mode from its own key + webhook secret pair', async () => {
        const { isStripeConfigured } = await import('@/lib/stripe')
        try {
            vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_live')
            vi.stubEnv('STRIPE_TEST_WEBHOOK_SECRET', 'whsec_test')
            vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_x')
            vi.stubEnv('STRIPE_TEST_SECRET_KEY', '')
            expect(isStripeConfigured('live')).toBe(true)
            expect(isStripeConfigured('test')).toBe(false)

            vi.stubEnv('STRIPE_SECRET_KEY', '')
            vi.stubEnv('STRIPE_TEST_SECRET_KEY', 'rk_test_x')
            expect(isStripeConfigured('live')).toBe(false)
            expect(isStripeConfigured('test')).toBe(true)

            vi.stubEnv('STRIPE_TEST_WEBHOOK_SECRET', '')
            expect(isStripeConfigured('test')).toBe(false)
        } finally {
            vi.unstubAllEnvs()
        }
    })

    it('configuredWebhookSecrets() lists only the configured modes, live first, without exposing anything else', async () => {
        const { configuredWebhookSecrets } = await import('@/lib/stripe')
        const originalLive = process.env.STRIPE_WEBHOOK_SECRET
        const originalTest = process.env.STRIPE_TEST_WEBHOOK_SECRET
        try {
            process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live'
            process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test'
            expect(configuredWebhookSecrets().map(s => s.mode)).toEqual(['live', 'test'])

            delete process.env.STRIPE_WEBHOOK_SECRET
            expect(configuredWebhookSecrets().map(s => s.mode)).toEqual(['test'])

            delete process.env.STRIPE_TEST_WEBHOOK_SECRET
            expect(configuredWebhookSecrets()).toEqual([])
        } finally {
            if (originalLive === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
            else process.env.STRIPE_WEBHOOK_SECRET = originalLive
            if (originalTest === undefined) delete process.env.STRIPE_TEST_WEBHOOK_SECRET
            else process.env.STRIPE_TEST_WEBHOOK_SECRET = originalTest
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
    // ISSUE-015: 0011 has not run in this fixture — check-in is absent.
    const absentCheckinSemantics = Object.fromEntries(
        CHECKIN_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as CheckinSemanticState
    // ISSUE-021: 0012 has not run yet in this suite's fixtures — the ledger
    // is absent throughout.
    const absentLedgerSemantics = Object.fromEntries(
        LEDGER_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as LedgerSemanticState
    // Migration 0013: the Stripe mode columns/check are absent in these
    // fixtures too — see tests/stripe-mode-migration.test.ts for the
    // 0013-applied classification coverage.
    const absentStripeModeSemantics = Object.fromEntries(
        STRIPE_MODE_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as StripeModeSemanticState

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
        checkinColumns: [],
        checkinSemantics: absentCheckinSemantics,
        ledgerTables: [],
        ledgerColumns: [],
        ledgerConstraints: [],
        ledgerIndexes: [],
        ledgerSemantics: absentLedgerSemantics,
        stripeModeColumns: [],
        stripeModeConstraints: [],
        stripeModeSemantics: absentStripeModeSemantics,
    }

    const registryThrough0010 = Array.from({ length: 11 }, (_, index) => ({
        hash: `hash-${index}`,
        createdAt: index,
    }))

    // ISSUE-015: this state (0010-complete, 0011's check-in columns absent)
    // used to classify as the terminal 'registered-current-schema' before
    // migration 0011 existed. See tests/checkin-migration.test.ts for the new
    // terminal state.
    it('classifies a database that ran through 0010 as registered-payments-ready (canApply0011), with rsvp_payments unique session id verified', () => {
        expect(REQUIRED_PAYMENTS_OBJECTS.constraints).toContain('rsvp_payments_stripe_session_id_unique')

        const result = classifyMigrationPreflight({
            drizzleRegistry: registryThrough0010,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPaymentsRegistry: registryThrough0010,
            expectedCurrentRegistry: registryThrough0010,
            objects: objectsThrough0010,
        })

        expect(result).toMatchObject({
            classification: 'registered-payments-ready',
            canApply0010: false,
            canApply0011: true,
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
