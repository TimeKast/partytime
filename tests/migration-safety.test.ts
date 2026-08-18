import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    classifyMigrationPreflight,
    REQUIRED_HISTORICAL_OBJECTS,
    REQUIRED_IMAGE_POSITION_OBJECTS,
    REQUIRED_PASSWORD_LIFECYCLE_OBJECTS,
    REQUIRED_PENDING_STATES_OBJECTS,
    REQUIRED_PRESENTATION_OBJECTS,
    REQUIRED_RSVP_INVITATION_OBJECTS,
    type MigrationObjectState,
} from '@/lib/migration-preflight'
import {
    CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL,
    CHECKIN_SEMANTIC_CHECK_NAMES,
    EXPECTED_CAPACITY_FUNCTION_BODY_HASH,
    HISTORICAL_SEMANTIC_CHECK_NAMES,
    HISTORICAL_SEMANTICS_QUERY,
    PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES,
    PASSWORD_LIFECYCLE_SEMANTICS_QUERY,
    PENDING_STATES_SEMANTIC_CHECK_NAMES,
    type CheckinSemanticState,
    type HistoricalSemanticState,
    type PasswordLifecycleSemanticState,
    type PendingStatesSemanticState,
} from '@/lib/migration-semantic-contract'
import {
    RSVP_INVITATION_SEMANTIC_CHECK_NAMES,
    RSVP_INVITATION_SEMANTICS_QUERY,
    type RsvpInvitationSemanticState,
} from '@/lib/rsvp-invitation-migration-contract'
import {
    PAYMENTS_SEMANTIC_CHECK_NAMES,
    type PaymentsSemanticState,
} from '@/lib/rsvp-payments-migration-contract'

function capacityFunctionBodyFromMigration(): string {
    const migration = readFileSync('drizzle/0002_enforce_event_capacity.sql', 'utf8')
    const body = migration.match(/RETURNS trigger AS \$\$([\s\S]*?)\$\$ LANGUAGE plpgsql/)?.[1]
    expect(body).toBeDefined()
    return body!
}

function capacityFunctionBodyFingerprint(body: string): string {
    const normalizedBody = body.trim().replace(/\s+/g, ' ')
    return createHash('md5').update(normalizedBody).digest('hex')
}

const validHistoricalSemantics = Object.fromEntries(
    HISTORICAL_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
) as HistoricalSemanticState
const validPasswordLifecycleSemantics = Object.fromEntries(
    PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
) as PasswordLifecycleSemanticState
const absentPasswordLifecycleSemantics = Object.fromEntries(
    PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
) as PasswordLifecycleSemanticState
const validRsvpInvitationSemantics = Object.fromEntries(
    RSVP_INVITATION_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
) as RsvpInvitationSemanticState
const absentRsvpInvitationSemantics = Object.fromEntries(
    RSVP_INVITATION_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
) as RsvpInvitationSemanticState
// ISSUE-005: 0009 has not been applied to any real database yet, so every
// fixture in this file (all pinned to production evidence through 0008)
// represents pending states as absent — see tests/pending-states.test.ts for
// the 0009-applied classification coverage.
const absentPendingStatesSemantics = Object.fromEntries(
    PENDING_STATES_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
) as PendingStatesSemanticState
// ISSUE-010: 0010 has not been applied to any real database yet either, so
// every fixture in this file also represents payments as absent — see
// tests/pending-states.test.ts for the 0010-applied classification coverage.
const absentPaymentsSemantics = Object.fromEntries(
    PAYMENTS_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
) as PaymentsSemanticState
// ISSUE-015: 0011 has not been applied to any real database yet either, so
// every fixture in this file also represents check-in as absent — see
// tests/checkin-migration.test.ts for the 0011-applied classification coverage.
const absentCheckinSemantics = Object.fromEntries(
    CHECKIN_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
) as CheckinSemanticState

const observedHistoricalObjects: MigrationObjectState = {
    tables: [...REQUIRED_HISTORICAL_OBJECTS.tables],
    columns: [...REQUIRED_HISTORICAL_OBJECTS.columns],
    constraints: [...REQUIRED_HISTORICAL_OBJECTS.constraints],
    indexes: [...REQUIRED_HISTORICAL_OBJECTS.indexes],
    triggers: [...REQUIRED_HISTORICAL_OBJECTS.triggers],
    functions: [...REQUIRED_HISTORICAL_OBJECTS.functions],
    historicalSemantics: validHistoricalSemantics,
    duplicateEventEmailGroups: 0,
    orphanRsvps: 0,
    presentationColumns: [],
    presentationConstraints: [],
    imagePositionColumns: [],
    imagePositionConstraints: [],
    passwordLifecycleTables: [],
    passwordLifecycleColumns: [],
    passwordLifecycleConstraints: [],
    passwordLifecycleIndexes: [],
    passwordLifecycleSemantics: absentPasswordLifecycleSemantics,
    rsvpInvitationTables: [],
    rsvpInvitationColumns: [],
    rsvpInvitationConstraints: [],
    rsvpInvitationIndexes: [],
    rsvpInvitationSemantics: absentRsvpInvitationSemantics,
    pendingStatesColumns: [],
    pendingStatesSemantics: absentPendingStatesSemantics,
    paymentsTables: [],
    paymentsColumns: [],
    paymentsConstraints: [],
    paymentsIndexes: [],
    paymentsSemantics: absentPaymentsSemantics,
    checkinColumns: [],
    checkinSemantics: absentCheckinSemantics,
}

const foundationRegistry = Array.from({ length: 5 }, (_, index) => ({
    hash: `hash-${index}`,
    createdAt: index,
}))
const presentationRegistry = [
    ...foundationRegistry,
    { hash: 'hash-5', createdAt: 5 },
]
const imagePositionRegistry = [
    ...presentationRegistry,
    { hash: 'hash-6', createdAt: 6 },
]
const passwordLifecycleRegistry = [
    ...imagePositionRegistry,
    { hash: 'hash-7', createdAt: 7 },
]
const currentRegistry = [
    ...passwordLifecycleRegistry,
    { hash: 'hash-8', createdAt: 8 },
]

describe('production migration safety', () => {
    it('accepts the reviewed capacity body and rejects case-changed string literals', () => {
        const originalBody = capacityFunctionBodyFromMigration()
        const caseChangedBody = originalBody.replace(
            "NEW.status = 'confirmed'",
            "NEW.status = 'CONFIRMED'",
        )
        const legacyFingerprint = (body: string) => createHash('md5')
            .update(body.trim().toLowerCase().replace(/\s+/g, ' '))
            .digest('hex')

        expect(caseChangedBody).not.toBe(originalBody)
        expect(caseChangedBody.match(/'CONFIRMED'/g)).toHaveLength(1)
        expect(legacyFingerprint(caseChangedBody)).toBe(legacyFingerprint(originalBody))
        expect(capacityFunctionBodyFingerprint(originalBody))
            .toBe(EXPECTED_CAPACITY_FUNCTION_BODY_HASH)
        expect(capacityFunctionBodyFingerprint(caseChangedBody))
            .not.toBe(EXPECTED_CAPACITY_FUNCTION_BODY_HASH)
    })

    it('keeps the shared and baseline capacity fingerprints identical and case-sensitive', () => {
        const runbook = readFileSync('docs/PRODUCTION_MIGRATION_RUNBOOK.md', 'utf8')
        const expectedComparison = `${CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL}\n        = '${EXPECTED_CAPACITY_FUNCTION_BODY_HASH}'`

        expect(HISTORICAL_SEMANTICS_QUERY).toContain(
            `${CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL} = '${EXPECTED_CAPACITY_FUNCTION_BODY_HASH}'`,
        )
        expect(runbook).toContain(expectedComparison)
        expect(HISTORICAL_SEMANTICS_QUERY).not.toMatch(/lower\s*\([^)]*prosrc/i)
        expect(runbook).not.toMatch(/lower\s*\([^)]*prosrc/i)
    })

    it('classifies the observed production evidence as unregistered historical schema', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: null,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedCurrentRegistry: [],
            objects: observedHistoricalObjects,
        })

        expect(result).toMatchObject({
            classification: 'unregistered-historical-schema',
            canBaseline0000Through0004: true,
            canApply0005: false,
            missingHistoricalObjects: [],
        })
        expect(result.reasons).toContain('migration registry is absent')
    })

    it('refuses an absent registry when historical state is incomplete', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: null,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedCurrentRegistry: [],
            objects: { ...observedHistoricalObjects, triggers: [] },
        })

        expect(result.classification).toBe('unregistered-inconsistent-schema')
        expect(result.canBaseline0000Through0004).toBe(false)
        expect(result.canApply0005).toBe(false)
    })

    it.each([
        ['disabled capacity trigger', 'trigger.rsvps_capacity_check'],
        ['wrong capacity function body', 'function.enforce_event_capacity'],
        ['wrong same-named dedup index', 'index.rsvps_event_email_unique'],
        ['wrong FK table/definition', 'constraint.rsvps_event_id_events_slug_fk'],
    ] as const)('refuses baseline for a %s', (_scenario, failedCheck) => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: null,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedCurrentRegistry: [],
            objects: {
                ...observedHistoricalObjects,
                historicalSemantics: { ...validHistoricalSemantics, [failedCheck]: false },
            },
        })

        expect(result.classification).toBe('unregistered-inconsistent-schema')
        expect(result.canBaseline0000Through0004).toBe(false)
        expect(result.invalidHistoricalSemantics).toContain(failedCheck)
        expect(result.reasons.join('\n')).toContain('invalid historical semantics')
    })

    it('allows 0006 only from the exact registered 0005 presentation state', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: presentationRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
            expectedImagePositionRegistry: imagePositionRegistry,
            expectedCurrentRegistry: currentRegistry,
            objects: {
                ...observedHistoricalObjects,
                presentationColumns: [...REQUIRED_PRESENTATION_OBJECTS.columns],
                presentationConstraints: [...REQUIRED_PRESENTATION_OBJECTS.constraints],
            },
        })

        expect(result).toMatchObject({
            classification: 'registered-presentation-ready',
            canApply0005: false,
            canApply0006: true,
            missingImagePositionObjects: [
                'background_image_position',
                'events_background_image_position_check',
            ],
        })
    })

    it('scopes presentation constraints to public.events before classifying the schema', () => {
        const source = readFileSync('scripts/migration-preflight.ts', 'utf8')
        const presentationQuery = source.slice(
            source.indexOf('const presentationConstraints'),
            source.indexOf('const imagePositionColumns'),
        )
        const imagePositionQuery = source.slice(
            source.indexOf('const imagePositionConstraints'),
            source.indexOf('const objects:'),
        )

        expect(presentationQuery).toContain("conrelid = 'public.events'::regclass")
        expect(imagePositionQuery).toContain("conrelid = 'public.events'::regclass")
    })

    it('allows 0007 only from the exact registered 0006 image-position state', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: imagePositionRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
            expectedImagePositionRegistry: imagePositionRegistry,
            expectedCurrentRegistry: currentRegistry,
            objects: {
                ...observedHistoricalObjects,
                presentationColumns: [...REQUIRED_PRESENTATION_OBJECTS.columns],
                presentationConstraints: [...REQUIRED_PRESENTATION_OBJECTS.constraints],
                imagePositionColumns: [...REQUIRED_IMAGE_POSITION_OBJECTS.columns],
                imagePositionConstraints: [...REQUIRED_IMAGE_POSITION_OBJECTS.constraints],
            },
        })

        expect(result).toMatchObject({
            classification: 'registered-image-position-ready',
            canApply0006: false,
            canApply0007: true,
            missingImagePositionObjects: [],
        })
    })

    it('allows 0008 only from the exact registered password lifecycle state', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: passwordLifecycleRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
            expectedImagePositionRegistry: imagePositionRegistry,
            expectedCurrentRegistry: currentRegistry,
            objects: {
                ...observedHistoricalObjects,
                presentationColumns: [...REQUIRED_PRESENTATION_OBJECTS.columns],
                presentationConstraints: [...REQUIRED_PRESENTATION_OBJECTS.constraints],
                imagePositionColumns: [...REQUIRED_IMAGE_POSITION_OBJECTS.columns],
                imagePositionConstraints: [...REQUIRED_IMAGE_POSITION_OBJECTS.constraints],
                passwordLifecycleTables: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.tables],
                passwordLifecycleColumns: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.columns],
                passwordLifecycleConstraints: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.constraints],
                passwordLifecycleIndexes: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.indexes],
                passwordLifecycleSemantics: validPasswordLifecycleSemantics,
            },
        })

        expect(result).toMatchObject({
            classification: 'registered-password-lifecycle-ready',
            canApply0007: false,
            canApply0008: true,
            missingPasswordLifecycleObjects: [],
            invalidPasswordLifecycleSemantics: [],
        })
    })

    // ISSUE-005: this exact object state (0008-complete, 0009's columns still
    // absent) used to be the terminal 'registered-current-schema' before
    // migration 0009 existed. Now that 0009 exists, this state is one step
    // behind "current" — it's the new intermediate registered-rsvp-invitation-ready
    // gate, mirroring how registered-password-lifecycle-ready was introduced
    // when 0008 shipped. See tests/pending-states.test.ts for the classification
    // of a database that has actually run 0009.
    it('accepts registered-rsvp-invitation-ready only with exact 0008 objects and semantics, ready for 0009', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: currentRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
            expectedImagePositionRegistry: imagePositionRegistry,
            expectedPasswordLifecycleRegistry: passwordLifecycleRegistry,
            expectedRsvpInvitationRegistry: currentRegistry,
            expectedCurrentRegistry: currentRegistry,
            objects: {
                ...observedHistoricalObjects,
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
            },
        })

        expect(result).toMatchObject({
            classification: 'registered-rsvp-invitation-ready',
            canApply0008: false,
            canApply0009: true,
            missingRsvpInvitationObjects: [],
            invalidRsvpInvitationSemantics: [],
            missingPendingStatesObjects: [...REQUIRED_PENDING_STATES_OBJECTS.columns],
        })
    })

    it('fails closed when a same-named 0008 object has invalid semantics', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: currentRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
            expectedImagePositionRegistry: imagePositionRegistry,
            expectedPasswordLifecycleRegistry: passwordLifecycleRegistry,
            expectedCurrentRegistry: currentRegistry,
            objects: {
                ...observedHistoricalObjects,
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
                rsvpInvitationSemantics: {
                    ...validRsvpInvitationSemantics,
                    'constraint.rsvp_invitation_links_event_fk': false,
                },
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.invalidRsvpInvitationSemantics)
            .toContain('constraint.rsvp_invitation_links_event_fk')
        expect(result.reasons.join('\n')).toContain('invalid RSVP invitation semantics')
    })

    it('rejects a same-named reset-token primary key with invalid semantics', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: currentRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
            expectedImagePositionRegistry: imagePositionRegistry,
            expectedCurrentRegistry: currentRegistry,
            objects: {
                ...observedHistoricalObjects,
                presentationColumns: [...REQUIRED_PRESENTATION_OBJECTS.columns],
                presentationConstraints: [...REQUIRED_PRESENTATION_OBJECTS.constraints],
                imagePositionColumns: [...REQUIRED_IMAGE_POSITION_OBJECTS.columns],
                imagePositionConstraints: [...REQUIRED_IMAGE_POSITION_OBJECTS.constraints],
                passwordLifecycleTables: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.tables],
                passwordLifecycleColumns: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.columns],
                passwordLifecycleConstraints: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.constraints],
                passwordLifecycleIndexes: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.indexes],
                passwordLifecycleSemantics: {
                    ...validPasswordLifecycleSemantics,
                    'constraint.password_reset_tokens_pkey': false,
                },
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.invalidPasswordLifecycleSemantics)
            .toContain('constraint.password_reset_tokens_pkey')
        expect(result.reasons.join('\n')).toContain('invalid password lifecycle semantics')
    })

    it('fails closed for a partial 0006 object state', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: presentationRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
            expectedImagePositionRegistry: imagePositionRegistry,
            expectedCurrentRegistry: currentRegistry,
            objects: {
                ...observedHistoricalObjects,
                presentationColumns: [...REQUIRED_PRESENTATION_OBJECTS.columns],
                presentationConstraints: [...REQUIRED_PRESENTATION_OBJECTS.constraints],
                imagePositionColumns: ['background_image_position'],
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.canApply0006).toBe(false)
    })

    it('fails closed for a partial 0007 password lifecycle state', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: imagePositionRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
            expectedImagePositionRegistry: imagePositionRegistry,
            expectedCurrentRegistry: currentRegistry,
            objects: {
                ...observedHistoricalObjects,
                presentationColumns: [...REQUIRED_PRESENTATION_OBJECTS.columns],
                presentationConstraints: [...REQUIRED_PRESENTATION_OBJECTS.constraints],
                imagePositionColumns: [...REQUIRED_IMAGE_POSITION_OBJECTS.columns],
                imagePositionConstraints: [...REQUIRED_IMAGE_POSITION_OBJECTS.constraints],
                passwordLifecycleColumns: ['users.must_change_password'],
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.canApply0007).toBe(false)
        expect(result.missingPasswordLifecycleObjects).toContain('password_reset_tokens')
    })

    it('keeps 0007 additive, idempotent and indexed', () => {
        const migration = readFileSync('drizzle/0007_password_lifecycle.sql', 'utf8')

        expect(migration).toContain('ADD COLUMN IF NOT EXISTS "must_change_password"')
        expect(migration).toContain('CREATE TABLE IF NOT EXISTS "password_reset_tokens"')
        expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_unique"')
        expect(migration).toContain('CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx"')
        expect(migration).toContain('CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx"')
        expect(migration).toContain('ADD COLUMN IF NOT EXISTS "issuance_slot"')
        expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_active_slot_unique"')
        expect(migration).toContain('WHERE "consumed_at" IS NULL AND "issuance_slot" IS NOT NULL')
        expect(migration).toContain('WHEN duplicate_object THEN NULL')
        expect(migration).toContain('ON DELETE cascade')
        expect(migration).not.toMatch(/\bDROP\b/i)
    })

    it('binds semantic SQL to schema, relations, columns, actions, body and enabled state', () => {
        const contract = readFileSync('lib/migration-semantic-contract.ts', 'utf8')

        expect(contract).toContain("to_regclass('public.rsvps')")
        expect(contract).toContain("to_regclass('public.events')")
        expect(contract).toContain("column_names = ARRAY['event_id']")
        expect(contract).toContain("referenced_column_names = ARRAY['slug']")
        expect(contract).toContain("confupdtype = 'c'")
        expect(contract).toContain("confdeltype = 'r'")
        expect(contract).toContain('indisunique')
        expect(contract).toContain("second_key = 'lower(email)'")
        expect(contract).toContain("tgenabled = 'O'")
        expect(contract).toContain("tgfoid = to_regprocedure('public.enforce_event_capacity()')")
        expect(contract).toContain('pg_get_function_identity_arguments')
        expect(contract).toContain(EXPECTED_CAPACITY_FUNCTION_BODY_HASH)
        expect(PASSWORD_LIFECYCLE_SEMANTICS_QUERY).toContain("to_regclass('public.password_reset_tokens')")
        expect(PASSWORD_LIFECYCLE_SEMANTICS_QUERY).toContain("'constraint.password_reset_tokens_pkey'::text")
        expect(PASSWORD_LIFECYCLE_SEMANTICS_QUERY).toContain("pk.contype = 'p'")
        expect(PASSWORD_LIFECYCLE_SEMANTICS_QUERY).toContain("ARRAY['id']::text[]")
        expect(PASSWORD_LIFECYCLE_SEMANTICS_QUERY).toContain('convalidated')
        expect(PASSWORD_LIFECYCLE_SEMANTICS_QUERY).toContain("confdeltype = 'c'")
        expect(PASSWORD_LIFECYCLE_SEMANTICS_QUERY).toContain('index_state.indisunique = expected.unique_required')
    })

    it('binds the 0008 semantic contract to exact columns, cascades and unique hash index', () => {
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain("to_regclass('public.rsvp_invitation_links')")
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain("confupdtype = 'c'")
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain("confdeltype = 'c'")
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain("confdeltype = 'n'")
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain('AND indisunique AND indisvalid')
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain('token_hash')
    })

    it('accepts only the exact 0008 invitation columns or the complete 0009 flag pair', () => {
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain(
            "table_name = 'rsvp_invitation_links') IN (10, 12)",
        )
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain(
            "column_name IN ('is_courtesy', 'skip_verification')) IN (0, 2)",
        )
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain('AND column_name NOT IN (')
        expect(RSVP_INVITATION_SEMANTICS_QUERY).toContain(
            "'created_at', 'is_courtesy', 'skip_verification'",
        )
    })

    it('keeps the baseline transaction bounded, locked and fail-closed on the full contract', () => {
        const runbook = readFileSync('docs/PRODUCTION_MIGRATION_RUNBOOK.md', 'utf8')

        for (const guard of [
            "SET LOCAL lock_timeout = '5s'",
            "SET LOCAL statement_timeout = '30s'",
            'pg_advisory_xact_lock(134770013, 4)',
            'expected_target_fingerprint',
            "current_schema() <> 'public'",
            'LOCK TABLE',
            "to_regclass('drizzle.__drizzle_migrations')",
            'missing historical columns',
            'invalid historical constraints',
            'FK semantics differ from migration 0003',
            'dedup index semantics differ from migration 0004',
            'capacity trigger semantics/enabled state differ from migration 0002',
            'capacity function signature/body differ from migration 0002',
            'orphan RSVPs detected',
            'duplicate event/email groups detected',
            '0005 objects already exist',
            '0006 objects already exist',
            '0007 objects already exist',
            'registered-presentation-ready',
            'canApply0006: true',
            'registered-image-position-ready',
            'canApply0007: true',
            CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL,
            EXPECTED_CAPACITY_FUNCTION_BODY_HASH,
        ]) {
            expect(runbook, guard).toContain(guard)
        }

        expect(runbook.match(/attname::text/g)).toHaveLength(4)
        expect(runbook).not.toMatch(/SELECT (?:attribute|a)\.attname(?:\s|FROM)/)
    })

    it('contains no direct schema-push command in operator docs or package scripts', () => {
        const paths = [
            'README.md',
            'COMMANDS.md',
            'SETUP_GUIDE.md',
            'package.json',
            'docs/PRODUCTION_MIGRATION_RUNBOOK.md',
            'docs/SUPUESTOS_Y_DECISIONES_TOMADAS.md',
        ]
        const unsafeCommand = ['db', 'push'].join(':')
        const unsafeCli = ['drizzle-kit', 'push'].join(' ')

        for (const path of paths) {
            const contents = readFileSync(path, 'utf8')
            expect(contents, path).not.toContain(unsafeCommand)
            expect(contents, path).not.toContain(unsafeCli)
        }
    })

    it('keeps the reviewed hashes synchronized with migrations 0000-0008', () => {
        const runbook = readFileSync('docs/PRODUCTION_MIGRATION_RUNBOOK.md', 'utf8')
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ tag: string }>
        }

        for (const entry of journal.entries.slice(0, 9)) {
            const sql = readFileSync(`drizzle/${entry.tag}.sql`, 'utf8')
            const hash = createHash('sha256').update(sql).digest('hex')
            expect(runbook, entry.tag).toContain(hash)
        }
    })

    it('runs the full DB verifier only after 0008 is applied on each target', () => {
        const runbook = readFileSync('docs/PRODUCTION_MIGRATION_RUNBOOK.md', 'utf8')
        const after0005 = runbook.split('## Aplicación transaccional de 0005')[1]
            .split('## Aplicación transaccional de 0006')[0]
        const after0006 = runbook.split('## Aplicación transaccional de 0006')[1]
            .split('## Ensayo obligatorio de 0007')[0]
        const after0007 = runbook.split('## Aplicación transaccional de 0007')[1]
            .split('## Ensayo obligatorio de 0008')[0]
        const after0008 = runbook.split('## Aplicación transaccional de 0008')[1]

        expect(after0005).toContain('registered-presentation-ready')
        expect(after0005).toContain('canApply0006: true')
        expect(after0005).not.toContain('npm run verify:db')
        expect(after0006).toContain('registered-image-position-ready')
        expect(after0006).toContain('canApply0007: true')
        expect(after0006).not.toContain('npm run verify:db')
        expect(after0007).toContain('registered-password-lifecycle-ready')
        expect(after0007).toContain('canApply0008: true')
        expect(after0007).not.toContain('npm run verify:db')
        expect(after0008).toContain('npm run verify:db')
        expect(after0008).toContain('registered-current-schema')
    })
})
