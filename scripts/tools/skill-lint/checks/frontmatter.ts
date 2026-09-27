import type { Check, Finding, LintContext, Severity, Skill } from '../types';

/**
 * frontmatter — validate frontmatter keys against the SSOT-declared shape.
 *
 * Claude Code silently ignores frontmatter keys it does not recognize: a
 * `model: sonet` (typo) or a `disabel-model-invocation` (typo) produces no
 * error and no warning at runtime — the field simply does nothing, and whoever
 * wrote it believes a decision was taken that never applied. This check turns
 * that silent degradation into a visible signal.
 *
 * The allowlist of valid keys is DERIVED at runtime from the two SSOT skills
 * (already loaded into `ctx.skills` by the loader — no extra I/O here):
 *   - `fx-workflow-authoring §5` — the yaml fence with the `tk-*` shape plus
 *     the `**Campos obligatorios:**` line (required fields).
 *   - `fx-skill-author §5` — the per-family table (`kb-*`/`sk-*`/`fx-*`),
 *     union of the "Campos" and "Opcionales" cells.
 * No third hardcoded list exists to drift when a SSOT changes. If a SSOT
 * section cannot be parsed (e.g. a derivative stripped the skill), the
 * allowlist-based rules for that family are skipped — never a false error.
 *
 * Severity rules (LINT-002 §4):
 *   - Unknown key → warning by default (the CC runtime surface is not
 *     exhaustively documented and moves with each release).
 *   - Unknown key that is a near-miss (edit distance 1-2) of a known field:
 *     error when it appears in a single file of its family (a typo happens
 *     once), warning when it appears in ≥2 files (a legit new field gets
 *     adopted in several places at once).
 *   - `model`/`effort`/`operational` on a `kb-*`/`sk-*` → error (declarative
 *     skills; the tier is decided by whoever executes, not the material
 *     consulted — and those families are reference by definition).
 *   - `model:` value that is not an alias (`fable`/`opus`/`sonnet`/`haiku`/`inherit`)
 *     → error — full model IDs never go in frontmatter.
 *   - `tk-*` without `model:` → error (required per fx-workflow-authoring §5).
 *   - `fx-*` is a mixed family, split by the `operational: true` field
 *     (fx-skill-author §5): with it the skill executes work when invoked →
 *     `model`/`effort` allowed, and a missing `model:` is a warning; without
 *     it the skill is pure reference → `model`/`effort` present is an error
 *     (same principle as the kb/sk families) and a missing `model:` is no
 *     finding.
 *   - In a derivative (`ctx.isDerivative`) every error degrades to warning —
 *     kit-owned files are read-only there (CORE.md §5); a kit frontmatter
 *     defect must never block a derivative's commit.
 *
 * Agent surface (LINT-003): items with `kind: 'agent'` (loaded from
 * `.claude/agents/*.md`) validate a different, narrower shape — `name`,
 * `description`, `tools`, `model` (doc-sourced from fx-workflow-authoring §8;
 * no SSOT table exists to parse for agents). `model:` must be an alias like in
 * skills, and `model: inherit` is a warning: the agent runs on whatever model
 * the spawning workflow's session uses — a silent degradation when the agent
 * is an auditor/reviewer role that nobody decided explicitly. Derivative
 * tolerance is manifest-aware: an error on a kit-manifest agent (listed in
 * `.timekast/lockfile.json`) stays an error (same shipped file — a real
 * defect); an error on the derivative's own agent degrades to warning.
 * Prefix taxonomy and cross-refs stay in agent-taxonomy-lint.sh (not here).
 *
 * Scope note: this check validates KEY names (plus the explicit `model` value
 * rules). It does not validate value shapes — the loader's YAML-ish parser
 * collapses list values (e.g. `paths:` or an agent's `tools:`) to a flat
 * string, which is enough to know the key exists but not to parse its content.
 */

const MODEL_ALIASES = new Set(['fable', 'opus', 'sonnet', 'haiku', 'inherit']);

// The real shape of an agent .md — doc-sourced (fx-workflow-authoring §8);
// there is no SSOT table to derive it from, unlike the skill families.
const AGENT_FIELDS = new Set(['name', 'description', 'tools', 'model']);

// Fields the Claude Code runtime itself reads, verified against the official
// docs (docs.claude.com, checked 2026-08-20). Runtime surface, not kit shape —
// kept separate from the SSOT-derived allowlists on purpose: the SSOT
// documents what the KIT uses; these sets keep a real runtime field from
// reading as "unknown" and feed the near-miss detector (a typo of
// `allowed-tools` is caught even though no kit skill declares the field).
const RUNTIME_SKILL_FIELDS = new Set([
  'name',
  'description',
  'when_to_use',
  'argument-hint',
  'arguments',
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'disallowed-tools',
  'model',
  'effort',
  'context',
  'agent',
  'background',
  'hooks',
  'paths',
  'shell',
  'metadata',
  'license',
  'compatibility',
]);
const RUNTIME_AGENT_FIELDS = new Set([
  'name',
  'description',
  'tools',
  'disallowedTools',
  'model',
  'permissionMode',
  'maxTurns',
  'skills',
  'mcpServers',
  'hooks',
  'memory',
  'background',
  'effort',
  'isolation',
  'color',
  'initialPrompt',
]);

const SSOT_WORKFLOW = 'fx-workflow-authoring';
const SSOT_SKILL_AUTHOR = 'fx-skill-author';

type SkillFamily = 'tk' | 'kb' | 'sk' | 'fx';

interface TkShape {
  fields: Set<string>;
  required: Set<string>;
}

interface DerivedAllowlists {
  tk: TkShape | null;
  kb: Set<string> | null;
  sk: Set<string> | null;
  fx: Set<string> | null;
}

// Keyed on the ctx.skills array so each lint run parses the SSOT bodies once.
const allowlistCache = new WeakMap<readonly Skill[], DerivedAllowlists>();

/** Slice a body from the first heading matching `headingRe` to the next `## `. */
function extractSection(body: string, headingRe: RegExp): string | null {
  const m = body.match(headingRe);
  if (!m || m.index === undefined) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^##\s/m);
  return next === -1 ? rest : rest.slice(0, next);
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * fx-workflow-authoring §5 — field names are the keys of the yaml fence; the
 * required set comes from the `**Campos obligatorios:**` line's backticked
 * tokens.
 */
function parseWorkflowShape(body: string): TkShape | null {
  const section = extractSection(body, /^##\s+§5\b[^\n]*$/m);
  if (!section) return null;
  const fence = section.match(/```yaml\r?\n([\s\S]*?)```/);
  if (!fence) return null;

  const fields = new Set<string>();
  for (const line of fence[1].split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):/);
    if (m) fields.add(m[1]);
  }
  if (fields.size === 0) return null;

  const required = new Set<string>();
  const reqLine = section.match(/\*\*Campos obligatorios:\*\*([^\n]*)/);
  if (reqLine) {
    for (const t of reqLine[1].matchAll(/`([A-Za-z_][A-Za-z0-9_-]*)`/g)) {
      required.add(t[1]);
    }
  }
  return { fields, required };
}

/**
 * fx-skill-author §5 — per-family table. Each row's allowlist is the union of
 * the "Campos" and "Opcionales" cells' backticked tokens; a token like
 * `family: factory-internal` contributes its key (`family`), not the enum.
 */
function parseFamilyTable(body: string): Pick<DerivedAllowlists, 'kb' | 'sk' | 'fx'> {
  const out: Pick<DerivedAllowlists, 'kb' | 'sk' | 'fx'> = { kb: null, sk: null, fx: null };
  const section = extractSection(body, /^##\s+§5\b[^\n]*$/m);
  if (!section) return out;

  for (const line of section.split('\n')) {
    const row = line.match(/^\|\s*`(kb|sk|fx)-\*`\s*\|([^|]*)\|([^|]*)\|/);
    if (!row) continue;
    const fields = new Set<string>();
    for (const cell of [row[2], row[3]]) {
      for (const t of cell.matchAll(/`([^`]+)`/g)) {
        const key = t[1].split(':')[0].trim();
        if (KEY_RE.test(key)) fields.add(key);
      }
    }
    out[row[1] as 'kb' | 'sk' | 'fx'] = fields;
  }
  return out;
}

function deriveAllowlists(ctx: LintContext): DerivedAllowlists {
  const cached = allowlistCache.get(ctx.skills);
  if (cached) return cached;

  const workflow = ctx.skills.find((s) => s.name === SSOT_WORKFLOW);
  const skillAuthor = ctx.skills.find((s) => s.name === SSOT_SKILL_AUTHOR);
  const derived: DerivedAllowlists = {
    tk: workflow ? parseWorkflowShape(workflow.body) : null,
    ...(skillAuthor ? parseFamilyTable(skillAuthor.body) : { kb: null, sk: null, fx: null }),
  };
  allowlistCache.set(ctx.skills, derived);
  return derived;
}

/** Bounded Levenshtein: returns the distance when ≤2, null otherwise. */
function editDistanceAtMost2(a: string, b: string): number | null {
  if (Math.abs(a.length - b.length) > 2) return null;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length] <= 2 ? dp[b.length] : null;
}

/** Closest known field at edit distance 1-2, or null when nothing is close. */
function nearestKnown(key: string, known: Iterable<string>): string | null {
  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of known) {
    const d = editDistanceAtMost2(key, candidate);
    if (d !== null && d < bestDist) {
      best = candidate;
      bestDist = d;
    }
  }
  return best;
}

function familyOf(name: string): SkillFamily | null {
  const m = name.match(/^(tk|kb|sk|fx)-/);
  return m ? (m[1] as SkillFamily) : null;
}

/**
 * How many files of the item's family declare `key`. Skills count over the
 * same-prefix subset of `ctx.skills`; agents count over `ctx.agents` (one flat
 * family). When the item itself is not part of the corpus (synthetic test
 * contexts), it counts as one occurrence.
 */
function keyOccurrences(key: string, item: Skill, ctx: LintContext): number {
  const corpus =
    (item.kind ?? 'skill') === 'agent'
      ? (ctx.agents ?? [])
      : ctx.skills.filter(
          (s) => (s.kind ?? 'skill') === 'skill' && familyOf(s.name) === familyOf(item.name)
        );
  let n = corpus.filter((s) => key in s.frontmatter).length;
  if (!corpus.some((s) => s.name === item.name)) n += 1;
  return Math.max(n, 1);
}

function aliasHint(value: string): string {
  const suggestion = nearestKnown(value, MODEL_ALIASES);
  const base = 'Use one of the aliases: fable | opus | sonnet | haiku | inherit.';
  if (/^claude[-_]/i.test(value)) {
    return `${base} Full model IDs never go in frontmatter — the alias maps to the runtime's latest (fx-workflow-authoring §5/§8).`;
  }
  return suggestion ? `${base} Did you mean \`${suggestion}\`?` : base;
}

export const frontmatterCheck: Check = (skill, ctx): Finding[] => {
  const isAgent = (skill.kind ?? 'skill') === 'agent';
  const family = familyOf(skill.name);
  if (!isAgent && !family) return [];

  const findings: Finding[] = [];
  const fm = skill.frontmatter;
  // Derivative tolerance. Skills: every one reaching this check is
  // kit-manifest (loadSkills already filters pj-*) and read-only for the dev
  // (CORE.md §5) — a frontmatter defect there is informative, never
  // commit-blocking, so errors degrade uniformly. Agents: manifest-aware — a
  // kit-manifest agent (in `.timekast/lockfile.json`) with an error is the
  // same shipped file, a real defect → stays an error; the derivative's own
  // agents (non-manifest) degrade. Without a readable manifest, fail-open.
  const degrade = (sev: Severity): Severity => {
    if (sev !== 'error' || !ctx.isDerivative) return sev;
    if (isAgent && ctx.manifestAgentNames?.has(skill.name)) return 'error';
    return 'warning';
  };
  const push = (severity: Severity, message: string, hint?: string) => {
    findings.push({
      skill: skill.name,
      check: 'frontmatter',
      severity: degrade(severity),
      message,
      hint,
    });
  };

  const handled = new Set<string>();

  // Shared rule: unknown keys vs an allowlist. Skipped when no allowlist is
  // available (never guess).
  const flagUnknownKeys = (allowlist: Set<string> | null, shapeLabel: string) => {
    if (!allowlist) return;
    // A key is "known" if the kit shape OR the verified runtime surface
    // declares it; both corpora feed the near-miss detector.
    const runtimeFields = isAgent ? RUNTIME_AGENT_FIELDS : RUNTIME_SKILL_FIELDS;
    const known = new Set([...allowlist, ...runtimeFields]);
    for (const key of Object.keys(fm)) {
      if (known.has(key) || handled.has(key)) continue;
      const near = nearestKnown(key, known);
      if (near) {
        const occurrences = keyOccurrences(key, skill, ctx);
        if (occurrences <= 1) {
          push(
            'error',
            `Unknown frontmatter key \`${key}\` looks like a typo of \`${near}\``,
            `Claude Code silently ignores unknown keys — the intended setting never applied. Rename it to \`${near}\`.`
          );
        } else {
          push(
            'warning',
            `Unknown frontmatter key \`${key}\` (close to \`${near}\`) appears in ${occurrences} files of its family`,
            `If it is a deliberate new field, document it in the family's SSOT §5; otherwise fix the typo everywhere.`
          );
        }
      } else {
        push(
          'warning',
          `Unknown frontmatter key \`${key}\` — not part of the documented ${shapeLabel} shape`,
          `Not in the kit SSOT nor in the verified CC runtime surface (RUNTIME_*_FIELDS, checked against the official docs): document it in the SSOT if deliberate; otherwise remove it.`
        );
      }
    }
  };

  // --- Agent surface (LINT-003) — narrower shape, model alias + inherit rule.
  if (isAgent) {
    const model = fm['model'];
    if (model === undefined) {
      push(
        'warning',
        'Agent does not declare `model:` — every kit agent pins one explicitly',
        'Declare an alias (fable/opus/sonnet/haiku) or `inherit` if inheriting the session model is deliberate (fx-workflow-authoring §8).'
      );
    } else if (!MODEL_ALIASES.has(model)) {
      push(
        'error',
        `\`model: ${model}\` is not an allowed alias (fable/opus/sonnet/haiku/inherit)`,
        aliasHint(model)
      );
    } else if (model === 'inherit') {
      push(
        'warning',
        '`model: inherit` — the agent runs on whatever model the spawning workflow session uses',
        'Silent degradation when an auditor/reviewer role inherits from a cheaper-model workflow; pin an alias if the role is quality-bearing (fx-workflow-authoring §8).'
      );
    }
    flagUnknownKeys(AGENT_FIELDS, 'agent');
    return findings;
  }

  // --- Skill surface (LINT-002) — allowlist derived from the two SSOT.
  if (!family) return findings; // unreachable — narrowing for TS
  const shape = deriveAllowlists(ctx);

  // Rule: model/effort/operational have no effect on declarative skills
  // (kb-*/sk-*) — their presence is a copy-paste from a tk-*/fx-* or a wrong
  // expectation. `operational` in particular is fx-only: kb-*/sk-* are
  // reference by definition, there is nothing to declare.
  if (family === 'kb' || family === 'sk') {
    for (const key of ['model', 'effort', 'operational']) {
      if (key in fm) {
        handled.add(key);
        push(
          'error',
          `\`${key}\` does not apply to \`${family}-*\` skills — they are declarative reference, not work`,
          key === 'operational'
            ? `\`operational\` is an fx-* only field; kb-*/sk-* are reference by definition (fx-skill-author §5). Remove it.`
            : `The tier is decided by whoever executes, not the material consulted (fx-skill-author §5). Remove the field.`
        );
      }
    }
  }

  // Rules: model value must be an alias; presence per family doctrine.
  // The fx-* family is mixed: `operational: true` (fx-skill-author §5) marks
  // the skills that execute work when invoked; without it the skill is pure
  // reference and model/effort are the same dead fields they are on kb-*/sk-*.
  if (family === 'tk' || family === 'fx') {
    const fxReference = family === 'fx' && fm['operational'] !== 'true';
    if (fxReference) {
      for (const key of ['model', 'effort']) {
        if (key in fm) {
          handled.add(key);
          push(
            'error',
            `\`${key}\` on a reference \`fx-*\` skill — nothing consumes it`,
            `This skill is reference (no \`operational: true\`). If it executes work when invoked, declare \`operational: true\`; otherwise remove \`${key}\` (fx-skill-author §5).`
          );
        }
      }
    } else {
      const model = fm['model'];
      if (model !== undefined && !MODEL_ALIASES.has(model)) {
        push(
          'error',
          `\`model: ${model}\` is not an allowed alias (fable/opus/sonnet/haiku/inherit)`,
          aliasHint(model)
        );
      }
      if (model === undefined) {
        if (family === 'tk' && shape.tk?.required.has('model')) {
          push(
            'error',
            'Missing `model:` — required for every `tk-*` workflow',
            'fx-workflow-authoring §5 lists it as obligatorio; declare an alias (or `inherit` deliberately).'
          );
        } else if (family === 'fx') {
          push(
            'warning',
            'Missing `model:` — optional for `fx-*`, but an explicit alias documents the decision',
            'This skill declares `operational: true` (it directs work); pin an alias if the tier matters (fx-skill-author §5).'
          );
        }
      }
    }
  }

  // Rule: unknown keys vs the derived allowlist. Skipped when the SSOT shape
  // for this family could not be derived (never guess an allowlist).
  flagUnknownKeys(family === 'tk' ? (shape.tk?.fields ?? null) : shape[family], `\`${family}-*\``);

  return findings;
};
