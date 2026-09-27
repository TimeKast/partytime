# tk-backlog — Skills Allowlist Resolution

> How each issue's `> **Skills:**` list is resolved. **Cap 3 per issue, ordered, `sk-*` first — no `kb-*` sibling by default.** NO agents — CC's semantic router resolves agents at `/implement` time. Live behavior in [`../SKILL.md`](../SKILL.md) §18.

---

## Why an allowlist per issue

The issue is consumed by `/implement` (an AI). Naming the relevant skills up front means the executor loads the right kit knowledge without re-discovering it. The orchestrator + `bkl-issue-specer` resolve the list; it is deduplicated and ordered by relevance.

🔴 **Why the cap, and why `sk-*` first — measured, not assumed.** A 180-day read of every executor transcript on the fleet (`project/reports/skill-usage.mjs`, 2026-09-22) showed the old rule ("pair every `sk-*` with its `kb-*`, no cap") produced lists of 5-8 skills per lot that the executor **did not read at all**: with 2-3 cited it read more than half; with 6+ it read zero. `sk-db` cited 29 times, read 2; its `kb-*` sibling cited 27, read 0; `sk-api` 17 → 0. A list nobody opens is not context, it is noise that costs the one skill that mattered. The `sk-*` documents how the kit does it — that is the knowledge the executor lacks; the `kb-*` is portable theory the model largely already has.

## Resolution rules

### 1. One skill per domain the issue's files touch — the `sk-*` (or `pj-*`)

| Issue's main file(s) live in… | Add                                            |
| ----------------------------- | ---------------------------------------------- |
| `src/lib/db/` (schema, migrations) | `sk-db`                                   |
| `src/lib/actions/`, `src/app/api/` | `sk-api`                                  |
| `src/components/`, `src/app/**/page.tsx` (UI) | `sk-ui` (`sk-crud-scaffold` instead when the issue IS a CRUD entity end-to-end) |
| `src/lib/auth/`, `src/proxy.ts`, `src/config/roles.ts` | `sk-security`             |
| `src/lib/mfa/`                | `sk-mfa`                                       |
| `src/lib/notifications/`, `src/config/notifications.ts` | `sk-notifications`       |
| `src/lib/email/`, `src/emails/` | `sk-email`                                   |
| `src/config/navigation.ts`    | `sk-navigation`                                |
| `src/lib/pwa/`, `src/app/sw.ts` | `sk-pwa`                                     |
| `src/app/skins/`, `src/config/skins.ts`, `globals.css` | `sk-skins`                |
| `src/lib/observability/`, `instrumentation*.ts` | `sk-observability`           |
| `tests/e2e/`                  | `sk-e2e`                                       |
| `tests/unit/`                 | `sk-testing-nextjs`                            |
| `src/app/api/cron/`, `vercel.json` | `kb-cron-jobs` (no `sk-*` exists for this domain) |
| `.claude/skills/`, `.claude/agents/`, `.claude/rules/` | `fx-workflow-authoring` (`tk-*`/agents/rules) or `fx-skill-author` (`kb-*`/`sk-*`/`fx-*`) |
| project-specific domain (`pj-*` exists for it) | that `pj-*` — it ranks with the `sk-*`, never below |

### 2. Order and cap

- **Order by relevance to the issue's MAIN file**: the domain of the file the issue is named after goes first. That first skill is the one the executor **must** read before its first edit (`imp-issue-executor` contract).
- **Cap 3.** An issue whose files span more than three domains is a sign the issue is too wide — split it (`§15` shared-file rule), do not stack skills.
- **`sk-tokens-neomorphism`** only when the issue writes styles/tokens, not for every UI-touching issue.
- **`sk-project-structure`** is NOT in the list: file placement is an always-on rule (`SK.md §6`) the executor already has in context.

### 3. `kb-*` — only when nothing kit-shipped covers the domain

A `kb-*` enters the list **only** when (a) no `sk-*`/`pj-*` covers that domain in this repo (e.g. `kb-cron-jobs`, `kb-dataviz`), or (b) the issue is explicitly about a pattern the `sk-*` does not document and names it. Never as the sibling of an `sk-*` already listed. `kb-ssot-registries` is a **reviewer** skill — the panels of `/backlog` and `/implement` cite it in their own prompts; it is not the executor's.

## Output

`bkl-issue-specer` returns a deduplicated list of **1-3** skills, first = mandatory. Verify each named skill exists (a `kb-*`/`sk-*` that isn't in `.claude/skills/` is a drift bug — `skill:lint` catches cross-ref breaks).

## NOT in the allowlist

- **Agents.** The issue lists no agents — CC's semantic router selects agents at `/implement` time from the work description (`CC.md §1.1`). Hardcoding agents in the issue duplicates routing and rots.
- **`tk-*` workflows.** The issue is consumed _by_ `/implement`; it doesn't invoke other workflows. **One exception:** `SETUP-001-bootstrap` is run by `/implement` loading `tk-provision` inline — that routing is a `/implement` special-case keyed on the bootstrap epic (see [`setup-epic.md`](setup-epic.md)), NOT an entry in the issue's `Skills:` list.
- **The `kb-*` sibling of a listed `sk-*`.** See §3.

---

_TimeKast Factory — tk-backlog v1 · skills-allowlist_
