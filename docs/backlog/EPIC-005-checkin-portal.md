# EPIC-005 — Portal de check-in para staff del evento

- **Status:** Pending
- **Goal:** Pantalla `/checkin/[slug]` con password sencillo por evento,
  compartible con personas sin cuenta (recepción, seguridad), para marcar
  llegadas (invitado y +1 por separado) y notas en tiempo real.
- **Stories:** US-011, US-012, US-013
- **Issues:** ISSUE-015, ISSUE-016, ISSUE-017, ISSUE-018
- **Milestone:** Payments + verification + check-in
- **Depends on:** EPIC-002 (por orden de migraciones; funcionalmente casi
  independiente)
- **Done when:** staff sin cuenta entra con password, marca llegadas y notas
  desde móvil, el admin ve stats y los exports incluyen check-in; suite verde.
- **Tier de riesgo:** 3 (superficie pública nueva con PII de invitados).
  Una review enfocada en auth del portal + minimización de PII.

## User stories

- **US-011** — Como organizador, habilito el portal de check-in y le pongo un
  password sencillo que puedo rotar; comparto URL + password con mi staff.
- **US-012** — Como staff de recepción (sin cuenta), entro con el password
  desde mi teléfono, busco por nombre, marco quién ya llegó (y su +1) y dejo
  notas.
- **US-013** — Como organizador, veo en el admin cuántos han llegado y
  exporto PDF/Excel con las columnas de check-in.

## Decisiones clave (ver PLAN §3.4)

- Cookie HMAC scoped al evento, TTL 24 h, invalidada al rotar password
  (payload incluye `checkin_password_updated_at`). Secret nuevo
  `CHECKIN_SESSION_SECRET`.
- PII mínima para el staff: nombre, +1, email enmascarado, llegada, nota.
  Sin teléfono ni email completo.
- Rate-limit de intentos de password con `lib/bounded-rate-limiter.ts`;
  headers `no-store`/`noindex` como `/invite`.
