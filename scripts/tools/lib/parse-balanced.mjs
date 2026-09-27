/**
 * Balanced-bracket slicing for lightweight TS source parsing.
 *
 * The kit's other autogen scripts (generate-inventory/codebase/hooks) are
 * per-line single-token scanners. The schema + API generators need the
 * opposite: `pgTable(...)` spans a multi-line `{...}` block plus an optional
 * `(table) => [...]` callback, and a server-action's wrapper config is a
 * nested `{...}` object inside the function body. Regex handles balanced
 * braces badly, so these two helpers do a small char-scanner instead — no AST.
 *
 * SHARED ON PURPOSE: both generators (`generate-schema.mjs`,
 * `generate-api.mjs`) AND the unit test import from this single module so the
 * primitive can't drift between two inlined copies.
 *
 * String + comment handling:
 * - String literals (', ", `) are opaque — brackets inside them don't count.
 *   Escapes (\) are respected.
 * - Template-literal `${ ... }` interpolation is treated as plain string
 *   content (a known, accepted limitation — the regions we slice rarely embed
 *   it). If a real `${}` with braces ever appears in a sliced region it would
 *   miscount; the per-item try/catch in the callers turns that into a visible
 *   `parse-skip` marker rather than a crash.
 * - Line (`//`) and block (`/* *​/`) comments are skipped — JSDoc in the kit
 *   embeds stray brackets (e.g. `[..., ROLES.EDITOR]` in roles.ts examples),
 *   so ignoring comments is required for correctness.
 */

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);

/**
 * Skip a string literal starting at `i` (which must point at a quote char).
 * Returns the index just past the closing quote (or end-of-source if
 * unterminated).
 */
/**
 * Given the index of a quote (`'`, `"` or a backtick), return the index just past the
 * closing quote, honouring escapes. Exported so callers that scan source text can skip
 * literals with the SAME primitive `sliceBalanced` and `stripComments` already use —
 * a scanner that is not string-aware reads a `;` or a bracket inside a literal as code.
 */
export function skipString(src, i) {
  const quote = src[i];
  i += 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2; // skip escaped char
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** Skip a `//` or `/* *​/` comment starting at `i`. Returns index past it. */
function skipComment(src, i) {
  if (src[i + 1] === '/') {
    const nl = src.indexOf('\n', i);
    return nl === -1 ? src.length : nl;
  }
  // block comment
  const end = src.indexOf('*/', i + 2);
  return end === -1 ? src.length : end + 2;
}

/**
 * Given an opening bracket at `openIdx` (`(`, `[`, or `{`), return the matching
 * region as `{ endIndex, content }` where `content` is the substring strictly
 * between the brackets and `endIndex` is the position of the matching closer.
 *
 * Throws if the char at `openIdx` is not an opener, on a bracket-type mismatch,
 * or if the region is unbalanced. Callers wrap this in try/catch so a
 * malformed construct becomes a visible parse-skip, never a crash.
 */
export function sliceBalanced(src, openIdx) {
  const opener = src[openIdx];
  if (!OPEN[opener]) {
    throw new Error(
      `sliceBalanced: char at ${openIdx} is ${JSON.stringify(opener)}, not an opening bracket`
    );
  }

  const stack = [OPEN[opener]];
  let i = openIdx + 1;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(src, i);
      continue;
    }
    if (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
      i = skipComment(src, i);
      continue;
    }

    if (OPEN[ch]) {
      stack.push(OPEN[ch]);
    } else if (CLOSE.has(ch)) {
      const expected = stack.pop();
      if (ch !== expected) {
        throw new Error(
          `sliceBalanced: mismatched ${JSON.stringify(ch)} at ${i}, expected ${JSON.stringify(expected)}`
        );
      }
      if (stack.length === 0) {
        return { endIndex: i, content: src.slice(openIdx + 1, i) };
      }
    }
    i += 1;
  }

  throw new Error(`sliceBalanced: unbalanced bracket opened at ${openIdx}`);
}

/**
 * Strip `//` and `/* *​/` comments from TS source while preserving string
 * literals (a `//` inside a string is NOT a comment). Block comments collapse
 * to a single space (keeps tokens separated); line comments drop to the
 * newline. Used before index/split ops so JSDoc colons/brackets (e.g.
 * `Created in: migration 0003`, or a `@example export const ROLES = {...}`)
 * don't get mis-parsed as real code.
 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipString(src, i);
      out += src.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e === -1 ? src.length : e + 2;
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Split the inner content of a call/array/object (the substring BETWEEN the
 * outer brackets) by top-level commas — commas nested inside `() [] {}` or
 * inside strings/comments are ignored. Trailing empty segment is dropped.
 *
 * Example: `'accounts', { a: 1 }, (t) => [x, y]`
 *   → [`'accounts'`, `{ a: 1 }`, `(t) => [x, y]`]
 */
export function splitTopLevelArgs(content) {
  const args = [];
  const stack = [];
  let start = 0;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(content, i);
      continue;
    }
    if (ch === '/' && (content[i + 1] === '/' || content[i + 1] === '*')) {
      i = skipComment(content, i);
      continue;
    }

    if (OPEN[ch]) {
      stack.push(OPEN[ch]);
    } else if (CLOSE.has(ch)) {
      stack.pop();
    } else if (ch === ',' && stack.length === 0) {
      args.push(content.slice(start, i).trim());
      start = i + 1;
    }
    i += 1;
  }

  const last = content.slice(start).trim();
  if (last) args.push(last);
  return args;
}
