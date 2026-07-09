# A4 — 🛠️ Panel Admin

> **Estado:** ⬜ pendiente · **Owner/Sesión:** — · **Inicio:** —
> **SHA de referencia del framework:** `bcc7f1e` · **SHA auditado:** *(llenar con `git rev-parse --short HEAD` al tomar el lock)*
>
> ⚠️ **Antes de ejecutar:** seguir el **Protocolo por sesión** de `00_INDEX.md` (lock atómico):
> `git pull --ff-only` → marcar A4 como 🔄 en la tabla del INDEX con owner/fecha/SHA → commit + push (el lock existe solo si el push tiene éxito) → ejecutar este MD → registrar evidencia → marcar ✅.
> **Read-only:** prohibido editar código de la app durante la auditoría. Solo se escribe en este MD y en `00_INDEX.md`.
> Reglas de evidencia y rúbrica 🔴/🟡/🟢: ver `00_INDEX.md` (anti checkbox-theater — todo ítem requiere evidencia `archivo:línea` o comando+output, también cuando PASA; lo no ejecutado → `⏭️ NOT RUN` + razón).

---

## 1. Objetivo

Verificar que el panel de administración (`/admin`) funciona correctamente de punta a punta: que cada acción de UI llega al endpoint correcto con el payload correcto, que el estado local se refresca tras cada mutación (sin UI stale), que las estadísticas y exports reflejan los datos reales, que la gestión multi-evento de usuarios/roles opera bien, y que los errores de red/API se comunican al admin en vez de fallar en silencio. Registrar además las oportunidades de descomposición del monolito (sin refactorizar).

## 2. Contexto mínimo (para sesión fría)

- El panel vive en **`app/admin/page.tsx` (2,599 líneas — monolito client-side)** con 4 tabs: `dashboard` (tabla de RSVPs + envíos + exports), `config` (settings del evento seleccionado), `eventos` (CRUD de eventos, solo super_admin) y `usuarios` (gestión de usuarios, solo super_admin).
- Es **multi-evento**: un selector global (slug del evento) controla qué RSVPs/config se muestran. El slug seleccionado se persiste en `localStorage` (`rp_selected_event`).
- **Roles:** `super_admin` global; los demás usuarios reciben asignaciones por evento con rol `manager` o `viewer` (`user_event_assignments`, `lib/user-queries.ts`). `viewer` = solo lectura (sin envío de emails, sin config).
- **Auth de entrada:** el panel valida sesión vía `GET /api/auth/me` y redirige a `/login` si no hay sesión (`app/admin/page.tsx:105-124`). Desde `bcc7f1e` los endpoints admin exigen cookie `rp_session` + `validateSession`.
- Componentes ya extraídos (fix H-008): `StatsCards`, `UserManagement`, `ReminderStatusSection`, `LoginForm` en `app/admin/components/` + barrel `index.ts` (donde vive el tipo `RSVP` del panel).
- **Exports:** PDF con jsPDF+autotable (emojis stripped en `be004ed`, ASCII en `f134f03`) y Excel con `xlsx`; ambos con soporte de nombre del +1 (`c57fd67`, `ad272fa`).
- ⚠️ Gotcha heredado: `rsvps.eventId` guarda el **slug**, no el UUID. Los endpoints admin resuelven slug→UUID para el check de permisos (p.ej. `app/api/admin/update-rsvp/route.ts:49-50`).

### 2.1 Inventario del monolito `app/admin/page.tsx` (mapeado en `bcc7f1e`)

| Bloque | Líneas | Qué hace | Endpoint(s) que llama |
|---|---|---|---|
| Estado + configForm | 16-102 | ~25 useState: tabs, eventos, filtros display/email, modales, uploads | — |
| checkAuth (mount) | 105-124 | Valida sesión, redirect a `/login` | `GET /api/auth/me` |
| loadRSVPs | 126-168 | Carga RSVPs del evento seleccionado; auto-ajusta filtro de email | `GET /api/rsvp?eventId=<slug>` |
| loadEvents | 173-185 | Lista de eventos (filtrada por acceso server-side) | `GET /api/events` |
| loadAppSettings / setAsHome | 188-227 | Lee/escribe `home_event_id` | `GET/POST /api/admin/settings` |
| Init selector + localStorage | 230-277 | Restaura `rp_selected_event`, fallback home/primero | — |
| loadEventConfig | 281-332 | Carga settings del evento al form | `GET /api/event-settings?eventId=<slug>` |
| Filtros display/email (effects) | 341-394 | Deriva `filteredRsvps` y `emailTargetRsvps` | — |
| isEventPast | 396-462 | Heurística de parsing de fecha textual para bloquear envíos a eventos pasados | — |
| sendEmail (individual) | 464-522 | Confirm dialog + envío 1:1; tipo según status/emailSent | `POST /api/admin/send-email` |
| sendBulkEmails | 524-582 | Confirm con desglose por tipo; envía IDs filtrados | `POST /api/admin/send-bulk-email` |
| toggleStatus | 584-621 | Confirmar/cancelar asistencia SIN email | `POST /api/admin/update-rsvp` |
| Modal edición RSVP | 623-689, 2435-2514 | Edita name/email/phone/plusOne/**plusOneName** (`ad272fa`) | `POST /api/admin/update-rsvp` |
| Modal edición slug | 691-781, 2521-2596 | Cambia slug con advertencias; actualiza selección local | `PUT /api/events/[slug]` |
| saveEventConfig | 783-866 | Guarda todo el configForm (precio, capacidad, tema, emailConfig, rsvpClosed…) | `POST /api/admin/event-settings/update` |
| handleImageUpload (bg) | 868-930 | Sube imagen de fondo + auto-save de settings | `POST /api/admin/upload-image` → `POST /api/admin/event-settings/update` |
| handleOgImageUpload | 932-995 | Igual, con flag `imageType: 'og'` | ídem |
| handleLogout | 997-1007 | Cierra sesión y redirige | `POST /api/auth/logout` |
| stripEmojis | 1009-1014 | Regex de limpieza para jsPDF (`be004ed`) | — |
| exportInformativeList (PDF) | 1016-1114 | PDF de confirmados con fila indentada por +1 (`c57fd67`, `49f6b31`) | — (client-side) |
| exportExcelList | 1116-1166 | Excel de confirmados con columna "Nombre +1" | — (client-side) |
| Cálculo de stats | 1168-1177 | total/confirmed/cancelled/plusOne/totalGuests/emailsSent (client-side) | — |
| Permisos por evento | 1179-1193 | `accessRole` del evento seleccionado; gate de tabs config/eventos | — |
| Header + selector global | 1205-1301 | Botones usuarios/eventos/logout; selector de evento | — |
| Tab dashboard (render) | 1322-1579 | StatsCards, filtros, botones export, tablas confirmados/cancelados | — |
| Tab config (render) | 1581-2219 | Form completo de settings + `<ReminderStatusSection>` (2205) | — |
| Tab eventos (render) | 2221-2433 | Lista de eventos + crear evento (form inline con fetch propio 2336-2371) | `POST /api/events` |
| Tab usuarios (render) | 2516-2519 | Delega en `<UserManagement events={events} />` | — |

### 2.2 Componentes y endpoints admin (superficie a auditar)

- `app/admin/components/UserManagement.tsx` (514 l) → `GET/POST /api/admin/users`, `PUT /api/admin/users/[id]`, `GET/POST/DELETE /api/admin/users/[id]/events`
- `app/admin/components/ReminderStatusSection.tsx` (309 l) → `GET /api/admin/reminder-status`, `POST /api/admin/send-bulk-reminder`
- `app/admin/components/StatsCards.tsx` (49 l) — presentacional puro
- `app/admin/components/LoginForm.tsx` (95 l) → `GET /api/admin/validate` (⚠️ verificar si algo lo importa)
- Rutas sin consumidor aparente en el panel (verificar): `POST /api/admin/add-demo-data`, `GET /api/admin/validate`, `GET /api/stats`, `GET /api/admin/users/[id]`, `DELETE /api/admin/users/[id]`
- Queries: `lib/user-queries.ts` (278 l, CRUD usuarios + asignaciones + `userHasEventAccess`), `lib/queries.ts` (`getEventStats:167`, `updateRSVP:90`, `saveRSVP:17`)

## 3. Scope

**Dentro:**
- Todo `app/admin/**` (page + 4 componentes + barrel).
- Endpoints que el panel consume: `update-rsvp`, `users*`, `settings`, `reminder-status`, `upload-image`, más el **contrato panel↔endpoint** de `send-email` / `send-bulk-email` / `send-bulk-reminder` (payload correcto, refresh tras éxito, manejo de 401/403).
- Endpoints admin huérfanos: `validate`, `add-demo-data`, `/api/stats`, `getEventStats`.
- Exports PDF/Excel, stats mostradas, gestión multi-evento de usuarios.

**Fuera:**
- **El contenido/lógica de los envíos de email en sí → A1** (templates, destinatarios del cron, dedupe). Aquí solo se verifica que el panel *llame bien* y refresque.
- **Protección de endpoints y modelo de sesiones → Fase S.** Si aparece un endpoint sin validación de sesión o un contrato que confía en datos del cliente, se anota factualmente en "Hallazgos fuera de scope" sin profundizar.
- Lógica de `/api/events/[slug]` (rename de slug, OG images en filesystem) → A3; aquí solo el lado panel (payload, advertencias del modal, refresh).
- Código muerto global → A5 (aquí solo se registra lo detectado en superficie admin, con cross-ref).

## 4. Checklist ejecutable

> Cada fila: marcar resultado (✅ pasa / ❌ falla / ⏭️ NOT RUN) y completar la columna evidencia con `archivo:línea` u output de comando. Las anclas listadas son el punto de partida del mapeo previo — **confirmarlas contra el working tree en el SHA auditado**. Donde el mapeo previo ya detectó un problema, está marcado como **[pre-análisis]**: confirmar y convertir en hallazgo A4-XX si aplica.

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| 1 | Inventario de features del monolito (tabla §2.1) es fiel y completo: ningún bloque funcional sin mapear | Recorrer `app/admin/page.tsx` por secciones (0-900, 900-1800, 1800-2599) y contrastar contra §2.1 | ⬜ | |
| 2 | Entrada al panel: `checkAuth` usa `/api/auth/me` y redirige a `/login`; **`LoginForm.tsx` no lo importa nadie** (solo barrel `index.ts:7`) y su flujo Basic-auth (`LoginForm.tsx:28-35`) es incompatible con `/api/admin/validate` que valida cookie `rp_session` e ignora el header (`app/api/admin/validate/route.ts:11-22`). **[pre-análisis: componente muerto y, de usarse, roto]** | `grep -rn "LoginForm" app --include='*.tsx'` (excluir barrel); leer ambos archivos | ⬜ | |
| 3 | Selector de eventos — init: el effect `page.tsx:231-236` setea `selectedEventId` desde localStorage **sin validar** que el slug exista en la lista/acceso del usuario; la validación `events.some(...)` de `page.tsx:260` solo corre si `!selectedEventId`, o sea nunca corrige el valor ya restaurado. **[pre-análisis: slug de evento borrado/renombrado/sin acceso deja el panel clavado con "Error al cargar datos"]** | Leer los dos useEffect (231-236 vs 254-277); trazar qué pasa con un slug stale | ⬜ | |
| 4 | loadRSVPs llega al endpoint correcto (`GET /api/rsvp?eventId=<slug>`, `page.tsx:133`) y se re-dispara al cambiar evento (`page.tsx:335-339`); todas las mutaciones del dashboard (sendEmail:513, sendBulkEmails:573, toggleStatus:612, saveEdit:680) refrescan con `loadRSVPs()` tras éxito (sin stale UI) | Leer los 4 handlers y confirmar el `await loadRSVPs()` en la rama success | ⬜ | |
| 5 | Feedback al usuario: el estado `message` se escribe desde ~50 puntos pero **solo se renderiza dentro del tab dashboard** (`page.tsx:1409`, dentro del bloque `activeTab === 'dashboard'` 1322-1579). Acciones de config (`saveEventConfig:856-862`), eventos (crear:2361-2368, `setAsHome:216-223`) y slug (750-777) muestran su resultado… en un tab donde el usuario no está. **[pre-análisis: éxitos y errores invisibles fuera del dashboard]** | `grep -n "message &&" app/admin/page.tsx` (debe dar solo 1409); confirmar que los tabs config/eventos no renderizan `message` | ⬜ | |
| 6 | `isEventPast()` (`page.tsx:396-462`): la heurística "si la fecha cae >2 meses en el futuro, asumir año pasado" (`444-451`) marca como PASADO cualquier evento con fecha textual sin año a >2 meses vista (ej. "SÁBADO, 13 DIC" evaluado en julio) → deshabilita envío individual y masivo (`1397-1403`, `1433-1437`, `1514`). **[pre-análisis: bloquea envíos legítimos; falla "cerrado" (no manda de más) pero rompe el flujo del admin]** | Trazar la función con fecha a 3+ meses; verificar los `disabled={...isEventPast()}` | ⬜ | |
| 7 | sendEmail individual: confirm dialog previo (480-485), payload a `/api/admin/send-email` con `rsvpId` (497-504). **[pre-análisis de contrato]:** el server usa `to: email` **del body** (`app/api/admin/send-email/route.ts:117`) y decide el tipo por `status`/`emailSent` **del body** (`:81-82`), aunque ya releyó el RSVP de DB para `plusOneName` (`:92-96`). Si la tabla del panel está stale (otro admin editó el email), el correo sale a la dirección vieja mostrada. Documentar como contrato mixto cliente/DB | Leer `send-email/route.ts:25-132` y `page.tsx:492-505`; evaluar severidad con la rúbrica (edge case de concurrencia entre admins) | ⬜ | |
| 8 | sendBulkEmails: confirm con desglose por tipo (539-549), payload `{eventId: slug, rsvpIds}` (`page.tsx:563-566`); server exige manager y filtra los IDs contra los RSVPs del evento (`app/api/admin/send-bulk-email/route.ts:65-67,82`) — IDs de otro evento no se procesan | Leer ambos lados; confirmar refresh en 573 | ⬜ | |
| 9 | toggleStatus (confirmar/cancelar sin email): manda solo `{status}` a update-rsvp (`page.tsx:602-605`); **capacity check:** confirmar que NI el admin NI el flujo público aplican `capacityLimit` server-side (`grep -n "capacity" app/api/rsvp/route.ts lib/queries.ts app/api/admin/update-rsvp/route.ts` → esperado: sin matches). El toggle de config dice "**Mostrar** cupo limitado" (`page.tsx:1723-1725`) → capacity es display-only por diseño. Anotar el resultado; el flujo público es de A2 (cross-ref) | Ejecutar el grep + leer update-rsvp/route.ts completo | ⬜ | |
| 10 | Modal de edición de RSVP incluye `plusOneName` (`ad272fa`): estado (80-86), input condicional (2484-2493), y al desmarcar +1 limpia el nombre (`page.tsx:2480`); el server lo persiste (`updateRSVP` acepta `plusOneName`, `lib/queries.ts:92`) | Leer modal (2435-2514) + saveEdit (648-689) | ⬜ | |
| 11 | Contrato de `update-rsvp`: la ruta pasa `body.updates` **directo** a `updateRSVP` sin whitelist runtime (`app/api/admin/update-rsvp/route.ts:23,61`); la restricción `Partial<Pick<...5 campos>>` (`lib/queries.ts:90-93`) es solo de tipos — en runtime cualquier columna de la tabla es asignable vía `.set(data)`. El panel solo manda los 5 campos del editForm. **[pre-análisis: firma engañosa / tipos mentirosos]** | Leer ambos archivos; confirmar qué manda el panel (editForm 80-86) vs qué aceptaría la ruta | ⬜ | |
| 12 | Permisos de update-rsvp: resuelve slug→UUID (`route.ts:49-50`) y exige `manager` para no-super_admin (`:53-57`) — consistente con el gotcha slug-en-eventId | Leer route.ts:39-58 | ⬜ | |
| 13 | Stats: StatsCards recibe stats calculadas client-side (`page.tsx:1168-1177`): `plusOne` y `totalGuests` **solo de confirmados** (cancelados excluidos ✅), cada +1 suma exactamente 1 persona extra (`1175`; no duplica). `emailsSent` cuenta sobre TODOS los rsvps incl. cancelados (`1176`) — ¿coherente con la card "✉️ Emails"? | Leer 1168-1177 + `StatsCards.tsx:20-49`; razonar cada fórmula | ⬜ | |
| 14 | `getEventStats` (`lib/queries.ts:167-182`) y `GET /api/stats` (`app/api/stats/route.ts`) **no tienen consumidores** (el panel calcula sus stats localmente) y ambos exponen `totalConfirmed` que en realidad es el TOTAL incluyendo cancelados (`queries.ts:178`, `stats/route.ts:46`). **[pre-análisis: código muerto + nombre mentiroso duplicado → cross-ref A5/A6]** | `grep -rn "getEventStats\|/api/stats" app lib --include='*.ts*'` (excluir definiciones y `lib/firestore.ts` legacy) | ⬜ | |
| 15 | UserManagement — flujo completo: crear usuario (default `viewer`, `users/route.ts:96-97`), activar/desactivar vía `PUT` `{isActive}` (`UserManagement.tsx:110-136`), asignar evento por **UUID** con rol manager/viewer (`:166-188` → `POST users/[id]/events`), quitar acceso (`:190-214` → `DELETE ?eventId=`); cada mutación refresca (`loadUsers`/`loadUserAssignments`). Re-asignar mismo evento hace upsert del rol (`lib/user-queries.ts:184-199`) — única forma de cambiar rol de asignación desde la UI | Leer componente completo + las 3 rutas de users; confirmar refresh tras cada éxito | ⬜ | |
| 16 | UserManagement — restos: `handleChangeRole` (`UserManagement.tsx:138-164`) **no se referencia en el JSX** (sin UI para cambiar rol global); `GET /api/admin/users/[id]` y `DELETE /api/admin/users/[id]` no los llama nadie del panel (el toggle usa PUT). Selects por `document.getElementById` (`:485-489`) en vez de estado React. **[pre-análisis: dead code + endpoints huérfanos → cross-ref A5]** | `grep -n "handleChangeRole" UserManagement.tsx` (definición sin uso); grep de fetches DELETE/GET a users/[id] | ⬜ | |
| 17 | Los 4 endpoints de users exigen `super_admin` (`users/route.ts:25-30,76-81`; `users/[id]/route.ts:29-34,87-92,154-159`; `users/[id]/events/route.ts:29-34,79-84,145-150`) y el tab usuarios solo se renderiza para super_admin (`page.tsx:2517`); DELETE de usuario tiene guard anti-auto-desactivación (`users/[id]/route.ts:162-167`) | Leer los gates citados | ⬜ | |
| 18 | Gating de UI por rol: viewer no ve sección de envío de emails (`page.tsx:1379`) ni columna Acciones (`1418,1429`); tab config solo manager/super_admin (`1311-1318`) con effect que expulsa de tabs sin permiso (`1186-1193`); `accessRole` viene calculado del server (`app/api/events/route.ts:40-49`) y la lista de eventos ya llega filtrada para no-super_admin (`:43-45`) | Leer los puntos citados; trazar `canManageSelectedEvent`/`isReadOnly` (1180-1183) | ⬜ | |
| 19 | Export PDF (`page.tsx:1016-1114`): `stripEmojis` aplicado a title/subtitle/date/time/location/nombres (`1028-1038,1052,1062`; `be004ed`); '+1' como `'Si (+1)'` ASCII (`1055`; `f134f03`); fila indentada con nombre del +1 (`1058-1068`; `c57fd67`); solo confirmados (`1019`). **[pre-análisis, ítems menores]:** casts `(rsvp as any).plusOneName` innecesarios (`1059,1062,1140` — el tipo `RSVP` ya lo declara, `components/index.ts:19`); filename derivado de subtitle sin sanear acentos/vacío (`1112` → `lista-invitados-.pdf` si subtitle vacío); footer con nº de página solo se escribe en la última página (`1101-1109`) | Leer el bloque completo; si hay entorno, generar un PDF con datos con emojis/acentos | ⬜ | |
| 20 | Export Excel (`page.tsx:1116-1166`): columna "Nombre +1" (`1132,1140`), solo confirmados, sin strip (Excel soporta Unicode ✅). **Ambos exports usan `rsvps` completos, no `filteredRsvps`** (`1019,1118`) — los botones viven junto a los filtros de visualización (`1358-1374`): ¿comportamiento esperado o sorpresa para el admin? | Leer ambas funciones; decidir si registrar como 🟢 | ⬜ | |
| 21 | ReminderStatusSection consume bien sus endpoints: `GET /api/admin/reminder-status?eventSlug=` (`ReminderStatusSection.tsx:45`) y `POST /api/admin/send-bulk-reminder` con `{eventSlug, rsvpIds}` (`:177-184`); tras envío recarga estado (`:190`). Desde `bcc7f1e` ambos exigen sesión (+ viewer para status, manager para envío: `reminder-status/route.ts:59-64`, `send-bulk-reminder/route.ts:69-74`): un 401/403 devuelve `{success:false, error}` que el componente muestra como texto (`:48-53,96-107` y `:191-195`) **sin romper el render** (aunque tampoco redirige a login) | Leer componente + ambas rutas; simular respuesta 401 mentalmente (JSON con error) | ⬜ | |
| 22 | ReminderStatusSection — estado stale entre eventos: el componente se monta sin `key` (`page.tsx:2205`) y su `data` no se resetea cuando cambia `eventSlug` → tras expandir y cambiar de evento, muestra los invitados del evento ANTERIOR; un envío mandaría `rsvpIds` viejos con el `eventSlug` nuevo. El server los descarta por scoping (`send-bulk-reminder/route.ts:102-116`: "No encontrado en este evento") así que **no sale email equivocado**, pero el admin ve fallidos inexplicables. **[pre-análisis]** También: el confirm promete "60 segundos entre cada uno" (`ReminderStatusSection.tsx:171`) pero el delay real es 5s (`send-bulk-reminder/route.ts:158-161`) | Trazar el ciclo de vida del estado ante cambio de prop; comparar textos vs delay real | ⬜ | |
| 23 | upload-image: valida MIME (jpeg/png/webp/gif, `upload-image/route.ts:8-13,36-41`) y tamaño 10MB (`:5,44-49`) — coincide con lo prometido en la UI (`page.tsx:1848,1938`). **[pre-análisis]:** el panel manda `imageType: 'og'` (`page.tsx:941`) que la ruta **nunca lee** — OG y fondo se nombran igual `events/{slug}-{ts}.{ext}` (`:52-54`); el blob anterior **nunca se elimina** (no hay `del()`) → huérfanos acumulándose en Vercel Blob con cada subida. Tras subir hay auto-save con fallback a guardado manual si falla (`page.tsx:891-910` ✅) | Leer ruta completa + ambos handlers de upload | ⬜ | |
| 24 | add-demo-data: exige super_admin (`add-demo-data/route.ts:68-71`), **ningún botón del panel lo llama** (grep sin matches en `app/admin/`), y de invocarse en producción crearía 7 RSVPs (6 `example.com` + 1 email real, `:7-57`) contra el eventId legacy hardcodeado de `event-config.json:3` (`"rooftop-party-andras-oct2024"`); `saveRSVP` no valida que el evento exista (`lib/queries.ts:17-48`) → filas huérfanas en la tabla `rsvps`. No envía emails (solo insert). **[pre-análisis: endpoint huérfano con capacidad de ensuciar datos prod]** | `grep -rn "add-demo-data" app --include='*.tsx'`; leer la ruta y `saveRSVP` | ⬜ | |
| 25 | Manejo de errores de fetch en el panel: mutaciones muestran mensaje (aunque ver ítem 5), pero `loadEvents` y `loadAppSettings` fallan **en silencio** (solo `console.error`, `page.tsx:182-184,197-199` → selector clavado en "Cargando eventos..."); ningún handler distingue 401 (sesión expirada) para redirigir a `/login` — el admin queda ante errores genéricos ("Error al cargar datos", `:163-164`) | Revisar todos los catch del page.tsx y componentes; listar cuáles son silenciosos | ⬜ | |
| 26 | Modal de slug: payload correcto (`PUT /api/events/[slug]` con `{newSlug}`, `page.tsx:739-745`), validación de formato client-side (710-717), doble confirm con advertencias (725-731), y tras éxito actualiza selección local + recarga eventos (`764-769` ✅). La advertencia promete renombrar `og-{slug}.*` (`2570-2572`) — la implementación server usa `fs.renameSync` sobre `public/` (`app/api/events/[slug]/route.ts:15-40`): en Vercel el filesystem del deploy no es escribible/persistente → anotar factualmente y cross-ref **A3** (dueño de la ruta) | Leer modal + handler + cabecera de la ruta events/[slug] | ⬜ | |
| 27 | Crear evento (tab eventos): form inline con fetch propio (`page.tsx:2336-2371`) → `POST /api/events` (solo super_admin server-side, `events/route.ts:88-89`), resetea el form y recarga la lista tras éxito (`2362-2363` ✅); su mensaje de resultado cae en el `message` invisible (ver ítem 5) | Leer el bloque; confirmar gate server | ⬜ | |
| 28 | Higiene: console.logs con datos de invitados en el panel (`page.tsx:130,141-144,158` — dump completo de RSVPs a consola del browser; `425-459` logs de isEventPast) — registrar como limpieza 🟢 | `grep -n "console.log" app/admin/page.tsx \| wc -l` + revisar cuáles imprimen datos | ⬜ | |
| 29 | Descomposición del monolito: registrar hallazgo 🟢 con propuesta de cortes (NO refactorizar). Cortes naturales según §2.1: (a) `useAdminEvents` hook (selector+localStorage+config load, 173-339); (b) `RsvpTable` + `RsvpFilters` (341-394, 1327-1577 — las dos tablas confirmados/cancelados son ~95% duplicadas entre sí, 1412-1490 vs 1493-1571); (c) `EventConfigForm` (783-995, 1581-2219); (d) `exports.ts` util (1009-1166); (e) `EventsManager` (2221-2433); (f) modales `EditRsvpModal`/`EditSlugModal` (2435-2596); (g) `isEventPast` → util compartida con tests | Validar los rangos contra el archivo; estimar líneas por corte | ⬜ | |

## 5. Hallazgos (A4-XX)

> Formato: **A4-NN [🔴/🟡/🟢] título** — descripción + evidencia `archivo:línea`. Solo cuenta con evidencia. Los **[pre-análisis]** del checklist son candidatos: confirmarlos aquí con su ID definitivo al ejecutar.

| ID | Sev | Título | Evidencia | Notas |
|----|-----|--------|-----------|-------|
| — | — | *(llenar durante la ejecución)* | | |

Candidatos detectados en el mapeo previo (confirmar, ajustar severidad con la rúbrica y numerar):

- `isEventPast` bloquea envíos para eventos a >2 meses (ítem 6) — candidato 🔴 (rompe flujo del admin).
- `message` invisible fuera del tab dashboard (ítems 5, 27) — candidato 🟡.
- localStorage restaura evento sin validar (ítem 3) — candidato 🟡.
- `update-rsvp` sin whitelist runtime / firma engañosa (ítem 11) — candidato 🟡.
- ReminderStatusSection con datos stale entre eventos + texto "60 segundos" vs 5s reales (ítem 22) — candidato 🟡.
- `send-email` con contrato mixto cliente/DB (`to`, `status`, `emailSent` del body) (ítem 7) — candidato 🟡 (evaluar 🔴 si el edge de concurrencia se considera "email a quien no corresponde").
- add-demo-data huérfano apuntando a eventId legacy (ítem 24) — candidato 🟡.
- Cargas silenciosas / sin manejo de sesión expirada (ítem 25) — candidato 🟡.
- LoginForm muerto y roto + `/api/admin/validate` sin consumidor (ítem 2) — candidato 🟢 (cross-ref A5).
- `handleChangeRole` muerto + `GET/DELETE users/[id]` huérfanos (ítem 16) — candidato 🟢 (cross-ref A5).
- `getEventStats` + `/api/stats` muertos con `totalConfirmed` mentiroso (ítem 14) — candidato 🟢 (cross-ref A5/A6).
- `imageType` ignorado + blobs huérfanos en upload-image (ítem 23) — candidato 🟢.
- Exports sin filtros + filename sin sanear + casts `as any` + footer PDF (ítems 19-20) — candidato 🟢.
- console.logs con datos de invitados (ítem 28) — candidato 🟢.
- Descomposición del monolito con propuesta de cortes (ítem 29) — candidato 🟢.

## 6. Hallazgos fuera de scope

> Anotación factual + cross-ref a la auditoría dueña. No profundizar aquí.

| Ref | Observación factual | Evidencia | Dueño |
|-----|--------------------|-----------|-------|
| FS-ref-1 | `POST /api/admin/upload-image` es la única ruta bajo `/api/admin/` sin `validateSession` (todas las demás lo hacen en sus primeras líneas) | `app/api/admin/upload-image/route.ts:15-19` (sin check) vs p.ej. `update-rsvp/route.ts:8-19` | **Fase S** |
| FS-ref-2 | `send-email` usa `to: email` y `status`/`emailSent` provenientes del body del request en lugar de releer el RSVP que ya consulta | `app/api/admin/send-email/route.ts:26,81-82,117` vs `:92` | **Fase S / A1** (el aspecto funcional-stale se registra en A4, ítem 7) |
| A3-ref-1 | `renameOgImages` renombra archivos de `public/` con `fs.renameSync` — en Vercel el filesystem del deployment no es escribible; la advertencia del modal del panel promete un rename que no puede ocurrir en prod | `app/api/events/[slug]/route.ts:15-40`; `app/admin/page.tsx:2570-2572` | **A3** |
| A1-ref-1 | `send-bulk-reminder` duerme 5s entre emails dentro del request (`maxDuration = 300`) → >~55 destinatarios exceden el límite; además `maxDuration 300` vs plan Hobby | `app/api/admin/send-bulk-reminder/route.ts:18,158-161` | **A1 / A8** |
| A2-ref-1 | `capacityLimit` no se aplica server-side en ningún flujo (tampoco el público): es display-only ("Mostrar cupo limitado") | grep `capacity` en `app/api/rsvp/route.ts` y `lib/queries.ts` sin matches; `app/admin/page.tsx:1723-1725` | **A2** |

## 7. Cierre

1. Verificar que **todo** ítem del checklist tiene resultado + evidencia (o `⏭️ NOT RUN` + razón). Sin eso, A4 no puede marcarse ✅.
2. Consolidar hallazgos numerados (A4-01…A4-NN) en §5 y contar por severidad.
3. En `00_INDEX.md`: fila A4 → **✅**, con conteo 🔴/🟡/🟢.
4. Commit + push: `audit: A4 admin-panel — X🔴 Y🟡 Z🟢`.
