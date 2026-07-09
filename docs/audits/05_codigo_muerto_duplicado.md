# 🧹 A5 — Código muerto y duplicado

> **Estado:** ⬜ pendiente · **Owner/Sesión:** — · **Inicio:** — · **SHA auditado:** — (referencia del framework y de la pre-verificación: `bcc7f1e`)
>
> **Protocolo:** seguir `docs/audits/00_INDEX.md` — `git pull --ff-only`, adquirir lock (marcar A5 🔄 en la tabla del INDEX + commit + push exitoso), ejecutar read-only (prohibido editar código de la app; solo se escribe en este MD y en el INDEX), evidencia obligatoria en TODOS los ítems (también los que pasan), cerrar con ✅ + conteo.

---

## 1. Objetivo

Identificar y documentar con evidencia todo el **código muerto** (archivos/deps/rutas sin ningún importador ni referencia), **duplicado** (rutas/archivos redundantes) y **lógica duplicada divergente** (bloques repetidos que ya divergieron entre sí) del repo.

⚠️ **Esta auditoría NO borra nada.** BORRAR/consolidar es del plan correctivo (post `99_CONSOLIDADO.md`), no de la auditoría. Aquí solo se produce el inventario con veredictos y evidencia reproducible.

## 2. Contexto mínimo (para sesión fría)

La app nació como **invitación single-event** ("Rooftop Party" de Andrreas, ver `event-config.json`) sobre **Firebase/Firestore** (y antes Cosmos DB, ver `DOCUMENTATION_UPDATE_REPORT.md`). Después migró en dos ejes:

1. **Single-event → multi-event**: eventos en tabla `events` con slug propio; `event-config.json` quedó como fallback legacy en muchos endpoints.
2. **Firebase → Neon PostgreSQL + Drizzle**: `lib/firestore.ts` fue reemplazado por `lib/queries.ts`/`lib/db.ts`; la migración se hizo con scripts one-shot (`scripts/migrate-firebase-to-neon.ts` etc.).

Por eso hay tres estratos de restos: (a) capa Firestore completa, (b) config/tipos de la era single-event, (c) artefactos de pruebas manuales de OG images y docs de fases ya cerradas. **Producción con datos y usuarios reales** — el veredicto "muerto" debe estar respaldado por grep de importadores, no por intuición.

Convención de veredictos: **muerto** = 0 referencias en código ejecutable · **vivo** = referenciado en runtime · **parcial** = referenciado solo por código muerto/one-shot, o vivo pero duplicado/divergente.

## 3. Scope

- **In:** repo completo — `app/`, `lib/`, `types/`, `scripts/`, root (MDs, artefactos, `package.json`, `event-config.json`). Archivos muertos, rutas duplicadas, deps sin uso, tipos divergentes, y duplicación de LÓGICA (bloques repetidos), no solo de archivos.
- **Out:** vulnerabilidades y protección de endpoints (**Fase S** — si aparece algo, va a "Hallazgos fuera de scope" sin profundizar) · corrección de flujos de email (A1) · queries/schema (A6) · UX (A7) · decidir/borrar (plan correctivo).

## 4. Checklist ejecutable

Todos los comandos se corren desde la raíz del repo. La columna **Evidencia pre-verificada** contiene el output real obtenido al crear este documento (SHA `bcc7f1e`, 2026-07-09); la sesión ejecutora debe **re-correr cada comando**, pegar/confirmar el output y marcar Resultado.

### 4.1 Capa Firestore

| # | Candidato | Cómo verificar (comando exacto) | Resultado | Evidencia pre-verificada | Veredicto preliminar |
|---|-----------|--------------------------------|-----------|--------------------------|----------------------|
| 1 | `lib/firestore.ts` (526 líneas) | `grep -rn "lib/firestore\|from './firestore'\|from \"@/lib/firestore\"" --include="*.ts" --include="*.tsx" app lib types scripts` | ⬜ | **0 importadores.** Nada en `app/` ni `lib/` lo importa post-migración. Además lanza `throw` a nivel de módulo si faltan env vars GCP (`lib/firestore.ts:17-22`) — si algo lo importara, rompería el build en Vercel (donde esas vars ya no existen). | **Muerto** |
| 2 | dep `firebase-admin` (package.json) | `grep -rn "firebase-admin" --include="*.ts" --include="*.tsx" app lib types scripts` | ⬜ | Solo 3 archivos: `lib/firestore.ts:1` (muerto, ítem 1), `scripts/migrate-firebase-to-neon.ts:12` y `scripts/add-demo-data.ts:1` (one-shots, ítems 12-13). **Cero uso en runtime de la app.** Sigue en `dependencies` inflando `node_modules` y el install de Vercel. | **Muerto** (en runtime) |
| 3 | `scripts/add-demo-data.ts` | `head -30 scripts/add-demo-data.ts` y `grep -rn "add-demo-data" app lib scripts *.md *.json` | ⬜ | Usa `admin.firestore()` (`scripts/add-demo-data.ts:23`) — **apunta a Firestore, roto post-migración a Neon**. Única referencia externa: `COMMANDS.md:126` (`npx ts-node scripts/add-demo-data.ts`, doblemente stale: ts-node no está instalado, ver ítem 19). | **Muerto** |

### 4.2 Rutas API duplicadas / de debug

| # | Candidato | Cómo verificar | Resultado | Evidencia pre-verificada | Veredicto preliminar |
|---|-----------|----------------|-----------|--------------------------|----------------------|
| 4 | `app/api/og/[slug]/route.ts` (107 l) vs `app/api/og-image/[slug]/route.ts` (294 l) | `grep -rn "api/og" --include="*.ts" --include="*.tsx" app lib public` | ⬜ | Solo se referencia **og-image**: `app/page.tsx:53` (`/api/og-image/${event.slug}`) y `app/[slug]/layout.tsx:33` (`/api/og-image/${slug}?v=5`). **Nada apunta a `/api/og/`.** Son implementaciones distintas del mismo propósito: `og/` genera imagen sintética con `next/og` ImageResponse; `og-image/` sirve `ogImageUrl`/`backgroundImageUrl` del evento comprimido con `sharp` para WhatsApp. `og/` es la versión vieja superseded. | **Muerto** (duplicado) |
| 5 | `app/api/debug-home/route.ts` (22 l) + `scripts/debug-home.ts` (83 l) | `grep -rn "debug-home" app lib scripts *.md *.json` | ⬜ | **0 referencias** a cualquiera de los dos (ni UI, ni docs, ni package.json). Es un endpoint de diagnóstico de la migración de `home_event_id` desplegado en prod. Nota: el endpoint responde sin auth (ver Hallazgos fuera de scope → Fase S). | **Muerto** |
| 6 | `app/api/admin/add-demo-data/route.ts` (101 l) | `grep -rn "add-demo-data" app --include="*.tsx" --include="*.ts"` (¿algún botón/fetch del admin lo llama?) | ⬜ | **0 referencias desde la UI** (el único hit del repo es el propio route + `COMMANDS.md:126` que refiere al *script*, no al endpoint). Tiene auth super_admin (`route.ts:59-71`) pero inserta 7 RSVPs demo con `eventId: eventConfig.event.id` **hardcodeado al evento legacy** (`route.ts:13`) e incluye un email real (`joseassem@gmail.com`, `route.ts:10`). Endpoint de seed accesible en producción con datos reales. | **Muerto** (sin caller) — riesgo si se invoca |

### 4.3 Artefactos y docs en root

| # | Candidato | Cómo verificar | Resultado | Evidencia pre-verificada | Veredicto preliminar |
|---|-----------|----------------|-----------|--------------------------|----------------------|
| 7 | `test-og.png` (646 KB), `test-og-dynamic.png` (137 KB), `test-og-result.bin`, `prod-og-test.bin` (0 B), `setup.ps1` | `grep -rn "test-og\|prod-og\|setup.ps1" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" app lib scripts public *.md *.json` | ⬜ | **0 referencias** (grep exit=1). Son outputs de pruebas manuales `curl` de las OG images (git: `caf3a2e` "WhatsApp compatibility") y un script de setup Windows de la era inicial (`76b615f` Initial commit; verifica `background.jpg` que ya ni es el nombre actual — el código usa `/background.png`, `lib/schema.ts:33`). ~790 KB de binarios versionados en el repo. | **Muerto** |
| 8 | 11 MDs en root — vigencia | Comparar afirmaciones clave contra el código: `grep -n "ts-node\|Firestore\|Firebase\|Cosmos" *.md` y `grep -n '"ts-node"\|"tsx"' package.json` | ⬜ | Ver desglose abajo (tabla 4.3.1). Claim transversal roto: **6 MDs instruyen `npx ts-node scripts/...` pero el repo instala `tsx`, no `ts-node`** (`package.json` devDependencies) → los comandos documentados fallan tal cual. | **Parcial** (ver 4.3.1) |

#### 4.3.1 Desglose de MDs root (evidencia pre-verificada)

| MD | Afirmación clave verificada | Estado propuesto |
|----|------------------------------|------------------|
| `README.md` | Describe Neon+Drizzle correctamente; pero `README.md:78` → `npx ts-node scripts/create-super-admin.ts` (ts-node no instalado) | **Vigente** (corregir ts-node→tsx) |
| `START_HERE.md` | Setup válido (Neon); `START_HERE.md:50` mismo bug ts-node | **Vigente** (corregir) |
| `SETUP_GUIDE.md` | Guía válida; `SETUP_GUIDE.md:110` mismo bug ts-node | **Vigente** (corregir) |
| `ADMIN_GUIDE.md` | Describe panel actual; `ADMIN_GUIDE.md:105` mismo bug ts-node | **Vigente** (corregir) |
| `COMMANDS.md` | `COMMANDS.md:121` ts-node; `COMMANDS.md:126` → `npx ts-node scripts/add-demo-data.ts` que además es el **script Firestore roto** (ítem 3) | **Parcial** — comandos rotos |
| `CHECKLIST.md` | `CHECKLIST.md:25` mismo bug ts-node; resto es checklist de un setup ya hecho | **Histórico** (archivar) |
| `INDEX.md` | Índice de los otros MDs; se vuelve stale si se archivan | **Parcial** (actualizar tras decidir) |
| `DEPLOYMENT_SUCCESS.md` | Guía de un deploy ya realizado | **Histórico** (archivar) |
| `PROJECT_SUMMARY.md` | Snapshot ASCII-art de un estado pasado del proyecto | **Histórico** (archivar) |
| `DOCUMENTATION_UPDATE_REPORT.md` | Reporte de la corrección de docs Cosmos→Neon (`:20`, `:90`) — evento puntual pasado | **Histórico** (archivar) |
| `PROPUESTA_GESTION.md` | Propuesta comercial/de gestión, no doc técnica del código | **Histórico** (archivar) |

### 4.4 Scripts one-shot

| # | Candidato | Cómo verificar | Resultado | Evidencia pre-verificada | Veredicto preliminar |
|---|-----------|----------------|-----------|--------------------------|----------------------|
| 9 | `scripts/migrate-firebase-to-neon.ts` | `git log --oneline --follow -- scripts/migrate-firebase-to-neon.ts \| head -3` | ⬜ | `821911f`, `3a3deac` (feat: Multi-party system + Neon migration). Migración **ya ejecutada** — la app corre en Neon con datos reales. Requiere credenciales GCP que ya no aplican. | **Muerto** (one-shot ejecutado; valor solo histórico) |
| 10 | `scripts/fix-rsvp-event-link.ts` | `git log --oneline --follow -- scripts/fix-rsvp-event-link.ts \| head -3` | ⬜ | `9fc2b5c`. Fix puntual de vinculación RSVP↔evento, ya aplicado. | **Muerto** (one-shot) |
| 11 | `scripts/create-legacy-event.ts` | `git log --oneline --follow -- scripts/create-legacy-event.ts \| head -3` | ⬜ | `9fc2b5c`. Creó el evento legacy desde `event-config.json` en la DB — ya existe. | **Muerto** (one-shot) |
| 12 | `scripts/create-super-admin.ts` (control: NO es candidato a muerto) | `grep -rn "create-super-admin" *.md` | ⬜ | Referenciado en README/SETUP_GUIDE/ADMIN_GUIDE/CHECKLIST/START_HERE/COMMANDS como herramienta operativa vigente (crear admins). | **Vivo** |
| 13 | `scripts/debug-home.ts` | (cubierto en ítem 5) | ⬜ | 0 referencias; debug puntual de `home_event_id`. | **Muerto** |

### 4.5 Dependencias (package.json)

| # | Candidato | Cómo verificar | Resultado | Evidencia pre-verificada | Veredicto preliminar |
|---|-----------|----------------|-----------|--------------------------|----------------------|
| 14 | `image-size` | `grep -rln "image-size" --include="*.ts" --include="*.tsx" app lib types scripts` | ⬜ | **0 imports.** (El parsing de dimensiones en `app/api/og-image/[slug]/route.ts` se hace a mano con buffers, no con esta lib.) Confirmado por depcheck (ítem 16). | **Muerto** |
| 15 | `jspdf`, `jspdf-autotable`, `sharp`, `xlsx`, `bcryptjs`, `@vercel/blob`, `react-international-phone`, `firebase-admin` | Por cada dep: `grep -rln "<dep>" --include="*.ts" --include="*.tsx" app lib types scripts` | ⬜ | `jspdf`: `app/admin/page.tsx:7` · `jspdf-autotable`: `app/admin/page.tsx:8,1071` + `types/jspdf-autotable.d.ts` · `sharp`: `app/api/og-image/[slug]/route.ts:3` · `xlsx`: `app/admin/page.tsx:9` · `bcryptjs`: `lib/auth-utils.ts` + `scripts/create-super-admin.ts` · `@vercel/blob`: `app/api/admin/upload-image/route.ts` · `react-international-phone`: `app/cancel/[rsvpId]/page.tsx`, `app/admin/page.tsx`, `app/components/RSVPModal.tsx` → todas **vivas**. `firebase-admin` → **muerta** (ítem 2). | **Vivas** salvo firebase-admin |
| 16 | `npx depcheck` | `npx depcheck --json` | ⬜ | Corrió OK: `"dependencies":["image-size"]` (única dep de producción sin uso) · `"devDependencies":["@types/react-dom","tsx","typescript"]` → **falsos positivos** (typescript/`@types/*` los usa `next build`; `tsx` es el runner de los scripts vivos, p.ej. `npx tsx scripts/create-super-admin.ts`). `"missing":{}`. | Confirma ítem 14 |
| 17 | `@types/bcryptjs` en `dependencies` | `grep -n "@types/bcryptjs" package.json` | ⬜ | Está en `dependencies` (package.json, bloque dependencies) — los types no se necesitan en runtime; debe vivir en `devDependencies`. | **Parcial** (mal ubicada) |

### 4.6 Tipos: triple definición de "Event"

| # | Candidato | Cómo verificar | Resultado | Evidencia pre-verificada | Veredicto preliminar |
|---|-----------|----------------|-----------|--------------------------|----------------------|
| 18 | `types/event.ts` vs `lib/schema.ts` ($inferSelect) vs `types/event-settings.ts` | `grep -rn "from '@/types/event'" app lib` · `grep -rn "from '@/lib/schema'\|from './schema'" app lib` · leer los 3 archivos y comparar campo por campo | ⬜ | Ver comparación 4.6.1. Importadores de `types/event.ts#Event`: `app/admin/page.tsx:12`, `app/[slug]/page.tsx:8`, `lib/firestore.ts:363` (muerto). Importadores del `Event` de Drizzle: `app/api/events/route.ts:6`, `lib/queries.ts:8`. **El mismo nombre `Event` designa dos shapes incompatibles a ambos lados del mismo fetch.** | **Parcial** (triple definición divergente) |
| 19 | `types/event-settings.ts` | `grep -rn "types/event-settings\|EventSettings\|EventConfig" --include="*.ts" --include="*.tsx" app lib scripts` | ⬜ | `EventSettings`: único importador es `lib/firestore.ts:290` (muerto, ítem 1). `EventConfig`: **0 importadores** (los hits `EventConfig` en `app/admin/page.tsx:281,330,784` son funciones locales `loadEventConfig`/`saveEventConfig`, no el tipo). `app/api/event-settings/route.ts` construye el shape a mano sin importar el tipo. | **Muerto** (arrastrado por firestore.ts) |

#### 4.6.1 Comparación campo por campo (pre-verificada)

| Concepto | `types/event.ts` (nested) | `lib/schema.ts` → `$inferSelect` (flat) | Divergencia |
|----------|---------------------------|------------------------------------------|-------------|
| Precio | `price: { enabled, amount, currency }` | `priceEnabled`, `priceAmount`, `priceCurrency` | shape distinto |
| Capacidad | `capacity: { enabled, limit }` | `capacityEnabled`, `capacityLimit` | shape distinto |
| Imagen fondo | `backgroundImage: { url, uploadedAt? }` | `backgroundImageUrl` | shape distinto |
| OG image | **no existe** | `ogImageUrl` (`lib/schema.ts:37`) | falta en types/event.ts |
| Contacto | `contact: { hostName, hostEmail, hostPhone? }` | `hostName`, `hostEmail`, `hostPhone` | shape distinto |
| Email cfg | `emailConfig: { confirmationEnabled, reminderEnabled, reminderScheduledAt, reminderSentAt }` | `emailConfirmationEnabled`, `reminderEnabled`, `reminderScheduledAt`, `reminderSentAt` | shape distinto |
| Fechas | `createdAt/updatedAt: string` | `timestamp` (Date) | tipo distinto |

**Consecuencia concreta:** `GET /api/events` devuelve filas Drizzle **flat** (`app/api/events/route.ts:42-48` solo agrega `accessRole`, no re-mapea), pero `app/admin/page.tsx:31` (`useState<Event[]>`) y `app/[slug]/page.tsx:15` las tipan con el `Event` **nested** de `types/event.ts` → el tipo miente; funciona solo porque los campos que esas páginas tocan (`slug`, `title`, `isActive`, `rsvpClosed`…) coinciden por casualidad en ambos shapes. Cualquier acceso a `event.price.enabled` compilaría y explotaría en runtime.

### 4.7 Restos de la era single-event

| # | Candidato | Cómo verificar | Resultado | Evidencia pre-verificada | Veredicto preliminar |
|---|-----------|----------------|-----------|--------------------------|----------------------|
| 20 | `lib/config.ts` (55 l) | `grep -rn "from '@/lib/config'\|from '../lib/config'\|from './config'" --include="*.ts" --include="*.tsx" app lib scripts` | ⬜ | **0 importadores** de `getEventConfig`/`getStaticEventConfig`. Su docstring aún dice "lee de Firestore" (`lib/config.ts:5,9`) — resto de la era single-event+Firestore. | **Muerto** |
| 21 | `event-config.json` | `grep -rn "event-config" --include="*.ts" --include="*.tsx" app lib scripts \| wc -l` y revisar cada sitio | ⬜ | **VIVO — 16 importadores** en runtime: fallback de eventId legacy (`app/api/rsvp/route.ts:38,157,209`, `app/api/stats/route.ts:27`, `app/api/event-settings/route.ts:32,102-127`), fallback de theme/hostEmail en los 5 endpoints de email, título/branding en `app/layout.tsx`, `app/page.tsx`, `app/opengraph-image.tsx`, `app/admin/components/LoginForm.tsx`, `lib/email-template.ts:6`. **No es código muerto** — es deuda viva: datos del evento de nov-2024 hardcodeados como default global multi-evento. | **Vivo** (deuda, no muerto) |

### 4.8 Duplicación de LÓGICA

| # | Candidato | Cómo verificar | Resultado | Evidencia pre-verificada | Veredicto preliminar |
|---|-----------|----------------|-----------|--------------------------|----------------------|
| 22 | Bloque "Build EventData" repetido en los 5 endpoints de email | `grep -n "Build EventData" app/api/rsvp/route.ts app/api/cron/send-reminders/route.ts app/api/admin/send-email/route.ts app/api/admin/send-bulk-email/route.ts app/api/admin/send-bulk-reminder/route.ts` y leer ±25 líneas de cada hit | ⬜ | 5 copias de ~22 líneas: `rsvp/route.ts:81-102`, `cron/send-reminders/route.ts:115-137`, `send-email/route.ts:53-75`, `send-bulk-email/route.ts:38-60`, `send-bulk-reminder/route.ts:76-97`. **Ya divergieron en el fallback de theme**: variante A (`rsvp`, `cron`, `bulk-reminder`): `theme = event.theme \|\| {}` + hex hardcodeados (`'#FF1493'`…); variante B (`send-email`, `send-bulk-email`): `theme = event.theme \|\| eventConfig.theme` + `eventConfig.theme.*` como fallback + `eventConfig.event.backgroundImage` extra en la cadena de backgroundImageUrl. Hoy los valores coinciden numéricamente, pero un cambio en `event-config.json` haría que el mismo evento mande emails con colores distintos según el endpoint. | **Parcial** (duplicado divergente) |
| 23 | Patrón de auth repetido (cookie `rp_session` + `validateSession`) | `grep -rln "rp_session" app/api \| sort` y `grep -rn "validateSession" app/api \| wc -l` | ⬜ | 17 rutas repiten a mano el bloque cookie→token→`validateSession`→check de rol (44 menciones de `validateSession` en `app/api`). No hay helper tipo `requireAuth()`/middleware; cada copia puede divergir (esto ya mordió: hotfix `bcc7f1e` fue exactamente una ruta que se quedó atrás). Inventario factual aquí; el análisis de suficiencia de auth es **Fase S**. | **Parcial** (duplicación estructural) |
| 24 | Helpers repetidos en `app/admin/page.tsx` (2599 l) | `grep -n "fetch('/api/admin/event-settings/update'" app/admin/page.tsx` · `grep -n "'#FF1493'" app/admin/page.tsx app/api/event-settings/route.ts app/components/RSVPModal.tsx "app/cancel/[rsvpId]/page.tsx"` | ⬜ | (a) El POST a `/api/admin/event-settings/update` está copiado 3 veces: `page.tsx:843` (guardar form), `:893` (auto-save tras subir background), `:958` (auto-save tras subir OG image). (b) El theme default `#FF1493…` está re-hardcodeado en ≥5 sitios: `app/admin/page.tsx:52,304`, `app/api/event-settings/route.ts:79,125`, `app/components/RSVPModal.tsx:24`, `app/cancel/[rsvpId]/page.tsx:36`, más `lib/schema.ts:47` (default del JSONB) y las 2 variantes del ítem 22 — una sola fuente de verdad no existe. (c) Helpers de export (`stripEmojis:1010`, `exportInformativeList:1017`, `exportExcelList:1117`) viven inline en el componente. | **Parcial** (duplicación intra/inter-archivo) |

## 5. Hallazgos

> IDs `A5-XX`. Los siguientes quedan **pre-registrados** por la pre-verificación al crear este doc (SHA `bcc7f1e`); la sesión ejecutora los confirma, ajusta severidad si su re-verificación difiere, y añade los nuevos que encuentre. Evidencia detallada: ver el ítem del checklist citado.

| ID | Sev | Hallazgo | Evidencia | Ítem |
|----|-----|----------|-----------|------|
| A5-01 | 🟢 | `lib/firestore.ts` (526 l) muerto: 0 importadores post-migración a Neon | grep importadores = 0 | 1 |
| A5-02 | 🟢 | Dep `firebase-admin` muerta en runtime (solo la importan firestore.ts muerto y 2 scripts one-shot) | `grep -rn "firebase-admin"` → 3 archivos | 2 |
| A5-03 | 🟢 | `scripts/add-demo-data.ts` roto: escribe a Firestore inexistente | `scripts/add-demo-data.ts:23` | 3 |
| A5-04 | 🟢 | `app/api/og/[slug]/route.ts` duplicado muerto de `og-image` (0 referencias; la versión viva es `og-image`) | `app/page.tsx:53`, `app/[slug]/layout.tsx:33` | 4 |
| A5-05 | 🟢 | Endpoint + script `debug-home` muertos (0 refs), desplegados en prod | grep `debug-home` = 0 refs | 5 |
| A5-06 | 🟡 | `app/api/admin/add-demo-data/route.ts` sin ningún caller pero desplegado: un POST autenticado insertaría 7 RSVPs demo (incl. email real `joseassem@gmail.com`) en el evento legacy en producción | `route.ts:7-57` | 6 |
| A5-07 | 🟢 | ~790 KB de artefactos de prueba versionados (`test-og*.png`, `*-og-*.bin`) + `setup.ps1` obsoleto (verifica `background.jpg` que ya no existe) | grep = 0 refs | 7 |
| A5-08 | 🟢 | 6 MDs instruyen `npx ts-node` pero el repo instala `tsx` → comandos documentados fallan; `COMMANDS.md:126` además apunta al script Firestore roto | tabla 4.3.1 | 8 |
| A5-09 | 🟢 | 5 MDs root históricos a archivar (CHECKLIST, DEPLOYMENT_SUCCESS, PROJECT_SUMMARY, DOCUMENTATION_UPDATE_REPORT, PROPUESTA_GESTION); INDEX.md quedaría stale | tabla 4.3.1 | 8 |
| A5-10 | 🟢 | 4 scripts one-shot ya ejecutados (`migrate-firebase-to-neon`, `fix-rsvp-event-link`, `create-legacy-event`, `debug-home`) — candidatos a archivo/borrado | git log ítems 9-13 | 9-13 |
| A5-11 | 🟢 | Dep `image-size` sin un solo import (confirmado por depcheck) | grep = 0; depcheck | 14, 16 |
| A5-12 | 🟢 | `@types/bcryptjs` en `dependencies` en lugar de `devDependencies` | package.json | 17 |
| A5-13 | 🟡 | Triple definición divergente de `Event`: `types/event.ts` (nested) miente sobre el shape flat que `/api/events` realmente devuelve a `app/admin/page.tsx:31` y `app/[slug]/page.tsx:15`; a `types/event.ts` además le falta `ogImageUrl` | tabla 4.6.1 | 18 |
| A5-14 | 🟢 | `types/event-settings.ts` muerto por arrastre (EventSettings solo lo importa firestore.ts muerto; EventConfig 0 importadores) | grep ítem 19 | 19 |
| A5-15 | 🟢 | `lib/config.ts` muerto (0 importadores; docstring aún dice "lee de Firestore") | grep ítem 20 | 20 |
| A5-16 | 🟡 | Bloque "Build EventData" duplicado 5× con 2 variantes de fallback de theme ya divergentes → un mismo evento puede mandar emails con estilos distintos según el endpoint si cambia `event-config.json` | ítem 22 | 22 |
| A5-17 | 🟢 | Patrón auth cookie+`validateSession` copiado a mano en 17 rutas sin helper común (la divergencia de copias ya causó el hotfix `bcc7f1e`) | ítem 23 | 23 |
| A5-18 | 🟢 | Duplicación intra-repo: POST a `event-settings/update` 3× en `app/admin/page.tsx`; theme default `#FF1493` re-hardcodeado en ≥7 sitios sin fuente única | ítem 24 | 24 |

**Conteo preliminar: 0 🔴 · 3 🟡 · 15 🟢** (la sesión ejecutora actualiza el conteo final).

## 6. Hallazgos fuera de scope

| Ref | Destino | Nota factual (sin profundizar) |
|-----|---------|--------------------------------|
| FS-A5-a | **Fase S** | `app/api/debug-home/route.ts` responde **sin autenticación** y expone `homeEventId`, slug/título del evento home y el id legacy. Se registra el hecho; la evaluación es de Fase S. |
| FS-A5-b | **Fase S** | El inventario del ítem 23 (17 rutas con auth copiada a mano) es insumo directo para el barrido de protección de endpoints de Fase S. |
| A3/A6 | **A3 Eventos/settings, A6 Datos** | `event-config.json` vivo como fallback global (ítem 21): decidir si el default multi-evento debe seguir siendo el evento de nov-2024 es de A3; el uso de `eventConfig.event.id` como eventId default en `rsvp/stats/event-settings` toca el gotcha slug-vs-UUID de A6. |
| A1 | **A1 Emails** | La divergencia de theme del ítem 22 puede producir emails visualmente inconsistentes; el impacto en los flujos de envío se evalúa en A1 (aquí solo la duplicación). |

## 7. Cierre (para la sesión ejecutora)

1. Verificar que **todos** los ítems 1-24 tengan Resultado ✅/❌/⏭️ NOT RUN con evidencia u output pegado (regla anti checkbox-theater del INDEX).
2. Confirmar/ajustar hallazgos y conteo final X🔴 Y🟡 Z🟢.
3. En `docs/audits/00_INDEX.md`: fila **A5 → ✅** con conteo de hallazgos.
4. Commit + push: `audit: A5 codigo-muerto — X🔴 Y🟡 Z🟢`.
5. Recordatorio: **no borrar nada** — la eliminación/consolidación sale del plan correctivo post-`99_CONSOLIDADO.md`.
