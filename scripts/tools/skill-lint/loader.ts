import { readdirSync, readFileSync, existsSync } from 'fs';
import { basename, join } from 'path';

import type { Skill } from './types';

const SKILLS_DIR = '.claude/skills';
const AGENTS_DIR = '.claude/agents';

export function loadSkills(repoRoot: string): Skill[] {
  const absDir = join(repoRoot, SKILLS_DIR);
  if (!existsSync(absDir)) return [];

  const skills: Skill[] = [];

  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Skip reserved dirs prefixed with `_` (not skills — no SKILL.md by design)
    if (entry.name.startsWith('_')) continue;
    // pj-* are developer project-specific skills — NOT part of the kit. The kit
    // linter intentionally skips them so a derived project's own skills never
    // block a commit (see CC.md §6 / .claude/docs/extending-the-kit.md).
    if (entry.name.startsWith('pj-')) continue;

    const skillPath = join(absDir, entry.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;

    const raw = readFileSync(skillPath, 'utf-8');
    const { frontmatter, body } = splitFrontmatter(raw);

    skills.push({
      name: entry.name,
      path: skillPath,
      raw,
      frontmatter,
      body,
      bodyLines: body.split('\n'),
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load `.claude/agents/*.md` with the same frontmatter parser as skills
 * (LINT-003). Unlike skills there is no dev-owned prefix to exclude (`pj-*`
 * has no agent equivalent) — every `.md` in the directory is loaded; the
 * derivative-tolerance for non-kit agents lives in the frontmatter check via
 * `LintContext.manifestAgentNames`, not in the loader.
 */
export function loadAgents(repoRoot: string): Skill[] {
  const absDir = join(repoRoot, AGENTS_DIR);
  if (!existsSync(absDir)) return [];

  const agents: Skill[] = [];

  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const agentPath = join(absDir, entry.name);
    const raw = readFileSync(agentPath, 'utf-8');
    const { frontmatter, body } = splitFrontmatter(raw);

    agents.push({
      name: entry.name.replace(/\.md$/, ''),
      path: agentPath,
      raw,
      frontmatter,
      body,
      bodyLines: body.split('\n'),
      kind: 'agent',
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Agent names the kit manifest ships, read from `.timekast/lockfile.json`
 * (`{ version, profile, files: [{ path, hash }] }` — the CLI writes it on
 * install, so it only exists in a derivative). Undefined when the lockfile is
 * absent or unreadable: fail-open — a derivative's commit must never block on
 * a corrupt manifest, so without it every agent error degrades to warning.
 */
export function loadManifestAgentNames(repoRoot: string): Set<string> | undefined {
  const lockPath = join(repoRoot, '.timekast', 'lockfile.json');
  if (!existsSync(lockPath)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8')) as {
      files?: Array<{ path?: unknown }>;
    };
    if (!Array.isArray(parsed.files)) return undefined;

    const names = new Set<string>();
    for (const entry of parsed.files) {
      if (typeof entry?.path !== 'string') continue;
      const m = entry.path.match(/(?:^|\/)\.claude\/agents\/([^/]+)\.md$/);
      if (m) names.add(m[1]);
    }
    return names;
  } catch {
    return undefined;
  }
}

function splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
    return { frontmatter: {}, body: raw };
  }

  // Find the closing `---` delimiter after the opening one
  const lines = raw.split('\n');
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return { frontmatter: {}, body: raw };

  const fmBlock = lines.slice(1, closeIdx).join('\n');
  const body = lines.slice(closeIdx + 1).join('\n');

  return { frontmatter: parseFrontmatterBlock(fmBlock), body };
}

/**
 * Minimal YAML-ish parser for skill frontmatter.
 *
 * Supports flat `key: value` and multi-line `key: >` folded-scalar blocks.
 * Good enough for the skill corpus — we only extract a few known fields.
 */
function parseFrontmatterBlock(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = block.split('\n');

  let currentKey: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentKey !== null) {
      result[currentKey] = buffer.join(' ').trim();
    }
    currentKey = null;
    buffer = [];
  };

  for (const raw of lines) {
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (m && !raw.startsWith(' ') && !raw.startsWith('\t')) {
      flush();
      currentKey = m[1];
      const value = m[2];
      // Folded-scalar start: `key: >` — collect following indented lines
      if (value.trim() === '>' || value.trim() === '|') {
        buffer = [];
        continue;
      }
      buffer = [value];
    } else if (currentKey !== null && (raw.startsWith('  ') || raw.startsWith('\t'))) {
      buffer.push(raw.trim());
    }
  }
  flush();

  return result;
}

export function loadPackageDeps(repoRoot: string): Set<string> {
  const pkgPath = join(repoRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
}

export function loadHooksRegistry(repoRoot: string): Set<string> {
  const path = join(repoRoot, 'project/reference/HOOKS.md');
  if (!existsSync(path)) return new Set();

  const raw = readFileSync(path, 'utf-8');
  const names = new Set<string>();
  // Entries render as: | `name` | kind | `@/import` | `file` |
  const rowRe = /^\|\s*`([A-Za-z_][A-Za-z0-9_]*)`\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(raw)) !== null) {
    names.add(m[1]);
  }
  return names;
}

export function loadInventoryRegistry(repoRoot: string): Set<string> {
  const path = join(repoRoot, 'project/reference/INVENTORY.md');
  if (!existsSync(path)) return new Set();

  const raw = readFileSync(path, 'utf-8');
  const names = new Set<string>();
  // Entries render as: | Name | `@/import` | — only rows with an `@/` import are
  // app symbols (dependency, script and route tables use other shapes).
  const rowRe = /^\|\s*([A-Za-z_][A-Za-z0-9_]*)\s*\|\s*`@\//gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(raw)) !== null) {
    names.add(m[1]);
  }
  return names;
}

export function skillBasename(path: string): string {
  return basename(path);
}
