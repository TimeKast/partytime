# A8 — ⚙️ Build, config y deploy

> **Estado:** ⬜ pendiente · **Owner/Sesión:** — · **Inicio:** —
> **SHA de referencia del framework:** `bcc7f1e` · **SHA auditado:** *(llenar con `git rev-parse --short HEAD` al tomar el lock)*
> **Protocolo:** seguir al pie de la letra el "Protocolo por sesión (lock atómico)" y las "Reglas de evidencia" de `docs/audits/00_INDEX.md`. Read-only sobre el código de la app: solo se escribe en este MD y en el INDEX.

---

## 1. Objetivo

Verificar que el proyecto **compila, tipa y lintea limpio**, que su **configuración declarada** (env vars, `vercel.json`, `next.config.js`, `tsconfig.json`, `drizzle.config.ts`, `package.json`) coincide con lo que el código realmente consume y con lo que la documentación promete, y que los supuestos de **deploy en Vercel Hobby** (cron cada 12h, `maxDuration = 300`) son compatibles con los límites reales del plan. Detectar defaults peligrosos, vars sin documentar, vars fantasma, y ausencia de tooling (lint/tests).

## 2. Contexto mínimo (sesión fría)

- **App:** "Party Time!" — Next.js 14 App Router + TypeScript + Drizzle ORM + Neon PostgreSQL + Resend. **Producción con datos y usuarios reales.**
- **Hosting:** Vercel plan **Hobby**, deploy **automático on push a `main`** (no hay CI intermedio: lo que pushea, se despliega).
- **Límites de Hobby relevantes a esta auditoría** (verificar contra doc oficial vigente durante la ejecución — cambian con el tiempo):
  - **Cron jobs:** Hobby históricamente limita cantidad de crons por proyecto y la **frecuencia de invocación** (documentado en su momento como "una vez al día"). El proyecto declara `0 */12 * * *` (cada 12h) — ítem 8 del checklist.
  - **Duración de funciones serverless:** Hobby tiene un default bajo y un máximo por plan; `maxDuration = 300` (5 min) está declarado en 2 endpoints — ítem 9. El fix `cc195f8` (no duplicar emails por timeout de cron) nació precisamente de un timeout, lo que sugiere que el límite efectivo fue menor a 300s en algún momento.
- **Build local:** requiere `RESEND_API_KEY` aunque sea dummy: `RESEND_API_KEY=re_dummy npm run build` (ver PRE-4).
- **Migraciones:** existe carpeta `drizzle/` con SQL generado (`0000_add_og_image_url.sql`, `0001_add_rsvp_closed.sql`) **y** scripts `db:push` (push directo sin migración) — ítem 13.

## 3. Scope

**Incluye:**
- `next.config.js`, `vercel.json`, `tsconfig.json`, `drizzle.config.ts`, `package.json` (scripts y dependencias).
- Build (`npm run build`), typecheck (`npx tsc --noEmit`), lint (`npm run lint`).
- Inventario exhaustivo `process.env.*` en `app/`, `lib/`, `scripts/` vs `.env.example` vs `SETUP_GUIDE.md`/`README.md`.
- Defaults/fallbacks de env vars con efecto en producción (URLs en emails, secrets con default).
- `app/manifest.ts` + íconos (`app/icon.tsx`, `app/apple-icon.tsx`, `app/icon-192/route.tsx`, `app/icon-512/route.tsx`).
- Compatibilidad de `vercel.json` (cron) y `maxDuration` con el plan Hobby.
- Ausencia de tests automatizados.
- Flujo real de schema DB: `db:push` vs migraciones generadas.

**NO incluye (out of scope):**
- Contenido/exactitud editorial de los MDs de root (`README.md`, `SETUP_GUIDE.md`, `ADMIN_GUIDE.md`, etc.) más allá de la tabla de env vars → **A5** (código/documentación muerta o duplicada).
- Modelo de auth, protección de endpoints y sesiones → **Fase S**. Las menciones a `CRON_SECRET` en este MD son constatación factual de existencia del check, sin evaluación.
- Lógica de negocio de emails/reminders → **A1**.

## 4. Checklist ejecutable

> Todo ítem requiere evidencia (`archivo:línea` o comando + output), también cuando PASA. Ítems no ejecutables → `⏭️ NOT RUN` + razón.

| # | Verificación | Cómo verificar (comando exacto) | Resultado | Evidencia |
|---|--------------|--------------------------------|-----------|-----------|
| 1 | `npm run build` termina limpio (exit 0, sin errores; warnings anotarlos) con env dummy | `cd /Users/bob/TimeKast/partytime && RESEND_API_KEY=re_dummy npm run build` | ⬜ | |
| 2 | **PRE-4:** `npm run build` SIN `RESEND_API_KEY` falla — confirmar reproduciendo y anotar el error exacto | `cd /Users/bob/TimeKast/partytime && env -u RESEND_API_KEY npm run build` (correr en shell sin `.env.local` cargado o renombrar temporalmente `.env.local`; restaurar al terminar) | ⬜ | |
| 3 | `npx tsc --noEmit` limpio (tsconfig ya tiene `strict: true`, `tsconfig.json:8`) | `cd /Users/bob/TimeKast/partytime && npx tsc --noEmit` | ⬜ | |
| 4 | ¿ESLint está configurado? Pre-check al preparar este MD: **no hay** `.eslintrc*`/`eslint.config.*` en root, no hay `eslint` ni `eslint-config-next` en `package.json` (devDeps: solo types/dotenv/drizzle-kit/tsx/typescript) ni en `package-lock.json` (`grep -c '"eslint' package-lock.json` → 0). `npm run lint` = `next lint`, que sin ESLint instalado entra en prompt interactivo | `ls -a \| grep -i eslint ; grep -c '"eslint' package-lock.json ; npm run lint -- --help >/dev/null 2>&1 ; echo exit=$?` — y si es viable, correr `npm run lint` con timeout corto para constatar el prompt | ⬜ | |
| 5 | **Tabla env vars** (sección 4.1): confirmar cada fila con grep, marcar faltantes/sobrantes en `.env.example`, `README.md:49-107`, `SETUP_GUIDE.md:36-98,186-194` | `grep -rn "process\.env\." app lib scripts --include="*.ts" --include="*.tsx" \| grep -o "process\.env\.[A-Z_]*" \| sort -u` y cruzar contra `cat .env.example` | ⬜ | |
| 6 | **Default peligroso — URLs en emails:** `NEXT_PUBLIC_APP_URL \|\| 'http://localhost:3000'` se usa para construir el **cancelUrl que viaja dentro de emails reales**. Si la var falta en Vercel, los emails de producción llevan links a localhost. Sitios: `app/api/admin/send-bulk-reminder/route.ts:126`, `app/api/admin/send-email/route.ts:86`, `app/api/admin/send-bulk-email/route.ts:107`, `app/api/rsvp/route.ts:105`, `app/api/cron/send-reminders/route.ts:144`, `lib/email-template.ts:92`. Constatar cada sitio y clasificar severidad | `grep -rn "NEXT_PUBLIC_APP_URL" app lib --include="*.ts" --include="*.tsx"` | ⬜ | |
| 7 | **Var duplicada / inconsistente:** conviven `NEXT_PUBLIC_APP_URL` (fallback localhost) y `NEXT_PUBLIC_BASE_URL` (fallback `https://party.timekast.mx`) para el mismo concepto de "URL pública". `NEXT_PUBLIC_BASE_URL` en `app/page.tsx:11`, `app/layout.tsx:5`, `app/[slug]/layout.tsx:15`, `app/api/og-image/[slug]/route.ts:119` y NO está en `.env.example` ni en README/SETUP_GUIDE. Confirmar y evaluar si son intencionalmente distintas | `grep -rn "NEXT_PUBLIC_BASE_URL" app lib --include="*.ts" --include="*.tsx" ; grep -n "NEXT_PUBLIC_BASE_URL" .env.example README.md SETUP_GUIDE.md` | ⬜ | |
| 8 | **Cron en Hobby:** `vercel.json` declara `{"path": "/api/cron/send-reminders", "schedule": "0 */12 * * *"}` (cada 12h, UTC). Verificar contra la doc vigente de Vercel si el plan Hobby acepta esa frecuencia o la degrada/rechaza, y si hay límite de # de crons. Si no hay acceso web en la sesión → `⏭️ NOT RUN` + razón, y anotar como pregunta abierta para el consolidado | Con acceso web: consultar `https://vercel.com/docs/cron-jobs/usage-and-pricing`. Adicional (constatación empírica): revisar en el dashboard de Vercel → proyecto → Settings → Cron Jobs el estado real del cron y sus últimas ejecuciones | ⬜ | |
| 9 | **`maxDuration = 300` en Hobby:** declarado en `app/api/cron/send-reminders/route.ts:17` y `app/api/admin/send-bulk-reminder/route.ts:18`. Verificar contra doc vigente si Hobby permite 300s (¿solo con Fluid Compute activo?) o si se trunca silenciosamente al máximo del plan. Relacionar con el fix `cc195f8` (duplicados por timeout de cron): si el límite efectivo es <300s, el `maxDuration` declarado es aspiracional y el riesgo de timeout persiste. Sin acceso web → `⏭️ NOT RUN` + razón | `grep -rn "maxDuration" app --include="*.ts"` + doc `https://vercel.com/docs/functions/configuring-functions/duration` + `git show cc195f8 --stat` para el contexto del fix | ⬜ | |
| 10 | **Constatación factual (→ Fase S):** el endpoint `/api/cron/send-reminders` SÍ contiene un check de `CRON_SECRET` (`app/api/cron/send-reminders/route.ts:24-37`): valida header `authorization: Bearer <secret>` o header `x-vercel-cron-secret`, **solo si** `process.env.CRON_SECRET` está definido. Constatar existencia y líneas; NO evaluar el modelo aquí. Anotar factualmente en "fuera de scope" que la validación es condicional a que la var exista y que el nombre de header que Vercel envía debe cotejarse con su doc — ambos puntos se profundizan en Fase S | `sed -n '19,40p' app/api/cron/send-reminders/route.ts` | ⬜ | |
| 11 | **Manifest + íconos consistentes:** `app/manifest.ts` (name/short_name "Party Time!", `theme_color`/`background_color` `#1a0033`, `start_url: '/admin'`, íconos `/icon-192` 192x192 maskable y `/icon-512` 512x512 any+maskable) vs generadores: `app/icon.tsx` (32x32), `app/apple-icon.tsx` (180x180), `app/icon-192/route.tsx` (192x192), `app/icon-512/route.tsx` (512x512) — todos edge runtime, mismo gradiente base `#1a0033 → #2d0052` y emoji 🎉. Verificar: tamaños declarados vs generados, colores consistentes, y que `/icon-192` y `/icon-512` respondan 200 con `image/png` (probar con `npm run dev` o build local). Anotar si `start_url: '/admin'` es intencional (la PWA instalada abre el panel admin, no la landing) | Read de los 5 archivos + `curl -s -o /dev/null -w "%{http_code} %{content_type}" http://localhost:3000/icon-192` (y 512) con dev server corriendo | ⬜ | |
| 12 | **Ausencia de tests automatizados:** pre-check al preparar este MD: `package.json` no tiene script `test` ni dependencia jest/vitest/playwright/testing-library. Constatar y registrar como hallazgo 🟡 con propuesta mínima (ver A8-plantilla en sección 5) | `grep -n "jest\|vitest\|playwright\|@testing-library\|\"test\"" package.json ; ls -d __tests__ e2e tests 2>/dev/null` | ⬜ | |
| 13 | **Flujo de schema: `db:push` vs migraciones.** `package.json` tiene `db:generate` (drizzle-kit generate), `db:push` (push directo) y `db:studio`, pero NO `db:migrate`. Existe `drizzle/` con 2 migraciones SQL + `meta/`. La doc (`SETUP_GUIDE.md:45`, `README.md:72`, `COMMANDS.md:27`) instruye `npx drizzle-kit push` — es decir, el flujo real documentado es push directo y las migraciones generadas parecen no aplicarse por runner. Constatar cuál es el flujo real, si las 2 migraciones de `drizzle/` están reflejadas en la DB (comparable vía `drizzle-kit check` o inspección), y si la dualidad está documentada en algún lado | `cat package.json \| grep db: ; ls drizzle ; grep -rn "drizzle-kit" README.md SETUP_GUIDE.md COMMANDS.md` | ⬜ | |
| 14 | **`next.config.js` y `tsconfig.json` sanos:** `next.config.js` es mínimo (`reactStrictMode: true` únicamente — sin `ignoreBuildErrors`/`ignoreDuringBuilds`, bien); `tsconfig.json` con `strict: true`, paths `@/*`. Constatar que NO haya flags que silencien errores de build y anotar cualquier ajuste razonable (p.ej. `images.remotePatterns` si se usan imágenes remotas) | Read de ambos archivos + `grep -n "ignoreBuildErrors\|ignoreDuringBuilds" next.config.js` | ⬜ | |
| 15 | **Instanciación a nivel de módulo:** `lib/resend.ts:7` crea `new Resend(process.env.RESEND_API_KEY)` al importar (causa raíz de PRE-4; solo emite `console.warn` si falta la key, `lib/resend.ts:3-5`); `lib/db.ts:6-16` en cambio degrada a `null` con warn si falta `DATABASE_URL` (patrón defensivo, aunque exporta `db` posiblemente `null` — los call-sites deben chequear). Constatar ambos patrones y su asimetría | Read `lib/resend.ts` y `lib/db.ts` completos | ⬜ | |
| 16 | **Dependencias fantasma en build:** `firebase-admin@^12` sigue en `dependencies` (`package.json`) y `lib/firestore.ts` (legacy) hace `console.log` de presencia de env vars GOOGLE_CLOUD_* a nivel de módulo. Constatar si `lib/firestore.ts` es importado por algún código vivo de `app/` (si solo lo usan `scripts/` legacy, el peso en el bundle/build es evitable). Cruce con A5 para la remoción | `grep -rn "from ['\"]@/lib/firestore\|from ['\"].*firestore" app lib --include="*.ts" --include="*.tsx" ; grep -rn "firebase-admin" app lib --include="*.ts"` | ⬜ | |

### 4.1 Tabla de env vars — código vs `.env.example` vs docs (pre-poblada al preparar este MD; la sesión ejecutora CONFIRMA cada fila)

| Var | Usada en (archivo:línea) | `.env.example` | `README.md` | `SETUP_GUIDE.md` | Default en código | Nota |
|-----|--------------------------|----------------|-------------|------------------|-------------------|------|
| `DATABASE_URL` | `lib/db.ts:6`, `drizzle.config.ts:8,17`, `scripts/create-super-admin.ts:17`, `scripts/fix-rsvp-event-link.ts:12`, `scripts/create-legacy-event.ts:15`, `scripts/migrate-firebase-to-neon.ts:50` | ✅ | ✅ (:53,102) | ✅ (:39,189) | ninguno (warn + db=null) | OK |
| `RESEND_API_KEY` | `lib/resend.ts:3,7` | ✅ | ✅ (:56,103) | ✅ (:71,190) | ninguno (warn, pero build revienta — PRE-4) | Marcada "OPCIONAL" en `.env.example` pese a que el build la requiere |
| `FROM_EMAIL` | `lib/resend.ts:9` | ✅ | ✅ (:57,104) | ✅ (:72,191) | `'onboarding@resend.dev'` | Default de sandbox Resend en producción si falta |
| `CANCEL_TOKEN_SECRET` | `lib/queries.ts:189`, `lib/firestore.ts:187` | ✅ | ✅ (:63,106) | ✅ (:96,192) | `'default-secret'` | **Fallback silencioso a secret fijo** — constatar factualmente; evaluación → Fase S |
| `NEXT_PUBLIC_APP_URL` | 6 sitios (ver ítem 6) | ✅ | ✅ (:60,105) | ✅ (:98,194) | `'http://localhost:3000'` | Default peligroso en emails de producción (ítem 6) |
| `NEXT_PUBLIC_BASE_URL` | `app/page.tsx:11`, `app/layout.tsx:5`, `app/[slug]/layout.tsx:15`, `app/api/og-image/[slug]/route.ts:119` | ❌ | ❌ | ❌ | `'https://party.timekast.mx'` | **No documentada en ningún lado**; duplica concepto con APP_URL (ítem 7) |
| `CRON_SECRET` | `app/api/cron/send-reminders/route.ts:24` | ❌ | ✅ (:66,107) | ✅ (:97,193) | ninguno (check condicional) | **Falta en `.env.example`**; factual → Fase S |
| `ADMIN_USERNAME` | `lib/auth.ts:16`, `app/api/auth/login/route.ts:26`, `lib/auth-utils.ts:106` | ✅ | ❌ | ❌ | ninguno | Falta en listas de deploy de README (:102-107) y SETUP_GUIDE (:189-194) |
| `ADMIN_PASSWORD` | `lib/auth.ts:17`, `app/api/auth/login/route.ts:27` | ✅ | ❌ | ❌ | ninguno | Ídem |
| `ADMIN_EMAIL` | `app/api/auth/login/route.ts:26`, `lib/auth-utils.ts:106` | ❌ | ❌ | ❌ | fallback a `ADMIN_USERNAME` / `'admin@env'` | **No documentada en ningún lado** |
| `NODE_ENV` | `lib/auth-utils.ts:175,194` (cookie `secure`) | n/a | n/a | n/a | n/a | Provista por runtime; no requiere doc |
| `GOOGLE_CLOUD_PROJECT_ID` / `GOOGLE_CLOUD_PRIVATE_KEY` / `GOOGLE_CLOUD_CLIENT_EMAIL` | `lib/firestore.ts:4-37`, `scripts/migrate-firebase-to-neon.ts:34-42`, `scripts/add-demo-data.ts:8-18` | ❌ | ❌ | ❌ | ninguno | Legacy Firebase post-migración; vivas solo si `lib/firestore.ts` tiene imports vivos (ítem 16) → cruce A5 |
| `FIRESTORE_COLLECTION_NAME` | `lib/firestore.ts:48`, `scripts/add-demo-data.ts:24` | ❌ | ❌ | ❌ | `'rsvps'` | Ídem legacy → A5 |

## 5. Hallazgos

> Formato: **A8-XX** · severidad (🔴/🟡/🟢) · descripción · evidencia `archivo:línea` · propuesta (si aplica). Un hallazgo sin evidencia no cuenta.

### Pre-registrados (a confirmar durante la ejecución)

- **PRE-4** (pre-confirmado 2026-07-09, re-verificar en ítem 2): `npm run build` local **FALLA** sin `RESEND_API_KEY` porque `lib/resend.ts:7` instancia `new Resend()` a nivel de módulo y `/api/admin/send-email` lo importa durante la page-data collection del build. Workaround actual: `RESEND_API_KEY=re_dummy npm run build`. Al confirmar, asignarle ID definitivo `A8-XX` con severidad (propuesta: 🟡 — no rompe deploy en Vercel donde la var existe, pero rompe build local/CI frío y la doc no lo menciona) y propuesta mínima (lazy init del cliente o factory `getResend()`).

### Confirmados en esta ejecución

*(llenar durante la ejecución)*

| ID | Sev | Descripción | Evidencia | Propuesta |
|----|-----|-------------|-----------|-----------|
| A8-01 | | | | |

> **Recordatorio ítem 12:** si se confirma la ausencia total de tests, registrar hallazgo 🟡 con propuesta mínima concreta, p.ej.: instalar `vitest` como devDep + script `"test": "vitest run"` + 2-3 tests de humo sobre lógica pura sin red (ej. `generateCancelToken` en `lib/queries.ts`, selección de destinatarios de reminders, template de email) — sin tocar código de app, solo proponer.

## 6. Hallazgos fuera de scope

> Anotar factualmente con `archivo:línea` y referir a la auditoría dueña. No profundizar aquí.

Candidatos detectados al preparar este MD (la sesión ejecutora los confirma o descarta):

- **→ Fase S:** existencia y condiciones del check de `CRON_SECRET` en `app/api/cron/send-reminders/route.ts:24-37` (validación condicional a que la var exista; cotejo del header real de Vercel). Constatación factual únicamente — ítem 10.
- **→ Fase S:** fallback `'default-secret'` para `CANCEL_TOKEN_SECRET` en `lib/queries.ts:189` y `lib/firestore.ts:187`. Constatación factual únicamente.
- **→ A5:** `lib/firestore.ts` completo + `firebase-admin` en dependencies + scripts legacy (`scripts/add-demo-data.ts`, `scripts/migrate-firebase-to-neon.ts`) como candidatos a código muerto post-migración a Neon (ítem 16).
- **→ A5:** artefactos de prueba en root del repo: `prod-og-test.bin`, `test-og-dynamic.png`, `test-og-result.bin`, `test-og.png`, `tsconfig.tsbuildinfo` versionados (verificar con `git ls-files`).
- **→ A1:** `app/api/cron/send-reminders/route.ts:14` importa `event-config.json` estático del root — verificar en A1 si ese archivo sigue siendo fuente de verdad o resabio pre-DB.

## 7. Cierre

1. Verificar que **todos** los ítems 1-16 tienen resultado con evidencia o `⏭️ NOT RUN` + razón.
2. Completar sección 5 (IDs A8-XX definitivos, incluyendo la resolución de PRE-4) y sección 6.
3. Actualizar la fila **A8** de `docs/audits/00_INDEX.md`: estado ✅, conteo de hallazgos 🔴/🟡/🟢.
4. Commit + push: `audit: A8 build-config-deploy — X🔴 Y🟡 Z🟢`.
5. Si el push es rechazado: `git pull --ff-only`, re-aplicar solo los cambios a MDs, reintentar.
