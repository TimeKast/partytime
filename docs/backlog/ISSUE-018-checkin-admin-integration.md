# ISSUE-018 — Integración admin del check-in: toggle, password, stats y exports

- **Epic:** EPIC-005
- **Priority:** P1
- **Story points:** 3
- **Status:** Completed (2026-08-18)
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
- Tarjeta de estado en el dashboard con disponibilidad del portal, progreso
  de llegadas y CTA "Abrir portal". Se carga al seleccionar el evento, sin
  exigir visitar primero la configuración; viewer puede verla, pero solo
  manager puede cambiar toggle/password.
- Settings reorganizado en pestañas mobile-first (General, Invitados, Diseño,
  Mensajes y Check-in) con una sola superficie activa y bloques desplegables.
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

## Corrección posterior a entrega — 2026-08-18

El estado de check-in se elevó al contenedor del admin: antes solo se pedía al
montar la sección de settings, por lo que el dashboard inicial ocultaba stats
y columnas hasta visitar Configuración y volver. `GET /api/admin/checkin-config`
acepta ahora el rol `viewer`; `PATCH` conserva mínimo `manager`. La lista de
eventos autenticada usa un DTO allowlist y nunca serializa
`checkin_password_hash`.
