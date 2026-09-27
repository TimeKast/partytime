---
run_id: { YYYYMMDDTHHMMSS }
generated_by: tk-design orchestrator (Phase 4)
phase: 4 — SCR classification
---

# SCR Classification Audit — run {{run_id}}

> **Produced by:** `tk-design` orchestrator Phase 4 (post-IA approval, pre-per-screen-contracts).
> **Consumed by:** `tk-design` Phase 5 dispatch (tier → specer routing) + CP3 user review + downstream `/backlog` traceability.
>
> **Anti-pattern:** este audit es **read-only post-CP3 approval**. Cambios mid-run (override per-screen in CP3) generan un patch al per-SCR shard + actualización aquí, NO re-emit del archivo entero.

---

## §1 Summary

| Tier           | Count | Specer route                        |
| -------------- | ----- | ----------------------------------- |
| `kit-pure`     | {{N}} | Orchestrator direct (no agent)      |
| `kit-extended` | {{N}} | `dsg-screen-specer-light` (batched) |
| `custom`       | {{N}} | `dsg-screen-specer-full` (batched)  |
| **Total**      | {{N}} | —                                   |

**Skill-gap warnings detected:** {{N}} (ver §3).

**Boundary cases flagged for review:** {{N}} (ver §4).

---

## §2 Per-SCR classification

> **`day2_action` column is OPTIONAL** — populated only in `add <plan>` (day-2) mode with `nueva` / `regenerar` / `backfill` from the action matrix (`day2-classification.md`). In greenfield runs it stays `—` (there is no day-2 action). The `07_SK_LEVERAGE row cited` column likewise reads `— (plan-code source)` in day-2 (no FT chain).

| SCR-ID  | Slug        | Tier           | `day2_action` | Sub-features breakdown                                  | skills_consult                                     | skills_warning | Justification                                                          | 07_SK_LEVERAGE row cited         |
| ------- | ----------- | -------------- | ------------- | ------------------------------------------------------- | -------------------------------------------------- | -------------- | ---------------------------------------------------------------------- | -------------------------------- |
| SCR-001 | login       | `kit-pure`     | —             | FT-S01 → 1/1 Configure                                  | sk-tokens-neomorphism                              | —              | 100% Configure + cero per-screen customization (project-defaults only) | `07_SK_LEVERAGE §Tier S §FT-S01` |
| SCR-002 | home        | `custom`       | —             | FT-S05 → 1/3 Configure + 2/3 Extend (per-role variants) | sk-tokens-neomorphism, sk-ui, sk-navigation | —              | Per-role variants ≠ project-defaults → custom                          | `07_SK_LEVERAGE §Tier S §FT-S05` |
| SCR-019 | mi-perfil   | `kit-extended` | —             | FT-S01 → 2/3 Configure + 1/3 Extend (campo employee_id) | sk-tokens-neomorphism, sk-ui, sk-security          | —              | 1 per-screen customization (campo nuevo) — light spec                  | `07_SK_LEVERAGE §Tier S §FT-S01` |
| SCR-005 | ventas-dash | `custom`       | —             | FT-M11 → 0/2 Configure + 2/2 Extend (chart + filters)   | sk-tokens-neomorphism, sk-ui, kb-dataviz           | —              | Layout impact: true + dashboard com chart custom                       | `07_SK_LEVERAGE §Tier M §FT-M11` |
| SCR-031 | analytics   | `custom`       | `nueva`       | — (plan-code source)                                    | sk-tokens-neomorphism, sk-ui, kb-dataviz           | —              | Day-2: nueva con layout propio (chart + filtros) → custom              | `— (plan-code source)`           |
| ...     | ...         | ...            | ...           | ...                                                     | ...                                                | ...            | ...                                                                    | ...                              |

---

## §3 Skill-gap warnings (R-NEW-2)

> Validator heurístico post-classification que lint-ea shard content vs expected skill hints. NO es tabla SSOT — surface gaps al user en CP3.

| SCR-ID  | Shard signal detected           | Skill expected     | Status                   |
| ------- | ------------------------------- | ------------------ | ------------------------ |
| SCR-005 | Menciona `chart`, `viz`, `KPI`  | `kb-dataviz`       | Missing — flagged in CP3 |
| SCR-022 | Menciona `Form`, `Zod`, `field` | `sk-ui` (form kit) | Missing — flagged in CP3 |
| ...     | ...                             | ...                | ...                      |

**CP3 decision:**

- [ ] User approved "completar skill-gaps" → `skills_consult` actualizado en per-SCR shards correspondientes.
- [ ] User opted "no completar" → per-SCR shards mantienen `skills_warning_acknowledged: true`. Specer recibe set incompleto + emite warning inline en el spec generado.

---

## §4 Boundary cases flagged

> SCRs cerca del threshold tier donde el classifier dudó. Listados explícitamente en CP3 para validation del user (no asumimos confidence).

| SCR-ID  | Initial tier | Alternative considered | Reason for ambiguity                                                       | User decision          |
| ------- | ------------ | ---------------------- | -------------------------------------------------------------------------- | ---------------------- |
| SCR-019 | kit-extended | kit-pure / custom      | Campo employee_id parece per-screen custom pero podría ser project-default | confirmed kit-extended |
| SCR-035 | kit-pure     | kit-extended           | Asumiendo solo 3 temas shipped. ¿Algún tema custom?                        | confirmed kit-pure     |
| ...     | ...          | ...                    | ...                                                                        | ...                    |

---

## §5 Override log (Phase 4 CP3)

> Append-only log de overrides per-screen aplicados en CP3. Cada entrada justifica un cambio de tier post-classification.

```yaml
# Example entry:
- scr_id: SCR-019
  from_tier: kit-pure
  to_tier: kit-extended
  reason: 'User confirmó que mi-perfil agrega campo custom employee_id'
  timestamp: 2026-05-28T17:30:00Z
  shard_patched: design-registry-{{run_id}}/per-scr/SCR-019.md
```

---

## §6 Provenance

```yaml
sources_consulted:
  - project/planning/07_SK_LEVERAGE.md
  - project/planning/15_IMPLEMENTATION_PACKETS/FT-*.md (all)
  - project/planning/16_DESIGN.md (§2 Screen Map post-CP2)
  - .claude/skills/sk-features-index/SKILL.md
generated_at: { { ISO timestamp } }
classifier_fixtures_verified: scripts/tools/verify-scr-classifier.ts
```

---

_TimeKast Factory — tk-design template · scr-classification audit (Phase 4 output)_
