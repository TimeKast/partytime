# ISSUE-015 — Migración 0011 + autenticación del portal de check-in

- **Epic:** EPIC-005
- **Priority:** P0
- **Story points:** 5
- **Status:** Completed (2026-08-18)
- **Dependencies:** ISSUE-005 (solo por orden de migraciones; ejecutable en paralelo con EPIC-003/004 salvo `lib/schema.ts`)
- **User stories:** US-011, US-012
- **Agents:** backend-specialist, security-auditor
- **Skills:** implement, database, sk-security

## Objetivo

Schema y capa de autenticación del portal: password por evento, cookie HMAC
scoped, rate-limit. Sin listado de invitados todavía (ISSUE-016) ni UI final
(ISSUE-017).

## Cambios exactos

### Migración `drizzle/0011_checkin.sql` + `lib/schema.ts`

En `events`:
- `checkin_enabled` boolean NOT NULL DEFAULT false
- `checkin_password_hash` text NULL (bcrypt)
- `checkin_password_updated_at` timestamp NULL

En `rsvps`:
- `checked_in_at` timestamp NULL
- `plus_one_checked_in_at` timestamp NULL
- `checked_in_by` varchar(120) NULL (nombre libre del staff)
- `checkin_note` varchar(500) NULL

Actualizar los tres guardarraíles + journal (igual que ISSUE-005/010).

### `lib/checkin-session.ts` (nuevo)

- `CHECKIN_SESSION_SECRET` (env, 64 hex; agregar a `.env.example`). Sin
  secret → toda operación de check-in responde 503 (fail closed, nunca
  fallback tipo 'default-secret' — anti-patrón del cancel-token).
- `issueCheckinCookie(slug, staffName, passwordUpdatedAt)`: payload
  `{ slug, staffName, pwv: passwordUpdatedAt.getTime(), exp: now+24h }`,
  firmado `HMAC-SHA256(secret, JSON canónico)`, formato
  `base64url(payload).base64url(sig)`. Cookie `checkin_session_{slug}`:
  HttpOnly, Secure, SameSite=Lax, Path=`/`, maxAge 24 h.
- `validateCheckinCookie(cookie, slug, currentPasswordUpdatedAt)`:
  verifica firma con `timingSafeEqual` (`lib/timing-safe.ts`), `exp` vigente,
  `slug` igual, y `pwv === currentPasswordUpdatedAt` — **rotar el password
  invalida todas las cookies emitidas** sin tocar la base.

### `app/api/checkin/auth/route.ts` (nuevo, POST)

- Body `{ slug, password, staffName }` (staffName 2-120 chars, se guardará en
  `checked_in_by` de cada marca).
- Rechazos: evento inexistente/inactivo → 404 opaco; `checkin_enabled=false`
  o sin password hash → 404 opaco (no revelar existencia del portal).
- Rate-limit con `lib/bounded-rate-limiter.ts` por IP y por slug (presupuesto
  tipo login: p. ej. 10/15 min — usar el mismo presupuesto que
  `app/api/auth/login/route.ts` para consistencia).
- `bcrypt.compare` contra `checkin_password_hash` → set cookie + 200
  `{ ok: true, staffName }`.
- Headers `no-store`.

### Admin: gestión del password

- `PATCH` en la ruta de settings del evento (o ruta dedicada
  `app/api/admin/checkin-config/route.ts` si el contrato de settings no
  admite campos write-only): acciones `enable/disable`,
  `setPassword(plaintext 6-64 chars)` → bcrypt 12 rounds (mismo costo que
  `lib/auth-utils.ts`) + `checkin_password_updated_at=now()`.
- El password en claro NUNCA se persiste ni se devuelve; el admin lo ve solo
  al momento de teclearlo. RBAC: mínimo `manager` del evento
  (`userHasEventAccess`, `lib/user-queries.ts:354`).

### `next.config.js`

- Headers `no-store` + `noindex` + `no-referrer` para `/checkin` y
  `/checkin/:slug` (copiar bloque de `/invite`).

## Acceptance criteria

```gherkin
Given un evento con check-in habilitado y password "fiesta2026"
When el staff manda password correcto + su nombre
Then recibe cookie firmada válida por 24h scoped al slug

Given password incorrecto 10 veces desde la misma IP
Then el rate-limiter corta antes de la siguiente verificación bcrypt

Given una cookie válida
When el organizador rota el password
Then la cookie deja de validar (pwv mismatch)

Given un evento con check-in deshabilitado o inexistente
Then auth responde 404 indistinguible

Given entorno sin CHECKIN_SESSION_SECRET
Then los endpoints de check-in responden 503 (fail closed)

Given la migración 0011 en rama Neon desechable
Then db:preflight y verify-db-contract pasan
```

## Tests requeridos

`tests/checkin-auth.test.ts`: emisión/validación de cookie (firma, exp, slug
cruzado, pwv), rate-limit, 404 opacos, 503 sin secret, bcrypt del password.
