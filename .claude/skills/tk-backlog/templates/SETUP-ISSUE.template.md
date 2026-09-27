# SETUP-{{NNN}}: {{bootstrap | go-live}}

> **Issue ID:** SETUP-{{NNN}}
> **Epic:** [EPIC-00-bootstrap](../epics/EPIC-00-bootstrap.md)
> **Priority:** P0
> **Effort:** {{M | S}} · **Story Points:** {{5 | 3}}
> **Status:** 📋 Backlog
> **Skills:** {{`sk-db` — según el caso. Nota: SETUP-001 lo corre `/implement` cargando `tk-provision` inline; los workflows `tk-*` NO van en `Skills:` (allowlist) — es un special-case de `/implement`.}}
> **Depends on:** {{— | SETUP-001}} · **Parallelizable:** no
> **DoR Waivers:** N/A (infra, no user-facing)
> **Board:** story
>
> **Refs (discovery):** — · — · —
> **Refs (design):** — · —
> **Refs (contract):** — · —

## 1. 🎯 Objetivo

{{bootstrap = instalar deps + provisionar la infra (DB/hosting/dominios/correo) vía `factory provision` + verificar. go-live = confirmar el primer deploy+migrate y crear el invite del super_admin en producción.}}

## 2. Pre-flight

> **bootstrap (SETUP-001):** lo corre `/implement` **cargando `tk-provision` inline** (no el executor genérico). El único gate HIGH-risk es el **CP2 de provision** (substrato de despliegue irreversible, Vercel o Railway), no el CP-A de `/implement`. Provision muta por **las APIs de cada proveedor con los tokens del rail** (`rail-timekast` en la bóveda, leído con la sesión de quien lo corre), nunca `vercel link`/`vercel pull` — consistente con `SK.md §7.1`. Headless → fail-closed: el issue queda `🚫 Blocked`.
> **go-live (SETUP-002):** corre tras confirmar que el primer deploy terminó (`main` migrada, `invite_tokens` existe).

## 3. ✅ Criterios de Aceptación

### bootstrap (SETUP-001)

- [ ] `pnpm install` completa sin errores
- [ ] `pnpm db:generate` crea la migración inicial `0000` desde el schema (commiteada)
- [ ] Infra aprovisionada vía `tk-provision` inline: Neon + substrato de despliegue, Vercel o Railway (CP2 aprobado) + DNS/Resend + wizard de env (valores completos en la bóveda; sin bóveda, en `.env.local`)
- [ ] `pnpm verify` (lint + typecheck + unit/component) pasa — **sin e2e**

### go-live (SETUP-002)

- [ ] Primer deploy verificado en el destino del repo: `main` desplegada, su `migrate` corrió (en `vercel-build` en Vercel, en el pre-deploy en Railway), las tablas existen, el dominio de producción responde
- [ ] Invite de super_admin creado en `main` **y correo de aceptación realmente enviado** (`emailSent:true`): `npx @timekast/factory invite-admin --target main --app-url=<prod>` → el admin pone su propia contraseña en `/accept-invite`. El fallback de consola (`ℹ️  Email no configurado`) **NO** satisface esta AC en go-live — señala que falta la config de email de prod en la bóveda (`main:/`); sin bóveda, en `.env.local`

## 4. 🚫 Out of Scope

- `/backlog` NO ejecuta estos pasos — los emite como issue. Los corre `/implement` (SETUP-001 cargando `tk-provision` inline; SETUP-002 normal) o el humano.

## 5. 📝 Implementation Evidence

_Pendiente._

## 6. 📦 Commits

_Pendiente._
