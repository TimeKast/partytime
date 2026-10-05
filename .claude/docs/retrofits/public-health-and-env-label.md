# Runbook — `/api/health/live` pública y etiqueta de entorno por `NEXT_PUBLIC_APP_ENV`

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a derivados nacidos antes de `v13.0.0` que despliegan (o van a desplegar) en Railway; la etiqueta de entorno también sirve en Vercel. Si ya aplicaste la versión anterior de esta guía (la que abría `/api/health` al público), ve a §5.
>
> **Audience:** el equipo (o el agente) de una app derivada del TimeKast Factory. El cambio es de `src/` y de los tres arranques de Sentry de la raíz; no hace falta tocar el cerebro.
>
> **Date:** 2026-09-28
> **Origin:** el destino Railway de `factory provision`. Corregido en el Factory para que los derivados **nuevos** nazcan bien; `factory update` **no** lo trae porque `src/` nace congelado (BR-FACTORY-006), así que se aplica a mano.
>
> **Costo de aplicarlo:** ~20–30 minutos con el agente. Ocho archivos de código (cambios chicos) y sus tests.
> **Disponible desde:** kit `v13.0.0` (la ruta de vida, desde la versión que sigue a `v13.0.1`)
>
> Contrato vivo en el kit: [`sk-security`](../../skills/sk-security/SKILL.md) (solo la vida es pública; el chequeo con base no) y [`sk-observability`](../../skills/sk-observability/SKILL.md) (la regla de la etiqueta de entorno). Esta guía **no** reproduce el código: nombra archivos, cambios y los commits a aplicar.

---

## 1. Qué pasa

Dos huecos distintos que se arreglan juntos porque viajan en el mismo cambio del kit:

- **Sin una ruta de vida pública, el healthcheck de Railway falla.** Railway sondea una ruta sin sesión al desplegar, para decidir cuándo pasarle tráfico a la versión nueva. En un `src/` anterior no hay ninguna ruta pública que conteste 200: la sonda termina redirigida al login. `factory provision --target=railway` lo detecta al final del alta, deja el healthcheck **apagado** (`pending` en `.timekast/provision.json`) e imprime la ruta de esta guía. No es una falla del alta, pero Railway queda sin forma de saber si la app arrancó.
- **Sin la etiqueta, `develop` reporta a Sentry como producción.** Todo deploy corre con `NODE_ENV=production`. Tu `src/` distingue el entorno con `VERCEL_ENV`, que solo existe en Vercel: fuera de Vercel, los errores de `develop` caen en el entorno `production` de Sentry (y el reporte de CSP y el aviso de drizzle se equivocan igual).

**Por qué la ruta pública no toca la base.** La pregunta de Railway es «¿arrancó el proceso?», no «¿contesta Postgres?». Una ruta anónima que hace `SELECT 1` la puede sondear cualquiera (un monitor, un escáner, un bot), y con una sonda cada pocos minutos una base con autosuspend nunca duerme. Una caché por instancia solo limita la frecuencia, no evita que la base despierte. Por eso hay dos rutas:

| Ruta               | Acceso         | Qué hace                                                                  |
| ------------------ | -------------- | ------------------------------------------------------------------------- |
| `/api/health/live` | pública        | `200 { status: 'ok' }`, sin base ni nada externo. La usa Railway.         |
| `/api/health`      | requiere sesión | `SELECT 1` (cacheado unos segundos) y `{ status, database }`, 200 o 503. |

## 2. ¿Te aplica?

- Tu derivado nació antes de `v13.0.0` (`factoryVersion` en `package.json`) **y** despliega o va a desplegar en Railway → aplícala entera.
- Tu derivado vive en Vercel → la ruta de vida no es necesaria, pero la etiqueta sí te sirve: aplica solo esa parte si quieres que `develop` deje de mezclarse con producción en Sentry.
- Detección rápida (desde la raíz del derivado):

  ```bash
  grep -n "'/api/health/live'" src/lib/auth/auth.config.ts   # sin salida → no hay ruta de vida pública
  grep -n "'/api/health'," src/lib/auth/auth.config.ts       # CON salida → aplicaste la versión anterior (§5)
  grep -n "NEXT_PUBLIC_APP_ENV" sentry.server.config.ts       # sin salida → falta la etiqueta
  ```

## 3. Pasos

El cambio completo son **dos commits del Factory**, que se aplican en orden con la mecánica de retrofit de [`legacy-migration.md` §F5](./legacy-migration.md):

1. `feat(auth): make health public and label envs by NEXT_PUBLIC_APP_ENV` — la etiqueta de entorno, la respuesta recortada y la caché de `/api/health`.
2. `fix(health): make only liveness public, keep the DB check behind a session` — la ruta de vida y el cierre de `/api/health`.

```bash
F=<checkout-del-factory>
for SUBJECT in 'make health public and label envs' 'make only liveness public'; do
  C=$(git -C "$F" log -1 --format=%H --grep="$SUBJECT")
  git -C "$F" diff "$C~1" "$C" -- src tests \
    instrumentation-client.ts sentry.server.config.ts sentry.edge.config.ts | git apply
done
```

Si `git apply` rechaza algún archivo (tu `src/` ya divergió ahí), aplica ese cambio a mano con la lista de abajo. El estado final, archivo por archivo:

1. **`src/app/api/health/live/route.ts`** (nuevo) — `GET` responde `200 { status: 'ok' }` con `dynamic = 'force-dynamic'`. No importa la base ni nada externo.
2. **`src/lib/auth/auth.config.ts`** — `'/api/health/live'` entra a `publicPaths`. `/api/health` **no** está en la lista.
3. **`src/app/api/health/route.ts`** — sigue protegida. La respuesta queda recortada a exactamente `{ status, database }`, con 200 si `ok` y 503 si no, y el `SELECT 1` se cachea en memoria por instancia unos segundos (`HEALTH_DB_CHECK_TTL_MS`, no exportada: Next.js rechaza exports que no son de ruta en un `route.ts`).
4. **`sentry.server.config.ts`, `sentry.edge.config.ts`** — la etiqueta de entorno pasa a `NEXT_PUBLIC_APP_ENV` → `VERCEL_ENV` → `NODE_ENV`.
5. **`instrumentation-client.ts`** — la misma regla en el navegador: `NEXT_PUBLIC_APP_ENV` → `NEXT_PUBLIC_VERCEL_ENV` → `NODE_ENV` (el bundle del cliente solo ve `NEXT_PUBLIC_*`).
6. **`src/app/api/csp-report/route.ts`** — decide si eleva a Sentry con la misma regla que los arranques.
7. **`src/lib/db/drizzle.ts`** — el aviso de `DATABASE_URL` ausente reconoce un deploy por `NEXT_PUBLIC_APP_ENV` o `VERCEL_ENV`, así que no se dispara en un deploy fuera de Vercel.
8. **Tests** — los rangos traen los unitarios de las dos rutas, del guard de rutas públicas, de los tres arranques, del reporte de CSP y de drizzle, más el E2E `tests/e2e/health-public.spec.ts` (sonda anónima). Ajusta rutas si tu árbol de tests difiere.

**`NEXT_PUBLIC_APP_ENV` tiene que existir en cada entorno** para que la etiqueta sirva. `factory provision` la escribe por entorno (`production` en `main`, `preview` en `develop`; con bóveda, en `main:/` y `develop:/`); en un repo que no la tiene, agrégala donde viven sus variables: en la bóveda si el repo la usa, o como variable del destino si no. Es un `NEXT_PUBLIC_*`: se hornea en el build, así que el cambio aplica en el siguiente deploy.

Commitea con el pre-commit de tu repo (nunca `--no-verify`) y deja que tu husky regenere sus autogen.

## 4. Cómo verificar

1. `pnpm verify` en verde en tu repo.
2. Con el deploy nuevo arriba, dos llamadas **anónimas** (sin cookies):

   ```bash
   curl -s -i https://<host-de-develop>/api/health/live   # 200 y {"status":"ok"}
   curl -s -i https://<host-de-develop>/api/health        # NO 200 con JSON: redirige al login
   ```

3. En Railway: `npx @timekast/factory provision --resume`. El paso `railway` sondea `/api/health/live` y, con el 200 anónimo, activa el healthcheck de cada entorno. Mientras un entorno siga en `pending`, el paso no se da por completo.
4. En Sentry, el siguiente error de `develop` llega con el entorno que dice su `NEXT_PUBLIC_APP_ENV` (`provision` escribe `preview`), no `production`.

## 5. Si ya aplicaste la versión anterior (`/api/health` pública) — opcional

La versión anterior de esta guía abría `/api/health` completa al público, con la caché de 5 segundos como mitigación. Funciona, pero cualquier sonda anónima despierta la base. Cerrarla es **opcional**: hazlo si ves consumo de cómputo en Neon que no corresponde al tráfico real de la app.

1. Aplica solo el segundo commit de §3 (`make only liveness public`).
2. En Railway, cambia el `healthcheckPath` de cada entorno a `/api/health/live` (Settings → Deploy → Healthcheck Path). `provision --resume` no lo cambia por su cuenta: un entorno con el healthcheck ya encendido no se vuelve a sondear.
3. Verifica con §4, paso 2.

Mientras no lo hagas, `provision` sigue funcionando: si `/api/health/live` responde 404 y `/api/health` responde 200 sin sesión, activa el healthcheck sobre `/api/health` e imprime un aviso con esta guía.

---

_TimeKast Factory — public-health-and-env-label (shipped retrofit doc). Índice de guías por era: [`legacy-migration.md` §F5](./legacy-migration.md)._
