import { readFileSync } from 'node:fs'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
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
    STRIPE_MODE_SEMANTICS_QUERY,
    invalidStripeModeSemantics,
    stripeModeSemanticStateFromRows,
    type StripeModeSemanticState,
} from '@/lib/stripe-mode-migration-contract'
import {
    REQUIRED_CHECKIN_OBJECTS,
    REQUIRED_HISTORICAL_OBJECTS,
    REQUIRED_IMAGE_POSITION_OBJECTS,
    REQUIRED_LEDGER_OBJECTS,
    REQUIRED_PASSWORD_LIFECYCLE_OBJECTS,
    REQUIRED_PAYMENTS_OBJECTS,
    REQUIRED_PENDING_STATES_OBJECTS,
    REQUIRED_PRESENTATION_OBJECTS,
    REQUIRED_RSVP_INVITATION_OBJECTS,
    REQUIRED_STRIPE_MODE_OBJECTS,
    classifyMigrationPreflight,
    type MigrationObjectState,
    type MigrationPreflightInput,
} from '@/lib/migration-preflight'
import {
    events,
    rsvpPayments,
    type Event,
    type NewRsvpPayment,
    type RsvpPayment,
} from '@/lib/schema'

// drizzle-kit splits on this marker; each chunk is one statement.
function statements(sql: string): string[] {
    return sql
        .split('--> statement-breakpoint')
        .map(statement => statement.trim())
        .filter(statement => statement.length > 0)
}

describe('drizzle/0013_stripe_mode.sql — schema additions', () => {
    const migration = readFileSync('drizzle/0013_stripe_mode.sql', 'utf8')
    const parts = statements(migration)

    it('adds events.stripe_mode as varchar(8) NOT NULL DEFAULT \'live\' with its CHECK', () => {
        expect(migration).toContain(
            'ALTER TABLE "events" ADD COLUMN "stripe_mode" varchar(8) DEFAULT \'live\' NOT NULL;',
        )
        expect(migration).toContain(
            'ALTER TABLE "events" ADD CONSTRAINT "events_stripe_mode_check" CHECK ("events"."stripe_mode" in (\'live\', \'test\'));',
        )
    })

    it('adds rsvp_payments.livemode as boolean NOT NULL DEFAULT true (safe to apply before the deploy)', () => {
        expect(migration).toContain(
            'ALTER TABLE "rsvp_payments" ADD COLUMN "livemode" boolean DEFAULT true NOT NULL;',
        )
    })

    it('backfills livemode=false only for cs_test_ sessions, with LIKE wildcards escaped', () => {
        const backfill = 'UPDATE "rsvp_payments" SET "livemode" = false WHERE "stripe_session_id" LIKE \'cs\\_test\\_%\';'
        expect(migration).toContain(backfill)
        // An unescaped `_` is a single-char wildcard: 'cs_test_%' would also
        // match e.g. 'csXtestX...'. Only the escaped form may appear.
        expect(migration).not.toMatch(/LIKE 'cs_test_%'/)
        expect(migration).not.toMatch(/cs_live/)

        // The backfill can only run once the column exists.
        const addColumn = parts.findIndex(part => part.includes('ADD COLUMN "livemode"'))
        const update = parts.findIndex(part => part.startsWith('UPDATE'))
        expect(addColumn).toBeGreaterThan(-1)
        expect(update).toBeGreaterThan(addColumn)
    })

    it('contains exactly four statements and no destructive DDL/DML beyond the scoped backfill', () => {
        expect(parts).toHaveLength(4)
        expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|TRUNCATE)\b/im)
        const updates = parts.filter(part => /^\s*UPDATE\b/i.test(part))
        expect(updates).toHaveLength(1)
        expect(updates[0]).toMatch(/^UPDATE "rsvp_payments" SET "livemode" = false WHERE /)
    })

    it('chains generated snapshot and journal entry after 0012', () => {
        const snapshot12 = JSON.parse(readFileSync('drizzle/meta/0012_snapshot.json', 'utf8')) as { id: string }
        const snapshot13 = JSON.parse(readFileSync('drizzle/meta/0013_snapshot.json', 'utf8')) as {
            prevId: string
            tables: Record<string, {
                columns: Record<string, { type: string; notNull: boolean; default?: unknown }>
                checkConstraints: Record<string, { name: string; value: string }>
            }>
        }
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string; when: number }>
        }

        expect(snapshot13.prevId).toBe(snapshot12.id)
        expect(snapshot13.tables['public.events'].columns.stripe_mode).toEqual(expect.objectContaining({
            type: 'varchar(8)',
            notNull: true,
            default: '\'live\'',
        }))
        expect(snapshot13.tables['public.events'].checkConstraints.events_stripe_mode_check).toEqual({
            name: 'events_stripe_mode_check',
            value: '"events"."stripe_mode" in (\'live\', \'test\')',
        })
        expect(snapshot13.tables['public.rsvp_payments'].columns.livemode).toEqual(expect.objectContaining({
            type: 'boolean',
            notNull: true,
            default: true,
        }))
        expect(journal.entries).toHaveLength(14)
        expect(journal.entries[13]).toEqual(expect.objectContaining({
            idx: 13,
            tag: '0013_stripe_mode',
        }))
        expect(journal.entries[13].when).toBe(journal.entries[12].when + 86_400_000)
    })
})

describe('lib/schema.ts — Stripe mode columns', () => {
    it('declares events.stripe_mode NOT NULL DEFAULT \'live\' and the events_stripe_mode_check', () => {
        const config = getTableConfig(events)
        const column = config.columns.find(candidate => candidate.name === 'stripe_mode')
        expect(column).toBeDefined()
        expect(column!.notNull).toBe(true)
        expect(column!.default).toBe('live')
        expect(config.checks.map(check => check.name)).toContain('events_stripe_mode_check')
    })

    it('declares rsvp_payments.livemode NOT NULL DEFAULT true', () => {
        const column = getTableConfig(rsvpPayments).columns.find(candidate => candidate.name === 'livemode')
        expect(column).toBeDefined()
        expect(column!.notNull).toBe(true)
        expect(column!.default).toBe(true)
    })

    // Compile-time assertions: dropping either column from lib/schema.ts breaks tsc.
    const eventMode: Pick<Event, 'stripeMode'> = { stripeMode: 'test' }
    const payment: Pick<RsvpPayment, 'livemode'> = { livemode: false }
    // livemode has a DB default, so the insert type keeps it optional — the
    // property that lets pre-0013 code keep inserting payments.
    const legacyInsert: NewRsvpPayment = {
        rsvpId: 'rsvp-1',
        eventId: 'evento',
        stripeSessionId: 'cs_live_123',
        amountCents: 25000,
        currency: 'MXN',
    }

    it('exposes the new columns on the inferred types', () => {
        expect(eventMode.stripeMode).toBe('test')
        expect(payment.livemode).toBe(false)
        expect(legacyInsert).not.toHaveProperty('livemode')
    })
})

describe('migration-preflight — 0013 Stripe mode classification', () => {
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
    const validCheckinSemantics = Object.fromEntries(
        CHECKIN_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as CheckinSemanticState
    const validLedgerSemantics = Object.fromEntries(
        LEDGER_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as LedgerSemanticState
    const validStripeModeSemantics = Object.fromEntries(
        STRIPE_MODE_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as StripeModeSemanticState
    const absentStripeModeSemantics = Object.fromEntries(
        STRIPE_MODE_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as StripeModeSemanticState

    // A DB that has run through exactly 0012 (ledger complete, migration
    // 0013's Stripe mode objects absent).
    const objectsAt0012: MigrationObjectState = {
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
        checkinColumns: [...REQUIRED_CHECKIN_OBJECTS.columns],
        checkinSemantics: validCheckinSemantics,
        ledgerTables: [...REQUIRED_LEDGER_OBJECTS.tables],
        ledgerColumns: [...REQUIRED_LEDGER_OBJECTS.columns],
        ledgerConstraints: [...REQUIRED_LEDGER_OBJECTS.constraints],
        ledgerIndexes: [...REQUIRED_LEDGER_OBJECTS.indexes],
        ledgerSemantics: validLedgerSemantics,
        stripeModeColumns: [],
        stripeModeConstraints: [],
        stripeModeSemantics: absentStripeModeSemantics,
    }
    const objectsAt0013: MigrationObjectState = {
        ...objectsAt0012,
        stripeModeColumns: [...REQUIRED_STRIPE_MODE_OBJECTS.columns],
        stripeModeConstraints: [...REQUIRED_STRIPE_MODE_OBJECTS.constraints],
        stripeModeSemantics: validStripeModeSemantics,
    }

    const registryUpTo0012 = Array.from({ length: 13 }, (_, index) => ({
        hash: `hash-${index}`,
        createdAt: index,
    }))
    const registryUpTo0013 = [...registryUpTo0012, { hash: 'hash-13', createdAt: 13 }]

    function classify(
        drizzleRegistry: MigrationPreflightInput['drizzleRegistry'],
        objects: MigrationObjectState,
    ) {
        return classifyMigrationPreflight({
            drizzleRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0012.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0012.slice(0, 11),
            expectedCheckinRegistry: registryUpTo0012.slice(0, 12),
            expectedLedgerRegistry: registryUpTo0012,
            expectedCurrentRegistry: registryUpTo0013,
            objects,
        })
    }

    it('lists the two flat columns and the one CHECK the migration adds', () => {
        expect(REQUIRED_STRIPE_MODE_OBJECTS.columns).toEqual([
            'events.stripe_mode',
            'rsvp_payments.livemode',
        ])
        expect(REQUIRED_STRIPE_MODE_OBJECTS.constraints).toEqual(['events_stripe_mode_check'])
    })

    it('classifies an exact 0012 database as ready to apply 0013 (canApply0013)', () => {
        const result = classify(registryUpTo0012, objectsAt0012)

        expect(result).toMatchObject({
            classification: 'registered-ledger-ready',
            canApply0012: false,
            canApply0013: true,
            missingStripeModeObjects: [
                ...REQUIRED_STRIPE_MODE_OBJECTS.columns,
                ...REQUIRED_STRIPE_MODE_OBJECTS.constraints,
            ] as string[],
            // Absent is not invalid: semantics are only judged once any 0013
            // object exists.
            invalidStripeModeSemantics: [],
        })
    })

    it('classifies the 0013 objects as the current schema — acceptance criterion for pnpm db:preflight', () => {
        const result = classify(registryUpTo0013, objectsAt0013)

        expect(result).toMatchObject({
            classification: 'registered-current-schema',
            canApply0012: false,
            canApply0013: false,
            missingStripeModeObjects: [],
            invalidStripeModeSemantics: [],
        })
    })

    it('keeps the unregistered tiers in step (0012 → unregistered-ledger-schema, 0013 → unregistered-current-schema)', () => {
        expect(classify(null, objectsAt0012).classification).toBe('unregistered-ledger-schema')
        expect(classify(null, objectsAt0013).classification).toBe('unregistered-current-schema')
    })

    it('does not offer 0013 again once its objects exist but the registry stops at 0012', () => {
        const result = classify(registryUpTo0012, objectsAt0013)

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.canApply0013).toBe(false)
    })

    it('fails closed when events.stripe_mode is missing', () => {
        const result = classify(registryUpTo0013, {
            ...objectsAt0013,
            stripeModeColumns: ['rsvp_payments.livemode'],
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.missingStripeModeObjects).toEqual(['events.stripe_mode'])
        expect(result.reasons.join('\n')).toContain('missing Stripe mode objects')
    })

    it('fails closed when rsvp_payments.livemode is missing', () => {
        const result = classify(registryUpTo0013, {
            ...objectsAt0013,
            stripeModeColumns: ['events.stripe_mode'],
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.missingStripeModeObjects).toEqual(['rsvp_payments.livemode'])
    })

    it('fails closed when events_stripe_mode_check is missing (any string could be stored as a mode)', () => {
        const result = classify(registryUpTo0013, {
            ...objectsAt0013,
            stripeModeConstraints: [],
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.missingStripeModeObjects).toEqual(['events_stripe_mode_check'])
    })

    it('fails closed when an object exists but its semantics drifted (e.g. livemode nullable or defaulting to false)', () => {
        const result = classify(registryUpTo0013, {
            ...objectsAt0013,
            stripeModeSemantics: {
                ...validStripeModeSemantics,
                'column.rsvp_payments.livemode': false,
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.invalidStripeModeSemantics).toEqual(['column.rsvp_payments.livemode'])
        expect(result.reasons.join('\n')).toContain('invalid Stripe mode semantics')
    })

    it('fails closed for a partial 0013 state with only the check present', () => {
        const result = classify(registryUpTo0012, {
            ...objectsAt0012,
            stripeModeConstraints: ['events_stripe_mode_check'],
            stripeModeSemantics: {
                ...absentStripeModeSemantics,
                'constraint.events_stripe_mode_check': true,
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.canApply0013).toBe(false)
    })
})

describe('lib/stripe-mode-migration-contract.ts', () => {
    it('binds the semantic query to the exact columns, types, defaults and CHECK', () => {
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain("table_name = 'events' AND column_name = 'stripe_mode'")
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain('character_maximum_length = 8')
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain("'''live''::character varying'")
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain("conname = 'events_stripe_mode_check'")
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain("'public.events'::regclass")
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain('convalidated')
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain("'%''test''%'")
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain("table_name = 'rsvp_payments' AND column_name = 'livemode'")
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain("column_default IN ('true', 'true::boolean')")
        expect(STRIPE_MODE_SEMANTICS_QUERY).toContain("is_nullable = 'NO'")
    })

    it('stripeModeSemanticStateFromRows ignores unknown/duplicate check names and downgrades unseen checks to false', () => {
        const state = stripeModeSemanticStateFromRows([
            { check_name: 'column.events.stripe_mode', valid: true },
            { check_name: 'column.events.stripe_mode', valid: false }, // duplicate, first wins
            { check_name: 'column.rsvp_payments.livemode', valid: 'true' }, // not a boolean
            { check_name: 'not-a-real-check', valid: true },
        ])
        expect(state).toEqual({
            'column.events.stripe_mode': true,
            'constraint.events_stripe_mode_check': false,
            'column.rsvp_payments.livemode': false,
        })
    })

    it('invalidStripeModeSemantics reports exactly the false checks, in declared order', () => {
        const validState = Object.fromEntries(
            STRIPE_MODE_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
        ) as StripeModeSemanticState
        expect(invalidStripeModeSemantics(validState)).toEqual([])
        expect(invalidStripeModeSemantics({
            ...validState,
            'column.rsvp_payments.livemode': false,
            'column.events.stripe_mode': false,
        })).toEqual(['column.events.stripe_mode', 'column.rsvp_payments.livemode'])
    })
})
