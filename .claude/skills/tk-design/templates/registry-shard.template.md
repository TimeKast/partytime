---
shard_type: per-ft | per-scr | per-scr-day2
shard_id: { FT-NN | SCR-NN }
run_id: { YYYYMMDDTHHMMSS }
generated_by:
  {
    dsg-context-analyst (Phase 1, per-ft | source_mode: plan-code, per-scr-day2) |
    tk-design orchestrator (Phase 4, per-scr concat),
  }
---

# Registry shard — {{shard_id}}

> **Shape canónico:** este template cubre tres shapes — `per-ft`, `per-scr` (greenfield, `source_mode: discovery`) y `per-scr-day2` (day-2, `source_mode: plan-code`). Per-SCR es super-set: concatena 1..N per-FT shards de las FTs referenciadas por la SCR + slices adicionales (RBAC + readiness + OQs) deduped. Per-SCR-day2 NO concatena FTs (no hay FT chain en plan-code) — reemplaza §1/§5/§6 por el bloque as-built + delta + caveat (ver §10 abajo).
>
> **Read access:**
>
> - Per-FT shards: read-only para Phase 4 (classifier deriva tier) + Phase 5 (specer batches).
> - Per-SCR shards: read-only para Phase 5 specers (input principal). Generado on-demand en Phase 4 post-classification.
> - Per-SCR-day2 shards: read-only para Phase 5 specers + Phase 8 validators (leen el caveat de §10 para ajustar cobertura). Emitido directo por `dsg-context-analyst` en `source_mode: plan-code` (no concat).
>
> **Write access:**
>
> - Per-FT: `dsg-context-analyst` solo. Specers NUNCA modifican (anti-pattern enforcement).
> - Per-SCR: tk-design orchestrator solo durante Phase 4. Patch en Phase 4 CP3 si user override-ea tier.
> - Per-SCR-day2: `dsg-context-analyst` (`source_mode: plan-code`) solo. Specers NUNCA modifican.

---

## §1 Features

> 1 fila per FT que vive en este shard. Per-FT shard tiene exactamente 1 fila. Per-SCR shard tiene 1..N filas (las FTs que monta la SCR).

| FT-ID     | Name             | Tier (S/M/L) | Status | Wave   | Layout impact | Packet ref |
| --------- | ---------------- | ------------ | ------ | ------ | ------------- | ---------- | ---------------------------------------- |
| FT-{{NN}} | {{Feature name}} | {{tier}}     | ready  | W{{N}} | true          | false      | `15_IMPLEMENTATION_PACKETS/FT-{{NN}}.md` |

---

## §2 Entities (slice — solo las referenciadas por las FTs de §1)

```yaml
ENT-{{ID}}:
  pk: {{column}} ({{type}})
  fields: [{{field1}}, {{field2}}, ...]
  enums:
    {{column}}: { '{{val}}': '{{meaning}}', ... }
  notes:
    - {{nota relevante para UI design}}
```

> Dedup: si esta entidad ya apareció en otro per-FT shard concatenado, NO duplicar — keep first occurrence + cross-ref `also-used-by: [FT-XX, FT-YY]`.

---

## §3 Actions (slice — solo las del shard)

```yaml
{ { actionName } }:
  path: { { src/lib/actions/... } }
  rbac: withAuth({ ... })
  input_zod: { ... }
  output: { ... }
  error_codes: [401, 403, 404, ...]
  side_effects: [...]
```

---

## §4 RBAC slice (roles × resources que tocan esta SCR/FT)

```yaml
{ { role } }:
  { { resource } }:
    actions: [read, create, update, delete]
    scope: global | sucursal | denied
    notes: { { ... } }
```

---

## §5 Readiness slice

```yaml
status: ready | partial | blocked
blockers: [{ { tracking-id } }, ...]
mitigation: { { ... } }
```

---

## §6 OQs slice (Open Questions que afectan a esta SCR/FT)

```yaml
{ { CQ-XX | OQ-XX } }:
  question: { { ... } }
  consumer: /design | /implement
  default: { { ... } }
  deadline: { { ... } }
```

> Filter rule: solo OQs con `consumer: /design` aparecen en per-SCR shards consumidos por Phase 5. Otras OQs viven en `13_OQ_BY_FT_MATRIX.md` y se propagan a /implement.

---

## §7 skills_consult (derived — NO hardcoded mapping)

```yaml
skills_consult:
  - .claude/skills/tk-design/methodology/screen-contract-shape.md # always
  - .claude/skills/sk-tokens-neomorphism/SKILL.md # always (theme awareness)
  - .claude/skills/sk-ui/SKILL.md # if shard menciona DataTable, FormField, StatusToggle, etc
  - .claude/skills/kb-dataviz/SKILL.md # if shard menciona chart, viz, KPI, series, aggregation
  - .claude/skills/sk-navigation/SKILL.md # if SCR es nav-related

skills_warning: [] # populated por Phase 4 skill-gap validator si packet omite skill expected
skills_warning_acknowledged: false # set true si user opta "no completar" en CP3
```

> Derivación: orchestrator escanea `Action contracts` + `Data` + `Ref` campos del packet por keywords. NO es tabla SSOT — es derivación heurística sobre datos del packet.

---

## §8 Per-SCR only — SCR target metadata

> Sección presente SOLO en per-SCR shards. Per-FT shards la omiten.

```yaml
scr_target:
  id: SCR-{{NN}}
  slug: {{slug}}
  route: /(protected)/{{...}}
  layout: DashboardShell | PublicShell
  roles: [...]
  features: [FT-{{NN}}, ...]
  personas: [PER-{{ID}}, ...]
  tier: kit-pure | kit-extended | custom
  binding: sk-{{skill}}  # only if tier == kit-pure
  customizations: [...]  # only if tier == kit-extended or custom
```

---

## §9 Provenance

```yaml
sources_consulted:
  # greenfield (source_mode: discovery)
  - project/planning/03_DEEP_DIVE.md#FT-{{NN}}
  - project/planning/15_IMPLEMENTATION_PACKETS/FT-{{NN}}.md
  - project/planning/05_RBAC_MATRIX.md
  - project/planning/09_DATA_MODEL.md
  - project/planning/10_API_SURFACE.md
  - project/planning/12_BACKLOG_READINESS.md
  - project/planning/13_OQ_BY_FT_MATRIX.md
  # day-2 (source_mode: plan-code) — replaces the discovery sources above
  - project/design-artifacts/{{run_id}}/parsed-design-plan.md
  - src/app/(protected)/{{...}}/page.tsx # as-built target screen
  - project/reference/INVENTORY.md
  - project/reference/HOOKS.md
  - project/reference/SCHEMA.md
  - project/reference/API.md
  - src/config/navigation.ts
generated_at: { { ISO timestamp } }
```

---

## §10 Per-SCR-day2 only — as-built + delta + caveat

> Sección presente SOLO en `shard_type: per-scr-day2` (`source_mode: plan-code`). Reemplaza §1 Features / §5 Readiness / §6 OQs (no existen sin FT chain). §2 Entities / §3 Actions / §4 RBAC siguen presentes (environmental — del kit, no del plan). Per-FT y per-SCR (greenfield) la OMITEN.

```yaml
scr_target:
  id: SCR-{{NN}} # asignado en Phase 3-delta (max+1); puede venir vacío si aún no reconciliado
  slug: { { slug } }
  route: /(protected)/{ { ... } }
  layout: DashboardShell | PublicShell
  tier: kit-pure | kit-extended | custom # del Phase 4 day-2 classifier (DSGN-002)
  day2_action: nueva | regenerar | backfill # del Phase 4 day-2 classifier (DSGN-002)

as_built: # reverse-engineered del código existente; vacío/null si day2_action == nueva
  page_file: src/app/(protected)/{{...}}/page.tsx | null # null si la pantalla no tiene page.tsx directo
  mounts: [{ { primitiva/componente del kit montado, p.ej. DataTable, NotificationPanel } }, ...]
  kit_helpers: [{ { hook/helper de INVENTORY/HOOKS detectado } }, ...]
  notes:
    - { { observación descriptiva del estado actual del código — NUNCA prescriptiva } }

delta: # el cambio que el plan prescribe sobre la pantalla (la parte prescriptiva)
  source_unit: { { unit_title de parsed-design-plan.md §2 } }
  changes:
    - { { qué agrega/modifica el plan sobre el as-built } }

caveat: 'no FT/persona refs — plan-code source' # literal — Phase 8 validators lo leen (§16.1)

gaps: # registrar, no fabricar (edge case: pantalla en navigation.ts sin page.tsx)
  - { { p.ej. "as_built no encontrado: ruta dinámica sin page.tsx directo" } }
```

> **Discipline:** el bloque `as_built` es **descriptivo** (espejo del código, drifts al primer cambio out-of-pipeline). El valor prescriptivo vive en `delta`. Si la pantalla existe en `navigation.ts` pero no tiene `page.tsx` resoluble → registrar en `gaps`, NUNCA fabricar contexto (`CODING.md §8`). El `caveat` literal viaja intacto al shard para que los validators Phase 8 ajusten su cobertura (vs plan, no vs FT/persona).

---

_TimeKast Factory — tk-design template · registry-shard (per-FT + per-SCR + per-SCR-day2)_
