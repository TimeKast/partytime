/**
 * Verifies that the database enforces the safety contract the code assumes.
 * The drizzle journal doesn't yet encode these (pending B0.5) — this script is
 * the check that a given environment actually has them. Run after pointing
 * DATABASE_URL at any environment, and after applying any migration:
 *
 *   npm run verify:db
 *
 * Exits non-zero if anything is missing.
 */
import { neon } from '@neondatabase/serverless'

async function main() {
    const url = process.env.DATABASE_URL
    if (!url) {
        console.error('DATABASE_URL not set')
        process.exit(1)
    }
    const sql = neon(url)

    const checks: Array<[string, boolean]> = []

    const trigger = await sql`
        SELECT tgenabled FROM pg_trigger WHERE tgname = 'rsvps_capacity_check' AND NOT tgisinternal`
    checks.push(['trigger rsvps_capacity_check (A2-H02 capacity)', trigger.length === 1])

    const fk = await sql`
        SELECT confupdtype, confdeltype FROM pg_constraint WHERE conname = 'rsvps_event_id_events_slug_fk'`
    checks.push([
        'FK rsvps_event_id_events_slug_fk ON UPDATE CASCADE / ON DELETE RESTRICT (A3-02/A6-09)',
        fk.length === 1 && fk[0].confupdtype === 'c' && fk[0].confdeltype === 'r',
    ])

    const unique = await sql`
        SELECT indexname FROM pg_indexes WHERE indexname = 'rsvps_event_email_unique'`
    checks.push(['unique index rsvps_event_email_unique (A2-H05/H06 dedup)', unique.length === 1])

    const orphans = await sql`
        SELECT count(*)::int AS n FROM rsvps r
        WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.slug = r.event_id)`
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
