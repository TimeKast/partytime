---
name: sk-security
description: Kit-shipped auth, RBAC and security infrastructure: the NextAuth v5 split config (Edge `auth.config.ts` + Node `auth.ts`), the Edge `src/proxy.ts` that delegates route ACL to `authorized()`, the `ROLE_CONFIG` / `ROUTE_ACL` / `PERMISSIONS` model and its helpers, rate-limit buckets, audit logging, the password-reset flow and `next.config.ts` security headers. Invoke when plugging into kit auth, the Edge proxy, RBAC guards, or reviewing shipped headers.
last-verified: 2026-09-22
user-invocable: false
---

# sk-security — Kit-shipped Auth + RBAC + Infra

This skill covers what the Starter Kit ships and how to plug into it. The portable principles (defense in depth, Zod at every boundary, no user enumeration) are assumed — what is documented here is how the kit applies them.

> **Kit-shipped — not portable.** Travels with the Starter Kit. Grounded in real files: `src/lib/auth/*` (`auth.config.ts`, `auth.ts`, `permissions.ts`, `password-reset.ts`, `super-admin.ts`, `utils.ts`, `index.ts` barrel), `src/config/roles.ts`, `src/lib/rate-limit.ts`, `src/lib/audit.ts`, `src/lib/env.ts`, `src/proxy.ts` (Next 16 proxy — formerly root `middleware.ts`), `next.config.ts`.
>
> **See also:** [`sk-api`](../sk-api/SKILL.md) for `ActionResult` / `ActionError` / `withAuth` / `withSelf` shape. [`sk-db`](../sk-db/SKILL.md) for `auditFields` + `softDeleteFields` + `canHardDeleteUser`. [`sk-features-index`](../sk-features-index/SKILL.md) for the feature catalog (auth providers, RBAC, invitations, etc.).

> **Registry anchors** — auth helpers (`requirePermission`, `withAuth`, `withSelf`, `hashPassword`, etc.) y sus signatures exactas viven indexados en [`project/reference/HOOKS.md`](../../../project/reference/HOOKS.md) (autogen — SSOT de import paths). Roles canónicos: `src/config/roles.ts`. Permission checks: `src/lib/auth/permissions.ts`. Esta skill enseña el **shape del sistema** (split-config, RBAC model, guards vs wrappers); los nombres + firmas exactos se leen del registry, no se enumeran aquí.

---

## 1. NextAuth v5 — split-config pattern (mandatory)

Two files, two runtimes:

```
src/lib/auth/auth.config.ts   Edge-safe (NO db imports)
                              trustHost, cookies, pages, providers:[]
                              callbacks: jwt(), session(), authorized()
                              consumed by: src/proxy.ts → NextAuth(authConfig)

src/lib/auth/auth.ts          Node runtime
                              extends authConfig, adds DrizzleAdapter,
                              providers (Credentials/Google/GitHub/Email),
                              extends jwt() with DB image sync,
                              adds signIn() + events (audit + notifications)
                              consumed by: server actions, API routes, server components
```

Public barrel: `@/lib/auth` re-exports `auth`, `signIn`, `signOut`, `handlers`, `hashPassword`, `verifyPassword`, `hasPermission`, `requirePermission`, `hasMinimumRole`, `isUserSuperAdmin`, `ROLES`, `getDefaultRole`, etc.

### 🔴 Pitfall 1 — Edge callbacks must live in `auth.config.ts`

If `jwt()` / `session()` / `authorized()` live only in `auth.ts`, the proxy's NextAuth instance (built from `authConfig` alone) never populates `auth.user.role` / `auth.user.id`. Route ACL silently becomes "authenticated = allowed" for every route.

```ts
// ✅ src/lib/auth/auth.config.ts — Edge-safe callbacks live here
import { getDefaultRole } from '@/config/roles';
import { isRouteAllowed } from '@/lib/auth/permissions';

export const authConfig = {
  trustHost: !!process.env.VERCEL || process.env.AUTH_TRUST_HOST === 'true',
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/error' },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || getDefaultRole();
        token.picture = user.image;
      }
      // SECURITY: never assign token.role from the client-supplied `session`
      // payload (useSession().update()) — role is re-read from the DB in the
      // auth.ts override below. Trusting the payload enables privilege escalation.
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.image = token.picture as string | undefined;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      /* …see §2… */
    },
  },
  providers: [], // filled in auth.ts
} satisfies NextAuthConfig;
```

### 🔴 Pitfall 2 — object spread does NOT deep-merge `callbacks`

When `auth.ts` writes `{...authConfig, callbacks: { jwt, signIn }}`, the whole `callbacks` key is **replaced** — `session()` and `authorized()` from `authConfig` are silently lost. The proxy still uses `authConfig` directly, but server actions lose them and `session.user.role` becomes `undefined`.

```ts
// ❌ loses session + authorized
export const { auth } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt(p) {
      /*…*/
    },
    async signIn() {
      /*…*/
    },
  },
});

// ✅ inherit session + authorized, compose jwt()
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: createAdapter(),
  providers: [
    /* Credentials, Google, GitHub, Email */
  ],
  callbacks: {
    session: authConfig.callbacks.session,
    authorized: authConfig.callbacks.authorized,
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params); // run Edge-safe base
      // DB-dependent additions: sync image + role on signIn/signUp/update.
      // Role comes from the DB (SSOT) — never from the client update payload.
      if (
        (params.trigger === 'signIn' || params.trigger === 'update') &&
        token.id &&
        isDatabaseConfigured()
      ) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, token.id as string),
          columns: { image: true, role: true },
        });
        if (dbUser) {
          token.picture = dbUser.image || token.picture;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async signIn({ user, account, profile }) {
      /* OAuth user sync + registration gate */
    },
  },
  events: {
    async signIn({ user, account }) {
      await logAuditEvent({
        event: 'login_success',
        userId: user.id!,
        email: user.email!,
        metadata: { provider: account?.provider },
      });
    },
  },
});
```

### `trustHost` on Vercel

`VERCEL=1` is always present on Vercel; `AUTH_TRUST_HOST` is the manual override.

```ts
trustHost: !!process.env.VERCEL || process.env.AUTH_TRUST_HOST === 'true',
```

> 🔴 **Therefore: do NOT declare `AUTH_URL` / `NEXTAUTH_URL` on Vercel.** `trustHost` already
> infers the origin per request, and setting either one **overrides it for every deployment
> that shares the variable** — `next-auth/lib/env.js` rewrites the request origin verbatim:
>
> ```js
> const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
> if (!url) return req;
> return new NextRequest(href.replace(origin, envOrigin), req); // origin → the env value
> ```
>
> Scoped to `preview`, that pins every branch deployment's callback to one fixed host, so
> signing in on `myapp-git-feat-x.vercel.app` bounces to the pinned domain and the preview's
> auth is dead. The two names are the same code path (`??`) — aliasing one to the other buys
> nothing and breaks the same way.
>
> **This is the v4 reflex.** In NextAuth v4 `NEXTAUTH_URL` was mandatory, so a decade of
> tutorials answers "wrong callback host" with "set `NEXTAUTH_URL`". On v5 + Vercel that
> advice is actively harmful. If a callback lands on the wrong host, the bug is `trustHost`
> being false — not a missing URL variable.
>
> **Legitimate uses:** a non-Vercel host with no trusted proxy, or a non-root `basePath`
> (`setEnvDefaults` reads the URL's `pathname`). Neither applies to a kit project on Vercel.

### Cookie name per project

The kit suffixes cookie names with `NEXT_PUBLIC_APP_NAME` to avoid collisions when multiple local apps run on `localhost:3000`. Keep this — don't hardcode `authjs.session-token`.

---

## 2. `src/proxy.ts` (proxy — formerly "middleware") — minimal, delegates to `authorized()`

The kit's proxy is NOT where RBAC lives. It wraps the NextAuth Edge handler and only adds correlation IDs.

> 🔴 **Next 16 renamed `middleware` → `proxy`.** The file lives at **`src/proxy.ts`** (native convention). A legacy root `middleware.ts` shim regresses Edge Function bundling with next-auth v5 on Vercel (`unsupported modules: @/lib/auth/auth.config`); the `runtime: 'nodejs'` workaround builds but crashes at runtime (`MIDDLEWARE_INVOCATION_FAILED`). Use the native `src/proxy.ts` path — same `NextAuth(authConfig)` pattern, bundles clean.

```ts
// src/proxy.ts (Next 16 proxy convention — NOT root middleware.ts)
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // auth/ACL already enforced by authorized() in auth.config.ts.
  const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-correlation-id', correlationId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('x-correlation-id', correlationId);
  return res;
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)'],
};
```

### `authorized()` — the ONE place for Route ACL

`authorized()` runs after `jwt()`/`session()`, so `auth.user.role` is populated. Put Route ACL here — never in the proxy body.

```ts
authorized({ auth, request: { nextUrl } }) {
  const isLoggedIn = !!auth?.user;

  const publicPaths = [
    '/login', '/register', '/forgot-password', '/reset-password',
    '/verify-email', '/verify-email-change', '/accept-invite', '/error',
    '/api/auth', // NextAuth API routes
    '/api/health', // platform healthcheck — called without a session
    '/privacy', '/terms', '/offline',
  ];
  // Segment boundary, NOT a bare prefix: `/register` must not open `/register-company`.
  const isPublicRoute =
    nextUrl.pathname === '/' ||
    publicPaths.some((p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(`${p}/`));

  if (isPublicRoute) return true;
  if (!isLoggedIn) return false;

  const role = auth?.user?.role;
  if (role && !isRouteAllowed(nextUrl.pathname, role)) {
    return Response.redirect(new URL('/dashboard', nextUrl));
  }
  return true;
}
```

The Starter Kit ships `ROUTE_ACL = {}` in `src/lib/auth/permissions.ts` — projects extend it with their own protected routes (see §3).

**`/api/health` is public on purpose.** A platform healthcheck (Railway, an uptime monitor) probes it with no session, so the handler answers only `{ status, database }` — no version, uptime or timestamp for anonymous traffic — and caches its `SELECT 1` in memory for a few seconds per instance, so anonymous probes do not wake the database on every request. The segment boundary also makes any `/api/health/<sub>` public: keep sub-routes out of it. A derived project born before this rule keeps `/api/health` protected (and its longer response) in its frozen `src/`, so an anonymous healthcheck gets redirected to login — the retrofit guide [`public-health-and-env-label.md`](../../docs/retrofits/public-health-and-env-label.md) carries the change.

---

## 3. `ROLE_CONFIG` — SSOT for role metadata (`@/config/roles`)

Roles are stored as text in the DB to avoid migrations when adding roles. `ROLE_CONFIG` is the **single source of truth** for display name, capabilities, and UI tokens. Don't spread these attributes across components.

**Kit ships 3 roles, hierarchy high → low:**

| Role (const)        | `displayName`   | `canInvite` | `assignableRoles`            | Privilege (index) |
| ------------------- | --------------- | ----------- | ---------------------------- | ----------------- |
| `ROLES.SUPER_ADMIN` | `Super Admin`   | `true`      | `[super_admin, admin, user]` | 0 (highest)       |
| `ROLES.ADMIN`       | `Administrador` | `true`      | `[admin, user]`              | 1                 |
| `ROLES.USER`        | `Usuario`       | `false`     | `[]`                         | 2 (default)       |

```ts
import {
  ROLES,
  ROLE_HIERARCHY,
  ROLE_CONFIG,
  getRoleDisplayName,
  canInvite,
  getAssignableRoles,
  getRoleStyle,
  hasRoleOrHigher,
  isValidRole,
  getDefaultRole,
  isSuperAdmin,
} from '@/config/roles';

getRoleDisplayName('admin'); // 'Administrador'
canInvite('user'); // false
getAssignableRoles('admin'); // [ROLES.ADMIN, ROLES.USER]
hasRoleOrHigher('admin', 'user'); // true (lower index = higher privilege)
getDefaultRole(); // 'user' (last in hierarchy)
```

> **Adding a role** (per project): (1) add to `ROLES`, (2) insert into `ROLE_HIERARCHY` at the right position, (3) add entry to `ROLE_CONFIG` with `displayName` + `canInvite` + `assignableRoles` + `style`. No migration needed.
> **Adding a capability** (e.g. `canExport`): (1) extend `RoleConfig` interface, (2) add value for every role in `ROLE_CONFIG`, (3) export a `canExport(role)` helper that reads `ROLE_CONFIG[role]?.canExport ?? false`. Same pattern as `canInvite`.

**Don't:** read role attributes from component-local constants, duplicate `displayName` in translations, or hardcode `role === 'admin' ? 'Administrador' : ...`. Always go through `ROLE_CONFIG` helpers.

---

## 4. 🔴 Two permission layers — never mix

| Layer                   | Answers                                  | Lives in                                   | Primitive                            |
| ----------------------- | ---------------------------------------- | ------------------------------------------ | ------------------------------------ |
| **Route ACL**           | "Can this role SEE this screen?"         | `ROUTE_ACL` + `isRouteAllowed(path, role)` | Called from `authorized()` + pages   |
| **Resource Permission** | "Can this role DO X with this resource?" | `PERMISSIONS` matrix + `hasPermission`     | Called from server actions + UI gate |

### Route ACL

```ts
// src/lib/auth/permissions.ts
export const ROUTE_ACL: Record<string, Role[]> = {
  // Starter ships empty — extend per project, e.g.:
  // '/settings/users': [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  // '/billing':        [ROLES.ADMIN, ROLES.SUPER_ADMIN],
};

export function isRouteAllowed(pathname: string, role: string | null | undefined): boolean {
  if (!role) return false;
  if (isSuperAdmin(role)) return true;
  for (const [route, allowedRoles] of Object.entries(ROUTE_ACL)) {
    if (pathname.startsWith(route)) return allowedRoles.includes(role as Role);
  }
  return true; // unlisted = authenticated users allowed
}
```

### Resource Permission matrix (NESTED, not flat)

```ts
// src/lib/auth/permissions.ts
export type Resource = 'users' | 'posts' | 'comments' | 'settings';
export type Action = 'create' | 'read' | 'update' | 'delete' | 'list';

export const PERMISSIONS: PermissionMatrix = {
  users: {
    create: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
    read: [ROLES.USER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
    update: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
    delete: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
    list: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  },
  // posts/comments are scaffolding examples — delete or replace per project
  settings: { read: [ROLES.ADMIN, ROLES.SUPER_ADMIN], update: [ROLES.SUPER_ADMIN] },
};
```

> **Signature:** `hasPermission(role, resource, action)` — three args, NOT a flat `'resource:action'` string.
> **Super admin:** `hasPermission()` and `isRouteAllowed()` always return `true` when `isSuperAdmin(role)`.

### Adding a new resource (registration is mandatory)

`withAuth`/`requirePermission` reject any `resource` that is not registered: `hasPermission` denies by
default AND the `Resource` union breaks `typecheck`. There is **no auto-registration** — do this ONCE,
in order, before using it in an action:

1. Extend the `Resource` union in `src/lib/auth/permissions.ts` (`'users' | … | 'your_resource'`).
2. Add the `PERMISSIONS['your_resource']` entry with the allowed roles per action.
3. Only then call `withAuth({ resource: 'your_resource', action, schema })`.

> Skip 1–2 and the build fails to compile and `requirePermission` denies everything at runtime.

### Defense in depth (all three layers fire)

1. `authorized()` — Edge, first filter, redirects to `/dashboard` if ACL fails.
2. Page component — `auth()` + `isRouteAllowed()` + `redirect()`.
3. Server action — `withAuth({ resource, action, schema })` OR explicit `requirePermission()`.

> **Anti-pattern:** using `hasPermission(role, 'settings', 'read')` in the proxy as the ONLY gate for `/settings`. That's a ROUTE ACL call — put it in `ROUTE_ACL` + `isRouteAllowed()`.

---

## 5. Permission primitives — what's actually exported

From `@/lib/auth` (barrel) and `@/lib/auth/permissions`:

| Primitive                                   | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `hasPermission(role, resource, action)`     | Boolean check — safe for UI gates (`{has && <Btn/>}`)            |
| `requirePermission(role, resource, action)` | Throws `Error` if denied — use in manual server actions          |
| `hasMinimumRole(role, minimumRole)`         | Hierarchy check (no resource) — e.g. `hasMinimumRole(r,'admin')` |
| `isSuperAdmin(role)`                        | Role-string identity check                                       |
| `isUserSuperAdmin(userId)`                  | DB lookup (from `@/lib/auth`, not `/permissions`)                |
| `getUserAccessibleResources(role)`          | UI: which resources show in nav                                  |
| `getUserActionsForResource(role, resource)` | UI: which buttons to render                                      |
| `PERMISSIONS`                               | The matrix itself                                                |
| `ROLES`, `ROLE_HIERARCHY`, `getDefaultRole` | From `@/config/roles`                                            |

> **There is no `withPermission(permission, action)` HOF.** Use `withAuth({ permission })` from [`sk-api`](../sk-api/SKILL.md) — it already does auth + permission + input parse + revalidate.

### Server Action — prefer `withAuth`

```ts
'use server';
import { withAuth } from '@/lib/actions/helpers';
import { z } from 'zod';

const schema = z.object({ id: z.string().uuid() });

export async function deleteThing(input: z.infer<typeof schema>) {
  return withAuth(
    {
      resource: 'users',
      action: 'delete',
      schema,
      revalidate: '/settings/users',
    },
    input,
    async (parsed, userId) => {
      // parsed is validated; userId is the caller's id (already authed + permitted)
      await db.delete(users).where(eq(users.id, parsed.id));
      return { deletedId: parsed.id };
    }
  );
}
```

### Server Action — manual (read-only, no wrapper)

```ts
'use server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/permissions';
import { ActionError } from '@/lib/actions/types';

export async function listUsers() {
  const session = await auth();
  if (!session?.user) throw new ActionError('UNAUTHORIZED');
  requirePermission(session.user.role, 'users', 'list'); // throws on deny
  return db.select().from(users);
}
```

> `requirePermission` throws a generic `Error` (message: `"Permission denied: <action> on <resource> requires role with higher privileges"`). `withAuth` catches that and maps it to `ActionResult.error`.

> **Resource denials inside the action body** — the ones left once `withAuth` / `requirePermission` have already settled session and permission ("does this row exist?", "may this caller read it?") — are where the **existence-oracle** hazard lives.

### Existence oracles — the same message is NOT the same `throw`

Two denial paths that deliberately throw the **identical message** can still leak whether a resource exists, if they throw from **different places**. In production Next redacts a server error to a `digest` derived from more than the text, and that digest reaches the client. Two distinct digests ⇒ an attacker distinguishes "exists" from "does not exist" even though the visible message is byte-identical.

This is invisible in `next dev` (which ships the real error) and only appears when serving a production build — one reason the E2E runner serves `next start` ([`sk-e2e`](../sk-e2e/SKILL.md) §1).

```ts
// ❌ same message, two throw sites → two digests → oracle
async function loadThing(id: string, userId: string) {
  const thing = await db.query.things.findFirst({ where: eq(things.id, id) });
  if (!thing) throw new Error(DENIED); //  ← site A: "does not exist"
  if (!canRead(userId, thing)) throw new Error(DENIED); // ← site B: "exists, no access"
}

// ✅ one throw site — split the guard into a throw-less core that RETURNS the reason
function denialReason(thing: Thing | null, userId: string): string | null {
  if (!thing) return DENIED;
  if (!canRead(userId, thing)) return DENIED;
  return null;
}

async function loadThing(id: string, userId: string) {
  const thing = await db.query.things.findFirst({ where: eq(things.id, id) });
  // A caller that must deny BEFORE resolving the resource ORs its own reason in,
  // so every denial leaves through this single throw.
  const reason = preCheck(userId) ?? denialReason(thing, userId);
  if (reason) throw new Error(reason);
  return thing;
}
```

> Unifying the **message** is not enough — unify the **throw**. Same rule as the register flow's "no user enumeration" (§6.5), one layer deeper: there the leak was status + timing; here it is the error digest.

---

## 6. Password reset — `@/lib/auth/password-reset`

Kit-shipped flow with security properties worth stating explicitly:

| Property                  | Implementation                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Token format              | `randomBytes(32).toString('hex')` — 64-char cryptographic hex                                                                |
| Token stored              | **SHA-256 hash** of the token, NOT the token itself (table `passwordResetTokens.tokenHash`)                                  |
| Expiration                | **1 hour** from issuance (`new Date(Date.now() + 60 * 60 * 1000)`)                                                           |
| One-time use              | Token row is `DELETE`d after successful reset                                                                                |
| One token per user        | On new request, any existing tokens for that user are deleted **before** inserting the new one                               |
| User enumeration          | `requestPasswordReset()` **always returns `{ success: true }`** — even when user not found, email not configured, or DB down |
| Password hashing on reset | `hashPassword()` from `@/lib/auth/utils` (bcrypt)                                                                            |

```ts
import {
  requestPasswordReset, // email → { success: true } always
  validateResetToken, // token → { valid, userId?, error? }
  resetPassword, // (token, newPassword) → { success, error? }
  generateResetToken, // internal — { token, hash }
  hashToken, // SHA-256 helper
} from '@/lib/auth/password-reset';
```

> **Don't** return `{ success: false, error: 'User not found' }` on `requestPasswordReset` — it breaks the anti-enumeration guarantee. The kit intentionally swallows errors and logs them via `logger` so the attacker gets no signal.
> **Don't** store the raw token in the DB — always hash. The user-facing URL carries the raw token; the DB only holds `hashToken(rawToken)`.

---

## 6.5 Self-registration — `/api/auth/register` + `RegisterForm`

Public open-signup flow shipped by the kit. Disabled or enabled per project via the `NEXT_PUBLIC_AUTH_REGISTRATION` env (default `true`). To open the flow you also need credentials auth on (`NEXT_PUBLIC_AUTH_PASSWORD=true`, default).

### Double gate — enforced in 3 places

The gate is `authFeatures.features.registration && authFeatures.providers.credentials`. If **either** is off, the entire flow disappears:

| Surface                                          | What the gate does                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `LoginForm` link "¿No tienes cuenta? Regístrate" | Hidden when gate fails                                                |
| `/register` page                                 | `redirect('/login')` when gate fails (handles direct URL navigation)  |
| `/api/auth/register` route                       | Returns `403 RegistrationDisabled` (server-side last line of defense) |

> **Adding OAuth/magic-link only?** Set `NEXT_PUBLIC_AUTH_PASSWORD=false`. The link, page and endpoint all collapse — users go through OAuth/magic-link which create accounts via the Drizzle adapter, not this flow.

### Server flow (`/api/auth/register`)

1. **Gate** — flag combo above (else 403)
2. **Rate limit** — `register` bucket (3 req/h per IP by default; KIT-020 §7)
3. **Zod parse** — `{ email, password ≥ 8, name ≥ 2 }` (else 400 with `details.fieldErrors`)
4. **Best-effort SELECT** — if email exists: log + return `200 { success: true }` (generic). **Never returns 409.**
5. **Hash + insert** with retry loop on `23505`:
   - `users_human_id_unique` → retry with the next `getNextHumanId()` value (5 max)
   - `users_email_unique` → race against step 4 → return the same `200 { success: true }` (no leak)
   - other code → `500`
6. **Audit log** — `logger.info('user registered', { userId, ip })`

The `200` response is **always the same shape** regardless of whether a user was created or the email already existed. This is intentional: the secure-by-default contract mirrors `requestPasswordReset` (no enumeration leak).

### Client flow (`RegisterForm`)

After receiving the 200, the client calls `signIn('credentials', { email, password, redirect: false })`:

- `signIn` succeeds → toast `¡Bienvenido!` + redirect `/dashboard`
- `signIn` fails (CredentialsSignin: the email pre-existed with a different password — typical attacker path or a confused user) → toast `Si ya tienes una cuenta, inicia sesión` + redirect `/login?email=<original>` (email pre-filled for convenience)

UX trade-off: a legitimate user who registers a second time with the **same** email and **same** password will simply auto-log in (the existence of the account leaks via `signIn` anyway because they already had the password). Documented as acceptable in KIT-022 — the alternative (never auto-login) penalizes UX for everyone for a vanishing edge case.

### Defaults assigned to new accounts

| Field      | Source                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `role`     | `getDefaultRole()` from `@/config/roles` (= last in `ROLE_HIERARCHY`, typically `'user'`)       |
| `humanId`  | `getNextHumanId(db, 'user_human_id_seq', { prefix: HUMAN_ID_PREFIXES.USER })` — e.g. `USR-0042` |
| `email`    | lowercased before insert                                                                        |
| `name`     | trimmed before insert                                                                           |
| `password` | bcrypt via `hashPassword()`                                                                     |

> **Self-registration cannot create privileged accounts.** Anyone going through `/register` lands as the default role. To create admins/hosts, use the invites flow (`/api/invites/send` → `AcceptInviteForm`) which carries the target role in the invite metadata and validates `canInvite()` of the inviter.

### Anti-patterns specific to this flow

| ❌                                                                                                        | ✅                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Putting account creation inside `Credentials.authorize()`                                                | `authorize()` stays login-only; creation lives in `/api/auth/register`              |
| Returning `409 EmailAlreadyExists`                                                                        | Always `200 { success: true }` — let `signIn()` differentiate paths                 |
| Sending an email if the address already existed                                                           | Skip email work entirely on the existing-email branch (would re-leak via mail logs) |
| Letting the form bypass the double gate (e.g. only client check)                                          | All three surfaces enforce — page redirects, endpoint 403s                          |
| Allowing the user to pick their role                                                                      | Always `getDefaultRole()`; admin promotion is invites-only                          |

---

## 7. Rate limiting — `src/lib/rate-limit.ts`

The kit ships **three backends** auto-selected at runtime + a **kill-switch flag**. Five pre-configured buckets cover the auth/invites surface; add new ones in `LIMITS` (in `rate-limit.ts`) when needed.

### Decision tree (`checkRateLimit`)

```
1. RATE_LIMIT_ENABLED=false  → bypass entirely (debug / E2E / kill-switch)
2. UPSTASH_REDIS_REST_URL    → Upstash Redis     (lowest latency, global)
3. DATABASE_URL + production → Postgres          (multi-instance safe; Vercel default)
4. Otherwise                 → in-memory Map     (single-instance dev only)
```

`getRateLimitMode()` returns the active mode (`'disabled' | 'upstash' | 'postgres' | 'memory'`) for debug pages and tests.

> **Why Postgres backend, not just memory + Upstash?** In-memory on Vercel multi-instance is false security — each lambda has its own `Map`, an attacker parallelizes and bypasses the limit. Postgres reuses Neon (already in the kit), is multi-instance-safe, and adds zero deps. Upstash stays as opt-in for ultra-low-latency.

### Atomic Postgres SQL

The Postgres backend uses a **single-statement** `INSERT … ON CONFLICT DO UPDATE` with `CASE WHEN reset_at <= now()` to insert / reset / increment in one trip — race-condition free. Driver type quirks are normalized (`Number(row.count)`, `new Date(row.reset_at)`).

### Cleanup of expired rows

Default: **probabilistic** — 1% of `postgresRateLimit` calls also fire a `DELETE FROM rate_limit_buckets WHERE reset_at < now() - interval '1 day'`, wrapped in `try/catch` so a cleanup failure never affects the rate-limit decision. No cron infra required.

If the project ships cron jobs (see [`kb-cron-jobs`](../kb-cron-jobs/SKILL.md)), replace the probabilistic cleanup with a daily `cleanup-rate-limit-buckets` job. The probabilistic path stays as the default in the kit so derived projects without cron infra still self-clean.

### Buckets shipped

| Bucket           | Default limit | Window | Used by                                       |
| ---------------- | ------------- | ------ | --------------------------------------------- |
| `auth`           | 10 req        | 60 s   | `Credentials.authorize()` (login brute-force) |
| `forgotPassword` | 5 req         | 60 s   | `/api/auth/forgot-password`                   |
| `resetPassword`  | 10 req        | 60 s   | `/api/auth/reset-password`                    |
| `register`       | 3 req         | 1 h    | `/api/auth/register` (KIT-022)                |
| `inviteToken`    | 30 req        | 60 s   | `/api/invites/{send,validate,accept}`         |

All limits + windows env-tunable: `RATE_LIMIT_<BUCKET>_REQUESTS` and `RATE_LIMIT_<BUCKET>_WINDOW_SECONDS`. The kill-switch is `RATE_LIMIT_ENABLED=false`.

### Usage

```ts
import { checkRateLimit, getClientIP, rateLimitExceededResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const result = await checkRateLimit(ip, 'forgotPassword');
  if (!result.success) return rateLimitExceededResponse(result);
  // …
}
```

For NextAuth Credentials `authorize()`, the second argument (`request: Request`) gives access to headers — call `checkRateLimit(getClientIP(request), 'auth')` BEFORE `verifyPassword` and return `null` on hit (so attackers get the same signal as bad credentials).

### Adding a new bucket

1. Add an entry to `LIMITS` in `src/lib/rate-limit.ts` (`requests`, `windowSeconds`, `prefix`)
2. Wire it from the route handler (`checkRateLimit(ip, '<newBucket>')`)
3. (Optional) document `RATE_LIMIT_<NEW>_REQUESTS` / `_WINDOW_SECONDS` in `.env.example`

> Apply rate limiting to: login, registration, password reset, magic links, invites, webhook receivers, and any expensive public endpoint. UI-hot paths (avatar fetches, image proxies, list pagination) are usually NOT good candidates — limit there breaks legitimate UX.

---

## 8. Environment validation — `src/lib/env.ts`

The kit uses **lazy** Zod validation (`getEnv()`), not eager parse-at-import — imports shouldn't crash CI tooling. Accessors throw a formatted error on first access if required vars are missing.

```ts
import {
  getEnv,
  isDatabaseConfigured,
  isEmailConfigured,
  getAppUrl,
  getNextAuthSecret,
} from '@/lib/env';

if (!isDatabaseConfigured()) return; // graceful degrade
const secret = getNextAuthSecret(); // throws if both AUTH_SECRET and NEXTAUTH_SECRET missing
const url = getAppUrl(); // NEXT_PUBLIC_APP_URL → VERCEL_PROJECT_PRODUCTION_URL → VERCEL_URL → localhost
```

> Never read `process.env.DATABASE_URL` directly in modules — go through `isDatabaseConfigured()` / `getEnv()`. Exception: `NEXT_PUBLIC_*` booleans that must stay consistent SSR↔client are read via `process.env` directly inside `getAuthFeatures()`.

### Public vs server-only

```bash
# Server-only (never prefix with NEXT_PUBLIC_)
DATABASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_SECRET=
RESEND_API_KEY=
UPSTASH_REDIS_REST_TOKEN=

# Public (shipped to client — safe to expose)
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_APP_NAME=
NEXT_PUBLIC_AUTH_GOOGLE=true
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

**Bundle boundary — three rules the split above depends on:**

- A server module with no legitimate client consumer starts with `import 'server-only'` — `src/lib/auth/auth.ts`, `src/lib/audit.ts`, `src/lib/rate-limit.ts`, `src/lib/auth/webauthn.ts` do: if a Client Component ever imports one transitively, `next build` fails instead of inlining the secret into the browser bundle. `src/lib/env.ts` is the declared exception: it also serves the `NEXT_PUBLIC_*` keys to the client, so it stays importable from both sides and reads the server keys lazily through `getEnv()` — never add the marker there. `vitest.setup.ts` mocks the marker for tests (`sk-testing-nextjs §1.1`).
- Never promote a server value to `NEXT_PUBLIC_*` for convenience — the prefix is a permanent public contract (`src/lib/env.ts` keeps the WebAuthn `rpID` server-only for exactly that reason and hands it to the client inside the options payload).
- The compile-time guard **is** the audit. A build that fails with `This module cannot be imported from a Client Component module` found a secret-reading module on a client path: fix the import graph (move the call behind a Server Action or route), never remove the marker to make the build pass.

---

## 9. Audit logging — `@/lib/audit`

```ts
import { logAuditEvent, getIpFromHeaders, getUserAgentFromHeaders } from '@/lib/audit';

await logAuditEvent({
  event: 'role_changed', // AuditEvent union — add new types in audit.ts
  userId: actorId,
  email: actorEmail,
  ipAddress: getIpFromHeaders(headers()),
  userAgent: getUserAgentFromHeaders(headers()),
  metadata: { targetUserId, oldRole, newRole },
});
```

Fields:

- `event` — typed union: `login_success | login_failure | logout | password_reset_request | password_changed | account_created | role_changed | invite_sent | invite_accepted | super_admin_action`
- `userId?`, `email?` — at least one if known; `email` is useful for `login_failure` where no userId exists
- `ipAddress?`, `userAgent?` — from request headers
- `metadata?` — JSON-serialized automatically; never include passwords, tokens, or full PII

The function is **fire-and-forget** — it catches errors and logs to `logger` so audit never breaks a user flow. It no-ops if `!isDatabaseConfigured()`.

---

## 10. Security headers — `next.config.ts → securityHeaders[]`

The kit applies a set of HTTP security headers to **every route** via `nextConfig.headers()`. Before hand-rolling a header or adding CSP, check this list.

| Header                      | Value                                          | Why                                                                   |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| `X-DNS-Prefetch-Control`    | `on`                                           | Enables DNS prefetch for faster cross-origin asset loads              |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | 2-year HSTS + subdomains + browser preload list opt-in                |
| `X-Frame-Options`           | `SAMEORIGIN`                                   | Clickjacking protection — page may only be framed by same origin      |
| `X-Content-Type-Options`    | `nosniff`                                      | Prevents MIME-sniffing — forces declared `Content-Type`               |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`              | Full URL same-origin; origin-only cross-origin; **nothing on HTTPS→HTTP downgrade** |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`     | Denies camera / mic / geolocation by default for this origin + embeds |
| `Content-Security-Policy-Report-Only` | non-script directives + `report-uri /api/csp-report` | CSP observability — reports violations, blocks nothing (see below) |

> Plus `poweredByHeader: false` in `nextConfig` (top-level, not in `securityHeaders[]`) — strips the
> `X-Powered-By: Next.js` framework-fingerprinting header.

```ts
// next.config.ts (shipped by kit)
const cspReportOnlyDirectives = [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  'report-uri /api/csp-report',
];

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',     value: 'on' },
  { key: 'Strict-Transport-Security',  value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options',            value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',     value: 'nosniff' },
  { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnlyDirectives.join('; ') },
];
// nextConfig also sets `poweredByHeader: false` (top-level) to drop X-Powered-By.

async headers() {
  return [
    { source: '/:path*', headers: securityHeaders },
    // plus explicit no-cache for /sw.js and /serwist/:path* so SW updates are detected
  ];
}
```

### CSP — Report-Only shipped, enforcement intentionally NOT shipped

**The kit ships `Content-Security-Policy-Report-Only`** (observability) but **not an enforcing `Content-Security-Policy`**. Radix UI primitives (used via shadcn) rely on inline styles for Popover / Tooltip / Dialog positioning, and framer-motion injects inline styles during animations. A naïve `Content-Security-Policy: default-src 'self'` breaks both.

What Report-Only gives you:

- **Blocks nothing** — browsers evaluate the policy and POST violation reports to `report-uri`, but never block the resource. Zero breakage risk for derived projects.
- **Directives shipped:** `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'` (the safe non-script set), plus `style-src 'self' 'unsafe-inline'` and `script-src 'self' 'unsafe-inline'`. The `'unsafe-inline'` allowances are deliberate: Radix/framer need inline styles, and a strict `script-src` in Report-Only would flood the endpoint with noise from Sentry / analytics / framework inline scripts instead of surfacing real anomalies.
- **Report endpoint:** `src/app/api/csp-report/route.ts` — public POST (browsers send reports, not users), parses the `application/csp-report` body as text + `JSON.parse` in try/catch, logs via `logger.warn`, responds `204` (or `400` on malformed body — never 500).

Evaluate **enforcement** CSP per derived project when the app handles sensitive data (payments, health, auth-gated B2B) and a dedicated effort budgets either (a) `'unsafe-inline'` + nonces done properly, or (b) eliminating inline-style dependencies. If you graduate Report-Only to enforcement, edit the existing `cspReportOnlyDirectives` / `securityHeaders[]` entries **additively** — don't replace the list.

### XFF assumption (rate limiting)

`getClientIP()` in `src/lib/rate-limit.ts` trusts the first value of `x-forwarded-for`. This is **by design** for the kit's target platforms: rate-limit assumes an edge that rewrites `x-forwarded-for` (Vercel / Cloudflare overwrite the header at the edge, so the first value is the real client IP). In **self-hosted deployments behind a misconfigured proxy** the header is client-controlled and therefore **spoofable** — an attacker can rotate fake IPs to bypass per-IP buckets. If you self-host, ensure your reverse proxy strips/rewrites `x-forwarded-for` before trusting it.

### Extending headers per-route

The kit already overrides Cache-Control for `/sw.js` and `/serwist/:path*` (SW must never be cached). Follow the same pattern — add a new `{ source, headers }` block in the `headers()` return array; order matters only for overlapping sources.

---

## 11. Correlation IDs — see `sk-observability`

`src/proxy.ts` sets `x-correlation-id` on both request and response for every request (see §2), and the ID is a **stable, consumed API surface**: `getCorrelationId()` (`@/lib/observability`), logger context, automatic `logAuditEvent` metadata enrichment, and the Sentry `correlation_id` tag in the `withAuth`/`withSelf` catch paths. Full wiring → [`sk-observability`](../sk-observability/SKILL.md).

---

## 12. Anti-patterns (kit-specific)

| ❌                                                             | ✅                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| RBAC in `src/proxy.ts` body                                    | `authorized()` callback + `ROUTE_ACL`                                           |
| Flat `'users:delete'` permissions                              | Nested matrix `PERMISSIONS[resource][action]` + `hasPermission(...)`            |
| Hand-rolled wrapper calling `requirePermission` manually       | `withAuth({ resource, action, schema, revalidate })`                            |
| `hasPermission(role, 'settings', 'read')` as route gate        | Put `/settings` in `ROUTE_ACL` + use `isRouteAllowed`                           |
| `withAuth` on a self-service action (bypasses RBAC check)      | `withSelf` — auth-only, no permission matrix                                    |
| Reading `process.env.DATABASE_URL` in modules                  | `isDatabaseConfigured()` / `getEnv()`                                           |
| Spreading `...authConfig` and redefining `callbacks: {...}`    | Explicitly preserve `session`/`authorized`, compose `jwt`                       |
| Audit fields: `action`, `targetId`, `ip`                       | Real shape: `event`, `userId`, `email`, `ipAddress`, `metadata`                 |
| Mutating `ROLE_CONFIG` at runtime or duplicating `displayName` | Treat `ROLE_CONFIG` as frozen SSOT — add helpers, not component-local constants |
| Omitting the permission check because "the proxy already ran"  | Defense in depth: `authorized()` → page `redirect()` → server action `withAuth` |
| Bypassing the proxy (e.g. custom wrapper that skips `auth()`)  | Go through `NextAuth(authConfig)` — don't fork the Edge chain                   |
| Storing raw reset tokens / custom expiration                   | Use `generateResetToken()` + `hashToken()` + the 1h default                     |
| Hand-adding HSTS / X-Frame-Options per-page                    | Already global via `securityHeaders[]` — only add NEW headers there             |

---

## 13. Account linking while logged in — CSRF-resistant via step-up

Linking an OAuth provider (or the password method) to an EXISTING session is a sensitive action — a CSRF that silently attaches an attacker-controlled provider to a victim's account would hand over a second login path. The kit gates it with a step-up grant, NOT a per-request CSRF token alone.

`linkAccount` / `unlinkAccount` live in `src/lib/actions/auth/link-account.ts` (self-service, `withSelf` — the userId comes from the session, never an argument):

```ts
import { requireStepUp, StepUpRequiredError, STEP_UP_REQUIRED } from '@/lib/auth/step-up';

// linkAccount — pre-flight gate BEFORE the OAuth flow starts
try {
  await requireStepUp({ userId, maxAge: 300 }); // recent re-auth required (anti-CSRF)
} catch (error) {
  if (error instanceof StepUpRequiredError) throw new ActionError(STEP_UP_REQUIRED);
  throw error;
}
```

- **`linkAccount`** is the pre-flight gate + audit anchor. A missing grant throws `StepUpRequiredError`, mapped to the stable `STEP_UP_REQUIRED` code so the client opens the step-up overlay (mint the grant, then re-call) instead of a dead-end toast. The provider's `email_verified` check + the actual `accounts` row write happen in the `signIn` callback (`auth.ts`), the only place the OAuth profile exists.
- **`unlinkAccount`** refuses to remove the user's LAST access method (lockout guard). It locks the `users` row `FOR UPDATE` and counts methods via `countAccessMethods` (`@/lib/auth/access-methods`) inside ONE transaction. `removePasskey` locks the SAME row, so the two serialize — a cross-action race (remove-last-OAuth + remove-last-passkey at once) can't bypass the ≥2-methods guard. The audit event fires AFTER the tx commits.

> Full MFA factor systems (passkey / TOTP / step-up grants / recovery / 2FA-on-login) → [`sk-mfa`](../sk-mfa/SKILL.md). The sections below summarize how those plug into the auth chain this skill owns.

---

## 14. Passkey enrollment + verification — `@/lib/auth/webauthn`

The kit owns the WebAuthn ceremony with `@simplewebauthn/server` (the native NextAuth WebAuthn provider is unsupported with the Credentials + JWT strategy). `@/lib/auth/webauthn.ts` is the contract the `src/app/api/auth/passkey/**` route handlers consume; persistence + a `passkey` Credentials provider live in `@/lib/auth/passkey.ts` against `passkey_credentials`.

Four invariants (each ↔ a unit test): challenge one-time (`consumeChallenge` stamps `consumedAt` before success); rpID / origin from env, NEVER the Host header; counter-regression rejected; `userVerification: 'required'`. Passkey login uses the discoverable (usernameless) flow and an anti-enumeration timing pad so an unknown credential and a bad signature are indistinguishable. Full detail → [`sk-mfa §2`](../sk-mfa/SKILL.md).

---

## 15. TOTP verify chain — `@/lib/auth/totp`

`@/lib/auth/totp.ts` is the authenticator-app factor: `enrollTotp` (self-service, encrypts the secret with `confirmedAt = null`) → `confirmTotp` (first code activates it) → `verifyTotp(userId, code)` (a DOMAIN function consumed by step-up, NOT a `withSelf` action). Verification tolerates a ±1 window of clock skew and enforces anti-replay (a code accepted within its 30s window can't be re-submitted). The secret is ENCRYPTED at rest (JWE, `@/lib/auth/totp-crypto`), never hashed — it must be recomputable. Full detail → [`sk-mfa §3`](../sk-mfa/SKILL.md).

---

## 16. Step-up grants — `step_up_grants` + `requireStepUp`

Sensitive actions carry a recent step-up grant, stored in `step_up_grants` and validated fail-closed in Node against LIVE DB state — NEVER the JWT. The canonical query AND-s four conditions: confirmed methods only (`'passkey' | 'totp' | 'email_otp' | 'recovery'` — excludes the transitory `'email_otp_pending'`), `step_up_at` freshness floor, `expires_at` TTL, and `session_epoch >= users.session_epoch` (an admin epoch bump revokes every prior grant instantly).

`@/lib/auth/step-up.ts` exposes the throwing `requireStepUp({ userId, maxAge })` (consumed by `linkAccount` — §13) and the composable `verifyStepUp({ userId, method?, maxAge })` (`ActionResult`, wired into `withAuth`/`withSelf` via their `requireStepUp` option). HIGH-risk actions accept only `{passkey, totp}` — an email grant is rejected. Which `(resource, action)` pairs are sensitive is the SSOT in `@/config/mfa.ts` (`MFA_SENSITIVE_ACTIONS`) — never declared inline. Full detail → [`sk-mfa §4`](../sk-mfa/SKILL.md).

---

## 17. Recovery codes — hashed, single-use

MFA backup codes (`@/lib/auth/recovery-codes.ts`) are HASHED (SHA-256, unsalted, deterministic) — never encrypted. Each carries ~60 bits of CSPRNG entropy and is single-use, so unsalted SHA-256 is sufficient (no low-entropy secret to protect; a deterministic hash is what enables lookup by hash). Constant-time compare; the plaintext is shown ONCE; only hashes are stored. This is ASYMMETRIC vs TOTP secrets on purpose: a recovery-code hash survives loss / rotation of `MFA_ENCRYPTION_KEY`, whereas a TOTP secret encrypted with a lost key becomes unrecoverable. Single-use redemption (stamping `usedAt`) + the `recovery` step-up grant land in `@/lib/auth/mfa-login.ts`. Full detail → [`sk-mfa §6`](../sk-mfa/SKILL.md).

---

Cross-reference: [`sk-mfa`](../sk-mfa/SKILL.md) — passkey / TOTP / step-up / recovery factor systems. [`sk-api`](../sk-api/SKILL.md) — wrappers `withAuth`/`withSelf`. [`sk-features-index`](../sk-features-index/SKILL.md) — feature catalog.
