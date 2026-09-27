# Observability retrofit — wiring correlation IDs in an existing derived project

> Auxiliary runbook of [`sk-observability`](./SKILL.md). Read the SKILL.md first for the target architecture (§1 pipeline).

## Who needs this

| Situation                                                                  | What to do                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------- |
| **New project** bootstrapped from the current kit                            | Nothing — it is born fully wired. Skip this file.  |
| **Existing derived project** that updates its brain via `factory:update` but whose `src/` predates this wiring | Follow the steps below — the CLI updates `.claude/`, never `src/`. |

The steps are incremental and each one is independently safe to ship. Run them in order — later steps import what earlier steps create.

---

## Step 1 — verify the entry point generates `x-correlation-id`

Check the file that fronts every request:

- **Next 16+:** `src/proxy.ts`
- **Pre-Next 16 eras:** root `middleware.ts` — **same patch applies**, only the filename differs.

Look for the generate-or-reuse block (full shipped version in `SKILL.md` §2):

```ts
const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID();
const requestHeaders = new Headers(req.headers);
requestHeaders.set('x-correlation-id', correlationId);
const response = NextResponse.next({ request: { headers: requestHeaders } });
response.headers.set('x-correlation-id', correlationId);
return response;
```

If absent, add it inside the existing auth-wrapped handler — do **not** replace the auth delegation (`authorized()` callback) the derived project already has.

## Step 2 — port `src/lib/observability.ts`

Copy the module from the current kit (it has no dependencies beyond `next/headers`): a single `getCorrelationId(): Promise<string | null>` that reads the header and returns `null` when `headers()` throws (cron handlers, build, tests). Contract: **never throws**.

## Step 3 — patch `logAuditEvent` (`src/lib/audit.ts`)

Before the insert, enrich the metadata (skip if the caller already provided a `correlationId`):

```ts
let metadata = params.metadata;
if (metadata?.correlationId == null) {
  const correlationId = await getCorrelationId();
  if (correlationId) {
    metadata = { ...metadata, correlationId };
  }
}
// …insert uses `metadata` instead of `params.metadata`
```

Keep the enrichment **inside** the existing try/catch — the fire-and-forget contract (audit never breaks a user flow) must survive the patch.

## Step 3.5 — wire the redaction into the derived project's logger

🔴 **Without this step the retrofit leaves Sentry sanitized and the log raw — and the leak this module exists for was a log leak.** Step 5.0 ports `src/lib/utils/log-redact.ts`, but a pure module with no caller sanitizes nothing.

In the derived project's `src/lib/logger.ts`, call `redactLogContext` on the context **before** serializing it, and guard the serialization:

```ts
import { redactLogContext } from '@/lib/utils/log-redact';
// ...inside formatLog, before building the structured log object:
const sanitizedCtx = redactLogContext(ctx) as LogContext | undefined;
```

Then build the log line from `sanitizedCtx`, never from the raw `ctx` — including the development branch, if the project prints context there. Wrap the final `JSON.stringify` in a `try`: it runs inside every server `catch`, and a `BigInt` or a throwing `toJSON` would otherwise make the action stop degrading cleanly and lose the Sentry report with it. Copy the kit's `src/lib/logger.ts` shape if the project's has not diverged.

**Verify:** `logger.error('x', { error: someDrizzleQueryError })` must not emit the bound parameter values. `SKILL.md` §9 describes the full criterion.

## Step 4 — patch the action-wrapper catch paths (`src/lib/actions/helpers.ts`)

In the **generic** catch of `withAuth` and `withSelf` (NOT the `ActionError` branch — expected business errors are never reported), replace `console.error` with:

```ts
const correlationId = await getCorrelationId();
const dbError = readPgError(error); // @/lib/db/helpers/errors — allowlisted { code, constraint }
logger.error('[withAuth] unexpected error in action handler', {
  correlationId: correlationId ?? undefined,
  resource: options.resource, // withSelf: use { action: 'withSelf' } instead
  action: options.action,
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
  ...(Object.keys(dbError).length > 0 ? { dbError } : {}),
});
Sentry.captureException(error, {
  tags: { correlation_id: correlationId ?? 'none' },
});
```

Do not drop the `stack` field: without a Sentry DSN the log line is the only place the stack trace survives (the `console.error` you are replacing used to print it). `dbError` is only present when `error` came from a Postgres driver failure (`readPgError` returns `{}` for anything else, and the spread omits an empty `dbError`) — see `sk-api` §8 for the reader and `SKILL.md` §9 for the redaction that runs on this context before it's serialized.

Imports needed: `import * as Sentry from '@sentry/nextjs'`, `logger` from `@/lib/logger`, `getCorrelationId` from `@/lib/observability`, `readPgError` from `@/lib/db/helpers/errors` (port it if the derived project predates PG-001 — see `sk-api` §8 for the module). If the derived project never installed `@sentry/nextjs`, install it (it no-ops without `NEXT_PUBLIC_SENTRY_DSN` — see `SKILL.md` §8) or omit the `captureException` lines and keep the logger enrichment only.

> If the derived project's helpers diverged from the kit shape, port the **pattern**, not the literal diff: enrich the unexpected-error path with `{ correlationId, …scope }` + tagged `captureException`, leave business-error paths untouched.

## Step 5 — Sentry client init (Turbopack) + render-error capture

> ⚠️ This step is **mandatory before any Sentry go-live** on a project that builds with Turbopack (Next 16 default): the legacy `sentry.client.config.ts` is only injected by the SDK's webpack plugin — under Turbopack the client SDK **never initializes**, even with a DSN set.

0. 🔴 **Port the redaction module FIRST — the three Sentry entrypoints import it.** Copy `src/lib/utils/log-redact.ts` from the current kit. Skipping this makes the next sub-step fail: the kit's `instrumentation-client.ts` opens with `import { redactSentryEvent } from '@/lib/utils/log-redact'`, so copying that file into a project without the module is a *module not found* at `pnpm build`. Copy `tests/unit/utils/log-redact.test.ts` alongside it (see Step 5.4 — `tests/` never travels via `factory:update`).

1. **Migrate the client init:** move the `Sentry.init` from `sentry.client.config.ts` to a root `instrumentation-client.ts` (copy the current kit's file — it also exports `onRouterTransitionStart` and keys `environment`/`tracesSampleRate` off `NEXT_PUBLIC_APP_ENV` → `NEXT_PUBLIC_VERCEL_ENV` → `NODE_ENV`, first one set wins). A project that does not write `NEXT_PUBLIC_APP_ENV` per environment yet (every host outside Vercel falls through to `NODE_ENV=production`, so develop reports as production) applies [`public-health-and-env-label.md`](../../docs/retrofits/public-health-and-env-label.md) alongside this step. Delete `sentry.client.config.ts`.

   🔴 **Do NOT keep the old `sentry.server.config.ts` / `sentry.edge.config.ts` as they are.** They load via `register()` in `instrumentation.ts` and that part is unchanged — but a pre-redaction copy has no `beforeSend`, so a retrofitted project would ship with **zero** of the three entrypoints sanitizing anything while `SKILL.md` §8 states all three do. Add `beforeSend: redactSentryEvent` to both, plus the `requestDataIntegration({ include: { cookies: false, data: false } })` block shown in §8 — **server and edge only**, never the client entry (§8 explains why referencing it there breaks the Turbopack build).
2. **Port `onRequestError`:** copy the export from the current kit's `instrumentation.ts` (wrapper over `Sentry.captureRequestError` that tags `correlation_id` from the request header). Covers server-side RSC render errors, route handlers, and unwrapped server actions.
3. **Port the boundaries:** copy `src/app/global-error.tsx` from the kit, and add the gated capture to the existing `error.tsx` (and any segment-level `error.tsx` the derived project added):
   ```ts
   logger.error('Application error', { error: error.message, digest: error.digest }); // unconditional
   if (!error.digest) Sentry.captureException(error); // client-only; SSR errors already reported by onRequestError
   ```
4. **Port the tests:** copy `tests/unit/instrumentation.test.ts`, `tests/unit/components/error-boundaries.test.tsx` and `tests/unit/utils/log-redact.test.ts` from the kit. `tests/` ships at bootstrap only — `factory:update` never touches it, so this runbook is the vehicle for existing projects.

## Step 6 — verify end to end

1. **Header round-trip:** `curl -sI https://<derived-app>/login | grep -i x-correlation-id` → a UUID must come back on the response. (Locally: `pnpm dev` + `curl -sI http://localhost:3000/login`.)
2. **Log enrichment:** trigger any server action that fails unexpectedly (or add a temporary `throw` in a dev-only action) and confirm the log line carries the same `correlationId` the response header showed.
3. **Audit metadata:** perform an audited action (login works) and inspect the latest row — `metadata` must contain `correlationId`. Read-only check: `pnpm db:query "SELECT metadata FROM audit_logs ORDER BY created_at DESC LIMIT 1"`.
4. **Sentry tag (only if DSN set):** the test error from step 2 must appear in Sentry with tag `correlation_id`. Also trigger a **render** error (temporary `throw` in a page component) — it must arrive via `onRequestError` with the tag, and the client boundary must NOT produce a duplicate event.
5. **Build with the DSN set** (`.env.local`): `withSentryConfig` in `next.config.ts` is gated on the DSN — a build without it never exercises the Sentry build plumbing. Expect warnings (not errors) if `SENTRY_ORG`/`SENTRY_AUTH_TOKEN` are absent.
6. `pnpm verify` green.

---

_TimeKast Factory — sk-observability auxiliary runbook_
