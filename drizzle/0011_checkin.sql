ALTER TABLE "events" ADD COLUMN "checkin_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "checkin_password_hash" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "checkin_password_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "checked_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "plus_one_checked_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "checked_in_by" varchar(120);--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "checkin_note" varchar(500);
