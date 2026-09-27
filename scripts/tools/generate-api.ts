/**
 * Generate API.md — As-built API surface of THIS project: server actions
 * (`src/lib/actions/**`) + route handlers (`src/app/api/**​/route.ts`).
 *
 * Usage: pnpm generate:api
 *
 * As-built complement to discovery's `10_API_SURFACE.md` (intent). Consumers
 * (Claude/Codex via SK.md §2, /backlog + /design day-2 modes) read it to reuse
 * existing actions and see what is RBAC-gated before building new.
 *
 * Auth detection for actions is exhaustive (3 forms: withAuth / withSelf /
 * manual requirePermission). Route-handler guard detection is BEST-EFFORT /
 * ADVISORY (declared in the doc) — many routes are gated by rate-limit or
 * token validation rather than a session, so a single auth() check would lie.
 *
 * Robustness contract (same as generate-schema.mjs — ships to every derived
 * project under pre-commit `set -e`):
 *   - existsSync guards on the source dirs → degrade to a note.
 *   - try/catch per-action and per-route → `<!-- parse-skip -->` marker, never throw.
 *   - top-level try/catch around main() → ALWAYS process.exit(0).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { sliceBalanced, splitTopLevelArgs, stripComments } from './lib/parse-balanced.mjs';
import { formatGeneratedMarkdown } from './lib/format-generated-markdown';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReadFile = (p: string) => string;
type Predicate = (f: string) => boolean;
type Walk = (dir: string, predicate: Predicate, acc?: string[]) => string[];
type DirExists = (p: string) => boolean;

interface CollectDeps {
  readFile?: ReadFile;
  walk?: Walk;
  dirExists?: DirExists;
  root?: string;
}

interface ActionConfig {
  resource: string;
  action: string;
  schema: string;
  revalidate: string;
}

interface PermissionConfig {
  resource: string;
  action: string;
}

interface ActionRow {
  name: string;
  auth: string;
  resource: string;
  action: string;
  schema: string;
  revalidate: string;
  file: string;
}

interface RouteRow {
  method: string;
  route: string;
  guard: string;
  validation: string;
  file: string;
}

interface CollectActionsResult {
  rows: ActionRow[];
  skips: string[];
  missing: boolean;
}

interface CollectRoutesResult {
  rows: RouteRow[];
  skips: string[];
  missing: boolean;
}

interface UnitStart {
  name: string;
  index: number;
}

interface Unit {
  name: string;
  region: string;
}

interface GenerateDeps {
  actions?: CollectDeps;
  routes?: CollectDeps;
}

// Server actions are any `'use server'` module — they live across src/ (e.g.
// lib/auth/mfa-login.ts, lib/db/helpers/can-hard-delete.ts), not only under
// src/lib/actions. Scan all of src/ and let the `'use server'` directive be the
// gate (see collectActions). Scanning only lib/actions silently dropped the
// MFA/TOTP actions.
const SRC_ROOT = 'src';
// Route handlers are any `route.ts` under the App Router — not only under /api
// (e.g. src/app/serwist/[path]/route.ts).
const APP_DIR = 'src/app';
const OUTPUT_PATH = 'project/reference/API.md';
const ACTION_EXCLUDE = new Set(['helpers.ts', 'types.ts', 'index.ts']);

const DOC_HEADER_NOTE =
  '> ℹ️ **¿Ves un bloque `parse-skip`?** El generador no pudo leer una parte del código; ' +
  'esa parte falta en este archivo. Pídele a Claude/Codex que revise ' +
  '`scripts/tools/generate-api.ts`, o avisa al equipo del kit.';

// =============================================================================
// Filesystem walk
// =============================================================================

function walk(dir: string, predicate: Predicate, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

// =============================================================================
// Server actions
// =============================================================================

/** Collect exported function/arrow-const units with their source regions. */
export function collectUnits(src: string): Unit[] {
  const starts: UnitStart[] = [];
  let m: RegExpExecArray | null;

  const fnRe = /export\s+(?:async\s+)?function\s+([A-Za-z_][\w]*)/g;
  while ((m = fnRe.exec(src)) !== null) starts.push({ name: m[1], index: m.index });

  // arrow const: RHS begins with optional `async` then `(` → a function, not a schema/const
  const arrowRe = /export\s+const\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\(/g;
  while ((m = arrowRe.exec(src)) !== null) starts.push({ name: m[1], index: m.index });

  starts.sort((a, b) => a.index - b.index);
  return starts.map((s, i) => ({
    name: s.name,
    region: src.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : src.length),
  }));
}

/**
 * Find the index of the `(` that opens a `callName(...)` call, allowing an
 * optional generic type arg between the name and the paren — e.g.
 * `withSelf<{ url: string }>(...)`. Returns -1 if not found.
 */
function findCallOpenParen(region: string, callName: string): number {
  const re = new RegExp(`\\b${callName}\\s*(?:<[^>]*>)?\\s*\\(`);
  const m = re.exec(region);
  return m ? m.index + m[0].length - 1 : -1;
}

function parseConfigObject(region: string, callName: string): ActionConfig | null {
  const openParen = findCallOpenParen(region, callName);
  if (openParen === -1) return null;
  try {
    const { content } = sliceBalanced(region, openParen);
    const args = splitTopLevelArgs(content);
    const config = args[0] || '';
    let schema = (config.match(/schema:\s*([A-Za-z_][\w.]*)/) || [])[1] || '';
    if (schema === 'z' || schema.startsWith('z.')) schema = 'inline';
    return {
      resource: (config.match(/resource:\s*['"`]([^'"`]+)['"`]/) || [])[1] || '',
      action: (config.match(/action:\s*['"`]([^'"`]+)['"`]/) || [])[1] || '',
      schema,
      revalidate: (config.match(/revalidate:\s*['"`]([^'"`]+)['"`]/) || [])[1] || '',
    };
  } catch {
    return null;
  }
}

function parseRequirePermission(region: string): PermissionConfig | null {
  const openParen = findCallOpenParen(region, 'requirePermission');
  if (openParen === -1) return null;
  try {
    const { content } = sliceBalanced(region, openParen);
    const args = splitTopLevelArgs(content);
    // requirePermission(role, resource, action) — arg0 = role expr (ignored)
    const strip = (s: string) => (s || '').replace(/^['"`]|['"`]$/g, '');
    return { resource: strip(args[1]), action: strip(args[2]) };
  } catch {
    return null;
  }
}

/** Classify a single action's auth shape. Returns a row object. */
function classifyAction(name: string, region: string, file: string): ActionRow {
  const base: ActionRow = {
    name,
    auth: 'none-detected',
    resource: '',
    action: '',
    schema: '',
    revalidate: '',
    file,
  };

  // Both wrappers are detected BEFORE either is reported, and that ordering is the fix rather
  // than a style preference. These used to be two independent `if`s over the same region, so
  // first-match-wins: an action that picks its guard at RUNTIME — `withSelf` when the user acts
  // on their own resource, `withAuth` when an admin acts on someone else's — was documented with
  // only ONE of the two. API.md then asserted an authorization posture the code does not have,
  // in the document `SK.md §2.1` sends an agent to read before touching an endpoint.
  const hasWithAuth = /\bwithAuth\s*(?:<[^>]*>)?\s*\(/.test(region);
  const hasWithSelf = /\bwithSelf\s*(?:<[^>]*>)?\s*\(/.test(region);

  if (hasWithAuth && hasWithSelf) {
    // Merge both configs: either wrapper may be the one carrying `schema`/`revalidate`, and the
    // RBAC pair only ever comes from `withAuth` (self-service has no resource/action by design).
    const authCfg: Partial<ActionConfig> = parseConfigObject(region, 'withAuth') || {};
    const selfCfg: Partial<ActionConfig> = parseConfigObject(region, 'withSelf') || {};
    return {
      ...base,
      auth: 'withAuth / withSelf (conditional)',
      resource: authCfg.resource || '',
      action: authCfg.action || '',
      schema: authCfg.schema || selfCfg.schema || '',
      revalidate: authCfg.revalidate || selfCfg.revalidate || '',
    };
  }
  if (hasWithAuth) {
    const cfg = parseConfigObject(region, 'withAuth');
    return { ...base, auth: 'withAuth', ...(cfg || {}) };
  }
  if (hasWithSelf) {
    const cfg: Partial<ActionConfig> = parseConfigObject(region, 'withSelf') || {};
    // withSelf is self-service: no RBAC resource/action; keep schema/revalidate
    return {
      ...base,
      auth: 'withSelf (self)',
      schema: cfg.schema || '',
      revalidate: cfg.revalidate || '',
    };
  }
  if (/\brequirePermission\s*\(/.test(region)) {
    const rp: Partial<PermissionConfig> = parseRequirePermission(region) || {};
    return {
      ...base,
      auth: 'requirePermission (manual)',
      resource: rp.resource || '',
      action: rp.action || '',
    };
  }
  // Project-local guard helper — `require*` / `ensure*` / `assert*` / `with*`
  // naming is a near-universal convention for auth/precondition guards and
  // action wrappers (e.g. a derivative's `requireUserId`,
  // `requireTournamentAdminOrOwner`, or a custom `withTournamentAdmin` wrapper
  // mirroring the kit's `withAuth`/`withSelf`). Heuristic + advisory: the guard
  // fn name goes in the Resource column so a human can verify it. Checked AFTER
  // the exact-name `withAuth`/`withSelf`/`requirePermission` so the kit patterns
  // keep their specific labels; a non-auth `with*` (e.g. `withTransaction`)
  // would surface its own name here, not a false RBAC claim.
  const guard = region.match(/\b((?:require|ensure|assert|with)[A-Z]\w*)\s*\(/);
  if (guard) {
    return { ...base, auth: 'custom-guard', resource: guard[1] };
  }
  if (/\bauth\s*\(/.test(region)) {
    return { ...base, auth: 'auth-only' };
  }
  return base;
}

export function collectActions(deps: CollectDeps = {}): CollectActionsResult {
  const readFile = deps.readFile ?? ((f: string) => readFileSync(f, 'utf-8'));
  const walkFn = deps.walk ?? walk;
  const dirExists = deps.dirExists ?? existsSync;
  const root = deps.root ?? SRC_ROOT;

  const skips: string[] = [];
  const rows: ActionRow[] = [];
  if (!dirExists(root)) {
    return { rows, skips, missing: true };
  }
  const files = walkFn(
    root,
    (f: string) => f.endsWith('.ts') && !ACTION_EXCLUDE.has(f.split('/').pop()!)
  );
  for (const file of files.sort()) {
    const raw = readFile(file);
    // Only a `'use server'` module exposes its exports as server actions. Every
    // other .ts under src/ (helpers, types, route configs, plain modules) is
    // skipped — the directive is the gate, not the directory. Anchor to line
    // start so a `'use server'` inside a comment/string is not a false positive.
    if (!/^\s*['"]use server['"]/m.test(raw)) continue;
    const src = stripComments(raw);
    for (const unit of collectUnits(src)) {
      try {
        rows.push(classifyAction(unit.name, unit.region, file));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        skips.push(`action \`${unit.name}\` (${file}) — ${msg}`);
      }
    }
  }
  rows.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  return { rows, skips, missing: false };
}

// =============================================================================
// Route handlers
// =============================================================================

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function routePathFromFile(file: string): string {
  // Normalize Windows separators first — the walk predicate accepts `\route.ts`.
  const norm = file.replaceAll('\\', '/');
  return norm.replace(/^src\/app/, '').replace(/\/route\.ts$/, '') || '/';
}

export function detectMethods(src: string): string[] {
  const found = new Set<string>();
  // Destructured re-export: `export const { GET, POST } = handlers` (NextAuth pattern)
  const destructured = src.match(/export\s+const\s+\{([^}]*)\}\s*=/);
  const destructuredNames = destructured ? destructured[1] : '';
  for (const method of HTTP_METHODS) {
    const re = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\s*=`
    );
    if (re.test(src)) found.add(method);
    else if (new RegExp(`\\b${method}\\b`).test(destructuredNames)) found.add(method);
  }
  return [...found];
}

export function detectGuards(src: string): string {
  const guards: string[] = [];
  if (/\bauth\s*\(/.test(src)) guards.push('auth()');
  if (/\brequirePermission\s*\(/.test(src)) guards.push('requirePermission');
  if (/checkRateLimit|rateLimit\s*\(|getClientIP/.test(src)) guards.push('rate-limit');
  if (/validate\w*Token/.test(src)) guards.push('token-guard');
  return guards.length ? guards.join(' + ') : 'none-detected';
}

export function collectRoutes(deps: CollectDeps = {}): CollectRoutesResult {
  const readFile = deps.readFile ?? ((f: string) => readFileSync(f, 'utf-8'));
  const walkFn = deps.walk ?? walk;
  const dirExists = deps.dirExists ?? existsSync;
  const root = deps.root ?? APP_DIR;

  const skips: string[] = [];
  const rows: RouteRow[] = [];
  if (!dirExists(root)) {
    return { rows, skips, missing: true };
  }
  const files = walkFn(root, (f: string) => f.endsWith('/route.ts') || f.endsWith('\\route.ts'));
  for (const file of files.sort()) {
    try {
      const src = stripComments(readFile(file));
      const route = routePathFromFile(file);
      const methods = detectMethods(src);
      const guard = detectGuards(src);
      const validation = /safeParse|z\.object/.test(src) ? '✓' : '—';
      const list = methods.length ? methods : ['—'];
      for (const method of list) {
        rows.push({ method, route, guard, validation, file });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skips.push(`route ${file} — ${msg}`);
    }
  }
  rows.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
  return { rows, skips, missing: false };
}

// =============================================================================
// Rendering
// =============================================================================

export function generate(deps: GenerateDeps = {}): string {
  const actions = collectActions(deps.actions);
  const routes = collectRoutes(deps.routes);
  const allSkips = [...actions.skips, ...routes.skips];

  let md = `# 🔌 API — Surface (as-built)\n\n`;
  md += `> **Auto-generated** — Run \`pnpm generate:api\` to update. Regenerated automatically on pre-commit.\n`;
  md +=
    `> **Purpose:** As-built API surface of THIS project — \`'use server'\` actions across ` +
    `\`${SRC_ROOT}/**\` + route handlers at \`${APP_DIR}/**/route.ts\`. Complement to discovery's ` +
    `\`10_API_SURFACE.md\` (intent). Consult before creating a new action/endpoint (SK.md §2).\n\n`;
  md += DOC_HEADER_NOTE + '\n\n';
  md += '---\n\n';

  // Server actions
  md += `## Server Actions\n\n`;
  md +=
    `> Solo exports de módulos \`'use server'\`. **Auth = best-effort / advisory.** Valores: ` +
    `\`withAuth\` (RBAC) · \`withSelf (self)\` · \`withAuth / withSelf (conditional)\` (la action ` +
    `elige la guarda en runtime — self-service sobre lo propio, RBAC sobre lo ajeno) · ` +
    `\`requirePermission (manual)\` · ` +
    `\`custom-guard\` (helper/wrapper local \`require*\`/\`ensure*\`/\`assert*\`/\`with*\` — su nombre va en la columna Resource) · ` +
    `\`auth-only\` (\`auth()\` directo) · \`none-detected\`. ` +
    `\`none-detected\` **NO** significa "sin auth" — un guard propio del proyecto puede no reconocerse; verifica el archivo.\n\n`;
  if (actions.missing) {
    md += `<!-- skipped: \`${SRC_ROOT}\` no existe — sin server actions. -->\n\n`;
  } else if (actions.rows.length === 0) {
    md += `_(sin server actions detectadas)_\n\n`;
  } else {
    md += `| Name | Auth | Resource | Action | Schema | Revalidate | File |\n`;
    md += `|------|------|----------|--------|--------|------------|------|\n`;
    for (const r of actions.rows) {
      md += `| \`${r.name}\` | ${r.auth} | ${r.resource || '—'} | ${r.action || '—'} | ${r.schema ? `\`${r.schema}\`` : '—'} | ${r.revalidate ? `\`${r.revalidate}\`` : '—'} | \`${r.file}\` |\n`;
    }
    md += '\n';
  }
  md += '---\n\n';

  // Route handlers
  md += `## Route Handlers\n\n`;
  md +=
    `> **Best-effort / advisory.** Guards se detectan por señales (\`auth()\`, \`requirePermission\`, ` +
    `rate-limit, token-guard); \`none-detected\` NO significa "sin protección" — verifica el archivo. ` +
    `(Asimetría deliberada vs Server Actions, que sí es exhaustiva.)\n\n`;
  if (routes.missing) {
    md += `<!-- skipped: \`${APP_DIR}\` no existe — sin route handlers. -->\n\n`;
  } else if (routes.rows.length === 0) {
    md += `_(sin route handlers detectados)_\n\n`;
  } else {
    md += `| Method | Route | Guard | Validation | File |\n`;
    md += `|--------|-------|-------|------------|------|\n`;
    for (const r of routes.rows) {
      md += `| ${r.method} | \`${r.route}\` | ${r.guard} | ${r.validation} | \`${r.file}\` |\n`;
    }
    md += '\n';
  }
  md += '---\n\n';

  // Summary
  const authCounts: Record<string, number> = {};
  for (const r of actions.rows) authCounts[r.auth] = (authCounts[r.auth] || 0) + 1;
  md += `## 📊 Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Server actions | ${actions.rows.length} |\n`;
  for (const [auth, n] of Object.entries(authCounts).sort()) {
    md += `| &nbsp;&nbsp;↳ ${auth} | ${n} |\n`;
  }
  md += `| Route handlers (method×route) | ${routes.rows.length} |\n`;
  md += `| Parse-skips | ${allSkips.length} |\n\n`;
  if (allSkips.length) {
    md += `> ⚠️ ${allSkips.length} parse-skip(s):\n`;
    for (const s of allSkips) md += `> - ${s}\n`;
    md += '\n';
  }
  md += `---\n\n_Generated by \`scripts/tools/generate-api.ts\`_\n`;
  return md;
}

// =============================================================================
// Main — guaranteed exit 0
// =============================================================================

async function main(): Promise<void> {
  const output = generate();
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  // Formatted before writing: the pre-commit hook stages this file RAW and lint-staged only
  // sees what was staged BEFORE the regeneration, so nothing on either path would format it.
  // Kit-owned output has to satisfy the kit's own `prettier --check` — here and in every
  // derivative it travels to, where the file is not the developer's to fix.
  writeFileSync(OUTPUT_PATH, await formatGeneratedMarkdown(output, OUTPUT_PATH));
  console.log(`✅ ${OUTPUT_PATH} generated`);
}

// Run only when invoked directly (not when imported for tests — the exit(0)
// below would otherwise kill the test runner).
const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry === import.meta.url) {
  main()
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
        writeFileSync(
          OUTPUT_PATH,
          `# 🔌 API — Surface (as-built)\n\n` +
            `<!-- generator-error: ${msg} — ` +
            `generate-api.ts falló de forma inesperada. Revisa el script o avisa al equipo del kit. -->\n`
        );
      } catch {
        /* swallow — never block the commit */
      }
      console.error(`⚠️  generate-api.ts degraded (${msg}) — wrote marker, exit 0`);
    })
    .finally(() => process.exit(0));
}
