# 📚 Índice de Documentación - Rooftop Party

## 🎯 Guías por Caso de Uso

### "Quiero configurar todo desde cero"
→ **SETUP_GUIDE.md**

### "Necesito usar el panel de administración"
→ **ADMIN_GUIDE.md**

### "Quiero entender cómo funciona el proyecto"
→ **README.md**

---

## 📖 Documentos Disponibles

| Documento | Propósito | Audiencia |
|-----------|-----------|-----------|
| **README.md** | Visión general, características, setup rápido | Desarrolladores |
| **ADMIN_GUIDE.md** | Guía completa del panel admin y emails | Administradores |
| **SETUP_GUIDE.md** | Configuración paso a paso | DevOps / Desarrolladores |

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                    │
├─────────────────────────────────────────────────────────┤
│  /[slug]         → Página de evento público              │
│  /admin          → Panel de administración               │
│  /login          → Login de administradores              │
│  /cancel/[id]    → Cancelación de RSVP                   │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                    API ROUTES                            │
├─────────────────────────────────────────────────────────┤
│  /api/rsvp           → CRUD de RSVPs                     │
│  /api/events         → Gestión de eventos                │
│  /api/admin/*        → Endpoints administrativos         │
│  /api/auth/*         → Autenticación                     │
│  /api/cron/*         → Jobs programados                  │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│               BASE DE DATOS (Neon PostgreSQL)            │
├─────────────────────────────────────────────────────────┤
│  events    → Configuración de eventos                    │
│  rsvps     → Registros de asistencia                     │
│  users     → Usuarios administradores                    │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│               SERVICIOS EXTERNOS                         │
├─────────────────────────────────────────────────────────┤
│  Resend        → Envío de emails                         │
│  Vercel Cron   → Jobs programados (recordatorios)        │
└─────────────────────────────────────────────────────────┘
```

---

## ⚙️ Configuración Clave

### Variables de Entorno Requeridas

```env
DATABASE_URL=postgresql://...      # Neon PostgreSQL
RESEND_API_KEY=re_xxx              # API de Resend
FROM_EMAIL=noreply@tudominio.com   # Email remitente
NEXT_PUBLIC_APP_URL=https://...    # URL pública
CANCEL_TOKEN_SECRET=xxx            # Secret para tokens
CRON_SECRET=xxx                    # Secret para cron jobs
```

### Archivos de Configuración

| Archivo | Propósito |
|---------|-----------|
| `vercel.json` | Configuración de cron jobs |
| `drizzle.config.ts` | Configuración de Drizzle ORM |
| `event-config.json` | Configuración por defecto de eventos |

---

## 🔑 Funcionalidades Principales

### ✅ Implementadas

- [x] Sistema multi-evento con URLs dinámicas
- [x] Panel de administración completo
- [x] Gestión de usuarios y roles
- [x] Emails de confirmación (manuales y automáticos)
- [x] Recordatorios programados con cron
- [x] Exportación a PDF
- [x] Cancelación de RSVPs con token
- [x] Estadísticas en tiempo real
- [x] Filtros y búsqueda de RSVPs
- [x] OG Images dinámicas para compartir

### 📅 Por Implementar

- [ ] WhatsApp notifications
- [ ] Check-in con QR codes
- [ ] 2FA para admin
- [ ] Integración con calendarios

---

## 🎨 Personalización por Evento

Cada evento puede configurar:

| Aspecto | Campo en Config |
|---------|-----------------|
| Información básica | title, subtitle, date, time, location |
| Visual | backgroundImage, theme colors |
| Comportamiento | homeEventSlug (evento de inicio) |
| Emails | emailConfirmationEnabled, reminderEnabled, reminderScheduledAt |

---

## 🆘 Soporte Rápido

### Error de autenticación
→ Verificar usuario existe en DB

### Emails no se envían
→ Verificar RESEND_API_KEY y FROM_EMAIL verificado

### Recordatorios no funcionan
→ Verificar CRON_SECRET y que reminderScheduledAt < ahora

### RSVPs no se guardan
→ Verificar DATABASE_URL conecta correctamente

---

## 📞 Contacto

Para soporte técnico, revisar:
1. Logs de Vercel Functions
2. Base de datos Neon Console
3. Dashboard de Resend

---

**Última actualización:** Enero 2026
**Versión:** 2.0.0
