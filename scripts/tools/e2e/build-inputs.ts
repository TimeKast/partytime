/**
 * The build inputs the E2E build stamp and the visual-evidence code seal both read.
 *
 * Lives apart from `e2e-runner.ts` so a Playwright spec can import it: the evidence spec
 * reaches it through `visual-evidence/git.ts`, and Playwright loads that graph as CommonJS,
 * where the runner's `./with-vault.mjs` import dies on its first `export`
 * (`exports is not defined`). This module imports nothing but node builtins, so it loads
 * under either loader. `e2e-runner.ts` re-exports every public symbol here.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Directories whose every file feeds `next build` — the KIT's list, which a derivative
 * cannot edit (this file is overwritten by `factory update`). Its own entry directories go
 * in `package.json#e2eBuildInputs`; see `resolveExtraBuildInputs`.
 */
export const BUILD_SOURCE_DIRS = ['src', 'public', 'types'] as const;

/**
 * The `package.json` key through which a PROJECT adds its own build inputs to the stamp.
 *
 *     "e2eBuildInputs": ["content", "messages"]
 *
 * WHY IT HAS TO LIVE THERE. `BUILD_SOURCE_DIRS` and `BUILD_SOURCE_FILES` are the kit's, and
 * this file travels: `factory update` overwrites `scripts/tools/e2e-runner.ts` wholesale, so
 * a derivative that added `content/` (MDX), `messages/` (next-intl) or `emails/`
 * (react-email) to a constant here would lose it on its next update. Until then its content
 * would change while the stamp did not, and the runner would recycle a build that no longer
 * matches the app — "green against an app that is no longer under test", the one failure the
 * stamp exists to prevent. `package.json` is the opposite: frozen at bootstrap
 * (BR-FACTORY-006), owned by the project, and already the SSOT for `ports.e2e`.
 *
 * ADDITIVE, never a replacement: the kit's defaults always apply, and this only ever
 * lengthens the list. A project without the key stamps EXACTLY what it stamps today.
 *
 * The key's own value needs no special handling to be covered — `package.json` is itself a
 * hashed input, so adding or removing an entry moves the stamp on its own.
 */
export const EXTRA_BUILD_INPUTS_KEY = 'e2eBuildInputs';

/**
 * Directories that are never a build input, wherever they appear. Not a security boundary
 * (that is `vetBuildInput`) — a COST one: `node_modules/` is identified by the lockfile and
 * hashing it would cost more than the build it is deciding about, `.git/` likewise, and
 * `.next/` is the build OUTPUT, so folding it into the stamp of its own inputs would never
 * match twice.
 *
 * Applied twice, because a declared entry is not the only way to meet one: `vetBuildInput`
 * refuses an entry that NAMES one, and `collectDirSources` prunes one it WALKS INTO. The
 * second is not hypothetical — `cli/node_modules` in this very repo is 2 035 files, so a
 * project that declared `cli` without the prune would pay for every one of them on each stamp.
 */
export const NON_BUILD_INPUT_DIRS = new Set(['node_modules', '.git', '.next']);

/** An entry of `e2eBuildInputs` that was refused, and why — reported, never thrown. */
export interface RejectedBuildInput {
  /** The entry as it was written, rendered for a log line. */
  value: string;
  reason: string;
}

/** What the project's `e2eBuildInputs` amounts to once vetted. */
export interface ExtraBuildInputs {
  /** Project-relative paths to add to the stamp: normalized, deduplicated, sorted. */
  accepted: string[];
  /** Everything that was refused. The caller prints these; nothing here fails a run. */
  rejected: RejectedBuildInput[];
}

/** An entry as a log line: quoted when it is a string, JSON otherwise, never a throw. */
function describeBuildInput(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

type InputVerdict = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Vet ONE entry of `e2eBuildInputs`.
 *
 * 🔴 CONFINEMENT — these paths come from a configuration file and are then resolved against
 * `process.cwd()` and READ. The runner must never be talked into hashing (and therefore
 * opening) files outside the checkout, so the choice here is to REJECT rather than to
 * silently rewrite: `"../../etc"`, `"/etc/passwd"` and `"C:\\Windows"` are refused and
 * reported, not clamped into something that looks accepted but means something else. A
 * clamped path would be the worse failure — the project would believe an input is covered
 * while a different one is.
 *
 * What IS rewritten is only cosmetic, and always BEFORE the checks so no amount of noise can
 * smuggle a traversal past them: surrounding blanks, Windows separators, duplicated and
 * trailing slashes, and `.` segments. What survives is a relative path with no `..` in it,
 * which cannot denote anything outside the project by construction — no `process.cwd()` read
 * is needed to prove it, which is what keeps this function pure.
 *
 * Symlinks are the one way a confined path can still point elsewhere, and they are already
 * handled downstream: `collectDirSources` records a symlink by name and never follows it.
 */
function vetBuildInput(entry: string): InputVerdict {
  const cleaned = entry.trim().replace(/\\/g, '/');

  if (cleaned === '') return { ok: false, reason: 'it is empty' };
  if (cleaned.startsWith('/')) {
    return { ok: false, reason: 'it is absolute — the stamp only ever covers this project' };
  }
  if (/^[a-zA-Z]:/.test(cleaned)) {
    return { ok: false, reason: 'it names a drive — the stamp only ever covers this project' };
  }

  const segments = cleaned.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) return { ok: false, reason: 'it is empty' };
  if (segments.includes('..')) {
    return { ok: false, reason: "'..' would leave the project, which this never does" };
  }
  if (NON_BUILD_INPUT_DIRS.has(segments[0])) {
    return { ok: false, reason: `'${segments[0]}' is never a build input` };
  }

  return { ok: true, path: segments.join('/') };
}

/**
 * The project's own build inputs, vetted.
 *
 * TOLERANT BY CONTRACT: a `package.json` that carries no key, a key that is not an array, an
 * array with a number in it — none of them is worth failing a run over, so each is reported
 * and skipped. The runner must never be the reason a suite cannot start.
 *
 * Pure, so the whole vetting contract (including the confinement above) is assertable
 * without a filesystem; `readExtraBuildInputs` is the thin part that reads `package.json`.
 */
export function resolveExtraBuildInputs(raw: unknown): ExtraBuildInputs {
  const rejected: RejectedBuildInput[] = [];

  if (raw === undefined || raw === null) return { accepted: [], rejected };

  if (!Array.isArray(raw)) {
    return {
      accepted: [],
      rejected: [{ value: describeBuildInput(raw), reason: 'it is not an array of paths' }],
    };
  }

  // Seeded with the kit's own directories: an entry that repeats one of them (or sits under
  // it) is already covered, and hashing it twice would only slow the walk down.
  const seen = new Set<string>(BUILD_SOURCE_DIRS);
  const accepted: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') {
      rejected.push({ value: describeBuildInput(entry), reason: 'it is not a string' });
      continue;
    }

    const verdict = vetBuildInput(entry);
    if (!verdict.ok) {
      rejected.push({ value: describeBuildInput(entry), reason: verdict.reason });
      continue;
    }

    const covered = [...seen].some(
      (known) => verdict.path === known || verdict.path.startsWith(`${known}/`)
    );
    if (covered) {
      rejected.push({
        value: describeBuildInput(entry),
        reason: 'the stamp already covers it',
      });
      continue;
    }

    seen.add(verdict.path);
    accepted.push(verdict.path);
  }

  return { accepted: accepted.sort(), rejected };
}

/**
 * Read `package.json#e2eBuildInputs`. Resolved against `process.cwd()` — the same root
 * `collectBuildSources` resolves every input against, so the key is read from the very
 * project whose files are about to be hashed.
 *
 * An unreadable or malformed `package.json` yields no inputs rather than an error: this is
 * an optional extension point, and the build decision has to survive without it.
 *
 * Exported so a test can exercise it with an injected `fs` (E2E-006) — the tests must never
 * read the real `package.json` of whatever project runs them.
 */
export function readExtraBuildInputs(): ExtraBuildInputs {
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
    return resolveExtraBuildInputs(pkg[EXTRA_BUILD_INPUTS_KEY]);
  } catch {
    return { accepted: [], rejected: [] };
  }
}

/**
 * Root files that feed the build. Listed as alternatives (both lockfile flavours, both
 * config extensions) because a derivative may ship any of them and none is guaranteed —
 * an absent one is simply skipped.
 */
export const BUILD_SOURCE_FILES = [
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'tsconfig.json',
  'postcss.config.mjs',
  'postcss.config.js',
  'postcss.config.cjs',
  'postcss.config.ts',
  'tailwind.config.ts',
  'tailwind.config.js',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
  'components.json',
  'middleware.ts', // pre-Next-16 derivatives; this kit's equivalent is src/proxy.ts
  'instrumentation.ts',
  'instrumentation-client.ts',
  'sentry.server.config.ts',
  'sentry.edge.config.ts',
  'sentry.client.config.ts',
  // The env chain `next build` loads, in Next's own PRECEDENCE order (NODE_ENV=production):
  // `.env.production.local` → `.env.local` → `.env.production` → `.env`. All four are covered:
  // the three here by content digest, and `.env.local` — the one file guaranteed to hold
  // secrets — as a hash of its whole contents in `computeBuildStamp`, never as a path in this
  // list. `.env.development*` is not in the chain of a production build, so it is not here.
  //
  // The highest-precedence one used to be missing, which is the failure this mechanism cannot
  // afford (E2E-007): not an extra rebuild, but a run that goes GREEN against a build whose
  // baked `NEXT_PUBLIC_*` came from a file that has since changed.
  '.env.production.local',
  '.env.production',
  '.env',
] as const;
