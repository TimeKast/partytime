/**
 * Load the kit's text-enum registry (`src/config/enums.ts`) WITHOUT importing it.
 *
 * The registry is a `src/` convention (AUDIT-010). Kit tools that consume it —
 * the preflight pgEnum-candidate check and `db:harden-enum` — ship via the brain
 * (`scripts/**` is in the tracked set) and run inside derivatives. But a
 * derivative's FROZEN `src/` may not have the file: it predates AUDIT-010, or it
 * uses native `pgEnum` instead of the kit's `text() + config` convention
 * (mvpicks). A static `import { ENUMS } from '@/config/enums'` then breaks `tsc`
 * in that derivative ("cannot find module") — the script truena on a typecheck
 * it has no business failing.
 *
 * Reading the file as text (existsSync-guarded) keeps these tools dependency-free
 * of `@/config/enums`: present → the real registry (with `Object.values(ROLES)`
 * resolved from `src/config/roles.ts`); absent → `{}` and the consumer no-ops.
 * Mirrors how `generate-schema.mjs` reads the same file. Never throws.
 *
 * @returns {Record<string, { values: string[]; table: string; column: string }>}
 */
import { existsSync, readFileSync } from 'node:fs';
import { sliceBalanced, splitTopLevelArgs, stripComments } from './parse-balanced.mjs';

const ENUMS_FILE = 'src/config/enums.ts';
const ROLES_FILE = 'src/config/roles.ts';

/** Resolve `ROLES` value strings from src/config/roles.ts, or null if unavailable. */
function resolveRoles() {
  if (!existsSync(ROLES_FILE)) return null;
  try {
    const src = stripComments(readFileSync(ROLES_FILE, 'utf-8'));
    const idx = src.indexOf('export const ROLES');
    if (idx === -1) return null;
    const { content } = sliceBalanced(src, src.indexOf('{', idx));
    const values = [];
    for (const entry of splitTopLevelArgs(content)) {
      const v = entry.match(/:\s*['"`]([^'"`]+)['"`]/);
      if (v) values.push(v[1]);
    }
    return values;
  } catch {
    return null;
  }
}

export function loadEnumRegistry() {
  if (!existsSync(ENUMS_FILE)) return {};
  try {
    const src = stripComments(readFileSync(ENUMS_FILE, 'utf-8'));
    const idx = src.indexOf('export const ENUMS');
    if (idx === -1) return {};
    const { content } = sliceBalanced(src, src.indexOf('{', idx));
    const roles = resolveRoles();
    const registry = {};
    for (const entry of splitTopLevelArgs(content)) {
      const colon = entry.indexOf(':');
      if (colon === -1) continue;
      const key = entry.slice(0, colon).trim();
      const body = entry.slice(colon + 1).trim();
      if (!body.startsWith('{')) continue;
      const table = (body.match(/table:\s*['"`]([^'"`]+)['"`]/) || [])[1] || '';
      const column = (body.match(/column:\s*['"`]([^'"`]+)['"`]/) || [])[1] || '';
      let values = [];
      const literal = body.match(/values:\s*\[([^\]]*)\]/);
      if (literal) {
        values = literal[1]
          .split(',')
          .map((s) => s.replace(/['"`\s]/g, ''))
          .filter(Boolean);
      } else if (/values:\s*Object\.values\(\s*ROLES\s*\)/.test(body) && roles) {
        values = roles;
      }
      registry[key] = { values, table, column };
    }
    return registry;
  } catch {
    return {};
  }
}
