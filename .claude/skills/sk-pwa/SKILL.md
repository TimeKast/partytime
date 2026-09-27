---
name: sk-pwa
description: Kit-shipped PWA infrastructure: the Serwist service worker at `src/app/sw.ts` wired via `withSerwist`, SW caching headers, the managed update UX (`PwaUpdateToast` with work-at-risk guards and auto-reload), install prompts (`PwaInstallToast`/`IosA2hsHint`), the hooks in `src/lib/pwa/`, manifest icons and VAPID push. Invoke when integrating with the kit's PWA — never register a custom SW or replace the managed update flow.
last-verified: 2026-09-22
user-invocable: false
---

# sk-pwa — Kit-Shipped PWA Infrastructure

> The decisions a PWA forces (when to ship a service worker, managed vs. silent update, offline strategy, install UX) are already taken here — this skill is both the decision record and the kit-shipped implementation.

**What this skill covers:** the concrete PWA primitives the TimeKast Starter Kit ships — their paths, configuration, and integration contracts. When a task touches the SW, install prompt, update flow, or push notifications, read this first instead of writing from scratch.

> **Registry anchors** — hooks y componentes exportados por el kit (install hook, PWA toasts, etc.) están indexados en [`project/reference/HOOKS.md`](../../../project/reference/HOOKS.md) + [`project/reference/INVENTORY.md`](../../../project/reference/INVENTORY.md) (autogen — SSOT de import paths). Service Worker canónico vive en `src/app/sw.ts`. Strategies de Serwist (NetworkFirst, StaleWhileRevalidate, etc.) → docs oficiales de Serwist. Esta skill enseña **cuándo aplicar cada strategy**, no enumera la superficie pública de Serwist.

---

## 0. 🔴 Esto ya lo trae el kit — míralo ANTES de escribir un hook de viewport

> **Por qué esta sección existe, y por qué va primero.** Dos derivados distintos
> reinventaron por separado `useDialogViewportFit` porque ninguna skill lo nombraba, y cada uno
> pagó rondas de descubrimiento en un teléfono por una pieza que ya venía en su `src/`. El hueco
> no era de código: era que el kit no **enunciaba** lo que ya resolvía. Un renglón aquí ahorra
> esas rondas.

| Ya resuelto                      | Dónde                                                                       | Qué hace                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Teclado dentro de un diálogo** | `useDialogViewportFit` → `--dialog-vvh`; lo consumen `common/Dialog` y `common/AlertDialog` | El alto máximo del diálogo sale de `visualViewport`, así que el teclado nunca lo empuja fuera de pantalla. **Acotado al diálogo** — no es geometría global |
| **Clip horizontal de raíz**      | `globals.css` — `html { overflow-x: clip }` + `body { overflow-x: clip }`    | Dos reglas, dos motivos distintos, los dos comentados en el archivo: la de `html` atrapa el overflow que un `overflow-x-auto` anidado filtra al documento en Chromium (si no, el `BottomNav` fijo "desaparece"); la de `body` usa `clip` y no `hidden` porque `hidden` rompe **todo** `position: sticky` debajo |
| 🔴 **`overflow-y` en `<html>`**  | —                                                                            | **NO lo agregues.** Vuelve a `<html>` un scroll container y WebKit desprende los `position: fixed` — el bottom nav se va con el scroll, peor todavía con `viewport-fit: cover`. El comentario del archivo lo dice; esta fila existe porque el archivo no se lee antes de editarlo |
| **El documento mide la ventana** | `globals.css` — `body { min-height: 100svh }`                                | `svh`, nunca `vh`: en iOS `100vh` es el alto con las barras plegadas y deja al documento más alto que la ventana (ver §6b) |
| **Teclado FUERA de un diálogo**  | `useViewportInsets` (montado en `DashboardShell`) → `--viewport-offset-top`, `--visual-viewport-height`, `--viewport-bottom-gap` | La geometría **global** de la parte visible. La consumen el `Header` y el `BottomNav` ([`sk-navigation §7`](../sk-navigation/SKILL.md)); disponible para cualquier cosa pegada a un borde. 🔴 No reescribas la fórmula sin leer su JSDoc — cada acote costó una ronda en un teléfono |
| **Medirlo en el teléfono**       | `ViewportDebug` + `lib/pwa/viewportDebug`                                    | Lector en vivo de los números del viewport, más el rango que recorrieron durante el último arrastre. Se prende con `#vvdebug` en la URL o tocando la píldora de entorno (la única vía en la app instalada; sólo existe fuera de producción) |
| **Abrirlo en el teléfono (dev)** | `next.config.ts` — `allowedDevOrigins` leído de `NEXT_DEV_ORIGINS`          | Next 16 rechaza sus recursos `/_next/*` en dev desde cualquier origen distinto al que abrió el server: desde `http://<ip-lan>:3000` la página carga, el bundle no, nada hidrata y el login rebota sin error. `NEXT_DEV_ORIGINS=<ip-lan> pnpm dev -H 0.0.0.0` lo declara sin commitear ninguna IP (`.env.example` lo documenta). `next.config.ts` nace congelado: un derivado anterior lo agrega a mano → [retrofit §5.1](../../docs/retrofits/ios-keyboard-viewport-adoption.md) |

---

## 1. Service Worker — `src/app/sw.ts`

**App Router native location.** Next.js (via `@serwist/turbopack`) compiles `src/app/sw.ts` to `/sw.js` at the origin.

- Built with **Serwist** (successor to Workbox): `Serwist`, `CacheFirst`, `StaleWhileRevalidate`, `NetworkFirst`, `ExpirationPlugin`.
- Combines two concerns in one SW: (a) precache + runtime caching for offline/PWA, (b) `push` + `notificationclick` handlers for VAPID push.
- Precache manifest is injected at build time: `precacheEntries: self.__SW_MANIFEST`.
- `SW_VERSION` constant (`'1.0'` as of writing) forces SW-file content change on release. Bump on each release or replace with CI build id / git SHA.

### Caching firewall (strict)

The kit intentionally ships a **conservative** runtime caching list. The `sw.ts` header comment documents the safety rules:

- NEVER cache navigations (HTML documents) — breaks Next.js streaming SSR hydration.
- NEVER cache RSC payloads (requests with `RSC: 1` header) — stale RSC = fatal server/client tree mismatch.
- NEVER cache `/api/*` — includes SSE streams, server actions, auth callbacks.
- NEVER cache Next.js server actions (`POST` with `Next-Action` header).
- Only cache immutable/static: fonts, images, CSS, `/_next/static/*`.

**Pattern:** no catch-all / firewall rule. If no `runtimeCaching` matcher matches, Serwist **passes the request through to the browser natively** (no `respondWith()`). This avoids the `NetworkOnly` trap where the SW rejects when the server is unreachable and kills the page.

### Shipped `runtimeCaching` matchers

| Matcher                                   | Handler                                      | Cache name                 |
| ----------------------------------------- | -------------------------------------------- | -------------------------- |
| `https://fonts.gstatic.com/*`             | `CacheFirst` (1 year, 4 entries)             | `google-fonts-webfonts`    |
| `https://fonts.googleapis.com/*`          | `StaleWhileRevalidate` (7 days, 4 entries)   | `google-fonts-stylesheets` |
| Local font files (`.woff2`, `.ttf`, etc.) | `StaleWhileRevalidate` (7 days, 4 entries)   | `static-font-assets`       |
| Images (`.jpg/.png/.svg/.webp/...`)       | `StaleWhileRevalidate` (30 days, 64 entries) | `static-image-assets`      |
| `/_next/image?url=...`                    | `NetworkFirst` (1 day, 64 entries)           | `next-image`               |
| CSS (`.css`, `.less`)                     | `StaleWhileRevalidate` (1 day, 32 entries)   | `static-style-assets`      |

> `/_next/static/*.js` is **not** a runtime rule — it's already in the precache manifest (content-hashed). Adding a runtime rule would duplicate cache surface.

### Managed update flags

```ts
new Serwist({
  skipWaiting: false, // New SW waits in "waiting" until user opts in
  clientsClaim: false, // Don't take over controllerless clients silently
  navigationPreload: false, // Incompatible with "don't cache navigations"
  runtimeCaching: safeRuntimeCaching,
});
```

This is the **managed-update** contract — the core reason the kit's PWA is stable. See §3.

---

## 2. SW caching headers — `next.config.ts`

**Critical:** Next.js's default `s-maxage=31536000` on static assets would freeze the SW file for one year. The kit overrides this:

```ts
// next.config.ts → headers()
{ source: '/serwist/:path*', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
{ source: '/sw.js',          headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
```

Plus security headers (`X-Frame-Options`, `HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) applied to `/:path*`.

**Wrapping order in `next.config.ts`:**

```ts
export default withSerwist(sentryConfig); // Sentry → then Serwist
```

Touching this order or removing the headers will silently break SW updates in production.

---

## 3. Managed update flow — `src/components/pwa/PwaUpdateToast.tsx`

Mount once (typically from `Providers.tsx`). Detecta SW nuevo y aplica un flow **híbrido**: auto-reload silencioso cuando es demostrablemente seguro, toast en cualquier otro caso. Nunca toma over silenciosamente sin pasar la decisión de §3.2.

> **Retrofit (derivados con `src/` congelado):** los derivados bootstrapeados antes de esta versión corren el modelo viejo de "4 guards" (`userInteracted` one-shot, sin guardas de trabajo-en-riesgo ni camino re-foco). Para adoptar el modelo nuevo: aplicar el diff de `evaluateAutoUpdateSafety.ts` + `PwaUpdateToast.tsx` + el puente `peekUnsavedChanges` (en `UnsavedChangesContext.tsx`) + el registry `saveInFlight.ts`. No llega por `factory:update` (es `src/`, no `.claude/`).

Flow:

1. On mount, skip if no active controller (first install ≠ update).
2. Check `registration.waiting` / `registration.installing` y enganchar `updatefound`. En `visibilitychange`/`window 'focus'` además se re-chequea `registration.waiting` y se rutea a `handleWaitingUpdate` — un SW que quedó en `waiting` antes de suspender la PWA en iOS standalone activa al reabrir (el `update()` solo no lo dispara: es noop si no hay bytes nuevos).
3. Cuando hay un waiting SW → `handleWaitingUpdate(waitingSW)` ejecuta `evaluateAutoUpdateSafety()` (ver §3.2).
4. **Silent path (decisión `true`):** `sessionStorage` loop guard + listener de `controllerchange` (enganchado **una sola vez** vía `bindControllerReload`, ANTES del postMessage) + `waitingSW.postMessage({ type: 'SKIP_WAITING' })` → SW activa → `controllerchange` → `window.location.reload()`. Si había un toast visible (re-foco que supersede), `toast.dismiss()` primero.
5. **Toast path (decisión `false`, exception, o loop guard activo):** Sonner toast _"Nueva versión disponible — Recargar"_ con `duration: Infinity`. Click → mismo `postMessage` → reload por `controllerchange`.

**Por qué híbrido:** el strict-only mantiene tabs abiertas seguras pero degrada UX en el caso más común (cold reopen / resume sin trabajo). La decisión de §3.2 demuestra safety antes de auto-reloadear; en cualquier escenario ambiguo se cae al toast. Cero pérdida funcional vs el flow strict original.

**El helper `evaluateAutoUpdateSafety` vive en `src/lib/pwa/evaluateAutoUpdateSafety.ts`** como función pura con inyección de dependencias (`getNavType`, `now`, `mountedAt`, `lastInteractionAt`, `hasUnsavedChanges`, `saveInFlight`, `isRefocus`, `countClients`). Esto permite unit-testear la decisión sin SW real ni `performance` API — ver `tests/unit/pwa/evaluateAutoUpdateSafety.test.ts`.

### 3.1 Update detection cadence (4 triggers)

`PwaUpdateToast` calls `registration.update()` on **four** triggers, not just at mount. Long-running mobile PWAs that never close would otherwise miss new SWs for days (browser default is ~24h cache):

| Trigger            | Effect                                                       | Why                                                                                   |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Mount              | First render after the component lands.                      | Baseline check on app load.                                                           |
| Pathname change    | Every client-side route change (via `usePathname()`).        | Active users navigating naturally hit fresh checks without a hard reload.             |
| `visibilitychange` | Tab returns to foreground (`visibilityState === 'visible'`). | User came back to the app after focus was elsewhere — high signal moment for a check. |
| `window 'focus'`   | Window regains focus.                                        | Complement to visibilitychange; some browsers fire one and not the other.             |

`registration.update()` is **idempotent and rate-limited by the browser**. Calling it more often is a noop when the SW response hasn't changed, so no throttle is needed. The component only fires the request — it does not force activation. The `SKIP_WAITING` postMessage stays gated by the user clicking the toast's "Recargar" button (§3 step 4).

El `controllerchange` listener se engancha **una sola vez** vía `bindControllerReload` (guardado por un ref) — lo comparten el toast path y el silent path, así que nunca hay doble reload. En el silent path se engancha **antes** del `postMessage SKIP_WAITING` (evita race con un SW que activa rapidísimo).

### 3.2 Auto-reload decision — 2 guardas duras + 2 caminos

`evaluateAutoUpdateSafety()` (en `src/lib/pwa/evaluateAutoUpdateSafety.ts`) retorna `true` solo si **ninguna** guarda dura bloquea, **un** camino aplica, y es la única tab. Cualquier fallo o excepción → `false` → toast.

**Guardas duras (sync, primero — nunca recargar sobre trabajo en riesgo):**

| Guarda              | Verificación                                                     | Por qué                                                                                  |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `hasUnsavedChanges` | `peekUnsavedChanges()` (snapshot del provider de unsaved-changes) | Form sucio (registrado vía `<Form>` o `useUnsavedChangesGuard`) — recargar perdería lo escrito. |
| `saveInFlight`      | `peekSaveInFlight()` (registry `useSaveInFlight`)               | Save async en vuelo (autosave / mutación optimista) — recargar lo perdería.              |

**Caminos (uno debe aplicar; los checks sync corren antes del single-tab async → fast-fail):**

| Camino      | Verificación                                                                        | Para qué                                                                 |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Cold**    | `getNavType()==='navigate'` + `now - mountedAt < 5_000` + `lastInteractionAt === 0` | Llegada fresh, sin tocar nada (intacto vs el flow viejo → cero regresión). |
| **Re-foco** | `isRefocus` + (`lastInteractionAt === 0` ∨ `now - lastInteractionAt >= 10_000`)     | PWA iOS suspendida que reabre, quieta ≥10s. `isRefocus` se deriva de `lastVisibleAtRef` dentro del handler (ventana ~60s). |

**Single-tab (async, último):** cliente envía `COUNT_CLIENTS` al active SW vía `MessageChannel` (timeout 1.5s); requiere exactamente `1`. No-entero/negativo/timeout → `Infinity` → fail.

> **`lastInteractionAt`** lo escribe cada evento de interacción (capture phase: `pointerdown`/`click`/`touchstart`/`keydown`/`beforeinput`/`input`/`paste`/`compositionstart`) como **timestamp continuo** (ya no un flag one-shot). `lastVisibleAtRef` lo escriben `visibilitychange`/`focus`.

**Re-foco que supersede el toast:** si ya se mostró toast y un re-foco posterior es silent-safe, se acota a **una re-evaluación por ventana de re-foco** (ref dedicado) y se hace `toast.dismiss()` antes de recargar.

**Loop guard:** `sessionStorage['pwa-auto-reload-in-flight'] = { startedAt }` con TTL 5 min. Previene reload loops si la activación falla a medias. Cleanup best-effort en mount: si el flag existe pero ya no hay `registration.waiting`, se borra.

**Recovery:** todo el silent path está envuelto en try/catch; cualquier excepción cae a `showUpdateToast(waitingSW)`. Cero pérdida funcional vs el flow strict.

**SW handler `COUNT_CLIENTS`** (en `src/app/sw.ts`): responde el número de window clients del scope.

```ts
if (event.data?.type === 'COUNT_CLIENTS') {
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => port.postMessage({ count: clients.length }))
      .catch(() => port.postMessage({ count: -1 }))
  );
}
```

- `includeUncontrolled: true` para que la respuesta sea correcta aunque el worker que responde no haya claimed clients (ej: waiting SW).
- `event.waitUntil(...)` evita que el worker termine antes de responder.
- `count: -1` en catch → el cliente lo interpreta como `Infinity` → cae al toast.

**Bootstrap note:** el primer deploy post-merge ejercita todavía el flow viejo (los clientes corren la versión previa del componente, sin guards). Recién a partir del segundo deploy se activa el silent path. Inherente al SW upgrade cycle, no es bug.

---

## 4. Install prompt — `src/components/pwa/PwaInstallToast.tsx` + `IosA2hsHint.tsx`

### Chromium / Android (`PwaInstallToast`)

- Uses `usePwaInstall()` hook (`src/lib/pwa/usePwaInstall.ts`) — captures `beforeinstallprompt`, tracks `appinstalled`, exposes `canInstall` / `isInstalled` / `promptInstall`.
- Only shows on protected routes: `PROTECTED_ROUTES = ['/dashboard', '/settings', '/profile']`.
- 7-day cooldown after dismissal via `localStorage['pwa-install-dismissed']`.
- 3-second delay before showing; Sonner toast with _"Instalar"_ + _"Más tarde"_ actions.

### iOS Safari (`IosA2hsHint`)

- `beforeinstallprompt` doesn't fire on iOS — show a manual hint instead.
- Detects iOS Safari + non-standalone mode via UA sniffing + `navigator.standalone` (the `isIosSafari()` guard).
- Renders via Sonner `toast()` (same system as `PwaInstallToast`/`PwaUpdateToast`) — **not** a custom fixed div. The toast **inherits** the `<Toaster>` position (`top-center` on touch, `bottom-right` on pointer — see `sonner.tsx`); never pass an explicit `position`.
- The Share icon glyph is rendered as inline JSX in the toast `description` (`Toca <Share /> y luego "Agregar a inicio"`), not as a standalone button.
- `duration: Infinity` + `closeButton: true` — the toast stays until the user dismisses it; the close button is the dismiss affordance.
- One-shot via `localStorage['ios-a2hs-shown']`: the guard is checked before calling `toast()`, and the flag is written in both `onDismiss` (manual close) and `onAutoClose` (covers any finite-duration path). Guarded by `typeof window !== 'undefined'` since the component is `'use client'`.

---

## 5. Helpers — `src/lib/pwa/`

| File                     | Export                                                  | Purpose                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usePwaInstall.ts`       | `usePwaInstall()`                                       | Client hook — `beforeinstallprompt` capture, `appinstalled` tracking, `promptInstall()` trigger                                                                                                                   |
| `sw-listener.ts`         | `registerSwListener()`                                  | Mount once in `Providers.tsx` — handles `SW_NAVIGATE` postMessage from SW notificationclick + logs `controllerchange`                                                                                             |
| `usePullToRefresh.ts`    | `usePullToRefresh()`                                    | Client hook — touch gesture driver. Consumed by both `<PullToRefreshShell>` (default, shell-mounted) and `<PullToRefresh>` (per-screen advanced). Detail → [`sk-pull-to-refresh`](../sk-pull-to-refresh/SKILL.md) |
| `shellPullToRefresh.tsx` | `ShellPTRProvider`, `useShellPTR`, `useDisableShellPTR` | Counter-based context that lets a screen opt-out of the shell-wide PTR while it owns its own refresh callback. Mounted by `DashboardShell`.                                                                       |
| `index.ts`               | Barrel                                                  | Re-exports                                                                                                                                                                                                        |

> The kit ships **two PTR primitives** at `src/components/pwa/`: `<PullToRefreshShell>` (default — mounted once in `DashboardShell`, gated by `isMobile()`, hardcoded `router.refresh()`) and `<PullToRefresh>` (per-screen wrapper for custom scroll containers). Both are exported from `@/components/pwa`. The default gate is capability-based (`isMobile()`), not PWA-only — `usePwaInstall` composition is opt-in via `enabled={isInstalled}` on the wrapper. See [`sk-pull-to-refresh`](../sk-pull-to-refresh/SKILL.md) for callback patterns, the a11y rule (always pair with a visible "Actualizar" button), and the `useDisableShellPTR()` opt-out.

**SW_NAVIGATE contract:** the SW's `notificationclick` handler does NOT call `client.navigate()` directly. Instead it `postMessage({ type: 'SW_NAVIGATE', url })` to an existing tab, and `registerSwListener` on the client calls `window.location.href = url`. Keeps the SW out of the navigation path → no state corruption from mixed bundles.

---

## 6. Manifest & icons — `public/pwa/`

Shipped assets:

```
public/pwa/
├── apple-touch-icon.png   (iOS home-screen icon)
├── icon-192.png           (Android baseline + notification icon + badge)
├── icon-256.png
├── icon-384.png
├── icon-512.png           (Android splash / install)
└── maskable-512.png       (Android maskable — required for adaptive icons)
```

The web manifest itself is served from `src/app/manifest.ts` (Next.js App Router convention) — edit there, not a static `.webmanifest` file. If missing, add via `src/app/manifest.ts` following Next.js Metadata API.

**Notification defaults in `sw.ts`:**

```ts
const DEFAULT_ICON = '/pwa/icon-192.png';
const DEFAULT_BADGE = '/pwa/icon-192.png';
const DEFAULT_URL = '/notifications';
```

### Maskable icon safe-zone

`maskable-512.png` is the **only** icon with `purpose: "maskable"` in the manifest. Android adaptive-icon launchers (and the Play Store) clip every maskable icon with a **mask** — most commonly a circle, but also squircle / rounded-square / teardrop depending on the OEM. Anything outside the mask is cut off. So a maskable icon must keep all meaningful content (logo, glyph) inside a **safe zone**, with the rest filled by a **solid background** (never transparent — a transparent maskable renders with black/garbage edges under the mask).

**The rule (W3C maskable spec):** the safe zone is the **inscribed circle at 80% of the icon's diameter**, centered. For a 512×512 canvas that is a circle of **410px diameter** (radius 205px, centered at 256,256). All foreground content must fit inside that circle. Some aggressive launchers clip closer to ~72% (≈184px radius), so leaving a little extra margin is good practice — the kit asset targets ~68% of diameter for headroom.

| Property        | Requirement                                              |
| --------------- | ------------------------------------------------------- |
| Canvas          | 512×512                                                  |
| Safe zone       | inscribed circle, 80% diameter = **410px** (radius 205) |
| Background      | **solid, opaque** (no alpha channel) — not transparent  |
| Foreground fit  | all content inside the safe circle (measure by the farthest pixel's radius from center, not just the bbox width — the mask is a circle) |
| File size       | keep < 200KB (informal manifest-icon ceiling)           |

**Regenerating the asset (local-only — never upload to an online icon generator; privacy policy):** use `sharp` (if installed as a devDependency) or ImageMagick (`magick`) / Inkscape CLI. The kit's `maskable-512.png` was regenerated by extracting the existing foreground, scaling it so its diagonal fits the safe circle, and centering it on a solid black 512 canvas with the alpha channel removed:

```bash
# 1. Inspect current asset
magick identify public/pwa/maskable-512.png            # dims + type
md5 public/pwa/maskable-512.png                        # record hash for evidence

# 2. Extract foreground, scale to fit the safe circle, recompose on solid bg, drop alpha
magick public/pwa/maskable-512.png -fuzz 0% -trim +repage /tmp/content.png
magick /tmp/content.png -resize 303x243 \
  -background black -gravity center -extent 512x512 \
  -alpha remove -alpha off PNG24:public/pwa/maskable-512.png
#   ↑ resize target = foreground sized so its diagonal ≤ safe diameter; -alpha remove flattens onto bg

# sharp equivalent (if preferred): sharp(src).resize(...).flatten({ background }).extend(...).png()
```

> Pick the resize dimensions so the **content's diagonal** lands inside 410px (the circle, not the square). A square-fit (resize the whole bbox to 410²) under-fills, because the corners of a 410×410 box poke outside the 410-diameter circle.

**Verification checklist:**

- [ ] `md5` of the new file differs from the old one (asset was actually regenerated)
- [ ] `magick identify` reports `512x512`
- [ ] Background is opaque — corner pixels have no alpha (`magick identify -verbose` shows `Type: TrueColor`, not `TrueColorAlpha`; or sample a corner: `magick public/pwa/maskable-512.png -format '%[pixel:p{2,2}]' info:` → `srgb(...)` without an alpha term)
- [ ] File size < 200KB (`stat -f%z public/pwa/maskable-512.png`)
- [ ] **Chrome DevTools → Application → Manifest → Icons:** the maskable preview shows the full logo with no clipping under the circular mask overlay (manual check — not scriptable headless)
- [ ] Cross-check against [maskable.app](https://maskable.app) editor by loading the file locally (no upload of brand assets to third parties — use only as a visual sanity check, or rely on the DevTools preview)

### WebAPK and Play Protect

When a user installs the PWA on Android via Chrome ("Add to Home screen" / the install prompt), Chrome doesn't just create a shortcut — it requests a **WebAPK**: a minimal Android app package, generated by a Google-hosted minting server, that wraps the PWA so it gets a real launcher icon, an app entry in Settings, and runs in a standalone window (no browser chrome). This is why the maskable icon and manifest matter: the WebAPK bakes them into a native Android icon, which is exactly what the OEM mask clips.

- **When it's generated:** on install, Chrome sends the manifest + icons to the minting server, which returns a signed APK that Chrome installs silently (after the user grants the one-time "install unknown apps" / Play-services flow). Updating the manifest or icons triggers a re-mint on a later visit (not instant).
- **Play Protect warning on first install:** because each WebAPK is freshly minted and (for a new or low-traffic app) has very few prior installs, **Google Play Protect** may show a warning on the first install — e.g. "app was not scanned" / "unknown app" / a prompt to send the app to Google for review. This is an **install-reputation** signal (low install count + new signing identity), **not** a sign that anything is wrong with the PWA. It typically disappears as the install base grows.

**Mitigation (reference: 2026-06 — Play Protect policies change over time; re-verify against current Google docs):**

- Ship over **HTTPS** with a valid manifest and correct icons — a malformed manifest makes Chrome fall back to a non-WebAPK shortcut, which looks worse and loses the native icon.
- The WebAPK is **signed by Google's minting key**, not the developer's — you don't manage signing for WebAPKs, so don't chase a "developer signature" fix; the reputation builds from install volume.
- If a warning appears for a legitimate app, users can tap through ("install anyway") and you can **report the false positive** to Google via the Play Protect appeals / app-review flow.
- For apps that need to avoid the warning entirely (enterprise, regulated), ship a **TWA (Trusted Web Activity)** packaged with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) and distribute through the **Play Store** — a store-reviewed listing carries its own trust and sidesteps the unknown-source path. That's a larger effort (Play developer account, signing, review) and out of scope for the kit default, which relies on the browser-minted WebAPK.

---

## 6b. Edge-to-edge viewport (iOS safe areas)

Las PWA del kit corren **edge-to-edge**: el `export const viewport` de `src/app/layout.tsx` declara `viewportFit: 'cover'`, así la app instalada pinta la pantalla completa (bajo el notch / Dynamic Island y sobre la home indicator) en vez de quedar enmarcada por franjas del sistema. Ese flag **activa** los `env(safe-area-inset-*)`; sin él valen 0.

El shell ya reserva esas zonas (header, bottom nav, contenido) con utilities tokenizadas — **SSOT en [`sk-navigation`](../sk-navigation/SKILL.md) §7** (`pt-safe`, `h-header-safe`, `pt-content-safe`, `pb-nav-safe`, `pb-content-safe`). Cualquier elemento `fixed`/`absolute` nuevo pegado a un borde debe respetar el inset correspondiente. **Verificar siempre en PWA instalada en iPhone real** — en Safari responsive `env()` = 0 y el problema no se reproduce.

### `statusBarStyle: 'black-translucent'` — opt-in CON DUEÑO, nunca un default

El kit shippea `appleWebApp.statusBarStyle: 'default'` en `src/app/layout.tsx`, y así se queda.
Circula la idea de que `viewportFit: 'cover'` es "media receta" y que sin `black-translucent` el
inset superior queda inerte. **Eso es falso como regla general**: con `default`, iOS pinta la
franja de la barra de estado con el fondo de la página y adapta el reloj solo — verificado con
capturas de una PWA instalada, en tema claro y oscuro.

🔴 **Antes de proponer el cambio, mira la PWA instalada del proyecto.** Si la franja ya toma el
color del tema, no hay problema que resolver. Y si lo adoptas, estos tres costos no tienen vuelta:

| Costo                                          | Detalle                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Reloj **blanco fijo**                          | iOS deja de adaptarlo. En un tema claro desaparece contra el header                                                   |
| Toda pantalla **sin header fijo** reserva el inset | En el kit: `src/app/(auth)/layout.tsx`. Sin eso, el login queda debajo del reloj en la app instalada                   |
| **Android no gana nada**                       | Ignora el meta de Apple; Chrome pinta la franja con el `theme_color` del manifest y adapta el reloj. El cambio es iOS-only |

Un derivado con un solo tema oscuro lo quiere; uno con tema claro pierde el reloj.

### El teclado en iOS no encoge la página — la desliza

Existe una línea de CSS que resolvería esto (`interactive-widget=resizes-content` en el meta
viewport) y **Safari en iOS no la implementa** ([WebKit 259770](https://bugs.webkit.org/show_bug.cgi?id=259770), abierto; sí está en Chrome 108+ y Firefox 132+). Sin ella,
al abrir el teclado iOS **no encoge el layout viewport**: desliza hacia arriba la parte visible.
Consecuencias que hay que dar por ciertas al escribir cualquier pantalla con un campo de texto:

```
· un `fixed top-0` queda FUERA de lo visible
· un `fixed bottom-0` queda DETRÁS del teclado (el layout viewport no se movió)
· `env(safe-area-inset-bottom)` SIGUE valiendo 34px en la app instalada — el inset es de la
  VENTANA, no de lo visible → se acolcha para un home indicator que ya no está abajo
· `innerHeight` NO es estable con el teclado abierto (641 → 421 → 330 en tres capturas del
  MISMO teclado) → toda detección por `innerHeight - visualViewport.height` falla
```

🔴 **Nunca calibres un umbral de "teclado abierto".** Su altura cambia por modelo y por teclado
(emoji, barra predictiva, teclados de terceros): el umbral que funciona en un teléfono se rompe
en el siguiente. Se sigue la geometría de `visualViewport` **siempre**, con o sin teclado.

**Lo que NO se arregla, y conviene saberlo:** iOS desliza la parte visible cuadro a cuadro
**antes** de avisar, así que el layout la alcanza un cuadro después y se ve un pequeño ajuste al
final de la animación. Sin `resizes-content` no hay forma de ir junto con el teclado sin adivinar
su destino, y adivinar es lo que rompió las primeras rondas del proyecto que lo midió. Es un
límite de plataforma, no un pendiente.

---

## 7. Feature flag

> **No explicit `NEXT_PUBLIC_PWA_ENABLED` in `src/lib/env.ts`.** The kit's env schema does not gate the PWA behind a flag — it's always compiled and registered if `@serwist/turbopack` runs. To disable in dev, either (a) don't register the SW from the client, or (b) branch on `process.env.NODE_ENV`.
>
> **If a derived project needs an explicit flag**, add `NEXT_PUBLIC_PWA_ENABLED: booleanString` to `envSchema` and gate the `<PwaUpdateToast />` / `<PwaInstallToast />` / `registerSwListener()` mounts from `Providers.tsx`.

Push notifications **are** gated — see §8.

---

## 8. Push notifications (VAPID)

### Env vars (`src/lib/env.ts`)

| Var                                 | Scope           | Purpose                                                                |
| ----------------------------------- | --------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`      | Public          | Client subscribes with this                                            |
| `VAPID_PRIVATE_KEY`                 | **Server-only** | Signs push payloads server-side                                        |
| `VAPID_SUBJECT`                     | Server-only     | `mailto:` or URL identifying the app                                   |
| `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` | Public          | Master feature flag (also gates in-app/email — see `sk-notifications`) |

Accessors: `isPushConfigured()` returns `true` only when all three are present. `getVapidConfig()` throws a helpful error (`Generate keys with: npx web-push generate-vapid-keys`) if called while unconfigured.

### SW-side flow (in `src/app/sw.ts`)

- `push` event: parses JSON payload `{ title?, body?, url?, icon?, badge? }`, falls back to plain text. Calls `self.registration.showNotification(title, options)` with `tag: \`push-${Date.now()}\`` so notifications stack instead of replacing.
- `notificationclick` event: `event.notification.close()`, then tries to focus an existing window and post `SW_NAVIGATE`. Fallback: `self.clients.openWindow(absoluteUrl)`.

### Cross-reference

Dispatch (server-side web-push invocation, subscription storage, delivery tracking) lives in [`sk-notifications`](../sk-notifications/SKILL.md). This skill documents only the SW reception side and env config.

---

## 9. Cómo extender

### Add a route caching rule

Edit `src/app/sw.ts` → `safeRuntimeCaching` array. Respect the firewall rules (§1): no navigations, no RSC, no `/api/*`, no `POST`. Prefer `StaleWhileRevalidate` for assets that rarely change, `NetworkFirst` for things that must stay fresh but need offline fallback. Always attach an `ExpirationPlugin` with `maxEntries` + `maxAgeSeconds`.

### Change offline fallback

Not shipped by default. To add: precache an `/offline` page, register a `NavigationRoute` rule in `safeRuntimeCaching` that matches `request.mode === 'navigate'` — but **only** if you're willing to give up the "don't cache navigations" guarantee. Test hydration / RSC behavior thoroughly.

### Extend the push payload

1. Update the SW `PushPayload` interface in `src/app/sw.ts`.
2. Update the server-side dispatcher in `sk-notifications` to include the new fields.
3. For non-trivial payload changes, bump `SW_VERSION` — otherwise users keep the old parser until their SW updates.

### Expose a new deep link from notificationclick

The SW already forwards `payload.url` verbatim to the client via `SW_NAVIGATE`. No SW change needed — just send the URL in the server-side push payload.

---

## 10. Troubleshooting (DevTools)

| Síntoma                           | Diagnóstico                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Toast "Nueva versión" no aparece  | DevTools → Application → Service Workers: ¿hay SW `waiting`? Si no, no hay update real       |
|                                   | Console: buscar errores de `PwaUpdateToast` (mount/listener)                                 |
|                                   | Forzar: DevTools → Service Workers → "Update" / `registration.update()`                      |
| SW viejo sigue activo tras reload | DevTools → Service Workers → "Skip waiting" (manual override del flow managed)               |
|                                   | Nuclear: DevTools → Application → Storage → "Clear site data"                                |
| Errores `no-response` en consola  | Alguna regla en `safeRuntimeCaching` está interceptando requests que no debería              |
|                                   | Confirmar que solo hay matchers para assets estáticos (fonts/images/CSS/`_next/static`)      |
| Validar auto-reload silencioso    | Smoke manual sobre deploy real (Playwright + SW es notoriamente flaky — ver checklist abajo) |

**Bump manual de `SW_VERSION`:** cambia la constante en `src/app/sw.ts` para forzar byte-diff del archivo `/sw.js` y disparar el flow de update sin necesidad de cambios de bundle.

**Manual smoke checklist (post-deploy):**

- iPhone Safari standalone PWA: instalar v1 → deploy v2 → cerrar app → abrir → ¿auto-reload silencioso?
- Chrome desktop, tab única: instalar v1 → deploy v2 → cerrar tab → abrir → ¿auto-reload?
- Chrome desktop, 2 tabs del origin: deploy v2 → ¿toast en ambas (no auto)?
- Chrome desktop con form a medias + input escrito: deploy v2 → ¿toast (no auto)?
- Loop guard: setear `sessionStorage['pwa-auto-reload-in-flight']` manualmente → ¿toast (no auto)?
- Failure mode: forzar timeout del `COUNT_CLIENTS` → ¿`Infinity` → toast?

---

## 11. Anti-patterns

```
❌ Register a custom SW outside src/app/sw.ts (breaks Serwist precache manifest injection)
❌ Add skipWaiting: true or clientsClaim: true to the Serwist instance (breaks managed updates — tabs die on takeover)
❌ Remove the no-cache/no-store/must-revalidate headers for /sw.js in next.config.ts (users stuck on old SW forever)
❌ Cache navigations, RSC, /api/*, or Next-Action POSTs in runtimeCaching (fatal hydration / auth / stream bugs)
❌ Call client.navigate() directly from the SW's notificationclick (use SW_NAVIGATE postMessage — kit pattern)
❌ Commit VAPID_PRIVATE_KEY to git or expose via NEXT_PUBLIC_* (private key is server-only)
❌ Edit a third-party primitive in src/components/ui/ to change notification/install styling — wrap, don't fork (classify the file first: SK.md §3.3)
❌ Dispatch SKIP_WAITING sin pasar `evaluateAutoUpdateSafety` (2 guardas duras: unsaved + save-in-flight · camino cold o re-foco · single-tab) — el silent path es seguro solo bajo la decisión verificable de §3.2
```

---

Cross-reference: [`sk-notifications`](../sk-notifications/SKILL.md) — push dispatch, subscription storage, in-app/email channels. [`sk-features-index`](../sk-features-index/SKILL.md) — feature catalog.
