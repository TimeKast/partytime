import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * Shared "is this script running as the CLI entry point, or was it merely imported (e.g. by a
 * test)?" guard.
 *
 * WHY THIS EXISTS. Two kit scripts (`invite-admin.ts`, `setup-e2e.ts`) used to answer that
 * question with a raw interpolation — `import.meta.url === \`file://${process.argv[1]}\`` — and
 * that comparison never matches in a checkout whose path contains a space or an accented
 * character (`~/Mis Proyectos/…`, `~/Documentos/piñata/…`): `import.meta.url` percent-encodes
 * those bytes, the interpolated string does not, and the script silently exits 0 having run
 * nothing. The fix already exists, tested, in the kit's `generate-*.ts` family
 * (`generate-schema.ts:702` and siblings): `pathToFileURL(resolve(argv1)).href === moduleUrl`.
 * This file is that same expression, extracted once so both scripts (and this test) share it
 * instead of re-deriving it.
 *
 * THE CONDITIONAL IS NOT DECORATION. `resolve(undefined)` throws `ERR_INVALID_ARG_TYPE` — Node's
 * `path.resolve` requires a string. When `process.argv[1]` is absent (an unusual invocation, but
 * one this guard must survive without throwing), the function must short-circuit to `false`
 * BEFORE calling `resolve`/`pathToFileURL` at all.
 *
 * SYMLINKS ARE THE SAME CLASS OF FAILURE, A DIFFERENT TRIGGER. Node resolves the running module
 * by its REAL path, while `process.argv[1]` keeps whatever symlink was invoked (a checkout under
 * a symlinked parent, or `/tmp` on macOS, which is itself a symlink to `/private/tmp`) — so the
 * plain-string comparison never matches and the script exits 0 having run nothing, same symptom
 * as the space/accent bug above. `realpathSync` resolves both sides to their real path before
 * comparing; it is wrapped in `try/catch` because it requires the path to exist on disk, which a
 * caller's synthetic test fixture may not — that case falls back to the plain comparison.
 *
 * @param {string} moduleUrl - the caller's `import.meta.url`.
 * @param {string | undefined} argv1 - the caller's `process.argv[1]`.
 * @returns {boolean}
 */
export function isMainModule(moduleUrl, argv1) {
  if (!argv1) return false;

  const argvUrl = pathToFileURL(resolve(argv1)).href;

  try {
    const realArgvUrl = pathToFileURL(realpathSync(resolve(argv1))).href;
    const realModuleUrl = pathToFileURL(realpathSync(fileURLToPath(moduleUrl))).href;
    return realArgvUrl === realModuleUrl;
  } catch {
    return argvUrl === moduleUrl;
  }
}
