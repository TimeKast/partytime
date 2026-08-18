# ISSUE-008 — UX de verificación: modal, página /verify y toggle admin

- **Epic:** EPIC-003
- **Priority:** P1
- **Story points:** 3
- **Status:** Completed (2026-08-18)
- **Dependencies:** ISSUE-007
- **User stories:** US-006, US-007
- **Agents:** frontend-specialist
- **Skills:** implement, frontend, design-system

## Objetivo

Superficie de usuario del flujo de verificación. Tres piezas:

## 1. `app/components/RSVPModal.tsx`

- Manejar respuesta `{ status: 'pending_verification' }` del POST: estado de
  éxito alterno "📬 Revisa tu correo — te mandamos un link para confirmar tu
  asistencia (expira en 24 h)" con el email destino visible y botón
  "Reenviar" que llama `/api/rsvp/resend-verification` (deshabilitado 60 s
  tras cada clic; la respuesta siempre es 202, mostrar "enviado si existe un
  registro pendiente").
- No romper el flujo actual de eventos sin verificación (mismo copy actual).

## 2. `app/verify/[slug]/page.tsx` (nuevo)

- Client component que lee `?token=` del query, hace
  `POST /api/rsvp/verify` al montar y muestra: éxito (nombre + datos del
  evento con el DTO whitelisted `PublicEvent` de `lib/public-event.ts`),
  expirado (con botón reenviar → pide email), o inválido.
- Aplicar en `next.config.js` los mismos headers que `/invite`:
  `no-store`, `noindex`, `no-referrer` para `/verify` y `/verify/:slug`.
- Como el token viaja en query (no fragment), hacer
  `history.replaceState` para limpiarlo de la URL tras leerlo (patrón
  `InvitationRegistrationClient.tsx:34-40`).

## 3. Admin (`app/admin/page.tsx` + componente de settings del evento)

- Toggle "Verificación por email" junto al toggle existente de
  `email_confirmation_enabled`, con helper text: "El invitado debe confirmar
  su correo para quedar registrado. Los links privados de invitación no lo
  requieren. En eventos de pago se ignora: el pago verifica el correo."
- Persistirlo por la ruta de settings de evento existente (mismo patrón que
  los demás toggles booleanos; ver `lib/event-api-contract.ts` para registrar
  el campo permitido).

## Acceptance criteria

```gherkin
Given evento con verificación activada
When el invitado envía el RSVP
Then el modal muestra el estado "revisa tu correo" con reenvío y no la confirmación normal

Given el invitado abre el link del email
When la verificación es exitosa / expirada / inválida
Then /verify/[slug] muestra el estado correcto y limpia el token de la URL

Given el organizador en el admin
When activa el toggle de verificación
Then el evento lo persiste y el helper text explica los bypass (invites, pago)

Given navegación móvil (viewport 375px)
When se recorre modal y /verify
Then todo es usable sin scroll horizontal (revisar con design-system del proyecto)
```

## Tests requeridos

- Tests de contrato del campo nuevo en `lib/event-api-contract.ts`.
- Test de página verify: token en URL se limpia tras montar.
