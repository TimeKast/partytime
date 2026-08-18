# Design spec — guest management upgrades

## Admin list

- Add an “Orden” select adjacent to existing filters.
- Show result count and `Página X de Y`; page size choices 10, 25, 50, 100 (default 25).
- Previous/next controls have disabled and accessible labels.
- Export buttons state that they export the filtered results; disabled only when the filtered set is empty.

## Link manager

- Compact card below list tools for managers only.
- Exact local expiration (`datetime-local`) with a sensible +24h default.
- After creation, show URL in read-only field with Copy action and warning that it is displayed once.
- List issued links without secret: created, expires, status (`Activo`, `Usado`, `Vencido`, `Revocado`) and revoke action for active links.

## Public page

- Reuse event visual context and RSVP form.
- Valid token makes CTA/form available even when the public RSVP status is closed.
- Invalid/expired/used/revoked states use a clear status card and no form.
- Keyboard focus, labels, live feedback and mobile touch targets match existing RSVP modal accessibility.
