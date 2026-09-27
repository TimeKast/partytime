/**
 * Generate HOOKS.md — Canonical registry of kit-shipped hooks, helpers, and
 * exported building blocks (action wrappers, DB helpers, form kit, UI wrappers).
 *
 * Usage: pnpm generate:hooks
 *
 * This is the SSOT skills anchor to when they need to reference a hook or
 * helper by name. See FX-004.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import { formatGeneratedMarkdown } from './lib/format-generated-markdown';
import { stripComments } from './lib/parse-balanced.mjs';
import { createSkipChannel, docHeaderNote } from './lib/parse-skip';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A scan target. Each category declares either:
 *   - `dir`   → scan a directory, parse per-file exports
 *   - `files` → explicit list of files to parse (barrels or single-purpose)
 *
 * `kind` filters what counts as an entry:
 *   - 'value'     → functions, consts, classes (skip types/interfaces)
 *   - 'component' → same, but hint output as React component
 *
 * `viaBarrel: true` means parse `export { A, B, type C }` statements from the
 * barrel file itself (used for form/index.ts where the barrel is authoritative).
 */
interface Category {
  label: string;
  dir?: string;
  files?: string[];
  importPrefix: string;
  exclude?: string[];
  viaBarrel?: boolean;
  kind: 'value' | 'component';
}

/** A parsed top-level named export. */
interface ExportEntry {
  name: string;
  kind: string;
}

/** A line that declares an export this parser could not attribute to any pattern. */
export interface UnrecognizedExport {
  /** A short, safe fragment of the offending line — enough for a reader to find it. */
  snippet: string;
  reason: string;
}

/**
 * What {@link parseExports} found: the exports it could read, AND the ones it could not.
 *
 * The second half is the point. This parser recognises five shapes; a line that declares
 * an export in any OTHER shape used to fall out of the loop with no trace, and HOOKS.md
 * rendered complete without it. A registry that skills are told to grep INSTEAD OF
 * inventing names (see the doc header) fails hardest exactly when it is silently short.
 */
export interface ExportDiscovery {
  entries: ExportEntry[];
  unrecognized: UnrecognizedExport[];
}

/** A rendered registry row. */
interface Row {
  name: string;
  kind: string;
  importPath: string;
  file: string;
}

// =============================================================================
// Scan targets — ordered for output
// =============================================================================
//
// Each category declares either:
//   - `dir`   → scan a directory, parse per-file exports
//   - `files` → explicit list of files to parse (barrels or single-purpose)
//
// `kind` filters what counts as an entry:
//   - 'value'     → functions, consts, classes (skip types/interfaces)
//   - 'component' → same, but hint output as React component
//
// `viaBarrel: true` means parse `export { A, B, type C }` statements from the
// barrel file itself (used for form/index.ts where the barrel is authoritative).

/**
 * Exported so a test can assert the scan list is WIRED — dropping a file from here leaves
 * every unit test green while the registry quietly goes short, which is exactly how
 * `auth.ts` stayed out of it.
 */
export const CATEGORIES: Category[] = [
  {
    label: 'Hooks',
    dir: 'src/lib/hooks',
    importPrefix: '@/lib/hooks',
    exclude: ['index.ts'],
    kind: 'value',
  },
  {
    label: 'Action Helpers',
    files: ['src/lib/actions/helpers.ts'],
    importPrefix: '@/lib/actions/helpers',
    kind: 'value',
  },
  {
    // Scoped to named modules, NOT the whole src/lib/auth dir. `auth.ts` is a large
    // NextAuth config and was left out for that reason — but it is also where
    // `export const { handlers, signIn, signOut, auth } = NextAuth({…})` lives, so the
    // exclusion kept `auth()` out of the very registry that exists to stop agents
    // inventing names for symbols the kit already ships. Its five exports are all
    // importable helpers; the config object itself exports nothing.
    label: 'Auth Helpers',
    files: ['src/lib/auth/auth.ts', 'src/lib/auth/permissions.ts', 'src/lib/auth/utils.ts'],
    importPrefix: '@/lib/auth',
    kind: 'value',
  },
  {
    label: 'DB Helpers',
    dir: 'src/lib/db/helpers',
    importPrefix: '@/lib/db/helpers',
    kind: 'value',
  },
  {
    label: 'DB Utils',
    dir: 'src/lib/db/utils',
    importPrefix: '@/lib/db/utils',
    kind: 'value',
  },
  {
    label: 'Form Kit',
    files: ['src/components/form/index.ts'],
    importPrefix: '@/components/form',
    viaBarrel: true,
    kind: 'value',
  },
  {
    label: 'Common Components',
    dir: 'src/components/common',
    importPrefix: '@/components/common',
    exclude: ['index.ts'],
    kind: 'component',
  },
  {
    label: 'UI Wrappers (kit-shipped)',
    files: [
      'src/components/ui/confirm-dialog.tsx',
      'src/components/ui/data-table.tsx',
      'src/components/ui/table-filter.tsx',
      'src/components/ui/table-extras.tsx',
    ],
    importPrefix: '@/components/ui',
    kind: 'component',
  },
  {
    label: 'Notification Helpers',
    files: ['src/lib/notifications/index.ts'],
    importPrefix: '@/lib/notifications',
    viaBarrel: true,
    kind: 'value',
  },
  {
    label: 'PWA Hooks',
    dir: 'src/lib/pwa',
    importPrefix: '@/lib/pwa',
    exclude: ['index.ts'],
    kind: 'value',
  },
  {
    label: 'Context Hooks',
    dir: 'src/lib/contexts',
    importPrefix: '@/lib/contexts',
    exclude: ['index.ts'],
    kind: 'value',
  },
  {
    label: 'ID Helpers',
    files: ['src/lib/utils/human-id.ts'],
    importPrefix: '@/lib/utils/human-id',
    kind: 'value',
  },
];

// =============================================================================
// Parsing
// =============================================================================

/** How much of an unparseable line goes into its marker — enough to find it, not a dump. */
const SNIPPET_MAX = 60;

/** This generator's omission channel — shared shape, see `lib/parse-skip.ts`. */
const { skipEntry, skipComment } = createSkipChannel('generate-hooks.ts', 'Ese export');

const DOC_HEADER_NOTE = docHeaderNote('generate-hooks.ts');

const BLOCK_PROBE = 'tk-block-open-probe';

/**
 * Does this line leave a block comment OPEN at its end?
 *
 * Asked by appending a probe on a NEW line and checking whether `stripComments` ate
 * it. The newline is what makes the answer precise: a line comment ends there, so the
 * probe survives; an unterminated block comment crosses it and swallows the probe.
 *
 * Verified against every neighbouring form — an apostrophe in JSX text, a quote in a
 * regex literal, and a block-comment opener written inside a string literal all answer
 * `false`, which is what keeps this from undoing the per-line stripping below.
 */
function opensBlockComment(line: string): boolean {
  return !stripComments(`${line}\n${BLOCK_PROBE}`).includes(BLOCK_PROBE);
}

/**
 * Extract top-level named exports from a single file's source text.
 *
 * Handles:
 *   export function foo(...)
 *   export async function foo(...)
 *   export const foo = ...
 *   export const { a, b } = f()   (destructured barrels — NextAuth's is the kit's own)
 *   export class Foo ...
 *   export { A, B, type C }  (types skipped)
 *   export {                 (multi-line barrels — Dialog/AlertDialog span many
 *     A, B, C,                lines; collapsed to one before the per-line scan)
 *   } from './x'
 *   export { // Section       (comments are dropped line by line before any pattern
 *     A, B }                   runs, so the name after them survives — and a `}`
 *                              written inside one no longer truncates the block)
 *
 * Returns entries like: { name, kind: 'function'|'const'|'class'|'reexport' }
 */
export function parseExports(source: string): ExportDiscovery {
  const entries: ExportEntry[] = [];
  const unrecognized: UnrecognizedExport[] = [];

  // Drop comments BEFORE any pattern runs, LINE BY LINE, with the kit's string-aware
  // scanner (the same primitive generate-schema and generate-api use).
  //
  // Why before: the block pattern below stops at the first `}`, so a `}` written
  // inside a comment (`A, // returns } sometimes`) ended the block early and the
  // fragment lost its closing brace — the whole block then matched nothing and every
  // name in it disappeared. Stripping first removes that `}` before the block is
  // ever delimited.
  //
  // 🔴 Why line by line and NOT over the whole source: an apostrophe in ordinary
  // text (`<p>don't panic</p>`) or a quote inside a regex literal (`/['"]/`) opens a
  // string the scanner never sees closed, so from that point on it stops recognising
  // comments — and the very bug this function was fixed for comes back, silently,
  // for every export below it. Both forms are legal and common in .tsx, which this
  // generator scans. Per line, an unbalanced quote can only affect its own line, and
  // `//` comments never span lines anyway.
  //
  // The neighbouring guard survives by construction, not by luck: a fully
  // commented-out line (`// export { x } from './y';`) is removed ENTIRELY, export
  // included, so it still produces no entries.
  //
  // A `/* */` that SPANS lines is carried across them explicitly, because per-line
  // stripping cannot see it: its middle lines would survive untouched. That is not
  // cosmetic — a whole export block commented out that way had its names published
  // as if they existed, which is the "parser that invents symbols" this issue
  // exists to prevent.
  //
  // Declared limit: a `//` sitting inside a multi-line template literal is stripped
  // as if it were a comment. Harmless here — the scan below only reads lines that
  // start with `export `, and such a line is not one.
  let inBlockComment = false;
  const decommented = source
    .split('\n')
    .map((raw) => {
      let line = raw;
      if (inBlockComment) {
        const end = line.indexOf('*/');
        if (end === -1) return '';
        inBlockComment = false;
        line = line.slice(end + 2);
      }
      const stripped = stripComments(line);
      if (opensBlockComment(line)) inBlockComment = true;
      return stripped;
    })
    .join('\n');

  // Collapse multi-line `export { ... }` blocks to a single line so the per-line
  // scan below sees them. Without this, barrels like Dialog.tsx / AlertDialog.tsx
  // (which open `export {` and close `}` many lines later) are silently dropped.
  const normalized = decommented.replace(/export\s*(?:const\s*)?\{[^}]*\}/g, (block) =>
    block.replace(/\s+/g, ' ')
  );
  const lines = normalized.split('\n');

  for (const raw of lines) {
    const line = raw.trimStart();
    if (!line.startsWith('export ')) continue;

    // Skip default + re-export-all
    if (line.startsWith('export default')) continue;
    if (line.startsWith('export *')) continue;

    // Skip types/interfaces at top level — registry is for runtime exports
    if (/^export\s+(type|interface)\s+/.test(line)) continue;

    // export async function <name>
    let m = line.match(/^export\s+async\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) {
      entries.push({ name: m[1], kind: 'async function' });
      continue;
    }

    // export function <name>
    m = line.match(/^export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) {
      entries.push({ name: m[1], kind: 'function' });
      continue;
    }

    // export const { a, b: renamed, c = 1 } = ...
    //
    // The kit's own `export const { handlers, signIn, signOut, auth } = NextAuth({…})`
    // lives in this shape, and `auth()` is one of the most-used symbols it ships. A
    // registry that skills are told to grep INSTEAD OF inventing names had all four
    // missing, which is the precise failure it exists to prevent.
    m = line.match(/^export\s+const\s*\{([^}]+)\}/);
    if (m) {
      const bound = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          // `a: renamed` — the binding created is the RIGHT side.
          const renamed = s.match(/^[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)$/);
          if (renamed) return renamed[1];
          // `a = fallback` — the binding is the left side.
          const defaulted = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          if (defaulted) return defaulted[1];
          return s;
        })
        .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));

      // Nested or computed patterns leave nothing usable. Falling through on purpose so
      // the line reaches the omission channel instead of being counted as read.
      if (bound.length) {
        for (const name of bound) entries.push({ name, kind: 'const' });
        continue;
      }
    }

    // export const <name>
    m = line.match(/^export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) {
      entries.push({ name: m[1], kind: 'const' });
      continue;
    }

    // export class <name>
    m = line.match(/^export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) {
      entries.push({ name: m[1], kind: 'class' });
      continue;
    }

    // export { A, B, type C } (barrel re-exports)
    m = line.match(/^export\s*\{([^}]+)\}/);
    if (m) {
      const names = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        // Drop `type Foo` and `type Foo as Bar` — we only track values
        .filter((s) => !s.startsWith('type '))
        // Handle `foo as bar` — registry shows the external name (bar)
        .map((s) => {
          const asMatch = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
          return asMatch ? asMatch[2] : s;
        })
        .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));

      for (const name of names) {
        entries.push({ name, kind: 'reexport' });
      }
      continue;
    }

    // Nothing matched. Reaching here means the line DECLARES an export (it starts with
    // `export `, and the deliberate exclusions above already `continue`d) in a shape this
    // parser does not know — `export let`, `export var`, `export enum`,
    // `export abstract class`, `export declare function`. Falling through silently is how
    // the registry goes quietly short; recording it is what the caller renders as a hole.
    unrecognized.push({
      snippet: line.length > SNIPPET_MAX ? `${line.slice(0, SNIPPET_MAX)}…` : line,
      reason: 'forma de export no reconocida por el parser',
    });
  }

  // Dedupe by name (re-exports can also appear as local exports)
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });

  return { entries: deduped, unrecognized };
}

/**
 * Classify an entry by naming convention.
 *   useXxx       → hook
 *   PascalCase   → component (for 'component' categories) or class
 *   camelCase    → function / const
 *   UPPER_CASE   → constant
 */
export function classify(entry: ExportEntry, categoryKind: Category['kind']): string {
  const base = classifyShape(entry, categoryKind);
  // A re-export says so. Without this the SAME symbol appears twice under two different
  // kinds — `hashPassword` as `function` where auth.ts re-exports it and `async function`
  // where utils.ts defines it — which reads as two functions rather than one exposed from
  // two paths. Both imports work, so the cost is a reader hesitating over which is real;
  // the registry exists to remove exactly that hesitation.
  return entry.kind === 'reexport' ? `${base} (re-export)` : base;
}

/** The naming-convention classification, before the re-export marker is applied. */
function classifyShape(entry: ExportEntry, categoryKind: Category['kind']): string {
  const { name, kind } = entry;

  if (/^use[A-Z]/.test(name)) return 'hook';
  if (/^[A-Z_]+$/.test(name)) return 'constant';
  if (/^[A-Z]/.test(name)) {
    if (categoryKind === 'component') return 'component';
    if (kind === 'class') return 'class';
    return 'component'; // PascalCase function — likely a component (Can, RequireRole)
  }
  return kind === 'async function' ? 'async function' : kind === 'const' ? 'const' : 'function';
}

// =============================================================================
// Directory scan
// =============================================================================

function scanFiles(category: Category): string[] {
  const files: string[] = [];

  if (category.files) {
    for (const f of category.files) {
      if (existsSync(f)) files.push(f);
    }
  }

  if (category.dir && existsSync(category.dir)) {
    const excludes = new Set(category.exclude || []);
    for (const entry of readdirSync(category.dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (excludes.has(entry.name)) continue;
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      // Skip co-located tests/specs/stories — not exported building blocks
      if (/\.(test|spec|stories)\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(join(category.dir, entry.name));
    }
  }

  return files.sort();
}

/**
 * Convert a source file path to the `@/`-aliased module path a consumer would
 * use to import from it directly.
 *
 *   src/lib/hooks/usePermissions.tsx → @/lib/hooks/usePermissions
 *   src/lib/actions/helpers.ts       → @/lib/actions/helpers
 *   src/components/ui/confirm-dialog.tsx → @/components/ui/confirm-dialog
 */
function fileToModulePath(file: string): string {
  return file.replace(/\.(ts|tsx)$/, '').replace(/^src\//, '@/');
}

/**
 * Determine the canonical import path for a given export.
 *
 * If the category declares itself as barrel-authoritative (`viaBarrel`) or the
 * name is re-exported from the directory's `index.ts`, the barrel is the
 * canonical entry point. Otherwise the importer must go direct to the source
 * file.
 *
 * This avoids lying in the registry: `Can` sits in `usePermissions.tsx` but is
 * NOT re-exported from `lib/hooks/index.ts`, so `import { Can } from '@/lib/hooks'`
 * would fail — the correct path is `@/lib/hooks/usePermissions`.
 */
function resolveImportPath(
  category: Category,
  name: string,
  file: string,
  barrelNames: Set<string>
): string {
  if (category.viaBarrel) return category.importPrefix;
  if (barrelNames.has(name)) return category.importPrefix;
  return fileToModulePath(file);
}

/** What one category contributed: its rows, plus the lines nobody could read. */
interface CategoryHarvest {
  rows: Row[];
  /** Ready-to-render markers, already carrying the file they came from. */
  skips: { entry: string; comment: string }[];
}

function skipsFrom(unrecognized: UnrecognizedExport[], file: string) {
  return unrecognized.map((u) => ({
    entry: skipEntry(u.snippet, file, u.reason),
    comment: skipComment(u.snippet, file, u.reason),
  }));
}

function collectBarrelNames(category: Category): {
  names: Set<string>;
  skips: CategoryHarvest['skips'];
} {
  if (!category.dir) return { names: new Set(), skips: [] };
  const barrelPath = join(category.dir, 'index.ts');
  if (!existsSync(barrelPath)) return { names: new Set(), skips: [] };

  const source = readFileSync(barrelPath, 'utf-8');
  const { entries, unrecognized } = parseExports(source);
  const names = new Set<string>();
  for (const exp of entries) {
    names.add(exp.name);
  }
  // The barrel is reported too: a name it fails to yield does not just go missing from
  // the registry, it silently downgrades the import path of a row that DID make it —
  // `resolveImportPath` falls back to the deep file path when `barrelNames` lacks it.
  return { names, skips: skipsFrom(unrecognized, relative(process.cwd(), barrelPath)) };
}

function collectEntries(category: Category): CategoryHarvest {
  const files = scanFiles(category);
  const barrel = collectBarrelNames(category);
  const rows: Row[] = [];
  const skips: CategoryHarvest['skips'] = [...barrel.skips];

  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const { entries, unrecognized } = parseExports(source);
    const relFile = relative(process.cwd(), file);
    skips.push(...skipsFrom(unrecognized, relFile));

    for (const exp of entries) {
      rows.push({
        name: exp.name,
        kind: classify(exp, category.kind),
        importPath: resolveImportPath(category, exp.name, file, barrel.names),
        file: relFile,
      });
    }
  }

  return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), skips };
}

// =============================================================================
// Markdown rendering
// =============================================================================

function renderCategory(category: Category, harvest: CategoryHarvest): string {
  const { rows, skips } = harvest;
  // A category with NO readable rows but WITH unreadable lines is exactly the case that
  // must not render as nothing: bailing on `rows.length === 0` alone is how a wholly
  // unparseable file leaves no trace at all.
  if (rows.length === 0 && skips.length === 0) return '';

  let md = `## ${category.label}\n\n`;
  md += `📦 \`${category.importPrefix}\`\n\n`;
  md += `| Name | Kind | Import | File |\n`;
  md += `|------|------|--------|------|\n`;

  for (const row of rows) {
    md += `| \`${row.name}\` | ${row.kind} | \`${row.importPath}\` | \`${row.file}\` |\n`;
  }

  md += '\n';
  for (const skip of skips) md += skip.comment;
  md += '---\n\n';
  return md;
}

function generate(): string {
  let md = `# 🪝 HOOKS & HELPERS REGISTRY\n\n`;
  md += `> **Auto-generated** — Run \`pnpm generate:hooks\` to update. Regenerated automatically on pre-commit.\n`;
  md += `> **Purpose:** Canonical names and import paths for kit-shipped hooks, action wrappers, DB helpers, form kit, and UI wrappers. Skills and code generation MUST grep this file instead of inventing names.\n\n`;
  md += `**Scope:** runtime value exports only (functions, components, consts, classes). Types and interfaces are intentionally excluded — signatures live in the source files.\n\n`;
  md += `${DOC_HEADER_NOTE}\n\n`;
  md += `---\n\n`;

  let totalRows = 0;
  const summary: { label: string; count: number }[] = [];
  const allSkips: string[] = [];

  for (const category of CATEGORIES) {
    const harvest = collectEntries(category);
    totalRows += harvest.rows.length;
    allSkips.push(...harvest.skips.map((sk) => sk.entry));
    summary.push({ label: category.label, count: harvest.rows.length });
    md += renderCategory(category, harvest);
  }

  md += `## 📊 Summary\n\n`;
  md += `| Category | Count |\n`;
  md += `|----------|-------|\n`;
  for (const { label, count } of summary) {
    md += `| ${label} | ${count} |\n`;
  }
  md += `| **Total** | **${totalRows}** |\n`;
  md += `| Parse-skips | ${allSkips.length} |\n\n`;
  if (allSkips.length) {
    md += `> ⚠️ ${allSkips.length} parse-skip(s):\n`;
    for (const sk of allSkips) md += `> - ${sk}\n`;
    md += '\n';
  }
  md += `---\n\n_Generated by \`scripts/tools/generate-hooks.ts\` — FX-004_\n`;

  return md;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const output = generate();
  const outputPath = 'project/reference/HOOKS.md';

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
        const p = 'project/reference/HOOKS.md';
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(
          p,
          `# 🪝 HOOKS & HELPERS REGISTRY\n\n<!-- generator-error: ${msg} — ` +
            `generate-hooks.ts falló. Revisa el script o avisa al equipo del kit. -->\n`
        );
      } catch {
        /* swallow — never block the commit */
      }
      console.error(`⚠️  generate-hooks.ts degraded (${msg}) — exit 0`);
    })
    .finally(() => process.exit(0));
}
