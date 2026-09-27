import type { Check, Finding } from '../types';

const MAX_AGE_DAYS = 90;

function daysSince(iso: string): number | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000));
}

/**
 * Warn when a skill's `last-verified` frontmatter field is absent or older
 * than 90 days. This is a soft signal — drift isn't guaranteed, but a skill
 * that hasn't been re-read in a quarter is a reasonable candidate for review.
 *
 * Opt-in by design: skills without the field trigger a one-line warning, not
 * an error. Over time as the kit adopts the field, noise will drop.
 */
export const stalenessCheck: Check = (skill): Finding[] => {
  const value = skill.frontmatter['last-verified'] ?? skill.frontmatter['last_verified'];

  if (!value) {
    return [
      {
        skill: skill.name,
        check: 'staleness',
        severity: 'warning',
        message: `Frontmatter is missing \`last-verified: YYYY-MM-DD\``,
        hint: `Add the field on next review — it lets this check surface skills that have silently drifted.`,
      },
    ];
  }

  const age = daysSince(value);
  if (age === null) {
    return [
      {
        skill: skill.name,
        check: 'staleness',
        severity: 'warning',
        message: `\`last-verified\` value \`${value}\` is not a valid ISO date`,
        hint: `Use \`YYYY-MM-DD\`.`,
      },
    ];
  }
  if (age > MAX_AGE_DAYS) {
    return [
      {
        skill: skill.name,
        check: 'staleness',
        severity: 'warning',
        message: `\`last-verified\` is ${age} days old (>${MAX_AGE_DAYS})`,
        hint: `Re-read the skill against the current codebase and bump the date.`,
      },
    ];
  }
  return [];
};
