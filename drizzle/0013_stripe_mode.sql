ALTER TABLE "events" ADD COLUMN "stripe_mode" varchar(8) DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_payments" ADD COLUMN "livemode" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "rsvp_payments" SET "livemode" = false WHERE "stripe_session_id" LIKE 'cs\_test\_%';--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_stripe_mode_check" CHECK ("events"."stripe_mode" in ('live', 'test'));
