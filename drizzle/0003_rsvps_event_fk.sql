-- A3-02 / A6-09: rsvps.event_id had no FK — deleteEvent(hard) removed only the
-- events row, leaving the RSVPs orphaned under the freed slug. A recycled slug
-- (a re-created annual event) inherited them: wrong-recipient bulk emails and
-- the dedup index 409ing legitimate new guests.
--
-- Target is events.slug, NOT events.id: per the A6-14 contract rsvps.event_id
-- stores the slug (events.slug already has the UNIQUE the FK needs; migrating
-- 167 live rows + every caller to UUIDs is out of scope).
-- ON UPDATE CASCADE: slug renames move RSVPs atomically in the same statement
--   (updateEventSlug keeps its manual follow-up as a no-op fallback for a
--   deploy window where code runs before this migration).
-- ON DELETE RESTRICT: nothing can delete an event out from under its RSVPs;
--   the intentional hard delete removes both in one db.batch transaction.
--
-- Index support: the composite unique index rsvps_event_email_unique
-- (event_id, lower(email)) prefix covers the FK's child-side lookups.
--
-- Precondition (verified 0 on prod 2026-07-10 immediately before applying):
--   SELECT count(*) FROM rsvps r
--   WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.slug = r.event_id);
--
-- Applied to prod 2026-07-10 via direct SQL (validated first on Neon branch
-- audit-b4-b6-test: RESTRICT blocks, CASCADE renames, batch delete atomic,
-- capacity trigger unaffected). Journal normalization pending in B0.5-formal.
-- Rollback: ALTER TABLE rsvps DROP CONSTRAINT rsvps_event_id_events_slug_fk;

ALTER TABLE rsvps
    ADD CONSTRAINT rsvps_event_id_events_slug_fk
    FOREIGN KEY (event_id) REFERENCES events(slug)
    ON UPDATE CASCADE ON DELETE RESTRICT;
