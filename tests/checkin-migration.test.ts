import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    CHECKIN_SEMANTIC_CHECK_NAMES,
    CHECKIN_SEMANTICS_QUERY,
    HISTORICAL_SEMANTIC_CHECK_NAMES,
    PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES,
    PENDING_STATES_SEMANTIC_CHECK_NAMES,
    checkinSemanticStateFromRows,
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
    REQUIRED_PASSWORD_LIFECYCLE_OBJECTS,
    REQUIRED_PAYMENTS_OBJECTS,
    REQUIRED_PENDING_STATES_OBJECTS,
    REQUIRED_PRESENTATION_OBJECTS,
    REQUIRED_RSVP_INVITATION_OBJECTS,
    classifyMigrationPreflight,
    type MigrationObjectState,
} from '@/lib/migration-preflight'

describe('drizzle/0011_checkin.sql — schema additions', () => {
    const migration = readFileSync('drizzle/0011_checkin.sql', 'utf8')

    it('adds the three events check-in columns with the exact declared types/defaults', () => {
        expect(migration).toContain('ALTER TABLE "events" ADD COLUMN "checkin_enabled" boolean DEFAULT false NOT NULL;')
        expect(migration).toContain('ALTER TABLE "events" ADD COLUMN "checkin_password_hash" text;')
        expect(migration).toContain('ALTER TABLE "events" ADD COLUMN "checkin_password_updated_at" timestamp;')
    })

    it('adds the four rsvps check-in mark columns, nullable, no defaults', () => {
        expect(migration).toContain('ALTER TABLE "rsvps" ADD COLUMN "checked_in_at" timestamp;')
        expect(migration).toContain('ALTER TABLE "rsvps" ADD COLUMN "plus_one_checked_in_at" timestamp;')
        expect(migration).toContain('ALTER TABLE "rsvps" ADD COLUMN "checked_in_by" varchar(120);')
        expect(migration).toContain('ALTER TABLE "rsvps" ADD COLUMN "checkin_note" varchar(500);')
    })

    it('is additive only — no DROP/DELETE/TRUNCATE/UPDATE', () => {
        expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im)
    })

    it('chains generated snapshot and journal entry after 0010', () => {
        const snapshot10 = JSON.parse(readFileSync('drizzle/meta/0010_snapshot.json', 'utf8')) as { id: string }
        const snapshot11 = JSON.parse(readFileSync('drizzle/meta/0011_snapshot.json', 'utf8')) as {
            prevId: string
            tables: Record<string, { columns: Record<string, unknown> }>
        }
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string }>
        }

        expect(snapshot11.prevId).toBe(snapshot10.id)
        expect(snapshot11.tables['public.events'].columns).toHaveProperty('checkin_enabled')
        expect(snapshot11.tables['public.events'].columns).toHaveProperty('checkin_password_hash')
        expect(snapshot11.tables['public.events'].columns).toHaveProperty('checkin_password_updated_at')
        expect(snapshot11.tables['public.rsvps'].columns).toHaveProperty('checked_in_at')
        expect(snapshot11.tables['public.rsvps'].columns).toHaveProperty('plus_one_checked_in_at')
        expect(snapshot11.tables['public.rsvps'].columns).toHaveProperty('checked_in_by')
        expect(snapshot11.tables['public.rsvps'].columns).toHaveProperty('checkin_note')
        expect(journal.entries[11]).toEqual(expect.objectContaining({
            idx: 11,
            tag: '0011_checkin',
        }))
    })
})

describe('migration-preflight — 0011 check-in classification', () => {
    it('lists exactly the seven flat table.column entries the migration adds', () => {
        expect(REQUIRED_CHECKIN_OBJECTS.columns).toEqual([
            'events.checkin_enabled',
            'events.checkin_password_hash',
            'events.checkin_password_updated_at',
            'rsvps.checked_in_at',
            'rsvps.plus_one_checked_in_at',
            'rsvps.checked_in_by',
            'rsvps.checkin_note',
        ])
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

    // A DB that has run through exactly 0010 (payments complete, migration
    // 0011's columns absent).
    const objectsAt0010: MigrationObjectState = {
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
        checkinSemantics: Object.fromEntries(
            CHECKIN_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
        ) as CheckinSemanticState,
    }

    const registryUpTo0010 = Array.from({ length: 11 }, (_, index) => ({
        hash: `hash-${index}`,
        createdAt: index,
    }))
    const registryUpTo0011 = [...registryUpTo0010, { hash: 'hash-11', createdAt: 11 }]

    it('classifies an exact 0010 database as ready to apply 0011 (canApply0011)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0010,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0010.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0010,
            expectedCurrentRegistry: registryUpTo0011,
            objects: objectsAt0010,
        })

        expect(result).toMatchObject({
            classification: 'registered-payments-ready',
            canApply0010: false,
            canApply0011: true,
            missingCheckinObjects: REQUIRED_CHECKIN_OBJECTS.columns,
        })
    })

    it('classifies the 0011 objects (applied on a disposable Neon branch) as the current schema — acceptance criterion for pnpm db:preflight', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0011,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0010.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0010,
            expectedCurrentRegistry: registryUpTo0011,
            objects: {
                ...objectsAt0010,
                checkinColumns: [...REQUIRED_CHECKIN_OBJECTS.columns],
                checkinSemantics: validCheckinSemantics,
            },
        })

        expect(result).toMatchObject({
            classification: 'registered-current-schema',
            canApply0011: false,
            missingCheckinObjects: [],
            invalidCheckinSemantics: [],
        })
    })

    it('fails closed for a partial 0011 state (columns present, checkin_password_hash type/nullability not yet valid)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0011,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedPendingStatesRegistry: registryUpTo0010.slice(0, 10),
            expectedPaymentsRegistry: registryUpTo0010,
            expectedCurrentRegistry: registryUpTo0011,
            objects: {
                ...objectsAt0010,
                checkinColumns: [...REQUIRED_CHECKIN_OBJECTS.columns],
                checkinSemantics: {
                    ...validCheckinSemantics,
                    'column.events.checkin_password_hash': false,
                },
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.invalidCheckinSemantics).toContain('column.events.checkin_password_hash')
        expect(result.reasons.join('\n')).toContain('invalid check-in semantics')
    })

    it('binds the semantic query to the exact events/rsvps columns and their declared types', () => {
        expect(CHECKIN_SEMANTICS_QUERY).toContain("table_name = 'events' AND column_name = 'checkin_enabled'")
        expect(CHECKIN_SEMANTICS_QUERY).toContain("table_name = 'events' AND column_name = 'checkin_password_hash'")
        expect(CHECKIN_SEMANTICS_QUERY).toContain("table_name = 'events' AND column_name = 'checkin_password_updated_at'")
        expect(CHECKIN_SEMANTICS_QUERY).toContain("table_name = 'rsvps' AND column_name = 'checked_in_at'")
        expect(CHECKIN_SEMANTICS_QUERY).toContain("table_name = 'rsvps' AND column_name = 'plus_one_checked_in_at'")
        expect(CHECKIN_SEMANTICS_QUERY).toContain("table_name = 'rsvps' AND column_name = 'checked_in_by'")
        expect(CHECKIN_SEMANTICS_QUERY).toContain("table_name = 'rsvps' AND column_name = 'checkin_note'")
        expect(CHECKIN_SEMANTICS_QUERY).toContain("character_maximum_length = 120")
        expect(CHECKIN_SEMANTICS_QUERY).toContain("character_maximum_length = 500")
    })

    it('checkinSemanticStateFromRows ignores unknown/duplicate check names and ungrades unseen checks to false', () => {
        const rows = [
            { check_name: 'column.events.checkin_enabled', valid: true },
            { check_name: 'column.events.checkin_enabled', valid: false }, // duplicate, first wins
            { check_name: 'not-a-real-check', valid: true },
        ]
        const state = checkinSemanticStateFromRows(rows)
        expect(state['column.events.checkin_enabled']).toBe(true)
        expect(state['column.rsvps.checkin_note']).toBe(false)
    })
})
