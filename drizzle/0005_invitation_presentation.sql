ALTER TABLE "events" ADD COLUMN "presentation_mode" varchar(24) DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rsvp_title" text DEFAULT 'RSVP INDISPENSABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rsvp_button_label" varchar(80) DEFAULT 'CONFIRMAR ASISTENCIA' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "background_overlay_strength" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "background_image_fit" varchar(12) DEFAULT 'cover' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_presentation_mode_check" CHECK ("events"."presentation_mode" in ('classic', 'modern_details', 'artwork_only'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_background_image_fit_check" CHECK ("events"."background_image_fit" in ('cover', 'contain'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_background_overlay_strength_check" CHECK ("events"."background_overlay_strength" between 0 and 80);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_rsvp_button_label_check" CHECK (char_length(btrim("events"."rsvp_button_label")) between 1 and 80);