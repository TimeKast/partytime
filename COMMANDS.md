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

### Linting
```bash
npm run lint
```

---

## 🗄️ Base de Datos (Drizzle + Neon)

### Ejecutar migraciones
```bash
npx drizzle-kit push
```

### Generar migraciones
```bash
npx drizzle-kit generate
```

### Abrir Drizzle Studio
```bash
npx drizzle-kit studio
```

### Ver cambios pendientes
```bash
npx drizzle-kit diff
```

---

## 📦 Deploy (Vercel)

### Instalar CLI
```bash
npm i -g vercel
```

### Login
```bash
vercel login
```

### Deploy preview
```bash
vercel
```

### Deploy producción
```bash
vercel --prod
```

### Ver logs
```bash
vercel logs
vercel logs --follow  # En tiempo real
```

### Variables de entorno
```bash
vercel env add NOMBRE_VARIABLE
vercel env ls
vercel env rm NOMBRE_VARIABLE
```

---

## 📊 API - Pruebas con cURL

### Crear RSVP
```bash
curl -X POST http://localhost:3000/api/rsvp \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Test",
    "email": "juan@test.com",
    "phone": "+52 555 123 4567",
    "eventId": "mi-evento"
  }'
```

### Obtener RSVPs (necesita auth)
```bash
curl http://localhost:3000/api/rsvp?eventId=mi-evento \
  -H "Cookie: session=TU_SESSION_COOKIE"
```

### Probar cron de recordatorios
```bash
curl http://localhost:3000/api/cron/send-reminders \
  -H "Authorization: Bearer TU_CRON_SECRET"
```

### Obtener info de evento
```bash
curl http://localhost:3000/api/events/mi-evento
```

---

## 👤 Scripts de Admin

### Crear super admin
```bash
npx ts-node scripts/create-super-admin.ts
```

### Agregar datos demo
```bash
npx ts-node scripts/add-demo-data.ts
```

---

## 🔐 Generar Secrets

### PowerShell
```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

### Bash/Unix
```bash
openssl rand -base64 32
```

---

## 🧹 Limpieza

### Limpiar node_modules y reinstalar
```bash
# PowerShell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

### Limpiar cache de Next.js
```bash
# PowerShell
Remove-Item -Recurse -Force .next
npm run dev
```

---

## 📱 Testing en Mobile

### Obtener IP local
```bash
# PowerShell
ipconfig
# Busca "IPv4 Address"
```

### Probar en celular
Abre en tu celular (misma red WiFi):
```
http://TU-IP:3000
```

---

## 🔄 Git

### Setup inicial
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/tu-usuario/repo.git
git push -u origin main
```

### Crear branch para evento
```bash
git checkout -b evento-febrero-2026
git add .
git commit -m "Configuración evento Febrero"
git push -u origin evento-febrero-2026
```

### Trigger redeploy vacío
```bash
git commit --allow-empty -m "Trigger redeploy"
git push
```

---

## 📧 Testing de Emails

### Enviar email de prueba (desde código)
```typescript
import { sendEmail } from '@/lib/resend'

await sendEmail({
  to: 'test@example.com',
  subject: 'Test',
  html: '<h1>¡Funciona!</h1>'
})
```

---

## 🐛 Troubleshooting

### Puerto en uso
```bash
# PowerShell - Ver proceso usando puerto
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess

# Usar otro puerto
$env:PORT=3001; npm run dev
```

### Error de TypeScript
```bash
# Verificar tipos
npx tsc --noEmit
```

### Ver variables de entorno
```bash
# PowerShell
Get-Content .env.local
```

---

## 💡 Tips Rápidos

```bash
# Desarrollo rápido
npm run dev

# Deploy rápido
vercel --prod

# Ver logs en tiempo real
vercel logs --follow

# Build local + verificar
npm run build && npm start
```

---

**¿Necesitas más comandos?** Revisa la documentación de cada herramienta:
- [Next.js](https://nextjs.org/docs)
- [Drizzle](https://orm.drizzle.team)
- [Vercel CLI](https://vercel.com/docs/cli)
