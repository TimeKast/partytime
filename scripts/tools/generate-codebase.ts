/**
 * Generate CODEBASE.md — Dependency map for AI agent context
 *
 * Usage: pnpm generate:codebase  (runs via tsx)
 *
 * Scans TypeScript/TSX files, extracts import statements, and generates a
 * dependency graph showing which files depend on which others and who uses them.
 *
 * @see CLN-006
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, dirname, resolve, normalize } from 'path';
import { pathToFileURL } from 'url';
import { formatGeneratedMarkdown } from './lib/format-generated-markdown';
import { createSkipChannel, docHeaderNote } from './lib/parse-skip';
import { stripComments } from './lib/parse-balanced.mjs';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReadFile = (p: string) => string;
type FileExists = (p: string) => boolean;

interface GraphDeps {
  readFile?: ReadFile;
  fileExists?: FileExists;
}

interface DependencyGraph {
  dependsOn: Map<string, string[]>;
  usedBy: Map<string, string[]>;
  /**
   * Local imports that named a file this map could not find.
   *
   * NOT the same as an import that resolves OUTSIDE `ROOT_DIRS`: that one is out of
   * scope by a declared decision, and the map is allowed to not have it. This list is
   * the other case — an `@/` or relative import whose target does not exist under any
   * known extension. The edge is dropped either way; only one of the two is a hole.
   */
  unresolved: UnresolvedImport[];
}

/**
 * One `paths` entry from tsconfig, pre-split around its `*`.
 *
 * `@/lib/*` → `./src/lib/*` becomes prefix `@/lib/`, suffix ``, target prefix `src/lib/`.
 */
export interface AliasRule {
  prefix: string;
  suffix: string;
  targets: { prefix: string; suffix: string }[];
}

/** A local import that named a file `resolveImport` could not find. */
export interface UnresolvedImport {
  importPath: string;
  fromFile: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const ROOT_DIRS = ['src', 'lib', 'components'];
const EXCLUDE_DIRS = [
  'node_modules',
  '.next',
  'dist',
  'public',
  '__tests__',
  '__mocks__',
  'coverage',
];
const EXCLUDE_PATTERNS = ['.test.', '.spec.', '.mock.', '.stories.'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/** This generator's omission channel — shared shape, see `lib/parse-skip.ts`. */
const { skipEntry, skipComment } = createSkipChannel('generate-codebase.ts', 'Esa dependencia');

const DOC_HEADER_NOTE = docHeaderNote('generate-codebase.ts');

const TSCONFIG_PATH = 'tsconfig.json';

/** What the generator assumed before it learned to read `paths`. Only used as fallback. */
const KIT_FALLBACK_ALIASES: AliasRule[] = [
  { prefix: '@/', suffix: '', targets: [{ prefix: 'src/', suffix: '' }] },
];

const REASON_UNRESOLVED = 'no resuelve a ningún archivo bajo las extensiones conocidas';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect all source files from a directory. */
function collectFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      collectFiles(fullPath, files);
    } else if (entry.isFile() && EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      if (EXCLUDE_PATTERNS.some((p) => entry.name.includes(p))) continue;
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Default file-existence probe (real filesystem). Injectable so the resolver
 * can be unit-tested without touching disk.
 */
const defaultFileExists: FileExists = (filePath) =>
  existsSync(filePath) && statSync(filePath).isFile();

const defaultReadFile: ReadFile = (p) => readFileSync(p, 'utf-8');

/**
 * Resolve an import path to a real source file path.
 *
 * The `@/` alias maps to `src/` (see tsconfig `paths`), NOT the repo root — a
 * prior bug stripped `@/` to '' and resolved against the root, so every aliased
 * edge (the bulk of the graph) silently dropped. `fileExists` is injectable for
 * testing.
 */
export function resolveImport(
  importPath: string,
  fromFile: string,
  fileExists: FileExists = defaultFileExists,
  aliases: AliasRule[] = defaultAliasRules()
): string | null {
  // Relative import — no alias table involved.
  if (importPath.startsWith('.')) {
    return tryResolveFile(join(dirname(fromFile), importPath), fileExists);
  }

  // Aliased import, per the project's OWN tsconfig `paths`.
  for (const candidate of applyAliases(importPath, aliases)) {
    const resolved = tryResolveFile(candidate, fileExists);
    if (resolved) return resolved;
  }

  // External package, or an alias this project does not declare.
  return null;
}

/**
 * Expand an import through the alias table, most specific rule first.
 *
 * TypeScript picks the pattern with the LONGEST literal prefix, and that is not a detail
 * to skip: a project mapping both `@/*` → `./*` and `@/lib/*` → `./src/lib/*` needs
 * `@/lib/db` to go through the second. Trying rules in declaration order would resolve it
 * against the repo root instead and quietly build a different graph.
 */
export function applyAliases(importPath: string, rules: AliasRule[]): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    if (!importPath.startsWith(rule.prefix) || !importPath.endsWith(rule.suffix)) continue;
    const middle = importPath.slice(rule.prefix.length, importPath.length - rule.suffix.length);
    for (const target of rule.targets) {
      out.push(normaliseRepoPath(`${target.prefix}${middle}${target.suffix}`));
    }
  }
  return out;
}

/** Strip a leading `./` and collapse `..` so the result is comparable to the file list. */
function normaliseRepoPath(p: string): string {
  const normalised = normalize(p);
  return normalised.startsWith('./') ? normalised.slice(2) : normalised;
}

/**
 * Read the alias table from the project's `tsconfig.json`.
 *
 * Hardcoding `@/` → `src/` was fine for the kit and wrong for a derivative: an
 * adi-capital-admin maps `"@/*": ["./*"]`, so every `@/src/...` import became
 * `src/src/...`, found nothing, and its edge vanished from the map. The generator ships
 * to projects whose `src/` it does not control (BR-FACTORY-006), so the mapping has to
 * come from the project, not from the kit's memory of itself.
 *
 * 🔴 Declared limit: `extends` is not followed. A project that inherits `paths` from a
 * base config gets the fallback below, and says so through the channel rather than
 * silently resolving nothing.
 */
export function parseTsconfigPaths(source: string): AliasRule[] {
  let parsed: {
    compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
  };
  try {
    parsed = JSON.parse(stripComments(source));
  } catch {
    return [];
  }

  const paths = parsed.compilerOptions?.paths;
  if (!paths) return [];
  const baseUrl = parsed.compilerOptions?.baseUrl ?? '.';

  const rules: AliasRule[] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf('*');
    // A pattern with no `*` is an exact alias; one with two is invalid in TS. Both are
    // left out rather than guessed at.
    if (star === -1 || pattern.indexOf('*', star + 1) !== -1) continue;

    rules.push({
      prefix: pattern.slice(0, star),
      suffix: pattern.slice(star + 1),
      targets: targets
        .filter((t) => t.split('*').length === 2)
        .map((t) => {
          const ts = t.indexOf('*');
          return {
            prefix: normaliseRepoPath(join(baseUrl, t.slice(0, ts))),
            suffix: t.slice(ts + 1),
          };
        }),
    });
  }

  // Longest literal prefix wins — see `applyAliases`.
  return rules.sort((a, b) => b.prefix.length - a.prefix.length);
}

/**
 * The alias table for the checkout being scanned, read once.
 *
 * Falls back to the kit's own mapping when there is no readable `tsconfig.json` with
 * `paths`, so a project without one keeps behaving exactly as before this change.
 */
let cachedAliases: AliasRule[] | null = null;
export function defaultAliasRules(): AliasRule[] {
  if (cachedAliases) return cachedAliases;
  let rules: AliasRule[] = [];
  if (existsSync(TSCONFIG_PATH)) {
    rules = parseTsconfigPaths(readFileSync(TSCONFIG_PATH, 'utf-8'));
  }
  cachedAliases = rules.length ? rules : KIT_FALLBACK_ALIASES;
  return cachedAliases;
}

/** Try to resolve a path to an actual file (exact, then extension, then index). */
export function tryResolveFile(
  filePath: string,
  fileExists: FileExists = defaultFileExists
): string | null {
  if (fileExists(filePath)) return filePath;

  for (const ext of EXTENSIONS) {
    if (fileExists(filePath + ext)) return filePath + ext;
  }

  for (const ext of EXTENSIONS) {
    const indexFile = join(filePath, `index${ext}`);
    if (fileExists(indexFile)) return indexFile;
  }

  return null;
}

/**
 * Match: `import ... from '...'` and bare `import '...'`.
 *
 * The clause between `import` and `from` is restricted to what an import clause
 * can actually contain — identifiers, `{}`, `,`, `*`, `type`, whitespace. It used
 * to be `[\s\S]*?`, which matches anything, so the word "import" written in prose
 * paired with the next ` from '...'` further down the file and invented an edge:
 * on `src/lib/auth/step-up.ts` the JSDoc phrase "the single import surface" reached
 * the re-export 5 lines below and produced a SECOND `@/lib/auth/email-otp` entry —
 * a file that never imports it. Harmless while re-exports were invisible; once
 * RE_EXPORT_RE captured the real one, the map listed the same edge twice and
 * over-reported that file's dependents.
 *
 * Declared limitation: a comment inside the clause itself (`import { a, // note`)
 * breaks the match, so that import is not captured. No occurrence exists in this
 * repo, and widening the class back to `[\s\S]` is what caused the bug above.
 */
const IMPORT_RE = /^[ \t]*import\s+(?:[\w$*{},\s]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

/**
 * Match a re-export: `export [type] * | * as ns | {...} from '...'`.
 *
 * Anchored to the whole re-export shape on purpose. The tempting shortcut —
 * widening the import pattern to `(?:import|export)\s+...` — pairs the keyword
 * with any later ` from '...'`, so it lifts string literals out of comments:
 * on `src/lib/auth/step-up.ts` it yields a 10,198-char match whose captured
 * "path" is the words `no grant`, taken from a comment. It is also quadratic
 * (319ms vs 0.1ms on a 6,000-export file).
 *
 * Dynamic `import('...')` stays out by decision, not oversight — without
 * comment stripping it would invent an edge from a `{@link import('@/...')}`
 * JSDoc reference. See DBINSP-004 §9.
 */
const RE_EXPORT_RE =
  /^[ \t]*export\s+(?:type\s+)?(?:\*(?:\s+as\s+[A-Za-z_$][\w$]*)?|\{[^}]*\})\s*from\s+['"]([^'"]+)['"]/gm;

/**
 * Extract local import paths (`@/` or relative) from a file's source.
 *
 * Covers both static imports and local re-exports, so a barrel file — whose
 * whole job is re-exporting — gets real edges instead of an empty row in the
 * map that `SK.md §2.2` tells you to read before modifying a file.
 *
 * `readFile` is injectable for testing.
 */
export function extractImports(filePath: string, readFile: ReadFile = defaultReadFile): string[] {
  const content = readFile(filePath);
  const found: { index: number; path: string }[] = [];

  for (const regex of [IMPORT_RE, RE_EXPORT_RE]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      found.push({ index: match.index, path: match[1] });
    }
  }

  return (
    found
      // Two passes over the same source — restore document order.
      .sort((a, b) => a.index - b.index)
      .map((m) => m.path)
      // Only resolve local imports (@ alias or relative)
      .filter((p) => p.startsWith('@/') || p.startsWith('.'))
  );
}

// ─── Graph ───────────────────────────────────────────────────────────────────

/**
 * Build the dependency graph (`dependsOn` + reverse `usedBy`) from a file list.
 * Pure over its inputs — `readFile`/`fileExists` are injectable so the graph can
 * be unit-tested without disk access.
 */
export function buildGraph(files: string[], deps: GraphDeps = {}): DependencyGraph {
  const readFile = deps.readFile ?? defaultReadFile;
  const fileExists = deps.fileExists ?? defaultFileExists;
  const fileSet = new Set(files);

  const dependsOn = new Map<string, string[]>();
  const usedBy = new Map<string, string[]>();
  const unresolved: UnresolvedImport[] = [];

  for (const file of files) {
    const resolvedDeps: string[] = [];

    for (const imp of extractImports(file, readFile)) {
      const resolved = resolveImport(imp, file, fileExists);
      if (resolved && fileSet.has(resolved)) {
        resolvedDeps.push(resolved);
        if (!usedBy.has(resolved)) usedBy.set(resolved, []);
        usedBy.get(resolved)!.push(file);
        continue;
      }
      // Split on purpose. `!resolved` means a LOCAL import (already filtered by
      // `extractImports`) named a file that exists under no known extension — a hole in
      // the map, reported. `resolved && !fileSet.has(resolved)` means it resolved fine
      // but lives outside `ROOT_DIRS`, which is this map's declared scope — dropped
      // without a marker, because reporting a decision as a defect is how a channel
      // becomes noise nobody reads.
      if (!resolved) unresolved.push({ importPath: imp, fromFile: file });
    }

    dependsOn.set(file, resolvedDeps);
  }

  return { dependsOn, usedBy, unresolved };
}

// ─── Markdown ────────────────────────────────────────────────────────────────

function generateCodebase(): string {
  const allFiles: string[] = [];
  for (const dir of ROOT_DIRS) {
    collectFiles(dir, allFiles);
  }

  const { dependsOn, usedBy, unresolved } = buildGraph(allFiles);

  let md = `# 🗺️ CODEBASE — Dependency Map\n\n`;
  md += `> **Auto-generated** — Run \`pnpm generate:codebase\` to update\n\n`;
  md += `${DOC_HEADER_NOTE}\n\n`;
  md += `---\n\n`;

  // High-Risk Files (2+ dependents)
  const highRisk = [...usedBy.entries()]
    .filter(([, users]) => users.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  if (highRisk.length > 0) {
    md += `## ⚠️ High-Risk Files\n\n`;
    md += `> Files with 2+ dependents — changes here may break multiple consumers.\n\n`;
    md += `| File | Dependents |\n`;
    md += `|------|------------|\n`;
    for (const [file, users] of highRisk) {
      md += `| \`${file}\` | ${users.length} |\n`;
    }
    md += `\n---\n\n`;
  }

  // Full Dependency Map
  md += `## 📊 Full Dependency Map\n\n`;
  md += `| File | Depends On | Used By |\n`;
  md += `|------|------------|--------|\n`;

  for (const file of [...dependsOn.keys()].sort()) {
    const deps = dependsOn.get(file) ?? [];
    const users = usedBy.get(file) ?? [];
    const depsStr = deps.length > 0 ? deps.map((d) => `\`${d}\``).join(', ') : '—';
    const usersStr = users.length > 0 ? users.map((u) => `\`${u}\``).join(', ') : '—';
    md += `| \`${file}\` | ${depsStr} | ${usersStr} |\n`;
  }

  md += `\n---\n\n`;

  // Summary
  const totalFiles = allFiles.length;
  const totalConnections = [...dependsOn.values()].reduce((sum, deps) => sum + deps.length, 0);
  const orphanFiles = allFiles.filter(
    (f) => (dependsOn.get(f) ?? []).length === 0 && (usedBy.get(f) ?? []).length === 0
  ).length;

  md += `## 📈 Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total files analyzed | ${totalFiles} |\n`;
  md += `| Total connections | ${totalConnections} |\n`;
  md += `| High-risk files (2+ deps) | ${highRisk.length} |\n`;
  md += `| Orphan files (no connections) | ${orphanFiles} |\n`;
  md += `| Parse-skips | ${unresolved.length} |\n\n`;
  if (unresolved.length) {
    md += `> ⚠️ ${unresolved.length} parse-skip(s) — imports locales que no resuelven a ningún archivo:\n`;
    for (const u of unresolved)
      md += `> - ${skipEntry(u.importPath, u.fromFile, REASON_UNRESOLVED)}\n`;
    md += '\n';
    for (const u of unresolved) md += skipComment(u.importPath, u.fromFile, REASON_UNRESOLVED);
  }
  md += `---\n\n_Generated by \`scripts/tools/generate-codebase.ts\`_\n`;

  return md;
}

// ─── Execute (only when run directly, not when imported for tests) ───────────

async function main(): Promise<void> {
  const output = generateCodebase();
  const outputPath = 'project/reference/CODEBASE.md';

  mkdirSync(dirname(outputPath), { recursive: true });
  // Formatted before writing: the pre-commit hook stages this file RAW and lint-staged only
  // sees what was staged BEFORE the regeneration, so nothing on either path would format it.
  // Kit-owned output has to satisfy the kit's own `prettier --check` — here and in every
  // derivative it travels to, where the file is not the developer's to fix.
  writeFileSync(outputPath, await formatGeneratedMarkdown(output, outputPath));
  console.log(`✅ ${outputPath} generated (dependency map)`);
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry === import.meta.url) {
  // Never block a commit under pre-commit `set -e` — degrade to a marker, exit 0.

  main()
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        const p = 'project/reference/CODEBASE.md';
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(
          p,
          `# 🗺️ CODEBASE — Dependency Map\n\n<!-- generator-error: ${msg} — ` +
            `generate-codebase.ts falló. Revisa el script o avisa al equipo del kit. -->\n`
        );
      } catch {
        /* swallow — never block the commit */
      }
      console.error(`⚠️  generate-codebase.ts degraded (${msg}) — exit 0`);
    })
    .finally(() => process.exit(0));
}
