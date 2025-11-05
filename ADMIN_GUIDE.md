# 📧 Sistema de Emails y Admin Dashboard

## ✨ Nuevas funcionalidades

### 1. Admin Dashboard (`/admin`)
- **Login protegido** con usuario y contraseña
- **Tabla completa** de RSVPs con toda la información
- **Filtros avanzados**: por estado, +1, búsqueda por texto
- **Estadísticas en tiempo real**: total, confirmados, cancelados, con +1, emails enviados
- **Envío de emails**: individual o masivo
- **Tracking**: ver quién ya recibió email de confirmación

### 2. Sistema de Emails
- **Emails HTML profesionales** con diseño del evento
- **Información personalizada**: nombre, +1, detalles del evento
- **Botón de cancelación** seguro con token único
- **Resend integration**: 3000 emails gratis/mes

### 3. Cancelación pública (`/cancel/[rsvpId]?token=xxx`)
- Página para que usuarios cancelen desde el email
- **Token seguro**: validación en servidor
- **UX friendly**: confirmación y mensajes claros

---

## 🔧 Configuración en Vercel

### Paso 1: Configurar Resend

1. Crea una cuenta en [Resend](https://resend.com)
2. Verifica tu dominio (o usa el dominio de prueba `onboarding@resend.dev`)
3. Copia tu API Key

### Paso 2: Variables de entorno en Vercel

Ve a tu proyecto en Vercel → Settings → Environment Variables y agrega:

```bash
# Admin Dashboard
ADMIN_USERNAME=tu_usuario_admin
ADMIN_PASSWORD=tu_password_seguro_123

# Resend Email
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=noreply@tudominio.com

# Security
CANCEL_TOKEN_SECRET=un-string-aleatorio-muy-largo-y-seguro-123456

# Public URL
NEXT_PUBLIC_APP_URL=https://tu-dominio.vercel.app
```

### Paso 3: Redeploy

Después de agregar las variables, haz un redeploy desde Vercel Dashboard o push un commit vacío:

```bash
git commit --allow-empty -m "Trigger redeploy with new env vars"
git push
```

---

## 📖 Cómo usar

### Acceder al Admin Dashboard

1. Ve a: `https://tu-dominio.vercel.app/admin`
2. Ingresa usuario y contraseña configurados en Vercel
3. Verás la tabla completa de RSVPs

### Enviar emails de confirmación

**Individual:**
1. En la tabla, click en "📧 Enviar" junto al RSVP
2. El sistema enviará el email y registrará el envío

**Masivo:**
1. Usa los filtros para seleccionar a quién enviar
2. Click en "📧 Enviar a Todos (X)"
3. Confirma el envío masivo

### Cancelar asistencia (para usuarios)

Los usuarios reciben un email con:
- Detalles del evento
- Su información (+1 si confirmaron)
- **Botón "Cancelar mi asistencia"**

Al hacer click:
1. Van a `/cancel/[id]?token=xxx`
2. Confirman la cancelación
3. Su status cambia a "cancelled" en Firestore

---

## 🎨 Personalización del email

Edita `lib/email-template.ts` para:
- Cambiar colores
- Modificar textos
- Ajustar diseño HTML
- Agregar más información

---

## 🔒 Seguridad

- **Tokens únicos**: Cada RSVP tiene un token de cancelación único
- **Validación en servidor**: Los tokens se validan contra el email y ID
- **Auth Basic**: Admin dashboard usa HTTP Basic Auth
- **SessionStorage**: Credenciales solo en sesión del navegador

---

## 📊 Tracking de emails

En Firestore, cada RSVP ahora tiene:

```typescript
{
  emailSent: "2024-11-04T12:00:00Z",  // Último email enviado
  emailHistory: [                      // Historial completo
    {
      sentAt: "2024-11-04T12:00:00Z",
      type: "confirmation"
    }
  ],
  cancelToken: "base64_encoded_token"  // Token para cancelar
}
```

---

## 🐛 Troubleshooting

### "No autorizado" en /admin
- Verifica que ADMIN_USERNAME y ADMIN_PASSWORD estén en Vercel
- Redeploy después de agregar las variables

### Emails no se envían
- Verifica RESEND_API_KEY en Vercel
- Revisa que FROM_EMAIL esté verificado en Resend
- Chequea los logs de Vercel Runtime

### Link de cancelación no funciona
- Verifica NEXT_PUBLIC_APP_URL esté correctamente configurado
- El token debe coincidir exactamente con el generado

### RSVPs antiguos sin campo plusOne
- No hay problema, el código maneja RSVPs sin el campo
- En Google Sheets aparecerán como "No"

---

## 📝 Notas importantes

1. **Resend límites gratis**: 3000 emails/mes, 100 emails/día
2. **FROM_EMAIL**: Usa tu dominio verificado para mejor deliverability
3. **CANCEL_TOKEN_SECRET**: Usa un string largo y aleatorio para seguridad
4. **Sesiones admin**: Se guardan en sessionStorage (se pierden al cerrar navegador)

---

## 🚀 Próximos pasos opcionales

- [ ] Agregar 2FA al admin dashboard
- [ ] Exportar RSVPs a CSV desde el dashboard
- [ ] Emails de recordatorio automáticos (X días antes del evento)
- [ ] Integración con calendario (iCal attachments)
- [ ] Webhooks de Resend para tracking de opens/clicks

---

¿Dudas? Revisa los archivos de código fuente o contacta al desarrollador.
