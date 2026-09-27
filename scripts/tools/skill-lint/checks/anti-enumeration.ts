import type { Check, Finding } from '../types';
import { extractInlineCode } from '../body-utils';

const ENUM_PATTERNS = [/^use[A-Z][A-Za-z0-9]*$/, /^with[A-Z][A-Za-z0-9]*$/, /^[A-Z][a-zA-Z0-9]+$/];

const ANCHOR_PATTERNS = [/INVENTORY\.md/i, /HOOKS\.md/i, /CODEBASE\.md/i, /project\/reference\//i];

const THRESHOLD = 8;

/**
 * Flag skills that enumerate >N symbols without anchoring to a canonical
 * registry. Enumeration drifts the moment the registry changes — the rule is:
 * cite by link, not by list.
 *
 * Only a symbol the registries list can drift against them, so when HOOKS.md
 * or INVENTORY.md is loaded a token counts only if it is registered — tool
 * names, error classes, env vars and keys (`Read`, `TypeError`, `PORT`, `Tab`)
 * match the symbol shape but have no registry to drift from. With neither
 * registry present the shape match alone decides, as before.
 *
 * Anchor detection is lenient — any mention of INVENTORY/HOOKS/CODEBASE (or
 * the autogen folder) in the skill counts, because in practice it means the
 * author is pointing readers at the SSOT.
 */
export const antiEnumerationCheck: Check = (skill, ctx): Finding[] => {
  const inline = extractInlineCode(skill.body);
  const enumerated = new Set<string>();
  const hasRegistry = ctx.hooksRegistry.size > 0 || ctx.inventoryRegistry.size > 0;
  const isRegistered = (text: string) =>
    ctx.hooksRegistry.has(text) || ctx.inventoryRegistry.has(text);

  for (const { text } of inline) {
    if (!ENUM_PATTERNS.some((re) => re.test(text))) continue;
    if (hasRegistry && !isRegistered(text)) continue;
    enumerated.add(text);
  }

  if (enumerated.size <= THRESHOLD) return [];
  if (ANCHOR_PATTERNS.some((re) => re.test(skill.body))) return [];

  return [
    {
      skill: skill.name,
      check: 'anti-enumeration',
      severity: 'warning',
      message: `Enumerates ${enumerated.size} symbols without anchoring to INVENTORY/HOOKS/CODEBASE`,
      hint: `Replace the literal list with a pointer — e.g. "See \`project/reference/HOOKS.md\` for the canonical list." Lists drift; the registry stays fresh.`,
    },
  ];
};
