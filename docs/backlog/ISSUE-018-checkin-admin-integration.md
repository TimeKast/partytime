# ISSUE-018 — Integración admin del check-in: toggle, password, stats y exports

- **Epic:** EPIC-005
- **Priority:** P1
- **Story points:** 3
- **Status:** Pending
- **Dependencies:** ISSUE-015, ISSUE-017; secuenciar con ISSUE-013 (ambos tocan admin/exports)
- **User stories:** US-011, US-013
- **Agents:** frontend-specialist
- **Skills:** implement, frontend

## Objetivo

Todo lo que el organizador ve/controla del check-in desde el admin.

## Cambios exactos (`app/admin/page.tsx` + settings del evento)

- Sección "Check-in" en settings del evento:
  - Toggle habilitar (usa el endpoint de ISSUE-015).
  - Campo para fijar/rotar password (6-64 chars) con generador de sugerencia
    simple (3 palabras o 6 dígitos). Al guardar: aviso "las sesiones activas
    del staff se cierran al rotar".
  - URL del portal lista para copiar/compartir:
    `{APP_URL}/checkin/{slug}` + botón copiar (patrón del copy de invite
    links).
- Lista de invitados admin: columna "Llegada" (hora + quién marcó + nota,
  y llegada del +1) cuando `checkin_enabled`.
- Contadores: "Llegados X / Confirmados Y" en el header del evento.
- Exports PDF/Excel: columnas "Llegó (hora)", "Llegada +1", "Marcó", "Nota
  check-in". Coordinar con las columnas de pago de ISSUE-013 (mismo bloque de
  código de export — por eso estos dos issues van secuenciados entre sí).

## Acceptance criteria

```gherkin
Given un organizador manager del evento
When habilita check-in y fija password
Then puede copiar la URL del portal y el password nunca aparece en respuestas del API

Given invitados marcados desde el portal
When el admin abre la lista y exporta
Then ve hora/quién/nota por invitado y los exports incluyen las 4 columnas

Given un viewer (rol de solo lectura)
Then ve stats de llegada pero no puede rotar el password (RBAC)
```

## Tests requeridos

Test de RBAC del endpoint de config y del shape del export (columnas
presentes solo con checkin_enabled).
