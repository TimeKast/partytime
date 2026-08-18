# ISSUE-019 — Hardening del cancel-token (deuda pre-existente, amplificada por pagos)

- **Epic:** — (hardening transversal; Wave 3 del PLAN)
- **Priority:** P1
- **Story points:** 2
- **Status:** Pending
- **Dependencies:** ninguna dura; ejecutar después de EPIC-004 para no cruzar diffs
- **User stories:** —
- **Agents:** security-auditor, backend-specialist
- **Skills:** implement, sk-security

## Contexto

`lib/queries.ts:579-589` genera el cancel-token con
`sha256("{rsvpId}-{email}-{secret}")` truncado a 32 hex chars, con fallback
literal `'default-secret'` si falta `CANCEL_TOKEN_SECRET`, y lo valida con
`===` (no timing-safe). Con RSVPs pagados, cancelar es más sensible (asiento
pagado). Nota: esto solapa con el pendiente "B2-resto (HMAC cancel-token)"
del framework de auditoría multi-sesión — al cerrar este issue, marcar B2
como cubierto ahí.

## Cambios exactos

- Reemplazar generación por
  `createHmac('sha256', CANCEL_TOKEN_SECRET).update(`${rsvpId}:${email.toLowerCase()}`).digest('hex')`
  SIN truncar (64 hex chars).
- Sin `CANCEL_TOKEN_SECRET` configurado: **lanzar en el arranque del
  handler** (503, fail closed). Eliminar el literal `'default-secret'`.
- Validación con `timingSafeEqual` (`lib/timing-safe.ts`).
- **Compatibilidad:** los emails ya enviados llevan tokens del esquema viejo.
  `validateCancelToken` acepta ambos formatos durante una ventana: primero
  intenta HMAC nuevo; si el token tiene exactamente 32 chars, intenta el
  esquema legacy (también timing-safe) — SOLO si `CANCEL_TOKEN_SECRET` está
  configurado (el fallback 'default-secret' muere ya). Dejar TODO fechado
  para retirar el camino legacy tras el siguiente evento masivo.
- Actualizar `tests/cancel-token.test.ts` (ambos formatos, timing-safe, fail
  closed sin secret).

## Acceptance criteria

```gherkin
Given un RSVP con token nuevo (HMAC 64 chars)
Then get/update/cancel funcionan igual que hoy

Given un token legacy de un email ya enviado
Then sigue siendo válido (con secret configurado) — ningún invitado pierde su link

Given entorno sin CANCEL_TOKEN_SECRET
Then las rutas de cancel-token responden 503 y ningún token 'default-secret' valida

Given comparación de tokens
Then no existe ningún `===` sobre strings de token en lib/queries.ts
```
