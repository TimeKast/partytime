import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

import type { Check, Finding, Severity } from '../types';
import { extractCodeBlocks } from '../body-utils';

/**
 * specifiers — validate `@/...` module specifiers in sk-* code fences.
 *
 * Every `@/` import shown in a kit-shipped skill (`sk-*`) must resolve against
 * `src/` **case-sensitively** (macOS dev machines are case-insensitive, but
 * CI / Vercel / Linux are not — a PascalCase specifier for a kebab-case file
 * compiles locally and breaks on deploy). See AUDIT-003 / capa2 F1.
 *
 * Scope:
 *   - Only `sk-*` skills (kit-shipped, grounded in real `src/` files).
 *     kb-* are portable patterns and tk-/fx- are workflows — not validated.
 *   - Only ts/tsx fences. bash/text/css fences are ignored.
 *   - Only module-specifier positions: `import ... from`, bare `import '...'`,
 *     dynamic `import('...')`, `require('...')`, `vi.mock('...')` & friends.
 *     Plain object keys (e.g. vitest alias maps) are NOT specifiers.
 *
 * Exemptions:
 *   - Anti-pattern examples: fence content (or the line right above the fence)
 *     contains ❌ — those intentionally show wrong code.
 *   - Illustrative scaffolds: fences marked with `skill-lint: ignore-specifiers`
 *     (inside the fence as a comment, or in an HTML comment within the two
 *     lines above it). Used by walkthroughs whose imports reference files the
 *     reader will CREATE (e.g. sk-crud-scaffold's `order` entity), which by
 *     design do not exist in the kit.
 *
 * Note: this check validates module specifiers only. It deliberately does NOT
 * validate agent-prefix-like tokens (`mck-*` here would be CSS classes, not
 * agent references — that domain belongs to agent-taxonomy-lint.sh).
 */

const IGNORE_DIRECTIVE = 'skill-lint: ignore-specifiers';

const CODE_LANGS = new Set(['ts', 'tsx', 'typescript']);

// Module-specifier positions only (object keys like `'@/lib': path` don't match).
const SPECIFIER_RES = [
  // import { X } from '@/x'; · export { Y } from '@/x';
  /\b(?:import|export)\s+[^'"\n]*?\bfrom\s+['"](@\/[^'"\n]+)['"]/g,
  // bare side-effect import: import '@/x';
  /\bimport\s+['"](@\/[^'"\n]+)['"]/g,
  // dynamic import: await import('@/x')
  /\bimport\(\s*['"](@\/[^'"\n]+)['"]\s*\)/g,
  // require('@/x')
  /\brequire\(\s*['"](@\/[^'"\n]+)['"]\s*\)/g,
  // vi.mock('@/x', ...) / vi.doMock / vi.importActual / vi.importMock
  /\bvi\.(?:mock|doMock|unmock|importActual|importMock)[^('"\n]*\(\s*['"](@\/[^'"\n]+)['"]/g,
];

const KNOWN_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|svg)$/;

/**
 * Case-SENSITIVE existence check. `existsSync` is case-insensitive on APFS,
 * which is exactly the false negative this check exists to catch — so each
 * path segment is compared against actual directory entries.
 */
function caseSensitiveFileExists(root: string, relPath: string): boolean {
  const segments = relPath.split('/');
  let current = root;
  for (const segment of segments) {
    if (!existsSync(current) || !statSync(current).isDirectory()) return false;
    if (!readdirSync(current).includes(segment)) return false;
    current = join(current, segment);
  }
  return existsSync(current) && statSync(current).isFile();
}

/** Resolve `@/x/y` the way tsconfig's `@/* → src/*` alias does. */
function resolvesAgainstSrc(repoRoot: string, spec: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(spec);
  if (cached !== undefined) return cached;

  const rest = spec.slice(2); // strip '@/'
  const candidates = KNOWN_EXTENSIONS.test(rest)
    ? [rest]
    : [`${rest}.ts`, `${rest}.tsx`, `${rest}/index.ts`, `${rest}/index.tsx`];

  const srcRoot = join(repoRoot, 'src');
  const ok = candidates.some((c) => caseSensitiveFileExists(srcRoot, c));
  cache.set(spec, ok);
  return ok;
}

function isExemptBlock(blockContent: string, bodyLines: string[], startLine: number): boolean {
  if (blockContent.includes(IGNORE_DIRECTIVE)) return true;
  if (blockContent.includes('❌')) return true;
  // Look at the fence line and the two lines above it (HTML-comment directive
  // or an anti-pattern marker introducing the example).
  for (let i = startLine - 2; i >= startLine - 4 && i >= 0; i--) {
    const line = bodyLines[i] ?? '';
    if (line.includes(IGNORE_DIRECTIVE) || line.includes('❌')) return true;
  }
  return false;
}

export const specifiersCheck: Check = (skill, ctx): Finding[] => {
  if (!skill.name.startsWith('sk-')) return [];

  // Origin (the Factory) has no lockfile; a derivative does (the CLI writes
  // `.timekast/lockfile.json` on install). In a derivative the kit-shipped `sk-*`
  // skills are READ-ONLY and cite the KIT's `src/` convention — a derivative's
  // `src/` legitimately diverges (a renamed primitive, a removed component, a
  // different design system: mvpicks ships Cobalt Glass with `cobalt-checkbox`
  // and no `popover`, vs the kit's Neomorphism `neo-checkbox` + `popover`).
  // The origin's own strict skill:lint already guarantees every `sk-*` specifier
  // resolves against the kit BEFORE it ships, so an unresolved specifier HERE is
  // always derivative divergence — never shippable kit drift. Warn (informative,
  // not the dev's to fix), don't block the commit. Strict ERROR stays at origin.
  const isDerivative = ctx.isDerivative;
  const severity: Severity = isDerivative ? 'warning' : 'error';

  const findings: Finding[] = [];
  const cache = new Map<string, boolean>();
  const reported = new Set<string>();

  for (const block of extractCodeBlocks(skill.body)) {
    if (!CODE_LANGS.has(block.lang)) continue;
    if (isExemptBlock(block.content, skill.bodyLines, block.startLine)) continue;

    const lines = block.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const specs = new Set<string>();
      for (const re of SPECIFIER_RES) {
        const regex = new RegExp(re.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = regex.exec(lines[i])) !== null) specs.add(m[1]);
      }

      for (const spec of specs) {
        if (resolvesAgainstSrc(ctx.repoRoot, spec, cache)) continue;
        if (reported.has(spec)) continue;
        reported.add(spec);

        findings.push({
          skill: skill.name,
          check: 'specifiers',
          severity,
          message: `Module specifier \`${spec}\` does not resolve (case-sensitive) under src/`,
          line: block.startLine + i,
          hint: isDerivative
            ? `Kit-shipped skill cites the kit's src/ — this project's src/ diverges (renamed/removed primitive or a different design system). Informative, not a kit defect; override locally with a pj-* skill if you need project-accurate examples.`
            : `Cite the real file path (src/ files are kebab-case for shadcn primitives), ` +
              `or mark the fence with "${IGNORE_DIRECTIVE}" if it illustrates files the reader creates.`,
        });
      }
    }
  }

  return findings;
};
