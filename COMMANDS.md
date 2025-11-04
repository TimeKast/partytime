# 🔧 Comandos Útiles - Rooftop Party

## 🚀 Desarrollo

### Iniciar servidor de desarrollo
```bash
npm run dev
```
Abre: http://localhost:3000

### Build para producción
```bash
npm run build
```

### Iniciar en modo producción (después del build)
```bash
npm start
```

### Linting
```bash
npm run lint
```

---

## 📦 Deploy

### Vercel CLI - Deploy
```bash
# Instalar CLI (solo una vez)
npm i -g vercel

# Login
vercel login

# Deploy a preview
vercel

# Deploy a producción
vercel --prod
```

### Vercel - Variables de entorno
```bash
# Agregar variable
vercel env add COSMOS_ENDPOINT

# Listar variables
vercel env ls

# Remover variable
vercel env rm COSMOS_ENDPOINT
```

---

## 🗄️ Azure Cosmos DB

### Usando Azure CLI

```bash
# Login
az login

# Crear resource group
az group create --name rooftop-party-rg --location eastus

# Crear Cosmos DB account (Serverless)
az cosmosdb create \
  --name rooftop-party-db \
  --resource-group rooftop-party-rg \
  --capabilities EnableServerless \
  --default-consistency-level Session

# Obtener connection string
az cosmosdb keys list \
  --name rooftop-party-db \
  --resource-group rooftop-party-rg \
  --type connection-strings

# Crear base de datos
az cosmosdb sql database create \
  --account-name rooftop-party-db \
  --resource-group rooftop-party-rg \
  --name rooftop-party-db

# Crear container
az cosmosdb sql container create \
  --account-name rooftop-party-db \
  --database-name rooftop-party-db \
  --name rsvps \
  --partition-key-path "/email" \
  --resource-group rooftop-party-rg
```

---

## 📊 Consultas útiles a la API

### Obtener todos los RSVPs
```bash
# Local
curl http://localhost:3000/api/rsvp

# Producción
curl https://tu-app.vercel.app/api/rsvp
```

### Obtener estadísticas
```bash
curl http://localhost:3000/api/stats
```

### Crear un RSVP de prueba
```bash
curl -X POST http://localhost:3000/api/rsvp \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Test",
    "email": "juan@test.com",
    "phone": "+52 555 123 4567"
  }'
```

---

## 🔍 Debugging

### Ver logs en tiempo real (Vercel)
```bash
vercel logs
```

### Ver logs de una función específica
```bash
vercel logs /api/rsvp
```

### Ver logs en producción
```bash
vercel logs --prod
```

---

## 🎨 Personalización Rápida

### Cambiar colores del tema
Edita `app/globals.css`:
```css
:root {
  --primary-color: #FF1493;    /* Rosa neón */
  --secondary-color: #00FFFF;  /* Cyan */
  --accent-color: #FFD700;     /* Dorado */
  --bg-color: #1a0033;         /* Morado oscuro */
}
```

### Actualizar información del evento
Edita `event-config.json`:
```json
{
  "event": {
    "id": "nuevo-evento-2024",
    "title": "MI NUEVO EVENTO",
    "date": "VIERNES, 15 NOV",
    ...
  }
}
```

### Cambiar imagen de fondo
Reemplaza: `public/background.jpg`

---

## 🧹 Limpieza

### Limpiar node_modules y reinstalar
```bash
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

### Limpiar cache de Next.js
```bash
Remove-Item -Recurse -Force .next
npm run dev
```

---

## 📱 Testing en dispositivos

### Obtener IP local
```bash
ipconfig
# Busca "IPv4 Address" en tu adaptador de red WiFi
```

### Probar en mobile (misma red WiFi)
Abre en tu celular: `http://TU-IP:3000`

Ejemplo: `http://192.168.1.100:3000`

---

## 🔒 Seguridad

### Generar secret para Cron Jobs
```bash
# PowerShell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

### Agregar a .env.local
```env
CRON_SECRET=el-string-generado-arriba
```

---

## 📦 Backup de RSVPs

### Exportar desde Cosmos DB
```bash
# Usando Azure CLI
az cosmosdb sql container query \
  --account-name rooftop-party-db \
  --database-name rooftop-party-db \
  --container-name rsvps \
  --query-text "SELECT * FROM c" \
  --resource-group rooftop-party-rg > rsvps-backup.json
```

### O desde la API
```bash
curl https://tu-app.vercel.app/api/rsvp > rsvps-backup.json
```

---

## 🔄 Git

### Setup inicial
```bash
git init
git add .
git commit -m "Initial commit - Rooftop Party Invitation"
git branch -M main
git remote add origin https://github.com/tu-usuario/rooftop-party.git
git push -u origin main
```

### Crear un nuevo evento (branch)
```bash
git checkout -b evento-diciembre-2024
# Hacer cambios en event-config.json y public/
git add .
git commit -m "Configuración evento Diciembre 2024"
git push origin evento-diciembre-2024
```

---

## 📧 SendGrid Setup (Opcional)

### Instalar dependencia
```bash
npm install @sendgrid/mail
```

### Configurar
```env
# .env.local
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
FROM_EMAIL=noreply@tudominio.com
```

### Test email
```typescript
// test-email.ts
import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

await sgMail.send({
  to: 'test@example.com',
  from: process.env.FROM_EMAIL!,
  subject: 'Test Email',
  html: '<h1>¡Funciona!</h1>'
})
```

---

## 🐛 Troubleshooting

### Error: Cannot find module '@azure/cosmos'
```bash
npm install
```

### Error: Port 3000 already in use
```bash
# Encontrar proceso usando puerto 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess

# O usar otro puerto
$env:PORT=3001; npm run dev
```

### Error: COSMOS_ENDPOINT not defined
```bash
# Verificar que .env.local existe
Get-Content .env.local

# Si no existe, crear desde ejemplo
Copy-Item .env.example .env.local
# Luego editar con tus credenciales
```

---

## 📊 Monitoreo

### Ver performance en Vercel
```bash
vercel inspect tu-deployment-url
```

### Analytics (si está configurado)
```bash
vercel analytics
```

---

## 🎉 Quick Commands Favoritos

```bash
# Desarrollo rápido
npm run dev

# Deploy rápido
vercel --prod

# Ver todo (logs + status)
vercel logs --follow

# Backup rápido
curl https://tu-app.vercel.app/api/rsvp > backup-$(Get-Date -Format "yyyy-MM-dd").json
```

---

## 💡 Tips

1. **Siempre hacer backup antes del evento:**
   ```bash
   curl https://tu-app.vercel.app/api/rsvp > backup-$(Get-Date -Format "yyyy-MM-dd").json
   ```

2. **Probar en mobile antes de compartir:**
   ```bash
   # Obtener IP
   ipconfig
   # Probar en celular: http://TU-IP:3000
   ```

3. **Usar branches para diferentes eventos:**
   ```bash
   git checkout -b evento-navidad-2024
   ```

4. **Monitorear logs durante el evento:**
   ```bash
   vercel logs --follow
   ```

---

¿Necesitas más comandos específicos? ¡Pregúntame! 🚀
