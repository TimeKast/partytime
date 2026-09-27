---
description: Proposal — synthesizes /discovery (+ /design) into a single versioned proposal markdown at project/proposals/{slug}.md, then ships the visual deck via the Gamma REST API and shortens the link with short.io. Audience-tiered (negocio/ejecutivo/developer); md-only fallback when Gamma is absent.
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, AskUserQuestion
argument-hint: '[validar] [--tier negocio|ejecutivo|developer] [--client <path>] [--md-only] [--cards N] [--theme <name>] [--folder <name>]'
---

# /proposal

Run the `tk-proposal` workflow.

## Args

- `$ARGUMENTS` — pass through to the skill as mode dispatch:
  - (empty) — genera la propuesta completa: MD → Gamma → short.io (P0 confirma tier + readiness).
  - `validar` — read-only sobre `project/proposals/{slug}.md` existente: valida que el MD existe + que el frontmatter trae provenance (`gamma_url`/`short_url`) + reporta pasos pendientes. No busca HTML/assets. Cero writes durables.
- `--tier negocio|ejecutivo|developer` — opcional: fija el tier de audiencia y salta esa pregunta de P0.
- `--client <path>` — opcional: override del project root (lee el `/discovery`+`/design` de otro repo derivado). Default = repo actual.
- `--md-only` — opcional: solo emite el MD (P0-P2), salta el step de Gamma (P3). Útil cuando no hay key de Gamma o no se quiere disparar el deck.
- `--cards N` — opcional: número de tarjetas sugerido a Gamma (default: que Gamma decida).
- `--theme <name>` — opcional: tema de Gamma (default: ninguno; el autor elige en el editor web).
- `--folder <name>` — opcional: folder de Gamma donde guardar el deck (default: sin folder).

## Behavior

Delegate to skill [`tk-proposal`](../skills/tk-proposal/SKILL.md). The skill owns all phase semantics, checkpoints, content rules, the MD emit, the Gamma REST call (gamma-generate.sh), the short.io shortening, and the md-only fallback.

This command MUST NOT redefine phases, override checkpoints, or duplicate skill semantics — pure thin wrapper per `fx-workflow-authoring §12`.

Use **TodoWrite** from Turn 1 to track: P0 (cleanup pre-flight + modo + tier + readiness) · P1 (synthesis + drift/gap reconciliation) · **CP1** (tier + alcance, inline) · P2 (emit MD a project/proposals/{slug}.md) · **CP2** (aprobar MD + gate Gamma, Plan Mode) · P3 (strip-frontmatter → Gamma REST → short.io → provenance) · P4 (auto-checklist + cierre).
