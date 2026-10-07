---
name: sk-e2e
description: Kit-shipped Playwright infrastructure: the `e2e-runner.ts` wrapper that spins an isolated Neon branch per run and drives a registry of phases (kit-declared plus `scripts/tools/e2e.project.ts`), dynamic `auth.setup.ts` writing storageState per role, parametrized RBAC route specs over `ROUTE_ACL × ROLES`, and stability rules. Invoke when authoring E2E specs, adding or debugging a run phase, chasing flakiness, or touching auth/RBAC E2E infra.
last-verified: 2026-09-24
user-invocable: false
---

# sk-e2e — Kit-shipped E2E Testing Infrastructure

> **Not stack-agnostic — this is kit-shipped infrastructure.** Travels with the Starter Kit. Grounded in actual files: `playwright.config.ts`, `scripts/tools/e2e-runner.ts`, `tests/e2e/auth.setup.ts`, `tests/fixtures/{auth,auth-files,own-session,rbac}.ts`, and `tests/e2e/rbac-routes.spec.ts`. Without the kit, this skill is inoperative — derived projects without the kit should use generic Playwright docs instead.
>
> **Pair:** for Vitest / mocks see [`sk-testing-nextjs`](../sk-testing-nextjs/SKILL.md).

---

## 1. How E2E actually runs here

**Three moving parts** — all must be in sync:

1. **`scripts/tools/e2e-runner.ts`** (the wrapper, entry point of `pnpm test:e2e`)
   - Decides the port for this run (§1.4) and **generates a derived Playwright config** in `node_modules/.cache/timekast-e2e/` with that port forced onto it, passed to Playwright as `--config`.
   - Creates a temporary **Neon DB branch** for isolation.
   - Migrates that branch to the current schema — **emptied first and migrated from `0000`** when the repo opts in with `e2e.config.json` (*The empty-branch mode* below); skipped where there is no migrations dir.
   - **Builds the app once** — or reuses the build already in `.next/` when every input that feeds it is unchanged (§1.3) — and serves that **production build** with `next start` on the branch's `DATABASE_URL`; see §1.1 for why it is not `next dev`.
   - Invokes Playwright **once per phase**, each with its own server. The kit declares three — phase A (`chromium`, base suite, MFA off), phase B (`mfa`, MFA-aware specs, MFA on) and phase C (`evidence`, the visual-evidence harness, **`optIn`** so it never runs unless it is named — §1.7) — and a project can declare more of its own in `scripts/tools/e2e.project.ts` (§1.7).
   - Cleans up branch + server on exit.
2. **`playwright.config.ts`**
   - **No `webServer` block** — intentionally. The runner starts the server. If you add `webServer`, Playwright evaluates config BEFORE `globalSetup`, so the server starts with the wrong `DATABASE_URL`.
   - **Three projects as the kit ships it:** `setup` (runs `auth.setup.ts` once), `chromium` (the base suite — `dependencies: ['setup']`, `testIgnore: /\.mfa\.spec\./`) and `mfa` (the MFA-aware specs — no `setup` dependency, it authenticates inline because the shared `storageState` is created with MFA off). A project that declares a phase of its own adds a project here too — the runner refuses to run a phase this file does not declare (§1.7).
   - **Its `baseURL` is not what drives the run** — the derived config `require`s this file and rewrites `baseURL` (top level AND per project) onto the port the runner chose. **The host it declares is kept**; only the scheme and the port are imposed (§2). That host has to resolve to **this** machine, and the runner checks it — by resolving it — before it creates anything (§2). Everything else here — projects, `testMatch`, `globalSetup`, timeouts — is preserved exactly. Its own port resolution is only a fallback: every run comes through the runner (§1.6), so the value it computes is never the one Playwright uses.
3. **`tests/e2e/auth.setup.ts`**
   - Iterates `Object.values(ROLES)` from `@/config/roles` and creates a test user per role.
   - Logs in via UI and saves the session as `tests/.auth/{role}.json` (gitignored).
   - Specs consume via `test.use({ storageState: AUTH_FILES[role] })`.

```
pnpm test:e2e
     │
     └─► scripts/tools/e2e-runner.ts
              │ 1. resolve the port (§1.4) + write the DERIVED Playwright config
              │    (node_modules/.cache/timekast-e2e/) with that port forced on it
              │ 2. neon-branch create
              │ 3. db:migrate the branch (if the project has migrations) — emptied first
              │    and migrated from 0000 when e2e.config.json says emptyBranch: true
              │ 4. pnpm build ONCE (production, branch URL + baked NEXT_PUBLIC_*)
              │    └─ reused when the input stamp matches (§1.3); --build forces it
              │ 5. wipe the DATA cache (`.next/cache/fetch-cache`) and spawn `next start`
              │    with the branch URL (MFA posture fixed per phase) — the wipe is per
              │    SERVER, so a two-phase run does it twice
              │ 6. wait for server (ceiling is CI-aware: 1 min local, 2 min on CI)
              │ 7. invoke `playwright test --config=<derived>` — once per RESOLVED PHASE,
              │    in order (with the compile-guard stub armed in NODE_OPTIONS — §1.5)
              │        └─► project "setup" → auth.setup.ts (per-role users + storageState)
              │        └─► project "chromium" → *.spec.ts (auth via storageState)  [A, MFA off]
              │        └─► project "mfa" → *.mfa.spec.ts (inline auth)             [B, MFA on]
              │        └─► …then whatever scripts/tools/e2e.project.ts declares    [§1.7]
              │ 8. on exit: kill server, delete branch
```

**The empty-branch mode (`e2e.config.json`).** With `{ "emptyBranch": true }` in `e2e.config.json` at the repo root, right after creating the branch the runner drops every user schema in it — the app's tables, drizzle's bookkeeping (`drizzle.__drizzle_migrations`) and any other non-system schema — recreates `public` the way Postgres ships it, and only then runs `pnpm db:migrate`. With no bookkeeping left, the **whole** migration chain replays from `0000` on every run. Without it, the branch keeps the parent's data and the journal applies only what the parent lacks.

| Repo | `e2e.config.json` | Mode |
| --- | --- | --- |
| Born with `factory new` | ships with `true` | empty branch |
| Born before the flag | absent — `factory update` never creates it; it **asks** once, interactively (yes → `true`, no → `false`) | parent's data, until someone opts in |
| Reverting | `false`, or delete the file | parent's data |

The runner prints the mode it runs in (`🗄️  E2E database: …`) and reads the file **before** creating the branch: an unreadable file, a non-boolean `emptyBranch` or an unknown key aborts the run naming the file — the mode is never guessed. Adoption guide for an existing repo → [`e2e-empty-branch.md`](../../docs/retrofits/e2e-empty-branch.md).

| What it buys | What it means for the suite |
| --- | --- |
| The full migration chain is exercised every run: a broken journal, a bad order, or a migration that only worked because something was applied by hand to `develop` (an extension, a column from an old `db:push`) fails here, not in a deploy | Specs and `auth.setup.ts` must **seed everything they read**. A spec that passed because `develop` happened to hold a row now fails — fix it by seeding that row in the spec or the setup, never by pointing the run back at the parent's data |
| No data from the parent ever reaches a run | — |

> In the empty-branch mode, what an empty database cannot catch is a migration that fails only against **real-shaped data** (a `NOT NULL` without a default over a populated table). That is the develop deploy's job: it migrates the develop database before anything reaches `main`. A derivative with **no** `src/lib/db/migrations/meta/_journal.json` keeps the inherited schema: with nothing to rebuild it from, the branch is neither emptied nor migrated.

> **Why generate a config instead of asking the project's one to honour `E2E_PORT`.** Two suites can only run at once if each serves on its own port AND Playwright drives its `baseURL` there. "Does this config already read `E2E_PORT`?" has no honest answer from the outside — the cheap check is textual, and a config that merely mentions the variable in a comment reads as a yes, after which every spec drives a port with nothing on it. Overriding the RESULT has no such failure mode: a config that reads `E2E_PORT` and one that never heard of it end up with the same `baseURL`. The derived file `require`s the project's own config rather than re-emitting its values, so regexes, `devices[…]` spreads and `globalSetup` functions survive intact.

**Where the runner reads its variables.** From its own process: the runner is the same in every repo. In a repo **without** the vault, `.env.local` is optional to it (it loads the file when there is one, and a variable already set always wins over it). In a repo **with** the vault it never reads `.env.local`, and a local run always goes through the vault: started any other way than `pnpm test:e2e` (`tsx scripts/tools/e2e-runner.ts` straight, an agent), it relaunches itself through `scripts/tools/with-vault.mjs` before doing anything.

| Where | Where the variables come from |
| ----- | ----------------------------- |
| **Repo with a vault** (`vault` block in `.timekast/provision.json`) | `pnpm test:e2e` runs through the vault wrapper (`scripts/tools/with-vault.mjs`), which injects the `local` environment with the developer's session. `local` imports `develop:/ci`, so `NEON_API_KEY` and `NEON_PROJECT_ID` arrive with it. The nested calls (`pnpm db:migrate` on the ephemeral branch, `pnpm build`) pass through untouched: the wrapper marks its child (`TK_VAULT_INJECTED`), so the branch URL the runner sets is never overwritten by the vault. There is no `.env.local`. Layout → `fx-secrets-vault §7` |
| **Repo without a vault** | `.env.local` |
| **CI** | The repo's GitHub secrets (`NEON_API_KEY`, `NEON_PROJECT_ID`, `DATABASE_URL`) and variables; the wrapper passes through under `CI` |

### 1.1 Why the production build, not `next dev`

`next dev` compiles each route the first time a test touches it, so page-load time depends on which spec ran first — the source of cascading `page.goto` / `waitForURL` timeouts that read as product bugs. A precompiled build serves every route immediately: faster and, above all, **deterministic**.

Measured on two independent derivatives (described, not named — this skill ships to every project in the fleet):

| Suite                                       | `next start` (with build)   | `next dev` (no build)                     |
| ------------------------------------------- | --------------------------- | ----------------------------------------- |
| Project A — 127 tests                       | ~4.5 min · 2 flaky          | ~11.3 min · 13 flaky                      |
| Project B — ~120 tests, ~40 routes          | 4.6 min · 116 pass · 0 fail | 7.9 min · 108 pass · 1 fail · 4 never ran |

In project B, **every long-standing failure turned out to be a dev artifact** — none was real.

#### The first run against real data — what actually breaks, measured

A suite grown on a seeded database will meet real data eventually: a derivative pointing at an ephemeral clone of a production-sized branch, or a CI run cloning `main`. The result of doing that deliberately is worth writing down, because **the thing everyone expects is not the thing that breaks.**

Measured on a derivative, 126 specs against a clone with **1.4M rows in its main table and 4.1M in the next** — volume identical to production:

> **Row count broke nothing.** Not one selector collision from extra matches, not one pagination count off, not one filter confused. 123 green in 3.6 minutes. The intuition that "more rows means more ways to collide" did not survive contact with 4 million of them.

What did break was **a precondition that had been true by accident**, and it is the failure mode to look for:

> A `beforeAll` seeded a fallback record only if it could not find one, asking for *active, no segment assigned*. The production path it was setting up for asks for *active, no segment, **and no survey-link placeholder*** — that third filter exists because a direct contact has no segment, so the link cannot be resolved and the action refuses any template that needs it. On a seeded database the two definitions select the same rows and nobody notices they are different questions. On real data: four candidates without a segment, one inactive, three carrying the placeholder → **zero usable**. Setup saw three, considered itself done, and seeded nothing; the action then rejected all three and returned "none available". The error toast faded before the screenshot, so the failure arrived disguised as *the dialog never opened*.

**The rule that falls out of it:** a setup that *queries* for what it needs is asserting that the product's definition matches its own — silently, and only where the data is thin enough for both to agree. **Seed by construction instead.** Create the record with the properties the code under test requires, and remove it in the teardown, after whatever references it.

| Symptom on the first run against real data                        | Look at this first                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| A UI step "does nothing" and the assertion times out              | Not the UI. Check whether the **setup's** criteria for a fixture still match what the **product** requires — and whether a toast carried the real error away before the screenshot |
| `element intercepts pointer events`                               | A real overlay. Playwright names this one explicitly; a bare timeout is **not** it                                                     |
| Several cases in the SAME file retry, elsewhere is green          | The file, not the case. Look at what its `beforeAll` assumes exists                                                                   |
| A count or a filter is off                                        | The one class volume really does cause. Check §9 R2 (globally unique columns)                                                          |

> 🔴 **Written after being wrong about it.** The first version of this section blamed a hydration race — Playwright's auto-wait does not wait for React to attach a handler, so a server-rendered button is clickable before its `onClick` exists, which fits the symptom perfectly and is a real phenomenon. It was not the cause here: retrying the click for 20 s left the dialog just as absent, which rules out a lost click. A story that explains the symptom is not evidence, and a plausible one costs more than no story at all — it sends the next reader to the wrong layer, and it justified a census of "similarly exposed" call sites that turned out to rest on nothing.

```
🔴 NUNCA sirvas e2e con `next dev` sobre un `.next` que dejó un `pnpm build` previo.
   Los dos escriben el mismo directorio y el dev server se cuelga compilando (medido:
   una ruta sin responder a los 210 s con la caché sucia; 7.8 s con `.next` limpio;
   0.99 s en producción). Sirviendo el build eso desaparece — el build ES lo que se
   sirve, no hay dos dueños del directorio. Por eso `tk-implement` Phase 4.1 no
   corre un `pnpm build` suelto antes del e2e.
```

**Dos `NEXT_PUBLIC_*` se hornean en ese build** (son build-time; el resto de la postura, incluida MFA, es runtime y se fija por fase):

| Variable                      | Valor                       | Por qué                                                                                                             |
| ----------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`         | `http://localhost:{E2E_PORT}` | Sin esto los checks de mismo origen (CSRF de passkey, `expectedOrigin` de WebAuthn) fallan contra el origen canónico |
| `NEXT_PUBLIC_AUTH_MAGIC_LINK` | `false`                     | No hay correo en e2e; servidor y cliente deben coincidir o hay mismatch de hidratación en `/login`                  |

**The build runs with the ephemeral branch's `DATABASE_URL` — and that is only safe because the protected routes are dynamic.** The runner passes the throwaway branch URL to `next build` for robustness, not because the build needs a database: everything under `(protected)` is session-gated and therefore dynamic, so nothing is prerendered and the build issues no query. Two things rest on that assumption, so it is worth stating rather than leaving implicit:

| Rests on it                              | How                                                                                                                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build recycling** (§1.3)               | `DATABASE_URL` is the one baked var deliberately EXCLUDED from the input stamp. It is a fresh branch every run, so hashing it would mean recycling could never happen — and excluding it is safe precisely because nothing about that branch reaches the build output. |
| **The isolation guarantee** (§1)          | The database a spec talks to is the one the SERVER received at runtime. If the build could bake rows in, the suite would be asserting against data from a branch that no longer exists.                            |

> 🔴 **A statically prerendered route that queries at build time breaks both at once**: the build would bake rows from a throwaway branch into the output, and the stamp would happily reuse that build across runs whose data differ — green against an app nobody is testing. A derivative that adds one needs `export const dynamic = 'force-dynamic'` on it (or an equivalent opt-out). The kit ships no separate build-time database, and the runner does not create one.

> **Efecto lateral que vale conocer:** servir el build destapa errores que dev enmascara. En producción Next redacta el error a un `digest`, así que dos rutas de denegación con el MISMO mensaje pero distinto `throw` producen digests distintos — un oráculo de existencia real. Detalle y patrón de arreglo en [`sk-security`](../sk-security/SKILL.md) § Existence oracles.

**Commands — one entry point, and only one:**

| Command                                                     | Does                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm test:e2e`                                             | Full flow — Neon branch + server + tests (CI + local)      |
| `pnpm test:e2e --project=chromium tests/e2e/x.spec.ts`      | One spec, base phase only — the debugging loop             |
| `pnpm test:e2e tests/e2e/x.spec.ts`                         | One spec, every phase — the phases whose project holds no matching test are **skipped with a notice**, not failed (see "A filter reaches every phase" below) |
| `pnpm test:e2e --ui --project=chromium tests/e2e/x.spec.ts` | UI mode. `--ui` is forwarded to Playwright like any other argument |

> 🔴 **`--project=` is not optional in UI mode.** Without it `resolvePhasePlan` plans EVERY phase, so Playwright's UI would open once, wait to be closed, and then open again for the next one.
>
> **There is no `test:e2e:direct` / `test:e2e:ui`, and no raw `playwright test`.** Those aliases do not exist because they would bypass the runner by design, which would make them the visible path to running the suite against whatever database the local environment points at (§1.6). What such an alias would preserve — fast feedback on one spec — the runner already gives: the branch is cheap and the build is reused when nothing that feeds it moved (§1.3). What it would cost is the guarantee. The one thing it would have that the runner does not is hot reload against a `pnpm dev` you already have up; that is the accepted trade, not an oversight.

**Runner flags — the contract.** `pnpm test:e2e --help` prints it, rendered from `RUNNER_FLAGS` in `scripts/tools/e2e-runner.ts`, so the printed contract cannot drift from what the code consumes. `--help` is answered before anything is read or created: no `.env.local`, no Neon credentials, no build, no server — and it wins over any other flag.

| Flag / var         | Does                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| `--project=<name>` | One phase only, named by its Playwright project. The kit ships `chromium` (base suite, MFA off), `mfa`, and `evidence` (visual evidence — `optIn`, reached through `pnpm evidence:visual`); a project declares more in `scripts/tools/e2e.project.ts` (§1.7), and any of those names works here too. Default: every phase, in order — except any declared `optIn`, which runs only when it is named (§1.7). **A name that is no phase of THIS checkout fails fast**, before branch, build or server, and the error lists the ones that are: planning the base phase for anything that is not literally `mfa` would run a suite nobody asked for on a typo, and report green. `--project <name>` (a space, the spelling Playwright's own docs use) is the same flag, not two stray arguments. |
| `--build`          | Rebuild even when the input stamp says the build in `.next/` is current (§1.3).         |
| `--keep-branch`    | Leave the throwaway Neon branch alive on exit and write its connection URI to a private file outside the repo (the PATH is printed, never the URI). Local debugging — see below. |
| `--help` / `-h`    | Print the contract and exit — no branch, no build, no server.                           |
| `E2E_PORT`         | Pins the port for this run. Wins over everything, and is never moved — see §1.4.        |
| `CI`               | Set by CI providers → always compiles, never reuses a build (§1.3), and gets the wider server-startup ceiling (§1.4). |
| `E2E_ALLOW_REMOTE_HOST` | Run even though the `baseURL` host of `playwright.config` does not resolve to this machine. Without it that run is **refused**, before the branch and the build (§2). With it the runner prints the finding as a banner and proceeds. |
| `E2E_SERVER_LOGS`  | `1` keeps the server's output after it is ready — its stdout and the `warn`-level log lines otherwise hidden. Off by default (the noise would bury Playwright's report); for investigating a flaky run. A server that **dies mid-run** is reported with or without it: `❌ The E2E server died mid-run (code …, signal …)`. Without that line, the symptom is only specs timing out against an empty port. |

```
# one spec, base phase only — the invocation that `--help` exists to make discoverable
pnpm test:e2e --project=chromium tests/e2e/x.spec.ts
```

#### Before the first run: the browsers — `pnpm e2e:setup`

Playwright needs its browsers **downloaded into a cache on this machine**; installing the npm
package does not put them there. On a fresh checkout, or a CI runner on an image that is not
Playwright's own, they are absent.

```bash
pnpm e2e:setup          # → playwright install chromium
```

That is the whole fix, and it is idempotent — a cache that is already complete is left alone.

**The runner refuses to start without them, and it refuses FIRST.** The check is two `stat()`
calls and it runs immediately after the Neon credentials, *before* the zombie-branch sweep, the
throwaway branch, the production build and the server — so a missing browser costs a second
instead of the minutes a late check would cost, and the message carries the command to copy. Nothing is
created on that path: no branch, no build, no server.

| Aspect | Fact |
| ------ | ---- |
| Why it existed as a gap | Three halves, all missing at once: nothing documented the command, no script automated it, and the runner discovered the absence **last** — after paying for everything. The failure then arrived as a Playwright launch error, which reads as a suite problem rather than as "run one install". |
| 🔴 Two binaries, not one | Playwright's `chromium` install target expands to `chromium` **plus** `chromium-headless-shell`, and a headless run — CI, and this runner — launches the **second**. A check on `chromium.executablePath()` alone therefore passes on a cache where the first download finished and the second did not (an interrupted install), and the late failure comes back. The shell is verified through its `INSTALLATION_COMPLETE` marker: its executable's leaf name is per-platform, the marker is one name everywhere, and the marker is also what tells a finished install from an interrupted one. |
| 🔴 "Absent" and "unreadable" are different answers | `existsSync` returns `false` for **every** error alike, so an unreadable cache (`EACCES`, a broken mount) would be reported as "the browsers are not installed" and send you to run an install that cannot fix it. The probe distinguishes `ENOENT` (missing → the install command) from any other errno (reported explicitly, **with** its code and cause). Both abort the run; only the diagnosis differs, and the diagnosis is the difference between a fix that works and one that cannot. |
| Presence, never an env var | CI images that ship the browsers preinstalled (`mcr.microsoft.com/playwright:*-noble`, §1.6) pass on the real files, so nothing has to be told that it is CI. |
| The derivative gets the alias | `package.json` is frozen at bootstrap (BR-FACTORY-006), so `factory update` cannot add a script by shipping a file. The CLI maintains `e2e:setup` in `kitLocalScripts`, **file-gated on the runner** (a `core` derivative without `scripts/tools/e2e-runner.ts` never receives an alias for a suite it cannot run) and **insert-if-missing** — a team that pointed `e2e:setup` at `playwright install --with-deps` keeps its own value, byte for byte. |
| Testable, not buried in `main()` | The check is the exported `checkPlaywrightBrowsersInstalled()` with its probe injected. `main()` is not exported and cannot be called without creating a Neon branch, so a check living inside it would be unassertable. |

> **Everything else is forwarded to Playwright verbatim** (`--grep`, `--headed`, `--ui`, a spec path). The runner never rejects a flag it does not own, and its `--help` deliberately does not restate Playwright's flags — `pnpm exec playwright test --help` owns those, and a second copy would be stale the day Playwright adds one.
>
> 🔴 **One exception, and it is a removal: a bare `--` is dropped.** `pnpm test:e2e -- <args>` is how a developer is told to pass an argument through, and pnpm forwards the separator along with it. Playwright applies its own meaning to it — "flags end here, filenames follow" — so it looks for a file named `--shard=1/2`, finds none, and reports `No tests found` **while exiting green**: an attempt to run the suite in shards becomes a run that executed nothing, silently. The runner strips it at the same point it strips its own flags. It is not listed in `RUNNER_FLAGS` because nothing consumes it — the runner does not act on the separator, it simply refuses to pass it on. An argument that merely contains two dashes (`--grep=--foo`) is untouched: the match is on the whole token.

**A filter reaches every phase — and a phase it cannot reach is skipped, not failed.** The runner injects `--project=<phase>` and forwards the rest of the arguments to Playwright **once per phase**, so a spec path or a `--grep` typed once is applied to `chromium`, then to `mfa`, then to whatever `e2e.project.ts` declares. Playwright answers a project holding no matching test with `No tests found` **and exit code 1** — so without the skip below, `pnpm test:e2e tests/e2e/register.spec.ts` would pass its spec in the base phase and then end `❌ Tests failed` because `mfa` (whose `testMatch` admits only `*.mfa.spec.*`) had nothing to run. The kit's own two phases reproduce it; a derivative with phases of its own only meets it more often.

| Piece                        | What it does                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hasTestFilter`              | Whether the forwarded arguments narrow the tests: a positional token (a spec path, or the spaced value of any flag) or `--grep=` / `--grep-invert=`. Generous by design — a value that is not really a filter (`--workers 2`) costs one listing that finds every test and changes nothing. **Without a filter, nothing is listed and nothing is skipped: the run is byte-identical to before.** |
| The listing                  | With a filter, each phase first runs `playwright test --list` with **the same argv and the same environment** the phase itself gets (derived config, project, the compile-guard `NODE_OPTIONS` of §1.5 — without it the listing dies loading `auth.setup.ts` exactly as a run would). One Playwright process, no server, no global setup; output captured, not printed. It happens **before** the server starts, so a skipped phase costs seconds, not a boot. |
| `phaseMatchesFilter`         | Skips **only** on the one measured shape that means "nothing matched": the literal `No tests found` line **and** `Total: 0 tests`. A spec that died while being loaded also totals zero but never prints that line (item 11 of §9) — that phase **runs**, so Playwright reports the throw instead of the runner filing a broken import under "omitted by filter". Unparseable output runs too: the runner never decides on silence. |
| `⏭️  Skipped — the filter matches no test of project 'mfa'` | The notice printed in the phase's slot. The result is recorded as `skippedByFilter`, which `resolveRunExitCode` leaves **out** of the verdict — neither a pass nor a failure.                                                                                                                                                              |
| Every phase skipped          | **The run fails**, naming the phases: a filter that matched nothing anywhere executed nothing, which is the same green-over-nothing the `--` rule above exists to prevent. A typo in the spec path is red, with `The filter matched no test in any phase`. |

> Why not forward Playwright's `--pass-with-no-tests`? It would turn the unreachable phase green with no extra process — and turn a filter that matches nothing anywhere green too. The listing keeps the two apart, and the `--help` says so in one line.

**`--keep-branch` — when the database is the thing you need to look at.** The branch is deleted on exit precisely so a suite leaves nothing behind; `--keep-branch` suspends that for one run so the rows a spec wrote survive it. Two halves, and the second is the one worth knowing:

| Half                            | What happens                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| This run does not delete it     | Cleanup skips `deleteE2EBranch` and prints the branch name. The connection URI is **written to a private file** (`0600`, in a fresh temp directory outside the checkout) and the runner prints that PATH — the URI itself never reaches stdout. It embeds the branch role's password, that password is **not** ephemeral (Neon clones the parent's roles with their passwords, so deleting the branch rotates nothing), and every other line of the runner redacts that exact value. **On CI neither the URI nor a path**: the flag has no legitimate use there, and Actions masks only `secrets.*` — a runtime-minted URI would land in the build log in clear text. |
| The NEXT run does not reclaim it | The branch is named `e2e-keep-<ts>-<hostTag>-<pid>` and `selectZombieBranches` skips that mark outright. Without it the branch would survive the run that made it and then be aged out 30 min later (§9 item 5) — the promise broken quietly, one run afterwards. |
| The URI **file** is reclaimed after a week | The branch is nobody's zombie; the credential file is not the branch. Without a sweep nothing deletes it — the run exits right after printing the path, the branch is deliberately kept, and macOS does not clear its temp directory on every reboot — so every kept branch would leave one more live Postgres password at rest. A later run sweeps the `timekast-e2e-branch-*` directories older than **7 days** (`KEPT_URI_MAX_AGE_MS`), beside the zombie-branch sweep. Generous on purpose: reclaiming one early costs you the URI you kept the branch for, reclaiming one late costs a few hundred bytes. An entry whose age cannot be read is never deleted. |

> A kept branch is therefore **nobody's zombie**: it lives until a human deletes it in the Neon Console. That is deliberate (a cleanup that could reclaim it would defeat the flag) and it is the reason the flag says so on the way out. It is for a local loop — on CI it leaks branches, which is why the URI is withheld there rather than written or printed.
>
> **If the file could not be written, the report says WHY** — the errno (`EACCES`, `ENOSPC`, `ENOENT` for a `TMPDIR` that is not a directory), never the URI. "Could not write it" on its own was a dead end: the three causes need three different fixes and the error was being discarded.

**The runner never frees a port it did not take.** When something else already holds the port, it identifies the process, prints the PID plus the command to free it, and stops. Killing a foreign server would send the remaining tests of THAT suite against this run's server — a different database — where they fail as if they were product bugs. Point the second run elsewhere instead: `E2E_PORT=<other> pnpm test:e2e` **from the other checkout**.

> ⚠️ `E2E_PORT` moves a run to another port; it does not make a checkout run two suites. Both would share `.next/` and the build stamp (§1.3), so one invalidates the stamp and launches `next build` over the very directory the other is serving or compiling. Two suites at once means two checkouts (which already get different ports on their own — §1.4).

### 1.2 Cost model — where E2E runs, and where it must not

E2E is the priciest thing the kit runs: browsers + production build + Neon branch, ~4-12 min a pop. On GitHub-hosted runners that is the single largest consumer of a monthly minute allowance, so **where** it runs matters as much as what it asserts.

> 🔴 **The org runs this on a self-hosted pool, and that changes the arithmetic below — not the table.** A job on the pool bills no GitHub minutes at all (own compute, cents per run) and finishes faster, so "one billed run per release" becomes "one cheap run per release". What does NOT change is the layer each assertion belongs to: `/implement` on the dev's machine is still the fastest feedback, and a spec that needs no browser still belongs in Vitest. **The pool is open to every private repo of the org — there is no per-repo enrollment**, so the `e2e.yml` that `pnpm setup:e2e` generates (`runs-on: [self-hosted, e2e, playwright]`, `playwright install chromium` without `--with-deps`) runs as-is and regenerates with nothing to re-apply; `ubuntu-latest` in a private org repo is drift, not an exception. Only a public or out-of-org repo stays hosted, and it needs both `ubuntu-latest` and `--with-deps`. Moving a repo onto the pool, and what a repo that stays hosted keeps doing: [`self-hosted-e2e-pool.md`](../../docs/retrofits/self-hosted-e2e-pool.md).

| Layer                  | Runs                        | Cost               |
| ---------------------- | --------------------------- | ------------------ |
| Working branch (`develop`) | `/implement` Phase 4.1, on the dev's machine | free, and BEFORE the push |
| Release branch (`main`)    | CI, once per merge          | one billed run per release |
| Feature branches / PRs     | nothing                     | — |

That is why `resolveTriggerBranch` bakes the **release** branch into the generated workflow, not the branch you are standing on. A develop-first repo that triggered on `develop` would bill the priciest workflow on every push while duplicating a check `/implement` already ran locally.

**Right layer for the assertion.** Before adding an E2E spec, ask what it actually needs:

| The test needs…                       | Layer          |
| ------------------------------------- | -------------- |
| A real browser (hydration, navigation, RBAC redirects) | E2E |
| Only an HTTP request + response shape | Vitest — call the route handler directly |
| Only a pure function / schema         | Vitest unit    |

A spec driven by Playwright's `request` fixture is the tell: **no page means no reason to be in E2E**. `tests/unit/app/api/password-reset-routes.test.ts` is the worked example — four such tests were moved out of `password-reset.spec.ts`; as unit tests they cover more (both branches of the anti-enumeration guarantee, which E2E could not assert without seeding real users) and run in milliseconds instead of needing a build and a database branch.

**Derived projects: the suite you inherit is mostly not yours.** ~86% of the kit's E2E tests cover auth/MFA/identity — that is the kit's own product surface, and the kit must test it exhaustively. A derivative inherits those specs against a `src/` that is **frozen at bootstrap** (BR-FACTORY-006) and that nobody on that team edits. Re-running them on every epic close is time spent proving something unchanged still works. A derivative with its own product flows should keep the kit's auth suite for scheduled or auth-touching runs, and keep the per-epic loop to its own specs plus a login smoke.

### 1.3 Build recycling — when the runner compiles, and when it does not

The build is the expensive step of a local run, and editing a spec does not change it. So the runner stamps the build's **inputs** and reuses the output in `.next/` when none of them moved.

| Aspect                       | Fact                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where the stamp lives        | `.next/e2e-build-stamp.json` — beside the build it describes, never at the project root (`.gitignore` is frozen in a derivative, so a root file would be untracked noise for ever). Delete `.next/` and the stamp goes with it, which is exactly right: no build, no reuse.                  |
| What it covers               | Content hashes of `src/`, `public/`, `types/`; the root build inputs (`next.config.*`, `package.json` + lockfile, `tsconfig.json`, PostCSS/Tailwind, `components.json`, `instrumentation*`, Sentry configs, and the env chain `next build` loads in production — `.env.production.local`, `.env.production`, `.env`); the **whole** `.env.local` when there is one; the env the runner injects; **the `NEXT_PUBLIC_*` variables the invocation itself carries** (below); the E2E port; and anything the project itself declares in `package.json#e2eBuildInputs` (below). |
| What it deliberately ignores | `tests/**` (editing a spec must not trigger a rebuild — that loop is the point), `node_modules/` (its identity is the lockfile, which IS hashed), `.claude/`, `scripts/`, docs, and the throwaway branch `DATABASE_URL` (different every run, and it never reaches the build output).          |
| Force a rebuild              | `--build`.                                                                                                                                                                                                                                                                                 |
| CI                           | **Always compiles** — checked before the stamp is even read, by rule, so that no change to what the stamp covers (nor a warm self-hosted runner) can quietly turn a CI result into a recycled artifact.                                                                                     |

The bias is to over-include: an input missing from the stamp degrades silently to "green against an app that is no longer under test", while an extra one only ever costs a rebuild that could have been avoided.

**The `NEXT_PUBLIC_*` of the invocation — the third door into the build.** `next build` inlines every `NEXT_PUBLIC_*` it can see into the client bundle, and it sees three sets: what `.env.local` holds (hashed as a file; a repo with a vault has none, and its values arrive with the process — the third set), what the runner pins itself (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_MAGIC_LINK`), and **what the process was started with**. A stamp that covered only the first two would let `dotenv -e .env.<profile> -o -- pnpm test:e2e` — selecting a profile before invoking the runner, without touching `.env.local` — produce two runs with the same stamp and one bundle: the second profile's suite would run, in green, against the first profile's identifiers, brand and logos. Every `NEXT_PUBLIC_*` present in the environment is part of the stamp, sorted by name so the order a process happens to enumerate them in cannot move it.

> ⚠️ **The failure mode is symmetric, and the other half is silent too.** A `NEXT_PUBLIC_*` that genuinely varies per run would make the stamp miss every time — the full build, on every run, for ever, with "slower" as the only symptom. The known case is `NEXT_PUBLIC_APP_URL`: it varies with the port, and it is already covered through the injected env plus the port itself, so the port still moves the stamp exactly **once**. A project that exports a timestamp or a nonce as a public var pays a rebuild per run by construction.

**`package.json#e2eBuildInputs` — the project's own build inputs.** The list above is the kit's, and `e2e-runner.ts` is overwritten by every `factory update`, so a derivative cannot extend it there. It declares its own top-level build inputs in its `package.json` instead — the file that is frozen at bootstrap and already owns `ports.e2e`:

```jsonc
// package.json — a derivative that feeds its build from MDX + next-intl catalogues
"e2eBuildInputs": ["content", "messages"]
```

| Aspect                | Behaviour                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Additive              | The kit defaults always apply; this only lengthens the list. **No key ⇒ nothing changes**, byte for byte.                                                                                            |
| Directory or file     | `"content"` hashes every file under it, recursively; `"contentlayer.config.ts"` hashes that one file.                                                                                                |
| Absent on disk        | Ignored, silently. A brain artifact tolerates the tree it lands on (BR-FACTORY-006).                                                                                                                 |
| Malformed             | Never fatal. A key that is not an array, or an entry that is not a string, is reported on the run's output and skipped — a typo in `package.json` must not stop a suite.                             |
| 🔴 Confined           | Paths must be **relative and inside the checkout**. Absolute paths, drive letters and any `..` segment are **rejected and reported**, never rewritten: a clamped path would look accepted while meaning something else. Cosmetics (blanks, `\`, `./`, trailing slashes) are normalized first, so the check cannot be dodged. Symlinks are recorded by name and never followed. |
| Never an input        | `node_modules/`, `.git/`, `.next/` — refused as an entry AND pruned when the walk meets one nested inside a declared directory (recorded by name, never descended into). Hashing them would cost more than the build they decide about, and `.next/` is the build's own output. |
| Covered by the stamp? | The key itself needs no special handling: `package.json` is a hashed input, so adding or removing an entry moves the stamp on its own.                                                               |
| Files, never variables | Entries are **paths**. Environment variables are not declared here and never were: the `NEXT_PUBLIC_*` ones are covered by the stamp itself (above), and the rest are runtime, read by the server rather than baked. An entry naming a variable is just a path that does not exist — ignored, silently. |

**The data cache is wiped before every server — and that is the other half of recycling.** `.next/` survives between runs *on purpose* so the build can be reused, but Next also persists its **Data Cache** (`unstable_cache`, `fetch` with `revalidate`) under `.next/cache/fetch-cache/`, and those entries would survive the same way — describing rows of a Neon branch that was deleted when its run ended. So the runner deletes that one directory, unconditionally, **immediately before each `next start`** (twice in a two-phase run: phase A's server must not leave cached rows for phase B's). The build output, its stamp `.next/e2e-build-stamp.json`, the image cache and Turbopack's `next dev` cache are all left alone — the wipe is surgical precisely so recycling keeps working.

> 🔴 **A spec may not depend on data cached by an earlier run.** Each run starts with an empty data cache and a brand-new database, so a cached read resolves against **this** run's branch. Symptom when it went wrong (measured in the fleet): a cached count or record from hours earlier, an insert failing on a foreign key, and a route's `catch` reporting it as a missing record rather than as a stale cache.

> **Known skip:** a reused build also skips `prebuild` (email logo + PWA icons). Their outputs live under `src/` and `public/`, so they ARE hashed — a reused build is one where they were already regenerated and unchanged. Editing `.env.local` (a repo without a vault) moves the stamp, so that path rebuilds and `prebuild` runs.

### 1.4 Which port a run serves on, and how long it waits for the server

**Port — four steps, in order.** The first one that answers decides:

| # | Source                              | Result                                                                                                  |
| - | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1 | `E2E_PORT`                          | That port, verbatim. Explicit choice ⇒ a busy one fails loud, never moves.                              |
| 2 | `package.json#ports.e2e` = a number | That port, verbatim. The project pinned it; same treatment.                                             |
| 3 | `package.json#ports.e2e` = `null`   | **Derived from the checkout's absolute path** (`31000-32767`), walking to the next free port on a collision. |
| 4 | The key is absent entirely          | `3005`.                                                                                                  |

An **emptied** key (`null`) and an **absent** one are deliberately different. `null` is what the kit ships and what `factory update` writes: it is the signal "this project has no fixed port — derive one". A derivative whose `package.json` never carried a `ports` block keeps landing on the default, because its `package.json` is frozen at bootstrap (BR-FACTORY-006) and a brain update must not silently move where a suite serves.

Deriving from the **absolute path**, not the repo name, is what lets two worktrees of the SAME repo run their suites simultaneously: same name, different paths, different ports. Same path always yields the same port, so a checkout keeps its port across runs. The range sits below every ephemeral port range in the wild (Linux's starts at 32768) and above everything a developer machine typically uses.

**Server-startup ceiling — CI-aware, not one flat number.** `next start` boots a precompiled build, so readiness is "the process bound the port and answered once", normally under a second. The ceiling is headroom for a loaded machine, never for compilation:

| Where | Ceiling | Why                                                                                                                       |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| CI    | 2 min   | The constrained case the ceiling was always for. A false timeout burns a whole billed run (§1.2) and hits the fleet.       |
| Local | 1 min   | A precompiled server that has not answered in a minute has genuinely failed to boot — and the exit watcher usually says so first. |

> **Every probe is aborted on its own, so the ceiling is real.** `fetch` has no overall timeout and undici only gives up after 300 s, while the loops check the clock BETWEEN polls — so without a per-request abort, one listener that accepts a connection and never answers would park a wait for five minutes, 5× the local ceiling. Each request carries an `AbortSignal`. Reading of an aborted probe is deliberate and not symmetrical: waiting for **readiness**, a silent peer is "not ready yet" and the loop polls again; checking whether a **port is free**, a silent peer means a socket is bound and answering slowly — that is a port in USE, and the runner stops rather than binding on top of another suite's server.

### 1.5 `server-only` / `client-only` — why a spec dies before it runs, and the stub that fixes it

`server-only` and `client-only` are **compile-time** guards: inside the bundler they are directives, and their whole job is to throw when a module is pulled into the wrong graph. **Playwright runs on plain Node**, where nothing rewrites them — so importing one simply throws (or fails to resolve, in a project that never installed the package). The consequence is bigger than it looks: any spec that reaches a server-guarded module **however transitively** — a spec → a fixture → a query helper → `import 'server-only'` — dies while it is being **loaded**, before a single test runs.

**It does not read as an import error.** Measured on a throwaway spec: Playwright reports the throw and then `Error: No tests found`. The file looks empty, the suite looks misconfigured, and the actual cause is one import three files away.

**The stub.** The runner starts Playwright with `NODE_OPTIONS=--import=<scripts/tools/e2e/compile-guard-init.mjs>`, which neutralizes both specifiers. Returning an empty module is safe precisely because these packages have no runtime behaviour to preserve — outside a bundler they are assertions, not implementations.

| Aspect | Fact |
| ------ | ---- |
| Where it lives | `scripts/tools/e2e/` — **not** `tests/e2e/`. `tests/**` is frozen at bootstrap (BR-FACTORY-006) and does not travel, so a derivative that put the shim there would keep maintaining its own copy. `scripts/**` is a tracked path, so the mechanism travels on its own with `factory update`. |
| Two files, not one | `register()` takes a module **specifier**, so the hooks must live in a file of their own (`compile-guard-loader.mjs`) apart from the entry that registers them (`compile-guard-init.mjs`). |
| 🔴 Two halves, both required | **ESM** — a `resolve` hook via `register()`. **CJS** — a stub over `Module._load`. On Node < 22.15 the hooks from `register()` do **not** intercept `require()`, and Playwright **transpiles specs to CommonJS**, so an `import 'server-only'` becomes a `require()` that walks straight past the ESM hook. Measured on Node 22.14: the ESM-only variant fixes an ESM import and still kills a CJS one. Deleting the second half looks like a cleanup and silently disarms the mechanism on the path Playwright actually uses. |
| 🔴 Injected by the RUNNER, not the config | `--import` applies only at the **boot** of a process, and Playwright collects specs in its **main** process. Setting `process.env.NODE_OPTIONS` from inside `playwright.config.ts` is already too late for that process — measured: the spec still dies at collection, with `No tests found`. It has to be in the environment of the spawn. |
| One entry point, so one place to arm it | Every run goes through the runner (§1), so the stub is injected in exactly one spawn and cannot be missing from a second path. A second path would miss it: an alias like `test:e2e:direct` / `test:e2e:ui` shelling `playwright test` straight from `package.json` never receives it (one reason neither exists — see the note in §1), so a spec that reached a server-guarded module died at load with `No tests found` **only there** while passing under `pnpm test:e2e` — which reads as "the wrapper is hiding a bug" and is exactly backwards. Proven both ways on one spec: raw `playwright test` ⇒ the throw + `No tests found`; through the runner ⇒ `1 passed`. |
| A `file://` URL, never a path | Node splits `NODE_OPTIONS` on **whitespace**, so a checkout under `~/My Projects/…` would hand it a truncated path and abort with `ERR_MODULE_NOT_FOUND` before Playwright starts (measured). The URL form percent-encodes the space, so there is no whitespace left to split on — on any platform, with or without a shell. Same class of defect `resolveSpawnShell` documents for argv. |
| Composes, never overwrites | A developer's or CI provider's own `NODE_OPTIONS` is preserved and the flag appended. The composition is **idempotent by exact token**, so a nested run does not accumulate copies, and somebody else's `--import=<our-url>.bak` is not mistaken for ours. |
| The server does **not** get it | `next start` serves the **bundled** build, where Next resolves both guards at build time. Stubbing them there would neutralize a real guarantee of the app under test instead of an artifact of the test runner. |

> **The right layer is still the first question (§1.2).** The stub makes a server-guarded module *loadable* in a test process; it does not make an E2E the right place for it. A helper that only needs a function called belongs in Vitest.
>
> **Vitest has the same exposure, and it is covered too — by a different mechanism.** It bites exactly where the same reasoning predicts: once `src/` imports `server-only`, `pnpm test` goes red on every file that reaches it (25 at once in the kit's own tree). The fix there is **not** this stub and **not** a `resolve.alias`: `vitest.config.ts` is frozen at bootstrap (BR-FACTORY-006), so an alias would never reach the fleet. It is `vi.mock('server-only', () => ({}))` in `vitest.setup.ts`, which was moved onto the tracked set for the purpose — with `vitest.setup.project.ts` beside it so a derivative's own mocks survive the update. Contract: [`sk-testing-nextjs`](../sk-testing-nextjs/SKILL.md) §1.1-§1.2.

### 1.6 The disposable-database guard — why the suite refuses to run anywhere else

`playwright.config.ts` loads `.env.local` with dotenv **in the config itself**. So, in a repo without a vault, `pnpm exec playwright test <spec>` starts a full run, with that file's `DATABASE_URL`, without passing through a single script of the kit — no branch, no isolation, and no way for the runner to have an opinion. On one derivative that file shared an endpoint with production: most specs died on arrival and a handful wrote to it. Retiring the pretty-named aliases narrows the path a developer stumbles onto; it does not remove the capability. This does.

**The rule, in one line:** the suite runs against the throwaway branch the runner just created, or it does not run.

| Piece                                       | Role                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `playwrightEnvOverrides` (`e2e-runner.ts`)  | Sets `E2E_DISPOSABLE_BRANCH` to the **same value** as `DATABASE_URL` — the connection URI of the branch created seconds earlier. Different every run. |
| `scripts/tools/e2e-guard.ts`                | `assertDisposableBranch(env)` — throws unless the effective `DATABASE_URL` **is** that value. Marker absent (nobody came through the runner) ⇒ throws too. |
| `tests/global-setup.ts`                     | Calls it. Playwright runs `globalSetup` in its MAIN process before loading any spec, so a refused run dies before an `INSERT` exists to execute.       |

**Why a positive proof and not a blacklist.** The guard compares against nothing external — not `.env.local`, not a list of "production" URLs. A negative rule has to enumerate every database that must not be written to and is wrong the day a project adds one. This one enumerates the single database that may be, and that value is minted per run.

🔴 **It is an anti-footgun, not a security boundary — and the difference is worth stating before somebody builds on it.** What it removes is the ACCIDENTAL path: the obvious command that silently runs the suite against `.env.local`'s database. What it does not remove is the deliberate one — the rule is an equality between two variables of one environment, so `E2E_DISPOSABLE_BRANCH="$DATABASE_URL" pnpm exec playwright test` satisfies it without knowing any Neon URI.

The marker being a per-run URI rather than a fixed flag such as `E2E_DISPOSABLE_BRANCH=1` is a difference of **degree**: a fixed `=1` is printable advice (anyone who reads the error message knows the value, which leaves the lock armed and the key on the doormat), while a value minted per run cannot be guessed and cannot appear in a message — so the error never names a variable to export. Making it unfakeable would take a live check that the URI really is a throwaway branch, which the guard deliberately does not do. Separately, the test that pins the key to `options.databaseUrl` (`e2e-runner.test.ts`, `describe('playwrightEnvOverrides')`) is what keeps a `factory update` from dropping the key while `pnpm verify` stays green — the failure that would disarm the whole thing.

> **And the wiring itself is detected, not assumed.** The guard and the runner travel via `scripts/**`; the line that invokes it lives in `tests/global-setup.ts`, which travels nowhere. So the runner checks — from the side that does travel — whether this checkout's `globalSetup` reaches the guard, and prints a loud warning at the START and again at the END of the run when it does not, pointing at the retrofit. A warning, not an abort: the run doing the checking is itself safe (it came through the runner), the unguarded thing is every run that goes AROUND it, and a brain artifact tolerates the tree it lands on (BR-FACTORY-006) rather than breaking the suite of a derivative that has not applied the retrofit yet.

> **In a derivative it does not arrive on its own.** `tests/**` is frozen at bootstrap (BR-FACTORY-006), so `factory update` ships `scripts/tools/e2e-guard.ts` but cannot add the one line in `tests/global-setup.ts` that calls it. Until that line exists the derivative has the guard on disk and no guard in effect → [`.claude/docs/retrofits/e2e-disposable-db-guard.md`](../../docs/retrofits/e2e-disposable-db-guard.md).

#### The other wiring the runner detects: the project's auth flags reaching CI

Locally every spawn inherits the runner's environment (the vault's `local`, or `.env.local` without a vault — §1), so the suite runs against the app the project actually configured. **In CI it does not**: the local environment never reaches a CI job. What a job does receive are the CI **secrets** — `DATABASE_URL` and the two Neon ones, written by the vault's `develop:/ci` sync (or by `factory provision` without a vault, `SK.md §7.2`) — and none of them is an auth flag. Without the flags below, the specs that read a flag to decide whether to run at all (`register.spec.ts` and `NEXT_PUBLIC_AUTH_REGISTRATION`, default `true`) **never skip in CI**: the suite tests self-registration against an app with registration closed, and reports green. `pnpm setup:e2e` closes that gap with repo **variables**, never secrets.

| Piece | Role |
| ----- | ---- |
| `pnpm setup:e2e` | Publishes the project's `NEXT_PUBLIC_AUTH_*` as **variables** of the repo, and is their only writer (`SK.md §7.2`). Its source depends on the repo: with a vault, the `develop` environment the wrapper injects (`setup:e2e*` declare `--vault-env=develop`; a leftover `.env.local` is not read); without one, `.env.local` — never secrets: they are `NEXT_PUBLIC_*`, so `next build` already inlines them into a bundle anybody can read. It prints the keys **and their values** and asks before writing to somebody's repository. |
| 🔴 `dotenv.parse` | The kit writes `.env.local` **with quotes**, and `booleanString` (`src/lib/env.ts`) compares against the literal `'false'` — as does the `parseBool` of the spec. Publishing `NEXT_PUBLIC_AUTH_REGISTRATION="false"` verbatim leaves the flag **true** in CI: the fix delivers the opposite of what it promises, in green. `dotenv` already resolves quotes, escapes, multi-line values, `export ` and comments. |
| Excluded | `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_AUTH_MAGIC_LINK` — the runner pins both (`bakedEnvOverrides`). Its override wins in the merge anyway; what publishing them costs is a stale port churning the build stamp, and a value in the test process contradicting the one the app was built with. |
| The workflow step | Before `pnpm test:e2e` (so it precedes the build, which is when public vars are baked): `pnpm exec tsx scripts/tools/setup-e2e.ts --emit-ci-env >> "$GITHUB_ENV"`, with `toJSON(vars)` handed over through `env:` — never interpolated into the `run`. |
| 🔴 The consumer-side filter | The **same prefix**, applied again on the way in: `selectCiEnv()` in `scripts/tools/setup-e2e.ts`. `toJSON(vars)` is EVERY variable of the repo, including whatever somebody adds later in the GitHub UI, and the runner spawns children with `{ ...process.env, ...overrides }` — so a name like `NODE_OPTIONS`, `DATABASE_URL` or `E2E_*` would reach the build and the test process. It lives in an exported function rather than a `node -e` inside the YAML because a control nobody can test is not a control. |
| `node`, not `jq` | `jq` is not guaranteed in `mcr.microsoft.com/playwright:*-noble`. A malformed payload **throws**, so the step exits non-zero and the job stops before the suite rather than running with a posture it silently lost. |
| Heredoc, not `key=value` | `$GITHUB_ENV` is read line by line, so a value carrying a newline would let what follows be read as another assignment — an arbitrary variable of the job, defined by the content of a repo variable. The delimiter is random per invocation. |
| Nothing published ⇒ nothing changes | No variable ⇒ empty output ⇒ the kit's defaults, byte for byte. Adopting this cannot break a repo. |

> **The fix does not reach a repo that already enabled E2E, and the runner says so.** `e2e.yml` (the ACTIVE workflow) is excluded from the distribution profile while `.github/workflows/**` is tracked, so `factory update` refreshes the `.example` and can never touch the generated one. A new project gets the step the first time it runs `setup:e2e`; a project that already has a workflow gets a **notice** from the runner — loud, never an abort, for the same three reasons the disposable-database banner argues: this run is local and unaffected, a brain artifact tolerates the tree it lands on, and the detection is textual. Remedy: the adoption guide at [`.claude/docs/retrofits/e2e-ci-auth-env.md`](../../docs/retrofits/e2e-ci-auth-env.md), which carries the four lines to paste. 🔴 **Not a bare `pnpm setup:e2e`**: that command regenerates the workflow from the template and **overwrites it whole**, including an `E2E_PARENT_BRANCH` it warns about but does **not** preserve, plus any job or step the project added by hand. It is the right path only for a workflow that was never customized, and the guide carries the `git diff --no-index` that tells the two cases apart. The notice also scopes itself: a project running the kit's auth defaults has nothing to adopt. A workflow that does not run the suite — the kit's own disabled placeholder included — is exempt **by shape, never by name**: no `pnpm test:e2e` in it means nothing to retrofit, and activating it brings the invocation along, so the exemption expires on its own.

### 1.7 Phases are data — and a project declares its own without forking the runner

A **phase** is a server started with a certain posture plus one Playwright project run against it. They exist because some postures cannot coexist in one process: the kit's two differ only in whether MFA is on.

That "two" is not the SHAPE OF THE CODE — coded as a pair of booleans, a boolean parameter to the server spawn, and one `if` per phase in `main`, a third phase would be a third boolean, a third `if` and a third message, so the only way a derivative could add one would be to **edit the runner** — which `factory update` overwrites, silently, on the next update. It is a datum:

```ts
// scripts/tools/e2e-runner.ts — the exported contract
export interface E2EPhase {
  project: string;   // must exist as a `project` in this checkout's Playwright config, and be unique
  label: string;     // what the runner prints, after `▶ `, when the phase starts
  env?: () => { server?: EnvOverrides; playwright?: EnvOverrides };  // evaluated ONCE per phase
  required?: boolean;  // kit phases only — a required phase is never skipped (table below)
  skipNote?: string;   // printed when a non-required phase is skipped
  optIn?: boolean;     // declared but NOT in the default set — only runs when named (below)
}
```

**`optIn` — a phase that is declared, discoverable, and does not run unless you ask for it.**
Some phases are expensive and rarely wanted: the visual-evidence harness captures screenshots,
and without this field every ordinary `pnpm test:e2e` would capture them. `optIn: true` keeps the
phase in the registry — `--project=<its name>` resolves it exactly like any other, and the
"no such phase" error still enumerates it, so it stays discoverable — while a run with **no**
`--project` leaves it out.

| Aspect | Fact |
| ------ | ---- |
| Where it acts | `resolvePhasePlan`, and only there: the default set becomes `available.filter(phase => !phase.optIn)`. Membership of the registry is a separate question that `resolveAvailablePhases` still answers on its own (does this checkout declare the phase's Playwright project?). |
| Named explicitly | Runs, alone, like any other phase. **Naming it IS the opt-in** — the lookup never filters. |
| Discoverable | The `--project=<typo>` error lists **every** available phase, `optIn` ones included. A phase you can only learn about by reading the source is a phase nobody uses. |
| 🔴 Never `required: true` as well | `required` decides what happens when the checkout's Playwright config does **not** declare the phase's project — and a derivative's `playwright.config.ts` is frozen at bootstrap (BR-FACTORY-006), so a config that never heard of a phase added later is the **normal** case. A `required` phase there kills the whole run instead of being skipped: a suite destroyed by a capability it was not even using. Declare an `optIn` phase without `required` and a checkout that cannot run it simply skips it. |
| The kit assigns it to exactly ONE phase | `evidence` — the visual-evidence harness, phase C (below). `chromium` and `mfa` are **not** `optIn`: marking either would silently empty the default set of every checkout in the fleet. |

> 🔴 **One invariant it makes contingent, and this is the note so nobody breaks it by accident.**
> `PhasePlan.phases` is documented "never empty — resolution throws before it could be", which
> holds because `resolveAvailablePhases` refuses a registry with nothing runnable. With the
> filter above, it *also* depends on no `required` phase of the kit being `optIn`: a registry
> whose every runnable phase were `optIn` would filter down to `[]`, and `[].some(…)` is
> `false` — a run reporting green having tested nothing.

**The kit's own three phases are declared with that same shape** (`KIT_PHASES`). There is deliberately no code path only the kit walks: a shape the kit does not eat itself is one that breaks for a derivative without anybody noticing.

#### Phase C (`evidence`) — the first real consumer of `optIn`

The visual-evidence harness is what the field exists for, and the kit eats it itself: `evidence` captures every declared surface across every theme the active skin ships and three widths, so on an ordinary run it would be minutes nobody asked for. It is reached by `pnpm evidence:visual` (= `pnpm test:e2e --project=evidence`).

| Aspect | Fact |
| ------ | ---- |
| `optIn: true`, and **no `required`** | The pair the table above forbids, avoided here on purpose. A derivative's `playwright.config.ts` is frozen at bootstrap (BR-FACTORY-006), so declaring no `evidence` project is the NORMAL state out there — `required` would kill that project's whole suite over a capability it was not using. It skips with a notice instead, and the notice names the adoption guide. |
| Same posture as phase A | MFA off: it reuses the shared `storageState`, which `auth.setup.ts` writes with MFA off. Its Playwright project declares `dependencies: ['setup']` for the same reason. |
| It does NOT get an exception to §1.6 | The harness runs INSIDE the runner precisely because photographs of empty screens prove nothing — it needs the same seeded ephemeral branch the rest of the suite needs. No `E2E_DISPOSABLE_BRANCH` special case exists, and none was asked for. |
| Two halves in `playwright.config.ts` | Its own `testMatch: /\.evidence\.spec\./` **and** the base project's `testIgnore`. With only the first, `chromium` (which declares no `testMatch` and therefore collects everything) would capture screenshots on every ordinary run — defeating `optIn` entirely. |
| What it produces, and who reads it | `tests/.evidence/<run>/manifest.json` + PNGs — the input contract of the `ui-critic` agent. Not restated here → [`fx-visual-evidence`](../fx-visual-evidence/SKILL.md). |
| Its spec is a SHELL, and the difference matters when you fix something | `tests/e2e/visual.evidence.spec.ts` assembles what cannot travel (the browser, the saved sessions of `tests/fixtures/`, the skin registry of `src/`, Playwright's own assertions) and calls `scripts/tools/visual-evidence/capture.ts`, where the matrix and the ordered steps of a capture live. That module is on a tracked path, so a fix to capture BEHAVIOUR reaches the fleet on the next `factory update`; the same fix written into the spec would repair one checkout, because `tests/**` is frozen at bootstrap. |

**One function, not two.** `env()` returns both halves at once instead of a `serverEnv()` plus a `playwrightEnv()`. The reason is a specific failure: a secret that is **split** across the two processes — the half the server verifies, the half the test process signs with — is generated **once, by construction**. Two functions leave that agreement to a convention, and the failure mode is worse than a red run: a spec that depends on such a channel *skips structurally* when the secret is missing, so a mismatched pair produces an authorization rejection where there should be a clean skip.

#### Where a project declares its phases

`scripts/tools/e2e.project.ts` — **optional**, dev-owned, same promise as `.husky/pre-commit.project` and `vitest.setup.project.ts`: it ships in no distribution profile, so `factory update` can never write it, overwrite it or delete it.

```ts
// scripts/tools/e2e.project.ts — this project's own phases (dev-owned)
import crypto from 'crypto';
import type { E2EPhase } from './e2e-runner';

export default [
  {
    project: 'smoke',                       // must also exist in playwright.config.ts
    label: 'Phase C — public smoke (signed uploads)',
    env: () => {
      // ONE evaluation: the server verifies with this value and the specs sign with it.
      const secret = crypto.randomBytes(16).toString('hex');
      return {
        server: { UPLOAD_SIGNING_SECRET: secret, FEATURE_UPLOADS: 'on' },
        playwright: { UPLOAD_SIGNING_SECRET: secret },
      };
    },
  },
] satisfies E2EPhase[];
```

**No file ⇒ nothing changes, byte for byte.** Project phases run **after** the kit's, in the order the file declares them.

#### The environment a phase gets — an overlay, with keys it may not touch

The runner composes the RUN's base first (`serverEnvOverrides` / `playwrightEnvOverrides`: the throwaway `DATABASE_URL`, `PORT`, `NEXT_PUBLIC_APP_URL`, `NODE_OPTIONS`, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `EMAIL_PROVIDER`, `NEXT_PUBLIC_AUTH_MAGIC_LINK`, `SESSION_REVALIDATION_INTERVAL_MS`, `RATE_LIMIT_ENABLED`, `AUTH_TRUST_HOST`). A phase's `env()` is layered **on top** — never in place of it, or the phase would run without the branch connection, without a port and without an auth secret.

| Refused, by name or by prefix                              | Why a phase may not set it                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                             | The throwaway branch, and the disposable-database guard's positive proof (§1.6). Moving it disarms the guard.        |
| `PORT`                                                     | The port hand-off between phases: the server would bind somewhere the derived config does not drive.                 |
| `NEXT_PUBLIC_APP_URL`                                      | Baked at build time **and** read at runtime — see the prefix rule below.                                             |
| `NODE_OPTIONS`                                             | Carries the compile-guard stub (§1.5). Dropping it kills every spec that transitively reaches a `server-only` module. |
| `E2E_DISPOSABLE_BRANCH`                                    | The other half of the disposable-database guard (§1.6). Its rule is an EQUALITY with `DATABASE_URL`, so protecting only one side left the proof satisfiable without the runner's branch. |
| `PLAYWRIGHT_HTML_OUTPUT_DIR`                               | Where THIS phase's html report lands. The runner derives it from the phase's own `project` precisely so two phases cannot share a directory (below); a phase that pinned it would put every phase back on one folder — which is the bug, not a setting. |
| **anything prefixed `NEXT_PUBLIC_`**                       | The build is single and happens BEFORE the phases, so a public var per phase moves what the SERVER renders and leaves the client bundle untouched → hydration mismatch. |

#### Each phase keeps its own html report — `playwright-report/<phase>/`

Playwright's html reporter **deletes its output folder as it starts**. With `reporter: 'html'` and no `outputFolder`, that folder is one `playwright-report/` for the whole run, so without a per-project folder phase B erases phase A's report every time: whoever failed in the base phase is left with no evidence at all, which is the opposite of what a report is for. The report gets its own folder per project, matching the traces (`--output=test-results/<project>`).

| Aspect | Fact |
| ------ | ---- |
| Where it lands | `playwright-report/chromium/`, `playwright-report/mfa/`, `playwright-report/<your phase>/`. The **root name is unchanged on purpose**: a CI workflow that already uploads `playwright-report/` collects every phase without anybody editing it. |
| How | `PLAYWRIGHT_HTML_OUTPUT_DIR`, composed **per phase into the run's base** (`phaseEnvWithReportDir`). It cannot go in `playwrightEnvOverrides` (that is the base OF THE RUN — evaluated once, no phase in scope, so both phases would share a directory again) and it cannot arrive as a phase override (`composePhaseEnv` throws on a protected key — the runner would trip its own guard and kill every run). |
| It wins over the config | `reportFolderFromEnv() ?? resolveReporterOutputPath(…)` — verified against Playwright 1.58. So a project that declared `['html', { outputFolder: 'reports/e2e' }]` is overridden per phase rather than left on one folder. Other reporters have no such override: a `json`/`junit` with a **relative** `outputFile` still resolves against the derived config's directory, inside `node_modules/.cache/`. |
| Absolute, never relative | Playwright resolves the variable against the CWD of its own process. A relative value would write outside the tree the artifact step collects — evidence missing, everything else looking right. |
| The name is validated | It becomes a path segment of a directory the reporter **deletes**, so it goes through the same rule as `--output` (`isValidPhaseProjectName`) and a name that is not a safe segment throws rather than being sanitized. |
| 🔴 The report moved | A derivative that opens `playwright-report/` by habit will find subdirectories instead of a report. `pnpm exec playwright show-report playwright-report/<phase>` — and the runner prints exactly that line, per failed phase, at the end of a red run. |

**Progress in the log, too.** The derived config prepends a `list` reporter when the project's own declares none that prints progress (`list` / `line` / `dot` / `github` — a project that already asked for one is left alone, and a source that declares no `reporter` at all keeps Playwright's default). This is a change of **shape**, not of existence: Playwright already inserts `line` locally and `dot` on CI when nothing prints to stdio, and `dot` is one character per test — enough to say a suite is alive, not enough to say where it died. `list` names each test as it finishes.

A phase that declares one **fails naming the offending keys, and nothing is applied**. It is not ignored silently: the shape invites the attempt. The comparison is **case-insensitive**: environment variables are case-insensitive on Windows, so `Database_Url` is the same variable there and must be refused here.

> **Coherence with the CI step that DOES inject `NEXT_PUBLIC_*` (§1.6).** The row above says a phase may not set a public var; the workflow step publishes the project's `NEXT_PUBLIC_AUTH_*` into the job. They do not contradict each other, and what differs is the **scope**, not the variable. The step injects at **job level, before anything of the run starts**, so the value is in the environment when `next build` bakes it — server and client agree by construction, and it enters the build stamp like anything else the invocation carries (§1.3). A **phase** sits AFTER that single build: setting a public var there moves what the server renders and leaves the bundle the browser downloaded untouched. One rule, stated once: a public var is legal exactly where the build can still see it (the `build` half of §1.8, or the job before the run begins) and refused everywhere after it.

**A phase's `project` is validated too** — letters, digits, `.`, `_`, `-`, and never `.` or `..`. The name becomes a path segment (`--output=test-results/<project>`) and Playwright DELETES that directory as it starts, so an unvalidated name aims that deletion wherever it likes.

> **`MFA_ENCRYPTION_KEY` is of the RUN, not of a phase** — and so is anything else every phase shares. The phases share one Neon branch, so a key per phase would have phase A seeding TOTP secrets that phase B cannot decrypt: an authorization rejection where a valid flow should be. It is resolved once in `main` and lives in the base.

#### Tolerance — asymmetric on purpose

| Situation                                              | What the runner does                          |
| ------------------------------------------------------ | --------------------------------------------- |
| No `e2e.project.ts`                                    | Runs the kit's default set. **Identical to before.** |
| The file exists but does not load                      | **Aborts**, naming the real error              |
| **Optional kit** phase (`mfa`) with no matching project | Skips it with a notice — as before             |
| **Required kit** phase (`chromium`) with no project     | **Fails.** Never skipped                       |
| **Project-declared** phase with no matching project     | **Fails**, naming the phase                    |
| Resolution leaves **zero** runnable phases              | **Fails**, naming what was skipped and why     |

🔴 **Why not "skip with a notice" for all of them.** The run's exit code comes from the exit codes of the phases that ran, and `[].some(…)` is `false` — so a run that skipped everything would report **green having tested nothing**. Uniformity of SHAPE does not oblige uniformity of FAILURE POLICY; `required` keeps the asymmetry a readable datum instead of a hidden `if`. The tolerance for `mfa` has a reason that does not generalize: a derivative born before the kit's MFA feature has a frozen `src/` (BR-FACTORY-006) whose config legitimately declares no `mfa` project. A phase the **project** declared is not in that situation — declaring it IS the claim that it exists.

**Two more rules the registry carries.** Names must resolve to a **unique directory** — not merely a unique string. The runner passes `--output=test-results/{project}` and composes `playwright-report/{project}`, and Playwright **wipes both directories as it starts**, so two phases landing on one directory eat each other's traces and reports. The check therefore compares names case-insensitively and ignoring trailing dots: on macOS `mfa` and `MFA` are one directory, and on Windows so are `mfa` and `mfa..`. Detection, separately, is by the **escaped** name against the config source — an unescaped dot or plus in a project-chosen name would give a false negative, which is a skipped phase, which is the green above.

> Migrating a fork of the runner to this file → [`.claude/docs/retrofits/e2e-phases-adoption.md`](../../docs/retrofits/e2e-phases-adoption.md). The decision record behind the shape, including the alternatives that were rejected, is `ADR-002-e2e-phase-registry` in the Factory's `project/planning/decisions/` (origin-only — it does not travel to derivatives).

---

### 1.8 The RUN's environment is data too — `e2e.env.project.ts`

§1.7 answers _"I want another phase"_. This answers _"I want variables pinned for **every** phase"_ — the case the kit itself has (`MFA_ENCRYPTION_KEY`, `EMAIL_PROVIDER=none`, `RATE_LIMIT_ENABLED=false` all live in the run's base) and, until v11.8.0, did not offer: the docstring of a phase's `env()` sent you to `serverEnvOverrides`, which is kit-owned with no way in.

Without it, a project's own run-wide flags had to live in the developer's local environment (`.env.local`, or the vault's `local`), and that is a real downgrade rather than a stylistic one: the runner's promise is that **the posture of the run does not depend on what a developer happens to have on disk**. It is the same reason the kit pins `EMAIL_PROVIDER=none` (never mail a real `@example.com`). Moved to `.env.local`, the guarantee becomes a convention, and the failure is the silent kind — somebody runs the suite with a feature flag off, the specs for that feature skip, everything is green.

```ts
// scripts/tools/e2e.env.project.ts — dev-owned, in NO distribution profile
export default () => ({
  build: { NEXT_PUBLIC_AUTH_REGISTRATION: 'false' }, // baked + stamped
  server: { REPORTS_ENABLED: 'true', PLATFORM_OPS_HOST: 'ops.localhost' },
  playwright: { REPORTS_ENABLED: 'true' },
});
```

**Three halves, where a phase has two — and the third is the point.** A phase may never set a `NEXT_PUBLIC_*`: one build precedes every phase, so a public var per phase moves what the server renders and leaves the client bundle untouched. A **run** is exactly the scope where that objection disappears, because the build happens inside it. So public vars are legal in `build`, refused in the other two (setting one there does nothing at all), and `build` is the only half that also feeds the **build stamp** — without that, a recycled `.next/` (§1.3) would serve the previous bundle, green, with the old value.

| Half | Goes to | Notes |
| ---- | ------- | ----- |
| `build` | The single production build **and** its stamp | The only half that may declare `NEXT_PUBLIC_*`. Not passed to the server: `next start` reads public vars from the bundle. If your server code also reads one at runtime, declare it in `server` too |
| `server` | Every phase's `next start` | Layered under the phase's own `env()`, which wins — the more specific scope |
| `playwright` | Every phase's Playwright process | Same |

**Same tolerances as §1.7, same reasons:** no file ⇒ the run is byte-for-byte what it was; the file present but unloadable **aborts** (carrying on would run the suite against whatever the local environment holds and report green). The default export may be a **function** — evaluated once, before the Neon branch and the build — which is what lets a project mint a per-run secret, the same reason `E2EPhase.env` is one.

**Refused in every half:** `DATABASE_URL`, `PORT`, `NEXT_PUBLIC_APP_URL`, `NODE_OPTIONS`, `E2E_DISPOSABLE_BRANCH`, `PLAYWRIGHT_HTML_OUTPUT_DIR` — the infrastructure of the run (its branch, its port, its address) plus the one value that is per-PHASE by construction (§1.7: the html report directory), none of them project settings. A typo'd half (`severs`) is **named, not ignored**: silently pinning nothing would pass green with a posture the project believed it had set.

> Moving your run-wide vars out of your local environment (`.env.local`, or the vault's `local`) into this file → [`.claude/docs/retrofits/e2e-run-env-adoption.md`](../../docs/retrofits/e2e-run-env-adoption.md).

#### `E2E_PORT` — the port the run chose, for an origin a spec builds itself

The derived config rewrites the `baseURL` of every Playwright project (§1.4), which covers a spec that navigates relative to it. It cannot rewrite an origin a spec **assembles**, and a project with several — a tenant host, an ops host, a central one — has to assemble them.

The runner publishes the chosen port to the Playwright process as **`E2E_PORT`**. Derive your origins from it, never from `package.json#ports.e2e`:

```ts
// tests/e2e/auth.setup.ts (or wherever the origins live)
const port = process.env.E2E_PORT ?? '3000';
const tenantOrigin = `http://tenant.localhost:${port}`;
```

Why it matters: `ports.e2e` is empty by default so the runner can derive a port per checkout and two worktrees can run at once. A project reading its origins from that key ends up with the server on one port and its setup navigating to another — `ERR_CONNECTION_REFUSED`, in a message that names neither the runner nor the port. Reading `E2E_PORT` is what lets such a project keep the key empty.

> Pinning `ports.e2e` is still legitimate (you give up parallel checkouts, nothing else). If you do, write your **own** `//e2e` comment beside it: `factory update` retires the value it shipped, and a comment that is not the kit's is how it knows the number is yours.

---

## 2. Playwright config — the real one

```ts
// playwright.config.ts (actual values)
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Overridable per run — the workflow maps its dispatch inputs onto the same names.
  // `||`, never `??`: an input that was not supplied arrives as '' and Number('') is 0.
  retries: Number(process.env.E2E_RETRIES || 1),
  workers: Number(process.env.E2E_WORKERS || Math.min(4, os.availableParallelism())),
  reporter: 'html',
  timeout: 60_000,
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`, // overridden by the derived config under the runner
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Creates test users + storageState (runs once).
    { name: 'setup', testMatch: /auth\.setup/ },
    // Phase A — base suite. Served with MFA off, so the MFA specs are ignored here.
    // Every phase-specific spec has to be ignored HERE too, or the base project (which
    // declares no testMatch, and therefore collects everything) runs it as well.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /\.(mfa|evidence)\.spec\./,
    },
    // Phase B — MFA-aware specs, against a server started with MFA on. No `setup`
    // dependency: the shared storageState is created with MFA off, so these
    // authenticate inline.
    { name: 'mfa', use: { ...devices['Desktop Chrome'] }, testMatch: /\.mfa\.spec\./ },
    // Phase C — visual evidence (optIn: declared, never in the default set).
    {
      name: 'evidence',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /\.evidence\.spec\./,
    },
  ],
  // NO webServer block — the runner handles it
});
```

> **Four projects, three phases — as the KIT ships it.** The runner maps them: `setup` + `chromium` run in phase A, `mfa` in phase B, `evidence` in phase C (`optIn` — it is declared and does not run unless named, §1.7), each against its own server with the MFA posture pinned as a RUNTIME env (§1). "Three" is not a property of the runner, though: phases are a registry (§1.7), so a project that adds a `project` here and an entry in `scripts/tools/e2e.project.ts` gets one more without touching the runner. A derivative born before the kit's MFA feature has no `mfa` project — the runner detects that and skips phase B (§9 item 9).

**Why these values:**

| Value                       | Reason                                               |
| --------------------------- | ---------------------------------------------------- |
| `timeout: 60_000`           | Headroom for slow flows, not for cold compiles¹ |
| `actionTimeout: 15_000`     | Hydration-aware element interactions                 |
| `navigationTimeout: 30_000` | Slower SSR + Neon cold starts                        |
| `workers: CI ? 1 : 2`       | CI serializes to avoid Neon branch contention        |
| `retries: CI ? 2 : 1`       | Catch true flakes without masking real bugs          |
| `trace: 'on-first-retry'`   | Debug evidence only when needed (cheap on green)     |

> ¹ El runner sirve el build de producción (§1.1): no hay compilación en request-time, así que un test que se acerque a los 60 s indica un problema real (query lenta, espera mal puesta), no calentamiento del servidor.

**Port: this file does not decide it.** The runner resolves the port (§1.4) and hands Playwright a **derived config** that `require`s this one and rewrites `baseURL` — at the top level and per project, since a project-level `use` wins. So runner, Playwright and app agree by construction instead of by each re-deriving the port and hoping. The resolution kept here is a fallback for a direct invocation, which the guard of §1.6 refuses anyway; it is left in place because deleting it would change the file for no gain and `playwright.config.ts` is frozen at bootstrap in a derivative.

**What the rewrite changes, and what it leaves alone.** The port is the invariant the runner needs — two suites can only run at once if each drives its own. The **host is not**, and forcing it was a real defect: a derivative that routes tenants by the `Host` header fails closed against `localhost`, taking the whole suite down rather than one phase.

| Part of `baseURL` | Derived config                    | Why                                                                                                                     |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Host              | **Preserved** from the source     | It belongs to the project (virtual hosts, tenant routing). Computed **per level** — a project pinning its own host keeps it, and one pinning none inherits the top level's, already rewritten. |
| Port              | **Imposed** — this run's          | The whole reason the derived config exists.                                                                             |
| Scheme            | **Imposed** — always `http`       | The run is served by `next start` on loopback, in the clear. An `https://` in the source would leave every spec negotiating TLS with a server that never speaks it. |
| Path / query      | Dropped — the result is an origin | Playwright resolves relative `goto`s against it; the run serves the app at its root.                                    |

> A `baseURL` that is absent, relative, scheme-less, non-numeric in its port or not a string at all falls back to `http://localhost:{port}` — **never a throw**, which would abort a run that already paid for a Neon branch and a build. A project that pins nothing (the kit included) is therefore unchanged, byte for byte.
>
> 🔴 **The preserved host must resolve to THIS machine — and that is VERIFIED, not assumed.** The server of the run lives here. A config that defaults to a remote origin (`process.env.BASE_URL ?? 'https://staging…'`) would send the traffic off the machine, in the clear (the scheme is forced to `http`), carrying the passwords `auth.setup.ts` seeds in the body of every login, while the local server idles — and the disposable-database guard (§1.6) does **not** catch it: that one compares the DATABASE, not the HTTP destination.
>
> | Where the host resolves                                        | What the runner does                                                                              |
> | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
> | Loopback (`127.0.0.0/8`, `::1`)                                | Runs, in silence. Covers `localhost`, anything under `.localhost`, and a name mapped to `127.0.0.1` in `/etc/hosts`. |
> | Anywhere else                                                  | **Refuses**, before the Neon branch, the migration and the build — the same "fail before you spend" rule as every other pre-flight. The message names the host, what it resolved to, and the way out. |
> | Nowhere (it does not resolve, or resolution times out)         | **Refuses**, naming that cause. The run could not have reached it either way, and passing silently is the same defect wearing another face. |
> | Any of the above, with `E2E_ALLOW_REMOTE_HOST` set             | Runs, after printing the finding as a banner. The escape hatch buys a run, never silence.          |
>
> **It resolves the name; it does not pattern-match it.** A lexical rule would reject `ops.acme.test` mapped to `127.0.0.1` in `/etc/hosts` — i.e. re-break the very case the preservation exists for. So the runner asks the resolver (`dns.lookup`, under a 5 s ceiling like every other network call it makes), and every address that comes back must be loopback: a name answering with both a loopback and a public address is not local, because the client picks and nobody chose which half of the run leaves the machine. The one lexical shortcut is `.localhost`, which RFC 6761 §6.3 already reserves for loopback — it is a fast path, never the check.
>
> **What the check reads, and what it deliberately cannot.** It takes the `baseURL` literals out of the config's text (comments stripped), applies the same rule the derived config applies, and asks about the host. Two shapes carry no host and are therefore left alone: a value that is **malformed** (relative, scheme-less, non-numeric port, not a string — that one falls back to `http://localhost:{port}` and never leaves the machine), and one whose **host is interpolated** (`` `https://${tenant}.acme.com` ``), where the text simply does not say. An interpolated **port** is read normally — the kit's own `` `http://localhost:${E2E_PORT}` `` is checked like any other. For the residue, the derived config still announces any level that drives a different host as Playwright loads it.
>
> **Passkey on a multi-host project — split the phases, do NOT bake per host.** `NEXT_PUBLIC_APP_URL` stays baked as `http://localhost:{port}` (it is server env, not Playwright config), and it feeds the passkey CSRF Origin allow-list plus WebAuthn's `expectedOrigin`. So a spec driving `tenant-a.localhost` fails passkey on an origin mismatch. **That is the design working, not a gap:** `src/lib/auth/webauthn.ts` states it as Invariant 2 — the `rpID` and `expectedOrigin` come from env and **never** from the `Host` header, because the `Host` is attacker-controllable and deriving them from it would let a malicious origin mint options for the real domain. Passkey is pinned to ONE canonical origin on purpose.
>
> | Want to test…                 | Run it…                                                                                              |
> | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
> | Passkey / WebAuthn / step-up  | on the **canonical origin** — the kit's own phases already do, and nothing needs declaring            |
> | Tenant routing by `Host`      | in a **phase of your own** (`scripts/tools/e2e.project.ts`, §1.7), at your tenant hosts, **without** the passkey specs |
>
> The two concerns are separable because nothing about tenant routing needs a credential bound to a tenant host. What is NOT available is their intersection — a passkey ceremony per tenant — and chasing it is the wrong instinct twice over: the build is **one per run** and happens **before** the phases, so a single bundle cannot carry a different `NEXT_PUBLIC_*` per host (which is exactly why §1.7 refuses a phase that declares one), and even if it could, pinning the origin to whatever `Host` arrived is the property Invariant 2 exists to deny.

> The derived config is written to `node_modules/.cache/timekast-e2e/playwright.config.cjs` — inside `node_modules/` because `.gitignore` is frozen at bootstrap in a derivative, so a generated file at the project root would sit in `git status` for ever with no way for `factory update` to heal it. `.cjs`, not `.ts`, because Playwright's TypeScript transform skips everything under `node_modules/`; not `.js`, because a derivative with `"type": "module"` would load it as an ES module. It is regenerated every run — never edit it, and never commit anything that reads it.

---

## 3. Dynamic auth setup — per role, zero maintenance

`tests/e2e/auth.setup.ts` loops over ALL roles from `@/config/roles`:

```ts
// tests/e2e/auth.setup.ts (actual)
import { test as setup, expect } from '@playwright/test';
import { createTestUser } from '../fixtures/auth';
import { ROLES } from '@/config/roles';
import { AUTH_DIR, AUTH_FILES, AUTH_META_FILE } from '../fixtures/auth-files';
import fs from 'fs';

setup.describe('Auth Setup', () => {
  setup('create shared test users and save auth state', async ({ browser }) => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const users: Record<string, { id: string; email: string; plainPassword: string }> = {};

    for (const role of Object.values(ROLES)) {
      const user = await createTestUser({
        role,
        email: `e2e-${role}-${Date.now()}@test.com`,
        name: `E2E ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      });
      users[role] = { id: user.id, email: user.email, plainPassword: user.plainPassword };

      // A FRESH CONTEXT PER ROLE — never a shared page + clearCookies().
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.goto('/login');
        await expect(page.locator('#email')).toBeVisible(); // web-first, no networkidle (R8)
        await page.fill('#email', user.email);
        await page.fill('#password', user.plainPassword);
        await page.click('button[type="submit"]');
        await page.waitForURL(/dashboard|settings/, { waitUntil: 'domcontentloaded' });

        await context.storageState({ path: AUTH_FILES[role] });
      } finally {
        await context.close();
      }
    }

    fs.writeFileSync(AUTH_META_FILE, JSON.stringify(users, null, 2));
  });
});
```

> **Why a fresh context per role, and not `clearCookies()`.** Clearing the jar empties the cookies but leaves the page parked on `/dashboard` with a live in-memory session, so the next `goto('/login')` is answered with a redirect back — `#email` never appears and every role after the first dies on a selector timeout. The failure reads as "the login page is broken" while the page snapshot shows the PREVIOUS role's dashboard. A new context has its own jar, storage and process state; that is the only isolation that holds.

**`AUTH_FILES` is generated, not hand-maintained:**

```ts
// tests/fixtures/auth-files.ts (actual)
export const AUTH_FILES = Object.fromEntries(
  Object.values(ROLES).map((role) => [role, path.join(AUTH_DIR, `${role}.json`)])
) as Record<Role, string>;
```

> Add a role to `@/config/roles` → `auth.setup` creates a user + `storageState` for it → `AUTH_FILES[newRole]` works in specs. **Zero maintenance.**

---

## 4. `createTestUser` — the real factory

```ts
// tests/fixtures/auth.ts (actual signature)
export async function createTestUser(overrides: TestUserOverrides = {}) {
  // TestUserOverrides = Partial<Omit<typeof users.$inferInsert, 'role'>> & { role?: Role }
  // `role` is narrowed to Role from @/config/roles, so a renamed role breaks at typecheck
  const email = overrides.email || `test-${crypto.randomBytes(4).toString('hex')}@example.com`;
  const password = overrides.password || 'Test1234!';
  const hashedPassword = await hashPassword(password);
  const humanId =
    overrides.humanId || `USR-T${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: 'Test User',
      password: hashedPassword,
      role: ROLES.USER,
      emailVerified: new Date(),
      humanId,
      ...overrides,
    })
    .returning();

  return { ...user, plainPassword: password }; // plainPassword for UI login
}

export async function cleanupTestUser(userId: string) {
  /* deletes tokens + user */
}
```

### `own-session.ts` — the factory's companion for specs that MUTATE an account

```ts
// tests/fixtures/own-session.ts
seedOwnUser(role: Role, label: string): Promise<OwnUser>   // via createTestUser; label lands in the email
openOwnSession(browser, user): Promise<BrowserContext>     // real /login form, empty storageState
cleanupOwnUser(user): Promise<void>                        // → cleanupTestUser
```

Why it exists is R4's rule; what it does is the three lines above. Two details that are load-bearing:

- **It starts from an empty `storageState` on purpose.** A context created by hand inherits the spec's `test.use({ storageState })`, and a shared role session already in the jar turns the login into a no-op that lands on someone else's account — the exact confusion the fixture removes.
- **It is NOT a `test.extend` fixture.** The specs that need it open their context inside the test body and already own its lifecycle; a Playwright fixture would add a second way of getting a session to files that only need one.

```ts
const user = await seedOwnUser(ROLES.ADMIN, 'my-spec');
let ctx: BrowserContext | undefined;
try {
  ctx = await openOwnSession(browser, user); // the seed exists already — the login can still fail
  /* … mutate freely: it is your account … */
} finally {
  await ctx?.close();
  await cleanupOwnUser(user);
}
```

**Use in specs:**

```ts
test('admin creates then deletes a user', async ({ page }) => {
  const target = await createTestUser({ role: ROLES.USER, name: 'Target' });
  try {
    await page.goto('/settings/users');
    // ...
  } finally {
    await cleanupTestUser(target.id);
  }
});
```

---

## 5. RBAC route tests — parametrized from SSOT

`tests/e2e/rbac-routes.spec.ts` is **fully driven by `ROUTE_ACL` + `ROLES`**. Adding a route to the ACL or a role to the config auto-expands coverage.

```ts
// tests/e2e/rbac-routes.spec.ts (actual shape)
import { AUTH_FILES } from '../fixtures/auth-files';
import {
  TESTABLE_ROLES, // all roles except super_admin
  PROTECTED_ROUTES, // Object.entries(ROUTE_ACL)
  getBlockedRoutes, // filter !isRouteAllowed(path, role)
  getAllowedRoutes, // filter isRouteAllowed(path, role)
  hasProtectedRoutes, // true if ROUTE_ACL has entries
} from '../fixtures/rbac';

// Skip cleanly if SK default (empty ROUTE_ACL)
test.skip(!hasProtectedRoutes(), 'No protected routes in ROUTE_ACL — RBAC tests skipped');

test.describe('RBAC Route Access', () => {
  for (const role of TESTABLE_ROLES) {
    const blocked = getBlockedRoutes(role);
    if (blocked.length === 0) continue;

    test.describe(`${role}: blocked routes`, () => {
      test.use({ storageState: AUTH_FILES[role] });
      for (const route of blocked) {
        test(`should redirect ${role} away from ${route.label}`, async ({ page }) => {
          await page.goto(route.path);
          await page.waitForURL(/\/error\?error=AccessDenied/, { timeout: 10_000 }); // redirect, not 403
          expect(page.url()).not.toContain(route.path);
        });
      }
    });
  }

  // ... allowed routes loop + super_admin smoke test
});
```

**Design contract:**

| Decision                                       | Why                                           |
| ---------------------------------------------- | --------------------------------------------- |
| `TESTABLE_ROLES` excludes super_admin          | Always bypasses ACL; tested as separate smoke |
| Proxy `authorized()` redirects to `/error?error=AccessDenied` | UX: better than 403; never `/dashboard` (a restricted `/dashboard` would loop) |
| `test.skip` when ACL empty                     | SK ships with empty ACL — no flakes           |
| `ROUTE_ACL` is SSOT                            | Add a route → tests expand automatically      |

---

## 6. Stability rules — 9 hard rules (grounded)

> Violating any → flaky suite.

### R1: Semantic selectors only

```
❌ page.locator('.btn-primary')
❌ page.locator('div > div > button')
✅ page.getByRole('button', { name: 'Submit' })
✅ page.getByLabel('Email')
```

### R2: Randomize every column under a globally unique index — inside the fixture

**The criterion is the index, not the name.** Not "readable identifiers", not "the id field": **any column that participates in a globally unique index** must carry a random value in test data. Two specs that seed the same literal for such a column collide, and the collision is not local — it surfaces as a constraint violation in whichever of the two happens to run second, on a machine where nobody edited either spec.

**And it belongs in the FIXTURE, not in the caller.** A spec has no business knowing which columns are unique at the schema level; the fixture does, and it is the only place where the rule is satisfied once for every consumer. A fixture that requires each caller to pass a random value is a rule that holds until somebody writes the next spec.

`createTestUser` is the worked example, and `humanId` is **one case, not the scope**: it defaults both `email` and `humanId` to random values, so a caller that passes neither cannot collide.

```ts
// tests/fixtures/auth.ts — the rule lives HERE, so no spec has to remember it
const email = overrides.email || `test-${crypto.randomBytes(4).toString('hex')}@example.com`;
const humanId =
  overrides.humanId || `USR-T${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
```

```
❌ humanId: 'USR-0001'                     // sequential — collides with seeds and parallel workers
❌ id: 9_000_001
❌ endpoint: 'https://example.test/hook'   // not an "identifier", but under a unique index ⇒ same bug
✅ humanId: `USR-T${crypto.randomBytes(4).toString('hex').toUpperCase()}`
✅ …defaulted inside the fixture, so a spec that passes nothing is already correct
```

> Measured on a derivative: the team followed the old wording faithfully — randomizing keys, digests and service identifiers — and still collided, on a plain URL column nobody thought of as an identifier. With a database branch per phase it would never have hurt; on the shared branch this runner creates (§1) it fails on the first run.

### R3: Independent tests

Each test creates + cleans up its own data. No shared state between specs (except storageState, which is read-only auth).

```ts
let target: Awaited<ReturnType<typeof createTestUser>>;
test.beforeEach(async () => {
  target = await createTestUser();
});
test.afterEach(async () => {
  await cleanupTestUser(target.id);
});
```

### R4: shared sessions are READ-ONLY — mutate an account, seed your own

```
❌ Inside a *.spec.ts: await page.goto('/login'); await page.fill(...)
✅ test.use({ storageState: AUTH_FILES[role] });                    // reads
✅ const user = await seedOwnUser(ROLES.ADMIN, 'my-spec');          // mutations
   const ctx = await openOwnSession(browser, user);
```

UI login lives in exactly two places: `auth.setup.ts` (the shared per-role sessions) and `tests/fixtures/own-session.ts` (a session of the spec's own). A spec never types into `/login` by hand.

**The line between them is mutation, not convenience.** `auth.setup.ts` logs in ONE user per role and hundreds of tests ride those sessions — which works precisely because they only *read*. A spec that CHANGES the account it rides (enrolls a factor, registers a passkey, plants or revokes a grant, links a provider, changes the email) breaks that contract for everyone else: with `fullyParallel` it will eventually run beside another spec asserting on the same account. Under one worker those mutations serialized and cancelled out; at four they collide, and the failure lands on the *other* spec.

Two shapes, both in `own-session.ts` (§4):

- The spec **navigates as** the mutated user → `seedOwnUser` + `openOwnSession`.
- The spec **acts on** a user from a shared admin session (grant a role, revoke access) → `seedOwnUser` alone, no second login: the target is its own, the driver stays shared.

Either way `cleanupOwnUser` in a `finally`, and if the mutation writes to a table that does not cascade, delete those rows first (R9's cleanup order).

**Role switching mid-test** — use a fresh context:

```ts
const userCtx = await browser.newContext({ storageState: AUTH_FILES.user });
const userPage = await userCtx.newPage();
try {
  /* test from user POV */
} finally {
  await userCtx.close();
}
```

### R5: Deterministic factory, not production data

```
❌ const users = await db.select().from(users); // whatever is there
✅ const user = await createTestUser({ role: ROLES.ADMIN, name: 'Test Admin' });
```

### R6: No conditional flake-skips

```
❌ test.skip(process.env.CI, 'flaky on CI');
✅ test.skip(!hasProtectedRoutes(), 'No ROUTE_ACL configured');  // structural
```

Structural skips are fine (feature not configured → nothing to test). Runtime flake-skips hide bugs.

### R7: Dialog handlers before the trigger

```ts
// Native browser dialog
page.on('dialog', (dialog) => dialog.accept());
await page.click('#delete-btn');

// Radix AlertDialog (the common case in this repo — via ConfirmDialog)
await page.click('#delete-btn');
await page.locator('[role="alertdialog"]').waitFor();
await page.getByRole('button', { name: 'Eliminar' }).click();
```

### R8: Hydration-aware waits — web-first assertions, never `networkidle`

Next.js App Router SSR renders HTML before React hydrates. Clicking a button before hydration → silent no-op. The fix is to wait for the element to be **actionable**, not for the network to go quiet.

```
❌ await page.goto('/users');
❌ await page.click('#create-btn');            // may fire before hydration
❌ await page.goto('/login', { waitUntil: 'networkidle' });
❌ await page.waitForSelector('#email', { timeout: 30_000 });

✅ await page.goto('/login');
✅ await expect(page.locator('#email')).toBeVisible();   // resolves the moment it is
✅ await page.fill('#email', ...);

// For post-login navigation:
✅ await page.waitForURL(/dashboard/, { waitUntil: 'domcontentloaded' });
```

> 🔴 **`networkidle` is banned.** Playwright's own docs discourage it, and this app never goes quiet: the passkey conditional-UI call, notification polling and the service-worker registration all keep requests in flight. The "cold-compile safe" argument for it does not hold: the runner serves a production build (§1.1), so nothing compiles at request time. Worse, it masks: it makes every navigation wait for a condition unrelated to what the test needs, so a page that never renders looks the same as a page that is merely busy.

| When                    | Use                                              |
| ----------------------- | ------------------------------------------------ |
| Any navigation          | plain `page.goto(url)`                           |
| Interaction-ready check | `await expect(locator).toBeVisible()`            |
| Post-auth redirect      | `waitForURL(re, { waitUntil: 'domcontentloaded' })` |
| Never                   | `networkidle` · `waitForTimeout(n)` for logic     |

Assertion ceiling lives in `playwright.config.ts` (`expect: { timeout: 10_000 }`), not sprinkled per call. Keep it **at or above** `actionTimeout`, or an assertion gives up before the action it guards.

### R9: Serial mode for CRUD flows

```ts
test.describe.configure({ mode: 'serial' }); // CRUD on the same entity
test.describe.configure({ mode: 'parallel' }); // read-only, independent
```

`fullyParallel: true` is the default; opt into `serial` per describe when tests modify shared entity state.

> 🔴 **`fullyParallel: true` splits ONE FILE across workers, and each worker runs its own `afterAll`.** A cleanup keyed on a literal shared by the whole file — `const MARKER = 'my-suite'` + `delete where email like %MARKER%` — lets the first worker to finish delete the rows another is still driving. It surfaces far from the cause: a foreign-key violation on an unrelated insert, or a session that stops working mid-test. **Delete by the ids this worker created, never by a predicate:**
>
> ```ts
> const createdUserIds: string[] = []; // module state — per worker, like afterAll
>
> const user = await createTestUser({ email: markedEmail() });
> createdUserIds.push(user.id);
>
> test.afterAll(async () => {
>   if (createdUserIds.length === 0) return;
>   await db.delete(stepUpGrants).where(inArray(stepUpGrants.userId, createdUserIds)); // non-cascading children first
>   await db.delete(users).where(inArray(users.id, createdUserIds));
> });
> ```
>
> **Scoping the marker per worker index is NOT enough** — the kit shipped that and it still widened. Playwright's `workerIndex` is unique and **increasing**: every worker restart (i.e. every retry) mints a new one, so `like('%my-suite-w1%')` also matches `w10`, `w11`… exactly when a run is accumulating retries — when the damage is hardest to read. Keep the marker in the email as a forensic label; just never let it decide who deletes.
>
> Same rule as R2 (hex-random ids) applied to the CLEANUP side: a test may only delete what it created. And the row a factory did NOT create — one an endpoint under test inserted — is registered by hand (`if (row) createdUserIds.push(row.id)`) or it outlives the run.
>
> **Cleanup order:** children that do not `onDelete: cascade` first (scheduled reports and their recipients, saved analyses, conversations, audit logs, OAuth authorization codes and grants), then the user. Factors, step-up grants and `accounts` cascade with the row.

---

## 7. Test organization (real tree)

```
tests/
├── e2e/
│   ├── auth.setup.ts          # Project "setup" — iterates ROLES
│   ├── rbac-routes.spec.ts    # Parametrized from ROUTE_ACL × ROLES
│   ├── user-admin.spec.ts     # Feature specs
│   ├── invite.spec.ts
│   └── password-reset.spec.ts
├── fixtures/
│   ├── auth.ts                # createTestUser, cleanupTestUser, createPasswordResetToken
│   ├── auth-files.ts          # AUTH_FILES map (generated from ROLES)
│   ├── own-session.ts         # seedOwnUser / openOwnSession / cleanupOwnUser (§4, R4)
│   └── rbac.ts                # PROTECTED_ROUTES, getBlockedRoutes, getAllowedRoutes
├── .auth/                     # storageState JSONs + users.json (GITIGNORED)
├── global-setup.ts            # Playwright global — arms the disposable-DB guard (§1.6)
└── global-teardown.ts         # Cleanup hook
```

> `tests/.auth/` must be gitignored. The runner + setup regenerate it every run.

---

## 8. Anti-patterns (battle-tested)

| ❌ Don't                                  | ✅ Do                                           | Impact                           |
| ----------------------------------------- | ----------------------------------------------- | -------------------------------- |
| Test CSS classes or DOM structure         | `getByRole` / `getByLabel`                      | Survives refactors               |
| `page.waitForTimeout(3000)` to "be safe"  | `waitForSelector` / `waitForURL`                | Eliminates ~80% of flakes        |
| Hand-roll a login in a spec               | `test.use({ storageState: AUTH_FILES[role] })`, or `openOwnSession` when you mutate (R4) | 3-5s saved per test |
| Mutate the account of a shared session    | `seedOwnUser` — your mutation, your user (R4)   | The collision never happens      |
| Skip cleanup                              | `afterEach` + `cleanupTestUser`                 | Tests stay independent           |
| Clean up by marker / `like`               | Delete the ids this worker created (R9)         | Never deletes a sibling's rows   |
| Ignore a flake ("it's fine")              | Fix root cause — hydration, selector, or data   | Flakiness compounds              |
| A literal value on a globally unique column | Randomize it **in the fixture** (R2)          | Avoids seed / parallel collision |
| Add `webServer` to `playwright.config.ts` | Let `e2e-runner.ts` start the server            | Config evaluated before setup    |
| Run CRUD in parallel                      | `test.describe.configure({ mode: 'serial' })`   | Less resource contention         |
| Hardcode a port in a spec or fixture      | Use `baseURL` (relative paths in `page.goto`)   | Two checkouts can run at once    |

---

## 9. Debugging workflow

When an E2E fails:

1. **Check the HTML report** — `pnpm exec playwright show-report` opens the last run with traces for retries.
2. **Isolate the spec** — `pnpm test:e2e --project=chromium tests/e2e/foo.spec.ts`. The build is reused when nothing that feeds it changed (§1.3), so this loop costs a branch and a server, not a compile.
3. **Run in UI mode** — `pnpm test:e2e --ui --project=chromium tests/e2e/foo.spec.ts` — step through actions, inspect DOM at each step. The `--project=` is required (§1).
4. **Check storageState freshness** — if auth.setup failed mid-way, `tests/.auth/` may be partial. Delete and rerun.
5. **Neon branch stuck?** — `cleanupZombieBranches()` in `scripts/tools/neon-branch.ts` runs at every startup, and it deletes only what it can prove is dead. Two independent proofs, tried in that order:
   - **Owner gone (exact).** The branch name IS the lease: `e2e-<epoch-ms>-<hostTag>-<pid>`. When the tag matches THIS machine and that PID is no longer alive, the branch is reclaimed immediately, at any age. A live PID protects it — up to a 6h ceiling, since the OS recycles PIDs.
   - **Age (statistical, the fallback).** No lease, or a lease from another machine: a PID means nothing off its own host, so the only safe signal left is age — **30 min**. That is the deliberate trade: a branch orphaned by ANOTHER machine can linger up to half an hour, because the opposite error (deleting the database of a run in flight) is silent and far costlier.
     So: running the runner once cleans up your own orphans right away; someone else's need the 30 min, or a manual delete in the Neon UI.
   - **Exception — a branch you kept.** `--keep-branch` names it `e2e-keep-…` and the sweep skips that mark outright (§1), so it is never reclaimed by either proof. If an `e2e-keep-…` branch is lingering, that is the flag working; delete it in the Neon Console.
   - **`⚠️ The zombie-branch sweep did not run`** — the LISTING failed (timeout, network, or Neon refusing with a status the message names), so nothing was swept. Never fatal, and nothing is missing from that run: the sweep is housekeeping for OTHER runs' leftovers. It is printed twice — once when it happens and again after the verdict — because it happens at minute zero of a seven-minute suite, and a warning nobody reads is the same as no warning. If it repeats, the credential is the first suspect (item 15) — and the leftovers are billed for as long as they exist, so reclaim them in the Neon Console once the key works again.
6. **"Element not visible" on a button that's clearly there** — hydration timing. Wait for the element to be ACTIONABLE (`await expect(locator).toBeVisible()`) before interacting. Not `networkidle`: R8 bans it, and this app never goes quiet anyway.
7. **`Server did not start within N seconds`** — NOT a slow route. Since the runner serves a precompiled build (§1.1), nothing is compiled at request time, so this means the process genuinely failed to boot: read the runner's output above it (the exit-before-ready watcher prints the real code/signal). `N` is the CI-aware ceiling of §1.4 — 60 locally, 120 on CI — and the runner prints it while waiting. `next start` has no one-instance-per-project rule, so **the e2e suite coexists with `pnpm dev`** (different port).
8. **`Port N is already taken (PID …)`** — a different failure, and a deliberate stop: the runner **does not kill a process it did not start** (§1). It names the PID and prints the command to free it, so the decision is yours. ⚠️ Multi-agent: if another session is already running e2e on that port **from another checkout**, yours stops without touching its server — run yours elsewhere with `E2E_PORT=<other> pnpm test:e2e`. If the other run is in the SAME checkout, another port does not help (shared `.next/` + stamp, §1) — wait for it. Between its OWN phases the runner does kill its own server tree and waits for the port to be released; that hand-off never touches a foreign process.
9. **`⚠️ Phase B (MFA) skipped`** — expected on derivatives born before the kit's MFA feature: the MFA e2e phase depends on frozen src-side artifacts (the `mfa` project in the Playwright config, `*.mfa` specs) that `factory update` never ships. The runner detects capability from the project's own config — resolved through the same six candidate names Playwright itself resolves, so a `.js` config is read exactly like a `.ts` one — and runs only the base phase. Not an error, nothing to fix. An explicit `--project=mfa` on such a project fails fast — before the branch, the migration and the build — instead of silently passing.
    ⚠️ **The tolerance stops there, and deliberately** (§1.7): only a NON-required phase of the KIT is skipped this way. A phase your own `e2e.project.ts` declares whose project the config does not define **fails the run**, naming it — you asserted it exists. And if resolution ever leaves nothing runnable, the run fails instead of reporting green over an empty list of results.
10. **Not sure which flags the runner owns?** — `pnpm test:e2e --help` prints the contract (§1) and exits without creating or compiling anything.
11. **`Error: No tests found`, or a spec file that reports zero tests** — the spec died while being LOADED, and the throw printed above it is the real cause. The usual one is a compile-time guard (`server-only` / `client-only`) reached transitively through a fixture or a query helper (§1.5): the runner stubs both, so seeing this means the stub did not reach the process — check that `NODE_OPTIONS` in the Playwright invocation carries `--import=…/compile-guard-init.mjs`. The case to check first is an invocation that did not come from the runner at all (a script of your own shelling `playwright test`); per §1.6 that path aborts on the guard first, which is a much clearer message than this one. **The one place this message is NOT a load error:** without the skip, a run with a spec path or a `--grep` would print it, red, for every phase whose project held no matching test (§1, "A filter reaches every phase"). The runner skips those phases with `⏭️  Skipped — the filter matches no test of project '…'`; if you still see `No tests found` under a filter, the phase listed zero tests **without** that line — which is this item, a spec dying at load, and the throw above it is the cause.
    - **`❌ The filter matched no test in any phase`** — every phase was skipped, so nothing ran and the run is red on purpose. Check the spec path (relative to the checkout: `tests/e2e/x.spec.ts`) or the pattern; on a pre-MFA derivative remember `mfa` is not a phase at all (item 9), so a `*.mfa.spec.ts` filter has nowhere to land.
12. **`E2E aborted: this run did not come from the E2E runner`** (or `…DATABASE_URL is not the throwaway branch this run created`) — the disposable-database guard (§1.6). Not a misconfiguration: something invoked Playwright around the runner, so there is no ephemeral branch and the specs would have written wherever `DATABASE_URL` points. Run it as `pnpm test:e2e …`. The remedy is the runner and only the runner: the guard is an **anti-footgun** (§1.6), so it closes the accidental path, not the deliberate one — copying `DATABASE_URL` into the marker satisfies the equality, which is exactly the command this entry does not hand you. If you find yourself reaching for it, the thing you want is `pnpm test:e2e --project=chromium <spec>`: same fast loop, with a throwaway branch under it.
13. **`--config=node_modules/.cache/timekast-e2e/playwright.config.cjs` in the invocation** — that is the derived config (§2), not a stray file: the project's own config plus this run's port. It is rewritten on every run, so editing it changes nothing; edit `playwright.config.ts`. An explicit `--config` you type yourself still wins, because the runner's goes first on the command line and Playwright keeps the last one.
14. **Lines prefixed `❌` or `⚠️` while the server boots, in a GREEN run** — the runner mirrors the server's stderr, classified by what the line says it is. A structured log line (the kit's logger emits JSON) is filed by its own `level`: `error` / `fatal` print with `❌`, everything else is silent — a `level: "warn"` CSP report whose document URL carries `?error=CredentialsSignin` (an auth spec produces that on purpose) is a warning and prints nothing, whatever its data contains. A line that is NOT structured and mentions "error" prints with `⚠️`: the runner surfaced it but did not establish it is an error, so the prefix does not claim so. Printing `❌` for any line containing the substring would put dozens of them in every green run and teach readers to skip the one that matters.
15. **`HTTP 401` from Neon — on the branch create, the branch listing, or the zombie sweep** — the `NEON_API_KEY` of your local environment (the vault's `develop:/ci`, which `local` imports; your `.env.local` without a vault) is not a valid credential any more. Not a permission problem and not a Neon outage: 401 is "I don't know this key". It is what a rotated or revoked key looks like, and it hits every call at once (that is the tell — a permissions problem fails one endpoint, not all of them).

    **The fix is one command, in the project's root:**

    ```bash
    npx @timekast/factory@latest provision --services=neon --remint
    ```

    It re-issues the key and replaces every copy. With a vault it writes the new key to the vault's `develop:/ci`, which is what your machine reads, and the vault's sync carries it to the three GitHub Secrets the CI workflow reads (`NEON_API_KEY`, `NEON_PROJECT_ID`, `DATABASE_URL`) — one writer per destination (`fx-secrets-vault §7`). Without a vault it re-pushes those three secrets itself and rewrites your `.env.local`. If it answers that there is no `.timekast/provision.json`, run `provision --adopt` first and repeat.

    🔴 **It ROTATES, it does not verify.** Running it on a project whose key is fine invalidates every copy of the old one — the key is one per project: a teammate's `.env.local` without a vault; with a vault everyone reads `develop:/ci`, but a run already in flight still holds the old key. So reach for it when you actually see the 401, not as a precaution.

    **What this key is, so the next surprise is not one:**

    - It is **scoped to this project alone**. A `404` against any other Neon project is the scope working, not a fault. It also cannot delete its own project nor mint further keys.
    - It is **not** the org key that `provision` used. That one lives in the org rail of the secrets vault (`rail-timekast`, read with the person's session — `fx-secrets-vault §3`), never travels, and is the only one that can issue this one.
    - CI and your machine hold the **same** project-scoped key — CI as a repo secret, you through the vault's `develop:/ci` (the gitignored `.env.local` without a vault). So a 401 locally and a red E2E in CI usually have the same single cause, and one `--remint` fixes both.
16. **`the Playwright config points this run OFF this machine`** — the host check of §2, and it fired before anything was created (no branch, no build, no server). The `baseURL` of `playwright.config` names a host that does **not** resolve to loopback — the usual shape is a staging default, `process.env.BASE_URL ?? 'https://staging…'` — so the suite would have driven that origin, in the clear, with the credentials `auth.setup.ts` seeds, while the local server idled. Two fixes and one escape: point `baseURL` at `localhost`, at anything under `.localhost`, or at a name you mapped to `127.0.0.1` in `/etc/hosts`; or, if the remote host is deliberate, declare it with `E2E_ALLOW_REMOTE_HOST=1 pnpm test:e2e` and the run proceeds behind a banner. The same message with `could not be resolved` means the name answered nothing at all — usually a `/etc/hosts` entry you meant to add, or a VPN that is down.

---

_Cross-reference: `sk-testing-nextjs` for Vitest unit + component tests. `sk-security` for the real `ROUTE_ACL` shape that drives RBAC specs._
