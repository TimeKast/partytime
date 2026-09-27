---
name: { kb | sk }-{slug}
# kb-*: portable. sk-*: kit-shipped (grounded in real src/ files).
# description = trigger surface, EN-only, single-line. Words from the user's prompt.
# Close with the pair anchor if a counterpart exists (pair-cross-refs is enforced):
#   kb-*  → "… For kit infra → `sk-{slug}`."
#   sk-*  → "Kit-shipped … For portable paradigm → `kb-{slug}`."
description: { Portable | Kit-shipped } {domain} patterns for {stack} — {2-4 concrete capabilities}. Invoke when {user-prompt-shaped trigger}. {boundary / pair anchor}.
last-verified: { YYYY-MM-DD } # today
---

# { kb | sk }-{slug} — {Title in English}

> Stack: {e.g. Next.js 16+ App Router + Zod}.
> **{Portable — works in any {stack} project, with or without the kit. | Kit-shipped — not portable. Grounded in real files: `@/lib/...`, `@/...`.}**
>
> **Pair:** [`{sk|kb}-{slug}`](../{sk|kb}-{slug}/SKILL.md) — {one-line of what the counterpart owns}. <!-- omit if no pair -->
> Related: [`{other}`](../{other}/SKILL.md) for {reason}.
>
> <!-- sk-* ONLY: keep these two anchors; delete for kb-* -->
> **Canonical symbol names:** grep [`project/reference/HOOKS.md`](../../../project/reference/HOOKS.md) before naming any kit-shipped helper in a new file — autogen on pre-commit, SSOT for names + import paths.
> **As-built:** read [`project/reference/SCHEMA.md`](../../../project/reference/SCHEMA.md) / [`API.md`](../../../project/reference/API.md) before creating a new table/action — autogen, per-project, reuse/extend before building new.

---

## 1. {Primary rule or decision}

<!-- rules → patterns → examples → tables. Each section: narrative + a table or code fence. -->

| {Use A}        | {Use B}         |
| -------------- | --------------- |
| {when A}       | {when B}        |

> **Default to {A}.** {one-line rationale}.

---

## 2. {Pattern with code}

```ts
// minimal, runnable, GENERIC example — no client names, no real project data
export async function example(input: unknown): Promise<Result> {
  // …
}
```

**Why this matters:**

- {non-obvious consequence the agent won't infer from src/}
- {trap to avoid}

<!-- repeat sections 3..N as needed -->

---

## N. Anti-patterns

| ❌                                  | ✅                                       |
| ----------------------------------- | ---------------------------------------- |
| {the wrong way}                     | {the right way}                          |
| {another smell}                     | {the fix}                                |

---

## N+1. Checklist

- [ ] {verifiable item 1}
- [ ] {verifiable item 2}
- [ ] {verifiable item 3}

---

_Cross-reference: [`{pair}`](../{pair}/SKILL.md) — {role}. [`{related}`](../{related}/SKILL.md) — {role}._

<!--
AUTHORING NOTES (delete before commit — these live in fx-skill-author, not in the skill):
- description: run the 3-prompt routing test (fx-skill-author §6) before closing.
- body is AHISTORICAL: no version tags, no journey narrative, no dates, no client names (fx-skill-author §8).
- sk-*: every `@/` in a ts/tsx fence must resolve under src/ (skill:lint specifiers).
- kb-*: do NOT force a `→ sk-x` anchor if that sk-x does not exist.
- close with: pnpm skill:lint → 0 errors.
-->
