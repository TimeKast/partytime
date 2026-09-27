import type { Check, Finding } from '../types';
import { extractCodeBlocks } from '../body-utils';

const IMPORT_FROM_RE = /(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]([^'"\n]+)['"]/g;
const BARE_IMPORT_RE = /\bimport\s+['"]([^'"\n]+)['"]/g;
const REQUIRE_RE = /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g;

// NodeJS built-ins — never count as missing packages
const NODE_BUILTINS = new Set([
  'fs',
  'path',
  'os',
  'crypto',
  'util',
  'events',
  'stream',
  'buffer',
  'url',
  'child_process',
  'http',
  'https',
  'net',
  'tls',
  'zlib',
  'readline',
  'assert',
  'querystring',
  'string_decoder',
  'module',
  'process',
  'vm',
  'worker_threads',
  'perf_hooks',
  'async_hooks',
  'timers',
  'dns',
  'cluster',
  'dgram',
  'tty',
  // modern "node:" prefix is handled separately
]);

// Next.js ships these virtual modules — they're not in package.json but are always available.
const NEXT_VIRTUAL = new Set(['server-only', 'client-only']);

const ALLOW_PREFIX = ['@/', './', '../', 'node:', '#']; // internal / relative / builtins / subpath

/**
 * Extract the package name from an import specifier.
 *   'pkg'         → 'pkg'
 *   'pkg/sub'     → 'pkg'
 *   '@scope/pkg'  → '@scope/pkg'
 *   '@scope/pkg/sub' → '@scope/pkg'
 */
function packageNameOf(spec: string): string | null {
  if (ALLOW_PREFIX.some((p) => spec.startsWith(p))) return null;
  if (NODE_BUILTINS.has(spec.split('/')[0])) return null;
  if (NEXT_VIRTUAL.has(spec)) return null;

  const parts = spec.split('/');
  if (spec.startsWith('@')) {
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

/**
 * Detect imports from packages that are not declared in package.json.
 *
 * Scans only fenced code blocks (typescript/javascript/tsx/jsx) — prose
 * references like "use `nuqs` for URL state" are intentionally ignored because
 * they're often comparative ("nuqs is a lighter alternative to …") rather than
 * prescriptive.
 */
export const packagesCheck: Check = (skill, ctx): Finding[] => {
  const findings: Finding[] = [];
  const codeLangs = new Set(['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript']);
  const blocks = extractCodeBlocks(skill.body);

  const reported = new Set<string>();

  for (const block of blocks) {
    if (block.lang && !codeLangs.has(block.lang)) continue;
    const lines = block.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const specs = new Set<string>();
      let m: RegExpExecArray | null;

      for (const re of [IMPORT_FROM_RE, BARE_IMPORT_RE, REQUIRE_RE]) {
        const regex = new RegExp(re.source, 'g');
        while ((m = regex.exec(line)) !== null) specs.add(m[1]);
      }

      for (const spec of specs) {
        const pkg = packageNameOf(spec);
        if (!pkg) continue;
        if (ctx.packageDeps.has(pkg)) continue;

        const key = `${pkg}`;
        if (reported.has(key)) continue;
        reported.add(key);

        findings.push({
          skill: skill.name,
          check: 'packages',
          severity: 'error',
          message: `Imported package \`${pkg}\` is not declared in package.json`,
          line: block.startLine + i,
          hint: `Either add it as a dependency, or mark the code block as "not installed / example only".`,
        });
      }
    }
  }

  return findings;
};
