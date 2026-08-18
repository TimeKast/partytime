ALTER TABLE "rsvps" ADD COLUMN "pending_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "verification_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "verification_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "email_verification_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_invitation_links" ADD COLUMN "is_courtesy" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_invitation_links" ADD COLUMN "skip_verification" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- ISSUE-005 (EPIC-002): pending_payment/pending_verification now reserve a
-- seat while checkout/verification is in flight, so a full event cannot be
-- oversold during that window. Everything else about enforce_event_capacity()
-- is unchanged from drizzle/0002_enforce_event_capacity.sql: the FOR NO KEY
-- UPDATE lock on events, the +1 handling, and the CAPACITY_FULL (P0001)
-- exception. The pending->confirmed transition is seat-neutral (both
-- statuses count in the formula below), so this trigger never rejects a
-- legitimate confirmation — see tests/pending-states.test.ts.
CREATE OR REPLACE FUNCTION enforce_event_capacity() RETURNS trigger AS $$
DECLARE
    ev RECORD;
    seats_taken integer;
    seats_new integer;
    seats_old integer := 0;
BEGIN
    seats_new := CASE WHEN NEW.status IN ('confirmed', 'pending_payment', 'pending_verification')
                      THEN 1 + CASE WHEN NEW.plus_one THEN 1 ELSE 0 END
                      ELSE 0 END;
    IF TG_OP = 'UPDATE' AND NEW.event_id = OLD.event_id THEN
        seats_old := CASE WHEN OLD.status IN ('confirmed', 'pending_payment', 'pending_verification')
                          THEN 1 + CASE WHEN OLD.plus_one THEN 1 ELSE 0 END
                          ELSE 0 END;
    END IF;

    IF seats_new <= seats_old THEN
        RETURN NEW;
    END IF;

    SELECT capacity_enabled, capacity_limit INTO ev
    FROM events WHERE slug = NEW.event_id FOR NO KEY UPDATE;

    IF NOT FOUND OR ev.capacity_enabled IS DISTINCT FROM true
       OR COALESCE(ev.capacity_limit, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(1 + CASE WHEN plus_one THEN 1 ELSE 0 END), 0)
    INTO seats_taken
    FROM rsvps
    WHERE event_id = NEW.event_id
      AND status IN ('confirmed', 'pending_payment', 'pending_verification')
      AND id <> NEW.id;

    IF seats_taken + seats_new > ev.capacity_limit THEN
        RAISE EXCEPTION 'CAPACITY_FULL' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
