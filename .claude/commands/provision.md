---
description: Provision — guides the agent through provisioning a derived project's environment (Neon DB, the deploy substrate on Vercel or Railway, DNS domains, Resend) by driving the `factory provision` CLI primitives in order, with a HIGH-risk Plan Mode gate before the irreversible deploy substrate.
allowed-tools: Bash, Read, Grep, Glob, AskUserQuestion
argument-hint: '[--resume | --adopt] [--dry-run] [--step] [--verbose]'
---

# /provision

Run the `tk-provision` workflow — verify tooling and the vault session for the org rail, read provision state, ask which services + domain, run the `factory provision` CLI primitives in order, narrate progress, and stop at the HIGH-risk Plan Mode gate before the irreversible deploy substrate (Vercel or Railway).

## Args

- `$ARGUMENTS` — pass through to the skill:
  - (empty) — full provisioning run; Phase 3 auto-detects whether to resume from existing state.
  - `--resume` — retoma un provisioning interrumpido desde el último paso completado (propagado al CLI).
  - `--adopt` — reconstruye `.timekast/provision.json` read-only desde los providers (proyecto existente provisionado antes del CLI).
  - `--dry-run` — ensaya el plan; se propaga a todas las primitivas, nada muta.
  - `--step` — override del modo fluido: para en cada cruce/checkpoint. `--verbose` — amplía resúmenes/STOP. Default = **fluido** (para solo ante señal real; el gate HIGH-risk para siempre — ver `tk-provision/SKILL.md §8` + `fx-workflow-authoring §7.1`).

## Behavior

Delegate to skill [`tk-provision`](../skills/tk-provision/SKILL.md). The skill owns all phase semantics, the checkpoint doctrine (the HIGH-risk Plan Mode gate before the deploy substrate, Vercel or Railway), the vault-rail checks, the headless/curador-HITL fallback, and the ordering of the CLI primitives.

This command MUST NOT redefine phases, override checkpoints, or duplicate skill semantics — pure thin wrapper per `fx-workflow-authoring §12`.

1. **Invocar skill `tk-provision`** — leer `.claude/skills/tk-provision/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS` (flags arriba). Vacío → run completo con auto-detección de state. El destino (Vercel/Railway) lo pregunta el skill en Phase 4 sólo en un alta nueva y lo pasa como `--target=vercel` o `--target=railway` (Railway exige bóveda; su CP2 cubre crear el proyecto de Railway y conectarle el repo); con `--resume`/`--adopt` no se pasa `--target` (el CLI lo lee del state o lo descubre). `--adopt` a secas es para un repo **sin** `.timekast/provision.json`; con state presente el CLI se niega, y re-adoptar es `factory provision --adopt --force --target=<destino>` (lo decide el skill, no este wrapper).
3. **Crear TodoWrite** desde Turn 1: Phase 1 (tooling) · Phase 2 (secrets) · Phase 3 (state) · Phase 4 (preguntas) · Phase 5 (primitivas: Neon · **CP2** sustrato de despliegue, Vercel o Railway · dominios/Resend) · Phase 6 (narración).
4. Ejecutar respetando los **turn boundaries** y el checkpoint del SKILL.md. El gate HIGH-risk (CP2) para incondicionalmente, incluso en fluido.
5. No ejecutar de memoria. No saltar fases. No mutar recursos sin aprobar CP2. No commitear.

## Pipeline

```
factory new → infisical login (sesión de la bóveda; acceso a rail-timekast) → /provision → primer deploy
```
