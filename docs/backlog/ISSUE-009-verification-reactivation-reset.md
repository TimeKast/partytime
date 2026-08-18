# ISSUE-009 — Reset de verificación en reactivaciones y cambios de email

- **Epic:** EPIC-003
- **Priority:** P0
- **Story points:** 3
- **Status:** Completed (2026-08-18)
- **Dependencies:** ISSUE-007
- **User stories:** US-006
- **Agents:** backend-specialist, security-auditor
- **Skills:** implement, sk-security

## Objetivo

Cerrar los huecos donde una fila verificada puede quedar "verificada" con un
email que ya no es el verificado. Es el issue más sutil del epic — por eso va
separado.

## Superficies afectadas (todas en `lib/queries.ts` + rutas)

1. **`saveRSVPOnce` reactiva filas `cancelled`** (y ahora `expired`): al
   reactivar en un evento con verificación activada, la fila debe volver a
   `pending_verification` con token nuevo — NO heredar `verified_at` viejo…
   **excepto** si el email es idéntico (case-insensitive) al que ya tenía
   `verified_at`: en ese caso conservar la verificación (el dueño del correo
   ya la probó; no castigar re-registro).
2. **`saveRsvpWithInvitation` sobreescribe `email` al reactivar**
   (`lib/queries.ts:293`): los invites confirman directo (bypass), pero si el
   email cambió, `verified_at` debe limpiarse (queda confirmed sin verificar,
   correcto para invites).
3. **`app/api/rsvp/update/route.ts`** (edición con cancel-token): si permite
   cambiar email, al cambiarlo limpiar `verified_at` y, si el evento exige
   verificación, decidir: mantener confirmed pero marcar sin verificar
   (decisión MVP: NO degradar a pending un RSVP ya confirmado; solo limpiar
   `verified_at`). Si el update no permite cambiar email hoy, documentarlo y
   agregar test que lo fije.

## Acceptance criteria

```gherkin
Given una fila cancelled previamente verificada con el email a@x.com
When se re-registra con a@x.com en evento con verificación
Then queda confirmed conservando verified_at (sin nuevo email de verificación)

Given una fila cancelled verificada con a@x.com
When se re-registra con b@y.com
Then queda pending_verification con token nuevo y verified_at NULL

Given reactivación vía invitación privada que cambia el email
Then queda confirmed pero verified_at NULL

Given cualquier ruta que mute email
When corre la suite
Then no existe camino que conserve verified_at con email distinto al verificado
```

## Tests requeridos

Ampliar `tests/email-verification.test.ts` con matriz de reactivación
(cancelled/expired × mismo/distinto email × público/invite) y test del
update con cancel-token.
