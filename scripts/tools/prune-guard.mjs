#!/usr/bin/env node
/**
 * Pre-commit guard of a pruned repo (`factory prune`): refuse a commit that would put a path
 * the tier keeps local — a workflow, an agent, a kit doc — back into the repository.
 *
 * The `.gitignore` block already keeps those paths out of a normal `git add`; this catches
 * the ways around it (`git add -f`, a path tracked before the prune, an edited `.gitignore`).
 * That is why the patterns come from `.claude/policy/prune-tiers.json`, never from
 * `.gitignore`. A PR that edits the registry itself is stopped by `/integrate`, which rejects
 * any change under `.claude/` before checking it out.
 *
 * Off unless the repo carries `.timekast/prune.json` (the hook also checks it before calling
 * this): a repo that was never pruned commits exactly as before. Deletions always pass —
 * untracking a restricted path is the point.
 *
 * Exit: 0 = nothing restricted staged (or not a pruned repo) · 1 = restricted paths staged, or
 * the switch names a tier the registry cannot provide (fails closed: the guard exists to
 * protect, so a broken configuration must not wave commits through).
 *
 * Plain-node `.mjs`: the shipped hook runs it by path, where `tsx` may not exist. Full profile
 * only — the `core` profile ships neither `.husky/` nor this script.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isMainModule } from './lib/is-main-module.mjs';
import {
  PRUNE_MARKER_PATH,
  PRUNE_TIERS_PATH,
  isRestricted,
  validatePruneTiers,
} from './lib/prune-tiers.mjs';

/**
 * @param {string} root
 * @returns {{ ok: true, offenders: string[] } | { ok: false, error: string }}
 */
export function checkStaged(root) {
  const markerPath = join(root, PRUNE_MARKER_PATH);
  if (!existsSync(markerPath)) return { ok: true, offenders: [] };

  let tierName;
  try {
    tierName = JSON.parse(readFileSync(markerPath, 'utf8')).tier;
  } catch {
    return { ok: false, error: `${PRUNE_MARKER_PATH} is not valid JSON` };
  }
  let registry;
  try {
    registry = JSON.parse(readFileSync(join(root, PRUNE_TIERS_PATH), 'utf8'));
  } catch {
    return { ok: false, error: `${PRUNE_TIERS_PATH} is missing or not valid JSON` };
  }
  const errors = validatePruneTiers(registry);
  if (errors.length > 0) {
    return { ok: false, error: `${PRUNE_TIERS_PATH} is malformed: ${errors.join('; ')}` };
  }
  const tier = registry.tiers[tierName];
  if (!tier) {
    return { ok: false, error: `${PRUNE_MARKER_PATH} names tier "${tierName}", absent from ${PRUNE_TIERS_PATH}` };
  }

  // `--no-renames`: a rename INTO a restricted path must show its destination as an addition.
  const staged = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=ACMRT', '-z'],
    { cwd: root, encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean);
  return { ok: true, offenders: staged.filter((p) => isRestricted(tier, p)) };
}

function main() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const result = checkStaged(root);
  if (!result.ok) {
    console.error(`✖ prune-guard — ${result.error}. Commit refused (the guard fails closed).`);
    process.exit(1);
  }
  if (result.offenders.length === 0) return;
  console.error(
    '✖ prune-guard — this repo is shared with collaborators, and these paths are kept local ' +
      'to the members of the org (.claude/policy/prune-tiers.json):'
  );
  for (const p of result.offenders) console.error(`    ${p}`);
  console.error(
    '  Unstage them (`git restore --staged <path>`, or `git rm --cached <path>` if they were ' +
      'tracked) and commit again.'
  );
  process.exit(1);
}

if (isMainModule(import.meta.url, process.argv[1])) main();
