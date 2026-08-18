import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('one-time RSVP invitation migration contract', () => {
    it('adds the capability table, event lifecycle FK and lookup indexes without destructive SQL', () => {
        const migration = readFileSync('drizzle/0008_rsvp_invitation_links.sql', 'utf8')

        expect(migration).toContain('CREATE TABLE "rsvp_invitation_links"')
        expect(migration).toContain('"token_hash" varchar(64) NOT NULL')
        expect(migration).toContain('"used_rsvp_id" text')
        expect(migration).toContain('"revoked_by" text')
        expect(migration).toContain('"expires_at" timestamp with time zone NOT NULL')
        expect(migration).toContain('"used_at" timestamp with time zone')
        expect(migration).toContain('"revoked_at" timestamp with time zone')
        expect(migration).toContain('"created_by" text NOT NULL')
        expect(migration).toContain('ON DELETE cascade ON UPDATE cascade')
        expect(migration).toContain('CREATE INDEX "rsvp_invitation_links_event_id_idx"')
        expect(migration).toContain('CREATE UNIQUE INDEX "rsvp_invitation_links_token_hash_unique"')
        expect(migration).toContain('rsvp_invitation_links_used_rsvp_id_rsvps_id_fk')
        expect(migration).not.toMatch(/created_by_users|FOREIGN KEY \("created_by"\)/)
        expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|UPDATE)\b/im)
    })

    it('chains generated snapshot and journal entry after 0007', () => {
        const snapshot7 = JSON.parse(readFileSync('drizzle/meta/0007_snapshot.json', 'utf8')) as { id: string }
        const snapshot8 = JSON.parse(readFileSync('drizzle/meta/0008_snapshot.json', 'utf8')) as {
            prevId: string
            tables: Record<string, unknown>
        }
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string }>
        }

        expect(snapshot8.prevId).toBe(snapshot7.id)
        expect(snapshot8.tables).toHaveProperty('public.rsvp_invitation_links')
        expect(journal.entries[8]).toEqual(expect.objectContaining({
            idx: 8,
            tag: '0008_rsvp_invitation_links',
        }))
    })
})
