# Methodology — Implementation-readiness Gate

> **Aplica a:** todos los canonical artifacts (`00`-`11`, `13`; T3 expand: `12`, `14`, `16`) + el frontmatter v2 de project-config.
> **Schema canónico:** sección final obligatoria en cada artifact + `decisions/` directory para tracking issues.
> **Templates relacionados:** `tracking-issue.template.md` (unified para DECISION/SPIKE/ADR).

---

## §1 Doctrine

Cada workflow downstream (`/design`, `/backlog`, `/implement`) **abre con un check** sobre la sección `Implementation-readiness` de los artifacts upstream que consume. Si `status: blocked` para ese consumer → **STOP, no procede**.

Esto resuelve "Ready for backlog" no consumer-specific — cada artifact declara status **por workflow downstream**, no globalmente.

---

## §2 Section shape obligatorio

Cada canonical artifact termina con **dos gates separados**:

```markdown
## Completeness Gate

| Check                    | Result      |
| ------------------------ | ----------- |
| {{check 1 per artifact}} | PASS / FAIL |
| {{check 2}}              | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions         |
| ------------ | ------------------------------- | -------------------------- |
| `/design`    | `ready` / `partial` / `blocked` | —                          |
| `/backlog`   | (idem)                          | DECISION-001, DECISION-003 |
| `/implement` | (idem)                          | SPIKE-002, DECISION-001    |

### Notes

- DECISION-001 blocks /backlog because pricing model affects schema
- SPIKE-002 must run before any FT-007 issue is generated
```

### Why two gates (split rationale)

Pre-T2 había una sola sección "Implementation-readiness" que mezclaba dos preguntas distintas:

| Pregunta                                       | Responde                             | Live en                 |
| ---------------------------------------------- | ------------------------------------ | ----------------------- |
| ¿El artifact está completo como **documento**? | quantitative gate del artifact mismo | `## Completeness Gate`  |
| ¿El **consumer downstream** puede proceder?    | blocker IDs + status per consumer    | `## Consumer Readiness` |

Un artifact puede tener `Completeness Gate: PASS` (todas las secciones obligatorias presentes, refs cuádruples cuadran, etc.) pero `/implement: partial` porque un ADR sigue `proposed`. Conflar las dos confunde downstream — "PASS" no significa "implementable".

### Status values (Consumer Readiness only)

**Parseable obligatorio:** `ready | partial | blocked` (lowercase, sin emoji) PRIMERO. Emoji opcional para humanos.

| Status       | Significado                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `ready` ✅   | Sin blockers para ese consumer; procede                                                          |
| `partial` ⚠️ | Procede con sección downstream marcada partial; listar DECISION/SPIKE que desbloquean cada parte |
| `blocked` ❌ | NO procede; lista TODOS los blockers obligatorios                                                |

### Completeness Gate values

**Parseable:** `PASS | FAIL` only — no `partial` here (un check pasa o no). Checks son artifact-specific (definidos en cada `methodology/*.md` per artifact).

---

## §3 Tres caminos formales por cada Blocking decision

Cada `Blocking decision` listada MUST ser uno de los 3 caminos. Estado "pendiente sin clasificación" es **inválido** y bloquea CP2 (ver Pre-CP2 Canonical State Sweep — SKILL.md Phase 7.6).

### 🔴 Hard rule: tracking ID obligatorio

Cualquier `partial` o `blocked` en una tabla Implementation-readiness DEBE tener al menos un tracking ID adjacent en el formato `(DECISION|SPIKE|ADR)-NNN`. NO se acepta:

- `partial` sin Blocking decisions listed
- `partial: pending Q cliente` (sin ID que la trackea)
- `blocked: TBD` o `blocked: pendiente`
- `blocked: see DECISION-X` donde `decisions/DECISION-X.md` no existe

Regex enforced en Phase 7.6 sweep: `(partial|blocked)` no seguido dentro de 200 chars por `(DECISION|SPIKE|ADR)-\d+` → fail. **Único escape:** inline resolution (camino a) — donde la decisión queda BAKED en el artifact upstream (no comentario `resolved later`).

### (a) Resolver inline

- **Cuándo:** orchestrator + user pueden cerrar la decisión en el momento (mini Gap Round).
- **Mecánica:** Gap Round local — orchestrator pregunta, user responde, decisión locked en el artifact upstream que se actualiza inline.
- **Outcome:** artifact upstream marca status `ready` para ese consumer; la decisión queda bakeada inline (no genera file en decisions/, no necesita tracking ID porque ya NO está `partial`/`blocked`).

### (b) Spike issue

- **Cuándo:** decisión técnica requiere PoC para resolver (no cierra solo con conversación).
- **Mecánica:** genera `decisions/SPIKE-XXX.md` (type: spike) con scope, criterio de cierre, owner técnico, due date.
- **Outcome:** workflow downstream **pausa** hasta `status: resolved` del spike. Mientras: artifact upstream marca status `blocked` o `partial` listando `SPIKE-XXX` explícito.

### (c) Defer + tracking issue

- **Cuándo:** espera legítima (cliente decidirá la próxima semana, data llega del proveedor, deadline externo).
- **Mecánica:** genera `decisions/DECISION-XXX.md` (type: decision) con owner stakeholder + criterio de cierre + due date.
- **Outcome:** workflow downstream **procede `partial`** — completa lo posible, marca con `DECISION-XXX` explícito las partes diferidas.

---

## §4 Reglas durables

1. **`status: partial` MUST listar qué secciones del output downstream se marcan partial.**
   - Ejemplo: "/backlog partial: FT-007, FT-009 issues quedan partial hasta DECISION-003 (pricing tiers)."

2. **Cada Blocking decision MUST mapear a exactly uno de los 3 caminos.**
   - "pendiente sin clasificar" = invalid. Workflow downstream debe rechazar el artifact si encuentra esto.

3. **`/backlog` migra decisions/ a issues** cuando se autore.
   - `decisions/DECISION-XXX.md` → `backlog/v0.1/issues/DECISION-XXX.md` preservando ID.
   - Mecanismo real, no placeholder. Lifecycle continúa.

4. **ADRs siguen el mismo lifecycle.**
   - `type: adr` en `decisions/` también. `status: proposed → accepted | rejected`. Phase 7 architect agent **valida y emite el veredicto**; el **orquestador** escribe la transición (`proposed → accepted/rejected`) al consolidar la fase — el agente es read-only.

5. **Cross-workflow tracking.**
   - DECISION/SPIKE NO son exclusivos del discovery — `/design`, `/backlog`, `/implement` pueden generar nuevos al encontrar blockers downstream.

---

## §4b ADR lifecycle post-CP2

**🔴 Hard rule (enforced en SKILL.md Phase 7.6 Pre-CP2 Sweep + Phase 7.3 architect gate):**

Una ADR con frontmatter `blocks: [...]` **non-empty** NO puede cerrar discovery con `status: proposed`. Debe resolverse antes de CP2 a uno de:

| Outcome                                | Acción mecánica                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accepted clean**                     | `status: accepted` · `Decision` section + `Consequences` section completos · 04_ARCHITECTURE bakeado.                                                                             |
| **Accepted with caveat**               | `status: accepted` PLUS emit `decisions/SPIKE-XXX.md` o `decisions/DECISION-XXX.md` capturando la caveat (la caveat se trackea como nuevo blocker, no como ambigüedad en la ADR). |
| **Rejected**                           | `status: rejected` · `Status notes` explica por qué · alternativas evaluadas listed in `alternatives_considered`.                                                                 |
| **Defer entero (la decisión no urge)** | Move ADR a `decisions/` con `blocks: []` (advisory only) — pero documentar por qué el `blocks` cambió. Si downstream realmente está bloqueado, NO puede quedar advisory.          |

**Default conservador** para ADRs pre-existentes sin field `blocks:` en frontmatter: assume `blocks: [implement]`. Migration: orchestrator detecta ADR sin `blocks:` y prompts user al crear el ADR siguiente (no migration bulk).

**Gate check (Phase 7.3):**

```
count(ADRs WHERE status='proposed' AND blocks != []) == 0
```

Si > 0 → architect agent debe re-revisar; surfacea al user con detalle "ADR-XXX still proposed, blocks /backlog — resolve to accepted/rejected before CP2".

**Caveat → tracking ID rule:**

Si la ADR queda `accepted` PERO hay condiciones/dependencias sin resolver ("acceptable si vendor confirma SLA", "acceptable assuming current schema"), eso NO es una ADR accepted clean — es accepted with caveat. La caveat se convierte en `SPIKE-XXX` (si require PoC) o `DECISION-XXX` (si require info externa). NO se documenta como TODO inline en la ADR (queda invisible al gate).

---

## §5 Quantitative gate (verification)

Per artifact, antes de close, **ambas secciones** deben pasar:

### Completeness Gate

- Section `## Completeness Gate` presente con tabla `Check × Result`
- `Result` parseable: `PASS | FAIL` (no `partial` aquí — un check pasa o no)
- `Overall: PASS` requerido para que el artifact se considere completo
- Checks artifact-specific defined en cada `methodology/*.md` (e.g., `methodology/freeze-map.md §coverage` define checks de `01_FREEZE_MAP`)

### Consumer Readiness

- Section `## Consumer Readiness` presente con tabla `Consumer × Status × Blocking`
- `Status` parseable (`ready | partial | blocked` lowercase) ANTES de emoji
- Si cualquier consumer = `partial` → Notes section NO vacía
- Si cualquier consumer = `blocked` → Blocking decisions NO vacía
- **🔴 Cada `partial` o `blocked` MUST tener tracking ID `(DECISION|SPIKE|ADR)-NNN` explícito en la celda Blocking decisions** (regex `(DECISION|SPIKE|ADR)-\d+` dentro de la celda)
- **Cada tracking ID listado MUST resolver a un archivo existente en `decisions/`** — orchestrator verifica via Glob

Si fail → orchestrator re-emite section (Edit tool); no re-spawn. Pre-CP2 sweep (SKILL.md Phase 7.6) re-aplica este gate globalmente sobre TODOS los durables.

---

## §6 Refs downstream

- Cada workflow downstream lee Implementation-readiness section AL ABRIR el workflow:
  1. Loop sobre artifacts upstream que consume
  2. Per artifact, lee tabla → si `status: blocked` para él, STOP + reporta al user
  3. Si `status: partial`, lee Notes para entender qué partes son partial y procede solo en las ready
  4. Si `status: ready`, procede normal
- Esto **eliminate** assumption de "todo está listo siempre" — workflow downstream check explícito.

---

_TimeKast Factory — tk-discovery methodology · implementation-readiness_
