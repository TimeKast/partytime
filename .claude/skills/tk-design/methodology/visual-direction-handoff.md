# Visual Direction Handoff

> How Phase 2 of `tk-design` consumes `kb-visual-direction`. How `con-direccion` mode reads the discovery output. How future Cloud Design / Claude Design integration would hook in (deferred — Phase 2 of `tk-design` itself).

---

## 1. Source of truth: `00_DISCOVERY_BRIEF.md §11`

`/discovery` already emits visual direction signals. `/design` Phase 0 + Phase 2 consume these signals — no schema invention.

### 1.1 `§11.1 Postura Visual`

Free-text section. Describes the project's visual posture (trust profile, density preference, motion stance, iconography hint). Read by `kb-visual-direction` skill (Phase 2 of `tk-design`) to pick a skin — a **shipped skin** from the registry (`src/config/skins.ts`) when one fits, or a conceptual family for a custom direction.

### 1.2 `§11.2 Design System Strategy`

3 mutually exclusive checkboxes:

| Checkbox                       | Phase 0 routing in `con-direccion` mode                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Usar un skin shipeado del kit` | Direction = a shipped skin from the registry (`src/config/skins.ts`). **If the brief named a specific skin** → skip Phase 2 + CP1; Phase 1 anchors to that skin's tokens; SK migration "compatible × 100%". **If it only picked the strategy without naming the skin** → do NOT skip; run Phase 2 + CP1 so the user picks the concrete skin from the registry (the workflow reads the available skins — never hardcoded). |
| `Custom via Claude Design`     | Skip Phase 2 + CP1. Read `§11.3 Claude Design Fork` (must be populated; STOP if empty). Phase 1 treats the fork detail as anchor. SK migration table reflects custom direction's compatibility with each SK token category. |
| `Client's existing DS`         | Skip Phase 2 + CP1. Ask user for `--ds-ref=<path>` to client's DS documentation. Phase 1 reads that ref as anchor. SK migration table reflects compatibility with the client's DS.                                          |

If §11.2 has no checkbox marked / ambiguous → STOP Phase 0, redirect user to `/design nuevo` mode (forces Phase 2 + CP1 to lock direction interactively).

### 1.3 `§11.3 Claude Design Fork`

Detail of the fork only if §11.2 = `Custom via Claude Design`. Otherwise `N/A — ver §11.2`.

Schema (from `00_DISCOVERY_BRIEF.template.md`):

- Scope of fork (tokens / mockups / both)
- Skin family target name
- Color palette intent
- Typography intent
- Motion intent
- Reference inspiration links

`/design` Phase 1 reads this as input to its registry; `16_DESIGN.md §0` references this content for the final Visual Direction declaration.

---

## 2. Phase 2 of `tk-design` — when `nuevo` mode

When the user runs `/design nuevo`, Phase 2 finalizes the visual direction interactively:

1. **Read source signals:**
   - `00_DISCOVERY_BRIEF.md §11.1 Postura Visual` (free-text)
   - `01_FREEZE_MAP.md` for any firm UI decisions (branding lock, theme support requirements, density requirements)
   - `project-config.md §branding` (brand assets, tone)

2. **Load `kb-visual-direction` skill** via Read:

   ```
   Read .claude/skills/kb-visual-direction/SKILL.md
   ```

3. **Read the registry + apply skill §2 (Step 0 — shipped skins first):**
   - Read `src/config/skins.ts` → `keys(SKINS)` + `ACTIVE_SKIN` (dynamic — never hardcode; skins added later appear automatically). Read-only.
   - Map the posture (§11.1) to the **registry skins**: a shipped skin that fits wins (cheap path, already built).
   - Only if none fits → fall back to the conceptual skin families (Midnight Executive, Editorial Premium, Dense Operator, Soft Glass Accent, Warm Productive) to define a **custom** direction.
   - Pick the recommendation (a registry skin, or a family for custom) with rationale scored against §11.1.

4. **Emit draft `16_DESIGN.md §0` + `§1`:**
   - §0: Skin family final + rationale (anchored to §11.1).
   - §1: Posture (trust/novelty, density, iconography, motion, typography). SK migration assessment table.

5. **CP1 inline:** present candidate to user. Approve / pivot / cancel.

### 2.1 SK migration assessment

When `SK_ACTIVE=true` and skin family ≠ pure SK Neomorphism, compute the migration table per `kb-design-engineering §1 Step 3 — Map to system`:

| Token category | SK default                | This project's direction | Treatment                                                                                  |
| -------------- | ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| Colors         | Neomorphism palette       | {description}            | `compatible` if same family, `extend` if new aliases added, `N/A` if completely overridden |
| Surfaces       | --elevation-raised, --elevation-inset | {description}            | (idem)                                                                                     |
| Radii          | sm/md/lg scale            | {description}            | (idem)                                                                                     |
| Typography     | text-sm/base/lg scale     | {description}            | (idem)                                                                                     |
| Motion         | duration-200 ease-out     | {description}            | (idem)                                                                                     |
| Iconography    | Lucide                    | {description}            | (idem)                                                                                     |

This table replaces the legacy `15_SK_MIGRATION.md` standalone file (deprecated post-FACTORY-008 — inlined into `16_DESIGN.md §1`).

## 3. `validar` mode — read-only

When the user runs `/design validar`:

- Phase 2 is skipped (no visual direction re-finalization).
- The existing `16_DESIGN.md §0 + §1` are taken as-is.
- Phase 7 `ui-critic` audits the durable §0 + §1 against discovery §11 for drift (e.g., §11.1 changed but §0 skin family didn't update).

## 4. Future — Cloud Design / Claude Design integration (Phase 2 of tk-design itself)

Scope-out from v1. The hook lives here as design intent, not implementation:

**Conceptual flow:**

1. `tk-design` v1 emits ASCII contracts (current state).
2. A future skill `tk-design-cloud` (NOT in v1) would consume each `16_DESIGN/SCR-XXX.md` + the `§0 Visual Direction` of `16_DESIGN.md` and render a PNG / Figma board.
3. The rendered output gets appended to `SCR-XXX.md` as `## 14. Cloud Render` (append-only section, never overwrites the ASCII contract).
4. User reviews the renders; if mismatch with intent → patch SCR ASCII + copy + states, re-render.

**Why deferred:**

- The ASCII contract is already enough signal for `/backlog` and `/implement`.
- Cloud Design adds infrastructure complexity (API key, render pipeline, image storage) that v1 doesn't need.
- The user's workflow ("ir haciéndolo por pedazos") explicitly favors incremental delivery.

**Pre-emptive hooks in v1:**

- Cero. No section in `16_DESIGN.md` or SCRs reserved for cloud render. No placeholder. Each SCR is structurally compatible with cloud rendering by virtue of ASCII + token refs + copy literal — no schema work needed in v1.

**Documented in:** this file (methodology — internal context) + `CHANGELOG.md [Unreleased] Deferred — Phase 2`.

---

## 5. Handoff to coding-phase skills

`kb-visual-direction` es **fase design** — produce la dirección visual que alimenta `16_DESIGN.md`. Después de cerrar la dirección, la **fase coding** toma el relevo a través de las skills siguientes:

| Skill                   | Consumes what this skill produced                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `sk-skins`              | Kit-shipped swappable skin system — the token contract every skin implements, the registry (`src/config/skins.ts`), and the one-line switch (`ACTIVE_SKIN` + `generate:skin`). Read here for which skin is active and what a skin must provide |
| `sk-tokens-neomorphism` | Per-token reference for the **neomorphism** skin specifically (CSS vars `--elevation-*` / `.surface-*`; legacy pre-v11 `--neo-*`, Tailwind aliases, anti-tokens, 3 themes). For a different active skin, read that skin's own token source — the active one lives in the registry |
| `kb-design-engineering` | Polish execution process; how to apply the skin                                                                      |
| `sk-ui`                 | Kit-shipped components and responsive recipes for the stack                                                          |

**Regla de handoff:** cuando `/design` cierra la dirección visual, la implementación consume (1) `sk-skins` — el sistema swappable + qué skin está activo (registry `src/config/skins.ts`); y (2) la referencia de tokens del **skin activo** (hoy `sk-tokens-neomorphism` cubre el skin neomorphism; otro skin activo se lee de su propia fuente de tokens). La disciplina de tokens (alias semántico, nunca valor crudo; escalas discretas) vive en el contrato de `sk-skins`, que sobrevive a cualquier swap porque modela el sistema en abstracto.

- [`sk-skins`](../../sk-skins/SKILL.md) — sistema de skins swappable + registry (qué skin está activo)
- [`sk-tokens-neomorphism`](../../sk-tokens-neomorphism/SKILL.md) — tokens del skin neomorphism (referencia per-token)

---

_TimeKast Factory — tk-design methodology · Visual Direction Handoff_
