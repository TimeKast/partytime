# Troubleshooting

> Problemas **específicos del Starter Kit** y cómo resolverlos.

---

## 🔐 Auth

### OAuth "redirect_uri_mismatch"

Los redirect URIs deben coincidir EXACTAMENTE:

```
# Dev
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/callback/github

# Prod
https://tu-app.vercel.app/api/auth/callback/google
https://tu-app.vercel.app/api/auth/callback/github
```

**Dashboard:** [Google](https://console.cloud.google.com/apis/credentials) | [GitHub](https://github.com/settings/developers)

### Session Expires / AUTH_SECRET Issues

```typescript
// src/lib/auth/auth.ts — verificar:
session: {
  strategy: 'jwt',
  maxAge: 30 * 24 * 60 * 60, // 30 días
}
```

`AUTH_SECRET` debe ser **idéntico** en todos los environments. Si cambia, todas las sessions se invalidan.

### Magic Link No Llega

```bash
# Test endpoint (dev o super_admin)
curl -X POST http://localhost:3000/api/email/test \
  -H "Content-Type: application/json" \
  -d '{"to": "tu-email@ejemplo.com"}'
```

Checklist: `EMAIL_PROVIDER` configurado → `RESEND_API_KEY` / `EMAIL_SERVER_*` válido → revisar spam → verificar SPF/DKIM.

---

## 🗄️ Database

### Neon Connection Timeout

- Verificar `?sslmode=require` en `DATABASE_URL`
- **Free tier:** Proyecto se pausa después de 5 min inactivo — cualquier request lo reactiva
- Test: `psql $DATABASE_URL -c "SELECT 1"`

### Migrations Fail

```bash
# Ver estado
pnpm drizzle-kit status

# Generar migration nueva si schema cambió
pnpm db:generate

# Aplicar
pnpm db:migrate

# Solo dev local si DB está rota:
pnpm db:push
```

---

## 📱 PWA

### Install Prompt No Aparece

- ¿Ya está instalada? → Verificar en chrome://apps
- Cooldown 7 días tras dismiss → `localStorage.removeItem('pwa-install-dismissed')`
- DevTools → Application → Manifest → verificar que no hay errores

### Service Worker Not Updating

El SK usa **managed updates** — el nuevo SW espera en `waiting` hasta que el usuario haga click en el toast "Recargar".

**Si el toast no aparece:**

1. DevTools → Application → Service Workers → ¿Hay SW "waiting"?
2. Hard refresh: `Cmd+Shift+R`
3. Último recurso: DevTools → Application → Storage → "Clear site data"

> Server components no afectan precache. Ver `sk-pwa` §1 (caching firewall) + §3 (managed update flow).

---

## 🚀 Deploy (Vercel)

### El build pasa en verde y el deployment queda en ERROR

Síntoma engañoso: el log de build sale **limpio** —imprime hasta la tabla de rutas— y aun así el deployment termina en `ERROR`. La lectura natural ("el build pasó, falló el deploy") manda a buscar al lugar equivocado.

**Dónde está el motivo real.** No en el log de build. El estado trae `errorStep: patchBuild` / `errorCode: patch_build_4xx`, y `errorMessage` viene `undefined` en la API. El texto solo aparece al **final del stream de eventos**, después de `Deploying outputs...`:

```bash
# El dashboard tampoco lo muestra de forma evidente. La API sí. VERCEL_TOKEN vive en la bóveda
# (rail-timekast), no en tu entorno: infisical lo inyecta al sh hijo, y las comillas simples hacen
# que sea ese hijo —no tu shell— quien expanda las variables. teamId = orgId de .vercel/project.json.
VERCEL_DEPLOYMENT_ID="dpl_xxxxx" VERCEL_TEAM="team_xxxxx" \
INFISICAL_DOMAIN=https://secrets.timekast.com infisical run --domain=https://secrets.timekast.com \
  --projectId=32ab3274-c272-4c31-ace4-fc6726f775ba --env=main -- sh -c '
printf "Authorization: Bearer %s\n" "$VERCEL_TOKEN" | curl -sf -H @- \
  "https://api.vercel.com/v3/deployments/${VERCEL_DEPLOYMENT_ID}/events?teamId=${VERCEL_TEAM}" | tail -40'
```

> Coordenadas de la bóveda (dominio, id del rail) → `.claude/policy/vault.json`; si no hay sesión o acceso →
> [`fx-secrets-vault §3`](../skills/fx-secrets-vault/SKILL.md). El mismo stream lo lee `/deploy` al observar un
> deployment en error (`tk-deploy §7.5.7`).

**Causa en este kit** — globs de `outputFileTracingIncludes` apuntando a `node_modules`:

```
The framework produced an invalid deployment package for a Serverless Function.
Typically this means that the framework produces files in symlinked directories.
```

Bajo **pnpm**, `node_modules/<pkg>` es un **symlink** al store content-addressed (`node_modules/.pnpm/<pkg>@<version>_<hash>/node_modules/<pkg>`). Trazar archivos a través de esa ruta produce un paquete de función que Vercel rechaza.

```ts
// ❌ Rompe el empaquetado bajo pnpm — el build igual compila
outputFileTracingIncludes: { '/**': ['./node_modules/**/@img/sharp-*/**/*'] }

// ✅ Para dependencias nativas
serverExternalPackages: ['sharp'],
```

> 🔴 **Es una trampa fácil de caer.** `outputFileTracingIncludes` es la respuesta estándar a "un archivo no llega a la función", y bajo npm/yarn (node_modules plano) funcionaría. El kit usa pnpm, donde es el defecto. `pnpm preflight` marca esos globs como `high` — pero si estás depurando a mano, ésta es la pista.
>
> Contexto del fallo que esto causa en runtime cuando **falta** la declaración → [`sk-mfa`](../skills/sk-mfa/SKILL.md) §10.

### `ERR_DLOPEN_FAILED` en producción y el deploy salió verde

Un módulo nativo (`sharp` y compañía) no encuentra su librería del sistema:

```
Could not load the "sharp" module using the linux-x64 runtime
ERR_DLOPEN_FAILED: libvips-cpp.so.*: cannot open shared object file
```

**Causa raíz: pnpm instala SOLO los binarios de la plataforma actual.** Un árbol de desarrollo en mac nunca materializa `@img/sharp-libvips-linux-x64` —el paquete que trae el `.so`— y la función desplegada en Linux se queda sin él. El `pnpm-lock.yaml` se ve completo porque **la resolución nunca fue el problema; la materialización sí**. Lo que hay que mover es el filtro de instalación, no el árbol de dependencias.

```jsonc
// package.json
"pnpm": {
  "supportedArchitectures": { "os": ["current", "linux"], "cpu": ["current", "x64", "arm64"] }
}
```

Después, `pnpm install`. Señal de que era esto: **bajan decenas de paquetes y el lockfile no cambia ni una línea**.

> El mensaje del propio error lo dice (`Ensure your package manager supports multi-platform installation`), pero en la forma de npm (`npm install --os=linux --cpu=x64 sharp`), así que es fácil pasarlo por alto en un repo pnpm.
>
> ⚠️ **`serverExternalPackages` sola no alcanza.** Hace falta igual (evita que Next lo bundlee), pero no instala nada. Un deploy con solo eso llegó a producción y siguió fallando. `pnpm preflight` verifica las dos cosas.
>
> Pista diferencial: la mitad JS de `@img/sharp-linux-x64` **sí** carga, por eso el mensaje habla del "linux-x64 runtime" y parece que el binario correcto está ahí. Lo ausente es el paquete hermano con la librería del sistema.

---

## 🔧 Comandos de Diagnóstico Rápido

```bash
# Health check completo
pnpm lint && pnpm typecheck && pnpm test

# DB status
pnpm drizzle-kit status

# Lighthouse audit (performance / a11y / best-practices / seo)
# La categoría PWA de Lighthouse fue removida en v12+; para instalabilidad
# usa Chrome DevTools > Application > Manifest.
pnpm lighthouse

# Email test
curl -X POST http://localhost:3000/api/email/test

# Nuclear reset
rm -rf .next node_modules && pnpm install && pnpm dev
```

---

_TimeKast Starter Kit — Troubleshooting_
