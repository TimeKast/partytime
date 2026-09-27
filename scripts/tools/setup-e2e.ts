#!/usr/bin/env npx tsx

/**
 * E2E Setup Script
 *
 * Enables the E2E workflow in CI: publishes the project's auth flags as repo VARIABLES
 * and generates `.github/workflows/e2e.yml` from the template.
 *
 * It does NOT touch Neon. The E2E credentials (`DATABASE_URL`, `NEON_API_KEY`,
 * `NEON_PROJECT_ID`) are provisioned by `factory provision --services=neon`, which mints a
 * key scoped to the single project; the flow that used to ask for a PERSONAL Neon key here
 * was removed because that key reaches every organization its owner belongs to.
 *
 * Usage: pnpm setup:e2e          (flags + workflow)
 *        pnpm setup:e2e:vars     (flags only — never rewrites a customized e2e.yml)
 *
 * Prerequisites:
 * - GitHub CLI: brew install gh (or see https://cli.github.com/)
 */

import { execSync, spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import dotenv from 'dotenv';

import { isMainModule as computeIsMainModule } from './lib/is-main-module.mjs';
import { readVaultBlock } from './with-vault.mjs';

/**
 * The readline interface, created on FIRST PROMPT — never at module scope.
 *
 * `createInterface` attaches to `process.stdin`, which puts it in flowing mode and keeps a
 * handle on the event loop. At module scope that happens on mere IMPORT, so this file's unit
 * test — which travels to every derivative via `scripts/**` and runs inside their `pnpm test`
 * — would leave stdin open in every suite that loads it, CI included. Deferring it means an
 * import costs nothing and only an actual prompt touches the terminal.
 */
let rl: readline.Interface | undefined;

function prompt(question: string): Promise<string> {
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  const iface = rl;
  return new Promise((resolve) => {
    iface.question(question, (answer) => resolve(answer.trim()));
  });
}

function exec(cmd: string, options?: { silent?: boolean }): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: options?.silent ? 'pipe' : 'inherit',
    });
  } catch {
    return '';
  }
}

function checkCommand(cmd: string): boolean {
  const result = spawnSync('which', [cmd], { encoding: 'utf-8' });
  return result.status === 0;
}

// Resolve the exact installed `@playwright/test` version.
// Lockfile is preferred (matches what's actually installed); package.json range
// is the fallback for repos where the lockfile hasn't been generated yet.
export function resolvePlaywrightVersion(gitRoot: string): string {
  const lockfilePath = path.join(gitRoot, 'pnpm-lock.yaml');
  if (fs.existsSync(lockfilePath)) {
    const lockfile = fs.readFileSync(lockfilePath, 'utf-8');
    // Match resolved version: lines like `      '@playwright/test': 1.58.2`
    // (NOT `        specifier: ^1.58.2` — that has the range prefix).
    const match = lockfile.match(/^\s+'@playwright\/test':\s+(\d+\.\d+\.\d+(?:-[\w.]+)?)\s*$/m);
    if (match) return match[1];
  }

  const pkgPath = path.join(gitRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const spec =
      pkg.devDependencies?.['@playwright/test'] ?? pkg.dependencies?.['@playwright/test'];
    if (typeof spec === 'string') {
      const stripped = spec.replace(/^[\^~]/, '');
      if (/^\d+\.\d+\.\d+/.test(stripped)) return stripped;
    }
  }

  console.error('❌ @playwright/test not found in pnpm-lock.yaml or package.json');
  console.error('   Run `pnpm install` first.');
  process.exit(1);
}

// Resolve the branch the generated E2E workflow triggers on: the repo's RELEASE
// branch (its default branch), not the branch you happen to be standing on.
//
// This used to resolve the CURRENT branch, so a develop-first repo baked
// `branches: [develop]` and paid for the kit's priciest workflow on every
// working-branch push. The kit's cost model is the opposite: `develop` is covered
// locally by `/implement` (tk-implement Phase 4.1 runs `pnpm test:e2e` on the dev's
// machine, for free, before anything is pushed), and CI only verifies what reaches
// the release branch. See the COSTO note in `.github/workflows/e2e.yml.example`.
//
// Falls back to 'main' on any failure (no remote, git missing, invalid gitRoot) —
// never throws, so the setup flow degrades to the safe default instead of crashing.
export function resolveTriggerBranch(gitRoot: string): string {
  const fallback = 'main';
  try {
    // `origin/HEAD` points at the remote's default branch (e.g. `origin/main`).
    const result = spawnSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd: gitRoot,
      encoding: 'utf-8',
    });
    if (result.status !== 0) return fallback;
    // Output looks like `origin/main` — keep the part after the remote name.
    const branch = (result.stdout ?? '').trim().split('/').slice(1).join('/');
    if (!branch) return fallback;
    return branch;
  } catch {
    return fallback;
  }
}

/**
 * The branches the generated workflow fires on: the release branch, plus the working branch
 * when it is a different one.
 *
 * 🔴 THIS IS WHERE THE COST DOCTRINE CHANGED. The kit used to trigger E2E on the release
 * branch ALONE, and the reason was money: on GitHub-hosted runners the suite is the priciest
 * workflow the kit ships, and a develop-first repo firing it on every push burned the monthly
 * allowance on a check `/implement` had already run locally. On the org's self-hosted pool a
 * run bills no GitHub minutes at all, so that reason is spent — and what it was buying was
 * bad: the working branch is where the work lands, and verifying it only after the merge to
 * the release branch is verifying it too late.
 *
 * `resolveTriggerBranch` is deliberately NOT the place for this. It answers one question —
 * "what is the remote's default branch?" — and still answers it the same way; composing its
 * answer with the working branch is a second question, so it gets a second function.
 *
 * Deduped, because the two resolutions COLLAPSE in the common case: a main-first repo (and a
 * detached checkout, where `resolveParentBranch` falls back to the trigger) yields one name,
 * and `branches: [main, main]` would be a workflow that names the same branch twice.
 */
export function formatTriggerBranches(releaseBranch: string, workingBranch: string): string {
  const branches =
    workingBranch === releaseBranch ? [releaseBranch] : [releaseBranch, workingBranch];
  return `branches: [${branches.join(', ')}]`;
}

/**
 * Which branch the run's throwaway Neon branch is CLONED FROM. A different question from
 * `resolveTriggerBranch`, and resolved from a different place on purpose.
 *
 * 🔴 THE DEFAULT IS PRODUCTION, WHICH IS WHY THIS EXISTS. `resolveParentBranchName` returns
 * `undefined` under CI by rule, so the POST omits `parent_id` and Neon clones the project's
 * DEFAULT branch — `main` in the kit's dual-database model. The runner says so out loud
 * (`noParentByRuleNotice`), but until now the only way to ACT on that notice was to hand-edit the
 * generated `e2e.yml`, which the next `pnpm setup:e2e` overwrote — a container bump was enough to
 * silently restore the clone-production behaviour.
 *
 * For a develop-first project the default is wrong twice: the migrations of the commit under test
 * live on the working branch, so a clone of `main` gives the suite a stale schema and every spec
 * touching a new table dies with `relation ... does not exist` — which reads like a product bug
 * and is not one. And the throwaway branch starts as a full copy of production data, which on a
 * multi-tenant platform is not a choice to make by omission.
 *
 * Resolved from the CURRENT branch (`HEAD`), not from `origin/HEAD`: the trigger branch is where
 * CI fires (the release branch) and the parent is where the work is. Tying both to one value is
 * exactly the mistake this separation exists to prevent.
 *
 * Falls back to the trigger branch — never throws. A repo whose HEAD is detached during setup gets
 * the same behaviour as before this existed, plus a line naming what it used.
 */
export function resolveParentBranch(gitRoot: string, fallback: string): string {
  try {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: gitRoot,
      encoding: 'utf-8',
    });
    if (result.status !== 0) return fallback;
    const branch = (result.stdout ?? '').trim();
    // `HEAD` is what a detached checkout reports — not a branch anybody can clone from.
    if (!branch || branch === 'HEAD') return fallback;
    return branch;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// The project's auth flags, from `.env.local` to the CI job
// ---------------------------------------------------------------------------

/**
 * The prefix that decides which of the project's variables reach CI.
 *
 * WHY A PREFIX AND NOT A LIST. The wizard's flags are a moving set — a derivative adds one and
 * nothing here would know. A prefix travels with them, and `NEXT_PUBLIC_AUTH_` is exactly the
 * namespace of "decisions about auth that the client bundle already carries in the open".
 *
 * 🔴 THE SAME CONSTANT IS THE CONSUMER-SIDE FILTER (`selectCiEnv`). Filtering only where the
 * variables are PUBLISHED is not a filter at all: the CI step reads `toJSON(vars)`, which is
 * every variable of the repo — including whatever somebody adds later in the GitHub UI, under a
 * name like `NODE_OPTIONS` or `DATABASE_URL`, which would then enter the build and the test
 * process.
 */
export const CI_AUTH_ENV_PREFIX = 'NEXT_PUBLIC_AUTH_';

/**
 * Keys the E2E runner pins itself (`bakedEnvOverrides` in `e2e-runner.ts`), excluded from both
 * sides.
 *
 * Not because publishing them would desynchronize the bundle — the runner's override wins in the
 * merge — but because of what it WOULD cost: `NEXT_PUBLIC_APP_URL` carries the run's port, which
 * moves per checkout, so a published value is stale by construction and churns the build stamp;
 * and `NEXT_PUBLIC_AUTH_MAGIC_LINK` would put a value in the Playwright process that contradicts
 * the one the app was built with.
 */
export const CI_ENV_PINNED_BY_RUNNER: readonly string[] = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_AUTH_MAGIC_LINK',
];

/**
 * The reason `CI_ENV_PINNED_BY_RUNNER` keys never publish — surfaced by `describeOmittedAuthEnv`
 * so a dev who sees the flag in `.env.local` and not in `gh variable list` gets told why, instead
 * of "fixing" it by hand.
 */
const PINNED_BY_RUNNER_REASON =
  'el runner de E2E lo fija por su cuenta (`bakedEnvOverrides`, `e2e-runner.ts`) — publicarlo no ' +
  'cambia el build, solo agrega churn del build stamp o un valor que contradice el del proceso.';

/**
 * Auth flags whose real FUNCTIONALITY depends on server-side secrets that never live in CI.
 *
 * `NEXT_PUBLIC_AUTH_GOOGLE`/`NEXT_PUBLIC_AUTH_GITHUB` are client-safe booleans — the client
 * bundle already carries them in the open, same as every other `NEXT_PUBLIC_AUTH_*` flag — but
 * turning either one on only means something if `AUTH_GOOGLE_ID`/`_SECRET` or
 * `AUTH_GITHUB_ID`/`_SECRET` are ALSO configured, and those are real secrets that do not belong
 * in CI. In a derivative born before the `BOOT-005` guard (`shouldRegisterOAuthProvider`,
 * `src/lib/auth/auth.ts`), publishing the flag on with no matching secret kills the entire
 * `next build` of CI — the incident this issue exists to close
 * (`project/factory/kit-drift-2026-08-21-ci-auth-flags-server-secrets.md`).
 *
 * Distinct reason from `CI_ENV_PINNED_BY_RUNNER`: that list exists because publishing would be
 * WASTEFUL (stale/contradictory values the runner overrides anyway); this one exists because
 * publishing would be UNSAFE (a flag whose "on" state the app cannot actually honor in CI).
 * Their `false` default is exactly the real state of a CI without those credentials, so excluding
 * the key is strictly simpler than publishing the correct value.
 */
export const CI_ENV_REQUIRES_SERVER_SECRETS: readonly string[] = [
  'NEXT_PUBLIC_AUTH_GOOGLE',
  'NEXT_PUBLIC_AUTH_GITHUB',
];

const REQUIRES_SERVER_SECRETS_REASON =
  'depende de credenciales server-side (`AUTH_GOOGLE_ID`/`_SECRET` o `AUTH_GITHUB_ID`/`_SECRET`) ' +
  'ausentes en CI; su default es `false`, que es el estado real de un CI sin esas credenciales.';

/**
 * THE single exclusion predicate — filtering on one side only is not filtering (see
 * `CI_AUTH_ENV_PREFIX` above). `collectPublishableAuthEnv`, `describeOmittedAuthEnv` and
 * `selectCiEnv` all gate on this, so a new exclusion list only ever needs to be added HERE —
 * `setup-e2e.test.ts` runs a probe set through all three and asserts they agree.
 */
export function isExcludedFromCi(key: string): boolean {
  return CI_ENV_PINNED_BY_RUNNER.includes(key) || CI_ENV_REQUIRES_SERVER_SECRETS.includes(key);
}

/** The flag the CI step invokes this script with — never the interactive setup. */
export const EMIT_CI_ENV_FLAG = '--emit-ci-env';

/**
 * Publish the auth flags and NOTHING else.
 *
 * The full `setup:e2e` regenerates `.github/workflows/e2e.yml` from the template, overwriting
 * it whole — right for a project that never customized it, destructive for one that did. That
 * left a project with a hand-edited workflow no supported way to publish its flags: the
 * adoption guide had to spell out `gh variable set` by hand, which puts the dequote on the dev
 * exactly where getting it wrong inverts the flag silently.
 */
export const PUBLISH_VARS_FLAG = '--publish-vars';

/**
 * The adoption guide, pointed at after publishing — variables alone do nothing until the job
 * carries the step that reads them.
 *
 * 📋 CALQUED from `CI_ENV_RETROFIT_DOC` in `e2e-runner.ts`. Copied rather than imported because
 * both files are ENTRY POINTS (importing one to read a string would execute its module), and a
 * `scripts/tools/lib/` module for a single path is the premature abstraction this repo avoids.
 * `setup-e2e.test.ts` asserts both spellings agree AND that the file exists, so a rename breaks
 * the suite instead of leaving a dead pointer in a message nobody re-reads.
 */
export const CI_ENV_RETROFIT_DOC = '.claude/docs/retrofits/e2e-ci-auth-env.md';

/**
 * Where the CI step hands over `toJSON(vars)`.
 *
 * Through the ENVIRONMENT, never interpolated into the `run:` script: an interpolated value is
 * spliced into the shell command before bash ever sees it, so a variable whose value contains a
 * quote or a `$(…)` would be executed rather than read.
 */
export const CI_ENV_VARIABLES_KEY = 'E2E_REPO_VARIABLES';

/** What GitHub Actions accepts as an environment-variable name. */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The publishable auth flags of a `.env.local`, parsed and DEQUOTED.
 *
 * 🔴 `dotenv.parse`, NEVER a hand-rolled split. The kit writes `.env.local` with its values
 * between quotes, and `booleanString` (`src/lib/env.ts`) compares against the literal `'false'`
 * — as does the `parseBool` of `register.spec.ts`. So publishing `NEXT_PUBLIC_AUTH_REGISTRATION`
 * as `"false"`, quotes included, leaves the flag **true** in CI: the fix would deliver the exact
 * opposite of what it promises, in green. `dotenv` already resolves quoting, escapes, multi-line
 * values, a leading `export ` and comments; it is a dependency of this project and `scripts/`
 * already uses it (`e2e-runner.ts`, `drizzle.config.ts`). The dequote in `cli/src/commands/
 * provision.ts` is written by hand for one reason that does not apply here — the CLI does not
 * depend on `dotenv`.
 *
 * Pure over the file's TEXT so the rule is assertable without a `.env.local` on disk.
 */
export function collectPublishableAuthEnv(envLocalSource: string): Record<string, string> {
  return filterPublishableAuthEnv(dotenv.parse(envLocalSource));
}

/**
 * The prefix + exclusion rule over an already-parsed record — the one body both origins go
 * through (`.env.local` text via `collectPublishableAuthEnv`, or the vault-injected environment
 * via `selectAuthEnvSource`). Kept separate so the vault path never re-implements the rule.
 */
function filterPublishableAuthEnv(parsed: Record<string, string>): Record<string, string> {
  const publishable: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith(CI_AUTH_ENV_PREFIX)) continue;
    if (isExcludedFromCi(key)) continue;
    publishable[key] = value;
  }

  return publishable;
}

/**
 * Boolean parsing, copied from the LOCAL `parseBool` inside `getAuthFeatures`
 * (`src/lib/env.ts:506-509`) — NOT imported, because the derivative's `src/` is born frozen
 * (`BR-FACTORY-006`) and this script has to keep working against a `src/` the kit no longer owns.
 *
 * 🔴 `src/lib/env.ts` ships a SECOND, DIFFERENT boolean parser (`booleanString`, a Zod
 * transform, `:13-20`) whose `'no'` means the opposite of this one's (`false` there, `true`
 * here). Copying that one instead would invert the very posture this function exists to
 * compute, silently. This is the parser `getAuthFeatures` actually runs at request time, which
 * is the one whose behavior CI has to match.
 */
function parseBool(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === '') return defaultVal;
  return val.toLowerCase() !== 'false' && val !== '0';
}

/**
 * The posture CI actually ends up with once the exclusion lists have already run, and what to do
 * about the case they can't see coming: zero enabled auth methods.
 *
 * `candidates` is the PUBLISHABLE SET (`collectPublishableAuthEnv`'s output, or the equivalent
 * post-both-exclusion-lists set on the consumer side) — never the raw `.env.local`, because by
 * the time this runs `NEXT_PUBLIC_AUTH_MAGIC_LINK`/`GOOGLE`/`GITHUB` have already been stripped
 * from it and their absence is exactly what "the runner bakes it / it needs a secret" means here.
 *
 * 🔴 NOT conditioned on which exclusion caused the zero. A magic-link-only project
 * (`PASSWORD=false`, `MAGIC_LINK=true`, no OAuth) reaches zero methods in CI without either new
 * exclusion having removed anything — `MAGIC_LINK` is baked `false` by the runner itself
 * (`e2e-runner.ts`), so it was never even a candidate. The rule has to fire there too, which is
 * why it evaluates the CANDIDATES rather than asking "did an exclusion list just fire".
 *
 * Zero methods: `NEXT_PUBLIC_AUTH_PASSWORD` is omitted (unset, CI falls back to the kit's own
 * default — `true` — identically on the server AND the client, rather than depending on
 * `getAuthFeatures`'s server-only zero-method fallback, which would otherwise leave the server
 * and the client bundle disagreeing) and `NEXT_PUBLIC_AUTH_REGISTRATION` is force-published as
 * `false` — its default is `true` (`src/lib/env.ts:514`), and an unset/true value here would
 * leave `/api/auth/register` open in the app under test for no reason the developer chose.
 */
export function resolveCiAuthPosture(candidates: Record<string, string>): {
  publish: Record<string, string>;
  omitted: { key: string; reason: string }[];
} {
  const password = parseBool(candidates.NEXT_PUBLIC_AUTH_PASSWORD, true);
  const magicLink = parseBool(candidates.NEXT_PUBLIC_AUTH_MAGIC_LINK, false);
  const google = parseBool(candidates.NEXT_PUBLIC_AUTH_GOOGLE, false);
  const github = parseBool(candidates.NEXT_PUBLIC_AUTH_GITHUB, false);

  if (password || magicLink || google || github) {
    return { publish: { ...candidates }, omitted: [] };
  }

  const publish = { ...candidates };
  const omitted: { key: string; reason: string }[] = [];

  if ('NEXT_PUBLIC_AUTH_PASSWORD' in publish) {
    delete publish.NEXT_PUBLIC_AUTH_PASSWORD;
    omitted.push({
      key: 'NEXT_PUBLIC_AUTH_PASSWORD',
      reason:
        'la postura de auth en CI queda en cero métodos habilitados; se omite para caer al ' +
        'default del kit (`true`) en servidor y cliente por igual, sin pasar por el fallback ' +
        'server-only de `getAuthFeatures` que dejaría a ambos en desacuerdo.',
    });
  }

  publish.NEXT_PUBLIC_AUTH_REGISTRATION = 'false';

  return { publish, omitted };
}

/**
 * Everything a `.env.local` (or the equivalent parsed record) is about to lose on its way to
 * CI, key by key, with the reason attached — the ONLY thing `publishAuthVariables` prints about
 * an omission, because it never calls `gh` for one.
 *
 * Covers all three sources: `CI_ENV_PINNED_BY_RUNNER`, `CI_ENV_REQUIRES_SERVER_SECRETS` (checked
 * over every key of `parsed`, not just the `NEXT_PUBLIC_AUTH_*` ones — `NEXT_PUBLIC_APP_URL` is
 * pinned-by-runner but outside that prefix), and whatever `resolveCiAuthPosture` additionally
 * excludes once the auth-prefixed survivors are known.
 *
 * 🔴 Key + reason, NEVER "how to publish it by hand" — for OAuth in CI what's missing is a
 * server-side secret, not the public variable, so no instruction here could fix it anyway.
 */
export function describeOmittedAuthEnv(
  parsed: Record<string, string>
): { key: string; reason: string }[] {
  const omitted: { key: string; reason: string }[] = [];

  for (const key of Object.keys(parsed)) {
    if (CI_ENV_PINNED_BY_RUNNER.includes(key)) {
      omitted.push({ key, reason: PINNED_BY_RUNNER_REASON });
    } else if (CI_ENV_REQUIRES_SERVER_SECRETS.includes(key)) {
      omitted.push({ key, reason: REQUIRES_SERVER_SECRETS_REASON });
    }
  }

  const candidates: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith(CI_AUTH_ENV_PREFIX)) continue;
    if (isExcludedFromCi(key)) continue;
    candidates[key] = value;
  }

  omitted.push(...resolveCiAuthPosture(candidates).omitted);

  return omitted;
}

/**
 * The prefix every value that can ever reach `describeOmittedAuthEnv` carries: all of its
 * reasons (`CI_ENV_PINNED_BY_RUNNER`, `CI_ENV_REQUIRES_SERVER_SECRETS`, the posture) are about
 * `NEXT_PUBLIC_*` keys. Narrowing the source to it is what keeps the vault path from handing the
 * whole process environment — `PATH`, `HOME`, the names of injected secrets — to the report.
 */
const PUBLIC_ENV_PREFIX = 'NEXT_PUBLIC_';

/**
 * WHICH RECORD the publisher reads — the pure half of the vault switch (SYNC-004).
 *
 *   · `vaultBlock: true` → the process environment, which the wrapper filled from the vault's
 *     `develop` environment (`pnpm setup:e2e*` declare `--vault-env=develop`). A leftover
 *     `.env.local` is NOT read: the vault is the source, exactly as it is for the wrapper.
 *   · `vaultBlock: false` → `.env.local` through `dotenv.parse` (quotes resolved), and the
 *     process environment is IGNORED — a flag exported in the terminal is not the project's.
 *     `null` means there is no `.env.local`.
 *
 * Both origins are narrowed to `NEXT_PUBLIC_*` here, so the downstream rules
 * (`collectPublishableAuthEnv`'s filter, `resolveCiAuthPosture`, `describeOmittedAuthEnv`) run
 * on the same shape whichever door the values came through. `undefined` entries (how
 * `process.env` spells "absent") are dropped.
 */
export function selectAuthEnvSource(ctx: {
  vaultBlock: boolean;
  envLocalSource: string | null;
  env: Record<string, string | undefined>;
}): Record<string, string> | null {
  let raw: Record<string, string | undefined>;
  if (ctx.vaultBlock) raw = ctx.env;
  else if (ctx.envLocalSource === null) return null;
  else raw = dotenv.parse(ctx.envLocalSource);

  const source: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith(PUBLIC_ENV_PREFIX)) continue;
    if (value === undefined) continue;
    source[key] = value;
  }
  return source;
}

/**
 * What would be published and what is omitted, for a record from `selectAuthEnvSource`. The SAME
 * three rules for both origins — this is the function the parity test holds to one answer.
 */
export function planAuthPublication(source: Record<string, string>): {
  publish: Record<string, string>;
  omitted: { key: string; reason: string }[];
} {
  const { publish } = resolveCiAuthPosture(filterPublishableAuthEnv(source));
  return { publish, omitted: describeOmittedAuthEnv(source) };
}

/**
 * The consumer-side filter: which of a repo's Actions variables may reach the job's environment.
 *
 * 🔴 THIS IS THE CONTROL, and it lives here rather than in a `node -e` inside the workflow for
 * one reason: a filter nobody can test is a filter nobody can trust. The runner spawns every
 * child with `{ ...process.env, ...overrides }`, so a variable that reaches the job reaches the
 * build and the Playwright process too. Without this, `toJSON(vars)` would carry any variable
 * added later in the GitHub UI — `NODE_OPTIONS`, `DATABASE_URL`, `E2E_*` — straight into both.
 *
 * A value that is not a string is dropped rather than coerced (GitHub only ever sends strings;
 * anything else means the JSON is not what this expects), and so is a name that is not a legal
 * environment-variable name.
 */
export function selectCiEnv(variables: Record<string, unknown>): Record<string, string> {
  const selected: Record<string, string> = {};

  for (const [key, value] of Object.entries(variables)) {
    if (!key.startsWith(CI_AUTH_ENV_PREFIX)) continue;
    if (isExcludedFromCi(key)) continue;
    if (!ENV_NAME_PATTERN.test(key)) continue;
    if (typeof value !== 'string') continue;
    selected[key] = value;
  }

  // 🔴 The SAME posture function the publish side uses, and its `publish` WHOLE — not just its
  // omissions. `gh variable set` never deletes (§4 of the issue): a derivative that already
  // published `NEXT_PUBLIC_AUTH_PASSWORD=false` before this fix keeps that variable in the repo
  // forever unless the CONSUMER also drops it. Dropping alone is not enough, because the
  // zero-methods posture ALSO forces `NEXT_PUBLIC_AUTH_REGISTRATION='false'`, whose default is
  // `true` (`src/lib/env.ts`) — take only the omissions and that same rescued repo ends up with
  // `/api/auth/register` OPEN in the app under test, while the publish side of the one decision
  // function closed it. Adding is as available here as deleting: the return feeds
  // `renderGithubEnvFile` → `$GITHUB_ENV`, which writes whatever record it receives.
  return resolveCiAuthPosture(selected).publish;
}

/**
 * The selected variables as lines for `$GITHUB_ENV` — heredoc form, one block per key.
 *
 * 🔴 HEREDOC, NEVER `key=value`. `$GITHUB_ENV` is parsed line by line, so a value carrying a
 * newline would let whatever follows it be read as another assignment: an arbitrary variable of
 * the job, defined by the content of a repo variable. The heredoc form bounds the value with a
 * delimiter, and the delimiter is RANDOM per run so it cannot be spelled out in advance by
 * whoever writes the value.
 *
 * A value that contains the delimiter anyway throws instead of being written — the residual case
 * is astronomically unlikely with 16 random bytes, and "write it and hope" is how a bound stops
 * being a bound.
 */
export function renderGithubEnvFile(selected: Record<string, string>, delimiter: string): string {
  const entries = Object.entries(selected);
  if (entries.length === 0) return '';

  return (
    entries
      .map(([key, value]) => {
        if (value.includes(delimiter)) {
          throw new Error(
            `The value of ${key} contains the heredoc delimiter, so it cannot be written to ` +
              `$GITHUB_ENV safely. Nothing was written.`
          );
        }
        return `${key}<<${delimiter}\n${value}\n${delimiter}`;
      })
      .join('\n') + '\n'
  );
}

/**
 * What the CI step prints to stdout, for the shell to append to `$GITHUB_ENV`.
 *
 * NO VARIABLE ⇒ EMPTY OUTPUT ⇒ the kit's defaults, which is today's behaviour exactly. Adopting
 * this must not change a repo that publishes nothing.
 *
 * A malformed payload THROWS, so the step exits non-zero and the job stops before the suite: a
 * run that silently lost the project's auth posture is a run that asserts the opposite of the
 * app and reports green.
 */
export function emitCiEnv(env: Record<string, string | undefined>, delimiter: string): string {
  const raw = env[CI_ENV_VARIABLES_KEY];
  if (!raw || raw.trim() === '') return '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${CI_ENV_VARIABLES_KEY} is not valid JSON (${error instanceof Error ? error.message : error}). ` +
        `The workflow step must pass it as \`\${{ toJSON(vars) }}\` through \`env:\`.`
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${CI_ENV_VARIABLES_KEY} must be a JSON object of variables (got ${
        Array.isArray(parsed) ? 'an array' : typeof parsed
      }).`
    );
  }

  return renderGithubEnvFile(selectCiEnv(parsed as Record<string, unknown>), delimiter);
}

/** A delimiter no value can be written to contain: 16 random bytes, per invocation. */
function githubEnvDelimiter(): string {
  return `ghadelim_${randomBytes(16).toString('hex')}`;
}

/**
 * The git root and the `owner/repo` of `origin`, or abort with the actionable diagnosis.
 *
 * Extracted from `main()` when `--publish-vars` gained a second caller: duplicating the
 * GitHub-URL parsing would have been two places to fix the day an origin shape shows up that
 * the regex does not cover. Does NOT check the Neon CLI — publishing variables never talks to
 * Neon, and demanding a tool the task does not use is how a retrofit becomes unreachable.
 */
function resolveRepoContext(): { gitRoot: string; repo: string } {
  const gitRoot = exec('git rev-parse --show-toplevel 2>/dev/null', { silent: true }).trim();
  if (!gitRoot) {
    console.error('❌ Not a git repository');
    process.exit(1);
  }

  if (!checkCommand('gh')) {
    console.error('❌ GitHub CLI not found');
    console.error('   Install with: brew install gh');
    process.exit(1);
  }
  console.log('  ✓ GitHub CLI found');

  // The `origin` remote specifically — not `upstream`, not whatever else is configured.
  const originUrl = exec('git remote get-url origin 2>/dev/null', { silent: true }).trim();
  if (!originUrl) {
    console.error('❌ No origin remote found');
    console.error('   Run: git remote add origin <your-repo-url>');
    process.exit(1);
  }

  // owner/repo from either shape: https://github.com/owner/repo.git · git@github.com:owner/repo.git
  const repoMatch = originUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  if (!repoMatch) {
    console.error('❌ Could not parse GitHub repo from origin URL');
    console.error(`   Origin URL: ${originUrl}`);
    process.exit(1);
  }
  console.log(`  ✓ GitHub repo: ${repoMatch[1]}`);
  return { gitRoot, repo: repoMatch[1] };
}

/** How the publisher runs `gh`. Injected in tests; the default shells out. */
export type GhSpawn = (args: string[]) => { status: number | null; stderr: string };

const defaultGhSpawn: GhSpawn = (args) => {
  const result = spawnSync('gh', args, { encoding: 'utf-8', stdio: 'pipe' });
  return { status: result.status, stderr: result.stderr ?? '' };
};

/**
 * True inside a Vitest worker. Read from `globalThis`, NEVER from `process.env.VITEST`: a
 * process that a test spawns inherits the env var, and a real `pnpm setup:e2e` launched that way
 * would be refused; `__vitest_worker__` lives only in the worker's own global scope.
 * `setup-e2e.test.ts` pins that it is present (a publish without seam must throw there), so the
 * day Vitest renames it the suite goes red instead of the guard disarming in silence.
 */
function runningUnderVitest(): boolean {
  return (globalThis as Record<string, unknown>).__vitest_worker__ !== undefined;
}

/**
 * Publish the project's auth flags as repo VARIABLES — never secrets.
 *
 * They are `NEXT_PUBLIC_*`: `next build` inlines them into the client bundle, so anybody who
 * loads the app already has them. Filing them as secrets would buy nothing and cost the ability
 * to read back what CI is running with.
 *
 * The keys AND their values are printed before anything is sent, and the operator confirms. This
 * writes into somebody's repository, and the value is precisely what the operator has to check
 * — the whole defect being closed is a value that arrives quoted and therefore inverted. In a
 * repo with a vault that listing is also the only control over a flag exported in the terminal:
 * from inside the process it cannot be told apart from one the wrapper injected.
 *
 * Reads the auth flags from where the repo keeps them — the vault (injected env) or `.env.local` —
 * and, when there is anything, print it and publish it as repo VARIABLES after confirmation.
 * The one function both `main()` and `--publish-vars` call, so both read the same source.
 *
 * Seams: `env` (default `process.env`), `spawnGh` (default `spawnSync('gh', …)`), `ask`
 * (default the readline prompt). 🔴 Under Vitest without `spawnGh` it THROWS before reading
 * anything: a test that forgot the seam would otherwise write variables into the real GitHub
 * repo with the developer's `gh` session.
 */
export async function publishAuthVariables(options: {
  gitRoot: string;
  repo: string;
  env?: Record<string, string | undefined>;
  spawnGh?: GhSpawn;
  ask?: (question: string) => Promise<string>;
}): Promise<void> {
  const { gitRoot, repo } = options;
  if (!options.spawnGh && runningUnderVitest()) {
    throw new Error(
      'publishAuthVariables ran under Vitest without an injected `spawnGh` seam — refusing to ' +
        'call the real `gh`, which would write variables into a real GitHub repository.'
    );
  }
  const spawnGh = options.spawnGh ?? defaultGhSpawn;
  const ask = options.ask ?? prompt;
  const env = options.env ?? process.env;

  console.log('\n🔧 Variables de auth del proyecto → GitHub Actions\n');

  // The SAME reader of the `vault` block the wrapper uses — never a second parser. A malformed
  // block throws (fail closed): "I could not tell" must not read as "no vault".
  const vaultBlock = readVaultBlock(gitRoot) !== null;
  const envLocalPath = path.join(gitRoot, '.env.local');
  const envLocalSource =
    !vaultBlock && fs.existsSync(envLocalPath) ? fs.readFileSync(envLocalPath, 'utf-8') : null;
  const source = selectAuthEnvSource({ vaultBlock, envLocalSource, env });

  if (source === null) {
    console.log('  ℹ️  No hay .env.local — CI va a usar los defaults del kit.');
    return;
  }

  if (vaultBlock && !Object.keys(source).some((key) => key.startsWith(CI_AUTH_ENV_PREFIX))) {
    // Two causes, one message: `develop` has no flags, or nothing was injected (run straight with
    // `tsx`, `TK_VAULT=off`, or a `CI` in the terminal that made the wrapper pass through).
    console.log(
      `  ℹ️  Este repo vive en la bóveda: las banderas ${CI_AUTH_ENV_PREFIX}* se leen del entorno ` +
        '`develop`, y no llegó ninguna.'
    );
    console.log(
      '     Si corriste el script directo (o con TK_VAULT=off), córrelo por el wrapper: ' +
        '`pnpm setup:e2e` o `pnpm setup:e2e:vars`.'
    );
    console.log('     No se publica nada — CI va a usar los defaults del kit.');
    return;
  }

  const { publish, omitted } = planAuthPublication(source);
  const keys = Object.keys(publish).sort();

  if (vaultBlock) {
    console.log('  Fuente: entorno `develop` de la bóveda (inyectado por el wrapper).\n');
  }

  if (omitted.length > 0) {
    console.log('  Se omiten (no se publican):\n');
    for (const { key, reason } of omitted) console.log(`    · ${key} — ${reason}`);
    console.log('');
  }

  if (keys.length === 0) {
    console.log(
      `  ℹ️  Ninguna variable ${CI_AUTH_ENV_PREFIX}* para publicar — CI usa los defaults del kit.`
    );
    return;
  }

  console.log('  Se van a publicar como VARIABLES del repo (no secrets, ya viajan en el');
  console.log('  bundle del cliente), sin comillas:\n');
  for (const key of keys) console.log(`    · ${key}=${publish[key]}`);
  console.log('');

  const answer = await ask(`  ¿Publicarlas en ${repo}? (y/n): `);
  if (answer.toLowerCase() !== 'y') {
    console.log('  ⏭️  Saltado — CI va a usar los defaults del kit.');
    return;
  }

  for (const key of keys) {
    const result = spawnGh(['variable', 'set', key, '-R', repo, '--body', publish[key]]);
    if (result.status !== 0) {
      console.error(`  ❌ No se pudo publicar ${key}`);
      console.error(result.stderr);
    } else {
      console.log(`  ✓ ${key}`);
    }
  }
}

async function main() {
  console.log('\n🚀 E2E Setup - Configure E2E tests with Neon + GitHub\n');

  // =========================================================================
  // Pre-flight checks
  // =========================================================================
  console.log('📋 Pre-flight checks...\n');

  // Git repo + GitHub CLI + the `owner/repo` of `origin` (shared with `--publish-vars`).
  const { gitRoot, repo } = resolveRepoContext();

  // Check e2e.yml.example exists
  const workflowDir = path.join(gitRoot, '.github', 'workflows');
  const templatePath = path.join(workflowDir, 'e2e.yml.example');
  if (!fs.existsSync(templatePath)) {
    console.error('❌ e2e.yml.example not found');
    console.error("   Make sure you're in the timekast-starter-kit repo");
    process.exit(1);
  }
  console.log('  ✓ E2E workflow template found');

  // 🔴 No Neon here, deliberately. This script USED to authenticate `neonctl`, create or
  // pick a project, read its connection string, then ask the dev to paste an API key from
  // "profile → Account Settings → API Keys" and push it as the `NEON_API_KEY` secret plus
  // into `.env.local`.
  //
  // That key was PERSONAL: its scope is every organization its owner belongs to, so a single
  // paste handed one repo's CI a credential reaching every org — client organizations
  // included. `factory provision --services=neon` does the whole job instead, and the key it
  // distributes comes from `POST /organizations/{org_id}/api_keys`, which is scoped to the one
  // project (it 404s on any other). Leaving the old flow here would let anyone re-introduce
  // the credential this change exists to remove.
  //
  // What this script still owns: the project's auth flags as repo VARIABLES
  // (`publishAuthVariables`, also reachable on its own via `pnpm setup:e2e:vars`) and
  // generating `e2e.yml` from the template.
  console.log('  ℹ️  Credenciales de Neon (DATABASE_URL · NEON_API_KEY · NEON_PROJECT_ID):');
  console.log('     las provisiona `factory provision --services=neon` (key acotada al');
  console.log('     proyecto). Para reacuñarla: `factory provision --services=neon --remint`.\n');

  // =========================================================================
  // The project's auth flags → repo variables (see `publishAuthVariables`)
  // =========================================================================
  await publishAuthVariables({ gitRoot, repo });

  // =========================================================================
  // Copy E2E Workflow
  // =========================================================================
  const targetPath = path.join(workflowDir, 'e2e.yml');
  console.log('  Enabling E2E workflow...');
  const playwrightVersion = resolvePlaywrightVersion(gitRoot);
  console.log(`  ✓ Resolved @playwright/test: ${playwrightVersion}`);
  const triggerBranch = resolveTriggerBranch(gitRoot);
  const parentBranch = resolveParentBranch(gitRoot, triggerBranch);
  // Says what it WROTE, not what it resolved: the workflow fires on the release branch and on
  // the working branch, and printing only the first would under-report the file on disk.
  console.log(`  ✓ Resolved CI triggers: ${formatTriggerBranches(triggerBranch, parentBranch)}`);
  console.log(`  ✓ Resolved Neon parent branch: ${parentBranch}`);

  // 🔴 This file is GENERATED from the template, so a hand edit is lost on the next run — a
  // Playwright container bump is enough. Say what is about to be overwritten instead of doing it
  // silently: the one edit people made here was `E2E_PARENT_BRANCH`, and losing it sent CI back to
  // cloning production without anything visibly changing.
  if (fs.existsSync(targetPath)) {
    const existing = fs.readFileSync(targetPath, 'utf-8');
    const pinned = existing.match(/^\s*E2E_PARENT_BRANCH:\s*(\S+)/m)?.[1];
    if (pinned && pinned !== parentBranch) {
      console.log(
        `  ⚠️  The current e2e.yml pins E2E_PARENT_BRANCH: ${pinned}; this run writes ${parentBranch}.`
      );
      console.log(`     Re-pin it by hand if ${pinned} is the branch you meant.`);
    }
  }

  const template = fs.readFileSync(templatePath, 'utf-8');
  const generated = template
    .replace(/__PLAYWRIGHT_VERSION__/g, playwrightVersion)
    // Each `branches: [...]` line carrying the `# __TRIGGER_BRANCH__` anchor is rewritten to
    // the release branch plus the working branch (keeps the .example valid YAML).
    .replace(
      /branches: \[[^\]]*\] # __TRIGGER_BRANCH__/g,
      formatTriggerBranches(triggerBranch, parentBranch)
    )
    // Its own anchor and its own source: the parent is the branch the throwaway Neon branch is
    // cloned FROM, which is not where CI fires. Two values, two resolutions.
    .replace(
      /E2E_PARENT_BRANCH: \S+ # __E2E_PARENT_BRANCH__/g,
      `E2E_PARENT_BRANCH: ${parentBranch}`
    );
  if (
    generated.includes('__PLAYWRIGHT_VERSION__') ||
    generated.includes('__TRIGGER_BRANCH__') ||
    generated.includes('__E2E_PARENT_BRANCH__')
  ) {
    console.error('❌ Placeholder substitution failed — aborting.');
    process.exit(1);
  }
  fs.writeFileSync(targetPath, generated);
  console.log('  ✓ Created .github/workflows/e2e.yml');

  // =========================================================================
  // Done
  // =========================================================================
  console.log('\n✅ Setup complete!\n');

  const shouldCommit = await prompt('Commit and push? (y/n): ');
  if (shouldCommit.toLowerCase() === 'y') {
    exec('git add .github/workflows/e2e.yml');
    exec('git commit -m "chore: enable E2E tests in CI"');
    console.log('\n  ✓ Committed');

    const shouldPush = await prompt('Push now? (y/n): ');
    if (shouldPush.toLowerCase() === 'y') {
      exec('git push');
      console.log('  ✓ Pushed - E2E tests will run on next CI\n');
    } else {
      console.log('  Run: git push\n');
    }
  } else {
    console.log('\n  Next steps:');
    console.log('  git add .github/workflows/e2e.yml');
    console.log('  git commit -m "chore: enable E2E tests in CI"');
    console.log('  git push\n');
  }

  rl?.close();
}

// Only run as CLI — allow importing `resolvePlaywrightVersion` from tests/smokes
// without triggering the interactive setup flow. `computeIsMainModule` absorbs the
// `typeof process.argv[1] === 'string'` guard this used to spell out inline — its own
// ternary short-circuits to `false` before ever calling `resolve`/`pathToFileURL`, so no
// protection is lost.
const isMainModule = computeIsMainModule(import.meta.url, process.argv[1]);
if (isMainModule) {
  // The CI mode, answered BEFORE `main()` — it must not prompt, not talk to Neon and not talk to
  // GitHub. Its stdout is redirected into `$GITHUB_ENV` by the workflow step, so everything this
  // branch says goes to STDERR: one `console.log` here would be appended to the job's environment
  // as garbage. A throw exits non-zero and stops the job before the suite, which is the point.
  if (process.argv.slice(2).includes(EMIT_CI_ENV_FLAG)) {
    let rendered: string;
    try {
      rendered = emitCiEnv(process.env, githubEnvDelimiter());
    } catch (error) {
      // The MESSAGE, never the stack: this is read in a CI log by somebody who did not write
      // this file, and the cause is always a malformed payload rather than a bug in here. The
      // non-zero exit is what stops the job before the suite runs with the wrong posture.
      console.error(`❌ ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
    if (rendered) {
      process.stdout.write(rendered);
      const names = rendered
        .split('\n')
        .filter((line) => line.includes('<<'))
        .map((line) => line.split('<<')[0]);
      console.error(
        `✓ ${names.length} variable(s) del repo al entorno del job: ${names.join(', ')}`
      );
    } else {
      console.error(
        `ℹ️  Ninguna variable ${CI_AUTH_ENV_PREFIX}* publicada en el repo — se usan los ` +
          `defaults del kit (\`pnpm setup:e2e\` las publica).`
      );
    }
    process.exit(0);
  }

  // Publish-only: the flags to the repo, and NOTHING else. No Neon, no workflow written —
  // which is the entire point, because the full flow regenerates `e2e.yml` from the template
  // and a project that customized it would lose that work. Interactive on purpose: it still
  // prints what it is about to publish and asks, because it writes to somebody's repository.
  else if (process.argv.slice(2).includes(PUBLISH_VARS_FLAG)) {
    console.log(`\n📤 Publicando las variables de auth del proyecto (${PUBLISH_VARS_FLAG})\n`);
    const { gitRoot, repo } = resolveRepoContext();
    publishAuthVariables({ gitRoot, repo })
      .then(() => {
        console.log(
          `\n✅ Listo. El workflow NO se tocó: para que el job las lea necesita el step de ` +
            `volcado — guía en \`${CI_ENV_RETROFIT_DOC}\`.\n`
        );
        rl?.close();
      })
      .catch((err) => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  } else {
    main().catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  }
}
