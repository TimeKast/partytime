# 🚀 Getting Started — TimeKast Starter Kit

> Guía completa para entender el Starter Kit y echarlo a andar en un nuevo proyecto.
> Este doc es la referencia para **Epic 1: Setup de Entorno** en cualquier proyecto derivado.

---

## ¿Qué es el Starter Kit?

El TimeKast Starter Kit es un **boilerplate de producción** que incluye todo lo necesario para arrancar una app SaaS sin implementar infraestructura desde cero.

### Lo que ya viene resuelto

| Sistema            | Qué incluye                                                             | Referencia (skill)                                                                                  |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Auth**           | Password, Google/GitHub OAuth, Magic Link, Password Reset, JWT sessions | [`sk-security`](../skills/sk-security/SKILL.md)                                                     |
| **RBAC**           | 3 roles (`super_admin` > `admin` > `user`), permissions por recurso     | [`sk-security`](../skills/sk-security/SKILL.md)                                                     |
| **Database**       | Drizzle ORM + Neon Postgres, soft delete, audit fields, migrations      | [`sk-db`](../skills/sk-db/SKILL.md)                                                                 |
| **UI**             | Tailwind v4 + shadcn/ui + diseño neumórfico, 3 themes                   | [`sk-ui`](../skills/sk-ui/SKILL.md)                                                                 |
| **Formularios**    | react-hook-form + Zod, Form Kit completo                                | [`sk-ui`](../skills/sk-ui/SKILL.md) §form kit                                                       |
| **Tablas**         | DataTable con sort, search, filter, pagination                          | [`sk-ui`](../skills/sk-ui/SKILL.md) §table system                                                   |
| **Navegación**     | Sidebar + BottomNav (mobile) + MoreSheet, config-driven                 | [`sk-navigation`](../skills/sk-navigation/SKILL.md)                                                 |
| **Email**          | Resend / SMTP, 9 templates HTML, deliverability headers                 | [`sk-features-index`](../skills/sk-features-index/SKILL.md)                                         |
| **Notificaciones** | In-app + Push + Email, SSE real-time, preferencias por usuario          | [`sk-notifications`](../skills/sk-notifications/SKILL.md)                                           |
| **PWA**            | Service Worker (Serwist), install prompt, managed updates               | [`sk-pwa`](../skills/sk-pwa/SKILL.md)                                                               |
| **CRUD Pattern**   | Gold standard: List → Create → Detail con navigator                     | [`sk-crud-scaffold`](../skills/sk-crud-scaffold/SKILL.md)                                           |
| **Testing**        | Vitest (unit) + Playwright (E2E) + Neon branch isolation                | [`sk-testing-nextjs`](../skills/sk-testing-nextjs/SKILL.md) + [`sk-e2e`](../skills/sk-e2e/SKILL.md) |
| **Seguridad**      | Rate limiting, correlation IDs, audit trail, RBAC guards                | [`sk-security`](../skills/sk-security/SKILL.md)                                                     |
| **Branding**       | Logo whitelabel, PWA icons, email assets, theme-aware                   | [§ Personalizar Branding](#7-personalizar-branding)                                                 |

> [!IMPORTANT]
> Antes de implementar **cualquier** feature, revisar [`sk-features-index`](../skills/sk-features-index/SKILL.md) para verificar que el kit no la shipee ya.

---

## Stack Técnico

| Layer         | Technology                          |
| ------------- | ----------------------------------- |
| **Framework** | Next.js 16+ (App Router, Turbopack) |
| **Language**  | TypeScript (strict mode)            |
| **ORM**       | Drizzle ORM                         |
| **Database**  | Neon Postgres (serverless)          |
| **Auth**      | NextAuth.js v5                      |
| **UI**        | Tailwind CSS v4 + Lucide React      |
| **Testing**   | Vitest + Playwright                 |
| **Hosting**   | Vercel                              |

---

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **pnpm 9+** — `npm install -g pnpm`
- **Cuenta Neon** — [neon.tech](https://neon.tech) (database)
- **Cuenta Vercel** — [vercel.com](https://vercel.com) (hosting, deploy)

---

## Setup Paso a Paso

> [!TIP]
> **La vía recomendada para arrancar es el CLI `@timekast/factory`** (distribución del kit):
>
> ```bash
> npx @timekast/factory new MiApp   # proyecto nuevo (boilerplate + cerebro), crea repo + git init
> npx @timekast/factory add         # mete el cerebro en un repo que YA existe (auto-detecta full/core)
> npx @timekast/factory update      # refresca el cerebro (.claude/ + scripts), nunca tu src/ (--full sube core→full)
> ```
>
> Perfiles (`full`/`core`), lockfile y modelo de versión dual → [`distribution.md`](./distribution.md). El clone manual de abajo es la alternativa from-scratch (sin CLI).

### Paso 1: Clonar y Limpiar

```bash
# Clonar el Starter Kit
git clone https://github.com/TimeKast/starter-kit.git mi-proyecto
cd mi-proyecto

# Limpiar historial para empezar como proyecto nuevo
rm -rf .git
git init
git add .
git commit -m "chore: initial commit from TimeKast Starter Kit"

# Instalar dependencias
pnpm install
```

> [!IMPORTANT]
> **Reemplazar `README.md`** — El README de raíz es el del Starter Kit (Factory). Crea uno nuevo acorde a tu proyecto: nombre, descripción, instrucciones de setup, equipo, etc. El README de Factory no debe quedar en producción.

### Paso 2: Configurar Variables de Entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` con los valores mínimos:

```env
# ── Database (obtener de Neon Dashboard) ──
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# ── Auth (generar con: openssl rand -base64 32) ──
AUTH_SECRET="tu-secret-seguro-de-32-caracteres"

# ── App Identity ──
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Mi Proyecto"
```

### Paso 3: Inicializar Base de Datos

> [!CAUTION]
> **SIEMPRE usar migraciones para inicializar la DB.** `db:push` NO genera archivos de migración y puede causar problemas al sincronizar entre entornos. Sólo usar `db:push` en desarrollo local cuando se pierde la DB y no importa.

```bash
# Generar archivos de migración (si aún no existen)
pnpm db:generate

# Aplicar migraciones — esto crea todas las tablas correctamente
pnpm db:migrate

# Crear el super admin (invite — defines tu contraseña en el link de aceptación)
pnpm invite:admin --email=tu.email@gmail.com
```

### Paso 4: Ejecutar

```bash
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000) — ¡Listo!

> **Puertos:** Configurados en `package.json` campo `"ports"`:
>
> - **Dev:** `3000` — OAuth redirects requieren puerto fijo
> - **E2E:** `3005` — Separado para no matar el dev server al testear

---

## Setup Opcional

### OAuth (Google / GitHub)

#### Google

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create OAuth 2.0 Client ID
2. Authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/callback/google
   https://tu-app.vercel.app/api/auth/callback/google
   ```
3. Agregar a `.env.local`:
   ```env
   AUTH_GOOGLE_ID="tu-client-id"
   AUTH_GOOGLE_SECRET="tu-client-secret"
   NEXT_PUBLIC_AUTH_GOOGLE="true"
   ```

#### GitHub

1. [GitHub Developer Settings](https://github.com/settings/developers) → Create OAuth App
2. Callback URL: `http://localhost:3000/api/auth/callback/github`
3. Agregar a `.env.local`:
   ```env
   AUTH_GITHUB_ID="tu-client-id"
   AUTH_GITHUB_SECRET="tu-client-secret"
   NEXT_PUBLIC_AUTH_GITHUB="true"
   ```

### Email (Resend / SMTP)

```env
EMAIL_PROVIDER="resend"
RESEND_API_KEY="re_xxxx"
EMAIL_FROM="noreply@tudominio.com"
```

Ver [Resend DNS Setup](https://resend.com/docs/dashboard/domains/introduction) para configuración DNS (SPF, DKIM, DMARC).

### Notificaciones Push (VAPID)

```bash
# Generar claves VAPID
npx web-push generate-vapid-keys
```

```env
NEXT_PUBLIC_NOTIFICATIONS_ENABLED="true"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="BPxxx..."
VAPID_PRIVATE_KEY="xxx..."
VAPID_SUBJECT="mailto:admin@tudominio.com"
```

Ver `sk-notifications` para la integración completa.

### E2E Testing (Neon Branching)

```bash
pnpm setup:e2e   # Configuración interactiva
pnpm test:e2e    # Ejecutar tests
```

Ver [`sk-e2e`](../skills/sk-e2e/SKILL.md) para detalles.

### Deploy a Vercel

> 🔴 **Crea el proyecto Vercel importando el repo de GitHub desde el dashboard** ([vercel.com/new](https://vercel.com/new) → Import Git Repository). Vercel auto-detecta Next.js y configura el builder correcto.
>
> **NO uses `vercel project add` / `vercel link` en un proyecto pelón** — crea el proyecto sin framework detectado, lo que da 404 totales o un build roto. El kit shippea `vercel.json` con `"framework": "nextjs"` como red defensiva, pero el import por dashboard es la vía correcta.
>
> **Next 16:** el route-gating + correlation-ID vive en **`src/proxy.ts`** (no en un `middleware.ts` raíz — ese shim regresa el bundling Edge y rompe el build de Vercel con next-auth v5). El kit ya viene con `src/proxy.ts`; no lo renombres a `middleware.ts`.

---

## Feature Flags Auth

Control granular de features vía env vars:

```env
NEXT_PUBLIC_AUTH_PASSWORD="true"        # Login con password (default: true)
NEXT_PUBLIC_AUTH_MAGIC_LINK="false"     # Magic link (requiere email)
NEXT_PUBLIC_AUTH_REGISTRATION="true"    # Registro público (default: true)
NEXT_PUBLIC_AUTH_PASSWORD_RESET="true"  # Password reset (default: true)
NEXT_PUBLIC_AUTH_EMAIL_VERIFY="false"   # Verificación de email
NEXT_PUBLIC_AUTH_LOGIN_ALERT="false"    # Alerta de login (requiere notificaciones)
```

---

## 🧹 Preparar para Producción: Personalizar Template

El Starter Kit incluye páginas **placeholder** que deben personalizarse al portar a un proyecto real.

### Checklist de Limpieza

#### 1. Renombrar el paquete (`package.json#name`)

Cambiar el campo `"name"` de `package.json` (hoy `timekast-starter-kit`) por el slug de tu proyecto. Es lo primero al portar el template: el nombre del paquete aparece en logs, scripts y el lockfile.

#### 2. Limpiar Navegación

En `src/config/navigation.ts`, buscar y eliminar items con `// TEMPLATE:` (si los hay) y agregar las rutas de tu proyecto.

#### 3. Personalizar Dashboard

Reemplazar el contenido placeholder en `src/app/(protected)/dashboard/page.tsx` con widgets y datos de tu aplicación.

#### 4. Personalizar Settings General

`src/app/(protected)/settings/general/page.tsx` usa un `ShowcasePlaceholder`. Reemplazar con la implementación real de configuración.

#### 5. Reemplazar Landing Page

La landing page en `src/app/page.tsx` es genérica. Reemplazarla con el landing de tu proyecto.

#### 6. Actualizar Legal Pages

Configurar las env vars para las páginas legales:

```env
NEXT_PUBLIC_COMPANY_NAME="Tu Empresa"
NEXT_PUBLIC_COUNTRY="México"
NEXT_PUBLIC_LEGAL_EMAIL="legal@tuempresa.com"
NEXT_PUBLIC_PRIVACY_EMAIL="privacy@tuempresa.com"
```

#### 7. Personalizar Branding

> **SSOT:** `src/config/branding.ts`

**Logo de app** (whitelabel):

```env
# Logo para temas claros (fondo blanco)
NEXT_PUBLIC_CLIENT_LOGO_LIGHT="/assets/mi-cliente/logo-dark.png"
# Logo para temas oscuros (fondo oscuro)
NEXT_PUBLIC_CLIENT_LOGO_DARK="/assets/mi-cliente/logo-light.png"
```

Specs: PNG transparente, ~400-600px ancho (ratio 4:1). Ubicar en `public/assets/[cliente]/`.
Si no hay logo configurado, se muestra el nombre de la app como texto.

**Favicon:** Reemplazar `src/app/icon.png` (32×32, fondo transparente).

**PWA Icons:** Reemplazar archivos en `public/pwa/` (icon-192.png, icon-512.png, apple-touch-icon.png). Fondo **opaco** (iOS requiere esto).

**Colores:** Ajustar las variables CSS del skin activo en `src/app/skins/*.css` (desde v11; en apps pre-v11 viven inline en `globals.css`) + `NEXT_PUBLIC_THEME_COLOR` y `NEXT_PUBLIC_BG_COLOR`. Para cambiar de skin completo → swap del `@import` en `globals.css` (ver [`sk-skins`](../skills/sk-skins/SKILL.md)).

---

## Estructura del Proyecto

```
mi-proyecto/
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (auth)/         # Auth pages (login, register, reset)
│   │   ├── (protected)/    # Dashboard pages (auth required)
│   │   │   ├── dashboard/  # Dashboard principal
│   │   │   ├── settings/   # Settings (profile, users, general)
│   │   │   └── notifications/ # Centro de notificaciones
│   │   ├── (legal)/        # Privacy, Terms
│   │   └── api/            # API routes
│   └── config/             # Branding, roles, navigation, notificaciones
│
├── src/lib/                    # Business logic
│   ├── db/                 # Drizzle ORM (schema, migrations, helpers)
│   ├── auth/               # Auth (NextAuth config, RBAC, super admin)
│   ├── actions/            # Server Actions (CRUD helpers)
│   ├── notifications/      # Notification service
│   ├── email/              # Email service + templates
│   ├── hooks/              # Custom hooks
│   └── utils/              # Utilities (cn, humanId, logger)
│
├── src/components/             # React components
│   ├── ui/                 # Base components (shadcn + custom)
│   ├── form/               # Form Kit (FormField, FormSelect, etc.)
│   ├── layout/             # Header, Sidebar, BottomNav
│   ├── notifications/      # NotificationBell, Panel, Settings
│
├── docs/                   # Documentation
│   ├── guides/             # How-to guides
│   └── reference/          # Reference docs (features, catalog, etc.)
│
└── tests/                  # Tests
    ├── unit/               # Vitest unit tests
    ├── e2e/                # Playwright E2E tests
    └── fixtures/           # Test helpers (auth, cleanup)
```

---

## Scripts Disponibles

### Development

```bash
pnpm dev              # Dev server (Turbopack, port 3000)
pnpm build            # Production build
pnpm start            # Start production server
```

### Quality

```bash
pnpm lint             # ESLint
pnpm typecheck        # TypeScript
pnpm format           # Prettier
pnpm verify           # All of the above + tests
```

### Testing

```bash
pnpm test             # Vitest (unit tests)
pnpm test:e2e         # Playwright (E2E con Neon branching — única vía; ver --help)
pnpm test:coverage    # Coverage report
pnpm setup:e2e        # Setup E2E en CI (Neon + GitHub)
```

### Database

```bash
pnpm db:generate      # Generar archivos de migración
pnpm db:migrate       # Aplicar migraciones (⭐ PREFERIDO)
pnpm db:push          # Push directo (⚠️ solo dev local, sin migración)
pnpm db:studio        # Abrir Drizzle Studio
pnpm db:seed          # Correr seeds del proyecto (no crea admin)
pnpm invite:admin --email=…   # Crear el super_admin vía invite (sin password en claro)
```

---

## TimeKast Factory Workflows

El Starter Kit incluye la metodología TimeKast Factory para desarrollo AI-first. Comandos disponibles: `/discovery`, `/design`, `/backlog`, `/implement`, `/deploy`, `/handoff`, `/continue`, `/pdf`.

### Bootstrap (Nuevo Proyecto)

```
/discovery → /design → /backlog → /implement
```

### Development (Diario)

```bash
/implement EPIC-NN      # Implementar un epic completo (o /implement ISSUE-ID para un fix puntual)
/backlog validar        # Validar drift del backlog vs discovery/design
/handoff                # Destilar el estado de la sesión antes de /clear
/continue               # Retomar la sesión desde el último handoff
```

---

## Resources

- 📖 [`sk-features-index`](../skills/sk-features-index/SKILL.md) — Catálogo runtime de features del SK
- 🧩 [`sk-ui`](../skills/sk-ui/SKILL.md) — Primitivos kit-shipped + recetas responsive (§11)
- 🏆 [`sk-crud-scaffold`](../skills/sk-crud-scaffold/SKILL.md) — Patrón gold standard para módulos CRUD
- 🔐 [`sk-security`](../skills/sk-security/SKILL.md) — Seguridad del kit (auth, RBAC, headers)
- 🔔 [`sk-notifications`](../skills/sk-notifications/SKILL.md) — Sistema de notificaciones
- 🚀 [Vercel Docs](https://vercel.com/docs) — Deploy a Vercel
- ⚙️ [`sk-pwa`](../skills/sk-pwa/SKILL.md) — Service Worker (Serwist) y ciclo de vida
- 🎨 [`sk-tokens-neomorphism`](../skills/sk-tokens-neomorphism/SKILL.md) — Tokens + theming (3 themes)
- 📧 [Resend Docs](https://resend.com/docs) — Email deliverability
- 🧪 [`sk-e2e`](../skills/sk-e2e/SKILL.md) — Playwright + Neon branching
- 🧩 [Extender el kit](./extending-the-kit.md) — agregar skills `pj-*` y revisar hooks propios sin chocar con el kit
- 🔧 [Troubleshooting](./troubleshooting.md) — Problemas comunes

---

_TimeKast Starter Kit — Getting Started v2.0_
