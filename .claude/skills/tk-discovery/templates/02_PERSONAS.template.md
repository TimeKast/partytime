# Personas — {{project}}

> **Produced by:** main orchestrator (Phase 6.1 synthesis post-brief).
> **Consumed by:** `/design` (UX defensiva), `/backlog` (acceptance scenarios actor), `/implement` (rol → context).
> **Schema canónico:** [`methodology/personas.md`](../methodology/personas.md) + [`methodology/id-registry.md`](../methodology/id-registry.md).
> **Path canónico:** `project/planning/02_PERSONAS.md` (no `discovery-artifacts/`).

**Run date:** {{YYYY-MM-DD}}
**Source:** brief §2 (roles & permisos) + deep-dive Users field (per-feature) + sk-leverage si aplica (admin/staff overrides del kit).

---

## Personas index

| ID      | Rol                  | Persona name (opcional) | Tarea (JTBD)                  |
| ------- | -------------------- | ----------------------- | ----------------------------- |
| PER-001 | {{rol del brief §2}} | {{nombre opcional}}     | {{job-to-be-done en 1 línea}} |
| PER-002 |                      |                         |                               |

---

## PER-001 — {{Rol / nombre}}

### JTBD (Job-to-be-Done)

{{1-2 párrafos describiendo la tarea principal del persona. Qué entra a hacer al sistema, qué quiere lograr, qué success looks like.}}

### Perfil técnico

- **Nivel técnico:** novice | intermediate | power-user | technical
- **Frecuencia de uso:** daily | weekly | monthly | occasional
- **Device primario:** mobile | desktop | tablet | mixed
- **Canal de soporte preferido:** in-app | email | phone | self-service docs
- **Idioma / locale:** es-MX (o el que el brief defina)

### Pain points

- {{pain point 1 — qué frustra hoy a este persona en su workflow actual}}
- {{pain point 2}}

### Sensibilidad operativa

{{Señal para UX defensiva. Ejemplos:

- "Maneja dinero del cliente — todo cambio requiere confirmación explícita"
- "Trabaja bajo presión (call center) — UI debe priorizar speed sobre exploración"
- "Decisiones reversibles → undo accesible; decisiones irreversibles → confirmación dura"
- "N/A — bajo riesgo operativo" si no aplica}}

### Refs upstream

- Brief §2: {{ref al persona en brief}}
- Deep-dive Users: {{features donde aparece este persona}}

---

## PER-002 — ...

(repetir shape per persona)

---

## Completeness Gate

| Check                                                                   | Result      |
| ----------------------------------------------------------------------- | ----------- |
| PER coverage: todos los roles de `01_FREEZE_MAP §Personas` tienen entry | PASS / FAIL |
| JTBD declarado por persona (Jobs To Be Done)                            | PASS / FAIL |
| Access context completo (qué entities, qué scope) per persona           | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions |
| ------------ | ------------------------------- | ------------------ |
| `/design`    | `ready` / `partial` / `blocked` | —                  |
| `/backlog`   | (idem)                          |                    |
| `/implement` | (idem)                          |                    |

### Notes

{{Si status=partial: enumerar qué DECISION/SPIKE desbloquea cada consumer. Si status=ready en todos: dejar vacío.}}

---

_TimeKast Factory — tk-discovery template · 02_PERSONAS_
