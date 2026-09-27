# Methodology — Acceptance Scenarios

> **Artifact:** `06_ACCEPTANCE_SCENARIOS.md` (path canónico `project/planning/06_ACCEPTANCE_SCENARIOS.md`).
> **Phase:** 6.1 (synthesis post-brief, después de 02 + 03 + 05).
> **Template:** `templates/06_ACCEPTANCE_SCENARIOS.template.md`.

> **NO fresh reasoning.** Este artifact es **transcripción + expansión Gherkin** del deep-dive Tier L §2 (AC field) + US del brief §3.3 (FULL INDEX). Brief §3.3 y deep-dive Tier L §2 colapsan a **pointer** hacia este doc — SSOT canónico de AC.

---

## §1 Source de input (no inventar)

- **Brief §3.3 (User Stories — FULL INDEX, no top 5)** — universe de US-XXX a cubrir.
- **`03_DEEP_DIVE.md` Tier L §2 (AC field per FT-NN)** — AC ya extraídos del deep-dive; este doc los formaliza Gherkin.
- **`02_PERSONAS.md`** — actor refs (PER-XXX).
- **`05_RBAC_MATRIX.md`** — scope refs para security-related scenarios.

Si brief §3.3 está vacío o tiene "top 5" → STOP, requires brief edit antes (gate fail por cobertura insuficiente).

---

## §2 Granularidad — Gherkin per US-XXX (no per feature)

| Granularidad   | Decisión                                                                             |
| -------------- | ------------------------------------------------------------------------------------ |
| Per feature    | ❌ — feature puede tener N user stories; scenarios per feature pierden actor-context |
| **Per US-XXX** | ✅ — `/backlog` consume scenarios para AC del issue 1:1 con US-XXX                   |

Cada US-XXX → ≥1 happy scenario + ≥1 edge scenario. Heurística mínima del gate.

---

## §3 Refs cuádruples convention

Cada Gherkin scenario lleva inline la linea de refs:

```
Refs: [FT-X] [BR-X: F{N}] [ENT-X] [US-X] [PER-X]
```

Self-contained citation site — al leer el scenario, el agente AI tiene refs a:

- Feature (`FT-X` de 03_DEEP_DIVE)
- Business rule + firm decision (`BR-X: F{N}` con meaning compact)
- Entity central (`ENT-X` de 03_DEEP_DIVE Data field)
- User story (`US-X` de brief §3.3 + index aquí)
- Persona ejecutora (`PER-X` de 02_PERSONAS)

**NO referencias IDs del design** (SCR-XXX, CMP-XXX, FLW-XXX, DD-XXX) — esos viven en `/design` output y se agregan downstream.

**RBAC scope refs (opcional, solo security scenarios):**

- Si scenario verifica permission, agregar inline:
  > "Given que `{persona}` está autenticado como `{role}` con scope `{own|team|global}` sobre `{ENT-X}`..."
- Refs a 05_RBAC_MATRIX implícitos en el rol+scope+entity tuple. No requiere ID extra.

---

## §4 Shape Gherkin

```gherkin
Refs: [FT-X] [BR-X: F{N}] [ENT-X] [US-X] [PER-X]

Given {precondición — auth state, data context}
  And {precondición adicional si aplica}
When {acción específica del persona}
Then {expected behavior observable}
  And {side effect: persist, event, notification, ...}
```

Reglas:

- 1 happy + ≥1 edge por US-XXX
- Edge cases incluyen: auth-fail, permission-denied, data-conflict, edge data (vacío/max/concurrent)
- NO escribir scenarios de "todo lo posible" — captar el behavior que el `/backlog` necesita para AC ejecutable

---

## §5 Quantitative gate (Phase 6.1)

- `count(scenarios) ≥ count(US-XXX) × min_scenarios_per_us`
- Heurística: ≥1 happy + ≥1 edge por US-XXX → `min_scenarios_per_us = 2`
- US-XXX universe = brief §3.3 **FULL INDEX** (no top 5)
- Si fail → orchestrator re-ensambla scenarios faltantes; NO re-spawn

---

## §6 Refs downstream

- `/backlog` lee 06 para AC del issue — cada FT-NN issue copia/links los scenarios relevantes
- `/implement` lee scenarios al ejecutar issue — driven-development (tests Vitest/Playwright derivan de scenarios)
- `/design` lee scenarios para entender behavior expected — informs interaction flows

---

_TimeKast Factory — tk-discovery methodology · acceptance-scenarios_
