# Guest management upgrades

## Overview

Optimizar el dashboard de invitados para listas grandes y hacer que las exportaciones reflejen la vista activa. Añadir enlaces privados de registro de un solo uso con caducidad configurable para admitir una excepción controlada cuando el RSVP público esté cerrado.

## Project type

WEB — aplicación Next.js 14 con React, TypeScript, Drizzle ORM y PostgreSQL/Neon.

## Success criteria

- La lista se puede buscar, filtrar, ordenar y paginar sin perder el contexto visible.
- PDF y Excel usan todo el conjunto filtrado y el mismo orden de la vista, independientemente de la página actual.
- Un manager puede generar y revocar enlaces con expiración explícita para el evento seleccionado.
- Un enlace válido permite un solo RSVP exitoso aunque `rsvpClosed=true`; no evita evento inactivo, capacidad, duplicados ni validación.
- Tokens secretos nunca se almacenan en texto claro y el consumo es atómico ante solicitudes concurrentes.
- Pruebas, typecheck, build y smoke de los caminos principales quedan en verde.

## Tech stack and decisions

- Reutilizar filtros y exportadores en cliente porque el dashboard ya carga la colección completa por evento.
- Centralizar filtro, orden y paginación en helpers puros para probar la semántica sin acoplarla a React.
- Guardar sólo SHA-256 del token aleatorio de 256 bits; mostrar el URL crudo una sola vez al crearlo.
- Consumir el token dentro de la misma transacción que crea/reactiva el RSVP.
- La excepción sólo omite `rsvpClosed`; `isActive`, capacidad, unicidad y campos requeridos siguen cerrados por defecto.
- Las exportaciones contienen el conjunto filtrado completo, no sólo la página actual, e incluyen estado para que `Todos` sea inequívoco.

## File structure

```text
app/admin/                              # controles, paginación y gestión de links
app/api/admin/rsvp-invitations/         # API autenticada de creación/listado/revocación
app/api/rsvp/route.ts                   # registro público con consumo opcional de token
app/invite/                             # registro público; el bearer llega por fragmento y se borra
lib/rsvp-list.ts                        # filtro, orden, paginación y resumen exportable
lib/rsvp-invitation.ts                  # generación/hash/validación de tokens
lib/schema.ts + drizzle/0008_*.sql      # persistencia de links de un solo uso
tests/                                  # contratos de lista, token, rutas y UI
docs/backlog/                           # epic e issues ejecutables
```

## Task breakdown

### GM-01 — Modelo común de vista de invitados

- **Agent/skill:** frontend-specialist / implement
- **Priority:** P1
- **Dependencies:** none
- **INPUT:** colección RSVP y filtros existentes.
- **OUTPUT:** orden (`A–Z`, `Z–A`, reciente, antiguo), paginación y reset seguro de página.
- **VERIFY:** pruebas unitarias cubren filtros combinados, locale sort y límites de página.
- **Rollback:** retirar helper/controles conserva la carga actual completa.

### GM-02 — Exportación fiel a la vista

- **Agent/skill:** frontend-specialist / implement
- **Priority:** P1
- **Dependencies:** GM-01
- **INPUT:** colección filtrada y ordenada antes de paginar.
- **OUTPUT:** PDF/XLSX con el mismo orden/filtros, estado y resumen de criterios activos.
- **VERIFY:** pruebas del modelo exportable y smoke descargando ambos formatos.
- **Rollback:** volver a exportar la colección base sin afectar datos.

### GM-03 — Capacidad segura de links de registro

- **Agent/skill:** backend-specialist / implement
- **Priority:** P0
- **Dependencies:** none
- **INPUT:** evento, usuario manager y expiración futura.
- **OUTPUT:** migración, queries transaccionales y API autenticada; hash-only, un uso y revocación.
- **VERIFY:** pruebas de hash, expiración, permisos, consumo y concurrencia condicionada.
- **Rollback:** dejar de emitir links; la tabla es aditiva y no modifica RSVPs existentes.

### GM-04 — UX admin y registro público por link

- **Agent/skill:** frontend-specialist / implement
- **Priority:** P1
- **Dependencies:** GM-03
- **INPUT:** endpoints de invitación y formulario RSVP actual.
- **OUTPUT:** panel para generar/copiar/revocar y página `/invite#token=…` accesible.
- **VERIFY:** Gherkin de ISSUE-003/004 y smoke de link válido, vencido, usado y cerrado.
- **Rollback:** ocultar panel/ruta; RSVP público normal permanece intacto.

### GM-05 — Phase X: verification

- **Agent/skill:** test-engineer / implement
- **Priority:** P2
- **Dependencies:** GM-01, GM-02, GM-03, GM-04
- **INPUT:** implementación integrada.
- **OUTPUT:** evidencia de lint/typecheck, test, build, migración y smoke real.
- **VERIFY:** todos los comandos documentados terminan con exit code 0 o una limitación explícita.
- **Rollback:** cada bloque es aditivo y puede desactivarse independientemente.

## Dependency graph

```text
GM-01 -> GM-02 ----\
                  +-> GM-05
GM-03 -> GM-04 ----/
```

## Phase X: verification

- [x] `pnpm test` — 375/375 pruebas en verde.
- [x] `pnpm exec tsc --noEmit` — sin errores.
- [x] `pnpm build` — compilación de producción completa; lint sin warnings ni errores.
- [x] `pnpm db:preflight` y `pnpm verify:db` — `registered-current-schema` y contrato completo de `0008` en rama Neon desechable.
- [x] Dashboard — filtros, orden, paginación y exportación fiel cubiertos por pruebas unitarias/contrato; protección de sesión y redirect verificados.
- [x] Smoke invitación con DB migrada — validate 200, registro 201, revalidación 404 y segundo registro 409.
- [x] Carrera real Neon — dos consumidores, un ganador, un RSVP y `used_rsvp_id` correlacionado.
- [x] Revisión Tier 3 focalizada y remediación dirigida — 0 findings abiertos; ver `docs/audits/security-2026-08-18.md`.

## Implementation evidence

- ISSUE-001: helpers puros, controles accesibles y exportadores integrados; 7 pruebas unitarias específicas.
- ISSUE-002: esquema/migración, APIs y consumo SQL atómico integrados; 27 pruebas específicas.
- ISSUE-003: gestor admin, ruta pública y reutilización del RSVP modal integrados; 6 pruebas de contrato UI.
- Gates integrados: 47 archivos de prueba, 375 casos, lint/typecheck/build en verde y `git diff --check` limpio.
- Migración y smokes ensayados en una rama Neon desechable, sin fixtures residuales; la rama fue eliminada sin promover cambios al padre.
- Auditoría de seguridad: M-01, M-02, M-03 y L-01 corregidos y verificados de forma dirigida.
- Rollout productivo completado el 2026-08-18: código `9f615f2`, migración `0008`, preflight/`verify:db`, smokes público y administrativo, concurrencia y cleanup en verde.
- Se conserva temporalmente la rama Neon de respaldo `br-small-violet-ahliojrr` durante la ventana post-deploy de dos horas.
