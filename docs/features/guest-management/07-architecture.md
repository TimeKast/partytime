# Architecture — guest management upgrades

## Read model

`rsvps → filter → locale-aware sort → export collection → paginate → table sections`.

Both export formats consume the export collection. Pagination consumes a derived slice only.

## Capability flow

1. Authenticated manager posts event slug + expiry.
2. Server checks same-origin and event manager permission.
3. Server generates 32 random bytes, stores SHA-256 and returns `/invite#token={raw}` once.
4. Public page reads the fragment, immediately scrubs the URL, and validates by POST body; the server hashes it and returns only an allowlisted active/unexpired/unused/unrevoked event DTO.
5. RSVP POST submits raw token. A transaction locks the capability, rechecks it, creates/reactivates RSVP under existing constraints, then marks it used.

## Security boundary

The link is a bearer capability. Possession authorizes exactly one exception to `rsvpClosed` for its bound event. It confers no admin access and no exception to event inactivity, capacity or validation.
