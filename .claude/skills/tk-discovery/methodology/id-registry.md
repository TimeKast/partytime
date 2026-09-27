# Methodology — ID Registry

> **Propósito:** registry canonical de prefixes de IDs que `tk-discovery` emite. Cada artifact downstream (acceptance-scenarios, RBAC matrix, deep-dive Rules field) referencia IDs aquí codificados. Ambiguity en prefixes = drift downstream.

---

## §1 Tabla canónica

| Prefix                     | Origen artifact                                            | Cuándo emitir                                                         | Descripción                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F{N}** (bare, sin guión) | `01_FREEZE_MAP.md`                                         | Phase 2 (freeze-map extraction)                                       | **Firm Decisions** — decisiones locked al cierre de Phase 2. Change cost: low / med / high. Citadas con sintaxis `F{N}` o `(F{N}: meaning)` en deep-dive Rules field.                           |
| **FT-NN**                  | `03_DEEP_DIVE.md` (Tiering classification table)           | Phase 4a (tiering)                                                    | **Feature Tickets** — unit granular de feature. Tier S / M / L. Cada FT-NN tiene su sub-section en Phase 4b/4c con 8-fields spec.                                                               |
| **PER-XXX**                | `02_PERSONAS.md`                                           | Phase 6.1 (synthesis)                                                 | **Personas** (JTBD-based). Cada PER-XXX captura rol + tarea + nivel técnico + frecuencia + device + canal soporte + pain points + sensibilidad operativa.                                       |
| **ENT-XXX**                | `03_DEEP_DIVE.md` (Data field) + brief §4 (entity index)   | Phase 4 (deep-dive)                                                   | **Entities** del data model. ENT-XXX = una tabla/colección. Referenciado por RBAC matrix (resources) y acceptance-scenarios (data context).                                                     |
| **US-XXX**                 | `06_ACCEPTANCE_SCENARIOS.md` + brief §3.3 (full index)     | Phase 6.1 (synthesis)                                                 | **User Stories** formalizadas. US-XXX = "Como `<PER-X>` quiero `<X>` para `<outcome>`". Cada US tiene ≥1 happy + ≥1 edge Gherkin scenario. **Brief §3.3 es FULL INDEX**, no top 5.              |
| **BR-DOMAIN-NN**           | `03_DEEP_DIVE.md` (Rules field) + brief §6 (rules index)   | Phase 4 (deep-dive)                                                   | **Business Rules** con domain prefix (ej: `BR-AUTH-01`, `BR-PRICING-03`). Refs siempre incluyen meaning compact: `(BR-X: ...)`.                                                                 |
| **OQ-XXX**                 | `01_FREEZE_MAP.md` (Open Questions section)                | Phase 2 (freeze-map)                                                  | **Open Questions** — gaps de info detectados que no son firm decision. Working backlog hasta resolución.                                                                                        |
| **ADR-XXX**                | `decisions/ADR-*.md` + inline refs en `04_ARCHITECTURE.md` | Phase 4c (sub-ronda change_cost=high) → Phase 7 (architect validates) | **Architecture Decision Records.** Full content (rationale + alternatives_considered + change_cost) en `decisions/`. 04_ARCHITECTURE.md cita ADR-XXX inline en consecuencias bakeadas en §§1-5. |
| **DECISION-XXX**           | `decisions/DECISION-*.md`                                  | Phase 6 / cross-workflow (anywhere)                                   | **Tracking issues** para readiness `partial` o `blocked`. Cualquier blocker que no es ADR ni SPIKE (commercial, product, data) cae aquí.                                                        |
| **SPIKE-XXX**              | `decisions/SPIKE-*.md`                                     | Phase 6 / cross-workflow                                              | **Spike issues** — PoC required para desbloquear DECISION o ADR. type: spike en tracking-issue template.                                                                                        |

---

## §2 Distinción crítica: F{N} vs FT-NN

Esto es la fuente principal de drift histórico. Reglas firmes:

### `F{N}` (bare, sin guión)

- Vive en `01_FREEZE_MAP.md` Firm Decisions table.
- Es una **decisión locked** (ej: "F12: usar PostgreSQL JSONB para configs"; "F23: SK-PWA para offline").
- Tiene `change_cost: low | med | high`.
- Citada en deep-dive Rules field: `BR-X: F{N}` con meaning inline.
- **NO confundir con feature** — F{N} es _decisión_, no _deliverable unit_.

### `FT-NN` (con prefix `FT-`)

- Vive en `03_DEEP_DIVE.md` Tiering classification table.
- Es una **unit de feature** (deliverable scope: "FT-07: Scoring engine", "FT-15: User onboarding flow").
- Tiene Tier: S / M / L.
- Cada FT-NN tiene sub-section detallada con 8-fields spec en Phase 4b (Tier S/M compact) o Phase 4c (Tier L full).
- **NO confundir con decision** — FT-NN es _qué construir_, no _qué decidir_.

### Convention enforcement

| Output esperado | Wrong (don't emit)                    | Right (emit) |
| --------------- | ------------------------------------- | ------------ |
| Firm Decision   | `F-12`, `FT-12`, `FIRM-12`            | `F12` (bare) |
| Feature Ticket  | `F-07`, `F07` (sin prefix), `FEAT-07` | `FT-07`      |

Templates `01_FREEZE_MAP.template.md` y `03_DEEP_DIVE.template.md` deben respetar estos formatos. Phase 4a tiering output usa columna `FT-ID`.

---

## §3 Refs cuádruples (canonical citation site)

`06_ACCEPTANCE_SCENARIOS.md` formaliza el site de citas más denso del discovery. Cada scenario lleva inline:

```markdown
**Scenario:** {nombre}

> Refs: [FT-07] [BR-AUTH-03: F12] [ENT-USER] [US-005] [PER-002]
```

Significa:

- **FT-07** = feature al que pertenece (de 03_DEEP_DIVE.md)
- **BR-AUTH-03** = business rule que el scenario verifica (de 03_DEEP_DIVE.md Rules field)
- **F12** = firm decision que la rule locked (de 01_FREEZE_MAP.md) — sintaxis `BR-X: F{N}` self-contained
- **ENT-USER** = entity central al scenario (de 03_DEEP_DIVE.md Data field)
- **US-005** = user story que cubre (de brief §3.3 + 06_ACCEPTANCE)
- **PER-002** = persona ejecutora (de 02_PERSONAS.md)

**NO referencias IDs del design** (`SCR-XXX`, `CMP-XXX`, `FLW-XXX`, `DD-XXX`) en discovery artifacts — esos viven en `/design` output y se agregan downstream.

---

## §4 Status fields per ID type

### DECISION / SPIKE

- `status: open` — no resuelto, blocking downstream
- `status: resolved` — resuelto inline o vía mini Gap Round

### ADR

- `status: proposed` — flagged en Phase 4c, no validado aún
- `status: accepted` — validado por architect en Phase 7
- `status: rejected` — descartado tras review

### Refs en Implementation-readiness section

- `status: ready` — sin blockers para ese consumer
- `status: partial` — algunos blockers; lista las DECISION/SPIKE que desbloquean
- `status: blocked` — no procede; lista todos los blockers obligatorios

---

## §5 Lifecycle resumido

```
Phase 2 emite:     F{N} (freeze-map firm decisions) + OQ-XXX
Phase 4 emite:     FT-NN + BR-DOMAIN-NN + ENT-XXX
                   ADR-XXX (proposed; sub-ronda change_cost=high)
Phase 6.1 emite:   PER-XXX (personas) + US-XXX (acceptance) + DECISION-XXX/SPIKE-XXX (si blockers en readiness)
Phase 7 valida:    ADR-XXX (proposed → accepted/rejected); review per artifact
Phase 8 stripping: discovery-artifacts/ strippable; decisions/ preserve
```

Cuando `/backlog` se autore: `decisions/{DECISION,SPIKE,ADR}-*.md` migran a `backlog/v0.1/issues/` preservando IDs.

---

_TimeKast Factory — tk-discovery methodology · id-registry_
