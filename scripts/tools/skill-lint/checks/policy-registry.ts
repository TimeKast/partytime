import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import fg from 'fast-glob';
import { z } from 'zod';

import type { Check, Finding, LintContext, Severity, Skill } from '../types';

/**
 * policy-registry — validate `.claude/policy/quality-gates.json` (LINT-004).
 *
 * The registry is the runtime SSOT for review panels (`panel_by_risk`) and
 * risk rules (`rules[{when, risk, require}]`) that workflows (`tk-implement`)
 * read as plain JSON. Nothing else validates its shape — a typo in a reviewer
 * name or a risk outside 0-4 would surface only when a workflow reads it in
 * production. This check validates it **by form** with a Zod schema, never by
 * equality against a hardcoded copy of the expected content (the anti-pattern
 * `kb-ssot-registries §2` warns about): content invariants (e.g. "schema paths
 * always require security-auditor") belong to whoever writes the registry.
 *
 * Scope:
 *   - `.claude/policy/quality-gates.json` (kit registry) — always an ERROR on
 *     form defects, at origin AND in a derivative (it is the same shipped
 *     file; an invalid shape is a kit defect, never expected divergence).
 *   - `.claude/policy/quality-gates.project.json` (per-repo override) — same
 *     schema. In a derivative (`ctx.isDerivative`) its form errors degrade to
 *     warnings (it is the derivative's own extension, outside the manifest).
 *   - An override rule whose `risk` does not exceed the kit's for the SAME
 *     `when.paths`/`when.signal` and adds no reviewer is INERT (aggregation is
 *     `risk = max` / `require = union` — overrides only harden, never relax)
 *     → warning, never error, regardless of `isDerivative`. Predicates compare
 *     by exact path-set/signal equality — no glob subsumption analysis.
 *   - An OVERRIDE glob (`paths`, `exceptPaths`, `pathSets`) that matches no file
 *     in the tree → warning, never error (`deadGlobFindings`). A risk rule is a
 *     promise of scrutiny, and this is the one kind of promise that breaks
 *     without a symptom: the code moves (an App Router route group renames
 *     nothing a user sees), the glob stops matching, and the epic that needed
 *     the reviewer closes one level lower. Warning because a glob may name
 *     code that does not exist YET, and override-only because the kit's
 *     registry ships globs (`cli/src/**`, the migrations glob) that legitimately
 *     resolve to nothing in a derivative or at the Factory itself.
 *   - Either file absent → no finding (the kit registry lands via POL-001; the
 *     override is optional by design — most derivatives never declare one).
 *
 * The file is read + `JSON.parse`d — no dynamic `import()` (static analysis,
 * per `kb-ssot-registries §2`; the registry is pure JSON, nothing to execute).
 */

const KIT_REGISTRY_RELPATH = '.claude/policy/quality-gates.json';
const OVERRIDE_REGISTRY_RELPATH = '.claude/policy/quality-gates.project.json';
const AGENTS_DIR = '.claude/agents';
const CHECK_NAME = 'policy-registry';

// ---------------------------------------------------------------------------
// Schema — form only. Enums close over the values POL-001/POL-006 declare;
// registry and validator evolve together (a new block lands with its schema
// update in the same commit — that is the point of form-locking).
// ---------------------------------------------------------------------------

/** Closed signal enum from POL-001 §6. */
const KNOWN_SIGNALS = [
  'new-dependency',
  'no-adr',
  'meta-foundation',
  'destructive-migration',
  'combined-auth-schema',
] as const;

/** Review modes + severity floor classes, cited from POL-006 (not redefined). */
const REVIEW_MODES = ['adversarial', 'informative'] as const;
const SEVERITY_FLOORS = ['breaks', 'wrong', 'cosmetic'] as const;

/**
 * Inclusive-floor strictness under the POL-006 total order
 * `breaks > wrong > cosmetic`: floor `cosmetic` counts all three (strictest),
 * `wrong` counts wrong AND breaks, `breaks` counts breaks only (laxest).
 * Hardening = moving the floor down the order; a lower strictness value is a
 * relaxation.
 */
const FLOOR_STRICTNESS: Record<(typeof SEVERITY_FLOORS)[number], number> = {
  breaks: 0,
  wrong: 1,
  cosmetic: 2,
};

/**
 * "Well-formed glob" is a minimal syntactic bar: non-empty, no control
 * characters. Whether the glob matches real files is NOT a form question:
 * the kit registry is never walked (issue §8 — its globs legitimately resolve
 * to nothing in a given checkout), and the override is, as a WARNING
 * (`deadGlobFindings`).
 */
const globSchema = z
  .string()
  .min(1, 'glob must be a non-empty string')
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), {
    message: 'glob must not contain control characters',
  });

const agentNameSchema = z.string().min(1, 'agent name must be a non-empty string');

/**
 * The one signal whose definition is "the diff intersects BOTH of these path
 * sets", and the names of those sets. The sets are DATA of the signal's rule
 * (`when.pathSets`) — in the kit registry as the floor, in the override as an
 * ADDITIVE extension per set name — rather than prose in
 * `fx-execution-policy §6`. Prose gave a derivative nothing to extend: a
 * project whose auth surface lives outside the kit's five routes (its own
 * OAuth gate) had a signal that could never reach it, and the level it
 * resolved looked reasonable because another rule happened to carry it.
 */
const PATH_SET_SIGNAL = 'combined-auth-schema' as const;
const PATH_SET_NAMES = ['auth', 'schema'] as const;

const pathSetsSchema = z
  .strictObject({
    auth: z.array(globSchema).min(1, 'a path set must list at least one glob').optional(),
    schema: z.array(globSchema).min(1, 'a path set must list at least one glob').optional(),
  })
  .refine((sets) => PATH_SET_NAMES.some((name) => sets[name] !== undefined), {
    message: '`when.pathSets` must declare at least one of `auth` / `schema`',
  });

const whenSchema = z
  .strictObject({
    paths: z.array(globSchema).min(1, 'a paths predicate must list at least one glob').optional(),
    exceptPaths: z
      .array(globSchema)
      .min(1, 'an exceptPaths carve-out must list at least one glob')
      .optional(),
    signal: z.enum(KNOWN_SIGNALS).optional(),
    pathSets: pathSetsSchema.optional(),
  })
  .refine((w) => (w.paths === undefined) !== (w.signal === undefined), {
    message:
      'a rule must declare exactly one predicate: `when.paths` or `when.signal` (never both, never neither)',
  })
  /**
   * `exceptPaths` narrows a `paths` predicate; it has nothing to narrow on a
   * `signal` rule (POL-006 §4.1), so pairing them is a shape error rather than
   * a silently inert field.
   */
  .refine((w) => w.exceptPaths === undefined || w.paths !== undefined, {
    message: '`when.exceptPaths` only narrows a `when.paths` predicate — never a `when.signal` one',
  })
  /**
   * `pathSets` is the data of exactly one signal. On a `paths` rule, or on a
   * signal that is not defined over path sets, it would be a field nobody
   * reads — the silent inertness this whole check exists to refuse.
   */
  .refine((w) => w.pathSets === undefined || w.signal === PATH_SET_SIGNAL, {
    message: `\`when.pathSets\` belongs only to \`when.signal: "${PATH_SET_SIGNAL}"\` — the one signal defined over path sets`,
  });

const ruleSchema = z.strictObject({
  when: whenSchema,
  risk: z.number().int().min(0).max(4),
  require: z.array(agentNameSchema),
});

const panelByRiskSchema = z.strictObject({
  '0': z.array(agentNameSchema),
  '1': z.array(agentNameSchema),
  '2': z.array(agentNameSchema),
  '3': z.array(agentNameSchema),
  '4': z.array(agentNameSchema),
});

const loopEntrySchema = z.strictObject({
  clean_rounds: z.number().int().min(1),
  severity_floor: z.enum(SEVERITY_FLOORS),
});

/** Optional until POL-006 lands it; mandatory to validate once present. */
const reviewSchema = z.strictObject({
  default_mode: z.enum(REVIEW_MODES),
  informative: z.array(agentNameSchema),
  /**
   * Precedence declaration (POL-006): informative mode never relieves a gate
   * a workflow declares as blocking (🔴) — workflow-written hard gates win.
   * Single closed token: the field declares the rule, the semantics live in
   * `fx-execution-policy §4.4`.
   */
  precedence: z.literal('workflow-gates-win').optional(),
  /**
   * Activation lever for the evidence axis (`fx-execution-policy §4.4`):
   * present as `false`, the effective cell rules (`wrong × unevidenced` does
   * not dirty the round); present as `true`, unevidenced findings dirty again
   * (the hardening an override may buy). `.optional()` on purpose: `undefined`
   * inherits the kit's value and is NEVER read as a declared `false` —
   * pre-existing overrides keep parsing without edits.
   */
  unevidenced_dirties: z.boolean().optional(),
  loop_by_risk: z.strictObject({
    '0': loopEntrySchema,
    '1': loopEntrySchema,
    '2': loopEntrySchema,
    '3': loopEntrySchema,
    '4': loopEntrySchema,
  }),
});

const registrySchema = z.strictObject({
  panel_by_risk: panelByRiskSchema,
  rules: z.array(ruleSchema),
  review: reviewSchema.optional(),
});

type PolicyRegistry = z.infer<typeof registrySchema>;
type PolicyRule = PolicyRegistry['rules'][number];

// ---------------------------------------------------------------------------
// Wiring — the check is repo-level (it validates two JSON files, not a skill
// body), so index.ts invokes it ONCE per run against this synthetic subject
// instead of adding it to the per-skill CHECKS loop.
// ---------------------------------------------------------------------------

export const POLICY_REGISTRY_SUBJECT: Skill = {
  name: 'policy-registry',
  path: KIT_REGISTRY_RELPATH,
  raw: '',
  frontmatter: {},
  body: '',
  bodyLines: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agentExists(repoRoot: string, name: string): boolean {
  return existsSync(join(repoRoot, AGENTS_DIR, `${name}.md`));
}

/** Exact path-set/signal identity — no glob subsumption (issue §8). */
function predicateKey(when: PolicyRule['when']): string {
  if (when.signal !== undefined) return `signal:${when.signal}`;
  return `paths:${[...(when.paths ?? [])].sort().join('\u0000')}`;
}

function describePredicate(when: PolicyRule['when']): string {
  if (when.signal !== undefined) return `when.signal "${when.signal}"`;
  return `when.paths [${(when.paths ?? []).join(', ')}]`;
}

interface FileValidation {
  findings: Finding[];
  registry?: PolicyRegistry;
}

/**
 * Validate one registry file. Absent file → no finding, no registry (the
 * normal case for the override, and the pre-POL-001 case for the kit file).
 */
function validateRegistryFile(
  subjectName: string,
  ctx: LintContext,
  relPath: string,
  severity: Severity
): FileValidation {
  const absPath = join(ctx.repoRoot, relPath);
  if (!existsSync(absPath)) return { findings: [] };

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(absPath, 'utf-8'));
  } catch (err) {
    return {
      findings: [
        {
          skill: subjectName,
          check: CHECK_NAME,
          severity,
          message: `${relPath}: not valid JSON — ${err instanceof Error ? err.message : String(err)}`,
          hint: 'The policy registry must be parseable JSON before its shape can be validated.',
        },
      ],
    };
  }

  const parsed = registrySchema.safeParse(data);
  if (!parsed.success) {
    return {
      findings: parsed.error.issues.map((issue) => ({
        skill: subjectName,
        check: CHECK_NAME,
        severity,
        message: `${relPath}: ${issue.path.length > 0 ? issue.path.join('.') : '(root)'} — ${issue.message}`,
        hint:
          'Expected shape: panel_by_risk["0".."4"] + rules[{when: paths XOR signal, risk 0-4, require}]' +
          ' (+ optional review block per POL-006).',
      })),
    };
  }

  // Referential form: every reviewer name must exist as .claude/agents/{name}.md.
  // Existence only — the agent's own frontmatter is the frontmatter check's job.
  const findings: Finding[] = [];
  const flagMissing = (location: string, name: string) => {
    if (agentExists(ctx.repoRoot, name)) return;
    findings.push({
      skill: subjectName,
      check: CHECK_NAME,
      severity,
      message: `${relPath}: ${location} — reviewer \`${name}\` does not exist as ${AGENTS_DIR}/${name}.md`,
      hint: 'Fix the agent name — a typo here leaves a gate without its reviewer in silence.',
    });
  };

  const registry = parsed.data;
  registry.rules.forEach((rule, i) => {
    for (const name of rule.require) flagMissing(`rules[${i}].require`, name);
  });
  for (const [level, names] of Object.entries(registry.panel_by_risk)) {
    for (const name of names) flagMissing(`panel_by_risk["${level}"]`, name);
  }
  for (const name of registry.review?.informative ?? []) {
    flagMissing('review.informative', name);
  }

  return { findings, registry };
}

/**
 * Inert override rules: aggregation is `risk = max` / `require = union`, so an
 * override rule that neither raises risk nor adds a reviewer for a predicate
 * the kit already covers changes nothing. Warning (never error) — and it does
 * NOT depend on `isDerivative`: inertness is a property of the pair of files.
 */
function inertOverrideFindings(
  subjectName: string,
  kit: PolicyRegistry,
  override: PolicyRegistry
): Finding[] {
  // Aggregate kit rules per predicate the same way the runtime consumer does.
  const kitByPredicate = new Map<string, { risk: number; require: Set<string> }>();
  for (const rule of kit.rules) {
    const key = predicateKey(rule.when);
    const agg = kitByPredicate.get(key);
    if (agg) {
      agg.risk = Math.max(agg.risk, rule.risk);
      for (const name of rule.require) agg.require.add(name);
    } else {
      kitByPredicate.set(key, { risk: rule.risk, require: new Set(rule.require) });
    }
  }

  const findings: Finding[] = [];
  override.rules.forEach((rule, i) => {
    const kitAgg = kitByPredicate.get(predicateKey(rule.when));
    if (!kitAgg) return; // new predicate — always effective
    const raisesRisk = rule.risk > kitAgg.risk;
    const addsReviewer = rule.require.some((name) => !kitAgg.require.has(name));
    // Extending a signal's path sets is the third way an override hardens: the
    // signal now fires on paths it could not reach before (union per set name).
    const extendsPathSets = rule.when.pathSets !== undefined;
    if (raisesRisk || addsReviewer || extendsPathSets) return;

    findings.push({
      skill: subjectName,
      check: CHECK_NAME,
      severity: 'warning',
      message:
        `${OVERRIDE_REGISTRY_RELPATH}: rules[${i}] — inert override rule for ${describePredicate(rule.when)}: ` +
        `risk ${rule.risk} does not exceed the kit's ${kitAgg.risk} and it adds no reviewer`,
      hint: 'Overrides only harden (risk = max, require = union, pathSets = union) — raise the risk, add a reviewer, extend a path set, or drop the rule.',
    });
  });
  return findings;
}

/** What the tree walk skips: never the reason a rule's glob is "alive". */
const DEAD_GLOB_IGNORE = ['**/node_modules/**', '**/.git/**'];

/** Does `glob` match at least one file under `repoRoot`? One walk per glob, stopped at the first hit. */
function globIsAlive(repoRoot: string, glob: string): boolean {
  return (
    fg.sync(glob, {
      cwd: repoRoot,
      dot: true,
      onlyFiles: true,
      ignore: DEAD_GLOB_IGNORE,
      suppressErrors: true,
    }).length > 0
  );
}

/**
 * Override globs that match NOTHING in the tree — a rule that died in silence.
 *
 * A risk rule is a promise of scrutiny, and this is the one kind of promise that
 * breaks without a symptom: no test goes red, no epic fails, the one that
 * needed the reviewer simply closes a level lower — indistinguishable from an
 * epic that never needed it. The trigger is the most ordinary refactor there
 * is: an App Router route group (`src/app/oauth/**` → `src/app/(public)/oauth/**`)
 * changes no URL and leaves the rule inert. A real derivative measured two
 * such rules already dead, still cited as live by its own documents.
 *
 * WARNING, NEVER ERROR — the reason the walk was originally left out is still
 * a reason: a glob may name code that does not exist yet (the rule written
 * before its feature), and breaking the pre-commit over that would be worse
 * than the silence. The value is visibility; who reads the warning decides
 * whether the rule died or the code has not been born.
 *
 * OVERRIDE ONLY — the kit's registry ships globs that legitimately resolve to
 * nothing in a given checkout (`cli/src/**` in every derivative,
 * `**\/migrations/**` at the Factory, which keeps no migrations by design), so
 * checking it would print permanent noise across the fleet, and noise is what
 * teaches a reader to skip the one line that matters.
 */
function deadGlobFindings(
  subjectName: string,
  ctx: LintContext,
  override: PolicyRegistry
): Finding[] {
  const findings: Finding[] = [];
  const flag = (location: string, glob: string) => {
    findings.push({
      skill: subjectName,
      check: CHECK_NAME,
      severity: 'warning',
      message: `${OVERRIDE_REGISTRY_RELPATH}: ${location} — glob \`${glob}\` matches no file in this checkout: the rule is inert until it does`,
      hint: 'If the code moved (a route group, a rename), update the glob — the rule died in silence. If the code is not written yet, the warning goes away when it lands.',
    });
  };

  override.rules.forEach((rule, i) => {
    for (const glob of rule.when.paths ?? []) {
      if (!globIsAlive(ctx.repoRoot, glob)) flag(`rules[${i}].when.paths`, glob);
    }
    for (const glob of rule.when.exceptPaths ?? []) {
      if (!globIsAlive(ctx.repoRoot, glob)) flag(`rules[${i}].when.exceptPaths`, glob);
    }
    for (const name of PATH_SET_NAMES) {
      for (const glob of rule.when.pathSets?.[name] ?? []) {
        if (!globIsAlive(ctx.repoRoot, glob)) flag(`rules[${i}].when.pathSets.${name}`, glob);
      }
    }
  });
  return findings;
}

/**
 * Harden-only `review` overrides (POL-006). Unlike `rules[]` — where the
 * aggregation (`risk = max` / `require = union`) neutralizes a relaxation into
 * inertness (warning) — a relaxed `review` block has no safe aggregation:
 * adding an agent to `informative` switches its gate off, and a lowered
 * `default_mode` switches the whole mechanism off. That is exactly the silent
 * failure mode overrides exist to prevent, so these are ERRORS. And like
 * inertness, the verdict is a property of the pair of files — it does NOT
 * degrade with `isDerivative`: the kit floor is a floor precisely there.
 */
function reviewOverrideFindings(
  subjectName: string,
  kit: PolicyRegistry,
  override: PolicyRegistry
): Finding[] {
  const kitReview = kit.review;
  const overrideReview = override.review;
  // No review override → nothing to compare. A missing KIT baseline
  // (pre-POL-006 kit under skewed adoption) does NOT short-circuit anymore:
  // the doctrine-anchored fields are compared against the doctrine defaults
  // (`adversarial`, `informative: []`, lever absent = axis inert) so an
  // override cannot soften what the kit never declared. Only loop_by_risk
  // still requires the kit block — there is no per-level doctrine default,
  // and hardcoding the kit's table here would fork the registry-as-SSOT.
  if (!overrideReview) return [];

  const findings: Finding[] = [];
  const flag = (location: string, message: string) => {
    findings.push({
      skill: subjectName,
      check: CHECK_NAME,
      severity: 'error',
      message: `${OVERRIDE_REGISTRY_RELPATH}: ${location} — ${message}`,
      hint:
        'The review override only hardens: raise clean_rounds, raise the severity floor' +
        ' (`breaks` → `wrong` → `cosmetic`), remove agents from `informative`, or flip' +
        ' `unevidenced_dirties` from `false` to `true` — never the reverse.',
    });
  };

  if (
    (kitReview?.default_mode ?? 'adversarial') === 'adversarial' &&
    overrideReview.default_mode === 'informative'
  ) {
    flag(
      'review.default_mode',
      'lowers `adversarial` (kit) to `informative` — that switches the review mechanism off'
    );
  }

  /**
   * Evidence-axis lever (`fx-execution-policy §4.4`): the only permitted
   * direction is `false → true` (unevidenced findings dirty again = harden).
   * `true → false` re-buys convergence the kit revoked — an error, same form
   * as the four comparisons above. An override that leaves the field
   * `undefined` INHERITS the kit's value (inert, no finding) — never read as
   * a declared `false`; `clean_rounds` offers no precedent here because it is
   * mandatory and never `undefined`. The kit side is the mirror case: kit
   * `true` OR kit silent (absent key = axis inert, every `wrong` dirties)
   * both mean the soft cell is NOT bought — an override declaring `false`
   * against either is softening, not inheritance.
   */
  if (kitReview?.unevidenced_dirties !== false && overrideReview.unevidenced_dirties === false) {
    flag(
      'review.unevidenced_dirties',
      'declares `false` while the kit declares `true` or leaves the axis inert — the lever only moves `false` → `true`'
    );
  }

  const kitInformative = new Set(kitReview?.informative ?? []);
  for (const name of overrideReview.informative) {
    if (kitInformative.has(name)) continue;
    flag(
      'review.informative',
      `adds \`${name}\` as an informative (non-gating) reviewer — the override may only REMOVE agents from this list`
    );
  }

  for (const level of ['0', '1', '2', '3', '4'] as const) {
    if (!kitReview) break; // no per-level doctrine default — see the comment at the top
    const kitLoop = kitReview.loop_by_risk[level];
    const overrideLoop = overrideReview.loop_by_risk[level];
    if (overrideLoop.clean_rounds < kitLoop.clean_rounds) {
      flag(
        `review.loop_by_risk["${level}"].clean_rounds`,
        `lowers clean_rounds from ${kitLoop.clean_rounds} (kit) to ${overrideLoop.clean_rounds}`
      );
    }
    if (FLOOR_STRICTNESS[overrideLoop.severity_floor] < FLOOR_STRICTNESS[kitLoop.severity_floor]) {
      flag(
        `review.loop_by_risk["${level}"].severity_floor`,
        `relaxes the severity floor from \`${kitLoop.severity_floor}\` (kit) to \`${overrideLoop.severity_floor}\``
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export const policyRegistryCheck: Check = (subject, ctx): Finding[] => {
  const findings: Finding[] = [];

  // Kit registry: ALWAYS error on form defects — same shipped file at origin
  // and in a derivative; an invalid shape is a defect, not divergence.
  const kit = validateRegistryFile(subject.name, ctx, KIT_REGISTRY_RELPATH, 'error');
  findings.push(...kit.findings);

  // Override: the derivative's own extension → its form errors degrade to
  // warning in a derivative (same pattern as specifiers.ts / symbols.ts).
  const overrideSeverity: Severity = ctx.isDerivative ? 'warning' : 'error';
  const override = validateRegistryFile(
    subject.name,
    ctx,
    OVERRIDE_REGISTRY_RELPATH,
    overrideSeverity
  );
  findings.push(...override.findings);

  if (kit.registry && override.registry) {
    findings.push(...inertOverrideFindings(subject.name, kit.registry, override.registry));
    findings.push(...reviewOverrideFindings(subject.name, kit.registry, override.registry));
  }
  // Dead globs need only the override — a kit that has not landed yet changes
  // nothing about whether the project's own globs still find their files.
  if (override.registry) {
    findings.push(...deadGlobFindings(subject.name, ctx, override.registry));
  }

  return findings;
};
