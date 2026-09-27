# TimeKast Factory — Claude Code Instructions

> **Runtime:** Claude Code. **SSOT:** `.claude/` (rules, agents, skills, commands).

---

## Rules (auto-loaded)

@.claude/rules/INDEX.md

## Rules (on-demand reference)

---

## Proyecto

### config

@project/planning/project-config.md

- **Stack:** Next.js 14 (App Router) + TypeScript + Drizzle ORM + CSS Modules (sin Tailwind/shadcn)
- **Layout:** sin `src/` — `app/`, `lib/`, `types/`, `drizzle/`, `scripts/` en la raíz del repo (ver `project-config.md §4`)
- **Branching:** solo `main` (sin `develop`)
- **Package manager:** pnpm

## Convenciones de nomenclatura de skills

- `tk-*` → workflows TimeKast (ej: `/implement`)
- `kb-*` → knowledge base (auto-ruteo semántico; cubre fase coding y fase documental — ej. `kb-visual-direction` no se auto-carga en `/implement` por su description, no por el prefijo)
- `sk-*` → starter kit systems (sistemas shipped por el kit; viajan con el kit a proyectos derivados)
- `pj-*` → project-specific del derivado (no se sube al template; `skill:lint` lo ignora — es del developer, no del kit)
- `fx-*` → factory-internal (herramientas para mantener el kit)

> 📖 Developer que arranca un derivado: cómo agregar skills `pj-*` y revisar hooks propios sin chocar con el kit → [`.claude/docs/extending-the-kit.md`](.claude/docs/extending-the-kit.md).

## Convenciones de nomenclatura de agents

Agentes (`.claude/agents/*.md`) se prefijan según su **scope de invocación**, paralelo a skills:

- `dsc-*` → scoped a `/discovery` workflow only (ej: `dsc-intake-analyst`, `dsc-kit-analyst`, `dsc-freeze-map-extractor`)
- `dsg-*` → scoped a `/design` workflow (ej: `dsg-context-analyst`, `dsg-screen-specer-full`, `dsg-component-specer`)
- `bkl-*` → scoped a `/backlog` workflow (ej: `bkl-context-analyst`, `bkl-issue-specer`)
- `mck-*` → scoped a `/mockup` workflow (ej: `mck-context-analyst`, `mck-screen-renderer`)
- `imp-*` → scoped a `/implement` workflow (ej: `imp-issue-executor`)
- `docs-*` → scoped a `/docs` workflow (future)
- `fx-*` → factory-internal agents (ej: `fx-factory-reviewer`)
- **sin prefix** → generic cross-workflow: hace **una pregunta** invariante al objeto (lente, no maquinaria de un pipeline) — el criterio NO es el conteo de workflows que lo invocan; SSOT del corte: `CC.md §2` (ej: `architect`, `product-owner`, `project-planner`, `quality-engineer`, `grounding-auditor`)

> El prefix deriva del workflow name (regla en `fx-workflow-authoring §8`); la lista canónica de prefijos válidos vive en `agent-taxonomy-lint.sh` (`VALID_PREFIXES`) — los ejemplos de arriba son ilustrativos, no la fuente de verdad.
>
> ℹ️ Corrección local (solo este repo): la línea "sin prefix" decía _"invocable desde 3+ workflows"_ — criterio retirado; el vigente es lente-vs-maquinaria (`CC.md §2`). `CLAUDE.md` es del developer en su contenido (`CORE.md §5`): `factory update` no propaga esta prosa — solo mantiene la línea que importa las rules — así que cada derivado corrige el suyo a mano si lo desea.

**Enforcement:** hook `agent-taxonomy-lint.sh` (pre-commit) valida convención + referencias cross-file (ver `.claude/hooks/`).

---

_TimeKast Factory — CLAUDE.md (runtime: Claude Code)_
