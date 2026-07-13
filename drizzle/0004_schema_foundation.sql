-- Foundation repair for historical objects that are modeled by Drizzle but
-- were never captured by repository migrations. Every statement is safe on a
-- production-derived schema where the object already exists.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "display_title" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "require_plus_one_name" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN IF NOT EXISTS "plus_one_name" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rsvps_event_email_unique"
    ON "rsvps" USING btree ("event_id", lower("email"));
