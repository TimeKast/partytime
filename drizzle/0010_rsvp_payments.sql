ALTER TABLE "events" ADD COLUMN "payment_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "rsvp_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rsvp_id" text NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"stripe_session_id" varchar(255) NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"refunded_at" timestamp,
	CONSTRAINT "rsvp_payments_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "rsvp_payments_amount_cents_check" CHECK ("rsvp_payments"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "rsvp_payments" ADD CONSTRAINT "rsvp_payments_rsvp_id_rsvps_id_fk" FOREIGN KEY ("rsvp_id") REFERENCES "public"."rsvps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_payments" ADD CONSTRAINT "rsvp_payments_event_id_events_slug_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "rsvp_payments_rsvp_id_idx" ON "rsvp_payments" USING btree ("rsvp_id");--> statement-breakpoint
CREATE INDEX "rsvp_payments_event_id_status_idx" ON "rsvp_payments" USING btree ("event_id","status");
