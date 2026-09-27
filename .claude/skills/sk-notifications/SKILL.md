---
name: sk-notifications
description: Kit-shipped notification infrastructure: the `notify()` server dispatcher, the visibility-aware polling endpoint, the `useNotifications` hook, the bell/panel/settings/push-devices components, per-device push subscriptions, and the categories × channels config in `src/config/notifications.ts`. Invoke when dispatching notifications from server actions or wiring the bell, panel and settings page in-app.
last-verified: 2026-09-22
user-invocable: false
---

# sk-notifications — Kit-Shipped Notification Infrastructure

> Categories × channels, toast-vs-persist, polling-over-SSE and the preference storage shape are decided here — this skill is the kit-shipped implementation and its only reference.

Esta skill documenta la infraestructura **concreta** de notifications que shippea el kit. Todo lo que vive en `@/lib/notifications`, `@/config/notifications`, `@/app/api/notifications/poll`, `@/lib/hooks/useNotifications`, y `@/components/notifications`.

> **Registry anchors** (autogen) — los símbolos importables viven indexados por tipo: `notify`/`notifyMany`/`useNotifications` en [`project/reference/HOOKS.md`](../../../project/reference/HOOKS.md); los componentes (`NotificationBell`, `NotificationPanel`, `PushDevicesList`, …) en [`project/reference/INVENTORY.md`](../../../project/reference/INVENTORY.md); y las server actions (`getPushDevices`, `removePushDevice`) en [`project/reference/API.md`](../../../project/reference/API.md). Config de categorías × canales es SSOT en `src/config/notifications.ts`. Esta skill enseña el **patrón de integración** — no reproduzcas la lista actual de categorías aquí; léela del SSOT.

---

## 1. `notify()` API — server-side dispatcher

**Ubicación:** `@/lib/notifications/service.ts` (re-exportado desde `@/lib/notifications`).

```ts
import { notify, notifyMany } from '@/lib/notifications';

await notify({
  userId: 'uuid',
  title: 'Nuevo documento',
  body: 'Se subió "Contrato Q1.pdf"',
  type: 'info', // info | success | warning | error | system
  category: 'general', // single shipped category — extensible per-app
  url: '/documents/123', // optional deep link
  channels: ['in_app'], // optional override — default viene de category
  expiresAt: undefined, // optional Date — borrado oportunista al cumplirse
  metadata: undefined, // optional Record<string, unknown>
});
```

**Qué hace internamente (`service.ts`):**

1. **Resuelve canales efectivos** — modelo en capas. Por cada canal, gana lo más específico:
   - Si el caller pasa `channels: [...]` a `notify()` (override explícito) → ese set manda. Aún respeta opt-out del user (excepto `in_app`).
   - Si no hay override → por cada canal posible: la preference del user si está guardada en `notification_preferences`; sin preference guardada cae a `defaultChannels` de la categoría (estado inicial). `in_app` siempre se entrega.
   - **Resultado:** cada toggle del UI tiene efecto independiente. `defaultChannels` define ON inicial — no es un gate.
2. **Inserta el record** en tabla `notifications` con `channels: string[]` efectivos.
3. **Dispatch a canales no-in-app:**
   - `email` → `sendEmail()` + template `notificationEmail()` (si `isEmailReady()`).
   - `push` → `sendPush({ userId, title, body, url })` (si `isPushConfigured()`) — itera por todas las `pushSubscriptions` del user (multi-device).
4. **Cleanup piggyback per-user** — un solo paso aplica 3 reglas en orden:
   - Borra notifs con `createdAt < (now - retention.days)`.
   - Borra notifs con `expiresAt` seteado y vencido (`isNotNull` + `lt`).
   - Si todavía quedan más de `retention.maxPerUser`, FIFO drop de las más viejas.

**Por qué piggyback (no cron):** Vercel-friendly (sin scheduled functions extra), users inactivos no incurren queries innecesarias, eventual consistency aceptable porque `maxPerUser` cubre el peor caso. Si el user no genera notifs nuevas, las viejas persisten — el `maxPerUser` actúa como guard.

**Graceful degradation:** errores en email/push se loggean, nunca revientan el `notify()`. El user siempre recibe `in_app`.

`notifyMany({ userIds, ...rest })` — itera `notify()` por user. Cada user resuelve sus propias preferences.

---

## 2. Polling endpoint — `/api/notifications/poll`

**Ubicación:** `src/app/api/notifications/poll/route.ts` → `GET /api/notifications/poll`.

- **Runtime:** serverless default (no `runtime = 'nodejs'`). Sin `runtime = 'edge'` para mantener acceso a `db` Drizzle Node bindings.
- **Auth:** `auth()` de NextAuth — `401` si no hay session.
- **Query:** `Promise.all([items, unreadCount])` — `select` de los 20 más recientes (`PAGE_SIZE`, alineado con `NotificationPanel.MAX_ITEMS`; el dropdown muestra ~6 above-the-fold y scrollea el resto) + `count(*)` con `read = false`.
- **`dynamic = 'force-dynamic'`** para evitar caching estático.

**Response shape:**

```jsonc
{
  "items": [
    {
      "id": "uuid",
      "title": "...",
      "body": "...",
      "type": "info",
      "category": "general",
      "url": "/documents/123",
      "read": false,
      "createdAt": "2026-04-26T...",
    },
  ],
  "unreadCount": 3,
}
```

**Por qué polling y no SSE:**

| Eje                      | SSE (anti-patrón en Vercel)     | Polling 30s (este kit)               |
| ------------------------ | ------------------------------- | ------------------------------------ |
| Costo Vercel runtime     | Wall-clock 100% por user activo | ~1% — solo cuando el cliente pide    |
| Latency notif nueva      | <5s                             | hasta 30s (avg ~15s)                 |
| Multi-tab del mismo user | 1 conexión por tab              | 1 fetch/30s por tab visible          |
| Background tabs          | Conexión sigue                  | Polling pausado (`visibilitychange`) |

**Cuándo SSE sí aplica:** infra con servidores persistentes (Render/Railway/Fly.io con proceso Node always-on que no cobra wall-clock). En Vercel/serverless, polling gana por costo.

---

## 3. Push notifications (VAPID, multi-device)

**Ubicación:** `src/lib/notifications/push.ts`. Library: `web-push`.

**APIs server-side:**

- `sendPush({ userId, title, body, url?, icon? })` — envía a **todas** las subscriptions del user (multi-device). Auto-cleanup de subscriptions con `410 Gone` o `404` (endpoint expiró).
- `subscribePush(userId, { endpoint, keys: { p256dh, auth } }, userAgent?)` — upsert por `endpoint`. Si existe, actualiza `keys` (rotación) y `userId`.
- `unsubscribePush(userId, endpoint)` — borra solo si la subscription pertenece al user (ownership check).

**Server actions UI-facing** (en `@/lib/actions/notifications`):

- `getPushDevices()` → lista de pushSubscriptions del current user (`{ id, endpoint, userAgent, createdAt }[]`).
- `removePushDevice({ id })` → DELETE filtered por `userId` (ownership).

**Env vars requeridas** (de `@/lib/env`):

| Var                            | Propósito                           |
| ------------------------------ | ----------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key para suscribir en client |
| `VAPID_PRIVATE_KEY`            | Private key para firmar (server)    |
| `VAPID_SUBJECT`                | `mailto:` o URL del subject         |

**Tabla:** `pushSubscriptions` (schema Drizzle) con `userId`, `endpoint` (unique), `keys: { p256dh, auth }`, `userAgent`, `createdAt`. **Una row por device** (browser × machine) — endpoint es unique per device.

**Graceful degradation:** `ensureVapidInit()` retorna `false` si `!isPushConfigured()` → todos los métodos son no-op. Si faltan VAPID vars, push se desactiva silenciosamente (in_app + email siguen funcionando).

### 3.1 Patrón per-device en UI (regla durable)

> Push subscriptions son inherentemente per-device. **Nunca confíes solo en preferences globales para el state per-device.** El user puede tener push "ON" en preferences (BD) sin tener subscription registrada en el browser actual — y viceversa.

El kit resuelve esto con `PushDevicesList` (sección 5): listas las subscriptions del user, identifica la actual matcheando `endpoint` contra `registration.pushManager.getSubscription()?.endpoint` local, y permite activar / quitar each por separado.

**El bug que esto evita:** user activa en desktop → desktop crea row en BD + global pref `push: true`. Va al mobile, `usePushSubscription` chequea `pushManager.getSubscription()` (browser local) → `false`. Si la UI solo mostrase el toggle global de la preference, el user vería "ON" sin tener sub real en mobile. La lista per-device hace el state explícito.

---

## 4. Estado compartido — `<NotificationsProvider>` + `useNotifications()`

**Provider (SSOT):** `src/lib/notifications/NotificationsProvider.tsx` — montado UNA vez en `DashboardShell` (`<NotificationsProvider enabled={isNotificationsEnabled()}>`). Es el **single source of truth** del estado de notifications para todo el shell: un solo polling loop + un solo `unreadCount` compartido.

**Hook consumidor:** `src/lib/hooks/useNotifications.ts` — `useContext` del provider. Lo consumen **5 componentes** (`NotificationBell`, `NotificationPanel`, `Header`, `BottomNav`, `BottomNavMoreSheet`). **Throw** si se usa fuera del provider (fail-loud sobre un badge muerto silencioso; el kit ya monta el provider en el shell, así que los consumidores shipped funcionan zero-config).

```ts
const {
  notifications, // Notification[] (newest first)
  unreadCount, // number — COMPARTIDO entre los 5 consumidores
  markAsRead, // (id) => void — optimistic + server action
  markAllAsRead, // () => void — optimistic
  deleteNotification, // (id) => void — optimistic
  isConnected, // boolean — última request OK
  isPending, // boolean — transition in-flight
  refetchNotifications, // () => void — fetch manual
} = useNotifications(); // sin args — `enabled` se pasa al PROVIDER, no al hook
```

**Por qué un provider (no estado per-hook):** antes cada `useNotifications()` tenía su propio `useState` + polling. Con 5 consumidores montados a la vez = 5 polls/30s y 5 counts divergentes — marcar leída en el panel no bajaba el badge del bell hasta el próximo tick (eran instancias distintas). El provider colapsa eso a **1 poll + 1 estado** → el optimistic update se ve en los 5 al instante.

**Flujo (vive en el provider):**

1. **Polling lifecycle** — `setInterval(fetchPoll, 30_000)`. `fetchPoll` hace `GET /api/notifications/poll` con `cache: 'no-store'`.
2. **Visibility-aware** — listener `visibilitychange`. Tab `hidden` → `clearInterval`; vuelve a `visible` → fetch inmediato + reanuda interval.
3. **`inFlightRef` guard** — evita requests concurrentes.
4. **Mutations** — `markAsRead` / `markAllAsRead` / `deleteNotification` via `useTransition` + optimistic update; propaga a los 5 consumidores de inmediato. El próximo poll reconcilia con el server.
5. **Invalidate listener** — el provider **escucha** `notifications:invalidate` (lo emite la página `/notifications` tras sus mutations) → refetch inmediato del badge. El provider **no emite** el evento: el optimistic compartido ya cubre el shell, emitir solo causaría un self-refetch redundante.
6. **`enabled`** — gatea polling **y** listener. El shell pasa `isNotificationsEnabled()` (sin él, el polling correría con notifications off).
7. **Connection state** — `isConnected` `false` cuando un fetch falla. Cosmético — no error toast.

**Trade-off honesto:** notif nueva tarda hasta 30s en aparecer (avg ~15s). Para chat real-time esto NO es aceptable; usa Pusher/Ably/Convex. Para in-app dashboard es OK.

### 4.1 Pull-to-refresh integration (mobile)

La página `/notifications` (`src/app/(protected)/notifications/notifications-client.tsx`) es el ejemplo canónico de **wrapper per-screen + opt-out del shell-wide PTR**. El estado de la lista (items, filtros, paginación) vive como state cliente y se refresca llamando `fetchData(page)` — `router.refresh()` (que dispararía el shell PTR del kit) NO actualizaría esa lista. La pantalla silencia el shell con `useDisableShellPTR()` y maneja el gesto con su propio wrapper.

```tsx
import { PullToRefresh } from '@/components/pwa';
import { useDisableShellPTR } from '@/lib/pwa/shellPullToRefresh';

export function NotificationsClient() {
  useDisableShellPTR(); // silence shell while wrapper is mounted
  // ...
  return (
    <PullToRefresh onRefresh={() => fetchData(page)}>
      <div className="flex flex-col gap-4">{/* contenido ... */}</div>
    </PullToRefresh>
  );
}
```

El kit también shippea un botón "Actualizar" visible junto a las acciones (icon `RefreshCw`), por la a11y rule del componente — PTR es gesture-only y siempre debe acompañar un mecanismo accesible. Detalle del shell-wide default, los otros patrones de callback (hook polling, RSC, server tables), y el opt-out → [`sk-pull-to-refresh`](../sk-pull-to-refresh/SKILL.md).

---

## 5. UI Components

**Ubicación:** `src/components/notifications/` (ver catálogo completo en [`sk-ui`](../sk-ui/SKILL.md)).

| Componente                 | Propósito                                                                      |
| -------------------------- | ------------------------------------------------------------------------------ |
| `NotificationBell`         | Icon + badge con `unreadCount`. Abre `NotificationPanel`.                      |
| `NotificationPanel`        | Lista de notifications recientes. Acciones: mark read, delete.                 |
| `NotificationItem`         | Row individual — `type`-aware styling + `url` deep link.                       |
| `NotificationDetailDialog` | Dialog con full body + metadata.                                               |
| `NotificationSettings`     | Matriz de preferences por `category × channel` + bloque `<PushDevicesList />`. |
| `PushDevicesList`          | Lista de subscriptions per-device. Activa/quita push del current device.       |
| `PushPermissionPrompt`     | UI para pedir `Notification.requestPermission()` + `subscribePush`.            |

> **Primitivas:** `@/components/ui/*` — clasifica el archivo antes de editarlo (`SK.md §3.3`, enunciado canónico): las de terceros no se tocan (componer, no forkear); los componentes propios del kit que viven ahí son otro caso.

### 5.1 Component APIs (top-level)

```ts
// NotificationBell — icon + unread badge
interface NotificationBellProps {
  userRole?: string; // opcional — pass-through desde session para RBAC
  className?: string;
}
// Consume useNotifications() — lee de <NotificationsProvider> (montado en el shell). No requiere props de data.

// NotificationPanel — dropdown list
interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Se monta como popover desde NotificationBell; raramente se usa standalone.
}

// NotificationSettings — preferences matrix + push devices list
interface NotificationSettingsProps {
  pushConfigured: boolean;
  emailConfigured: boolean;
}

// PushDevicesList — self-contained, no props
// Lee getPushDevices() + matchea current endpoint via pushManager.getSubscription().
```

**Usage mínimo (Header desktop):**

```tsx
import { NotificationBell } from '@/components/notifications/NotificationBell';

<Header>
  <NotificationBell userRole={session.user.role} />
</Header>;
```

> Requiere `<NotificationsProvider>` en un ancestro — `DashboardShell` ya lo monta para todas las páginas protegidas. Fuera del shell, `useNotifications()` hace throw (fail-loud, §4).

**Settings page:**

```tsx
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { isPushConfigured, isEmailReady } from '@/lib/env';

export default async function NotificationSettingsPage() {
  await requirePermission('notifications', 'read');
  return (
    <NotificationSettings pushConfigured={isPushConfigured()} emailConfigured={isEmailReady()} />
  );
}
```

---

## 6. Categories × Channels config

**Ubicación:** `src/config/notifications.ts` — **SSOT** de qué categorías existen y qué canales soporta cada una.

**Tipos:**

```ts
export interface NotificationCategory {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  description: string;
  locked: boolean; // user no puede desactivar push/email para esta categoría
  defaultChannels: NotificationChannel[];
  badgeVariant?: 'default' | 'success' | 'error' | 'warning' | 'info';
}
```

**Categoría shipped por default:** **`general`** (unlocked, `defaultChannels: ['in_app']`). El kit ship una sola categoría a propósito — los proyectos derivados extienden.

**Por qué una sola:**

- Evita forzar canales molestos (push/email) bajo `locked: true`. El user del derivado siempre puede opt-out de push/email vía preferences.
- `in_app` siempre es entregado (forzado en `resolveChannels`) — sirve como fallback safe.
- Matrix de preferences queda simple: 1 row × 3 columnas.

**Canales:** `'in_app' | 'push' | 'email'` (`NOTIFICATION_CHANNELS` const).

### 6.1 ¿Qué hace `defaultChannels` exactamente?

`defaultChannels` define qué canales están **ON por default** para una categoría cuando el user nunca tocó esa fila en `NotificationSettings`. Una vez que el user activa o desactiva CUALQUIER toggle de esa categoría, esa preference queda guardada en `notification_preferences` y manda sobre el default — cada canal se resuelve independientemente (§1 step 1).

**No es un gate.** Si una categoría tiene `defaultChannels: ['in_app', 'email']` y el user prende el toggle de push desde `NotificationSettings`, push se entrega normalmente. El default es solo el estado inicial.

**Defaults sanos por categoría — guía:**

| Categoría ejemplo | `defaultChannels` razonable | Razonamiento                            |
| ----------------- | --------------------------- | --------------------------------------- |
| `general`         | `['in_app']`                | Bajo nivel, no merece push ni email     |
| `security`        | `['in_app', 'email']`       | Importante pero no urgente              |
| `sync_alerts`     | `['in_app', 'push']`        | Operativo, push útil; email es ruido    |
| `billing`         | `['in_app', 'email']`       | Legal/papel, email mandatorio por canal |

> **Heurística:** elegí los canales que tendrían sentido si el user nunca abre `NotificationSettings`. No es necesario incluir todos los canales — lo que falte queda OFF por default y el user lo prende si lo quiere.

**Extensión por proyecto:** agregar entry a `NOTIFICATION_CATEGORIES`:

```ts
NOTIFICATION_CATEGORIES.billing = {
  id: 'billing',
  label: 'Facturación',
  icon: 'CreditCard',
  description: 'Pagos y facturas',
  locked: false,
  defaultChannels: ['in_app', 'email'],
  // Initial-ON set. El user puede activar/desactivar push desde
  // NotificationSettings y la preference manda sobre el default.
};
```

**Retention config:** `NOTIFICATION_CONFIG.retention = { days: 30, maxPerUser: 200 }`. Aplicado por el cleanup piggyback del `notify()` (sección 1).

**Helpers:** `getCategory(id)`, `getDefaultChannels(id)`, `isCategoryLocked(id)`, `isValidChannel(ch)`, `isValidNotificationType(t)`.

---

## 6.2 Email footer policy (FACTORY-004)

> Todo email dispatched via `notify()` lleva al pie el link **"Gestionar preferencias de notificación" → `/profile?tab=notifications`**. Transaccionales (auth/security/invites) NO lo llevan — el usuario no puede opt-out de esos flujos.

### Cómo engancharse al helper

El template genérico `notificationEmail()` ya aplica el helper internamente, por lo que **dispatching via `notify()` no requiere acción extra** — el footer aparece automáticamente.

Si vas a crear un template dedicado en `src/lib/email/templates/<categoria>.ts` que también se dispatcha via `notify()`, agrega el footer manualmente:

```ts
import {
  emailLayout,
  notificationPrefsFooter, // HTML version
  notificationPrefsFooterText, // plain-text version
} from './layout';

export function myCategoryEmail(params: MyParams) {
  const content = `
    ${/* contenido específico del template */ ''}
    ${notificationPrefsFooter()}   // ← OBLIGATORIO al final del HTML
  `;
  return { subject, html: emailLayout(content, { preheader: '...' }) };
}

export function myCategoryEmailText(params: MyParams): string {
  const lines = [
    /* líneas del plain-text */
    '',
    notificationPrefsFooterText(), // ← OBLIGATORIO al final del text
  ];
  return lines.join('\n');
}
```

**Signature:**

```ts
notificationPrefsFooter(
  branding?: Partial<EmailBranding>,        // default: defaultBranding
  prefsPath?: string                         // default: '/profile?tab=notifications'
): string

notificationPrefsFooterText(
  prefsPath?: string                         // default: '/profile?tab=notifications'
): string
```

**Override del path:** un derived project que mueve la página de preferences a `/settings/notifications` no forkea el helper — solo pasa el path:

```ts
notificationPrefsFooter({}, '/settings/notifications');
notificationPrefsFooterText('/settings/notifications');
```

### Wire-up en `service.ts` (multipart/alternative)

El dispatcher `notify()` pasa **ambos** `html` y `text` a `sendEmail()` para que el plain-text footer también llegue al recipient (algunos clientes prefieren text/plain). Si extiendes el dispatcher, asegúrate de pasar `text` derivado del helper text-version del template — sin él, el footer del plain-text se pierde.

```ts
// src/lib/notifications/service.ts (extracto)
const emailParams = { title, body, category, ctaText, ctaUrl };
const { subject, html } = notificationEmail(emailParams);
const text = notificationEmailText(emailParams);
await sendEmail({ to: user.email, subject, html, text });
```

### Templates excluidos (transaccionales)

Los siguientes templates **NO** llevan footer (regla durable):

- `magic-link.ts` — Auth.js magic-link flow
- `password-reset.ts` / `password-reset-confirm.ts` / `password-changed.ts` — password flow
- `verify-email.ts` — signup email verification
- `login-alert.ts` — security alert (hardcoded `enabled: true`, no hay toggle)
- `invite-user.ts` / `invite-accepted.ts` — admin invite one-shot

Razón: el usuario no puede opt-out de esos flujos. Poner el link sería engañoso — el toggle correspondiente en `/profile?tab=notifications` no existe para esas categorías.

---

## 6.2.1 List-Unsubscribe header (FACTORY-005 — RFC 8058 one-click)

> Gmail desde feb-2024 **requiere** `List-Unsubscribe` con HTTPS one-click para senders de >5K emails/día (Sender Authentication Requirements). Apple Mail también lo soporta — ambos clientes muestran botón nativo "Unsubscribe" en el inbox cuando ambos headers están presentes. La variante HTTPS (RFC 8058, 2018) funciona via POST a un route handler — NO requiere inbound email handler como la variante `mailto:` antigua.

### Surface shipped por el kit

| Componente                                                    | Path                                         | Propósito                                                                                                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateUnsubscribeToken(userId, category, channel='email')` | `src/lib/notifications/unsubscribe-token.ts` | Firma JWT con TTL de `90d` (deliberado: el link viaja en un email que puede abrirse semanas después — un TTL corto rompería el one-click justo cuando se usa), audience `'unsubscribe'`, alg `HS256` con `getNextAuthSecret()`.                                                                                                     |
| `verifyUnsubscribeToken(token)`                               | (mismo file)                                 | Valida signature + audience + expiry + claims; throws on cualquier fallo. Solo acepta `channel='email'`.                                                                                                |
| `POST /api/unsubscribe?token=<JWT>`                           | `src/app/api/unsubscribe/route.ts`           | Verifica token + UPSERT `notification_preferences SET enabled=false` (lazy preferences — UPDATE puro no funciona si la row no existe; se usa `insert().onConflictDoUpdate()`). Returns 200; idempotent. |
| `GET /api/unsubscribe`                                        | (mismo route)                                | Fallback 405 + HTML body con link a `/profile?tab=notifications` (algunos clientes hacen GET preview).                                                                                                  |

### Wire-up automático en `service.ts`

El dispatcher `notify()` inyecta los headers automáticamente cuando dispatcha al canal `email`:

```ts
// src/lib/notifications/service.ts (extracto del dispatch loop)
const unsubToken = await generateUnsubscribeToken(userId, category, 'email');
const unsubUrl = `${getAppUrl()}/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

await sendEmail({
  to: user.email,
  subject,
  html,
  text,
  headers: {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
});
```

Los providers (`resend.ts` + `smtp.ts`) hacen merge de estos headers caller con los defaults del kit (`Auto-Submitted: auto-generated`, `X-Auto-Response-Suppress: All`) — los defaults van AL FINAL del spread para que no puedan ser overrideados accidentalmente. Result: cada email dispatched via `notify()` lleva 4 headers (2 defaults + 2 List-Unsubscribe).

### Token claims shape

```ts
{
  sub: userId,           // standard JWT subject
  cat: category,         // notification category (matches `notification_preferences.category`)
  ch: 'email',           // channel — endpoint-locked a email (push/in_app tienen otros flows)
  aud: 'unsubscribe',    // audience binding evita token confusion con NextAuth session tokens
  iat: <timestamp>,
  exp: <iat + 90d>,
}
```

**Audience binding crítico:** `aud: 'unsubscribe'` + verify con `{ audience: 'unsubscribe' }` hace que el token NO pueda usarse como session token aunque comparta el mismo signing secret (`AUTH_SECRET`/`NEXTAUTH_SECRET` via `getNextAuthSecret()`). Test fixture cubre "wrong audience rejection".

### Por qué UPSERT y no UPDATE

`notification_preferences` es **lazy** — si el user nunca tocó esa preferencia, la row no existe; el default vive en `defaultChannels` de la categoría (`src/config/notifications.ts`). Un UPDATE WHERE no-op si no hay row → el unsubscribe no surte efecto. El route handler usa `insert().onConflictDoUpdate({ target: [userId, channel, category], set: { enabled: false } })` que cubre ambos paths (INSERT new row OR UPDATE existing → mismo final state).

### Cuándo el botón nativo aparece (caveat de Gmail)

Gmail se reserva el derecho de NO mostrar el botón nativo aunque los headers estén OK — depende de eligibility por reputación de sender, volumen, autenticación (SPF/DKIM/DMARC). Acceptance real del feature = **headers presentes en el envelope crudo + POST endpoint responde 200 + DB row toggled**. El botón nativo Gmail es smoke informativo, NO acceptance criteria.

---

## 7. Cómo disparar una notification nueva (checklist)

1. **Verifica la categoría existe** en `NOTIFICATION_CATEGORIES`. Si no, agrégala primero.
2. **Desde un server action** (usa `withAuth`/`withSelf` del kit — ver [`sk-api`](../sk-api/SKILL.md)):

   ```ts
   import { notify } from '@/lib/notifications';

   export const approveDocument = (input: unknown) =>
     withAuth({ resource: 'documents', action: 'update', schema }, input, async (data, userId) => {
       // ... domain logic
       await notify({
         userId: data.ownerId,
         title: 'Documento aprobado',
         body: `"${data.title}" fue aprobado.`,
         type: 'success',
         category: 'documents', // ← debe existir en config
         url: `/documents/${data.id}`,
       });
       return { ok: true };
     });
   ```

3. **NO llames** `sendPush`/`sendEmail` directo — pasa por `notify()` que resuelve preferences.
4. **NO llames** `toast()` desde server — `notify()` dispara el in_app, el client lo recibe en el siguiente poll y muestra toast opcionalmente (solo para eventos que el usuario espera en ese momento; lo demás vive en el panel).
5. **Canales opcionales:** omite `channels` para usar `defaultChannels` de la categoría. Overridea solo si tienes razón explícita.

---

## 8. Dev testing — `testNotification` server action

**Ubicación:** `@/lib/actions/notifications` → `testNotification({ channel, category, type })`.

Dispara una notification de prueba al usuario autenticado. Útil para verificar canales durante desarrollo sin esperar un evento real.

```ts
import { testNotification } from '@/lib/actions/notifications';

await testNotification({
  channel: 'in_app', // 'in_app' | 'push' | 'all'
  category: 'general',
  type: 'info', // info | success | warning | error | system
});
```

**Verificación por canal:**

| Canal    | Cómo verificar                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------- |
| `in_app` | Bell badge + panel (próximo poll, hasta 30s)                                                              |
| `push`   | Grant browser permission → activar device en `<PushDevicesList />` → `testNotification` → OS notification |
| `email`  | Real address (dominios `@test.com` / `@example.com` auto-skippeados)                                      |

---

## 9. Anti-patterns

| ❌ Anti-pattern                                                    | ✅ Correcto                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `toast.info(...)` directo desde server action                      | `notify({ ..., category })` — el client renderiza toast si procede                 |
| `sendPush(...)` o `sendEmail(...)` sin `notify()`                  | `notify()` resuelve canales, preferences, FIFO, retention                          |
| Crear endpoint SSE en `/api/notifications/stream` para "real-time" | Usar el polling endpoint `/poll` — SSE en Vercel cobra wall-clock (anti-patrón)    |
| Hardcodear `category: 'my-custom'` sin actualizar config           | Agregar a `NOTIFICATION_CATEGORIES` primero (SSOT)                                 |
| Skipear el preference check manual                                 | `notify()` ya aplica preferences — no lo replicar                                  |
| Leer `notifications` table directo desde un componente server      | Usa `getNotifications` action (`@/lib/actions/notifications`)                      |
| Desactivar `in_app` en una categoría                               | `in_app` es forzado por `resolveChannels` — por diseño (safe-by-default)           |
| Disparar `notify()` desde un `useEffect` client                    | Server-side only — el dispatcher requiere DB access                                |
| Mostrar toggle "push" como global sin lista per-device             | Render `<PushDevicesList />` o equivalente — push subs son inherentes per-device   |
| Cron job para cleanup de notifications                             | Piggyback en `notify()` ya cubre retention.days + expires_at + maxPerUser per-user |
| Setear `expires_at` y NO llamar `notify()` en algún momento        | El cleanup es per-user piggyback — corre solo cuando el user genera notifs nuevas  |

---

Cross-reference: [`sk-api`](../sk-api/SKILL.md) — server actions que disparan notifs. [`sk-ui`](../sk-ui/SKILL.md) — Bell/Panel/Settings/PushDevicesList components. [`sk-features-index`](../sk-features-index/SKILL.md) — feature catalog.
