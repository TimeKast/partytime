# 🎯 Guía de Configuración Completa

## ✅ Requisitos Previos

- Node.js 18+ instalado
- Cuenta en [Vercel](https://vercel.com)
- Cuenta en [Neon](https://neon.tech) (base de datos)
- Cuenta en [Resend](https://resend.com) (emails)

---

## 📋 Paso 1: Clonar y Configurar Proyecto

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/rooftop-party.git
cd rooftop-party

# Instalar dependencias
npm install
```

---

## 🗄️ Paso 2: Configurar Base de Datos (Neon PostgreSQL)

### 2.1 Crear Proyecto en Neon

1. Ve a [Neon Console](https://console.neon.tech)
2. Crea un nuevo proyecto
3. Nombre sugerido: `rooftop-party`
4. Copia la **Connection String**

### 2.2 Configurar Variables de Entorno

Crea archivo `.env.local`:

```env
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require
```

### 2.3 Ejecutar Migraciones

En una base local vacía, aplica los archivos `drizzle/0000` a `drizzle/0005` en
orden y ejecuta `npm run verify:db`. Nunca sincronices producción directamente
desde el schema TypeScript. Producción requiere el preflight, la línea base
histórica y la aplicación transaccional descritos en
[`docs/PRODUCTION_MIGRATION_RUNBOOK.md`](docs/PRODUCTION_MIGRATION_RUNBOOK.md).

---

## 📧 Paso 3: Configurar Emails (Resend)

### 3.1 Crear Cuenta en Resend

1. Ve a [Resend](https://resend.com)
2. Crea una cuenta
3. En API Keys, crea una nueva key

### 3.2 Verificar Dominio (Recomendado)

1. En Resend → Domains → Add Domain
2. Sigue las instrucciones para agregar registros DNS
3. Una vez verificado, podrás enviar desde `@tudominio.com`

### 3.3 Agregar Variables

En `.env.local`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=invitaciones@tudominio.com
```

> **Nota**: Sin dominio verificado, puedes usar `onboarding@resend.dev` para pruebas.

---

## 🔒 Paso 4: Configurar Seguridad

### 4.1 Generar Secrets

En PowerShell:
```powershell
# Generar CANCEL_TOKEN_SECRET
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Repite para generar `CRON_SECRET`.

### 4.2 Agregar a `.env.local`

```env
CANCEL_TOKEN_SECRET=tu-secret-generado-1
CRON_SECRET=tu-secret-generado-2
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 👤 Paso 5: Crear Usuario Admin

### Opción A: Script (Recomendado)

Edita `scripts/create-super-admin.ts` con tus credenciales y ejecuta:

```bash
npx ts-node scripts/create-super-admin.ts
```

### Opción B: SQL Directo

En Neon Console → SQL Editor:

```sql
INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
VALUES (
  'usr_' || gen_random_uuid(),
  'admin',
  'hash_de_tu_password', -- Usar bcrypt
  'super_admin',
  NOW(),
  NOW()
);
```

---

## 🎉 Paso 6: Crear Primer Evento

### Opción A: Desde el Panel Admin

1. Inicia `npm run dev`
2. Ve a `/admin` y logueate
3. En el selector de eventos, haz clic en "+ Crear Evento"
4. Completa la información

### Opción B: SQL Directo

```sql
INSERT INTO events (id, slug, title, subtitle, date, time, location, details, is_active, created_at, updated_at)
VALUES (
  'evt_' || gen_random_uuid(),
  'mi-fiesta',
  'MI FIESTA',
  'CELEBRACIÓN 2026',
  'SÁBADO, 15 FEB',
  '8:00 PM',
  'Tu Ubicación',
  '🎉 ¡No te lo pierdas!',
  true,
  NOW(),
  NOW()
);
```

---

## 🚀 Paso 7: Probar Localmente

```bash
npm run dev
```

Verifica:
- [ ] http://localhost:3000/mi-fiesta muestra la invitación
- [ ] El formulario RSVP funciona
- [ ] http://localhost:3000/admin permite login
- [ ] Puedes ver/gestionar RSVPs

---

## ☁️ Paso 8: Deploy en Vercel

### 8.1 Conectar Repositorio

1. Ve a [Vercel](https://vercel.com)
2. New Project → Import Git Repository
3. Selecciona tu repositorio

### 8.2 Configurar Variables de Entorno

En Vercel → Settings → Environment Variables, agrega:

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | Connection string de Neon |
| `RESEND_API_KEY` | API key de Resend |
| `FROM_EMAIL` | Tu email verificado |
| `CANCEL_TOKEN_SECRET` | Secret generado |
| `CRON_SECRET` | Secret para cron |
| `NEXT_PUBLIC_APP_URL` | Tu URL de Vercel |

### 8.3 Deploy

Vercel desplegará automáticamente al detectar el repositorio.

---

## ⏰ Paso 9: Verificar Cron Jobs

El archivo `vercel.json` ya configura el cron para recordatorios:

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

Verifica en Vercel → Settings → Cron Jobs que aparece listado.

---

## 🎨 Paso 10: Personalizar Evento

### Desde el Panel Admin

1. Ve a `/admin`
2. Selecciona tu evento
3. Haz clic en "⚙️ Config"
4. Edita:
   - Información del evento
   - Imagen de fondo (URL)
   - Configuración de emails

### Configurar Emails Automáticos

1. **Confirmación automática**: Toggle ON para enviar email al RSVP
2. **Recordatorio programado**: Toggle ON y selecciona fecha/hora

---

## ✅ Checklist Final

### Configuración Básica
- [ ] Base de datos Neon creada
- [ ] Migraciones ejecutadas
- [ ] Variables de entorno configuradas
- [ ] Usuario admin creado
- [ ] Al menos un evento creado

### Emails
- [ ] Resend API key configurada
- [ ] Dominio verificado (o usando test email)
- [ ] Email de prueba enviado correctamente

### Deploy
- [ ] Proyecto desplegado en Vercel
- [ ] Variables de entorno en Vercel
- [ ] URL pública funcionando
- [ ] Cron jobs configurados

### Funcionalidad
- [ ] RSVP funciona en producción
- [ ] Panel admin accesible
- [ ] Emails se envían correctamente
- [ ] Cancelación de RSVP funciona

---

## 🐛 Troubleshooting

### Error de conexión a DB
```
Verifica DATABASE_URL en .env.local
Asegúrate que la IP esté permitida en Neon
```

### Emails no llegan
```
Verifica RESEND_API_KEY
Revisa que FROM_EMAIL esté verificado
Chequea la carpeta de spam
```

### 401 en /admin
```
Verifica que creaste usuario admin
Verifica credenciales correctas
```

### Cron no ejecuta
```
Solo funciona en Vercel (no local)
Verifica CRON_SECRET configurado
Revisa logs en Vercel
```

---

## 📞 Recursos

- [Neon Docs](https://neon.tech/docs)
- [Resend Docs](https://resend.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [Drizzle ORM](https://orm.drizzle.team)

---

**¡Tu sistema de invitaciones está listo! 🎉**
