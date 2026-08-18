CREATE TABLE "rsvp_invitation_links" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_rsvp_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rsvp_invitation_links" ADD CONSTRAINT "rsvp_invitation_links_event_id_events_slug_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "rsvp_invitation_links" ADD CONSTRAINT "rsvp_invitation_links_used_rsvp_id_rsvps_id_fk" FOREIGN KEY ("used_rsvp_id") REFERENCES "public"."rsvps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rsvp_invitation_links_event_id_idx" ON "rsvp_invitation_links" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rsvp_invitation_links_token_hash_unique" ON "rsvp_invitation_links" USING btree ("token_hash");