/**
 * Generate SCHEMA.md — As-built data model of THIS project, parsed from the
 * Drizzle schema TS (`src/lib/db/schema/*.ts`) which is the SSOT (SK.md §1.3).
 *
 * Usage: pnpm generate:schema
 *
 * This is the as-built complement to discovery's `09_DATA_MODEL.md` (intent).
 * Consumers (Claude/Codex via SK.md §2, /backlog + /design day-2 modes) read
 * it to avoid inventing tables/columns (CODING.md §8).
 *
 * Robustness contract (the main consumer is an AI agent, and this ships to every
 * derived project, where the pre-commit `set -e` would block commits on any
 * non-zero exit):
 *   - existsSync guard before every read (schema dir, enums.ts, roles.ts,
 *     migrations dir) → degrade to an omitted section + a visible note.
 *   - try/catch per-table → a malformed table becomes a `<!-- parse-skip -->`
 *     marker in the doc, not a thrown error.
 *   - top-level try/catch around main() → ALWAYS process.exit(0).
 * The markers are written in plain language so a junior dev knows what happened
 * and the AI agent reading the doc can fix the parser or escalate.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';
import {
  skipString,
  sliceBalanced,
  splitTopLevelArgs,
  stripComments,
} from './lib/parse-balanced.mjs';
import { formatGeneratedMarkdown } from './lib/format-generated-markdown';
import { createSkipChannel, docHeaderNote } from './lib/parse-skip';

const SCHEMA_DIR = 'src/lib/db/schema';
const HELPERS_DIR = 'src/lib/db/helpers';
const ENUMS_FILE = 'src/config/enums.ts';
const ROLES_FILE = 'src/config/roles.ts';
const MIGRATIONS_DIR = 'src/lib/db/migrations';
const OUTPUT_PATH = 'project/reference/SCHEMA.md';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Column {
  tsName: string;
  dbCol: string;
  builder: string;
  flags: string[];
  dflt: string;
  ref: string;
  enumKey: string;
}

interface Constraint {
  kind: string;
  name: string;
  columns: string[];
}

interface Table {
  varName: string;
  dbName: string;
  columns: Column[];
  constraints: Constraint[];
}

interface ColumnGroupDeps {
  readdir?: (dir: string) => string[];
  readFile?: (file: string) => string;
  dirExists?: (path: string) => boolean;
  dir?: string;
}

interface PgEnum {
  sqlName: string;
  values: string[];
}

interface EnumEntry {
  key: string;
  values: string[];
  table: string;
  column: string;
  note: string;
}

interface EnumData {
  entries: EnumEntry[];
  note?: string;
}

interface DDLHit {
  kind: string;
  name: string;
  file: string;
}

// =============================================================================
// Schema TS parsing
// =============================================================================

/** Find the index of the `(` that opens a `pgTable(` call after `fromIdx`. */
function findCallParen(src: string, callIdx: number): number {
  // callIdx points at the start of `pgTable`; find the next `(`
  const paren = src.indexOf('(', callIdx);
  return paren;
}

/**
 * Parse a single column definition RHS, e.g.
 *   uuid('id').primaryKey().defaultRandom()
 *   text('role').notNull().default('user')
 *   text('type', { enum: ENUMS.notificationType.values }).notNull()
 *   timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow()
 *   uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
 */
function parseColumn(tsName: string, rhs: string): Column {
  const builderMatch = rhs.match(/^([A-Za-z_][\w]*)\s*\(/);
  const builder = builderMatch ? builderMatch[1] : '?';

  // First call args → arg0 = db column name (string literal), arg1 = options obj
  let dbCol = tsName;
  let optionsArg = '';
  if (builderMatch) {
    const openParen = rhs.indexOf('(', builderMatch.index);
    try {
      const { content } = sliceBalanced(rhs, openParen);
      const args = splitTopLevelArgs(content);
      if (args[0]) dbCol = args[0].replace(/^['"`]|['"`]$/g, '');
      if (args[1]) optionsArg = args[1];
    } catch {
      // leave defaults; the whole table parse is still try/caught upstream
    }
  }

  const flags: string[] = [];
  if (/\.notNull\s*\(/.test(rhs)) flags.push('NOT NULL');
  if (/\.unique\s*\(/.test(rhs)) flags.push('UNIQUE');
  if (/\.primaryKey\s*\(/.test(rhs)) flags.push('PK');

  let dflt = '';
  if (/\.defaultRandom\s*\(/.test(rhs)) dflt = 'random UUID';
  else if (/\.defaultNow\s*\(/.test(rhs)) dflt = 'now()';
  else {
    const dm = rhs.match(/\.default\s*\(\s*([^)]*?)\s*\)/);
    if (dm) dflt = dm[1].replace(/^['"`]|['"`]$/g, '');
  }
  if (/\.\$onUpdate\s*\(/.test(rhs)) dflt = dflt ? `${dflt} (+ $onUpdate)` : '$onUpdate';

  // FK inline: .references(() => target.col, { onDelete: '...' })
  let ref = '';
  const refMatch = rhs.match(/\.references\s*\(\s*\(\)\s*=>\s*([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)/);
  if (refMatch) {
    // `[\w ]+` (not `\w+`) so multi-word actions like `set null` / `no action`
    // are captured, not truncated to nothing.
    const onDelete = rhs.match(/onDelete:\s*['"`]([\w ]+)['"`]/);
    ref = `${refMatch[1]}.${refMatch[2]}${onDelete ? ` (onDelete: ${onDelete[1].trim()})` : ''}`;
  }

  // Inline enum domain reference: { enum: ENUMS.<key>.values } or { enum: [...] }
  let enumKey = '';
  const enumRef = optionsArg.match(/enum:\s*ENUMS\.([A-Za-z_][\w]*)\.values/);
  if (enumRef) enumKey = enumRef[1];

  return { tsName, dbCol, builder, flags, dflt, ref, enumKey };
}

/** Parse the optional 3rd-arg callback `(t) => [ ... ]` for PK/indexes. */
function parseConstraints(arrowArg: string): Constraint[] {
  const out: Constraint[] = [];
  if (!arrowArg) return out;
  // get the array body
  const bracket = arrowArg.indexOf('[');
  if (bracket === -1) return out;
  let items: string[] = [];
  try {
    const { content } = sliceBalanced(arrowArg, bracket);
    items = splitTopLevelArgs(content);
  } catch {
    return out;
  }
  for (const item of items) {
    const pk = item.match(/primaryKey\s*\(/);
    if (pk) {
      const cols = item.match(/columns:\s*\[([^\]]*)\]/);
      const list = cols ? cols[1].replace(/\s+/g, '').split(',').filter(Boolean) : [];
      out.push({ kind: 'PRIMARY KEY (composite)', name: '', columns: list });
      continue;
    }
    const idx = item.match(
      /(uniqueIndex|index)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.on\s*\(([^)]*)\)/
    );
    if (idx) {
      const cols = idx[3].replace(/\s+/g, '').split(',').filter(Boolean);
      out.push({
        kind: idx[1] === 'uniqueIndex' ? 'UNIQUE INDEX' : 'INDEX',
        name: idx[2],
        columns: cols,
      });
      continue;
    }
    // Table-form foreign key: `foreignKey({ columns: [...], foreignColumns: [...], name })`.
    // The column-form `.references(() => t.col)` is parsed elsewhere (`parseColumn`), so a
    // COMPOSITE FK — which can only be written in this form — was the one shape that produced no
    // entry at all. The relation simply did not appear in SCHEMA.md, the document `SK.md §2.1`
    // orders read before creating a table or column: an agent reading it concludes there is no
    // relation where there is one, which is worse than a missing file.
    if (/\bforeignKey\s*\(/.test(item)) {
      const cols = item.match(/columns:\s*\[([^\]]*)\]/);
      const foreignCols = item.match(/foreignColumns:\s*\[([^\]]*)\]/);
      const fkName = item.match(/name:\s*['"`]([^'"`]+)['"`]/);
      const list = cols ? cols[1].replace(/\s+/g, '').split(',').filter(Boolean) : [];
      // The target reads `otherTable.column`; keep it verbatim — it names both sides, which is
      // the whole point of showing the relation.
      const targets = foreignCols
        ? foreignCols[1].replace(/\s+/g, '').split(',').filter(Boolean)
        : [];
      out.push({
        kind: targets.length ? `FOREIGN KEY → (${targets.join(', ')})` : 'FOREIGN KEY',
        name: fkName ? fkName[1] : '',
        columns: list,
      });
    }
  }
  return out;
}

/**
 * Parse the shared column-group helpers (`export const auditFields = { ... }`,
 * `softDeleteFields`, …) so `...spread` entries in a table can be expanded to
 * their real columns instead of silently vanishing. Returns Map<name, Column[]>.
 * `readdir`/`readFile`/`dirExists` are injectable for testing.
 */
export function parseColumnGroups(deps: ColumnGroupDeps = {}): Map<string, Column[]> {
  const readdir = deps.readdir ?? ((d: string) => readdirSync(d));
  const readFile = deps.readFile ?? ((f: string) => readFileSync(f, 'utf-8'));
  const dirExists = deps.dirExists ?? existsSync;
  const dir = deps.dir ?? HELPERS_DIR;

  const groups = new Map<string, Column[]>();
  if (!dirExists(dir)) return groups;

  for (const fname of readdir(dir)) {
    if (!/\.ts$/.test(fname) || fname === 'index.ts') continue;
    const src = stripComments(readFile(join(dir, fname)));
    const re = /export\s+const\s+([A-Za-z_][\w]*)\s*=\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const braceIdx = src.indexOf('{', m.index);
      let inner = '';
      try {
        ({ content: inner } = sliceBalanced(src, braceIdx));
      } catch {
        continue;
      }
      const cols: Column[] = [];
      for (const entry of splitTopLevelArgs(inner)) {
        const colon = entry.indexOf(':');
        if (colon === -1) continue;
        const tsName = entry.slice(0, colon).trim();
        const rhs = entry.slice(colon + 1).trim();
        // Only rows whose RHS is a Drizzle column builder count as a group.
        if (!tsName || !/^[A-Za-z_][\w]*\s*\(/.test(rhs)) continue;
        cols.push(parseColumn(tsName, rhs));
      }
      if (cols.length) groups.set(m[1], cols);
    }
  }
  return groups;
}

/** Parse one `export const <name> = pgTable(...)` starting at its match index. */
export function parseTable(
  src: string,
  name: string,
  pgTableIdx: number,
  columnGroups: Map<string, Column[]> = new Map()
): Table {
  const openParen = findCallParen(src, pgTableIdx);
  if (openParen === -1) throw new Error('no opening paren for pgTable');
  const { content } = sliceBalanced(src, openParen);
  const args = splitTopLevelArgs(content);

  const dbName = (args[0] || '').replace(/^['"`]|['"`]$/g, '');
  const columnsArg = args[1] || '';
  const arrowArg = args[2] || '';

  // columns object → split top-level entries
  const columns: Column[] = [];
  const braceIdx = columnsArg.indexOf('{');
  if (braceIdx !== -1) {
    const { content: inner } = sliceBalanced(columnsArg, braceIdx);
    for (const entry of splitTopLevelArgs(inner)) {
      const trimmed = entry.trim();

      // Spread of a shared column group (`...auditFields` / `...softDeleteFields`).
      // Expand to its real columns; if the group is unknown, surface a visible
      // placeholder row instead of dropping it silently.
      const spread = trimmed.match(/^\.\.\.([A-Za-z_][\w]*)/);
      if (spread) {
        const group = columnGroups.get(spread[1]);
        if (group) columns.push(...group);
        else
          columns.push({
            tsName: `...${spread[1]}`,
            dbCol: '(unresolved spread)',
            builder: '?',
            flags: [],
            dflt: '',
            ref: '',
            enumKey: '',
          });
        continue;
      }

      const colon = trimmed.indexOf(':');
      if (colon === -1) continue;
      const tsName = trimmed.slice(0, colon).trim();
      const rhs = trimmed.slice(colon + 1).trim();
      if (!tsName || !rhs) continue;
      columns.push(parseColumn(tsName, rhs));
    }
  }

  const constraints = parseConstraints(arrowArg);
  return { varName: name, dbName, columns, constraints };
}

/**
 * One table declaration found in a schema file, ready to hand to `parseTable`.
 */
export interface TableDeclaration {
  varName: string;
  /** Schema that owns the table (`public` unless declared via `pgSchema('x').table(...)`). */
  schema: string;
  /** Index in the source where the table call starts — what `parseTable` expects. */
  callIdx: number;
}

/** A declaration that LOOKS like a table but that no pattern could attribute. */
export interface UnattributedDeclaration {
  varName: string;
  reason: string;
}

export interface TableDiscovery {
  declarations: TableDeclaration[];
  unattributed: UnattributedDeclaration[];
  /**
   * The comment-stripped source the `callIdx` of every declaration is relative to.
   *
   * 🔴 Hand THIS to `parseTable`, never the raw text you passed in. The indices are
   * computed after `stripComments`, so feeding `parseTable` the raw source silently
   * yields a table with the wrong name and no columns — no error, no parse-skip: the
   * exact silent-wrong-answer this generator exists to stop producing. It works today
   * only because `generate()` happens to pre-strip and `stripComments` is idempotent;
   * returning the text removes the coincidence from the contract.
   */
  strippedSource: string;
}

/** Default Postgres schema — the owner of every table not declared via `pgSchema(...)`. */
export const PUBLIC_SCHEMA = 'public';

/**
 * "Looks like a table" — the ONLY declarations the unattributed channel may report.
 * Deliberately narrow: `export const WEBAUTHN_CHALLENGE_TYPES = [...] as const` lives in
 * the kit's own schema, and a derivative adds `relations(...)`, `pgEnum(...)` and plain
 * constants. A naive "every export that did not match" predicate would flag all of them.
 *
 * `pgTable` is matched on the WORD, not on `pgTable(`: an explicit type argument
 * (`pgTable<Foo>('users', …)`) must still reach the unattributed channel if the strict
 * form-A pattern ever stops recognising it. Silence is the one outcome this channel
 * exists to prevent.
 */
const TABLE_SHAPED_RE = /\bpgTable\b|\.\s*table\s*(?:<|\()/;

/**
 * Optional explicit type argument: `pgTable<Foo>(…)`, `schema.table<Foo>(…)`.
 *
 * The negated class is BOUNDED (no newline, at most 200 chars). Unbounded, it turned
 * the shape predicate — which is unanchored, so every `.` in the file is a starting
 * position — from linear into quadratic: a file of `.table<` with no closing `>` took
 * ~16 s at 210 KB and ~100 s at 700 KB, hanging the pre-commit hook of every derivative
 * with no timeout and no signal.
 *
 * 🔴 The bound belongs HERE and not in {@link TABLE_SHAPED_RE}. These two regexes answer different questions: this one asks "is this exactly form A/B?" (anchored, so
 * a bound is harmless), the other asks "does this even look like a table?" — and there,
 * a bound became a silence: `s.table<\n  Foo\n>(…)`, which is just prettier wrapping a
 * long type argument, matched nothing and vanished from the document AND the skips
 * list. Form A never had that hole because `\bpgTable\b` always matches. The shape
 * predicate now stops at the `<`, giving form B the same noisy fallback.
 */
const TYPE_ARG = '(?:<[^>\\n]{0,200}>\\s*)?';

/** Form A — `export const users = pgTable('users', {...})`, generics included. */
const FORM_A_RE = new RegExp(`^pgTable\\s*${TYPE_ARG}\\(`);

/** Form B — `export const invoices = billingSchema.table('invoices', {...})`. */
const FORM_B_RE = new RegExp(`^([A-Za-z_][\\w]*)\\s*\\.\\s*table\\s*${TYPE_ARG}\\(`);

/**
 * The text of ONE declaration: from its `=` to the end of its statement.
 *
 * Bounded by the first `;` at bracket depth zero, falling back to the next top-level
 * `export`. The naive "slice to the next `\nexport `" swallowed everything in between —
 * non-exported code, or the whole rest of an indented file — and any `pgTable(` living
 * there made the PRECEDING constant look table-shaped. That produced a phantom
 * parse-skip for `export const X = [...] as const`, the exact declaration the predicate
 * above exists to stay quiet about.
 *
 * Forms A and B anchor at `^`, so they never depended on this boundary; only the
 * residual "looks like a table" test does.
 */
function declarationText(src: string, rhsIdx: number): string {
  let depth = 0;
  let i = rhsIdx;
  while (i < src.length) {
    const ch = src[i];
    // Literals are skipped with the same primitive `sliceBalanced` uses. Without this the
    // scanner reads a `;` or a bracket INSIDE a string as code: `export const legacy =
    // ';' + makeTable(pgTable('legacy', {...}))` cut the window at the first character,
    // so the declaration reached neither `declarations` nor `unattributed` — total
    // silence, with Parse-skips still reading 0. That is the defect this file exists to
    // remove, so a fix for it must not reintroduce it one level down.
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(src, i);
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth <= 0) return src.slice(rhsIdx, i);
    i += 1;
  }
  const nextExport = src.indexOf('\nexport ', rhsIdx);
  return src.slice(rhsIdx, nextExport === -1 ? src.length : nextExport);
}

/**
 * `public.users` → `users`; `users` → `users`; `billing.users` → `billing.users`.
 *
 * Strips ONLY the default schema. Stripping any prefix made a table in another schema
 * inherit the enum annotation registered for its homonym in `public`: `billing.invoices`
 * picked up the domain declared for `public.invoices`. The enum registry
 * (`src/config/enums.ts`) keys on a bare `{table, column}`, so it has no way to express
 * which schema it meant — until it does, the safe reading is "it meant the default one".
 * A column of a non-`public` table therefore renders without its enum annotation, which
 * is a visible absence rather than a confident wrong answer.
 */
function unqualified(dbName: string): string {
  const prefix = `${PUBLIC_SCHEMA}.`;
  return dbName.startsWith(prefix) ? dbName.slice(prefix.length) : dbName;
}

/**
 * This generator's omission channel. The two emitters live in `lib/parse-skip.ts` now —
 * every generator in the family needs the same pair, and re-implementing it per script
 * had already produced divergent forms of the same warning.
 *
 * Still re-exported under their original names: they used to live inline in `generate()`,
 * which is not exported, so the channel was tested up to the door of the document and not
 * inside it — deleting the emission left the suite green. The suite asserts them by these
 * names, and it keeps doing so.
 */
const skipChannel = createSkipChannel('generate-schema.ts', 'Si es una tabla,');

export const { skipEntry, skipComment } = skipChannel;

/**
 * Discover every table declaration in ONE schema file, from its TEXT (no disk,
 * no import of the schema module — injectable for tests, same shape as
 * `parseColumnGroups`). Returns the declarations `parseTable` can consume plus
 * the ones that look like a table and could not be attributed to any pattern.
 *
 * Errors are caught PER DECLARATION on purpose: `generate()` has a top-level
 * catch that replaces the WHOLE document with a one-line marker, so a single
 * odd declaration must never be allowed to reach it.
 */
export function discoverTableDeclarations(source: string): TableDiscovery {
  const src = stripComments(source);
  const declarations: TableDeclaration[] = [];
  const unattributed: UnattributedDeclaration[] = [];

  // Which local vars hold a `pgSchema('name')` — same "track the variable first" move
  // `parsePgEnums`/`pgEnumMap` already make for native enums. A `.table(` that does not
  // hang off one of these is NOT form B (a generic object with a `.table` method isn't
  // a Drizzle table), so it goes to `unattributed` rather than being guessed at.
  const schemaVars = new Map<string, string>();
  const schemaRe =
    /(?:export\s+)?const\s+([A-Za-z_][\w]*)\s*=\s*pgSchema\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let sm: RegExpExecArray | null;
  while ((sm = schemaRe.exec(src)) !== null) schemaVars.set(sm[1], sm[2]);

  const declRe = /export\s+const\s+([A-Za-z_][\w]*)\s*=\s*/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src)) !== null) {
    const varName = m[1];
    const rhsIdx = m.index + m[0].length;
    try {
      const decl = declarationText(src, rhsIdx);

      // Form A — `export const users = pgTable('users', {...})`
      if (FORM_A_RE.test(decl)) {
        declarations.push({ varName, schema: PUBLIC_SCHEMA, callIdx: rhsIdx });
        continue;
      }

      // Form B — `export const invoices = billingSchema.table('invoices', {...})`
      const viaSchema = decl.match(FORM_B_RE);
      if (viaSchema && schemaVars.has(viaSchema[1])) {
        declarations.push({
          varName,
          schema: schemaVars.get(viaSchema[1]) as string,
          callIdx: rhsIdx,
        });
        continue;
      }

      // Neither form matched. Report ONLY what has the shape of a table: a schema file is
      // full of `as const` arrays, `pgEnum(...)` and `relations(...)`, and a channel that
      // shouts about those is as useless as one that stays silent about a missing table.
      if (!TABLE_SHAPED_RE.test(decl)) continue;
      unattributed.push({
        varName,
        reason: viaSchema
          ? `\`${viaSchema[1]}.table(...)\` — \`${viaSchema[1]}\` no se declara como \`pgSchema('...')\` en este archivo`
          : 'tiene forma de tabla pero no es `pgTable(...)` ni `<pgSchema>.table(...)` directo',
      });
    } catch (e) {
      // Per-declaration guard on purpose: `generate()` has a top-level catch that would
      // replace the ENTIRE document with a one-line marker and still exit 0.
      unattributed.push({
        varName,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { declarations, unattributed, strippedSource: src };
}

/**
 * Parse native Drizzle `export const <var> = pgEnum('<sql_name>', [literals])`
 * declarations. Returns `{ <var> → { sqlName, values[] } }`. A column whose
 * builder is one of these vars (e.g. `status: tournamentStatusEnum('status')`)
 * gets its values surfaced — complements the kit's `text() + config/enums.ts`
 * convention so derivatives using either style show their enum domains.
 */
function parsePgEnums(src: string): Record<string, PgEnum> {
  const map: Record<string, PgEnum> = {};
  const re = /export\s+const\s+([A-Za-z_]\w*)\s*=\s*pgEnum\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const varName = m[1];
    const openParen = m.index + m[0].length - 1; // the `(` of pgEnum(
    try {
      const { content } = sliceBalanced(src, openParen);
      const args = splitTopLevelArgs(content);
      const sqlName = (args[0] || '').replace(/^['"`]|['"`]$/g, '');
      let values: string[] = [];
      const arr = args[1] || '';
      const bracket = arr.indexOf('[');
      if (bracket !== -1) {
        const { content: inner } = sliceBalanced(arr, bracket);
        values = splitTopLevelArgs(inner)
          .map((s: string) => s.replace(/^['"`]|['"`]$/g, ''))
          .filter(Boolean);
      }
      map[varName] = { sqlName, values };
    } catch {
      // skip this enum — the per-file/table guard upstream keeps it visible if it matters
    }
  }
  return map;
}

/** Extract `export type X = typeof <table>.$inferSelect|$inferInsert` mappings. */
function parseInferredTypes(src: string): Record<string, string[]> {
  const map: Record<string, string[]> = {}; // tableVar → [typeNames]
  const re =
    /export\s+type\s+([A-Za-z_][\w]*)\s*=\s*typeof\s+([A-Za-z_][\w]*)\.\$infer(Select|Insert)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    (map[m[2]] ||= []).push(m[1]);
  }
  return map;
}

// =============================================================================
// Enum registry (src/config/enums.ts) + ROLES resolution
// =============================================================================

function resolveRoles(): string[] | null {
  if (!existsSync(ROLES_FILE)) return null;
  const src = stripComments(readFileSync(ROLES_FILE, 'utf-8'));
  const idx = src.indexOf('export const ROLES');
  if (idx === -1) return null;
  const brace = src.indexOf('{', idx);
  if (brace === -1) return null;
  try {
    const { content } = sliceBalanced(src, brace);
    const values: string[] = [];
    for (const entry of splitTopLevelArgs(content)) {
      const v = entry.match(/:\s*['"`]([^'"`]+)['"`]/);
      if (v) values.push(v[1]);
    }
    return values;
  } catch {
    return null;
  }
}

/** Returns { entries: [{key, values[], table, column, note}], note? } or null. */
function parseEnums(): EnumData {
  if (!existsSync(ENUMS_FILE)) {
    return {
      entries: [],
      note: `\`${ENUMS_FILE}\` no existe — sin sección de enums (proyecto sin text-enums registrados).`,
    };
  }
  const src = stripComments(readFileSync(ENUMS_FILE, 'utf-8'));
  const idx = src.indexOf('export const ENUMS');
  if (idx === -1) {
    return { entries: [], note: `No se encontró \`export const ENUMS\` en \`${ENUMS_FILE}\`.` };
  }
  const brace = src.indexOf('{', idx);
  const { content } = sliceBalanced(src, brace);
  const roles = resolveRoles();
  const entries: EnumEntry[] = [];

  for (const entry of splitTopLevelArgs(content)) {
    const colon = entry.indexOf(':');
    if (colon === -1) continue;
    const key = entry.slice(0, colon).trim();
    const body = entry.slice(colon + 1).trim();
    if (!body.startsWith('{')) continue;

    const table = (body.match(/table:\s*['"`]([^'"`]+)['"`]/) || [])[1] || '';
    const column = (body.match(/column:\s*['"`]([^'"`]+)['"`]/) || [])[1] || '';

    let values: string[] = [];
    let note = '';
    const literalArr = body.match(/values:\s*\[([^\]]*)\]/);
    if (literalArr) {
      values = literalArr[1]
        .split(',')
        .map((s: string) => s.replace(/['"`\s]/g, ''))
        .filter(Boolean);
    } else if (/values:\s*Object\.values\(\s*ROLES\s*\)/.test(body)) {
      if (roles) {
        values = roles;
        note = 'resuelto desde ROLES (src/config/roles.ts)';
      } else {
        note = 'Object.values(ROLES) — no se pudo resolver roles.ts';
      }
    } else {
      const expr = body.match(/values:\s*([^,\n}]+)/);
      note = expr ? `expresión no literal: ${expr[1].trim()}` : 'sin values legible';
    }
    entries.push({ key, values, table, column, note });
  }
  return { entries };
}

// =============================================================================
// Migration-only DDL (grep — not a SQL parser)
// =============================================================================

function scanMigrationDDL(): DDLHit[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const hits: DDLHit[] = [];
  const patterns = [
    { kind: 'TRIGGER', re: /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+("?[\w]+"?)/gi },
    { kind: 'FUNCTION', re: /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+("?[\w.]+"?)/gi },
    { kind: 'CHECK', re: /ADD\s+CONSTRAINT\s+("?[\w]+"?)[^;]*?\bCHECK\b/gi },
    { kind: 'FOREIGN KEY', re: /ADD\s+CONSTRAINT\s+("?[\w]+"?)[^;]*?\bFOREIGN\s+KEY\b/gi },
  ];
  for (const file of files.sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    for (const { kind, re } of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql)) !== null) {
        hits.push({ kind, name: m[1].replace(/"/g, ''), file: `${MIGRATIONS_DIR}/${file}` });
      }
    }
  }
  return hits;
}

// =============================================================================
// Markdown rendering
// =============================================================================

const DOC_HEADER_NOTE = docHeaderNote('generate-schema.ts');

/**
 * Render one table as Markdown. Exported so the doc's own shape (the qualified heading,
 * the enum annotation) is asserted by the suite instead of being eyeballed in the output.
 */
export function renderTable(
  table: Table,
  inferred: Record<string, string[]>,
  enumByCol: Record<string, EnumEntry>,
  pgEnumMap: Record<string, PgEnum>
): string {
  let md = `## table \`${table.dbName}\`\n\n`;
  if (table.columns.length === 0) {
    md += `_(sin columnas legibles)_\n\n`;
  } else {
    md += `| Column | Type | Flags | Default | Refs |\n`;
    md += `|--------|------|-------|---------|------|\n`;
    for (const c of table.columns) {
      let type = c.builder;
      // Enum domain resolution, in priority order:
      //   1. kit text-enum registry join by {table, column} (config/enums.ts)
      //   2. native Drizzle pgEnum — the column builder IS the enum var
      //   3. inline `text('x', { enum: ENUMS.y.values })` reference
      // `enums.ts` keys by BARE table name (`users.role`), so the lookup has to survive
      // `dbName` being schema-qualified — otherwise every enum column loses its domain
      // with no note, which is the same silent omission this generator exists to avoid.
      const enumInfo =
        enumByCol[`${table.dbName}.${c.dbCol}`] ??
        enumByCol[`${unqualified(table.dbName)}.${c.dbCol}`];
      const pgEnum = pgEnumMap[c.builder];
      if (enumInfo) type += ` (enum: ${enumInfo.key})`;
      else if (pgEnum) type = `${c.builder} (enum: ${pgEnum.values.join('|')})`;
      else if (c.enumKey) type += ` (enum: ${c.enumKey})`;
      md += `| \`${c.dbCol}\` | ${type} | ${c.flags.join(', ') || '—'} | ${c.dflt || '—'} | ${c.ref || '—'} |\n`;
    }
    md += '\n';
  }

  if (table.constraints.length > 0) {
    md += `**Constraints & Indexes**\n\n`;
    for (const k of table.constraints) {
      const cols = k.columns.length ? ` \`(${k.columns.join(', ')})\`` : '';
      md += `- ${k.kind}${k.name ? ` \`${k.name}\`` : ''}${cols}\n`;
    }
    md += '\n';
  }

  const types = inferred[table.varName];
  if (types && types.length) {
    md += `**Inferred types:** ${types.map((t) => `\`${t}\``).join(', ')}\n\n`;
  }
  md += '---\n\n';
  return md;
}

function generate(): string {
  const skips: string[] = [];

  let body = '';
  let tableCount = 0;
  let columnCount = 0;
  let indexCount = 0;
  let pgEnumCount = 0;

  // --- Tables ---
  if (!existsSync(SCHEMA_DIR)) {
    body += `<!-- skipped: \`${SCHEMA_DIR}\` no existe — sin modelo de datos para reportar. -->\n\n`;
  } else {
    const files = readdirSync(SCHEMA_DIR)
      .filter((f) => /\.ts$/.test(f) && f !== 'index.ts')
      .sort();

    // enum registry (read once, joined per column)
    let enumData: EnumData = { entries: [] };
    try {
      enumData = parseEnums();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skips.push(`enums.ts — ${msg}`);
    }
    const enumByCol: Record<string, EnumEntry> = {};
    for (const e of enumData.entries) {
      if (e.table && e.column) enumByCol[`${e.table}.${e.column}`] = e;
    }

    // native Drizzle pgEnum declarations (may live in any schema file) — global map
    const pgEnumMap: Record<string, PgEnum> = {};

    // shared column-group helpers (auditFields/softDeleteFields) — read once so
    // `...spread` entries expand to real columns instead of vanishing.
    let columnGroups = new Map<string, Column[]>();
    try {
      columnGroups = parseColumnGroups();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skips.push(`column groups (${HELPERS_DIR}) — ${msg}`);
    }

    const allTables: { table: Table; inferred: Record<string, string[]> }[] = [];
    for (const file of files) {
      const path = join(SCHEMA_DIR, file);
      const src = stripComments(readFileSync(path, 'utf-8'));
      Object.assign(pgEnumMap, parsePgEnums(src));
      const inferred = parseInferredTypes(src);
      const discovery = discoverTableDeclarations(src);
      for (const { varName, callIdx, schema } of discovery.declarations) {
        try {
          const parsed = parseTable(src, varName, callIdx, columnGroups);
          // Always schema-qualified (`public.users`, `billing.invoices`) — a bare name cannot
          // tell two homonymous tables of different schemas apart.
          allTables.push({ table: { ...parsed, dbName: `${schema}.${parsed.dbName}` }, inferred });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Through the shared channel, not built inline: this site used `file` raw, so a
          // filename carrying `-->` closed the comment early — the exact hole `skipComment`
          // was written to close, still open one branch away from it.
          skips.push(skipEntry(varName, file, msg));
          body += skipComment(varName, file, msg);
        }
      }
      for (const { varName, reason } of discovery.unattributed) {
        skips.push(skipEntry(varName, file, reason));
        body += skipComment(varName, file, reason);
      }
    }

    pgEnumCount = Object.keys(pgEnumMap).length;

    // sort tables by db name for stable output
    allTables.sort((a, b) => a.table.dbName.localeCompare(b.table.dbName));
    for (const { table, inferred } of allTables) {
      tableCount += 1;
      columnCount += table.columns.length;
      indexCount += table.constraints.filter((c) => c.kind.includes('INDEX')).length;
      body += renderTable(table, inferred, enumByCol, pgEnumMap);
    }

    // --- Enums section ---
    body += `## Enums (text + config registry)\n\n`;
    body +=
      `> Columnas \`text()\` con dominio cerrado declarado en \`${ENUMS_FILE}\` (convención SK: ` +
      `text + config + Zod, no pgEnum). Sets abiertos o restringidos en otro config se listan como ` +
      `\`text\` plano arriba, sin dominio inventado.\n\n`;
    if (enumData.note) {
      body += `_${enumData.note}_\n\n`;
    }
    if (enumData.entries.length) {
      body += `| Registry key | Values | Column |\n|--------------|--------|--------|\n`;
      for (const e of enumData.entries) {
        const vals = e.values.length
          ? e.values.map((v) => `\`${v}\``).join(', ')
          : `_(${e.note || 'sin values'})_`;
        const col = e.table && e.column ? `\`${e.table}.${e.column}\`` : '—';
        body += `| \`${e.key}\` | ${vals}${e.values.length && e.note ? ` _(${e.note})_` : ''} | ${col} |\n`;
      }
      body += '\n';
    }

    // native Drizzle pgEnum (the other valid convention — surface its values too)
    const pgEnumKeys = Object.keys(pgEnumMap).sort();
    if (pgEnumKeys.length) {
      body += `**Native \`pgEnum\`** (Drizzle enum types — sus valores se muestran inline en las columnas que los usan):\n\n`;
      body += `| Enum | SQL type | Values |\n|------|----------|--------|\n`;
      for (const k of pgEnumKeys) {
        const e = pgEnumMap[k];
        const vals = e.values.length ? e.values.map((v) => `\`${v}\``).join(', ') : '—';
        body += `| \`${k}\` | \`${e.sqlName}\` | ${vals} |\n`;
      }
      body += '\n';
    }
    body += '---\n\n';

    // --- Migration-only DDL ---
    let ddl: DDLHit[] = [];
    try {
      ddl = scanMigrationDDL();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skips.push(`migrations grep — ${msg}`);
    }
    if (ddl.length) {
      body += `## Migration-only DDL (no derivable del schema TS)\n\n`;
      body +=
        `> Constructos agregados por migración que Drizzle no modela en el TS (triggers, ` +
        `funciones, CHECK, y FKs como los de \`created_by/modified_by/deleted_by\`). Grep de keywords, ` +
        `no parser SQL — best-effort.\n\n`;
      body += `| Kind | Name | File |\n|------|------|------|\n`;
      for (const d of ddl) {
        body += `| ${d.kind} | \`${d.name}\` | \`${d.file}\` |\n`;
      }
      body += '\n---\n\n';
    }
  }

  // --- Header + summary ---
  let md = `# 🗄️ SCHEMA — Data Model (as-built)\n\n`;
  md += `> **Auto-generated** — Run \`pnpm generate:schema\` to update. Regenerated automatically on pre-commit.\n`;
  md +=
    `> **Purpose:** As-built data model of THIS project, parsed from \`${SCHEMA_DIR}/*.ts\` (the SSOT — ` +
    `SK.md §1.3). Complement to discovery's \`09_DATA_MODEL.md\` (intent). Consult before creating or ` +
    `altering tables/columns (CODING.md §8).\n\n`;
  md += DOC_HEADER_NOTE + '\n\n';
  md += `---\n\n`;
  md += body;
  md += `## 📊 Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Tables | ${tableCount} |\n`;
  md += `| Columns | ${columnCount} |\n`;
  md += `| Indexes | ${indexCount} |\n`;
  md += `| pgEnum types | ${pgEnumCount} |\n`;
  md += `| Parse-skips | ${skips.length} |\n\n`;
  if (skips.length) {
    md += `> ⚠️ ${skips.length} parse-skip(s) — ver marcadores arriba.\n\n`;
  }
  md += `---\n\n_Generated by \`scripts/tools/generate-schema.ts\`_\n`;
  return md;
}

// =============================================================================
// Main — guaranteed exit 0 (never block a commit under pre-commit `set -e`)
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
      // Structural/unexpected failure — still write a minimal doc + marker, never exit≠0.
      try {
        mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
        writeFileSync(
          OUTPUT_PATH,
          `# 🗄️ SCHEMA — Data Model (as-built)\n\n` +
            `<!-- generator-error: ${msg} — ` +
            `generate-schema.ts falló de forma inesperada. Revisa el script o avisa al equipo del kit. -->\n`
        );
      } catch {
        /* swallow — never block the commit */
      }
      console.error(`⚠️  generate-schema.ts degraded (${msg}) — wrote marker, exit 0`);
    })
    .finally(() => process.exit(0));
}
