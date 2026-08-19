# EPIC-005 — Portal de check-in para staff del evento

- **Status:** Implemented (pendiente: migración 0011 en Neon + smoke en prod)
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

## Delivery evidence (2026-08-18)

- ISSUE-015..018 implementadas (Sonnet ejecutor, Fable 5 auditor por issue).
- Suite integrada: 820/820; lint, tsc y build limpios.
- **Review Tier 3 (auth/PII):** cookie HMAC timing-safe fail-closed sin
  fallback, 404 opacos indistinguibles, rate-limit antes de bcrypt con
  igualación de timing (DUMMY_HASH), DTO del portal con keys exactas fijadas
  por test (sin phone/email completo/tokens), password write-only nunca
  redevuelto, RBAC manager server-side.
- **Hallazgo corregido (ISSUE-017):** guardar nota re-estampaba la hora de
  llegada — ahora COALESCE preserva el timestamp original (test fijado).
- **Pendiente para producción:** aplicar 0011 en rama Neon desechable → prod
  (runbook), configurar CHECKIN_SESSION_SECRET en Vercel.

## Delivery addendum — visibilidad admin (2026-08-18)

- El dashboard carga el estado del portal al seleccionar el evento y muestra
  disponibilidad, acceso directo y progreso sin exigir visitar Configuración.
- Viewer puede leer estado/stats; PATCH de toggle/password sigue reservado a
  manager. El estado se comparte entre dashboard y settings.
- `/api/events` dejó de serializar filas Drizzle completas: un DTO allowlist
  evita exponer `checkin_password_hash` o futuras columnas server-only.
- Configuración se reorganizó en cinco pestañas accesibles con disclosures y
  navegación mobile-first; todos los controles previos se conservaron.
