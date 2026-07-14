import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Snapshot {
    id: string
    prevId: string
}

describe('invitation presentation migration contract', () => {
    it('keeps 0005 additive and focused on presentation columns and checks', () => {
        const sql = readFileSync('drizzle/0005_invitation_presentation.sql', 'utf8')

        expect(sql).toContain('ADD COLUMN "presentation_mode"')
        expect(sql).toContain('ADD COLUMN "rsvp_title"')
        expect(sql).toContain('ADD COLUMN "rsvp_button_label"')
        expect(sql).toContain('ADD COLUMN "background_overlay_strength"')
        expect(sql).toContain('ADD COLUMN "background_image_fit"')
        expect(sql).not.toMatch(/\b(?:DROP|DELETE|UPDATE)\b/i)
    })

    it('chains the 0005 snapshot and journal entry after foundation 0004', () => {
        const snapshot4 = JSON.parse(readFileSync('drizzle/meta/0004_snapshot.json', 'utf8')) as Snapshot
        const snapshot5 = JSON.parse(readFileSync('drizzle/meta/0005_snapshot.json', 'utf8')) as Snapshot
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string }>
        }

        expect(snapshot5.prevId).toBe(snapshot4.id)
        expect(journal.entries[5]).toEqual(
            expect.objectContaining({ idx: 5, tag: '0005_invitation_presentation' }),
        )
    })

    it('keeps 0006 additive and constrained to centered or top image position', () => {
        const sql = readFileSync('drizzle/0006_invitation_image_position.sql', 'utf8')

        expect(sql).toContain('ADD COLUMN "background_image_position" varchar(12) DEFAULT \'center\' NOT NULL')
        expect(sql).toContain('events_background_image_position_check')
        expect(sql).toContain("in ('center', 'top')")
        expect(sql).not.toMatch(/\b(?:DROP|DELETE|UPDATE)\b/i)
    })

    it('chains the 0006 snapshot and journal entry after presentation 0005', () => {
        const snapshot5 = JSON.parse(readFileSync('drizzle/meta/0005_snapshot.json', 'utf8')) as Snapshot
        const snapshot6 = JSON.parse(readFileSync('drizzle/meta/0006_snapshot.json', 'utf8')) as Snapshot
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string }>
        }

        expect(snapshot6.prevId).toBe(snapshot5.id)
        expect(journal.entries[6]).toEqual(
            expect.objectContaining({ idx: 6, tag: '0006_invitation_image_position' }),
        )
    })
})
