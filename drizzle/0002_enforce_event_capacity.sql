-- A2-H02 / FS-11: enforce event capacity atomically at the database.
--
-- Why a trigger: the app runs on neon-http (no interactive transactions), so a
-- count-then-insert at the application level — and even a single-statement
-- conditional INSERT — is raceable under READ COMMITTED (concurrent snapshots
-- don't see each other's uncommitted rows). A BEFORE trigger that locks the
-- parent event row serializes all seat-adding writers for that event; the
-- count that follows runs with a fresh snapshot (VOLATILE plpgsql), so after
-- the lock wait it sees concurrently committed rows. This covers every write
-- path (public POST /api/rsvp, guest token updates, admin edits) in one place.
--
-- Seat semantics: 1 per confirmed RSVP + 1 if plus_one. Cancelled rows don't
-- count. capacity_enabled=false or capacity_limit<=0 means unlimited.
-- Seat-REMOVING changes (cancellations, +1 downgrades) are never blocked.
--
-- Lock choice: FOR NO KEY UPDATE serializes seat-adders without conflicting
-- with the FOR KEY SHARE locks the rsvps->events FK takes on inserts.
-- The trigger deliberately does NOT watch event_id: the only path that changes
-- it is a slug rename (updateEventSlug / future FK ON UPDATE CASCADE), which
-- must never trip capacity mid-migration of rows.
--
-- Applied to prod 2026-07-10 via direct SQL (validated first on Neon branch
-- audit-b4-b6-test). Journal normalization is pending in B0.5-formal.
-- Rollback: DROP TRIGGER rsvps_capacity_check ON rsvps;
--           DROP FUNCTION enforce_event_capacity();

CREATE OR REPLACE FUNCTION enforce_event_capacity() RETURNS trigger AS $$
DECLARE
    ev RECORD;
    seats_taken integer;
    seats_new integer;
    seats_old integer := 0;
BEGIN
    seats_new := CASE WHEN NEW.status = 'confirmed'
                      THEN 1 + CASE WHEN NEW.plus_one THEN 1 ELSE 0 END
                      ELSE 0 END;
    IF TG_OP = 'UPDATE' AND NEW.event_id = OLD.event_id THEN
        seats_old := CASE WHEN OLD.status = 'confirmed'
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
    WHERE event_id = NEW.event_id AND status = 'confirmed' AND id <> NEW.id;

    IF seats_taken + seats_new > ev.capacity_limit THEN
        RAISE EXCEPTION 'CAPACITY_FULL' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rsvps_capacity_check ON rsvps;
CREATE TRIGGER rsvps_capacity_check
    BEFORE INSERT OR UPDATE OF status, plus_one ON rsvps
    FOR EACH ROW EXECUTE FUNCTION enforce_event_capacity();
