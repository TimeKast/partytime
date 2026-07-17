# 🎉 Rooftop Party - Sistema de Invitaciones para Eventos

Plataforma web profesional para gestión de invitaciones y RSVPs, diseñada con **Next.js 14**, **TypeScript**, y **Neon PostgreSQL** con **Drizzle ORM**. Incluye panel de administración completo, sistema de emails automáticos, y soporte multi-evento.

## ✨ Características Principales

### 🎨 Invitación Web
- **Diseño impactante** mobile-first con animaciones Framer Motion
- **Soporte multi-evento** - Cada evento tiene su URL única (`/mi-evento`)
- **Temas personalizables** - Colores, imágenes de fondo, información
- **Tres presentaciones públicas** - Clásica, moderna con información y solo imagen + RSVP
- **Campos públicos opcionales** - Título visible, subtítulo, fecha, hora, ubicación y detalles se omiten sin dejar espacios vacíos
- **Arte adaptable** - La imagen puede cubrir la pantalla o mostrarse completa, centrada o alineada arriba, sin recortes
- **OG Images dinámicas** para compartir en redes sociales

### 📊 Panel de Administración (`/admin`)
- **Dashboard completo** con estadísticas en tiempo real
- **Gestión de RSVPs** - Ver, editar, filtrar, buscar
- **Configuración de eventos** - Todo editable desde el panel
- **Gestión de usuarios** - Roles y permisos por evento
- **Ciclo de vida de contraseñas** - Cambio propio, reset administrativo temporal y recuperación por email
- **Envío de emails** - Individual o masivo
- **Exportación a PDF** - Lista de invitados

### 📧 Sistema de Emails (Resend)
- **Confirmación automática** al hacer RSVP (configurable por evento)
- **Recordatorios programados** - Fecha/hora configurable
- **Re-invitaciones** a quienes cancelaron
- **Templates HTML elegantes** con info del evento

### 👥 Sistema de Usuarios
- **Super Admin** - Acceso total a todos los eventos
- **Manager** - Gestiona eventos asignados
- **Viewer** - Solo lectura de eventos asignados
- **Cambio forzado** - Las contraseñas temporales deben reemplazarse al siguiente acceso
  mediante un diálogo bloqueante en el panel. Esta es hoy una barrera de cliente:
  las APIs autenticadas todavía no aplican globalmente `must_change_password`.
  Una compuerta de servidor/middleware sigue siendo el refuerzo pendiente.

### 🔄 Multi-Evento
- Cada evento tiene su propio **slug** URL
- RSVPs, configuración y emails **aislados por evento**
- **Evento de inicio** configurable

### 🖼️ Presentación pública por evento

- Los eventos existentes permanecen en modo **Clásica (compatibilidad)** hasta que un administrador los cambie.
- Los eventos nuevos usan **Moderna con información** por defecto; solo el slug y el nombre interno son obligatorios.
- **Solo imagen + RSVP** oculta título, datos, precio y cupo en la invitación pública, pero conserva la información poblada en administración, emails y exportaciones.
- El texto sobre el botón puede quedar vacío. El texto del botón RSVP es obligatorio y admite hasta 80 caracteres.
- El oscurecimiento del fondo acepta valores de 0% a 80%. Para artes con texto cerca de los bordes se recomienda **Mostrar imagen completa** (`contain`).
- Al usar **Solo imagen + RSVP** con **Mostrar imagen completa**, la alineación puede quedar **Centrada** (default compatible) o cambiarse a **Arriba**. En `cover`, clásica y moderna siempre permanece centrada.
- Precio y capacidad conservan sus toggles actuales; no aparecen cuando están desactivados.

---

## 🚀 Inicio Rápido

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

Crea `.env.local`:

```env
# Base de datos Neon PostgreSQL (REQUERIDO)
DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require

# Emails con Resend (REQUERIDO para emails)
RESEND_API_KEY=re_xxx
FROM_EMAIL=invitaciones@tudominio.com

# URL de la aplicación
NEXT_PUBLIC_APP_URL=https://tudominio.com

# Secret para tokens de cancelación
CANCEL_TOKEN_SECRET=tu-secret-aleatorio

# Secret para cron jobs (recordatorios automáticos)
CRON_SECRET=tu-cron-secret
```

### 3. Preparar la Base de Datos

No sincronices producción directamente desde el schema TypeScript. Las migraciones
se revisan y aplican como SQL versionado. Para una base local nueva, aplica
`drizzle/0000` a `drizzle/0007` en orden. Para producción, sigue obligatoriamente
[el runbook de migración](docs/PRODUCTION_MIGRATION_RUNBOOK.md); el registro histórico
requiere una línea base controlada antes de aplicar `0005`, `0006` y `0007`.

### 4. Crear Super Admin

```bash
npx ts-node scripts/create-super-admin.ts
```

### 5. Ejecutar en Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## 📦 Deploy en Vercel

### 1. Conectar Repositorio

1. Crea cuenta en [Vercel](https://vercel.com)
2. Importa tu repositorio de GitHub
3. Configura las variables de entorno

### 2. Variables de Entorno en Vercel

```
DATABASE_URL
RESEND_API_KEY
FROM_EMAIL
NEXT_PUBLIC_APP_URL
CANCEL_TOKEN_SECRET
CRON_SECRET
```

### 3. Cron Jobs (Recordatorios Automáticos)

El archivo `vercel.json` ya está configurado para ejecutar el cron cada 12 horas:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-reminders",
      "schedule": "0 */12 * * *"
    }
  ]
}
```

---

## 📊 API Endpoints

### Públicos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/rsvp` | Crear nuevo RSVP |
| GET | `/api/events/[slug]` | Info de evento público |
| POST | `/api/auth/forgot-password` | Solicitar recuperación (respuesta genérica) |
| POST | `/api/auth/reset-password` | Consumir enlace de un solo uso y elegir contraseña |

### Autenticados (Admin)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/rsvp?eventId=X` | Listar RSVPs de evento |
| GET | `/api/event-settings?eventId=X` | Configuración de evento |
| POST | `/api/admin/event-settings/update` | Actualizar configuración |
| POST | `/api/admin/send-email` | Enviar email individual |
| POST | `/api/admin/send-bulk-email` | Enviar emails masivos |
| GET | `/api/admin/users` | Listar usuarios |
| POST | `/api/events` | Crear nuevo evento |
| POST | `/api/auth/change-password` | Cambiar contraseña y cerrar las demás sesiones |
| POST | `/api/admin/users/[id]/reset-password` | Generar contraseña temporal (solo super_admin) |

### Cron

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/cron/send-reminders` | Enviar recordatorios programados |

---

## 🔧 Estructura del Proyecto

```
rooftop-party/
├── app/
│   ├── [slug]/              # Página dinámica de evento
│   ├── admin/               # Panel de administración
│   │   ├── page.tsx
│   │   └── components/
│   ├── api/
│   │   ├── rsvp/            # CRUD de RSVPs
│   │   ├── events/          # Gestión de eventos
│   │   ├── admin/           # Endpoints admin
│   │   ├── auth/            # Autenticación
│   │   └── cron/            # Jobs programados
│   ├── cancel/[rsvpId]/     # Página de cancelación
│   ├── login/               # Login admin
│   └── components/
├── lib/
│   ├── schema.ts            # Schema de base de datos
│   ├── queries.ts           # Queries de DB
│   ├── db.ts                # Conexión a Neon
│   ├── auth.ts              # Utilidades de auth
│   ├── email-template.ts    # Template de emails
│   └── resend.ts            # Cliente de Resend
├── types/
│   └── event.ts             # Tipos TypeScript
├── scripts/
│   └── create-super-admin.ts
├── event-config.json        # Configuración por defecto
├── vercel.json              # Configuración de cron
└── drizzle.config.ts
```

---

## ⚙️ Configuración de Emails por Evento

Cada evento puede configurar independientemente:

### 1. Email de Confirmación Automática
- **Toggle**: Activar/desactivar
- **Comportamiento**: Se envía automáticamente cuando alguien hace RSVP
- **Configurable desde**: Panel Admin → Config → Configuración de Emails

### 2. Recordatorio Programado
- **Toggle**: Activar/desactivar
- **Fecha/Hora**: Configurable con date picker
- **Comportamiento**: Cron job verifica cada 12 horas y envía si es momento
- **Destinatarios**: Solo RSVPs confirmados del evento específico
- **Anti-duplicado**: Campo `reminderSentAt` evita reenvíos

---

## 🔒 Seguridad

- **Autenticación por sesión** con cookies HTTP-only
- **Política de contraseñas**: 8 caracteres, máximo 72 bytes, al menos una mayúscula, una minúscula y un número; los símbolos son opcionales
- **Recuperación de un solo uso** con tokens aleatorios de 256 bits, hash SHA-256 en DB y expiración de 30 minutos
- **Revocación de sesiones**: cambio propio conserva solo la actual; resets cierran todas
- **Protección CSRF por Origin/Referer** en mutaciones autenticadas
- **Permisos por evento** para usuarios no super_admin
- **Tokens de cancelación** firmados con secret
- **Validación de cron** con `CRON_SECRET`
- **Rate limiting** recomendado para producción

---

## 💰 Costos Estimados

| Servicio | Plan | Costo |
|----------|------|-------|
| Vercel | Hobby | Gratis |
| Neon PostgreSQL | Free tier | Gratis (hasta 3GB) |
| Resend | Free tier | Gratis (3000 emails/mes) |

**Total: $0 USD** para eventos pequeños/medianos

---

## 📝 Changelog Reciente

### v2.0.0 (Enero 2026)
- ✅ Configuración de emails por evento
- ✅ Confirmación automática de RSVP (toggle)
- ✅ Recordatorios programados con fecha/hora
- ✅ Cron job para envío automático
- ✅ UI mejorada en panel de configuración

### v1.0.0
- Panel de administración completo
- Sistema multi-evento
- Gestión de usuarios y roles
- Emails con Resend
- Deploy en Vercel

---

## 🆘 Soporte

Para problemas o preguntas:
1. Revisa los logs en Vercel
2. Verifica las variables de entorno
3. Consulta `ADMIN_GUIDE.md` para el panel de admin

---

**¡Disfruta creando eventos increíbles! 🎉🎊✨**
