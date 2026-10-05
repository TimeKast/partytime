/**
 * Generate INVENTORY.md - Catalog of starter kit components
 *
 * Usage: pnpm generate:inventory
 *
 * This script scans the codebase and generates a markdown inventory
 * of all components, hooks, utilities, dependencies, and routes
 * for AI agent reference.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { formatGeneratedMarkdown } from './lib/format-generated-markdown';
import { createSkipChannel, docHeaderNote } from './lib/parse-skip';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DirEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

type Readdir = (dir: string) => DirEntry[];
type DirExists = (p: string) => boolean;

interface ScanDeps {
  readdir?: Readdir;
  dirExists?: DirExists;
}

interface ScanTarget {
  path: string;
  category: string;
  pattern?: RegExp;
}

/** What a directory walk found: its scan targets, plus where it had to stop. */
export interface DirDiscovery {
  targets: ScanTarget[];
  skips: string[];
}

/** What one scanned dir yielded: its entries, plus what could not be read. */
export interface ScanResult {
  items: string[];
  /** Ready-to-render lines for the aggregated parse-skip list. */
  skips: string[];
}

interface Route {
  route: string;
  file: string;
  type: 'page' | 'api';
}

// Curated lib scan targets: the NESTED paths and the labels worth naming by hand.
// This is no longer the whole list — every other top-level dir under src/lib/ is
// discovered dynamically by `discoverLibDirs()` below.
const CURATED_LIB_DIRS: ScanTarget[] = [
  { path: 'lib/hooks', category: 'Hooks' },
  { path: 'lib/auth', category: 'Auth Utilities' },
  { path: 'lib/db/schema', category: 'Database Schema' },
  { path: 'lib/email/templates', category: 'Email Templates' },
  { path: 'lib/utils', category: 'Utilities' },
  { path: 'lib/pwa', category: 'PWA Utilities' },
];

/**
 * Top-level dirs under src/lib/ that this catalog deliberately does NOT list,
 * because another generated document owns them. Excluding is a decision; NOT
 * scanning by accident is a bug — which is the difference this list encodes.
 */
const LIB_DIRS_OWNED_ELSEWHERE: Record<string, string> = {
  actions: 'API.md — server actions are catalogued there',
  db: 'SCHEMA.md — the data model is catalogued there (lib/db/schema stays, curated above)',
};

/** This generator's omission channel — shared shape, see `lib/parse-skip.ts`. */
const { skipEntry, skipComment } = createSkipChannel('generate-inventory.ts', 'Ese directorio');

const DOC_HEADER_NOTE = docHeaderNote('generate-inventory.ts');

/**
 * How deep a discovery walk descends. This repo's deepest nesting is 2; the ceiling is
 * generous on purpose — it is a cycle backstop, not a policy on how projects may nest.
 */
const MAX_DIR_DEPTH = 6;

/** Curated section labels for known lib dirs; anything else gets `<Name> Utilities`. */
const LIB_CATEGORY_LABELS: Record<string, string> = {
  api: 'API Utilities',
  contexts: 'React Contexts',
  email: 'Email Utilities',
  invites: 'Invite Utilities',
  notifications: 'Notification Utilities',
  validations: 'Validation Schemas',
};

/** Section label for a lib dir: curated where it matters, humanized otherwise. */
export function humanizeLibCategory(dirName: string): string {
  return (
    LIB_CATEGORY_LABELS[dirName] ??
    `${dirName.charAt(0).toUpperCase()}${dirName.slice(1)} Utilities`
  );
}

/**
 * Discover every top-level dir under src/lib/ as a scan target, minus the ones a
 * sibling document owns and the ones already covered by a curated entry.
 *
 * Dynamic for the same reason `discoverComponentDirs` is: a fixed list cannot know
 * the dirs a derived project will add, and this catalog exists so nobody rebuilds
 * something that already exists (`SK.md §2.1`). The static list shipped with 6 of
 * this repo's 12 dirs — `api`, `contexts`, `email`, `invites`, `notifications` and
 * `validations` fell out of the catalog without a word. In a derived project a
 * fixed list does not just start incomplete, it gets worse over time.
 *
 * Recursive by the same reasoning: closing the decay at the top level only still let a
 * dir nested under a discovered one fall out silently. `src/lib/validations/admin/` was
 * the live case — one file, listed by no generated document at all.
 *
 * The exclusions are INHERITED, and that is the part worth testing: `actions` and `db`
 * are owned by sibling documents, so `actions/admin` and `db/queries` must not reappear
 * one level down wearing a different name. Excluding is a decision; not scanning by
 * accident is a bug — the recursion must not blur the two.
 *
 * `readdir`/`dirExists` are injectable for testing.
 */
/**
 * Walk a directory tree under `base`, emitting one scan target per directory found.
 *
 * Shared by the two discoveries on purpose. They differ in one thing — whether a
 * top-level name is owned by a sibling document — and everything else has to behave
 * identically: the depth guard, the way a cut is reported, the nested label shape. The
 * omission channel this file now carries exists because the SAME warning was
 * re-implemented per generator and drifted into four shapes; repeating that mistake one
 * function down would be a poor way to celebrate fixing it.
 *
 * @param base              Filesystem root to walk (e.g. `src/lib`).
 * @param prefix            Import-relative prefix for emitted paths (e.g. `lib`).
 * @param label             Builds the section label from the path segments.
 * @param opts.isExcludedAtTop  Consulted ONLY for top-level entries. Deeper levels never
 *                              reach it because the walk does not descend into an
 *                              excluded dir at all — that is what makes the exclusion
 *                              inherited rather than re-checked per level.
 * @param opts.alreadyListed    A path a curated entry already covers; not emitted twice,
 *                              but still descended into.
 */
function walkDirTree(
  base: string,
  prefix: string,
  label: (segments: string[]) => string,
  deps: ScanDeps = {},
  opts: {
    isExcludedAtTop?: (name: string) => boolean;
    alreadyListed?: (path: string) => boolean;
  } = {}
): DirDiscovery {
  const readdir = deps.readdir ?? ((d: string) => readdirSync(d, { withFileTypes: true }));
  const dirExists = deps.dirExists ?? existsSync;

  if (!dirExists(base)) return { targets: [], skips: [] };

  const targets: ScanTarget[] = [];
  const skips: string[] = [];

  const walk = (absDir: string, segments: string[]): void => {
    // Hard depth guard. A symlink that points back up its own tree makes an unbounded
    // walk run forever, and this generator runs on every pre-commit — a hang here blocks
    // the commit with no output to explain it. Cutting the descent is the safe failure;
    // cutting it SILENTLY is not, so the cut is reported like any other hole.
    if (segments.length >= MAX_DIR_DEPTH) {
      skips.push(
        skipEntry(
          `${prefix}/${segments.join('/')}`,
          absDir,
          `profundidad máxima (${MAX_DIR_DEPTH}) alcanzada — no se descendió más`
        )
      );
      return;
    }

    for (const entry of readdir(absDir).filter((e) => e.isDirectory())) {
      if (segments.length === 0 && opts.isExcludedAtTop?.(entry.name)) continue;

      const nextSegments = [...segments, entry.name];
      const path = `${prefix}/${nextSegments.join('/')}`;
      if (!opts.alreadyListed?.(path)) {
        targets.push({ path, category: label(nextSegments) });
      }
      walk(`${absDir}/${entry.name}`, nextSegments);
    }
  };

  walk(base, []);
  return { targets: targets.sort((a, b) => a.path.localeCompare(b.path)), skips };
}

export function discoverLibDirs(deps: ScanDeps = {}): DirDiscovery {
  const curated = new Set(CURATED_LIB_DIRS.map((t) => t.path));
  return walkDirTree('src/lib', 'lib', libCategoryLabel, deps, {
    isExcludedAtTop: (name) => name in LIB_DIRS_OWNED_ELSEWHERE,
    alreadyListed: (path) => curated.has(path),
  });
}

/**
 * Section label for a lib target: the curated/humanized name of its top-level dir, then
 * the nested segments appended so two `admin/` dirs under different parents cannot
 * collapse into the same heading.
 */
export function libCategoryLabel(segments: string[]): string {
  const [top, ...rest] = segments;
  const head = humanizeLibCategory(top);
  if (rest.length === 0) return head;
  const tail = rest.map((s) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`).join(' / ');
  return `${head} / ${tail}`;
}

const libDiscovery = discoverLibDirs();

export const LIB_DIRS_TO_SCAN: ScanTarget[] = [...CURATED_LIB_DIRS, ...libDiscovery.targets];

/** Where the discovery walk had to stop — surfaced in the document, not swallowed here. */
export const LIB_DISCOVERY_SKIPS: string[] = libDiscovery.skips;

// Curated section labels for known component dirs. Any OTHER dir under
// src/components/ is discovered dynamically and gets a humanized label — so a new
// component dir can never fall out of the catalog silently (the old static-
// allowlist bug that dropped `admin`/`settings`).
const COMPONENT_CATEGORY_LABELS: Record<string, string> = {
  ui: 'UI Primitives (shadcn)',
  common: 'Common Components',
  layout: 'Layout Components',
  form: 'Form Components',
  dashboard: 'Dashboard Components',
  auth: 'Auth Components',
  pwa: 'PWA Components',
  branding: 'Branding Components',
  providers: 'Providers',
  notifications: 'Notification Components',
};

/**
 * Humanize a component dir name into a section label. Known dirs use the curated
 * label; unknown dirs (e.g. `admin`, `settings`) get `<Name> Components`.
 */
export function humanizeComponentCategory(dirName: string): string {
  return (
    COMPONENT_CATEGORY_LABELS[dirName] ??
    `${dirName.charAt(0).toUpperCase()}${dirName.slice(1)} Components`
  );
}

/**
 * Section label for a component target: the curated/humanized name of its top-level dir,
 * then the nested segments appended so two `tables/` dirs under different parents cannot
 * collapse into the same heading.
 */
export function componentCategoryLabel(segments: string[]): string {
  const [top, ...rest] = segments;
  const head = humanizeComponentCategory(top);
  if (rest.length === 0) return head;
  const tail = rest.map((x) => `${x.charAt(0).toUpperCase()}${x.slice(1)}`).join(' / ');
  return `${head} / ${tail}`;
}

/**
 * Discover every subdirectory under src/components/ as a scan target, at ANY depth.
 * Dynamic by design: a new component dir is picked up automatically instead of silently
 * missing from the catalog.
 *
 * Recursive for the same reason `discoverLibDirs` is, and fixed in the same pass: reading
 * one level meant a dir nested under a discovered one fell out with no trace. This repo
 * has no such dir today, so there is no live case here — but a derived project that
 * groups, say, `components/admin/tables/`, would lose it silently, and the catalog exists
 * precisely so nobody rebuilds what already exists.
 *
 * `readdir`/`dirExists` are injectable for testing.
 */
export function discoverComponentDirs(deps: ScanDeps = {}): DirDiscovery {
  return walkDirTree('src/components', 'components', componentCategoryLabel, deps);
}

/**
 * Scan a directory for reusable TypeScript/TSX modules (skips index barrels and
 * co-located tests/specs/stories). `readdir`/`dirExists` are injectable for testing.
 */
export function scanDir(dir: string, pattern?: RegExp, deps: ScanDeps = {}): ScanResult {
  const readdir = deps.readdir ?? ((d: string) => readdirSync(d, { withFileTypes: true }));
  const dirExists = deps.dirExists ?? existsSync;

  if (!dirExists(dir)) return { items: [], skips: [] };

  let entries: DirEntry[];
  try {
    entries = readdir(dir);
  } catch (e) {
    // A dir that exists and cannot be read used to take the WHOLE generator down with it
    // (no try/catch anywhere on this path), so INVENTORY.md simply did not regenerate and
    // the catalog silently kept serving yesterday's truth. One unreadable dir is now one
    // declared hole in an otherwise current document.
    const reason = e instanceof Error ? e.message : String(e);
    return { items: [], skips: [skipEntry(dir, dir, `no se pudo leer — ${reason}`)] };
  }

  const items = entries
    .filter((f) => f.isFile() && (f.name.endsWith('.ts') || f.name.endsWith('.tsx')))
    .filter((f) => !f.name.startsWith('index'))
    // Skip co-located tests/specs/stories — they are not reusable building blocks
    .filter((f) => !/\.(test|spec|stories)\.(ts|tsx)$/.test(f.name))
    .filter((f) => !pattern || pattern.test(f.name))
    .map((f) => basename(f.name, f.name.endsWith('.tsx') ? '.tsx' : '.ts'))
    .sort();

  return { items, skips: [] };
}

/**
 * Get dependencies from package.json
 */
function getDependencies() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  const deps = Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
    name,
    version: (version as string).replace(/^\^|~/, ''),
  }));
  return deps.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Make free text safe inside one Markdown table cell: a `|` would split the row (GFM reads it
 * as a cell boundary even inside a code span) and a newline would end it. Only `\|` is
 * unescaped inside a code span, so no other character is touched. Apply AFTER truncating,
 * so the cut never lands between the backslash and the pipe.
 */
export function tableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Get npm scripts from package.json
 */
function getScripts() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  return Object.entries(pkg.scripts || {}).map(([name, command]) => ({
    name,
    command:
      (command as string).length > 50 ? (command as string).substring(0, 47) + '...' : command,
  }));
}

/**
 * Scan app directory for routes
 */
function scanRoutes(dir: string, prefix = ''): Route[] {
  if (!existsSync(dir)) return [];

  const routes: Route[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Handle route groups like (auth), (dashboard)
      let routeSegment = entry.name;
      if (entry.name.startsWith('(') && entry.name.endsWith(')')) {
        routeSegment = ''; // Route groups don't add to URL
      }

      const newPrefix = routeSegment ? `${prefix}/${routeSegment}` : prefix;
      routes.push(...scanRoutes(fullPath, newPrefix));
    } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      routes.push({
        route: prefix || '/',
        file: fullPath,
        type: 'page',
      });
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      routes.push({
        route: prefix || '/',
        file: fullPath,
        type: 'api',
      });
    }
  }

  return routes;
}

/**
 * Generate the inventory markdown content
 */
function generateInventory(): string {
  let md = `# 📦 INVENTORY

> **Auto-generated** — Run \`pnpm generate:inventory\` to update
> **Regla:** SIEMPRE consultar antes de crear algo nuevo.

${DOC_HEADER_NOTE}

---

`;

  let totalItems = 0;

  // ============ DEPENDENCIES SECTION ============
  const deps = getDependencies();
  if (deps.length > 0) {
    md += `## 📚 Dependencies\n\n`;
    md += `| Package | Version |\n`;
    md += `|---------|--------|\n`;

    for (const { name, version } of deps) {
      md += `| ${name} | ${version} |\n`;
    }

    md += '\n---\n\n';
    totalItems += deps.length;
  }

  // ============ SCRIPTS SECTION ============
  const scripts = getScripts();
  if (scripts.length > 0) {
    md += `## 🛠️ NPM Scripts\n\n`;
    md += `| Command | Script |\n`;
    md += `|---------|--------|\n`;

    for (const { name, command } of scripts) {
      md += `| \`pnpm ${tableCell(name)}\` | \`${tableCell(String(command))}\` |\n`;
    }

    md += '\n---\n\n';
    totalItems += scripts.length;
  }

  // ============ ROUTES SECTION ============
  const pageRoutes = scanRoutes('src/app').filter((r) => r.type === 'page');
  const apiRoutes = scanRoutes('src/app').filter((r) => r.type === 'api');

  if (pageRoutes.length > 0) {
    md += `## 🛣️ Page Routes\n\n`;
    md += `| Route | File |\n`;
    md += `|-------|------|\n`;

    for (const { route, file } of pageRoutes.sort((a, b) => a.route.localeCompare(b.route))) {
      md += `| ${route} | \`${file}\` |\n`;
    }

    md += '\n---\n\n';
    totalItems += pageRoutes.length;
  }

  if (apiRoutes.length > 0) {
    md += `## 🔌 API Routes\n\n`;
    md += `| Endpoint | File |\n`;
    md += `|----------|------|\n`;

    for (const { route, file } of apiRoutes.sort((a, b) => a.route.localeCompare(b.route))) {
      md += `| ${route} | \`${file}\` |\n`;
    }

    md += '\n---\n\n';
    totalItems += apiRoutes.length;
  }

  // ============ COMPONENTS + LIB SECTION ============
  // Component dirs are discovered dynamically (no static allowlist to fall out
  // of); lib dirs mix curated nested entries with dynamic discovery. `path` is import-relative (resolves
  // under `@/` → `src/`); the fs scan adds the `src/` prefix, the rendered import
  // keeps `@/${path}`.
  const componentDiscovery = discoverComponentDirs();
  const scanTargets = [...componentDiscovery.targets, ...LIB_DIRS_TO_SCAN];
  const allSkips: string[] = [...componentDiscovery.skips, ...LIB_DISCOVERY_SKIPS];
  let componentUtilCount = 0;

  for (const { path, category, pattern } of scanTargets) {
    const { items, skips } = scanDir(join('src', path), pattern);
    allSkips.push(...skips);
    // An unreadable dir yields no items but DOES yield a skip: bailing on `items.length`
    // alone would drop the very hole this channel exists to show.
    if (items.length === 0 && skips.length === 0) continue;

    componentUtilCount += items.length;

    md += `## ${category}\n\n`;
    md += `📁 \`${path}/\`\n\n`;
    md += `| Name | Import |\n`;
    md += `|------|--------|\n`;

    for (const item of items) {
      md += `| ${item} | \`@/${path}/${item}\` |\n`;
    }

    md += '\n';
    for (const skip of skips) md += skipComment(path, `src/${path}`, skip);
    md += '---\n\n';
  }

  totalItems += componentUtilCount;

  // ============ SUMMARY SECTION ============
  md += `## 📊 Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Dependencies | ${deps.length} |\n`;
  md += `| NPM Scripts | ${scripts.length} |\n`;
  md += `| Page Routes | ${pageRoutes.length} |\n`;
  md += `| API Routes | ${apiRoutes.length} |\n`;
  md += `| Components & Utils | ${componentUtilCount} |\n`;
  md += `| **Total items** | **${totalItems}** |\n`;
  md += `| Parse-skips | ${allSkips.length} |\n\n`;
  if (allSkips.length) {
    md += `> ⚠️ ${allSkips.length} parse-skip(s):\n`;
    for (const sk of allSkips) md += `> - ${sk}\n`;
    md += '\n';
  }
  md += `---\n\n_Generated by \`scripts/tools/generate-inventory.ts\`_\n`;

  return md;
}

// Main execution (only when run directly, not when imported for tests)
async function main(): Promise<void> {
  const output = generateInventory();
  const outputPath = 'project/reference/INVENTORY.md';

  mkdirSync(dirname(outputPath), { recursive: true });
  // Formatted before writing: the pre-commit hook stages this file RAW and lint-staged only
  // sees what was staged BEFORE the regeneration, so nothing on either path would format it.
  // Kit-owned output has to satisfy the kit's own `prettier --check` — here and in every
  // derivative it travels to, where the file is not the developer's to fix.
  writeFileSync(outputPath, await formatGeneratedMarkdown(output, outputPath));
  console.log(`✅ ${outputPath} generated`);
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry === import.meta.url) {
  // Never block a commit under pre-commit `set -e` — degrade to a marker, exit 0.

  main()
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        const p = 'project/reference/INVENTORY.md';
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(
          p,
          `# 📦 INVENTORY\n\n<!-- generator-error: ${msg} — ` +
            `generate-inventory.ts falló. Revisa el script o avisa al equipo del kit. -->\n`
        );
      } catch {
        /* swallow — never block the commit */
      }
      console.error(`⚠️  generate-inventory.ts degraded (${msg}) — exit 0`);
    })
    .finally(() => process.exit(0));
}
