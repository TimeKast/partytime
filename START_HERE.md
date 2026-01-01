# ⚡ INICIO RÁPIDO - Rooftop Party

## 🚀 Para probar en 5 minutos

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar base de datos

Crea `.env.local`:
```env
DATABASE_URL=postgresql://tu-connection-string-de-neon
```

> 💡 Crea proyecto gratis en [neon.tech](https://neon.tech)

### 3. Ejecutar migraciones
```bash
npx drizzle-kit push
```

### 4. Iniciar
```bash
npm run dev
```

### 5. Abrir
- **Evento:** http://localhost:3000/mi-evento
- **Admin:** http://localhost:3000/admin

---

## 📧 Para emails funcionales

Agrega a `.env.local`:
```env
RESEND_API_KEY=re_xxx
FROM_EMAIL=test@tudominio.com
```

> 💡 Crea cuenta gratis en [resend.com](https://resend.com)

---

## 👤 Crear usuario admin

```bash
npx ts-node scripts/create-super-admin.ts
```

---

## 📖 Documentación completa

- **SETUP_GUIDE.md** - Configuración paso a paso
- **ADMIN_GUIDE.md** - Guía del panel admin
- **README.md** - Documentación técnica

---

## ❓ Problemas comunes

**No conecta a la DB:**
→ Verifica DATABASE_URL en .env.local

**Emails no llegan:**
→ Verifica RESEND_API_KEY
→ Revisa spam

**401 en /admin:**
→ Crea usuario con el script

---

¡Listo! 🎉
