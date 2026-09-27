# Tracking Issue — Unified Template

> **Path canónico:** `project/planning/decisions/{TYPE}-NNN.md` donde TYPE = `DECISION` | `SPIKE` | `ADR`.
> **Schema canónico:** [`methodology/implementation-readiness.md`](../methodology/implementation-readiness.md) + [`methodology/id-registry.md`](../methodology/id-registry.md).
> **Lifecycle:** `open` → `resolved` (DECISION, SPIKE) o `proposed` → `accepted | rejected` (ADR).

> **Conditional field rule (headless-safe):** orchestrator que escribe este template DEBE razonar sobre `type` antes de emitir frontmatter:
>
> - `type: decision` → frontmatter incluye solo los **7 campos base** (id, type, status, owner, due, blocks, created)
> - `type: spike` → mismo set base + body usa `## PoC scope` en lugar de `## Options considered`
> - `type: adr` → **9 campos** (base + `change_cost`, `alternatives_considered`); body con `## Options considered` obligatorio
>
> **Status values también condicionales:** `rejected` solo aplica a `type: adr` (DECISION y SPIKE no se rechazan — se resuelven o defieren).

---

## Frontmatter shape

### type: decision (7 campos base)

```yaml
---
id: DECISION-001
type: decision
status: open # open | resolved
owner: { Stakeholder name }
due: { YYYY-MM-DD | TBD }
blocks: [/design, /backlog, /implement] # workflows que bloquea
created: { YYYY-MM-DD }
---
```

### type: spike (7 campos base, mismo set que decision)

```yaml
---
id: SPIKE-001
type: spike
status: open
owner: { Engineer name }
due: { YYYY-MM-DD | TBD }
blocks: [/backlog, /implement]
created: { YYYY-MM-DD }
---
```

### type: adr (9 campos = base + change_cost + alternatives_considered)

```yaml
---
id: ADR-001
type: adr
status: proposed # proposed | accepted | rejected
owner: { Tech lead name }
due: { YYYY-MM-DD | TBD }
blocks: [/implement] # [] = advisory only; non-empty = gating per listed consumer(s)
created: { YYYY-MM-DD }
change_cost: low | med | high
alternatives_considered: ['option A', 'option B', 'status quo']
---
```

> **🔴 ADR lifecycle hard rule (enforced en SKILL.md Phase 7.3 + Phase 7.6):**
>
> Una ADR con `blocks: [...]` **non-empty** NO puede cerrar discovery con `status: proposed`. Debe resolverse a `accepted` (clean o with-caveat) o `rejected` antes de CP2. Si la decisión genuinamente no urge, mover a `blocks: []` (advisory) — pero documentar por qué.
>
> **Caveat → tracking ID rule:** si una ADR queda `accepted` PERO con condiciones sin resolver ("acceptable si vendor confirma SLA"), la caveat se materializa como `decisions/SPIKE-XXX.md` o `decisions/DECISION-XXX.md` separado — NO se documenta como TODO inline en la ADR (queda invisible al gate).
>
> **Migration default (ADRs pre-existing sin `blocks:` field):** assume `blocks: [/implement]` (conservador). Orchestrator prompts user al editar la ADR siguiente; no bulk migration.
>
> Detalle: `methodology/implementation-readiness.md §4b ADR lifecycle post-CP2`.

---

## Body — common sections

```markdown
# {DECISION|SPIKE|ADR}-XXX — {Short title}

## Context

{Por qué hay que decidir esto. Cita refs upstream (brief §N, FT-NN, ENT-XXX) si aplica.}

## Criterio de cierre

{Qué pasa para considerar resuelto. Métricas / outcomes específicos.}
```

---

## Body — type-specific sections

### type: decision

```markdown
## Options considered (opcional)

{Lista de opciones evaluadas si aplica.}

## Resolution

{Filled when status=resolved. Describe la decisión + por qué + qué se cambió como consecuencia.}
```

### type: spike

```markdown
## PoC scope

{Qué prueba el spike. Hipótesis a validar / refutar. Time-boxed (ej: 2 días).}

## Findings

{Filled cuando el spike corre. Conclusión: ¿hipótesis validada? siguiente paso.}

## Resolution

{Filled when status=resolved. Suele linkear a DECISION-XXX o ADR-XXX que el spike desbloqueó.}
```

### type: adr

```markdown
## Options considered (obligatorio)

- **Option A:** {description}. Pros: ... Cons: ...
- **Option B:** {description}. Pros: ... Cons: ...
- **Status quo:** ... Pros: ... Cons: ...

## Decision

{Filled when status=accepted. Qué opción se eligió + rationale.}

## Consequences

{Filled when status=accepted. Lista de cambios que se bakean en 04_ARCHITECTURE.md §§1-5. Orchestrator hace update bidireccional: actualizar 04 con ref `(ver ADR-XXX)` y cita aquí qué secciones de 04 se afectaron.}

## Status notes

{Si rejected: por qué se descartó. Si accepted: fecha de validación por architect agent en Phase 7.}
```

---

## Ejemplo concreto — DECISION

```markdown
---
id: DECISION-007
type: decision
status: open
owner: Stakeholder
due: 2026-06-01
blocks: [/design, /backlog]
created: 2026-05-23
---

# DECISION-007 — Pricing tier limits para freemium

## Context

Brief §4 menciona freemium tier pero no define límites concretos (cuántos scoreboards, cuántos usuarios). Bloqueante para diseñar el upgrade flow + para schema de `subscription_tier`.

## Criterio de cierre

- Lista de tiers (free, pro, enterprise) con limits cuantitativos
- Pricing acordado con stakeholder

## Options considered

- A: 1 board / 5 users / 100 events-mes (free tier muy restrictivo)
- B: 3 boards / unlimited users / 1000 events-mes (free tier permisivo)
- C: Definir post-launch con data real

## Resolution

{Pendiente — bloquea US-009, US-012 hasta resolución.}
```

---

## Ejemplo concreto — ADR

```markdown
---
id: ADR-001
type: adr
status: accepted
owner: Tech lead
due: 2026-05-20
blocks: [/implement]
created: 2026-05-15
change_cost: high
alternatives_considered:
  ['Postgres JSONB', 'Postgres separate table per config type', 'External KV store (Redis)']
---

# ADR-001 — Storage de configs de usuario

## Context

Cada usuario tiene N configuraciones (preferencias UI, notificaciones, integraciones). Schema rígido fuerza migrations cada feature nueva. Necesitamos esquema flexible que aguante extensión sin downtime.

## Criterio de cierre

- Decisión locked
- Migration path definido
- Patrón de queries documentado

## Options considered

- **Postgres JSONB:** flexible, queryable con `->`/`->>`, transactional. Cons: indexing complejo, validation en app-layer.
- **Postgres separate table per config type:** rígido, requires migration per feature. Pros: typed.
- **External KV store (Redis):** rápido, no transactional con Postgres. Cons: 2-system consistency.

## Decision

**Postgres JSONB.** Tradeoff a favor de velocidad de iteración vs typing strict.

## Consequences

- 04_ARCHITECTURE.md §1 Topology: "Configs de usuario en columna `users.preferences JSONB`"
- 04_ARCHITECTURE.md §3 Module boundaries: validation Zod schema en `src/lib/schemas/user-preferences.ts`
- `/implement`: cada feature que agrega preference key debe agregar al schema Zod sin tocar DB migration.

## Status notes

Accepted — veredicto del architect agent, transición escrita por el orquestador en Phase 7, 2026-05-20.
```

---

_TimeKast Factory — tk-discovery template · tracking-issue (unified)_
