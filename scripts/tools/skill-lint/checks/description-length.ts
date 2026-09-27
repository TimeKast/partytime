import type { Check, Finding } from '../types';

/**
 * Soft ceiling. The `description` is the ONLY text semantic routing reads
 * (CC.md §1.1): it has to say what the skill is, when to invoke it and what it
 * is not — and nothing else. Past this length a description is enumerating
 * features, and a skill that says everything matches everything.
 */
export const DESCRIPTION_WARN_CHARS = 600;

/**
 * Hard ceiling — the Claude Code runtime truncates a skill description at
 * 1024 characters, so whatever comes after this point is never read by the
 * router. Text the author believes is routing the skill silently is not.
 */
export const DESCRIPTION_MAX_CHARS = 1024;

/**
 * description-length — keep the routing text within the budget that routes.
 *
 * Two thresholds, two severities:
 *   - > 600 chars → warning: the description has drifted from "what / when /
 *     not this" into an inventory. Trim to the three parts.
 *   - > 1024 chars → error: the runtime cuts it there; the tail is dead text.
 *     In a derivative (`ctx.isDerivative`) it degrades to warning — kit-owned
 *     files are read-only there (CORE.md §5) and must never block a commit.
 *
 * Applies to skills and agents alike: both route by description.
 */
export const descriptionLengthCheck: Check = (skill, ctx): Finding[] => {
  const value = skill.frontmatter.description;
  if (typeof value !== 'string') return [];

  const length = value.trim().length;
  if (length > DESCRIPTION_MAX_CHARS) {
    return [
      {
        skill: skill.name,
        check: 'description-length',
        severity: ctx.isDerivative ? 'warning' : 'error',
        message: `\`description\` is ${length} chars — the runtime truncates at ${DESCRIPTION_MAX_CHARS}; the tail never routes`,
        hint: `Rewrite as what it is · when to invoke · what it is not (→ sibling). Target ≤500 chars.`,
      },
    ];
  }
  if (length > DESCRIPTION_WARN_CHARS) {
    return [
      {
        skill: skill.name,
        check: 'description-length',
        severity: 'warning',
        message: `\`description\` is ${length} chars (>${DESCRIPTION_WARN_CHARS}) — routing text, not an inventory`,
        hint: `Trim to what it is · when to invoke · what it is not (→ sibling). Target ≤500 chars.`,
      },
    ];
  }
  return [];
};
