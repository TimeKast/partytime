# 🎯 PASOS FINALES DE CONFIGURACIÓN

## ✅ Lo que ya está listo:

1. ✅ Proyecto Next.js creado y configurado
2. ✅ Dependencias instaladas
3. ✅ Componentes y páginas implementadas
4. ✅ API Routes configuradas
5. ✅ Integración con Azure Cosmos DB
6. ✅ Diseño mobile-first con animaciones

---

## 📸 PASO 1: Agregar Imágenes (IMPORTANTE)

Necesitas copiar manualmente las imágenes del flyer a la carpeta `public/`:

### Opción A: Usar la imagen del fondo del flyer

1. Guarda la imagen de fondo (la segunda imagen que compartiste) como:
   - `public/background.jpg`

### Opción B: Usar ambas imágenes

1. Primera imagen (con texto) → `public/flyer.jpg`
2. Segunda imagen (solo fondo) → `public/background.jpg`

**💡 Recomendación:** Usa la segunda imagen (sin texto) como `background.jpg` para que el texto de la web se vea mejor.

### Cómo copiar:

```
# Desde tu ubicación de descarga o donde tengas las imágenes
# Copiar a: C:\Users\josea\OneDrive\Documents\TimeKast\Rooftop Party\public\background.jpg
```

O simplemente arrastra la imagen a la carpeta `public/` en VS Code.

---

## 🔐 PASO 2: Configurar Azure Cosmos DB

Tienes 2 opciones:

### Opción A: Usar el Emulador Local (Más rápido para probar)

1. **Instalar el emulador:**
   - Descarga: https://aka.ms/cosmosdb-emulator
   - O usa Docker (ver README.md)

2. **Configuración en `.env.local`:**
   ```env
   COSMOS_ENDPOINT=https://localhost:8081/
   COSMOS_KEY=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
   COSMOS_DATABASE_NAME=rooftop-party-db
   COSMOS_CONTAINER_NAME=rsvps
   ```

### Opción B: Usar Azure Cosmos DB en la Nube (Recomendado para producción)

1. **Crear cuenta en Azure:**
   - Ve a: https://portal.azure.com
   - Crea un nuevo recurso → "Azure Cosmos DB"
   - Selecciona API: **NoSQL**
   - Modo: **Serverless** (¡es más barato!)

2. **Obtener credenciales:**
   - En el portal de Azure, ve a tu cuenta de Cosmos DB
   - Menú lateral → "Keys"
   - Copia el "URI" y "PRIMARY KEY"

3. **Configurar en `.env.local`:**
   ```env
   COSMOS_ENDPOINT=https://tu-cuenta.documents.azure.com:443/
   COSMOS_KEY=tu-primary-key-aqui
   COSMOS_DATABASE_NAME=rooftop-party-db
   COSMOS_CONTAINER_NAME=rsvps
   ```

**💰 Costo:** Con modo Serverless, un evento de 200 personas cuesta menos de $1 USD.

---

## 🚀 PASO 3: Ejecutar la Aplicación

Una vez que tengas las imágenes y la configuración:

```bash
npm run dev
```

Abre tu navegador en: http://localhost:3000

### ¿Qué deberías ver?

✅ Fondo con los remolinos coloridos del flyer
✅ Título "ROOFTOP PARTY" con efecto neón
✅ Información del evento
✅ Botón "CONFIRMAR ASISTENCIA"
✅ Al hacer clic, se abre un modal elegante con formulario

---

## 📱 PASO 4: Probar en Mobile

1. En tu terminal donde corre `npm run dev`, verás la dirección local
2. En tu celular, conectado a la misma red WiFi:
   - Abre el navegador
   - Ve a: `http://[tu-ip-local]:3000`
   - Ejemplo: `http://192.168.1.5:3000`

Para encontrar tu IP local:
```bash
ipconfig
# Busca "IPv4 Address" en tu adaptador de red
```

---

## 🎨 PASO 5: Personalizar para Futuros Eventos

### Cambiar información del evento:

Edita `event-config.json`:

```json
{
  "event": {
    "id": "mi-nuevo-evento-diciembre-2024",  // ⬅️ Cambia esto
    "title": "FIESTA DE FIN DE AÑO",          // ⬅️ Y esto
    "subtitle": "CELEBRACIÓN 2024",
    "date": "SÁBADO, 31 DIC",
    "time": "DESDE LAS 10:00 PM",
    "location": "TU NUEVA UBICACIÓN",
    "details": "🎊 ¡Trae tu mejor outfit!",
    "backgroundImage": "/nuevo-fondo.jpg"     // ⬅️ Nueva imagen
  }
}
```

### Cambiar colores:

```json
{
  "theme": {
    "primaryColor": "#FF1493",    // Rosa neón
    "secondaryColor": "#00FFFF",  // Cyan
    "accentColor": "#FFD700"      // Dorado
  }
}
```

---

## 🌐 PASO 6: Deploy a Vercel (Hacer tu sitio público)

### Método 1: Deploy desde GitHub (Recomendado)

1. **Sube tu código a GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Rooftop Party Invitation"
   git branch -M main
   git remote add origin https://github.com/tu-usuario/rooftop-party.git
   git push -u origin main
   ```

2. **Conecta con Vercel:**
   - Ve a: https://vercel.com
   - Click "New Project"
   - Import desde GitHub
   - Selecciona tu repositorio

3. **Configurar Variables de Entorno en Vercel:**
   - En Vercel, ve a tu proyecto → Settings → Environment Variables
   - Agrega:
     - `COSMOS_ENDPOINT`
     - `COSMOS_KEY`
     - `COSMOS_DATABASE_NAME`
     - `COSMOS_CONTAINER_NAME`

4. **Deploy:** ¡Automático! Vercel lo desplegará

### Método 2: Deploy Directo desde CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Configurar variables de entorno cuando te lo pida

# Deploy a producción
vercel --prod
```

Tu URL será algo como: `https://rooftop-party-xyz.vercel.app`

---

## 📊 FUNCIONALIDADES EXTRAS DISPONIBLES

### Ver todos los RSVPs:

GET `https://tu-url.vercel.app/api/rsvp`

### Ver estadísticas:

GET `https://tu-url.vercel.app/api/stats`

Respuesta:
```json
{
  "success": true,
  "eventId": "rooftop-party-andras-oct2024",
  "stats": {
    "totalConfirmed": 45,
    "confirmed": 45,
    "cancelled": 0
  }
}
```

---

## 🔮 PRÓXIMAS MEJORAS SUGERIDAS

1. **Emails Automáticos:**
   - Confirmación al registrarse
   - Recordatorio 1 día antes
   - → Usar SendGrid (ver README.md)

2. **Panel de Administración:**
   - Ver lista de confirmados
   - Exportar a Excel
   - Buscar por nombre/email

3. **WhatsApp Notifications:**
   - Enviar confirmación por WhatsApp
   - Recordatorios automáticos

4. **QR Codes:**
   - Generar QR único por invitado
   - App para check-in en la entrada

5. **Compartir en Redes:**
   - Botones para compartir en Instagram/Facebook
   - Open Graph tags para preview elegante

---

## ❓ TROUBLESHOOTING

### "Cannot connect to Cosmos DB"
- Verifica que el endpoint y key sean correctos
- Si usas emulador, asegúrate que esté corriendo
- Revisa que `.env.local` exista y esté bien configurado

### "Las imágenes no se ven"
- Verifica que estén en `public/background.jpg`
- Revisa el nombre del archivo (case-sensitive)
- Recarga la página (Ctrl + F5)

### "Error al enviar el formulario"
- Abre la consola del navegador (F12)
- Revisa el tab "Network" para ver el error exacto
- Verifica la conexión a Cosmos DB

### "La página se ve mal en mobile"
- Limpia la cache del navegador
- Asegúrate de tener la última versión del código
- Verifica el viewport en DevTools (F12)

---

## 📞 SOPORTE

Si tienes algún problema:

1. Revisa la consola del navegador (F12 → Console)
2. Revisa los logs del terminal donde corre `npm run dev`
3. Consulta el README.md completo
4. Revisa la documentación de Azure Cosmos DB: https://learn.microsoft.com/azure/cosmos-db/

---

## ✅ CHECKLIST FINAL

Antes de compartir tu invitación:

- [ ] ✅ Imágenes agregadas a `public/`
- [ ] ✅ Azure Cosmos DB configurado
- [ ] ✅ Información del evento actualizada en `event-config.json`
- [ ] ✅ Probado en navegador de escritorio
- [ ] ✅ Probado en navegador móvil
- [ ] ✅ Formulario funciona y guarda datos
- [ ] ✅ Desplegado en Vercel
- [ ] ✅ Variables de entorno configuradas en Vercel
- [ ] ✅ URL personalizada (opcional)
- [ ] ✅ Open Graph tags para compartir en redes (opcional)

---

## 🎉 ¡LISTO!

Una vez completados estos pasos, tendrás:

✨ Una invitación web profesional y elegante
📱 Optimizada para móviles
💾 Base de datos en la nube
📊 Estadísticas en tiempo real
🔄 Template reutilizable para futuros eventos
🚀 Desplegada y accesible desde cualquier lugar

**¡Que disfrutes tu evento! 🎊🎉**
