---
name: sk-observability
description: Kit-shipped observability infrastructure: correlation-ID generation in `src/proxy.ts`, the structured `logger` and `getCorrelationId()`, correlation on audit events, Sentry reporting from the `withAuth`/`withSelf` catch paths, the log/Sentry redaction module, render-error capture (`instrumentation.ts` + error boundaries) and Sentry opt-in via `NEXT_PUBLIC_SENTRY_DSN`. Invoke when consuming the correlation ID, logging with request context, or wiring error reporting.
last-verified: 2026-09-22
user-invocable: false
---

# sk-observability — Kit-Shipped Observability Infrastructure

> Correlation-ID modeling, logging levels, the error-tracker decision and PII redaction are already decided here — this skill covers what the Starter Kit ships and how to plug into it. External cron monitoring → [`kb-cron-jobs`](../kb-cron-jobs/SKILL.md) § Who watches the watchdog.
>
> **Kit-shipped — not portable.** Grounded in real files: `src/proxy.ts`, `src/lib/observability.ts`, `src/lib/logger.ts`, `src/lib/utils/log-redact.ts`, `src/lib/audit.ts`, `src/lib/actions/helpers.ts`, `instrumentation.ts`, `instrumentation-client.ts`, `sentry.{server,edge}.config.ts`, `src/app/error.tsx`, `src/app/global-error.tsx`.
>
> **See also:** [`sk-security`](../sk-security/SKILL.md) — audit logging sibling (`logAuditEvent` event types, §9) and the proxy's auth half (§2). [`sk-api`](../sk-api/SKILL.md) — the `withAuth`/`withSelf` wrappers whose catch paths report here. Exported helper names live indexed in [`project/reference/HOOKS.md`](../../../project/reference/HOOKS.md) (autogen — SSOT of import paths).

---

## 1. The pipeline — one ID, end to end

```
request → src/proxy.ts                 generates/reuses x-correlation-id
            │                          (request header + response header)
            ▼
         getCorrelationId()            @/lib/observability — reads it anywhere server-side
            │
            ├─► logger.error(msg, { correlationId, … })       log enrichment
            ├─► logAuditEvent({ … })                          audit metadata (automatic)
            └─► Sentry.captureException(err, { tags: { correlation_id } })   crash ↔ logs link

render/route errors (outside the wrappers) — §7
            │
            ├─► onRequestError (instrumentation.ts)            server: RSC render, route handlers,
            │     └─ tag correlation_id from request header       unwrapped server actions
            └─► error.tsx / global-error.tsx                   client: boundary capture (no digest)
```

Given any failed request: take the `x-correlation-id` from the response (or the Sentry tag), filter logs by it, and read the full trail.

---

## 2. Generation — `src/proxy.ts`

The proxy (Next 16 convention — formerly root `middleware.ts`) generates or passes through the ID on **every** matched request. Shipped code:

```ts
// src/proxy.ts
export default auth((req) => {
  // 2. Correlation ID — generate or pass through
  const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID();

  // Propagate to downstream (server components, API routes)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Also expose on response for client-side tracing
  response.headers.set('x-correlation-id', correlationId);

  return response;
});
```

Don't add consumers inside the proxy body — it stays minimal (auth delegation + this ID). Consumption happens downstream via `getCorrelationId()`.

---

## 3. `getCorrelationId()` — `@/lib/observability`

The one read API. Returns the current request's ID, or `null` outside a request scope — **never throws**:

```ts
import { getCorrelationId } from '@/lib/observability';

const correlationId = await getCorrelationId();
// string inside server components / actions / route handlers
// null   in cron handlers, build time, tests
```

Rules:

- Always handle the `null` case (`?? undefined` for logger context, `?? 'none'` for Sentry tags).
- Don't read `headers().get('x-correlation-id')` by hand — the helper centralizes the header name and the out-of-scope guard.
- Don't cache the value across requests (module-level state leaks between serverless invocations).

---

## 4. Logger — `@/lib/logger`

The kit's structured logger already models the ID as a first-class context key:

```ts
import { logger } from '@/lib/logger';

logger.error('payment capture failed', {
  correlationId: (await getCorrelationId()) ?? undefined, // LogContext.correlationId
  userId,
  action: 'capturePayment',
});
```

Behavior (see `src/lib/logger.ts`):

- **Dev:** pretty line with the ID's first 8 chars, plus a ` — key: value, …` detail suffix built from whichever of `error`/`dbError`/`stack` are present in context (`stack` trimmed to its first line) — e.g. `[ERROR] [8a2f1c34] payment capture failed — error: connection timeout, dbError: {"code":"57P01"}`. Empty/absent fields are omitted, never a dangling `— dbError: undefined`.
- **Prod:** single-line JSON of the context keys — filterable in Vercel logs / log drains. The context is **sanitized before serialization**, not emitted raw: every value goes through `redactLogContext` (`@/lib/utils/log-redact` — §9), which truncates any string at the first `params:` marker and reduces any `Error` instance to an allowlist (`name`/`message`/`stack`, `cause` collapsed to `{ code, constraint }`). The dev line above reads the **same already-sanitized** context, so neither branch reopens what §9 closes.
- `debug`/`info` are dev-only; `warn`/`error` always emit.

Convention: any `logger.warn`/`logger.error` emitted while handling a request **should carry `correlationId`**. Code outside request scope (crons, scripts) omits it — `getCorrelationId()` returns `null` there anyway.

---

## 5. Audit metadata — automatic enrichment

`logAuditEvent()` (`@/lib/audit` — see [`sk-security`](../sk-security/SKILL.md) §9 for event types and field semantics) attaches the correlation ID to `metadata.correlationId` **automatically**:

```ts
await logAuditEvent({ event: 'role_changed', userId, metadata: { oldRole, newRole } });
// stored metadata: { "oldRole": …, "newRole": …, "correlationId": "8a2f…" }
```

Semantics:

- Caller-provided `metadata.correlationId` **wins** — the helper never overrides it.
- Outside a request scope the field is simply absent (no `null` noise in stored JSON).
- The fire-and-forget contract is intact: enrichment lives inside the same try/catch; audit failures never break the user flow.

---

## 6. Error reporting — `withAuth` / `withSelf` catch paths

The action wrappers (`@/lib/actions/helpers` — see [`sk-api`](../sk-api/SKILL.md) §2 for the full contract) report **unexpected** errors with the correlation tag:

```ts
// generic catch path of both wrappers (src/lib/actions/helpers.ts)
const correlationId = await getCorrelationId();
const dbError = readPgError(error); // @/lib/db/helpers/errors — see sk-api §8
logger.error('[withAuth] unexpected error in action handler', {
  correlationId: correlationId ?? undefined,
  resource: options.resource,
  action: options.action,
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
  ...(Object.keys(dbError).length > 0 ? { dbError } : {}),
});
Sentry.captureException(error, {
  tags: { correlation_id: correlationId ?? 'none' },
});
```

The `stack` field is not redundant with Sentry: without a DSN the log line is the **only** place the stack survives — dropping it would make production debugging worse than the `console.error` it replaced. `dbError` is only added to the context when `error` came from a Postgres driver failure (`readPgError` returns `{}` — an empty object — for anything else, and the spread omits an empty `dbError`); it carries the allowlisted `{ code, constraint }`, the same shape `sk-api` §8 documents.

| Error type                                  | Logged?        | Reported to Sentry? |
| ------------------------------------------- | -------------- | ------------------- |
| `ActionError` (expected business error)     | No             | **No** — user-facing copy, not a crash |
| Any other throw (DB down, bug, timeout)     | `logger.error` | **Yes** — tag `correlation_id`         |

Custom code outside the wrappers (route handlers, services) follows the same recipe manually: `logger.error` with `correlationId` in context + `captureException` with the tag, only for unexpected errors.

---

## 7. Render-error capture — `onRequestError` + error boundaries

The wrappers (§6) only see errors inside `withAuth`/`withSelf`. Three more shipped pieces cover everything else:

| Piece                                  | Captures                                                                                          | Correlation                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `onRequestError` (`instrumentation.ts`) | Server-side: RSC render errors, route handlers, and server actions **not** wrapped in `withAuth`/`withSelf` (`routeType: 'action'`) | Tag `correlation_id` from the request header  |
| `src/app/error.tsx`                     | Client-side render errors per segment (React boundaries swallow them — the browser SDK never sees them on its own) | `captureException` gated on `!error.digest`  |
| `src/app/global-error.tsx`              | Root-layout crashes (where `error.tsx` no longer mounts); renders its own `<html>`/`<body>`        | Same digest gate                              |

**The digest gate (`if (!error.digest)`):** Next assigns a `digest` only to errors originating in server render — those were already reported by `onRequestError` with their **real** stack. The copy that reaches the client boundary is redacted (generic message + digest); re-capturing it would be a noise event without a usable stack. The boundaries always `logger.error` (digest included) and report to Sentry only digest-less (client-originated) errors.

**No double capture with the wrappers:** `withAuth`/`withSelf` return `{ error }` instead of re-throwing, so a wrapped action never reaches `onRequestError`.

---

## 8. Sentry — opt-in via `NEXT_PUBLIC_SENTRY_DSN`

The SDK (`@sentry/nextjs`) ships initialized in three files, gated on the DSN:

| File                       | Side                | Loaded by                                                                  |
| --------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `instrumentation-client.ts` | Browser             | Next.js client instrumentation convention — **works under Turbopack** (the legacy `sentry.client.config.ts` only the webpack plugin injected; under Turbopack it is dead code and must not be reintroduced — guardrail in `tests/unit/instrumentation.test.ts`). Also exports `onRouterTransitionStart` for navigation instrumentation. |
| `sentry.server.config.ts`   | Node.js             | `register()` in `instrumentation.ts`                                        |
| `sentry.edge.config.ts`     | Edge                | `register()` in `instrumentation.ts`                                        |

```ts
// sentry.server.config.ts (shipped) — sentry.edge.config.ts mirrors it; instrumentation-client.ts
// only differs in gating requestDataIntegration on its browser availability (see file header).
import { redactSentryEvent } from '@/lib/utils/log-redact';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment =
  process.env.NEXT_PUBLIC_APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV;
Sentry.init({
  dsn,
  enabled: !!dsn,
  environment,
  tracesSampleRate: environment === 'production' ? 0.1 : 0,
  // §9 — sanitize every outgoing event (query params, console breadcrumbs, request cookies/body).
  beforeSend: redactSentryEvent,
  // Defense in depth: stop the integration from collecting cookies/body in the first
  // place — redactSentryEvent strips them from the event either way.
  // 🔴 server/edge ONLY — omit this block in instrumentation-client.ts (see below).
  integrations: (defaults) => [
    ...defaults,
    Sentry.requestDataIntegration({ include: { cookies: false, data: false } }),
  ],
});
```

- **No DSN (default):** the SDK no-ops — `captureException` calls in §6/§7 are inert and free. Safe to leave in the code path.
- **DSN set:** errors flow to Sentry with the `correlation_id` tag; the wrappers need no change. Every event is sanitized by `beforeSend` before it leaves the process — see §9.
- 🔴 **`beforeSend` goes in all three entrypoints; `integrations` goes in the server and edge ones ONLY.** `requestDataIntegration` is Node/Edge-only and the client ESM bundle does not export it, so *referencing* it from `instrumentation-client.ts` is a **build error under Turbopack** — which resolves the members of a namespace import statically. **A `typeof Sentry.requestDataIntegration === 'function'` guard does not help**: the failure is at link time, not at call time. The TypeScript types union all three runtimes, so `pnpm typecheck` stays green and only `pnpm build` catches it. (This is not hypothetical — the kit shipped that guard and broke its own build; see the header of `instrumentation-client.ts`.) Nothing is lost on the client: that integration only ever collects request data on the server, and `beforeSend` covers the browser runtime regardless. A fourth Sentry arranque needs `beforeSend` wired; whether it also needs the integration depends on whether its runtime has one.
- **`environment` keys off `NEXT_PUBLIC_APP_ENV` first**, then the host fallback — `VERCEL_ENV` on server/edge, `NEXT_PUBLIC_VERCEL_ENV` in the browser (only `NEXT_PUBLIC_*` reaches the client bundle) — then `NODE_ENV`. Every deploy runs `NODE_ENV=production`, so without a label a `develop` deploy would pollute the production environment in Sentry; `VERCEL_ENV` does not exist off Vercel (Railway), so the label cannot depend on it. The same value gates `tracesSampleRate`, and `src/app/api/csp-report/route.ts` uses the same rule to decide whether to elevate. A derived project born before this rule keeps `VERCEL_ENV ?? NODE_ENV` in its frozen `src/` — on a non-Vercel host its `develop` errors land as `production` until it applies the retrofit guide [`public-health-and-env-label.md`](../../docs/retrofits/public-health-and-env-label.md).
- **Operational notes:** `NEXT_PUBLIC_APP_ENV` is the label: the secrets vault writes it per environment (`factory provision` does it on Vercel without a vault, with the same values as `VERCEL_ENV`), and it must exist **before the build** — edge and browser inline it at build time. `NEXT_PUBLIC_SENTRY_DSN` is build-time on the client too — setting it requires a redeploy to reach the browser bundle. `NEXT_PUBLIC_VERCEL_ENV` only exists on Vercel with "Automatically expose System Environment Variables" on (default). `withSentryConfig` in `next.config.ts` is also gated on the DSN — a build without it never exercises the Sentry build plumbing.
- External cron monitoring (Sentry Cron Monitors check-ins on the watchdog) also rides this opt-in — pattern in [`kb-cron-jobs`](../kb-cron-jobs/SKILL.md) § Who watches the watchdog.

---

## 9. Log / Sentry redaction — `src/lib/utils/log-redact.ts`

A caught `DrizzleQueryError` (and the raw Postgres driver error it wraps in `.cause`) carry the full query text and bound parameter **values** as own enumerable properties — a plain `JSON.stringify` of the caught error, or handing it unfiltered to Sentry, emits them verbatim, including secrets bound as query parameters (a TOTP ciphertext leaked this way in a 2026-08-17 e2e run). `redactLogContext` / `redactSentryEvent` (`@/lib/utils/log-redact`) are the kit's single shared saneo point for **every** surface that can carry that error toward an outside system.

**One recursive criterion, used by both.** A `string` is truncated at the first `params:` marker. An **error-like** value collapses to an allowlist — `name` / `message` / `stack`, plus `cause` substituted by `{ code, constraint }`. Arrays and plain objects are **walked**, so an error nested inside one cannot slip past. Anything else passes through.

- **Allowlist, not denylist.** Whatever is not `name`/`message`/`stack`/`cause` is dropped, whatever it is called. A denylist would only have been provably complete for Drizzle, and the promise covers arbitrary errors.
- **"Error-like" is NOT `instanceof Error` alone.** Sentry runs `normalizeEvent` **before** `beforeSend`, and its `convertToPlainObject` turns every `Error` into `{ message, name, stack, ...ownProps }` — so by the time `redactSentryEvent` runs there are **no `Error` instances left** and the driver payload has been spread into plain keys. The criterion therefore also recognizes a plain object carrying driver-error property names (`query`, `params`, `detail`, `hint`, `where`, `internalQuery`). An `instanceof` check alone is dead code in `beforeSend`.
- **Fails closed.** At the recursion cap the walk returns a placeholder, never the raw value. A redaction control that gives up must not emit what it exists to remove.
- **Curated data survives the walk.** The `dbError: { code, constraint }` that the wrapper catch path (§6) adds is two strings inside a plain object: walking it returns it unchanged. Reducing plain objects wholesale would have made §6 dead weight — walking them does not.
- **`redactSentryEvent` covers five surfaces:** `exception.values[].value`, `breadcrumbs[]` (`.message` and `.data` — `consoleIntegration` attaches raw `console.*` arguments there, several levels deep), `extra`, `request`, and `contexts`.

🔴 **A query string is a secret in this kit, not metadata.** `redactRequest` drops `cookies`, `data` and `query_string`, strips the query off `url`, and removes the `cookie`/`authorization` headers. `contexts` is a surface for the same reason: `Sentry.captureRequestError` writes `contexts.nextjs.request_path` from Next's `path`, **query string included**. Six shipped routes carry a single-use token there (`/reset-password`, `/accept-invite`, `/api/invites/validate`, `/verify-email`, `/verify-email-change`, `/api/unsubscribe`). A live password-reset token in Sentry is an account takeover; an invite token carries the destination role, so it is a privilege escalation. Sentry's own scrubber matches by **field name** and cannot see a token embedded inside a URL string — it has to come off here.

**Rule: every new egress point passes through it.** A fourth Sentry arranque, a new log transport, a derived project's own logger — any code that hands an error or a request-shaped object to something outside the process must call one of these two functions first. There is no other place in the kit that does this filtering; bypassing the module means bypassing the only saneo the kit has.

🔴 **Caveat — the criterion recognizes shapes, it does not judge content.** It keys off the `params:` marker and off driver-error property names; it never inspects a value to decide "is this actually a secret". Two consequences for a derived project:

- A context field named `query`, `detail`, `where`, `hint`, `internalQuery` or `params` marks its **containing object** as error-like, so that object collapses to the allowlist and the field is dropped. `{ meta: { query: someSearchTerm } }` loses `meta`'s other fields. **Pick context keys that do not collide with those names.**
- A value the criterion does not recognize as error-like or as a string passes through. If a derived project routes secrets through a shape the Postgres driver never produces, this module will not catch it — extend the criterion rather than assuming coverage.

---

## 10. Retrofit for existing derived projects

Derived projects update their `.claude/` brain via `factory:update`, but **`src/` is not updated by the CLI** — a derived project born before this wiring has the proxy half only (or none). Runbook: [`retrofit.md`](./retrofit.md) — covers checking the proxy/middleware, porting `src/lib/observability.ts`, and patching `logAuditEvent` + the wrapper catch paths, with end-to-end verification.

New projects bootstrapped from the current kit are born fully wired — they don't need the runbook.

---

## 11. Anti-patterns (kit-specific)

| ❌                                                            | ✅                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `headers().get('x-correlation-id')` by hand                    | `getCorrelationId()` from `@/lib/observability`                       |
| `console.error` in catch paths                                  | `logger.error` with `correlationId` context (§6)                     |
| `captureException` on `ActionError`                             | Expected business errors are never reported (§6)                     |
| Manually adding `correlationId` to `logAuditEvent` metadata     | Automatic (§5) — pass it only to override                            |
| Adding log/Sentry consumers inside `src/proxy.ts`               | Proxy stays minimal; consume downstream via the helper (§2)          |
| Gating `captureException` calls on `if (process.env.SENTRY…)`   | The SDK no-ops without DSN — call unconditionally (§8)               |
| Capturing digested SSR errors in the boundaries                 | Gate on `!error.digest` — `onRequestError` already reported them (§7) |
| Reintroducing `sentry.client.config.ts`                         | Client init lives in `instrumentation-client.ts` (§8 — Turbopack)    |
| Caching the correlation ID in module state                      | Read per-request via `getCorrelationId()` (§3)                       |
| Adding a new Sentry/log egress point without wiring it through `log-redact` | Every egress goes through `redactLogContext`/`redactSentryEvent` (§9) |

---

_Cross-reference: [`sk-security`](../sk-security/SKILL.md) — audit logging sibling + proxy auth half. This file's §6 instruments the action wrappers of [`sk-api`](../sk-api/SKILL.md), whose §8 documents the `readPgError` reader relied on above. [`retrofit.md`](./retrofit.md) — wiring runbook for existing derived projects._
