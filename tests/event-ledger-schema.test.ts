import { readFileSync } from 'node:fs'
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
    REQUIRED_CHECKIN_OBJECTS,
    REQUIRED_HISTORICAL_OBJECTS,
    REQUIRED_IMAGE_POSITION_OBJECTS,
    REQUIRED_LEDGER_OBJECTS,
    REQUIRED_PASSWORD_LIFECYCLE_OBJECTS,
    REQUIRED_PAYMENTS_OBJECTS,
    REQUIRED_PENDING_STATES_OBJECTS,
    REQUIRED_PRESENTATION_OBJECTS,
    REQUIRED_RSVP_INVITATION_OBJECTS,
    classifyMigrationPreflight,
    type MigrationObjectState,
} from '@/lib/migration-preflight'
import {
    LEDGER_SEMANTIC_CHECK_NAMES,
    LEDGER_SEMANTICS_QUERY,
    ledgerSemanticStateFromRows,
    invalidLedgerSemantics,
    type LedgerSemanticState,
} from '@/lib/event-ledger-migration-contract'
import type {
    Event,
    EventParticipant,
    EventSettlement,
    EventTransaction,
    EventTransactionShare,
    NewEventParticipant,
    NewEventSettlement,
    NewEventTransaction,
    NewEventTransactionShare,
} from '@/lib/schema'

describe('drizzle/0012_event_ledger.sql — schema additions', () => {
    const migration = readFileSync('drizzle/0012_event_ledger.sql', 'utf8')

    it('creates the four ledger tables with their declared columns', () => {
        expect(migration).toContain('CREATE TABLE "event_participants"')
        expect(migration).toContain('CREATE TABLE "event_transactions"')
        expect(migration).toContain('CREATE TABLE "event_transaction_shares"')
        expect(migration).toContain('CREATE TABLE "event_settlements"')

        // event_participants: kind + Stripe-node scaffolding (PLAN §2.6a)
        expect(migration).toContain('"kind" varchar(10) DEFAULT \'person\' NOT NULL')
        expect(migration).toContain('CONSTRAINT "event_participants_kind_check" CHECK ("event_participants"."kind" in (\'person\', \'stripe\'))')
        expect(migration).toContain('CONSTRAINT "event_participants_name_check"')

        // events.ledger_stripe_is_participant toggle (PLAN §2.6b)
        expect(migration).toContain('ALTER TABLE "events" ADD COLUMN "ledger_stripe_is_participant" boolean DEFAULT false NOT NULL;')
    })

    it('adds the composite (id, event_id) unique anchors before the composite FKs that reference them', () => {
        const idEventUniqueIndex = migration.indexOf('CREATE UNIQUE INDEX "event_participants_id_event_unique"')
        const transactionsIdEventUniqueIndex = migration.indexOf('CREATE UNIQUE INDEX "event_transactions_id_event_unique"')
        const participantCompositeFk = migration.indexOf('ADD CONSTRAINT "event_transactions_participant_id_event_id_fk"')
        const transactionCompositeFk = migration.indexOf('ADD CONSTRAINT "event_transaction_shares_transaction_id_event_id_fk"')

        expect(idEventUniqueIndex).toBeGreaterThan(-1)
        expect(transactionsIdEventUniqueIndex).toBeGreaterThan(-1)
        expect(participantCompositeFk).toBeGreaterThan(-1)
        expect(transactionCompositeFk).toBeGreaterThan(-1)

        // Postgres requires a unique constraint/index matching the referenced
        // columns to exist before a FK can reference them — the anchors must
        // come first in the file or applying this migration fails outright.
        expect(idEventUniqueIndex).toBeLessThan(participantCompositeFk)
        expect(transactionsIdEventUniqueIndex).toBeLessThan(transactionCompositeFk)
    })

    it('declares every composite cross-event FK required by PLAN-EPIC-006.md §3.1', () => {
        expect(migration).toContain(
            'ALTER TABLE "event_transactions" ADD CONSTRAINT "event_transactions_participant_id_event_id_fk" FOREIGN KEY ("participant_id","event_id") REFERENCES "public"."event_participants"("id","event_id") ON DELETE restrict',
        )
        expect(migration).toContain(
            'ALTER TABLE "event_transaction_shares" ADD CONSTRAINT "event_transaction_shares_transaction_id_event_id_fk" FOREIGN KEY ("transaction_id","event_id") REFERENCES "public"."event_transactions"("id","event_id") ON DELETE cascade',
        )
        expect(migration).toContain(
            'ALTER TABLE "event_transaction_shares" ADD CONSTRAINT "event_transaction_shares_participant_id_event_id_fk" FOREIGN KEY ("participant_id","event_id") REFERENCES "public"."event_participants"("id","event_id") ON DELETE restrict',
        )
        expect(migration).toContain(
            'ALTER TABLE "event_settlements" ADD CONSTRAINT "event_settlements_from_participant_id_event_id_fk" FOREIGN KEY ("from_participant_id","event_id") REFERENCES "public"."event_participants"("id","event_id") ON DELETE restrict',
        )
        expect(migration).toContain(
            'ALTER TABLE "event_settlements" ADD CONSTRAINT "event_settlements_to_participant_id_event_id_fk" FOREIGN KEY ("to_participant_id","event_id") REFERENCES "public"."event_participants"("id","event_id") ON DELETE restrict',
        )
    })

    it('declares the Stripe-node partial unique index (at most one kind=\'stripe\' row per event)', () => {
        expect(migration).toContain(
            'CREATE UNIQUE INDEX "event_participants_stripe_kind_unique" ON "event_participants" USING btree ("event_id") WHERE "event_participants"."kind" = \'stripe\'',
        )
    })

    it('is additive only — no DROP/DELETE/TRUNCATE/UPDATE', () => {
        expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im)
    })

    it('chains generated snapshot and journal entry after 0011', () => {
        const snapshot11 = JSON.parse(readFileSync('drizzle/meta/0011_snapshot.json', 'utf8')) as { id: string }
        const snapshot12 = JSON.parse(readFileSync('drizzle/meta/0012_snapshot.json', 'utf8')) as {
            prevId: string
            tables: Record<string, { columns: Record<string, unknown> }>
        }
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string }>
        }

        expect(snapshot12.prevId).toBe(snapshot11.id)
        expect(snapshot12.tables['public.events'].columns).toHaveProperty('ledger_stripe_is_participant')
        expect(snapshot12.tables).toHaveProperty('public.event_participants')
        expect(snapshot12.tables).toHaveProperty('public.event_transactions')
        expect(snapshot12.tables).toHaveProperty('public.event_transaction_shares')
        expect(snapshot12.tables).toHaveProperty('public.event_settlements')
        expect(journal.entries[12]).toEqual(expect.objectContaining({
            idx: 12,
            tag: '0012_event_ledger',
        }))
    })
})

describe('migration-preflight — 0012 ledger classification', () => {
    it('lists the four ledger tables and the events toggle column', () => {
        expect(REQUIRED_LEDGER_OBJECTS.tables).toEqual([
            'event_participants',
            'event_transactions',
            'event_transaction_shares',
            'event_settlements',
        ])
        expect(REQUIRED_LEDGER_OBJECTS.columns).toContain('events.ledger_stripe_is_participant')
    })

    it('lists every composite FK and the Stripe partial unique index', () => {
        expect(REQUIRED_LEDGER_OBJECTS.constraints).toEqual(expect.arrayContaining([
            'event_transactions_participant_id_event_id_fk',
            'event_transaction_shares_transaction_id_event_id_fk',
            'event_transaction_shares_participant_id_event_id_fk',
            'event_settlements_from_participant_id_event_id_fk',
            'event_settlements_to_participant_id_event_id_fk',
        ]))
        expect(REQUIRED_LEDGER_OBJECTS.indexes).toContain('event_participants_stripe_kind_unique')
    })

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
    const absentLedgerSemantics = Object.fromEntries(
        LEDGER_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as LedgerSemanticState

    // A DB that has run through exactly 0011 (check-in complete, migration
    // 0012's ledger objects absent).
    const objectsAt0011: MigrationObjectState = {
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
        ledgerTables: [],
        ledgerColumns: [],
        ledgerConstraints: [],
        ledgerIndexes: [],
        ledgerSemantics: absentLedgerSemantics,
    }

    const registryUpTo0011 = Array.from({ length: 12 }, (_, index) => ({
        hash: `hash-${index}`,
        createdAt: index,
    }))
    const registryUpTo0012 = [...registryUpTo0011, { hash: 'hash-12', createdAt: 12 }]

    it('classifies an exact 0011 database as ready to apply 0012 (canApply0012)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0011,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0011.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0011.slice(0, 11),
            expectedCheckinRegistry: registryUpTo0011,
            expectedCurrentRegistry: registryUpTo0012,
            objects: objectsAt0011,
        })

        expect(result).toMatchObject({
            classification: 'registered-checkin-ready',
            canApply0011: false,
            canApply0012: true,
            missingLedgerObjects: [
                ...REQUIRED_LEDGER_OBJECTS.tables,
                ...REQUIRED_LEDGER_OBJECTS.columns,
                ...REQUIRED_LEDGER_OBJECTS.constraints,
                ...REQUIRED_LEDGER_OBJECTS.indexes,
            ] as string[],
        })
    })

    it('classifies the 0012 objects (applied on a disposable Neon branch) as the current schema — acceptance criterion for pnpm db:preflight', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0012,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0011.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0011.slice(0, 11),
            expectedCheckinRegistry: registryUpTo0011,
            expectedCurrentRegistry: registryUpTo0012,
            objects: {
                ...objectsAt0011,
                ledgerTables: [...REQUIRED_LEDGER_OBJECTS.tables],
                ledgerColumns: [...REQUIRED_LEDGER_OBJECTS.columns],
                ledgerConstraints: [...REQUIRED_LEDGER_OBJECTS.constraints],
                ledgerIndexes: [...REQUIRED_LEDGER_OBJECTS.indexes],
                ledgerSemantics: validLedgerSemantics,
            },
        })

        expect(result).toMatchObject({
            classification: 'registered-current-schema',
            canApply0012: false,
            missingLedgerObjects: [],
            invalidLedgerSemantics: [],
        })
    })

    it('fails closed (registered-inconsistent-schema) when a ledger table is entirely missing from an otherwise-registered database', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0012,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0011.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0011.slice(0, 11),
            expectedCheckinRegistry: registryUpTo0011,
            expectedCurrentRegistry: registryUpTo0012,
            objects: {
                ...objectsAt0011,
                // event_settlements missing entirely — e.g. a partially-applied migration.
                ledgerTables: ['event_participants', 'event_transactions', 'event_transaction_shares'],
                ledgerColumns: [...REQUIRED_LEDGER_OBJECTS.columns],
                ledgerConstraints: [...REQUIRED_LEDGER_OBJECTS.constraints],
                ledgerIndexes: [...REQUIRED_LEDGER_OBJECTS.indexes],
                ledgerSemantics: validLedgerSemantics,
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.missingLedgerObjects).toContain('event_settlements')
        expect(result.reasons.join('\n')).toContain('missing ledger objects')
    })

    it('fails closed when a composite FK is missing (cross-event integrity not actually enforced)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0012,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0011.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0011.slice(0, 11),
            expectedCheckinRegistry: registryUpTo0011,
            expectedCurrentRegistry: registryUpTo0012,
            objects: {
                ...objectsAt0011,
                ledgerTables: [...REQUIRED_LEDGER_OBJECTS.tables],
                ledgerColumns: [...REQUIRED_LEDGER_OBJECTS.columns],
                ledgerConstraints: REQUIRED_LEDGER_OBJECTS.constraints.filter(
                    name => name !== 'event_transactions_participant_id_event_id_fk',
                ),
                ledgerIndexes: [...REQUIRED_LEDGER_OBJECTS.indexes],
                ledgerSemantics: validLedgerSemantics,
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.missingLedgerObjects).toContain('event_transactions_participant_id_event_id_fk')
    })

    it('fails closed when the events.ledger_stripe_is_participant column is missing', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0012,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0011.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0011.slice(0, 11),
            expectedCheckinRegistry: registryUpTo0011,
            expectedCurrentRegistry: registryUpTo0012,
            objects: {
                ...objectsAt0011,
                ledgerTables: [...REQUIRED_LEDGER_OBJECTS.tables],
                ledgerColumns: REQUIRED_LEDGER_OBJECTS.columns.filter(
                    name => name !== 'events.ledger_stripe_is_participant',
                ),
                ledgerConstraints: [...REQUIRED_LEDGER_OBJECTS.constraints],
                ledgerIndexes: [...REQUIRED_LEDGER_OBJECTS.indexes],
                ledgerSemantics: validLedgerSemantics,
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.missingLedgerObjects).toContain('events.ledger_stripe_is_participant')
    })

    it('fails closed for a partial 0012 state (objects present, a semantic check not yet valid)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0012,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0011.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0011.slice(0, 11),
            expectedCheckinRegistry: registryUpTo0011,
            expectedCurrentRegistry: registryUpTo0012,
            objects: {
                ...objectsAt0011,
                ledgerTables: [...REQUIRED_LEDGER_OBJECTS.tables],
                ledgerColumns: [...REQUIRED_LEDGER_OBJECTS.columns],
                ledgerConstraints: [...REQUIRED_LEDGER_OBJECTS.constraints],
                ledgerIndexes: [...REQUIRED_LEDGER_OBJECTS.indexes],
                ledgerSemantics: {
                    ...validLedgerSemantics,
                    // e.g. the toggle column exists but its default drifted.
                    'column.events.ledger_stripe_is_participant': false,
                },
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.invalidLedgerSemantics).toContain('column.events.ledger_stripe_is_participant')
        expect(result.reasons.join('\n')).toContain('invalid ledger semantics')
    })

    it('binds the semantic query to the exact ledger tables, the toggle column, and the Stripe partial unique index', () => {
        expect(LEDGER_SEMANTICS_QUERY).toContain("table_name = 'events' AND column_name = 'ledger_stripe_is_participant'")
        expect(LEDGER_SEMANTICS_QUERY).toContain("table_name = 'event_participants'")
        expect(LEDGER_SEMANTICS_QUERY).toContain("table_name = 'event_transactions'")
        expect(LEDGER_SEMANTICS_QUERY).toContain("table_name = 'event_transaction_shares'")
        expect(LEDGER_SEMANTICS_QUERY).toContain("table_name = 'event_settlements'")
        expect(LEDGER_SEMANTICS_QUERY).toContain('event_participants_stripe_kind_unique')
        expect(LEDGER_SEMANTICS_QUERY).toContain('event_participants_event_name_unique')
    })

    it('ledgerSemanticStateFromRows ignores unknown/duplicate check names and downgrades unseen checks to false', () => {
        const rows = [
            { check_name: 'column.events.ledger_stripe_is_participant', valid: true },
            { check_name: 'column.events.ledger_stripe_is_participant', valid: false }, // duplicate, first wins
            { check_name: 'not-a-real-check', valid: true },
        ]
        const state = ledgerSemanticStateFromRows(rows)
        expect(state['column.events.ledger_stripe_is_participant']).toBe(true)
        expect(state['constraint.event_settlements_from_to_check']).toBe(false)
    })

    it('invalidLedgerSemantics reports exactly the false checks, in declared order', () => {
        const mostlyValid: LedgerSemanticState = {
            ...validLedgerSemantics,
            'index.event_participants_stripe_kind_unique': false,
            'constraint.event_transactions_participant_fk': false,
        }
        expect(invalidLedgerSemantics(mostlyValid)).toEqual([
            'index.event_participants_stripe_kind_unique',
            'constraint.event_transactions_participant_fk',
        ])
        expect(invalidLedgerSemantics(absentLedgerSemantics)).toEqual([...LEDGER_SEMANTIC_CHECK_NAMES])
        expect(invalidLedgerSemantics(validLedgerSemantics)).toEqual([])
    })
})

describe('event ledger schema — exported Drizzle types', () => {
    // These are compile-time assertions: if lib/schema.ts ever drops a column
    // from event_participants/event_transactions/event_transaction_shares/
    // event_settlements without updating the corresponding $inferSelect/
    // $inferInsert usage here, `tsc`/`pnpm build` fails before this file's
    // runtime assertions even run.
    const participant: EventParticipant = {
        id: 'participant-1',
        eventId: 'evento-original',
        kind: 'person',
        name: 'Ana',
        email: null,
        userId: null,
        isActive: true,
        createdBy: 'super_admin_env',
        createdAt: new Date('2026-08-19T00:00:00Z'),
    }
    const newParticipant: NewEventParticipant = {
        eventId: 'evento-original',
        name: 'Stripe',
        kind: 'stripe',
        createdBy: 'super_admin_env',
    }
    const transaction: EventTransaction = {
        id: 'transaction-1',
        eventId: 'evento-original',
        type: 'expense',
        participantId: 'participant-1',
        description: 'Venue deposit',
        amountCents: 150000,
        currency: 'MXN',
        occurredOn: '2026-08-19',
        note: null,
        createdBy: 'super_admin_env',
        createdAt: new Date('2026-08-19T00:00:00Z'),
        updatedAt: new Date('2026-08-19T00:00:00Z'),
        deletedAt: null,
        deletedBy: null,
    }
    const newTransaction: NewEventTransaction = {
        eventId: 'evento-original',
        type: 'income',
        participantId: 'participant-1',
        description: 'Cash collected at the door',
        amountCents: 50000,
        currency: 'MXN',
        occurredOn: '2026-08-19',
        createdBy: 'super_admin_env',
    }
    const share: EventTransactionShare = {
        id: 'share-1',
        transactionId: 'transaction-1',
        eventId: 'evento-original',
        participantId: 'participant-1',
        shareCents: 50000,
    }
    const newShare: NewEventTransactionShare = {
        transactionId: 'transaction-1',
        eventId: 'evento-original',
        participantId: 'participant-1',
        shareCents: 50000,
    }
    const settlement: EventSettlement = {
        id: 'settlement-1',
        eventId: 'evento-original',
        fromParticipantId: 'participant-1',
        toParticipantId: 'participant-2',
        amountCents: 25000,
        currency: 'MXN',
        settledOn: '2026-08-19',
        note: null,
        createdBy: 'super_admin_env',
        createdAt: new Date('2026-08-19T00:00:00Z'),
        updatedAt: new Date('2026-08-19T00:00:00Z'),
        deletedAt: null,
        deletedBy: null,
    }
    const newSettlement: NewEventSettlement = {
        eventId: 'evento-original',
        fromParticipantId: 'participant-1',
        toParticipantId: 'participant-2',
        amountCents: 25000,
        currency: 'MXN',
        settledOn: '2026-08-19',
        createdBy: 'super_admin_env',
    }
    // The Stripe-mode toggle lives on events, not on a ledger table — asserted
    // here so a future schema edit can't silently drop it from Event either.
    const eventWithLedgerToggle: Pick<Event, 'ledgerStripeIsParticipant'> = {
        ledgerStripeIsParticipant: false,
    }

    it('exposes the exact $inferSelect column set for all four ledger tables', () => {
        expect(Object.keys(participant).sort()).toEqual([
            'createdAt', 'createdBy', 'email', 'eventId', 'id', 'isActive', 'kind', 'name', 'userId',
        ])
        expect(Object.keys(transaction).sort()).toEqual([
            'amountCents', 'createdAt', 'createdBy', 'currency', 'deletedAt', 'deletedBy', 'description',
            'eventId', 'id', 'note', 'occurredOn', 'participantId', 'type', 'updatedAt',
        ])
        expect(Object.keys(share).sort()).toEqual([
            'eventId', 'id', 'participantId', 'shareCents', 'transactionId',
        ])
        expect(Object.keys(settlement).sort()).toEqual([
            'amountCents', 'createdAt', 'createdBy', 'currency', 'deletedAt', 'deletedBy', 'eventId',
            'fromParticipantId', 'id', 'note', 'settledOn', 'toParticipantId', 'updatedAt',
        ])
    })

    it('accepts the minimal $inferInsert shape (only NOT NULL, no-default columns required)', () => {
        expect(newParticipant.kind).toBe('stripe')
        expect(newTransaction.type).toBe('income')
        expect(newShare.shareCents).toBe(50000)
        expect(newSettlement.fromParticipantId).not.toBe(newSettlement.toParticipantId)
        expect(eventWithLedgerToggle.ledgerStripeIsParticipant).toBe(false)
    })
})
