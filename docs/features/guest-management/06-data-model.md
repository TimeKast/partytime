# Data model — RSVP invitation links

## `rsvp_invitation_links`

| Column | Type | Rule |
| --- | --- | --- |
| id | text PK | generated UUID |
| event_id | text FK → events.slug | cascade slug update, cascade event delete |
| token_hash | varchar(64) unique | SHA-256 hex; raw token never stored |
| expires_at | timestamptz | required future instant at creation |
| used_at | timestamptz nullable | set in RSVP transaction |
| revoked_at | timestamptz nullable | set by authorized admin |
| created_by | text FK → users.id | audit ownership |
| created_at | timestamptz | default now |

Indexes support event listing and hash lookup. Existing RSVP rows and constraints remain unchanged.
