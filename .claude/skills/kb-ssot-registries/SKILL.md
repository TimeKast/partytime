---
name: kb-ssot-registries
description: Kit doctrine for registry-as-SSOT domains — the reconcile-vs-validate dichotomy the pre-commit hook implements (`.husky/pre-commit`, four ordered phases), the table of the kit's own reconcilers and validators, the static handler check that keeps validators free of runtime imports, and the anti-patterns that produce drift. Invoke when adding a registry-backed domain (crons, navigation, roles, flags), wiring a reconciler or validator into the pre-commit, or reviewing a plan that touches config-as-SSOT. Applied example → kb-cron-jobs.
last-verified: 2026-09-22
user-invocable: false
---

# kb-ssot-registries — Registry-as-SSOT: how the kit keeps derived files honest

> Pair: [`kb-cron-jobs`](../kb-cron-jobs/SKILL.md) — canonical applied example. The kit base already follows this pattern in five domains (roles, navigation, notifications, env, drizzle schema); this skill names what's there and gives you the recipe to add a sixth.

**What this skill covers:** how the kit enforces "single editable config + everything else derived/cached" with its pre-commit machinery. The registry itself is ordinary TypeScript (`as const satisfies`, an id union derived from the array, helpers derived with `Object.fromEntries` — never a parallel hand-written map); it pays off once a second consumer reads the same data, and is premature abstraction before that. The pattern's central insight is the **reconcile-vs-validate dichotomy**: derived files are cache that the SSOT regenerates silently; validators catch drift inside the SSOT (or bypass scenarios) and block the commit. Together they give you a system where errors concentrate in one custodied file.

---

## 1. The reconcile-vs-validate dichotomy (the central pattern)

Two semantics keep the SSOT honest:

- **Reconciler** — silent fix + re-stage. Treats derivative files as cache; SSOT always wins. Runs in pre-commit, modifies the working tree, `git add`s the result. The author may not even notice the file changed.
- **Validator** — blocks the commit on inconsistency _inside_ the SSOT, or between SSOT and a derivative the reconciler should have fixed but didn't (because someone bypassed the hook, cherry-picked a derivative, or the reconciler script silently failed).

Defense-in-depth: validators run **after** reconcilers. If the reconciler did its job, the validator passes. If the reconciler was bypassed or buggy, the validator catches it and aborts the commit with an actionable error.

The kit base already lives this dichotomy without naming it:

| Reconcilers (silent fix + re-stage) | Validators (block on drift)       |
| ----------------------------------- | --------------------------------- |
| `prettier --write` (lint-staged)    | `pnpm typecheck` (pre-push)       |
| `eslint --fix` (lint-staged)        | `pnpm lint` (pre-push)            |
| `pnpm generate:inventory`           | `pnpm skill:lint` (pre-commit)    |
| `pnpm generate:codebase`            | `validate-commit.sh` (PreToolUse) |
| `pnpm generate:hooks`               | `agent-taxonomy-lint.sh`          |
| `pnpm db:generate` (Drizzle)        | (no peer in kit base today)       |

Adding a new SSOT-backed domain to a project is the same recipe: write the reconciler that derives the platform output from the registry, write the validator that catches drift the reconciler can't fix, wire both into pre-commit.

---

## 2. Static handler check pattern (best-effort)

Many registries reference symbols that live elsewhere — a cron job entry that says _"when this fires, call `runFooJob` from `@/lib/jobs/foo`"_, a navigation entry that says _"render this with `FooBadge` from `@/components/badges`"_. Validating that those symbols actually exist matters: a renamed function silently breaks the registry contract, the validator should catch it before deploy.

The naive solution — dynamic `import()` — is unviable in CI. The module loads its imports too: Drizzle, NextAuth, env vars, secrets. A linter that needs Postgres + auth wired up to run is dead on arrival in pre-commit.

The pattern is **regex over source**:

1. Resolve the alias (e.g. `@/` → `src/`) to a file path. Search `.ts`, `.tsx`, then `index.ts` for barrel re-exports.
2. Read the file as a string. **No execution.**
3. Match `export\s+(?:async\s+)?(?:function|const|let|var|class)\s+<NAME>\b` for direct declarations.
4. Fallback match `export\s*\{[^}]*\b<NAME>\b` for named re-exports.

This is **explicitly best-effort**. It covers ~95% of legitimate exports in well-formed code. It does **NOT** transparently handle:

- **`export * from './foo'`** (namespace re-exports) — would require recursive resolution of every star-export. Fail with an actionable message instead: _"Handler resolution of `runFooJob` hit `export * from './foo'` at PATH; either re-export `runFooJob` explicitly via `export { runFooJob } from './foo'` or change the registry to point directly at the source module."_
- **Complex TS path aliases beyond `@/`** (e.g. multi-root tsconfig paths, scoped aliases) — fail with: _"Cannot resolve alias PATH; the linter only handles `@/` → `src/` mapping. Either rewrite the handler to use `@/` or extend `resolveAlias()` in the linter."_
- **Conditional / `default` exports** — keep the registry contract: handlers must be named exports.

The convention these limitations enforce is itself useful: registry handlers must be either direct declarations or named re-exports. That keeps the dependency graph readable for a human grepping the codebase, not just for the linter.

---

## 3. The 4-phase pre-commit architecture

Order matters. The pre-commit hook lives in `.husky/pre-commit` and runs phases in this sequence:

1. **lint-staged** — per-file fixers (`prettier --write`, `eslint --fix`). Touches only files in the staging area.
2. **Kit-generic registry autogen** — the kit-base scripts that scan `src/` for components, hooks, dependencies, the data model, and the API surface (`pnpm generate:inventory`, `:codebase`, `:hooks`, `:schema`, `:api`). Output written to `project/reference/`. `git add` re-stages.
3. **Domain-specific autogen** — your project's reconcilers that translate registries into platform outputs (e.g. `pnpm generate:vercel-crons` → `vercel.json`, `pnpm generate:nav-config` → some config consumed by middleware). `git add` re-stages.
4. **Validators** — block the commit on errors. `pnpm skill:lint`, `pnpm cron-jobs:lint`, etc. Exit non-zero aborts the commit.

Two design rationales:

- **Reconcilers before validators.** A manually-edited derivative shouldn't fail the build for a "real" reason that's actually drift. The reconciler in phase 2/3 fixes it; the validator in phase 4 sees the fixed state.
- **Validators after reconcilers.** Defense-in-depth: if the reconciler script was commented out, exited 0 silently due to a bug, or someone cherry-picked the derivative without the SSOT, the validator's deep-equals check (`generated payload from SSOT` vs `on-disk derivative`) catches it.

When you add a new SSOT-backed domain to a project, the work is: write the reconciler, write the validator, append both to phase 3 and phase 4 of `.husky/pre-commit`. Phases 1 and 2 are kit-generic and don't change.

---

## 4. Anti-patterns

- **Hand-editing derived files** (e.g. `vercel.json`, generated configs). The reconciler will overwrite at next commit, but the temptation persists. **Mitigation depends on derivative format.** When the format **supports comments** (`.ts`, `.toml`, `.yaml`, `Dockerfile`, shell scripts, etc.), the generator SHOULD write a header comment at the top, e.g. `// AUTOGENERATED from src/config/foo.ts. Do not edit manually — run \`pnpm generate:foo\`.` Reduces "why is my edit gone?" confusion.
- **Marker on strict-schema derivative.** When the derivative is a strict-schema config (`vercel.json`, `firebase.json`, `package.json` overrides, `tsconfig.json`, etc.), do **NOT** embed marker fields or marker comments. Two failure modes: (1) format disallows comments outright (JSON); (2) platform parser rejects unknown fields at deploy time (Vercel's `vercel.json` schema rejects unknown top-level keys, breaking deploy with no useful error in GitHub deployment status). Drift defense for strict-schema derivatives lives entirely in: (a) the **reconciler** (overwrites on every commit), and (b) the **linter** with deep-equals against the generated payload + a structural-shape check (analogous to `kb-cron-jobs` invariants 9 + 12). Provenance lives in the generator's JSDoc and in the SSOT registry — never in the derivative.
- **Runtime imports for validation.** Loads DB / env / auth, breaks CI. Use static analysis (§2) instead.
- **String-literal ids duplicated across consumers** — no `as const` derivation, so a rename in the registry doesn't propagate and the compiler is silent.
- **Hardcoded subsets of the registry in consumers** — admin endpoint queries 2 of 5 entries because someone copy-pasted; the other 3 silently render null. Always derive the consumer's list from the registry.
- **Validators without reconcilers.** Humans hit the wall on every commit ("you must edit foo.ts AND bar.ts to keep them in sync"). UX cost; nobody likes it; people start bypassing the hook.
- **Reconcilers without validators.** Drift happens silently when the reconciler script fails or is bypassed. The first time someone notices is in production.
- **Mixing concerns in the registry file.** A registry that imports `server-only` breaks the autogen Node script (`tsx scripts/...` can't load `server-only`-flagged modules). Keep the registry free of `server-only` and runtime-only deps; it must be importable from both server runtime AND a tsx Node script.

---

## 5. Cross-references

- [`kb-cron-jobs`](../kb-cron-jobs/SKILL.md) — canonical applied example: registry shape, autogenerated `vercel.json`, validation linter, runtime patterns.
- The kit base already follows this pattern in `src/config/roles.ts`, `src/config/navigation.ts`, `src/config/notifications.ts`, `src/lib/env.ts`, and `src/lib/db/schema/*` — grep them when you need a real-world template.
