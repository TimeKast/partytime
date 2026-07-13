/**
 * Verifies that the database enforces the safety contract the code assumes.
 * Drizzle metadata encodes modeled columns, indexes, FKs, and checks, while
 * this script also verifies manual database objects such as the capacity
 * trigger. Run after pointing DATABASE_URL at any environment and applying
 * migrations:
 *
 *   npm run verify:db
 *
 * Exits non-zero if anything is missing.
 */
import { execFileSync } from 'node:child_process'
import { neon } from '@neondatabase/serverless'
import {
    HISTORICAL_SEMANTIC_CHECK_NAMES,
    HISTORICAL_SEMANTICS_QUERY,
    historicalSemanticStateFromRows,
} from '@/lib/migration-semantic-contract'

type QueryRow = Record<string, unknown>

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

function createQuery(databaseUrl: string): (statement: string) => Promise<QueryRow[]> {
    if (process.env.DB_VERIFY_DRIVER === 'psql') {
        return async statement => {
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
    }

    const sql = neon(databaseUrl)
    return statement => sql.query(statement) as Promise<QueryRow[]>
}

async function main() {
    const url = process.env.DATABASE_URL
    if (!url) {
        console.error('DATABASE_URL not set')
        process.exit(1)
    }
    const query = createQuery(url)

    const checks: Array<[string, boolean]> = []

    const historicalSemantics = historicalSemanticStateFromRows(
        await query(HISTORICAL_SEMANTICS_QUERY),
    )
    for (const checkName of HISTORICAL_SEMANTIC_CHECK_NAMES) {
        checks.push([`historical semantic contract: ${checkName}`, historicalSemantics[checkName]])
    }

    const foundationColumns = await query(`
        SELECT table_name, column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (
              ('events', 'display_title'),
              ('events', 'require_plus_one_name'),
              ('rsvps', 'plus_one_name')
          )`)
    const foundationColumnByName = new Map(
        foundationColumns.map(column => [`${column.table_name}.${column.column_name}`, column]),
    )
    const displayTitle = foundationColumnByName.get('events.display_title')
    const requirePlusOneName = foundationColumnByName.get('events.require_plus_one_name')
    const plusOneName = foundationColumnByName.get('rsvps.plus_one_name')
    checks.push([
        'foundation events.display_title nullable with empty default',
        displayTitle?.is_nullable === 'YES'
            && typeof displayTitle.column_default === 'string'
            && displayTitle.column_default.includes("''"),
    ])
    checks.push([
        'foundation events.require_plus_one_name nullable with false default',
        requirePlusOneName?.is_nullable === 'YES'
            && typeof requirePlusOneName.column_default === 'string'
            && requirePlusOneName.column_default.includes('false'),
    ])
    checks.push([
        'foundation rsvps.plus_one_name nullable',
        plusOneName?.is_nullable === 'YES',
    ])

    const orphans = await query(`
        SELECT count(*)::int AS n FROM rsvps r
        WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.slug = r.event_id)`)
    checks.push(['0 orphan rsvps', orphans[0].n === 0])


    let failed = 0
    for (const [name, ok] of checks) {
        console.log(`${ok ? '✅' : '❌'} ${name}`)
        if (!ok) failed++
    }
    process.exit(failed ? 1 : 0)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
