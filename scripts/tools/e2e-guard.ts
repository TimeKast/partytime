/**
 * The disposable-database guard: E2E runs against the throwaway Neon branch this run created,
 * or it does not run at all.
 *
 * WHY IT EXISTS. `playwright.config.ts` loads `.env.local` with dotenv IN THE CONFIG ITSELF, so
 * `pnpm exec playwright test <spec>` reaches whatever database that file points at without
 * passing through a single script of the kit. On one derivative `.env.local` shared an endpoint
 * with production: most specs died on arrival and a handful wrote straight to it. Removing the
 * pretty-named shortcuts narrows the path a developer stumbles onto; it does not remove the
 * CAPABILITY. This does, and it is the only piece here that does.
 *
 * WHY A POSITIVE PROOF, NOT A BLACKLIST. The guard compares nothing against `.env.local`, and
 * knows about no "production" URL it should refuse. It demands that the effective `DATABASE_URL`
 * BE the identifier the runner left behind in `E2E_DISPOSABLE_BRANCH` — the very connection URI
 * of the branch it created seconds earlier (`playwrightEnvOverrides` in `e2e-runner.ts`). A
 * negative rule has to enumerate every database that must not be written to and is wrong the day
 * a project adds one; this rule enumerates the ONE database that may be, and it is a different
 * value on every run.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. It is an ANTI-FOOTGUN: it closes the ACCIDENTAL path — the
 * developer who types `pnpm exec playwright test <spec>` because it is the obvious command and
 * ends up pointed at whatever `.env.local` holds. It is NOT a security boundary against somebody
 * who means to get around it, and nothing should be built on top of it as if it were.
 *
 * The marker carries the run's connection URI rather than the old fixed `E2E_DISPOSABLE_BRANCH=1`,
 * and that is a real improvement — but one of DEGREE, not of kind. The `=1` token was printable
 * advice: anyone who read the error message knew the value, which is how a real derivative ended
 * up with the lock armed and the key on the doormat. A per-run URI cannot be guessed and cannot be
 * put in a message, so the error below never names a variable to export. What it does not stop is
 * the one line that needs no guessing at all:
 *
 *     E2E_DISPOSABLE_BRANCH="$DATABASE_URL" pnpm exec playwright test
 *
 * The rule is an EQUALITY between two variables in one environment, so anyone willing to write
 * that satisfies it — deliberately, in a command nobody types by accident. Making the marker
 * unfakeable would take proof the value really is a throwaway branch (a live check against the
 * database), which this module does not do and does not pretend to.
 *
 * PURE OVER ITS INPUT. Every function takes the environment as an argument, so the rule is
 * exercised with injected values — no filesystem, no `.env.local`, no Neon.
 *
 * @see scripts/tools/e2e-runner.ts — `playwrightEnvOverrides`, which sets the marker
 * @see tests/global-setup.ts — where Playwright invokes this, before any spec is loaded
 * @see .claude/docs/retrofits/e2e-disposable-db-guard.md — wiring it into an existing derivative
 */

/** The environment shape this module reads. Same as the runner's `EnvVars`, duplicated rather than
 * imported so that `tests/global-setup.ts` can load this file without pulling the runner (and its
 * `fs` / `child_process` / dotenv imports) into Playwright's main process. */
export type GuardEnv = Record<string, string | undefined>;

/**
 * The key the runner leaves the run's connection URI in.
 *
 * Exported and consumed by `e2e-runner.ts` so the writer and the reader of this contract name it
 * once. A second literal is exactly how the previous version of this mechanism died: the lock had
 * a test, the key did not, and an update took the key away without `pnpm verify` noticing.
 */
export const DISPOSABLE_BRANCH_ENV_KEY = 'E2E_DISPOSABLE_BRANCH';

/** The variable whose value decides which database the specs actually talk to. */
export const DATABASE_URL_ENV_KEY = 'DATABASE_URL';

/**
 * Why a run is refused:
 *   - `no-marker`  — nothing set the marker, so this process never went through the runner.
 *   - `mismatch`   — a marker is present but the effective `DATABASE_URL` is a different value
 *                    (including absent). Something else decided where the specs write.
 */
export type DisposableBranchFailure = 'no-marker' | 'mismatch';

/** The rule itself: `null` when the run may proceed, otherwise why it may not. */
export function checkDisposableBranch(env: GuardEnv): DisposableBranchFailure | null {
  const marker = env[DISPOSABLE_BRANCH_ENV_KEY];
  // An empty string is as absent as an undefined one: a shell that exported the name with no
  // value must not read as "the runner was here".
  if (!marker) return 'no-marker';
  return env[DATABASE_URL_ENV_KEY] === marker ? null : 'mismatch';
}

/**
 * What the developer reads when the guard fires.
 *
 * 🔴 It never names a variable to export, and the omission is the point: a message that spells
 * out the marker hands over the way around itself, which is precisely what the old fixed `=1`
 * token did. The remedy it offers is the runner, and only the runner. That does not make the
 * mechanism unbypassable — see the module docstring — it makes the bypass something a developer
 * has to go looking for instead of something the failure message teaches them.
 */
export function disposableBranchMessage(failure: DisposableBranchFailure): string {
  const head =
    failure === 'no-marker'
      ? 'E2E aborted: this run did not come from the E2E runner, so no throwaway database was created for it.'
      : 'E2E aborted: DATABASE_URL is not the throwaway branch this run created.';

  return [
    head,
    '',
    'The suite only ever runs against the ephemeral Neon branch the runner creates, migrates and',
    'deletes around it. Anything else would let the specs write to a real database — which is how',
    'a derivative once had its tests seeding and deleting rows next to production data.',
    '',
    'Run it through the runner:',
    '',
    '  pnpm test:e2e                                        # the whole suite',
    '  pnpm test:e2e --project=chromium tests/e2e/x.spec.ts  # one spec, base phase only',
    '',
    'See `pnpm test:e2e --help` for the flags the runner owns.',
  ].join('\n');
}

/**
 * Throws unless this process is running against the branch the runner created for it.
 *
 * Called from `tests/global-setup.ts`, which Playwright runs in its MAIN process before it loads
 * a single spec — so a refused run dies before any `INSERT` exists to execute, not halfway
 * through one.
 */
export function assertDisposableBranch(env: GuardEnv = process.env): void {
  const failure = checkDisposableBranch(env);
  if (failure) throw new Error(disposableBranchMessage(failure));
}
