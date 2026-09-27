#!/usr/bin/env node
/**
 * TimeKast PDF Builder — Generates styled PDFs from Markdown documents.
 *
 * Node/JS instead of the earlier Python driver, because the script's real work was already
 * Node's: it just arms a combined Markdown and hands it to `npx md-to-pdf` (Puppeteer/Chromium).
 * Python was an intermediate layer with zero tests and a platform-specific dependency (`sips`,
 * macOS-only) for a problem `.webp` support in the MIME map already solves without one.
 *
 * ZERO PROJECT DEPENDENCIES ON PURPOSE. This file ships in the `core` distribution profile
 * (`distribution/profiles.json` — the `.claude/skills/fx-*` glob), which does NOT include
 * `package.json`, `src/`, or a lockfile: there is no `node_modules` to resolve `dotenv`/`sharp`
 * from. Only `node:*` builtins are imported. `.ts` was rejected for the same reason plus a
 * second one: it would be the first `.ts` under `.claude/`, and a derived project's `tsconfig`
 * (dev-owned, born frozen) could reject it on a strictness setting the kit never controls.
 *
 * Assets (the kit's brand logo, the default CSS) are anchored to `import.meta.url`, not to the
 * project root or `cwd` — they travel WITH this script (`fx-presentation-kit` ships in the same
 * `fx-*` allowlist), so the relative path from here is correct in the kit's own repo and in any
 * derived project, regardless of the caller's working directory.
 *
 * Usage:
 *   node build-pdf.mjs INPUT.md [options]
 *
 * Options:
 *   --output PATH         Output PDF path (default: INPUT.pdf)
 *   --no-logos             Omit logos from cover page
 *   --no-toc               Omit table of contents
 *   --no-cover             Skip cover page entirely
 *   --appendix "T:F"       Add appendix (Title:filepath), repeatable
 *   --skip-lines N         Header lines to skip from main doc (default: 9)
 *   --css PATH             Custom CSS file
 *   --project-root PATH    Override project root resolution (mainly for tests/CI)
 *
 * Part of: .claude/skills/fx-pdf-export/
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// ─────────────────────────────────────────────────────────────────────────────
// Config — assets anchored to THIS file, never to cwd/project root (see header)
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(SCRIPT_DIR); // .claude/skills/fx-pdf-export
const DEFAULT_CSS_PATH = path.join(SKILL_DIR, 'resources', 'timekast-style.css');

// The full TimeKast logotype (icon + wordmark) on a TRANSPARENT background, which is what a
// cover page needs: `.cover-page` has no dark background, so the previous choice — a first frame
// lifted from the animated GIF, whose dark textured backdrop is OPAQUE — printed as a dark
// rectangle on white paper.
//
// Still no light/dark switch: a transparent logotype needs none, and inventing a theme concept
// here would be new behavior with no spec (`CODING.md §8`). The asset is vendored under the kit's
// own `brand/` on purpose — resolving it from `public/` would break every derivative, where that
// directory holds the CLIENT's assets and this file does not exist.
const TIMEKAST_LOGO_PATH = path.join(
  SKILL_DIR,
  '..',
  'fx-presentation-kit',
  'brand',
  'timekast-full.png'
);

// Reject a logo candidate bigger than this before ever reading its bytes into memory.
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

const DEFAULT_SKIP_LINES = 9;
const APPENDIX_SKIP_LINES = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Project root resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the project root by verified marker, in order:
 *   (1) `git rev-parse --show-toplevel` (works from any subdirectory of a git checkout)
 *   (2) no git → walk up requiring `.claude/` AND (`package.json` OR `project/`) together
 *   (3) hard reject if the resolved root is the user's home directory
 *
 * NO silent fallback to `cwd`. The driver this replaced had one, and it is the reason the
 * original defect (glob scanning `$HOME`) went unnoticed for so long: walking past every real
 * marker and landing on `~/.claude` looked, from the caller's side, exactly like a clean
 * success. This throws instead, naming what it looked for.
 *
 * @param {string} cwd
 * @returns {string} absolute path to the project root
 */
export function resolveProjectRoot(cwd) {
  const home = path.resolve(homedir());

  const viaGit = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  });
  if (viaGit.status === 0 && viaGit.stdout && viaGit.stdout.trim()) {
    const resolved = path.resolve(viaGit.stdout.trim());
    rejectHomeDirectory(resolved, home);
    return resolved;
  }

  let dir = cwd;
  for (let i = 0; i < 50; i++) {
    const hasClaude = existsSync(path.join(dir, '.claude'));
    const hasPackageJson = existsSync(path.join(dir, 'package.json'));
    const hasProjectDir = existsSync(path.join(dir, 'project'));
    if (hasClaude && (hasPackageJson || hasProjectDir)) {
      rejectHomeDirectory(dir, home);
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  throw new Error(
    `No se pudo resolver la raíz del proyecto desde "${cwd}": "git rev-parse --show-toplevel" ` +
      'falló y ningún directorio ancestro tiene ".claude/" junto con "package.json" o "project/".'
  );
}

/**
 * Compares by REAL path, not literal string equality — a symlinked `$HOME` (or a symlinked
 * resolved root) would not trip a bare `resolved === home` check. `realpathSync` is wrapped in
 * `try/catch` because it requires the path to exist on disk; if either side does not, this
 * falls back to the literal comparison rather than throwing on a path that is merely absent.
 */
function rejectHomeDirectory(resolved, home) {
  let same = resolved === home;
  try {
    same = realpathSync(resolved) === realpathSync(home);
  } catch {
    // fall back to the literal comparison already computed above
  }

  if (same) {
    throw new Error(
      `La raíz resuelta ("${resolved}") es la carpeta personal del usuario — abortando en vez ` +
        'de escanearla.'
    );
  }
}

/** Resolves `p` against `root` unless it is already absolute. */
export function resolvePathAgainstRoot(p, root) {
  return path.isAbsolute(p) ? p : path.join(root, p);
}

// ─────────────────────────────────────────────────────────────────────────────
// .env.local — minimal own parser (no dotenv: core profile has no node_modules)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses an `.env`-style file body into `{ KEY: value }`. Handles comments, blank lines, an
 * `export ` prefix, single/double-quoted values, and duplicate keys (last one wins — same rule
 * `dotenv` uses). Pure — takes the file's already-read text, never touches the filesystem.
 *
 * @param {string} source
 * @returns {Record<string, string>}
 */
export function parseEnvFile(source) {
  const out = {};
  for (const rawLine of source.split(/\r\n|\r|\n/)) {
    let line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('export ')) {
      line = line.slice('export '.length).trim();
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value; // later assignment overwrites earlier — duplicate key, last wins
  }
  return out;
}

/**
 * Resolves the client logo from `NEXT_PUBLIC_CLIENT_LOGO_DARK` (preferred — mirrors the fixed
 * `dark` variant used for the TimeKast logo) falling back to `_LIGHT`. Rejects by SHAPE first,
 * before touching disk: external URLs, absolute paths, and any `..` after normalizing. Then
 * confines the candidate under `<root>/public` with BOTH sides real-path-resolved, so a symlink
 * inside `public/` pointing outside cannot pass.
 *
 * Never throws. A missing/invalid value returns `{ ok: false, reason }` (or `reason: null` when
 * the variable is simply unset — not an error, nothing to report).
 *
 * @param {Record<string, string>} env
 * @param {string} root
 * @returns {{ ok: true, path: string } | { ok: false, reason: string | null }}
 */
export function resolveClientLogo(env, root) {
  const raw = env.NEXT_PUBLIC_CLIENT_LOGO_DARK || env.NEXT_PUBLIC_CLIENT_LOGO_LIGHT;
  if (!raw) {
    return { ok: false, reason: null };
  }

  if (/^https?:\/\//i.test(raw)) {
    return { ok: false, reason: `valor externo (http/https) no soportado: "${raw}"` };
  }

  // Web convention: a leading "/" means "relative to public/", same mapping
  // `generate-email-logo.ts` uses. Strip exactly one, then the rest must not itself be absolute
  // (a second leading slash, or a platform-absolute path) and must not escape via "..".
  const cleanPath = raw.startsWith('/') ? raw.slice(1) : raw;

  if (path.isAbsolute(cleanPath)) {
    return { ok: false, reason: `ruta absoluta no soportada: "${raw}"` };
  }

  const normalized = path.normalize(cleanPath);
  const segments = normalized.split(path.sep);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`) || segments.includes('..')) {
    return { ok: false, reason: `ruta con ".." no soportada: "${raw}"` };
  }

  const publicDir = path.join(root, 'public');
  const candidate = path.join(publicDir, normalized);

  if (!existsSync(candidate)) {
    return { ok: false, reason: `archivo no encontrado: "${candidate}"` };
  }

  let resolvedPublicDir;
  let resolvedCandidate;
  try {
    resolvedPublicDir = realpathSync(publicDir);
    resolvedCandidate = realpathSync(candidate);
  } catch (err) {
    return { ok: false, reason: `no se pudo resolver la ruta real: ${err.message}` };
  }

  const withinPublic =
    resolvedCandidate === resolvedPublicDir ||
    resolvedCandidate.startsWith(resolvedPublicDir + path.sep);

  if (!withinPublic) {
    return { ok: false, reason: `fuera de public/ tras resolver symlinks: "${candidate}"` };
  }

  return { ok: true, path: resolvedCandidate };
}

// ─────────────────────────────────────────────────────────────────────────────
// Image type — derived from bytes, never from the extension
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identifies an image's real type from its magic number. The driver this replaced trusted the
 * FILE EXTENSION and defaulted anything unknown to PNG — any file, renamed `.png`, shipped as
 * one into a client deliverable. This reads the bytes instead.
 * SVG has no magic-number signature to check (it's XML text) and is rejected explicitly: it is
 * not in the accepted set on purpose (arbitrary SVG can carry `<script>`).
 *
 * @param {Buffer} buffer
 * @returns {{ mime: string, ext: string } | null} null when the bytes match none of the accepted types
 */
export function sniffImageType(buffer) {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }
  if (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return { mime: 'image/gif', ext: '.gif' };
  }
  return null;
}

/**
 * Reads an image from disk and returns it as a base64 data URI, after a size cap and a magic-
 * number check. Not pure (touches the filesystem) — the pure classification lives in
 * `sniffImageType`; this is the I/O wrapper `main()` uses for both the fixed TimeKast logo and a
 * resolved client logo.
 *
 * @param {string} absPath
 * @returns {string} data URI
 */
export function imageToDataUri(absPath) {
  const stats = statSync(absPath); // throws ENOENT if missing — caller catches and skips
  if (stats.size > MAX_LOGO_BYTES) {
    throw new Error(`archivo mayor a ${Math.round(MAX_LOGO_BYTES / (1024 * 1024))} MB: ${absPath}`);
  }
  const buffer = readFileSync(absPath);
  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    throw new Error(`tipo de imagen no reconocido (magic number): ${absPath}`);
  }
  return `data:${sniffed.mime};base64,${buffer.toString('base64')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML escaping — every value interpolated from the input document
// ─────────────────────────────────────────────────────────────────────────────

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes `&`, `<`, `>`, `"`, `'` for the COVER PAGE fields only (`title`/`subtitle`/`date`/
 * `version`/`stakeholders`/`author`/`domain` — see the call sites in `buildCover`), and
 * `md-to-pdf` does not sanitize its input — a document the operator didn't write (an intake
 * brief, an appendix) whose H1 or metadata line reads `<img src=x onerror=…>` executes inside
 * the renderer.
 *
 * It does NOT close the case for the rest of the document: the main body is concatenated raw,
 * and `md-to-pdf` interprets inline HTML in Markdown by design — that residual is a design
 * choice, not an oversight. Convert only documents you trust.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Line splitting that preserves terminators (readlines()-equivalent)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits `text` into lines the way Python's `readlines()` does: each line KEEPS its original
 * terminator attached (`\n`, `\r\n`, or none for a final line without a trailing newline), so
 * `splitKeepingTerminators(text).join('')` reconstructs `text` exactly.
 *
 * `text.split('\n').slice(n).join('\n')` is NOT equivalent: it drops a `\r` that preceded a
 * `\n`, and it always re-inserts `\n` between kept lines even when the source had none at EOF.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitKeepingTerminators(text) {
  const lines = [];
  const re = /\r\n|\r|\n/g;
  let start = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    lines.push(text.slice(start, match.index) + match[0]);
    start = re.lastIndex;
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

/**
 * Drops the first `n` lines of `text`, preserving the exact terminators of what remains —
 * the JS equivalent of `"".join(f.readlines()[n:])`.
 *
 * @param {string} text
 * @param {number} n
 * @returns {string}
 */
export function skipHeaderLines(text, n) {
  return splitKeepingTerminators(text).slice(n).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts title/date/version/stakeholders/author from the first 20 lines of `source`.
 * Pure — takes the already-read document text, not a filepath (the driver this replaced opened
 * the file itself here). `title` defaults to `''` here when no H1 is found; the caller (which
 * knows the input filepath) fills the filename fallback.
 *
 * @param {string} source
 * @returns {{ title: string, subtitle: string, date: string, version: string, stakeholders: string, author: string, domain: string }}
 */
export function extractMetadata(source) {
  const meta = {
    title: '',
    subtitle: '',
    date: '',
    version: '',
    stakeholders: '',
    author: 'TimeKast',
    domain: '',
  };

  const lines = splitKeepingTerminators(source).slice(0, 20);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('# ')) {
      meta.title = line.slice(2).trim();
    }
    const m = line.match(/^\*\*(.+?):\*\*\s*(.+)/);
    if (m) {
      const key = m[1].toLowerCase().trim();
      const val = m[2].trim();
      if (key.includes('fecha') || key.includes('date')) {
        meta.date = val;
      } else if (key.includes('versi') || key.includes('version')) {
        meta.version = val;
      } else if (key.includes('stakeholder') || key.includes('cliente')) {
        meta.stakeholders = val;
      } else if (key.includes('elaborado') || key.includes('author') || key.includes('autor')) {
        meta.author = val;
      }
    }
  }

  return meta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cover / TOC / appendix builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the HTML cover page. Every value drawn from the input document is escaped
 * (`escapeHtml`) before interpolation.
 *
 * @param {ReturnType<typeof extractMetadata>} meta
 * @param {string | null} [logoLeftUri]
 * @param {string | null} [logoRightUri]
 * @returns {string}
 */
export function buildCover(meta, logoLeftUri, logoRightUri) {
  let logosHtml = '';
  if (logoLeftUri && logoRightUri) {
    logosHtml = `<div class="cover-logos">
    <img src="${logoLeftUri}" alt="Company" />
    <div class="cover-divider-dot"></div>
    <img src="${logoRightUri}" alt="Project" />
  </div>`;
  } else if (logoLeftUri) {
    logosHtml = `<div class="cover-logos">
    <img src="${logoLeftUri}" alt="Logo" />
  </div>`;
  } else if (logoRightUri) {
    logosHtml = `<div class="cover-logos">
    <img src="${logoRightUri}" alt="Logo" />
  </div>`;
  }

  const metaLines = [];
  if (meta.date) metaLines.push(`<strong>Fecha:</strong> ${escapeHtml(meta.date)}`);
  if (meta.version) metaLines.push(`<strong>Versión:</strong> ${escapeHtml(meta.version)}`);
  if (meta.stakeholders) {
    metaLines.push(`<strong>Stakeholders:</strong> ${escapeHtml(meta.stakeholders)}`);
  }
  if (meta.author) metaLines.push(`<strong>Elaborado por:</strong> ${escapeHtml(meta.author)}`);
  const metaHtml = metaLines.join('<br/>\n    ');

  const domain = meta.domain || '';
  const footer = domain ? `${escapeHtml(domain)} · TimeKast Factory` : 'TimeKast Factory';

  return `<div class="cover-page">
  ${logosHtml}
  <h1 class="cover-title" style="border:none; margin:0; padding:0;">${escapeHtml(meta.title)}</h1>
  <p class="cover-subtitle">${escapeHtml(meta.subtitle || '')}</p>
  <div class="cover-line"></div>
  <div class="cover-meta">
    ${metaHtml}
  </div>
  <div class="cover-badge">Confidencial</div>
  <p class="cover-footer">${footer}</p>
</div>

`;
}

// The nine emoji prefixes the kit's own docs use for H2 titles. The `u` flag is NOT optional:
// several of these are surrogate pairs or carry a variation selector (🗂️ = U+1F5C2 + U+FE0F),
// and a class without `u` matches UTF-16 code units instead of codepoints — it can strip half a
// pair and corrupt the following character instead of the emoji.
const TOC_EMOJI_PREFIX_RE = /^[📊📋📖📍🔄🧩🎨📱🗂️]+\s*/u;

/**
 * Auto-generates the TOC table from H2 (`## `) headers in `content`. Returns `''` when there is
 * no H2 at all (the caller then omits the TOC section entirely).
 *
 * @param {string} content
 * @returns {string}
 */
export function buildToc(content) {
  let rows = '';
  let count = 0;
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      const title = line.slice(3).trim().replace(TOC_EMOJI_PREFIX_RE, '');
      count += 1;
      rows += `| ${count} | ${title} |\n`;
    }
  }

  if (!rows) return '';

  return `<div class="toc-page">
<h2 style="text-align:center; color:#5B2D8E; border-bottom:none; margin-bottom:30px; font-size:22px;">Índice</h2>

| # | Sección |
|---|---------|
${rows}
</div>

`;
}

/**
 * Builds an appendix separator + its content. `content` is already stripped of its own header
 * (the caller applies `skipHeaderLines(source, 1)` before calling this — the appendix's own
 * skip depth is fixed at 1 regardless of the main document's `--skip-lines`, the same default
 * the driver this replaced used). `title` is NOT escaped: it comes
 * from the operator's own `--appendix` CLI flag, not from a document someone else authored —
 * out of scope for the escaping AC, which lists document-derived fields only.
 *
 * @param {string} title
 * @param {string} content
 * @returns {string}
 */
export function buildAppendix(title, content) {
  return `
<div class="appendix-break">
<h1 style="border-bottom:3px solid #4DB6AC; display:inline-block; padding-bottom:8px;">${title}</h1>
</div>

${content}`;
}

/**
 * The pure orchestrator: concentrates cover + TOC + `--skip-lines`'d main content + appendices
 * into the single combined Markdown string that gets handed to `md-to-pdf`. All I/O (reading
 * the input file, resolving/encoding logos, reading appendix files) happens in `main()` BEFORE
 * this is called — this function only assembles strings, which is what makes it byte-for-byte
 * golden-testable.
 *
 * @param {object} params
 * @param {ReturnType<typeof extractMetadata>} params.meta
 * @param {string} params.mainContent - already `skipHeaderLines`'d
 * @param {boolean} params.noCover
 * @param {boolean} params.noToc
 * @param {string | null} params.logoLeftUri
 * @param {string | null} params.logoRightUri
 * @param {Array<{ title: string, content: string }>} params.appendices - each `content` already `skipHeaderLines(_, 1)`'d
 * @returns {string}
 */
export function buildCombinedMarkdown({
  meta,
  mainContent,
  noCover,
  noToc,
  logoLeftUri,
  logoRightUri,
  appendices,
}) {
  let combined = '';

  if (!noCover) {
    combined += buildCover(meta, logoLeftUri ?? null, logoRightUri ?? null);
  }

  if (!noToc && !noCover) {
    const toc = buildToc(mainContent);
    if (toc) combined += toc;
  }

  combined += mainContent;

  for (const { title, content } of appendices ?? []) {
    combined += buildAppendix(title, content);
  }

  return combined;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

/** Printed on `--help`/`-h` and on any parse error — the single source both paths share. */
const USAGE_TEXT = `TimeKast PDF Builder — Generates styled PDFs from Markdown documents.

Usage:
  node build-pdf.mjs INPUT.md [options]

Options:
  --output PATH          Output PDF path (default: INPUT.pdf)
  --no-logos             Omit logos from cover page
  --no-toc               Omit table of contents
  --no-cover             Skip cover page entirely (implies --no-toc too)
  --appendix "T:F"       Add appendix (Title:filepath), repeatable
  --skip-lines N         Header lines to skip from main doc (default: ${DEFAULT_SKIP_LINES})
  --css PATH             Custom CSS file
  --project-root PATH    Override project root resolution (mainly for tests/CI)
  --help, -h             Print this usage and exit
`;

function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      output: { type: 'string' },
      'no-logos': { type: 'boolean', default: false },
      'no-toc': { type: 'boolean', default: false },
      'no-cover': { type: 'boolean', default: false },
      appendix: { type: 'string', multiple: true, default: [] },
      'skip-lines': { type: 'string', default: String(DEFAULT_SKIP_LINES) },
      css: { type: 'string' },
      'project-root': { type: 'string' },
    },
  });
  return { values, positionals };
}

function readEnvFileSafely(root) {
  const envPath = path.join(root, '.env.local');
  if (!existsSync(envPath)) return '';
  return readFileSync(envPath, 'utf8');
}

function main(argv) {
  let values, positionals;
  try {
    ({ values, positionals } = parseCliArgs(argv));
  } catch (err) {
    console.error(USAGE_TEXT);
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (values.help) {
    console.log(USAGE_TEXT);
    return;
  }

  const inputArg = positionals[0];

  if (!inputArg) {
    console.error(USAGE_TEXT);
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  let root;
  try {
    if (values['project-root']) {
      root = path.resolve(values['project-root']);
      rejectHomeDirectory(root, path.resolve(homedir()));
    } else {
      root = resolveProjectRoot(cwd);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const inputPath = resolvePathAgainstRoot(inputArg, root);
  if (!existsSync(inputPath)) {
    console.error(`❌ Archivo no encontrado: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const skipLines = Number.parseInt(values['skip-lines'], 10);
  if (!Number.isFinite(skipLines) || skipLines < 0) {
    console.error(`❌ --skip-lines inválido: "${values['skip-lines']}"`);
    process.exitCode = 1;
    return;
  }

  const outputArg = values.output || inputPath.replace(/\.[^./\\]+$/, '') + '.pdf';
  const outputPath = resolvePathAgainstRoot(outputArg, root);
  const cssPath = values.css ? resolvePathAgainstRoot(values.css, root) : DEFAULT_CSS_PATH;

  console.log(`📄 Building PDF: ${inputPath}`);

  const source = readFileSync(inputPath, 'utf8');
  const meta = extractMetadata(source);
  if (!meta.title) {
    meta.title = path.basename(inputPath, path.extname(inputPath));
  }
  console.log(`  📝 Title: ${meta.title}`);

  const totalLines = splitKeepingTerminators(source).length;
  const mainContent = skipHeaderLines(source, skipLines);
  console.log(`  📝 Content: ${totalLines} lines (skipping first ${skipLines})`);

  let logoLeftUri = null;
  let logoRightUri = null;

  if (!values['no-cover'] && !values['no-logos']) {
    try {
      logoLeftUri = imageToDataUri(TIMEKAST_LOGO_PATH);
      console.log(`  📷 TimeKast logo: ${path.basename(TIMEKAST_LOGO_PATH)}`);
    } catch (err) {
      console.log(`  ⚠️  TimeKast logo skipped: ${err.message}`);
    }

    const env = parseEnvFile(readEnvFileSafely(root));
    const clientLogo = resolveClientLogo(env, root);
    if (clientLogo.ok) {
      try {
        logoRightUri = imageToDataUri(clientLogo.path);
        console.log(`  📷 Client logo: ${path.basename(clientLogo.path)}`);
      } catch (err) {
        console.log(`  ⚠️  Client logo skipped: ${err.message}`);
      }
    } else if (clientLogo.reason) {
      // Only a configured-but-invalid value gets a line — an unset variable is not an error
      // and prints nothing (the fixed TimeKast logo always resolves, so there is no longer a
      // "no logos found" case).
      console.log(`  ⚠️  Client logo skipped: ${clientLogo.reason}`);
    }
  }

  const appendices = [];
  for (const raw of values.appendix ?? []) {
    const sep = raw.indexOf(':');
    if (sep === -1) {
      console.log(`  ⚠️  Invalid appendix format (use 'Title:filepath'): ${raw}`);
      continue;
    }
    const title = raw.slice(0, sep).trim();
    const filepath = raw.slice(sep + 1).trim();
    const fullPath = resolvePathAgainstRoot(filepath, root);
    const appendixSource = readFileSync(fullPath, 'utf8');
    appendices.push({ title, content: skipHeaderLines(appendixSource, APPENDIX_SKIP_LINES) });
    console.log(`  📎 Appendix: ${title}`);
  }

  const noCover = Boolean(values['no-cover']);
  const noToc = Boolean(values['no-toc']);

  const combined = buildCombinedMarkdown({
    meta,
    mainContent,
    noCover,
    noToc,
    logoLeftUri,
    logoRightUri,
    appendices,
  });

  if (!noToc && !noCover && buildToc(mainContent)) {
    console.log('  📑 TOC generated');
  }
  console.log(`  📦 Combined: ${combined.length.toLocaleString()} chars`);

  // mkdtemp per run + cleanup — the driver this replaced used a fixed
  // `/tmp/pdf_build_combined.md` (and its `.pdf`/the `sips`-converted png), which meant two
  // concurrent runs stomped each other, and the paths were pre-creable on a shared host.
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'timekast-pdf-'));
  try {
    const tmpMd = path.join(tmpDir, 'combined.md');
    writeFileSync(tmpMd, combined, 'utf8');

    console.log('  🖨️  Generating PDF...');
    const pdfOptions = JSON.stringify({
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
      printBackground: true,
    });

    // The renderer version is PINNED (`md-to-pdf@5.2.5`) so every run executes the same package
    // code instead of whatever `npx` last resolved from the registry. This pins the PACKAGE ONLY,
    // not its dependency tree: 5.2.5 declares 13 further dependencies, all by range (including
    // `puppeteer: '>=8.0.0'`, with no upper bound), and `npx` resolves those from the registry on
    // every cold install, with no lockfile fixing WHICH versions it lands on. npm does verify the
    // sha512 of every tarball it downloads against the packument's `dist.integrity` — that check
    // is not optional — so what is missing is not the integrity of the bytes: it is pinning the
    // resolved transitive versions, plus provenance verification (`npm audit signatures`, opt-in).
    //
    // The `timeout` bounds a run that would otherwise hang forever (a wedged Chromium, or a
    // registry that accepts the connection and never answers). 3 min is generous on purpose: a
    // cold `npx` install pulls md-to-pdf plus a Chromium download before rendering anything. The
    // point is a ceiling, not a tight budget — a run that hits it was already broken.
    const renderTimeoutMs = 180_000;
    const result = spawnSync(
      'npx',
      [
        '-y',
        'md-to-pdf@5.2.5',
        '--stylesheet',
        cssPath,
        '--pdf-options',
        pdfOptions,
        '--document-title',
        meta.title,
        // Neutralize the INPUT document's YAML front matter. `md-to-pdf` merges whatever front
        // matter the `.md` carries INTO ITS OWN CONFIG (`Object.assign({...config}, frontMatter)`),
        // and that config is what feeds `puppeteer.launch(config.launch_options)`,
        // `page.addScriptTag(config.script)` and `config.dest` — so whoever writes the document
        // would be steering the renderer's browser. An impossible delimiter makes gray-matter find
        // no front matter at all. Nothing is lost here: this driver reads its own metadata off the
        // document body via `extractMetadata`, never off front matter.
        '--gray-matter-options',
        '{"delimiters":"\\u0000"}',
        tmpMd,
      ],
      { encoding: 'utf8', timeout: renderTimeoutMs }
    );

    if (result.status !== 0) {
      // A timeout has `status === null` and `error.code === 'ETIMEDOUT'`, but the child has often
      // written to stderr first (a cold `npx -y` emits `npm warn exec …`) — and the `||` chain
      // below would surface that warning and bury the actual cause. Name the timeout explicitly.
      const detail =
        result.error?.code === 'ETIMEDOUT'
          ? `el renderizador excedió el techo de ${renderTimeoutMs / 1000}s y fue abortado`
          : result.stderr || result.error?.message || 'unknown error';
      console.error(`  ❌ Error: ${detail}`);
      process.exitCode = 1;
      return;
    }

    const tmpPdf = tmpMd.replace(/\.md$/, '.pdf');
    mkdirSync(path.dirname(outputPath), { recursive: true });

    try {
      copyFileSync(tmpPdf, outputPath);
    } catch (err) {
      console.error(`  ❌ Error copiando el PDF a ${outputPath}: ${err.message}`);
      process.exitCode = 1;
      return;
    }

    const sizeMb = statSync(outputPath).size / (1024 * 1024);
    console.log(`  ✅ PDF saved: ${outputPath} (${sizeMb.toFixed(1)} MB)`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// A third copy of this guard — NOT imported from `scripts/tools/lib/is-main-module.mjs` because
// this file ships in the `core` distribution profile, which does not carry `scripts/tools/lib/`
// (see the header: zero project dependencies, only `node:*`). It cannot be deduplicated.
function isMainModule() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return pathToFileURL(path.resolve(argv1)).href === import.meta.url;
}

if (isMainModule()) {
  main(process.argv.slice(2));
}
