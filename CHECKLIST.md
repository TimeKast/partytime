# ✅ Checklist de Configuración - Rooftop Party

## 🚀 Setup Inicial

### Base de Datos
- [ ] Crear cuenta en [Neon](https://neon.tech)
- [ ] Crear nuevo proyecto
- [ ] Copiar connection string
- [ ] Agregar `DATABASE_URL` a `.env.local`
- [ ] Ejecutar `npx drizzle-kit push`

### Emails
- [ ] Crear cuenta en [Resend](https://resend.com)
- [ ] Crear API key
- [ ] (Opcional) Verificar dominio propio
- [ ] Agregar `RESEND_API_KEY` a `.env.local`
- [ ] Agregar `FROM_EMAIL` a `.env.local`

### Seguridad
- [ ] Generar `CANCEL_TOKEN_SECRET`
- [ ] Generar `CRON_SECRET`
- [ ] Agregar ambos a `.env.local`

### Admin
- [ ] Ejecutar `npx ts-node scripts/create-super-admin.ts`
- [ ] Verificar login en `/admin`

---

## ☁️ Deploy en Vercel

### Preparación
- [ ] Repositorio en GitHub
- [ ] Cuenta en Vercel

### Variables de Entorno
- [ ] `DATABASE_URL`
- [ ] `RESEND_API_KEY`
- [ ] `FROM_EMAIL`
- [ ] `CANCEL_TOKEN_SECRET`
- [ ] `CRON_SECRET`
- [ ] `NEXT_PUBLIC_APP_URL`

### Verificación
- [ ] Deploy exitoso
- [ ] URL pública funciona
- [ ] Panel admin accesible
- [ ] Cron jobs configurados

---

## 🎉 Crear Nuevo Evento

### Desde el Panel Admin
- [ ] Login en `/admin`
- [ ] Crear nuevo evento
- [ ] Configurar información básica
- [ ] Subir imagen de fondo (URL)
- [ ] Activar evento

### Configuración de Emails
- [ ] Decidir: ¿email automático al RSVP?
- [ ] Decidir: ¿recordatorio programado?
- [ ] Configurar fecha/hora del recordatorio
- [ ] Guardar configuración

---

## ✔️ Testing Pre-Lanzamiento

### Flujo de Usuario
- [ ] Abrir URL del evento
- [ ] Formulario RSVP visible
- [ ] Enviar RSVP de prueba
- [ ] Verificar confirmación
- [ ] (Si activo) Email de confirmación llegó
- [ ] Probar link de cancelación

### Panel Admin
- [ ] Login funciona
- [ ] RSVPs aparecen en tabla
- [ ] Filtros funcionan
- [ ] Envío de email manual funciona
- [ ] Exportar PDF funciona

### Mobile
- [ ] Diseño responsive correcto
- [ ] Formulario usable en touch
- [ ] Sin scroll horizontal

---

## 📧 Checklist de Emails

### Confirmación Automática
- [ ] Toggle activado en config
- [ ] Probar: nuevo RSVP → email llega
- [ ] Template se ve bien
- [ ] Link de cancelación funciona

### Recordatorio Programado
- [ ] Toggle activado en config
- [ ] Fecha/hora configurada
- [ ] `CRON_SECRET` en Vercel
- [ ] Esperar ejecución o probar manual

---

## 🔒 Seguridad

### Verificaciones
- [ ] `.env.local` NO está en git
- [ ] Secrets son strings aleatorios largos
- [ ] FROM_EMAIL verificado en Resend
- [ ] Solo admins acceden a `/admin`

---

## 📊 Post-Lanzamiento

### Monitoreo
- [ ] Revisar RSVPs diariamente
- [ ] Verificar logs de Vercel
- [ ] Monitorear envío de emails en Resend

### Antes del Evento
- [ ] Exportar lista final de invitados
- [ ] Verificar todos los emails enviados
- [ ] Desactivar RSVP si es necesario

---

## 💡 Tips

1. **Siempre probar en mobile** antes de compartir
2. **Crear RSVP de prueba** y verificar todo el flujo
3. **Revisar spam** si los emails no llegan
4. **Backup de RSVPs** antes del evento

---

**Fecha:** ____________  
**Evento:** ____________  
**Status:** ⬜ Pendiente / ✅ Listo
