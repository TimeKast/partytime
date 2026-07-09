# 📊 Reporte Consolidado de Auditoría — Party Time!

> **Estado:** 🔄 abierto — se llena conforme se completan A1–A8 (ver `00_INDEX.md`).
> **Regla de cierre:** este reporte NO puede cerrarse mientras la fila "Fase S" del INDEX no esté ✅.

---

## Hallazgos consolidados

> Copiar aquí los hallazgos de cada auditoría completada, manteniendo su ID original (`A1-01`, `A5-03`, …).

| ID | Auditoría | Severidad | Descripción | Evidencia | Estado |
|----|-----------|-----------|-------------|-----------|--------|
| — | — | — | *(pendiente de A1–A8)* | — | — |

## Hallazgos pre-registrados (previos a la ejecución de A1–A8)

Detectados durante el diseño del framework (adversarial review del plan, 2026-07-09). Framing factual; Fase S los verifica y busca patrones similares en el resto de endpoints.

| ID | Severidad | Descripción | Evidencia | Estado |
|----|-----------|-------------|-----------|--------|
| PRE-1 | 🔴 | `send-bulk-reminder` aceptaba requests **sin validar sesión** y disparaba envíos masivos; el loop además cargaba RSVPs por ID sin verificar que pertenecieran al evento (posible envío cross-evento) | Handler sin check: `app/api/admin/send-bulk-reminder/route.ts:17-41` (pre-fix) + loop de envío `:79-138` (pre-fix) | ✅ **Corregido** en `bcc7f1e` (validateSession + userHasEventAccess 'manager' + scoping vía `getRSVPsByEvent`). Pendiente verificación en Fase S |
| PRE-2 | 🔴 | `reminder-status` devolvía nombre, email, teléfono, status y emailHistory de todos los RSVPs de un evento **sin validar sesión** | Handler sin check: `app/api/admin/reminder-status/route.ts:13-35` (pre-fix) + respuesta con datos `:72-98` (pre-fix) | ✅ **Corregido** en `bcc7f1e` (validateSession + userHasEventAccess 'viewer' + 404 si el evento no existe). Pendiente verificación en Fase S |
| PRE-3 | 🟡 | `getRSVPsByEvent(eventId)` declara `eventId` pero los callers le pasan el **slug** — funciona porque `rsvps.eventId` almacena el slug, pero la firma es engañosa y invita a bugs | `lib/queries.ts:62` vs `app/api/rsvp/route.ts:49,227` | ⬜ Confirmar y ampliar en A1/A6 |
| PRE-4 | 🟢 | Build local falla sin `RESEND_API_KEY` porque `lib/resend.ts` instancia el cliente a nivel de módulo (en Vercel pasa por la env var) | `lib/resend.ts:1-9`; repro: `npm run build` sin env | ⬜ Confirmar en A8 |

## Priorización

*(se llena al consolidar: ordenar por severidad × frecuencia de uso del flujo afectado)*

## Plan correctivo

*(se llena al final: lista de fixes agrupados en batches por aislamiento de archivos; será un plan nuevo con su propio ciclo de adversarial review antes de ejecutar)*

## Registro de cierre

- [ ] A1–A8 completadas (ver INDEX)
- [ ] Fase S ejecutada y ✅ (BLOQUEANTE)
- [ ] Hallazgos consolidados y priorizados
- [ ] Plan correctivo creado y revisado
- Fecha de cierre: —
