/**
 * Read-only migration preflight. This script never creates a registry and never
 * applies SQL. It intentionally has no --apply mode.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import {
    classifyMigrationPreflight,
    type MigrationObjectState,
    type MigrationRegistryRow,
} from '@/lib/migration-preflight'
import {
    HISTORICAL_SEMANTICS_QUERY,
    PASSWORD_LIFECYCLE_SEMANTICS_QUERY,
    historicalSemanticStateFromRows,
    passwordLifecycleSemanticStateFromRows,
} from '@/lib/migration-semantic-contract'

interface JournalEntry {
    idx: number
    tag: string
    when: number
}

type QueryRow = Record<string, unknown>

interface SqlClient {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<QueryRow[]>
    query(statement: string): Promise<QueryRow[]>
}

function psqlEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
    const parsed = new URL(databaseUrl)
    const sslMode = parsed.searchParams.get('sslmode')
    return {
        ...process.env,
        PGHOST: parsed.hostname,
        PGPORT: parsed.port || '5432',
        PGUSER: decodeURIComponent(parsed.username),
        PGPASSWORD: decodeURIComponent(parsed.password),
        PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
        ...(sslMode ? { PGSSLMODE: sslMode } : {}),
    }
}

function createSqlClient(databaseUrl: string): SqlClient {
    if (process.env.DB_PREFLIGHT_DRIVER !== 'psql') {
        return neon(databaseUrl) as unknown as SqlClient
    }

    const query = async (statement: string): Promise<QueryRow[]> => {
        const wrapped = `SELECT COALESCE(json_agg(row_to_json(result)), '[]'::json) FROM (${statement}) result;`
        const output = execFileSync(process.env.PSQL_BIN || 'psql', [
            '-X',
            '--no-psqlrc',
            '--tuples-only',
            '--no-align',
            '--set',
            'ON_ERROR_STOP=1',
            '--command',
            wrapped,
        ], {
            encoding: 'utf8',
            env: psqlEnvironment(databaseUrl),
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim()
        return JSON.parse(output || '[]') as QueryRow[]
    }
    const tagged = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        if (values.length > 0) {
            throw new Error('The local psql preflight driver does not interpolate values.')
        }
        return query(strings.join(''))
    }) as SqlClient
    tagged.query = query
    return tagged
}

function expectedRegistry(): MigrationRegistryRow[] {
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
        entries: JournalEntry[]
    }
    return journal.entries.map(entry => ({
        hash: createHash('sha256')
            .update(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'))
            .digest('hex'),
        createdAt: entry.when,
    }))
}

async function main() {
    if (process.argv.slice(2).some(argument => argument !== '--json')) {
        console.error('This utility is read-only and supports only --json; it has no apply mode.')
        process.exit(2)
    }
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
        console.error('DATABASE_URL must be provided explicitly in the process environment.')
        process.exit(2)
    }

    const sql = createSqlClient(databaseUrl)
    const [targetIdentity] = await sql`
        SELECT
            md5(
                current_database() || '|' || current_user || '|'
                || coalesce(inet_server_addr()::text, 'local') || '|'
                || coalesce(inet_server_port()::text, 'local')
            ) AS fingerprint,
            current_schema() AS current_schema`
    const [registryPresence] = await sql`
        SELECT
            to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS drizzle_registry,
            to_regclass('public.__drizzle_migrations') IS NOT NULL AS public_registry`

    const drizzleRegistry: MigrationRegistryRow[] | null = registryPresence.drizzle_registry
        ? (await sql`
            SELECT hash, created_at
            FROM drizzle.__drizzle_migrations
            ORDER BY created_at ASC, id ASC`
        ).map(row => ({ hash: String(row.hash), createdAt: Number(row.created_at) }))
        : null
    const publicRegistry: MigrationRegistryRow[] | null = registryPresence.public_registry
        ? (await sql`
            SELECT hash, created_at
            FROM public.__drizzle_migrations
            ORDER BY created_at ASC, id ASC`
        ).map(row => ({ hash: String(row.hash), createdAt: Number(row.created_at) }))
        : null

    const tables = (await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('app_settings', 'events', 'password_reset_tokens', 'rsvps', 'user_event_assignments', 'user_sessions', 'users')`
    ).map(row => String(row.table_name))
    const columns = (await sql`
        SELECT table_name || '.' || column_name AS name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (
              'app_settings', 'events', 'password_reset_tokens', 'rsvps', 'user_event_assignments', 'user_sessions', 'users'
          )`
    ).map(row => String(row.name))
    const constraints = (await sql`
        SELECT conname
        FROM pg_constraint
        WHERE conname IN (
            'app_settings_pkey',
            'events_pkey',
            'events_slug_unique',
            'rsvps_pkey',
            'rsvps_event_id_events_slug_fk',
            'user_event_assignments_pkey',
            'user_sessions_pkey',
            'user_sessions_token_unique',
            'users_pkey',
            'users_email_unique'
        )`
    ).map(row => String(row.conname))
    const indexes = (await sql`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'rsvps_event_email_unique'`
    ).map(row => String(row.indexname))
    const triggers = (await sql`
        SELECT tgname
        FROM pg_trigger
        WHERE tgname = 'rsvps_capacity_check' AND NOT tgisinternal`
    ).map(row => String(row.tgname))
    const functions = (await sql`
        SELECT proname
        FROM pg_proc
        JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
        WHERE pg_namespace.nspname = 'public' AND proname = 'enforce_event_capacity'`
    ).map(row => String(row.proname))
    const historicalSemantics = historicalSemanticStateFromRows(
        await sql.query(HISTORICAL_SEMANTICS_QUERY),
    )

    let duplicateEventEmailGroups = -1
    let orphanRsvps = -1
    if (tables.includes('events') && tables.includes('rsvps')) {
        const [duplicates] = await sql`
            SELECT count(*)::int AS count
            FROM (
                SELECT event_id, lower(email)
                FROM rsvps
                GROUP BY event_id, lower(email)
                HAVING count(*) > 1
            ) duplicate_groups`
        duplicateEventEmailGroups = Number(duplicates.count)
        const [orphans] = await sql`
            SELECT count(*)::int AS count
            FROM rsvps r
            WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.slug = r.event_id)`
        orphanRsvps = Number(orphans.count)
    }

    const presentationColumns = (await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'events'
          AND column_name IN (
              'presentation_mode',
              'rsvp_title',
              'rsvp_button_label',
              'background_overlay_strength',
              'background_image_fit'
          )`
    ).map(row => String(row.column_name))
    const presentationConstraints = (await sql`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.events'::regclass
          AND conname IN (
            'events_presentation_mode_check',
            'events_background_image_fit_check',
            'events_background_overlay_strength_check',
            'events_rsvp_button_label_check'
        )`
    ).map(row => String(row.conname))
    const imagePositionColumns = (await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'events'
          AND column_name = 'background_image_position'`
    ).map(row => String(row.column_name))
    const imagePositionConstraints = (await sql`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.events'::regclass
          AND conname = 'events_background_image_position_check'`
    ).map(row => String(row.conname))
    const passwordLifecycleTables = tables.filter(table => table === 'password_reset_tokens')
    const passwordLifecycleColumns = columns.filter(column => (
        column === 'users.must_change_password' || column.startsWith('password_reset_tokens.')
    ))
    const passwordLifecycleConstraints = (await sql`
        SELECT conname
        FROM pg_constraint
        WHERE connamespace = to_regnamespace('public')
          AND conname IN (
              'password_reset_tokens_pkey',
              'password_reset_tokens_user_id_users_id_fk'
          )`
    ).map(row => String(row.conname))
    const passwordLifecycleIndexes = (await sql`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
              'password_reset_tokens_token_hash_unique',
              'password_reset_tokens_user_id_idx',
              'password_reset_tokens_expires_at_idx',
              'password_reset_tokens_active_slot_unique'
          )`
    ).map(row => String(row.indexname))
    const passwordLifecycleSemantics = passwordLifecycleSemanticStateFromRows(
        await sql.query(PASSWORD_LIFECYCLE_SEMANTICS_QUERY),
    )

    const objects: MigrationObjectState = {
        tables,
        columns,
        constraints,
        indexes,
        triggers,
        functions,
        historicalSemantics,
        duplicateEventEmailGroups,
        orphanRsvps,
        presentationColumns,
        presentationConstraints,
        imagePositionColumns,
        imagePositionConstraints,
        passwordLifecycleTables,
        passwordLifecycleColumns,
        passwordLifecycleConstraints,
        passwordLifecycleIndexes,
        passwordLifecycleSemantics,
    }
    const expected = expectedRegistry()
    const result = classifyMigrationPreflight({
        drizzleRegistry,
        publicRegistry,
        expectedFoundationRegistry: expected.slice(0, 5),
        expectedPresentationRegistry: expected.slice(0, 6),
        expectedImagePositionRegistry: expected.slice(0, 7),
        expectedCurrentRegistry: expected.slice(0, 8),
        objects,
    })

    const output = {
        ...result,
        target: {
            fingerprint: String(targetIdentity.fingerprint),
            currentSchema: String(targetIdentity.current_schema),
        },
        registry: { drizzleRegistry, publicRegistry },
        objects,
    }
    console.log(process.argv.includes('--json') ? JSON.stringify(output, null, 2) : output)
    if (
        !result.canApply0005
        && !result.canApply0006
        && !result.canApply0007
        && result.classification !== 'registered-current-schema'
    ) {
        process.exitCode = 1
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
