# ISSUE-007 — Backend de verificación por email

- **Epic:** EPIC-003
- **Priority:** P0
- **Story points:** 5
- **Status:** Pending
- **Dependencies:** ISSUE-005, ISSUE-006
- **User stories:** US-006, US-007
- **Agents:** backend-specialist, security-auditor
- **Skills:** implement, backend, sk-security

## Objetivo

Flujo server-side completo: RSVP en evento con `email_verification_enabled`
crea fila `pending_verification`, manda email con link de verificación, y el
clic confirma. Reenvío con rate-limit. Sin UI nueva (ISSUE-008).

## Diseño de token (patrón password_reset_tokens, NO cancel-token)

- Generación: `randomBytes(32).toString('base64url')` (43 chars, igual que
  invites). Guardar SOLO `sha256(token)` hex en
  `rsvps.verification_token_hash`; `verification_expires_at = now() + 24h`;
  `pending_expires_at = now() + 24h` (mismo TTL: si no verificó, expira y
  libera asiento).
- Validación: recomputar hash y comparar con `timingSafeEqual`
  (`lib/timing-safe.ts`). Rechazar si expiró, si el RSVP no está
  `pending_verification`, o si el slug no corresponde.
- Reissue (reenvío o re-submit del form): sobrescribir hash + expiries.

## Cambios exactos

### `lib/verification.ts` (nuevo)

`generateVerificationToken()`, `hashVerificationToken(token)`,
`buildVerificationUrl(slug, token)` → `${NEXT_PUBLIC_APP_URL}/verify/${slug}?token=...`.
Patrón de referencia: `lib/rsvp-invitation.ts` (hash-only) +
`lib/password-reset-queries.ts` (expiry/consumo).

### `lib/queries.ts`

- `saveRSVPOnce` acepta `initialStatus` y campos de verificación; cuando el
  evento exige verificación: inserta `pending_verification` con token hash.
  Re-submit con el mismo email y fila pendiente propia → refresca token y
  expiries en la MISMA fila (upsert sobre el unique `(event_id,
  lower(email))`), nunca error de duplicado.
- `verifyRsvpByToken(slug, tokenHash)`: **una sola sentencia CTE** que valida
  (status, expiry, hash match) y actualiza a `confirmed`,
  `verified_at=now()`, limpia `verification_token_hash`,
  `verification_expires_at`, `pending_expires_at`. Retorna la fila o null.

### `app/api/rsvp/route.ts` (POST)

1. Al inicio del handler: `await expireStalePendingRsvps(slug)` (helper de
   ISSUE-005).
2. Si `event.emailVerificationEnabled && !invitationToken`: rama de
   verificación — crear/refrescar pending, enviar email de verificación,
   responder `{ status: 'pending_verification' }` (el modal muestra "revisa
   tu correo", ISSUE-008). NO enviar el email de confirmación normal aquí.
3. Con `invitationToken` presente: aplicar la matriz de flags del link
   (PLAN §2.1). Si el link tiene `skip_verification=true` → confirmed directo
   (comportamiento actual). Si `skip_verification=false` y el evento tiene
   verificación activada (y no aplica la rama de pago, que supersede) →
   `saveRsvpWithInvitation` crea la fila `pending_verification` con token,
   consume el link, y se envía el email de verificación. El link se restaura
   si la fila expira (helper de ISSUE-005).

### `app/api/rsvp/verify/route.ts` (nuevo, POST)

Body `{ slug, token }`. Valida formato (regex 43 chars base64url, como
`TOKEN_PATTERN` en `lib/rsvp-invitation.ts`), llama `verifyRsvpByToken`, y en
éxito dispara el email de confirmación existente
(`generateConfirmationEmail`, gated por `emailConfirmationEnabled` — decisión:
si el evento tiene verificación activada, el email de confirmación post-verify
se manda SIEMPRE, porque ya sabemos que el correo es real). Respuestas:
200 confirmado (incluye datos mínimos para la página), 410 expirado,
400 inválido. Mismo patrón same-origin + `no-store` que
`app/api/rsvp-invitations/validate/route.ts`.

### `app/api/rsvp/resend-verification/route.ts` (nuevo, POST)

Body `{ slug, email }`. Siempre responde 202 (sin revelar existencia).
Rate-limit por `(slug, email)` e IP con `lib/bounded-rate-limiter.ts`
(mismo presupuesto que forgot-password). Si hay fila pendiente propia:
reissue + reenvío.

### Email de verificación

`lib/verification-email.ts` (nuevo) siguiendo `lib/password-reset-email.ts` /
`lib/email-template.ts`: asunto "Confirma tu asistencia a {evento}", CTA con
`buildVerificationUrl`, aviso de expiración 24 h. Registrar tipo
`'verification'` en `email_history`.

## Acceptance criteria

```gherkin
Given evento gratis con email_verification_enabled=true
When un invitado hace RSVP válido
Then la fila queda pending_verification con token hash-only y recibe email de verificación (no el de confirmación)

Given el link de verificación vigente
When el invitado lo abre (POST verify)
Then la fila pasa a confirmed con verified_at, el token queda limpio y llega el email de confirmación

Given un token vencido, ya usado, o de otro evento
When se intenta verificar
Then falla cerrado (410/400) sin mutar la fila

Given re-submit del mismo email con fila pendiente propia
When llega el segundo POST /api/rsvp
Then se refresca el token en la misma fila (no hay duplicado ni CAPACITY_FULL falso)

Given 6 solicitudes de reenvío seguidas del mismo email
When llega la sexta
Then el rate-limiter la corta y la respuesta sigue siendo 202 opaca

Given evento con verificación activada e invitación privada con skip_verification=true (default)
When el invitado del link registra
Then queda confirmed directo (bypass)

Given evento con verificación activada e invitación con skip_verification=false
When el invitado del link registra
Then queda pending_verification con el link consumido, y si expira sin verificar el link se restaura
```

## Tests requeridos

`tests/email-verification.test.ts`: todos los criterios de arriba + carrera
(dos verify concurrentes del mismo token → exactamente uno confirma) +
timing-safe (comparación no usa `===` sobre strings de token).

## No hacer

- No tocar el modal ni páginas (ISSUE-008).
- No usar el patrón del cancel-token (concatenación sha256 truncada).
- No guardar el token en claro en ningún lado (ni logs).
