# 🎉 Guía de Deploy - Rooftop Party

## 🌐 Deploy en Vercel

### Paso 1: Preparar Repositorio

Asegúrate de tener el código en GitHub:

```bash
git add .
git commit -m "Ready for deploy"
git push origin main
```

### Paso 2: Conectar con Vercel

1. Ve a [vercel.com](https://vercel.com)
2. "New Project"
3. Importa tu repositorio de GitHub
4. Framework: **Next.js** (auto-detectado)

### Paso 3: Variables de Entorno

En Vercel → Settings → Environment Variables:

| Variable | Valor | Requerido |
|----------|-------|-----------|
| `DATABASE_URL` | Connection string de Neon | ✅ |
| `RESEND_API_KEY` | API key de Resend | ✅ |
| `FROM_EMAIL` | Email verificado en Resend | ✅ |
| `CANCEL_TOKEN_SECRET` | String aleatorio largo | ✅ |
| `CRON_SECRET` | String aleatorio largo | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL de tu app en Vercel | ✅ |

### Paso 4: Deploy

Vercel desplegará automáticamente al detectar el repositorio.

---

## ✅ Verificar Deploy

### URLs a probar:

1. **Página de evento:**
   ```
   https://tu-app.vercel.app/mi-evento
   ```

2. **Panel admin:**
   ```
   https://tu-app.vercel.app/admin
   ```

3. **API de salud:**
   ```
   https://tu-app.vercel.app/api/events/mi-evento
   ```

### Checklist post-deploy:

- [ ] La página del evento carga
- [ ] El formulario RSVP funciona
- [ ] El login de admin funciona
- [ ] Los emails se envían correctamente
- [ ] El cron job aparece en Vercel Settings

---

## ⏰ Cron Jobs

El archivo `vercel.json` ya configura el cron:

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

**Frecuencia:** Cada 12 horas (00:00 y 12:00 UTC)

### Verificar en Vercel:
1. Settings → Cron Jobs
2. Debe aparecer `/api/cron/send-reminders`

### Probar manualmente:
```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" \
  https://tu-app.vercel.app/api/cron/send-reminders
```

---

## 🔄 Actualizaciones

Cada push a `main` despliega automáticamente:

```bash
git add .
git commit -m "Mis cambios"
git push
```

### Trigger redeploy manual:
```bash
git commit --allow-empty -m "Redeploy"
git push
```

---

## 🐛 Troubleshooting

### Build falla
- Revisa logs de build en Vercel
- Verifica `npm run build` localmente
- Chequea errores de TypeScript

### Variables de entorno no funcionan
- Verifica que estén en el ambiente correcto (Production)
- Haz redeploy después de agregarlas
- No uses comillas en los valores (excepto si tienen caracteres especiales)

### Emails no se envían
- Verifica `RESEND_API_KEY` en Vercel
- Revisa que `FROM_EMAIL` esté verificado
- Chequea logs de Functions en Vercel

### Cron no ejecuta
- Solo funciona en producción (no en preview)
- Verifica `CRON_SECRET` configurado
- Revisa logs del endpoint cron

---

## 📊 Monitoreo

### Vercel Dashboard
- Deployments: historial de deploys
- Functions: logs de API routes
- Analytics: tráfico y performance
- Cron Jobs: ejecuciones programadas

### Neon Console
- Queries: actividad de base de datos
- Storage: uso de espacio
- Branches: si usas branching

### Resend Dashboard
- Emails: historial de envíos
- Bounces: emails rechazados
- Opens/Clicks: engagement

---

## 🎯 URLs de tu Aplicación

Después del deploy exitoso:

| Recurso | URL |
|---------|-----|
| App | `https://tu-app.vercel.app` |
| Admin | `https://tu-app.vercel.app/admin` |
| API RSVPs | `https://tu-app.vercel.app/api/rsvp` |
| API Events | `https://tu-app.vercel.app/api/events/[slug]` |

---

## 🔒 Seguridad Post-Deploy

- [ ] Cambiar secrets si fueron expuestos
- [ ] Verificar que `/admin` requiere login
- [ ] Probar que tokens de cancelación funcionan
- [ ] Verificar que cron requiere `CRON_SECRET`

---

**¡Tu aplicación está lista para recibir RSVPs! 🎉**
