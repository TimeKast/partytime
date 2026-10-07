#!/usr/bin/env tsx
/**
 * Pre-release Readiness Check — mechanical sweep
 *
 * Runs the kit's existing readiness tools, classifies findings by severity, and
 * emits a readiness report + verdict (READY / READY-WITH-WARNINGS / NOT-READY).
 * No agents — pure tool orchestration. SSOT of report assembly + verdict.
 *
 * Tiers (cumulative):
 *   T1 (static, headless-safe): knip (dead code) + pnpm audit (vulns) +
 *      drizzle-kit check (migration journal) + native-module declaration
 *      (blocking, two ways: a native module imported but not declared in
 *      serverExternalPackages deploys broken at runtime, and an
 *      outputFileTracingIncludes glob over node_modules breaks packaging under
 *      pnpm — neither is caught by any local layer) + bundle size (advisory,
 *      opportunistic: N/A unless .next/static/chunks exists from a prior build —
 *      not validated against the current commit) + enum-registry pgEnum
 *      candidates (advisory, DB-dependent: compares src/config/enums.ts against
 *      live data via `pnpm db:query`; skips gracefully without DATABASE_URL —
 *      informative only, never blocks, in standalone AND deploy modes).
 *   T2 (needs runtime, orchestrated by the tk-preflight skill): Lighthouse
 *      (advisory — capped at warn, never blocks the verdict).
 *      This script ingests lhci results from --lighthouse-dir if present; it does
 *      NOT spin the server (that is the skill's app-lifecycle job).
 *
 * Usage:
 *   pnpm preflight              # full (T1 + ingest T2 lighthouse if present)
 *   pnpm preflight --t1         # static sweep only (skip lighthouse)
 *   pnpm preflight --json       # machine-readable output
 *   pnpm preflight --lighthouse-dir .lighthouseci
 *
 * Exit code: 0 if READY / READY-WITH-WARNINGS, 1 if NOT-READY (so a deploy gate
 * can branch on it, mirroring the existing `pnpm verify` gate).
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { loadEnumRegistry } from './lib/enum-registry.mjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'high' | 'warn' | 'info' | 'ok' | 'na';

export interface CheckResult {
  name: string;
  tier: 'T1' | 'T2';
  severity: Severity;
  summary: string;
  detail: string[];
}

interface ParsedArgs {
  t1Only: boolean;
  json: boolean;
  lighthouseDir: string;
  help: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const NEXT_CHUNKS = join(ROOT, '.next', 'static', 'chunks');
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  warn: 3,
  info: 2,
  ok: 1,
  na: 0,
};
const SEVERITY_ICON: Record<Severity, string> = {
  critical: '🔴',
  high: '🟠',
  warn: '🟡',
  info: '🔵',
  ok: '✅',
  na: '⚪',
};

// ---------------------------------------------------------------------------
// Shell helper — never throws; returns exit code + captured output
// ---------------------------------------------------------------------------

function run(cmd: string, timeoutMs = 180_000): { code: number; out: string } {
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// ---------------------------------------------------------------------------
// T1 checks (static, headless-safe)
// ---------------------------------------------------------------------------

// knip exits non-zero when it finds issues. Count reported lines heuristically.
export function knipIssueLines(out: string): string[] {
  return out.split('\n').filter((l) => /^\s*(Unused|Unlisted|Unresolved|Configuration)/i.test(l));
}

function checkKnip(): CheckResult {
  const { code, out } = run('pnpm exec knip --no-progress', 120_000);
  const issueLines = knipIssueLines(out);
  if (code === 0) {
    return {
      name: 'Dead code (knip)',
      tier: 'T1',
      severity: 'ok',
      summary: 'sin código muerto',
      detail: [],
    };
  }
  return {
    name: 'Dead code (knip)',
    tier: 'T1',
    severity: 'warn',
    summary: `knip reportó issues${issueLines.length ? ` (${issueLines.length} categorías)` : ''}`,
    detail: [...issueLines.slice(0, 8), 'Detalle completo: `pnpm knip`'],
  };
}

interface VulnCounts {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
}

// pnpm audit --json may emit one object or NDJSON; grab the metadata block.
export function parseAuditCounts(out: string): VulnCounts {
  const counts: VulnCounts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
  try {
    const meta = out.match(/"vulnerabilities":\s*\{[^}]*\}/);
    if (meta) Object.assign(counts, JSON.parse(`{${meta[0]}}`).vulnerabilities);
  } catch {
    /* fall through to neutral counts */
  }
  return counts;
}

/**
 * Una advisory que el proyecto acepta a sabiendas: descuenta del conteo que bloquea, pero
 * NUNCA desaparece del report — sale listada como aceptada, con su razón.
 */
export interface AcceptedAdvisory {
  /** GitHub advisory ID — el ancla. NO el nombre del módulo: una vuln NUEVA del mismo paquete debe bloquear. */
  ghsa: string;
  module: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  /** Por qué no aplica o no se puede cerrar. Se imprime en el report. */
  reason: string;
  /** Qué tendría que pasar para retirar la excepción. */
  closesWhen: string;
}

/**
 * 🔴 Excepciones de audit — la lista más peligrosa del archivo. Reglas para tocarla:
 *
 * 1. **Se ancla al `ghsa`, jamás al módulo.** Aceptar "nodemailer high" dejaría pasar la
 *    PRÓXIMA vulnerabilidad high de nodemailer sin que nadie la vea. Con el ID, una vuln
 *    nueva del mismo paquete bloquea igual que siempre.
 * 2. **Solo entra lo que no se puede cerrar**, no lo que da flojera cerrar. Si existe una
 *    versión parcheada instalable, el fix es actualizar.
 * 3. **Se reporta siempre.** El verdict las descuenta; el detalle las nombra. Un release
 *    que "pasa limpio" escondiendo una vuln aceptada es peor que uno que la enseña.
 */
export const ACCEPTED_ADVISORIES: readonly AcceptedAdvisory[] = [
  {
    ghsa: 'GHSA-p6gq-j5cr-w38f',
    module: 'nodemailer',
    severity: 'high',
    reason:
      'La opción `raw` a nivel mensaje evade disableFileAccess/disableUrlAccess. El kit nunca la usa: `sendEmail()` arma cada mensaje desde sus templates y no expone `raw` en su superficie, así que la ruta explotable no existe en el código shippeado.',
    closesWhen:
      'nodemailer >= 9.0.1, que hoy queda fuera del peer de @auth/core (`^7.0.7 || ^8.0.5`). Se retira cuando NextAuth admita v9.',
  },
  {
    ghsa: 'GHSA-2x7j-588g-ccc2',
    module: 'nodemailer',
    severity: 'high',
    reason:
      'DoS por complejidad cuadrática en `addressparser`, explotable con una LISTA de direcciones fabricada. El contrato del kit no expone una lista: `EmailPayload.to` es un `string` de un solo destinatario, y esa dirección viene de la propia base o de un input que `z.email()` ya rechazó si no es una dirección única. Además `nodemailer` solo entra con `EMAIL_PROVIDER=smtp`; el camino que `factory provision` configura es Resend, que no lo usa.',
    closesWhen:
      'nodemailer >= 9.1.0 — mismo bloqueo que GHSA-p6gq-j5cr-w38f: queda fuera del peer de @auth/core (`^7.0.7 || ^8.0.5`). Se retira cuando NextAuth admita v9.',
  },
  {
    ghsa: 'GHSA-v53p-9fqp-m79j',
    module: 'nodemailer',
    severity: 'high',
    reason:
      'DoS por backtracking cuadrático en el fallback de texto libre de `addressparser`: hace falta un encabezado de dirección fabricado. El kit no le entrega ninguno: `EmailPayload.to` es un solo destinatario que viene de la base o de un input que `z.email()` ya validó (el magic link incluido: pasa por `sendEmail`), `from` sale de `EMAIL_FROM` (configuración, no input) y `replyTo` de `SUPPORT_EMAIL`. Además `nodemailer` solo entra con `EMAIL_PROVIDER=smtp`; `factory provision` configura Resend.',
    closesWhen:
      'nodemailer >= 10.0.6 — mismo bloqueo que GHSA-p6gq-j5cr-w38f, ahora en v10: queda fuera del peer de @auth/core (`^7.0.7 || ^8.0.5`). Se retira cuando NextAuth admita v10.',
  },
];

/** Los advisories del JSON de `pnpm audit`, con su ID — el metadata agregado no los distingue. */
export function parseAuditAdvisories(out: string): { ghsa: string; severity: string }[] {
  try {
    const parsed = JSON.parse(out) as {
      advisories?: Record<string, { github_advisory_id?: string; severity?: string }>;
    };
    return Object.values(parsed.advisories ?? {}).map((a) => ({
      ghsa: a.github_advisory_id ?? '',
      severity: a.severity ?? '',
    }));
  } catch {
    return []; // sin advisories parseables no se descuenta nada — fail-closed
  }
}

/**
 * Descuenta del conteo las advisories aceptadas. Fail-closed por construcción: si el JSON no
 * se pudo parsear, `found` viene vacío y NO se descuenta nada — el gate bloquea como si no
 * hubiera excepción. Una lista de excepciones que se aplica a ciegas es peor que ninguna.
 */
export function applyAcceptedAdvisories(
  counts: VulnCounts,
  found: { ghsa: string; severity: string }[],
  accepted: readonly AcceptedAdvisory[] = ACCEPTED_ADVISORIES
): { counts: VulnCounts; applied: AcceptedAdvisory[] } {
  const adjusted = { ...counts };
  const applied: AcceptedAdvisory[] = [];

  for (const entry of accepted) {
    // Solo descuenta si la advisory EXISTE en esta corrida con la severidad declarada.
    // Una entrada stale (ya parcheada, o que cambió de severidad) no resta nada.
    const hit = found.find((f) => f.ghsa === entry.ghsa && f.severity === entry.severity);
    if (!hit) continue;
    if (adjusted[entry.severity] > 0) {
      adjusted[entry.severity] -= 1;
      applied.push(entry);
    }
  }

  return { counts: adjusted, applied };
}

export function auditVerdict(counts: VulnCounts): { severity: Severity; summary: string } {
  const total = counts.critical + counts.high + counts.moderate + counts.low;
  if (counts.critical > 0)
    return { severity: 'critical', summary: `${counts.critical} critical vuln(s)` };
  if (counts.high > 0) return { severity: 'high', summary: `${counts.high} high vuln(s)` };
  if (counts.moderate > 0)
    return { severity: 'warn', summary: `${counts.moderate} moderate vuln(s)` };
  if (total > 0) return { severity: 'info', summary: `${total} low-severity vuln(s)` };
  return { severity: 'ok', summary: 'sin vulnerabilidades' };
}

function checkAudit(): CheckResult {
  // --prod: only production deps gate readiness (dev-tool vulns don't ship).
  const { out } = run('pnpm audit --prod --json', 120_000);
  const raw = parseAuditCounts(out);
  const { counts, applied } = applyAcceptedAdvisories(raw, parseAuditAdvisories(out));
  const { severity, summary } = auditVerdict(counts);

  // Las aceptadas se nombran SIEMPRE, pasen o no — un verdict limpio que esconde una vuln
  // aceptada es peor que uno que la enseña.
  const acceptedLines = applied.flatMap((a) => [
    `⚖️  Aceptada: ${a.module} ${a.severity} (${a.ghsa}) — ${a.reason}`,
    `    Se retira cuando: ${a.closesWhen}`,
  ]);

  if (severity === 'ok') {
    return {
      name: 'Dep audit (pnpm audit)',
      tier: 'T1',
      severity: 'ok',
      summary: applied.length ? `${summary} (${applied.length} aceptada(s))` : summary,
      detail: acceptedLines,
    };
  }
  return mkVuln(severity, counts, summary, acceptedLines);
}

function mkVuln(
  severity: Severity,
  counts: VulnCounts,
  summary: string,
  acceptedLines: string[] = []
): CheckResult {
  return {
    name: 'Dep audit (pnpm audit)',
    tier: 'T1',
    severity,
    summary,
    detail: [
      `critical:${counts.critical} high:${counts.high} moderate:${counts.moderate} low:${counts.low}`,
      ...acceptedLines,
      'Detalle: `pnpm audit`',
    ],
  };
}

// ---------------------------------------------------------------------------
// T1 check — migrations: journal consistency + the missing initial migration
// ---------------------------------------------------------------------------
//
// 📋 CALQUED from cli/src/lib/initial-migration.ts — `needsInitialMigration`,
// `SCHEMA_DIR` / `MIGRATIONS_DIR` / `MIGRATION_SQL_EXT`, and the ADR-003 lockfile
// signal (`isFactoryCheckout`). COPIED, NEVER IMPORTED, and that is a distribution
// constraint, not a preference: `cli/**` is excluded from the `full` profile
// (distribution/profiles.json → `profiles.full.exclude`) while `scripts/**` is a
// TRACKED path that ships to every derivative, so an import across that frontier
// would resolve inside the Factory and fail to resolve everywhere the file actually
// runs. Same precedent, opposite direction: cli/src/lib/backlog-parse.ts:6-10
// calques the regex shape of scripts/tools/update-board.ts.
//
// 🔴 Two copies of a decision drift in silence unless something asserts otherwise.
// scripts/tools/__tests__/preflight.test.ts imports BOTH sides and asserts they
// answer the same for every combination of the three facts — that test is the whole
// guarantee. It stays in the Factory (`scripts/tools/__tests__/**` is excluded from
// distribution), which is exactly where both copies live.

/** Drizzle schema directory (`drizzle.config.ts` `schema`). Calque of `SCHEMA_DIR`. */
const SCHEMA_DIR = 'src/lib/db/schema';

/** Drizzle migrations output directory (`drizzle.config.ts` `out`). Calque of `MIGRATIONS_DIR`. */
const MIGRATIONS_DIR = 'src/lib/db/migrations';

/** Extension of a generated drizzle migration. Calque of `MIGRATION_SQL_EXT`. */
const MIGRATION_SQL_EXT = '.sql';

/**
 * The derivative's lockfile — calque of `hasLockfile` (`TIMEKAST_DIR`/`LOCKFILE_FILE`).
 * `new`/`add`/`update` write it in every derivative and the Factory has none, so its
 * ABSENCE reads as "this is the Factory, or a checkout that cannot be identified"
 * (ADR-003: the absence wins over a project-config that claims otherwise).
 */
const LOCKFILE_PATH = join('.timekast', 'lockfile.json');

/** The three facts the classifier decides on, already resolved from disk. */
export interface MigrationFacts {
  /** The repo ships a Drizzle schema to generate from. */
  hasSchema: boolean;
  /** At least one generated `.sql` already lives in the migrations directory. */
  hasMigrations: boolean;
  /** The Factory itself, or a checkout that cannot be identified — see `LOCKFILE_PATH`. */
  isFactory: boolean;
}

/** Resolve the three facts from disk, ready for {@link migrationsSeverity}. */
export function readMigrationFacts(rootDir: string): MigrationFacts {
  const migrationsDir = join(rootDir, MIGRATIONS_DIR);
  let hasMigrations = false;
  if (existsSync(migrationsDir)) {
    try {
      hasMigrations = readdirSync(migrationsDir).some((f) =>
        f.toLowerCase().endsWith(MIGRATION_SQL_EXT)
      );
    } catch {
      hasMigrations = false; // unreadable directory reads as "cannot confirm"
    }
  }
  return {
    hasSchema: existsSync(join(rootDir, SCHEMA_DIR)),
    hasMigrations,
    isFactory: !existsSync(join(rootDir, LOCKFILE_PATH)),
  };
}

/**
 * Does this checkout have the missing-initial-migration gap, and how loud does the
 * report get about it? Pure by design (the caller resolves the facts) so it can be
 * exercised — and compared against the CLI copy — without touching disk.
 *
 * `warn` here means exactly what `needsInitialMigration` means by `true`: a derivative
 * with a schema and no `.sql`. Everything else is `na`.
 *
 * 🔴 `warn`, NEVER `high` — and the reason belongs in the code, not only in the issue
 * that asked for it. `high` makes the verdict NOT-READY with exit 1 (see `verdict`),
 * which would stop the `/deploy` of the three live derivatives that ship without
 * migrations today. Worse, the remedy this very check prints (`pnpm db:generate`) would
 * leave them WORSE than they are: drizzle-kit emits `CREATE TABLE` WITHOUT
 * `IF NOT EXISTS`, so applying that `0000` over an already-populated database fails with
 * `relation "users" already exists` and the build stops deploying altogether. The signal
 * stays; the block does not.
 */
export function migrationsSeverity({
  hasSchema,
  hasMigrations,
  isFactory,
}: MigrationFacts): 'na' | 'warn' {
  // Unidentifiable checkout → no opinion. This short-circuit READ as "the Factory keeps
  // no migrations, by design" until BR-FACTORY-005 was rewritten: the Factory now keeps
  // its own (excluded from both distribution profiles so no derivative inherits them), so
  // it reaches `hasMigrations: true` and lands on `na` by the normal branch anyway. What
  // survives is the OTHER half of the signal — an absent lockfile also means "a checkout
  // that cannot be identified" (ADR-003), and this check does not guess at those.
  // The Factory's own coverage is elsewhere: `drizzle-kit check` below, plus the
  // anti-leak gate in tests/unit/distribution/build-dist.test.ts.
  if (isFactory) return 'na';
  if (!hasSchema) return 'na'; // nothing to generate from
  return hasMigrations ? 'na' : 'warn'; // a `.sql` already there means it was done
}

const MIGRATIONS_CHECK_NAME = 'Migrations (drizzle-kit check)';

/** The gap in one line: what is there, what is missing. */
const MISSING_MIGRATION_SUMMARY = `hay \`${SCHEMA_DIR}/\` pero ninguna migración generada en \`${MIGRATIONS_DIR}/\``;

/**
 * The remedy AND the why. An advisory without a remedy is not actionable, and one
 * without the consequence gets ignored until a deploy explains it the hard way.
 * Exported so the suite can assert both halves survive an edit.
 */
export const MISSING_MIGRATION_DETAIL: string[] = [
  'Remedio: corre `pnpm db:generate` y commitea el `0000` junto con el schema.',
  'Por qué importa: cada deploy migra — en Vercel, `vercel-build` corre `pnpm build && pnpm db:migrate`;',
  'en Railway, el pre-deploy corre `pnpm db:migrate` después del build —, así que sin ningún `.sql`',
  'el deploy no crea las tablas y la app arranca contra una base vacía — el error aparece en',
  'runtime, con el build en verde.',
  '⚠️ Si la base de ese ambiente YA está poblada, no apliques el `0000` a ciegas: drizzle-kit',
  '   lo emite con `CREATE TABLE` sin `IF NOT EXISTS` y truena con `relation ... already exists`.',
  '   Ese caso necesita un baseline por ambiente, no un `db:generate` suelto.',
];

function checkMigrations(): CheckResult {
  const facts = readMigrationFacts(ROOT);

  // The gap comes first: it is the only branch that has something to say when there
  // is nothing to validate yet.
  const gap = migrationsSeverity(facts);
  if (gap === 'warn') {
    return {
      name: MIGRATIONS_CHECK_NAME,
      tier: 'T1',
      severity: gap,
      summary: MISSING_MIGRATION_SUMMARY,
      detail: MISSING_MIGRATION_DETAIL,
    };
  }

  // Guard (kept): never invoke `drizzle-kit check` without a `.sql` to validate. A repo
  // without a schema has none, and a derivative is born without them (it generates its
  // own `0000` at provision — the Factory's never ship). Run in that state, `drizzle-kit check`
  // MATERIALIZES the `out` dir (`src/lib/db/migrations/meta/_journal.json`) out of
  // nothing — an untracked artifact that then surfaces as a surprise on every `/deploy`
  // pre-check.
  if (!facts.hasMigrations) {
    return {
      name: MIGRATIONS_CHECK_NAME,
      tier: 'T1',
      severity: 'na',
      summary: 'sin migrations que validar (drizzle-kit check omitido)',
      detail: [],
    };
  }

  // `drizzle-kit check` validates the migration journal for consistency.
  // Headless-safe: reads migration files, no DB connection.
  const { code, out } = run('pnpm exec drizzle-kit check', 60_000);
  if (code === 0) {
    return {
      name: MIGRATIONS_CHECK_NAME,
      tier: 'T1',
      severity: 'ok',
      summary: 'journal consistente',
      detail: [],
    };
  }
  return {
    name: MIGRATIONS_CHECK_NAME,
    tier: 'T1',
    severity: 'high',
    summary: 'inconsistencia en el journal de migrations',
    detail: [...out.split('\n').filter(Boolean).slice(-6)],
  };
}

export function parseBundle(out: string): { over500: number; total: string } {
  const over500 = Number(out.match(/Chunks > 500KB:\s*(\d+)/)?.[1] ?? 0);
  const total = out.match(/Total size:\s*([^\n]+)/)?.[1]?.trim() ?? '?';
  return { over500, total };
}

// Advisory: .next/static/chunks is not validated against the current commit
// (it may be a stale build from another branch) → quality signal, never blocks.
export function bundleSeverity(over500: number): Severity {
  return over500 === 0 ? 'ok' : 'warn';
}

function checkBundle(): CheckResult {
  if (!existsSync(NEXT_CHUNKS)) {
    return {
      name: 'Bundle size',
      tier: 'T1',
      severity: 'na',
      summary: 'sin build (.next ausente) — corre `pnpm build` primero',
      detail: [],
    };
  }
  const { out } = run('node scripts/tools/analyze-bundle.mjs', 60_000);
  const { over500, total: totalLine } = parseBundle(out);
  if (over500 === 0)
    return {
      name: 'Bundle size',
      tier: 'T1',
      severity: 'ok',
      summary: `sin chunks >500KB (total ${totalLine})`,
      detail: [],
    };
  const severity = bundleSeverity(over500);
  return {
    name: 'Bundle size',
    tier: 'T1',
    severity,
    summary: `${over500} chunk(s) >500KB (total ${totalLine})`,
    detail: [
      ...out
        .split('\n')
        .filter((l) => l.includes('KB)'))
        .slice(0, 6),
      'Detalle: `pnpm analyze`',
    ],
  };
}

// ---------------------------------------------------------------------------
// T1 check — enum-registry pgEnum candidates (advisory, AUDIT-010)
// ---------------------------------------------------------------------------

// camelCase registry key → snake_case pgEnum SQL name (notificationType → notification_type).
function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

// Defense-in-depth (EPIC-06 security audit P3-2): `entry.table` / `entry.column`
// are interpolated into the SQL/shell command below. Today they come from repo
// code (src/config/enums.ts `as const`), but a generated registry must not be
// able to smuggle injection payloads. Invalid entries are skipped with a note
// and the check surfaces a `warn` (still non-blocking — exit 0).
const SQL_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

// Extract the rows array from `pnpm db:query --json` output (stdout may carry
// pnpm/script noise around the JSON payload). Returns null when unparsable.
function parseDistinctValues(out: string, column: string): string[] | null {
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

// Advisory only (AUDIT-010): compares src/config/enums.ts (registry SSOT for
// text-enum columns) against live DB data via `pnpm db:query` (SK.md §1.4 —
// env loading + pool + read-only guard already solved there). Candidates are
// printed as an informative list — never an error, never blocks the verdict
// (severity caps at `info`), in standalone AND deploy (--t1) modes. Without
// DATABASE_URL / unreachable DB the check skips gracefully (`na`). The
// interactive promotion flow lives in the tk-preflight skill (AUDIT-011).
function checkEnumRegistry(): CheckResult {
  const name = 'Enum registry (pgEnum advisory)';
  const detail: string[] = [];
  const invalidEntries: string[] = [];
  let candidates = 0;
  let reachable = 0;

  // The registry is the kit's text-enum convention (src/config/enums.ts). A
  // derivative may not have it (predates AUDIT-010, or uses native pgEnum) —
  // load it lazily and no-op when absent instead of hard-importing it.
  const ENUMS = loadEnumRegistry() as Record<
    string,
    { values: readonly string[]; table: string; column: string }
  >;
  if (Object.keys(ENUMS).length === 0) {
    return {
      name,
      tier: 'T1',
      severity: 'na',
      summary:
        'sin registry text-enum (src/config/enums.ts ausente) — advisory omitido (no bloquea)',
      detail: [],
    };
  }

  for (const [key, entry] of Object.entries(ENUMS)) {
    // P3-2: validate identifiers BEFORE building SQL — skip the entry with a note.
    if (!SQL_IDENTIFIER_RE.test(entry.table) || !SQL_IDENTIFIER_RE.test(entry.column)) {
      invalidEntries.push(
        `${key}: identificador inválido ('${entry.table}'.'${entry.column}') — entry omitida; ` +
          `solo se acepta /^[a-z_][a-z0-9_]*$/ (revisa src/config/enums.ts)`
      );
      continue;
    }
    const sql = `SELECT DISTINCT ${entry.column} FROM ${entry.table} ORDER BY 1`;
    const { code, out } = run(`pnpm --silent db:query --json "${sql}"`, 60_000);
    if (code !== 0) continue; // table/DB unreachable → skip this entry silently
    const dbValues = parseDistinctValues(out, entry.column);
    if (dbValues === null) continue;
    reachable++;
    const registryValues = entry.values as readonly string[];
    const orphans = dbValues.filter((v) => !registryValues.includes(v));
    let line = `${entry.table}.${entry.column} (pgEnum SQL: ${toSnakeCase(key)}) — valores: ${registryValues.join(', ')}`;
    if (orphans.length > 0) {
      line += ` · valores en DB fuera del registry: ${orphans.join(', ')} (limpiar antes de promover)`;
    } else {
      candidates++;
    }
    detail.push(line);
  }

  // Invalid identifiers are a registry-integrity problem, not an advisory:
  // surface them as warn (non-blocking) even when the DB is unreachable.
  if (invalidEntries.length > 0) {
    return {
      name,
      tier: 'T1',
      severity: 'warn',
      summary: `${invalidEntries.length} entry(s) del registry con identificadores inválidos — revisar src/config/enums.ts`,
      detail: [...invalidEntries, ...detail],
    };
  }

  if (reachable === 0) {
    return {
      name,
      tier: 'T1',
      severity: 'na',
      summary: 'DB no accesible o DATABASE_URL ausente — advisory omitido (no bloquea)',
      detail: [],
    };
  }

  detail.push('Para promover a pgEnum: `pnpm db:harden-enum <name>`');
  return {
    name,
    tier: 'T1',
    severity: 'info',
    summary: `${candidates} candidato(s) a pgEnum detectado(s) — advisory, no bloquea`,
    detail,
  };
}

// ---------------------------------------------------------------------------
// T1 check — native modules declared for output file tracing
// ---------------------------------------------------------------------------
//
// A native module (one that dlopen()s a system library) needs TWO things, and
// production proved the second is the one that actually bites:
//
//   1. `pnpm.supportedArchitectures` in package.json — the ROOT cause. pnpm
//      installs only the current platform's optional binaries, so a mac dev tree
//      never materialises @img/sharp-libvips-linux-x64 (which carries
//      libvips-cpp.so) and the Linux function throws ERR_DLOPEN_FAILED. The
//      lockfile always resolved it; the install FILTER was what excluded it.
//   2. `serverExternalPackages` in next.config.ts — keeps Next from bundling it.
//
// Checked in that order, because a deploy with (2) alone still failed in
// production: the enrolment kept breaking until (1) landed.
//
// This check exists because that failure is invisible to every other layer:
// build, lint, typecheck and the whole test suite go green, and it only shows up
// once deployed, as ERR_DLOPEN_FAILED. Worse, the throw lands at module
// EVALUATION, so it takes down every server action sharing the route's module —
// a derivative lost TOTP enrolment to a broken image resizer on the same page.
//
// It also catches the WRONG fix, which cost a real deploy: reaching for
// `outputFileTracingIncludes` globs over `node_modules/**`. Under pnpm those are
// symlinks into the content-addressed store, and Vercel refuses to package a
// function assembled through one ("files in symlinked directories"). That one
// fails at PACKAGING — a stage later, after a green build.
//
// Deliberately an allowlist, not a node_modules scan: the set of native packages
// a Next app pulls in is small and slow-moving, while walking the install tree
// for `.node`/`.so` files on every preflight is expensive and still guesses. A
// derivative that adds one extends this list.

export const NATIVE_PACKAGES = [
  'sharp',
  'canvas',
  'better-sqlite3',
  'bcrypt', // the native one — `bcryptjs` (what the kit ships) is pure JS
  'argon2',
  're2',
  'node-canvas',
];

// Source-level scan: which native packages does this repo actually import?
// A package nobody imports needs no declaration, so it is not a finding.
export function detectNativeImports(
  files: { path: string; content: string }[],
  natives: readonly string[] = NATIVE_PACKAGES
): { pkg: string; path: string }[] {
  const found: { pkg: string; path: string }[] = [];
  for (const { path, content } of files) {
    for (const pkg of natives) {
      // Static (`from 'sharp'`), dynamic (`import('sharp')`) and CJS require.
      const re = new RegExp(
        `(?:from\\s*['"]${pkg}['"]|import\\s*\\(\\s*['"]${pkg}['"]|require\\s*\\(\\s*['"]${pkg}['"])`
      );
      if (re.test(content)) found.push({ pkg, path });
    }
  }
  return found;
}

// Which packages does next.config.ts declare? Parsed from source text rather
// than by importing the config — importing it would execute the Sentry and
// Serwist wrappers as a side effect.
export function parseTracedPackages(configSource: string): Set<string> {
  const traced = new Set<string>();
  const tracingBlock = configSource.match(/outputFileTracingIncludes\s*:\s*\{[\s\S]*?\n\s*\}/)?.[0];
  const externalBlock = configSource.match(/serverExternalPackages\s*:\s*\[[\s\S]*?\]/)?.[0];

  for (const pkg of NATIVE_PACKAGES) {
    // A tracing glob mentioning the package name counts as declared. The kit's
    // own globs name the platform sub-packages (@img/sharp-linux-x64), so match
    // on the bare name appearing anywhere inside the block.
    if (tracingBlock?.includes(pkg)) traced.add(pkg);
    if (externalBlock?.includes(`'${pkg}'`) || externalBlock?.includes(`"${pkg}"`)) traced.add(pkg);
  }
  return traced;
}

// The platforms a deploy target actually runs on. pnpm installs ONLY the current
// platform's optional binaries, so a mac dev tree silently lacks the Linux ones
// and the deployed function dies with ERR_DLOPEN_FAILED — while the lockfile
// looks complete, because resolution was never the problem, materialisation was.
const REQUIRED_ARCH: { key: 'os' | 'cpu'; value: string }[] = [
  { key: 'os', value: 'linux' },
  { key: 'cpu', value: 'x64' },
];

interface PkgWithArch {
  pnpm?: { supportedArchitectures?: { os?: string[]; cpu?: string[] } };
}

// Which required platform entries is package.json missing? Empty array = fine.
export function missingArchitectures(pkg: PkgWithArch): string[] {
  const declared = pkg.pnpm?.supportedArchitectures;
  if (!declared) return REQUIRED_ARCH.map((r) => `${r.key}: ${r.value}`);
  return REQUIRED_ARCH.filter((r) => !(declared[r.key] ?? []).includes(r.value)).map(
    (r) => `${r.key}: ${r.value}`
  );
}

// Tracing globs that reach into node_modules. Under pnpm every entry there is a
// symlink into the store, and Vercel rejects a function packaged through one:
//   "invalid deployment package… files in symlinked directories"
// Returns the offending globs so the report can name them.
export function symlinkedTracingGlobs(configSource: string): string[] {
  const block = configSource.match(/outputFileTracingIncludes\s*:\s*\{[\s\S]*?\n\s*\}/)?.[0];
  if (!block) return [];
  return [...block.matchAll(/['"]([^'"]*node_modules[^'"]*)['"]/g)].map((m) => m[1]);
}

// A native module imported but never declared is the exact bug this catches.
export function nativeTracingFindings(
  imported: { pkg: string; path: string }[],
  traced: Set<string>
): { pkg: string; paths: string[] }[] {
  const byPkg = new Map<string, string[]>();
  for (const { pkg, path } of imported) {
    if (traced.has(pkg)) continue;
    byPkg.set(pkg, [...(byPkg.get(pkg) ?? []), path]);
  }
  return [...byPkg.entries()].map(([pkg, paths]) => ({ pkg, paths }));
}

function checkNativeTracing(): CheckResult {
  const name = 'Native modules (deploy readiness)';
  const configPath = join(ROOT, 'next.config.ts');

  // No Next config → not a Next app (a `core` repo). Nothing to check.
  if (!existsSync(configPath) || !existsSync(join(ROOT, 'src'))) {
    return {
      name,
      tier: 'T1',
      severity: 'na',
      summary: 'sin next.config.ts o src/ — check omitido (no aplica)',
      detail: [],
    };
  }

  // grep -l over the source tree: cheaper than reading every file, and the
  // pipeline is a genuine multi-step shell job.
  const alternation = NATIVE_PACKAGES.join('|');
  const { out } = run(
    `grep -rlE "(from|import\\(|require\\()[[:space:]]*['\\"](${alternation})['\\"]" src --include='*.ts' --include='*.tsx' || true`,
    30_000
  );
  const candidatePaths = out.split('\n').filter(Boolean);

  const files = candidatePaths
    .filter((p) => existsSync(join(ROOT, p)))
    .map((p) => ({ path: p, content: readFileSync(join(ROOT, p), 'utf-8') }));

  const configSource = readFileSync(configPath, 'utf-8');

  // Checked before the import scan: a symlinked glob breaks the deploy whether
  // or not this repo imports anything native.
  const badGlobs = symlinkedTracingGlobs(configSource);
  if (badGlobs.length > 0) {
    return {
      name,
      tier: 'T1',
      severity: 'high',
      summary: `${badGlobs.length} glob(s) de outputFileTracingIncludes apuntan a node_modules`,
      detail: [
        ...badGlobs.slice(0, 4),
        'Con pnpm esos paths son symlinks al store; Vercel rechaza empaquetar una',
        'función construida a través de uno ("files in symlinked directories").',
        'Falla al EMPAQUETAR, después de un build verde.',
        'Fix: quita los globs y declara el paquete en `serverExternalPackages`.',
      ],
    };
  }

  const imported = detectNativeImports(files);
  if (imported.length === 0) {
    return {
      name,
      tier: 'T1',
      severity: 'ok',
      summary: 'sin módulos nativos importados desde src/',
      detail: [],
    };
  }

  // Checked before the bundling declaration, because it is the ROOT cause and
  // the one that actually broke production: serverExternalPackages was in place
  // and the enrolment still failed, because the Linux binary was never installed.
  const pkgPath = join(ROOT, 'package.json');
  if (existsSync(pkgPath)) {
    const missing = missingArchitectures(JSON.parse(readFileSync(pkgPath, 'utf-8')) as PkgWithArch);
    if (missing.length > 0) {
      const pkgs = [...new Set(imported.map((i) => i.pkg))].join(', ');
      return {
        name,
        tier: 'T1',
        severity: 'high',
        summary: `${pkgs}: falta \`pnpm.supportedArchitectures\` (${missing.join(', ')})`,
        detail: [
          'pnpm instala SOLO los binarios de la plataforma actual, así que un árbol',
          'de dev en mac nunca materializa los de Linux y la función desplegada',
          'muere con ERR_DLOPEN_FAILED. El lockfile se ve completo: la resolución',
          'nunca fue el problema, la materialización sí.',
          'Fix en package.json:',
          '  "pnpm": { "supportedArchitectures": {',
          '    "os": ["current", "linux"], "cpu": ["current", "x64", "arm64"] } }',
          'Luego `pnpm install` (el lockfile NO cambia; bajan los binarios que faltaban).',
        ],
      };
    }
  }

  const traced = parseTracedPackages(configSource);
  const findings = nativeTracingFindings(imported, traced);

  if (findings.length === 0) {
    const declared = [...new Set(imported.map((i) => i.pkg))].join(', ');
    return {
      name,
      tier: 'T1',
      severity: 'ok',
      summary: `${declared} declarado(s) + supportedArchitectures cubre linux/x64`,
      detail: [],
    };
  }

  // Blocking on purpose. A false positive costs one line in next.config.ts; a
  // false negative ships a deploy where a server action dies at runtime with a
  // log that names a system library and nothing about the feature that broke.
  return {
    name,
    tier: 'T1',
    severity: 'high',
    summary: `${findings.length} módulo(s) nativo(s) sin declarar en next.config.ts`,
    detail: [
      ...findings.map((f) => `${f.pkg} — importado en ${f.paths.slice(0, 3).join(', ')}`),
      'El binario no viaja a la función desplegada → ERR_DLOPEN_FAILED en runtime.',
      'Fix: agrega el paquete a `serverExternalPackages` en next.config.ts.',
      '⚠️ NO uses globs de `outputFileTracingIncludes` sobre node_modules: con pnpm',
      '   son symlinks y Vercel rechaza el empaquetado.',
    ],
  };
}

// ---------------------------------------------------------------------------
// T2 check (runtime — ingest only; the skill spins the server + runs lhci)
// ---------------------------------------------------------------------------

interface LhrScores {
  perf: number;
  a11y: number;
  bp: number;
  seo: number;
}

// lhci writes the four category scores as 0..1 floats; round to 0..100 ints.
export function parseLhrScores(jsonText: string): LhrScores | null {
  try {
    const data = JSON.parse(jsonText);
    const cat = data.categories ?? {};
    const score = (k: string) => Math.round((cat[k]?.score ?? 0) * 100);
    return {
      perf: score('performance'),
      a11y: score('accessibility'),
      bp: score('best-practices'),
      seo: score('seo'),
    };
  } catch {
    return null;
  }
}

// Advisory: local Lighthouse is non-deterministic (perf varies per run/machine)
// and only audits the public route → capped at warn, never blocks the verdict.
export function lhrSeverity(worst: number): Severity {
  return worst >= 90 ? 'ok' : 'warn';
}

// Median per category across all lhr reports (lhci writes one per run). Median
// over min: a single noisy run must not drag the advisory down (lhci itself
// aggregates by median), and it tolerates mixed pools (autorun: URLs × runs).
// Even count: mean of the two central values (standard median).
export function aggregateLhrScores(reports: LhrScores[]): LhrScores | null {
  if (reports.length === 0) return null;
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };
  return {
    perf: median(reports.map((r) => r.perf)),
    a11y: median(reports.map((r) => r.a11y)),
    bp: median(reports.map((r) => r.bp)),
    seo: median(reports.map((r) => r.seo)),
  };
}

function checkLighthouse(dir: string): CheckResult {
  const lhDir = join(ROOT, dir);
  if (!existsSync(lhDir)) {
    return {
      name: 'Lighthouse',
      tier: 'T2',
      severity: 'na',
      summary: `sin resultados en ${dir}/ — el skill levanta la app y corre lhci`,
      detail: [],
    };
  }
  // lhci writes one lhr-*.json report per run into .lighthouseci/
  const lhrFiles = readdirSync(lhDir).filter((f) => /^lhr-.*\.json$/.test(f));
  if (lhrFiles.length === 0) {
    return {
      name: 'Lighthouse',
      tier: 'T2',
      severity: 'na',
      summary: 'sin reporte lhr en .lighthouseci/',
      detail: [],
    };
  }
  const parsed = lhrFiles
    .map((f) => parseLhrScores(readFileSync(join(lhDir, f), 'utf8')))
    .filter((s): s is LhrScores => s !== null);
  const scores = aggregateLhrScores(parsed);
  if (!scores) {
    return {
      name: 'Lighthouse',
      tier: 'T2',
      severity: 'na',
      summary: 'no se pudo parsear ningún reporte lhr',
      detail: [],
    };
  }
  // .lighthouseci/ has the same staleness caveat as .next/ — surface the date.
  const newestMtime = lhrFiles
    .map((f) => statSync(join(lhDir, f)).mtime)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const detail = [
    `perf:${scores.perf} a11y:${scores.a11y} best-practices:${scores.bp} seo:${scores.seo}`,
  ];
  const worst = Math.min(scores.perf, scores.a11y, scores.bp, scores.seo);
  return {
    name: 'Lighthouse',
    tier: 'T2',
    severity: lhrSeverity(worst),
    summary: `mediana de ${parsed.length} report(s), score mín ${worst} (advisory; run del ${newestMtime.toISOString().slice(0, 10)})`,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Project extension point (EXTPT-001)
// ---------------------------------------------------------------------------

/** The project's own checks file, relative to this script — a sibling, like `e2e.project.ts`. */
export const PROJECT_PREFLIGHT_MODULE = 'preflight.project.ts';
/** How that file is named in messages and documentation. */
export const PROJECT_PREFLIGHT_PATH = `scripts/tools/${PROJECT_PREFLIGHT_MODULE}`;

/**
 * Read what a project exports from `preflight.project.ts` and refuse anything the
 * report or the verdict could not use.
 *
 * Accepted shapes, and nothing else: a default export that is an array of checks, a
 * bare `module.exports = [...]` (what a `.ts` compiled to CommonJS looks like either
 * way), or a function returning that array — a check often has to read something, and
 * a project should not have to do it at module load.
 *
 * 🔴 An unknown `severity` is rejected rather than tolerated. `verdict()` ranks by
 * `SEVERITY_RANK[severity]`, and a missing key ranks as `undefined`, which loses every
 * comparison: a project's blocking check spelled `'blocker'` would print in the report
 * and leave the verdict READY. That is the failure this extension point exists to avoid,
 * so it is a load-time error with the offending word in it.
 */
export function interpretProjectChecks(loaded: unknown): CheckResult[] {
  const record =
    typeof loaded === 'object' && loaded !== null ? (loaded as Record<string, unknown>) : {};
  const exported = Array.isArray(loaded) ? loaded : record.default;
  const value = typeof exported === 'function' ? (exported as () => unknown)() : exported;

  if (!Array.isArray(value)) {
    throw new Error(
      `${PROJECT_PREFLIGHT_PATH} debe exportar por default un arreglo de checks ` +
        `(o una función que lo devuelva); recibí ` +
        `${exported === undefined ? 'ningún default export' : typeof value}.`
    );
  }

  return value.map((entry, index) => {
    const check =
      typeof entry === 'object' && entry !== null ? (entry as Partial<CheckResult>) : null;
    if (!check || typeof check.name !== 'string' || check.name === '') {
      throw new Error(
        `${PROJECT_PREFLIGHT_PATH}: el check #${index + 1} no tiene 'name' — el reporte lo ` +
          `imprime como primera columna.`
      );
    }
    // `hasOwnProperty`, NOT `in`: `in` walks the prototype chain, so `'toString'`,
    // `'constructor'` and `'valueOf'` would pass this guard, rank as `undefined` in
    // `verdict()` and leave the report READY — the exact failure this check exists to
    // stop, only spelled with a different word.
    if (
      typeof check.severity !== 'string' ||
      !Object.prototype.hasOwnProperty.call(SEVERITY_RANK, check.severity)
    ) {
      throw new Error(
        `${PROJECT_PREFLIGHT_PATH}: el check '${check.name}' declara severity ` +
          `'${String(check.severity)}', que el verdicto no sabe rankear. Válidos: ` +
          `${Object.keys(SEVERITY_RANK).join(', ')}.`
      );
    }
    if (check.tier !== undefined && check.tier !== 'T1' && check.tier !== 'T2') {
      throw new Error(
        `${PROJECT_PREFLIGHT_PATH}: el check '${check.name}' declara tier ` +
          `'${String(check.tier)}'; solo existen 'T1' (estático) y 'T2' (necesita runtime).`
      );
    }
    if (typeof check.summary !== 'string') {
      throw new Error(
        `${PROJECT_PREFLIGHT_PATH}: el check '${check.name}' no tiene 'summary' — es la celda ` +
          `que el reporte muestra como resultado.`
      );
    }
    if (check.detail !== undefined && !Array.isArray(check.detail)) {
      throw new Error(
        `${PROJECT_PREFLIGHT_PATH}: el 'detail' del check '${check.name}' tiene que ser un ` +
          `arreglo de líneas.`
      );
    }
    // `tier` and `detail` are the two the report can supply a sane default for: a check a
    // project wrote runs in the same static sweep as the kit's T1, and a check without
    // detail simply prints no detail section.
    return {
      name: check.name,
      tier: check.tier ?? 'T1',
      severity: check.severity,
      summary: check.summary,
      detail: check.detail ?? [],
    };
  });
}

/**
 * Load `scripts/tools/preflight.project.ts` when the project ships one — the extension
 * point that replaces wrapping the `preflight` entry of `package.json` (which shadows the
 * kit's script name and breaks in silence the day `tk-preflight` invokes it differently).
 *
 * Same contract as `loadProjectPhases()` in `e2e-runner.ts`, deliberately calqued: dev-owned,
 * absent from every distribution profile, so `factory update` can never write it, overwrite it
 * or delete it. Absent ⇒ the sweep is byte-for-byte what it was before this hook existed.
 *
 * PRESENT BUT UNLOADABLE IS FATAL, never a skip. A readiness gate that quietly drops the
 * project's own checks and prints READY is worse than no gate: it is a green light nobody
 * asked for, on a release the project itself declared it wanted verified.
 *
 * 🔴 LOADING IS INVOKING, and since the project's checks are now resolved BEFORE the kit's
 * sweep, the project's module RUNS first. `interpretProjectChecks` calls an exported function
 * during validation, so a `preflight.project.ts` can mutate the environment the kit's own checks
 * then observe. The "only ADDS scrutiny" guarantee below is exact for the ARRAY — the loader
 * never sees the kit's results — but it is NOT a guarantee about the verdict. Accepted knowingly:
 * the alternative was discarding six finished checks behind a stack trace, and whoever can write
 * that file already executes code through `package.json`, `scripts/` or `src/`.
 *
 * The returned checks are only ever APPENDED to the kit's (`main()` pushes them, never splices),
 * so a project can add scrutiny and cannot remove any. Dependencies are injectable so that
 * contract is assertable without touching a filesystem.
 */
export function loadProjectPreflight(
  deps: { exists?: (path: string) => boolean; load?: (path: string) => unknown } = {}
): CheckResult[] {
  const target = resolve(__dirname, PROJECT_PREFLIGHT_MODULE);
  const exists = deps.exists ?? existsSync;
  if (!exists(target)) return [];

  // `createRequire` rather than a bare `require`: the same CommonJS resolution (so the loader
  // already transpiling THIS file handles the `.ts` sibling too) without the import form eslint
  // bans in TypeScript. Built lazily — a run without the file must not pay for it.
  const load = deps.load ?? ((path: string) => createRequire(__filename)(path));

  let loaded: unknown;
  try {
    loaded = load(target);
  } catch (error) {
    throw new Error(
      `${PROJECT_PREFLIGHT_PATH} existe pero no se pudo cargar: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }

  return interpretProjectChecks(loaded);
}

// ---------------------------------------------------------------------------
// Verdict + report
// ---------------------------------------------------------------------------

export function verdict(results: CheckResult[]): { label: string; icon: string; exit: number } {
  const worst = results.reduce<Severity>(
    (acc, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[acc] ? r.severity : acc),
    'ok'
  );
  if (worst === 'critical' || worst === 'high') return { label: 'NOT-READY', icon: '🔴', exit: 1 };
  if (worst === 'warn') return { label: 'READY-WITH-WARNINGS', icon: '🟡', exit: 0 };
  return { label: 'READY', icon: '✅', exit: 0 };
}

function renderReport(results: CheckResult[], v: ReturnType<typeof verdict>): string {
  const lines: string[] = [];
  lines.push(`# Preflight readiness — ${v.icon} ${v.label}`, '');
  lines.push('| Check | Tier | Severidad | Resultado |', '| --- | --- | --- | --- |');
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.tier} | ${SEVERITY_ICON[r.severity]} | ${r.summary} |`);
  }
  const withDetail = results.filter((r) => r.detail.length);
  if (withDetail.length) {
    lines.push('', '## Detalle');
    for (const r of withDetail) {
      lines.push('', `### ${SEVERITY_ICON[r.severity]} ${r.name}`);
      for (const d of r.detail) lines.push(`- ${d}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): ParsedArgs {
  const lhIdx = argv.indexOf('--lighthouse-dir');
  return {
    t1Only: argv.includes('--t1'),
    json: argv.includes('--json'),
    help: argv.includes('--help') || argv.includes('-h'),
    lighthouseDir: lhIdx >= 0 ? (argv[lhIdx + 1] ?? '.lighthouseci') : '.lighthouseci',
  };
}

/**
 * Compose the results the verdict is computed from: the kit's checks, then the
 * project's APPENDED at the end.
 *
 * 🔴 TWO ORDERS LIVE HERE AND THEY ARE DIFFERENT. The project's checks are *loaded and
 * validated* FIRST — before the sweep — and *appended* LAST. That split is the whole
 * point: `loadProjectPreflight()` throws on a file that does not load or declares a
 * `severity` the verdict cannot rank, and paying for knip + `pnpm audit` +
 * `drizzle-kit check` before finding that out means the run dies AFTER its expensive
 * half, throwing away six finished kit checks. The append stays last so a project can
 * only ADD scrutiny: the loader never sees this array, so it cannot reorder or drop a
 * single kit check.
 *
 * Extracted from `main()` so the composition — and therefore the fact that the
 * project's checks reach `verdict()` at all — is assertable without a filesystem.
 */
export function collectResults(
  args: { t1Only: boolean; lighthouseDir: string },
  deps: { loadProject?: () => CheckResult[]; kitChecks?: () => CheckResult[] } = {}
): CheckResult[] {
  const kitChecks =
    deps.kitChecks ??
    ((): CheckResult[] => {
      const kit = [
        checkKnip(),
        checkAudit(),
        checkMigrations(),
        checkNativeTracing(),
        checkBundle(),
        checkEnumRegistry(),
      ];
      if (!args.t1Only) kit.push(checkLighthouse(args.lighthouseDir));
      return kit;
    });

  // Loaded FIRST (see above), appended LAST.
  const projectChecks = (deps.loadProject ?? loadProjectPreflight)();
  return [...kitChecks(), ...projectChecks];
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: pnpm preflight [--t1] [--json] [--lighthouse-dir <dir>]');
    process.exit(0);
  }

  const results = collectResults(args);

  const v = verdict(results);
  if (args.json) {
    console.log(JSON.stringify({ verdict: v.label, results }, null, 2));
  } else {
    console.log(renderReport(results, v));
  }
  process.exit(v.exit);
}

// Only run when executed directly (not when imported by tests).
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('preflight.ts') || process.argv[1].endsWith('preflight'));

/**
 * Print a fatal error the way BOTH readers need it, and return the exit code.
 *
 * The curated line first: `loadProjectPreflight()` writes its messages FOR the dev, in Spanish,
 * naming the file and the offending word, and a bare stack buries them.
 *
 * 🔴 The stack SECOND, and never dropped. The seven kit checks have no error handling of their
 * own and all of them read disk or parse external tool output, so a bug in one arrives here too —
 * and a message without a file and a line is not diagnosable. Printing only `error.message` would
 * trade the extension point's failure mode for a regression on every other one. The sibling this
 * pattern comes from does exactly this: `e2e-runner.ts` passes the OBJECT to `console.error`, so
 * Node renders the stack. Half of that pattern is not the pattern.
 */
export function reportFatal(error: unknown): number {
  console.error(`🔴 ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) console.error(error.stack);
  return 1;
}

if (isDirectExecution) {
  // The extension point's failure mode must not take the kit's report with it: letting the throw
  // escape discards `renderReport()` and with it the checks that DID finish.
  try {
    main();
  } catch (error) {
    process.exit(reportFatal(error));
  }
}
