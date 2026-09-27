---
name: sk-testing-nextjs
description: Kit-shipped Vitest infrastructure: `vitest.config.ts` (jsdom, `@` alias, coverage exclusions), the kit-owned `vitest.setup.ts` and its dev-owned `vitest.setup.project.ts` extension point, the 3-layer pyramid layout, and factory-function mock targets for kit barrels (`@/lib/auth`, `@/lib/db/drizzle`, schema, `next/cache`). Invoke when writing unit or component tests that mock kit auth or DB, or when a test file dies at load.
last-verified: 2026-09-22
user-invocable: false
---

# sk-testing-nextjs — Kit-shipped Testing Infrastructure

> **Kit-shipped — not portable.** Travels with the TimeKast Starter Kit. Grounded in real files: `vitest.config.ts`, `vitest.setup.ts`, `tests/unit/**`, `tests/e2e/**`, `scripts/tools/e2e-runner.ts`, `@/lib/auth`, `@/lib/auth/permissions`, `@/lib/db/drizzle`, `@/lib/db/schema/**`.
>
> For E2E / Playwright infra → [`sk-e2e`](../sk-e2e/SKILL.md). For the action patterns under test → [`sk-api`](../sk-api/SKILL.md). For the DB helpers → [`sk-db`](../sk-db/SKILL.md).

---

## 1. Vitest config (what the kit ships)

The repo's `vitest.config.ts` is already set up. **Don't re-invent it.** Key decisions:

```ts
// vitest.config.ts — TWO projects, split by environment (see §1.0)
export default defineConfig({
  test: {
    projects: [
      { plugins: [react()], resolve: { alias: ALIAS },
        test: { name: 'node',  environment: 'node',
                setupFiles: ['./vitest.setup.ts'], include: ['**/*.test.ts'],  exclude: EXCLUDE } },
      { plugins: [react()], resolve: { alias: ALIAS },
        test: { name: 'jsdom', environment: 'jsdom',
                setupFiles: ['./vitest.setup.ts'], include: ['**/*.test.tsx'], exclude: EXCLUDE } },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'config/**'],
      exclude: [
        /* UI layer → E2E, DB → E2E, auth config → E2E, and ALL of `src/components/ui/**` —
           which is TWO classes of file, not one: third-party primitives the kit adopted AND
           the kit's own components born there (`SK.md §3.3`, the canonical statement). The
           blanket exclusion leaves the second class without unit coverage. */
      ],
    },
  },
  resolve: { alias: ALIAS },
});
```

### 1.0 🔴 `.test.ts` runs under **node**, `.test.tsx` under **jsdom**

Building a DOM per test file was the most expensive line item of a run — more than every assertion
combined — and most files never touch it. So the suite is split by extension, which is a decent
proxy for "renders React".

**The rule when you write a test:**

| Your test…                                    | File name   | Extra                                          |
| --------------------------------------------- | ----------- | ---------------------------------------------- |
| renders a component                           | `.test.tsx` | nothing — jsdom by default                     |
| is a pure function, parser, validator, tooling | `.test.ts`  | nothing — node by default                      |
| renders a **hook** (`renderHook`) or touches `document`/`window`, but has no JSX | `.test.ts`  | 🔴 **`// @vitest-environment jsdom` on line 1** |

```ts
// @vitest-environment jsdom
// `.test.ts` but renders a React hook — opts out of the node project.
import { renderHook } from '@testing-library/react';
```

Vitest honours that docblock over the project's environment, so the exception costs one comment and
stays visible at the top of the file. Without it the symptom is unmistakable:
`ReferenceError: window is not defined`.

> **Derivative on an older kit?** `vitest.config.ts` is frozen at bootstrap (`BR-FACTORY-006`) — it
> does **not** arrive with `factory update`. The split is opt-in via
> [`.claude/docs/retrofits/vitest-node-jsdom-split.md`](../../docs/retrofits/vitest-node-jsdom-split.md).
> A single-project config keeps working exactly as before; the docblock is inert there.

```ts
// vitest.setup.ts — KIT-OWNED (see §1.1)
import '@testing-library/jest-dom/vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.mock('server-only', () => ({})); // compile-time guards → empty modules
vi.mock('client-only', () => ({}));

afterEach(() => cleanup());

const PROJECT_SETUP = './vitest.setup.project.ts'; // the extension point — §1.2
if (existsSync(path.join(__dirname, PROJECT_SETUP))) await import(PROJECT_SETUP);
```

### 1.1 `vitest.setup.ts` is KIT-OWNED — put nothing project-specific in it

`vitest.config.ts` is **frozen at bootstrap** (BR-FACTORY-006) but `vitest.setup.ts` is **tracked** (`profiles.json#track`), so `factory update` keeps it current in every derivative. That split is deliberate: the config holds a project's own `include`/`exclude`/`coverage` decisions, while the setup file holds wiring the kit must be able to fix for the whole fleet.

The `server-only` / `client-only` mocks are the reason it had to become tracked. Both are marker packages whose entry point is a bare `throw`; inside a bundler that is the point (a server module leaking into the client bundle fails the BUILD instead of shipping secrets to the browser), but Vitest is plain Node, so the moment a test reaches a marked module the whole **file** dies while being loaded — before a single assertion runs, and reported as a failing test rather than as the import three files away. Mocking them to `{}` is safe precisely because outside a bundler they are assertions, not implementations.

> 🔴 **Known limit.** This rescues a marked module whose marker package **resolves**. When the package is not installed at all, Vite's import analysis fails at transform time — before the mocker runs — with `Failed to resolve import "client-only"`. The kit declares `server-only` in `dependencies` (asserted by `tests/unit/server-only-guard.test.ts`); a project that marks modules with `client-only` must install it too. A `resolve.alias` would not help either, and it would live in the frozen config.

### 1.2 `vitest.setup.project.ts` — the project's own setup (dev-owned, never shipped)

Same shape as `.husky/pre-commit` → `.husky/pre-commit.project`: the kit owns one file and hands you a sibling it will never ship nor overwrite. Project-specific global mocks go there.

```ts
// vitest.setup.project.ts — yours. `factory update` never touches it.
import { vi } from 'vitest';

vi.mock('@/lib/auth/auth', () => ({ auth: vi.fn() }));
```

| Aspect | Behaviour |
| ------ | --------- |
| Absent | The normal case (the kit itself has no such file). The suite runs exactly as before — the `existsSync` guard skips the import. |
| Shipped? | **Never.** Excluded from both dist profiles and absent from `track`, so it can never appear in a manifest — `update` cannot write, overwrite or delete it. |
| Loaded when | **Last**, after the kit's own wiring, so it can override anything above it — including the `server-only` mock. |
| `vi.mock` hoisting | **Intact.** Verified, not assumed — see below. |

> **Why a guarded dynamic import and not a second `setupFiles` entry.** Listing it in `vitest.config.ts` is the obvious move, but that config is frozen at bootstrap so the change would never travel, and Vitest **fails outright** on a `setupFiles` entry that does not exist — which is the normal case.
>
> **Why the specifier is a `const` and not a literal.** With a literal, `tsc --noEmit` resolves it statically and reports `TS2307: Cannot find module` whenever the file is absent, so `pnpm verify` would be red out of the box. Indirecting through a const puts it past TypeScript's static resolution while Vite still resolves it at runtime, relative to the setup file.

🔴 **`vi.mock` is hoisted, and hoisting survives the dynamic import** — the property the whole extension point rests on. Both halves were measured on Vitest 4.1:

1. A `vi.mock` in `vitest.setup.project.ts` **wins over a static import of the same module at the top of a test file**. (Control: with the extension point removed, the same test gets the real module.)
2. It is hoisted **within the project file itself** — a call sitting above its own `vi.mock` line already sees the mock.

Both hold because Vite transforms the dynamically imported module through the same pipeline, and the `await` completes before Vitest loads the test file, so the registration is always in time.

**First `factory update` on an existing derivative.** `vitest.setup.ts` is on disk but not in the old lockfile, so if its content differs from the kit's the update raises a **conflict with a prompt** (`mine` / `theirs`) — never a silent overwrite. Answer **`theirs`**, then move whatever you had in it (your `vi.mock` calls, extra polyfills) into a new `vitest.setup.project.ts`. From then on updates are silent and your file is untouched. If your setup file happens to match the kit's byte for byte, there is no prompt at all.

> Check what you are about to move. The kit's setup already covers `server-only` / `client-only`
> neutralization, the RTL wiring, and the jsdom gaps Radix walks into (`hasPointerCapture`,
> `ResizeObserver`, `matchMedia`). Only what is genuinely yours — mocks of YOUR modules — belongs
> in the `.project` file.

### 1.3 One-time cleanup: orphaned copies under `tests/unit/`

The tests covering `scripts/**` used to live in `tests/unit/`. They now live beside the code they
cover, in `scripts/tools/__tests__/`, so they travel with it — a test that stays behind while its
subject ships is how a derivative ends up running last release's assertions against this release's
code.

`factory update` **cannot** clean up after that move: `tests/**` is born-frozen and outside the
tracked set by design, so the old copies stay on disk. The updated ones arrive at the new path and
the stale ones keep running — one of them (`skill-lint`) fails `pnpm typecheck` outright, because
it builds a `LintContext` by hand and the kit added a required field.

Delete them once, after the update that brings this version:

```bash
rm -f tests/unit/skill-lint.test.ts \
      tests/unit/update-board.test.ts \
      tests/unit/setup-e2e-resolve-branch.test.ts
ls tests/unit/scripts/          # look first: anything NOT from the kit is yours — move it out
git rm -r tests/unit/scripts/   # then remove the kit copies (git rm, so the removal is reviewable)
```

Nothing of the kit's is lost — every one of those suites now ships under
`scripts/tools/__tests__/`, with better isolation than the copies being removed. The `ls` is not
optional: `tests/unit/scripts/` is kit-owned only by convention, and a blind `rm -rf` would take any
test of your own that happened to live there with it.

**Coverage exclusion strategy** (already documented inline in `vitest.config.ts`):

| Excluded from unit coverage | Tested by           |
| --------------------------- | ------------------- |
| React components (`*.tsx`)  | E2E (Playwright)    |
| `src/app/api/**`            | E2E (Playwright)    |
| Pages / layouts             | E2E (Playwright)    |
| `src/lib/db/**`             | E2E (Neon branches) |
| `auth.ts` / `auth.config`   | E2E (auth flows)    |
| Third-party primitives of `ui/` **without kit adaptations** | The library itself  |

Unit tests cover: `config/`, `src/lib/actions/helpers`, `src/lib/validations/`, `src/lib/email/templates/`, `src/lib/utils/`, `src/lib/auth/permissions`, `src/lib/logger`.

### Directory layout (real, per-kit)

```
tests/
  unit/                  # Vitest — `pnpm test` runs these
    app/api/             # mirrors src/app/api/**   (route handlers)
    components/          # mirrors src/components/**  (RTL)
    lib/actions/         # mirrors src/lib/actions/**
    lib/hooks/           # mirrors src/lib/hooks/**
    lib/notifications/   # mirrors src/lib/notifications/**
    config/ · auth/ · pwa/ · utils/ · validations/ …
    notifications/       # ⚠️ feature-grouped — the one folder NOT on the mirror rule
    *.test.ts(x)
  e2e/                   # Playwright — `pnpm test:e2e` runs these
  fixtures/              # E2E auth states, RBAC helpers
  global-setup.ts        # Playwright
  global-teardown.ts     # Playwright
```

> `tests/unit/notifications/` is grouped by FEATURE, not by subject path, so it holds component,
> config, route and token tests side by side. It predates the rule in §1.1 and is carried as a
> known exception — do not copy the shape for a new feature, and when you touch a file in there,
> moving it to its mirrored path is a welcome drive-by.

> There is **no `tests/integration/`** and **no `tests/factories/`** directory in this repo. Unit tests mock the DB; DB-touching flows are covered by E2E against Neon preview branches.

### 1.1 Where a test file goes — mirror the path of its subject

**A test lives at the `src/` path of the thing it tests, rooted at `tests/unit/`.** One rule, no
exceptions to remember:

| Subject | Test |
| --- | --- |
| `src/lib/actions/user-admin.ts` | `tests/unit/lib/actions/user-admin.test.ts` |
| `src/lib/hooks/useDebounce.ts` | `tests/unit/lib/hooks/useDebounce.test.ts` |
| `src/app/api/auth/register/route.ts` | `tests/unit/app/api/auth/register.test.ts` |
| `src/components/notifications/NotificationBell.tsx` | `tests/unit/components/notifications/…` |

🔴 **WHY THIS IS WRITTEN DOWN.** Without a stated rule the tree forks, and it had: this repo grew
FOUR parallel pairs — `tests/unit/actions` beside `tests/unit/lib/actions`, `hooks` beside
`lib/hooks`, `api` beside `app/api` — each holding tests of the same kind of subject, split by
nothing but which one the last author happened to open. The cost is not tidiness: it is that
"where do the action tests live" has two answers, so a new test lands in whichever half is
found first and the fork widens. Consolidating without writing the rule down just resets the
clock.

**Same filename ≠ duplicate.** `tests/unit/lib/auth/recovery-codes.test.ts` (the pure
generate/hash/verify helpers) and `tests/unit/lib/actions/recovery-codes.test.ts` (the
`regenerateRecoveryCodes` server action) share a name and test entirely different things. The
mirrored path is what disambiguates them — which is the rule paying for itself. Check the
subject before merging two files that look alike.

**Two files may share one subject** when they cover different contracts of it — see
`tests/unit/lib/notifications/service.test.ts` (dispatch behaviour) beside
`service-logging.test.ts` (the AUDIT-015 logging contract). Keep them adjacent and let the
suffix say which is which.


---

## 2. Server Action tests — factory-function mocks (house style)

Pattern used across the repo (`tests/unit/helpers.test.ts`, `tests/unit/notifications/*`). Mock the kit's `withAuth`/`withSelf` upstream dependencies — auth, permissions, cache — so each test controls the return value:

```ts
// tests/unit/lib/actions/user-admin.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// --- Mocks (hoisted by vi.mock) ---------------------------------------------
const mockAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}));

const mockRequirePermission = vi.fn();
vi.mock('@/lib/auth/permissions', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// --- Import AFTER mocks ------------------------------------------------------
const { createUser } = await import('@/lib/actions/admin/user-admin');

// --- Helpers -----------------------------------------------------------------
function mockSession(overrides?: Partial<{ id: string; role: string; email: string }>) {
  return {
    user: {
      id: overrides?.id ?? 'user-123',
      role: overrides?.role ?? 'admin',
      email: overrides?.email ?? 'admin@test.com',
      ...overrides,
    },
  };
}

// --- Tests -------------------------------------------------------------------
describe('createUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await createUser({ name: 'Test', email: 'test@test.com' });
    expect(result).toEqual({ error: 'Debes iniciar sesión' });
  });

  it('returns error when no permission', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'user' }));
    mockRequirePermission.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    const result = await createUser({ name: 'Test', email: 'test@test.com' });
    expect(result.error).toContain('No tienes permiso');
  });

  it('returns data on success', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockRequirePermission.mockImplementation(() => {});
    const result = await createUser({ name: 'Test', email: 'test@test.com' });
    expect(result.data).toBeDefined();
  });
});
```

**Rules (kit-specific):**

- Declare `const mockFn = vi.fn()` **outside** the `vi.mock()` call. `vi.mock` is hoisted — variables captured inside the factory must exist at hoist time.
- Mock at the kit's module boundary (`@/lib/auth`, `@/lib/auth/permissions`, `@/lib/db/drizzle`, `next/cache`) — not internals.
- Import the action under test **after** the mocks via `await import(...)` at top level, so mocks bind before the module initializes.
- Assert on the **`ActionResult` shape** (`{error}` / `{data}`), not on thrown errors — `withAuth`/`withSelf` catch internally and return the error as data. Use `.rejects.toThrow` only for throws from non-action code.
- `vi.clearAllMocks()` in `beforeEach` — otherwise call history accumulates across tests.

---

## 3. Mocking Drizzle `db` — `createChain()` thenable helper

Drizzle's query builder returns chainable objects ending in `await`. Recreating the chain with `vi.fn().mockReturnValue({...})` is noisy and brittle. Use the repo's `createChain` pattern (see `tests/unit/lib/notifications/service.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

/**
 * Chainable mock that resolves to `result` at the end of the chain.
 * Supports .from / .where / .limit / .set / .values / .returning / .orderBy / .offset
 * and is thenable so `await query` works directly.
 */
function createChain(result: unknown = []) {
  const chain: Record<string, unknown> = {};
  const resolve = () => Promise.resolve(result);

  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => resolve());
  chain.orderBy = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) =>
    resolve().then(onFulfilled, onRejected);

  return chain;
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// Schema modules referenced by the code under test must also be mocked —
// Drizzle schemas import postgres-js at module load, which jsdom can't run.
vi.mock('@/lib/db/schema', () => ({
  users: { id: 'id', email: 'email', name: 'name' },
}));

describe('someService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects users by email', async () => {
    mockSelect.mockReturnValue(createChain([{ id: 'u-1', email: 'a@b.com' }]));

    const result = await findUserByEmail('a@b.com');

    expect(result).toEqual([{ id: 'u-1', email: 'a@b.com' }]);
    expect(mockSelect).toHaveBeenCalled();
  });

  it('inserts and returns the new row', async () => {
    mockInsert.mockReturnValue(createChain([{ id: 'u-2' }]));
    // ...
  });
});
```

**Rules:**

- Mock **every schema module** imported by the code under test (`@/lib/db/schema`, `@/lib/db/schema/notifications`, etc.). Schemas transitively import the Postgres driver, which crashes in jsdom.
- For queries with `.returning()` or final `.limit()`, `createChain(result)` covers both — the result resolves at `.returning()`, or when awaited directly.
- For multi-step query flows (select → update → returning) return a **fresh** `createChain` per mock return — chains are mutable.
- Don't assert on internal chain calls (`expect(chain.where).toHaveBeenCalledWith(...)`) unless the test is specifically about query shape. Assert on observable output.

---

## 4. Component tests — kit's RTL setup

Pattern used in `tests/unit/components/button.test.tsx` (RTL wired via `vitest.setup.ts`):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with the provided label', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('invokes onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <Button onClick={handleClick} disabled>
        Save
      </Button>
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(handleClick).not.toHaveBeenCalled();
  });
});
```

**Kit-specific rules:**

- `cleanup()` is wired in `vitest.setup.ts` via `afterEach` — no need to call it manually.
- `@testing-library/jest-dom/vitest` matchers are imported once in setup — don't re-import per test.
- For components that use `useFormContext` or other kit providers, wrap with the provider in the test render.

> Behavioral rules: query by role, `userEvent.setup()`, test behavior — never structure or internal state.

---

### 4.1 Form-provider components — `renderWithForm()` helper

Every field primitive of the form kit (`@/components/form` — canonical list in `project/reference/HOOKS.md`) calls react-hook-form's `useFormContext()` and crashes when rendered bare; the exception is `SubmitButton`, which reads the kit's own context, has a default, and survives alone. Don't mock the form context — wrap with the real `Form` provider via a file-local helper, so each test reads as plain `render` (`tests/unit/components/form-field.test.tsx` is the live example):

```tsx
function renderWithForm<T extends FieldValues>(ui: ReactNode, options: { schema: z.ZodType<T>; defaultValues?: DefaultValues<T>; onSubmit?: (data: T) => void }) {
  const onSubmit = options.onSubmit ?? vi.fn();

  function TestForm() {
    const form = useForm<T>({ schema: options.schema, defaultValues: options.defaultValues });
    return (
      <Form form={form} onSubmit={onSubmit}>
        {ui}
        <button type="submit">Enviar</button>
      </Form>
    );
  }

  return { onSubmit, ...render(<TestForm />) };
}
```

Submitting through the real provider lets you assert both sides: valid input → `onSubmit` called with parsed data; invalid input → `onSubmit` NOT called + the validation message is visible.

### 4.2 Radix selects / popovers in jsdom — polyfills + keyboard

Radix primitives (Select, Popover, DropdownMenu) need browser APIs jsdom lacks, and they set `pointer-events: none` on `<body>` while the listbox is open — so `user.click()` on an option fails. Two-part fix (`tests/unit/components/form-select.test.tsx`):

```ts
// Top of the test file (before render):
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn();
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
```

Then interact via **keyboard**, which is also the accessible path: open the trigger with `user.click(...)`, pick with `await user.keyboard('{ArrowDown}{Enter}')`, and assert on the resulting form value / submit — not on listbox internals.

## 5. Schema-module mocking — avoid Postgres driver in jsdom

Drizzle schemas (`@/lib/db/schema/*`) transitively import the Neon / Postgres driver, which throws in jsdom. When the code under test imports schema tables, mock the schema module with a plain object whose keys mirror column names:

```ts
vi.mock('@/lib/db/schema', () => ({
  users: { id: 'id', email: 'email', role: 'role', isActive: 'is_active' },
}));

vi.mock('@/lib/db/schema/notifications', () => ({
  notifications: {
    id: 'id',
    userId: 'user_id',
    title: 'title',
    body: 'body',
    channels: 'channels',
    read: 'read',
    createdAt: 'created_at',
  },
  notificationPreferences: {
    userId: 'user_id',
    category: 'category',
    enabled: 'enabled',
  },
}));
```

> String values ('id', 'user_id'...) are placeholders — the chainable `db` mock ignores them. Only the **shape** matters so that `eq(users.id, ...)` etc. don't crash on `undefined.id`.

---

## 6. Commands (kit-specific)

```bash
pnpm test                # Vitest run (unit + component, jsdom)
pnpm test:watch          # Watch mode
pnpm test <filter>       # Filter by filename substring
pnpm test:coverage       # Vitest with v8 coverage
pnpm test:e2e            # tsx scripts/tools/e2e-runner.ts (wraps Playwright with env + seed)
pnpm test:e2e --project=chromium tests/e2e/x.spec.ts       # one spec, base phase only
pnpm test:e2e tests/e2e/x.spec.ts                          # one spec, every phase (unreachable phases are skipped, not failed)
pnpm test:e2e --ui --project=chromium tests/e2e/x.spec.ts  # UI mode (the --project= is required)
pnpm verify              # lint + typecheck + test (DoD gate)
```

> `pnpm test:e2e` uses a **custom runner** (`scripts/tools/e2e-runner.ts`) that seeds the DB, sets env flags, and invokes Playwright (see [`sk-e2e`](../sk-e2e/SKILL.md)). Every argument it does not own is forwarded to Playwright verbatim, so debugging an individual spec goes through it too — `pnpm test:e2e --help` prints the flags it does own.
>
> **There is no second entry point, by design.** The pair of raw-Playwright aliases the kit used to ship (`test:e2e:direct` / `test:e2e:ui`) is retired: a raw invocation runs against whatever `DATABASE_URL` the environment carries, and `tests/global-setup.ts` now refuses any run that is not pointed at the throwaway branch the runner created (`sk-e2e` §1.6). The compile-guard stub for `server-only` (`sk-e2e` §1.5) travels with the runner for the same reason.

---

## 7. Kit-specific pitfalls

| Pitfall                                                                 | Fix                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Schema import crashes jsdom (`Cannot find module '@neondatabase/...'`)  | Mock `@/lib/db/schema/*` with plain objects (§5)                          |
| Test uses `.rejects.toThrow('UNAUTHORIZED')` for a `withAuth` handler   | Assert `{ error: '...' }` instead — `withAuth` catches and returns        |
| `vi.mocked(db.insert).mockReturnValue({ values: ..., returning: ... })` | Use `createChain(result)` (§3) — cleaner and matches real `await`         |
| `@testing-library/jest-dom` matchers not found                          | Already wired in `vitest.setup.ts` — don't re-import per test             |
| `This module cannot be imported from a Client Component module` at load | A `server-only` module reached the runner. Already mocked in `vitest.setup.ts` (§1.1) — seeing it means your setup file is stale: run `factory update` and take `theirs` |
| Your own global mock disappeared after a `factory update`               | It was in `vitest.setup.ts`, which is kit-owned. Move it to `vitest.setup.project.ts` (§1.2) |
| Component test for a third-party primitive the kit did **not** adapt    | Don't — upstream already tests it; test your wrapper instead. This is **not** a blanket rule about `ui/`: that folder holds two classes of file (`SK.md §3.3`), and both the kit's own components living there and its adapted primitives are tested — see `tests/unit/components/` |
| Radix Select/Popover crashes in jsdom, or clicking an option does nothing | Polyfill `ResizeObserver`/`scrollIntoView`/pointer-capture + select via keyboard — see §4.2 and `tests/unit/components/form-select.test.tsx` |

---

_Cross-reference: [`sk-e2e`](../sk-e2e/SKILL.md) for the `e2e-runner.ts` wrapper. [`sk-api`](../sk-api/SKILL.md) for the action patterns under test. [`sk-db`](../sk-db/SKILL.md) for the DB helpers mocked here._
