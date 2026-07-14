# 📧 Guía del Panel de Administración

## ✨ Funcionalidades del Panel Admin

### 1. Dashboard Principal (`/admin`)

Al iniciar sesión como administrador, verás:

- **Estadísticas en tiempo real**:
  - Total de RSVPs
  - Confirmados / Cancelados
  - RSVPs con +1
  - Emails enviados

- **Selector de evento** (si tienes acceso a múltiples eventos)

- **Tabla de RSVPs** con toda la información:
  - Nombre, Email, Teléfono
  - Estado (+1, confirmado, cancelado)
  - Historial de emails
  - Acciones (editar, enviar email)

- **Filtros y búsqueda**:
  - Por estado (confirmados, cancelados, todos)
  - Por +1 (con/sin acompañante)
  - Búsqueda por texto

### 2. Sistema de Emails

#### Envío Individual
1. En la tabla de RSVPs, haz clic en "📧 Enviar" junto al registro
2. El sistema envía email y registra en `emailHistory`

#### Envío Masivo
1. Aplica filtros para seleccionar destinatarios
2. Haz clic en "📧 Enviar a Todos (X)"
3. Confirma el envío

#### Tipos de Email Disponibles:
- **Confirmación**: Enviado al registrarse (si está habilitado)
- **Recordatorio**: Programable o manual
- **Re-invitación**: Para quienes cancelaron

### 3. Configuración del Evento

Accede haciendo clic en **"⚙️ Config"** en el header.

#### Información del Evento
- **Nombre interno del evento**: obligatorio; se usa en administración y exportaciones
- Título visible y subtítulo: opcionales
- Fecha, hora, ubicación y detalles: opcionales; los valores vacíos no crean filas ni espacios
- Imagen de fondo (URL)

#### Presentación pública

En **Config → Presentación pública** hay tres modos:

- **Clásica (compatibilidad)**: conserva el diseño original. Todos los eventos existentes permanecen en este modo por defecto.
- **Moderna con información**: diseño actual con únicamente los campos que tengan contenido. Es el modo inicial de eventos nuevos.
- **Solo imagen + RSVP**: muestra el arte y una superficie compacta con el botón o estado de RSVP; oculta los datos públicos, precio y cupo.

Controles adicionales:

- **Texto sobre el botón** puede quedar vacío.
- **Texto del botón RSVP** es obligatorio y admite entre 1 y 80 caracteres.
- **Oscurecimiento del fondo** va de 0% a 80%.
- **Ajuste de la imagen** permite `Cubrir pantalla` o `Mostrar imagen completa`. Usa la segunda opción cuando el arte tenga texto cerca de los bordes para evitar recortes en celular.
- **Alineación de la imagen completa** aparece únicamente con `Solo imagen + RSVP` y `Mostrar imagen completa`. `Centrada` conserva el comportamiento actual y es el default; usa `Arriba` cuando el CTA cubra contenido importante en la parte inferior del arte. La preferencia se conserva, pero se ignora en `Cubrir pantalla`, Clásica y Moderna.

El modo de presentación solo cambia la invitación pública. Los datos poblados continúan disponibles en emails, PDF y Excel. Los toggles de precio y capacidad siguen controlando si esos valores se muestran; la capacidad se continúa aplicando en servidor aunque el modo `Solo imagen + RSVP` oculte la fila.

#### Configuración de Emails ⭐ NUEVO

**Email de Confirmación Automática:**
- Toggle para activar/desactivar
- Cuando está activo: se envía email automáticamente al hacer RSVP
- Cuando está inactivo: los RSVPs se guardan sin enviar email

**Recordatorio Programado:**
- Toggle para activar/desactivar
- Selector de fecha y hora
- El sistema envía automáticamente cuando llega la hora programada
- Solo se envía una vez (campo `reminderSentAt` controla esto)
- Destinatarios: solo RSVPs confirmados del evento

### 4. Gestión de Usuarios

Solo visible para **Super Admins**:

- Ver lista de usuarios del sistema
- Roles disponibles:
  - **super_admin**: Acceso total a todo
  - **manager**: Gestiona eventos asignados
  - **viewer**: Solo lectura

---

## 🔧 Configuración Inicial

### Paso 1: Variables de Entorno en Vercel

Ve a tu proyecto en Vercel → Settings → Environment Variables:

```bash
# Base de datos
DATABASE_URL=postgresql://...

# Emails (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=noreply@tudominio.com

# Seguridad
CANCEL_TOKEN_SECRET=un-string-aleatorio-muy-largo-y-seguro
CRON_SECRET=otro-string-aleatorio-para-cron

# URL Pública
NEXT_PUBLIC_APP_URL=https://tu-dominio.vercel.app
```

### Paso 2: Crear Super Admin

```bash
npx ts-node scripts/create-super-admin.ts
```

O crear directamente en la base de datos con el schema correcto.

### Paso 3: Redeploy

```bash
git commit --allow-empty -m "Trigger redeploy"
git push
```

---

## 📖 Cómo Usar

### Acceder al Panel

1. Ve a: `https://tu-dominio.vercel.app/admin`
2. Ingresa usuario y contraseña
3. Selecciona el evento a gestionar

### Configurar Emails Automáticos

1. Ve a **Config** → sección "Configuración de Emails"
2. **Confirmación automática**: activa el toggle
3. **Recordatorio**: activa el toggle y selecciona fecha/hora
4. Haz clic en **"Guardar Configuración"**

### Enviar Emails Manualmente

**Individual:**
1. Encuentra el RSVP en la tabla
2. Haz clic en "📧 Enviar"

**Masivo:**
1. Usa filtros para seleccionar grupo
2. Haz clic en "📧 Enviar a Todos"
3. Confirma la acción

### Exportar Lista de Invitados

1. Haz clic en "📄 PDF" en la barra de acciones
2. Se descarga automáticamente un PDF con todos los RSVPs

---

## 🔄 Sistema de Recordatorios Automáticos

### Cómo Funciona

1. **Configuración**: En el panel, activas recordatorio y pones fecha/hora
2. **Cron Job**: Vercel ejecuta `/api/cron/send-reminders` cada 12 horas
3. **Verificación**: El sistema busca eventos donde:
   - `reminderEnabled = true`
   - `reminderScheduledAt <= ahora`
   - `reminderSentAt IS NULL` (no enviado aún)
4. **Envío**: Para cada evento que cumple, envía a todos los confirmados
5. **Marcado**: Actualiza `reminderSentAt` para evitar reenvíos

### Frecuencia del Cron

Configurado en `vercel.json`:
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
= Cada 12 horas (00:00 y 12:00 UTC)

### Probar Manualmente

```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" \
  https://tu-dominio.vercel.app/api/cron/send-reminders
```

---

## 📊 Tracking de Emails

En la base de datos, cada RSVP tiene:

```typescript
{
  emailSent: "2024-11-04T12:00:00Z",  // Último email enviado
  emailHistory: [                      // Historial completo
    {
      sentAt: "2024-11-04T12:00:00Z",
      type: "confirmation"
    },
    {
      sentAt: "2024-11-05T09:00:00Z",
      type: "reminder"
    }
  ],
  cancelToken: "token_para_cancelar"
}
```

---

## 🎨 Personalización del Email

Edita `lib/email-template.ts` para:
- Cambiar colores del template
- Modificar textos y mensajes
- Ajustar diseño HTML
- Agregar información adicional

---

## 🔒 Seguridad

- **Tokens únicos**: Cada RSVP tiene token de cancelación único
- **Validación en servidor**: Tokens verificados con `CANCEL_TOKEN_SECRET`
- **Sesiones seguras**: Cookies HTTP-only
- **Permisos por evento**: Usuarios solo ven eventos asignados

---

## 🐛 Troubleshooting

### "No autorizado" en /admin
- Verifica credenciales en la base de datos
- Asegúrate de tener un usuario creado
- Verifica que la sesión no haya expirado

### Emails no se envían
- Verifica `RESEND_API_KEY` en Vercel
- Revisa que `FROM_EMAIL` esté verificado en Resend
- Chequea logs de Vercel Functions

### Recordatorios no se envían
- Verifica `CRON_SECRET` en Vercel
- Asegúrate que la fecha del recordatorio ya pasó
- Revisa que `reminderSentAt` sea NULL
- Chequea logs del cron en Vercel

### Link de cancelación no funciona
- Verifica `NEXT_PUBLIC_APP_URL` esté correcto
- El token debe coincidir exactamente

---

## 📝 Notas Importantes

1. **Resend límites gratis**: 3000 emails/mes, 100 emails/día
2. **FROM_EMAIL**: Usa dominio verificado para mejor deliverability
3. **CANCEL_TOKEN_SECRET**: String largo y aleatorio
4. **Cron jobs**: Solo funcionan en Vercel (no en desarrollo local)

---

## 🚀 Funcionalidades Futuras

- [ ] 2FA para admin dashboard
- [ ] Integración con calendario (iCal)
- [ ] Webhooks de Resend para tracking opens/clicks
- [ ] WhatsApp notifications (Twilio)
- [ ] Check-in con QR codes

---

¿Dudas? Revisa los logs en Vercel o el código fuente.
