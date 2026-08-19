CREATE TABLE "event_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" varchar(10) DEFAULT 'person' NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(255),
	"user_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_participants_kind_check" CHECK ("event_participants"."kind" in ('person', 'stripe')),
	CONSTRAINT "event_participants_name_check" CHECK (char_length(btrim("event_participants"."name")) between 2 and 120)
);
--> statement-breakpoint
CREATE TABLE "event_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"from_participant_id" text NOT NULL,
	"to_participant_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) NOT NULL,
	"settled_on" date NOT NULL,
	"note" varchar(500),
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	CONSTRAINT "event_settlements_from_to_check" CHECK ("event_settlements"."from_participant_id" <> "event_settlements"."to_participant_id"),
	CONSTRAINT "event_settlements_amount_cents_check" CHECK ("event_settlements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "event_transaction_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"event_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"share_cents" integer NOT NULL,
	CONSTRAINT "event_transaction_shares_share_cents_check" CHECK ("event_transaction_shares"."share_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "event_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"type" varchar(10) NOT NULL,
	"participant_id" text NOT NULL,
	"description" varchar(200) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) NOT NULL,
	"occurred_on" date NOT NULL,
	"note" varchar(500),
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	CONSTRAINT "event_transactions_type_check" CHECK ("event_transactions"."type" in ('expense', 'income')),
	CONSTRAINT "event_transactions_description_check" CHECK (char_length(btrim("event_transactions"."description")) between 1 and 200),
	CONSTRAINT "event_transactions_amount_cents_check" CHECK ("event_transactions"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ledger_stripe_is_participant" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_stripe_kind_unique" ON "event_participants" USING btree ("event_id") WHERE "event_participants"."kind" = 'stripe';--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_event_name_unique" ON "event_participants" USING btree ("event_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_id_event_unique" ON "event_participants" USING btree ("id","event_id");--> statement-breakpoint
CREATE INDEX "event_participants_event_id_idx" ON "event_participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_settlements_event_id_idx" ON "event_settlements" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_transaction_shares_transaction_participant_unique" ON "event_transaction_shares" USING btree ("transaction_id","participant_id");--> statement-breakpoint
CREATE INDEX "event_transaction_shares_transaction_id_idx" ON "event_transaction_shares" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "event_transaction_shares_participant_id_idx" ON "event_transaction_shares" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_transactions_id_event_unique" ON "event_transactions" USING btree ("id","event_id");--> statement-breakpoint
CREATE INDEX "event_transactions_event_id_idx" ON "event_transactions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_transactions_event_id_type_idx" ON "event_transactions" USING btree ("event_id","type");--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_slug_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_settlements" ADD CONSTRAINT "event_settlements_event_id_events_slug_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_settlements" ADD CONSTRAINT "event_settlements_from_participant_id_event_id_fk" FOREIGN KEY ("from_participant_id","event_id") REFERENCES "public"."event_participants"("id","event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_settlements" ADD CONSTRAINT "event_settlements_to_participant_id_event_id_fk" FOREIGN KEY ("to_participant_id","event_id") REFERENCES "public"."event_participants"("id","event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_transaction_shares" ADD CONSTRAINT "event_transaction_shares_transaction_id_event_id_fk" FOREIGN KEY ("transaction_id","event_id") REFERENCES "public"."event_transactions"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_transaction_shares" ADD CONSTRAINT "event_transaction_shares_participant_id_event_id_fk" FOREIGN KEY ("participant_id","event_id") REFERENCES "public"."event_participants"("id","event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_transactions" ADD CONSTRAINT "event_transactions_event_id_events_slug_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_transactions" ADD CONSTRAINT "event_transactions_participant_id_event_id_fk" FOREIGN KEY ("participant_id","event_id") REFERENCES "public"."event_participants"("id","event_id") ON DELETE restrict ON UPDATE no action;
