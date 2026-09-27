# Runbook — `/api/health` pública con caché y etiqueta de entorno por `NEXT_PUBLIC_APP_ENV`

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a derivados nacidos antes de `v13.0.0` que despliegan (o van a desplegar) en Railway; la etiqueta de entorno y la caché también sirven en Vercel.
>
> **Audience:** el equipo (o el agente) de una app derivada del TimeKast Factory. El cambio es de `src/` y de los tres arranques de Sentry de la raíz; no hace falta tocar el cerebro.
>
> **Date:** 2026-09-25
> **Origin:** el destino Railway de `factory provision`. Corregido en el Factory para que los derivados **nuevos** nazcan bien; `factory update` **no** lo trae porque `src/` nace congelado (BR-FACTORY-006), así que se aplica a mano.
>
> **Costo de aplicarlo:** ~20–30 minutos con el agente. Siete archivos de código (cambios chicos) y sus tests.
> **Disponible desde:** kit `v13.0.0`
>
> Contrato vivo en el kit: [`sk-security`](../../skills/sk-security/SKILL.md) (la ruta pública y su respuesta recortada) y [`sk-observability`](../../skills/sk-observability/SKILL.md) (la regla de la etiqueta de entorno). Esta guía **no** reproduce el código: nombra archivos, cambios y el rango a aplicar.

---

## 1. Qué pasa

Tres huecos distintos que se arreglan juntos porque viajan en el mismo cambio del kit:

- **Sin la ruta pública, el healthcheck de Railway falla.** Railway sondea `/api/health` sin sesión. En un `src/` anterior, esa ruta está protegida: la sonda anónima termina redirigida al login y nunca ve un 200. `factory provision --target=railway` lo detecta al final del alta, deja el healthcheck **apagado** (`pending` en `.timekast/provision.json`) e imprime la ruta de esta guía. No es una falla del alta, pero Railway queda sin forma de saber si la app está viva.
- **Sin la etiqueta, `develop` reporta a Sentry como producción.** Todo deploy corre con `NODE_ENV=production`. Tu `src/` distingue el entorno con `VERCEL_ENV`, que sólo existe en Vercel: fuera de Vercel, los errores de `develop` caen en el entorno `production` de Sentry (y el reporte de CSP y el aviso de drizzle se equivocan igual).
- **Sin la caché, el tráfico anónimo despierta a Neon.** Con la ruta pública, cada sonda (de la plataforma, de un monitor, de cualquiera) haría un `SELECT 1`. Una base con autosuspend nunca dormiría.

## 2. ¿Te aplica?

- Tu derivado nació antes de `v13.0.0` (`factoryVersion` en `package.json`) **y** despliega o va a desplegar en Railway → aplícala entera.
- Tu derivado vive en Vercel → la ruta pública no es necesaria, pero la etiqueta y la caché sí te sirven: aplícala si quieres que `develop` deje de mezclarse con producción en Sentry, o si ya expones `/api/health` a un monitor.
- Detección rápida (desde la raíz del derivado):

  ```bash
  grep -n "'/api/health'" src/lib/auth/auth.config.ts          # sin salida → la ruta no es pública
  grep -n "NEXT_PUBLIC_APP_ENV" sentry.server.config.ts        # sin salida → falta la etiqueta
  grep -n "HEALTH_DB_CHECK_TTL_MS" src/app/api/health/route.ts # sin salida → falta la caché
  ```

  Si los tres responden, ya lo tienes.

## 3. Pasos

El cambio completo es **un commit del Factory**: `feat(auth): make health public and label envs by NEXT_PUBLIC_APP_ENV`. Se aplica con la mecánica de retrofit de [`legacy-migration.md` §F5](./legacy-migration.md), con un pathspec que incluye los tres arranques de Sentry de la raíz (no viven en `src/`):

```bash
C=$(git -C <checkout-del-factory> log -1 --format=%H --grep='make health public and label envs')
git -C <checkout-del-factory> diff "$C~1" "$C" -- src tests \
  instrumentation-client.ts sentry.server.config.ts sentry.edge.config.ts | git apply
```

Si `git apply` rechaza algún archivo (tu `src/` ya divergió ahí), aplica ese cambio a mano con la lista de abajo. Qué cambia, archivo por archivo:

1. **`src/lib/auth/auth.config.ts`** — `/api/health` entra a `publicPaths`. La coincidencia es por frontera de segmento: cualquier `/api/health/<sub>` también queda pública, así que no cuelgues sub-rutas ahí.
2. **`src/app/api/health/route.ts`** — la respuesta queda recortada a exactamente `{ status, database }` (sin versión, uptime ni timestamp: es tráfico anónimo), con 200 si `ok` y 503 si no. El `SELECT 1` se cachea en memoria, por instancia, durante `HEALTH_DB_CHECK_TTL_MS` (5 segundos), tanto el resultado `connected` como el `error`. La constante **no** se exporta: Next.js rechaza exports que no son de ruta en un `route.ts`.
3. **`sentry.server.config.ts`, `sentry.edge.config.ts`** — la etiqueta de entorno pasa a `NEXT_PUBLIC_APP_ENV` → `VERCEL_ENV` → `NODE_ENV`.
4. **`instrumentation-client.ts`** — la misma regla en el navegador: `NEXT_PUBLIC_APP_ENV` → `NEXT_PUBLIC_VERCEL_ENV` → `NODE_ENV` (el bundle del cliente sólo ve `NEXT_PUBLIC_*`).
5. **`src/app/api/csp-report/route.ts`** — decide si eleva a Sentry con la misma regla que los arranques.
6. **`src/lib/db/drizzle.ts`** — el aviso de `DATABASE_URL` ausente reconoce un deploy por `NEXT_PUBLIC_APP_ENV` o `VERCEL_ENV`, así que no se dispara en un deploy fuera de Vercel.
7. **Tests** — el rango trae los unitarios de la ruta, del guard de rutas públicas, de los tres arranques, del reporte de CSP y de drizzle, más el E2E `tests/e2e/health-public.spec.ts` (sonda anónima). Ajusta rutas si tu árbol de tests difiere.

**`NEXT_PUBLIC_APP_ENV` tiene que existir en cada entorno** para que la etiqueta sirva. `factory provision` la escribe por entorno (`production` en `main`, `preview` en `develop`; con bóveda, en `main:/` y `develop:/`); en un repo que no la tiene, agrégala donde viven sus variables: en la bóveda si el repo la usa, o como variable del destino si no. Es un `NEXT_PUBLIC_*`: se hornea en el build, así que el cambio aplica en el siguiente deploy.

Commitea con el pre-commit de tu repo (nunca `--no-verify`) y deja que tu husky regenere sus autogen.

## 4. Cómo verificar

1. `pnpm verify` en verde en tu repo.
2. Con el deploy nuevo arriba, una llamada **anónima** (sin cookies):

   ```bash
   curl -s -i https://<host-de-develop>/api/health
   ```

   Esperado: `200` y un JSON con **exactamente** dos claves, `status` y `database` (`{"status":"ok","database":"connected"}`). Un 3xx al login quiere decir que la ruta sigue protegida; claves de más, que la respuesta no se recortó.
3. En Railway: `npx @timekast/factory provision --resume`. El paso `railway` vuelve a sondear `/api/health` y, con el 200 anónimo, activa el healthcheck de cada entorno. Mientras un entorno siga en `pending`, el paso no se da por completo.
4. En Sentry, el siguiente error de `develop` llega con el entorno que dice su `NEXT_PUBLIC_APP_ENV` (`provision` escribe `preview`), no `production`.

---

_TimeKast Factory — public-health-and-env-label (shipped retrofit doc). Índice de guías por era: [`legacy-migration.md` §F5](./legacy-migration.md)._
