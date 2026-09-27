#!/usr/bin/env tsx
/**
 * Read-Only Database Query Runner
 *
 * Executes SQL queries against the Neon PostgreSQL database in read-only mode.
 * Blocks write operations (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE).
 *
 * Usage:
 *   pnpm db:query "SELECT * FROM users LIMIT 5"
 *   pnpm db:query "SELECT * FROM users" --json
 *   pnpm db:query --tables
 *   pnpm db:query --describe users
 *   pnpm db:query --help
 *
 * @see .claude/rules/SK.md §1.4 — the rule this runner exists to satisfy.
 *      (The original issue lived under `project/backlog/`, which no derivative
 *      receives, and its acceptance criteria predate multi-schema support.)
 */

import { Pool } from '@neondatabase/serverless';

import { readVaultBlock, readVaultDomain, VAULT_WRAPPER_MARKER } from './with-vault.mjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedArgs {
  query: string | null;
  json: boolean;
  tables: boolean;
  describe: string | null;
  help: boolean;
  /**
   * Target the PRODUCTION (main) DB instead of the default develop DB — via `DATABASE_URL_MAIN`
   * in a repo without a vault, via the `DATABASE_URL` the wrapper injected from `main` in a repo
   * with one ({@link selectDatabaseUrl}).
   */
  main: boolean;
}

/** Inputs of {@link selectDatabaseUrl} — everything it decides from, no I/O. */
export interface DatabaseUrlInput {
  /** `--main` was passed. */
  main: boolean;
  /** The process environment. */
  env: Record<string, string | undefined>;
  /** The repo has a `vault` block in `.timekast/provision.json`. */
  hasVaultBlock: boolean;
  /** Slug of the block's production environment (`envs.main`). Default: `main`. */
  vaultMainEnv?: string;
  /** Vault domain, to name the login command in errors. Omitted → the hint is left out. */
  vaultDomain?: string;
}

/** The connection-string variable a selection read. */
export type DatabaseUrlVar = 'DATABASE_URL' | 'DATABASE_URL_MAIN';

/**
 * Result of {@link selectDatabaseUrl}. The error carries only a NAME and a message — never a
 * value of a connection string.
 */
export type DatabaseUrlSelection =
  | { ok: true; url: string; varName: DatabaseUrlVar }
  | { ok: false; reason: 'missing-var' | 'not-main-env'; varName: DatabaseUrlVar; message: string };

interface QueryResult {
  rows: Record<string, unknown>[];
  fields: { name: string; dataTypeID: number }[];
  rowCount: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_PREFIXES = ['SELECT', 'WITH', 'EXPLAIN', 'SHOW'] as const;

/**
 * Postgres `pg_type` catalog OIDs for timestamp columns (standard, stable).
 * Used to distinguish naive timestamps (no time zone) from tz-aware ones
 * when formatting `Date` values — a naive value must not render the
 * misleading UTC `Z` suffix.
 */
export const PG_TIMESTAMP_OID = 1114; // timestamp without time zone (naive)
export const PG_TIMESTAMPTZ_OID = 1184; // timestamp with time zone

const WRITE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
] as const;

const HELP_TEXT = `
📊 db:query — Read-Only Database Query Runner

Usage:
  pnpm db:query "SQL"                    Execute a SELECT query (develop DB)
  pnpm db:query:main "SQL"               Same, against the PRODUCTION (main) DB
  pnpm db:query "SQL" --json             Output as JSON
  pnpm db:query --tables                 List tables from every user schema
  pnpm db:query --describe <table>       Describe columns ('schema.table' to qualify)
  pnpm db:query --help                   Show this help

Examples:
  pnpm db:query "SELECT * FROM users LIMIT 5"
  pnpm db:query "SELECT count(*) FROM users WHERE role = 'admin'"
  pnpm db:query "SELECT table_schema, table_name FROM information_schema.tables"
  pnpm db:query --tables
  pnpm db:query --describe users
  pnpm db:query --describe billing.invoices
  pnpm db:query "SELECT * FROM users" --json

Allowed statements: SELECT, WITH (CTEs), EXPLAIN, SHOW
Blocked: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE

Note: Write operations are blocked for safety. Use pnpm db:seed for data changes.
`.trim();

// ---------------------------------------------------------------------------
// Arg Parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node + script path
  const result: ParsedArgs = {
    query: null,
    json: false,
    tables: false,
    describe: null,
    help: false,
    main: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--json':
        result.json = true;
        break;
      case '--tables':
        result.tables = true;
        break;
      case '--describe': {
        const next = args[i + 1];
        if (!next || next.startsWith('--')) {
          console.error('❌ --describe requires a table name');
          process.exit(1);
        }
        result.describe = next;
        i++; // skip next arg
        break;
      }
      case '--main':
        result.main = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      default:
        if (!arg.startsWith('--')) {
          result.query = arg;
        }
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Query Validation
// ---------------------------------------------------------------------------

/**
 * Strip SQL comments (single-line and multi-line) from a query string.
 */
export function stripComments(sql: string): string {
  // Remove multi-line comments /* ... */
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments -- ...
  result = result.replace(/--.*$/gm, '');
  return result.trim();
}

/**
 * Validate that a SQL query is read-only.
 * Returns null if valid, or an error message if blocked.
 */
export function validateQuery(sql: string): string | null {
  if (!sql || !sql.trim()) {
    return 'Empty query';
  }

  const cleaned = stripComments(sql);
  if (!cleaned) {
    return 'Empty query after stripping comments';
  }

  // Normalize whitespace and uppercase for prefix check
  const normalized = cleaned.replace(/\s+/g, ' ').trim().toUpperCase();

  // Check if starts with an allowed prefix
  const startsWithAllowed = ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));

  if (!startsWithAllowed) {
    return 'Write operations are not allowed. Use pnpm db:seed for data changes.';
  }

  // Check for write keywords anywhere in the query (multi-statement or CTE abuse)
  // Split by semicolons to detect multi-statement attacks
  const statements = normalized.split(';').filter((s) => s.trim().length > 0);

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    // Each statement after the first must also be read-only
    const stmtStartsWithAllowed = ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
    if (!stmtStartsWithAllowed && trimmed.length > 0) {
      return 'Write operations are not allowed. Use pnpm db:seed for data changes.';
    }
  }

  // Check for write keywords inside CTEs: WITH x AS (UPDATE/INSERT/DELETE ...)
  // Look for write keywords after opening parens inside CTE definitions
  const cteBodyRegex = /\bAS\s*\(/gi;
  let match;
  while ((match = cteBodyRegex.exec(normalized)) !== null) {
    // Find the matching closing paren
    let depth = 1;
    let pos = match.index + match[0].length;
    while (pos < normalized.length && depth > 0) {
      if (normalized[pos] === '(') depth++;
      if (normalized[pos] === ')') depth--;
      pos++;
    }
    const cteBody = normalized.slice(match.index + match[0].length, pos - 1);
    for (const keyword of WRITE_KEYWORDS) {
      if (cteBody.includes(keyword)) {
        return 'Write operations are not allowed. Use pnpm db:seed for data changes.';
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

/**
 * Format query results as an ASCII table.
 */
export function formatTable(
  rows: Record<string, unknown>[],
  fields: { name: string; dataTypeID?: number }[]
): string {
  if (fields.length === 0) {
    return '(no columns)';
  }

  const MAX_COL_WIDTH = 40;
  const columns = fields.map((f) => f.name);

  // Calculate column widths (capped at MAX_COL_WIDTH)
  const widths = columns.map((col, i) => {
    const headerWidth = col.length;
    const maxDataWidth = rows.reduce((max, row) => {
      const val = formatValue(row[col], fields[i].dataTypeID);
      return Math.max(max, val.length);
    }, 0);
    return Math.min(Math.max(headerWidth, maxDataWidth), MAX_COL_WIDTH);
  });

  // Build horizontal borders
  const topBorder = '┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐';
  const midBorder = '├' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤';
  const botBorder = '└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘';

  // Build header row
  const header =
    '│' +
    columns.map((col, i) => ` ${truncate(col, widths[i]).padEnd(widths[i])} `).join('│') +
    '│';

  // Build data rows
  const dataRows = rows.map(
    (row) =>
      '│' +
      columns
        .map(
          (col, i) =>
            ` ${truncate(formatValue(row[col], fields[i].dataTypeID), widths[i]).padEnd(widths[i])} `
        )
        .join('│') +
      '│'
  );

  const parts = [topBorder, header, midBorder, ...dataRows, botBorder];
  return parts.join('\n');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Format a single cell value for the ASCII table output.
 *
 * `Date` values from a naive `timestamp without time zone` column
 * (OID {@link PG_TIMESTAMP_OID}) are rendered WITHOUT the trailing `Z`
 * suffix — the value carries no time zone, so printing it as UTC would be
 * misleading. Any other column type (including `timestamptz`,
 * {@link PG_TIMESTAMPTZ_OID}) keeps the full `toISOString()` output.
 */
export function formatValue(val: unknown, dataTypeID?: number): string {
  if (val === null || val === undefined) return 'NULL';
  if (val instanceof Date) {
    const iso = val.toISOString();
    return dataTypeID === PG_TIMESTAMP_OID ? iso.replace(/Z$/, '') : iso;
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/**
 * Format query results as JSON.
 */
export function formatJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

// ---------------------------------------------------------------------------
// SQL Shortcuts
// ---------------------------------------------------------------------------

/**
 * Lists every table of every USER schema — system catalogs (`pg_catalog`,
 * `information_schema`) are the only exclusions. The `drizzle` migrations schema is
 * deliberately NOT hidden: it is a real table of the database and hiding it would
 * reproduce the single-schema blind spot this query exists to remove.
 *
 * The schema travels in a column of its own (`schema`), never concatenated into the
 * table name, and the size is resolved BY OID (`pg_class.oid` handed to
 * `pg_total_relation_size`) instead of rebuilding a qualified name as text. Two
 * homonymous tables in different schemas therefore report their own size by
 * construction, and a relation whose size cannot be resolved (schema without `USAGE`
 * for the role, relation without storage such as a view, concurrent drop) yields a
 * NULL size through the LEFT JOIN rather than aborting the whole listing.
 *
 * Declared limitation: `information_schema.tables` is the driving table and it does not
 * list materialized views (they are not standard SQL), so `relkind = 'm'` is unreachable
 * from here and matviews stay out of the listing. Kept in the predicate so that changing
 * the driving table does not silently exclude them — written down rather than left for
 * the next reader to rediscover.
 */
export const LIST_TABLES_SQL = `
  SELECT t.table_schema AS schema,
         t.table_name,
         pg_size_pretty(pg_total_relation_size(c.oid)) AS size
  FROM information_schema.tables t
  LEFT JOIN pg_namespace n ON n.nspname = t.table_schema
  LEFT JOIN pg_class c ON c.relnamespace = n.oid
                      AND c.relname = t.table_name
                      AND c.relkind IN ('r', 'p', 'm')
  WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY t.table_schema, t.table_name
`;

/** Strict allowlist for a table-name part: letters, digits and underscore only. */
const TABLE_NAME_ALLOWLIST = /[^a-zA-Z0-9_]/g;

/**
 * Split a possibly qualified table name (`schema.table`) on its last dot and sanitize
 * EACH half with {@link TABLE_NAME_ALLOWLIST}.
 *
 * The allowlist is deliberately NOT widened with `.`. Splitting first and cleaning each
 * half separately is strictly narrower than letting a dot through: neither half can
 * reach the literal the other one sits in. Splitting never replaces sanitization — it
 * precedes it, and the schema half goes through the very same filter as the table half.
 *
 * A name with more than one dot (`a.b.c`), a leading dot (`.users`) or a trailing dot
 * (`users.`) is rejected loudly instead of being silently mutilated.
 */
function parseTableName(tableName: string): { schema: string | null; table: string } {
  const dotIndex = tableName.lastIndexOf('.');

  if (dotIndex === -1) {
    return { schema: null, table: tableName.replace(TABLE_NAME_ALLOWLIST, '') };
  }

  const rawSchema = tableName.slice(0, dotIndex);
  const rawTable = tableName.slice(dotIndex + 1);

  if (!rawSchema || !rawTable || rawSchema.includes('.')) {
    throw new Error(
      `Invalid table name '${tableName}'. Expected 'table' or 'schema.table' — exactly one dot, neither part empty.`
    );
  }

  return {
    schema: rawSchema.replace(TABLE_NAME_ALLOWLIST, ''),
    table: rawTable.replace(TABLE_NAME_ALLOWLIST, ''),
  };
}

/**
 * Build the `--describe` query for a table name, qualified (`billing.invoices`) or not.
 *
 * Unqualified names filter by `table_name` alone — no schema is pinned — so a name that
 * exists in several schemas returns every match; `table_schema` is selected and ordered
 * on so that output stays readable instead of collapsing.
 *
 * Security: the name is only ever interpolated as a LITERAL between single quotes,
 * never in identifier position (no interpolation after `FROM`, no `EXECUTE`, no
 * `format('%s')`, no `::regclass`), and both halves already passed the strict allowlist.
 */
export function describeTableSql(tableName: string): string {
  const { schema, table } = parseTableName(tableName);
  const schemaPredicate = schema === null ? '' : `\n      AND table_schema = '${schema}'`;

  return `
    SELECT
      table_schema,
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length
    FROM information_schema.columns
    WHERE table_name = '${table}'${schemaPredicate}
    ORDER BY table_schema, ordinal_position
  `;
}

// ---------------------------------------------------------------------------
// Connection-string selection
// ---------------------------------------------------------------------------

/**
 * Pick the connection string for this run. Pure: no I/O, no connection — `main()` opens the
 * pool only with an `ok` result.
 *
 * - **No vault block** (the repo works with `.env.local`): `--main` → `DATABASE_URL_MAIN`,
 *   default → `DATABASE_URL`. Unchanged behaviour.
 * - **Vault block, default:** `DATABASE_URL` — the direct develop string the wrapper injected
 *   from `local`. Same code path as without a vault.
 * - **Vault block, `--main`:** `DATABASE_URL` is production ONLY if the wrapper injected `main`,
 *   and the proof is its marker ({@link VAULT_WRAPPER_MARKER}) holding the `main` slug. Without
 *   it (`TK_VAULT=off`, plain `tsx`, a nested call from `local`) the `DATABASE_URL` in the
 *   process is develop's, so this FAILS instead of falling back to it. `DATABASE_URL_MAIN` is
 *   never read (it does not exist in a vault repo — `fx-secrets-vault §7`).
 *
 * Messages name variables and commands, never a value.
 *
 * @param input - see {@link DatabaseUrlInput}.
 * @returns the URL and the variable it came from, or a typed error.
 */
export function selectDatabaseUrl(input: DatabaseUrlInput): DatabaseUrlSelection {
  const { main, env, hasVaultBlock } = input;

  if (!hasVaultBlock) {
    const varName: DatabaseUrlVar = main ? 'DATABASE_URL_MAIN' : 'DATABASE_URL';
    const url = env[varName];
    if (!url) {
      return {
        ok: false,
        reason: 'missing-var',
        varName,
        message: `${varName} not configured. Set it in .env.local`,
      };
    }
    return { ok: true, url, varName };
  }

  const loginHint = input.vaultDomain
    ? ` Si no tienes sesión de la bóveda, entra con \`infisical login --domain=${input.vaultDomain}\`.`
    : '';

  if (main) {
    const mainEnv = input.vaultMainEnv ?? 'main';
    const marker = env[VAULT_WRAPPER_MARKER];
    if (marker !== mainEnv) {
      const got =
        marker === undefined || marker === ''
          ? 'este proceso no recibió ningún entorno de la bóveda'
          : `este proceso recibió el entorno \`${marker}\`, no \`${mainEnv}\``;
      return {
        ok: false,
        reason: 'not-main-env',
        varName: 'DATABASE_URL',
        message:
          `\`db:query:main\` necesita el entorno \`${mainEnv}\` de la bóveda y ${got}; no consulto ` +
          'otra base en su lugar. Córrelo con `pnpm db:query:main`, que pasa por el wrapper de la ' +
          `bóveda (sin \`TK_VAULT=off\` y fuera de otro comando envuelto).${loginHint}`,
      };
    }
    const url = env.DATABASE_URL;
    if (!url) {
      return {
        ok: false,
        reason: 'missing-var',
        varName: 'DATABASE_URL',
        message:
          `el entorno \`${mainEnv}\` de la bóveda no trae \`DATABASE_URL\` (va en \`${mainEnv}:/ci\`, ` +
          'la cadena directa). Pide a un admin de la bóveda que la cargue.',
      };
    }
    return { ok: true, url, varName: 'DATABASE_URL' };
  }

  const url = env.DATABASE_URL;
  if (!url) {
    return {
      ok: false,
      reason: 'missing-var',
      varName: 'DATABASE_URL',
      message:
        '`DATABASE_URL` no está en el entorno. En un repo con bóveda la inyecta el wrapper: ' +
        `corre \`pnpm db:query\` (entorno \`local\`).${loginHint}`,
    };
  }
  return { ok: true, url, varName: 'DATABASE_URL' };
}

// ---------------------------------------------------------------------------
// Query Execution
// ---------------------------------------------------------------------------

async function executeQuery(pool: Pool, sql: string): Promise<QueryResult> {
  const start = performance.now();
  const result = await pool.query(sql);
  const durationMs = Math.round(performance.now() - start);

  return {
    rows: result.rows as Record<string, unknown>[],
    fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rowCount: result.rowCount ?? result.rows.length,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const parsed = parseArgs(process.argv);

  // Handle --help
  if (parsed.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // The repo ↔ vault link, read exactly as the wrapper reads it (`readVaultBlock`). A file it
  // cannot parse is an error, never "no vault".
  let vaultBlock: ReturnType<typeof readVaultBlock>;
  try {
    vaultBlock = readVaultBlock(process.cwd());
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // `.env.local` is loaded as before — EXCEPT for `--main` in a vault repo: there the only
  // valid source is what the wrapper injected from `main`, so a leftover file must not fill in
  // a `DATABASE_URL` (develop) that the selection below could take for production.
  if (!(vaultBlock && parsed.main)) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
  }

  let vaultDomain: string | undefined;
  if (vaultBlock) {
    try {
      vaultDomain = readVaultDomain(process.cwd());
    } catch {
      vaultDomain = undefined; // only used to name the login hint
    }
  }

  const selection = selectDatabaseUrl({
    main: parsed.main,
    env: process.env,
    hasVaultBlock: vaultBlock !== null,
    vaultMainEnv: vaultBlock?.envs.main,
    vaultDomain,
  });
  if (!selection.ok) {
    console.error(`❌ ${selection.message}`);
    process.exit(1);
  }
  const databaseUrl = selection.url;
  if (parsed.main) {
    console.error('⚠  Querying the PRODUCTION (main) database (read-only).');
  }

  // Determine SQL to run
  let sql: string;

  if (parsed.tables) {
    sql = LIST_TABLES_SQL;
  } else if (parsed.describe) {
    try {
      sql = describeTableSql(parsed.describe);
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  } else if (parsed.query) {
    sql = parsed.query;
  } else {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Validate query
  const error = validateQuery(sql);
  if (error) {
    console.error(`❌ ${error}`);
    process.exit(1);
  }

  // Execute
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const result = await executeQuery(pool, sql);

    if (result.rows.length === 0 && parsed.describe) {
      console.error(`❌ Table '${parsed.describe}' not found in any accessible schema`);
      process.exit(1);
    }

    // Output
    if (parsed.json) {
      console.log(formatJson(result.rows));
    } else {
      if (result.rows.length === 0) {
        console.log('(0 rows)');
      } else {
        console.log(formatTable(result.rows, result.fields));
      }
      console.log(`\n${result.rowCount} rows returned (${result.durationMs}ms)`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Query failed: ${message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Only run when executed directly (not when imported by tests)
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('db-query.ts') || process.argv[1].endsWith('db-query'));

if (isDirectExecution) {
  main();
}
