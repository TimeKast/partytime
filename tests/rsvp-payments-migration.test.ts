import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('rsvp_payments migration contract (ISSUE-010)', () => {
    it('adds events.payment_required and the rsvp_payments table with its FKs, unique session id and CHECK', () => {
        const migration = readFileSync('drizzle/0010_rsvp_payments.sql', 'utf8')

        expect(migration).toContain('ALTER TABLE "events" ADD COLUMN "payment_required" boolean DEFAULT false NOT NULL;')
        expect(migration).toContain('CREATE TABLE "rsvp_payments"')
        expect(migration).toContain('"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL')
        expect(migration).toContain('"rsvp_id" text NOT NULL')
        expect(migration).toContain('"event_id" varchar(100) NOT NULL')
        expect(migration).toContain('"stripe_session_id" varchar(255) NOT NULL')
        expect(migration).toContain('"stripe_payment_intent_id" varchar(255)')
        expect(migration).toContain('"amount_cents" integer NOT NULL')
        expect(migration).toContain('"currency" varchar(10) NOT NULL')
        expect(migration).toContain('"status" varchar(20) DEFAULT \'created\' NOT NULL')
        expect(migration).toContain('"created_at" timestamp DEFAULT now() NOT NULL')
        expect(migration).toContain('"paid_at" timestamp')
        expect(migration).toContain('"refunded_at" timestamp')
        expect(migration).toContain('CONSTRAINT "rsvp_payments_stripe_session_id_unique" UNIQUE("stripe_session_id")')
        expect(migration).toContain('CONSTRAINT "rsvp_payments_amount_cents_check" CHECK ("rsvp_payments"."amount_cents" > 0)')
        expect(migration).toContain(
            'ALTER TABLE "rsvp_payments" ADD CONSTRAINT "rsvp_payments_rsvp_id_rsvps_id_fk" FOREIGN KEY ("rsvp_id") REFERENCES "public"."rsvps"("id") ON DELETE restrict ON UPDATE no action;',
        )
        expect(migration).toContain(
            'ALTER TABLE "rsvp_payments" ADD CONSTRAINT "rsvp_payments_event_id_events_slug_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("slug") ON DELETE restrict ON UPDATE cascade;',
        )
        expect(migration).toContain('CREATE INDEX "rsvp_payments_rsvp_id_idx" ON "rsvp_payments" USING btree ("rsvp_id");')
        expect(migration).toContain(
            'CREATE INDEX "rsvp_payments_event_id_status_idx" ON "rsvp_payments" USING btree ("event_id","status");',
        )
    })

    it('is additive only — no DROP/DELETE/TRUNCATE/UPDATE', () => {
        const migration = readFileSync('drizzle/0010_rsvp_payments.sql', 'utf8')
        expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im)
    })

    it('chains generated snapshot and journal entry after 0009', () => {
        const snapshot9 = JSON.parse(readFileSync('drizzle/meta/0009_snapshot.json', 'utf8')) as { id: string }
        const snapshot10 = JSON.parse(readFileSync('drizzle/meta/0010_snapshot.json', 'utf8')) as {
            prevId: string
            tables: Record<string, { columns: Record<string, unknown> }>
        }
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string }>
        }

        expect(snapshot10.prevId).toBe(snapshot9.id)
        expect(snapshot10.tables['public.events'].columns).toHaveProperty('payment_required')
        expect(snapshot10.tables['public.rsvp_payments'].columns).toHaveProperty('stripe_session_id')
        expect(snapshot10.tables['public.rsvp_payments'].columns).toHaveProperty('amount_cents')
        expect(journal.entries[10]).toEqual(expect.objectContaining({
            idx: 10,
            tag: '0010_rsvp_payments',
        }))
    })
})
