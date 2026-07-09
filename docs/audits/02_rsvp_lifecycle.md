# A2 — 🎟️ Ciclo de vida RSVP

> **Estado:** ⬜ pendiente · **Owner/Sesión:** — · **Inicio:** — · **SHA auditado:** —
> **SHA de referencia del framework:** `bcc7f1e`
> **Protocolo:** seguir al pie de la letra el "Protocolo por sesión (lock atómico)" y las "Reglas de evidencia" de `docs/audits/00_INDEX.md`. Read-only sobre el código de la app: solo se escribe en este MD y en el INDEX.

---

## 1. Objetivo

Verificar la corrección **funcional** del ciclo de vida completo de un RSVP — creación, consulta, edición, cancelación y re-confirmación — incluyendo: que `rsvpClosed` realmente cierre el periodo de RSVP en todos los caminos (no solo en UI), qué impide duplicados, si la capacidad (`capacityEnabled`/`capacityLimit`) se respeta, la consistencia de `plusOne`/`plusOneName` entre los tres caminos de escritura (create público, update público, edición admin), la validación funcional del `cancelToken`, el comportamiento de `emailHistory` al cambiar email, y si es posible hacer RSVP a eventos pasados.

**Esto NO es una auditoría de seguridad.** Todo se evalúa como corrección funcional (¿el flujo hace lo que el host y el invitado esperan?), no como superficie de ataque.

## 2. Contexto mínimo (para sesión fría)

- **Estados de un RSVP:** columna `rsvps.status` (`lib/schema.ts:93`, varchar 20, default `'confirmed'`). En la práctica solo existen dos valores escritos por el código: `'confirmed'` (`lib/queries.ts:51`, `app/api/rsvp/update/route.ts:47`, `app/admin/page.tsx:586`) y `'cancelled'` (`lib/queries.ts:123`, `app/admin/page.tsx:586`). No hay enum ni constraint en DB.
- **Ciclo esperado:** invitado crea RSVP desde el modal público (`app/components/RSVPModal.tsx` → `POST /api/rsvp`) → recibe email de confirmación (si `emailConfirmationEnabled`) con link `/cancel/{rsvpId}?token={cancelToken}` → desde esa página puede **editar** (`POST /api/rsvp/update`), **cancelar** (`POST /api/rsvp/cancel`) o, si está cancelado, **re-confirmar** (update con `reconfirm: true`). El admin puede editar/cancelar/reconfirmar desde el panel (`POST /api/admin/update-rsvp`).
- **cancelToken:** es **determinístico**, no aleatorio: `sha256("{rsvpId}-{email}-{CANCEL_TOKEN_SECRET}")` truncado a 32 hex (`lib/queries.ts:188-193`). La validación **recalcula** el token a partir de `rsvpId` + el email **actual** en DB (`lib/queries.ts:195-198`); la columna `rsvps.cancelToken` (`lib/schema.ts:103`) NO se lee al validar. Consecuencia funcional: el token de un link depende del email vigente y del secret — si cualquiera de los dos cambia, los links viejos dejan de funcionar.
- ⚠️ **Gotcha:** `rsvps.eventId` (text, `lib/schema.ts:83`) almacena el **slug** del evento, no el UUID (`app/api/rsvp/route.ts:49`). `getEventBySlug` acepta slug y hace fallback por id (`lib/queries.ts:223-241`).
- `events.date` es **texto libre** (`lib/schema.ts:18`), no timestamp — relevante para el ítem de eventos pasados.
- `POST /api/rsvp` tiene un **modo demo** (sin `DATABASE_URL`) que guarda en un array en memoria (`app/api/rsvp/route.ts:147-173`); en producción con Neon configurado ese camino no debería ejecutarse.

## 3. Scope

**Dentro:**
- `app/api/rsvp/route.ts` (POST crear, GET admin-list)
- `app/api/rsvp/get/route.ts`, `app/api/rsvp/update/route.ts`, `app/api/rsvp/cancel/route.ts`
- `app/api/admin/update-rsvp/route.ts` (solo su efecto sobre datos de RSVP)
- `app/cancel/[rsvpId]/page.tsx`, `app/components/RSVPModal.tsx`, sección RSVP de `app/[slug]/page.tsx`
- `lib/queries.ts` — `saveRSVP:17`, `getRSVPById:76`, `updateRSVP:90`, `cancelRSVP:108`, `recordEmailSent:133`, `getEventStats:167`, `generateCancelToken:188`, `validateCancelToken:195`
- `lib/schema.ts` — tabla `rsvps` y campos de `events` que gobiernan el ciclo (`rsvpClosed`, `capacityEnabled/Limit`, `requirePlusOneName`, `isActive`)

**Fuera (explícito):**
- Contenido, templates y puntos de envío de **emails** (confirmación/recordatorios) → **A1**. Aquí solo se audita *cuándo* se dispara/omite el email de confirmación y qué se registra en `emailHistory`, no el email en sí.
- **Protección/autenticación de endpoints**, robustez del token frente a adversarios, rate limiting → **Fase S**. El ítem de `cancelToken` aquí es funcional: "¿el flujo legítimo funciona y los links siguen siendo válidos cuando deben?".
- Panel admin en general (UI, permisos, otras funciones) → **A4**. Solo entra la consistencia de datos que `update-rsvp` escribe.
- Queries/schema en general (índices, tipos, migraciones) → **A6**.

## 4. Checklist ejecutable

> Cada ítem requiere evidencia (`archivo:línea` inspeccionado o comando + output), también al pasar. Ítems no ejecutables → `⏭️ NOT RUN` + razón. Los ítems marcados **[runtime]** idealmente se verifican con requests reales (curl contra dev local con `DATABASE_URL` de prueba o rama Neon); si no hay entorno, se resuelven por inspección de código y se anota el método en la evidencia.

### Grupo A — Flujo end-to-end básico

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| A2-01 | **Crear**: `POST /api/rsvp` con datos válidos crea RSVP `status='confirmed'` con `eventId=slug`, y valida campos requeridos (name/email/phone) y formato de email. **[runtime]** | Inspeccionar `app/api/rsvp/route.ts:15-74` (validaciones :21-35, resolución de evento :46-65, `saveRSVP` :67-74) y `lib/queries.ts:43-56` (status `'confirmed'` :51). Confirmar que `eventId` guardado es el slug (:49). | ⬜ | |
| A2-02 | **Consultar**: `GET /api/rsvp/get?rsvpId&token` devuelve el RSVP con token válido y 403/404 en los casos contrarios. Revisar QUÉ campos devuelve: el objeto de respuesta (`app/api/rsvp/get/route.ts:39-50`) incluye id, name, email, phone, plusOne, status, eventId — verificar si **falta `plusOneName`** y qué consecuencia tiene aguas abajo (ver A2-14). | Leer `app/api/rsvp/get/route.ts` completo (59 líneas). Contrastar con la interface `RSVPData` de `app/cancel/[rsvpId]/page.tsx:9-18` que sí declara `plusOneName`. | ⬜ | |
| A2-03 | **Editar**: `POST /api/rsvp/update` con token válido actualiza name/email/phone/plusOne/plusOneName y responde el RSVP actualizado. **[runtime]** | Inspeccionar `app/api/rsvp/update/route.ts:4-57` (validación de campos :9, token contra email ACTUAL :26-34, `updateData` :37-43, `updateRSVP` :51) y `lib/queries.ts:90-103`. | ⬜ | |
| A2-04 | **Cancelar**: `POST /api/rsvp/cancel` con token válido pone `status='cancelled'` y responde éxito; token inválido → 403, RSVP inexistente → 404. **[runtime]** | Inspeccionar `app/api/rsvp/cancel/route.ts:4-47` y `lib/queries.ts:108-128` (validación :118, set cancelled :122-125). | ⬜ | |
| A2-05 | **Re-confirmar**: update con `reconfirm: true` sobre RSVP `cancelled` regresa a `confirmed`; sobre RSVP ya `confirmed` el flag se ignora (condición `reconfirm && currentRSVP.status === 'cancelled'`, `app/api/rsvp/update/route.ts:46-48`). La página `/cancel` manda `reconfirm` automáticamente cuando el status cargado es `cancelled` (`app/cancel/[rsvpId]/page.tsx:143`). **[runtime]** | Ejecutar (o trazar por código) la secuencia completa crear→cancelar→re-confirmar y registrar el status resultante en cada paso. | ⬜ | |

### Grupo B — rsvpClosed

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| A2-06 | ¿`rsvpClosed=true` **bloquea la creación en la API**? `POST /api/rsvp` solo valida `event.isActive` (`app/api/rsvp/route.ts:52-58`); buscar cualquier chequeo de `rsvpClosed` en el endpoint y en `saveRSVP` (`lib/queries.ts:17-57`). `grep -n rsvpClosed app/api/rsvp/route.ts lib/queries.ts` — al cierre de este framework el único hit en queries es la lógica de reminders (:482). **[runtime]** | Inspección + (ideal) POST real a un evento con `rsvpClosed=true` y `isActive=true`, registrar si crea el RSVP (y si dispara email de confirmación, `app/api/rsvp/route.ts:77-137` — cruzar con A1). | ⬜ | |
| A2-07 | ¿`rsvpClosed=true` bloquea **edición y re-confirmación** en la API? `POST /api/rsvp/update` no carga el evento en ningún momento (`app/api/rsvp/update/route.ts` completo — sus únicos imports de queries son `updateRSVP, validateCancelToken, getRSVPById` :2); verificar que ni update ni reconfirm consultan `rsvpClosed`, `isActive` ni capacidad. | Inspección del archivo completo (67 líneas) + trazar `updateRSVP` (`lib/queries.ts:90-103`). | ⬜ | |
| A2-08 | Comportamiento **UI** de `rsvpClosed`: la página pública oculta el botón y muestra `rsvpClosedMessage` (`app/[slug]/page.tsx:244-265`), pero el `RSVPModal` no re-verifica el estado al hacer submit (`app/components/RSVPModal.tsx:40-82`). ¿Qué pasa si el host cierra el RSVP mientras un invitado tiene el modal abierto (o la página cacheada)? Cruzar con A2-06: si la API tampoco bloquea, el RSVP entra. | Inspección de ambos componentes; documentar la ventana modal-abierto→submit. | ⬜ | |

### Grupo C — Duplicados y capacidad

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| A2-09 | **Anti-duplicados por email**: el único mecanismo es el SELECT previo en `saveRSVP` (`lib/queries.ts:28-38`) con match **exacto** de email (case-sensitive, sin trim) + `eventId`, que arroja error atrapado como 409 (`app/api/rsvp/route.ts:178-183`). Verificar: (a) `Foo@x.com` vs `foo@x.com` ¿crea duplicado?; (b) no existe unique constraint en DB (`lib/schema.ts:79-107` — confirmar también en `drizzle/`); (c) el check es check-then-insert sin transacción → dos requests simultáneos pueden duplicar (documentar como comportamiento, la corrección es del plan correctivo). **[runtime]** | Inspección + prueba con email en distinta capitalización. `grep -rn "unique" drizzle/ lib/schema.ts` para (b). | ⬜ | |
| A2-10 | **Duplicados por teléfono**: ¿existe algún chequeo por `phone`? (al cierre del framework: ninguno en `lib/queries.ts:28-38` ni en el endpoint). Mismo invitado con dos emails distintos y mismo teléfono → dos RSVPs. Documentar si esto es aceptado por diseño o hallazgo. | `grep -n "phone" lib/queries.ts app/api/rsvp/route.ts` + inspección. | ⬜ | |
| A2-11 | **Duplicado vs cancelado**: el check de `lib/queries.ts:28-38` NO filtra por status → un invitado que canceló y quiere volver a inscribirse desde la página pública recibe 409 con el mensaje "Ya confirmaste tu asistencia anteriormente" (`app/api/rsvp/route.ts:180`), que es engañoso (está cancelado, no confirmado). Su único camino es re-confirmar vía su link de cancelación (que quizá ya no conserva). Evaluar corrección del flujo y del mensaje. **[runtime]** | Trazar crear→cancelar→POST /api/rsvp de nuevo con el mismo email; registrar respuesta y mensaje mostrado por el modal (`app/components/RSVPModal.tsx:72-75, 269-273`). | ⬜ | |
| A2-12 | **Capacidad**: ¿`capacityEnabled`/`capacityLimit` (`lib/schema.ts:29-30`) se aplican en ALGÚN punto del ciclo de creación/re-confirmación? Al cierre del framework, `grep -rn capacity app/api/rsvp lib/queries.ts` no arroja hits: el límite solo se **muestra** como texto en la página pública (`app/[slug]/page.tsx:227-233`) y se configura en admin. Verificar qué pasa al llegar al límite (¿se sigue aceptando?) y si `plusOne` contaría doble en algún conteo. | Inspección + grep; probar (o trazar) creación con cupo "lleno". | ⬜ | |
| A2-13 | **Conteo de asistentes**: `getEventStats` (`lib/queries.ts:167-182`) devuelve `totalConfirmed: allRsvps.length` — que en realidad es el TOTAL incluyendo cancelados — y NO suma acompañantes (`plusOne`). Verificar quién consume esta función (nota: existe una homónima en `lib/firestore.ts:159` — ¿código muerto? cruzar con A5) y si algún conteo mostrado al host cuenta `plusOne` como segunda persona. | `grep -rn "getEventStats" app lib` + inspección de cómo el admin calcula totales (`app/admin/page.tsx`, buscar `confirmed`/`filter`). | ⬜ | |

### Grupo D — plusOne / plusOneName

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| A2-14 | **Pérdida de plusOneName al editar vía /cancel**: `GET /api/rsvp/get` no devuelve `plusOneName` (`app/api/rsvp/get/route.ts:41-49`) → la página lo inicializa siempre vacío (`app/cancel/[rsvpId]/page.tsx:83`, `data.rsvp.plusOneName || ''` sobre un campo que no viene). En el submit se manda `plusOneName: plusOne ? plusOneName : ''` (:142) y el endpoint lo normaliza a `null` si viene vacío (`app/api/rsvp/update/route.ts:42`). Verificar la consecuencia: un invitado con +1 nombrado que actualiza cualquier dato (p.ej. teléfono) ¿**borra silenciosamente** el nombre de su acompañante? Considerar ambos casos: `requirePlusOneName=true` (campo visible pero vacío y required, :375-391) y `=false` (campo ni se muestra). **[runtime]** | Trazar el ciclo completo con un RSVP que tenga `plusOneName` en DB; confirmar el valor de la columna tras el update. | ⬜ | |
| A2-15 | **Consistencia de normalización entre los 3 caminos de escritura**: create (`app/api/rsvp/route.ts:72`) y update público (`app/api/rsvp/update/route.ts:42`) guardan `plusOne ? (plusOneName?.trim() \|\| null) : null`; el **admin** (`app/api/admin/update-rsvp/route.ts:61`) pasa `updates` (el `editForm` completo, `app/admin/page.tsx:648-686`, :671) **sin trim ni normalización** → puede persistir `plusOneName: ''` (string vacío en vez de null) o un nombre huérfano con `plusOne=false`. Verificar y documentar las combinaciones resultantes posibles en DB. | Inspección de los tres endpoints + del modal de edición admin (`app/admin/page.tsx:624-631` inicialización del form). | ⬜ | |
| A2-16 | **`requirePlusOneName` solo se valida en cliente**: el modal lo exige por JS (`app/components/RSVPModal.tsx:47-52`) y la página /cancel por atributo `required` condicionado a `eventData?.requirePlusOneName` (`app/cancel/[rsvpId]/page.tsx:375`), pero ni `POST /api/rsvp` ni `/api/rsvp/update` verifican el flag del evento (grep `requirePlusOneName` en `app/api/` — al cierre solo aparece en event-settings/events endpoints). Un POST directo (o un fallo de carga de `eventData` en /cancel, :101-103) permite `plusOne=true` sin nombre en eventos que lo requieren. | Inspección + grep. | ⬜ | |

### Grupo E — cancelToken (funcional)

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| A2-17 | **Validación funcional del token**: (a) el token del email se genera con el `rsvp.id` real (`app/api/rsvp/route.ts:104-105`) y la validación recalcula con id+email actual (`lib/queries.ts:195-198`) → el flujo legítimo funciona; (b) la **columna** `rsvps.cancelToken` se llena en `saveRSVP` con un token derivado de `crypto.randomUUID()` — un UUID que NO es el id real del RSVP (`lib/queries.ts:41` vs el id generado por `$defaultFn` en `lib/schema.ts:80`) → el valor almacenado nunca coincide con el token de los links y no se lee en ninguna validación. Confirmar que la columna es valor muerto/engañoso (`grep -rn "cancelToken" app lib --include="*.ts" --include="*.tsx"`); (c) un token de OTRO rsvp/email simplemente no valida (recalculo determinístico) — verificar que ambos endpoints (get/update/cancel) validan contra el email del RSVP correcto (`get:30`, `update:27`, `cancel → lib/queries.ts:118`). | Inspección + grep. NO evaluar fuerza criptográfica ni escenarios adversariales (Fase S). | ⬜ | |
| A2-18 | **Estabilidad de links**: el token depende de `CANCEL_TOKEN_SECRET` (fallback `'default-secret'`, `lib/queries.ts:189`) y del email vigente. Verificar funcionalmente: (a) ¿`CANCEL_TOKEN_SECRET` está definido en el entorno de producción (Vercel)? — si algún día se define/cambia habiendo links emitidos con el fallback, TODOS los links viejos mueren; (b) links en emails ya enviados ¿siguen siendo válidos hoy? **[runtime parcial]** | Revisar variables de entorno del proyecto en Vercel (o `.env*` local, sin volcar valores) y validar un link real si hay uno disponible. Si no hay acceso → NOT RUN con razón. | ⬜ | |
| A2-19 | **Cambio de email en update invalida el link en uso**: el token se valida contra el email ACTUAL (`app/api/rsvp/update/route.ts:26-27`). Tras un update que cambia el email: (a) el token del URL con el que el invitado está en la página deja de validar → recargar `/cancel/...` o pulsar "Cancelar mi Asistencia" (`app/cancel/[rsvpId]/page.tsx:168-205`) fallará con "Token inválido o expirado"; (b) NO se envía email al nuevo (ni al viejo) con el link regenerado — el update no dispara ningún envío (archivo completo `app/api/rsvp/update/route.ts`, sin imports de resend). Verificar la secuencia real y documentar cómo queda el invitado (¿sin ningún link válido en su poder?). **[runtime]** | Trazar/probar: crear → update cambiando email → intentar cancelar con el mismo token. Cruzar el (no-)envío con A1. | ⬜ | |

### Grupo F — Email history, eventos pasados y estados de UI

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| A2-20 | **emailHistory al cambiar email**: `recordEmailSent` (`lib/queries.ts:133-162`) solo appendea `{sentAt, type}` — no registra a QUÉ dirección se envió. Tras un cambio de email, el historial (`lib/schema.ts:97-100`) queda asociado al RSVP sin rastro del email original. El update público y el admin-update no escriben nada en `emailHistory`. Verificar y documentar si esto compromete alguna decisión del host (p.ej. "¿ya le llegó la confirmación?" tras un cambio de email la respuesta del historial es engañosa). | Inspección de `recordEmailSent` y de quién lo llama (`grep -rn "recordEmailSent" app lib`). | ⬜ | |
| A2-21 | **Eventos pasados**: ¿se puede crear/editar/re-confirmar un RSVP para un evento cuya fecha ya pasó? `events.date` es texto libre (`lib/schema.ts:18`) y `POST /api/rsvp` solo valida `isActive` (`app/api/rsvp/route.ts:52-58`) — no hay comparación de fechas en ningún endpoint del ciclo (los únicos chequeos de fecha del repo están en el cron de reminders). Documentar el comportamiento y si el host tiene forma de cerrar el evento más allá de `rsvpClosed`/`isActive` manual. | Inspección + `grep -rn "new Date\|Date.now" app/api/rsvp/` + revisar cómo se compara fecha en `app/api/cron/send-reminders/route.ts` como contraste. | ⬜ | |
| A2-22 | **Estados y mensajes del modal RSVP**: recorrer los 3 estados (`idle/success/error`, `app/components/RSVPModal.tsx:37`) y verificar: (a) el mensaje de éxito "¡Confirmado!" (:145-162) se muestra igual haya o no email de confirmación habilitado — ¿promete algo que no ocurre?; (b) el 409 de duplicado se muestra con el texto del server (:73-74) — cruzar con A2-11 sobre lo engañoso del mensaje para cancelados; (c) el auto-cierre a los 2.5s (:67-71) y el reset del form; (d) error de conexión (:76-78). | Inspección + prueba manual en dev si hay entorno. | ⬜ | |
| A2-23 | **Estados y mensajes de la página /cancel**: recorrer loading (:207-215), link inválido (:66-70), cancelado-éxito (:220-236), warning de RSVP cancelado (:290-294), mensaje post-update que distingue reconfirmación de actualización (:302-308), botón dinámico (:404-406) y que "Cancelar mi Asistencia" solo aparece con status `confirmed` (:410-422). Verificar coherencia del estado local tras update (setRsvpData con la respuesta, :152) y tras reconfirm. | Inspección de `app/cancel/[rsvpId]/page.tsx` + prueba manual si hay entorno. | ⬜ | |
| A2-24 | **Modo demo en producción**: confirmar que el branch demo de `POST /api/rsvp` (`app/api/rsvp/route.ts:147-173`, `mockRsvps` :13) es inalcanzable en producción (`isDatabaseConfigured`, `lib/db.ts`) y anotar el array module-level como candidato a A5 (código muerto en prod). | Inspección de `lib/db.ts` + `vercel env` conceptual (no volcar valores). | ⬜ | |

## 5. Hallazgos

> Registrar aquí SOLO hallazgos con evidencia `archivo:línea`. IDs secuenciales A2-Hxx. Severidad según rúbrica del INDEX (🔴 rompe flujo / email indebido · 🟡 edge case incorrecto o deuda que causará bugs · 🟢 limpieza).

| ID | Severidad | Descripción | Evidencia |
|----|-----------|-------------|-----------|
| — | — | *(pendiente de ejecución)* | — |

## 6. Hallazgos fuera de scope

> Anotar factualmente, con referencia cruzada a la auditoría dueña (A1, A4, A5, A6, A7, Fase S). No profundizar.

| Ref → | Descripción | Evidencia |
|-------|-------------|-----------|
| — | *(pendiente de ejecución)* | — |

## 7. Cierre

1. Verificar que **todos** los ítems A2-01…A2-24 tienen resultado con evidencia o `⏭️ NOT RUN` con razón.
2. Consolidar el conteo de hallazgos por severidad (X🔴 Y🟡 Z🟢).
3. Actualizar la fila **A2** de `docs/audits/00_INDEX.md` a ✅ con el conteo.
4. Commit + push: `audit: A2 rsvp-lifecycle — X🔴 Y🟡 Z🟢`.
