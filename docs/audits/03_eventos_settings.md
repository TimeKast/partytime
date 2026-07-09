# A3 — 🎪 Eventos y settings

> **Estado:** ⬜ pendiente · **Owner/Sesión:** — · **Inicio:** —
> **SHA de referencia del framework:** `bcc7f1e` · **SHA auditado:** *(llenar con `git rev-parse --short HEAD` al adquirir el lock)*
>
> ⚠️ **Antes de empezar:** seguir el **Protocolo por sesión (lock atómico)** de `docs/audits/00_INDEX.md` — `git pull --ff-only`, marcar A3 como 🔄 en la tabla del INDEX con owner/fecha/SHA, commit + push (el lock existe solo cuando el push tiene éxito). Auditoría **read-only**: prohibido editar código de la app; solo se escribe en este MD y en el INDEX.

---

## 1. Objetivo

Verificar que el ciclo de vida completo de un evento — creación, lectura pública por slug, actualización (dos rutas distintas), cambio de slug, activación/desactivación, borrado soft/hard y settings (theme, displayTitle, imágenes OG) — funciona correctamente y de forma consistente en todas las superficies que consumen esos datos (página pública, metadatos OG, home). Detectar además configuración legacy muerta o divergente (`event-config.json`, rutas OG duplicadas).

## 2. Contexto mínimo (para sesión fría)

- **Multi-evento por slug:** cada evento vive en la tabla `events` (`lib/schema.ts:14` — `slug` varchar unique) y se sirve en `/{slug}` vía `app/[slug]/page.tsx` (client component que hace fetch a `/api/events/[slug]`). Los metadatos OG se generan server-side en `app/[slug]/layout.tsx`.
- **Theme JSONB:** `events.theme` guarda `{primaryColor, secondaryColor, accentColor, backgroundColor, textColor}`. Se consume en la página pública, en emails (`lib/email-template.ts:64`) y —en teoría— en imágenes OG.
- **`event-config.json` es herencia de la era single-event** (evento "rooftop-party-andras-oct2024" de 2024, pre-migración a Neon). Sigue importado en **15+ archivos** como fallback. `scripts/create-legacy-event.ts` insertó ese evento en DB con `id = slug = eventConfig.event.id` (líneas 53-54), lo cual hace que varios fallbacks "funcionen de casualidad".
- ⚠️ **Gotcha central:** `rsvps.eventId` (text) almacena el **slug** del evento, no el UUID (`lib/schema.ts:82`, `app/api/rsvp/route.ts:49`). Por eso `updateEventSlug` (`lib/queries.ts:345`) debe reescribir `rsvps.eventId` al cambiar el slug — si esa reescritura falla o es parcial, los RSVPs quedan huérfanos (invisibles para el panel y para los reminders del evento). Mismo riesgo con `deleteEvent`: los RSVPs del evento borrado **no se tocan**.
- **Dos rutas OG coexisten:** `app/api/og/[slug]/route.ts` (ImageResponse nodejs, 107 líneas) y `app/api/og-image/[slug]/route.ts` (proxy + compresión sharp + fallback SVG, 294 líneas). Además existe `app/opengraph-image.tsx` (convención file-based de Next para `/opengraph-image`). Parte de esta auditoría es determinar cuál se usa realmente y cuál sobra.
- **Historia relevante:** `43cf503` + `392428f` introdujeron `displayTitle` (título de la invitación separado del nombre interno; vacío = no se muestra título). `d3f0547` cambió el comportamiento de `rsvpClosed`: ahora se muestra la info del evento con un mensaje, en vez de una lock page.

## 3. Scope

**Dentro:**
- `app/api/events/route.ts` (GET lista / POST crear)
- `app/api/events/[slug]/route.ts` (GET / PUT / DELETE, incluye cambio de slug y `renameOgImages`)
- `app/api/event-settings/route.ts` y `app/api/admin/event-settings/update/route.ts`
- `app/[slug]/page.tsx`, `app/[slug]/layout.tsx`, `app/page.tsx` (home redirect + metadata)
- `lib/queries.ts` funciones de evento: `createEvent:207`, `getEventBySlug:223`, `getEventBySlugWithSettings:247`, `getEventById:277`, `getAllEvents:291`, `updateEvent:308`, `deleteEvent:326`, `updateEventSlug:345`, `getAppSetting:413`
- `event-config.json`, `lib/config.ts`, `scripts/create-legacy-event.ts`
- Rutas OG: `app/api/og/[slug]/route.ts`, `app/api/og-image/[slug]/route.ts`, `app/opengraph-image.tsx`

**Fuera (no duplicar; anotar en "Hallazgos fuera de scope" si aparece algo):**
- Contenido/envío de emails y reminders → **A1** (aquí solo se verifica que el *theme/datos de evento* lleguen bien al template).
- Panel admin (`app/admin/page.tsx`) y sus flujos UI → **A4**.
- Ciclo de vida RSVP (validación server-side de `rsvpClosed` al enviar RSVP, capacidad, etc.) → **A2**.
- Protección de endpoints y modelo de auth → **Fase S**.

## 4. Checklist ejecutable

> Regla del INDEX: **todo ítem requiere evidencia aunque PASE** (`archivo:línea` o comando + output). Ítem no ejecutado → `⏭️ NOT RUN` + razón.

### 4.1 Routing público por slug

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 1 | Evento inexistente → la API responde 404 | Leer `app/api/events/[slug]/route.ts:107-111` (devuelve 404 JSON cuando `getEventBySlug` retorna null). Opcional: `curl -i https://party.timekast.mx/api/events/no-existe-xyz` | ⬜ | |
| 2 | Evento inexistente → la **página** muestra estado "no encontrado", pero ¿con qué status HTTP? `app/[slug]/page.tsx` es client component: renderiza el error en `page.tsx:75-97` con **HTTP 200**, y aunque importa `notFound` de `next/navigation` (`page.tsx:4`) **nunca lo llama**. Confirmar si eso es aceptable (SEO/soft-404) o hallazgo | `curl -sI https://party.timekast.mx/no-existe-xyz \| head -1` (esperar 200, no 404) + grep `notFound` en `app/[slug]/page.tsx` (import sin uso) | ⬜ | |
| 3 | Evento con `isActive=false` (incluye soft-deleted) → se muestra lock page "Las inscripciones para este evento están cerradas" con el `title` interno | `app/[slug]/page.tsx:100-112`. Nótese la **conflación semántica**: soft-delete (`deleteEvent` → `isActive:false`, `lib/queries.ts:332-335`) y "evento inactivo" muestran lo mismo; contrastar con el mensaje configurable de `rsvpClosed` (ítem 4) | ⬜ | |
| 4 | `rsvpClosed=true` → se muestra la **info completa del evento** (fecha, hora, lugar, detalles) con `rsvpClosedMessage`, NO una lock page, y el botón de RSVP desaparece | `app/[slug]/page.tsx:244-265` (ternario `event.rsvpClosed`); verificar contra el diff de `d3f0547` (`git show d3f0547 -- app/[slug]/page.tsx`) | ⬜ | |
| 5 | Evento **pasado**: ¿existe alguna lógica que lo detecte? `events.date` es texto libre estilo "SÁBADO, 29 NOV" (`event-config.json:6`, `lib/schema.ts`), no comparable con `now()`. Confirmar que NADA en la página pública ni en `/api/events/[slug]` oculta o cierra eventos pasados — el único mecanismo es el flag manual `rsvpClosed`/`isActive` | `grep -rn "new Date\|Date.parse" app/[slug]/ app/api/events/` (esperar cero lógica de comparación de fecha del evento); decidir si es hallazgo o diseño aceptado | ⬜ | |
| 6 | `getEventBySlug` tiene **fallback por ID** (`lib/queries.ts:234-240`): la URL pública `/{uuid}` también resuelve el evento. Documentar el comportamiento y sus efectos colaterales: (a) `createEvent:211` rechaza slugs que coincidan con un `id` existente; (b) dos URLs distintas sirven el mismo evento | Leer `lib/queries.ts:223-241` y `lib/queries.ts:207-214`; opcional: probar `/{event.id}` de un evento real | ⬜ | |

### 4.2 Home (`/`)

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 7 | `home_event_id` guarda el **UUID** del evento (admin: `app/admin/page.tsx:2308` pasa `evt.id`; `:211` lo persiste) y `app/page.tsx:125` lo resuelve con `getEventById` — tipos consistentes. Verificar que no haya ningún camino que guarde un slug ahí | `grep -rn "home_event_id" app lib` y revisar cada writer (`app/api/admin/settings/route.ts:82` no valida el valor — cualquier string se guarda) | ⬜ | |
| 8 | Cadena de fallbacks del home (`app/page.tsx:116-154`): sin `home_event_id` → `getEventById(eventConfig.event.id)` (funciona solo porque el evento legacy tiene `id` = ese string, `scripts/create-legacy-event.ts:53-54`) → último recurso `redirect('/' + eventConfig.event.id)` **sin verificar existencia** → si el evento legacy no está en DB, el visitante aterriza en "Evento no encontrado". Evaluar si este last-resort tiene sentido hoy | Leer `app/page.tsx:136-153` + `scripts/create-legacy-event.ts:44-55`; opcional (si hay DATABASE_URL): `SELECT id, slug FROM events WHERE id = 'rooftop-party-andras-oct2024'` | ⬜ | |
| 9 | Metadata del home: usa `getEventBySlugWithSettings(homeEventId)` (`app/page.tsx:16`) donde `homeEventId` es un **UUID** — funciona solo por el fallback-por-ID de `getEventBySlug` (ítem 6). Verificar coherencia y que el OG del home apunte a `/api/og-image/{slug}` **sin** el cache-buster `?v=5` que sí usa el layout de evento (ítem 15) | `app/page.tsx:14-16,53` vs `app/[slug]/layout.tsx:33` | ⬜ | |

### 4.3 displayTitle y rutas de actualización divergentes

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 10 | `displayTitle` vacío → **no se renderiza ningún `<h1>`** en la invitación (el diseño asume título dentro de la imagen de fondo). Confirmar que no cae de vuelta a `title` (el comentario de `lib/schema.ts:16` dice "if empty, uses title" — **el comentario miente**, el fix `392428f` cambió a "empty means no title") | `app/[slug]/page.tsx:147-160` (`{event.displayTitle && ...}`) + `git show 392428f` + comentario desactualizado en `lib/schema.ts:16` y `types/event.ts:13` | ⬜ | |
| 11 | `displayTitle` viaja completo: `/api/events/[slug]` GET lo incluye (spread `...event` en `route.ts:76-77`), `/api/event-settings` GET lo expone (`route.ts:57`), y `admin/event-settings/update` lo persiste (`route.ts:93`, `?? ''`) | Leer las tres rutas; opcional: crear/editar en staging y verificar round-trip | ⬜ | |
| 12 | **Divergencia entre las DOS rutas de update:** `PUT /api/events/[slug]` (`route.ts:209-227`) **no** soporta `displayTitle`, `ogImageUrl`, `priceCurrency`, `requirePlusOneName`, `hostPhone` ni `emailConfig`; `POST /api/admin/event-settings/update` (`route.ts:92-137`) **no** soporta `isActive` ni `contact/host*`. Dos vocabularios parciales sobre la misma tabla → mapear qué UI usa cada una (A4) y si algún campo es in-actualizable o se pisa | Comparar campo a campo `app/api/events/[slug]/route.ts:211-227` vs `app/api/admin/event-settings/update/route.ts:70-137`; documentar la matriz de campos | ⬜ | |
| 13 | El full-update de `event-settings/update` **fuerza** `theme.backgroundColor='#1a0033'` y `textColor='#ffffff'` hardcodeados (`route.ts:110-111`), pisando cualquier valor previo del JSONB. ¿Esos dos campos se usan en algún lado o son peso muerto del theme? | `grep -rn "backgroundColor\|textColor" app lib --include="*.ts*" \| grep -v node_modules` y rastrear consumo real | ⬜ | |

### 4.4 event-config.json y lib/config.ts — ¿legacy vivo o muerto?

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 14 | Censo de importadores de `event-config.json` (hay **15+**: `app/page.tsx`, `app/layout.tsx`, `app/opengraph-image.tsx`, `app/admin/page.tsx`, `LoginForm.tsx`, `event-settings`, `send-bulk-email`, `send-email`, `send-bulk-reminder`, `add-demo-data`, `rsvp`, `debug-home`, `og/[slug]`, `stats`, `cron/send-reminders`, `lib/config.ts`, `lib/email-template.ts`). Clasificar cada uno: (a) fallback alcanzable, (b) fallback muerto, (c) default de `eventId` cuando el request no lo trae — el caso (c) es el peligroso: p.ej. `app/api/rsvp/route.ts:38,157` y `app/api/event-settings/route.ts:32` usan el evento de **2024** como default silencioso | `grep -rn "event-config" --include="*.ts" --include="*.tsx" app lib scripts` y revisar cada uso en contexto | ⬜ | |
| 15 | `app/api/event-settings/route.ts:97-140`: si el evento no existe devuelve `success:true` con `source:'config'` y **los datos del evento legacy de 2024** (título "Party Time!", fecha "SÁBADO, 29 NOV"). Un consumidor que no revise `source` cree que el evento existe. Evaluar si algún caller depende de esto o si debería ser 404 | Leer el bloque completo + `grep -rn "event-settings" app/admin` para ver cómo lo consume el panel (cruzar con A4) | ⬜ | |
| 16 | `lib/config.ts` (`getEventConfig`, `getStaticEventConfig`) — **cero importadores** fuera de sí mismo; además `getEventConfig` hace fetch relativo (`/api/event-settings`) que solo funcionaría client-side y menciona Firestore (era pre-migración). Confirmar que es código muerto | `grep -rn "lib/config\|getEventConfig\|getStaticEventConfig" app components lib --include="*.ts*"` (esperar solo `lib/config.ts`) → cruzar con A5 | ⬜ | |
| 17 | `scripts/create-legacy-event.ts`: one-shot ya ejecutado (el evento existe en DB con `id`=`slug`=string legacy). ¿Debe permanecer en el repo? Documentar su rol como explicación de por qué los fallbacks por ID funcionan | Leer script completo; si hay DB: `SELECT id, slug, is_active FROM events WHERE slug='rooftop-party-andras-oct2024'` | ⬜ | |

### 4.5 Theme JSONB — consistencia entre superficies

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 18 | Página pública aplica el theme del evento en todos los elementos (título neon, subtítulo, card de info, botón RSVP, overlay) con defaults por campo en la API (`app/api/events/[slug]/route.ts:46-53,92-98`) | `app/[slug]/page.tsx:114,128-265` — buscar colores hardcodeados que ignoren el theme (p.ej. el link "Volver al inicio" usa `#00FFFF` fijo, `page.tsx:87`) | ⬜ | |
| 19 | Emails: `lib/email-template.ts:64` usa `event.theme \|\| eventConfig.theme` — el theme del evento llega al template **solo si el caller lo pasa** en `eventData`. Verificar qué callers pasan theme y cuáles caen al theme legacy (detalle de contenido → A1; aquí solo la plomería del dato) | `grep -rn "generateEmailTemplate\|eventData" app/api --include="*.ts" \| head` y revisar 1-2 callers | ⬜ | |
| 20 | Imágenes OG **ignoran el theme por completo**: `og-image` SVG fallback hardcodea `#ff6b9d/#00f5ff/#b8b8b8` (`app/api/og-image/[slug]/route.ts:96-99`), `og/[slug]` hardcodea lo mismo (`route.ts:55-84`), `opengraph-image.tsx` ídem (`:44-84`). ¿Divergencia aceptada o hallazgo de consistencia? | Leer los tres archivos; comparar colores con `DEFAULT_THEME` de `app/api/events/[slug]/route.ts:47-53` (ni siquiera coinciden: `#FF1493` vs `#ff6b9d`) | ⬜ | |

### 4.6 Las DOS rutas OG

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 21 | **¿Cuál usan los metadatos reales?** `/api/og-image/{slug}` es la única referenciada: `app/[slug]/layout.tsx:33` (con `?v=5`) y `app/page.tsx:53` (sin `?v`). `/api/og/[slug]` tiene **cero referencias** en el código (`grep "api/og/" \| grep -v og-image` → vacío) — quedó como fallback histórico (ver `git log --follow app/api/og/[slug]/route.ts`: `9efcbe8` "preferir backgroundImageUrl y fallback /api/og", luego sustituida por og-image). Candidata a eliminación → cruzar con A5 | Repetir el grep + leer historia git de ambas rutas | ⬜ | |
| 22 | Divergencia funcional entre ambas: `og/[slug]` genera SIEMPRE una tarjeta ImageResponse con datos del evento (sin imagen custom); `og-image/[slug]` hace: (1) busca `og-{slug}.png/jpg` en `/public` vía self-fetch HTTP, (2) proxy de `ogImageUrl`/`backgroundImageUrl` con compresión sharp <280KB y rechazo de imágenes verticales (ratio <1.2), (3) fallback SVG. Documentar que si alguien "restaurara" `og/`, perdería todo el pipeline de WhatsApp | Leer ambos archivos completos; `ls public/og-*` (hoy: `og-40vueltas.jpg`, `og-andrreas.png`, `og-carrillo-fest.png`) | ⬜ | |
| 23 | `app/opengraph-image.tsx` (runtime edge): solo alcanzable como imagen de `/` cuando el home cae al fallback estático (`app/page.tsx:33,44,98,110`) y sirve datos **hardcodeados del evento 2024**. ¿Tercer generador OG redundante? | Leer archivo + los tres bloques de metadata de `app/page.tsx`; cruzar con A5 | ⬜ | |
| 24 | Cache-buster `?v=5` **hardcodeado** en `app/[slug]/layout.tsx:33` ("fuerza invalidación cuando se cambia la imagen OG") — requiere editar código y deployar para invalidar caché de WhatsApp; el home ni lo usa. Evaluar coherencia del mecanismo | Leer comentario `layout.tsx:31-33` y `app/page.tsx:52-53` | ⬜ | |

### 4.7 updateEventSlug — integridad de RSVPs

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 25 | `updateEventSlug` **SÍ** actualiza `rsvps.eventId` del slug viejo al nuevo (`lib/queries.ts:390-392`). PERO: los pasos 5 (update de `events.slug`, `:384-387`) y 6 (update de `rsvps`, `:390-392`) son **dos statements sin transacción** (driver neon-http). Si el paso 6 falla, el evento ya tiene slug nuevo y TODOS sus RSVPs quedan huérfanos apuntando al slug viejo (no aparecen en panel, no reciben reminders) | Leer `lib/queries.ts:345-404`; verificar que `lib/db.ts` usa `drizzle-orm/neon-http` (sin `db.transaction`); documentar la ventana de fallo | ⬜ | |
| 26 | El conteo `updatedRsvps` devuelto es **aproximado**: cuenta con un `SELECT` posterior de todos los RSVPs con el slug nuevo (`lib/queries.ts:396-402`), no las filas afectadas — si ya existieran RSVPs con `eventId = newSlug` (p.ej. de un evento anterior borrado que usó ese slug), se contarían y **se mezclarían silenciosamente** con los del evento renombrado | Leer `:389-403` + razonar contra el escenario del ítem 29 (slug reciclado) | ⬜ | |
| 27 | RSVPs cuyo `eventId` guardó el **UUID** en vez del slug (posible por el default `eventId = eventConfig.event.id` de `app/api/rsvp/route.ts:38` o datos pre-migración) NO se migran en el cambio de slug (el `where` es solo por `oldSlug`). ¿Existen filas así en producción? | Si hay DB: `SELECT event_id, count(*) FROM rsvps GROUP BY event_id` y cruzar contra `SELECT slug FROM events` — todo `event_id` que no sea un slug vigente es huérfano. Sin DB: `⏭️ NOT RUN` + razón | ⬜ | |
| 28 | `renameOgImages` (`app/api/events/[slug]/route.ts:15-44`) renombra `public/og-{oldSlug}.*` con `renameSync` en `process.cwd()` — en **Vercel el filesystem del deployment es de solo lectura/efímero**: el rename fallará o no persistirá entre invocaciones, dejando `og-{oldSlug}.png` servido para el slug viejo y **nada** para el nuevo (el paso 1 de `og-image` no encontrará `og-{newSlug}.png` y caerá a `ogImageUrl`/fallback). Funciona solo en dev local | Leer `route.ts:15-44` + `og-image/route.ts:121-177`; verificar en logs de Vercel un cambio de slug real, o marcar NOT RUN con razón | ⬜ | |

### 4.8 deleteEvent y getAllEvents

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 29 | `deleteEvent` **hard** (`?hard=true`, `app/api/events/[slug]/route.ts:282,301`) borra solo la fila de `events` (`lib/queries.ts:329-330`) — los RSVPs del evento **quedan huérfanos** con `eventId = slug` (no hay FK: `lib/schema.ts:82`). Peor: el slug queda libre; si se crea un evento nuevo con el mismo slug, **hereda los RSVPs del evento borrado** (aparecen en su panel y entran en cualquier envío bulk/reminder de ese slug → email a quien no corresponde) | Leer `lib/queries.ts:326-338` + `lib/schema.ts:80-84` (sin FK ni cascade); razonar el escenario slug-reciclado; si hay DB, buscar huérfanos (query del ítem 27) | ⬜ | |
| 30 | `deleteEvent` **soft** (default) = `isActive:false` (`lib/queries.ts:332-335`). Efectos: página pública muestra lock page con el título (ítem 3); `getAllEvents(activeOnly=true)` lo excluye; el panel (sin `?active=true`) lo sigue listando. ¿El público debería ver el título de un evento "borrado"? ¿Hay forma de reactivarlo (PUT `isActive:true`, `route.ts:225`)? | Leer las tres superficies; documentar el ciclo desactivar→reactivar | ⬜ | |
| 31 | `getAllEvents(activeOnly)`: "activo" ≡ `isActive` — el mismo flag significa a la vez "soft-deleted" y "cerrado al público" (ítems 3 y 30). Además el filtro es **en JS post-query** (`lib/queries.ts:294-301`: trae toda la tabla y filtra en memoria) en vez de un `where`. Verificar quiénes llaman con `activeOnly=true` y si la semántica es consistente | `grep -rn "getAllEvents" app lib --include="*.ts*"` y revisar cada caller (`app/api/events/route.ts:37` lo expone vía `?active=true`) | ⬜ | |

### 4.9 Creación y metadatos

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|--------------|----------------|-----------|-----------|
| 32 | `POST /api/events` valida slug (`^[a-z0-9-]+$`, `route.ts:104`) y title requerido, y `createEvent` rechaza slug duplicado con 409 (`route.ts:167-172` + `lib/queries.ts:211-214`). Nota: el check de duplicado usa `getEventBySlug` que también matchea por **id** (ítem 6) — un slug igual al UUID de otro evento se rechaza con el mensaje engañoso "Ya existe un evento con este slug". Verificar además la **carrera** check-then-insert (dos requests simultáneos con el mismo slug: el unique de DB salva, pero el error no se traduce a 409) | Leer `app/api/events/route.ts:93-178` + `lib/queries.ts:207-221` + `lib/schema.ts:14` (unique) | ⬜ | |
| 33 | `POST /api/events` NO acepta `displayTitle`, `ogImageUrl`, `rsvpClosed*`, `requirePlusOneName` ni `emailConfig` al crear (`route.ts:112-137`) — un evento recién creado depende de un segundo save vía `event-settings/update` para quedar completo. ¿El flujo del admin lo hace? (cruzar con A4) | Comparar `eventInput` (`route.ts:112-137`) contra columnas de `lib/schema.ts:13-66` | ⬜ | |
| 34 | Metadatos del evento: `title` OG = `"${event.title} - ${event.subtitle}"` (`app/[slug]/layout.tsx:28`) → con subtitle vacío queda `"Título - "` (guion colgante). `description` = `"${date} ${time} - ${location}"` → campos vacíos generan `" - "`. Verificar con un evento sin subtitle | Leer `layout.tsx:28-29`; opcional: `curl -s https://party.timekast.mx/{slug} \| grep -o '<title>[^<]*'` para un evento sin subtitle | ⬜ | |
| 35 | El evento no encontrado en `generateMetadata` devuelve metadata "Evento no encontrado" (`layout.tsx:20-26`) pero la página igual renderiza client-side (ítem 2) — coherente entre sí; documentar | `app/[slug]/layout.tsx:17-26` | ⬜ | |

## 5. Hallazgos

> Formato: `A3-XX` · severidad (🔴/🟡/🟢 según rúbrica del INDEX) · evidencia `archivo:línea` obligatoria. Registrar aquí al ejecutar el checklist.

| ID | Sev | Título | Evidencia | Detalle |
|----|-----|--------|-----------|---------|
| A3-01 | | | | |

## 6. Hallazgos fuera de scope

> Cosas detectadas durante A3 que pertenecen a otra auditoría — anotar factualmente con referencia cruzada, sin profundizar.

| ID | Auditoría dueña | Descripción | Evidencia |
|----|-----------------|-------------|-----------|
| | | | |

*Candidatos ya visibles durante la preparación de este MD (confirmar y registrar al ejecutar):*
- `lib/config.ts` sin importadores (código muerto) → **A5**.
- `app/api/og/[slug]/route.ts` sin referencias (ruta muerta) → **A5** (aquí en ítem 21 se documenta cuál se usa; la remoción se propone allá).
- Enforcement server-side de `rsvpClosed` al recibir un RSVP → **A2**.
- Flujo del panel para crear/editar eventos y qué ruta de update usa cada pantalla → **A4**.
- `app/api/admin/settings/route.ts:70-84` guarda cualquier `id/value` sin validación → **A4**.
- Falta de FK/cascade entre `rsvps.eventId` y `events` → **A6**.

## 7. Cierre

1. Verificar que **todos** los ítems del checklist tienen resultado + evidencia (o `⏭️ NOT RUN` + razón). Sin eso, A3 no puede marcarse ✅.
2. Consolidar hallazgos en la sección 5 y contar por severidad.
3. Actualizar la fila **A3** de `docs/audits/00_INDEX.md` a ✅ con el conteo 🔴/🟡/🟢.
4. Commit + push: `audit: A3 eventos-settings — X🔴 Y🟡 Z🟢`.
