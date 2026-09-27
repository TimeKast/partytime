---
name: sk-navigation
description: Kit-shipped navigation system for the TimeKast Starter Kit — `NavItem` interface, helpers (`filterNavigationByRole`, `getBottomNavItems`, `getMoreSheetItems`), `Sidebar`/`BottomNav`/`BottomNavMoreSheet` components, RBAC runtime filtering, badge integration, iOS safe-area handling, scroll reset on route change (`ScrollToTop`). Single config lives in `src/config/navigation.ts`. Invoke when adding or modifying nav items.
last-verified: 2026-09-22
user-invocable: false
---

# sk-navigation — Kit-Shipped Navigation System

> Config-driven navigation, RBAC filtering at the config layer, and the mobile bottom-nav + desktop sidebar composition are all decided here — this skill is the kit-shipped implementation and its only reference.

Navigation en el TimeKast Starter Kit se maneja por **configuración declarativa única** en `src/config/navigation.ts`. Tres componentes (`Sidebar`, `BottomNav`, `BottomNavMoreSheet`) consumen el mismo array vía helpers. Nunca hardcodear items en componentes.

> **Registry anchors** — items canónicos viven en [`src/config/navigation.ts`](../../../src/config/navigation.ts); helpers exportados y componentes layout están indexados en [`project/reference/HOOKS.md`](../../../project/reference/HOOKS.md) + [`project/reference/INVENTORY.md`](../../../project/reference/INVENTORY.md). Esta skill enseña el **patrón** — los nombres exactos y signaturas son autogen, no los enumeres manualmente.

---

## 1. `NavItem` interface — SSOT

Definido en `src/config/navigation.ts`. Todos los campos más allá de `name`, `href`, `icon` son opcionales.

| Campo            | Tipo              | Consumido por      | Semántica                                                                                                                                                  |
| ---------------- | ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | `string`          | Todos              | Label visible (UI en es-MX)                                                                                                                                |
| `href`           | `string`          | Todos              | Ruta Next.js                                                                                                                                               |
| `icon`           | `LucideIcon`      | Todos              | Import desde `lucide-react`                                                                                                                                |
| `children`       | `NavItem[]`       | Sidebar, Más sheet | Sub-items (solo con `collapsible: true`)                                                                                                                   |
| `collapsible`    | `boolean`         | Sidebar            | Renderiza como sección expandible con chevron                                                                                                              |
| `roles`          | `string[]`        | Todos (RBAC)       | Restringe a roles específicos. Omitir = visible para todo usuario autenticado. Usar constantes de `@/config/roles` (`ROLES.ADMIN`, etc.)                   |
| `bottomNav`      | `boolean`         | BottomNav          | Muestra como tab primario en mobile. **Máx 4 items** — el 5° slot es "Más" auto-generado                                                                   |
| `bottomNavOrder` | `number`          | BottomNav          | Orden left-to-right (menor = más a la izquierda). Solo si `bottomNav: true`                                                                                |
| `bottomNavLabel` | `string`          | BottomNav          | Label corto para tab (≤10 chars recomendado). Fallback → `name`                                                                                            |
| `bottomNavHref`  | `string`          | BottomNav          | Override del `href` en BottomNav. Útil para `collapsible` sin página propia (ej: `/settings` → `/settings/general`)                                        |
| `bottomNavOnly`  | `boolean`         | Todos              | Oculto del Sidebar; solo aparece en BottomNav + Más sheet. Útil cuando desktop ya lo expone por otro medio (ej: Perfil vía avatar menu)                    |
| `featureFlag`    | `'notifications'` | Todos              | Feature flag key. Item oculto si la feature está disabled. Actualmente soporta `'notifications'` (checkeado via `isNotificationsEnabled()` en `@/lib/env`) |

---

## 2. Config SSOT — `src/config/navigation.ts`

Un archivo, un array exportado (`navigation: NavItem[]`), tres helpers. Todo lo visible en la app sale de aquí.

```ts
import { navigation, filterNavigationByRole } from '@/config/navigation';
```

**Regla:** agregar o mover un item = editar `navigation.ts`. Nunca editar `Sidebar.tsx` o `BottomNav.tsx` para agregar un link.

---

## 3. Helper functions

Definidos en el mismo `src/config/navigation.ts`. Stateless, puros, fáciles de testear.

| Helper                                     | Signature                           | Consumido por      | Comportamiento                                                                                                                   |
| ------------------------------------------ | ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `filterNavigationByRole(items, userRole?)` | `(NavItem[], string?) => NavItem[]` | Sidebar            | Filtra por `roles`, excluye `bottomNavOnly`, remueve collapsibles sin children visibles, aplica filtering recursivo a `children` |
| `getBottomNavItems(items, userRole?)`      | `(NavItem[], string?) => NavItem[]` | BottomNav          | Filtra `bottomNav: true` por `roles`, ordena por `bottomNavOrder`, slice max 4                                                   |
| `getMoreSheetItems(items, userRole?)`      | `(NavItem[], string?) => NavItem[]` | BottomNavMoreSheet | Filtra por `roles` + `featureFlag`, preserva parent-child groups, remueve collapsibles vacíos. Incluye TODO (no solo overflow)   |

Internamente, `filterNavigationByRole` y `getMoreSheetItems` comparten lógica: roles + feature flag gating + limpieza de collapsibles vacíos.

---

## 4. Componentes shipped — `@/components/layout`

Todos son Client Components (`'use client'`) — usan `usePathname()` para active state.

| Componente           | Archivo                                        | Breakpoint | Qué hace                                                                                                                                                        |
| -------------------- | ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sidebar`            | `src/components/layout/Sidebar.tsx`            | `≥lg`      | Fixed left rail, 240px wide. Branding top + nav scrollable middle + TimeKast logo footer. Collapsibles con chevron (estado local). Active item = `surface-inset-sm` (legacy pre-v11: the `.neo-*` vocab) |
| `BottomNav`          | `src/components/layout/BottomNav.tsx`          | `<lg`      | Fixed bottom tab bar. Max 4 tabs + "Más" button (LayoutGrid icon). Respeta `env(safe-area-inset-bottom)`. Active = inset elevation                              |
| `BottomNavMoreSheet` | `src/components/layout/BottomNavMoreSheet.tsx` | `<lg`      | Overflow sheet animado (framer-motion spring). Grid 3 columnas. Top-level items (flat) + grouped items (section header + children grid). Backdrop cerrable      |

**Assembly:** `DashboardShell` (`src/app/(protected)/DashboardShell.tsx`) monta los tres junto con `Header`. Todos reciben `userRole?: string` desde el server (session).

> ℹ️ **`Header` es hardcoded en `DashboardShell`** — breadcrumb + avatar menu + theme toggle + notification bell se renderizan directamente, **no consumen `navigation.ts`**. Si agregas un ítem global del shell (ej: shortcut en el header), edita `DashboardShell.tsx`/`Header.tsx`, no `navigation.ts`.

### 4.1 Scroll reset al navegar — `ScrollToTop`

El reset de scroll del App Router se salta cuando un layout compartido mantiene un header fijo en pantalla: su heurística ve el contenido entrante ya dentro del viewport y conserva el offset anterior. `DashboardShell` es exactamente esa forma, así que sin corrección la pantalla nueva aparece a media altura.

`ScrollToTop` (`src/components/common/ScrollToTop.tsx`) es un client component que retorna `null` y se monta **una sola vez en el root layout** (`src/app/layout.tsx`) — no en `DashboardShell`, para que las pantallas `(auth)` y `(legal)` hereden el mismo comportamiento.

Las tres condiciones en las que **no** scrollea son parte del contrato, no defensividad:

| Caso                                    | Por qué se salta                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Cambia solo el query string             | Filtros/paginación re-renderizan la misma pantalla — brincar al top pierde el lugar |
| La URL trae hash                        | El kit deep-linkea a anchors (`/profile#mfa-enroll`, `#push-devices`) — gana el hash |
| Back/forward (`popstate`) o primer paint | El navegador restaura el offset previo, que es lo esperado al volver a una lista     |

```
❌ Montar ScrollToTop dentro de DashboardShell → (auth)/(legal) se quedan sin el reset
❌ Depender de useSearchParams() en el effect → cada filtro brinca al top
✅ Un solo montaje en el root layout, keyed en pathname
```

> **Derivado con `src/` frozen:** el `src/` nace congelado y `factory update` nunca lo toca (`BR-FACTORY-006`). Un proyecto bootstrapeado antes de que el kit trajera el componente lo adopta a mano: copiar el archivo + montar `<ScrollToTop />` en su root layout.

---

## 5. RBAC runtime filter

RBAC se aplica en cada render de navegación, server-side cuando el `userRole` viene de la session (`auth()`), propagado client-side como prop.

```ts
// DashboardShell (server) lee session y pasa userRole
<Sidebar userRole={session.user.role} />
<BottomNav userRole={session.user.role} />
```

**Reglas del filtro:**

- `roles` omitido o array vacío → visible para todos los autenticados
- `roles: [ROLES.ADMIN]` → solo si `userRole === 'admin'`
- Children heredan el check recursivamente
- Collapsibles que quedan sin children visibles post-filter → auto-removidos

**⚠️ No es autorización.** El filter esconde items, no bloquea rutas. La ruta debe protegerse en su propio layout/page con `requirePermission()` o el proxy de auth (`src/proxy.ts` → `authorized()`, ver [`sk-security`](../sk-security/SKILL.md)).

---

## 6. Badge integration — notifications

`BottomNav` y `BottomNavMoreSheet` integran el hook `useNotifications` (`@/lib/hooks/useNotifications`) para mostrar badge de unread count.

```ts
const { unreadCount } = useNotifications();
const showBadge = isNotificationsEnabled() && unreadCount > 0;
const badgeText = unreadCount > 9 ? '9+' : String(unreadCount);
```

**Dónde aparece el badge:**

| Location                                 | Cuándo                                                              |
| ---------------------------------------- | ------------------------------------------------------------------- |
| BottomNav → botón "Más"                  | Agregado de todos los unread (siempre que haya cualquiera)          |
| BottomNavMoreSheet → item Notificaciones | Específicamente en el item con `featureFlag: 'notifications'`       |
| Header bell (desktop)                    | `NotificationPanel` — tiene su propio badge (fuera de este sistema) |

Ver [`sk-notifications`](../sk-notifications/SKILL.md) para el pipeline completo de unread counts y realtime.

---

## 7. Safe-area insets (edge-to-edge / iOS notch)

**Las PWA del kit corren edge-to-edge por diseño.** El switch maestro es `viewportFit: 'cover'` en el `export const viewport` de `src/app/layout.tsx`: deja que la app pinte la pantalla completa — bajo el notch / Dynamic Island y sobre la home indicator. Eso activa los `env(safe-area-inset-*)`; el shell reserva esas zonas con utilities tokenizadas en `src/app/globals.css` (no hardcodear el `calc()` inline por componente).

| Utility           | Aplica en                      | Valor                                                          | Por qué                                                                              |
| ----------------- | ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pt-safe`         | `Header` (`<header>`)          | `env(safe-area-inset-top, 0px)`                               | Empuja el contenido del header debajo del notch / status bar                         |
| `h-header-safe`   | `Header` (`<header>`)          | `calc(var(--header-height) + env(safe-area-inset-top))`       | El fondo del header sangra hasta el borde superior; el contenido queda bajo el notch |
| `pt-content-safe` | `DashboardShell` (`<main>`)    | `calc(var(--header-height) + env(safe-area-inset-top))`       | Reserva clearance arriba = alto del header + safe area                               |
| `pb-nav-safe`     | `BottomNav` (`<nav>`), y todo lo pegado al borde inferior | `max(calc(env(safe-area-inset-bottom, 0px) - var(--viewport-bottom-gap)), 0px)` | Sube las tabs sobre el home indicator — **menos** lo que el teclado de iOS recortó de lo visible (ver abajo) |
| `pb-content-safe` | `DashboardShell` (`<main>`)    | `calc(var(--bottom-nav-height) + env(safe-area-inset-bottom))`| Reserva clearance abajo = alto del nav + safe area → el contenido nunca queda tapado |

```tsx
// Header — bleed bajo el notch, contenido por debajo, y SIGUE a la parte visible
<header className="... pt-safe h-header-safe fixed top-(--viewport-offset-top) ..." />

// BottomNav — sobre el home indicator; con teclado abierto SE ESCONDE (no lo sigue)
<nav className="... pb-nav-safe fixed bottom-0 ..." data-hides-for-keyboard="" />

// DashboardShell (<main>) — clearance arriba+abajo (pareja con lg:* en desktop)
<main className="... pt-content-safe pb-content-safe lg:ml-60 lg:pb-0" />
```

> **Tokens de alto:** `--header-height` y `--bottom-nav-height` (`globals.css`, default `4rem`) acoplan el clearance del contenido al alto real del chrome — ajústalos ahí, no en dos lados. Las utilities usan `@utility` de Tailwind v4 (no clase plana) para que las variantes (`lg:pb-0`, `lg:ml-60`) sigan ganando en desktop. En desktop `env()` = 0, así que `h-header-safe`/`pt-content-safe` colapsan a `--header-height` exacto (sin regresión).
>
> 🔴 **Con el teclado abierto el nav se esconde; no lo sigue.** `useViewportInsets` pone `data-keyboard="open"` en `<html>` cuando hay un campo de texto enfocado **y** lo visible se encogió más de lo que la barra de Safari puede encoger (las dos condiciones, medidas en iPhone 2026-09-12); una regla plana de `globals.css` oculta todo `[data-hides-for-keyboard]` mientras dure. Cualquier cosa pegada al borde inferior que no tenga sentido mientras se escribe lleva el mismo atributo. Seguir al teclado con `bottom-(--viewport-bottom-gap)` se probó y flota a media pantalla: el gap ignora `vv.offsetTop` (medido: gap 338, offsetTop 195). Es una regla plana y no la variante `in-data-[keyboard=open]:hidden` porque Safari en iOS no aplicó el `&`-nesting que esa variante emite.
>
> `BottomNavMoreSheet` mantiene su propio `calc(1.5rem + env(safe-area-inset-bottom, 0px))` inline (padding mayor intencional para un sheet); ya es safe-area aware.

> ⚠️ **Edge-to-edge es global:** con `viewport-fit=cover` prendido, **cualquier** elemento `fixed`/`absolute` pegado a un borde (sheets, toasts, FABs, overlays custom) debe respetar el inset correspondiente (`pt-safe` / `pb-nav-safe` / `env(safe-area-inset-*)`). Una pantalla nueva se autora safe-area-aware desde el inicio — NO se retrofitea después (ese es el camino doloroso).

### 🔴 El chrome fijo SIGUE a la parte visible — no se queda en `top-0` / `bottom-0`

En iOS el teclado **no encoge la página**: desliza hacia arriba la parte visible (WebKit no
implementa `interactive-widget=resizes-content`, bug 259770). Un `fixed top-0` se va de la
pantalla con ella y un `fixed bottom-0` se queda **detrás de las teclas**, porque el layout
viewport no se movió. `useViewportInsets` (montado en `DashboardShell`) publica esa geometría y
el chrome la consume:

| Variable                   | Qué mide                                                 | Quién la consume                                 |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `--viewport-offset-top`    | Cuánto se deslizó la parte visible (0 en reposo)         | `Header` → `top-(--viewport-offset-top)`         |
| `--viewport-bottom-gap`    | Cuánto más baja es que en reposo (= alto del teclado)    | `BottomNav` → `bottom-…` + `pb-nav-safe`         |
| `--visual-viewport-height` | Cuánto de página se ve                                    | Sin consumidor en el kit — para pantallas que lo necesiten (una región con scroll propio entre header y teclado) |

**En reposo las tres valen su default y el layout es idéntico al de siempre**, así que un
componente nuevo no tiene que saber de esto para funcionar. Sólo tiene que usarlo si se pega a
un borde. El porqué completo, con las mediciones del teléfono, vive en el JSDoc del hook —
léelo antes de tocar la fórmula, sobre todo antes de "simplificar" el acote de `offsetTop`.

> `BottomNavMoreSheet` conserva su `env(safe-area-inset-bottom)` inline y **no** resta el gap:
> es un sheet que se abre por encima, no chrome fijo permanente. Si alguna vez aloja un campo de
> texto, pasa a `pb-nav-safe`.

**Verificación (obligatoria en device real):** el síntoma de safe-area **solo aparece en PWA instalada** (iPhone → pantalla de inicio → abrir desde el ícono). En Safari responsive mode del Mac `env(safe-area-inset-*)` vale 0 y todo se ve "bien" engañosamente. Checklist en iPhone PWA: (1) el header NO se mete bajo el notch, (2) el nav queda cómodo sobre la home indicator, (3) sin scroll horizontal ni rebote, (4) los toasts no quedan tapados por el notch.

---

## 8. Cómo agregar un nav item — checklist

1. **Abrir `src/config/navigation.ts`** (único archivo a tocar para items simples)
2. **Importar el ícono** desde `lucide-react` (ej: `import { BarChart } from 'lucide-react';`)
3. **Agregar al array `navigation`** con los campos apropiados:

   ```ts
   {
     name: 'Reportes',
     href: '/reportes',
     icon: BarChart,
     roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN], // opcional
     bottomNav: true,                           // opcional — máx 4 en total
     bottomNavOrder: 2,                         // si bottomNav
     bottomNavLabel: 'Reportes',                // si ≤10 chars distinto de name
   }
   ```

4. **Si es `collapsible` con children** → `bottomNavHref` apuntando al primer child (evita 404 del parent sin página)
5. **Si es solo mobile** → `bottomNavOnly: true`
6. **Si depende de feature flag** → `featureFlag: 'notifications'` (o extender la union en el interface para nuevos flags)
7. **Verificar que la ruta exista** en `src/app/(protected)/`
8. **Guard real de la ruta:** agregar `requirePermission()` en el layout/page — el nav filter no autoriza

---

## 9. Troubleshooting

### Item no aparece en Sidebar

1. `bottomNavOnly` está en `true` → por diseño, solo aparece en mobile
2. `roles` restringe y el user no matchea
3. `featureFlag` apaga el item
4. Es un collapsible con `children: []` post-filter → auto-removido
5. Cache stale del dev server → `pnpm dev` restart

### Tab no aparece en BottomNav

1. Falta `bottomNav: true`
2. Ya hay 4 items con `bottomNav: true` → el 5° se va al Más sheet (slice en `getBottomNavItems`)
3. `roles` excluye al user
4. `bottomNavOrder` muy alto → reordenar números

### BottomNav tap va a 404

- El `href` apunta a un parent `collapsible` sin página (ej: `/settings`). Agregar `bottomNavHref: '/settings/general'`

### Label truncado en mobile

- `bottomNavLabel` > 10 chars en pantallas de 375px. Usar label más corto o abreviatura

### Badge no aparece

- `isNotificationsEnabled()` retorna `false` (revisar `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`)
- `useNotifications()` no está hidratado (SSE aún no conectó)
- `unreadCount === 0` (no hay mensajes)

### Hydration mismatch en ítems theme-dependent

Síntoma: warning `Hydration failed` o flicker del ícono cuando un ítem cambia según el tema (ej: logo variant, ícono según `resolvedTheme`).

Causa: el server no conoce el tema (viene de `localStorage` / `next-themes`) → el render inicial difiere del cliente.

Fix: gate el render theme-dependent con `useMounted()`:

```tsx
const mounted = useMounted();
if (!mounted) return <PlaceholderIcon />; // o null
return <ThemeAwareIcon theme={resolvedTheme} />;
```

El `useMounted()` hook vive en `@/lib/hooks/useMounted` y retorna `false` en SSR, `true` tras el primer effect. Úsalo solo para el subárbol que depende del tema — no wrappees toda la navegación.

### Contenido tapado por nav/notch en iOS PWA

- El `<main>` usa un `pt-*`/`pb-*` fijo (ej. `pt-16` / `pb-20`) en vez de `pt-content-safe` / `pb-content-safe` → no suma la safe area, el contenido se mete bajo el header o el nav en PWA instalada
- El `<header>` no usa `pt-safe` + `h-header-safe` → su contenido queda bajo el notch / Dynamic Island
- Componente custom `fixed`/`absolute` a un borde que no respeta el inset (usar `pt-safe` / `pb-nav-safe` / `env(safe-area-inset-*)`)
- **En un derivado:** falta `viewportFit: 'cover'` en el `viewport` de `layout.tsx`. El kit lo shippea, pero el `src/` del derivado está frozen — si se bootstrapeó antes de que el kit lo trajera, hay que agregarlo a mano (sin él, todas las `env()` valen 0 y nada de lo anterior tiene efecto)

---

## 10. Anti-patterns (NO hacer)

```
❌ Hardcodear un `<Link>` dentro de Sidebar.tsx o BottomNav.tsx
✅ Agregar al array `navigation` en src/config/navigation.ts

❌ Editar Sidebar.tsx / BottomNav.tsx para cambiar un label o ícono
✅ Editar la entry del NavItem correspondiente

❌ Skipear `roles` y "filtrar después" en el componente
✅ Declarar `roles` en el NavItem — el helper lo aplica uniforme en los 3 componentes

❌ Confiar solo en el nav filter como autorización
✅ El filter oculta la UI; la ruta se protege con requirePermission()/proxy auth (ver sk-security)

❌ Crear un segundo array de navegación para "admin-only items"
✅ Un único `navigation` array + roles por item

❌ Mutar `navigation` en runtime o filtrar fuera de los helpers
✅ Los 3 helpers (filterNavigationByRole, getBottomNavItems, getMoreSheetItems) son la API — usar exclusivamente

❌ Usar `bottomNavOnly` + faltar en Más sheet (item inaccesible)
✅ `bottomNavOnly` implica que aparece en BottomNav o Más sheet — verificar visualmente

❌ Meter más de 4 tabs con `bottomNav: true`
✅ El 5° se va a Más (no rompe, pero oculta intención) — revisar qué debería ser primario
```

---

## Cross-reference

Cross-reference: [`sk-security`](../sk-security/SKILL.md) — RBAC. [`sk-notifications`](../sk-notifications/SKILL.md) — badge counts. [`sk-ui`](../sk-ui/SKILL.md) — componentes relacionados. [`sk-features-index`](../sk-features-index/SKILL.md).
