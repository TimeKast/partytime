#!/usr/bin/env tsx
/**
 * Environment Variables Validator
 *
 * Validates required and optional environment variables against the Zod schema
 * declared in `src/lib/env.ts`. Exits with code 0 on success, !=0 on failure.
 *
 * Usage:
 *   pnpm env:check
 *
 * On failure, the error message lists the missing/invalid keys (Zod error
 * format from `getEnv()`).
 *
 * @see KIT-021 §A
 */

import { config } from 'dotenv';

// Load `.env.local` first (next.js convention) before importing env.ts so that
// `getEnv()`'s Zod schema sees the same vars Next.js sees at runtime.
config({ path: '.env.local' });

/**
 * Extension point — project-owned environment preflights.
 *
 * This file is kit-tracked: `factory update` refreshes it, so a derivative that
 * edits it forks a tracked file and pays a conflict on every update forever
 * (`CORE.md §5`). But a derivative WILL need checks of its own — an app with an
 * ops console needs its signing material present, a multi-provider app needs its
 * credentials coherent — and before this hook the only way to add one was to
 * edit this file. That is not a hypothetical: it happened, and the fork carried
 * three real security gates.
 *
 * The hook lives in `src/lib/env.ts` rather than a sibling script on purpose:
 * that module is **app code**, born frozen at `factory new` and owned by the
 * team, this script **already imports it**, and the checks belong next to the
 * schema they validate. A sibling file would only re-call functions that live
 * there anyway.
 *
 * **Contract.** Export an optional `getProjectEnvErrors` from `src/lib/env.ts`:
 *
 * ```ts
 * export function getProjectEnvErrors(env: Env): (string | null)[] {
 *   return [
 *     getMfaPostureError({ platformOpsHost: env.PLATFORM_OPS_HOST, ... }),
 *     getSigningMaterialError({ ... }),
 *   ];
 * }
 * ```
 *
 * Return a message per failed check and `null` for the ones that pass; the
 * first message fails the run with that exact text. Sync or async both work.
 *
 * **Keep each check pure and DB-free.** This runs from the CLI with no server
 * and no database — it reads the parsed env and nothing else. A check that
 * needs Neon belongs in a runtime guard, not here.
 *
 * **Absence is the normal case.** No export means no project preflights, and
 * that is not a warning: most derivatives never need one. Same shape as the
 * other extension points of the kit — present, it runs; absent, nothing
 * happens.
 */
async function runProjectPreflights(env: unknown): Promise<void> {
  const mod: Record<string, unknown> = await import('../../src/lib/env');
  const hook = mod.getProjectEnvErrors;
  if (typeof hook !== 'function') return;

  // Loose typing at the boundary is deliberate: the export is optional, so it
  // cannot be part of a type the kit declares. The contract is enforced here.
  const result: unknown = await (hook as (e: unknown) => unknown)(env);
  const errors = Array.isArray(result) ? result : [result];

  for (const err of errors) {
    if (typeof err === 'string' && err.length > 0) throw new Error(err);
  }
}

async function main(): Promise<void> {
  // Lazy import — env.ts runs the Zod parse on first `getEnv()` call.
  const { getEnv, getNextAuthSecret, validateAuthMethods } = await import('../../src/lib/env');

  try {
    // 1. Zod schema parse (catches type/format errors on declared vars)
    const env = getEnv();

    // 2. Strict checks for vars that the schema marks optional but are
    //    runtime-critical. These mirror what `auth.ts` requires server-side.
    getNextAuthSecret(); // throws if AUTH_SECRET / NEXTAUTH_SECRET missing
    validateAuthMethods(); // throws if no auth method available

    // 3. Project-owned preflights — the extension point (contract in the block
    //    comment above). Optional by construction: a derivative that never
    //    declares one behaves exactly as before. Runs LAST on purpose — a
    //    project check reads vars the kit's own steps just proved valid.
    await runProjectPreflights(env);

    console.log('✅ Environment OK — all required variables present and valid.');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('❌ Environment validation failed:\n');
    console.error(msg);
    process.exit(1);
  }
}

void main();
