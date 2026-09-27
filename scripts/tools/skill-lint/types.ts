export type Severity = 'error' | 'warning';

export interface Finding {
  skill: string;
  check: string;
  severity: Severity;
  message: string;
  line?: number;
  hint?: string;
}

export interface Skill {
  name: string;
  path: string;
  raw: string;
  frontmatter: Record<string, string>;
  body: string;
  bodyLines: string[];
  /**
   * 'agent' when loaded from `.claude/agents/*.md` (LINT-003 — the frontmatter
   * check validates a different shape for agents). Absent/'skill' for skills.
   */
  kind?: 'skill' | 'agent';
}

export interface LintContext {
  skills: Skill[];
  skillNames: Set<string>;
  packageDeps: Set<string>;
  hooksRegistry: Set<string>;
  /** App symbol names from `project/reference/INVENTORY.md` (components, hooks, utilities). */
  inventoryRegistry: Set<string>;
  repoRoot: string;
  /**
   * True when linting inside a derivative (the CLI writes
   * `.timekast/lockfile.json` on install); false at the origin (the Factory).
   * Severity-bearing checks degrade `error → warning` in a derivative, where a
   * kit-shipped `sk-*` cites the kit's `src/` but the project's `src/` may
   * legitimately diverge. Computed once when the context is built so it stays
   * injectable (tests force origin/derivative explicitly, not via `cwd`).
   */
  isDerivative: boolean;
  /**
   * Agents loaded from `.claude/agents/*.md` — the frontmatter check's corpus
   * for near-miss counting across agents. Optional: absent in contexts built
   * before LINT-003 (treated as an empty corpus).
   */
  agents?: Skill[];
  /**
   * Agent names listed in the kit manifest (`.timekast/lockfile.json` `files[]`
   * entries under `.claude/agents/`). Only populated in a derivative; undefined
   * at origin, where the manifest distinction does not apply. A kit-manifest
   * agent with a frontmatter error in a derivative stays an ERROR (same shipped
   * file — a defect, not divergence); a non-manifest agent (the derivative's
   * own) degrades to warning.
   */
  manifestAgentNames?: Set<string>;
}

export type Check = (skill: Skill, ctx: LintContext) => Finding[];
