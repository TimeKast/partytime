# ISSUE-017 — UI del portal de check-in `/checkin/[slug]`

- **Epic:** EPIC-005
- **Priority:** P0
- **Story points:** 5
- **Status:** Completed (2026-08-18)
- **Dependencies:** ISSUE-016
- **User stories:** US-012
- **Agents:** frontend-specialist, ui-critic (review)
- **Skills:** implement, frontend, design-system

## Objetivo

Portal mobile-first para recepción/seguridad. Dos pantallas en
`app/checkin/[slug]/page.tsx` + componentes cliente.

## Pantalla 1 — Gate de acceso

- Nombre del evento (fetch público mínimo: nombre/fecha vía el DTO
  `PublicEvent` de `lib/public-event.ts`; si el evento no existe o el portal
  está apagado, mostrar genérico "Portal no disponible").
- Campos: "Tu nombre" (staffName) + "Password del evento". Submit →
  `/api/checkin/auth`. Errores: password incorrecto (sin detalle), rate-limit
  ("demasiados intentos, espera unos minutos").

## Pantalla 2 — Lista de invitados (con cookie válida)

- Header sticky: nombre del evento + contador grande "**37 / 120 llegados**"
  (asientos: invitado marcado = 1, +1 marcado = 1) + búsqueda por nombre
  (client-side, sin acentos-sensibilidad: normalizar con
  `String.normalize('NFD')`).
- Cada fila: nombre, badge +1 (con nombre del +1 si existe), maskedEmail en
  gris pequeño, y:
  - Botón grande de check ✓ para el invitado (toggle marcar/desmarcar, tap
    target ≥ 44px).
  - Check separado para el +1 cuando aplica.
  - Icono de nota → abre input inline (500 chars) que guarda al blur.
  - Marcado: fondo verde suave + hora de llegada + "por {staffName}".
  - `pending_*`: badge ámbar "no confirmado", checks deshabilitados.
- Polling cada 12 s (`setInterval` + refetch del GET; pausar cuando
  `document.hidden`). Optimistic UI al marcar con rollback si el POST falla.
- Filtros rápidos: Todos / Falta por llegar / Ya llegaron.
- Sesión expirada (401 en cualquier fetch) → volver al gate con mensaje.
- Estética: seguir el design system del proyecto (revisar
  `plan/5.0_Design_System.md` y `plan/5.1_UX_UI.md`); es una herramienta de
  trabajo — priorizar contraste alto y velocidad sobre ornamento.

## Acceptance criteria

```gherkin
Given un staff con password válido en un teléfono (viewport 375px)
When entra al portal
Then ve la lista completa, busca "ana" y marca llegada en ≤2 taps

Given dos dispositivos de staff abiertos
When uno marca a un invitado
Then el otro lo ve marcado en ≤15 s (polling)

Given un invitado con +1
Then se pueden marcar las dos llegadas por separado y el contador suma ambas

Given el POST de marca falla (red)
Then la UI revierte el optimistic update y muestra error breve

Given el password del evento rotado a mitad de sesión
Then el siguiente fetch regresa al gate sin crash
```

## Tests requeridos

- Tests de componentes clave (contador, normalización de búsqueda, rollback
  optimista) con el setup de Vitest existente.
- Review visual con ui-critic (aislado) antes de cerrar.
