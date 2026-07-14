import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    classifyMigrationPreflight,
    REQUIRED_HISTORICAL_OBJECTS,
    REQUIRED_IMAGE_POSITION_OBJECTS,
    REQUIRED_PRESENTATION_OBJECTS,
    type MigrationObjectState,
} from '@/lib/migration-preflight'
import {
    CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL,
    EXPECTED_CAPACITY_FUNCTION_BODY_HASH,
    HISTORICAL_SEMANTIC_CHECK_NAMES,
    HISTORICAL_SEMANTICS_QUERY,
    type HistoricalSemanticState,
} from '@/lib/migration-semantic-contract'

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
}

const foundationRegistry = Array.from({ length: 5 }, (_, index) => ({
    hash: `hash-${index}`,
    createdAt: index,
}))
const presentationRegistry = [
    ...foundationRegistry,
    { hash: 'hash-5', createdAt: 5 },
]
const currentRegistry = [
    ...presentationRegistry,
    { hash: 'hash-6', createdAt: 6 },
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

    it('accepts registered current schema only with complete 0005 and 0006 objects', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: currentRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
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
            classification: 'registered-current-schema',
            canApply0006: false,
            missingImagePositionObjects: [],
        })
    })

    it('fails closed for a partial 0006 object state', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: presentationRegistry,
            publicRegistry: null,
            expectedFoundationRegistry: foundationRegistry,
            expectedPresentationRegistry: presentationRegistry,
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
            'registered-presentation-ready',
            'canApply0006: true',
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

    it('keeps the reviewed baseline hashes synchronized with migrations 0000-0006', () => {
        const runbook = readFileSync('docs/PRODUCTION_MIGRATION_RUNBOOK.md', 'utf8')
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ tag: string }>
        }

        for (const entry of journal.entries.slice(0, 7)) {
            const sql = readFileSync(`drizzle/${entry.tag}.sql`, 'utf8')
            const hash = createHash('sha256').update(sql).digest('hex')
            expect(runbook, entry.tag).toContain(hash)
        }
    })

    it('runs the full DB verifier only after 0006 is applied', () => {
        const runbook = readFileSync('docs/PRODUCTION_MIGRATION_RUNBOOK.md', 'utf8')
        const after0005 = runbook.split('## Aplicación transaccional de 0005')[1]
            .split('## Aplicación transaccional de 0006')[0]
        const after0006 = runbook.split('## Aplicación transaccional de 0006')[1]

        expect(after0005).toContain('registered-presentation-ready')
        expect(after0005).toContain('canApply0006: true')
        expect(after0005).not.toContain('npm run verify:db')
        expect(after0006).toContain('npm run verify:db')
        expect(after0006).toContain('registered-current-schema')
    })
})
