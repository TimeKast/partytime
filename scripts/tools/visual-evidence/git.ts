/**
 * Visual evidence — the two questions only GIT can answer about the checkout a run came from.
 *
 * 1. **Which code produced this evidence** (`readCodeSeal`). The manifest already said *when* it
 *    was captured; `generatedAt` cannot tell a manifest taken BEFORE a fix from one taken after,
 *    because both are timestamps and the code has none. `/implement` §4.4 allows reusing a
 *    previous manifest "only if it is newer than the last code change" — a rule that was prose
 *    with nothing to check it against. The seal is that something, and it is scoped to the code
 *    that DRAWS: the last commit that touched a build input and whether any of those inputs was
 *    uncommitted at capture time. `HEAD` rides along as context, never as the decision.
 * 2. **Whether the output directory is ignored** (`checkPathIgnored`). The harness writes
 *    AUTHENTICATED screens of seeded data. In this repo `tests/.evidence/` shipped in
 *    `.gitignore` with the harness, but a derivative that adopted the spec and skipped that step
 *    can commit those PNGs with one wide `git add`. A line in an adoption guide is skippable; a
 *    check at run time is not.
 *
 * 🔴 EVERY ANSWER DEGRADES INSTEAD OF THROWING. A checkout with no `git` binary, an export of the
 * tree with no `.git/`, a repository with no commits yet — none of those is a reason to destroy a
 * capture run. Each one comes back as an explicit "unknown" carrying WHY, which lands in the
 * manifest (the seal) or in a banner (the ignore check). A missing answer that says so is
 * information; a missing answer that looks like a normal one is the failure this file exists to
 * avoid.
 *
 * Both take their runner as an argument so the unit tests
 * (`scripts/tools/__tests__/visual-evidence-git.test.ts`) never shell out.
 */

import { execFileSync } from 'node:child_process';

import { BUILD_SOURCE_DIRS, BUILD_SOURCE_FILES, readExtraBuildInputs } from '../e2e-runner';
import type { CodeSeal } from './manifest';

/** What one `git` invocation produced. `code` is the exit status, `null` when it never ran. */
export interface GitResult {
  ok: boolean;
  stdout: string;
  code: number | null;
  /** `errno` when the process could not be spawned (`ENOENT` = no `git` on this machine). */
  errno?: string;
}

/** Runs `git <args>` in some directory. Injected, so the decisions above are testable. */
export type GitRunner = (args: readonly string[]) => GitResult;

/** The real thing: `git` in `cwd`, stdout captured, stderr swallowed (the exit code is the signal). */
export function makeGitRunner(cwd: string): GitRunner {
  return (args) => {
    try {
      const stdout = execFileSync('git', [...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return { ok: true, stdout, code: 0 };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { status?: number | null; stdout?: string };
      return {
        ok: false,
        stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
        code: typeof failure.status === 'number' ? failure.status : null,
        errno: failure.code,
      };
    }
  };
}

/** A commit id as `git rev-parse` prints it — hex, and long enough to be one. */
const COMMIT_RE = /^[0-9a-f]{7,64}$/;

/**
 * The paths whose content can change what a screenshot SHOWS — the seal's pathspec set.
 *
 * 🔴 IT IS THE E2E RUNNER'S BUILD-STAMP REGISTRY, WHOLE, AND THE "WHOLE" IS THE POINT. That
 * registry already answers exactly this question for a different consumer ("may I reuse the
 * compiled app?"), and it answers it in three pieces, not one: `BUILD_SOURCE_DIRS` (`src`,
 * `public`, `types`), `BUILD_SOURCE_FILES` (the root files `next build` reads — `next.config.*`,
 * `tailwind.config.*`, `postcss.config.*`, `package.json`, the lockfiles, `components.json`,
 * `instrumentation*`, the Sentry configs, the production env chain) and whatever the PROJECT
 * declared in `package.json#e2eBuildInputs`. Taking only the directories would leave the seal
 * blind to a recompiled theme — `tailwind.config.ts` changes, the screens repaint, the seal does
 * not move, and evidence from before the change certifies as fresh. Reusing a SUBSET of a
 * registry is the failure mode `kb-ssot-registries` names outright ("hardcoded subsets of the
 * registry in consumers"), and this is a place where the subset would be silently wrong rather
 * than loudly broken.
 *
 * 🔴 EVERY CANDIDATE PATH, PRESENT OR NOT. `BUILD_SOURCE_FILES` lists alternatives (both lockfile
 * flavours, four `postcss.config.*` extensions) and the build stamp skips the absent ones because
 * it HASHES them. The seal does not hash: it hands the list to `git`, where a pathspec matching
 * nothing is not an error — `git rev-list -1 HEAD -- missing.ts` prints nothing and exits 0. So
 * the absent ones are kept on purpose: a commit that ADDS `tailwind.config.ts` has to move the
 * seal of a manifest captured before that file existed, and it only can if the earlier manifest
 * was already watching that name.
 *
 * 🔴 WHAT IS DELIBERATELY *NOT* IN THE SET: `scripts/tools/visual-evidence/**` — this very
 * directory. It DOES decide what an image shows (the capture width, the clip of the contrast
 * measurement, which states are photographed), so the opening sentence above promises a little
 * more than the set delivers, and this paragraph is the correction: the exclusion is a DECISION,
 * not an oversight. Hardening it would invalidate the evidence on EVERY edit of the harness —
 * exactly the friction that sealing by code came to remove (a backlog commit used to buy a full
 * recapture). The exposure is nil today for a mechanical reason: a change to the SHAPE of what is
 * captured moves the manifest's schema tag, and a consumer holding an older tag recaptures
 * anyway. The day a change alters the picture WITHOUT touching the schema, this set is where it
 * gets fixed. Same statement, for the reader of the docs, in `fx-visual-evidence §2.1`.
 *
 * WHY THIS IMPORTS `../e2e-runner` INSTEAD OF RESTATING THE THREE PIECES. The alternative to one
 * import is a second copy of a list that a derivative extends at will — drift with the shape of
 * "the seal says nothing changed, the app was rebuilt". The import is static (not `await
 * import()`) because `readCodeSeal` is called SYNCHRONOUSLY from `tests/e2e/visual.evidence.spec.ts`,
 * a file that is frozen at bootstrap in every derivative: turning it async would return a Promise
 * into a manifest field that no derivative's spec would await — a seal serialized as `{}`, which
 * is the "looks valid without being one" outcome this module exists to prevent. The runner is
 * import-safe (its entry point is guarded by `isDirectExecution`, so importing it opens no
 * database, reads no `.env` and starts nothing), and the measured cost of the extra module graph
 * is ~110 ms once per process — paid by one unit-test file and by the Playwright worker of a run
 * that already lasts minutes. Nothing here can move to a leaner module without editing
 * `e2e-runner.ts`, which this issue is not allowed to touch.
 */
export function sealInputs(): string[] {
  const inputs = new Set<string>([...BUILD_SOURCE_DIRS, ...BUILD_SOURCE_FILES]);
  for (const extra of readExtraBuildInputs().accepted) inputs.add(extra);
  return [...inputs].sort();
}

/**
 * The seal: which code this capture is about.
 *
 * 🔴 IT SEALS BY THE CODE THAT DRAWS, NOT BY `HEAD`. Sealing by `HEAD` answered a question nobody
 * asks — "was any commit made?" — and it cost real work: during EPIC-16 the commit that CLOSED an
 * issue touched nothing but backlog markdown, and a full recapture was paid for it. Two commits
 * can be a repaint or a typo in a document, and only the paths in `inputs` tell them apart. So
 * `codeCommit` is the newest commit reachable from `HEAD` that touched one of those paths: a
 * documentation commit leaves it exactly where it was, a commit under `src/` moves it.
 *
 * 🔴 IT STILL ANSWERS WITH A COMMIT ID, AND THAT IS NOT A STYLISTIC CHOICE. The seal's second
 * consumer is `ui-critic`, whose tools are `Read`, `Grep`, `Glob` — no shell. Its whole operation
 * is a string equality between a value it reads out of the manifest and a value its spawner hands
 * it, and a content hash would have left that comparison with no defined operation: the agent
 * cannot recompute one, so every `pantalla vista` finding in the kit would have degraded to *no
 * demostrado*, permanently and silently. A commit id keeps the comparison exactly as cheap as it
 * was. The recomputation belongs to whoever HAS a shell — `/implement` §4.4 — and it is one
 * command, because the pathspecs travel in the manifest: `git rev-list -1 HEAD -- $(jq -r
 * '.codeSeal.inputs[]' manifest.json)`.
 *
 * 🔴 BOTH DIRTY FLAGS COUNT EVERY ENTRY `git status --porcelain` REPORTS, UNTRACKED ONES INCLUDED,
 * AND THAT IS THE SETTLED ANSWER — not a rough first cut waiting to be narrowed to tracked
 * changes. What changed here is WHICH PATHS are asked about, never whether an untracked file
 * counts. Next.js resolves several files BY CONVENTION — `layout.tsx`, `template.tsx`,
 * `loading.tsx`, `src/proxy.ts` — so ADDING one changes how an already photographed surface
 * renders without a single tracked file changing, and `src/` is inside `inputs`, so `codeDirty`
 * still catches it. And the costs are still not symmetric: a false `true` costs one capture run,
 * a false `false` costs a verdict signed as `pantalla vista` over screens that no longer exist.
 *
 * `dirty` (the whole tree) is kept beside `codeDirty` and is deliberately NOT the decision field:
 * it is what lets a reader see that a run happened over a working tree with loose files in it.
 * The price that used to come with it is what this function removes — a stray plan file under
 * `project/` no longer forces a recapture, while a stray one under `src/` still does.
 *
 * 🔴 A NULL IS A VALID SEAL and it carries `note`. An unsealed manifest is one a consumer must
 * treat as unverifiable — a fact it can act on. What must never happen is a seal that LOOKS valid
 * without being one, so nothing is guessed: no "HEAD", no empty string, no inherited value from
 * an earlier run, and no falling back to the whole-tree answer when the scoped one is missing.
 *
 * `inputs` is injectable so the unit tests can state the set instead of inheriting this
 * project's; production omits it and gets `sealInputs()`.
 */
export function readCodeSeal(run: GitRunner, inputs: readonly string[] = sealInputs()): CodeSeal {
  const pathspec = [...inputs];
  const head = run(['rev-parse', 'HEAD']);

  if (!head.ok) {
    return unsealed(pathspec, describeGitFailure(head, 'git rev-parse HEAD'));
  }

  const commit = head.stdout.trim();
  if (!COMMIT_RE.test(commit)) {
    return unsealed(
      pathspec,
      `'git rev-parse HEAD' no devolvió un commit reconocible (${JSON.stringify(commit.slice(0, 40))}).`
    );
  }

  const notes: string[] = [];

  const status = run(['status', '--porcelain']);
  let dirty: boolean | null = null;
  if (status.ok) dirty = status.stdout.trim().length > 0;
  else notes.push(describeGitFailure(status, 'git status --porcelain'));

  const codeStatus = run(['status', '--porcelain', '--', ...pathspec]);
  let codeDirty: boolean | null = null;
  if (codeStatus.ok) codeDirty = codeStatus.stdout.trim().length > 0;
  else notes.push(describeGitFailure(codeStatus, 'git status --porcelain -- <entradas de código>'));

  const codeCommit = readCodeCommit(run, pathspec, notes);

  return { commit, dirty, codeCommit, codeDirty, inputs: pathspec, ...noteOf(notes) };
}

/**
 * The newest commit that touched a drawing input, or `null` with the reason why not.
 *
 * EMPTY OUTPUT IS NOT AN ERROR AND IS NOT A COMMIT. `git rev-list -1 HEAD -- <paths>` prints
 * nothing, and exits 0, when no commit in this history ever touched one of those paths — a repo
 * whose first commit predates `src/`. That is an honest "there is nothing to compare against", so
 * it becomes `null` + note, never `HEAD` and never an empty string: a consumer comparing an empty
 * string against a real commit would answer "does not correspond" for a reason it could not name.
 */
function readCodeCommit(
  run: GitRunner,
  pathspec: readonly string[],
  notes: string[]
): string | null {
  const result = run(['rev-list', '-1', 'HEAD', '--', ...pathspec]);

  if (!result.ok) {
    notes.push(describeGitFailure(result, 'git rev-list -1 HEAD -- <entradas de código>'));
    return null;
  }

  const codeCommit = result.stdout.trim();
  if (codeCommit.length === 0) {
    notes.push(
      'ningún commit de este historial tocó una entrada de código: no hay sello por código contra el cual comparar.'
    );
    return null;
  }
  if (!COMMIT_RE.test(codeCommit)) {
    notes.push(
      `'git rev-list -1 HEAD -- <entradas de código>' no devolvió un commit reconocible (${JSON.stringify(codeCommit.slice(0, 40))}).`
    );
    return null;
  }

  return codeCommit;
}

/** Every answer missing at once — git could not even name the checkout. */
function unsealed(inputs: string[], note: string): CodeSeal {
  return { commit: null, dirty: null, codeCommit: null, codeDirty: null, inputs, note };
}

/** `note` is present exactly when something is missing, and it names every cause, not the first. */
function noteOf(notes: readonly string[]): { note?: string } {
  return notes.length > 0 ? { note: notes.join(' ') } : {};
}

/** Three answers, not two: "not ignored" and "nobody could tell me" need different reactions. */
export type IgnoreVerdict = 'ignored' | 'not-ignored' | 'unknown';

/**
 * Is this path covered by a `.gitignore` rule of this checkout?
 *
 * `git check-ignore -q <path>` answers by exit code — `0` ignored, `1` not ignored, anything else
 * is git failing to answer (no repository, no binary). It is a query over the rules, so the path
 * does not have to exist yet: the check can run BEFORE the directory is created, which is the
 * only moment where the warning still costs the reader nothing.
 */
export function checkPathIgnored(
  run: GitRunner,
  targetPath: string
): { verdict: IgnoreVerdict; note?: string } {
  const result = run(['check-ignore', '-q', '--', targetPath]);

  if (result.ok) return { verdict: 'ignored' };
  if (result.code === 1) return { verdict: 'not-ignored' };

  return { verdict: 'unknown', note: describeGitFailure(result, 'git check-ignore') };
}

/**
 * Why git could not answer, in the words that lead to the right fix.
 *
 * "No se pudo" on its own is a dead end: a missing binary, a tree without `.git/` and a
 * repository without commits need three different reactions, and only the first is even a
 * problem worth acting on.
 */
function describeGitFailure(result: GitResult, command: string): string {
  if (result.errno === 'ENOENT') {
    return `no hay binario 'git' en esta máquina, así que '${command}' no pudo correr.`;
  }
  if (result.errno) {
    return `'${command}' no pudo ejecutarse (${result.errno}).`;
  }
  if (result.code === 128) {
    return `'${command}' falló: el directorio no es un repositorio git (o todavía no tiene commits).`;
  }
  return `'${command}' salió con código ${result.code ?? 'desconocido'}.`;
}
