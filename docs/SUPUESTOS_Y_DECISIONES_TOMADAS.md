# 📋 Fase 0: Supuestos y Decisiones Tomadas

> **Fecha:** 2026-03-03  
> **Propósito:** Documentar hallazgos, supuestos, decisiones y puntos ambiguos detectados tras el análisis exhaustivo del repositorio.  
> **Fuente de verdad:** Código fuente del repositorio (`partytime/`)

---

## 1. Hallazgos: Lo que está claramente definido

### 1.1 Producto

| Aspecto | Estado | Fuente |
|---------|--------|--------|
| Tipo de app | Plataforma de invitaciones a eventos con RSVP | `README.md`, `PROJECT_SUMMARY.md` |
| Nombre del producto | **Party Time!** (anteriormente "Rooftop Party") | `app/layout.tsx`, `package.json` |
| Público objetivo | Organizadores de eventos privados/corporativos | `PROJECT_SUMMARY.md` |
| Stack | Next.js 14 (App Router) + TypeScript + Drizzle ORM + Neon PostgreSQL | `package.json`, `lib/db.ts` |
| Estado | v2.0.0 — Producción Ready | `PROJECT_SUMMARY.md` |
| Hosting | Vercel (Hobby plan gratuito) | `vercel.json`, `README.md` |

### 1.2 Modelo de Datos (Drizzle ORM)

**6 tablas identificadas en `lib/schema.ts`:**

| Tabla | Propósito | Campos clave |
|-------|-----------|-------------|
| `events` | Eventos principales | slug, title, theme (JSONB), pricing, capacity, RSVP closed, email config, OG image |
| `rsvps` | Confirmaciones de asistentes | name, email, phone, plusOne, status, cancelToken, emailHistory (JSONB) |
| `app_settings` | Configuración global (key-value) | id (key), value |
| `users` | Usuarios del sistema admin | email, passwordHash, role, isActive, invitedBy |
| `user_sessions` | Sesiones de auth persistentes | token, expiresAt, userAgent, ipAddress |
| `user_event_assignments` | Asignación de eventos a usuarios | userId, eventId, role (manager/viewer) |

### 1.3 RBAC - Sistema de Roles

| Rol | Permisos verificados en código |
|-----|-------------------------------|
| `super_admin` | Acceso total. Crear eventos, gestionar usuarios, acceso a todos los eventos |
| `manager` | Gestionar RSVPs y configuración de eventos asignados |
| `viewer` | Solo lectura de eventos asignados |

### 1.4 Autenticación

- **Mecanismo:** Sessions basadas en cookies HTTP-only (`rp_session`)
- **Passwords:** bcrypt con 12 rounds (`lib/auth-utils.ts`)
- **Session duration:** 24h default, 30 días con "Remember me"
- **Super admin fallback:** Login via env vars `ADMIN_USERNAME`/`ADMIN_PASSWORD`
- **No hay middleware de Next.js:** La validación se hace por endpoint en cada API route

### 1.5 API Surface

**~20+ endpoints identificados:**

| Categoría | Endpoints | Auth |
|-----------|-----------|------|
| **Auth** | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Público / Sesión |
| **RSVP (público)** | `POST /api/rsvp` | Público |
| **RSVP (admin)** | `GET /api/rsvp?eventId=X`, `POST /api/rsvp/update`, `POST /api/rsvp/cancel` | Sesión |
| **Events** | `GET /api/events`, `POST /api/events`, `GET /api/events/[slug]` | Sesión / Público |
| **Admin** | send-email, send-bulk-email, send-bulk-reminder, update-rsvp, upload-image, settings, users, validate, reminder-status, event-settings, add-demo-data | Sesión (super_admin/manager) |
| **Cron** | `GET /api/cron/send-reminders` | CRON_SECRET |

### 1.6 Flujos Confirmados

1. **RSVP público:** Visitante → `/[slug]` → botón "Confirmar Asistencia" → modal RSVP → POST `/api/rsvp` → email confirmación (si habilitado)
2. **Cancelación:** Guest recibe email con link → `/cancel/[rsvpId]?token=X` → ver RSVP → editar o cancelar
3. **Admin:** Login → seleccionar evento → dashboard con RSVPs → acciones (email, editar, filtrar, exportar PDF/Excel)
4. **Recordatorios auto:** Cron (cada 12h) → busca eventos con `reminderEnabled && reminderScheduledAt <= now && !reminderSentAt` → envía a confirmados

---

## 2. Lo que necesita inferirse

### 2.1 Flujos no documentados pero deducibles del código

| Flujo | Inferencia | Fuente |
|-------|-----------|--------|
| **Creación de evento** | Solo super_admin puede crear. Se hace desde el admin panel. Requiere slug + título mínimo | `POST /api/events` |
| **Edición de slug** | Existe flujo de rename que actualiza RSVPs asociados | `AdminDashboard.saveNewSlug()`, `queries.updateEventSlug()` |
| **Upload de imágenes** | Background + OG image vía Vercel Blob | `POST /api/admin/upload-image` |
| **Asignación de eventos** | Super admin asigna eventos a users con rol manager/viewer | `UserManagement.handleAssignEvent()` |
| **"Set as Home"** | Un evento puede ser marcado como "inicio" via `app_settings('home_event_id')` | `AdminDashboard.setAsHome()` |
| **Exportación** | PDF (informativo con jsPDF) y Excel (con xlsx) | `AdminDashboard.exportInformativeList()`, `exportExcelList()` |
| **RSVP Closed** | El admin puede cerrar RSVPs por evento mostrando un mensaje custom | `events.rsvpClosed`, `events.rsvpClosedMessage` |
| **Reactivar cancelados** | Se puede cambiar status de cancelled → confirmed desde admin, y enviar "re-invitation" | `AdminDashboard.toggleStatus()` |

### 2.2 Permisos granulares (inferidos del código)

| Acción | super_admin | manager | viewer |
|--------|:-----------:|:-------:|:------:|
| Ver todos los eventos | ✅ | ❌ (solo asignados) | ❌ (solo asignados) |
| Crear evento | ✅ | ❌ | ❌ |
| Editar config de evento | ✅ | ✅ (asignados) | ❌ |
| Ver RSVPs | ✅ | ✅ (asignados) | ✅ (asignados) |
| Enviar emails | ✅ | ✅ (asignados) | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ |
| Upload imágenes | ✅ | ✅ | ❌ |
| Exportar PDF/Excel | ✅ | ✅ | ✅ |
| Eliminar eventos | ✅ | ❌ | ❌ |

> **Nota:** La columna viewer es inferida; algunas acciones no tienen validación explícita por rol en el backend — se controlan en el frontend.

---

## 3. Ambigüedades e Inconsistencias Detectadas

### 3.1 Firestore coexistiendo con Drizzle/Neon

- **`lib/firestore.ts`** (527 líneas) contiene una implementación completa de Firebase Admin SDK para RSVPs, events y settings.
- **`lib/queries.ts`** + **`lib/db.ts`** usa Drizzle ORM con Neon PostgreSQL.
- **`lib/config.ts`** menciona "leer desde Firestore" en comentarios.
- **Decisión tomada:** Documentar Drizzle/Neon como la implementación activa. Firestore se tratará como **código legacy no utilizado** pendiente de limpieza.

### 3.2 Discrepancia en conteo de tablas

- `PROJECT_SUMMARY.md` dice **"Tablas en DB: 3"** pero en realidad hay **6** (`events`, `rsvps`, `app_settings`, `users`, `user_sessions`, `user_event_assignments`).
- **Decisión tomada:** Documentar las 6 tablas reales.

### 3.3 Nombre del producto

- `package.json`: `"name": "rooftop-party-invitation"`
- `app/layout.tsx`: `"Party Time!"`
- `PROJECT_SUMMARY.md` / `README.md`: "Rooftop Party"
- `event-config.json`: `"title": "Party Time!"`
- **Decisión tomada:** Usar **"Party Time!"** como nombre oficial del producto. "Rooftop Party" es el nombre original del proyecto.

### 3.4 Validaciones frontend vs backend

- El RSVP modal valida nombre, email, teléfono en frontend.
- El backend (`POST /api/rsvp`) también valida, pero no hay schema validation library (zod, etc.).
- No hay validación CSRF.
- **Decisión tomada:** Documentar las validaciones existentes y marcar la falta de CSR/schema validation como un gap de seguridad.

### 3.5 eventId en RSVPs referencia al slug, no al ID

- `rsvps.eventId` almacena el **slug** del evento en la mayoría de los flujos (no el UUID).
- `updateEventSlug()` actualiza RSVPs al cambiar slug, confirmando esta referencia.
- No hay un FK constraint real en la DB.
- **Decisión tomada:** Documentar como diseño deliberado. Marcar falta de FK como riesgo de integridad.

### 3.6 Auth dual: env vars + database

- Super admin puede loguearse con env vars (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) — esto crea un session con `userId: 'super_admin_env'`.
- También puede haber un super_admin en la tabla `users`.
- **Decisión tomada:** Documentar ambos mecanismos. El env-based es un bootstrap/fallback.

---

## 4. Vacíos Detectados (Gaps)

### 4.1 Seguridad

| Gap | Impacto | Prioridad |
|-----|---------|-----------|
| No hay middleware de Next.js para auth | Cada API route hace su propia validación — riesgo de olvidar protección | Alto |
| No hay rate limiting | Público puede hacer brute force en login o spam RSVPs | Alto |
| No hay CSRF protection | Requests cross-site podrían funcionar | Medio |
| No hay schema validation (Zod/Yup) | Inputs no se validan estructuralmente | Medio |
| `CANCEL_TOKEN_SECRET` tiene fallback a `'default-secret'` | Si no se configura, los tokens son predecibles | Alto |
| No hay logging de auditoría | Acciones admin no dejan trail | Medio |
| Passwords de admin en env vars | Texto plano en dashboard de Vercel | Bajo (aceptable para bootstrap) |

### 4.2 Infraestructura

| Gap | Descripción |
|-----|-------------|
| No hay tests (unit/integration/e2e) | Ni carpeta de tests existe |
| No hay CI/CD pipeline definido | No hay `.github/workflows/` |
| No hay health check endpoint | No se puede monitorear status de la app/DB |
| No hay error boundary global de la app | Solo el RSVP modal y pages individuales manejan errores |
| No hay backup strategy documentada | Neon tiene snapshots, pero no está documentado |
| No hay `format` ni `typecheck` scripts en `package.json` | Solo `lint` está configurado |

### 4.3 Funcional

| Gap | Descripción |
|-----|-------------|
| No hay delete de RSVPs | Solo cancelación (soft). No se puede eliminar un registro |
| No hay paginación en listas | RSVPs y eventos se cargan todos a la vez |
| No se eliminan sesiones de usuarios desactivados | Sesiones viejas podrían seguir activas |
| No hay capacidad de "copiar/duplicar" un evento | Feature útil que no existe |
| No hay historial de cambios en eventos | No se registra quién editó qué |
| Idioma mezclado | Código en inglés, UI/mensajes en español. Algunos errores API en español, otros en inglés |
| `displayTitle` vs `title` | Dos campos de título con lógica condicional poco clara para nuevos desarrolladores |

### 4.4 Documentación Existente

| Documento | Estado | Problemas detectados |
|-----------|--------|---------------------|
| `README.md` | ✅ Bueno | Bastante completo, pero le faltan nuevos endpoints y las tablas de users |
| `PROJECT_SUMMARY.md` | ⚠️ Desactualizado | Dice 3 tablas (son 6), métricas incorrectas |
| `ADMIN_GUIDE.md` | ✅ Bueno | Bien enfocado en operación del panel |
| `SETUP_GUIDE.md` | No analizado en detalle | Puede estar desactualizado |
| `INDEX.md` | No analizado en detalle | Puede estar desactualizado |
| `/docs/` | ❌ No existe | Directorio por crear |

---

## 5. Supuestos por Área

### 5.1 Producto

- **Supuesto:** La app se usa exclusivamente en español mexicano (es-MX). No hay internacionalización.
- **Supuesto:** El target son eventos presenciales (fiestas, corporativos, bodas).
- **Supuesto:** El nombre oficial del producto es "Party Time!", no "Rooftop Party".

### 5.2 Backend

- **Supuesto:** Firestore (`lib/firestore.ts`) es código legacy y NO se usa en producción actualmente. Drizzle/Neon es el backend activo.
- **Supuesto:** No hay otros microservicios o backends — todo es self-contained en este repo.
- **Supuesto:** El campo `eventId` en RSVPs almacena el slug del evento, no el UUID, por diseño original.

### 5.3 Base de Datos

- **Supuesto:** No hay FK constraints definidas en el schema (Drizzle allows this). Las relaciones son lógicas, no físicas.
- **Supuesto:** No hay soft-delete para RSVPs — la cancelación cambia status a 'cancelled'.
- **Decisión vigente:** Producción usa SQL de migración versionado y verificado;
  la sincronización directa desde el schema quedó retirada por no ofrecer una
  línea base histórica auditable.

### 5.4 Auth y Roles

- **Supuesto:** El primer super_admin se crea vía script (`scripts/create-super-admin.ts`) o env vars.
- **Supuesto:** No hay auto-registro — todos los usuarios son invitados por un super_admin.
- **Supuesto:** Los permisos que no están validados en el backend pero sí en el frontend representan un gap, no un diseño intencional.

### 5.5 Email

- **Supuesto:** Se usa Resend como único proveedor de email. No hay fallback.
- **Supuesto:** Los templates de email están hardcodeados en `lib/email-template.ts`. No son editables por el admin.
- **Supuesto:** Los emails de confirmación automática solo se envían si la feature está activa a nivel de evento.

### 5.6 UI/UX

- **Supuesto:** La app es mobile-first. El admin panel NO es responsive (desktop-only asumido).
- **Supuesto:** El admin dashboard monolítico (2600 líneas) es un design debt conocido, con refactorización parcial en componentes extraídos.
- **Supuesto:** Los temas de eventos afectan la página pública y los emails, no el admin panel.

---

## 6. Decisiones Tomadas para Documentación

| # | Decisión | Justificación |
|---|----------|---------------|
| D1 | Documentar Drizzle/Neon como la única capa de datos activa | Firestore es legacy no utilizado |
| D2 | Documentar 6 tablas reales (no 3 como dice PROJECT_SUMMARY) | Verificado en `lib/schema.ts` |
| D3 | Usar "Party Time!" como nombre de producto | Es el nombre en UI, layout, y config |
| D4 | Marcar la falta de FK constraints como riesgo, no como bug | Es una decisión de diseño de Drizzle, pero con riesgos |
| D5 | Documentar la matriz de permisos inferida del código | No existe documentación explícita de RBAC |
| D6 | Tratar el admin panel como desktop-only | No hay evidencia de diseño responsive en CSS modules del admin |
| D7 | Idioma de documentación: español | La app y la documentación existente están en español |
| D8 | Crear `/docs/` como directorio principal de documentación | No existe actualmente, es el estándar indicado en el plan |

---

## 7. Preguntas Bloqueantes

> Se identifican las siguientes preguntas que NO se pueden inferir razonablemente del código:

**Ninguna.**

Toda la información necesaria ha sido inferida del código y la documentación existente. Los supuestos declarados arriba cubren las áreas de incertidumbre. Si alguno de los supuestos es incorrecto, se puede corregir en fases posteriores sin impacto bloqueante.

---

## 8. Siguiente Paso

Con la Fase 0 completada, proceder a:

- **Fase 1:** Documentación funcional y de producto
  - Resumen ejecutivo, visión, personas, módulos, flujos, user stories, criterios de aceptación, reglas de negocio, RBAC, glosario

> ⚠️ La Fase 1 se basará en este documento como referencia de supuestos y decisiones. Si el usuario necesita corregir algún supuesto, debe hacerlo antes de Fase 1.
