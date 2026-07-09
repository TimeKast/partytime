# A1 — 📧 Auditoría: Emails y recordatorios

> **Estado:** 🔄 en curso · **Owner/Sesión:** fable5-c37b36 · **Inicio:** 2026-07-09 10:10
> **SHA framework de referencia:** `bcc7f1e` · **SHA auditado:** `9d9c7f2`

**⚠️ ANTES DE EMPEZAR — protocolo de `docs/audits/00_INDEX.md` (obligatorio):**

1. `git pull --ff-only`.
2. Marcar la fila A1 del INDEX como 🔄 con Owner, Inicio y SHA auditado. **Commit + push inmediato** — el lock solo existe cuando el push tiene éxito; si es rechazado → `git pull --ff-only` y re-seleccionar auditoría.
3. **Read-only:** durante la auditoría está prohibido editar código de la app. Solo se escribe en este MD y en `00_INDEX.md`.
4. **Evidencia obligatoria en TODOS los ítems, también cuando pasan:** `archivo:línea` inspeccionado o comando + output relevante. Ítem sin evidencia = auditoría no cerrable.
5. Ítems no ejecutables → `⏭️ NOT RUN` + razón explícita (p.ej. "requiere DATABASE_URL, no disponible").
6. Alcance: **corrección funcional únicamente** — ¿se envía el email correcto, a quien corresponde, cuando corresponde, exactamente una vez? La protección de endpoints/sesiones NO se audita aquí (Fase S); si aparece algo de esa naturaleza, va a "Hallazgos fuera de scope" sin profundizar.

---

## 1. Objetivo

Verificar que los **5 puntos de envío de email** de la app envían el email correcto, al destinatario correcto, en el momento correcto, **exactamente una vez** — y que lo registran de forma consistente. Esto incluye: que los recordatorios del cron salgan solo el día agendado y solo a confirmados de eventos vigentes; que ningún punto de envío incluya RSVPs cancelados cuando no corresponde; que los links de cancelación funcionen para cada destinatario; que los templates muestren los datos del evento correcto (no los del config estático); y que los 4 fixes recientes (`5894370`, `0e7ad21`, `cc195f8`, `bcc7f1e`) no hayan regresado ni dejado huecos. La app está en **producción con usuarios reales** — un email mal dirigido o duplicado es el peor escenario de esta auditoría.

## 2. Contexto mínimo (para sesión fría)

- **Los 5 puntos de envío:**
  1. **Confirmación automática al hacer RSVP** — `app/api/rsvp/route.ts` (POST, envío en :77–137, condicionado a `event.emailConfirmationEnabled`).
  2. **Recordatorios programados vía cron** — `app/api/cron/send-reminders/route.ts` (GET/POST).
  3. **Email individual manual desde admin** — `app/api/admin/send-email/route.ts` (confirmación / recordatorio / re-invitación según estado).
  4. **Envío masivo manual desde admin** — `app/api/admin/send-bulk-email/route.ts` (tipo por-RSVP según `status`/`emailSent`).
  5. **Recordatorio masivo manual desde admin** — `app/api/admin/send-bulk-reminder/route.ts` (siempre `isReminder: true`).
- **Gotcha crítico:** `rsvps.eventId` (columna text) almacena el **slug** del evento, NO el UUID (`app/api/rsvp/route.ts:49` asigna `eventId = event.slug`; insert en `lib/queries.ts:50`). Todo helper que filtre RSVPs "por evento" debe recibir slug.
- **Cron:** `vercel.json:2-7` → `/api/cron/send-reminders` cada 12h (`0 */12 * * *`). Vercel Cron corre en **UTC** → 00:00 y 12:00 UTC = **18:00 y 06:00 hora Ciudad de México (UTC-6)**. La ventana "hoy" del query se calcula en UTC (`lib/queries.ts:462-467`).
- **Registro de envíos:** `rsvps.emailHistory` (JSONB, `lib/schema.ts:97`) acumula `{sentAt, type}` y `rsvps.emailSent` (timestamp, `lib/schema.ts:96`) guarda el último envío — ambos escritos por `recordEmailSent` (`lib/queries.ts:133`). A nivel evento, `events.reminderSentAt` (`lib/schema.ts:71`) es el lock anti-duplicado del cron, escrito por `markReminderSent` (`lib/queries.ts:492`).
- **Estados de RSVP:** solo existen `'confirmed'` (default, `lib/schema.ts:93`) y `'cancelled'`. **No existe `'declined'`** en el schema ni en el código (verificar con grep — ítem 16).
- Cliente Resend instanciado a nivel de módulo (`lib/resend.ts:7`); `FROM_EMAIL` con fallback `onboarding@resend.dev` (`lib/resend.ts:9`).

## 3. Scope de archivos

| Archivo | Zona relevante |
|---------|----------------|
| `app/api/cron/send-reminders/route.ts` | completo (237 líneas) — auth :22-37, loop eventos :82-201, lock :110-113, envío :158-163, registro :176 |
| `app/api/rsvp/route.ts` | POST :15-190 (envío :77-137) · GET :193-254 (lectura, para PRE-3) |
| `app/api/admin/send-email/route.ts` | completo (147 líneas) — datos del body :26, eventData :35-78, envío :115-120, registro :131-132 |
| `app/api/admin/send-bulk-email/route.ts` | completo (171 líneas) — resolución evento :33-36, loop :100-154 |
| `app/api/admin/send-bulk-reminder/route.ts` | completo (186 líneas) — scoping :105-116, filtro confirmed :118-122 |
| `lib/queries.ts` | `saveRSVP` :17 · `getRSVPsByEvent` :62 · `getRSVPById` :76 · `recordEmailSent` :133 · `generateCancelToken` :188 · `getEventsWithPendingReminders` :459 · `markReminderSent` :492 · `getConfirmedRSVPsForReminder` :503 · `updateEventSlug` :345 (migración de `rsvps.eventId` al renombrar slug) |
| `lib/resend.ts` | completo (9 líneas) |
| `lib/email-template.ts` | completo (347 líneas) — fallback estático :52-62, textos :71-89, plusOne :257-276, footer :324-334 |
| `vercel.json` | crons :2-7 |
| `app/admin/page.tsx` | SOLO :826-831 (cómo se serializa `reminderScheduledAt` desde el datetime-local) — lectura puntual, no se audita el panel (A4) |
| `app/api/admin/event-settings/update/route.ts` | SOLO :126-135 (persistencia de `reminderScheduledAt`) — lectura puntual |

**Fuera de scope explícito:**

- **Protección de endpoints y sesiones** (validación de `CRON_SECRET`, `validateSession`, `userHasEventAccess`, quién puede llamar qué) → **Fase S**. Aquí solo se verifica la *corrección funcional* de a quién se envía. Si algo de auth parece roto, se anota en "Hallazgos fuera de scope" sin explotar.
- Ciclo de vida RSVP (crear/editar/cancelar/reconfirmar como flujo) → A2. Aquí solo importa qué RSVPs reciben email.
- Panel admin (UI, formularios) → A4. Solo se lee `admin/page.tsx:826-831` como fuente del timestamp.
- Código muerto/duplicado en general → A5 (pero la duplicación **entre los 5 puntos de envío** sí es de A1, ítems 26-27).
- `app/api/admin/reminder-status/route.ts` — no envía emails (solo lectura de estado); mencionado únicamente si aparece divergencia con los criterios de selección de los que sí envían.

## 4. REQUISITO DE COMPLETITUD — call-graph de los 5 puntos de envío

**Obligatorio antes del checklist:** trazar ruta→helper de CADA punto de envío leyendo el código (no de memoria): qué query selecciona destinatarios, qué filtra (status, evento, ids), qué se marca como enviado y **en qué orden respecto al `resend.emails.send()`**. Llenar la tabla con `archivo:línea` en cada celda. Una fila incompleta = auditoría no cerrable.

| Punto de envío | Quién selecciona destinatarios (query + archivo:línea) | Filtros aplicados (status/evento/ids) | Qué/cuándo se registra en emailHistory / reminderSentAt (¿antes o después del send?) | Riesgo de duplicado/omisión detectado |
|---|---|---|---|---|
| 1. Confirmación RSVP (`app/api/rsvp/route.ts`) | | | | |
| 2. Cron recordatorios (`app/api/cron/send-reminders/route.ts`) | | | | |
| 3. Admin individual (`app/api/admin/send-email/route.ts`) | | | | |
| 4. Admin bulk email (`app/api/admin/send-bulk-email/route.ts`) | | | | |
| 5. Admin bulk reminder (`app/api/admin/send-bulk-reminder/route.ts`) | | | | |

> Pista de arranque (verificar, no copiar): el punto 3 es el único cuyo **destinatario** (`email`) llega en el body del request en vez de leerse del RSVP en DB (`app/api/admin/send-email/route.ts:26`). El punto 2 es el único con lock a nivel evento **antes** del envío (`app/api/cron/send-reminders/route.ts:110-113`).

## 5. Checklist de verificaciones

Formato de resultado: 🟩 pasa · 🟥 falla (→ registrar hallazgo) · ⏭️ NOT RUN (+ razón). **Evidencia obligatoria en todos.**

### A. Regresión de los 4 fixes recientes

| # | Verificación | Cómo verificar (comando/paths) | Resultado | Evidencia |
|---|---|---|---|---|
| 1 | **cc195f8 vigente:** `markReminderSent(event.id)` se ejecuta ANTES del loop de envío del cron (lock anti-duplicado por timeout). Confirmar que ninguna edición posterior lo movió después del envío. | Read `app/api/cron/send-reminders/route.ts:103-113` y comparar con `git show cc195f8 -- app/api/cron/send-reminders/route.ts` | ⬜ | |
| 2 | **0e7ad21 vigente:** la ventana del cron selecciona SOLO eventos con `reminderScheduledAt` dentro de HOY (`gte startOfDay` + `lte endOfDay` + `reminderSentAt IS NULL`), no "hoy o antes". | Read `lib/queries.ts:462-478`; `git show 0e7ad21 -- lib/queries.ts` | ⬜ | |
| 3 | **¿5894370 sobrevivió al rewrite de 0e7ad21?** `5894370` añadió filtro de "evento con fecha ya pasada"; `0e7ad21` reescribió la función. El filtro post-query actual (`lib/queries.ts:481-484`) SOLO excluye `rsvpClosed` — verificar si quedó algún check contra `events.date`. Caso concreto: evento con `date` de la semana pasada pero `reminderScheduledAt` = hoy (p.ej. reprogramado y olvidado) → ¿recibe reminder? | `git show 5894370 -- lib/queries.ts` vs `git show 0e7ad21 -- lib/queries.ts` vs Read `lib/queries.ts:459-487` actual — diff de los tres estados | ⬜ | |
| 4 | **bcc7f1e vigente (parte funcional del scoping):** en `send-bulk-reminder`, los `rsvpIds` del body se cruzan contra `getRSVPsByEvent(event.slug)` y los ids ajenos al evento se rechazan con error, no se procesan. | Read `app/api/admin/send-bulk-reminder/route.ts:105-116` | ⬜ | |

### B. Fechas, "hoy" y zona horaria

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| 5 | **¿Qué día "es" para el cron?** La ventana se construye con `now.toISOString().split('T')[0]` → día **UTC** (`lib/queries.ts:462-467`). El admin captura `reminderScheduledAt` en un `datetime-local` (hora local del navegador, típicamente México UTC-6) y lo serializa con `.toISOString()` (`app/admin/page.tsx:826-827`, persistido en `app/api/admin/event-settings/update/route.ts:126-128`). Trazar el caso: recordatorio agendado para "hoy 20:00" hora México → se guarda como 02:00 UTC del día **siguiente** → la corrida de 00:00 UTC (18:00 MX) del día agendado NO lo ve, y la del día siguiente sí → ¿el reminder sale el día equivocado según el usuario? Documentar la matriz corrida-cron × hora-agendada. | Read de las 3 zonas citadas + razonamiento escrito de la matriz (00:00 UTC y 12:00 UTC vs horas MX 00:00–23:59) | ⬜ | |
| 6 | **La hora agendada se ignora dentro del día:** la condición es `startOfDay <= scheduledAt <= endOfDay` sin `scheduledAt <= now` (`lib/queries.ts:475-476`). Un reminder agendado hoy a las 23:00 UTC sale en la corrida de 00:00 UTC (23h antes de lo agendado). ¿Es comportamiento aceptado/documentado o sorpresa para el host? | Read `lib/queries.ts:469-478`; buscar documentación/UI que comunique esto: `grep -rn "recordatorio" app/admin/page.tsx \| head` | ⬜ | |
| 7 | **Silencio permanente si se pierde el día:** combinando #5/#6 — si ambas corridas de un día fallan (deploy caído, 401 del cron), `reminderScheduledAt` queda en el pasado y `gte(startOfDay)` lo excluye para siempre; `reminderSentAt` queda NULL sin reintento ni alerta. Confirmar que no existe mecanismo de recuperación. | Read `lib/queries.ts:459-487`; `grep -rn "reminderScheduledAt" app lib --include="*.ts"` buscando algún re-enqueue | ⬜ | |
| 8 | **Método real de invocación del cron:** Vercel Cron hace **GET**; el route soporta GET y POST (`app/api/cron/send-reminders/route.ts:19,234-236`) y `00_INDEX.md:59` dice "POST". Verificar qué header manda Vercel realmente cuando `CRON_SECRET` está seteado (documentación oficial: `Authorization: Bearer <CRON_SECRET>`) vs el header custom `x-vercel-cron-secret` que el código también acepta (:23-28). **Riesgo funcional:** si ninguna de las dos ramas matchea lo que Vercel envía, el cron devuelve 401 silenciosamente y NINGÚN recordatorio sale jamás. | Read :22-37; consultar docs Vercel Cron (`vercel.com/docs/cron-jobs`); si hay acceso al dashboard/logs de Vercel, verificar respuestas recientes del cron (200 vs 401) — si no hay acceso, marcar sub-verificación de logs como ⏭️ NOT RUN | ⬜ | |

### C. Idempotencia — orden envío vs registro

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| 9 | **Cron, lado omisión del lock-first:** al marcar `reminderSentAt` ANTES de enviar (`app/api/cron/send-reminders/route.ts:110-113`), un crash/timeout después del lock deja RSVPs sin email y el evento nunca se reintenta (el fix cc195f8 cambió duplicados por omisiones silenciosas). Además, con `rsvps.length === 0` también se marca sent (:103-107) → invitados que confirmen más tarde ese mismo día ya no reciben el reminder agendado. Documentar ambos trade-offs como comportamiento actual. | Read :103-113 + :140-191 (dónde puede morir el proceso) | ⬜ | |
| 10 | **Aritmética del timeout del cron:** `maxDuration = 300` (:17) y delay fijo de 5000ms por RSVP (:182) → ≈59 emails máximo por corrida, compartidos entre TODOS los eventos del día. Un evento con >55 confirmados se trunca a mitad de lista con el evento ya locked (#9) → cola de invitados sin reminder, sin registro de a quiénes faltó. Verificar la aritmética y si existe paginación/reanudación. | Read :17, :82, :140-191; calcular: 300s / 5s por email; `grep -n "maxDuration\|setTimeout" app/api/cron/send-reminders/route.ts` | ⬜ | |
| 11 | **Orden send→record en los 5 puntos:** `recordEmailSent` se llama DESPUÉS de que Resend acepta, en los 5: rsvp `:126-128`, cron `:174-177`, send-email `:122-132`, bulk-email `:136-143`, bulk-reminder `:147-153`. Caso "Resend acepta pero DB falla": el email salió y no queda registro → `emailSent` queda viejo → un reenvío admin posterior tratará al RSVP como no-notificado (posible duplicado) y en send-email/bulk-email además cambia el TIPO calculado (`isReminder = !!emailSent`, `send-email:82`, `bulk-email:104`). Caso inverso (registro sin envío) no ocurre por el orden. Verificar los 5 sitios y qué pasa con la excepción de `recordEmailSent` en cada uno (¿aborta el loop? ¿cuenta como failed?). | Read los 5 puntos citados; en cada uno seguir el catch que envuelve `recordEmailSent` | ⬜ | |
| 12 | **`recordEmailSent` no es atómico:** hace SELECT del historial y luego UPDATE con el array reconstruido (`lib/queries.ts:139-159`). Dos envíos concurrentes al mismo RSVP (p.ej. bulk-email del admin corriendo mientras el cron procesa el mismo evento) pueden perder una entrada del historial (last-write-wins). Verificar que no hay `FOR UPDATE`/jsonb append atómico y evaluar la ventana real de concurrencia. | Read `lib/queries.ts:133-162`; `grep -n "emailHistory" lib/queries.ts lib/schema.ts` | ⬜ | |
| 13 | **Ningún punto de envío consulta `emailHistory` para deduplicar:** confirmar que el único mecanismo anti-duplicado es `reminderSentAt` a nivel EVENTO (cron) y que bulk-reminder/bulk-email/send-email pueden reenviar al mismo RSVP N veces sin advertencia (responsabilidad 100% del admin en UI). Documentar como comportamiento, hallazgo si contradice expectativa de producto. | `grep -n "emailHistory" app/api -r`; Read de los loops de bulk-email :100-154 y bulk-reminder :109-168 | ⬜ | |

### D. Selección de destinatarios — exclusión de cancelados en LOS 5 puntos

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| 14 | **Cron excluye cancelados:** `getConfirmedRSVPsForReminder` filtra `status = 'confirmed'` en SQL (`lib/queries.ts:506-511`) y el cron la usa (:97). | Read ambos | ⬜ | |
| 15 | **bulk-reminder excluye no-confirmados:** salta con error `No confirmado` (`app/api/admin/send-bulk-reminder/route.ts:118-122`). | Read :109-122 | ⬜ | |
| 16 | **bulk-email NO filtra status — es feature:** a cancelados les manda "Te extrañamos" (re-invitación) y a confirmados confirmación/recordatorio (`app/api/admin/send-bulk-email/route.ts:103-104,121-127`). Verificar: (a) que el tipo se deriva del `status` LEÍDO DE DB, no del body; (b) quién construye `rsvpIds` en el frontend y si puede seleccionar cancelados sin darse cuenta (`grep -rn "send-bulk-email" app/admin app/components --include="*.tsx"`). No existe status `declined` (`grep -rn "'declined'\|\"declined\"" lib app --include="*.ts" --include="*.tsx"` → esperado: 0 resultados; `lib/schema.ts:93` default `'confirmed'`). | Read + greps citados | ⬜ | |
| 17 | **send-email individual: TODO viene del body.** `name`, `email`, `plusOne`, `emailSent`, `status` los manda el cliente (`app/api/admin/send-email/route.ts:26`) — el email se envía a `email` del body aunque en DB el RSVP tenga otra dirección o esté cancelado; el tipo (`isReminder`/`isCancelled`) también se deriva del body (:81-82), no de DB. Comparar con `getRSVPById` que SÍ se consulta (dos veces: :38 y :92) pero solo para eventData/plusOneName. ¿Puede el flujo normal del admin producir un envío con datos stale (RSVP editado en otra pestaña)? | Read :24-101; `grep -rn "send-email" app/admin --include="*.tsx"` para ver qué manda el frontend | ⬜ | |
| 18 | **Confirmación RSVP: gating del evento.** El POST valida `event.isActive` (`app/api/rsvp/route.ts:53-58`) pero NO `event.rsvpClosed` (`lib/schema.ts:63`) — ¿un evento con RSVP "cerrado" pero activo sigue aceptando RSVPs nuevos y enviando confirmaciones? Verificar si `rsvpClosed` se valida en otra capa (frontend/página) y si el email de confirmación puede salir para un evento cerrado. El flujo RSVP completo es A2 — aquí SOLO el efecto email; cruzar referencia. | Read `app/api/rsvp/route.ts:42-74`; `grep -rn "rsvpClosed" app/api lib --include="*.ts"` | ⬜ | |
| 19 | **Confirmación solo si `emailConfirmationEnabled`:** el envío está gated por `eventForEmail && eventForEmail.emailConfirmationEnabled` (`app/api/rsvp/route.ts:77`). Verificar: (a) default del flag = false (`lib/schema.ts:68`); (b) si el RSVP llega SIN `eventSlug` (rama legacy, `eventForEmail` queda null, :38-39) nunca hay email — ¿esa rama legacy es alcanzable desde el frontend actual? | Read :37-77; `grep -rn "'/api/rsvp'" app --include="*.tsx" \| head` y revisar si algún caller omite eventSlug | ⬜ | |

### E. Links de cancelación (token + URL base)

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| 20 | **Consistencia token↔validación por punto de envío:** el token es determinístico `sha256(rsvpId-email-secret)` (`lib/queries.ts:188-193`) y `cancelRSVP` lo valida contra `rsvp.email` de DB (`lib/queries.ts:118`). Verificar que cada punto genera el token con el email DE DB: cron `:143` (rsvp.email ✓?), bulk-email `:106`, bulk-reminder `:125`, rsvp `:104` (email recién insertado ✓?), **send-email `:85` usa `email` del body** — si difiere del email en DB, el link del email no valida → botón "Modificar o Cancelar" roto para ese invitado. | Read los 5 sitios + `lib/queries.ts:108-128,188-198` | ⬜ | |
| 21 | **URL base:** los 5 puntos construyen `${NEXT_PUBLIC_APP_URL \|\| 'http://localhost:3000'}/cancel/...` (rsvp :105, cron :144, send-email :86, bulk-email :107, bulk-reminder :126) y el template usa la misma env para `bgImageUrl` (`lib/email-template.ts:92-95`). Si la env falta en prod → links y fondo rotos apuntando a localhost. Verificar que la env existe en el deploy (si hay acceso a Vercel) o al menos que `grep -rn "NEXT_PUBLIC_APP_URL" .env* vercel.json` y el código no tienen divergencias de nombre. | Greps citados; acceso a Vercel env si disponible (si no → sub-check ⏭️ NOT RUN con razón) | ⬜ | |
| 22 | **Columna `rsvps.cancelToken` mentirosa:** `saveRSVP` genera el token con un `crypto.randomUUID()` aleatorio ANTES del insert (`lib/queries.ts:41`), así que el valor guardado en la columna NO corresponde a `generateCancelToken(rsvp.id, email)` que usan todos los emails. Verificar si algún flujo LEE la columna `cancelToken` (si nadie la lee, es dato muerto/engañoso — 🟡/🟢; si alguien la lee para validar, es link roto — 🔴). | `grep -rn "cancelToken" app lib --include="*.ts" --include="*.tsx"` y clasificar cada uso lectura/escritura | ⬜ | |
| 23 | **Limpieza `=` duplicada e inconsistente:** send-email limpia la URL antes del template (`app/api/admin/send-email/route.ts:88-89`) y el template la vuelve a limpiar para el href (`lib/email-template.ts:68`) — pero verificar que TODOS los puntos pasan por `cleanCancelUrl` del template (sí, si todos usan `generateConfirmationEmail`). Confirmar que no hay ruta que meta la URL cruda en otro campo. | Read `lib/email-template.ts:67-68,303,316`; grep `cancelUrl` en los 5 routes | ⬜ | |

### F. Contenido de templates

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| 24 | **`displayTitle` vs `title`:** el schema tiene `displayTitle` "Title shown on invitation page (if empty, uses title)" (`lib/schema.ts:16`) y la página pública lo respeta (`app/[slug]/page.tsx:148-157`), pero TODOS los emails usan `event.title` (template `lib/email-template.ts:141,144` vía `EventData.title`, poblado con `event.title` en cron :118, rsvp :84, send-email :56, bulk-email :43, bulk-reminder :79; subjects con `event.title` en cron :161, bulk-reminder :143, etc.). ¿Divergencia intencional? Un host que puso un `displayTitle` distinto verá que el email muestra el título interno. Clasificar. | Read sitios citados; `grep -rn "displayTitle" lib/email-template.ts app/api` (esperado: 0 en emails) | ⬜ | |
| 25 | **`plusOneName` en los 5 puntos:** el template lo muestra si existe (`lib/email-template.ts:257-276`, fallback "+1 Confirmado" :272). Verificar por punto: cron `:150`, bulk-email `:112`, bulk-reminder `:132` (los tres con cast `(rsvp as any).plusOneName` — ¿por qué `any` si `RSVP` lo tipa? tipos mentirosos), send-email `:92-96` (segunda query `getRSVPById` SOLO para esto — duplicada con :38), y rsvp `:111` que usa `plusOneName` del body SIN trim mientras `saveRSVP` guardó la versión trimmed (:72) — divergencia cosmética entre email y DB. | Read los 6 sitios citados | ⬜ | |
| 26 | **Fallback silencioso a `event-config.json` (datos de OTRO evento):** el template usa config estático si `eventData` es undefined (`lib/email-template.ts:52-62`). Trazar cuándo llega undefined: send-email si `getRSVPById` falla o el evento no existe — el catch :76-78 solo hace `console.warn` y CONTINÚA enviando con datos estáticos; bulk-email si `getEventBySlug` devuelve null (:33-40, `eventData` queda undefined y `eventTitle` cae a `eventConfig.event.title` :36) — el envío procede. Resultado: invitado recibe email con título/fecha/lugar del evento estático equivocado. Cron y bulk-reminder en cambio 404ean/skipean sin evento. Clasificar severidad por punto. | Read `send-email:35-78,104`, `bulk-email:33-61`, template :52-62; comparar con `bulk-reminder:60-66` | ⬜ | |
| 27 | **Textos y subjects correctos por tipo:** confirmación / recordatorio / re-invitación producen greeting+badge+botón coherentes (`lib/email-template.ts:71-89,303`) y subjects consistentes entre puntos (`Confirmación -`/`Recordatorio -`/`Te extrañamos -`: rsvp :122, cron :161, send-email :104-112, bulk-email :119-127, bulk-reminder :143). Detalle: el footer dice "Este email fue enviado porque confirmaste tu asistencia" (:331) también en la re-invitación a alguien que CANCELÓ — texto engañoso menor. Verificar los 3 modos y el heurístico de género `name.endsWith('a')` (:76). | Read template :71-89, :294-317, :324-334 + subjects en los 5 routes | ⬜ | |
| 28 | **`FROM_EMAIL` y remitente:** los 5 puntos envían `from: Party Time! <${FROM_EMAIL}>`; si `FROM_EMAIL` no está seteado cae a `onboarding@resend.dev` (`lib/resend.ts:9`) — dominio de pruebas de Resend que en producción puede fallar o caer a spam. Verificar env en deploy si hay acceso; si no, documentar el fallback como riesgo. | Read `lib/resend.ts`; grep `FROM_EMAIL` en los 5 routes; env de Vercel si accesible (si no → ⏭️ parcial) | ⬜ | |

### G. Duplicación/divergencia entre los 5 puntos + PRE-3

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| 29 | **Construcción de `EventData` copiada 5 veces con defaults divergentes:** cron :116-137 y bulk-reminder :77-96 usan colores hardcoded (`#FF1493`...) y `eventConfig.contact?.hostEmail` opcional; send-email :52-73 y bulk-email :40-61 usan `eventConfig.theme.*` y `eventConfig.contact.hostEmail` sin `?.`; rsvp :82-101 otra copia. Mapear las 5 copias campo por campo y registrar divergencias (mismo evento puede verse distinto según qué punto envió). Candidato natural a helper compartido — registrar como hallazgo de deuda (la corrección es del plan correctivo, NO de esta sesión). | Read/diff de los 5 bloques; opcional: extraer a archivos temp y `diff` | ⬜ | |
| 30 | **Delays y límites divergentes:** 5000ms/email en cron (:182) y bulk-reminder (:159-161) vs 100ms en bulk-email (:147); `maxDuration = 300` en cron (:17) y bulk-reminder (:18) pero AUSENTE en bulk-email y send-email — un bulk-email largo puede morir por el límite default de Vercel a mitad de lista sin resumen de a quién le llegó. Verificar los 4 valores y el default del plan Hobby. | Read los 4 routes (`grep -n "maxDuration\|setTimeout" app/api/admin/*.ts app/api/cron/send-reminders/route.ts`) | ⬜ | |
| 31 | **Lógica `isReminder`/tipo duplicada y divergente:** send-email deriva de `body.emailSent`/`body.status` (:81-82) mientras bulk-email deriva de `rsvp.emailSent`/`rsvp.status` de DB (:103-104) — misma intención, fuentes distintas, resultados potencialmente distintos para el mismo RSVP. Documentar. | Read ambos bloques | ⬜ | |
| 32 | **PRE-3 (pre-anclado): `getRSVPsByEvent(eventId)` recibe slug.** La firma dice `eventId` (`lib/queries.ts:62`) pero la columna guarda slug (insert `lib/queries.ts:50` ← `app/api/rsvp/route.ts:49,67-74`). Verificar TODOS los call sites pasan slug y ninguno pasa UUID: `app/api/rsvp/route.ts:228` (resuelve `event?.slug \|\| eventIdOrSlug` en :217 ✓?), `send-bulk-email:79` (`eventSlug` de :35), `send-bulk-reminder:105` (`event.slug`), `reminder-status:67`, `stats:43`. Ojo con los fallbacks `event?.slug \|\| eventIdOrSlug`: si el evento no existe y el caller pasó UUID, se consulta RSVPs por UUID → 0 resultados silenciosos (omisión). Lo mismo para `getConfirmedRSVPsForReminder(eventSlug)` (:503, llamada cron :97 con `event.slug` ✓?) y `getEventStats` (:167). Registrar como hallazgo de firma mentirosa + casos de fallback peligroso. | `grep -rn "getRSVPsByEvent\|getConfirmedRSVPsForReminder\|getEventStats" app lib --include="*.ts"` y Read de cada call site con su resolución de slug | ⬜ | |
| 33 | **Renombre de slug no rompe emails:** `updateEventSlug` migra `rsvps.eventId` al nuevo slug (`lib/queries.ts:384-398`). Verificar la ventana: si el cron corre ENTRE el update del evento (:384-387) y el update de los RSVPs (:390-392), `getConfirmedRSVPsForReminder(nuevoSlug)` devuelve 0 y el evento se marca sent sin enviar nada (cron :103-107). Documentar la carrera (probabilidad baja pero omisión permanente por #9). | Read `lib/queries.ts:345-404` + cron :97-107 | ⬜ | |

## 6. Hallazgos

> Registrar SOLO hallazgos con evidencia `archivo:línea`. Numerar A1-01, A1-02, ... Severidad según rúbrica del INDEX (🔴 email a quien no corresponde / cuando no corresponde o flujo roto · 🟡 edge case incorrecto o deuda que causará bugs · 🟢 limpieza/consistencia).

| ID | Severidad | Descripción | Evidencia (archivo:línea) | Ítem del checklist |
|----|-----------|-------------|---------------------------|--------------------|
| A1-01 | | | | |
| A1-02 | | | | |

### Hallazgos fuera de scope

> Cosas detectadas durante A1 que pertenecen a otra auditoría. NO profundizar ni duplicar — una línea + referencia cruzada. En particular, cualquier observación sobre validación de sesión, `CRON_SECRET` o permisos va aquí → **Fase S**.

| ID | Auditoría dueña | Descripción breve | Evidencia |
|----|-----------------|-------------------|-----------|
| A1-OOS-01 | | | |

## 7. Cierre

1. Verificar que **todos** los ítems 1-33 tienen resultado + evidencia (o ⏭️ NOT RUN + razón) y que la tabla de call-graph (§4) está completa — si no, la auditoría NO se puede marcar ✅.
2. Actualizar este header: estado ✅, y la fila **A1** de `docs/audits/00_INDEX.md`: estado ✅ + conteo de hallazgos 🔴/🟡/🟢.
3. Commit + push: `audit: A1 emails-recordatorios — X🔴 Y🟡 Z🟢` (solo este MD y el INDEX — recordar: read-only sobre el código).
4. Los hallazgos NO se corrigen en esta sesión — van al plan correctivo post-consolidado (`99_CONSOLIDADO.md`).
