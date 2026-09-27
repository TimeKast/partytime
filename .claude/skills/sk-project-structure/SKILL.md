---
name: sk-project-structure
description: Kit-shipped project structure convention for the TimeKast Starter Kit — `src/` layout, the Shared vs Domain classification rule (Shared never imports Domain, Domain never imports Domain), feature-slice extraction criteria, path aliases (`@/components/*`, `@/lib/*`, `@/config/*`), and the "where does this file go?" decision table. Use when adding a new file, refactoring directories, creating a feature slice, or auditing code location.
last-verified: 2026-09-22
user-invocable: false
---

# sk-project-structure — Kit-Shipped Project Structure

> **SSOT:** Dónde va cada cosa en un proyecto TimeKast Factory.
> **Para:** Developers y agentes AI.
> **Regla corta always-on:** ver `SK.md §6 Project Structure`. Esta skill carga el detalle completo on-demand.

---

## Estructura del Proyecto

```
proyecto/
├── src/                          # 🔵 Todo el código de la aplicación
│   ├── app/                      # Next.js App Router (pages, layouts, API routes)
│   ├── components/               # Componentes React
│   │   ├── ui/                   # DOS clases: primitivas de terceros (shadcn/Radix) + componentes propios del kit nacidos ahí (SK.md §3.3)
│   │   ├── common/               # Reutilizables (ErrorBoundary, Footer, etc.)
│   │   ├── layout/               # Shell (Sidebar, Header, BottomNav)
│   │   ├── form/                 # Form primitives (FormField, FormSelect)
│   │   ├── branding/             # Logo, marca
│   │   ├── providers/            # React providers (Theme, etc.)
│   │   ├── {feature}/            # Por feature (admin/, dashboard/, notifications/)
│   │   └── pwa/                  # PWA components (install toast, update toast)
│   ├── lib/                      # Lógica de negocio y utilidades
│   │   ├── actions/              # Server Actions (Next.js)
│   │   ├── auth/                 # Autenticación (NextAuth)
│   │   ├── db/                   # Base de datos (Drizzle ORM)
│   │   │   ├── schema/           # Schemas Drizzle (SSOT de datos)
│   │   │   ├── migrations/       # Migraciones SQL generadas
│   │   │   ├── helpers/          # Helpers de DB (audit fields, soft delete)
│   │   │   ├── queries/          # Queries reutilizables
│   │   │   └── seeds/            # Data de seed
│   │   ├── email/                # Email service + templates
│   │   ├── hooks/                # Custom React hooks
│   │   ├── utils/                # Utilidades puras (cn, human-id, etc.)
│   │   ├── validations/          # Schemas Zod (derivan de Drizzle)
│   │   ├── contexts/             # React Contexts
│   │   ├── notifications/        # Notification service
│   │   ├── invites/              # Invite token logic
│   │   └── pwa/                  # PWA utilities
│   ├── features/                 # 🟡 Feature slices (OPCIONAL — ver reglas abajo)
│   │   └── {domain}/             # Ej: user-admin/, billing/, etc.
│   │       ├── components/       # Componentes del dominio
│   │       ├── hooks/            # Hooks del dominio
│   │       ├── actions/          # Server Actions del dominio
│   │       ├── validations/      # Schemas Zod del dominio
│   │       └── types.ts          # Tipos locales del dominio
│   └── config/                   # Configuración runtime de la app
│       ├── app.ts                # APP_CONFIG (nombre, empresa, URLs)
│       ├── roles.ts              # Definición de roles y jerarquía
│       ├── navigation.ts         # Sidebar, BottomNav, routing
│       ├── branding.ts           # Colores, metadata visual
│       ├── auth-features.ts      # Feature flags de auth
│       ├── mfa.ts                # Config de MFA / step-up
│       ├── notifications.ts      # Config de notificaciones
│       ├── enums.ts              # Registro de columnas enum (text() del schema)
│       ├── skins.ts              # Registro de skins + skin activo
│       └── status.ts             # Estados de entidades
├── types/                        # 🟠 TypeScript declarations (*.d.ts)
├── tests/                        # 🟢 Tests (unit, e2e)
├── project/                      # 📋 Docs del proyecto (planning, backlog, reference autogen, reports)
├── docs/                         # 📄 Entregables al cliente final (manuales, runbooks)
├── .claude/                      # 🤖 Rules, skills, agents, commands
├── scripts/tools/                # 🔧 Scripts de tooling
├── public/                       # 📁 Assets estáticos
└── [config files]                # ⚙️ Tooling root (tsconfig, eslint, etc.)
```

---

## Shared vs Domain: Clasificación de Código

> 🎯 **Todo código pertenece a una de dos categorías.** Esto evita que agentes metan lógica de negocio donde no toca.

| Categoría            | Qué contiene                                              | Dónde vive                                                                                                              |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Shared / Infra**   | UI primitivos, layout shell, utilities, config, providers | `src/components/ui/`, `src/components/common/`, `src/components/layout/`, `src/lib/utils/`, `src/config/`               |
| **Domain / Feature** | Lógica de negocio específica de un feature                | `src/components/{feature}/`, `src/lib/actions/{feature}/`, `src/lib/validations/{feature}/`, o `src/features/{domain}/` |

**Regla:** El código **Shared** no importa del código **Domain**. El código **Domain** sí puede importar del **Shared**.

```
Shared ←── Domain puede importar Shared
Shared ──→ Domain NUNCA (Shared no conoce features)
Domain ──→ Domain PROHIBIDO (si dos features comparten algo, extraerlo a Shared)
```

---

## Feature Slices (Patrón Opcional)

> 🟡 `src/features/` es una **capa opcional** para cuando un dominio crece.

### Cuándo usar `features/`

Extraer a `src/features/{domain}/` cuando un dominio ya tiene **suficiente peso propio** — normalmente 5+ archivos repartidos en 3+ capas, o cuando la cohesión del dominio mejora claramente al agruparlo.

| Señal                                                             | Acción                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Dominio pequeño (pocos archivos, 1-2 capas)                       | Dejar en global (`components/{feature}/` + `lib/actions/`) |
| Dominio con peso propio (5+ archivos, 3+ capas, o cohesión clara) | Extraer a `features/{domain}/`                             |

### Estructura de un feature slice

```
src/features/user-admin/
├── components/           # UserTable, UserForm, etc.
├── hooks/                # useUserFilters, etc.
├── actions/              # Server Actions del dominio
├── validations/          # Schemas Zod del dominio
├── __tests__/            # Unit tests co-located
└── types.ts              # Tipos locales del dominio (no derivados automáticamente)
```

### Reglas

- Feature slices son **autocontenidos** — no importan de otros features
- Pueden importar de **Shared** (`components/ui/`, `lib/utils/`, `config/`)
- `lib/db/schema/` sigue siendo **global** (SSOT de datos, no se mueve a features)
- Al crear un feature slice, **mover** archivos del global, no duplicar
- **Tests:** Unit tests van en `__tests__/` dentro del feature. E2E siempre en `tests/e2e/`

### Evolución recomendada

1. Empezar con `components/{feature}/` + `lib/actions/` + `lib/validations/`
2. Cuando el dominio crece, moverlo a `src/features/{domain}/`
3. Mover también sus unit tests a `src/features/{domain}/__tests__/`
4. **Nunca** duplicar archivos entre global y feature slice

---

## Aclaraciones: Zonas Grises

### `lib/contexts/` vs `components/providers/`

| Carpeta                 | Qué contiene                                                      | Ejemplo                              |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| `lib/contexts/`         | **Define** React Contexts (createContext + hook)                  | `BreadcrumbContext.tsx`              |
| `components/providers/` | **Compone** providers listos para montar en el árbol UI/app shell | `Providers.tsx`                      |

### `types/` raíz vs `types.ts` en features

| Ubicación                    | Qué contiene                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `types/` (raíz)              | Solo declaraciones globales, module augmentation, `*.d.ts`         |
| `features/{domain}/types.ts` | Tipos locales del dominio, no derivados automáticamente del schema |

---

## Scope de `lib/`: Qué Va y Qué No

> `lib/` es el corazón de la lógica técnica. Para evitar que se convierta en "cajón de sastre":

### ✅ SÍ va en `lib/`

| Tipo                           | Ejemplo                                    |
| ------------------------------ | ------------------------------------------ |
| Lógica de negocio reutilizable | `auth/`, `invites/`, `notifications/`      |
| Integraciones técnicas         | `email/`, `db/`, `pwa/`                    |
| Utilidades puras               | `utils/cn.ts`, `utils/human-id.ts`         |
| Acceso a datos                 | `db/queries/`, `db/schema/`, `db/helpers/` |
| Contratos de validación        | `validations/` (derivan de Drizzle schema) |
| Server Actions                 | `actions/`                                 |
| Custom hooks                   | `hooks/`                                   |
| React Contexts                 | `contexts/`                                |

### ❌ NO va en `lib/`

| Tipo                         | Dónde va en su lugar                                 |
| ---------------------------- | ---------------------------------------------------- |
| Componentes React            | `src/components/`                                    |
| Config visual o runtime      | `src/config/`                                        |
| Código experimental / WIP    | Branch separado o `/tmp/`                            |
| Tipos que duplican el schema | Derivar de Drizzle con `typeof` / `InferSelectModel` |
| Templates de UI              | `src/components/`                                    |
| Scripts de tooling           | `scripts/tools/`                                     |

---

## Tabla de Decisión: ¿Dónde va cada cosa?

> **Default:** `src/components/{feature}/` + `src/lib/actions/` + `src/lib/validations/` es el patrón inicial.
> **Escalation:** Cuando un dominio crece, migrar a `src/features/{domain}/` (ver Evolución Recomendada).

| Tipo de archivo                  | Ubicación                          | Ejemplo                              |
| -------------------------------- | ---------------------------------- | ------------------------------------ |
| Primitivo UI de terceros (shadcn/Radix) — **solo el kit los agrega** | `src/components/ui/` | `button.tsx`      |
| Componente común reutilizable    | `src/components/common/`           | `ErrorBoundary.tsx`                  |
| Componente de feature            | `src/components/{feature}/`        | `UserTable.tsx`                      |
| Componente de layout             | `src/components/layout/`           | `Sidebar.tsx`                        |
| Componente de formulario         | `src/components/form/`             | `FormField.tsx`                      |
| Provider React                   | `src/components/providers/`        | `Providers.tsx`                      |
| Página (route)                   | `src/app/{route}/page.tsx`         | `(protected)/dashboard/page.tsx`     |
| Layout de route                  | `src/app/{route}/layout.tsx`       | `(protected)/layout.tsx`             |
| API Route                        | `src/app/api/{route}/route.ts`     | `api/push/subscribe/route.ts`        |
| Server Action (self-service)     | `src/lib/actions/{module}.ts`      | `profile.ts`                         |
| Server Action (de un dominio)    | `src/lib/actions/{feature}/`       | `admin/user-admin.ts`                |
| Hook custom                      | `src/lib/hooks/`                   | `usePermissions.tsx`                 |
| Utilidad pura                    | `src/lib/utils/`                   | `cn.ts`, `human-id.ts`               |
| Schema DB (Drizzle)              | `src/lib/db/schema/`               | `users.ts`                           |
| Migración SQL (la genera `pnpm db:generate`, nombre automático) | `src/lib/db/migrations/` | `0000_real_sunfire.sql` |
| Query reutilizable               | `src/lib/db/queries/`              | `users.ts`                           |
| Validación (Zod)                 | `src/lib/validations/` (o `{feature}/`) | `profile.ts`, `admin/user-admin.ts` |
| Email template                   | `src/lib/email/templates/`         | `invite-user.ts`                     |
| Config runtime                   | `src/config/`                      | `roles.ts`, `navigation.ts`          |
| Type global (`.d.ts`)            | `types/`                           | `next-auth.d.ts`                     |
| Test unitario (global)           | `tests/unit/`                      | `permissions.test.ts`                |
| Test unitario (feature slice)    | `src/features/{domain}/__tests__/` | `user-admin.test.ts`                 |
| Test E2E (siempre centralizado)  | `tests/e2e/`                       | `user-admin.spec.ts`                 |
| Script de tooling                | `scripts/tools/`                   | `generate-inventory.ts`              |
| Config de tooling                | raíz                               | `tsconfig.json`, `eslint.config.mjs` |

> 🔴 **`src/components/ui/` contiene DOS clases de archivo, y la carpeta no las distingue** (`SK.md §3.3`, enunciado canónico — este documento lo cita, no lo reescribe): primitivas de terceros que el kit adoptó **y** componentes propios del kit que nacieron ahí (el sistema de tablas, el combobox). La tabla de arriba dice dónde va un archivo **nuevo tuyo**, y ahí la respuesta nunca es `ui/`: va a `common/` o a su carpeta de feature. Para decidir si puedes **editar** uno que ya existe, la prueba no es la carpeta sino el archivo — quién declara su contrato de props.

---

## Reglas de Naming

| Tipo             | Convención                                | Ejemplo               |
| ---------------- | ----------------------------------------- | --------------------- |
| Componente React | `PascalCase.tsx`                          | `UserTable.tsx`       |
| Hook             | `camelCase.ts` con prefijo `use`          | `usePermissions.tsx`  |
| Server Action    | `kebab-case.ts`                           | `user-admin.ts`       |
| Utilidad         | `kebab-case.ts`                           | `human-id.ts`         |
| Schema Drizzle   | `kebab-case.ts`                           | `users.ts`            |
| Validación Zod   | `kebab-case.ts` (mismo nombre que action) | `user-admin.ts`       |
| Config           | `kebab-case.ts`                           | `auth-features.ts`    |
| Página Next.js   | `page.tsx` (convención framework)         | `page.tsx`            |
| Test unitario    | `{nombre}.test.ts`                        | `permissions.test.ts` |
| Test E2E         | `{nombre}.spec.ts`                        | `user-admin.spec.ts`  |

### Reglas de subcarpetas

- Crear subcarpeta cuando hay **3+ archivos** relacionados
- No crear subcarpeta para un solo archivo
- Feature folders: `src/components/{feature}/` cuando hay 2+ componentes del feature

---

## Anti-Patrones

| ❌ No hacer                                          | ✅ Hacer en su lugar                          |
| ---------------------------------------------------- | --------------------------------------------- |
| Crear carpetas de app code en raíz                   | Poner dentro de `src/`                        |
| Poner componentes sueltos fuera de `src/components/` | Usar la subcarpeta correcta                   |
| Mezclar config runtime con config tooling            | Runtime → `src/config/`, tooling → raíz       |
| Duplicar utilities en múltiples ubicaciones          | Un solo archivo en `src/lib/utils/`           |
| Crear subcarpeta para un solo archivo                | Poner en la carpeta padre                     |
| Poner validaciones Zod junto al schema Drizzle       | `src/lib/validations/` separado               |
| Hardcodear valores en componentes                    | Usar `src/config/`                            |
| `types/` dentro de `src/`                            | `types/` en raíz (convención TS para `.d.ts`) |
| Poner componentes React en `lib/`                    | Siempre en `src/components/`                  |
| Poner config visual en `lib/`                        | Siempre en `src/config/`                      |
| Crear `features/` con < 5 archivos                   | Dejar en global hasta que crezca              |
| Importar entre features                              | Features no se conocen entre sí               |

---

## Path Aliases

| Alias            | Resuelve a           | Uso                        |
| ---------------- | -------------------- | -------------------------- |
| `@/components/*` | `./src/components/*` | Componentes React          |
| `@/lib/*`        | `./src/lib/*`        | Lógica de negocio          |
| `@/config/*`     | `./src/config/*`     | Config runtime             |
| `@/*`            | `./src/*`            | Catch-all (dentro de src/) |

Los imports **siempre** usan aliases `@/`:

```typescript
// ✅ Correcto
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { APP_CONFIG } from '@/config/app';

// ❌ Incorrecto
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils/cn';
```

---

## Convención de Separación

| Categoría             | Ubicación  | Ejemplo                              |
| --------------------- | ---------- | ------------------------------------ |
| **App code**          | `src/`     | Componentes, actions, hooks          |
| **Type declarations** | `types/`   | `*.d.ts` globales                    |
| **Tests**             | `tests/`   | Unit + E2E                           |
| **Project docs**      | `project/` | Planning, backlog, reference autogen, reports |
| **Client deliverables** | `docs/`  | Manuales y runbooks del cliente final |
| **Rules / Skills**    | `.claude/` | Rules, skills, agents, commands      |
| **Tooling scripts**   | `scripts/tools/` | Generadores, tools             |
| **Tooling config**    | raíz       | `tsconfig.json`, `eslint.config.mjs` |
| **Static assets**     | `public/`  | Imágenes, icons                      |

---

_TimeKast Starter Kit — Project Structure (kit-shipped, on-demand)_
