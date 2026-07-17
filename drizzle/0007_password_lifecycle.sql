ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"request_ip" varchar(45),
	"issuance_slot" integer
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens"
ADD COLUMN IF NOT EXISTS "issuance_slot" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_unique"
ON "password_reset_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx"
ON "password_reset_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx"
ON "password_reset_tokens" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_active_slot_unique"
ON "password_reset_tokens" USING btree ("user_id", "issuance_slot")
WHERE "consumed_at" IS NULL AND "issuance_slot" IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
