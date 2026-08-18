# ISSUE-013 — Visibilidad de pagos en admin y exports

- **Epic:** EPIC-004
- **Priority:** P1
- **Story points:** 3
- **Status:** Pending
- **Dependencies:** ISSUE-012
- **User stories:** US-010
- **Agents:** frontend-specialist, backend-specialist
- **Skills:** implement, frontend

## Objetivo

Que el organizador vea quién pagó, cuánto y cuándo, sin salir del admin.

## Cambios exactos

- `GET /api/rsvp` (admin, `app/api/rsvp/route.ts:263`): join a
  `rsvp_payments` (último pago por rsvp) → campos `paymentStatus`,
  `paidAt`, `amountCents`, `currency`. Solo cuando el evento tiene
  `payment_required` (evitar ruido en eventos gratis).
- `app/admin/page.tsx`:
  - Columna/badge de pago en la lista de invitados: Pagado ✓ (verde, con
    monto), Pendiente de pago (ámbar), Expirado (gris), Reembolsado (rojo).
  - Contador agregado: "N pagados · $X,XXX MXN recaudados" (suma de
    `amount_cents` con status paid).
  - Filtro por estado de pago junto a los filtros existentes.
- Exports PDF/Excel (mismo `app/admin/page.tsx`, funciones de export):
  columnas "Estado de pago", "Monto", "Fecha de pago" cuando el evento es de
  pago. Cuidado con `stripEmojis` en el PDF (usar texto, no emoji, en esa
  ruta).
- Caso `PAYMENT_WITHOUT_SEAT` (ISSUE-012): esas filas (pago paid + RSVP
  expired) deben resaltarse en admin con aviso "Pagó sin lugar — requiere
  reembolso manual en Stripe".

## Acceptance criteria

```gherkin
Given un evento de pago con pagados, pendientes, expirados y un refunded
When el admin abre la lista
Then cada fila muestra su badge correcto y el total recaudado cuadra con la suma de paid

Given el export PDF y Excel de ese evento
Then incluyen las tres columnas de pago con valores legibles

Given un pago paid cuyo RSVP quedó expired (sin asiento)
Then el admin lo ve resaltado con el aviso de reembolso manual

Given un evento gratis
Then no aparecen columnas ni filtros de pago
```

## Tests requeridos

Test del join del GET admin (shape del DTO, sin filtrar PII extra) y de la
agregación de recaudado.
