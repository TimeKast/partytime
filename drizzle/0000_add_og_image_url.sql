CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '',
	"date" text DEFAULT '',
	"time" text DEFAULT '',
	"location" text DEFAULT '',
	"details" text DEFAULT '',
	"price_enabled" boolean DEFAULT false,
	"price_amount" integer DEFAULT 0,
	"price_currency" varchar(10) DEFAULT 'MXN',
	"capacity_enabled" boolean DEFAULT false,
	"capacity_limit" integer DEFAULT 0,
	"background_image_url" text DEFAULT '/background.png',
	"og_image_url" text,
	"theme" jsonb DEFAULT '{"primaryColor":"#FF1493","secondaryColor":"#00FFFF","accentColor":"#FFD700","backgroundColor":"#1a0033","textColor":"#ffffff"}'::jsonb,
	"host_name" text DEFAULT '',
	"host_email" text DEFAULT '',
	"host_phone" text DEFAULT '',
	"is_active" boolean DEFAULT true,
	"email_confirmation_enabled" boolean DEFAULT false,
	"reminder_enabled" boolean DEFAULT false,
	"reminder_scheduled_at" timestamp,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"plus_one" boolean DEFAULT false,
	"status" varchar(20) DEFAULT 'confirmed' NOT NULL,
	"email_sent" timestamp,
	"email_history" jsonb DEFAULT '[]'::jsonb,
	"cancel_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_event_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" varchar(45),
	CONSTRAINT "user_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"is_active" boolean DEFAULT true,
	"invited_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
