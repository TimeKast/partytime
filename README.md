# 🎉 Rooftop Party - Invitación Web Interactiva

Aplicación web elegante e impactante para invitaciones a eventos, diseñada con **Next.js 14**, **TypeScript**, y **Azure Cosmos DB**. Optimizada para mobile-first y lista para desplegar en Vercel.

## ✨ Características

- 🎨 **Diseño impactante** inspirado en el flyer del evento
- 📱 **Mobile-first** - Perfectamente adaptado para smartphones
- 🎭 **Animaciones suaves** con Framer Motion
- 💾 **Base de datos Azure Cosmos DB** para almacenar RSVPs
- 🔄 **Template reutilizable** - Fácil de actualizar para futuros eventos
- ⚡ **Deploy rápido** en Vercel
- 📊 **API de estadísticas** para monitorear asistencia

## 🚀 Inicio Rápido

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Azure Cosmos DB

#### Opción A: Usar Azure Cosmos DB en la nube (Recomendado para producción)

1. Crea una cuenta en [Azure Portal](https://portal.azure.com)
2. Crea un recurso de **Azure Cosmos DB** (API NoSQL)
3. Selecciona el modo **Serverless** (ideal para eventos)
4. Obtén tu **Endpoint** y **Primary Key** desde "Keys" en el portal

#### Opción B: Usar el emulador local (Desarrollo)

```bash
# Instalar el emulador de Cosmos DB
# Windows: Descarga desde https://aka.ms/cosmosdb-emulator
# Docker:
docker pull mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator
docker run -p 8081:8081 -p 10251:10251 -p 10252:10252 -p 10253:10253 -p 10254:10254 mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator

# Endpoint del emulador: https://localhost:8081/
# Key del emulador: C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
```

### 3. Configurar Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
# Azure Cosmos DB Configuration
COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
COSMOS_KEY=your-primary-key-here
COSMOS_DATABASE_NAME=rooftop-party-db
COSMOS_CONTAINER_NAME=rsvps

# Opcional: Para envío de emails
# SENDGRID_API_KEY=your-sendgrid-api-key
# FROM_EMAIL=noreply@yourdomain.com
```

### 4. Agregar Imágenes

Copia las imágenes del flyer a la carpeta `public/`:
- `public/background.jpg` - Imagen de fondo
- `public/flyer.jpg` - Flyer completo (opcional)

### 5. Ejecutar en Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 📦 Deploy en Vercel

### Deploy Automático (Recomendado)

1. Crea una cuenta en [Vercel](https://vercel.com)
2. Conecta tu repositorio de GitHub
3. Configura las variables de entorno en Vercel:
   - `COSMOS_ENDPOINT`
   - `COSMOS_KEY`
   - `COSMOS_DATABASE_NAME`
   - `COSMOS_CONTAINER_NAME`
4. ¡Deploy automático! 🚀

### Deploy Manual

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy a producción
vercel --prod
```

## 🎨 Personalizar para Futuros Eventos

### 1. Editar Información del Evento

Modifica el archivo `event-config.json`:

```json
{
  "event": {
    "id": "mi-nuevo-evento-2024",
    "title": "NUEVO EVENTO",
    "subtitle": "SUBTÍTULO",
    "date": "VIERNES, 15 NOV",
    "time": "DESDE LAS 8:00 PM",
    "location": "DIRECCIÓN DEL EVENTO",
    "details": "🎉 Detalles adicionales",
    "backgroundImage": "/mi-nueva-imagen.jpg"
  },
  "theme": {
    "primaryColor": "#FF1493",
    "secondaryColor": "#00FFFF",
    "accentColor": "#FFD700"
  }
}
```

### 2. Cambiar Imágenes

Reemplaza los archivos en `public/`:
- `background.jpg` - Nueva imagen de fondo
- `flyer.jpg` - Nuevo flyer

### 3. Actualizar Colores (Opcional)

Los colores también se pueden ajustar en `app/globals.css`:

```css
:root {
  --primary-color: #FF1493;
  --secondary-color: #00FFFF;
  --accent-color: #FFD700;
}
```

## 📊 API Endpoints

### POST /api/rsvp
Guardar un nuevo RSVP

```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "phone": "+52 xxx xxx xxxx"
}
```

### GET /api/rsvp
Obtener todos los RSVPs del evento actual

### GET /api/stats
Obtener estadísticas del evento

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

## 🔧 Estructura del Proyecto

```
rooftop-party/
├── app/
│   ├── api/
│   │   ├── rsvp/route.ts      # API para guardar RSVPs
│   │   └── stats/route.ts     # API de estadísticas
│   ├── components/
│   │   ├── RSVPModal.tsx      # Modal del formulario
│   │   └── RSVPModal.module.css
│   ├── globals.css            # Estilos globales
│   ├── layout.tsx             # Layout principal
│   ├── page.tsx               # Página principal
│   └── page.module.css        # Estilos de la página
├── lib/
│   └── cosmosdb.ts            # Cliente de Cosmos DB
├── public/
│   ├── background.jpg         # Imagen de fondo
│   └── flyer.jpg              # Flyer completo
├── event-config.json          # 🎯 Configuración del evento
├── .env.local                 # Variables de entorno (no versionado)
├── .env.example               # Ejemplo de variables
└── package.json
```

## 💡 Gestión de Registros y Comunicación

### Arquitectura Propuesta

```
Usuario → Formulario RSVP → API Next.js → Azure Cosmos DB
                                ↓
                          Confirmación Email (opcional)
```

### Funcionalidades Implementadas

✅ **Almacenamiento de RSVPs** en Azure Cosmos DB
✅ **Validación de duplicados** por email
✅ **API de consulta** para ver todos los registros
✅ **Estadísticas en tiempo real**

### Funcionalidades Sugeridas (Próximos Pasos)

#### 1. **Emails Automáticos con SendGrid**

Instala SendGrid:
```bash
npm install @sendgrid/mail
```

Configura en `.env.local`:
```env
SENDGRID_API_KEY=tu-api-key
FROM_EMAIL=noreply@tudominio.com
```

Implementa en `app/api/rsvp/route.ts`:
```typescript
import sgMail from '@sendgrid/mail'

// Después de guardar el RSVP
await sgMail.send({
  to: email,
  from: process.env.FROM_EMAIL!,
  subject: '¡Confirmación de Asistencia - Rooftop Party!',
  html: `<h1>¡Nos vemos ${name}!</h1>...`
})
```

#### 2. **Recordatorios con Azure Functions**

- Crea una Azure Function con timer trigger
- Consulta Cosmos DB por eventos próximos
- Envía emails 1 día y 3 horas antes del evento

#### 3. **Panel de Administración**

Crea `app/admin/page.tsx`:
```typescript
// Lista de RSVPs con búsqueda y filtros
// Estadísticas visuales
// Exportar a CSV/Excel
```

#### 4. **WhatsApp Notifications (Opcional)**

Usa Twilio API para enviar mensajes de WhatsApp:
```bash
npm install twilio
```

#### 5. **Check-in en el Evento**

- Genera QR codes únicos por invitado
- App móvil o web para escanear en la entrada
- Actualiza status en Cosmos DB

## 🏗️ Ventajas de Azure Cosmos DB

✅ **Escalabilidad automática** - De 10 a 10,000 invitados
✅ **Modo Serverless** - Pagas solo por lo que usas
✅ **Baja latencia** - < 10ms en lecturas/escrituras
✅ **Distribución global** - Réplicas en múltiples regiones
✅ **Sin migraciones** - Schema flexible para agregar campos
✅ **Integración nativa** con Azure Functions y Logic Apps

### Costos Estimados (Serverless)

Para un evento con 200 invitados:
- **Escrituras**: 200 RSVPs × $0.001 = $0.20
- **Lecturas**: ~1,000 consultas × $0.0001 = $0.10
- **Almacenamiento**: 1GB × $0.25/mes = $0.25

**Total estimado por evento: < $1 USD** 🎯

## 🛠️ Extensiones de VS Code Recomendadas

- [Azure Cosmos DB](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-cosmosdb)
- [Azure Functions](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurefunctions)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## 📝 Notas Importantes

- **Seguridad**: El endpoint GET /api/rsvp debería protegerse con autenticación en producción
- **Imágenes**: Optimiza las imágenes antes de subirlas (recomendado < 500KB)
- **CORS**: Configurado para cualquier origen, ajusta según necesites
- **Rate Limiting**: Considera agregar límite de requests por IP

## 🆘 Troubleshooting

### Error: "Cannot find module '@azure/cosmos'"
```bash
npm install
```

### Error: "COSMOS_ENDPOINT is not defined"
Verifica que `.env.local` existe y tiene las variables correctas.

### Las imágenes no se ven
Asegúrate de que las imágenes estén en la carpeta `public/` con los nombres correctos.

### Error de CORS en desarrollo
Next.js maneja CORS automáticamente, si tienes problemas revisa las variables de entorno.

## 📄 Licencia

Este proyecto es un template personal. Úsalo libremente para tus eventos.

## 🤝 Soporte

Para cualquier pregunta o problema, crea un issue en el repositorio o contacta al desarrollador.

---

**¡Disfruta tu evento! 🎉🎊✨**
