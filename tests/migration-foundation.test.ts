import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Snapshot {
    id: string
    prevId: string
    tables: unknown
    enums: unknown
    schemas: unknown
    sequences: unknown
    roles: unknown
    policies: unknown
    views: unknown
    _meta: unknown
}

function readSnapshot(path: string): Snapshot {
    return JSON.parse(readFileSync(path, 'utf8')) as Snapshot
}

describe('migration foundation contract', () => {
    it('idempotently creates every historical object missing from SQL 0000-0003', () => {
        const sql = readFileSync('drizzle/0004_schema_foundation.sql', 'utf8')

        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "display_title"/)
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "require_plus_one_name"/)
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "plus_one_name"/)
        expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "rsvps_event_email_unique"/)
        expect(sql).not.toContain('presentation_mode')
    })

    it('records the foundation as a no-schema-diff snapshot after 0003', () => {
        const snapshot3 = readSnapshot('drizzle/meta/0003_snapshot.json')
        const snapshot4 = readSnapshot('drizzle/meta/0004_snapshot.json')
        const schemaState = ({ id: _id, prevId: _prevId, ...state }: Snapshot) => state

        expect(snapshot4.prevId).toBe(snapshot3.id)
        expect(schemaState(snapshot4)).toEqual(schemaState(snapshot3))
    })

    it('records the foundation at index 4 in the journal', () => {
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string }>
        }

        expect(journal.entries[4]).toEqual(
            expect.objectContaining({ idx: 4, tag: '0004_schema_foundation' }),
        )
    })
})
