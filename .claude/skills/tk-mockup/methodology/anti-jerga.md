# anti-jerga — el mockup habla el idioma del cliente

> Anclado a `CC.md §3 Plain language`. El mockup es un artefacto **client-facing** (validación UX). El
> texto visible es para el cliente, no para el developer. Cero jerga técnica en lo que se renderiza.

## Regla central

El renderer pinta **solo el `§11 Copy es-MX` del SCR, literal**. No inventa copy, no traduce nombres
técnicos, no rellena labels con términos de stack.

## Términos prohibidos en texto renderizado

Nunca aparecen en lo que ve el cliente (labels, títulos, botones, estados, tooltips):

`Next.js` · `React` · `RSC` · `Server Action` · `Route Handler` · `API` · `endpoint` · `DB` ·
`database` · `schema` · `Drizzle` · `SQL` (salvo que sea el dominio del producto, ej. un asistente que
muestra queries) · `Zod` · `RBAC` · `DataTable` · `props` · `hook` · `revalidate` · `cache` ·
`deploy` · `commit` · `payload` · `JSON` · `token` (salvo "token" de marca/seguridad visible al user).

> Estos términos sí viven en el SCR (`§5`, `§6 Data wiring`, `§13 Refs`) — ahí son binding para el
> developer. Pero el binding NO se renderiza como texto: se traduce a la **primitiva visual**, no al
> nombre del componente. Ej: `§5` dice `DataTable` → se renderiza una tabla `pk-table`, nunca la
> palabra "DataTable".

## Qué SÍ se renderiza

- El copy literal de `§11` (es-MX): títulos, subtítulos, labels de KPI, CTAs, copy de empty/error.
- Nombres de dominio del producto (entidades, secciones de negocio) tal como aparecen en `§11`/`§6`.

## Lint (Phase 4)

El auto-checklist escanea el HTML renderizado (texto visible, fuera de comentarios y de `data-*`) por la
lista de términos prohibidos. Match → surface en el checkpoint para corregir (el copy debería venir de
`§11`; si un término técnico aparece, o el SCR lo tenía mal o el render inventó — ambos se corrigen).
