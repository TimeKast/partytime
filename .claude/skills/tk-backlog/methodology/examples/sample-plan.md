# Plan — Refactor del panel de notificaciones (FIXTURE de calibración)

> **No es un plan real** — es la referencia de calibración de `plan-mode-input.md` (decisión #6: la decomposición es juicio del LLM, no hay test de CI; esto es la referencia que un humano coteja). Ejercita: clasificación process-vs-issue, atribución de archivos desde `## Critical files` central anotado, archivo compartido (many-to-many), chain **no-contiguo** (N4), y un bullet de verification **cross-issue** (e2e). El `parsed-plan.md` esperado vive junto a este archivo.

## Context

El panel de notificaciones acumuló drift: el badge no coincide con la lista, el panel no agrupa, y el polling no respeta la visibilidad de la pestaña. _(Heading de proceso → **prosa-no-issue**, pero alimenta el §1 Objetivo de cada issue.)_

## Findings

### F1 — Badge no refleja el conteo real

El badge queda desincronizado tras marcar una notificación como leída: muestra el conteo viejo hasta un refresh manual.

### F2 — Panel no agrupa por categoría

La lista muestra todo plano; debería agrupar por categoría (sistema / menciones / alertas).

### F3 — Settings no persiste el toggle de push

Al desactivar push y recargar, el toggle vuelve a activado: la preferencia no se guarda.

### F4 — Email template sin branding

El email de notificación sale sin el layout branded del kit (logo + colores del tema).

### F5 — Polling no respeta visibilidad

El polling sigue corriendo con la pestaña en background, gastando requests. Debe pausar cuando `document.hidden`.

## Critical files

- `src/components/notifications/NotificationBell.tsx` — badge sync (F1)
- `src/lib/notifications/useNotifications.ts` — hook compartido: conteo + polling (F1, F5)
- `src/components/notifications/NotificationPanel.tsx` — agrupación por categoría (F2)
- `src/components/notifications/NotificationSettings.tsx` — persistencia del toggle (F3)
- `src/lib/email/templates/notification.tsx` — branding del email (F4)
- `src/app/api/notifications/poll/route.ts` — gate de visibilidad (F5)

## Verification

- El badge muestra el conteo real inmediatamente tras marcar leído (F1).
- El panel agrupa las notificaciones por categoría (F2).
- El toggle de push persiste tras recargar (F3).
- El email de notificación llega con el layout branded (F4).
- El polling se pausa con la pestaña en background y reanuda al volver (F5).
- Flujo end-to-end: recibir push → el badge incrementa → marcar leído → el badge decrementa. _(Cruza F1 + F5 → e2e-flow.)_

## Sequencing

F1 antes de F5 conviene porque ambos tocan `useNotifications.ts`. _(Heading de proceso → **prosa-no-issue**.)_

## Out of scope

Rediseño visual del panel — solo se corrige comportamiento. _(Heading de proceso → **prosa-no-issue**.)_
