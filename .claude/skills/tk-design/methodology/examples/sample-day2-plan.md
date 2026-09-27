# Plan — Iteración day-2 sobre app derivada (FIXTURE de calibración)

> **No es un plan real** — es la referencia de calibración del **day-2 classifier**
> (`day2-classification.md`) y del seed (`16_DESIGN.seed.template.md`). Ejercita los 5 casos
> que el gate de Fase 1 + la action matrix deben resolver: **pantalla nueva**, **backfill sin
> spec**, **regen con SCR existente**, **backend-only que NO dispara el gate**, y
> **component-only que NO dispara el gate**. Las rutas referidas existen (o no) en el fixture
> `tests/fixtures/day2-seed-app/`. El `expected-parsed-plan.md` esperado vive junto a este
> archivo y está hand-checked (no es assertion de CI — la decomposición es juicio del LLM).

## Context

La app derivada (fixture `day2-seed-app/`) corre sobre el Starter Kit sin haber pasado
nunca por `/design` greenfield. Esta iteración agrega un tablero de analytics, retoca el
dashboard, formaliza la pantalla de inventario y hace ajustes de backend y de un componente
compartido. _(Heading de proceso → **prosa-no-issue**; alimenta el §1 Objetivo de cada unidad.)_

## Cambios

### C1 — Pantalla nueva: Analytics

Agregar una pantalla nueva en `src/app/(protected)/analytics/page.tsx` (no existe hoy en el
fixture): panel de analytics con gráfica de tendencias + filtros en cascada por sucursal.
Layout propio (no es un mount de primitiva del kit).

### C2 — Backfill: Inventario sin spec

`src/app/(protected)/inventario/page.tsx` ya existe en el código pero no tiene SCR. Esta
iteración formaliza la pantalla y le agrega exportación a CSV. Hay que cosechar el as-built y
encima poner el delta del plan.

### C3 — Regen: Dashboard con SCR existente

`src/app/(protected)/dashboard/page.tsx` existe en código y ya tiene un SCR cubriéndolo (el
seed lo registró). El plan lo retoca: agrega una tarjeta de "alertas recientes" arriba del
grid. Cambio estructural descrito (nueva vista en el layout) → re-emitir el spec sobre el
mismo SCR ID.

### C4 — Backend-only: recálculo de métricas

Mover el cálculo de métricas del dashboard a un endpoint dedicado: nuevo
`src/app/api/metrics/route.ts` + helper en `src/lib/metrics/aggregate.ts`. Sin tocar ningún
`page.tsx`. _(Solo backend/data — NO debe disparar el gate de diseño.)_

### C5 — Component-only: badge de estado compartido

Extraer el badge de estado a `src/components/common/StatusBadge.tsx` y reusarlo en las
tablas existentes. Sin pantalla nueva ni cambio de layout en ninguna ruta. _(Solo
`src/components/**` — NO debe disparar el gate de diseño.)_

## Critical files

- `src/app/(protected)/analytics/page.tsx` — pantalla nueva (C1)
- `src/app/(protected)/inventario/page.tsx` — backfill + export CSV (C2)
- `src/app/(protected)/dashboard/page.tsx` — regen: tarjeta de alertas (C3)
- `src/app/api/metrics/route.ts` — endpoint de métricas (C4, backend-only)
- `src/lib/metrics/aggregate.ts` — helper de agregación (C4, backend-only)
- `src/components/common/StatusBadge.tsx` — badge compartido (C5, component-only)

## Verification

- La pantalla de analytics renderiza la gráfica de tendencias con filtros en cascada (C1).
- Inventario exporta la tabla actual a CSV respetando los filtros (C2).
- El dashboard muestra la tarjeta de alertas recientes arriba del grid (C3).
- El endpoint `/api/metrics` devuelve las métricas agregadas (C4).
- El `StatusBadge` se renderiza igual en las tablas de inventario y equipo (C5).

## Out of scope

Rediseño visual global — esta iteración no redefine la dirección visual del proyecto.
_(Heading de proceso → **prosa-no-issue**.)_
