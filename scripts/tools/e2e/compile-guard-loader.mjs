/**
 * ESM half of the compile-guard stub: a `resolve` hook that answers `server-only` and
 * `client-only` with an empty module instead of letting Node reach the real package.
 *
 * Registered by `compile-guard-init.mjs`. It HAS to be its own file: `register()` takes a
 * module SPECIFIER, never a set of functions, because the hooks are loaded into a separate
 * module registry from the code that registers them. Merging the two files back into one
 * would make `register()` unable to name its own hooks.
 *
 * Only `resolve` is implemented, and there is deliberately no `load`: short-circuiting to a
 * `data:` URL whose source is empty ends the resolution there, and Node loads that URL by
 * itself. That is also what makes the stub work when the package is NOT INSTALLED at all —
 * the kit's own tree has no `server-only` in `node_modules/`, so a hook that merely rewrote
 * the path would still die on resolution.
 */

/**
 * The two compile-time guards Next.js ships. Inside a bundler they are directives; in plain
 * Node they are packages whose entry point THROWS, which is the whole reason this exists.
 * Kept in sync by hand with the same set in `compile-guard-init.mjs` — two tiny literals in
 * sibling files beat a shared module that both halves would have to import at boot.
 */
const STUBBED_MODULES = new Set(['server-only', 'client-only']);

export function resolve(specifier, context, nextResolve) {
  if (STUBBED_MODULES.has(specifier)) {
    // `shortCircuit: true` marks this hook as the final answer, so the default resolver
    // never runs and the missing-package case never surfaces.
    return { shortCircuit: true, url: 'data:text/javascript,' };
  }
  return nextResolve(specifier, context);
}
