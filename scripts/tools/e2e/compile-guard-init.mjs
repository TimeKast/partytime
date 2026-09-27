/**
 * Neutralize Next.js's compile-time guards (`server-only`, `client-only`) for a process that
 * runs OUTSIDE the bundler — i.e. Playwright.
 *
 * THE FAILURE THIS REMOVES. `server-only` and `client-only` are guards enforced at BUILD time:
 * their whole job is to throw when a module is pulled into the wrong graph. Outside a bundler
 * nothing rewrites them, so importing one simply throws (or, when the package is not installed
 * at all — the kit's own case — fails to resolve). Playwright runs on plain Node, so ANY spec
 * that reaches a server-guarded module, however transitively (a spec → a fixture → a query
 * helper → `import 'server-only'`), dies while the spec is being LOADED, before a single test
 * runs. The report shows a file that "has no tests", never the import that killed it.
 *
 * HOW IT IS LOADED. `NODE_OPTIONS=--import=<this file>` is set by `scripts/tools/e2e-runner.ts`
 * on the Playwright spawn — see `compileGuardInitUrl` there for why it must be the RUNNER that
 * sets it and not `playwright.config.ts`.
 *
 * TWO HALVES, AND WHY THE SECOND IS NOT REDUNDANT:
 *
 *   1. ESM — a `resolve` hook registered through `register()`, in `compile-guard-loader.mjs`.
 *   2. CJS — a stub over `Module._load`. On Node < 22.15 the hooks installed by `register()`
 *      do NOT intercept `require()`, and Playwright transpiles specs to CommonJS, so an
 *      `import 'server-only'` becomes a `require('server-only')` that walks straight past the
 *      ESM loader. Dropping this half means the mechanism silently stops working on exactly
 *      the path Playwright actually uses.
 *
 * Returning an empty object/module is safe precisely because these packages have no runtime
 * behaviour to preserve: outside a bundler they are assertions, not implementations.
 */

import Module, { register } from 'node:module';

/** Kept in sync by hand with the same set in `compile-guard-loader.mjs`. */
const STUBBED_MODULES = new Set(['server-only', 'client-only']);

/**
 * Guard against installing the patch twice.
 *
 * MEASURED (Node 22.14): a repeated `--import` of the same URL — and of a spelling that
 * normalizes to it, e.g. an extra `./` segment — evaluates this file ONCE, so the supported
 * path never gets here twice. The guard covers what URL normalization cannot see: the file
 * reached through a symlinked checkout, or a second copy of it. Patching twice would in fact
 * be harmless (both layers short-circuit the same two specifiers), but a structural guard
 * beats an argument, and `Symbol.for` makes it hold across module registries too.
 */
const INSTALLED = Symbol.for('timekast.e2e.compile-guard-stub');

if (!globalThis[INSTALLED]) {
  globalThis[INSTALLED] = true;

  // ESM path.
  register(new URL('./compile-guard-loader.mjs', import.meta.url));

  // CJS path — see the header for why this is separate from the hook above.
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (STUBBED_MODULES.has(request)) return {};
    return originalLoad.call(this, request, ...rest);
  };
}
