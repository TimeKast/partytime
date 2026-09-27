#!/usr/bin/env node
/**
 * Generate lucide.json for fx-presentation-kit — the full Lucide icon manifest.
 *
 * Iterates every esm icon module shipped by the installed `lucide-react`, reads
 * its exported `__iconNode` (the raw [tag, attrs] children), and serializes each
 * to an inline SVG string. The result is a single name→SVG manifest the mockup
 * renderer (tk-mockup, milestone 4) looks up on demand and embeds inline — no
 * CDN, offline, any icon, multi-stack (the JSON travels in the tarball).
 *
 * NOT anchored to navigation.ts: that file holds ~3 kit icons and is rewritten
 * by every project's /design. The manifest ships the complete set instead.
 *
 * Usage:
 *   node scripts/tools/generate-presentation-icons.mjs           # write manifest
 *   node scripts/tools/generate-presentation-icons.mjs --check   # exit 1 on drift
 *
 * Run manually when bumping lucide-react (the source rarely changes — not wired
 * into lint-staged). Auto-no-op (exit 0) when lucide-react is absent (derived
 * non-Node projects ship the committed snapshot).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

const ICONS_DIR = 'node_modules/lucide-react/dist/esm/icons';
const OUTPUT = '.claude/skills/fx-presentation-kit/lucide.json';

// Lucide's default <svg> wrapper — matches what lucide-react renders at runtime.
const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

function iconNodeToSvg(iconNode) {
  const children = iconNode
    .map(([tag, attrs]) => {
      const serialized = Object.entries(attrs)
        .filter(([key]) => key !== 'key') // `key` is React-only, not valid SVG
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${serialized}/>`;
    })
    .join('');
  return `<svg ${SVG_ATTRS}>${children}</svg>`;
}

async function build() {
  const files = readdirSync(ICONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .sort();

  const manifest = {};
  const aliases = {}; // aliasName → targetName (alias modules re-export a canonical icon)
  let skipped = 0;

  // Pass 1 — canonical icons (own __iconNode) + collect aliases.
  for (const file of files) {
    const name = file.slice(0, -'.js'.length);
    const url = pathToFileURL(join(process.cwd(), ICONS_DIR, file)).href;
    const mod = await import(url);
    if (Array.isArray(mod.__iconNode)) {
      manifest[name] = iconNodeToSvg(mod.__iconNode);
      continue;
    }
    // Alias module shape: `export { default } from './<target>.js';`
    const source = readFileSync(join(ICONS_DIR, file), 'utf-8');
    const reExport = source.match(/from ['"]\.\/([\w-]+)\.js['"]/);
    if (reExport) {
      aliases[name] = reExport[1];
    } else {
      skipped += 1;
    }
  }

  // Pass 2 — resolve aliases to their canonical SVG (e.g. `home` → `house`).
  let aliasResolved = 0;
  for (const [alias, target] of Object.entries(aliases)) {
    if (manifest[target]) {
      manifest[alias] = manifest[target];
      aliasResolved += 1;
    } else {
      skipped += 1;
    }
  }

  // Sort keys (aliases were appended out of order) → stable --check across machines.
  const sorted = {};
  for (const key of Object.keys(manifest).sort()) sorted[key] = manifest[key];

  return {
    json: `${JSON.stringify(sorted)}\n`,
    count: Object.keys(sorted).length,
    skipped,
    aliasResolved,
  };
}

async function main() {
  if (!existsSync(ICONS_DIR)) {
    // Derived non-Node project: the snapshot already shipped, nothing to regenerate.
    process.exit(0);
  }

  const { json, count, skipped, aliasResolved } = await build();
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf-8') : null;
  const checkOnly = process.argv.includes('--check');

  if (checkOnly) {
    if (current !== json) {
      console.error(
        `✗ generate:presentation-icons — ${OUTPUT} is out of sync with lucide-react. Run: pnpm generate:presentation-icons`
      );
      process.exit(1);
    }
    console.log(`✓ lucide.json in sync (${count} icons)`);
    return;
  }

  if (current === json) {
    console.log(`✓ lucide.json already in sync (${count} icons)`);
    return;
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, json);
  console.log(
    `✓ lucide.json regenerated (${count} icons: ${count - aliasResolved} canonical + ${aliasResolved} aliases${skipped ? `, ${skipped} skipped` : ''})`
  );
}

main();
