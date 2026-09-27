import type { Check, Finding } from '../types';
import { stripCodeBlocks } from '../body-utils';

/**
 * Numeric rules we hold as SSOT in peer rules. Skills that contradict these
 * were the most damaging class of drift during C3-R1 (a 4-layer pyramid claim
 * in a since-retired kb-* testing skill silently disagreed with SK.md §4.2's 3-layer).
 *
 * Keep this list small and explicit — expanding it invites NLP, which we've
 * explicitly declined (FX-001 Risks §3).
 */
interface NumericRule {
  name: string;
  expected: number;
  source: string;
  patterns: RegExp[]; // captures a number group
}

const RULES: NumericRule[] = [
  {
    name: 'testing-pyramid-layers',
    expected: 3,
    source: 'SK.md §4.2',
    patterns: [
      /(\d+)[-\s]layer\s+pyramid/gi,
      /pyramid\s+of\s+(\d+)\s+layers?/gi,
      /(\d+)\s+layers?\s+of\s+testing/gi,
    ],
  },
  {
    name: 'max-auto-loaded-skills',
    expected: 5,
    source: 'CC.md §1.1',
    patterns: [
      /max\s+(\d+)\s+skills?\s+auto[-\s]?loaded/gi,
      /(\d+)\s+skills?\s+auto[-\s]?loaded\s+simult/gi,
    ],
  },
];

/**
 * Detect skills that assert a number for a concept where rules hold a different
 * SSOT value. Scope: prose only (code blocks stripped — examples may cite
 * historical values).
 */
export const ruleContradictionsCheck: Check = (skill): Finding[] => {
  const findings: Finding[] = [];
  const stripped = stripCodeBlocks(skill.body);
  const lines = stripped.split('\n');

  for (const rule of RULES) {
    const seenLines = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of rule.patterns) {
        const re = new RegExp(pattern.source, pattern.flags);
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const stated = Number.parseInt(m[1], 10);
          if (Number.isNaN(stated)) continue;
          if (stated === rule.expected) continue;
          if (seenLines.has(i)) continue;
          seenLines.add(i);

          findings.push({
            skill: skill.name,
            check: 'rule-contradictions',
            severity: 'error',
            message: `\`${rule.name}\`: skill states ${stated}, ${rule.source} says ${rule.expected}`,
            line: i + 1,
            hint: `Update the skill to match ${rule.source}, or update the rule if the skill is correct.`,
          });
        }
      }
    }
  }

  return findings;
};
