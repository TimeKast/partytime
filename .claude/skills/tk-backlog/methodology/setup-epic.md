# tk-backlog — Setup Epic (`EPIC-00-bootstrap`)

> `nuevo`-mode only. Models the bootstrap work as backlog items run by `/implement` (or the human), never auto-executed by `/backlog`. Live behavior in [`../SKILL.md`](../SKILL.md) §10. Canonical issue shape in [`../templates/SETUP-ISSUE.template.md`](../templates/SETUP-ISSUE.template.md).

---

## Why a setup epic

A fresh derived project needs deps, env, DB, hosting and CI before any feature issue can be implemented. `tk-backlog` emits this as **two consolidated issues** (plus an optional third — `SETUP-003` — when the design chose a shipped skin other than the active one) so `/implement` runs them like any other work — the heavy lifting is the `factory provision` CLI (Neon + the deploy destination, Vercel or Railway + DNS + Resend), which `/implement` drives by loading the `tk-provision` skill inline.

## The issues (two core + one conditional)

### `SETUP-001-bootstrap` (install + provision)

Runs in this **strict order** — the migration commit MUST precede the provision push:

1. `pnpm install`.
2. `pnpm db:generate` — mint the project's initial `0000` migration from the schema (the kit ships **no** migrations; the derivative generates its own).
3. 🔴 **Commit the `0000` (`src/lib/db/migrations/`) + `pnpm-lock.yaml` BEFORE provisioning** (`chore(db): add initial 0000 migration`, no `Closes:` — intermediate commit), **on both destinations**. The provision substrate pushes `main`+`develop` and triggers the first deploy, which migrates: on Vercel in `vercel-build` (`pnpm build && pnpm db:migrate`), on Railway in the pre-deploy (`TK_VAULT=off pnpm db:migrate`, after the build). If `0000` isn't committed yet, the deploy runs **without** the schema — the build passes and `db:migrate` fails, unable to find `meta/_journal.json`, so the deployment ends in error and is never promoted. Committing first is the fix — do **not** fold the migration into the issue-close commit (which lands after provision has already pushed).
4. **Provision** the environment — `/implement` loads `tk-provision` inline (NOT a generic executor) and runs the `factory provision` primitives in order: Neon (DB + branches) → **CP2 HIGH-risk** deploy substrate (Vercel project + git + GitHub App, or Railway project + repo connection) → DNS + Resend → the **env wizard** (fills the remaining values: in the vault; without a vault, in `.env.local`). Because `0000` is already committed (step 3), the first deploy applies it (`vercel-build` on Vercel, the pre-deploy on Railway) — there is no separate manual migrate step.
5. `pnpm verify` **without e2e**: `lint` + `typecheck` + unit/component tests.

> **Two commits for one issue (B1 exception).** The bootstrap emits the pre-provision migration commit (step 3, intermediate, no `Closes:`) plus the B1 issue-close commit (`Closes: SETUP-001`). This is a declared exception to "one atomic commit per issue" — the `0000` must ride the provision push, which happens mid-issue. See [`tk-implement/SKILL.md`](../../tk-implement/SKILL.md) § Bootstrap epic.

> **The gate is provision's CP2, not `/implement`'s CP-A.** `SETUP-001` is run by `/implement` loading `tk-provision` inline; the single HIGH-risk stop is `tk-provision`'s CP2 (the irreversible deploy substrate, Vercel or Railway). `/implement` does **not** impose its own CP-A on `EPIC-00` (the bootstrap is mechanical + already gated by CP2). See [`tk-implement/SKILL.md`](../../tk-implement/SKILL.md) § bootstrap special-casing.

### `SETUP-002-go-live` (verify deploy + admin invite)

Runs after `SETUP-001` (`Depends on: SETUP-001`), once the first deploy has landed:

- **Verify the first deploy+migrate** succeeded on the repo's destination: `main` deployed, its `migrate` ran (in `vercel-build` on Vercel, in the pre-deploy on Railway), the tables exist, the production domain is live.
- **Create the super_admin invite on `main`:** `npx @timekast/factory invite-admin --target main --app-url=<prod domain>` — mints a single-use invite with `metadata.role=super_admin` and emails the accept link. The admin sets their own password at `/accept-invite`; no plaintext admin password ever exists. Gated to **after** deploy+migrate (the `invite_tokens` table must exist on `main`), so it lives here, not in the wizard.
  - **Email-sent gate (go-live).** For `--target main` the invite email MUST actually send. If the command prints `ℹ️  Email no configurado` / falls back to the console (`emailSent:false`) → **STOP, do NOT close the invite AC**: the prod email config is missing (provision writes `RESEND_API_KEY`+`EMAIL_FROM` to the vault, `main:/`; without a vault, to `.env.local`; a missing key means Resend was never provisioned for this project — provision needs the org `RESEND_API_KEY` in the rail, `rail-timekast` in the secrets vault). Same spirit as the diff-ownership gate — never close on a signal that the thing did not happen. For `--target develop` the console fallback stays legitimate.

### `SETUP-003-apply-skin` (conditional — only if the design chose a non-active skin)

Emitted **only if** `16_DESIGN.md §0` (`visual_direction` frontmatter) names a **shipped skin** — a key of `SKINS` in `src/config/skins.ts` — that **differs** from the current `ACTIVE_SKIN`. If the design kept the active skin, or took a custom direction (not a registry skin), this issue is **not emitted** (no no-op work).

Runs after `SETUP-002` (`Depends on: SETUP-002`), once the app is live:

- Edit `src/config/skins.ts`: set `ACTIVE_SKIN` to the skin named in `16_DESIGN.md §0`.
- Run `pnpm generate:skin` (regenerates the `@import` in `src/app/globals.css`).
- `pnpm verify` — `tests/unit/skins.test.ts` invariant checks `ACTIVE_SKIN` ⟺ `@import`.
- Commit both files.

> **Detection (`/backlog` Phase 2):** read `visual_direction` from `16_DESIGN.md §0` and `ACTIVE_SKIN` from `src/config/skins.ts` (read-only). Emit `SETUP-003` **iff** `visual_direction` ∈ keys(`SKINS`) **and** `visual_direction !== ACTIVE_SKIN`. This is the **only** place the skin switch is applied: `/design` and `/backlog` decide/record it, `/implement` (running this issue) is the code phase that mutates `src/`. Reading `skins.ts` in Phase 2 is read-only — `/backlog` never edits it.

Topology: `sequential_chains: [[SETUP-001, SETUP-002]]` (SETUP-003 appended → `[[SETUP-001, SETUP-002, SETUP-003]]` when present), `parallelizable_issues: []`.

## Why this is safe — `SK.md §7.1` still holds

`SK.md §7.1` forbids `vercel link` / `vercel env pull` / overwriting `.env.local` without authorization — those are the **overwrite-without-diff** vectors that lock a dev out. **Provision does NOT use any of them:** it mutates Neon/Vercel or Railway/GitHub through their **APIs with the rail tokens** (the org rail: `rail-timekast` in the secrets vault, read with the person's session — `fx-secrets-vault §3`) and writes each value to its folder in the vault (`main:/`, `develop:/`, …) — without a vault, to `.env.local`, controlledly (`writeEnvLocal` + the env wizard's `setEnvLine`), never a blind `pull`. So the old "cloud bootstrap is a manual runbook because §7.1 forbids automation" framing is gone — provision automates the cloud work **safely**, within §7.1. (Declared for `fx-factory-reviewer`: this is not a §7.1 override, it is a different, safe mechanism.)

The stale legacy runbook (`vercel link`, manual Neon project creation, `setup-e2e.ts`) is **removed** — `factory provision` supersedes all of it.

## Headless safety

Headless (no interactive user), `SETUP-001` is **fail-closed**: `tk-provision` cannot satisfy its CP2 HIGH-risk gate (no approver), so it emits the runbook as a doc and the issue stays **`🚫 Blocked`** (does not meet DoD) — never silently provisioned. Nothing destructive runs without an approver.

## Opt-out

Phase 2 offers `--skip-bootstrap` when the project is already bootstrapped — `EPIC-00` is omitted entirely.

---

_TimeKast Factory — tk-backlog · setup-epic_
