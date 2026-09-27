# Freeze Map — {{project}}

> **Produced by:** `dsc-freeze-map-extractor` agent (Phase 2 of `/discovery`)
> **Consumed by:** main orchestrator (Phase 3 Gap Interview + Phase 6 synthesis + Phase 7 Challenge Pass) · downstream phases (`/design`, `/backlog`, `/implement`).
> **Schema canónico:** [`methodology.md §3`](../methodology.md).
> **Path canónico:** `project/planning/01_FREEZE_MAP.md`.
>
> **Cross-ref:** ADRs flagged at Phase 4c sub-ronda time (change_cost=high) viven en `project/planning/decisions/ADR-*.md` (type: adr) — un file per ADR usando `templates/tracking-issue.template.md`. Phase 7 architect agent reads `01_FREEZE_MAP.md` + `project/planning/decisions/ADR-*.md` (filter `status: proposed`) como input.

**Run date:** {{YYYY-MM-DD}}
**Source package:** {{summary de files consumidos — text count + image count + total KB}}
**SoT hierarchy (declarada por el autor del source, o deducida):**

- {{doc-A}} → SoT principal / SoT crudo / Reference / Legacy / Context
- ...

**Stakeholder:** {{nombre PO}} · **Tech Lead:** {{nombre}} · **Deadline:** {{YYYY-MM-DD}}

**Assets inventoried (sweep de target repo):** {{paths de tokens + iconos + assets branding detectados en target, si aplica}}

---

## Firm Decisions

<!-- Decisiones explícitas del source + confirmadas en Phase 1 bootstrap.
     NO parafrasear la decisión — citar literal cuando sea posible.
     NO promover recommendations a firm.
     Change cost: Low = config change safe · Med = schema/enum change · High = data migration required
     Enforcement: DB / app / RBAC / dual / N/A (capa donde vive el check)
     Target artifact: hint del file path o action name donde live el enforcement (`/implement` lo busca aquí)
     Test obligation: AC ref (AC-US-NN de 06_ACCEPTANCE_SCENARIOS) o test file path (tests/.../foo.spec.ts) -->

| #   | Decisión             | Fuente                          | Change cost      | Enforcement                  | Target artifact                                                                        | Test obligation                         |
| --- | -------------------- | ------------------------------- | ---------------- | ---------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- |
| F1  | {{decisión literal}} | {{doc §N o entrevista Phase 1}} | Low / Med / High | DB / app / RBAC / dual / N/A | {{ej: `schema/picks.ts CHECK` o `submitPickAction guard` o `ROUTE_ACL entry` o `N/A`}} | {{AC-US-NN o `tests/path/foo.spec.ts`}} |
| F2  |                      |                                 |                  |                              |                                                                                        |                                         |

> **Enforcement values:**
>
> - **`DB`** — constraint, trigger, o CHECK en PostgreSQL (schema layer)
> - **`app`** — server action guard / withAuth wrapper / Zod refinement (application layer)
> - **`RBAC`** — sk-security ROUTE_ACL / role-check middleware (auth layer)
> - **`dual`** — defense-in-depth (DB + app, mirror ADR-003 pattern)
> - **`N/A`** — declarative only (e.g., naming conventions, scope decisions sin enforcement code)
>
> **Target artifact:** hint concreto para `/implement` — file path relativo a `src/` o action name conocido. NO file paths absolutos.
>
> **Test obligation:** AC reference (`AC-US-NN`) o test file path. Si la firm es un invariante runtime, debería tener AT LEAST 1 happy + 1 edge en `06_ACCEPTANCE_SCENARIOS.md` que la verifique.

---

## Open Questions

<!-- OQs explícitas en el source + gaps detectados.
     Impacto: Alto = bloquea data model o architecture · Med = scope o UX · Bajo = detalle UI/copy
     Owner: Cliente (stakeholder decide) · TimeKast (interno) · Deep-Dive (se resuelve en Phase 4) -->

| #   | Pregunta              | Impacto           | Owner                          |
| --- | --------------------- | ----------------- | ------------------------------ |
| OQ1 | {{pregunta concreta}} | Alto / Med / Bajo | Cliente / TimeKast / Deep-Dive |

---

## Contradictions

<!-- Conflictos cross-doc (Estilo-C polished-vs-crudo, v2-vs-v1, etc) O intra-file.
     Citar literal A y B. Proponer acción específica, no "resolver con user" genérico.
     Si la acción es "Phase 3 pregunta específica", especificar el wording. -->

| #   | Doc A dice                    | Doc B dice                    | Qué hacer                                          |
| --- | ----------------------------- | ----------------------------- | -------------------------------------------------- |
| C1  | {{cita literal con path + §}} | {{cita literal con path + §}} | {{Phase 3 batch #1 / default / resolver con user}} |

---

## Recommendations

<!-- Marcadas [RECOMMENDED] — NO son firm. Phase 3 puede promoverlas si user las confirma.
     Fuente: quién la hizo (architect challenge pass, agent inference, source sugerencia, etc) -->

| #   | Recomendación                   | Fuente                       |
| --- | ------------------------------- | ---------------------------- |
| R1  | [RECOMMENDED] {{recomendación}} | {{doc §N / agent / Phase X}} |

---

## Post-MVP / Future

<!-- Items excluded explícitamente del MVP por el stakeholder. NO inferencias.
     Razón: por qué no MVP (scope reduction, timing, complexity, trade-off explícito) -->

| #   | Item     | Por qué no MVP                             |
| --- | -------- | ------------------------------------------ |
| PM1 | {{item}} | {{razón literal del stakeholder o fuente}} |

---

## Phase 3 Resolutions

<!-- Se llena DESPUÉS de Phase 3 Gap Interview.
     Cada resolution referencia su OQ o Contradiction fuente.
     Si una resolution invalida un Firm anterior → también lista ADR-needed o update-F-N. -->

### Estilo-C drift resolutions (contradictions C1-CN)

| #    | Resolución firm | Update de Firm previo                     |
| ---- | --------------- | ----------------------------------------- |
| R-C1 | {{texto}}       | F{{N}} confirma / override / nuevo F{{M}} |

### Scope + operational resolutions (OQ resolutions)

| #    | Resolución firm | Update                    |
| ---- | --------------- | ------------------------- |
| R-Q1 | {{texto}}       | OQ1 cierra / F{{N}} nueva |

### Tension sweep resolutions (derived OQs detectadas en sub-batch cierre)

| #   | Tensión                            | Resolución        |
| --- | ---------------------------------- | ----------------- |
| T1  | {{par de decisions incompatibles}} | {{user decision}} |

---

## Derived OQs (post-Phase-3)

<!-- OQs nuevas que emergieron DURANTE Phase 3 tension sweep.
     Diferentes de las OQs originales porque emergen de la interacción entre resolutions. -->

| #     | Pregunta                                    | Impacto | Owner   |
| ----- | ------------------------------------------- | ------- | ------- |
| OQ-D1 | {{pregunta nueva surgida en tension sweep}} | Med     | Cliente |

---

## Notes for downstream consumers

<!-- Anchors / warnings para Phase 3/4/6 + /docs elaboration:
     - Qué Firm decisions son irreversibles post primer Active
     - Qué OQs son blockers de Phase 4 vs /docs
     - Qué Contradictions requieren PO validation explícita
     - Qué assumption inferida debería ser confirmada con user antes de Phase 6 synthesis -->

1. {{nota 1}}
2. ...

---

## Completeness Gate

| Check                                                                                | Result      |
| ------------------------------------------------------------------------------------ | ----------- |
| §Firm Decisions: cada row tiene Enforcement + Target + Test ref columns              | PASS / FAIL |
| §Open Questions: cada OQ tiene Impact + Owner                                        | PASS / FAIL |
| §Contradictions: cada entry cita literal source-A vs source-B                        | PASS / FAIL |
| §Post-MVP / Future: cada deferred item tiene tracking ref (`DECISION-XXX` si aplica) | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions |
| ------------ | ------------------------------- | ------------------ |
| `/design`    | `ready` / `partial` / `blocked` | —                  |
| `/backlog`   | (idem)                          |                    |
| `/implement` | (idem)                          |                    |

### Notes

{{Si status=partial: link DECISION/SPIKE que cubre el blocker; e.g., `/backlog partial pending DECISION-007`.}}

---

_TimeKast Factory — Freeze Map (tk-discovery Phase 2 · produced by dsc-freeze-map-extractor)_
