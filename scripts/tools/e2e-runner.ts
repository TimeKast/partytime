#!/usr/bin/env npx tsx
/**
 * E2E Test Runner with Neon Branch Isolation
 *
 * This script ensures complete database isolation for E2E tests by:
 * 1. Creating a temporary Neon branch
 * 2. Migrating it to the current schema (skipped where no migrations dir exists)
 * 3. Building the app once (production) and serving it with `next start`
 * 4. Running Playwright tests against that precompiled server
 * 5. Cleaning up (stopping server + deleting branch)
 *
 * The server is the PRODUCTION build, not `next dev` — see startServer for the
 * measurements behind that choice.
 *
 * Usage:
 *   pnpm test:e2e                    # Run all tests
 *   pnpm test:e2e tests/e2e/register.spec.ts  # One spec — phases it cannot reach are skipped
 *   pnpm test:e2e --headed           # Run with browser visible
 *   pnpm test:e2e --build            # Force a rebuild, ignoring the input stamp
 *   pnpm test:e2e --keep-branch      # Leave the throwaway Neon branch alive on exit
 *   pnpm test:e2e --help             # The runner's own flags (see RUNNER_FLAGS)
 *
 * The flags the runner CONSUMES live in `RUNNER_FLAGS`, which is what `--help` prints;
 * anything else on the command line is forwarded to Playwright untouched.
 *
 * Why a wrapper script?
 *   Playwright evaluates config BEFORE globalSetup runs, so the webServer
 *   would start with the original DATABASE_URL. This wrapper ensures the
 *   branch is created BEFORE any server starts.
 *
 * Shape of this file: the pure pieces (port resolution, phase selection, per-phase
 * env, build stamp) are EXPORTED functions and `main()` is wiring that calls them.
 * Nothing runs on import — the flow starts only under the entry-point guard at the
 * bottom. That is what lets a test import a piece without creating a Neon branch,
 * starting a server or invoking Playwright.
 */

import dotenv from 'dotenv';
import { spawn, ChildProcess, execSync } from 'child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { promises as dns } from 'dns';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { Pool } from '@neondatabase/serverless';
import { DISPOSABLE_BRANCH_ENV_KEY } from './e2e-guard';
import { passthroughReason, readVaultBlock, VAULT_WRAPPER_MARKER } from './with-vault.mjs';
import {
  BUILD_SOURCE_DIRS,
  BUILD_SOURCE_FILES,
  EXTRA_BUILD_INPUTS_KEY,
  NON_BUILD_INPUT_DIRS,
  readExtraBuildInputs,
  resolveExtraBuildInputs,
  type ExtraBuildInputs,
  type RejectedBuildInput,
} from './e2e/build-inputs';
import {
  createE2EBranch,
  deleteE2EBranch,
  validateNeonCredentials,
  cleanupZombieBranches,
} from './neon-branch';

/**
 * A map of environment variables the runner READS from.
 *
 * Deliberately looser than `process.env`'s own type: Next augments `ProcessEnv` with a
 * REQUIRED `NODE_ENV`, and none of the functions below read it — demanding it would only
 * force every test fixture to carry a field that has no bearing on the result.
 */
export type EnvVars = Record<string, string | undefined>;

/**
 * The variables the runner PINS on a child process, to be layered over the inherited
 * environment (`{ ...process.env, ...overrides }`) at the spawn.
 *
 * Returning the overrides rather than the merged result keeps these functions honest:
 * what they compute is exactly what this run decides, with none of the host's environment
 * mixed in. That is what makes them assertable — and it is also the precise input
 * E2E-007's stamp needs under "the env vars the runner injects".
 */
export type EnvOverrides = Record<string, string>;

/** Port fallback when neither the environment nor `package.json#ports` names one. */
export const DEFAULT_E2E_PORT = 3005;

/**
 * How long the runner waits for a phase's server to answer — CI gets a higher ceiling than a
 * local machine. Which one applies is `resolveServerStartupTimeout`.
 *
 * WHAT IS BEING WAITED ON, and why it is not compilation: `next start` boots a PRECOMPILED
 * build, so readiness is just "the process bound the port and answered once" — normally under
 * a second (the `Ready in` line). Unlike `next dev`, nothing is compiled at request time, so
 * neither ceiling is headroom for a slow route. If one trips, the process genuinely failed to
 * boot.
 *
 * The ceiling is there for a LOADED MACHINE — the build that just ran may still be flushing,
 * and a CI runner is resource-constrained. That is also why one number cannot serve both:
 *
 *   · CI keeps the two minutes, because CI is the case that number was always for. A false
 *     timeout here is the expensive kind: it burns a whole billed run (`sk-e2e §1.2`) and it
 *     lands on the fleet, not on one developer who can simply run it again.
 *   · LOCAL is half of it. On a developer machine a precompiled server that has not answered
 *     in a minute has genuinely failed to boot — and the exit-before-ready watcher below
 *     usually names the real cause long before either ceiling is reached. The flat value made
 *     the local loop wait an extra minute to be told something it already knew.
 *
 * ℹ️  `neon-branch.ts` derives `ZOMBIE_AGE_THRESHOLD_MS` from the runner's worst-case waiting
 * budget and cites two minutes for this constant. Raising the CI ceiling means revisiting that
 * derivation; lowering the local one only ever makes it safer.
 */
export const SERVER_STARTUP_TIMEOUT_CI = 120000; // 2 minutes — resource-constrained runner
export const SERVER_STARTUP_TIMEOUT_LOCAL = 60000; // 1 minute — precompiled boot, loaded machine
const SERVER_CHECK_INTERVAL = 500; // 0.5 seconds
const PORT_FREE_TIMEOUT = 15000; // 15s to confirm the previous phase's server freed the port

/**
 * A deterministic MFA encryption key for E2E (base64url-encoded 32 bytes), used ONLY
 * when MFA_ENCRYPTION_KEY is absent from the environment. See `resolveMfaEncryptionKey`.
 */
const FALLBACK_MFA_ENCRYPTION_KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc';

/** Drizzle's own bookkeeping table — schema + table default of `PgDialect.migrate()`. */
const DRIZZLE_MIGRATIONS_TABLE = 'drizzle.__drizzle_migrations';

// ---------------------------------------------------------------------------
// Environment loading — the ONLY side effect of running this file, and it is
// deliberately NOT at module top level.
// ---------------------------------------------------------------------------

/**
 * Load `.env.local` into `process.env`.
 *
 * This used to run at module top level, which meant merely IMPORTING the runner
 * mutated the importer's `process.env` — every test in the repo would then see the
 * developer's `.env.local`, and a test of `resolveE2EPort` would silently depend on
 * whether that file happens to set `E2E_PORT`. It now runs only under the entry-point
 * guard at the bottom, i.e. only when this file is executed as the `pnpm test:e2e`
 * entry point, before `main()`.
 *
 * Ordering is preserved: everything that reads the environment does so INSIDE a
 * function called from `main()` (`resolveE2EPort`, `resolveMfaEncryptionKey`,
 * `buildServerEnv`, …), never in a module-level constant, so all of them still observe
 * a fully loaded `.env.local`. The imports above are evaluated before this call now,
 * which is safe because none of them read the environment at module level — the Neon
 * helpers read it inside `getConfig()`, per call.
 */
function loadRunnerEnv(): void {
  dotenv.config({ path: resolve(process.cwd(), '.env.local') });
}

/**
 * Where the runner's environment comes from:
 *   · `dotenv`  — a repo without a `vault` block: `.env.local`, as before.
 *   · `vault`   — a repo in the vault whose environment is already settled: the wrapper injected
 *                 it (`TK_VAULT_INJECTED`), or the wrapper would pass through (CI / Vercel /
 *                 Railway / `TK_VAULT=off`). `.env.local` is NOT read: in a vault repo it is a
 *                 leftover, and its loose keys would slip in beside the vault's.
 *   · `reexec`  — a repo in the vault, run WITHOUT the wrapper (`tsx scripts/tools/e2e-runner.ts`
 *                 straight, or by an agent): the runner relaunches itself through
 *                 `with-vault.mjs`, so a local run always reads the vault, however it was started.
 *
 * Exported for tests: pure — the vault block and the environment are inputs.
 */
export function runnerEnvSource(options: {
  hasVaultBlock: boolean;
  env: EnvVars;
}): 'dotenv' | 'vault' | 'reexec' {
  if (!options.hasVaultBlock) return 'dotenv';
  const injected = options.env[VAULT_WRAPPER_MARKER];
  if (injected !== undefined && injected !== '') return 'vault';
  if (passthroughReason(options.env) !== null) return 'vault';
  return 'reexec';
}

/**
 * Relaunch this run through the vault wrapper, mirroring its exit. `tsx` is taken from the
 * project's own `node_modules/.bin` when present, so the relaunch does not depend on how the
 * first one found it.
 */
function reexecThroughVault(args: readonly string[]): void {
  const cwd = process.cwd();
  const localTsx = resolve(cwd, 'node_modules/.bin/tsx');
  const child = spawn(
    process.execPath,
    [
      resolve(cwd, 'scripts/tools/with-vault.mjs'),
      existsSync(localTsx) ? localTsx : 'tsx',
      resolve(cwd, 'scripts/tools/e2e-runner.ts'),
      ...args,
    ],
    { stdio: 'inherit' }
  );
  // The child owns the run (and its branch cleanup); this process only relays the signals.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

// ---------------------------------------------------------------------------
// Port + URL
// ---------------------------------------------------------------------------

/** The `ports` block of `package.json` (SSOT for the default E2E port). */
export interface PackagePorts {
  /**
   * A number pins the port for the whole project. `null` is a SIGNAL, not an absence: it is
   * what the kit ships (and what `factory update` writes over the old shipped `3006`), and
   * it means "this project has no fixed port — derive one from the checkout" (see
   * `resolveE2EPort`). An ABSENT key is deliberately NOT the same thing.
   */
  e2e?: number | null;
}

/**
 * The port range this runner derives from, when nothing pins one.
 *
 * WHY THESE BOUNDS, and not "something high":
 *   · UPPER — 32767 is the last port BELOW the lowest ephemeral floor observed in the wild.
 *     Linux's default `net.ipv4.ip_local_port_range` starts at 32768; macOS and Windows
 *     start higher still (49152). Anything the kernel may hand out as an ephemeral source
 *     port is a port some unrelated connection can be sitting on when we try to bind, so the
 *     whole range stays underneath the lowest of them.
 *   · LOWER — 31000 keeps the range far above every port a developer machine actually uses:
 *     3000-3010 (Next/React), 4200, 4321, 5173 (Vite), 5432 (Postgres), 6379 (Redis), 8000,
 *     8080, 9000, 9229 (node inspect), 27017 (Mongo). Nothing common lives up here.
 *
 * That leaves 1768 slots — orders of magnitude more checkouts than any machine will run at
 * once, which is what makes the linear probe below a formality rather than a search.
 */
export const DERIVED_PORT_RANGE_START = 31000;
export const DERIVED_PORT_RANGE_END = 32767;
export const DERIVED_PORT_RANGE_SIZE = DERIVED_PORT_RANGE_END - DERIVED_PORT_RANGE_START + 1;

/**
 * A port derived from the ABSOLUTE PATH of the checkout — never from the repo's name.
 *
 * Two worktrees of the same repo have the same name and would hash to the same port, which
 * is exactly the collision this exists to remove: their absolute paths differ, so their
 * ports differ. Same path ⇒ same port, always: a checkout keeps its port across runs, so
 * the developer can learn it and the derived Playwright config, the server and the specs
 * all agree without any coordination.
 *
 * Pure, and it hashes a STRING: no filesystem is consulted (the path need not exist), which
 * is what lets a test assert the two worktrees case with paths it invents.
 */
export function derivePortFromCheckout(checkoutPath: string): number {
  // sha256 over the path, of which the first 4 bytes are enough entropy for 1768 slots.
  const digest = createHash('sha256').update(checkoutPath).digest();
  return DERIVED_PORT_RANGE_START + (digest.readUInt32BE(0) % DERIVED_PORT_RANGE_SIZE);
}

/** Keep a candidate inside the derived range, wrapping past the top back to the start. */
function wrapIntoDerivedRange(port: number): number {
  const span =
    ((port - DERIVED_PORT_RANGE_START) % DERIVED_PORT_RANGE_SIZE) + DERIVED_PORT_RANGE_SIZE;
  return DERIVED_PORT_RANGE_START + (span % DERIVED_PORT_RANGE_SIZE);
}

/**
 * The first port in the derived range that nothing is holding, starting at `first` and
 * walking forward one port at a time (wrapping at the top of the range).
 *
 * A derived port is a hash, so two checkouts CAN land on the same slot — rare, but a
 * one-in-1768 chance that would otherwise stop a run for no reason. Walking to the next
 * free port costs nothing and removes the whole class. It only ever applies to a port the
 * runner CHOSE: a port the developer pinned (`E2E_PORT`) or the project pinned
 * (`package.json#ports.e2e`) is never silently moved — see `resolveE2EPort`.
 *
 * BOUNDED BY CONSTRUCTION: at most one pass over the range, so an exhausted range fails with
 * an actionable message instead of spinning for ever.
 *
 * `isTaken` is a parameter so the real run can pass the runner's own detector
 * (`findPortHolders`, E2E-002) while a test answers from a set of ports it decides.
 */
export function probeFreePort(first: number, isTaken: (port: number) => boolean): number {
  for (let step = 0; step < DERIVED_PORT_RANGE_SIZE; step++) {
    const candidate = wrapIntoDerivedRange(first + step);
    if (!isTaken(candidate)) return candidate;
  }

  throw new Error(
    `Every port in the derived E2E range (${DERIVED_PORT_RANGE_START}-${DERIVED_PORT_RANGE_END}) ` +
      `is already taken, so this checkout has nowhere to serve.\n` +
      `   → Free some of them (stale servers from earlier runs are the usual cause), or\n` +
      `   → Pin one yourself: E2E_PORT=<port> pnpm test:e2e`
  );
}

/** How this run's port was decided. Drives the log line, and whether the probe applies. */
export type PortSource = 'env' | 'package' | 'derived' | 'default';

/** The port this run wants, and where that decision came from. */
export interface PortPlan {
  port: number;
  source: PortSource;
}

/**
 * Read `package.json#ports`. Kept out of module scope so importing reads no files.
 *
 * Exported only so a test can exercise it with an injected `fs` (E2E-006) — the tests
 * must never read the real `package.json` of whatever project runs them.
 */
export function readPackagePorts(): PackagePorts | undefined {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')) as {
    ports?: PackagePorts;
  };
  return pkg.ports;
}

/**
 * The port this run serves on, and how that was decided. Four steps, in this order:
 *
 *   1. `E2E_PORT` — the explicit escape hatch. Wins over everything and is never moved: the
 *      developer said this port, so a busy one fails loud (`assertE2EPortAvailable`) rather
 *      than quietly serving somewhere else.
 *   2. `package.json#ports.e2e` as a NUMBER — the project pinned a port. Same treatment: an
 *      explicit choice, honoured verbatim.
 *   3. `ports.e2e` explicitly `null` — the kit's "no fixed port" signal (what this kit now
 *      ships, and what `factory update` writes over the old shipped `3006`). THIS is what
 *      arms the derivation: a port from the checkout's absolute path, so two worktrees of
 *      the same repo can run their suites at the same time with no configuration at all.
 *   4. Nothing at all — `DEFAULT_E2E_PORT`.
 *
 * WHY AN ABSENT KEY IS NOT THE SAME AS `null`. A derivative that never carried a `ports`
 * block (its `package.json` is frozen at bootstrap — BR-FACTORY-006 — and the CLI cannot
 * empty a key that does not exist) keeps landing on `DEFAULT_E2E_PORT`, exactly as it does
 * today. Treating "absent" as "derive it" would move the port of every such project on its
 * next `factory update` — a brain update silently changing where a suite serves. The
 * derivation is opt-in by construction: it starts the moment the key is there and empty.
 *
 * ℹ️  Known, deliberate discrepancy (E2E-011 §9): `DEFAULT_E2E_PORT` is 3005 while the port
 * the kit used to SHIP in `package.json` was 3006. They are two different numbers and this
 * function does not reconcile them.
 *
 * `env` and `checkoutPath` are parameters rather than direct `process.env` / `process.cwd()`
 * reads, so a test pins them instead of inheriting whatever the host machine has.
 */
export function resolveE2EPort(
  env: EnvVars,
  packagePorts: PackagePorts | undefined,
  checkoutPath: string
): PortPlan {
  const fromEnv = Number(env.E2E_PORT);
  if (fromEnv) return { port: fromEnv, source: 'env' };

  const pinned = packagePorts?.e2e;
  if (typeof pinned === 'number' && pinned > 0) return { port: pinned, source: 'package' };

  // `=== null` distinguishes the emptied key from an absent one (`undefined`) — the whole
  // opt-in contract above rests on that difference.
  if (pinned === null) {
    return { port: derivePortFromCheckout(checkoutPath), source: 'derived' };
  }

  return { port: DEFAULT_E2E_PORT, source: 'default' };
}

/** What the pre-flight line says about where this run's port came from. */
const PORT_SOURCE_LABEL: Record<PortSource, string> = {
  env: 'from E2E_PORT',
  package: 'from package.json#ports.e2e',
  derived: 'derived from this checkout',
  default: 'runner default',
};

/**
 * The host `next start` binds to, and the one name the host check never has to resolve
 * (`isReservedLoopbackName`). Named because two unrelated rules read it, not for its length.
 */
export const LOOPBACK_HOSTNAME = 'localhost';

/** The origin this run's server is reachable at. Single place the literal lives. */
export function e2eServerUrl(port: number): string {
  return `http://${LOOPBACK_HOSTNAME}:${port}`;
}

/**
 * The MFA encryption key shared by the server and the Playwright process.
 *
 * TOTP secrets are encrypted at rest with this key. The DEV SERVER (which decrypts them
 * on the /2fa + step-up paths) and the PLAYWRIGHT process (which encrypts seeded secrets
 * in spec fixtures) MUST share the SAME key, or decryption fails. Resolved once and
 * injected into both. Mirrors the AUTH_SECRET fallback in `buildServerEnv`: a real env
 * value always wins; the fallback only fills the gap for the disposable Neon-branch run
 * (the kit's .env.local does not ship a test MFA key).
 */
export function resolveMfaEncryptionKey(env: EnvVars): string {
  return env.MFA_ENCRYPTION_KEY || FALLBACK_MFA_ENCRYPTION_KEY;
}

// ---------------------------------------------------------------------------
// Derived Playwright config — how this run pins the port on a config that never
// heard of it
// ---------------------------------------------------------------------------

/**
 * Where the generated config is written: INSIDE `node_modules/`, never at the project root.
 *
 * Same constraint as `BUILD_STAMP_FILE`, for the same reason. `.gitignore` is root-level,
 * frozen at bootstrap in a derivative (BR-FACTORY-006) and does NOT travel with the brain —
 * it is not among the paths `distribution/profiles.json` ships, and the CLI has no mechanism
 * to edit it in an existing derivative the way it can `package.json`. A generated file at the
 * root would therefore sit in `git status` as untracked FOR EVER, in every derivative that
 * ran the suite, with no way for `factory update` to heal it. `/node_modules` is already
 * covered by the shipped `.gitignore` (`:4`), so nothing here can ever surface in a diff.
 *
 * `.next/` was the other candidate and is rejected: the build owns that directory and may
 * wipe it between phases, while this file has to still exist when Playwright starts.
 */
export const DERIVED_CONFIG_DIR = 'node_modules/.cache/timekast-e2e';

/**
 * The generated config. `.cjs` deliberately — this is the part that breaks if changed
 * carelessly:
 *
 *   · NOT `.ts`. Playwright's TypeScript transform SKIPS everything under `node_modules/`
 *     (`belongsToNodeModules`, consulted by its `shouldTransform` hook), so a generated `.ts`
 *     here is handed to Node raw and dies at load with `Cannot find module '<root>/
 *     playwright.config'`. Verified against Playwright 1.58, not assumed.
 *   · NOT `.js`. A derivative that ships `"type": "module"` would make a `.js` file here an
 *     ES module, where `require` does not exist. `.cjs` is CommonJS whatever the package says.
 *
 * The `require()` INSIDE it is unaffected: the file it loads is the project's own config,
 * which lives outside `node_modules/`, so Playwright's transform does apply to it and a `.ts`
 * config compiles normally.
 */
export const DERIVED_CONFIG_FILE = `${DERIVED_CONFIG_DIR}/playwright.config.cjs`;

/**
 * Candidate names for the project's OWN config, in the order Playwright itself resolves them
 * (`resolveConfigFileFromDirectory`), so the derived config always wraps the very file
 * Playwright would have loaded on its own.
 */
export const PLAYWRIGHT_CONFIG_FILES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright.config.mts',
  'playwright.config.mjs',
  'playwright.config.cts',
  'playwright.config.cjs',
] as const;

/**
 * The project's own Playwright config, or `null` when it ships none.
 *
 * Exported only so a test can exercise it with an injected `fs` (E2E-006): "this project has
 * no config" and "it ships a `.js` one" are states of the FILESYSTEM, which no argument can
 * express.
 */
export function findPlaywrightConfig(): string | null {
  for (const name of PLAYWRIGHT_CONFIG_FILES) {
    const candidate = resolve(process.cwd(), name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export interface DerivedConfigOptions {
  /** Absolute path of the project's own config. It is `require`d — never parsed, never read. */
  sourceConfigPath: string;
  /** Absolute project root: the directory the source config's relative paths were written against. */
  rootDir: string;
  /** The port this run serves on, and therefore the only value the derived config changes. */
  port: number;
}

/**
 * The source of the generated config: the project's own config, plus this run's port.
 *
 * WHY GENERATE RATHER THAN DETECT. Two suites can only run at once if each serves on its own
 * port AND Playwright drives its `baseURL` at that port. Asking "does this project's config
 * already honour `E2E_PORT`?" cannot be answered honestly from the outside: the only cheap
 * check is textual, and a config that merely MENTIONS `E2E_PORT` in a comment — this repo's
 * does, at `playwright.config.ts:11-13` — reads as a yes. That false positive does not
 * degrade: every spec would drive a port with nothing on it, so the whole suite falls over.
 * Overriding the RESULT has no such failure mode; a config that reads `E2E_PORT` and one that
 * never heard of it end up with exactly the same `baseURL`.
 *
 * WHY IT `require`s THE SOURCE instead of re-emitting its values. A Playwright config holds
 * things that do not survive a round trip through text — `testMatch` regexes, the spread of
 * `devices['Desktop Chrome']`, `globalSetup` functions. Loading it keeps the link to the
 * original alive: whatever the project changes there is what this run gets, minus the port.
 *
 * WHAT IT CHANGES, AND NOTHING ELSE:
 *   · `baseURL` → the HOST the source declared, on this run's scheme and port, computed PER
 *     LEVEL (top level and each project — see `projects` below). The port is the invariant the
 *     runner needs (two suites can only run at once if each drives its own); the host is not,
 *     and forcing it broke a derivative that routes tenants by the `Host` header. The scheme is
 *     imposed rather than preserved: this run is served by `next start` on loopback, which
 *     speaks plain HTTP, so an `https://` in the source would leave the suite negotiating TLS
 *     against a server that never speaks it. A `baseURL` the source did not declare — or one
 *     that cannot be read — falls back to `e2eServerUrl(port)`, never throws.
 *   · The paths Playwright resolves against the config FILE's directory — which is now
 *     `node_modules/.cache/`, not the project root — are re-rooted so they still mean what
 *     the source said. `testDir` is the one the AC names; `globalSetup` / `globalTeardown`
 *     are what make the run possible at all (Playwright resolves them the same way, and a
 *     miss there aborts before a single test runs).
 *   · `reporter` → a progress reporter is PREPENDED when the source declared none that prints
 *     one (see `withProgressReporter` in the emitted module). The source's own reporters are
 *     kept, in their order, and a source that declares nothing is left alone.
 *
 * Pure: everything arrives as an argument, so what it emits is assertable without a
 * filesystem — and the emitted module is itself executable in a test.
 *
 * ℹ️  Known residue, and it is now NARROWER than it used to read. The html reporter is no
 * longer in it: the runner sets `PLAYWRIGHT_HTML_OUTPUT_DIR` per phase and that variable WINS
 * over the config (`reportFolderFromEnv() ?? resolveReporterOutputPath(...)` — verified against
 * 1.58), so `['html', { outputFolder: 'reports/e2e' }]` is overridden rather than misplaced.
 * What remains: any OTHER reporter with an explicit RELATIVE output path — `['json', { outputFile:
 * 'reports/e2e.json' }]`, `junit` likewise — is still resolved against the directory of THIS
 * file and therefore lands beside it, inside `node_modules/.cache/`. Those reporters have no
 * environment override to lean on.
 */
export function renderDerivedPlaywrightConfig(options: DerivedConfigOptions): string {
  const { sourceConfigPath, rootDir, port } = options;
  // JSON.stringify rather than quotes: it escapes the backslashes of a Windows path, which
  // would otherwise become escape sequences in the generated source.
  const root = JSON.stringify(rootDir);
  const source = JSON.stringify(sourceConfigPath);
  // The origin this run's server listens on. It is the fallback AND the source of the two
  // parts the derived `baseURL` imposes (scheme + port), so the `http://localhost:{port}`
  // literal keeps living in exactly one place — `e2eServerUrl` (`CODING.md §5`).
  const serverOrigin = JSON.stringify(e2eServerUrl(port));

  return `/**
 * GENERATED by scripts/tools/e2e-runner.ts — rewritten on every run. Do not edit.
 *
 * The project's own Playwright config, with the port of THIS run forced onto it. Lives here,
 * inside node_modules/, because the project root is a place no generated file may appear:
 * .gitignore is frozen at bootstrap in a derivative and never travels with the kit.
 */
const path = require('path');
const { URL } = require('url');

/** The project root: where the source config lives, and what its relative paths mean. */
const ROOT = ${root};

/** The project's own config — loaded, never parsed. Its shape is preserved as it is. */
const loaded = require(${source});
const base = loaded && loaded.default ? loaded.default : loaded;

/** A path the source wrote relative to ITS directory, made absolute against the root. */
const fromRoot = (value) =>
  Array.isArray(value)
    ? value.map(fromRoot)
    : typeof value === 'string'
      ? path.resolve(ROOT, value)
      : value;

/**
 * The keys Playwright resolves against the directory of the config FILE. This file does not
 * sit at the project root, so each one has to be re-rooted or it would point into the cache.
 *
 * 🔴 A KEY MISSING FROM THIS LIST KILLS THE WHOLE RUN, and says nothing about why. 'tsconfig'
 * was missing: a project that declares 'tsconfig: ./tsconfig.playwright.json' had it resolved
 * inside the cache directory, where it does not exist, so Playwright refused to load the config
 * and every phase died before a single spec — with an error that names neither the runner nor
 * the cache. The kit did not catch it because its own config does not use the key, which is the
 * exact shape of defect this runner exists to stop shipping: a mechanism its author does not
 * eat. Reported by a derivative, 2026-08-14.
 *
 * Deliberately NOT here: 'snapshotPathTemplate' (a token template like '{testDir}/...', not a
 * path — path.resolve would mangle the tokens) and 'webServer' (an object, and this runner
 * starts the server itself so the source's never runs). The unknown-key notice below is what
 * covers the next one instead of a list somebody has to keep guessing at.
 */
const RELATIVE_KEYS = [
  'testDir',
  'outputDir',
  'snapshotDir',
  'globalSetup',
  'globalTeardown',
  'tsconfig',
];

/** Only the keys the source actually set: an absent one stays absent, so its own default applies. */
const reroot = (target) => {
  const patch = {};
  for (const key of RELATIVE_KEYS) {
    if (target[key] !== undefined) patch[key] = fromRoot(target[key]);
  }
  return patch;
};

/**
 * Keys this derivation KNOWS it does not re-root. Naming them is the difference between the
 * next 'tsconfig' being a one-line report and being an afternoon: the failure mode of an
 * unhandled path key is Playwright refusing to load a config, pointing at a file inside a cache
 * directory nobody wrote, with the runner mentioned nowhere.
 *
 * A warning rather than a refusal: both are legitimate to declare, and the run that follows may
 * well be fine — 'webServer' in particular is simply unused here, because this runner starts
 * the server itself.
 */
for (const key of ['snapshotPathTemplate', 'webServer']) {
  if (base[key] !== undefined) {
    console.warn(
      \`⚠️  playwright.config declares '\${key}', which this run's derived config does NOT re-root.\` +
        \` If it holds a path relative to the config file, it now resolves inside\` +
        \` node_modules/.cache/timekast-e2e/ and will not be found. Report it to the kit.\`
    );
  }
}

/** The origin this run's server actually listens on: 'next start' on loopback, plain HTTP. */
const SERVER_ORIGIN = ${serverOrigin};

/**
 * What ONE level drives: the host the source config declared there, on this run's scheme and
 * port. The port is what makes two suites able to run at once, and it is the only thing this
 * mechanism ever needed to impose; the host belongs to the project (a derivative that resolves
 * its tenant from the 'Host' header fails closed against a host it did not choose). The scheme
 * is imposed with the port, from SERVER_ORIGIN, because the server of this run speaks plain
 * HTTP and an 'https://' would leave every spec negotiating TLS with something that does not.
 *
 * Never throws: a baseURL that is absent, not a string, relative, scheme-less or otherwise
 * unreadable falls back to SERVER_ORIGIN — the behaviour this file has always had. Throwing
 * here would abort a run that has already created (and paid for) a database branch.
 */
const derivedBaseUrl = (value) => {
  if (typeof value !== 'string') return SERVER_ORIGIN;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return SERVER_ORIGIN;
  }
  // '' is what a scheme-less 'host:3000' parses to (protocol 'host:', no host at all).
  if (!parsed.hostname) return SERVER_ORIGIN;
  const derived = new URL(SERVER_ORIGIN);
  derived.hostname = parsed.hostname;
  return derived.origin;
};

/** The top-level baseURL as the SOURCE wrote it — what a project without its own inherits. */
const SOURCE_BASE_URL = base.use ? base.use.baseURL : undefined;

/**
 * Reporters that say, as the run goes, WHICH test is running. Playwright already inserts one of
 * its own ('line' locally, 'dot' on CI) when nothing else prints to stdio, so the difference this
 * makes is the shape of the output rather than its existence: 'dot' emits one character per test,
 * which in a CI log tells you a suite is alive and nothing else. 'list' names each test as it
 * finishes, so the log of a run that dies mid-suite says WHERE it died.
 */
const PROGRESS_REPORTERS = ['list', 'line', 'dot', 'github'];

/** The names a 'reporter' value refers to — '' for anything this cannot read. */
const reporterNames = (value) => {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
};

/**
 * The source's reporters, with 'list' in front when none of them prints progress.
 *
 * NEVER a replacement: a project that declared 'html', a custom reporter or a blob output keeps
 * every one of them, in order. And a project that already asked for progress — 'list', 'line',
 * 'dot' or the 'github' annotations — is left exactly as it is, because imposing a second one
 * would print every test twice.
 */
const withProgressReporter = (value) => {
  const names = reporterNames(value);
  if (names.length === 0) return value;
  if (names.some((name) => PROGRESS_REPORTERS.indexOf(name) !== -1)) return value;
  return [['list']].concat(typeof value === 'string' ? [[value]] : value);
};

const config = {
  ...base,
  // Playwright's default testDir is the config's own directory — which is no longer the
  // project root. Stated first, then replaced by reroot() when the source named one.
  testDir: ROOT,
  ...reroot(base),
  use: { ...base.use, baseURL: derivedBaseUrl(SOURCE_BASE_URL) },
  // Spread per project: names, testMatch/testIgnore and dependencies survive untouched. The
  // baseURL is computed here too, because a project-level 'use' wins over the top-level one —
  // a derivative that pinned its own would otherwise ignore this run's port entirely. Computed
  // PER PROJECT rather than reused from above: two projects pinning different hosts must keep
  // them, and one that pins none inherits the top level's host, already rewritten.
  projects: Array.isArray(base.projects)
    ? base.projects.map((project) => ({
        ...project,
        ...reroot(project),
        use: {
          ...project.use,
          baseURL: derivedBaseUrl(
            project.use && project.use.baseURL !== undefined
              ? project.use.baseURL
              : SOURCE_BASE_URL
          ),
        },
      }))
    : base.projects,
};

// Assigned only when the source declared one: writing 'reporter: undefined' into the object
// would state a key the source deliberately left to Playwright's own default.
if (base.reporter !== undefined) config.reporter = withProgressReporter(base.reporter);

/**
 * Say so when a level drives a host that is not the one this run serves. The preserved host
 * MUST resolve to this machine — the server lives here — and a config that points somewhere
 * else (a 'process.env.BASE_URL ?? "https://staging…"' default) would send the traffic off the
 * machine while the local server idles. The disposable-branch guard does not catch it: that
 * one compares the DATABASE, not the HTTP destination. Silent on the ordinary path, so the
 * kit's own output does not change.
 */
const elsewhere = Array.from(
  new Set(
    [config.use.baseURL]
      .concat(Array.isArray(config.projects) ? config.projects.map((p) => p.use.baseURL) : [])
      .filter((url) => url !== SERVER_ORIGIN)
  )
);
if (elsewhere.length > 0) {
  console.warn(
    '⚠️  E2E: this run serves ' +
      SERVER_ORIGIN +
      ' but the Playwright config drives ' +
      elsewhere.join(', ') +
      ' — the host comes from playwright.config and must resolve to THIS machine.'
  );
}

module.exports = config;
`;
}

/**
 * Write the config this run will pass to Playwright, and return its absolute path — or
 * `null` when the project ships no Playwright config to derive from.
 *
 * Written UNCONDITIONALLY. There is deliberately no "does the project config already support
 * the port?" branch: see `renderDerivedPlaywrightConfig` for why that question has no honest
 * answer and why a wrong one takes the whole suite down.
 *
 * A failed write THROWS rather than falling back to running without `--config`. That
 * fallback would serve on one port and drive another — the exact failure this mechanism
 * exists to prevent, and one that reads as a suite of product bugs. The absent-config case
 * is different and is tolerated (BR-FACTORY-006): there is nothing to derive from, so the
 * run proceeds exactly as it did before, and Playwright reports the missing config itself.
 *
 * Exported for its test (E2E-006): where the file lands — never the project root — and the
 * absence of a source config are both facts about a filesystem.
 */
export function writeDerivedPlaywrightConfig(port: number): string | null {
  const sourceConfigPath = findPlaywrightConfig();
  if (!sourceConfigPath) {
    console.log(
      '   ⚠️  No playwright.config.* in this project — Playwright runs without a derived config.'
    );
    return null;
  }

  const rootDir = process.cwd();
  const target = resolve(rootDir, DERIVED_CONFIG_FILE);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, renderDerivedPlaywrightConfig({ sourceConfigPath, rootDir, port }));
  // The ORIGIN, not just the port: the derived `baseURL` now keeps the host the project's own
  // config declares, so "port 41234" no longer says where the suite actually points. This line
  // names the origin THIS runner serves; when a level drives another host, the derived config
  // says so itself as Playwright loads it (see `renderDerivedPlaywrightConfig`).
  console.log(`   ✓ Playwright will run on ${e2eServerUrl(port)} (${DERIVED_CONFIG_FILE})`);
  return target;
}

// ---------------------------------------------------------------------------
// Does the preserved host resolve to THIS machine? (the premise BND-009 left implicit)
// ---------------------------------------------------------------------------

/**
 * The declared "I know what I am doing" for a `baseURL` host that is not this machine.
 *
 * A variable rather than a field on `E2EPhase` or a new phase file: the phase contract is frozen
 * (`ADR-002-e2e-phase-registry`) and this is not a property of a phase — it is a property of ONE
 * invocation. Same shape and same spirit as `E2E_PARENT_BRANCH` in `neon-branch.ts`: an override
 * that is read from the environment, never persisted, and that makes the runner loud rather than
 * silent. An empty value is unset, not a choice (`E2E_ALLOW_REMOTE_HOST=` in a shell profile).
 */
export const ALLOW_REMOTE_HOST_ENV = 'E2E_ALLOW_REMOTE_HOST';

/** Env var that keeps the server's output after it is ready (`serverLogsKept`). */
export const SERVER_LOGS_ENV = 'E2E_SERVER_LOGS';

/** Whether this invocation declared the escape hatch above. */
export function allowsRemoteHost(env: EnvVars): boolean {
  return Boolean(env[ALLOW_REMOTE_HOST_ENV]);
}

/**
 * How long one host resolution may take before the runner gives up on it.
 *
 * Bounded on purpose and by rule, like every other network call this runner makes: `dns.lookup`
 * inherits the resolver's own retry budget, which on a machine with an unreachable DNS server is
 * tens of seconds — spent BEFORE the branch, in a check whose whole justification is that it
 * costs nothing. Five seconds is far past a hosts-file hit or a warm resolver, and far short of
 * being noticed on the ordinary path.
 */
export const HOST_RESOLUTION_TIMEOUT = 5000;

/** RFC 6761 §6.3 reserves this suffix: a name under it MUST resolve to loopback. */
const RESERVED_LOOPBACK_SUFFIX = `.${LOOPBACK_HOSTNAME}`;

/** IPv4 loopback is the whole `127.0.0.0/8` block, not just `127.0.0.1`. */
const LOOPBACK_V4_PREFIX = 127;

/** Every `baseURL` a config declares — top level and per project — as it is written. */
const BASE_URL_LITERAL_PATTERN = /baseURL\s*:[^,\n]*?(['"`])([^'"`]*)\1/g;

/**
 * A `${…}` sitting exactly where the PORT goes, which the runner replaces anyway.
 *
 * The kit's own config is `` `http://localhost:${E2E_PORT}` ``, and reading it as "unknown" would
 * mean the one config every project starts from is never checked. The host is right there in the
 * text; only the port is computed, and the port is the part this run overrides. Any OTHER
 * interpolation leaves the host genuinely unknown — see `declaredBaseUrlHost`.
 */
const INTERPOLATED_PORT_PATTERN = /:\$\{[^}]*\}(?=$|[/?#])/;

/**
 * Every `baseURL` literal the config source declares, in source order.
 *
 * Textual, like `findGlobalSetupPath` and `configDeclaresProject`, and for the same reason: the
 * alternative is loading the project's config INTO THIS PROCESS, which runs its `dotenv.config()`
 * against `.env.local` and would pour that file's variables into the environment the build stamp
 * is computed from. A read that changes what it observes is not a check.
 *
 * Comments are removed first (`stripSourceComments`), so a `baseURL` somebody commented out is
 * not a host anybody drives.
 */
export function findConfigBaseUrls(source: string | null): string[] {
  if (!source) return [];
  const stripped = stripSourceComments(source);
  return Array.from(stripped.matchAll(BASE_URL_LITERAL_PATTERN), (match) => match[2]);
}

/**
 * The host the derived config will drive for a declared `baseURL`, or `null` when nothing can
 * honestly be claimed about it.
 *
 * Mirrors the rule the generated file applies at load time (`renderDerivedPlaywrightConfig` →
 * `derivedBaseUrl`): parse, keep the hostname, impose scheme and port. `null` covers the two
 * shapes that carry no host — the value that does not parse (which falls back to
 * `e2eServerUrl(port)`, so the run stays on loopback and there is nothing to check) and the one
 * whose host is INTERPOLATED (`` `https://${tenant}.acme.com` ``), where the text simply does not
 * say. Claiming either would be inventing a verdict, and a verdict here fails a run.
 */
export function declaredBaseUrlHost(value: string): string | null {
  const literal = value.replace(INTERPOLATED_PORT_PATTERN, '');
  if (literal.includes('${')) return null;
  try {
    const { hostname } = new URL(literal);
    if (!hostname) return null;
    // The WHATWG parser brackets an IPv6 host; `dns.lookup` and a human both want it bare.
    return hostname.replace(/^\[/, '').replace(/\]$/, '');
  } catch {
    return null;
  }
}

/**
 * Whether a name is reserved BY SPEC for loopback, answered without a resolver.
 *
 * 🔴 This is a fast path, never the check. A purely lexical rule was the tempting design and it
 * is the wrong one: it would reject `tenant-a.acme.test` mapped to `127.0.0.1` in `/etc/hosts`,
 * which is precisely the multi-tenant derivative whose suite this epic gave back. What it buys is
 * the opposite guarantee — RFC 6761 §6.3 says a name under `.localhost` resolves to loopback and
 * nothing else, so a resolver that has not implemented that (they exist) must not be able to fail
 * a run over a name the standard already answers.
 */
export function isReservedLoopbackName(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/\.$/, '');
  return name === LOOPBACK_HOSTNAME || name.endsWith(RESERVED_LOOPBACK_SUFFIX);
}

/** Whether one resolved address is loopback — `127.0.0.0/8` or `::1`, in any spelling. */
export function isLoopbackAddress(address: string): boolean {
  const bare = address
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/%.*$/, '') // a zone index (`fe80::1%en0`) is not part of the address
    .replace(/^::ffff:/, ''); // IPv4-mapped IPv6, which some resolvers return
  if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true;
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  return octets !== null && Number(octets[1]) === LOOPBACK_V4_PREFIX;
}

/**
 * The rule, pure: given what a name resolved to, does it point at THIS machine?
 *
 * EVERY address must be loopback, and an empty list is a no. A name that resolves to both
 * `127.0.0.1` and a public address is not a local name with a decoration — the resolver hands
 * back a list and the client picks, so half the run would leave the machine and which half is
 * nobody's decision. Ambiguity here resolves to "not local", because the cost of being wrong in
 * that direction is a message and the cost in the other is the traffic this check exists to stop.
 */
export function resolvesToThisMachine(addresses: readonly string[]): boolean {
  return addresses.length > 0 && addresses.every(isLoopbackAddress);
}

/** What a resolver hands back, narrowed to the one field this file reads. */
export type AddressLookup = (host: string) => Promise<readonly { address: string }[]>;

/** The io half: resolve a name to addresses, under a bound. Injected in tests, never mocked. */
export async function lookupHostAddresses(
  host: string,
  options: { lookup?: AddressLookup; timeoutMs?: number } = {}
): Promise<string[]> {
  const {
    lookup = (name: string) => dns.lookup(name, { all: true }),
    timeoutMs = HOST_RESOLUTION_TIMEOUT,
  } = options;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`resolution timed out after ${timeoutMs / 1000}s`)),
      timeoutMs
    );
  });

  try {
    const resolved = await Promise.race([lookup(host), bound]);
    return resolved.map((entry) => entry.address);
  } finally {
    // Always cleared, including on the winning path: an unref'd-less timer would keep the
    // process alive for the rest of the ceiling after the answer already arrived.
    clearTimeout(timer);
  }
}

/** What the check knows about one host, before it decides what to do with it. */
export interface HostVerdict {
  /** The `baseURL` exactly as the config wrote it — the string somebody has to go edit. */
  literal: string;
  host: string;
  /** What it resolved to. Empty when it did not resolve at all. */
  addresses: string[];
  /** Why resolution produced nothing, when that is what happened. */
  failure: string | null;
}

/** Whether the name answered with an address at all — a different accident from answering wrong. */
function resolvedSomewhere(verdict: HostVerdict): boolean {
  return verdict.failure === null && verdict.addresses.length > 0;
}

/** The one clause that says what is wrong with this host, reused by both messages below. */
function hostDiagnosis(verdict: HostVerdict): string {
  if (verdict.failure) return `'${verdict.host}' could not be resolved (${verdict.failure})`;
  if (verdict.addresses.length === 0) return `'${verdict.host}' resolves to no address at all`;
  return `'${verdict.host}' resolves to ${verdict.addresses.join(', ')}, which is not this machine`;
}

/** The origin the suite would actually drive: the declared host, on this run's scheme and port. */
function drivenOrigin(host: string, serverOrigin: string): string {
  const server = new URL(serverOrigin);
  const display = host.includes(':') ? `[${host}]` : host; // IPv6 needs its brackets back
  return `${server.protocol}//${display}:${server.port}`;
}

/**
 * The error that stops a run whose `baseURL` points somewhere else — the message a developer
 * reads instead of watching a suite fail against a machine that is not theirs.
 *
 * It names the host, says what would leave this machine and offers the two ways out. Thrown from
 * `main` BEFORE the Neon branch and the build, so "nothing was created" is a fact it can state.
 */
export function remoteHostFailure(options: { verdict: HostVerdict; serverOrigin: string }): string {
  const { verdict, serverOrigin } = options;
  const driven = drivenOrigin(verdict.host, serverOrigin);
  // The two ways this ends are not the same accident, so they do not get the same paragraph:
  // one sends the credentials somewhere, the other sends them nowhere.
  const consequence = resolvedSomewhere(verdict)
    ? [
        `    so the suite would drive ${driven} instead — off this machine, over plain HTTP (the`,
        '    scheme is forced), carrying the passwords `auth.setup.ts` seeds in the body of every',
        '    login. The disposable-database guard does not catch it: that one compares the',
        '    DATABASE, not the HTTP destination.',
      ]
    : [
        `    so the suite would drive ${driven} instead — a name nothing here can reach, so every`,
        '    spec would fail at its first `page.goto` against a server that was never asked for',
        '    anything.',
      ];

  return [
    'the Playwright config points this run OFF this machine.',
    '',
    `    It declares baseURL '${verdict.literal}', and`,
    `    ${hostDiagnosis(verdict)}.`,
    '',
    `    This run serves ${serverOrigin} with \`next start\`,`,
    ...consequence,
    '',
    '    Nothing has been created yet — no branch, no build, no server.',
    '',
    '    Fix it: point `baseURL` at a host that resolves to THIS machine — `localhost`, anything',
    '    under `.localhost`, or a name mapped to 127.0.0.1 in /etc/hosts.',
    '',
    `    Deliberate? Say so and the run proceeds: ${ALLOW_REMOTE_HOST_ENV}=1 pnpm test:e2e`,
  ].join('\n');
}

/**
 * The same finding when the escape hatch is set: loud, and then it runs.
 *
 * The override buys a run, never silence. A developer who declared the remote host still has to
 * be able to read, in the output of the run that fails weirdly three days later, that this suite
 * was not talking to the server it started.
 */
export function remoteHostOverrideWarning(options: {
  verdict: HostVerdict;
  serverOrigin: string;
}): string {
  const { verdict, serverOrigin } = options;
  return [
    '',
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `⚠️  THIS RUN DRIVES A HOST THAT IS NOT THIS MACHINE (${ALLOW_REMOTE_HOST_ENV} is set).`,
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `    baseURL '${verdict.literal}':`,
    `    ${hostDiagnosis(verdict)}.`,
    `    The suite will drive ${drivenOrigin(verdict.host, serverOrigin)} — off this machine, over`,
    '    plain HTTP, with the credentials the specs seed — while the server of this run',
    `    (${serverOrigin}) is never asked for anything.`,
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ].join('\n');
}

/** How a name is resolved during the check. Injected so the rule is testable without a network. */
export type HostLookup = (host: string) => Promise<string[]>;

export interface BaseUrlHostCheck {
  /** The hosts that answered for this machine — printed nowhere, asserted in tests. */
  local: string[];
  /** Loud banners to print. Only ever non-empty when the escape hatch is set. */
  warnings: string[];
}

/**
 * 🔴 Refuse to start a run whose `baseURL` host is not this machine.
 *
 * WHY THE RUNNER AND NOT THE GENERATED CONFIG. The derived config already SAYS when a level
 * drives another host, but it says it from inside Playwright's process, after the branch has been
 * created, the schema migrated and the app built — and it says it in a `console.warn` that does
 * not fail anything. Both halves matter: resolving a name is io that the generated text cannot do
 * cleanly, and the only place a "do not start" decision costs nothing is before the first thing
 * that is created.
 *
 * WHY RESOLUTION AND NOT A LIST OF NAMES. `BND-009` preserved the host precisely so a derivative
 * that routes tenants by the `Host` header could run — `tenant-a.localhost`, or a name mapped to
 * `127.0.0.1` in `/etc/hosts`. A lexical rule would reject the second, i.e. re-break the case the
 * preservation exists for. The question is "does this name answer HERE", and only a resolver
 * answers it.
 *
 * The three outcomes are deliberate:
 *   · loopback            → run, in silence. The ordinary path prints nothing new.
 *   · anything else       → throw. Credentials would leave the machine in the clear.
 *   · did not resolve     → throw, naming that cause. The run could not have reached it either
 *                           way, and a silent pass here is the same defect wearing another face.
 */
export async function checkBaseUrlHosts(options: {
  configSource: string | null;
  serverOrigin: string;
  env: EnvVars;
  lookup?: HostLookup;
}): Promise<BaseUrlHostCheck> {
  const { configSource, serverOrigin, env, lookup = (host) => lookupHostAddresses(host) } = options;
  const allowed = allowsRemoteHost(env);
  const check: BaseUrlHostCheck = { local: [], warnings: [] };
  const seen = new Set<string>();

  for (const literal of findConfigBaseUrls(configSource)) {
    const host = declaredBaseUrlHost(literal);
    // `null` is "the text does not say", which is not a finding: an unreadable baseURL falls back
    // to `e2eServerUrl(port)` (the AC of BND-009), so that run is on loopback by construction.
    if (host === null || seen.has(host)) continue;
    seen.add(host);

    if (isReservedLoopbackName(host)) {
      check.local.push(host);
      continue;
    }

    const verdict: HostVerdict = { literal, host, addresses: [], failure: null };
    try {
      verdict.addresses = await lookup(host);
    } catch (error) {
      verdict.failure = error instanceof Error ? error.message : String(error);
    }

    if (verdict.failure === null && resolvesToThisMachine(verdict.addresses)) {
      check.local.push(host);
      continue;
    }

    if (!allowed) throw new Error(remoteHostFailure({ verdict, serverOrigin }));
    check.warnings.push(remoteHostOverrideWarning({ verdict, serverOrigin }));
  }

  return check;
}

// ---------------------------------------------------------------------------
// The phase registry — what a phase IS, and where the kit's two are declared
// ---------------------------------------------------------------------------

/**
 * The two environments one phase contributes, on top of the run's base (`composePhaseEnv`).
 *
 * Both halves come out of ONE call to `E2EPhase.env`, which is the whole reason the field is a
 * single function: a secret that is SPLIT between the server that verifies it and the process
 * that signs with it is generated once, by construction, instead of by a rule somebody has to
 * remember. `EnvOverrides` is reused deliberately — it is already the type `serverEnvOverrides`,
 * `playwrightEnvOverrides` and `bakedEnvOverrides` speak (`CODING.md §2`).
 */
export interface PhaseEnvOverrides {
  /** Layered onto the run's server env for `next start`. */
  server?: EnvOverrides;
  /** Layered onto the run's Playwright env. */
  playwright?: EnvOverrides;
}

/**
 * One phase: a server started with a certain posture, plus one Playwright project run against
 * it. Phases exist because some postures cannot coexist in one process — the kit's two differ
 * only in whether MFA is on.
 *
 * THE KIT'S OWN PHASES ARE DECLARED WITH THIS SHAPE (`KIT_PHASES`). There is deliberately no
 * code path only the kit walks: a shape the kit does not eat itself is one that breaks for a
 * derivative without anybody noticing.
 */
export interface E2EPhase {
  /** Must exist as a `project` in the checkout's own Playwright config, and be unique. */
  project: string;
  /** What the runner prints when the phase starts, after the `▶ ` marker. */
  label: string;
  /**
   * Evaluated EXACTLY ONCE per phase, immediately before the phase runs; its two halves are
   * layered onto the run's base env. Anything shared by every phase belongs in the base, not
   * here — see `MFA_ENCRYPTION_KEY` in `serverEnvOverrides`.
   */
  env?: () => PhaseEnvOverrides;
  /**
   * `true` ⇒ the phase can never be skipped: a checkout whose Playwright config does not
   * declare its `project` FAILS. Honoured for the kit's phases only — a phase the PROJECT
   * declares is always required, because declaring it is the assertion that it exists
   * (`resolveAvailablePhases`). A readable datum rather than a hidden `if`: uniformity of
   * SHAPE does not oblige uniformity of FAILURE POLICY.
   */
  required?: boolean;
  /**
   * Printed verbatim (after `⚠️  `) when a non-required phase is skipped. Optional; without it
   * the runner prints a generic line. It exists because the kit's own skip notice is a signal
   * the fleet greps for (`sk-e2e §9` item 9) and a derivative's optional phase deserves the
   * same chance to explain itself.
   */
  skipNote?: string;
  /**
   * `true` ⇒ DECLARED BUT NOT BY DEFAULT. The phase joins the registry like any other
   * (`resolveAvailablePhases` is untouched: whether the checkout declares its Playwright
   * project is a separate question), and `--project=<its name>` resolves it exactly as it
   * resolves any other phase — but a `pnpm test:e2e` with no `--project` leaves it out
   * (`resolvePhasePlan`). It is the field for a phase that is EXPENSIVE and rarely wanted:
   * without it, a visual-evidence phase would capture screenshots on every ordinary run.
   *
   * 🔴 AN `optIn` PHASE MUST NOT ALSO BE `required: true`, and the runner deliberately does
   * not validate the pair. `required` decides what happens when the checkout's Playwright
   * config does NOT declare the phase's project — and a derivative's config is frozen at
   * bootstrap (BR-FACTORY-006), so a config that never heard of a phase added later is the
   * NORMAL case, not the exception. A `required` phase there fails the WHOLE run instead of
   * being skipped, which for a phase nobody asked to run is a suite killed by a capability
   * it was not using. Declare an `optIn` phase without `required` and a checkout that cannot
   * run it simply skips it.
   */
  optIn?: boolean;
}

/** Phase A's Playwright project. Named once; every mention below reads it from here. */
export const KIT_BASE_PROJECT = 'chromium';
/** Phase B's Playwright project. Absent on derivatives born pre-MFA (`src/` frozen). */
export const KIT_MFA_PROJECT = 'mfa';
/**
 * Phase C's Playwright project — the visual-evidence harness (`fx-visual-evidence`). Absent on
 * every derivative that has not applied the adoption guide, which is why the phase is `optIn`
 * and NOT `required` (see `KIT_PHASES` below).
 */
export const KIT_EVIDENCE_PROJECT = 'evidence';

/**
 * The kit's own phases, in the order they run — the seed of every run's registry.
 *
 * `chromium` is `required`: it is the whole base suite, and a run that quietly skipped it would
 * leave the exit-code calculation with nothing to judge (`resolveExitCode`). `mfa` is not, and
 * the asymmetry is the point: a derivative born before the kit's MFA feature has a FROZEN
 * `src/` (BR-FACTORY-006) whose Playwright config legitimately declares no `mfa` project, so
 * skipping it with a notice is correct there and only there.
 */
export const KIT_PHASES: readonly E2EPhase[] = [
  {
    project: KIT_BASE_PROJECT,
    label: 'Phase A — base suite (RBAC/CRUD, MFA off)',
    required: true,
    // MFA posture is a RUNTIME server env, fixed per phase and never inherited from
    // `.env.local` (which a developer may have toggled for a smoke). `MFA_REQUIRED_ALL` stays
    // off in BOTH phases ("optional + admins") so the MFA spec's cases stay coherent under one
    // server — enforce-all would gate every role.
    env: () => ({ server: { MFA_ENABLED: 'false', MFA_REQUIRED_ALL: 'false' } }),
  },
  {
    project: KIT_MFA_PROJECT,
    label: 'Phase B — MFA-aware spec (MFA on, optional + admins)',
    required: false,
    env: () => ({ server: { MFA_ENABLED: 'true', MFA_REQUIRED_ALL: 'false' } }),
    skipNote:
      "Phase B (MFA) skipped — playwright.config.ts defines no 'mfa' project " +
      '(derivative born pre-MFA; src is frozen at bootstrap, `factory update` never ships it).',
  },
  {
    project: KIT_EVIDENCE_PROJECT,
    label: 'Phase C — visual evidence capture (opt-in, MFA off)',
    // 🔴 `optIn` AND DELIBERATELY NOT `required`. Two independent reasons, and both matter:
    //   · optIn — the harness photographs every surface in every theme at every width. On an
    //     ordinary `pnpm test:e2e` that is minutes nobody asked for, so it runs only when named
    //     (`--project=evidence`, i.e. `pnpm evidence:visual`).
    //   · not required — `playwright.config.ts` is frozen at bootstrap (BR-FACTORY-006), so a
    //     derivative that has not applied `.claude/docs/retrofits/visual-evidence-adoption.md`
    //     declares no `evidence` project. Marking this `required` would kill that project's WHOLE
    //     suite over a capability it was not even using. See `E2EPhase.optIn`.
    optIn: true,
    // Same posture as phase A: the shared storageState this harness reuses is written with MFA
    // off, and a capture pass has no business exercising a second factor.
    env: () => ({ server: { MFA_ENABLED: 'false', MFA_REQUIRED_ALL: 'false' } }),
    skipNote:
      "Phase C (visual evidence) skipped — playwright.config.ts defines no 'evidence' project " +
      '(the config is frozen at bootstrap; adopt it via .claude/docs/retrofits/visual-evidence-adoption.md).',
  },
];

/** The project's own phase file, relative to this runner — a sibling, like the compile guard. */
export const PROJECT_PHASES_MODULE = 'e2e.project.ts';
/** How that file is named in messages and documentation. */
export const PROJECT_PHASES_PATH = `scripts/tools/${PROJECT_PHASES_MODULE}`;

/**
 * Load `scripts/tools/e2e.project.ts` when the project ships one — the extension point that
 * replaces forking this runner.
 *
 * Same promise as `.husky/pre-commit.project` and `vitest.setup.project.ts`: dev-owned, absent
 * from every distribution profile, so `factory update` can never write it, overwrite it or
 * delete it. Absent ⇒ the run is byte-for-byte what it was before this registry existed.
 *
 * PRESENT BUT UNLOADABLE IS FATAL, never a skip. A file the project wrote and the runner could
 * not read is a defect the project can fix; continuing "with the kit's two phases" would run a
 * suite nobody asked for and report green — the exact failure mode this epic exists to close.
 *
 * Dependencies are injectable so the tolerance table is assertable without a filesystem: the
 * pure suite (`e2e-runner.test.ts`) forbids `fs` outright.
 */
export function loadProjectPhases(
  deps: { exists?: (path: string) => boolean; load?: (path: string) => unknown } = {}
): E2EPhase[] {
  const target = resolve(__dirname, PROJECT_PHASES_MODULE);
  const exists = deps.exists ?? existsSync;
  if (!exists(target)) return [];

  // `createRequire` rather than a bare `require`: the same CommonJS resolution (so the loader
  // that is already transpiling THIS file handles the `.ts` sibling too) without the import
  // form eslint bans in TypeScript. Built lazily — a run without the file must not pay for it.
  const load = deps.load ?? ((path: string) => createRequire(__filename)(path));

  let loaded: unknown;
  try {
    loaded = load(target);
  } catch (error) {
    throw new Error(
      `${PROJECT_PHASES_PATH} exists but could not be loaded: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }

  return interpretProjectPhases(loaded);
}

/**
 * The characters a phase's Playwright project name may be spelled with.
 *
 * 🔴 THIS NAME REACHES A DELETION. The runner passes `--output=test-results/${project}`
 * (`playwrightPhaseArgv`) and Playwright WIPES that directory as it starts. The name comes from
 * `scripts/tools/e2e.project.ts`, a file the runner reads and executes but does not own, so a
 * `project: '../../..'` would aim that wipe at whatever sits above `test-results/` — with the
 * damage done by Playwright, on a path this runner handed it.
 *
 * Restrictive on purpose: a Playwright project name is an identifier a human types after
 * `--project=`, so letters, digits, dot, underscore and dash cover every plausible one while
 * leaving no separator (`/`, `\`) and no expansion character in the string. It does narrow what a
 * project may call a phase — `e2e(fast)` used to be accepted — and the escaping in
 * `configDeclaresProject` stays where it is regardless: that one answers about names it is HANDED
 * (the kit's own included), and its job is the absence of a false negative, not this one.
 */
export const PHASE_PROJECT_NAME_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]+$/;

/**
 * The lookahead — at least ONE alphanumeric character — is not cosmetics, and `...` is why.
 *
 * `.` and `..` are rejected by name below, but a name spelled only with dots slipped through:
 * `...` is three allowed characters and neither of those two literals. On Windows the trailing
 * dots of a path component are STRIPPED when the path is canonicalized, so `test-results/...`
 * resolves to `test-results` itself — and Playwright deletes the directory it is given as it
 * starts, which would take every OTHER phase's results with it. Requiring a real character makes
 * the whole family (`.`, `..`, `...`, `....`) unspellable, instead of enumerating it.
 *
 * A name of only separators (`--`, `___`) is refused by the same rule. That is a fine consequence:
 * a phase name is an identifier a human types after `--project=`.
 */

/**
 * The two names the pattern above cannot reject on its own: `.` and `..` are spelled entirely
 * with allowed characters and are path segments all the same — `test-results/..` is the
 * directory that CONTAINS the results, not a sibling of them. Kept alongside the lookahead rather
 * than folded into it: the lookahead now covers both, and a rule this consequential is better
 * stated twice than left resting on one regex nobody re-reads.
 */
const PHASE_PROJECT_DOT_SEGMENTS = new Set(['.', '..']);

/** Whether a name may be used as a phase's Playwright project (and therefore as a path segment). */
export function isValidPhaseProjectName(name: string): boolean {
  return PHASE_PROJECT_NAME_PATTERN.test(name) && !PHASE_PROJECT_DOT_SEGMENTS.has(name);
}

/**
 * Trailing dots of a path component, which Windows STRIPS when it canonicalizes a path.
 * `mfa..` and `mfa` are one directory there, so they are one key here.
 */
const PHASE_TRAILING_DOTS = /\.+$/;

/**
 * The form of a phase name that the FILESYSTEM compares — what two names have to differ in
 * for their report directories to be two directories.
 *
 * 🔴 Uniqueness is about the DIRECTORY, not the string. The runner passes
 * `--output=test-results/{project}` and Playwright WIPES that directory as it starts, so
 * two phases whose names resolve to one directory delete each other's traces — the exact
 * bug the uniqueness check exists to prevent, reachable again through a name the check
 * accepted. macOS and Windows are case-insensitive (`mfa` == `MFA`) and Windows also drops
 * a component's trailing dots (`mfa..` == `mfa`); the names come from
 * `scripts/tools/e2e.project.ts`, a file the runner reads and does not own.
 *
 * Normalizing only the COMPARISON is deliberate: the name a phase is spelled with keeps
 * reaching Playwright verbatim, so `--project=` still matches what the config declares.
 */
export function phaseDirectoryKey(name: string): string {
  return name.toLowerCase().replace(PHASE_TRAILING_DOTS, '');
}

/**
 * The exported value of the project's phase file, validated into phases.
 *
 * Pure, and separate from the loading, because "what a valid export looks like" is a contract a
 * test should be able to state without a file on disk. Every rejection names the file and what
 * was found: this runs on a machine where nobody has read this runner's source.
 */
export function interpretProjectPhases(loaded: unknown): E2EPhase[] {
  const record =
    typeof loaded === 'object' && loaded !== null ? (loaded as Record<string, unknown>) : {};
  // A `.ts` file compiled to CommonJS exposes `export default` as `.default`; a plain
  // `module.exports = [...]` is the array itself. Both are accepted, nothing else is.
  const value = Array.isArray(loaded) ? loaded : record.default;

  if (!Array.isArray(value)) {
    throw new Error(
      `${PROJECT_PHASES_PATH} must export an array of phases as its default export ` +
        `(got ${value === undefined ? 'no default export' : typeof value}).`
    );
  }

  return value.map((entry, index) => {
    const phase = typeof entry === 'object' && entry !== null ? (entry as Partial<E2EPhase>) : null;
    if (!phase || typeof phase.project !== 'string' || phase.project === '') {
      throw new Error(
        `${PROJECT_PHASES_PATH}: phase #${index + 1} has no 'project' — it must name a project ` +
          `declared in this checkout's Playwright config.`
      );
    }
    // Validated HERE, where the empty string is already refused, because this is the one place
    // every project-declared name passes through. The name becomes a path segment downstream
    // (`--output=test-results/${project}`) and Playwright wipes that directory as it starts.
    if (!isValidPhaseProjectName(phase.project)) {
      throw new Error(
        `${PROJECT_PHASES_PATH}: phase #${index + 1} declares project '${phase.project}', which ` +
          `is not a usable name. Allowed: letters, digits, '.', '_' and '-' (and neither '.' nor ` +
          `'..'). The runner writes each phase's artifacts to test-results/<project> and ` +
          `Playwright DELETES that directory when it starts, so the name must stay one segment.`
      );
    }
    if (typeof phase.label !== 'string' || phase.label === '') {
      throw new Error(
        `${PROJECT_PHASES_PATH}: phase '${phase.project}' has no 'label' — the runner prints it ` +
          `when the phase starts.`
      );
    }
    if (phase.env !== undefined && typeof phase.env !== 'function') {
      throw new Error(
        `${PROJECT_PHASES_PATH}: phase '${phase.project}' declares 'env' but it is not a ` +
          `function. It is called once per phase and must return { server?, playwright? }.`
      );
    }
    return phase as E2EPhase;
  });
}

/** A phase the resolution left out, and the sentence the runner prints for it. */
export interface SkippedPhase {
  phase: E2EPhase;
  /** Printed after `⚠️  `. The phase's own `skipNote` when it has one. */
  reason: string;
}

/** What a run can execute, and what it deliberately will not. */
export interface AvailablePhases {
  /** In order: the kit's phases first, then the project's as its file declares them. */
  toRun: E2EPhase[];
  skipped: SkippedPhase[];
}

/**
 * Apply the tolerance table (`sk-e2e §1.7`) to the registry of this run.
 *
 * The asymmetry is the load-bearing part, and it is not an oversight:
 *
 *   | Situation                                | Result                                    |
 *   | ---------------------------------------- | ----------------------------------------- |
 *   | No project file                          | The kit's two phases. Identical to before |
 *   | The file exists but does not load        | Abort (`loadProjectPhases`)               |
 *   | Optional KIT phase, project absent       | Skipped with a notice — as before         |
 *   | Required KIT phase, project absent       | Throws. Never skipped                     |
 *   | PROJECT phase, project absent            | Throws, naming the phase                  |
 *   | Nothing left to run                      | Throws, naming what was skipped and why   |
 *
 * Generalizing "skip with a notice" to every phase — the tempting symmetry — is precisely what
 * empties the list of exit codes, and `[].some(…)` is `false`: a green run that executed nothing.
 *
 * `hasProject` is injected rather than read here so this stays pure: whether a name is declared
 * is a fact about the checkout's Playwright config (`configDeclaresProject`), not an argument.
 */
export function resolveAvailablePhases(options: {
  kitPhases?: readonly E2EPhase[];
  projectPhases?: readonly E2EPhase[];
  hasProject: (name: string) => boolean;
}): AvailablePhases {
  const kitPhases = options.kitPhases ?? KIT_PHASES;
  const projectPhases = options.projectPhases ?? [];

  // Uniqueness FIRST, over the whole registry: the runner passes `--output=test-results/{project}`
  // and Playwright wipes that directory as it starts, so two phases sharing a name would eat each
  // other's traces — discovered, if ever, in a report that is already gone.
  //
  // Compared by DIRECTORY KEY, not by string (`phaseDirectoryKey`): on a case-insensitive
  // filesystem `mfa` and `MFA` are one directory, and on Windows so are `mfa` and `mfa..`.
  const seen = new Map<string, string>();
  for (const phase of [...kitPhases, ...projectPhases]) {
    const key = phaseDirectoryKey(phase.project);
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new Error(
        previous === phase.project
          ? `Two E2E phases declare the same Playwright project '${phase.project}'. Names must be ` +
              `unique: the runner writes each phase's artifacts to test-results/${phase.project}, ` +
              `and Playwright wipes that directory when it starts. Rename one in ${PROJECT_PHASES_PATH}.`
          : `Two E2E phases collide on one report directory: '${previous}' and '${phase.project}' ` +
              `differ only in case or in trailing dots, which macOS and Windows ignore in a path. ` +
              `The runner writes each phase's artifacts to test-results/<project> and Playwright ` +
              `wipes that directory when it starts, so one phase would delete the other's traces. ` +
              `Rename one in ${PROJECT_PHASES_PATH}.`
      );
    }
    seen.set(key, phase.project);
  }

  const toRun: E2EPhase[] = [];
  const skipped: SkippedPhase[] = [];

  const consider = (phase: E2EPhase, skippable: boolean): void => {
    if (options.hasProject(phase.project)) {
      toRun.push(phase);
      return;
    }
    if (!skippable) {
      throw new Error(
        `E2E phase '${phase.project}' (${phase.label}) is required, but this checkout's ` +
          `Playwright config declares no '${phase.project}' project. It is never skipped: a ` +
          `run that dropped it would report on a suite it did not execute.`
      );
    }
    skipped.push({
      phase,
      reason:
        phase.skipNote ??
        `${phase.label} skipped — this checkout's Playwright config declares no ` +
          `'${phase.project}' project.`,
    });
  };

  // A KIT phase may opt out of being required (the pre-MFA case). A PROJECT phase may not: the
  // project declaring it IS the claim that it exists, so a miss is a defect, not a capability
  // difference — and skipping it silently-with-a-notice is the deceptive green all over again.
  for (const phase of kitPhases) consider(phase, phase.required !== true);
  for (const phase of projectPhases) consider(phase, false);

  if (toRun.length === 0) {
    throw new Error(
      `No E2E phase is runnable in this checkout, so nothing would have been tested. ` +
        `Skipped: ${skipped.map((entry) => `'${entry.phase.project}' (${entry.reason})`).join('; ')}`
    );
  }

  return { toRun, skipped };
}

/** The flag itself, in the two spellings a command line writes it. */
const PROJECT_FLAG = '--project';
const PROJECT_FLAG_PREFIX = `${PROJECT_FLAG}=`;

/** What `--project` asked for, and the arguments left once it is taken out. */
export interface ProjectFlag {
  /** The requested project name, or `null` when the flag was not given at all. */
  requested: string | null;
  /** Every other argument, in order — what gets forwarded to Playwright. */
  rest: string[];
}

/**
 * Take `--project` — in EITHER spelling — off the argument list.
 *
 * `--project=chromium` and `--project chromium` are the same flag; Playwright's own CLI
 * accepts both, so a developer copying an invocation from its docs writes the second. The
 * runner used to match only the `--project=` prefix, which made the spaced form a pair of
 * arguments it did not recognise: they were forwarded verbatim AND the runner injected its
 * own `--project=` per phase, so Playwright received two project filters and ran both phases
 * — the opposite of what was asked, reported green.
 *
 * Rules, and why:
 *   · The FIRST occurrence decides (the runner drives one phase); later ones are still
 *     stripped, because anything left over goes to Playwright.
 *   · A spaced value is consumed ONLY when it does not itself look like a flag, so
 *     `--project --headed` does not swallow `--headed`; the missing value then reads as the
 *     empty string and fails the same way any other unknown name does.
 */
export function extractProjectFlag(args: string[]): ProjectFlag {
  const rest: string[] = [];
  let requested: string | null = null;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg.startsWith(PROJECT_FLAG_PREFIX)) {
      const value = arg.slice(PROJECT_FLAG_PREFIX.length);
      if (requested === null) requested = value;
      continue;
    }

    if (arg === PROJECT_FLAG) {
      const next = args[index + 1];
      const value = next !== undefined && !next.startsWith('-') ? next : '';
      if (value !== '') index++; // the value belongs to the flag, not to Playwright
      if (requested === null) requested = value;
      continue;
    }

    rest.push(arg);
  }

  return { requested, rest };
}

/** Which phases this run executes, and the args to forward to Playwright. */
export interface PhasePlan {
  /**
   * The phases to run, in order. Never empty — resolution throws before it could be.
   *
   * 🔴 THAT INVARIANT IS CONTINGENT, not structural, since `optIn` exists: it holds because
   * `resolveAvailablePhases` throws when nothing is runnable AND no `required` phase of the
   * kit is `optIn` (see `E2EPhase.optIn`, which is why the pair is spelled out there). A
   * registry whose every runnable phase were `optIn` would filter down to `[]` here, and
   * `[].some(…)` is `false` — the green-having-tested-nothing run this file keeps closing.
   */
  phases: E2EPhase[];
  /** The user's args minus any `--project=`, which the runner injects per phase. */
  phaseArgs: string[];
}

/**
 * Pick phases from an optional `--project` filter (no flag → every available phase, in order).
 *
 * We inject the per-phase `--project`, so any one the user passed is stripped (in either
 * spelling — `extractProjectFlag`) to avoid a duplicate flag. Throws (never exits) so the
 * caller's cleanup still runs.
 *
 * Every name that is no phase of THIS checkout fails here (BND-005's guarantee, kept): a typo —
 * or a project name from another repo — used to plan the base phase and report green for a suite
 * the developer never asked for. What this issue changes is only the SOURCE of the valid list:
 * the phases actually available, kit plus project-declared, instead of a fixed pair of names.
 *
 * A phase declared `optIn` (`E2EPhase.optIn`) is the one thing this filter treats differently,
 * and in exactly one direction: it is dropped from the DEFAULT set and nowhere else. Named with
 * `--project` it resolves like any other, and the "no such phase" error below still enumerates
 * it — a phase that does not run by default has to stay discoverable, or the only way to learn
 * it exists is to read the source.
 *
 * @param skipped - what `resolveAvailablePhases` left out, so asking for a phase that WAS
 *   declared but is not runnable answers with the real reason rather than "no such phase".
 */
export function resolvePhasePlan(
  args: string[],
  available: readonly E2EPhase[],
  skipped: readonly SkippedPhase[] = []
): PhasePlan {
  const { requested, rest } = extractProjectFlag(args);

  // No filter ⇒ every available phase EXCEPT the ones that opted out of the default set. The
  // filter lives here and only here: `resolveAvailablePhases` still decides membership of the
  // registry (does this checkout declare the project?), which is an orthogonal question.
  if (requested === null)
    return { phases: available.filter((phase) => phase.optIn !== true), phaseArgs: rest };

  // Named explicitly ⇒ resolved like any other phase. The lookup deliberately does NOT filter
  // by `optIn`: naming a phase IS the opt-in, and that is the only way to run one.
  const match = available.find((phase) => phase.project === requested);
  if (match) return { phases: [match], phaseArgs: rest };

  const wasSkipped = skipped.find((entry) => entry.phase.project === requested);
  if (wasSkipped) {
    throw new Error(
      `--project='${requested}' names a phase this checkout cannot run: ${wasSkipped.reason}`
    );
  }

  throw new Error(
    `--project='${requested}' names no phase of this runner. This project's phases are: ` +
      `${available.map((phase) => `'${phase.project}'`).join(', ')}. ` +
      `Omit --project to run every phase.`
  );
}

/**
 * The source of the project's own Playwright config, or `null` when it ships none.
 *
 * Read ONCE per run and handed to `configDeclaresProject`, so a registry of N phases costs one
 * file read rather than N. Resolved through `findPlaywrightConfig` — the SAME resolver the
 * derived config is generated from, so both answer about one file. Looking only at
 * `playwright.config.ts` while the generator honoured all six extensions Playwright itself
 * resolves would make a derivative on a `.js` config get a correct derived config AND a
 * silently skipped phase — a green run for specs that never executed.
 */
export function readPlaywrightConfigSource(): string | null {
  const configPath = findPlaywrightConfig();
  if (!configPath) return null;
  return readFileSync(configPath, 'utf-8');
}

/**
 * Whether a Playwright config declares a project by that name.
 *
 * 🔴 THE NAME IS ESCAPED BEFORE IT REACHES THE EXPRESSION. This used to test
 * `/name:\s*['"]mfa['"]/` against the source, which was safe only because `'mfa'` is a constant
 * of the kit. Against a name a DERIVATIVE chooses, an unescaped dot or plus sign changes what
 * matches — and a false negative here does not fail loudly: the phase is skipped, the exit codes
 * come back from a shorter list, and the run is green for specs nobody executed. Backticks are
 * accepted alongside both quote styles for the same reason: every false negative is that bug.
 *
 * The invariant is the absence of a false negative, not the mechanism — asking Playwright
 * (`playwright test --list`) would satisfy it too, at the cost of a process per run. This stays
 * textual, and the failure policy of `resolveAvailablePhases` covers the residue: a phase the
 * PROJECT declared and this heuristic cannot see FAILS the run, it is never skipped.
 */
export function configDeclaresProject(source: string | null, name: string): boolean {
  if (!source || name === '') return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`name:\\s*['"\`]${escaped}['"\`]`).test(source);
}

/**
 * Whether this checkout's Playwright config declares `name` as a project.
 *
 * Exported for the injected-`fs` suite (E2E-006): the pre-MFA derivative this tolerates is a
 * FILE that is absent, which no argument can express.
 */
export function projectHasPhase(name: string): boolean {
  return configDeclaresProject(readPlaywrightConfigSource(), name);
}

// ---------------------------------------------------------------------------
// Is the disposable-database guard actually WIRED in this checkout? (BND-016)
// ---------------------------------------------------------------------------

/** Where the two-line retrofit lives. Printed, never resolved — it is documentation. */
export const GUARD_RETROFIT_DOC = '.claude/docs/retrofits/e2e-disposable-db-guard.md';

/**
 * What a `globalSetup` file must contain for the guard to be considered wired: a CALL to
 * `assertDisposableBranch`, not a mention of it.
 *
 * 🔴 THE MENTION USED TO BE ENOUGH, AND THAT WAS THE HOLE. The rule accepted either the module
 * specifier (`e2e-guard`) or the bare function name, on the argument that "an import without the
 * call is a shape nobody writes". One person writes it, deliberately: whoever finds the guard in
 * their way. Deleting the call leaves an orphan import that eslint catches, so the cheap way out
 * is to COMMENT THE LINE — after which the import is still on disk, still matches `e2e-guard`, and
 * the checkout reports `wired` with no guard in effect. The one state this detection exists to
 * make audible was the one it hid.
 *
 * Hence: the call form, over a source with its comments removed (`stripSourceComments`).
 */
const GUARD_CALL_PATTERN = /assertDisposableBranch\s*\(/;

/**
 * The `globalSetup` KEY, regardless of whether its value can be read. `findGlobalSetupPath`
 * answers "which file", which is a different question from "does this config run one at all" —
 * and conflating them is what turned a config that names its setup through a variable into a
 * banner claiming the guard is not in effect (see `undetermined`).
 */
const GLOBAL_SETUP_KEY_PATTERN = /globalSetup\s*:/;

/** The three ways a JavaScript source opens a string literal. */
const QUOTE_CHARS = new Set(["'", '"', '`']);

/**
 * The index of the quote that CLOSES the literal opened at `open`, or `-1` when there is none.
 *
 * A backslash escapes whatever follows it, so `'it\'s'` closes at the last quote and not the
 * middle one. And a `'`/`"` literal may not span lines: if the line ends first, the quote was
 * never a string opener (a regex character class, an apostrophe in prose), so the scan reports
 * no closer and the caller treats it as ordinary text. That bound is what keeps one stray quote
 * from swallowing the rest of the file. A backtick has no such bound — a template literal is
 * multi-line by design.
 */
function findClosingQuote(source: string, open: number): number {
  const quote = source[open];
  const spansLines = quote === '`';
  for (let index = open + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      index += 1; // the escaped character, whatever it is, is not a delimiter
      continue;
    }
    if (char === quote) return index;
    if (!spansLines && char === '\n') return -1;
  }
  return -1;
}

/**
 * The source with its comments removed, so a textual check answers about CODE.
 *
 * STRING-AWARE, and that is the whole point. A single left-to-right scan copies a
 * quoted literal through WHOLE, so a `//` inside one is text rather than the start of a comment.
 * The previous rule was two regexes plus one exemption — a `//` preceded by `:` was left alone
 * because it is "almost always a URL" — which meant any other `//` inside a string swallowed the
 * rest of its line. When the line held the call this feeds (`checkGuardWiring`), the result was a
 * banner announcing an unguarded checkout that was in fact guarded: an alarm firing in a healthy
 * repo, which is how an alarm stops being believed.
 *
 * The scan is also what makes the two halves compose: a quote inside a comment is skipped WITH
 * the comment, and a `//` inside a string is skipped with the string, neither of which a pair of
 * independent regex passes can express.
 *
 * ℹ️  Residue, stated rather than left to be discovered: a REGEX LITERAL is not tokenized, so a
 * lone quote inside one (`/['"]/`) opens a literal that the same line has to close — the
 * line-bound above is what keeps that local. And an unterminated backtick makes everything after
 * it read as one template literal, so no comment past it is stripped; that source does not
 * compile, so it is not a shape a config in use can have.
 */
export function stripSourceComments(source: string): string {
  let stripped = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      // A space, never nothing: `a/* c */b` must not become the single token `ab`.
      stripped += ' ';
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index + 2);
      // Stop AT the newline, never past it — the next turn of the loop copies it, so line
      // numbers and the `[^,\n]` bounds of the patterns that read this survive intact.
      index = end === -1 ? source.length : end;
      continue;
    }

    if (QUOTE_CHARS.has(char)) {
      const closing = findClosingQuote(source, index);
      if (closing !== -1) {
        stripped += source.slice(index, closing + 1);
        index = closing + 1;
        continue;
      }
    }

    stripped += char;
    index += 1;
  }

  return stripped;
}

/** Extensions tried when a config names its `globalSetup` without one. */
const GLOBAL_SETUP_EXTENSIONS = ['', '.ts', '.js', '.mjs', '.cjs'];

/**
 * Why the guard is (or is not) in effect for this checkout:
 *   - `wired`            — a `globalSetup` exists and CALLS the guard. Nothing to say.
 *   - `no-config`        — this checkout ships no Playwright config at all.
 *   - `no-global-setup`  — the config declares none, so nothing runs before the specs.
 *   - `unreadable`       — it declares one, and the file it names could not be read.
 *   - `not-invoked`      — the file is there and never calls the guard.
 *   - `undetermined`     — the config DOES declare a `globalSetup`, and the textual read cannot
 *                          extract its path (`globalSetup: setupPath`). Not an answer, and
 *                          therefore not a banner: see `guardWiringWarning` / `guardWiringNote`.
 */
export type GuardWiringStatus =
  | 'wired'
  | 'no-config'
  | 'no-global-setup'
  | 'unreadable'
  | 'not-invoked'
  | 'undetermined';

export interface GuardWiringVerdict {
  status: GuardWiringStatus;
  /** What the config named, when it named something — printed so the fix has an address. */
  globalSetupPath: string | null;
}

/**
 * The path a Playwright config declares as its `globalSetup`, or `null`.
 *
 * Textual, like `configDeclaresProject`, and for the same reason: asking Playwright would cost a
 * process per run. It takes the FIRST quoted string after the key, so the `require.resolve('…')`
 * spelling answers as well as a bare literal. A false negative here costs a warning, never a
 * refused run — which is the whole reason the failure policy below is a warning (see
 * `guardWiringWarning`).
 */
export function findGlobalSetupPath(source: string | null): string | null {
  if (!source) return null;
  const match = stripSourceComments(source).match(/globalSetup\s*:[^,\n]*?['"`]([^'"`]+)['"`]/);
  return match ? match[1] : null;
}

/**
 * Whether the config declares a `globalSetup` AT ALL — the question `findGlobalSetupPath` cannot
 * answer, because a `null` from it means both "there is none" and "there is one and I cannot read
 * its path". Those two deserve opposite treatments, which is the whole point of `undetermined`.
 */
export function configDeclaresGlobalSetup(source: string | null): boolean {
  return source !== null && GLOBAL_SETUP_KEY_PATTERN.test(stripSourceComments(source));
}

/**
 * Whether the disposable-database guard (`e2e-guard.ts`) actually runs in this checkout.
 *
 * 🔴 WHY THE RUNNER ASKS AT ALL. The guard and the runner that mints its marker both travel to a
 * derivative through `scripts/**`; the ONE line that invokes it lives in `tests/global-setup.ts`,
 * and `tests/**` is in no distribution profile (BR-FACTORY-006 — it is frozen at bootstrap). So a
 * derivative that runs `factory update` receives the guard on disk and no guard in effect, while
 * the kit's docs and the update's own summary say the suite is protected. Nothing detected that.
 * This does, from the side that DOES travel.
 *
 * Pure over its two inputs so the rule is exercised with a config source and a fake reader — no
 * `tests/` directory required, which matters because this file's suites run inside derivatives
 * whose tree nobody here controls.
 */
export function checkGuardWiring(options: {
  configSource: string | null;
  /** Project-relative path → contents, or `null` when it cannot be read. */
  readSource: (relPath: string) => string | null;
}): GuardWiringVerdict {
  const { configSource, readSource } = options;
  if (!configSource) return { status: 'no-config', globalSetupPath: null };

  const declared = findGlobalSetupPath(configSource);
  if (!declared) {
    // A config that names its setup through a variable (`globalSetup: setupPath`) declares one
    // and hides its path from a textual read. Reporting that as `no-global-setup` printed the
    // full "the guard is not in effect" banner at a checkout that had it wired — and an alarm
    // that fires in a healthy repo is how the alarm stops being believed.
    return configDeclaresGlobalSetup(configSource)
      ? { status: 'undetermined', globalSetupPath: null }
      : { status: 'no-global-setup', globalSetupPath: null };
  }

  for (const extension of GLOBAL_SETUP_EXTENSIONS) {
    const contents = readSource(`${declared}${extension}`);
    if (contents === null) continue;
    const wired = GUARD_CALL_PATTERN.test(stripSourceComments(contents));
    return { status: wired ? 'wired' : 'not-invoked', globalSetupPath: `${declared}${extension}` };
  }

  return { status: 'unreadable', globalSetupPath: declared };
}

/**
 * One sentence naming what is missing, per status.
 *
 * `undetermined` is deliberately absent: there is nothing to diagnose there — the detection did
 * not reach a verdict, and a message that pretends otherwise is the false alarm this table exists
 * to avoid. That status is handled by `guardWiringNote`, and the type says so.
 */
const GUARD_WIRING_DIAGNOSIS: Record<
  Exclude<GuardWiringStatus, 'wired' | 'undetermined'>,
  string
> = {
  'no-config': 'this checkout declares no Playwright config, so there is no globalSetup to run.',
  'no-global-setup':
    'the Playwright config declares no `globalSetup`, so nothing runs before the specs are loaded.',
  unreadable: 'the `globalSetup` the Playwright config names could not be read.',
  'not-invoked':
    'the `globalSetup` file never calls `assertDisposableBranch()` (a call inside a comment does not count).',
};

/**
 * The warning the runner prints when the guard is not wired — `null` when it is.
 *
 * 🔴 WHY A WARNING AND NOT AN ABORT. Three reasons, and the first is the load-bearing one:
 *
 *   1. THIS run is already safe. It came through the runner, so it has a throwaway branch and
 *      the marker to prove it. What is unguarded is the run that goes AROUND the runner — a
 *      process this one neither observes nor can stop. Aborting would deny a safe run in order
 *      to punish an unrelated one.
 *   2. A brain artifact tolerates the tree it lands on (BR-FACTORY-006). Everything here reaches
 *      a derivative through `factory update`, and the derivative that lacks the retrofit is
 *      precisely the one that would experience the abort as "the update broke my E2E suite" —
 *      the exact reflex that leads to running `pnpm exec playwright test` directly, which is the
 *      unguarded path.
 *   3. The detection is textual (`findGlobalSetupPath`), so a false negative is possible. A
 *      failure policy has to be the one whose false-positive cost is a message rather than a
 *      dead suite.
 *
 * The defect being closed is SILENCE, not permissiveness: nothing told anybody the wiring was
 * missing. So the message says what is missing, why it matters and where the retrofit is — and
 * `main` prints it twice, at the start AND at the end of the run, because a line at the top of a
 * seven-minute suite is a line nobody reads.
 *
 * 🔴 AND IT IS RESERVED FOR WHAT THE DETECTION CAN AFFIRM. `undetermined` gets no banner (see
 * `guardWiringNote`): a repo whose config names its setup through a variable is a repo that may be
 * perfectly wired, and a red banner there teaches the reader that this banner means nothing —
 * which would disarm, by erosion, the very mechanism it was built to serve.
 */
export function guardWiringWarning(verdict: GuardWiringVerdict): string | null {
  if (verdict.status === 'wired' || verdict.status === 'undetermined') return null;

  const named = verdict.globalSetupPath ? ` (${verdict.globalSetupPath})` : '';
  return [
    '',
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '⚠️  THE DISPOSABLE-DATABASE GUARD IS NOT IN EFFECT IN THIS CHECKOUT.',
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `    What is missing: ${GUARD_WIRING_DIAGNOSIS[verdict.status]}${named}`,
    '',
    '    Why it matters: `pnpm exec playwright test <spec>` loads `.env.local` from the',
    '    Playwright config itself, so it runs the suite against whatever DATABASE_URL that',
    '    file holds — no throwaway branch, no isolation. On one derivative that file shared',
    '    an endpoint with production, and a handful of specs wrote to it.',
    '',
    '    THIS run is safe: it came through the runner, which created a throwaway branch for',
    '    it. What is unguarded is every run that goes AROUND the runner.',
    '',
    `    Fix it once — two lines: ${GUARD_RETROFIT_DOC}`,
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ].join('\n');
}

/**
 * The ONE line printed when the wiring could not be verified — `null` for every other status.
 *
 * A note, not a warning, and printed once rather than repeated at the end: it states a limit of
 * this runner's reading, not a defect of the checkout. Saying nothing at all was the other
 * candidate and it loses on a small margin — a derivative that never sees the banner deserves to
 * know it was not cleared either.
 */
export function guardWiringNote(verdict: GuardWiringVerdict): string | null {
  if (verdict.status !== 'undetermined') return null;
  return (
    'ℹ️  The Playwright config declares a `globalSetup` whose path is not a literal, so whether ' +
    'the disposable-database guard is wired could not be verified from here — no claim either ' +
    `way. If it is not wired: ${GUARD_RETROFIT_DOC}`
  );
}

// ---------------------------------------------------------------------------
// Does the ACTIVE CI workflow carry the auth-variables step? (GAP-005)
// ---------------------------------------------------------------------------

/** The workflow `pnpm setup:e2e` generates — the ACTIVE one, not the `.example` it comes from. */
export const CI_WORKFLOW_PATH = '.github/workflows/e2e.yml';

/**
 * The adoption guide the notice points at, INSTEAD of a bare `pnpm setup:e2e`.
 *
 * 🔴 The distinction is the whole reason this constant exists. `setup:e2e` regenerates the
 * workflow from the template and overwrites it whole — right for a project that never
 * customized it, destructive for one that did. A notice that says "run setup:e2e" is a trap
 * for whoever follows it literally, and an agent follows it more literally than a human. The
 * doc carries the four lines to paste by hand and the `git diff --no-index` that tells the two
 * cases apart.
 */
export const CI_ENV_RETROFIT_DOC = '.claude/docs/retrofits/e2e-ci-auth-env.md';

/**
 * What identifies the step, in the workflow's text: the invocation itself.
 *
 * The invocation rather than a marker comment, because a marker is deletable while leaving the
 * step working, and a step is deletable while leaving the marker. This string is the one thing
 * that cannot be present without the behaviour being present.
 */
export const CI_ENV_STEP_MARKER = 'setup-e2e.ts --emit-ci-env';

/**
 * What makes a workflow one that RUNS THE SUITE, and therefore one this notice is about.
 *
 * The kit also ships a disabled `e2e.yml` placeholder (every job `if: false`), and a project can
 * have a workflow that only lints. Neither has anything to retrofit, and a notice on every local
 * run of a repo that never enabled E2E in CI is exactly how a notice stops being read. Exempt by
 * SHAPE, never by name — the same rule `workflow-permissions.test.ts` applies to the placeholder,
 * and it expires on its own the moment somebody activates the workflow.
 */
export const CI_SUITE_MARKER = 'pnpm test:e2e';

export type CiEnvStepStatus = 'no-workflow' | 'no-suite' | 'present' | 'missing';

/**
 * Whether an ACTIVE `e2e.yml` that runs the suite carries the step that puts the project's auth
 * flags into the job.
 *
 * Comment lines are removed first, and for the same reason `checkGuardWiring` strips them: the
 * cheap way to disable a step is to comment it out, and a detection that accepted a commented
 * line would report `present` for a workflow where nothing runs. A YAML comment is a `#` — this
 * drops a line whose first non-blank character is one, which is where either marker could
 * plausibly be quoted in prose. A trailing `#` after code is left alone: it cannot precede one.
 */
export function checkCiEnvStep(workflowSource: string | null): CiEnvStepStatus {
  if (workflowSource === null) return 'no-workflow';

  const code = workflowSource
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  if (!code.includes(CI_SUITE_MARKER)) return 'no-suite';
  return code.includes(CI_ENV_STEP_MARKER) ? 'present' : 'missing';
}

/**
 * The notice printed when the active workflow predates the step — `null` otherwise.
 *
 * 🔴 A NOTICE, NEVER AN ABORT, and the reason is structural rather than lenient. `e2e.yml` is
 * EXCLUDED from the distribution profile (only `e2e.yml.example` travels), so `factory update`
 * refreshes the template and cannot touch the workflow a project already generated. A repo that
 * enabled E2E before this existed therefore keeps a workflow without the step, and nothing about
 * that is the fault of the run doing the checking — which is local, and unaffected: `.env.local`
 * is right here. What is wrong is the NEXT CI run, and the remedy is one command.
 *
 * `no-workflow` and `no-suite` are silent on purpose: a project that never enabled E2E in CI —
 * or whose workflow does not run the suite, the kit's own disabled placeholder included — has
 * nothing to retrofit, and a notice there would be noise in every local run for ever.
 */
export function ciEnvStepNotice(status: CiEnvStepStatus): string | null {
  if (status !== 'missing') return null;
  return [
    '',
    `⚠️  ${CI_WORKFLOW_PATH} does not carry the step that puts this project's auth flags`,
    '    (NEXT_PUBLIC_AUTH_*) into the CI job, so CI runs with the kit defaults instead of what',
    '    `.env.local` says. A suite that structurally skips on a flag then runs the opposite of',
    '    the app — self-registration is the measured case — and reports green.',
    '',
    '    THIS run is unaffected: it reads `.env.local` directly.',
    '',
    `    It only MATTERS if some NEXT_PUBLIC_AUTH_* of yours differs from the kit default`,
    '    (registration/password/password-reset default on, the rest off). All defaults ⇒ CI is',
    '    already running the right posture and there is nothing to do.',
    '',
    `    How to adopt it: ${CI_ENV_RETROFIT_DOC}`,
    '',
    '    🔴 Do NOT reach for `pnpm setup:e2e` unless you know this workflow is unmodified.',
    '    That command REGENERATES the file from the template and overwrites it whole —',
    '    including `E2E_PARENT_BRANCH`, which it warns about but does NOT preserve, plus any',
    '    job, matrix or step you added by hand. The doc carries the four lines to paste',
    '    instead, and the check for telling the two cases apart.',
    '',
  ].join('\n');
}

/**
 * Read a project-relative file, or `null` when it is not there.
 *
 * The io half of `checkGuardWiring`, kept apart from the rule so the rule stays pure. Exported
 * for the injected-`fs` suite (E2E-006).
 */
export function readProjectSource(relPath: string): string | null {
  const absolute = resolve(process.cwd(), relPath);
  if (!existsSync(absolute)) return null;
  try {
    return readFileSync(absolute, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Environment per step — computed separately from the process spawn, so the
// env is assertable without running anything.
// ---------------------------------------------------------------------------

export interface ServerEnvOptions {
  /** Env to layer on top of — `process.env` in the real run. */
  baseEnv: EnvVars;
  /** The throwaway Neon branch this run created. */
  databaseUrl: string;
  port: number;
  mfaEncryptionKey: string;
}

/**
 * What the `next start` server of ANY phase runs with, on top of the inherited environment —
 * the RUN's base, which every phase's `env()` is then layered onto (`composePhaseEnv`).
 *
 * Everything here is a property of the run, not of a phase: the throwaway branch, the port, the
 * key that both processes must share. The only per-phase values the kit has — `MFA_ENABLED` /
 * `MFA_REQUIRED_ALL` — moved out to `KIT_PHASES`, which is what stopped this function from
 * taking a boolean that only one caller ever varied.
 */
export function serverEnvOverrides(options: ServerEnvOptions): EnvOverrides {
  const { baseEnv, databaseUrl, port, mfaEncryptionKey } = options;

  return {
    // Replaces the inherited value rather than composing with it, unlike the Playwright spawn
    // (`nodeOptionsWithCompileGuard`) — and deliberately carries NO compile-guard stub. This
    // process serves the BUNDLED build, where `server-only` / `client-only` are resolved by
    // Next at build time and never reach Node as packages. Stubbing them here would neutralize
    // a real guarantee of the app under test instead of an artifact of the test runner.
    //
    // ⚠️ The consequence of that replace: a `NODE_OPTIONS` set by CI does NOT reach this
    // process — the heap ceiling of the server under test is decided HERE and nowhere else.
    // The replace exists to drop the stub, not to pin a number, so the number is free to
    // move: 4096 matches what the CI workflows declare, after derived projects kept hitting
    // `JavaScript heap out of memory` at the previous 2048.
    NODE_OPTIONS: '--max-old-space-size=4096',
    DATABASE_URL: databaseUrl,
    PORT: String(port),
    // Align the app's public origin with the actual E2E port. The server runs on
    // localhost:E2E_PORT, but .env.local pins NEXT_PUBLIC_APP_URL to :3000 — a
    // mismatch that breaks any same-origin check against the canonical origin
    // (e.g. the passkey CSRF Origin allow-list and the WebAuthn expectedOrigin,
    // which the in-browser virtual authenticator signs with the real :E2E_PORT).
    NEXT_PUBLIC_APP_URL: e2eServerUrl(port),
    // Ensure consistent auth config for tests
    AUTH_SECRET: baseEnv.AUTH_SECRET || 'test-secret-minimum-32-characters-required',
    AUTH_TRUST_HOST: 'true',
    // TOTP secrets are encrypted at rest with this key. The server decrypts them on
    // the /2fa + step-up paths; specs encrypt seeded secrets with the SAME key
    // (forwarded to Playwright too). Without it, every TOTP-touching flow throws
    // "MFA_ENCRYPTION_KEY is not set".
    MFA_ENCRYPTION_KEY: mfaEncryptionKey,
    // Disable real email delivery during E2E. Auth flows (email-change,
    // password-reset, takeover alerts, notifications) gate every send behind
    // isEmailConfigured()/isEmailReady(), which both return false for "none".
    // Without this the server would inherit EMAIL_PROVIDER=smtp from .env.local
    // and blast real emails to the test addresses (@example.com / @test.com).
    EMAIL_PROVIDER: 'none',
    // `EMAIL_PROVIDER='none'` makes the SERVER disable magic-link (env.ts gates it on
    // `isEmailConfigured()` inside a `typeof window === 'undefined'` branch), but the
    // CLIENT only sees `NEXT_PUBLIC_AUTH_MAGIC_LINK` — left `true` (from .env.local) it
    // renders the magic-link button on the client but NOT the server → an SSR/CSR
    // hydration mismatch on /login that breaks the passkey CTA (conditional-UI) spec.
    // Pin the public flag off too so both agree (no email ⇒ no magic-link in tests).
    NEXT_PUBLIC_AUTH_MAGIC_LINK: 'false',
    // Rate limiter OFF for the server of this run — fixed here, never inherited (same
    // treatment as MFA_ENABLED and EMAIL_PROVIDER above, and deliberately not AUTH_SECRET's
    // `baseEnv || fallback`: that one inherits because the kit has no valid secret to pin).
    // The whole suite comes out of loopback and therefore shares ONE bucket per limiter,
    // while `auth.setup.ts` logs in once per role in a tight loop and the MFA/passkey specs
    // authenticate inline. Login is not even the narrowest bucket (register 3/h, email
    // verification 1/h, recovery codes 3/h). The alternative — raising the login bucket —
    // is refused: that value exists for production. Latent rather than observed today, and
    // the symptom is indistinguishable from a product bug (a rejection mid-run whose message
    // never mentions a limiter). Only this `next start` process is affected; `pnpm dev` and
    // production keep the shipped default (ON).
    RATE_LIMIT_ENABLED: 'false',
    // AUDIT-028: revalidate the JWT session against the DB on EVERY authenticated
    // request (interval 0) instead of the 5-min production default, so the
    // session-revalidation spec can prove a banned mid-session user is expelled
    // without a 5-minute wall-clock wait. Test-only override — the Node `jwt()`
    // callback reads this at module-init; production leaves it unset (5-min default).
    SESSION_REVALIDATION_INTERVAL_MS: '0',
  };
}

// ---------------------------------------------------------------------------
// Compile-guard stub — how `server-only` / `client-only` stop killing specs
// ---------------------------------------------------------------------------

/**
 * The `--import` entry module, RELATIVE TO THIS FILE. Resolved against `__dirname` and never
 * against `process.cwd()`: it is a sibling of the runner, and both travel in the same tracked
 * set (`scripts/**`), so a project that has this runner necessarily has that file.
 */
export const COMPILE_GUARD_INIT_MODULE = 'e2e/compile-guard-init.mjs';

/**
 * The stub's entry module as a `file://` URL — the value that goes into `NODE_OPTIONS`.
 *
 * WHY A URL AND NOT THE PATH (measured, not assumed). `NODE_OPTIONS` is split on WHITESPACE by
 * Node itself, so a checkout under `~/Google Drive/…` or `~/My Projects/…` — ordinary on macOS
 * — turns `--import=/Users/x/My Projects/…` into a flag pointing at `/Users/x/My` plus a stray
 * token, and Node aborts with `ERR_MODULE_NOT_FOUND` before Playwright ever starts. A file URL
 * percent-encodes the space (`My%20Projects`), so the value has no whitespace left to split on,
 * on any platform, with or without a shell. It also gives Windows a forward-slash form
 * (`file:///C:/…`) instead of backslashes. Same class of defect `resolveSpawnShell` documents
 * for argv, and the same fix shape: remove the whitespace rather than hope nobody quotes wrong.
 *
 * WHY THE RUNNER SETS IT AND NOT `playwright.config.ts`. `--import` only applies at the BOOT of
 * a process, and Playwright collects specs in its MAIN process. Setting `process.env.NODE_OPTIONS`
 * from inside the config is already too late for that process — it would only reach the forked
 * workers, so every spec would still die during collection, which is precisely when the failure
 * happens. It has to be in the environment of the spawn, which is here.
 *
 * Pure: no filesystem read, so it stays assertable in the no-fs suite. There is deliberately no
 * `existsSync` fallback either — the file cannot be absent while this runner is present (one
 * tracked set, swapped atomically by `factory update`), and a silent "skip the injection" would
 * degrade back to the original bug instead of failing where it can be read.
 */
export function compileGuardInitUrl(): string {
  return pathToFileURL(resolve(__dirname, COMPILE_GUARD_INIT_MODULE)).href;
}

/**
 * `NODE_OPTIONS` for the Playwright process: whatever the developer's environment already had,
 * plus the compile-guard stub.
 *
 * COMPOSED, NEVER OVERWRITTEN. `NODE_OPTIONS` is a variable a developer legitimately sets (a
 * heap ceiling, `--trace-warnings`, an inspector) and a CI provider legitimately injects.
 * Replacing it would silently drop settings that have nothing to do with this runner, and the
 * loss would only show up as an unrelated failure much later.
 *
 * IDEMPOTENT, by exact token rather than by substring. A run started from an environment that
 * already carries our flag (a nested invocation, a shell that exported it) must not accumulate
 * copies. The comparison is against whitespace-separated TOKENS, so a different `--import` that
 * merely CONTAINS our URL as a prefix — `--import=<url>.bak` — is correctly seen as somebody
 * else's flag rather than ours. (A duplicate would be harmless in practice: Node evaluates a
 * repeated `--import` of the same URL only once, measured on 22.14. Correctness here is about
 * not writing a value that grows on every pass.)
 *
 * Pure, and separate from `playwrightEnvOverrides`, so both halves of the contract — compose,
 * do not duplicate — are assertable without an environment.
 */
export function nodeOptionsWithCompileGuard(existing: string | undefined, initUrl: string): string {
  const flag = `--import=${initUrl}`;
  const current = (existing ?? '').trim();

  if (current === '') return flag;
  if (current.split(/\s+/).includes(flag)) return current;
  return `${current} ${flag}`;
}

export interface PlaywrightEnvOptions {
  /** Env to layer on top of — `process.env` in the real run. Read for `NODE_OPTIONS`. */
  baseEnv: EnvVars;
  databaseUrl: string;
  mfaEncryptionKey: string;
  /** `file://` URL of the compile-guard entry module — `compileGuardInitUrl()` in the real run. */
  compileGuardInit: string;
  /** The port this run's server actually listens on — published as `E2E_PORT` (see below). */
  port: number;
}

/** What the Playwright process runs with, on top of the inherited environment. */
export function playwrightEnvOverrides(options: PlaywrightEnvOptions): EnvOverrides {
  const { baseEnv, databaseUrl, mfaEncryptionKey, compileGuardInit, port } = options;

  return {
    DATABASE_URL: databaseUrl,
    // The port this run CHOSE, published so a spec can build an origin the runner never sees.
    //
    // The derived config rewrites the `baseURL` of every Playwright project, which covers a spec
    // that navigates relative to it. It cannot rewrite an origin a spec assembles ITSELF — and a
    // project with several (a tenant host, an ops host, a central one) has to assemble them. With
    // no port published, the only source left was `package.json#ports.e2e`, so emptying that key
    // to enable per-checkout ports left such a project with a server on one port and its setup
    // navigating to another: ERR_CONNECTION_REFUSED, in a message that mentions neither the
    // runner nor the update that changed it. Reported by a derivative, 2026-08-14.
    E2E_PORT: String(port),
    // The disposable-database guard's positive proof (`e2e-guard.ts`, invoked from
    // `tests/global-setup.ts`): the SAME value as DATABASE_URL above — the connection URI of
    // the branch this run just created — and never a fixed token. The guard demands the two
    // match, so a process that did not come through here has nothing it could set: the value
    // belongs to a branch Neon minted seconds ago. A fixed marker (the `'1'` this replaces)
    // was exportable by hand, which is how a derivative ended up with the guard armed and
    // bypassed at the same time. Deleting this key must fail a test — see
    // `e2e-runner.test.ts`, `describe('playwrightEnvOverrides')`.
    [DISPOSABLE_BRANCH_ENV_KEY]: databaseUrl,
    // Neutralize `server-only` / `client-only` for this process AND for the workers it forks
    // (they inherit this environment). Without it, any spec that transitively reaches a
    // server-guarded module dies while being LOADED — see `compileGuardInitUrl`.
    NODE_OPTIONS: nodeOptionsWithCompileGuard(baseEnv.NODE_OPTIONS, compileGuardInit),
    // Same key the server uses — specs encrypt seeded TOTP secrets with it so
    // the server can decrypt them (must match buildServerEnv's MFA_ENCRYPTION_KEY).
    MFA_ENCRYPTION_KEY: mfaEncryptionKey,
    // AUDIT-028: mirror the server's override into the Playwright process so the
    // session-revalidation spec's structural-skip guard sees the small interval and
    // runs (the spec reads process.env.SESSION_REVALIDATION_INTERVAL_MS to decide).
    SESSION_REVALIDATION_INTERVAL_MS: '0',
    // Never auto-open HTML report — it blocks the runner and prevents cleanup
    PLAYWRIGHT_HTML_OPEN: 'never',
  };
}

// ---------------------------------------------------------------------------
// Per-phase environment — the run's base, plus what the phase declares, with the
// keys a phase may not touch
// ---------------------------------------------------------------------------

/**
 * The variable Playwright's html reporter reads for its output folder.
 *
 * It WINS over the reporter's own `outputFolder` option (`reportFolderFromEnv()` in
 * `playwright/lib/reporters/html.js`, verified against 1.58), which is what makes it usable as a
 * per-phase override without touching the project's config.
 */
export const HTML_REPORT_DIR_ENV_KEY = 'PLAYWRIGHT_HTML_OUTPUT_DIR';

/**
 * The directory the html reports live under — Playwright's own default, kept deliberately.
 *
 * A run now writes ONE SUBDIRECTORY PER PHASE beneath it (`playwright-report/chromium`,
 * `playwright-report/mfa`) rather than a single report at the root. Keeping the root name means
 * the `upload-artifact` step of a CI workflow that already collects `playwright-report/` picks up
 * both without anybody editing a workflow.
 */
export const HTML_REPORT_ROOT_DIR = 'playwright-report';

/**
 * Where ONE phase's html report goes, relative to the checkout root.
 *
 * 🔴 THE NAME BECOMES A PATH SEGMENT, AND THE REPORTER DELETES THAT DIRECTORY as it starts
 * (`removeFolders([this._outputFolder])` in the html reporter's `onEnd`). Same exposure as
 * `--output=test-results/<project>`, so it is validated by the same rule — a phase name comes
 * from `scripts/tools/e2e.project.ts`, a file the runner executes but does not own. It throws
 * rather than sanitizing: a clamped path would look accepted while aiming somewhere else.
 *
 * `/` rather than `path.join`: the value is also printed as an argument of
 * `playwright show-report`, and a Windows backslash there is an escape character in most shells.
 * The absolute form the reporter needs is built by `phaseHtmlReportDir`.
 */
export function phaseHtmlReportPath(project: string): string {
  if (!isValidPhaseProjectName(project)) {
    throw new Error(
      `E2E phase project name '${project}' cannot be used as a path segment for its html ` +
        `report. Allowed: letters, digits, '.', '_' and '-', with at least one alphanumeric ` +
        `character, and never '.' or '..' — see PHASE_PROJECT_NAME_PATTERN.`
    );
  }
  return `${HTML_REPORT_ROOT_DIR}/${project}`;
}

/**
 * The ABSOLUTE directory one phase's html report goes to.
 *
 * Absolute on purpose, and for the same reason `--output` is: Playwright resolves the value of
 * `PLAYWRIGHT_HTML_OUTPUT_DIR` with `path.resolve()` against the CWD OF ITS OWN PROCESS. The
 * runner spawns it with `cwd: process.cwd()`, so a relative value written by somebody invoking
 * the runner from a subdirectory would land the report outside the tree the CI artifact step
 * collects — and the evidence would be missing with everything else looking correct.
 */
export function phaseHtmlReportDir(project: string, rootDir: string): string {
  return resolve(rootDir, phaseHtmlReportPath(project));
}

/**
 * Keys a phase may never declare, in `server` or in `playwright`.
 *
 * Every one of them is infrastructure OF THE RUN, and overwriting it from a project file breaks
 * a guarantee that lives somewhere else:
 *
 *   · `DATABASE_URL`       — the throwaway branch. It is also the disposable-database guard's
 *                            positive proof (§1.6): a phase that moved it would disarm the one
 *                            mechanism standing between a suite and somebody's real database.
 *   · `PORT`               — the port hand-off between phases; the server would bind elsewhere
 *                            than the config Playwright was handed drives.
 *   · `NEXT_PUBLIC_APP_URL`— baked at build time AND read at runtime; see the prefix rule below.
 *   · `NODE_OPTIONS`       — carries the compile-guard stub (§1.5); dropping it kills every spec
 *                            that transitively reaches a `server-only` module, at LOAD time.
 *   · `E2E_DISPOSABLE_BRANCH` — the OTHER half of that same guard. Protecting `DATABASE_URL`
 *                            alone left the marker writable, and the guard's rule is an
 *                            EQUALITY between the two: a phase that set the marker to whatever
 *                            it wanted `DATABASE_URL` to be would satisfy the comparison without
 *                            the runner's branch being involved at all. Both sides of a positive
 *                            proof have to be out of reach, or it is not a proof.
 *   · `PLAYWRIGHT_HTML_OUTPUT_DIR` — where THIS phase's html report lands. It is derived from
 *                            the phase's own `project` (`phaseHtmlReportDir`) precisely so two
 *                            phases cannot share a directory; a phase that pinned it would put
 *                            every phase back on one folder, where the last one to finish
 *                            deletes the evidence of the one that failed. That is the defect
 *                            this key exists to close, so it may not be reopened from a
 *                            project file.
 *
 * Named, not spelled out in prose at the point of use (`CODING.md §5`), and exported so the
 * documentation and the guide quote the same list the code enforces.
 */
export const PROTECTED_PHASE_ENV_KEYS: readonly string[] = [
  'DATABASE_URL',
  'PORT',
  'NEXT_PUBLIC_APP_URL',
  'NODE_OPTIONS',
  DISPOSABLE_BRANCH_ENV_KEY,
  HTML_REPORT_DIR_ENV_KEY,
];

/**
 * No phase may declare ANY variable with this prefix — not just the protected ones by name.
 *
 * The build happens ONCE, before the phases (`prepareBuild`), and that is where the public vars
 * are baked into the client bundle. A phase that set one would move what the SERVER renders and
 * leave the bundle the browser downloaded untouched → a hydration mismatch, the same failure the
 * runner already documents for `NEXT_PUBLIC_AUTH_MAGIC_LINK`. The shape invites the attempt, so
 * it is refused explicitly instead of silently producing a suite that fails somewhere else.
 */
export const PUBLIC_ENV_PREFIX = 'NEXT_PUBLIC_';

/**
 * The run's base plus what one phase declared — an OVERLAY, never a replacement.
 *
 * A phase that returned a bare object would otherwise run without the branch connection, without
 * a port and without an auth secret — or worse, pointed at whatever `.env.local` holds.
 *
 * @param where - names the phase and half ("smoke (server)") in the failure, so the message says
 *   which of a project's phases to fix rather than only which key is wrong.
 */
export function composePhaseEnv(
  base: EnvOverrides,
  override: EnvOverrides | undefined,
  where = 'a phase'
): EnvOverrides {
  if (!override) return { ...base };

  // Compared in UPPER CASE, and that is not cosmetic: environment variables are
  // case-INSENSITIVE on Windows, so a phase that declared `Database_Url` would sail past a
  // case-sensitive filter here and then land on the very variable this list protects once the
  // spawn inherits it. Both rules are normalized — the prefix one carries the same exposure.
  const offenders = Object.keys(override).filter((key) => {
    const normalized = key.toUpperCase();
    return (
      PROTECTED_PHASE_ENV_KEYS.includes(normalized) || normalized.startsWith(PUBLIC_ENV_PREFIX)
    );
  });
  if (offenders.length > 0) {
    throw new Error(
      `E2E phase ${where} declares ${offenders.length === 1 ? 'a key' : 'keys'} it may not set: ` +
        `${offenders.join(', ')}. Protected by the runner: ${PROTECTED_PHASE_ENV_KEYS.join(', ')} ` +
        `(infrastructure of the run) and everything prefixed ${PUBLIC_ENV_PREFIX} (baked into the ` +
        `single build that precedes every phase — setting one per phase desynchronizes server ` +
        `and client). Nothing was applied.`
    );
  }

  return { ...base, ...override };
}

/** The two environments one phase actually runs with. */
export interface PhaseEnvironments {
  server: EnvOverrides;
  playwright: EnvOverrides;
}

/**
 * Evaluate a phase's `env()` — ONCE — and layer both halves onto the run's base.
 *
 * The single evaluation is the whole reason the field is one function instead of two: a secret
 * SPLIT across the two processes (the half the server verifies, the half the test process signs
 * with) is generated once here, so the two agree by construction. Two functions would leave that
 * agreement to a convention nobody can enforce, and the failure mode is worse than a red run —
 * tests that depend on such a channel skip structurally when the secret is missing, so a
 * mismatched pair yields an authorization rejection where there used to be a clean skip.
 */
export function resolvePhaseEnv(phase: E2EPhase, base: PhaseEnvironments): PhaseEnvironments {
  const declared = phase.env ? phase.env() : {};
  return {
    server: composePhaseEnv(base.server, declared.server, `'${phase.project}' (server)`),
    playwright: composePhaseEnv(
      base.playwright,
      declared.playwright,
      `'${phase.project}' (playwright)`
    ),
  };
}

/**
 * The run's base env, specialized for ONE phase: its own html report directory.
 *
 * 🔴 IT GOES IN THE BASE, AND THE TWO ALTERNATIVES BOTH FAIL — which is why this is a function
 * of its own instead of a line somewhere:
 *
 *   · NOT in `playwrightEnvOverrides`. That is the base OF THE RUN: evaluated once, with no
 *     phase in scope. A value pinned there is the SAME for every phase, so both would share a
 *     directory and the second one would still delete the first one's report — the original
 *     defect, with the sensation of having been fixed.
 *   · NOT as a `declared` override of the phase. `composePhaseEnv` THROWS on a key of
 *     `PROTECTED_PHASE_ENV_KEYS`, and this key is now on that list, so the runner would trip
 *     its own guard and kill every run.
 *
 * The base is exactly the layer that is per-phase and not project-writable, so that is where it
 * belongs. Only the `playwright` half is touched: `next start` does not write reports.
 */
export function phaseEnvWithReportDir(
  base: PhaseEnvironments,
  project: string,
  rootDir: string
): PhaseEnvironments {
  return {
    server: base.server,
    playwright: {
      ...base.playwright,
      [HTML_REPORT_DIR_ENV_KEY]: phaseHtmlReportDir(project, rootDir),
    },
  };
}

// ---------------------------------------------------------------------------
// The RUN's env registry — the sibling of the phase registry, one scope up
// ---------------------------------------------------------------------------

/**
 * What the project pins for the WHOLE run, in the three environments a run actually has.
 *
 * The phase registry answers "I want another phase". This answers "I want variables pinned for
 * EVERY phase" — the case the kit itself has (`MFA_ENCRYPTION_KEY`, `EMAIL_PROVIDER=none`,
 * `RATE_LIMIT_ENABLED=false`) and, until now, did not offer: `E2EPhase.env`'s own docstring sends
 * the reader to `serverEnvOverrides` for it, which is kit-owned with no extension point. A kit
 * that uses a mechanism it does not expose is the origin↔consumer asymmetry this kit refuses.
 *
 * WHY THREE HALVES WHERE A PHASE HAS TWO. A phase cannot touch the build: one build precedes
 * every phase, so a `NEXT_PUBLIC_*` set per phase would desynchronize server and client, and
 * `composePhaseEnv` refuses it. A RUN is exactly the scope where that objection disappears —
 * the build happens once, inside the run — so the public vars are legal here and get their own
 * half. Without it the mechanism would miss the very case that asks for it most: a public flag
 * the suite needs pinned, which no phase may declare.
 */
export interface RunEnvOverrides {
  /**
   * Baked into the single production build AND fed to the build stamp. The stamp is not
   * optional: `.next/` survives between runs on purpose so the build can be recycled
   * (`prepareBuild`), so a public var that changed without entering the stamp would serve the
   * PREVIOUS bundle — green, with the old value. That is the failure this half exists to avoid.
   *
   * Not passed to the server: `next start` reads public vars from the bundle, not the process.
   * A variable the server code also reads at runtime is declared in `server` too, explicitly.
   */
  build?: EnvOverrides;
  /** Layered onto the run's server env, under every phase. */
  server?: EnvOverrides;
  /** Layered onto the run's Playwright env, under every phase. */
  playwright?: EnvOverrides;
}

/** The dev-owned module that declares the above. Absent ⇒ the run is exactly what it was. */
export const PROJECT_RUN_ENV_MODULE = 'e2e.env.project.ts';
/** How that file is named in messages and documentation. */
export const PROJECT_RUN_ENV_PATH = `scripts/tools/${PROJECT_RUN_ENV_MODULE}`;

/**
 * Load `scripts/tools/e2e.env.project.ts` when the project ships one.
 *
 * Same contract, tolerances and reasons as `loadProjectPhases` — dev-owned, in no distribution
 * profile, and PRESENT BUT UNLOADABLE IS FATAL. The severity is if anything higher here: this
 * file's whole purpose is to pin the posture of the run, so continuing without it would run the
 * suite against whatever `.env.local` happens to hold and report green.
 */
export function loadProjectRunEnv(
  deps: { exists?: (path: string) => boolean; load?: (path: string) => unknown } = {}
): RunEnvOverrides {
  const target = resolve(__dirname, PROJECT_RUN_ENV_MODULE);
  const exists = deps.exists ?? existsSync;
  if (!exists(target)) return {};

  const load = deps.load ?? ((path: string) => createRequire(__filename)(path));

  let loaded: unknown;
  try {
    loaded = load(target);
  } catch (error) {
    throw new Error(
      `${PROJECT_RUN_ENV_PATH} exists but could not be loaded: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }

  return interpretProjectRunEnv(loaded);
}

/** The halves a run-env module may declare. Anything else in the object is a typo worth naming. */
const RUN_ENV_HALVES = ['build', 'server', 'playwright'] as const;

/**
 * The exported value of the project's run-env file, validated.
 *
 * Pure and separate from the loading, like `interpretProjectPhases`, so the contract is
 * assertable without a filesystem. Accepts a function (evaluated ONCE, here) or a plain object:
 * a function is the form that lets a project mint a per-run secret, which is the same reason
 * `E2EPhase.env` is one.
 */
export function interpretProjectRunEnv(loaded: unknown): RunEnvOverrides {
  const record =
    typeof loaded === 'object' && loaded !== null ? (loaded as Record<string, unknown>) : {};
  const exported = typeof loaded === 'function' ? loaded : record.default;

  let value: unknown;
  if (typeof exported === 'function') {
    try {
      value = (exported as () => unknown)();
    } catch (error) {
      throw new Error(
        `${PROJECT_RUN_ENV_PATH}: its default export threw when evaluated: ` +
          `${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    value = exported;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `${PROJECT_RUN_ENV_PATH} must default-export an object (or a function returning one) with ` +
        `any of ${RUN_ENV_HALVES.join(', ')} — got ` +
        `${value === undefined ? 'no default export' : Array.isArray(value) ? 'an array' : typeof value}.`
    );
  }

  const halves = value as Record<string, unknown>;
  const unknownHalves = Object.keys(halves).filter(
    (key) => !RUN_ENV_HALVES.includes(key as (typeof RUN_ENV_HALVES)[number])
  );
  // Named rather than ignored: a typo'd half ("severs") would silently pin nothing, and the
  // run would pass green with the posture the project believed it had set.
  if (unknownHalves.length > 0) {
    throw new Error(
      `${PROJECT_RUN_ENV_PATH} declares unknown ${unknownHalves.length === 1 ? 'half' : 'halves'}: ` +
        `${unknownHalves.join(', ')}. Valid: ${RUN_ENV_HALVES.join(', ')}.`
    );
  }

  const out: RunEnvOverrides = {};
  for (const half of RUN_ENV_HALVES) {
    const declared = halves[half];
    if (declared === undefined) continue;
    if (typeof declared !== 'object' || declared === null || Array.isArray(declared)) {
      throw new Error(
        `${PROJECT_RUN_ENV_PATH}: '${half}' must be an object of environment variables ` +
          `(got ${Array.isArray(declared) ? 'an array' : typeof declared}).`
      );
    }
    const entries: EnvOverrides = {};
    for (const [key, raw] of Object.entries(declared as Record<string, unknown>)) {
      // A number or boolean would reach the spawn as "42"/"true" anyway; requiring the string
      // makes the coercion the project's, visible in its own file, instead of the runner's.
      if (typeof raw !== 'string') {
        throw new Error(
          `${PROJECT_RUN_ENV_PATH}: '${half}.${key}' must be a string (got ${typeof raw}). ` +
            `Environment variables are strings — convert it where you declare it.`
        );
      }
      entries[key] = raw;
    }
    out[half] = entries;
  }

  return out;
}

/**
 * Layer one half of the run-env onto the run's base, refusing the keys the RUNNER owns.
 *
 * The protected set is `PROTECTED_PHASE_ENV_KEYS` — the infrastructure of the run — for every
 * half. What differs from `composePhaseEnv` is the `NEXT_PUBLIC_` rule, and the difference is
 * the point: public vars are LEGAL in `build` (one build, inside the run) and refused in
 * `server`/`playwright`, where they would be read from a process that does not bake them and
 * would therefore do nothing at all. `NEXT_PUBLIC_APP_URL` stays protected everywhere — it is
 * the run's own address, not a project setting.
 */
export function composeRunEnv(
  base: EnvOverrides,
  override: EnvOverrides | undefined,
  half: (typeof RUN_ENV_HALVES)[number]
): EnvOverrides {
  if (!override) return { ...base };

  const publicAllowed = half === 'build';
  const offenders: string[] = [];
  const misplacedPublic: string[] = [];
  for (const key of Object.keys(override)) {
    const normalized = key.toUpperCase();
    if (PROTECTED_PHASE_ENV_KEYS.includes(normalized)) {
      offenders.push(key);
    } else if (!publicAllowed && normalized.startsWith(PUBLIC_ENV_PREFIX)) {
      misplacedPublic.push(key);
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `${PROJECT_RUN_ENV_PATH}: '${half}' declares ${offenders.length === 1 ? 'a key' : 'keys'} ` +
        `it may not set: ${offenders.join(', ')}. Owned by the runner: ` +
        `${PROTECTED_PHASE_ENV_KEYS.join(', ')} — they are the infrastructure of the run (its ` +
        `throwaway branch, its port, its address). Nothing was applied.`
    );
  }
  if (misplacedPublic.length > 0) {
    throw new Error(
      `${PROJECT_RUN_ENV_PATH}: '${half}' declares ${misplacedPublic.join(', ')}, which ` +
        `${misplacedPublic.length === 1 ? 'is a public var' : 'are public vars'}. Move ` +
        `${misplacedPublic.length === 1 ? 'it' : 'them'} to 'build': ${PUBLIC_ENV_PREFIX}* is ` +
        `inlined into the bundle at build time, so setting it on the server or the test process ` +
        `changes nothing — and only 'build' enters the build stamp, which is what stops a ` +
        `recycled .next/ from serving the previous value. Nothing was applied.`
    );
  }

  return { ...base, ...override };
}

export interface BakedEnvOptions {
  databaseUrl: string;
  appUrl: string;
}

/**
 * What the single production build runs with, on top of the inherited environment.
 *
 * Only the two build-time `NEXT_PUBLIC_*` vars need to be pinned here (see `sk-e2e §1.1`);
 * they are identical for both phases, because the MFA posture is a RUNTIME env set per
 * phase in `serverEnvOverrides`. Note that the INHERITED environment carries the whole
 * `.env.local`, so the build also bakes every other `NEXT_PUBLIC_*` the developer has
 * there — the reason E2E-007's stamp must cover that file in full, not just these keys.
 */
export function bakedEnvOverrides(options: BakedEnvOptions): EnvOverrides {
  const { databaseUrl, appUrl } = options;

  return {
    DATABASE_URL: databaseUrl,
    NEXT_PUBLIC_APP_URL: appUrl, // baked: canonical origin = http://localhost:E2E_PORT
    NEXT_PUBLIC_AUTH_MAGIC_LINK: 'false', // baked: no email in E2E ⇒ server + client agree
  };
}

// ---------------------------------------------------------------------------
// Build recycling — a stamp of the build's INPUTS, not a timestamp
// ---------------------------------------------------------------------------

/**
 * WHAT THE STAMP COVERS, AND WHY THAT LIST.
 *
 * The failure mode this guards against is not a wasted minute — it is a suite that goes
 * GREEN against a build that is no longer the app under test. So the bias is to
 * OVER-include: a source that changes the output but is missing from the stamp degrades
 * silently to "always green, never up to date", while an extra input only ever costs a
 * rebuild that would have been avoidable.
 *
 * IN:
 *   · `src/`, `public/`, `types/` — every file, hashed by content. `public/` and the root
 *     configs are precisely what a "did any src file change?" heuristic misses.
 *   · The root files below: `next.config.*` (build behaviour), `package.json` +
 *     the lockfile (dependency graph — the real identity of `node_modules/`),
 *     `tsconfig.json`, PostCSS/Tailwind configs, `components.json`, root
 *     `middleware.ts`, `instrumentation*.ts`, the Sentry configs, `.env` /
 *     `.env.production` (Next loads them for `next build` too).
 *   · The FULL contents of `.env.local` — the condition of this whole mechanism. The
 *     runner puts that file into `process.env` and the build inherits it whole, so it
 *     bakes EVERY `NEXT_PUBLIC_*` there, not only the two the runner pins. A stamp
 *     scoped to those two would let a changed `NEXT_PUBLIC_AUTH_PASSWORD` be recycled
 *     away.
 *   · The env the runner injects into the build (`bakedEnvOverrides`) and the E2E port,
 *     which is what `NEXT_PUBLIC_APP_URL` is built from.
 *   · The `NEXT_PUBLIC_*` vars the INVOCATION carries (`collectPublicEnv`) — the third door
 *     into the build, and the one the two above miss: `dotenv -e .env.<profile> -o -- pnpm
 *     test:e2e` selects a profile without touching `.env.local`, so two profiles used to
 *     share one bundle and the run went green wearing the other one's brand.
 *   · Whatever the PROJECT declares in `package.json#e2eBuildInputs` — the extension point
 *     for the entry directories this list cannot know about (`content/`, `messages/`,
 *     `emails/`). See `EXTRA_BUILD_INPUTS_KEY`: additive, opt-in, and confined to the
 *     checkout.
 *
 * OUT, deliberately:
 *   · `tests/**` — not a build input. Editing a spec must NOT trigger a rebuild; that
 *     repeated loop is the entire point of this issue.
 *   · `node_modules/` — hashing it would cost more than the build. Its identity is the
 *     lockfile + `package.json`, both of which ARE hashed (pnpm patches live in
 *     `patches/`, referenced from both).
 *   · `.claude/`, `scripts/`, `project/`, docs — none of them reach `next build`.
 *   · Tooling configs that do not shape the build output (`drizzle.config.ts`, ESLint,
 *     Vitest, Playwright).
 *   · `DATABASE_URL` — see `STAMP_VOLATILE_BAKED_KEYS`.
 *
 * COST: one `sha256` pass over the files above. MEASURED on this repo (333 files, ~4 MB
 * across `src/` + `public/`): ~20-30 ms warm, ~310 ms on the very first pass with a cold
 * page cache — against the ~60 s build it decides about. That ratio is the point: a stamp
 * that cost like a build would defeat its own purpose. It is also why this hashes files
 * rather than shelling out to `git` (absent or dirty in a derivative) or trusting mtimes
 * (a branch checkout rewrites them without changing a byte).
 *
 * TOLERANCE (BR-FACTORY-006): `scripts/**` travels to derivatives whose `src/` is frozen
 * and divergent. Nothing here may assume a path exists — an absent `public/`, a
 * `package-lock.json` instead of `pnpm-lock.yaml`, no `.env.local` at all: each degrades
 * to "that input is not part of this project", never to a throw.
 */

/**
 * Bumped whenever WHAT the stamp covers, or how it is encoded, changes.
 *
 * Without it, a runner shipped by `factory update` would compare its stamp against one
 * written by an older algorithm; equal strings would then mean "safe to reuse" for two
 * different definitions of "unchanged".
 *
 * ℹ️  `e2eBuildInputs` did NOT need a bump, and that is the point of how it was added: a
 * project without the key hashes an identical payload (so its existing build stays
 * reusable across the update), and a project WITH the key necessarily changed its
 * `package.json` — itself a hashed input — so its stamp moves on its own.
 */
const BUILD_STAMP_VERSION = 1;

/**
 * Where the stamp lives: INSIDE `.next/`, beside the build it describes — never at the
 * project root.
 *
 * `.gitignore` is frozen at bootstrap in a derivative and does not travel with the brain,
 * so a stamp at the root would show up as an untracked file forever in every derivative,
 * with no way for `factory update` to heal it. `.next/` is already covered by the shipped
 * `.gitignore` (`/.next/`), and it has the property this needs: delete the build and the
 * stamp goes with it, so the next run rebuilds — which is exactly right.
 */
export const BUILD_STAMP_FILE = '.next/e2e-build-stamp.json';

/** What `next start` itself needs — proof that `.next/` holds a real build output. */
const NEXT_BUILD_ID_FILE = '.next/BUILD_ID';

// The build-input block lives in `./e2e/build-inputs` (a Playwright spec must be able to load
// it without this file's graph); re-exported so every existing importer of the runner keeps working.
export {
  BUILD_SOURCE_DIRS,
  BUILD_SOURCE_FILES,
  EXTRA_BUILD_INPUTS_KEY,
  readExtraBuildInputs,
  resolveExtraBuildInputs,
  type ExtraBuildInputs,
  type RejectedBuildInput,
};

/**
 * Baked-env keys deliberately EXCLUDED from the stamp.
 *
 * `DATABASE_URL` is the throwaway Neon branch, freshly minted for THIS run — it is
 * different every single time. Hashing it would guarantee a mismatch on every run, i.e.
 * recycling that can never happen. Excluding it is safe because it never reaches the build
 * output: the routes are dynamic, the build performs no query (see `buildApp`), and the
 * server receives the branch URL at RUNTIME from `serverEnvOverrides`. Only `NEXT_PUBLIC_*`
 * is baked (`sk-e2e §1.1`), and everything else in `bakedEnvOverrides` IS hashed, so a
 * future baked var is covered by default rather than by remembering to add it.
 */
const STAMP_VOLATILE_BAKED_KEYS = new Set(['DATABASE_URL']);

/** Everything a build stamp must cover for recycling to be safe. */
export interface BuildStampInput {
  /** Full contents of `.env.local`, or `null` when absent. The WHOLE file: the build
   *  inherits it and bakes every `NEXT_PUBLIC_*`, not just the two pinned above. */
  envLocal: string | null;
  /** The vars the runner injects explicitly into the build (see `bakedEnvOverrides`). */
  bakedEnv: EnvOverrides;
  /**
   * The `NEXT_PUBLIC_*` vars the PROCESS carries into the build, from wherever they came
   * (`collectPublicEnv`).
   *
   * The third door into the build, and the one the other two do not cover: `.env.local` is
   * hashed as a file and `bakedEnv` holds what the runner pins itself, but a var exported by
   * the invocation — `dotenv -e .env.<profile> -o -- pnpm test:e2e` is the pattern measured in
   * the fleet — reaches `next build` through neither. Without it the stamp said "nothing
   * changed" between two profiles that share a `.env.local`, and the second run served the
   * first one's bundle, in green (BND-013).
   */
  publicEnv: EnvOverrides;
  /** The E2E port, which is baked into `NEXT_PUBLIC_APP_URL`. */
  port: number;
  /** Contents (or digests) of the build-relevant sources. */
  sources: readonly string[];
}

/** The stamp file written beside the build, as it is read back on the next run. */
export interface BuildStampFile {
  version: number;
  stamp: string;
  /** ISO timestamp of the build this stamp describes — the "from 14:32" in the log. */
  builtAt: string;
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * One source entry: its path AND the digest of its contents.
 *
 * The path is part of the entry so a rename or a deletion moves the stamp even when the
 * bytes are identical. Unreadable is recorded rather than skipped — a file that vanished
 * mid-walk is a change, and the safe direction is "rebuild".
 */
function digestSource(relPath: string): string {
  try {
    // No encoding: `readFileSync` hands back a Buffer, which is what a PNG under
    // `public/` needs. `hash.update` takes Buffer and string alike.
    return `${relPath} ${sha256(readFileSync(resolve(process.cwd(), relPath)))}`;
  } catch {
    return `${relPath} <unreadable>`;
  }
}

/** Structural shape of a `Dirent`; also the exact contract a test's `fs` must satisfy. */
type DirEntry = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

/**
 * Hash every file under `relDir`, recursively. Absent or unreadable → contributes nothing.
 *
 * Returns whether the directory could be listed, which is what lets `collectExtraSource`
 * tell a directory from a plain file without a `stat` call.
 */
function collectDirSources(relDir: string, into: string[]): boolean {
  let entries: DirEntry[];
  try {
    entries = readdirSync(resolve(process.cwd(), relDir), { withFileTypes: true });
  } catch {
    return false; // a derivative may have no public/ and no types/ — not an error
  }

  for (const entry of entries) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      // Recorded by name, never followed: a link pointing outside the tree (or at an
      // ancestor) would otherwise turn this walk into an unbounded one.
      into.push(`${rel} <symlink>`);
    } else if (entry.isDirectory()) {
      if (NON_BUILD_INPUT_DIRS.has(entry.name)) {
        // Recorded by name, never descended into — same shape as the symlink case above, and
        // for the same reason: its EXISTENCE still belongs in the stamp, its contents do not.
        // The kit's own directories never hold one; a project that declares `cli/` or
        // `packages/` does, and hashing it would cost more than the build (see
        // NON_BUILD_INPUT_DIRS).
        into.push(`${rel} <not a build input>`);
        continue;
      }
      collectDirSources(rel, into);
    } else if (entry.isFile()) {
      into.push(digestSource(rel));
    }
  }

  return true;
}

/**
 * One entry from `package.json#e2eBuildInputs`, which may name a DIRECTORY (`content/`) or a
 * single FILE (`contentlayer.config.ts`) — the project knows which, the runner does not.
 *
 * Directory first, then file. An entry that is neither contributes nothing — BR-FACTORY-006
 * again: a brain artifact tolerates the tree it lands on, and an input that does not exist
 * cannot have changed the build.
 *
 * 🔴 THE FILE BRANCH USES `lstatSync`, NOT `existsSync`. `collectDirSources` is explicit that a
 * symlink is "recorded by name, never followed" — an unfollowed link cannot walk out of the
 * checkout or loop through an ancestor. That promise held for entries met INSIDE a walk and not
 * for a declared entry that is a plain link: `existsSync` follows it (so a broken one read as
 * absent) and `digestSource`'s `readFileSync` follows it too, hashing a file the confinement
 * check of `vetBuildInput` never saw. `lstatSync` answers about the LINK, which is what makes
 * this branch record the same `<symlink>` marker the walk does.
 */
function collectExtraSource(rel: string, into: string[]): void {
  if (collectDirSources(rel, into)) return;

  let stats: { isSymbolicLink(): boolean };
  try {
    stats = lstatSync(resolve(process.cwd(), rel));
  } catch {
    return; // absent, or unreadable — contributes nothing, exactly as before
  }

  if (stats.isSymbolicLink()) {
    into.push(`${rel} <symlink>`);
    return;
  }
  into.push(digestSource(rel));
}

/**
 * Path + content digest of every build-relevant source, sorted so the result never
 * depends on the order a filesystem happens to return entries in.
 *
 * `extraInputs` is what the PROJECT added (`package.json#e2eBuildInputs`, vetted by
 * `resolveExtraBuildInputs`). It defaults to none, so a caller that passes nothing — and a
 * project that never set the key — gets byte-for-byte the list this produced before the
 * extension point existed, and therefore the same stamp.
 *
 * Exported so a test can exercise it with an injected `fs` (E2E-006): what belongs in the
 * list is the decision this whole mechanism rests on, and it can only be asserted against
 * a tree the test controls.
 */
export function collectBuildSources(extraInputs: readonly string[] = []): string[] {
  const sources: string[] = [];

  for (const file of BUILD_SOURCE_FILES) {
    if (existsSync(resolve(process.cwd(), file))) sources.push(digestSource(file));
  }
  for (const dir of BUILD_SOURCE_DIRS) collectDirSources(dir, sources);
  for (const input of extraInputs) collectExtraSource(input, sources);

  return sources.sort();
}

/**
 * The full contents of `.env.local`, or `null` when there is none to read.
 *
 * Exported for its test (E2E-006): "the project has no `.env.local`" is a state of a FILE,
 * not something an argument can express — and it is the ordinary case in CI.
 */
export function readEnvLocal(): string | null {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * The `NEXT_PUBLIC_*` vars an environment carries, with their values.
 *
 * `NEXT_PUBLIC_` is the whole criterion: those are the ones `next build` INLINES into the
 * client bundle, so their values are part of the artefact and therefore part of what decides
 * whether that artefact may be reused. Anything else in the environment is read at runtime by
 * the server, which gets a fresh one per phase — hashing it would only cost rebuilds.
 *
 * Takes the environment as an ARGUMENT, never reading `process.env` itself — the same reason
 * `PrepareBuildOptions.env` already gives: a test must be able to state the environment
 * instead of inheriting the host's.
 *
 * Exported for its test, like `readEnvLocal` / `collectBuildSources`: what counts as an input
 * to the build is the decision the whole recycling mechanism rests on.
 */
export function collectPublicEnv(env: EnvVars): EnvOverrides {
  const publicEnv: EnvOverrides = {};
  for (const key of Object.keys(env)) {
    if (!key.startsWith(PUBLIC_ENV_PREFIX)) continue;
    const value = env[key];
    // An unset key is not a value: `FOO=` and no `FOO` at all are different environments and
    // stamp differently, but `undefined` would render as the string "undefined".
    if (value !== undefined) publicEnv[key] = value;
  }
  return publicEnv;
}

/**
 * The `key=value` lines an env map contributes to the stamp payload, ordered BY KEY.
 *
 * Ordered because `Object.keys` reflects insertion order, not declaration order: two processes
 * carrying the same variables can enumerate them differently, and an unordered segment would
 * make recycling depend on that — a rebuild for no reason, at random, between identical runs.
 *
 * One helper for both env maps in the payload (`bakedEnv` and `publicEnv`) so the ordering is
 * structural rather than something each caller has to remember. Exported so a test can compare
 * the segment ONE map contributes across two payloads, which is the only way to state "the
 * port moves the stamp once" as an assertion rather than as a hope.
 */
export function stampEnvSegment(env: EnvOverrides, exclude?: ReadonlySet<string>): string {
  return Object.keys(env)
    .filter((key) => !exclude?.has(key))
    .sort()
    .map((key) => `${key}=${env[key]}`)
    .join('\n');
}

/**
 * The stamp: one hash over the sources, `.env.local`, the injected env, the run's public env
 * and the port.
 *
 * Pure — every input arrives as an argument, so "changing X changes the stamp" is
 * assertable without a filesystem. `.env.local` is folded in as a digest rather than
 * verbatim, so no secret ever sits in the payload string.
 */
export function computeBuildStamp(input: BuildStampInput): string {
  const { envLocal, bakedEnv, publicEnv, port, sources } = input;

  const payload = [
    `version=${BUILD_STAMP_VERSION}`,
    `port=${port}`,
    // An absent file and an empty one are different states, and must stamp differently.
    `env.local=${envLocal === null ? '<absent>' : sha256(envLocal)}`,
    `baked=\n${stampEnvSegment(bakedEnv, STAMP_VOLATILE_BAKED_KEYS)}`,
    // Its own segment, never merged into `baked`: the two answer different questions ("what
    // the runner pinned" vs "what the invocation carried"), and a merge would make a var that
    // appears in both indistinguishable from one that moved between them.
    `public=\n${stampEnvSegment(publicEnv)}`,
    `sources=\n${[...sources].sort().join('\n')}`,
  ].join('\n---\n');

  return sha256(payload);
}

/**
 * The stamp of the previous build, or `null` when there is no build to reuse.
 *
 * `null` — never a guess — for every unusable case: no build output beside the stamp
 * (`.next/` half-deleted, or a custom `distDir`), no stamp file, malformed JSON, or a
 * stamp written by another algorithm version. Each of those means "rebuild".
 */
export function readPreviousBuild(): BuildStampFile | null {
  const cwd = process.cwd();
  // A stamp on its own proves nothing: `.next/` can survive as a bare cache directory.
  if (!existsSync(resolve(cwd, NEXT_BUILD_ID_FILE))) return null;

  const stampPath = resolve(cwd, BUILD_STAMP_FILE);
  if (!existsSync(stampPath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(stampPath, 'utf-8')) as Partial<BuildStampFile>;
    if (parsed.version !== BUILD_STAMP_VERSION) return null;
    if (typeof parsed.stamp !== 'string' || parsed.stamp === '') return null;
    return {
      version: parsed.version,
      stamp: parsed.stamp,
      builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : '',
    };
  } catch {
    return null;
  }
}

/**
 * Record the stamp beside the build. Never throws: the worst consequence of failing to
 * write it is one avoidable rebuild on the next run.
 */
export function writeBuildStamp(stamp: string, now: Date = new Date()): void {
  const path = resolve(process.cwd(), BUILD_STAMP_FILE);
  const file: BuildStampFile = { version: BUILD_STAMP_VERSION, stamp, builtAt: now.toISOString() };

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  } catch (error) {
    console.log(
      `   ⚠️  Could not write the build stamp (${
        error instanceof Error ? error.message : String(error)
      }) — the next run will rebuild.`
    );
  }
}

/**
 * Drop the stamp BEFORE a build runs.
 *
 * A build that fails leaves `.next/` in a state no stamp describes — but the stamp of the
 * build it was replacing may still be sitting there, next to a `BUILD_ID` from that older
 * build. The next run would then find "a usable previous build" and reuse a half-written
 * output. Removing it first makes a failed build indistinguishable from no build, which is
 * what it is. `force: true` ⇒ nothing there is not an error.
 *
 * Exported for its test (E2E-006): the case it covers only exists as a FILE that outlived
 * the build it described.
 */
export function invalidateBuildStamp(): void {
  try {
    rmSync(resolve(process.cwd(), BUILD_STAMP_FILE), { force: true });
  } catch {
    // Not removable (permissions, a directory in its place) — the build about to run will
    // overwrite it on success, and a stale stamp is not worth failing a run over.
  }
}

/**
 * Whether this run is CI.
 *
 * Every CI provider sets `CI`; the values in the wild are `true` and `1`. An empty value,
 * `false` or `0` mean a developer explicitly unset it, so they are NOT CI.
 */
export function isCI(env: EnvVars): boolean {
  const value = env.CI;
  return value !== undefined && value !== '' && value !== 'false' && value !== '0';
}

/**
 * How long THIS run waits for a phase's server to come up — CI-aware rather than flat. The
 * two ceilings, and why the same number cannot serve both, are on the constants themselves.
 *
 * `env` is a parameter rather than a `process.env` read, so a test pins it instead of
 * inheriting whatever the host machine (or its CI provider) happens to export. It reuses the
 * same `isCI` predicate the build decision does, so "what counts as CI" is answered in exactly
 * one place.
 */
export function resolveServerStartupTimeout(env: EnvVars): number {
  return isCI(env) ? SERVER_STARTUP_TIMEOUT_CI : SERVER_STARTUP_TIMEOUT_LOCAL;
}

/** Why the runner decided to build, or not. Also what the log line reports. */
export type BuildDecisionReason =
  | 'ci'
  | 'forced'
  | 'no-stamp'
  | 'no-previous-build'
  | 'inputs-changed'
  | 'inputs-unchanged';

export interface BuildDecision {
  rebuild: boolean;
  reason: BuildDecisionReason;
}

export interface BuildDecisionInput {
  /** `CI=true` ⇒ always compile, by explicit rule — not as a side effect of a clean tree. */
  ci: boolean;
  /** `--build` was passed. */
  force: boolean;
  /** Stamp of the CURRENT inputs; `null` when it was not computed, or could not be. */
  stamp: string | null;
  /** Stamp of the build sitting in `.next/`, if there is a usable one. */
  previous: BuildStampFile | null;
}

/**
 * Reuse or rebuild — the whole decision, as a pure function.
 *
 * Order is the contract. CI is checked FIRST and never consults the stamp: a CI run must
 * compile because the rule says so, so that no future change to what the stamp covers (or
 * a warm cache on a self-hosted runner) can quietly turn CI into a recycling run.
 */
export function resolveBuildDecision(input: BuildDecisionInput): BuildDecision {
  const { ci, force, stamp, previous } = input;

  if (ci) return { rebuild: true, reason: 'ci' };
  if (force) return { rebuild: true, reason: 'forced' };
  if (stamp === null) return { rebuild: true, reason: 'no-stamp' };
  if (previous === null) return { rebuild: true, reason: 'no-previous-build' };
  if (previous.stamp !== stamp) return { rebuild: true, reason: 'inputs-changed' };

  return { rebuild: false, reason: 'inputs-unchanged' };
}

/** What the build log says it is doing, and why. */
const BUILD_REASON_LABEL: Record<BuildDecisionReason, string> = {
  ci: 'CI always compiles',
  forced: '--build was passed',
  'no-stamp': 'the input stamp could not be computed',
  'no-previous-build': 'no reusable build in .next/',
  'inputs-changed': 'inputs changed since the last build',
  'inputs-unchanged': 'inputs unchanged',
};

/** `HH:MM` of a build, local time — or `null` for a timestamp that cannot be read. */
export function formatBuildTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Take `--build` off the argument list.
 *
 * Stripped, not merely detected: the rest of the args are forwarded to Playwright, which
 * would reject a flag it does not know.
 */
export function parseBuildFlag(args: string[]): { force: boolean; rest: string[] } {
  return {
    force: args.includes('--build'),
    rest: args.filter((arg) => arg !== '--build'),
  };
}

/**
 * Take `--keep-branch` off the argument list.
 *
 * Same shape and same reason as `parseBuildFlag`: whatever survives here is forwarded to
 * Playwright verbatim (`main`), and Playwright rejects a flag it does not know — so a flag the
 * runner OWNS has to be removed, not merely detected. Matched whole, never by prefix, so a
 * future Playwright argument that happens to start the same reaches Playwright untouched.
 */
export function parseKeepBranchFlag(args: string[]): { keep: boolean; rest: string[] } {
  return {
    keep: args.includes('--keep-branch'),
    rest: args.filter((arg) => arg !== '--keep-branch'),
  };
}

/** Prefix of the private directory the kept branch's connection URI is written into. */
const KEPT_URI_DIR_PREFIX = 'timekast-e2e-branch-';
/** The file inside it. One URI, one line, nothing else. */
const KEPT_URI_FILE_NAME = 'connection-uri.txt';
/** Owner read/write, nobody else — the file carries a live database password. */
const KEPT_URI_FILE_MODE = 0o600;

/**
 * Write the kept branch's connection URI to a private file OUTSIDE the checkout, and return its
 * path.
 *
 * WHY A FILE INSTEAD OF THE CONSOLE. The URI embeds the branch role's password, and two facts
 * this runner documents elsewhere (`redact`) make printing it worse than it looks: the password
 * is NOT ephemeral — Neon clones the parent's roles WITH their passwords, so only the host
 * differs and deleting the branch rotates nothing — and it survives wherever the terminal's
 * scrollback, a `script` capture or a shared session log goes. Every other line of this runner
 * redacts that exact value; this was the one that printed it raw.
 *
 * `mkdtempSync` rather than a fixed name: the directory is created fresh (0700) and cannot
 * already exist as something else, so the mode below is the mode the file is BORN with — a
 * `writeFileSync` mode is only applied at creation, and a pre-existing world-readable file would
 * have been rewritten in place with its old permissions.
 *
 * The temp dir, not the repo: `.gitignore` is frozen at bootstrap in a derivative
 * (BR-FACTORY-006), so a credential file inside the checkout would be one `git add -A` away
 * from a commit.
 */
export function writeKeptBranchUri(uri: string): string {
  const dir = mkdtempSync(join(tmpdir(), KEPT_URI_DIR_PREFIX));
  const file = join(dir, KEPT_URI_FILE_NAME);
  writeFileSync(file, `${uri}\n`, { mode: KEPT_URI_FILE_MODE });
  return file;
}

/**
 * How old a kept-branch URI directory must be before a later run reclaims it.
 *
 * GENEROUS ON PURPOSE, and the asymmetry is the whole design: the file exists so a developer
 * can open the branch it names, and that loop can span a night, a weekend or a Monday morning.
 * Reclaiming one too early costs the thing the flag was asked for; reclaiming one too late costs
 * a few hundred bytes sitting in the temp directory. A week clears both without ever being the
 * reason somebody loses the URI they kept the branch for.
 *
 * Why it needs a sweep at all: the directory is created by `mkdtempSync` and NOTHING deletes it —
 * not the run that wrote it (it exits right after printing the path), not the branch's deletion
 * (there is none, that is the flag), and not macOS, whose temp directory is not cleared on every
 * reboot. Each `--keep-branch` therefore left one more live Postgres password at rest.
 */
export const KEPT_URI_MAX_AGE_DAYS = 7;
export const KEPT_URI_MAX_AGE_MS = KEPT_URI_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Which of the temp entries handed in may be deleted — the rule, pure over its input.
 *
 * TWO CONDITIONS, and the second is a refusal: the name must be one this runner minted
 * (`KEPT_URI_DIR_PREFIX`), and the age must be KNOWN and past the threshold. An entry whose age
 * could not be read (`null`) is left alone rather than assumed old: this deletes recursively in
 * a directory shared with everything else on the machine, so "I could not tell" must never
 * resolve to "delete it".
 */
export function selectStaleKeptUriDirs(
  entries: Array<{ name: string; ageMs: number | null }>,
  maxAgeMs: number = KEPT_URI_MAX_AGE_MS
): string[] {
  return entries
    .filter(
      ({ name, ageMs }) =>
        name.startsWith(KEPT_URI_DIR_PREFIX) && ageMs !== null && ageMs > maxAgeMs
    )
    .map(({ name }) => name);
}

/**
 * Delete the kept-branch URI directories older than `KEPT_URI_MAX_AGE_MS`, and say how many
 * went. The io half of `selectStaleKeptUriDirs`.
 *
 * WHERE IT RUNS: beside the zombie-branch sweep at the top of a run — the same shape of
 * housekeeping (this run cleaning up after previous ones) against the same leak (a `--keep-branch`
 * run leaves BOTH a Neon branch and this file behind). Doing it there costs one directory listing
 * on a path that already talks to Neon.
 *
 * NEVER FATAL, at any step. The listing, the age read and each delete are individually tolerated:
 * a temp directory that cannot be read, an entry that belongs to another user, a permission error
 * — none of them is a reason to fail a suite over somebody else's leftovers. Same failure policy
 * as `cleanupZombieBranches`, for the same reason.
 */
export function sweepKeptBranchUriDirs(now: number = Date.now()): number {
  const root = tmpdir();
  let names: string[];
  try {
    names = readdirSync(root) as unknown as string[];
  } catch {
    return 0;
  }

  const entries = names
    .filter((name) => name.startsWith(KEPT_URI_DIR_PREFIX))
    .map((name) => {
      let ageMs: number | null = null;
      try {
        // The directory's mtime IS its creation for this shape: `mkdtempSync` makes it and one
        // file is written into it immediately, after which nothing touches it again.
        ageMs = now - statSync(join(root, name)).mtimeMs;
      } catch {
        ageMs = null; // unreadable ⇒ undatable ⇒ left alone (see the selector)
      }
      return { name, ageMs };
    });

  let removed = 0;
  for (const name of selectStaleKeptUriDirs(entries)) {
    try {
      rmSync(join(root, name), { recursive: true, force: true });
      removed++;
    } catch {
      // Another user's directory, a locked file, a read-only mount. Housekeeping, not the run.
    }
  }
  return removed;
}

/**
 * The safe rendering of a failure to write the kept-branch URI file.
 *
 * 🔴 THE CAUSE, NEVER THE URI. What the call site used to do with this error was drop it, so
 * "could not write it" arrived without the one thing that makes it actionable — and the three
 * realistic causes are told apart by exactly this token: `EACCES` (permissions), `ENOSPC` (full
 * disk), `ENOENT` / `ENOTDIR` (a `TMPDIR` pointing somewhere that is not a directory).
 *
 * The `code` is preferred over the message deliberately: an fs error's message repeats the path
 * and nothing else useful, and keeping the printed token to a known, short shape is what
 * guarantees no part of the value being written can ride along.
 */
export function keptUriWriteFailure(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === 'string' && code) return code;
    if (typeof name === 'string' && name) return name;
  }
  return 'unknown error';
}

/**
 * What the runner prints when `--keep-branch` leaves a branch behind.
 *
 * Pure over its input so the ONE decision that matters here — whether a credential reaches
 * stdout — is assertable without a Neon branch, a filesystem or a CI machine.
 *
 * 🔴 ON CI, NEITHER THE URI NOR A PATH. GitHub Actions masks the `secrets.*` it was given; this
 * URI is minted at runtime, so it would land in the build log in clear text, in a log more
 * people can read than can reach the machine. The flag has no legitimate use there either — it
 * is a local debugging aid, and on CI it would also leak branches (`sk-e2e §1`), so the report
 * says what happened and points at the Neon Console instead.
 */
export function keepBranchReport(options: {
  /** Branch name when it is known, its id otherwise — never the URI. */
  branchLabel: string;
  ci: boolean;
  /** Whether this run ever held a connection URI for the branch. */
  hasUri: boolean;
  /** Where the URI was written, or `null` when it was not written at all. */
  uriPath: string | null;
  /**
   * Why the write failed, already reduced to a safe token by `keptUriWriteFailure` — `null` /
   * absent when there was no failure to report. Read only in the branch where `uriPath` is
   * `null`: "could not write it" and "here is why" are one message, and the second half used to
   * be thrown away at the call site, leaving a dead end where an `EACCES` or an `ENOSPC` would
   * have told the developer what to fix.
   */
  writeFailure?: string | null;
}): string[] {
  const { branchLabel, ci, hasUri, uriPath, writeFailure } = options;
  const lines = [`\n🌱 Keeping the Neon branch: ${branchLabel}`];

  if (!hasUri) {
    lines.push('   ℹ️  No connection URI was resolved for it — open it in the Neon Console.');
  } else if (ci) {
    lines.push(
      '   🔒 Its connection URI is neither printed nor written here: this is CI, the URI ' +
        'carries the branch password, and Actions masks only the secrets it was given — a ' +
        'runtime-minted URI would land in the log in clear text. Neon Console → Branches.'
    );
  } else if (uriPath) {
    lines.push(
      '   ⚠️  Its connection URI carries the branch password, so it is NOT printed. Written to:'
    );
    lines.push(`   ${uriPath}`);
    lines.push(`   (owner-only, mode 0600, outside the repo — delete it when you are done)`);
  } else {
    lines.push(
      '   ⚠️  Could not write its connection URI to a private file, and it is not printed ' +
        '(it carries the branch password). Open the branch in the Neon Console.'
    );
    if (writeFailure) lines.push(`   Cause: ${writeFailure}`);
  }

  lines.push(
    '   ℹ️  Exempt from the zombie cleanup, so the next run will NOT reclaim it. ' +
      'Delete it in the Neon Console when you are done.'
  );
  return lines;
}

/** The bare separator itself — pnpm's, not a flag of this runner. */
const ARG_SEPARATOR = '--';

/**
 * Drop the bare `--` separator, which pnpm hands over verbatim.
 *
 * `pnpm test:e2e -- --shard=1/2` is how a developer is TOLD to pass an argument through, and
 * pnpm forwards the `--` along with it. Playwright then applies its own meaning to it — "flags
 * end here, what follows are filenames" — so it looks for a file called `--shard=1/2`, finds
 * none, reports `No tests found` and exits GREEN. An attempt to shard the suite becomes a run
 * that executed nothing, and nobody notices.
 *
 * A sibling of `parseBuildFlag` / `parseKeepBranchFlag` rather than a branch inside one of
 * them: those two answer a question the runner acts on (`force`, `keep`), while this one is
 * pure removal — the runner does nothing with the separator, which is also why it is NOT an
 * entry in `RUNNER_FLAGS` (nothing consumes it). Applied at the same point, in `main`, before
 * `resolvePhasePlan`, so all three filters see the same input; their predicates are disjoint,
 * so the order between them carries no meaning.
 *
 * Matched WHOLE. `--shard=1/2` and `--grep=--foo` contain two dashes and are none of the
 * runner's business.
 */
export function stripArgSeparator(args: string[]): string[] {
  return args.filter((arg) => arg !== ARG_SEPARATOR);
}

// ---------------------------------------------------------------------------
// CLI contract — the flags this runner interprets ITSELF
// ---------------------------------------------------------------------------

/** One flag the runner consumes, as `--help` renders it. */
export interface RunnerFlag {
  /** Exactly as it is typed on the command line. */
  flag: string;
  /** What it does — one line. */
  summary: string;
  /** A real invocation, or `null` when the flag needs no illustration. */
  example: string | null;
}

/**
 * Every flag the runner CONSUMES — and deliberately nothing else.
 *
 * Anything not listed here is forwarded to Playwright verbatim (see `main`), which is why
 * this contract must not restate Playwright's own flags: that copy would be stale the day
 * Playwright adds one, and `playwright test --help` already answers for them.
 *
 * This array is the single source `formatRunnerHelp` renders from, so teaching the runner a
 * new flag means adding it here — not remembering to edit a help string somewhere else.
 */
export const RUNNER_FLAGS: readonly RunnerFlag[] = [
  {
    flag: '--project=<name>',
    // Rendered from `KIT_PHASES`, the same registry `resolvePhasePlan` validates against and
    // injects per phase — so the contract printed here and the names actually accepted cannot
    // drift apart. It no longer promises "two, and only these two": a project declares more in
    // its own file, and the error for a name that is no phase lists what this checkout has.
    summary:
      `Run one phase only, named by its Playwright project. The kit ships ` +
      `'${KIT_BASE_PROJECT}' (base suite, MFA off), '${KIT_MFA_PROJECT}' and ` +
      `'${KIT_EVIDENCE_PROJECT}' (visual evidence — opt-in, see \`pnpm evidence:visual\`); a ` +
      `project can declare more in ${PROJECT_PHASES_PATH}. Default: every phase, in order, ` +
      `EXCEPT the opt-in ones, which run only when named. A name that is no phase of this ` +
      `checkout is rejected, and the error lists the ones that are.`,
    example: `pnpm test:e2e --project=${KIT_BASE_PROJECT} tests/e2e/x.spec.ts`,
  },
  {
    flag: '--build',
    summary: 'Rebuild even when every input that feeds the build is unchanged.',
    example: 'pnpm test:e2e --build',
  },
  {
    flag: '--keep-branch',
    summary:
      'Local debugging: leave the throwaway Neon branch alive on exit and write its connection ' +
      'URI to a private file outside the repo (the PATH is printed, never the URI — it carries ' +
      'the branch password). Not on CI. The next run will not reclaim it — delete it in the ' +
      'Neon Console when done.',
    example: 'pnpm test:e2e --keep-branch',
  },
  {
    flag: '--help, -h',
    summary: 'Print this contract and exit — no branch, no build, no server.',
    example: null,
  },
];

/** One environment variable the runner reads. Part of the same operational contract. */
export interface RunnerEnvVar {
  name: string;
  summary: string;
}

/** The environment the runner itself reads (the app's own vars come from `.env.local`). */
export const RUNNER_ENV_VARS: readonly RunnerEnvVar[] = [
  {
    name: 'E2E_PORT',
    summary:
      `Port to serve on. Default: package.json#ports.e2e when it pins one; when that key is ` +
      `empty, a port derived from this checkout's path (${DERIVED_PORT_RANGE_START}-${DERIVED_PORT_RANGE_END}); ` +
      `otherwise ${DEFAULT_E2E_PORT}.`,
  },
  {
    name: 'CI',
    summary:
      `Set by CI providers. Forces a build, so a CI result is never a reused one, and raises ` +
      `the server-startup ceiling to ${SERVER_STARTUP_TIMEOUT_CI / 1000}s (locally ` +
      `${SERVER_STARTUP_TIMEOUT_LOCAL / 1000}s).`,
  },
  {
    name: ALLOW_REMOTE_HOST_ENV,
    summary:
      `Run even though the baseURL host of playwright.config does not resolve to this machine. ` +
      `Without it such a run is refused before the branch and the build: the suite would leave ` +
      `this machine in the clear, carrying the credentials the specs seed. Set, the run says so ` +
      `loudly and proceeds.`,
  },
  {
    name: SERVER_LOGS_ENV,
    summary:
      `Set to 1 to keep the server's output after it is ready (its stdout, and the warn-level ` +
      `log lines otherwise hidden). For investigating a flaky run. A server that dies mid-run ` +
      `is reported with or without it.`,
  },
];

/** Help flags, in both spellings a developer reaches for. Matched whole, never by prefix. */
const HELP_FLAGS = new Set(['--help', '-h']);

/**
 * Whether this invocation asks for the contract instead of a run.
 *
 * Any position, and it WINS over every other flag: `--help --project=chromium` prints and
 * exits. Kept pure, and called from the entry point before anything else, so printing help
 * reads no file, loads no `.env.local`, validates no Neon credentials and compiles nothing.
 */
export function wantsHelp(args: string[]): boolean {
  return args.some((arg) => HELP_FLAGS.has(arg));
}

/** Two spaces of padding either side of the widest name — one aligned column, no magic width. */
function helpEntries(entries: readonly { name: string; summary: string }[]): string[] {
  const width = Math.max(...entries.map((entry) => entry.name.length));
  return entries.map((entry) => `  ${entry.name.padEnd(width)}  ${entry.summary}`);
}

/**
 * The `--help` output: what this runner does, the flags it owns, the environment it reads.
 *
 * Pure — it renders `RUNNER_FLAGS` / `RUNNER_ENV_VARS` and reads nothing from the outside
 * world, so the contract can be asserted (and kept from going stale) by a test.
 */
export function formatRunnerHelp(): string {
  const flagLines = helpEntries(RUNNER_FLAGS.map((f) => ({ name: f.flag, summary: f.summary })));
  const examples = RUNNER_FLAGS.flatMap((flag) => (flag.example ? [`  ${flag.example}`] : []));

  return [
    'pnpm test:e2e [runner flags] [playwright args...]',
    '',
    'Runs the E2E suite against a throwaway Neon branch: creates the branch, migrates it to',
    'the current schema, builds the app once and serves that build with `next start`, then',
    'runs Playwright per phase and deletes branch + server on exit.',
    '',
    'Runner flags:',
    ...flagLines,
    '',
    'Examples:',
    ...examples,
    '',
    'Environment:',
    ...helpEntries(RUNNER_ENV_VARS),
    '',
    'Every other argument is forwarded to Playwright unchanged — except a bare `--`, which is',
    'dropped: pnpm passes it through, and Playwright would read what follows as a filename.',
    'A spec path or a test-name pattern is applied to EVERY phase; a phase whose project holds',
    'no matching test is skipped with a notice, and a filter that matches nothing anywhere',
    'fails the run.',
    'Playwright flags are documented by Playwright itself, not here:',
    '  pnpm exec playwright test --help',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Port availability
// ---------------------------------------------------------------------------

/**
 * PIDs LISTENING on `port`, for the fail-loud message below.
 *
 * An empty array means "no PID found" — which is a free port OR a machine without the
 * lookup tool, so it is NOT proof that the port is free (see assertE2EPortAvailable's
 * fallback probe). Kept read-only on purpose: this function identifies, never kills.
 */
function findPortHolders(port: number): number[] {
  try {
    const pids =
      process.platform === 'win32'
        ? // Parse in TS rather than piping through `findstr`: avoids cmd.exe quoting and a
          // bare `:PORT` match also hitting `:PORT0`. Listening rows end with the PID.
          execSync('netstat -ano -p tcp', { stdio: 'pipe', encoding: 'utf-8' })
            .split(/\r?\n/)
            .filter((line) => /\bLISTENING\b/.test(line) && new RegExp(`:${port}\\s`).test(line))
            .map((line) => line.trim().split(/\s+/).pop() ?? '')
        : execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { stdio: 'pipe', encoding: 'utf-8' }).split(
            /\r?\n/
          );

    return [
      ...new Set(
        pids.map((pid) => Number(pid.trim())).filter((pid) => Number.isInteger(pid) && pid > 0)
      ),
    ];
  } catch {
    // Both tools exit non-zero when nothing matches — and throw the same way when they are
    // not installed. Either case leaves no PID to report.
    return [];
  }
}

/** Platform-specific command the developer can paste to free the port. */
function freePortCommand(pids: number[]): string {
  return process.platform === 'win32'
    ? pids.map((pid) => `taskkill /PID ${pid} /T /F`).join(' && ')
    : `kill -9 ${pids.join(' ')}`;
}

// ---------------------------------------------------------------------------
// The HTTP probe every wait in this runner is built on
// ---------------------------------------------------------------------------

/**
 * What ONE probe request may take before it is aborted. This is the bound that makes the
 * LOOP bounds below mean anything.
 *
 * 🔴 WHY IT MUST EXIST. `fetch` has no default overall timeout, and undici's `headersTimeout`
 * — the only thing that would eventually end the wait — is 300 SECONDS. A listener that
 * accepts the connection and never answers (a wedged server, a socket held by a process that
 * is not serving) therefore parks the `await` for five minutes. The `Date.now()` checks in
 * the loops below run BETWEEN polls, never during one, so those five minutes are spent
 * INSIDE a single iteration: 5× the local 60 s ceiling and 2.5× the 120 s CI one, blown
 * without a single check firing.
 *
 * That is not cosmetic. `neon-branch.ts` DERIVES `ZOMBIE_AGE_THRESHOLD_MS` from
 * `2 × (SERVER_STARTUP_TIMEOUT + PORT_FREE_TIMEOUT)`, i.e. from the premise that this
 * runner's waiting budget is what those constants say. Without a per-request bound the
 * premise is false and the derivation rests on numbers the code does not honour.
 *
 * TWO VALUES, because the two questions are not the same:
 *
 *   · PORT_PROBE_TIMEOUT — for "is anything holding this port?". The verdict is identical
 *     whether the peer answers or merely accepts (both mean HELD, see
 *     `assertE2EPortAvailable`), so the only thing the length buys is how fast the answer
 *     comes. Two poll intervals is plenty: a free port is refused instantly on loopback.
 *   · SERVER_READY_PROBE_TIMEOUT — for "has the server answered yet?". Here a short bound
 *     would be a real regression: readiness is proven by an ANSWER, and a first response
 *     that is slow (cold Neon branch, loaded machine) must cost another poll, never a false
 *     "did not start". Ten seconds is generous for a precompiled route and still a sixth of
 *     the smaller loop ceiling, so the ceiling keeps governing the run.
 */
export const PORT_PROBE_TIMEOUT = SERVER_CHECK_INTERVAL * 2; // 1s
export const SERVER_READY_PROBE_TIMEOUT = 10000; // 10s

/**
 * What one probe found. The middle case is the whole reason this is a three-way answer and
 * not a boolean: "nothing came back" and "nothing is there" are DIFFERENT facts, and which
 * one is good news depends on the question being asked.
 */
export type ProbeOutcome =
  /** A response arrived — any status. Something is serving. */
  | 'answered'
  /** The connection went somewhere, but nothing came back before the deadline. */
  | 'silent'
  /** Nothing accepted the connection (refused, unreachable, DNS). */
  | 'refused';

export interface ProbeOptions {
  /** Per-request ceiling. Defaults are per call site — see the constants above. */
  timeoutMs?: number;
  /** Injected by tests; the real run uses the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** The `name` of a thrown value, when it has one. */
function errorName(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

/** How an aborted request identifies itself: `AbortSignal.timeout` rejects with a
 *  `TimeoutError`, an explicit `abort()` with an `AbortError`. undici sometimes wraps the
 *  reason in a `TypeError`, so the cause is inspected too. */
const ABORT_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);

function isAbort(error: unknown): boolean {
  if (ABORT_ERROR_NAMES.has(errorName(error))) return true;
  const cause =
    typeof error === 'object' && error !== null ? (error as { cause?: unknown }).cause : undefined;
  return ABORT_ERROR_NAMES.has(errorName(cause));
}

/**
 * One bounded HEAD request. The single place this runner talks to a port, so the bound
 * cannot be forgotten at a call site.
 *
 * `HEAD` + `redirect: 'manual'`: the question is never what the app returns, only whether
 * anything is there, so no body is fetched and no redirect is followed.
 *
 * Exported, and `fetchImpl` is a parameter, so the three outcomes are assertable without a
 * socket — including the one that has no natural way to occur in a test: a peer that accepts
 * and never answers.
 */
export async function probeHttp(url: string, options: ProbeOptions = {}): Promise<ProbeOutcome> {
  const { timeoutMs = PORT_PROBE_TIMEOUT, fetchImpl = fetch } = options;

  try {
    await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return 'answered';
  } catch (error) {
    // The distinction the callers depend on. An abort means the connection was ESTABLISHED
    // and the answer never came; anything else means it was never established at all.
    return isAbort(error) ? 'silent' : 'refused';
  }
}

/** A wait built on repeated probes. `intervalMs` is a parameter so a test need not sleep. */
export interface PollOptions extends ProbeOptions {
  intervalMs?: number;
}

export interface PortAssertionOptions extends ProbeOptions {
  /** Injected by tests; the real run uses the runner's own read-only PID detector. */
  findHolders?: (port: number) => number[];
}

/**
 * Abort — loudly — when something OUTSIDE this run already holds the E2E port.
 *
 * This replaces the old blind port-kill (`lsof -ti:PORT | xargs kill -9` on whatever
 * answered). That blind kill is what let two suites cannibalise each other: run A starts and
 * kills whatever is on the port; run B starts later and kills A's server; A's remaining
 * tests then hit B's server — another app, another database — and fail in a way that reads
 * as a product bug, never as a busy port. That symptom cost two separate diagnoses. The
 * runner now names the process and stops; freeing the port is the person's call, not the
 * runner's.
 *
 * Only ever used for processes FOREIGN to this run. The hand-off between phases is a
 * different problem with a different tool: the previous phase kills its OWN process tree
 * (killServerTree) and `waitForPortFree` waits for that release.
 *
 * Exported so its verdicts — especially the `silent` one below — can be asserted with an
 * injected `fetch` and an injected detector, without a socket and without `lsof`.
 */
export async function assertE2EPortAvailable(
  port: number,
  options: PortAssertionOptions = {}
): Promise<void> {
  const { findHolders = findPortHolders, ...probe } = options;
  const holders = findHolders(port);

  if (holders.length === 0) {
    // No PID — confirm with one request before letting the run continue, so a machine
    // without `lsof` degrades to "detected but unidentified" instead of "not detected".
    const outcome = await probeHttp(e2eServerUrl(port), {
      timeoutMs: PORT_PROBE_TIMEOUT,
      ...probe,
    });

    // 🔴 ONLY a refused connection proves the port is free — and this is the one place in the
    // runner where reading the probe's timeout as "free" would INVERT the guard.
    //
    // A refusal means the kernel had nothing bound to answer with, which is exactly the
    // question. `silent` means the opposite: something ACCEPTED the connection (a socket is
    // bound) and then failed to answer inside the deadline — a wedged server, or one still
    // starting. That is a port very much in use. Treating it as free is the false negative
    // E2E-002 exists to prevent: this run would go on to bind a port another suite is
    // holding, and the two would cannibalise each other's servers — tests hitting a server
    // on a different database, failing as if they were product bugs. So `silent` joins
    // `answered` on the TAKEN side, and the cost of being wrong is the cheap direction: a
    // stop with a message, not a corrupted run.
    if (outcome === 'refused') return;

    throw new Error(
      `Port ${port} is ${outcome === 'answered' ? 'already taken' : 'accepting connections without answering'}, ` +
        `but the process holding it could not be identified (no \`lsof\` on this machine?). ` +
        `This run will NOT kill whatever is there.\n` +
        `   → Find out who holds it: lsof -i:${port}\n` +
        `   → Or, from ANOTHER checkout, serve that suite elsewhere: E2E_PORT=<other> pnpm test:e2e\n` +
        `     (not a way to run twice in THIS checkout: both runs would share .next/ and its\n` +
        `      build stamp, so one would rebuild the directory the other is serving.)`
    );
  }

  throw new Error(
    `Port ${port} is already taken (PID ${holders.join(', ')}). This run will NOT kill it: ` +
      `if that is another e2e suite, killing its server would make its tests hit THIS run's ` +
      `server — a different database — and fail as if they were product bugs.\n` +
      `   → Free it yourself, if you know it is stale: ${freePortCommand(holders)}\n` +
      `   → Or, from ANOTHER checkout, serve that suite elsewhere: E2E_PORT=<other> pnpm test:e2e\n` +
      `     (not a way to run twice in THIS checkout: both runs would share .next/ and its\n` +
      `      build stamp, so one would rebuild the directory the other is serving.)`
  );
}

/**
 * Wait until NOTHING answers on the port — proof the previous server is truly gone, so
 * the next phase binds cleanly instead of running against a zombie. Throws (fail loud)
 * if the port is still held after the timeout, rather than proceeding blind.
 *
 * Same reading of the probe as `assertE2EPortAvailable`, for the same reason: only a REFUSED
 * connection is proof of a free port. A `silent` probe means the previous server still has
 * the socket and merely stopped answering, which is precisely the zombie this wait exists to
 * refuse to run against.
 */
export async function waitForPortFree(
  port: number,
  timeout: number,
  options: PollOptions = {}
): Promise<void> {
  const { intervalMs = SERVER_CHECK_INTERVAL, ...probe } = options;
  const start = Date.now();
  const url = e2eServerUrl(port);

  while (Date.now() - start < timeout) {
    const outcome = await probeHttp(url, { timeoutMs: PORT_PROBE_TIMEOUT, ...probe });
    if (outcome === 'refused') return; // Nothing accepted the connection → the port is free.
    // 'answered' or 'silent' → something still holds it. Poll again; the ceiling governs.
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `Port ${port} still in use after ${timeout / 1000}s — a stale server did not exit.`
  );
}

// ---------------------------------------------------------------------------
// Spawning child processes — how they are started, and what their output may print
// ---------------------------------------------------------------------------

/**
 * Whether a `pnpm …` spawn has to go through a shell. TRUE ONLY ON WINDOWS — and that
 * condition is load-bearing in both directions, so do not "simplify" it to a constant.
 *
 * WHY NOT ALWAYS `true` (the bug this replaced): Node does NOT quote the argv it is handed
 * when `shell: true`. It joins the arguments with spaces into ONE string and runs
 * `/bin/sh -c "<that string>"`, so the shell re-splits them on whitespace. Any argument that
 * carries the checkout's absolute path is then torn apart — and `--config=${derivedConfig}`
 * carries exactly that. Measured, same argument, same call:
 *
 *     shell: true   →  "--config=/tmp/mynrepo/…"   ← the space split the argument in two
 *     shell: false  →  "--config=/tmp/my repo/…"   ← intact
 *
 * A checkout under `~/Google Drive/…` or `~/My Projects/…` (ordinary on macOS) would hand
 * Playwright `--config=/Users/x/Google` and read the remainder as a test filter: the wrong
 * config ⇒ the wrong port ⇒ red specs that look like product bugs — the precise failure mode
 * this runner exists to remove. A directory named `$(…)` would be executed outright.
 *
 * WHY NOT ALWAYS `false` either: on Windows `pnpm` is `pnpm.cmd`, and Node refuses to spawn a
 * `.cmd` without a shell (the CVE-2024-27980 mitigation). Dropping the shell there would not
 * fix anything — it would fail to start the server at all. So Windows keeps EXACTLY today's
 * behaviour, quoting bug included; making a Windows checkout under a path with spaces work
 * needs the arguments escaped by hand, a separate fix nobody has needed yet (this suite runs
 * on macOS and Linux, locally and in CI).
 *
 * Pure and exported so the choice is assertable without spawning anything (E2E-006).
 */
export function resolveSpawnShell(platform: string): boolean {
  return platform === 'win32';
}

/** What takes the place of a credential in redacted text. */
const REDACTED = '[redacted]';

/**
 * A credential inside a URI: `scheme://user:PASSWORD@host`. Only group 2 is the secret;
 * scheme, user and host stay so the message remains diagnosable.
 *
 * The password class excludes `/` on purpose: it is what stops a match from running past the
 * authority into a path (`postgres://u@h/a:b@c` is not a credential). A password that really
 * does contain a literal `/` is therefore missed here — which is exactly what the literal
 * layer of `redact` is for.
 */
const URI_CREDENTIAL = /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s/@]+)(@)/gi;

/**
 * Mask credentials in text produced by a CHILD PROCESS before it reaches a `console.*` or an
 * error message.
 *
 * WHY THIS EXISTS: the runner starts subprocesses with the ephemeral branch's `DATABASE_URL`
 * in their environment — a URI with the role password embedded — and then echoes their
 * stdout/stderr verbatim. Two things make that more than theoretical:
 *
 *   · The password is NOT ephemeral. Neon clones the parent's roles WITH their passwords into
 *     the branch; only the host differs. Deleting the branch rotates nothing.
 *   · GitHub Actions does not mask it. Actions masks the `secrets.*` it was given; this URI is
 *     minted by the runner at runtime, so it would land in the log in clear text.
 *
 * TWO LAYERS, in order:
 *
 *   1. Literal replacement of the secrets the runner ALREADY KNOWS (the connection URI it just
 *      minted). Stronger than any pattern, because it does not depend on the text presenting
 *      the URI in a well-formed shape.
 *   2. The generic URI-credential pattern, for a credential the runner never held — e.g. one a
 *      tool read from `.env` and printed on its own.
 *
 * Scope: this filters what passes THROUGH this process. A child spawned with
 * `stdio: 'inherit'` (the build, Playwright) writes straight to the terminal and never reaches
 * here; those are Next's and Playwright's own output, not a channel this runner opened.
 *
 * Pure and exported so it can be tested without a subprocess (E2E-006).
 */
export function redact(text: string, secrets: readonly (string | undefined)[] = []): string {
  let out = text;

  for (const secret of secrets) {
    // A short or empty "secret" is a caller defect, and honouring it would shred the text
    // (splitting on '' yields every character). Skipped rather than trusted; no real
    // connection URI comes anywhere near this floor.
    if (!secret || secret.length < 8) continue;
    // split/join, not `replace`: the secret is a literal, and a URI is full of characters
    // that a regex would read as syntax.
    out = out.split(secret).join(REDACTED);
  }

  return out.replace(URI_CREDENTIAL, `$1${REDACTED}$3`);
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/**
 * Mutable channel the server watchers write a fatal reason into, so `waitForServer` can bail
 * out with the ACTUAL cause instead of a misleading timeout.
 *
 * One trigger: the child exits before it ever reported ready (crash, bad env). A port already
 * held is a different failure with its own handling, and it is diagnosed BEFORE the spawn —
 * `assertE2EPortAvailable` names the foreign PID, `waitForPortFree` covers the hand-off
 * between this run's own phases.
 */
export type ServerWatch = { fatal: string | null };

/**
 * Wait for the server to be ready — or fail fast with the real cause.
 *
 * Readiness is an ANSWER, of any status: 2xx, 3xx, 4xx and 5xx all prove a server is there
 * and serving. A `silent` probe does not: the socket is bound, but nothing came back inside
 * `SERVER_READY_PROBE_TIMEOUT`, so this polls again rather than declaring victory — a server
 * whose first response is slow (cold Neon branch, machine still flushing the build) costs an
 * extra iteration, never a false ready. The loop's own ceiling stays the only thing that
 * ends the wait.
 *
 * Exported, with the probe and the interval injectable, so that contract is testable without
 * a server (E2E-006).
 */
export async function waitForServer(
  url: string,
  timeout: number,
  watch: ServerWatch,
  options: PollOptions = {}
): Promise<void> {
  const { intervalMs = SERVER_CHECK_INTERVAL, ...probe } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // A watcher (stdout/stderr/exit) may have already diagnosed a fatal condition —
    // surface it now instead of polling a server that will never come up.
    if (watch.fatal) throw new Error(watch.fatal);
    const outcome = await probeHttp(url, { timeoutMs: SERVER_READY_PROBE_TIMEOUT, ...probe });
    if (outcome === 'answered') return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Server did not start within ${timeout / 1000} seconds`);
}

/**
 * Servers THIS runner stopped on purpose. It exists for one thing: telling our own shutdown
 * (the hand-off between phases, the cleanup) apart from an unexpected death. Without the mark
 * the `exit` handler cannot know which one it saw, and since the hand-off is the common case it
 * stayed silent for both — a real death left nothing but specs timing out against an empty port.
 */
const intentionalShutdowns = new WeakSet<ChildProcess>();

/**
 * Whether the server's post-ready output is kept: its stdout (request lines still filtered) and
 * the stderr lines `classifyServerStderrLine` files as `silent` (a `warn` from the kit logger, a
 * slow-query notice). Off by default — that noise would bury Playwright's report — but a
 * VARIABLE and not a code change, because whoever needs it is already mid-investigation.
 */
export function serverLogsKept(env: EnvVars): boolean {
  return env[SERVER_LOGS_ENV] === '1';
}

/**
 * What the server's `exit` event means, decided from the facts the handler holds.
 *
 * - Before ready → `fatal`: `waitForServer` fails fast with the real code/signal instead of
 *   polling out the whole ceiling (unless a watcher already diagnosed one — the first cause wins).
 * - After ready, from `killServerTree` → `ignore`: the runner's own hand-off between phases.
 * - 🔴 After ready, NOT from the runner → `died`: an OOM, a crash, an external signal. It used to
 *   be mute, and the only symptom was every following spec timing out against an empty port with
 *   no assertion broken. Always reported, no flag — hiding the cause is never the right default.
 */
export function serverExitVerdict(facts: {
  ready: boolean;
  intentional: boolean;
  alreadyFatal: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
}): { kind: 'ignore' } | { kind: 'fatal' | 'died'; message: string } {
  const { ready, intentional, alreadyFatal, code, signal } = facts;
  const exit = `code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}`;
  if (ready) {
    if (intentional) return { kind: 'ignore' };
    return {
      kind: 'died',
      message:
        `The E2E server died mid-run (${exit}). The specs that follow will time out against ` +
        `an empty port. Re-run with ${SERVER_LOGS_ENV}=1 to see its full output.`,
    };
  }
  if (alreadyFatal) return { kind: 'ignore' };
  return {
    kind: 'fatal',
    message: `The E2E server exited before it was ready (${exit}). Check the output above.`,
  };
}

/**
 * Kill the server AND its child tree. The real `next start` is never the process that was
 * spawned: it is a CHILD of `pnpm` (a grandchild on Windows, where the spawn still goes
 * through a shell — `resolveSpawnShell`), so `proc.kill()` hits only the wrapper and leaves
 * the server orphaned on the port — the next phase then binds EADDRINUSE and SILENTLY runs
 * against the stale server (wrong MFA posture → false failures). Signalling the negative pid
 * targets the whole process group (the server is started `detached`); Windows uses
 * `taskkill /T`.
 */
function killServerTree(proc: ChildProcess): void {
  if (!proc.pid) return;
  intentionalShutdowns.add(proc);
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'pipe' });
    } else {
      process.kill(-proc.pid, 'SIGKILL');
    }
  } catch {
    // Group already gone, or the child was not a group leader — fall back to a direct kill.
    try {
      proc.kill('SIGKILL');
    } catch {
      /* already dead */
    }
  }
}

/**
 * The DATA cache Next persists on disk — wiped before every server this run starts.
 *
 * `.next/cache/fetch-cache/` is where `unstable_cache` (and `fetch` with a revalidate) writes
 * its entries, and those entries SURVIVE the process. The runner mints a throwaway Neon branch
 * per run (`sk-e2e §1`), so a surviving entry describes rows of a database that no longer
 * exists: measured in the fleet as a cached row served hours after its branch was deleted, an
 * insert dying on a foreign key, and the whole thing surfacing as a missing record rather than
 * as a cache hit. The kit ships the affected pattern itself (`createCachedCount`, consumed by
 * `getUserCount`), so this is not somebody else's problem.
 *
 * 🔴 ONLY the data cache — not `.next/`, not `.next/cache/`:
 *   · `.next/cache/images/` and `.tsbuildinfo` describe no database row, and they are exactly
 *     what build recycling exists to keep (`sk-e2e §1.3`). Wiping `.next/cache/` whole would
 *     fix this bug by breaking that optimisation.
 *   · `.next/e2e-build-stamp.json` lives outside `.next/cache/` and stays: delete it and every
 *     run recompiles.
 *   · `.next/dev/cache` (Turbopack's persistent cache for `next dev`) is NOT here. The runner
 *     always serves `next start` (`sk-e2e §1.1`), which neither reads nor writes it, so
 *     deleting it would fix nothing — and would delete live files out from under a `pnpm dev`
 *     running in the same checkout, which is a NEW hazard, the mirror image of the one
 *     `sk-e2e §1.1` already documents.
 */
export const E2E_DATA_CACHE_DIRS: readonly string[] = ['.next/cache/fetch-cache'];

/**
 * Drop the data cache. Unconditional, and deliberately so: cached rows from a discarded
 * database are never the right answer, so there is no flag to keep them and no heuristic worth
 * asking. Called once per SERVER (see its call site in `runPhase`), never once per run — with
 * two phases the guarantee "the server about to answer holds no other database's rows" has to
 * hold twice.
 *
 * An absent directory is the ordinary case, not an error: a clean checkout, or a project that
 * never ran a cached query, has none (`force: true`). Failing to remove it is not worth a run
 * either — the worst consequence is the state that existed before this function did.
 */
export function clearE2EDataCache(): void {
  for (const dir of E2E_DATA_CACHE_DIRS) {
    try {
      rmSync(resolve(process.cwd(), dir), { recursive: true, force: true });
    } catch {
      // Not removable (permissions, a file in its place). The build and its stamp are
      // untouched, so the run continues exactly as it would have before.
    }
  }
}

export interface StartServerOptions {
  /** Redacted out of everything this server prints — it carries the branch password. */
  databaseUrl: string;
  /** The phase's fully composed server env (`resolvePhaseEnv`), applied over `process.env`. */
  env: EnvOverrides;
  /** Named in the startup line, so a multi-phase run says which server just came up. */
  project: string;
  port: number;
  watch: ServerWatch;
}

/**
 * Spawn the Next.js PRODUCTION server (`next start`) with the env the caller composed. This
 * function is only the spawn + its output watchers; WHAT the server runs with is decided
 * separately (`serverEnvOverrides` + the phase's own `env()`), so it stays assertable without
 * starting anything — and so a phase is a datum here rather than a boolean parameter.
 */
function startServer(options: StartServerOptions): ChildProcess {
  const { databaseUrl, env, project, port, watch } = options;

  console.log(`\n🚀 Starting production server on port ${port} (phase '${project}')...`);

  // Serve the PRODUCTION build (`next start`), NOT `next dev`. The dev server compiles each
  // route on demand at its first request, which makes page-load time depend on which spec ran
  // first — the source of cascading `page.goto` / `waitForURL` timeouts that look like product
  // bugs. A precompiled build serves every route immediately: fast and, more importantly,
  // deterministic.
  //
  // 📊 MEASURED on two independent projects of the fleet. This file ships to every one of
  // them via `factory update`, so the projects are described, never named:
  //
  //   Project A (127 tests, 2026-08-02) — the build was removed and the suite served with
  //   `next dev` to check whether this justification still held. Same suite, same machine:
  //
  //   |         | `next start` (with build) | `next dev` (no build) |
  //   | flaky   | 2                         | 13                    |
  //   | TOTAL   | ~4.5 min                  | ~11.3 min             |
  //
  //   Project B (~120 tests, ~40 routes, 2026-08-03):
  //   `next dev`   → 108 pass · 1 fail · 4 never ran · Playwright 7.9 min
  //   `next start` → 116 pass · 0 fail · 0 never ran · Playwright 4.6 min
  //                  (6m57s in total, build included)
  //
  // Without the build it came out ~2.5× SLOWER (dev recompiles each route the first time a
  // test touches it) and far less stable. The specs that turned flaky were exactly the ones
  // that navigate to a new route and wait for it to load. In project B, EVERY long-standing
  // failure turned out to be a dev artifact — none was real. The build earns its long minute.
  //
  // 🔴 Operational corollary: NEVER serve e2e with `next dev` over a `.next` left behind by a
  // previous `pnpm build`. Both write the same directory and the dev server hangs compiling
  // (measured in project B, one data-heavy route: still unanswered at 210s with the dirty
  // cache, 7.8s with a clean `.next`, 0.99s in production). Serving the build removes that
  // entirely, because the build IS what is served — there are no two owners of the directory.
  //
  // The build is produced ONCE by the caller before the phases; both phases (MFA off/on)
  // reuse it because the MFA posture is a RUNTIME server env (serverEnvOverrides), not
  // build-baked. `-p` sets the port directly — pnpm scripts don't forward extra args.
  const serverProcess = spawn('pnpm', ['next', 'start', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    // Own process group (unix): the server runs as a CHILD of `pnpm`, so a plain kill hits
    // only the wrapper and leaves `next start` holding the port. `detached` lets
    // killServerTree() signal the whole group. Windows kills the tree via taskkill /T.
    detached: process.platform !== 'win32',
    // Windows only — on POSIX a shell would re-split every argument carrying a path with
    // spaces, and `cwd` here is the checkout. See resolveSpawnShell for the measurement.
    shell: resolveSpawnShell(process.platform),
  });

  let serverReady = false;
  const keepServerLogs = serverLogsKept(process.env);

  // Pre-ready death → watch.fatal, so waitForServer fails fast; post-ready death the runner did
  // not cause → reported; our own killServerTree() → silent. See serverExitVerdict.
  serverProcess.on('exit', (code, signal) => {
    const verdict = serverExitVerdict({
      ready: serverReady,
      intentional: intentionalShutdowns.has(serverProcess),
      alreadyFatal: watch.fatal !== null,
      code,
      signal,
    });
    if (verdict.kind === 'died') console.error(`   ❌ ${verdict.message}`);
    else if (verdict.kind === 'fatal') watch.fatal = verdict.message;
  });

  // Both watchers below redact BEFORE anything is printed. This server was started with the
  // branch's `DATABASE_URL` — password included — in its environment, and a Next stack trace
  // that echoes its own env would otherwise land verbatim in the terminal or in a CI log that
  // masks nothing (see `redact`).
  serverProcess.stdout?.on('data', (data) => {
    const line = redact(data.toString().trim(), [databaseUrl]);
    if (!line) return;

    // Always show startup info (Next.js banner, port, env)
    if (
      line.includes('Next.js') ||
      line.includes('Local:') ||
      line.includes('Network:') ||
      line.includes('Environments:') ||
      line.includes('Ready in') ||
      line.includes('Starting...')
    ) {
      console.log(`   ${line}`);
      if (line.includes('Ready in')) serverReady = true;
      return;
    }

    // After server is ready, suppress its output to reduce noise — unless E2E_SERVER_LOGS=1.
    if (serverReady && !keepServerLogs) return;

    // During startup, only show non-request lines
    const isRequestLog = /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/.test(line);
    if (!isRequestLog) {
      console.log(`   ${line}`);
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    // One chunk can carry several lines; each one is classified on its own.
    for (const raw of data.toString().split('\n')) {
      const line = redact(raw.trim(), [databaseUrl]);
      const verdict = classifyServerStderrLine(line);
      if (verdict === 'error') console.error(`   ❌ ${line}`);
      else if (verdict === 'unclassified') console.error(`   ⚠️  ${line}`);
      else if (keepServerLogs && line) console.error(`   ${line}`);
    }
  });

  return serverProcess;
}

/**
 * What the runner does with one line of the server's stderr.
 *
 * `error` is printed with ❌, `unclassified` with ⚠️, `silent` not at all.
 *
 * 🔴 A STRUCTURED LOG LINE IS CLASSIFIED BY ITS OWN `level`, NEVER BY A SUBSTRING. The old rule
 * — print anything containing `error` — read the DATA a line carries as if it were its severity:
 * every CSP report the kit's logger emits at `level: "warn"` embeds the document URL, and an auth
 * spec deliberately produces `/login?error=CredentialsSignin` there, so a green run printed dozens
 * of ❌ over lines the logger itself had filed as warnings. A ❌ in a green run is what teaches a
 * reader to stop looking at them, and then a real one has nothing to stand out from. The JSON
 * already says what it is; this reads that field and stops guessing.
 *
 * A line that is not JSON falls back to the substring — but as `unclassified` (⚠️): the runner did
 * not establish that it is an error, so the prefix must not claim it did. A plain stack trace still
 * surfaces; it just does not wear a verdict nobody issued.
 */
export function classifyServerStderrLine(line: string): 'error' | 'unclassified' | 'silent' {
  if (line.length === 0) return 'silent';

  if (line.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object' && 'level' in parsed) {
      const level = String((parsed as { level: unknown }).level).toLowerCase();
      return level === 'error' || level === 'fatal' ? 'error' : 'silent';
    }
  }

  return /error/i.test(line) ? 'unclassified' : 'silent';
}

/**
 * The exact argv one phase hands Playwright: this run's config and phase, then whatever the
 * developer typed and the runner did not consume.
 *
 * Exported so the END of the argument chain is assertable — the point of failure for a filter
 * that exists but was never wired. `main` builds the invocation from here and nowhere else, so
 * a test on this function is a test on what Playwright really receives, rather than on a copy
 * of the composition that could drift away from it.
 */
export function playwrightPhaseArgv(options: {
  /** The derived config's path, or `null` for a project that ships no Playwright config. */
  derivedConfig: string | null;
  project: string;
  /** What survived the runner's own parsers, forwarded verbatim. */
  phaseArgs: string[];
}): string[] {
  const { derivedConfig, project, phaseArgs } = options;
  return [
    // FIRST on the command line, deliberately: Playwright keeps the LAST `--config` it is
    // given (verified against 1.58), so an explicit one typed by the developer still wins —
    // the escape hatch stays open.
    ...(derivedConfig ? [`--config=${derivedConfig}`] : []),
    `--project=${project}`,
    // Per-phase output dir. Playwright WIPES its output dir on start, so with the shared
    // default the MFA phase deleted the base phase's traces and page snapshots — the one
    // artifact that explains a failure was always gone by the time the run finished.
    `--output=test-results/${project}`,
    ...phaseArgs,
  ];
}

/**
 * Run Playwright tests
 */
function runPlaywrightTests(args: string[], envOverrides: EnvOverrides): Promise<number> {
  return new Promise((resolvePromise) => {
    console.log('\n🧪 Running Playwright tests...\n');

    const testProcess = spawn('pnpm', ['playwright', 'test', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...envOverrides },
      stdio: 'inherit',
      // Windows only. `args` carries `--config=<absolute path of the derived config>`, which
      // a POSIX shell would split on the first space in the checkout's path — Playwright
      // would then load the wrong config, serve on the wrong port, and fail everything.
      // See resolveSpawnShell.
      shell: resolveSpawnShell(process.platform),
    });

    testProcess.on('close', (code) => {
      resolvePromise(code ?? 1);
    });
  });
}

/** What `playwright test --list` left behind: its exit code and everything it printed. */
export interface PlaywrightListing {
  code: number;
  /** stdout and stderr, in arrival order — the marker line and the count may be on either. */
  output: string;
}

/**
 * Ask Playwright which tests the phase WOULD run, without running any.
 *
 * The SAME argv the phase itself receives (`playwrightPhaseArgv`: derived config, project,
 * output dir, the forwarded arguments) plus `--list`, under the SAME environment — the compile
 * guard for `server-only` travels in `NODE_OPTIONS` (`playwrightEnvOverrides`), and without it
 * the listing dies loading `auth.setup.ts` exactly as a run would. One Playwright process, no
 * server: `--list` neither starts a webServer nor runs global setup, so it is answered in the
 * seconds a full phase spends booting. Output is captured, not inherited, because the answer is
 * read (`phaseMatchesFilter`), and a listing nobody asked to see would only bury the run's log.
 */
function listPlaywrightTests(
  args: string[],
  envOverrides: EnvOverrides
): Promise<PlaywrightListing> {
  return new Promise((resolvePromise) => {
    const chunks: string[] = [];
    const listProcess = spawn('pnpm', ['playwright', 'test', '--list', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: resolveSpawnShell(process.platform),
    });
    listProcess.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf-8')));
    listProcess.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf-8')));
    listProcess.on('close', (code) => {
      resolvePromise({ code: code ?? 1, output: chunks.join('') });
    });
  });
}

// ---------------------------------------------------------------------------
// Migration step
// ---------------------------------------------------------------------------

/**
 * One captured stream off a failed `execSync`, as text.
 *
 * `execSync` throws a plain Error whose `message` is only `Command failed: <cmd>`; the
 * command's real output rides along on non-standard `stdout` / `stderr` properties. They are
 * `Buffer` when the call had no `encoding` (our case) and `string` when it did, so both are
 * handled — and anything else yields '' rather than a bogus `[object Object]` in the report.
 * Narrowed through `Record<string, unknown>` instead of `any`: the shape is not in the
 * `unknown` a catch hands us, but nothing here needs to opt out of type checking (SK.md §4.3).
 *
 * Exported for tests (E2E-006): pure, and the `Buffer` vs `string` split is exactly the
 * kind of thing that regresses silently into `[object Object]` in a failure report.
 */
export function execFailureOutput(error: unknown, stream: 'stdout' | 'stderr'): string {
  if (typeof error !== 'object' || error === null) return '';
  const value = (error as Record<string, unknown>)[stream];
  if (typeof value === 'string') return value.trim();
  if (Buffer.isBuffer(value)) return value.toString('utf-8').trim();
  return '';
}

/**
 * How many migrations are recorded as applied on `connectionUri` — or `null` when that
 * cannot be answered.
 *
 * There is no count in what `drizzle-kit migrate` prints: its `MigrateProgress` view renders
 * exactly two strings, "applying migrations..." and "migrations applied successfully!",
 * whether it applied zero or twenty. The only truthful source is drizzle's OWN bookkeeping:
 * `PgDialect.migrate()` inserts one row per applied migration into `drizzle.__drizzle_migrations`.
 * Reading that count on both sides of the run measures what happened instead of predicting it.
 *
 * `null`, never a guess, when the answer is unavailable — a derivative may rename the table via
 * `migrations: { table, schema }` in its drizzle config, and the fresh branch may not answer at
 * all. The caller then stays quiet: an unreported compensation beats an invented number.
 */
async function countAppliedMigrations(connectionUri: string): Promise<number | null> {
  const pool = new Pool({ connectionString: connectionUri });
  // An idle Neon socket dies on its own (idle timeout / branch suspend) and node-postgres
  // escalates that to an uncaughtException when nothing listens — it would take the whole run
  // down for a diagnostic. Same guard as src/lib/db/drizzle.ts, minus the logging.
  pool.on('error', () => {});

  try {
    // Two round trips on purpose: Postgres resolves relations at PARSE time, so folding this
    // into one `CASE WHEN to_regclass(...) IS NULL THEN 0 ELSE (SELECT count(*) ...)` still
    // fails when the table is absent — the normal state of a branch that never migrated.
    const probe = await pool.query('SELECT to_regclass($1) IS NOT NULL AS present', [
      DRIZZLE_MIGRATIONS_TABLE,
    ]);
    if (probe.rows[0]?.present !== true) return 0;

    // `::int` because `count(*)` is int8, which node-postgres hands back as a string.
    const counted = await pool.query(
      `SELECT count(*)::int AS applied FROM ${DRIZZLE_MIGRATIONS_TABLE}`
    );
    const applied = counted.rows[0]?.applied;
    return typeof applied === 'number' ? applied : null;
  } catch {
    return null;
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * How many migrations this step had to apply — `null` when either side is unknown, so the
 * caller stays quiet instead of reporting an invented number.
 */
export function migrationDelta(before: number | null, after: number | null): number | null {
  return before !== null && after !== null ? after - before : null;
}

/**
 * The schemas Postgres owns — never dropped by {@link resetE2EBranch}. Everything else in the
 * database belongs to the app (its tables, drizzle's bookkeeping, extensions the migrations
 * created) and goes.
 */
const SYSTEM_SCHEMAS: ReadonlySet<string> = new Set([
  'pg_catalog',
  'information_schema',
  'pg_toast',
]);

/**
 * Which of `names` (every schema of the database) {@link resetE2EBranch} drops: all of them
 * except Postgres' own — the system schemas and the per-session `pg_temp_*` / `pg_toast_temp_*`.
 *
 * ALL user schemas, not only `public` + `drizzle`: a derivative may move drizzle's bookkeeping
 * table elsewhere (`migrations: { table, schema }` in its drizzle config), and a surviving
 * bookkeeping table is exactly what makes `db:migrate` skip the chain this reset exists to test.
 *
 * Exported for tests: pure, and dropping one schema too many (or too few) is silent otherwise.
 */
export function schemasToDrop(names: readonly string[]): string[] {
  return names.filter(
    (name) =>
      !SYSTEM_SCHEMAS.has(name) &&
      !name.startsWith('pg_temp_') &&
      !name.startsWith('pg_toast_temp_')
  );
}

/**
 * Empty the throwaway branch: drop every user schema and recreate `public` the way Postgres
 * ships it (owned by `pg_database_owner`, `USAGE` to everyone). What follows it —
 * `pnpm db:migrate` — then applies the WHOLE chain from `0000`.
 *
 * Runs only when the repo opts in (`e2e.config.json` → `emptyBranch: true`, see
 * {@link readE2EConfig}). Why a repo would:
 *   · the full migration chain is exercised on every run — a broken journal, a bad order, or a
 *     migration that only worked because something was applied by hand to the parent, fails
 *     HERE and not in a deploy;
 *   · the suite cannot lean on rows that only exist in the parent: specs and `auth.setup.ts`
 *     must seed everything they read.
 * What it no longer covers — a migration that fails only against real-shaped data (a
 * `NOT NULL` without default over a populated table) — is caught by the develop deploy, which
 * migrates the develop database before anything reaches `main`.
 *
 * One multi-statement query with its own BEGIN/COMMIT: all or nothing. A failure throws
 * (redacted — the error may quote the URI), the run stops, and `cleanup()` deletes the branch.
 *
 * Scope: ONLY the throwaway branch — `connectionUri` is the one `createE2EBranch()` just minted,
 * reached solely through {@link migrateE2EBranch}. Never a real database.
 *
 * @returns how many schemas were dropped.
 */
async function resetE2EBranch(connectionUri: string): Promise<number> {
  const pool = new Pool({ connectionString: connectionUri });
  // Same idle-socket guard as countAppliedMigrations.
  pool.on('error', () => {});

  try {
    const listed = await pool.query('SELECT nspname FROM pg_namespace');
    const names = (listed.rows as Array<{ nspname?: unknown }>)
      .map((row) => row.nspname)
      .filter((name): name is string => typeof name === 'string');
    const doomed = schemasToDrop(names);
    // Identifiers double-quoted with embedded quotes doubled — a schema name is data here.
    const drops = doomed.map((name) => `DROP SCHEMA "${name.replaceAll('"', '""')}" CASCADE;`);
    await pool.query(
      [
        'BEGIN;',
        ...drops,
        'CREATE SCHEMA public AUTHORIZATION pg_database_owner;',
        'GRANT USAGE ON SCHEMA public TO PUBLIC;',
        'COMMIT;',
      ].join('\n')
    );
    return doomed.length;
  } catch (error) {
    const detail = redact(error instanceof Error ? error.message : String(error), [connectionUri]);
    throw new Error(
      `Failed to empty the E2E branch before migrating it.\n` +
        `The run starts every suite from an empty database, so it stops here instead of testing ` +
        `on top of the parent's data.\n${detail}`
    );
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Migrate the ephemeral branch up to the current TS schema — from `0000` on an emptied branch
 * when the repo opts in, or on top of the parent's data otherwise.
 *
 * The branch is cloned from a long-lived parent (`develop` locally) that drifts behind
 * `src/lib/db/schema/` as soon as any epic adds a table — nothing migrates it on a schedule.
 * Without this step every spec that touches a newly added table dies with
 * `relation "..." does not exist`, which reads like a product bug but is pure infra drift.
 *
 * Two modes, chosen by `e2e.config.json` ({@link readE2EConfig}):
 *   · `emptyBranch: true`  — the branch is EMPTIED first ({@link resetE2EBranch}) and the whole
 *                            chain replays from `0000`. New projects are born with it.
 *   · `emptyBranch: false` — (or no file: every repo born before the flag) the parent's data
 *                            stays and drizzle's journal applies only what the parent lacks.
 *
 * Scope note: this ONLY ever touches the throwaway branch — `connectionUri` is the
 * one `createE2EBranch()` just minted and `cleanup()` deletes. Never a real database.
 *
 * Guarded on the journal: a derivative born without `src/lib/db/migrations/meta/_journal.json`
 * has nothing to rebuild the database from, so there the branch is neither emptied nor
 * migrated — it keeps the schema it inherited from the parent. Same principle as
 * BR-FACTORY-006: a brain artifact tolerates the divergent src it lands on.
 *
 * Exported only so a test can prove that guard with an injected `fs` (E2E-006): with no
 * journal the function must return WITHOUT reaching `execSync` or the database — the case
 * that would otherwise break every derivative born without a migrations dir.
 */
export async function migrateE2EBranch(
  connectionUri: string,
  options: { emptyBranch: boolean } = { emptyBranch: false }
): Promise<void> {
  const migrationsJournal = resolve(process.cwd(), 'src/lib/db/migrations/meta/_journal.json');
  if (!existsSync(migrationsJournal)) {
    console.log(
      '\n🔄 No migrations dir — using the schema inherited from the parent branch' +
        (options.emptyBranch ? ' (not emptied: there is nothing to rebuild it from).' : '.')
    );
    return;
  }

  if (options.emptyBranch) {
    const dropped = await resetE2EBranch(connectionUri);
    console.log(
      `\n🧹 Emptied the throwaway branch (${dropped} schema(s)) — migrating from 0000...`
    );
  } else {
    console.log('\n🔄 Migrating branch to current schema...');
  }
  // Read on BOTH sides of the run: the difference is exactly how much this step applied
  // (see countAppliedMigrations for why it cannot come from the output).
  const appliedBefore = await countAppliedMigrations(connectionUri);
  try {
    // `stdio: 'pipe'` stays: it is what makes the output readable programmatically, which
    // the catch below depends on. Inheriting it would print drizzle's spinner instead.
    execSync('pnpm db:migrate', {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: connectionUri },
    });
  } catch (error) {
    // `error.message` alone is just `Command failed: pnpm db:migrate` — the actual cause
    // (the failing statement, a refused connection) only ever appears in the piped
    // stdout/stderr. Dropping them left the developer to reproduce the failure by hand
    // outside the runner; stderr first because that is where drizzle puts the reason.
    //
    // REDACTED on the way out, and this is where it has to happen: `pnpm db:migrate` ran with
    // `DATABASE_URL=<the branch URI, password included>` in its environment, and a connection
    // error commonly quotes the URI it was handed. This message is printed by main() and, on
    // CI, ends up in a log that masks nothing (see `redact`).
    const detail = redact(error instanceof Error ? error.message : String(error), [connectionUri]);
    const output = redact(
      [execFailureOutput(error, 'stderr'), execFailureOutput(error, 'stdout')]
        .filter(Boolean)
        .join('\n'),
      [connectionUri]
    );
    throw new Error(
      `Failed to migrate the E2E branch to the current schema.\n` +
        `Specs would fail with misleading "relation does not exist" errors, so the run stops here.\n` +
        `${detail}\n` +
        (output
          ? `--- pnpm db:migrate output ---\n${output}`
          : `(pnpm db:migrate produced no stdout/stderr)`)
    );
  }
  // Unknown on either side (a renamed bookkeeping table) ⇒ no number is claimed, and the run
  // continues.
  const appliedAfter = appliedBefore === null ? null : await countAppliedMigrations(connectionUri);
  const applied = migrationDelta(appliedBefore, appliedAfter);

  if (options.emptyBranch) {
    // The count is the evidence that the chain really ran from `0000`.
    console.log(
      applied !== null
        ? `   ✓ Applied ${applied} migration(s) from scratch`
        : '   ✓ Branch schema up to date'
    );
    return;
  }

  console.log('   ✓ Branch schema up to date');
  // A parent already current applies nothing, and nothing is worth saying — that is the
  // silent, healthy case. Anything above zero means the branch this run cloned is BEHIND
  // the TS schema: the throwaway copy got patched here, the parent stays stale, and the
  // next run pays for it again. Visible, and only that — the run continues, because the
  // copy is now correct and the drift is somebody's upstream `db:migrate`, not this run's.
  if (applied !== null && applied > 0) {
    console.log(
      `   ⚠️  Applied ${applied} pending migration(s) — the PARENT branch is behind src/lib/db/schema/.\n` +
        `      This run patched its throwaway copy and continues; the parent stays stale until ` +
        `someone runs pnpm db:migrate against it (or pnpm db:generate, if the migration is missing too).`
    );
  }
}

/** The repo's E2E settings file — dev-owned, born with every new project, never touched by `factory update`. */
export const E2E_CONFIG_PATH = 'e2e.config.json';

/** What `e2e.config.json` may declare. */
export interface E2EConfig {
  /** Empty the throwaway branch and migrate it from `0000` ({@link resetE2EBranch}). */
  emptyBranch: boolean;
}

/**
 * Read `e2e.config.json` from `rootDir`.
 *
 * ABSENT ⇒ `{ emptyBranch: false }`, the behavior every repo had before the flag existed. The
 * file lives at the repo root on purpose: `factory new` delivers it (born `true`), and
 * `factory update` never creates or touches it — so an existing repo keeps its behavior until
 * someone opts in (the update offers it interactively).
 *
 * PRESENT but unreadable, not a JSON object, with a non-boolean `emptyBranch` or with keys it
 * does not know ⇒ throws, naming the file. A mode is never guessed: running the wrong one either
 * hides the failures the empty branch exists to surface or breaks a suite that did not ask for it.
 */
export function readE2EConfig(rootDir: string = process.cwd()): E2EConfig {
  const file = resolve(rootDir, E2E_CONFIG_PATH);
  if (!existsSync(file)) return { emptyBranch: false };

  const invalid = (why: string): Error =>
    new Error(
      `${E2E_CONFIG_PATH} is not valid (${why}). Expected {"emptyBranch": true} or ` +
        `{"emptyBranch": false}; delete the file to run as before (branch cloned with the parent's data).`
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    throw invalid('not readable JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalid('not a JSON object');
  }
  const unknownKeys = Object.keys(parsed).filter((key) => key !== 'emptyBranch');
  if (unknownKeys.length > 0) throw invalid(`unknown key(s): ${unknownKeys.join(', ')}`);
  const emptyBranch = (parsed as Record<string, unknown>).emptyBranch;
  if (typeof emptyBranch !== 'boolean') throw invalid('`emptyBranch` must be true or false');
  return { emptyBranch };
}

/**
 * Build the app ONCE (production) so both phases run against a precompiled server via
 * `next start` — see the rationale + measurements on startServer. Routes under
 * `(protected)` are dynamic, so the build never queries the DB — `connectionUri` is
 * passed for robustness. A build failure throws → the caller's cleanup deletes the
 * branch + exits 1.
 *
 * ℹ️  Single-tenant note: `prebuild` regenerates the baked email logo from `.env.local`,
 * which here is the SAME env the developer already works with, so the regeneration is
 * idempotent and needs no snapshot. A MULTI-TENANT derivative is different: if it selects
 * the tenant at RUN time (e.g. `pnpm dev:<tenant>`) without re-running prebuild, this
 * build would leave the default tenant's logo on disk under a developer working on
 * another one. Such a derivative should snapshot `src/lib/email/logo-data.ts` before the
 * build and restore it in a `finally` (the file is gitignored, so it can never reach a
 * commit — but it would confuse a local email preview until something regenerated it).
 */
function buildApp(connectionUri: string, appUrl: string, why: string, runEnv: EnvVars): void {
  console.log(`\n🏗️  Building the app (production) for E2E — ${why}...`);
  execSync('pnpm build', {
    stdio: 'inherit',
    // `runEnv` layered on: it is the run's environment — the host's, plus whatever
    // `e2e.env.project.ts` pinned in its `build` half — and it is the SAME value the stamp was
    // computed from. Baking `process.env` alone would bake one environment and stamp another,
    // so a recycled `.next/` could be declared current while holding different public vars.
    // `process.env` leads only to keep the `ProcessEnv` shape `execSync` types; `runEnv` already
    // contains it, so the spread is redundant in value and load-bearing in types.
    env: {
      ...process.env,
      ...runEnv,
      ...bakedEnvOverrides({ databaseUrl: connectionUri, appUrl }),
    },
  });
  console.log('   ✓ Build ready\n');
}

export interface PrepareBuildOptions {
  databaseUrl: string;
  appUrl: string;
  port: number;
  /** `--build` — rebuild unconditionally. */
  force: boolean;
  /**
   * The run's environment: where `CI` is read from, and where the `NEXT_PUBLIC_*` vars that
   * feed the stamp come from (`collectPublicEnv`). A parameter so a test never depends on
   * the host's.
   */
  env: EnvVars;
}

/**
 * The stamp of the inputs as they are RIGHT NOW, or `null` if it could not be computed.
 *
 * A failure here must never take the run down: not knowing the stamp only means the
 * runner cannot prove the build is current, and the answer to that is to build.
 */
function currentBuildStamp(
  bakedEnv: EnvOverrides,
  port: number,
  extraInputs: readonly string[],
  env: EnvVars
): string | null {
  try {
    return computeBuildStamp({
      envLocal: readEnvLocal(),
      bakedEnv,
      // The run's own public vars, from the env this function was HANDED — the same discipline
      // `PrepareBuildOptions.env` already documents. Reading `process.env` here would make the
      // stamp depend on the host of whoever calls it, tests included.
      publicEnv: collectPublicEnv(env),
      port,
      sources: collectBuildSources(extraInputs),
    });
  } catch (error) {
    console.log(
      `   ⚠️  Could not compute the build stamp (${
        error instanceof Error ? error.message : String(error)
      }).`
    );
    return null;
  }
}

/**
 * Build the app — unless the build already in `.next/` was produced from exactly these
 * inputs, in which case reuse it.
 *
 * ℹ️  KNOWN SKIP, by design: reusing the build also skips `prebuild`
 * (`generate:email-logo` + `generate:pwa-icons`), which reads `.env.local` too. Those
 * outputs live in `src/` and `public/`, so they ARE part of the stamp — meaning a reused
 * build is one where they were already regenerated and unchanged. What a recycled run
 * does not do is re-derive them from a `.env.local` edit... which is precisely a case the
 * stamp rejects, so it rebuilds and `prebuild` runs. The residue is narrower still: an
 * input to those generators that is neither `.env.local` nor a hashed file. Documented as
 * a known skip (E2E-007 §8), not fixed here.
 */
function prepareBuild(options: PrepareBuildOptions): void {
  const { databaseUrl, appUrl, port, force, env } = options;
  const bakedEnv = bakedEnvOverrides({ databaseUrl, appUrl });
  const ci = isCI(env);

  // What THIS project adds to the stamp, if anything. Read here — one small file — rather
  // than inside the stamp walk, which runs twice on a rebuild, so a misconfigured key is
  // reported once and always, CI included.
  const extra = readExtraBuildInputs();
  for (const { value, reason } of extra.rejected) {
    console.log(
      `   ⚠️  package.json#${EXTRA_BUILD_INPUTS_KEY}: ignoring ${value} — ${reason}. ` +
        `The rest of the stamp is unaffected.`
    );
  }
  if (extra.accepted.length > 0) {
    console.log(
      `   ℹ️  Build stamp also covers ${extra.accepted.join(', ')} (package.json#${EXTRA_BUILD_INPUTS_KEY}).`
    );
  }

  // Neither the stamp nor the previous build is even read when CI or `--build` already
  // settle it — the rule is the rule, and the work would be wasted.
  const settled = ci || force;
  const previous = settled ? null : readPreviousBuild();
  const stamp = settled ? null : currentBuildStamp(bakedEnv, port, extra.accepted, env);
  const decision = resolveBuildDecision({ ci, force, stamp, previous });

  if (!decision.rebuild) {
    const at = previous?.builtAt ? formatBuildTime(previous.builtAt) : null;
    console.log(
      `\n♻️  Reusing the production build${at ? ` from ${at}` : ''} — every input that feeds it is unchanged. Pass --build to force a rebuild.`
    );
    console.log(
      '   ℹ️  Known skip: `prebuild` (email logo + PWA icons) does not re-run with a reused build.'
    );
    return;
  }

  // Dropped BEFORE the build: if the build fails, the previous stamp must not survive to
  // describe the wreckage it leaves in `.next/`.
  invalidateBuildStamp();
  buildApp(databaseUrl, appUrl, BUILD_REASON_LABEL[decision.reason], env);

  // Stamped AFTER the build, deliberately: `prebuild` REWRITES hashed sources (the email
  // logo under `src/`, the PWA icons under `public/`). A stamp taken before the build
  // would describe inputs that no longer exist once it finished, so the next run would
  // see a mismatch and rebuild — every time, for ever.
  const built = currentBuildStamp(bakedEnv, port, extra.accepted, env);
  if (built) writeBuildStamp(built);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * The run's exit code, from the exit codes of the phases that executed.
 *
 * 🔴 AN EMPTY LIST IS A FAILURE, NOT A SUCCESS. This used to be `codes.some((c) => c !== 0)`,
 * and `[].some(…)` is `false` — so a run that executed NO phase reported green. That is the
 * exact defect this epic exists to close, sitting inside the mechanism meant to prevent it.
 *
 * It is defence in depth, deliberately redundant: `resolveAvailablePhases` already throws before
 * a branch is created when nothing is runnable, which is the primary correction because it names
 * what was skipped and why. This one covers a future resolution bug that bypasses it — the
 * cheapest possible guard for the costliest possible mistake.
 */
export function resolveExitCode(codes: readonly number[]): number {
  if (codes.length === 0) return 1;
  return codes.some((code) => code !== 0) ? 1 : 0;
}

/** What one phase left behind: its Playwright project and the exit code it returned. */
export interface PhaseResult {
  project: string;
  code: number;
  /**
   * `true` ⇒ the phase never ran: the invocation carried a test filter and that filter matched
   * nothing in this phase's project (`phaseMatchesFilter`). `code` is `0` for it, but it is NOT
   * a pass — `resolveRunExitCode` leaves it out of the verdict, and a run where EVERY phase was
   * skipped this way fails.
   */
  skippedByFilter?: boolean;
}

// ---------------------------------------------------------------------------
// Test filters — a spec path or a `--grep` that reaches only SOME phases
// ---------------------------------------------------------------------------

/**
 * Playwright's own flags that narrow WHICH tests run, in their `--flag=value` spelling.
 *
 * The spaced spelling (`--grep foo`) needs no entry: its value is a token that does not start
 * with a dash, which `hasTestFilter` already reads as a filter.
 */
const PLAYWRIGHT_FILTER_FLAG_PREFIXES = ['--grep=', '--grep-invert='];

/**
 * Whether the arguments forwarded to Playwright narrow the tests to run.
 *
 * A positional argument (`tests/e2e/x.spec.ts`, or the spaced value of any flag) or a `--grep`
 * family flag. The test is deliberately generous: a value that turns out not to be a filter
 * (`--workers 2` reads `2` as one) costs a listing that finds every test and changes nothing,
 * while a filter missed here is the defect this exists to close.
 *
 * WHY THE RUNNER HAS TO KNOW. It injects `--project=<phase>` and forwards the rest of the
 * arguments to Playwright ONCE PER PHASE. A filter that names a spec of one phase reaches every
 * other phase too, and a phase whose project holds no matching test is answered by Playwright
 * with `No tests found` and exit code 1 — so `pnpm test:e2e tests/e2e/register.spec.ts` passed
 * its spec in the base phase and then ended `❌ Tests failed` because `mfa` (whose `testMatch`
 * admits only `*.mfa.spec.*`) had nothing to run. The kit's own two phases reproduce it; a
 * derivative that declares phases of its own in `e2e.project.ts` only meets it more often.
 */
export function hasTestFilter(phaseArgs: readonly string[]): boolean {
  return phaseArgs.some(
    (arg) => !arg.startsWith('-') || PLAYWRIGHT_FILTER_FLAG_PREFIXES.some((p) => arg.startsWith(p))
  );
}

/**
 * The sentence Playwright prints — and only then — when the filters selected zero tests.
 *
 * It is the signal that separates "nothing matched" from "a spec died while being LOADED":
 * both end in `Total: 0 tests in 0 files`, but a load error (a `server-only` module reached
 * through a fixture, §1.5 of `sk-e2e`) prints the throw and never this line. Measured on
 * Playwright 1.58 in both shapes.
 */
export const NO_TESTS_FOUND_MARKER = 'No tests found';

/**
 * The `Total: N tests in M files` count off a `playwright test --list`, or `null` when the
 * line is not there. Never guesses: an output it cannot read is not "zero".
 */
export function parseListedTestCount(output: string): number | null {
  const match = /^Total: (\d+) tests? in \d+ files?/m.exec(output);
  return match ? Number(match[1]) : null;
}

/**
 * Whether a phase should RUN given what `playwright test --list` said about it under the
 * phase's own argv.
 *
 * `false` only on the one shape that means "the filter matched nothing here": the marker line
 * present AND a parsed count of zero. Everything else — tests listed, an unparseable output, a
 * load error that printed no marker — is `true`: the phase runs and Playwright itself reports
 * whatever is wrong. Skipping on a bare `Total: 0` would file a broken import under "omitted by
 * filter" and hide the throw that explains it.
 */
export function phaseMatchesFilter(listing: { output: string }): boolean {
  const count = parseListedTestCount(listing.output);
  return !(count === 0 && listing.output.includes(NO_TESTS_FOUND_MARKER));
}

/** The line printed in place of a phase the filter left with nothing to run. */
export function filterSkipNotice(project: string): string {
  return `   ⏭️  Skipped — the filter matches no test of project '${project}'`;
}

/**
 * The run's exit code from every phase's result, filter-skips included.
 *
 * A phase skipped by the filter is neither a pass nor a failure — it is removed before
 * `resolveExitCode` judges the rest. And that removal is why the empty-list rule matters twice:
 * a run whose EVERY phase was skipped executed nothing, which is the same green-over-nothing
 * `stripArgSeparator` exists to prevent, so it fails (with `allPhasesSkippedMessage` naming the
 * cause) instead of reporting a filter typo as a pass.
 */
export function resolveRunExitCode(results: readonly PhaseResult[]): number {
  return resolveExitCode(
    results.filter((result) => result.skippedByFilter !== true).map((result) => result.code)
  );
}

/** Whether a run had phases and every one of them was skipped by the filter. */
export function allPhasesSkippedByFilter(results: readonly PhaseResult[]): boolean {
  return results.length > 0 && results.every((result) => result.skippedByFilter === true);
}

/** What a run that skipped every phase prints before its red verdict. */
export function allPhasesSkippedMessage(results: readonly PhaseResult[]): string {
  const names = results.map((result) => `'${result.project}'`).join(', ');
  return (
    `❌ The filter matched no test in any phase (${names}). Nothing ran — check the spec path ` +
    `or the --grep pattern.`
  );
}

/**
 * The lines printed after a failed run, telling where the report of each FAILED phase is.
 *
 * `pnpm exec playwright show-report` on its own opens `playwright-report/` — which, now that
 * each phase writes into a subdirectory of it, is a directory holding no report at all. The
 * command has to name the phase, and the phase it has to name is the one that failed: on a
 * two-phase run where only the second went red, the first one's report is intact and irrelevant.
 *
 * Pure, and a list rather than a single line: two red phases are two reports, and printing only
 * the last one would hide exactly half of the evidence this issue exists to preserve. Returns
 * `[]` for a green run — there is nothing to look at.
 */
export function showReportHints(results: readonly PhaseResult[]): string[] {
  return results
    .filter((result) => result.code !== 0)
    .map(
      (result) =>
        `📊 Report of phase '${result.project}': ` +
        `pnpm exec playwright show-report ${phaseHtmlReportPath(result.project)}`
    );
}

// ---------------------------------------------------------------------------
// Browser pre-flight — the cheapest check in the run, and it goes first
// ---------------------------------------------------------------------------

/**
 * The alias this repo (and every derivative that gets it from `kitLocalScripts`) exposes for
 * installing the browsers. Named in the failure below so the fix is one line to copy.
 */
export const E2E_SETUP_ALIAS = 'pnpm e2e:setup';

/** What that alias runs, spelled out for a checkout whose `package.json` has no alias yet. */
export const PLAYWRIGHT_INSTALL_CMD = 'pnpm exec playwright install chromium';

/**
 * The file Playwright writes into a browser's directory once the download AND the unpack
 * finished. Its absence beside a directory that exists is precisely an INTERRUPTED install —
 * the partial cache a check on the main executable alone walks straight past.
 */
export const PLAYWRIGHT_INSTALL_MARKER = 'INSTALLATION_COMPLETE';

/** One thing on disk whose absence means the suite cannot run. */
export interface BrowserTarget {
  /** What the failure calls it — a Playwright browser name, not a path. */
  label: string;
  /** The absolute path the probe is asked about. */
  path: string;
}

/** How the probe answered about ONE path. */
export type BrowserProbeResult =
  | { kind: 'present' }
  | { kind: 'missing' }
  /** Anything that is NOT "it is not there": a permission, a broken mount, an unreadable cache. */
  | { kind: 'error'; code: string; detail: string };

/** The verdict. `ok` ⇒ the run may proceed; otherwise `message` is the whole report. */
export type BrowserPreflight =
  | { ok: true }
  | { ok: false; kind: 'missing' | 'error'; message: string };

/**
 * Ask the filesystem about one path, and keep the two answers apart.
 *
 * 🔴 `existsSync` CANNOT BE USED HERE, and the reason is the whole point of the distinction:
 * it returns `false` for every error alike, so an unreadable Playwright cache (`EACCES`) would
 * be reported as "the browsers are not installed" and the developer would run an install that
 * cannot fix it. `ENOENT` is the only code that really means absent; everything else is a fact
 * about the machine and is reported as such, with its errno.
 */
export function probeBrowserBinary(
  target: string,
  stat: (path: string) => unknown = statSync
): BrowserProbeResult {
  try {
    stat(target);
    return { kind: 'present' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    if (code === 'ENOENT') return { kind: 'missing' };
    return {
      kind: 'error',
      code,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Split a Chromium executable path into the Playwright browsers root and the revision, e.g.
 * `…/ms-playwright/chromium-1208/chrome-mac-arm64/…` → `{ root: '…/ms-playwright', revision: '1208' }`.
 *
 * Pure string work on purpose — every layout Playwright ships (the shared cache, the
 * `PLAYWRIGHT_BROWSERS_PATH=0` copy inside `node_modules`) names that directory the same way,
 * so the segment is the stable landmark rather than the root. `null` when the shape is
 * unfamiliar: a brain artifact tolerates the tree it lands on (BR-FACTORY-006), and the cost of
 * not recognising it is one check fewer, never a refused run.
 */
export function playwrightBrowsersRoot(
  chromiumExecutablePath: string
): { root: string; revision: string } | null {
  const segments = chromiumExecutablePath.split(/[\\/]/);
  const index = segments.findIndex((segment) => /^chromium-\d+$/.test(segment));
  if (index <= 0) return null;
  return {
    root: segments.slice(0, index).join('/'),
    revision: segments[index].slice('chromium-'.length),
  };
}

/**
 * What this run needs on disk before it is worth creating anything.
 *
 * 🔴 TWO TARGETS, NOT ONE. Playwright 1.58's `chromium` install alias expands to `chromium`
 * PLUS `chromium-headless-shell`, and a headless run — CI, and this runner — launches the
 * SECOND. A check that only looked at `chromium.executablePath()` therefore passes on a cache
 * where the first download finished and the second did not, and the run fails late and
 * disguised, which is the failure this pre-flight exists to delete.
 *
 * The shell is checked by its INSTALLATION MARKER rather than by its executable: the
 * executable's leaf path is per-platform (`chrome-headless-shell`, `headless_shell`,
 * `chrome-headless-shell.exe`) while the marker is one name everywhere, and it is also the
 * datum that distinguishes a finished install from an interrupted one. The directory is located
 * by listing the root, so a revision that does not match Chromium's is still found; the derived
 * name is only the fallback that makes the "missing" message name a concrete path.
 */
export function playwrightBrowserTargets(
  deps: {
    chromiumExecutablePath?: () => string;
    listDir?: (dir: string) => string[];
  } = {}
): BrowserTarget[] {
  const readChromiumPath =
    deps.chromiumExecutablePath ??
    (() => {
      // `createRequire` rather than a top-level import: loading `@playwright/test` costs real
      // time and this file is imported by its own unit suite, which must touch nothing.
      const playwright = createRequire(__filename)('@playwright/test') as {
        chromium: { executablePath: () => string };
      };
      return playwright.chromium.executablePath();
    });
  const listDir = deps.listDir ?? ((dir: string) => readdirSync(dir));

  const chromiumPath = readChromiumPath();
  const targets: BrowserTarget[] = [{ label: 'chromium', path: chromiumPath }];

  const layout = playwrightBrowsersRoot(chromiumPath);
  if (!layout) return targets;

  const expected = `chromium_headless_shell-${layout.revision}`;
  let directory = expected;
  try {
    const installed = listDir(layout.root).filter((entry) =>
      entry.startsWith('chromium_headless_shell-')
    );
    if (installed.length > 0) directory = installed.includes(expected) ? expected : installed[0];
  } catch {
    // The root is unreadable or gone. Not swallowed: the probe below is about to meet the same
    // condition on the derived path and report it WITH its errno.
  }

  targets.push({
    label: 'chromium-headless-shell',
    path: join(layout.root, directory, PLAYWRIGHT_INSTALL_MARKER),
  });
  return targets;
}

/** The report for a target that is simply not there. */
function browsersMissingMessage(target: BrowserTarget): string {
  return (
    `❌ Playwright's browsers are not installed in this checkout — '${target.label}' is ` +
    `missing:\n   ${target.path}\n\n` +
    `   Install them and run again:\n\n` +
    `      ${E2E_SETUP_ALIAS}          (${PLAYWRIGHT_INSTALL_CMD})\n\n` +
    `   Nothing was created: no Neon branch, no build, no server. That is the point of ` +
    `checking here — everything after this line costs minutes.`
  );
}

/** The report for a target the runner could not ask about at all. */
function browsersUnreadableMessage(what: string, code: string, detail: string): string {
  return (
    `❌ The Playwright browser check could not complete — reading ${what} failed with ` +
    `${code}.\n   ${detail}\n\n` +
    `   This is NOT "the browsers are missing", and installing them again will not fix it: ` +
    `the cache is unreadable, so look at permissions or at the mount first. Nothing was ` +
    `created: no Neon branch, no build, no server.`
  );
}

/**
 * The pre-flight itself: are the browsers this run will launch actually on disk?
 *
 * WHY IT IS A FUNCTION AND NOT FOUR LINES IN `main()`: `main()` is not exported and cannot be
 * called without creating a Neon branch, so a check living inside it is unassertable. The
 * dependencies are injected for the same reason every other pure piece of this file injects
 * them — the unit suite forbids `fs` outright (`e2e-runner.test.ts`).
 *
 * Both failure modes abort the run, and the direction never depends on which one it is; what
 * depends on it is the DIAGNOSIS, and that is the difference between a fix that works and an
 * install command that cannot possibly help.
 */
export function checkPlaywrightBrowsersInstalled(
  deps: {
    resolveTargets?: () => readonly BrowserTarget[];
    probe?: (path: string) => BrowserProbeResult;
  } = {}
): BrowserPreflight {
  let targets: readonly BrowserTarget[];
  try {
    targets = (deps.resolveTargets ?? playwrightBrowserTargets)();
  } catch (error) {
    // Resolving the paths is itself a read of the outside world (`@playwright/test`, the cache
    // root). A throw here is a machine fact, never "not installed".
    return {
      ok: false,
      kind: 'error',
      message: browsersUnreadableMessage(
        "Playwright's browser registry",
        (error as NodeJS.ErrnoException).code ?? 'UNKNOWN',
        error instanceof Error ? error.message : String(error)
      ),
    };
  }

  const probe = deps.probe ?? probeBrowserBinary;
  for (const target of targets) {
    const result = probe(target.path);
    if (result.kind === 'present') continue;
    if (result.kind === 'missing') {
      return { ok: false, kind: 'missing', message: browsersMissingMessage(target) };
    }
    return {
      ok: false,
      kind: 'error',
      message: browsersUnreadableMessage(
        `'${target.label}' at ${target.path}`,
        result.code,
        result.detail
      ),
    };
  }

  return { ok: true };
}

/**
 * Orchestrate the flow (`sk-e2e §1` diagrams it). Everything with logic of its own lives in
 * the functions above; this is sequencing + cleanup. Returns the exit code instead of
 * calling `process.exit`, so the exit is the entry point's decision, not main()'s.
 */
async function main(): Promise<number> {
  // The runner's own flags (`RUNNER_FLAGS`) are consumed where they act: `--build` and
  // `--keep-branch` here, `--project=` in `resolvePhasePlan`, `--help` at the entry point
  // (which exits, so it never reaches here). Everything left over is forwarded to Playwright
  // verbatim — which is why the ones that do reach here are STRIPPED rather than merely
  // detected.
  const { keep: keepBranch, rest: afterKeepBranch } = parseKeepBranchFlag(process.argv.slice(2));
  const { force: forceBuild, rest: afterBuild } = parseBuildFlag(afterKeepBranch);
  // And the one thing that is stripped without being a flag at all: the bare `--` pnpm passes
  // through from `pnpm test:e2e -- <args>`. Playwright reads it as "filenames follow" and
  // reports `No tests found` while exiting GREEN — see `stripArgSeparator`.
  const args = stripArgSeparator(afterBuild);

  // The port, and the ONE case where the runner is allowed to move it: a port it derived
  // itself may step to the next free one in the range (a hash can collide), while a port
  // somebody pinned is used exactly as given and fails loud below if it is busy.
  //
  // The probe throws when the whole range is taken. That happens here — before the banner,
  // before the Neon branch, before the build — so it costs seconds and leaves nothing to
  // clean up; the entry point reports it and exits 1.
  const portPlan = resolveE2EPort(process.env, readPackagePorts(), process.cwd());
  const port =
    portPlan.source === 'derived'
      ? // Reuses the runner's own detector (E2E-002) — read-only, it identifies, never kills.
        // A machine without `lsof` reports no holder for any port, so the probe returns the
        // derived one and `assertE2EPortAvailable`'s request-based fallback still guards it.
        probeFreePort(portPlan.port, (candidate) => findPortHolders(candidate).length > 0)
      : portPlan.port;
  const serverUrl = e2eServerUrl(port);
  const mfaEncryptionKey = resolveMfaEncryptionKey(process.env);
  // Resolved once, from the same environment the build decision reads: a CI runner gets the
  // wider ceiling, a local loop the narrower one.
  const serverStartupTimeout = resolveServerStartupTimeout(process.env);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  E2E Tests with Neon Branch Isolation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Validate credentials early
  console.log('\n📋 Pre-flight checks...');
  validateNeonCredentials();

  // The browsers, BEFORE anything is created. Two `stat()` calls decide it, and everything
  // below this line — the zombie sweep, the Neon branch, the production build, the server —
  // costs minutes. Without it a checkout with no browsers paid all of that to fail at the
  // last step, in a Playwright message that reads as a suite problem rather than as a missing
  // install. Returning the exit code (never throwing) keeps the abort clean: there is nothing
  // to clean up yet, so no cleanup path has to run.
  const browsers = checkPlaywrightBrowsersInstalled();
  if (!browsers.ok) {
    console.error(`\n${browsers.message}\n`);
    return 1;
  }
  console.log('   ✓ Playwright browsers installed');

  // Cleanup zombie branches from previous failed runs
  const zombieSweep = await cleanupZombieBranches();

  // And the OTHER thing a `--keep-branch` run leaves behind: the private file its connection URI
  // was written to. Nothing ever deleted those, and macOS does not clear its temp directory on
  // every reboot, so each kept branch left one more live Postgres password at rest. Same place as
  // the branch sweep because it is the same kind of housekeeping — this run tidying after
  // previous ones — and equally never fatal.
  const reclaimedUriDirs = sweepKeptBranchUriDirs();
  if (reclaimedUriDirs > 0) {
    console.log(
      `   ✓ Removed ${reclaimedUriDirs} kept-branch URI file(s) older than ` +
        `${KEPT_URI_MAX_AGE_DAYS} days`
    );
  }

  let branchId: string | null = null;
  // Captured for the `--keep-branch` report below. Held out here rather than read from the
  // create-branch result inside the try, so the exit path can name the branch even when the
  // run died after it was created (which is exactly when a developer wants to inspect it).
  let branchName: string | null = null;
  let branchUri: string | null = null;
  let serverProcess: ChildProcess | null = null;
  let exitCode = 1;
  // One entry per phase that actually executed, in order. Held out here (rather than inside the
  // try) so the report hints below can name the phases that failed even when the run died on the
  // phase after them.
  const phaseResults: PhaseResult[] = [];
  let cleaningUp = false;
  // Set below, once the Playwright config has been read, when the disposable-database guard is
  // not wired into this checkout (`checkGuardWiring`). Held here so `cleanup()` can repeat it:
  // printed only at the start it would scroll away behind a seven-minute suite, which is how a
  // fail-open stays silent even after somebody bothered to detect it.
  let guardWarning: string | null = null;
  // The same mechanism, for the same reason, one warning earlier in the run: the zombie sweep
  // happens at minute zero, so a sweep that could not even list the branches announces itself
  // behind seven minutes of suite output. `cleanupZombieBranches` already printed this once and
  // handed it back for the repeat (`zombieSweepWarning`).
  const sweepWarning: string | null = zombieSweep.warning;

  // Shared cleanup function — safe to call multiple times
  async function cleanup(signal?: string): Promise<void> {
    if (cleaningUp) return;
    cleaningUp = true;

    if (signal) console.log(`\n\n⚠️  Received ${signal}, cleaning up...`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Cleanup');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Stop server (kill the TREE — a plain kill leaves next dev orphaned on the port).
    if (serverProcess) {
      console.log('\n🛑 Stopping server...');
      killServerTree(serverProcess);
      await new Promise((r) => setTimeout(r, 500));
      console.log('   ✓ Server stopped');
    }

    // Delete the branch — unless `--keep-branch` asked for it to outlive this run. The
    // exemption from the next run's zombie sweep is carried by the branch NAME, not by
    // anything this process leaves behind (`KEEP_BRANCH_MARKER` in `neon-branch.ts`), so it
    // holds even though the PID in that name is dead the moment this exits.
    if (branchId) {
      if (keepBranch) {
        // The URI is the whole point of the flag — without it the kept branch is unreachable
        // without a trip to the Neon Console — but it embeds the role password, so it goes to a
        // private file and the CONSOLE gets the path. On CI it goes nowhere: see
        // `keepBranchReport`. A write that fails must not take the run's exit code with it.
        const ci = isCI(process.env);
        let uriPath: string | null = null;
        // The cause is CARRIED, not swallowed: "could not write it" without a reason leaves the
        // developer with nothing to act on, and the reason is a short safe token (`EACCES`,
        // `ENOSPC`, …) that cannot contain any part of the URI — see `keptUriWriteFailure`.
        let writeFailure: string | null = null;
        if (branchUri && !ci) {
          try {
            uriPath = writeKeptBranchUri(branchUri);
          } catch (error) {
            uriPath = null;
            writeFailure = keptUriWriteFailure(error);
          }
        }
        for (const line of keepBranchReport({
          branchLabel: branchName ?? branchId,
          ci,
          hasUri: Boolean(branchUri),
          uriPath,
          writeFailure,
        })) {
          console.log(line);
        }
      } else {
        await deleteE2EBranch(branchId);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(exitCode === 0 ? '  ✅ Tests passed!' : '  ❌ Tests failed');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // LAST, after the verdict: a green suite in a checkout where the guard is on disk and not in
    // effect is exactly the run that must not end looking clean. Same for a sweep that never ran
    // — a green suite says nothing about the branches piling up on the other side of the API.
    if (guardWarning) console.warn(guardWarning);
    if (sweepWarning) console.warn(sweepWarning);
  }

  // Register signal handlers BEFORE creating branch
  const signalHandler = (signal: string) => {
    cleanup(signal).then(() => process.exit(1));
  };
  process.on('SIGINT', () => signalHandler('SIGINT'));
  process.on('SIGTERM', () => signalHandler('SIGTERM'));

  try {
    // The REGISTRY is resolved FIRST, before anything is probed, created or compiled. Three
    // things can fail here, and all three must fail before a Neon branch exists: a project file
    // that does not load, a phase whose Playwright project is not declared, and an argument that
    // names no phase. An invocation that can never run costs a second, not a build.
    //
    // The config source is read ONCE and closed over: N phases, one file read.
    const playwrightConfigSource = readPlaywrightConfigSource();

    // The guard travels through `scripts/**`; the line that INVOKES it lives in `tests/**`,
    // which travels nowhere (BR-FACTORY-006). So the checkout is asked here — from the side
    // that does travel — whether the guard is actually in effect, and the answer is repeated in
    // `cleanup()` when it is not. A warning, never an abort: `guardWiringWarning` argues why.
    const guardVerdict = checkGuardWiring({
      configSource: playwrightConfigSource,
      readSource: readProjectSource,
    });
    guardWarning = guardWiringWarning(guardVerdict);
    if (guardWarning) console.warn(guardWarning);
    // The verdict the detection could NOT reach gets one informative line and no banner, once
    // (`guardWiringNote`): the banner is for what this runner can affirm.
    const guardNote = guardWiringNote(guardVerdict);
    if (guardNote) console.log(guardNote);

    // Same shape, same reason, one layer out: `e2e.yml` is excluded from the distribution
    // profile, so `factory update` refreshes the `.example` and never the workflow a project
    // already generated. A repo that enabled E2E before the auth-flags step existed keeps a
    // workflow without it — and the symptom is a green CI run asserting the opposite of the app.
    // Said once, at the start: THIS run is unaffected (`ciEnvStepNotice` argues why).
    const ciStepNotice = ciEnvStepNotice(checkCiEnvStep(readProjectSource(CI_WORKFLOW_PATH)));
    if (ciStepNotice) console.warn(ciStepNotice);

    const available = resolveAvailablePhases({
      kitPhases: KIT_PHASES,
      projectPhases: loadProjectPhases(),
      hasProject: (name) => configDeclaresProject(playwrightConfigSource, name),
    });
    // Announced here rather than mid-run: a phase that will not run is news BEFORE the branch,
    // not a line buried between two suites. `resolveAvailablePhases` has already thrown if this
    // left nothing to run.
    for (const { reason } of available.skipped) console.log(`\n⚠️  ${reason}`);
    const plan = resolvePhasePlan(args, available.toRun, available.skipped);

    // 0. Nobody else may be holding the E2E port. Checked HERE — before the branch, the
    // migration and the minutes-long build — so a collision costs seconds instead of a
    // wasted build, and inside the try so the failure gets the same reporting + cleanup
    // as any other. The check repeats before the first server starts (see runPhase),
    // because the build in between is a wide window for another checkout to take the port.
    await assertE2EPortAvailable(port);
    console.log(`   ✓ Port ${port} free (${PORT_SOURCE_LABEL[portPlan.source]})`);

    // The config Playwright will actually run with: the project's own, plus this run's port
    // forced onto its `baseURL`. Written HERE — before the branch, the migration and the
    // build — so a failure costs seconds, and inside the try so it gets the same reporting
    // and cleanup as anything else.
    const derivedConfig = writeDerivedPlaywrightConfig(port);

    // And WHERE that config points, which the derived file preserves from the project's own
    // (BND-009) and only this side can verify: the host has to resolve to THIS machine or the
    // suite drives another one — in the clear, with the credentials `auth.setup.ts` seeds —
    // while the server this run starts idles. Here, for the same reason as everything above it:
    // a run that must not happen costs seconds rather than a branch and a build.
    const hostCheck = await checkBaseUrlHosts({
      configSource: playwrightConfigSource,
      serverOrigin: serverUrl,
      env: process.env,
    });
    for (const warning of hostCheck.warnings) console.warn(warning);

    // The project's run-scoped env, evaluated ONCE and BEFORE the branch, the migration and the
    // build — same placement as the phase resolution, and for the same reason: a malformed
    // declaration must cost seconds, not a Neon branch. Its `build` half has to exist before
    // `prepareBuild` so it can enter the stamp; resolving it later would recycle a bundle built
    // without it.
    const projectRunEnv = loadProjectRunEnv();
    // Same placement, same reason: a malformed e2e.config.json must cost seconds, not a branch.
    const e2eConfig = readE2EConfig();
    console.log(
      e2eConfig.emptyBranch
        ? `   🗄️  E2E database: empty branch, migrated from 0000 (${E2E_CONFIG_PATH})`
        : `   🗄️  E2E database: cloned from the parent, with its data`
    );
    const declaredHalves = (['build', 'server', 'playwright'] as const).filter(
      (half) => projectRunEnv[half] && Object.keys(projectRunEnv[half]!).length > 0
    );
    if (declaredHalves.length > 0) {
      const counts = declaredHalves
        .map((half) => `${half}: ${Object.keys(projectRunEnv[half]!).length}`)
        .join(', ');
      console.log(`   ⚙️  ${PROJECT_RUN_ENV_PATH} pins this run's env (${counts}).`);
    }

    // 1. Create Neon branch.
    //
    // `branchId` is captured by the callback the MOMENT Neon confirms the branch — before
    // credentials are resolved — and not from the return value, which only arrives once the
    // whole flow succeeded. Everything in between (endpoint wait, connection-URI build, its
    // `reveal_password` call) happens with the branch already alive in Neon: taking the id
    // late meant any failure there left an orphan that `cleanup()` could not see.
    const created = await createE2EBranch({
      keep: keepBranch,
      onBranchCreated: (id) => {
        branchId = id;
      },
    });
    const connectionUri = created.connectionUri;
    branchName = created.branchName;
    branchUri = created.connectionUri;

    console.log(`   📊 Using branch: ${branchName}`);

    // 2. Migrate the ephemeral copy up to the current TS schema (emptied first when opted in).
    await migrateE2EBranch(connectionUri, e2eConfig);

    // 3. Build the app ONCE (production); both phases reuse it. And when nothing that
    // feeds that build changed since the last run, reuse THAT one too (E2E-007).
    prepareBuild({
      databaseUrl: connectionUri,
      appUrl: serverUrl,
      port,
      force: forceBuild,
      // The project's `build` half rides in the run's env, which is BOTH what the build inherits
      // and what `collectPublicEnv` feeds to the stamp. One place, so a public var can never be
      // baked without also being stamped — the asymmetry that would serve a recycled bundle.
      env: composeRunEnv(process.env as EnvOverrides, projectRunEnv.build, 'build'),
    });

    // Run ONE phase: its own server (with the given MFA posture) + one Playwright
    // project, then stop that server before the next phase. Both phases share the Neon
    // branch (specs use timestamped emails, so they don't collide) AND the build above.
    // `serverProcess` is the closure var the signal-handler cleanup() reads, so it always
    // points at the live server.
    //
    // `startedAServer` separates the two ways the port can be busy. Before the FIRST
    // server, anything on it is FOREIGN to this run → fail loud naming the PID. From the
    // second phase on it is our own hand-off: the previous phase already killed its OWN
    // tree, so the port only needs a moment to be released — never a fail-loud, never a
    // blind kill.
    let startedAServer = false;

    // The run's base environment: everything that belongs to the RUN and not to a phase — the
    // throwaway branch, the port, and the MFA key resolved once above so every phase encrypts
    // and decrypts with the same one (they share the branch; two keys would make phase B unable
    // to read what phase A seeded).
    // The project's run-scoped halves layer HERE — on the base, under every phase — which is what
    // separates them from `E2EPhase.env`: a phase overrides one phase, this pins all of them. A
    // phase that declares the same key still wins, because it is the more specific scope.
    const baseEnv: PhaseEnvironments = {
      server: composeRunEnv(
        serverEnvOverrides({
          baseEnv: process.env,
          databaseUrl: connectionUri,
          port,
          mfaEncryptionKey,
        }),
        projectRunEnv.server,
        'server'
      ),
      playwright: composeRunEnv(
        playwrightEnvOverrides({
          baseEnv: process.env,
          databaseUrl: connectionUri,
          mfaEncryptionKey,
          compileGuardInit: compileGuardInitUrl(),
          port,
        }),
        projectRunEnv.playwright,
        'playwright'
      ),
    };

    const runPhase = async (phase: E2EPhase, phaseArgs: string[]): Promise<PhaseResult> => {
      // ONE evaluation of the phase's `env()`, whose two halves go to the two processes below.
      // The base is specialized for THIS phase first — its own html report directory, which is
      // the one thing about the base that is not shared between phases (`phaseEnvWithReportDir`
      // argues why it can be neither in the run's base nor in the phase's own overrides).
      const env = resolvePhaseEnv(
        phase,
        phaseEnvWithReportDir(baseEnv, phase.project, process.cwd())
      );
      const argv = playwrightPhaseArgv({ derivedConfig, project: phase.project, phaseArgs });
      // With a test filter, ask first and skip the phase the filter cannot reach — BEFORE the
      // server, which is the expensive part. Without a filter nothing is listed and nothing is
      // skipped: the run is byte-identical to one that never had this branch (`hasTestFilter`).
      if (
        hasTestFilter(phaseArgs) &&
        !phaseMatchesFilter(await listPlaywrightTests(argv, env.playwright))
      ) {
        console.log(filterSkipNotice(phase.project));
        return { project: phase.project, code: 0, skippedByFilter: true };
      }
      if (!startedAServer) await assertE2EPortAvailable(port);
      // Confirm the port is ACTUALLY free before starting. A prior phase's server still
      // holding it would make the new server bind EADDRINUSE while the tests silently run
      // against the stale one (wrong posture).
      await waitForPortFree(port, PORT_FREE_TIMEOUT);
      // Right before the spawn, for EVERY phase — not once at the top of the run. Next's data
      // cache outlives the process while the Neon branch does not, so a server that started
      // with yesterday's `unstable_cache` entries answers with rows of a branch that was
      // deleted (see `clearE2EDataCache`). The build in `.next/` and its stamp are untouched,
      // so recycling (`sk-e2e §1.3`) is exactly as it was.
      clearE2EDataCache();
      const watch: ServerWatch = { fatal: null };
      serverProcess = startServer({
        databaseUrl: connectionUri,
        env: env.server,
        project: phase.project,
        port,
        watch,
      });
      startedAServer = true;
      console.log(`   ⏳ Waiting for server (up to ${serverStartupTimeout / 1000}s)...`);
      await waitForServer(serverUrl, serverStartupTimeout, watch);
      console.log('   ✓ Server ready\n');
      const code = await runPlaywrightTests(argv, env.playwright);
      if (serverProcess) {
        killServerTree(serverProcess); // kill the TREE — a plain kill leaks next dev on the port
        await new Promise((r) => setTimeout(r, 500));
        serverProcess = null;
      }
      return { project: phase.project, code };
    };

    // One deterministic walk over the resolved phases — the kit's first, then whatever the
    // project declared, in its own order. A third phase is a row of data, not a third `if`.
    for (const phase of plan.phases) {
      console.log(`\n▶ ${phase.label}`);
      phaseResults.push(await runPhase(phase, plan.phaseArgs));
    }
    if (allPhasesSkippedByFilter(phaseResults)) {
      console.log(`\n${allPhasesSkippedMessage(phaseResults)}`);
    }
    exitCode = resolveRunExitCode(phaseResults);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    exitCode = 1;
  } finally {
    await cleanup();
  }

  // Don't auto-open the report — it blocks the terminal until Ctrl+C and
  // breaks agent runs that need to inspect the exit code. The Playwright
  // summary already shows pass/flaky/fail counts; print the command so the
  // user can open the report explicitly when needed.
  //
  // NAMED PER PHASE (`showReportHints`): each phase writes into its own subdirectory now, so a
  // bare `show-report` opens a folder with no report in it. A failure that produced no phase
  // result at all (the run died before or between phases) falls back to the root, which is where
  // a single-phase project's report still is.
  if (exitCode !== 0) {
    const hints = showReportHints(phaseResults);
    if (hints.length > 0) {
      for (const hint of hints) console.log(hint);
      console.log('');
    } else {
      console.log(`📊 See the reports under ${HTML_REPORT_ROOT_DIR}/\n`);
    }
  }
  return exitCode;
}

// Only run when executed directly (not when imported by tests). Same guard the other
// importable tools in scripts/tools/ use (db-query, preflight, harden-enum).
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('e2e-runner.ts') || process.argv[1].endsWith('e2e-runner'));

if (isDirectExecution) {
  // The contract, not a run. Answered HERE — before `loadRunnerEnv()` and before `main()` —
  // so `pnpm test:e2e --help` works on a machine with no `.env.local` and no Neon
  // credentials: it reads nothing, creates nothing and starts nothing.
  if (wantsHelp(process.argv.slice(2))) {
    console.log(formatRunnerHelp());
    process.exit(0);
  }

  let envSource: ReturnType<typeof runnerEnvSource>;
  try {
    envSource = runnerEnvSource({
      hasVaultBlock: readVaultBlock(process.cwd()) !== null,
      env: process.env,
    });
  } catch (error) {
    // A malformed `.timekast/provision.json` — fail closed, never "no vault".
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (envSource === 'reexec') {
    console.log(
      '🔐 This repo lives in the vault — relaunching through scripts/tools/with-vault.mjs.'
    );
    reexecThroughVault(process.argv.slice(2));
  } else {
    if (envSource === 'dotenv') loadRunnerEnv();
    main()
      .then((code) => process.exit(code))
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
  }
}
