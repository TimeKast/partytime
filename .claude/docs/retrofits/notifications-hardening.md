# Migration brief — Vercel notifications hardening

> **Retrofit shipped** (`.claude/docs/retrofits/`) — referenciado por `legacy-migration.md §F5` (aplica a derivados con el sistema de notifications vivo nacidos antes de 2026-04-26).
>
> **Audience:** agente trabajando en una app TimeKast forkeada del Factory que tenga el sistema de notifications vivo (bell + panel + push + categorías). Este documento existe porque el Factory shippeó por un tiempo un sistema con 4 problemas técnicos serios; las apps derivadas que NO recibieron el merge del Factory todavía los heredan.
>
> **Date:** 2026-04-26 (Fix 6 agregado 2026-04-28)
> **Origin:** TimeKast Factory commit que ship `refactor(notifications): SSE→polling, single category, push devices list, retention auto-cleanup` + commit posterior `fix(notifications): make defaultChannels initial-ON, not a gate` (a9d0ef6, 2026-04-28). Patches consolidados se distribuyen aquí en 4 fixes técnicos + 2 de polish.
>
> **Standalone:** este brief es autocontenido. NO requiere haber sincronizado el kit ni migrado estructura de carpetas del repo. Toca solo código de app (`src/app/api/notifications/`, `src/lib/hooks/`, `src/lib/notifications/`, `src/lib/actions/notifications.ts`, `src/components/notifications/`, schema de notifications, service worker). Si el fork también va a sincronizar el kit más adelante, esa migración es independiente y no cambia los fixes de acá.
> **Disponible desde:** kit `v11.2.1`

---

## Phase 0 — Auditoría inicial (antes de hablar con el user)

> ⚠️ **Esta phase NO modifica nada.** Solo lee el código del fork para detectar qué fixes ya están aplicados (parcial o totalmente) y qué falta. El output alimenta GATE 1 — sin auditoría, GATE 1 NO debe correrse.

### 0.1 Correr todos los detectores

```bash
# Fix 1 — SSE → Polling
echo "=== Fix 1: SSE → Polling ==="
F1_POLL=$(find src/app/api/notifications -name "route.ts" -path "*poll*" 2>/dev/null)
F1_STREAM=$(find src/app/api/notifications -name "route.ts" -path "*stream*" 2>/dev/null)
F1_VISIBILITY=$(grep -rl "visibilitychange.*setInterval\|setInterval.*visibilitychange" src/lib/hooks/ 2>/dev/null)
echo "  poll endpoint:        ${F1_POLL:-NO}"
echo "  stream endpoint:      ${F1_STREAM:-NO}"
echo "  hook visibility-aware: ${F1_VISIBILITY:-NO}"

# Fix 2 — Push subscriptions per-device
echo ""
echo "=== Fix 2: Push devices + matrix-first banners + iOS/denied recovery ==="
F2_LIST=$(grep -rln "PushDevicesList\|getPushDevices\|removePushDevice" src/ 2>/dev/null | head -3)
F2_PARSE=$(find src -name "parse-user-agent*" 2>/dev/null)
F2_MOBILE=$(grep -rl "hidden sm:\|min-w-0" src/components/notifications/ 2>/dev/null | head -1)
F2_IOS_HINT=$(grep -rlE "needsIosPwa|isIOS.*isInstalled|iPad\|iPhone\|iPod" src/components/notifications/ 2>/dev/null | head -1)
F2_STATUS_BANNER=$(find src/components/notifications -name "NotificationStatusBanner*" 2>/dev/null)
F2_CRITICAL_BANNER=$(find src/components/notifications -name "NotificationCriticalBanner*" 2>/dev/null)
F2_DENIED_RECOVERY=$(grep -rlE "permission === 'denied'|getDeniedInstructions" src/components/notifications/ 2>/dev/null | head -1)
F2_PERMISSION_HOOK=$(grep -E "permission:\s*NotificationPermissionState|NotificationPermissionState" src/lib/hooks/usePushSubscription.ts 2>/dev/null | head -1)
F2_AUTO_OFF=$(grep -E "remaining\.length === 0.*updateNotificationPref|category: 'general'.*enabled: false" src/components/notifications/PushDevicesList.tsx 2>/dev/null | head -1)
echo "  PushDevicesList / acciones:         ${F2_LIST:-NO}"
echo "  parseUserAgent helper:              ${F2_PARSE:-NO}"
echo "  matrix mobile-friendly:             ${F2_MOBILE:-NO}"
echo "  iOS PWA hint inline:                ${F2_IOS_HINT:-NO}"
echo "  NotificationStatusBanner:           ${F2_STATUS_BANNER:-NO}"
echo "  NotificationCriticalBanner:         ${F2_CRITICAL_BANNER:-NO}"
echo "  Denied recovery (browser-specific): ${F2_DENIED_RECOVERY:-NO}"
echo "  permission state en hook:           ${F2_PERMISSION_HOOK:-NO}"
echo "  Auto-off al borrar último device:   ${F2_AUTO_OFF:-NO (canónico — debe estar ausente)}"

# Fix 3 — Auto-cleanup retention
echo ""
echo "=== Fix 3: Auto-cleanup retention ==="
F3_FN=$(grep -l "cleanupForUser\|cleanupExpired" src/lib/notifications/service.ts 2>/dev/null)
F3_COMPOUND=$(grep -A 20 "cleanupForUser\|cleanupExpired" src/lib/notifications/service.ts 2>/dev/null | grep -cE "createdAt < cutoff|expires_at.*NOW|isNotNull")
F3_FIFO=$(grep -A 30 "cleanupForUser" src/lib/notifications/service.ts 2>/dev/null | grep -ci "maxPerUser\|FIFO")
F3_NOTIFY=$(grep -A 5 "function notify\|export.*notify.*=" src/lib/notifications/service.ts 2>/dev/null | grep -c "cleanupForUser")
echo "  cleanup function exists:    ${F3_FN:-NO}"
echo "  compound DELETE:            ${F3_COMPOUND:-0} match(es)"
echo "  FIFO check:                 ${F3_FIFO:-0} match(es)"
echo "  notify() invokes cleanup:   ${F3_NOTIFY:-0} match(es)"

# Fix 6 — defaultChannels initial-ON (no gate)
echo ""
echo "=== Fix 6: defaultChannels initial-ON (no gate) ==="
F6_SERVICE=$(find src/lib/notifications -name "service.ts" 2>/dev/null | head -1)
if [ -n "$F6_SERVICE" ]; then
  # Bug present: defaultChannels acts as gate (filter without per-channel pref check)
  F6_GATE=$(grep -A 30 "function resolveChannels\|resolveChannels =" "$F6_SERVICE" 2>/dev/null | grep -cE "defaultChannels\.includes\(|defaultsSet\.has\(.*\)\s*$|filter\(.*defaultChannels")
  # Fix present: layered resolution with per-channel pref override
  F6_LAYERED=$(grep -A 30 "function resolveChannels\|resolveChannels =" "$F6_SERVICE" 2>/dev/null | grep -cE "userPref\.(has|get)\(ch\)|userPrefs?\.(has|get)\(channel\)")
  echo "  service.ts:                     $F6_SERVICE"
  echo "  gate-style filter (bug):        ${F6_GATE:-0} match(es)"
  echo "  layered per-channel resolution: ${F6_LAYERED:-0} match(es)"
else
  echo "  service.ts:                     NO (fix no aplica)"
fi

# Fix 4 — Toaster pointer:coarse (opcional)
echo ""
echo "=== Fix 4: Toaster pointer:coarse ==="
SONNER=$(find src/components/ui -name "sonner.tsx" 2>/dev/null | head -1)
if [ -n "$SONNER" ]; then
  F4_COARSE=$(grep -l "pointer: coarse\|useSyncExternalStore" "$SONNER" 2>/dev/null)
  F4_WIDTH=$(grep -E "max-width.*px|window.innerWidth" "$SONNER" 2>/dev/null | head -1)
  echo "  sonner.tsx custom:          $SONNER"
  echo "  pointer:coarse detection:   ${F4_COARSE:-NO}"
  echo "  width-based (legacy):       ${F4_WIDTH:-NO}"
else
  echo "  sonner.tsx custom:          NO (fix no aplica)"
fi

# Fix 5 — Profile loading skeleton (opcional)
echo ""
echo "=== Fix 5: Profile loading skeleton ==="
LOADING=$(find src/app -name "loading.tsx" \( -path "*profile*" -o -path "*settings*" \) 2>/dev/null | head -1)
if [ -n "$LOADING" ]; then
  F5_NEO=$(grep -E "neo-outset-sm|rounded-2xl.*p-2.*bg-background" "$LOADING" 2>/dev/null | head -1)
  F5_OLD=$(grep -E "border-b pb-2|gap-4 border-b" "$LOADING" 2>/dev/null | head -1)
  echo "  loading.tsx detectado:      $LOADING"
  echo "  neomorphic match:           ${F5_NEO:-NO}"
  echo "  pattern viejo (border-b):   ${F5_OLD:-NO}"
else
  echo "  loading.tsx profile:        NO (fix no aplica)"
fi
```

### 0.2 Clasificar cada fix

Con los outputs de 0.1, clasificar cada fix en uno de estos estados:

| Estado            | Significado                                              | Acción para GATE 1                                                      |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| ✅ **Canónico**   | Implementación matchea spec del brief                    | NO mostrar al user (no hay nada que hacer)                              |
| ❌ **Faltante**   | El bug está presente, no hay implementación              | Mostrar al user como "fix recomendado"                                  |
| ⚠️ **Parcial**    | Algunas piezas implementadas, otras no                   | Mostrar al user con detalle de qué pieza falta                          |
| 🤔 **Divergente** | Implementado distinto al canónico, parece funcional      | Mostrar al user **con diff conceptual + recomendación + justificación** |
| ➖ **N/A**        | No aplica (ej: no hay sonner custom, no hay loading.tsx) | NO mostrar al user                                                      |

### 0.3 Reglas para clasificar Divergente vs Parcial vs Canónico

| Fix   | Canónico requiere                                                                                                                                                                                                                                                                                                                   | Divergente típico                                                                                                             | Parcial típico                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Fix 1 | poll endpoint + visibility-aware hook + sin SSE                                                                                                                                                                                                                                                                                     | Polling sin visibility (siempre activo) o interval distinto                                                                   | Coexisten poll + stream                                                                                                        |
| Fix 2 | PushDevicesList + parseUserAgent + matrix mobile-friendly + iOS PWA hint inline + NotificationStatusBanner (desync) + NotificationCriticalBanner (bloqueante con scroll-to) + denied recovery browser-specific + `permission` state en `usePushSubscription` + matrix arriba / devices abajo + sin auto-off al borrar último device | UI per-device con otros nombres (ej: `MyDevicesPanel`); auto-off conservado pero apagando todas las cats; orden devices-first | Acciones server pero sin UI; iOS hint faltante; banners faltantes; denied recovery faltante; permission state ausente del hook |
| Fix 3 | cleanupForUser compound (retention + expired + FIFO) invocado desde notify()                                                                                                                                                                                                                                                        | Cron-based externo (job programado en lugar de piggyback)                                                                     | Solo expired sin retention.days                                                                                                |
| Fix 6 | resolveChannels resuelve por canal: pref user > defaultChannels (initial-ON) > absent. `in_app` siempre se entrega. Caller-supplied override sigue respetando opt-out                                                                                                                                                               | Override via flag opcional en config (ej: `lockedChannels` per-cat) que reemplaza defaults pero también respeta prefs         | defaultChannels se respeta como gate cerrado (`filter(ch => defaults.includes(ch))`) sin chequeo de pref por canal             |
| Fix 4 | useSyncExternalStore + matchMedia('pointer: coarse')                                                                                                                                                                                                                                                                                | Detección custom (ej: detector de UA)                                                                                         | (no aplica)                                                                                                                    |
| Fix 5 | TabsList neomorphic en loading.tsx                                                                                                                                                                                                                                                                                                  | Skeleton diferente pero visualmente coherente                                                                                 | (no aplica — o existe o no)                                                                                                    |

### 0.4 Para cada fix Divergente — preparar comparación

Si un fix queda clasificado como **Divergente**, el agente debe preparar para GATE 1 una mini-tabla con:

```
Fix N — DIVERGENTE

  Tu implementación:      [resumen 1 línea de qué hace el fork]
  Implementación canónica: [resumen 1 línea de qué hace el brief]

  Diferencias relevantes:
    • [diff 1]
    • [diff 2]

  Recomendación: [PRESERVAR | MIGRAR]
  Razón: [1-2 líneas con costo/beneficio concreto]
```

> **Bias del brief:** si la implementación del fork es **funcional y no tiene desventajas significativas** (perf, costo, UX), **recomendar PRESERVAR**. Solo recomendar MIGRAR cuando hay un beneficio concreto (ej: cron-based vs piggyback → migrar tiene sentido si Vercel-cost importa, preservar si el cron ya está montado y funciona).

---

## ⚠️ HARD GATES — leer antes de tocar nada

### GATE 1 — Reporte al user (con resultado de Phase 0)

> ⚠️ **NO presentar los 5 fixes en frío.** El agente debe presentar **solo lo que aplica** según la auditoría de Phase 0, omitiendo lo que ya está canónico o no aplica, y mostrando comparaciones para los divergentes.

**Estructura del reporte:**

```
🔍 Auditoría de notifications en tu fork:

  ✅ Ya canónico (ningún cambio necesario):
     [list de fixes en estado Canónico]

  ➖ No aplica:
     [list de fixes en estado N/A — ej: "Fix 5: tu fork no tiene loading.tsx"]

  📋 Recomendado aplicar:
     [list de fixes en estado Faltante o Parcial — con descripción simple del bug]

  🤔 Implementación distinta detectada:
     [list de fixes en estado Divergente — con tabla de comparación + recomendación]
```

**Para cada fix Faltante o Parcial:**

> N. **<Título del fix>** — `<Faltante | Parcial: falta X>`
> <Descripción en lenguaje simple del bug + qué hace el fix>
> Trade-off (si aplica): <costo/beneficio>

**Para cada fix Divergente:**

> N. **<Título del fix>** — `Divergente`
>
> Tu implementación: <resumen 1 línea>
> Canónica: <resumen 1 línea>
>
> Diferencias:
>
> - <diff 1>
> - <diff 2>
>
> **Recomendación: <PRESERVAR | MIGRAR>**
> Razón: <costo/beneficio concreto>

**Cierre del reporte:**

> ¿Qué quieres hacer?
>
> - Aplicar todos los recomendados
> - Aplicar solo algunos (especificar cuáles)
> - Ver más detalle de alguno antes de decidir
> - Para los divergentes: aceptar mi recomendación, o cambiarla

**Reglas duras:**

- NO presentar fixes en estado **Canónico** o **N/A** — son ruido.
- Para **Divergente**, siempre mostrar la comparación + recomendación. Nunca asumir que el user quiere migrar.
- Si TODOS los fixes están Canónicos o N/A → reportar "auditoría limpia, no hay nada que hacer" y detener.

### GATE 2 — Plan Mode obligatorio antes de cada fix

**Aplicar fix directo sin Plan Mode está PROHIBIDO.** Estos cambios tocan filesystem-level routes + client-side hooks consumidos por múltiples componentes; riesgo de romper comportamiento downstream silenciosamente.

Para cada fix elegido por el user, **entrar a Plan Mode** (`ExitPlanMode` tool) y escribir un plan que incluya como mínimo:

- **Blast radius mapping** — todos los archivos del repo derivado que tocan el sistema afectado: endpoints, hooks, components consumers, server actions, schemas, service workers, configs. Listar paths concretos detectados (no genéricos como "el hook"). Confirmar consumers con `grep -rln "from '@/lib/hooks/useNotifications'"`, `grep -rln "from '@/lib/hooks/useSSE'"`, etc.
- **Tests existentes audit** — qué tests cubren el comportamiento actual (unit + component + e2e). Identificar cuáles deben ajustarse, cuáles eliminarse, cuáles agregarse
- **API público inventory** — los hooks o services que se modifican: ¿qué consumers los importan? Confirmar que el API público se mantiene (consumers no cambian) o documentar los call sites a actualizar
- **Migration path** — si la app derivada hizo customs sobre los archivos del kit (ej: agregaron categorías propias, modificaron `resolveChannels`, agregaron eventos SSE), cómo preservarlas en el patch
- **Verification end-to-end** — pasos concretos para validar antes y después del fix (Network tab, Vercel logs, UX manual)

### GATE 3 — Confirmación de plan con user antes de implementar

Plan Mode → ExitPlanMode → user aprueba → recién entonces implementar.

### GATE 4 — Confirmar diff con user antes de cada commit

Mostrar `git status` y `git diff --stat`. Esperar luz verde antes de `git commit`.

### Reglas operativas

- **Aplicar en orden:** Fix 1 (SSE) primero — foundational, mayor impacto en costo. Fix 6 (defaultChannels) **antes de agregar categorías nuevas** si el fork va a tener varias — sin esto los toggles de cats custom mienten. Fix 2 (push devices) después. Fix 3 (auto-cleanup) puede ir antes o después de Fix 2 (independiente). Fix 4 y 5 (polish) al final, en cualquier orden.
- **Cada fix = 1 commit separado.** Excepción: Fix 4 + 5 (polish) pueden agruparse en un commit `chore(notifications): polish` si los dos aplican.
- **NO archivos exactos en este brief** — buscar por patterns. Las apps derivadas pudieron haber renombrado, movido, o tocado código.
- **Si el user pregunta por categorías de notificaciones, NO migres** — cada app tiene las suyas. Solo aplica los fixes técnicos listados aquí.

---

## Fix 1 — SSE → Polling

### Problema en lenguaje fácil

Vercel cobra por el tiempo que tu función está corriendo (wall-clock), no por CPU usado. SSE = una conexión que el browser mantiene abierta hasta que algo la mata. Cada usuario logged in con la pestaña abierta = una función corriendo al 100% en Vercel todo el día. Polling cada 30s consume ~1% de eso porque la función solo arranca cuando hay request real.

Trade-off: notif nueva tarda hasta 30s en aparecer (antes <5s con SSE). Para in-app notifications NO es chat real-time, es aceptable.

### Síntomas a buscar

- **Vercel logs** llenos de `Vercel Runtime Timeout Error` o invocaciones de funciones de 5min cada una
- **Archivo** tipo `app/api/notifications/stream/route.ts` (o nombre similar — `events`, `live`, `feed`) con `runtime = 'nodejs'` declarado y un `ReadableStream` adentro
- **Hook cliente** que importa `EventSource` o un wrapper tipo `useSSE`. Suele estar en `lib/hooks/useNotifications.ts` o `lib/hooks/useSSE.ts`
- **Service worker** con comentarios o reglas referenciando `/notifications/stream` o "SSE"

### Identificación de archivos típicos

```
app/api/notifications/stream/route.ts        — endpoint SSE
lib/hooks/useSSE.ts                          — wrapper EventSource
lib/hooks/useNotifications.ts                — orchestrator que usa SSE
app/sw.ts                                    — referencias / no-cache rules
tests/unit/notification-stream.test.ts       — tests del endpoint
tests/unit/notifications/notification-hooks.test.ts — mocks de useSSE
```

Buscar también con `grep -rln "EventSource\|notifications/stream\|useSSE" src/ tests/`.

### Fix conceptual

1. **Crear endpoint REST polling** en el path equivalente (ej. `app/api/notifications/poll/route.ts`):
   - GET handler con `auth()` check
   - Una sola query `Promise.all([items, unreadCount])`: lista de las N notifs más recientes (típicamente 6) + count de no leídas
   - `dynamic = 'force-dynamic'`, sin `runtime` declarado (serverless default funciona)
   - Response shape: `{ items, unreadCount }`

2. **Refactorizar el hook cliente** para hacer polling en vez de SSE:
   - Reemplazar `useSSE` por `setInterval(fetchPoll, 30_000)` dentro de un `useEffect`
   - Listener `visibilitychange` — start interval cuando `visible`, stop cuando `hidden`
   - Fetch inmediato al volver a `visible` (focus refetch — el user vuelve a la pestaña, ve estado fresco)
   - Guard `inFlightRef` con `useRef<boolean>` para evitar requests duplicados cuando `visibilitychange` se cruza con un fetch en curso
   - **Mantener API público idéntico** (`{ notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, isConnected, isPending, refetchNotifications }`) — los consumers (`NotificationBell`, `NotificationPanel`) no cambian

3. **Eliminar SSE infra:**
   - Endpoint stream
   - Hook `useSSE`
   - Tests del endpoint
   - Comentarios en service worker que mencionen SSE específicamente

4. **`isConnected` semantic:** ahora es "el último poll fue OK". Default `true`, set `false` cuando un fetch falla (network/server). Cosmético — no toast de error.

5. **Silenciar logs de polling en dev terminal** (DX, opcional pero recomendado):
   - Sin filter, el dev server lista `GET /api/notifications/poll 200 in Xms` cada 30s, inundando la terminal y enmascarando errores reales
   - Si el repo derivado usa un wrapper script para `pnpm dev` (típicamente `scripts/tools/dev.mjs`), agregar filter de stdout/stderr que descarte líneas que matcheen `\bGET \/api\/notifications\/poll\b`
   - Override con env `DEV_VERBOSE=1` para mostrar todo cuando estés debuggeando el polling
   - Si el repo derivado NO tiene dev wrapper, skipear este sub-fix (no vale crear el wrapper solo para esto)
   - 🔴 **Pitfall: ANSI colors.** Para filtrar líneas hay que pasar `stdio: ['inherit', 'pipe', 'pipe']` al `spawn`, lo que **mata la detección de TTY** del child — Next.js, chalk, y downstream tools dejan de emitir códigos ANSI y la terminal queda en plain text (sin verde para `200`, sin rojo para errores, sin dim para timing). Fix: setear `FORCE_COLOR: process.env.FORCE_COLOR ?? '1'` en el `env` del child — el filter line-by-line pasa los escape codes verbatim, así que la terminal recupera los colores. El `??` permite override explícito (`FORCE_COLOR=0 pnpm dev` para CI/logs limpios)

### Validación

- DevTools Network → `GET /api/notifications/poll` cada 30s solo en pestaña visible
- Cambiar de pestaña 1 min → cero requests
- Volver → fetch inmediato + cada 30s
- Vercel Functions usage cae ~99% en 24h post-deploy
- Cero `Vercel Runtime Timeout Error` en logs
- Terminal limpia: `pnpm dev` no muestra request del poll

---

## Fix 2 — Push subscriptions per-device

> ⚠️ **Forks ya en marcha — auditar tests antes de aplicar.** Este fix cambia la signature pública de `usePushSubscription` (gana un campo `permission`), reordena el JSX de `NotificationSettings`, agrega 2 componentes nuevos y elimina la lógica auto-off. Si tu fork tiene tests sobre `usePushSubscription` con `expect.toEqual` exclusivo del shape (no `toHaveProperty`), o snapshot tests sobre `NotificationSettings.tsx`, o tests que asumen el auto-off al borrar el último device, esos tests van a romper. Revisa y ajusta según cada caso. Forks recién creados desde el kit no necesitan hacer nada.

### Problema en lenguaje fácil

El toggle de "push notifications" en settings tiene 2 estados pegados: "¿quiero recibir push para esta cuenta?" (preference global, en BD) y "¿este dispositivo está suscripto?" (browser local, vía Web Push API). El toggle solo refleja una de las dos cosas — el local del browser actual. Pero el preference global aplica a todos los dispositivos.

**Escenario roto:** activas push en desktop. Va a BD: `push: true`. Va a browser local desktop: `subscribed: true`. Ahora abres mobile. El hook chequea browser local mobile: `subscribed: false`. Pero la matrix de preferences dice "push ON" porque BD dice ON. Confusión: ves "ON" en mobile sin tener permiso real ni subscription en mobile.

Fix: hacer visible el state per-device. Lista de dispositivos con activar/quitar individual + identificación del device actual.

### Síntomas a buscar

- **Hook `usePushSubscription`** retorna `isSubscribed` chequeando solo `registration.pushManager.getSubscription()` (browser local), sin consultar BD
- **Settings UI** muestra UN toggle global de push como parte de la matrix de preferences, sin lista de dispositivos
- **Tabla `pushSubscriptions`** en schema con `endpoint` único y multiple rows por `userId` (una por device) — eso ya es correcto. El bug es UI, no schema

### Archivos involucrados

```
lib/hooks/usePushSubscription.ts                          — hook (expone `permission`)
components/notifications/NotificationSettings.tsx          — matriz de preferencias
components/notifications/PushDevicesList.tsx               — bloque "Mis dispositivos"
components/notifications/PushPermissionPrompt.tsx          — modal soft-ask
components/notifications/NotificationStatusBanner.tsx      — NUEVO
components/notifications/NotificationCriticalBanner.tsx    — NUEVO
lib/pwa/usePwaInstall.ts                                   — helper `isInstalled` (existente)
lib/actions/notifications.ts                              — server actions (existentes)
lib/db/schema/notifications.ts                            — pushSubscriptions table (sin cambios)
```

### Fix conceptual

1. **Helper `parseUserAgent`** (~30 líneas, sin lib externa):
   - Regex para detectar Chrome/Safari/Firefox/Edge + macOS/Windows/iOS/Android
   - Retorna `{ browser, os, label }` o "Dispositivo desconocido"
   - Vive en `lib/notifications/parse-user-agent.ts`

2. **Server actions** en `lib/actions/notifications.ts`:
   - `getPushDevices()` → `ActionResult<{ id, endpoint, userAgent, createdAt }[]>` — lista de pushSubscriptions del current user
   - `removePushDevice({ id })` → `ActionResult<void>` — DELETE filtered por `userId` (ownership). Return error si no se encontró
   - Usar el wrapper `withSelf` que ya existe en el repo (mismo patrón que las demás server actions de notificaciones)

3. **Componente `PushDevicesList`** (nuevo, separado de NotificationSettings):
   - Llama `getPushDevices()` al mount + después de subscribe/remove
   - Detecta endpoint del current device via `registration.pushManager.getSubscription()?.endpoint`
   - Render: lista de devices con `parseUserAgent(userAgent).label` + `createdAt` formatted ("Suscrito el 24 abr 2026") + badge **"Este dispositivo"** si endpoint matchea local
   - Cada row: botón "Quitar" → `removePushDevice(id)` (con `ConfirmDialog`)
   - Si current device NO está en la lista: bloque arriba con botón **"Activar push en este dispositivo"** → `usePushSubscription().subscribe()`
   - Manejo correcto: si quitar el current device, también `unsubscribe()` local
   - 🔴 **iOS PWA gate.** Desde iOS 16.4, Apple permite Web Push **solo si la app está instalada como PWA** (Add to Home Screen + abierta desde el icono). En Safari pestaña normal las APIs `Notification`/`PushManager` pueden estar disponibles, pero `pushManager.subscribe()` falla / no dispara prompt — restricción de Apple, no del código. Para no mostrar un botón "Activar aquí" inservible, detectar el caso `isIOS && !isInstalled` (con `usePwaInstall().isInstalled` que ya cubre `display-mode: standalone` + `navigator.standalone` legacy) y, cuando current device no está listado, renderizar un **hint inline** con instrucciones tipo "Toca Compartir → Añadir a pantalla de inicio y abre la app desde el icono". Ajustar el early return: si `!isSupported && !needsIosPwa` → `null`; si `!isSupported && needsIosPwa` → renderizar igual para que el hint guíe al user. No reusar `IosA2hsHint` global (es un toast flotante con localStorage dismiss; lo que necesitamos es un bloque inline dentro del card "Mis dispositivos")

4. **Integrar en NotificationSettings:**
   - **Orden vertical fijo en el render:** `<NotificationCriticalBanner>` → matriz de preferencias → `<NotificationStatusBanner>` → `<PushDevicesList>`.
   - `<PushDevicesList />` siempre visible mientras `pushConfigured`. No condicionar a `isChannelEnabled('push')`.
   - Toggle de la matriz solo persiste preference (`updateNotificationPref`). No abre modales, no chequea subscription, no dispara `requestPermission`.
   - Modal `PushPermissionPrompt` vive **dentro** de `PushDevicesList`, disparado solo desde el botón "Activar push en este dispositivo". Cancel del modal: cero side effects (no hay optimistic update que revertir).
   - Al borrar un device: no tocar `notificationPreferences`. La preference sobrevive — el status banner explica si queda desync.

5. **Componente `NotificationStatusBanner`** (nuevo, ~50 líneas, va entre matrix y devices):
   - Props: `hasDevices: boolean`, `prefsHavePushOn: boolean`
   - `prefsHavePushOn && !hasDevices` → render banner: "Tienes push habilitado en tus preferencias, pero no hay ningún dispositivo configurado. Activa uno abajo ↓ para empezar a recibir notificaciones."
   - `hasDevices && !prefsHavePushOn` → render banner: "Tienes dispositivos configurados, pero ninguna categoría tiene push activo. Activa al menos una arriba ↑ para que las notificaciones lleguen."
   - Cualquier otro caso → `return null`
   - Estilo: `bg-secondary/50 rounded-lg p-3` con icono `Info` de lucide
   - Para alimentarlo con `hasDevices`, `PushDevicesList` debe aceptar prop `onDevicesCountChange?: (count: number) => void` y llamarlo después de cada `getPushDevices()`. El parent guarda el count en state local y deriva `hasDevices = count > 0`. Esto evita doble fetch desde el parent

6. **Componente `NotificationCriticalBanner`** (nuevo, ~40 líneas, va arriba de la matrix):
   - Props: `permission: 'default' | 'granted' | 'denied' | 'unsupported'`, `needsIosPwa: boolean`, `prefsHavePushOn: boolean`, opcional `targetId` (default `'push-devices'`)
   - `permission === 'denied'` → render banner: "Push bloqueado en este navegador. No vas a recibir notificaciones aquí hasta que reactives el permiso." + CTA "Ver cómo resolverlo ↓"
   - `needsIosPwa && prefsHavePushOn` → render banner: "Para recibir push en este iPhone necesitas instalar la app en pantalla de inicio. iOS no permite notificaciones push en Safari normal." + CTA "Ver instrucciones ↓"
   - Cualquier otro caso → `return null`
   - CTA hace `document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`. El bloque de devices debe tener `id="push-devices"` y `scroll-mt-4` para offset del header
   - Estilo: `bg-destructive/10 border-destructive/30 rounded-lg border p-3` con icono `AlertTriangle` de lucide

7. **Permission denied recovery dentro de `PushDevicesList`:** cuando `permission === 'denied' && !needsIosPwa`, el bloque muestra una lista de pasos browser-specific. Detectar browser con `parseUserAgent(navigator.userAgent)` y devolver el array correspondiente:
   - **iOS PWA / iPad app instalada:** ["Configuración del iPhone", "busca esta app", "Notificaciones → Permitir"]
   - **Safari (desktop):** ["Safari → Ajustes → Sitios web", "Notificaciones → Permitir"]
   - **Firefox:** ["Candado en URL → Eliminar permiso de Notificaciones", "Recargar"]
   - **Chrome / Edge / Brave / Opera / Vivaldi:** ["Candado en URL → Notificaciones → Permitir", "Recargar"]
   - Estilo del bloque: `bg-destructive/10 border-destructive/30 rounded-lg border p-3` + `<ol class="list-decimal list-inside">` + icono `Lock` de lucide

8. **Hook `usePushSubscription` expone `permission`:**
   - Agregar al return shape: `permission: NotificationPermissionState`
   - Exportar el tipo: `export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'`
   - Sincronizar con `Notification.permission` en mount + después de cada `requestPermission()`
   - SSR-safe: si `typeof window === 'undefined' || typeof Notification === 'undefined'` → `'unsupported'`

### Validación

Probar a criterio del implementador. Casos típicos a chequear en device real:

- Chrome desktop sin subscripción previa: matriz sin push tildado, sin banners, devices con botón "Activar aquí". Click → modal → permission prompt → granted → device aparece con badge "Este dispositivo"
- Safari iPhone sin PWA: devices muestra hint "Instalar como PWA". Si hay push tildado en alguna categoría, banner crítico aparece arriba
- iPhone PWA instalada: devices muestra botón "Activar aquí" (sin hint iOS). Click → modal → permission iOS → granted → device aparece
- Toggle push ON en alguna categoría sin tener device: preferencia se guarda + status banner: "Tienes push habilitado pero ningún dispositivo configurado. Activa uno abajo ↓"
- Borrar el último device con `D=on`: device desaparece, preference se mantiene, status banner aparece
- Toggle push OFF en todas las categorías con devices subscriptos: devices visibles, status banner: "Tienes dispositivos pero ninguna categoría con push activo. Activa al menos una arriba ↑"
- Permission denied: banner crítico arriba con CTA "Ver cómo resolverlo ↓" → scroll suave al bloque devices con instrucciones browser-specific
- Cancel en modal `PushPermissionPrompt`: cero side effects en matrix y lista

### Mobile-friendly matrix (recomendado)

La matrix de preferences (`category × channel`) genera **overflow horizontal en mobile** (~375px) cuando hay 3 columnas + descripciones de categoría. Solución a aplicar inline sobre el componente del fork:

1. **Container chain con `min-w-0`** — el flex column raíz del componente settings hereda `min-width: auto`; agregar `min-w-0` al `flex flex-col` para que pueda shrink debajo de su intrinsic content width. Sin esto, el `overflow-x-auto` del wrapper interno no contiene el overflow.
2. **Tabla sin `min-w-X`** — dejar que la table tome su content width natural (`w-full min-w-0`).
3. **Compactación responsive:**
   - Headers: solo icon en mobile (`<span className="hidden sm:inline">{label}</span>`), `px-1` mobile vs `sm:px-4`, `w-16` mobile vs `sm:w-auto`
   - Category cell: description oculto en mobile (`<p className="hidden sm:block">{description}</p>`), `px-2` vs `sm:px-4`
   - Cells de canales (push/email): `px-1` mobile vs `sm:px-4`
4. **Global per-channel toggle (header)**: solo render si `categories.length > 1` — con una sola categoría, el toggle global duplica el del row (visual noise sin función).

---

## Fix 3 — Auto-cleanup de notificaciones (retention real)

### Problema en lenguaje fácil

La app guarda en BD cada notif que muestras al user. Hay un setting `retention.days: 30` en config pero está roto — el código solo borra notifs con `expires_at < NOW()`, y nadie setea `expires_at` cuando crea notifs nuevas. Resultado: la tabla crece sin parar, costo de storage sube, queries lentas, dashboard de DB en rojo después de unos meses.

Solo lo que sí funciona hoy es `maxPerUser: 200` (FIFO) — borra las más viejas si un user supera 200. Pero notifs entre 30 días y 200 unidades persisten para siempre.

Fix: agregar un cleanup oportunista en cada `notify()` que aplica las 3 reglas (retention.days + expired + maxPerUser).

### Síntomas a buscar

- **Función `cleanupExpired`** en notification service que solo borra `expires_at < NOW()`
- **Config con `retention.days`** que con `grep` no aparece más que en la definición original (no se usa en código)
- **Tabla `notifications`** con rows de hace meses (consultar `pnpm db:query "SELECT MIN(created_at) FROM notifications"`)

### Identificación de archivos típicos

```
lib/notifications/service.ts                       — notify() y cleanups
config/notifications.ts                            — retention config
tests/unit/lib/notifications/service.test.ts — tests del cleanup
```

### Fix conceptual

1. **Refactorizar `cleanupForUser(userId)`** en `service.ts`:
   - **Paso 1 + 2 — un solo DELETE compuesto** (retention.days + expired): WHERE `userId = $1 AND (createdAt < cutoff OR (expires_at IS NOT NULL AND expires_at < NOW()))`
   - **Paso 3 — FIFO check** sobre el set ya limpio: si todavía supera `maxPerUser`, drop oldest hasta igualar
   - El orden importa: primero limpiar por edad, luego FIFO actúa solo si quedó algo que limpiar
2. **Eliminar la llamada `cleanupExpired()` separada en `notify()`** — ahora redundante (el paso 1+2 lo cubre)
3. **Eliminar la función `cleanupExpired()` orphan** del service
4. **Imports drizzle:** agregar `or`, `isNotNull` si no estaban — y agregarlos a los mocks de tests

### Por qué piggyback (sin cron)

- Vercel-friendly: sin scheduled functions extra (otra fuente de costo)
- Solo corre cuando ese user genera notif nueva → users inactivos no incurren queries innecesarias
- Eventual consistency aceptable: notifs viejas de users inactivos persisten hasta su próxima notif. `maxPerUser: 200` cubre el peor caso storage (200 rows × usuarios totales máximo)
- 1 DELETE per `notify()` con index ya existente sobre `(user_id, created_at)` → costo de query trivial

### Validación

- Test unit: notif con `createdAt < cutoff` se borra al siguiente `notify()` del mismo user
- Test unit: notif con `expires_at` pasado se borra
- Test unit: combinación FIFO + retention — si retention deja al user con <maxPerUser, FIFO no actúa
- Manual en BD de pruebas: `INSERT` notif manual con `created_at` de hace 60 días, hacer un `notify()` al mismo user, verificar que la vieja se borró

---

## Fix 6 — `defaultChannels` debe ser initial-ON, no un gate cerrado

> ⚠️ **Bug funcional alto-medio.** El UI muestra toggles que el backend ignora silenciosamente. Si tu fork va a tener varias categorías (billing, social, documents, etc.) con defaults conservadores tipo `['in_app']`, este bug rompe el opt-in: el user prende push en settings y nunca le llega. Aplicar antes de agregar categorías nuevas.

### Problema en lenguaje fácil

Cada categoría de notification tiene un campo `defaultChannels: ['in_app']` (o similar) en config. La intención es: **"así arranca un user nuevo — solo `in_app` prendido por default; si el user opt-in a push o email, le llegan también"**. Pero `resolveChannels` en service.ts implementaba `defaultChannels` como **gate cerrado**: si el canal no estaba en la lista, NO se entregaba — aunque el user hubiera prendido el toggle en settings.

Resultado: un user prende push en `NotificationSettings`, la BD guarda `notification_preferences: { category: 'general', channel: 'push', enabled: true }`, pero el backend filtra el canal antes de mirar las preferences porque `defaultChannels` no incluía `push`. UI miente: muestra "ON" pero nunca llega.

**Síntomas reportados:** "tengo push tildado en settings pero no me llegan", "el toggle no hace nada", "agregué la categoría billing con `defaultChannels: ['in_app']` y push no funciona aunque lo prenda".

El fix invierte el modelo: `defaultChannels` define **el estado inicial** (qué arranca prendido para users sin preference guardada), pero **cada canal se resuelve independientemente** una vez que hay pref. Pref user > default category > absent. `in_app` siempre se entrega (invariante del kit).

### Por qué importa más con varias categorías

Con una sola categoría `general` el bug es invisible (el kit ya manda solo `['in_app']` y el user no espera más). Con varias categorías custom el patrón típico es:

- `general: defaultChannels: ['in_app']` — bajo nivel
- `security: defaultChannels: ['in_app', 'email']` — login alerts, password change
- `billing: defaultChannels: ['in_app', 'email']` — facturas, payment failed
- `social: defaultChannels: ['in_app']` — likes, comments (push solo si user opt-in)

Si `defaultChannels` actúa como gate, los users no pueden activar push en `social` aunque el UI les muestre el toggle. Y al revés: no pueden quitar email de `security` aunque la pref se guarde con `enabled: false`.

### Síntomas a buscar en código

- **Función `resolveChannels`** en `src/lib/notifications/service.ts` (o equivalente) que filtra contra `defaultChannels.includes(ch)` o `defaultsSet.has(ch)` **sin** chequear `userPref.has(ch)` antes
- **Tests existentes** que assertean `expect(channels).toEqual(['in_app'])` después de prender push en preferences — si ese test pasa, el bug está presente
- **Reportes del user:** "el toggle no funciona", "tengo push ON pero nunca llega"

### Identificación de archivos típicos

```
src/lib/notifications/service.ts                       — resolveChannels (core del fix)
src/config/notifications.ts                            — NOTIFICATION_CATEGORIES + getDefaultChannels()
src/components/notifications/NotificationSettings.tsx  — UI que muestra los toggles (verificar que cubre todos los canales, no solo defaultChannels)
tests/unit/lib/notifications/service.test.ts  — tests del modelo de resolución
```

### Fix conceptual

#### 1. Reescribir `resolveChannels` con resolución por capas

Cada canal se resuelve **independientemente** en este orden de prioridad:

1. **Caller-supplied override** — si `notify()` recibe `channels: [...]`, ese set manda. Aún respeta opt-out del user para canales no-`in_app`.
2. **User pref guardada** — si existe `notification_preferences` row para `(userId, category, channel)`, gana lo que dijo el user (`enabled: true|false`).
3. **defaultChannels de la categoría** — fallback solo cuando no hay pref guardada para ese canal.
4. **`in_app` siempre se entrega** — invariante. Si por alguna razón se filtró fuera, se reinyecta al inicio del array.

Patrón TypeScript canónico:

```ts
async function resolveChannels(
  userId: string,
  category: string,
  requestedChannels?: NotificationChannel[]
): Promise<string[]> {
  // 1. Fetch preferences for this user × category
  const prefs = await db
    .select({
      channel: notificationPreferences.channel,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.category, category)
      )
    );

  const userPref = new Map<string, boolean>(prefs.map((p) => [p.channel, p.enabled]));

  // 2. Caller-supplied override path
  if (requestedChannels) {
    const effective = requestedChannels.filter(
      (ch) => ch === 'in_app' || userPref.get(ch) !== false
    );
    if (!effective.includes('in_app')) effective.unshift('in_app');
    return effective;
  }

  // 3. Default path: layered per-channel resolution
  //    - user has stored pref → use it
  //    - no stored pref → fall back to defaultChannels.includes(ch)
  const defaultsSet = new Set<string>(getDefaultChannels(category));
  const effective = Object.values(NOTIFICATION_CHANNELS).filter((ch) => {
    if (ch === 'in_app') return true; // forced always
    if (userPref.has(ch)) return userPref.get(ch) === true; // pref wins
    return defaultsSet.has(ch); // initial-ON fallback
  });

  if (!effective.includes('in_app')) effective.unshift('in_app');
  return effective;
}
```

Lo crítico es la línea `if (userPref.has(ch)) return userPref.get(ch) === true;`. Esa verifica si el user **alguna vez tocó** ese canal antes de caer al default. Si tocó (independiente de si lo prendió o apagó), gana la pref guardada.

#### 2. Documentar la nueva semántica de `defaultChannels`

En `src/config/notifications.ts` (en el JSDoc de `NotificationCategory.defaultChannels`) y en cualquier README/skill interno, dejar claro:

> `defaultChannels` define **el estado inicial** de los toggles para users que todavía no guardaron preference. NO es un gate cerrado — el user puede activar canales fuera de `defaultChannels` desde settings y los mensajes le van a llegar.

Esto previene que alguien futuro vuelva al modelo gate creyendo que "limita" qué canales aplican a la categoría.

#### 3. Default sano por categoría — ejemplos para tu app

Tu caso (categorías nuevas con default OFF salvo `in_app`):

```ts
export const NOTIFICATION_CATEGORIES = {
  general:  { ..., defaultChannels: ['in_app'] },
  security: { ..., defaultChannels: ['in_app', 'email'] },  // crítico, default ON email
  billing:  { ..., defaultChannels: ['in_app', 'email'] },  // crítico, default ON email
  social:   { ..., defaultChannels: ['in_app'] },           // user opt-in para push
  documents:{ ..., defaultChannels: ['in_app'] },           // user opt-in
};
```

Push intencionalmente NO va en defaults — push tiene fricción de permission prompt, mejor que el user lo prenda explícito por categoría que le importe. Email solo en categorías críticas (security, billing) por costo y no-querer-spam.

#### 4. UI: verificar que `NotificationSettings` muestra todos los canales

El UI debe exponer toggles para **todos los canales en `NOTIFICATION_CHANNELS`** por cada categoría, no solo los que están en `defaultChannels`. Si tu fork ya filtra el grid de toggles por `defaultChannels.includes(ch)`, ese filtro hay que removerlo — ahora el user puede opt-in a cualquier canal habilitado en el sistema.

#### 5. Tests del nuevo modelo

Agregar (o ajustar) los siguientes casos en `notification-service.test.ts`:

- `resolveChannels` sin pref guardada y `defaultChannels: ['in_app']` → resultado `['in_app']` (caso default fallback)
- `resolveChannels` con pref `{ push: true }` y `defaultChannels: ['in_app']` → resultado `['in_app', 'push']` (opt-in a canal fuera de defaults)
- `resolveChannels` con pref `{ email: false }` y `defaultChannels: ['in_app', 'email']` → resultado `['in_app']` (opt-out a canal en defaults)
- `resolveChannels` con `in_app: false` guardado en pref → siempre `['in_app', ...]` (invariante forzada)
- `resolveChannels` con override `{ channels: ['email'] }` y user pref `{ email: false }` → resultado `['in_app']` (override respeta opt-out)

### Validación end-to-end

1. **Test unit (los 5 casos de arriba)** — `pnpm test notification-service`
2. **Manual:** crear user nuevo, settings → matrix de notifications. Confirmar que para cada categoría aparecen toggles para `in_app`, `push`, `email`. Defaults respetan `defaultChannels`. Tildar push en `social`, disparar `notify({ category: 'social', userId })` desde dev tool, confirmar que el push llega aunque `social.defaultChannels === ['in_app']`.
3. **Manual reverse:** quitar email de `security` (que está ON por default), disparar notif de seguridad, confirmar que NO llega email aunque esté en `defaultChannels`.

### Por qué este fix vino después del brief original

El bug surgió como reporte real cuando agregamos `sync_alerts` con `defaultChannels: ['in_app', 'email']` y push nunca llegaba aunque el user lo tildara. Investigación reveló la asimetría UI vs backend (toggles ofrecidos pero ignorados). Fix shipped en commit del Factory `a9d0ef6` el 2026-04-28, posterior a este brief — por eso no estaba originalmente. Si tu fork hizo el migration brief antes de esa fecha, este fix te falta.

---

## Fix 4 (opcional, micro) — Toaster mobile vs desktop con `pointer: coarse`

### Problema

Si el kit shippea un Toaster (`sonner` o equivalente) sin position responsiva, los toasts caen en una posición fija. Si la app puso un detection width-based (`max-width: Xpx`), falla en iPhone landscape (~844px width), iPad portrait/landscape (~768/1024px), y Surface en modo tablet — los trata como desktop y manda toasts a bottom-right donde el BottomNav los puede ocultar.

### Síntomas

- `src/components/ui/sonner.tsx` (o equivalente) usa `position` literal sin detección, **o** detecta via `(max-width: Xpx)` exclusivamente
- User reporta: "los toasts se ven raros en mi celular en horizontal" o "no veo los toasts cuando los abro desde mi iPad"

### Fix conceptual

Detectar `(pointer: coarse)` con `useSyncExternalStore` + `matchMedia`:

```ts
const COARSE_POINTER_QUERY = '(pointer: coarse)';
const subscribeCoarsePointer = (cb) => { /* matchMedia.addEventListener */ };
const getCoarseSnapshot = () => window.matchMedia(COARSE_POINTER_QUERY).matches;
const getCoarseServerSnapshot = () => false; // SSR-safe (asume desktop)

const isCoarsePointer = useSyncExternalStore(...);
return <Sonner position={isCoarsePointer ? 'top-center' : 'bottom-right'} ... />;
```

`(pointer: coarse)` detecta input modality (touch vs mouse), reflejando la UX que importa: si hay touch primary → top-center (no choca con BottomNav, mejor visibilidad). Reactivo: si user dockea/undockea keyboard en Surface 2-in-1, se reposiciona en vivo.

### Validación

- iPhone portrait/landscape, iPad portrait/landscape, Surface tablet-mode → toasts en `top-center`
- Desktop con mouse → toasts en `bottom-right`
- Surface con keyboard atado → toasts en `bottom-right` (input modality es fine)

---

## Fix 5 (opcional, micro) — Loading skeleton del Profile coherente con Tabs neomorphic

### Problema

Si la app derivada tiene un `loading.tsx` para el profile/settings page, el skeleton típicamente fue armado para una versión anterior de los tabs (border-bottom underline minimal) y no matchea el TabsList neomorphic actual del fork (`rounded-2xl p-2 bg-background neo-outset-sm` o equivalente). Resultado: flash visual desagradable cuando termina el loading y aparece el componente real.

### Síntomas

- `app/<protected>/<profile-or-settings>/loading.tsx` con `flex gap-4 border-b pb-2` o similar
- Skeleton asume el contenido de un tab específico (ej: form de perfil) → si el user llega con `?tab=notifications`, el skeleton del form aparece y luego pop-in la matrix

### Fix conceptual

- Mirror el TabsList real: `bg-background neo-outset-sm flex w-full items-center justify-center gap-1 rounded-2xl p-2` con 2-N `<Skeleton className="h-10 flex-1 rounded-xl" />` adentro
- Tab content placeholder: una sola card `neo-outset-sm rounded-xl p-6` con 3-4 lines de Skeleton — agnostic del tab que se va a mostrar (el server component no conoce el `searchParams.tab` antes de re-renderizar)

### Validación

- Reload `/profile` y `/profile?tab=notifications` → skeleton se ve idéntico al final state durante la transición, sin flash
- Inspect DevTools "Slow 3G" → el skeleton dura visible suficiente para confirmar el shape

---

## Cierre

Si el user pregunta por **categorías de notificaciones**, NO migres — cada app derivada tiene las suyas. El Factory consolidó a una sola categoría `general` para el kit, pero las apps derivadas suelen tener categorías custom (`billing`, `documents`, `social`, etc.) que NO se deben tocar.

Aplica solo los fixes técnicos listados aquí. Resumen ordenado por impacto:

| Fix                             | Impacto                | Esfuerzo | Comment                                                                         |
| ------------------------------- | ---------------------- | -------- | ------------------------------------------------------------------------------- |
| 1. SSE → Polling                | Alto (costo Vercel)    | Medio    | Foundational, hacer primero                                                     |
| 6. defaultChannels initial-ON   | Alto-Medio (funcional) | Bajo     | Bug silencioso — toggles del UI ignorados. Crítico antes de agregar cats nuevas |
| 2. Push devices + matrix mobile | Medio (UX consistente) | Medio    | Bug real de display + overflow mobile                                           |
| 3. Auto-cleanup retention       | Medio (storage)        | Bajo     | Independiente de los otros                                                      |
| 4. Toaster `pointer: coarse`    | Bajo (polish)          | Bajo     | Solo si la app tiene Toaster custom                                             |
| 5. Profile loading skeleton     | Muy bajo (cosmético)   | Trivial  | Solo si `loading.tsx` está desactualizado                                       |

**Si tienes dudas** sobre el blast radius o el orden, **NO procedas** — pregunta al user. Estos fixes son de bajo riesgo si se hacen bien y de alto riesgo si se hacen mal (romper notifs in-app rompe la confianza del user en la app).

---

_Brief autoría: factory pattern del kit TimeKast — portable a cualquier app derivada con stack Next.js 16 + Vercel + Drizzle + Web Push._
