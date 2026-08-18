# ISSUE-020 — Flags por link de invitación: cortesía y skip de verificación

- **Epic:** EPIC-002
- **Priority:** P0
- **Story points:** 3
- **Status:** Pending
- **Dependencies:** ISSUE-005 (columnas), PRE-1 (trabajo en vuelo del keyring aterrizado)
- **User stories:** US-008, US-006
- **Agents:** backend-specialist, frontend-specialist
- **Skills:** implement, backend, frontend

## Objetivo

Exponer los flags `is_courtesy` y `skip_verification` (PLAN §2.1) en la
creación y administración de links privados. La LÓGICA de honrarlos vive en
ISSUE-007 (verificación) e ISSUE-011 (pago); aquí solo la superficie
API + UI + DTO.

## Cambios exactos

### `app/api/admin/rsvp-invitations/route.ts`

- POST acepta `isCourtesy?: boolean` y `skipVerification?: boolean`
  (default true ambos si se omiten; validar tipo booleano estricto con el
  patrón `hasOnlyKeys`/type-guard existente).
- `linkDto` (allowlist explícita ya existente en el trabajo en vuelo):
  agregar `isCourtesy`, `skipVerification`.
- GET lista los flags por link.

### `lib/queries.ts`

- `createRsvpInvitationLink` acepta y persiste ambos flags.
- `RsvpInvitationLinkAdminRecord` y el record que consume
  `saveRsvpWithInvitation` exponen los flags (para que ISSUE-007/011 los
  lean en la validación/consumo del link).
- `app/api/rsvp-invitations/validate/route.ts`: el DTO público de validación
  agrega lo mínimo que el cliente necesita para el copy: `requiresPayment`
  (evento de pago && !is_courtesy) y `requiresVerification` (verificación ON
  && !skip_verification && !requiresPayment). NUNCA exponer los flags crudos
  ni datos del creador.

### `app/admin/components/InvitationLinkManager.tsx`

- Al crear link(s): dos checkboxes, ambos marcados por default:
  - ✅ "Cortesía — no paga" (visible solo si el evento es de pago)
  - ✅ "Saltar verificación de email" (visible solo si el evento tiene
    verificación activada)
  - Helper text cuando se desmarcan: "El invitado pagará $X MXN al
    registrarse" / "El invitado deberá confirmar su correo".
- En la lista de links: badges "Cortesía"/"Paga" y "Sin verificación"/
  "Verifica" cuando apliquen (solo mostrar el badge si difiere del
  comportamiento del evento, para no hacer ruido).

### `app/invite/InvitationRegistrationClient.tsx`

- Con `requiresPayment`: mostrar el precio y copy "Tu invitación requiere
  pago para confirmar" antes del submit.
- Con `requiresVerification`: copy "Te pediremos confirmar tu correo".

## Acceptance criteria

```gherkin
Given un manager creando un link en evento de pago
When desmarca "Cortesía"
Then el link se crea con is_courtesy=false y el DTO admin lo refleja

Given un POST con isCourtesy no-booleano o campos extra
Then 400 (validación estricta existente)

Given la validación pública de un link no-cortesía en evento de pago
Then el DTO incluye requiresPayment=true sin exponer flags crudos ni PII

Given un link con ambos defaults en un evento gratis sin verificación
Then la UI de invite no muestra ningún copy nuevo (cero ruido)

Given links creados ANTES de la migración 0009
Then se comportan como cortesía + skip (defaults true) — compat total
```

## Tests requeridos

Ampliar `tests/` de rsvp-invitations: persistencia de flags, defaults,
validación estricta, DTO público sin fuga de campos.
