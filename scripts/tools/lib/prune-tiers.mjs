/**
 * Reader of `.claude/policy/prune-tiers.json` — which kit paths a pruned repo shares with its
 * collaborators and which stay local to the members (`factory prune`).
 *
 * ONE classification rule, used by everything that has to agree on it: the pre-commit guard
 * (`scripts/tools/prune-guard.mjs`), the shape check in skill-lint, the Factory's
 * classification test, and — as a twin copy, because the published CLI cannot import repo
 * code — `cli/src/lib/prune-tiers.ts` (`cli/tests/unit/prune-tiers-parity.test.ts` keeps the
 * two together).
 *
 * The rule:
 *   - an entry is a path pattern; a trailing `/` names a directory (it matches everything
 *     below it), otherwise it names one file; `*` matches within a single segment;
 *   - the entry with the MOST segments that matches a path decides it (`restrict` or
 *     `share`); none → `unclassified`; a `restrict` and a `share` tied at the same depth →
 *     `ambiguous` (the shape check rejects the pair before it can happen at runtime).
 *
 * Plain-node `.mjs` on purpose: the shipped pre-commit hook runs it by path on derivatives,
 * where `tsx` is a dev-owned dependency the kit cannot assume.
 */

/** Repo-relative path of the registry. */
export const PRUNE_TIERS_PATH = '.claude/policy/prune-tiers.json';

/** Repo-relative path of the per-repo switch written by `factory prune prepare`. */
export const PRUNE_MARKER_PATH = '.timekast/prune.json';

/**
 * @typedef {{ description?: string, restrict: string[], share: string[] }} PruneTier
 * @typedef {{ tiers: Record<string, PruneTier> }} PruneTiers
 * @typedef {'restrict' | 'share' | 'unclassified' | 'ambiguous'} PruneClass
 */

/** @param {string} entry */
function segmentsOf(entry) {
  return entry.replace(/\/$/, '').split('/');
}

/** @param {string} pattern @param {string} segment */
function segmentMatches(pattern, segment) {
  if (!pattern.includes('*')) return pattern === segment;
  const rx = new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`
  );
  return rx.test(segment);
}

/**
 * Does `entry` match `relPath`? A directory entry matches anything strictly below it; a file
 * entry matches exactly that path.
 *
 * @param {string} entry @param {string} relPath
 */
export function entryMatches(entry, relPath) {
  const isDir = entry.endsWith('/');
  const want = segmentsOf(entry);
  const have = relPath.split('/');
  if (isDir ? have.length <= want.length : have.length !== want.length) return false;
  return want.every((pattern, i) => segmentMatches(pattern, have[i]));
}

/**
 * Classify one repo-relative path (POSIX separators) under a tier.
 *
 * @param {PruneTier} tier @param {string} relPath
 * @returns {PruneClass}
 */
export function classifyPath(tier, relPath) {
  let bestDepth = -1;
  /** @type {Set<'restrict' | 'share'>} */
  let kinds = new Set();
  for (const kind of /** @type {const} */ (['restrict', 'share'])) {
    for (const entry of tier[kind]) {
      if (!entryMatches(entry, relPath)) continue;
      const depth = segmentsOf(entry).length;
      if (depth > bestDepth) {
        bestDepth = depth;
        kinds = new Set([kind]);
      } else if (depth === bestDepth) {
        kinds.add(kind);
      }
    }
  }
  if (kinds.size === 0) return 'unclassified';
  if (kinds.size > 1) return 'ambiguous';
  return [...kinds][0];
}

/** @param {PruneTier} tier @param {string} relPath */
export function isRestricted(tier, relPath) {
  return classifyPath(tier, relPath) === 'restrict';
}

/**
 * Form errors of a parsed registry (empty array = valid). Form only: whether every kit path
 * is classified is the Factory's classification test, not this.
 *
 * @param {unknown} data
 * @returns {string[]}
 */
export function validatePruneTiers(data) {
  const errors = [];
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return ['(root) — must be an object'];
  }
  const tiers = /** @type {Record<string, unknown>} */ (data).tiers;
  if (typeof tiers !== 'object' || tiers === null || Array.isArray(tiers)) {
    return ['tiers — must be an object of named tiers'];
  }
  if (Object.keys(tiers).length === 0) errors.push('tiers — must declare at least one tier');
  for (const [name, raw] of Object.entries(tiers)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      errors.push(`tiers.${name} — the tier name must be kebab-case`);
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`tiers.${name} — must be an object`);
      continue;
    }
    const tier = /** @type {Record<string, unknown>} */ (raw);
    for (const key of Object.keys(tier)) {
      if (!['description', 'restrict', 'share'].includes(key)) {
        errors.push(`tiers.${name}.${key} — unknown key (allowed: description, restrict, share)`);
      }
    }
    for (const kind of ['restrict', 'share']) {
      const list = tier[kind];
      if (!Array.isArray(list) || list.length === 0) {
        errors.push(`tiers.${name}.${kind} — must be a non-empty array of path patterns`);
        continue;
      }
      list.forEach((entry, i) => {
        if (typeof entry !== 'string' || entry.trim() !== entry || entry === '') {
          errors.push(`tiers.${name}.${kind}[${i}] — must be a non-empty string without surrounding spaces`);
          return;
        }
        if (entry.startsWith('/') || entry.includes('\\') || entry.includes('//')) {
          errors.push(`tiers.${name}.${kind}[${i}] — "${entry}" must be repo-relative, POSIX`);
        }
        if (/[?[\]{}!]/.test(entry) || entry.includes('**')) {
          errors.push(
            `tiers.${name}.${kind}[${i}] — "${entry}" may only use \`*\` within one segment`
          );
        }
        if (segmentsOf(entry).some((seg) => seg === '' || seg === '.' || seg === '..')) {
          errors.push(`tiers.${name}.${kind}[${i}] — "${entry}" has an empty or relative segment`);
        }
      });
    }
    if (!Array.isArray(tier.restrict) || !Array.isArray(tier.share)) continue;
    const restrict = /** @type {string[]} */ (tier.restrict);
    const share = /** @type {string[]} */ (tier.share);

    const all = [...restrict, ...share];
    const dupes = all.filter((e, i) => all.indexOf(e) !== i);
    for (const dupe of new Set(dupes)) {
      errors.push(`tiers.${name} — "${dupe}" is listed more than once`);
    }

    for (const entry of share) {
      for (const dir of restrict.filter((r) => r.endsWith('/'))) {
        if (!entry.startsWith(dir)) continue;
        // `.gitignore` cannot re-include anything below an ignored directory, so the block
        // ignores the directory's CHILDREN (`/dir/*`) and re-includes the share entry — which
        // only works for a direct child.
        if (segmentsOf(entry).length !== segmentsOf(dir).length + 1) {
          errors.push(
            `tiers.${name}.share — "${entry}" sits more than one level below the restricted ` +
              `directory "${dir}"; a re-include only works for a direct child`
          );
        }
      }
    }
    for (const entry of restrict) {
      for (const dir of restrict.filter((r) => r !== entry && r.endsWith('/'))) {
        if (entry.startsWith(dir)) {
          errors.push(
            `tiers.${name}.restrict — "${entry}" is already covered by "${dir}"; drop one`
          );
        }
      }
    }
  }
  return errors;
}

/**
 * The `.gitignore` lines of a tier, WITHOUT the managed-block markers (the caller wraps them).
 * Every restricted directory that has shared children ignores its children (`/dir/*`) and
 * re-includes them right after (`!/dir/child/`); a directory without shared children, and a
 * restricted file, is ignored whole. Entries are emitted shallowest first so a deeper rule
 * always comes after the one it refines (`.gitignore` is last-match-wins).
 *
 * @param {PruneTier} tier
 * @returns {string[]}
 */
export function gitignoreLines(tier) {
  const depth = (/** @type {string} */ e) => segmentsOf(e).length;
  const ordered = [...tier.restrict].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  /** @type {string[]} */
  const lines = [];
  for (const entry of ordered) {
    const children = entry.endsWith('/')
      ? tier.share.filter((s) => s.startsWith(entry)).sort()
      : [];
    if (children.length === 0) {
      lines.push(`/${entry}`);
      continue;
    }
    lines.push(`/${entry}*`);
    for (const child of children) lines.push(`!/${child}`);
  }
  return lines;
}
