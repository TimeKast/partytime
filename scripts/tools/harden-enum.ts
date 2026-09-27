#!/usr/bin/env tsx
/**
 * db:harden-enum — assisted text() → pgEnum graduation driver
 *
 * Promotes a stabilized text-enum column (declared in the ENUMS registry,
 * src/config/enums.ts) to a real PostgreSQL enum type:
 *
 *   pnpm db:harden-enum notificationType
 *   pnpm db:harden-enum notificationType --dry-run
 *
 * Flow:
 *   1. Resolve <name> in ENUMS → { values, table, column }. Unknown name →
 *      descriptive error listing the valid registry keys (exit 1).
 *   2. Orphan check against live data via `pnpm db:query` (read-only runner,
 *      SK.md §1.4): any value outside the registry → STOP (exit 1) reporting
 *      the exact orphan values. Fail-closed: unreachable DB also STOPs.
 *   3. Clean DB → rewrite the schema TS column from text() to pgEnum(...)
 *      referencing the registry values (camelCase key → snake_case SQL name).
 *   4. Generate the migration through `pnpm db:generate --name=...`
 *      (drizzle-kit). Journal + snapshot are written by drizzle-kit itself —
 *      never hand-edited (SK.md §1.2). Because drizzle-kit derives the SQL
 *      from the updated schema TS, schema ↔ snapshot stay in sync and a
 *      subsequent `pnpm db:generate` produces an empty diff by construction.
 *   5. Augment the generated SQL ADDITIVELY, pre-apply (the migrator hashes
 *      the file at migrate time, so editing before the first apply is safe):
 *        - apply-time orphan guard (DO $$ ... RAISE EXCEPTION) at the top —
 *          catches rows inserted between generate and `pnpm db:migrate` that
 *          would make the USING cast fail mid-flight in production
 *        - guarantees the USING cast on the ALTER COLUMN (older drizzle-kit
 *          versions omit it)
 *        - commented ROLLBACK block at the end — the only recovery path
 *          (text → pgEnum has no native undo)
 *   6. Coherence check: the newest drizzle snapshot must contain the new
 *      enum type (warns loudly if not).
 *
 * Nothing is ever applied automatically: the user reviews the migration and
 * runs `pnpm db:migrate` (SK.md §1.1). `db:push` is never used.
 *
 * @see .claude/skills/sk-db/SKILL.md §1.1 (lifecycle text() → pgEnum)
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadEnumRegistry } from './lib/enum-registry.mjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of one registry entry (mirrors EnumRegistryEntry in src/config/enums.ts). */
export interface EnumEntry {
  readonly values: readonly string[];
  readonly table: string;
  readonly column: string;
}

/** Injectable side effects — the real CLI wires Node APIs; tests wire mocks. */
export interface HardenDeps {
  run(cmd: string, timeoutMs?: number): { code: number; out: string };
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  listDir(path: string): string[];
  log(msg: string): void;
}

export interface HardenOptions {
  dryRun?: boolean;
  /** Override for tests — defaults to the real ENUMS registry. */
  registry?: Record<string, EnumEntry>;
  /** Project root — defaults to process.cwd(). */
  root?: string;
}

/** User-facing failure (descriptive message, exit 1) — never a raw crash. */
export class HardenEnumError extends Error {}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** camelCase registry key → snake_case pgEnum SQL name (notificationType → notification_type). */
export function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

// Defense-in-depth (EPIC-06 security audit P3-2): `entry.table` / `entry.column`
// are interpolated into SQL and shell commands below. Today they come from repo
// code (src/config/enums.ts `as const`), but a generated registry must not be
// able to smuggle injection payloads through them.
const SQL_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

/** Validate a registry value as a safe SQL identifier — throws descriptively otherwise. */
export function assertSqlIdentifier(value: string, context: string): void {
  if (!SQL_IDENTIFIER_RE.test(value)) {
    throw new HardenEnumError(
      `Identificador inválido en el registry ENUMS (${context}): '${value}'. ` +
        `Solo se acepta /^[a-z_][a-z0-9_]*$/ — revisa src/config/enums.ts. Nada generado.`
    );
  }
}

/** Resolve the registry entry or fail with the list of valid names. */
export function resolveEnumOrThrow(
  name: string | undefined,
  registry: Record<string, EnumEntry> = loadEnumRegistry() as Record<string, EnumEntry>
): { key: string; entry: EnumEntry } {
  const valid = Object.keys(registry).sort().join(', ');
  if (!name) {
    throw new HardenEnumError(
      `Falta el nombre del enum. Uso: pnpm db:harden-enum <name> [--dry-run]. Nombres válidos: ${valid}`
    );
  }
  const entry = registry[name];
  if (!entry) {
    throw new HardenEnumError(
      `'${name}' no existe en el registry ENUMS (src/config/enums.ts). Nombres válidos: ${valid}`
    );
  }
  // P3-2: validate BEFORE any SQL/shell interpolation downstream.
  assertSqlIdentifier(entry.table, `${name}.table`);
  assertSqlIdentifier(entry.column, `${name}.column`);
  return { key: name, entry };
}

// Extract the rows array from `pnpm db:query --json` output (stdout may carry
// pnpm/script noise around the JSON payload). Returns null when unparsable.
// Same parsing strategy as scripts/tools/preflight.ts (enum advisory check).
export function parseDistinctValues(out: string, column: string): string[] | null {
  const start = out.indexOf('[');
  const end = out.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const rows = JSON.parse(out.slice(start, end + 1)) as Record<string, unknown>[];
    return rows.map((r) => String(r[column]));
  } catch {
    return null;
  }
}

/** DB values not present in the registry — must be empty to graduate. */
export function findOrphans(dbValues: string[], registryValues: readonly string[]): string[] {
  return dbValues.filter((v) => !registryValues.includes(v));
}

// ---------------------------------------------------------------------------
// SQL builders (migration augmentation)
// ---------------------------------------------------------------------------

function quoteValues(values: readonly string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}

/**
 * Apply-time orphan guard — re-validates AT MIGRATE TIME that no row
 * re-introduced a value outside the enum between generate and apply. Without
 * it, a row inserted in that window would make the USING cast fail with a
 * cryptic error in production; with it, the migration fails cleanly first.
 */
export function buildOrphanGuardSql(entry: EnumEntry): string {
  return [
    `-- db:harden-enum apply-time orphan guard: re-validates at migrate time that no`,
    `-- row re-introduced a value outside the enum between generate and apply.`,
    `DO $$ BEGIN`,
    `  IF EXISTS (SELECT 1 FROM "${entry.table}" WHERE "${entry.column}" IS NOT NULL AND "${entry.column}" NOT IN (${quoteValues(entry.values)})) THEN`,
    `    RAISE EXCEPTION 'db:harden-enum: orphan values found in ${entry.table}.${entry.column} — clean them before applying this migration';`,
    `  END IF;`,
    `END $$;--> statement-breakpoint`,
  ].join('\n');
}

/**
 * Commented rollback block — the only recovery path without data loss.
 * text → pgEnum via ALTER COLUMN USING has no native drizzle rollback.
 */
export function buildRollbackComment(entry: EnumEntry, sqlName: string): string {
  return [
    `-- ROLLBACK (manual recovery — put this SQL in a NEW migration applied via pnpm db:migrate;`,
    `-- never edit or re-run an already-applied migration):`,
    `-- ALTER TABLE "${entry.table}" ALTER COLUMN "${entry.column}" TYPE text USING "${entry.column}"::text;`,
    `-- DROP TYPE "public"."${sqlName}";`,
  ].join('\n');
}

/**
 * Guarantee the USING cast on the ALTER COLUMN statement. Recent drizzle-kit
 * emits it; older versions omit it and the ALTER fails on any populated table.
 * Unrecognized shapes are left untouched (drizzle output is trusted as-is).
 */
export function ensureUsingCast(sql: string, entry: EnumEntry, sqlName: string): string {
  const alterRe = new RegExp(
    `(ALTER TABLE (?:"public"\\.)?"${entry.table}" ALTER COLUMN "${entry.column}" SET DATA TYPE [^;]*?)(;)`
  );
  const m = alterRe.exec(sql);
  if (!m || /\bUSING\b/i.test(m[1])) return sql;
  return sql.replace(alterRe, `$1 USING "${entry.column}"::text::"public"."${sqlName}"$2`);
}

/** Guard at the top + guaranteed USING cast + commented rollback at the end. */
export function augmentMigrationSql(sql: string, entry: EnumEntry, sqlName: string): string {
  const withCast = ensureUsingCast(sql, entry, sqlName);
  return `${buildOrphanGuardSql(entry)}\n${withCast.trimEnd()}\n${buildRollbackComment(entry, sqlName)}\n`;
}

// ---------------------------------------------------------------------------
// Schema TS codemod (text() → pgEnum)
// ---------------------------------------------------------------------------

/**
 * Rewrite the schema source: add the pgEnum declaration (referencing the
 * ENUMS registry values) and switch the column builder from text() to it.
 * Fail-closed: any shape this codemod cannot locate confidently → throws
 * with manual instructions instead of guessing.
 */
export function transformSchemaSource(
  source: string,
  key: string,
  entry: EnumEntry,
  sqlName: string
): string {
  const enumVar = `${key}Enum`;
  if (source.includes(`pgEnum('${sqlName}'`)) {
    throw new HardenEnumError(
      `El schema ya define pgEnum('${sqlName}') — nada que promover para '${key}'.`
    );
  }

  // 1. Locate the pgTable('<table>' ...) block (bounded by the next pgTable or EOF).
  const tableRe = new RegExp(`pgTable\\(\\s*'${entry.table}'`);
  const tableMatch = tableRe.exec(source);
  if (!tableMatch) {
    throw new HardenEnumError(`No encontré pgTable('${entry.table}') en el archivo de schema.`);
  }
  const blockStart = tableMatch.index;
  const nextTable = source.indexOf('pgTable(', blockStart + tableMatch[0].length);
  const blockEnd = nextTable === -1 ? source.length : nextTable;

  // 2. Replace the column builder inside that block, preserving chained modifiers.
  const colRe = new RegExp(`text\\(\\s*'${entry.column}'(?:\\s*,\\s*\\{[^}]*\\})?\\s*\\)`);
  const block = source.slice(blockStart, blockEnd);
  const colMatch = colRe.exec(block);
  if (!colMatch) {
    throw new HardenEnumError(
      `No encontré la columna text('${entry.column}') dentro de pgTable('${entry.table}'). ` +
        `Cambio manual requerido: declara \`export const ${enumVar} = pgEnum('${sqlName}', ENUMS.${key}.values);\` ` +
        `y usa \`${enumVar}('${entry.column}')\` en la columna.`
    );
  }
  const newBlock =
    block.slice(0, colMatch.index) +
    `${enumVar}('${entry.column}')` +
    block.slice(colMatch.index + colMatch[0].length);
  let out = source.slice(0, blockStart) + newBlock + source.slice(blockEnd);

  // 3. Ensure pgEnum is imported from drizzle-orm/pg-core.
  const importRe = /import\s*\{([^}]*)\}\s*from\s*'drizzle-orm\/pg-core';/;
  const importMatch = importRe.exec(out);
  if (!importMatch) {
    throw new HardenEnumError(
      `No encontré el import de 'drizzle-orm/pg-core' en el archivo de schema.`
    );
  }
  if (!/\bpgEnum\b/.test(importMatch[1])) {
    const inner = importMatch[1];
    const replacement = inner.includes('\n')
      ? importMatch[0].replace('{', '{\n  pgEnum,')
      : importMatch[0].replace('{', '{ pgEnum,');
    out = out.replace(importMatch[0], replacement);
  }

  // 4. Find the end of the import section (anchored at line start).
  const allImportsRe = /^import[\s\S]*?from\s*'[^']+';/gm;
  let lastImportEnd = 0;
  for (let m = allImportsRe.exec(out); m !== null; m = allImportsRe.exec(out)) {
    lastImportEnd = m.index + m[0].length;
  }
  if (lastImportEnd === 0) {
    throw new HardenEnumError('No encontré la sección de imports del archivo de schema.');
  }

  // 5. Ensure ENUMS is imported (the declaration references the registry SSOT).
  if (!/import\s*\{[^}]*\bENUMS\b[^}]*\}\s*from\s*'@\/config\/enums';/.test(out)) {
    const enumsImport = `\nimport { ENUMS } from '@/config/enums';`;
    out = out.slice(0, lastImportEnd) + enumsImport + out.slice(lastImportEnd);
    lastImportEnd += enumsImport.length;
  }

  // 6. Insert the enum declaration after the imports (before any table uses it).
  const decl = [
    '',
    '',
    '/**',
    ` * PostgreSQL enum for ${entry.table}.${entry.column} — graduated from text() via`,
    ` * \`pnpm db:harden-enum ${key}\`. Values reference the ENUMS registry (SSOT).`,
    ' */',
    `export const ${enumVar} = pgEnum('${sqlName}', ENUMS.${key}.values);`,
  ].join('\n');
  return out.slice(0, lastImportEnd) + decl + out.slice(lastImportEnd);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

function tail(out: string, lines = 6): string {
  return out.split('\n').filter(Boolean).slice(-lines).join('\n');
}

export function hardenEnum(
  name: string | undefined,
  deps: HardenDeps,
  opts: HardenOptions = {}
): void {
  const registry = opts.registry ?? (loadEnumRegistry() as Record<string, EnumEntry>);
  const root = opts.root ?? process.cwd();
  const { key, entry } = resolveEnumOrThrow(name, registry);
  const sqlName = toSnakeCase(key);

  // -- 1. Orphan check against live data (fail-closed) ----------------------
  const distinctSql = `SELECT DISTINCT ${entry.column} FROM ${entry.table} WHERE ${entry.column} IS NOT NULL ORDER BY 1`;
  const query = deps.run(`pnpm --silent db:query --json "${distinctSql}"`, 60_000);
  if (query.code !== 0) {
    throw new HardenEnumError(
      `No pude consultar la DB (pnpm db:query falló). Fail-closed: sin validación de huérfanos no se genera nada.\n${tail(query.out)}`
    );
  }
  const dbValues = parseDistinctValues(query.out, entry.column);
  if (dbValues === null) {
    throw new HardenEnumError(
      'pnpm db:query devolvió un payload no parseable — no puedo validar huérfanos. Nada generado.'
    );
  }
  const orphans = findOrphans(dbValues, entry.values);
  if (orphans.length > 0) {
    throw new HardenEnumError(
      `Valores huérfanos en ${entry.table}.${entry.column}: ${orphans.join(', ')}. ` +
        `Limpia esos valores antes de promover (el cast USING fallaría). Nada generado.`
    );
  }
  deps.log(
    `✅ ${entry.table}.${entry.column} limpio: ${dbValues.length} valor(es) distintos en DB, todos en el registry.`
  );

  // -- 2. Locate + transform the schema file --------------------------------
  const schemaDir = join(root, 'src', 'lib', 'db', 'schema');
  const tableRe = new RegExp(`pgTable\\(\\s*'${entry.table}'`);
  const fileName = deps
    .listDir(schemaDir)
    .filter((f) => f.endsWith('.ts'))
    .find((f) => tableRe.test(deps.readFile(join(schemaDir, f))));
  if (!fileName) {
    throw new HardenEnumError(
      `No encontré pgTable('${entry.table}') en ningún archivo de src/lib/db/schema/.`
    );
  }
  const schemaPath = join(schemaDir, fileName);
  const original = deps.readFile(schemaPath);
  const transformed = transformSchemaSource(original, key, entry, sqlName);

  if (opts.dryRun) {
    deps.log('');
    deps.log(`🔍 Dry-run — nada escrito. Plan para '${key}' (SQL type: ${sqlName}):`);
    deps.log(
      `  1. Schema: ${schemaPath} → text('${entry.column}') pasa a ${key}Enum('${entry.column}')`
    );
    deps.log(
      `  2. Migration (vía pnpm db:generate --name=harden_${sqlName}) con este SQL augmentado:`
    );
    deps.log('');
    deps.log(buildOrphanGuardSql(entry));
    deps.log(
      `CREATE TYPE "public"."${sqlName}" AS ENUM(${quoteValues(entry.values)});--> statement-breakpoint`
    );
    deps.log(
      `ALTER TABLE "${entry.table}" ALTER COLUMN "${entry.column}" SET DATA TYPE "public"."${sqlName}" USING "${entry.column}"::"public"."${sqlName}";`
    );
    deps.log(buildRollbackComment(entry, sqlName));
    return;
  }

  // -- 3. Write schema + journal-tracked migration via drizzle-kit ----------
  deps.writeFile(schemaPath, transformed);
  deps.log(`✏️  Schema actualizado: ${schemaPath} (text('${entry.column}') → ${key}Enum).`);
  const gen = deps.run(`pnpm --silent db:generate --name=harden_${sqlName}`, 120_000);
  if (gen.code !== 0) {
    deps.writeFile(schemaPath, original); // restore — leave the tree untouched
    throw new HardenEnumError(
      `pnpm db:generate falló — schema restaurado a su estado original.\n${tail(gen.out)}`
    );
  }

  // -- 4. Augment the generated SQL (journal read-only; drizzle-kit owns it) -
  const migrationsDir = join(root, 'src', 'lib', 'db', 'migrations');
  const journal = JSON.parse(deps.readFile(join(migrationsDir, 'meta', '_journal.json'))) as {
    entries: { idx: number; tag: string }[];
  };
  const last = journal.entries[journal.entries.length - 1];
  if (!last || !last.tag.includes(`harden_${sqlName}`)) {
    throw new HardenEnumError(
      `No encontré la migration generada en el journal (último tag: ${last?.tag ?? 'ninguno'}). Revisa src/lib/db/migrations/ manualmente.`
    );
  }
  const migrationPath = join(migrationsDir, `${last.tag}.sql`);
  deps.writeFile(migrationPath, augmentMigrationSql(deps.readFile(migrationPath), entry, sqlName));
  deps.log(`📄 Migration generada (journal-tracked, NO aplicada): ${migrationPath}`);

  // -- 5. Coherence check against the newest snapshot ------------------------
  const snapshotPath = join(
    migrationsDir,
    'meta',
    `${String(last.idx).padStart(4, '0')}_snapshot.json`
  );
  let coherent = false;
  try {
    coherent = deps.readFile(snapshotPath).includes(`"${sqlName}"`);
  } catch {
    coherent = false;
  }
  if (coherent) {
    deps.log(
      `✅ Coherencia schema↔migration: el snapshot ${String(last.idx).padStart(4, '0')} registra "${sqlName}" — \`pnpm db:generate\` debe reportar que no hay cambios (diff vacío).`
    );
  } else {
    deps.log(
      `⚠️  El snapshot ${snapshotPath} no contiene "${sqlName}" — posible bug de coherencia entre schema TS y migration. Revisa antes de aplicar.`
    );
  }

  // -- 6. Final instructions (nothing applied) -------------------------------
  deps.log('');
  deps.log('Siguiente paso (manual — nada se aplicó a la DB):');
  deps.log(`  1. Revisa la migration: ${migrationPath}`);
  deps.log(
    '  2. Corre `pnpm typecheck` (si los values de la entry del registry no son un tuple literal `as const`, conviértelos primero en src/config/enums.ts).'
  );
  deps.log('  3. Cuando esté lista: `pnpm db:migrate` (NUNCA `pnpm db:push`).');
  deps.log(
    '  Rollback: el SQL comentado al final de la migration es la única vía de recovery — va en una migration NUEVA, nunca editando una aplicada.'
  );
  deps.log(`  Convención de nombre SQL: ${key} (camelCase) → ${sqlName} (snake_case).`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseCliArgs(argv: string[]): {
  name: string | undefined;
  dryRun: boolean;
  help: boolean;
} {
  return {
    name: argv.find((a) => !a.startsWith('--')),
    dryRun: argv.includes('--dry-run'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function realDeps(): HardenDeps {
  return {
    run(cmd, timeoutMs = 120_000) {
      try {
        const out = execSync(cmd, {
          cwd: process.cwd(),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: timeoutMs,
        });
        return { code: 0, out };
      } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
      }
    },
    readFile: (p) => readFileSync(p, 'utf8'),
    writeFile: (p, content) => writeFileSync(p, content, 'utf8'),
    listDir: (p) => readdirSync(p),
    log: (msg) => console.log(msg),
  };
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      [
        'Usage: pnpm db:harden-enum <name> [--dry-run]',
        '',
        'Promueve un text-enum del registry ENUMS (src/config/enums.ts) a pgEnum:',
        'valida huérfanos en la DB (STOP si hay), actualiza el schema TS y genera',
        'una migration revisable vía drizzle-kit (guard apply-time + rollback',
        'comentado). NUNCA aplica nada — el apply es `pnpm db:migrate` tras revisar.',
        '',
        `Nombres válidos: ${Object.keys(loadEnumRegistry()).sort().join(', ')}`,
      ].join('\n')
    );
    process.exit(0);
  }
  try {
    hardenEnum(args.name, realDeps(), { dryRun: args.dryRun });
    process.exit(0);
  } catch (err) {
    if (err instanceof HardenEnumError) {
      console.error(`🛑 ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

// Only run when executed directly (not when imported by tests).
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('harden-enum.ts') || process.argv[1].endsWith('harden-enum'));

if (isDirectExecution) {
  main();
}
