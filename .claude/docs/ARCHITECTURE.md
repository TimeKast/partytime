# TimeKast Factory — Architecture

> **Mapa del kit.** Qué es la Factory, cómo se organiza `.claude/`, cómo fluye la información desde discovery hasta código. Narrativa ligera — para detalle operativo, seguir los cross-refs a rules.

---

## 1. ¿Qué es TimeKast Factory?

**Delivery OS, no starter kit.** La Factory es un sistema para **generar software con IA** — skills + agents + workflows + rules que orquestan Claude Code para entregar producto consistente. El starter kit (Next.js + Drizzle + NextAuth + Tailwind) es el **output**, no el propósito. El propósito es la **pipeline de delivery** que produce proyectos con el mismo esqueleto, navegables por humanos y agentes.

---

## 2. Ontología Claude Code

Toda primitiva del kit mapea a un concepto del runtime. No inventamos categorías fuera de CC.

| Concepto del kit                          | Primitiva CC        | Ubicación              |
| ----------------------------------------- | ------------------- | ---------------------- |
| Agent (proceso invocable con I/O)         | Subagent            | `.claude/agents/`      |
| Workflow TimeKast (orchestrator de pasos) | Skill `tk-*`        | `.claude/skills/tk-*/` |
| Knowledge (patterns cross-fase)           | Skill `kb-*`        | `.claude/skills/kb-*/` |
| Sistema shipped por el kit                | Skill `sk-*`        | `.claude/skills/sk-*/` |
| Workflow interno Factory                  | Skill `fx-*`        | `.claude/skills/fx-*/` |
| Skill project-specific                    | Skill `pj-*`        | `.claude/skills/pj-*/` |
| Slash command delgado                     | Command             | `.claude/commands/`    |
| Rules always-on                           | Rules via `@import` | `.claude/rules/`       |

> Detalle de prioridad, conflict resolution y routing semántico → [`.claude/rules/CC.md §1`, `§6`](../rules/CC.md). Tier de skills (P1/P2/P3) → [`CORE.md §1 Prioridad de Skills`](../rules/CORE.md).

### `kb-*` vs `sk-*`

Co-existen por routing semántico. Par por dominio:

- **`kb-*`** = patterns para escribir código nuevo. _"¿Qué pattern aplico?"_
- **`sk-*`** = sistema shipped por el kit. _"¿Cómo me engancho al sistema existente?"_

Los pares canónicos `kb-*`/`sk-*` que nacieron en KIT-018 se retiraron en 2026-09: la doctrina del kit vive en cada `sk-*` y las `kb-*` que quedan (`kb-cron-jobs`, `kb-dataviz`, `kb-design-engineering`, `kb-visual-direction`, `kb-ssot-registries`) no tienen hermana. El check `pair-cross-refs` sigue disponible para un par futuro.

---

## 3. Pipeline SSOT chain

> **Tabla canónica:** [`CORE.md §3 SSOT Chain`](../rules/CORE.md). Always-on rule.

```
/discovery → /design → /backlog → /implement
```

**On-demand workflows** (off primary path): `/proposal`, `/docs api`, `/docs data-model`, `/audit`, `/evolve`, `/retro`.

Cada fase genera artifacts canónicos numerados que son SSOT para la siguiente. Tabla canónica + paths exactos viven en `CORE.md §3`. Visión operativa detallada → [`project/planning/PIPELINE_CURRENT_TRUTH.md`](../../project/planning/PIPELINE_CURRENT_TRUTH.md) (Factory meta-doc).

> Regla: upstream decide, downstream ejecuta.

---

## 4. Regla de 3 audiencias (directorios)

La documentación del repo está segmentada por audiencia. Confundir buckets es un smell — un proyecto derivado no debería clonar el CHANGELOG de la Factory ni el cliente ver `getting-started` del kit.

| Directorio      | Audiencia                                       | Viaja con…        | Contenido ejemplo                                                 |
| --------------- | ----------------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `docs/`         | Cliente final                                   | Entregable        | product narrative, user docs, release notes                       |
| `project/`      | Dev del proyecto derivado                       | Proyecto derivado | backlog, planning vivo, migration, reference autogen              |
| `.claude/docs/` | Dev del kit (y dev derivado que quiere onboard) | Kit Claude        | getting-started, troubleshooting, CHANGELOG factory, ARCHITECTURE |

---

## 5. Onboarding 5-min (dev nuevo al kit)

1. `git clone` del kit
2. Leer [`CLAUDE.md`](../../CLAUDE.md) — entry point del runtime, inlinea las 5 rules vía `@import`
3. Leer [`CC.md §7`](../rules/CC.md) — ontología y prefijos de skills
4. Leer [`SK.md`](../rules/SK.md) — convenciones del starter kit (DB, UI, QA)
5. `pnpm install` + configurar `.env.local` (ver [`getting-started.md`](./getting-started.md))

Listo. El resto se auto-descubre vía `INVENTORY.md` / `CODEBASE.md` / `HOOKS.md` / `SCHEMA.md` / `API.md` (autogenerados).

---

## 6. Convenciones de naming

### Prefijos de skills

| Prefijo | Significado                                                   |
| ------- | ------------------------------------------------------------- |
| `tk-*`  | Workflow TimeKast (`/implement`, `/docs`, …)                  |
| `kb-*`  | Knowledge base (patterns cross-fase; routing por description) |
| `sk-*`  | Starter Kit system (shipped)                                  |
| `fx-*`  | Factory-internal (mantenimiento del kit)                      |
| `pj-*`  | Project-specific del derivado (`skill:lint` lo ignora)        |

### Prefijos de agents

Los agents (`.claude/agents/`) se prefijan por **scope de invocación**, no por dominio: el prefix deriva del **nombre del workflow** que los usa (ej. `/discovery` → `dsc-*`, `/design` → `dsg-*`, `/backlog` → `bkl-*`, `/mockup` → `mck-*`, `/implement` → `imp-*`). Los agents genéricos cross-workflow (`architect`, `quality-engineer`, `fx-factory-reviewer`…) van **sin prefix de workflow**. La lista canónica de prefijos válidos vive en `VALID_PREFIXES` ([`agent-taxonomy-lint.sh`](../hooks/agent-taxonomy-lint.sh)) — no se enumera aquí porque crece con cada workflow nuevo. Detalle → [`CLAUDE.md §Convenciones de nomenclatura de agents`](../../CLAUDE.md) + [`fx-workflow-authoring §8`](../skills/fx-workflow-authoring/SKILL.md).

### Prefijos de IDs del backlog

| Prefijo    | Dominio                                          |
| ---------- | ------------------------------------------------ |
| `FX-*`     | Factory infra (hooks, tooling del kit)           |
| `PL-*`     | Pipeline del delivery OS                         |
| `PR-*`     | Workflow authoring (tk-discovery, tk-backlog, …) |
| `KIT-*`    | Starter Kit hygiene y evolución                  |
| `VIZ-*`    | Viz / data products                              |
| `QA-*`     | QA / testing                                     |
| `DEPLOY-*` | Deploy / ops                                     |

### Commits (Conventional Commits + keyword footer)

```
<type>(<scope>): <título imperativo, ≤72 chars>

<body opcional>

Closes: FX-008
Refs: PL-001
```

`Closes:` = este commit completa el issue (debe estar ✅ + Evidence). `Refs:` = referencia contextual. Detalle → [`GIT.md §3`](../rules/GIT.md).

---

## 7. Roadmap

El backlog vivo está en [`project/backlog/`](../../project/backlog/); el índice de estado es [`BOARD.md`](../../project/backlog/BOARD.md). Milestone actual: **v10.0**.

Release notes de la Factory → [`CHANGELOG.md`](./CHANGELOG.md) (este bucket).

---

## 8. Cross-references

| Para…                                  | Ir a                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| Rules del runtime                      | [`.claude/rules/`](../rules/)                                    |
| Doctrina del kit / conflict resolution | [`CORE.md`](../rules/CORE.md)                                    |
| Disciplina de código                   | [`CODING.md`](../rules/CODING.md)                                |
| Git / commits / branching              | [`GIT.md`](../rules/GIT.md)                                      |
| Starter kit (DB, UI, QA)               | [`SK.md`](../rules/SK.md)                                        |
| Claude Code runtime                    | [`CC.md`](../rules/CC.md)                                        |
| Onboarding detallado                   | [`getting-started.md`](./getting-started.md)                     |
| FAQ / errores del stack                | [`troubleshooting.md`](./troubleshooting.md)                     |
| Design system activo                   | [`design-system-neomorphism.md`](./design-system-neomorphism.md) |
| Sistema de skins (intercambiable)      | [`sk-skins`](../skills/sk-skins/SKILL.md) — 1 CSS + 1 `@import`; neomorphism default + fintech |
| Distribución (CLI, perfiles, lockfile) | [`distribution.md`](./distribution.md)                           |

---

_TimeKast Factory — ARCHITECTURE (introduced by KIT-016; absorbs KIT-007)_
