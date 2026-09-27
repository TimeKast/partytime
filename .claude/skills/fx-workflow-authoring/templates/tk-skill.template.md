---
name: tk-{{name}} # kebab-case, match directorio
description: { { 1-line EN trigger surface } } # EN-only, no enumeración wall-of-text
family: { { coding | documentation | factory-internal } }
model: { { opus | sonnet | haiku } } # opus default para workflows críticos
parallelism_unit: { { none | batch | pass } } # solo si aplica
concurrency_cap: 1 # pipeline workflows: siempre 1
merge_strategy: orchestrator-merge # si hay subprocess outputs a consolidar
auditor_step: { { true | false } } # true si Phase final activa quality-engineer
last-verified: { { YYYY-MM-DD } }
---

# {{workflow-name}} — {{One-line propósito del workflow}}

> **Propósito:** {{qué entrega el workflow + a quién}}
> **Architectural principle:** {{principio que guía decisions de diseño — ej: "info preservation > compaction"}}
> **Anterior:** {{`/{prev-command}` o "—" si entry point}}
> **Siguiente:** {{`/{next-command}`}}

<!--
  ===== INSTRUCCIONES PARA AUTORES =====
  Este template refleja las 11 secciones canónicas para un workflow heavy.
  Cada sección tiene un criterio de aplicabilidad: "aplica si workflow tiene X característica".
  Borrar las que no apliquen. NO forzar todas.

  Sin LOC limit — escribir lo que el contenido pida.
-->

---

## Tone guidance

<!-- APLICA si el workflow es conversacional con humano.
     Si es ejecución lineal sin diálogo, borrar esta sección. -->

- **Prosa antes que tabla.** Explica por qué importa antes de tirar la tabla.
- **Checkpoints conversacionales, no auditoría.** Abrir espacio, no forzar 1=sí/2=no inmediato.
- **Compact default, verbose opt-in.** CPs presentan 3-4 líneas críticas por default.
- **Explicar reasoning.** Si descartas opción, di por qué. Si flaggeas riesgo, di impacto concreto.

---

## 🔴 Anti-Drift Rules / Quality Rules

<!-- APLICA si el workflow tiene reglas no-negociables que pueden ser violadas silenciosamente.
     Si es un workflow simple, lift principios desde rules existentes. -->

1. **NUNCA** {{regla 1}}.
2. **NUNCA** {{regla 2}}.
3. **NUNCA** {{regla 3}}.

---

## Turn boundaries (contrato con el usuario)

<!-- APLICA si el workflow es multi-turn iterativo con humano.
     Si es ejecución silenciosa de un solo turn, borrar. -->

| Turn  | Fases que ejecuta | Cierra con            |
| ----- | ----------------- | --------------------- |
| **1** | {{fases}}         | {{checkpoint o STOP}} |
| **2** | {{fases}}         | {{checkpoint o STOP}} |

**Violaciones:** {{lista de turn-boundary violations comunes}}.

---

## TodoWrite obligatorio

<!-- APLICA si el workflow tiene 3+ fases con checkpoints.
     Si es ≤2 fases lineales, no necesario. -->

Al iniciar (Turn 1), crear TodoWrite con items para Phase 0-N + checkpoints. Un solo `in_progress` a la vez.

---

## Flow overview

<!-- APLICA si el workflow tiene 3+ fases.
     ASCII diagram corto que el agente puede visualizar de un vistazo. -->

```
Phase 0 ({{detect}}) → Phase 1 ({{intake}}) → 🛑 CP1
  → Phase 2 ({{...}}) → Phase 3 ({{...}}) → 🛑 CP2
  → Phase N ({{close}})
```

---

## Phase 0 — {{Nombre}}

**Propósito:** {{qué se logra}}.

**Acciones:**

1. {{acción 1}}
2. {{acción 2}}

---

## Phase 1 — {{Nombre}}

**Propósito:** {{...}}.

**Acciones:**

1. {{...}}

<!-- Repetir Phase N — Nombre por cada fase del workflow. -->

---

## 🛑 CHECKPOINT 1 — {{Nombre}}

<!-- CP1 = inline + STOP. Conversational review. Reversible. Verbose mode opt-in.
     Ver template `templates/checkpoint-inline.template.md`. -->

**Mecanismo:** presentar plan inline (compact) + STOP explícito. Esperar approval verbal del user.

```markdown
## 🛑 CP1 — {{Nombre del checkpoint}}

### Critical signals (top 3 max)

- {{signal 1 con impacto concreto}}
- {{signal 2}}
- {{signal 3}}

### Plan de continuación

{{1-2 oraciones describiendo Phase N+1..N+K}}

### Opciones

| #   | Acción                                     |
| --- | ------------------------------------------ |
| 1   | continuar a Phase {{N+1}}                  |
| 2   | ajustar {{X}} antes de continuar           |
| 3   | ahondar en {{Y-id}} (sub-ronda focalizada) |
```

> **Cómo se presentan** → [`fx-workflow-authoring §7.0`](../SKILL.md). Con `AskUserQuestion` disponible van estructuradas; sin la tool, esta tabla es la vía y se espera respuesta numérica. **Headless: ninguna de las dos** — el CP resuelve por su fail-open/fail-closed y **no intenta** la tool.

### 🔴 Regla de invalidación del intake

Si durante CP1 el user aporta info que invalida un paso anterior, regresar a la fase correspondiente ANTES de re-presentar plan.

---

## 🛑 CHECKPOINT 2 — {{Nombre}}

<!-- CP2 = Plan Mode formal. Synthesis multi-fuente crítica. HIGH risk.
     Ver template `templates/checkpoint-planmode.template.md`. -->

**Mecanismo:** **Plan Mode FORMAL obligatorio.** Orchestrator invoca Plan Mode entry, redacta synthesis estructurada, luego Plan Mode exit para approval.

> Pre-load nota: si las primitivas de Plan Mode son deferred en el runtime actual, el orchestrator debe cargarlas antes de CP2. El mecanismo concreto vive en docs del runtime.

---

## Archivos de output

<!-- APLICA si el workflow produce >1 artifact. Lifecycle 3-tier evita que downstream
     consuma artefactos audit-only o transitionals. -->

### Durable — consumed by downstream phases

| Path       | Lifecycle                          |
| ---------- | ---------------------------------- |
| `{{path}}` | **Durable** — {{quien lo consume}} |

### Audit-only — archived at workflow close

| Path                       | Lifecycle                                          |
| -------------------------- | -------------------------------------------------- |
| `{{path}}/_audit/{{file}}` | **Audit-only** — preservado para retroactive audit |

### Transitional — cleaned at workflow close

| Path       | Lifecycle                        |
| ---------- | -------------------------------- |
| `{{path}}` | **Transitional** — `rm` al close |

---

## Invalidation handling cross-phase

<!-- OBLIGATORIO si el workflow tiene checkpoints.
     Cada workflow debe declarar qué pasa si llega información nueva post-CP. -->

### {{Trigger 1}} — ej: source-arrival post-CP1

1. **Compute delta:** {{cómo medir el cambio}}
2. **Apply threshold-based decision:**
   - **`delta < threshold`** → {{patch incremental}}
   - **`delta >= threshold`** → STOP and prompt user with options

### {{Trigger 2}} — ej: firm-vs-resolution invalidation

Prompt al user (nunca automático):

```
⚠️ Contradicción detectada entre {{Firm A}} y {{resolution B}}.

Opciones:
1. Backtrack → {{...}}
2. Override → {{...}}
3. Resolve now → {{...}}
```

---

## Subprocess delegation summary

<!-- APLICA si el workflow tiene subprocesos propios.
     Resumen de qué se delega a quién, en qué fase, con qué paralelismo. -->

| Fase  | Subprocess            | Paralelismo       | Cuándo                |
| ----- | --------------------- | ----------------- | --------------------- |
| {{N}} | `{{prefix}}-{{name}}` | Paralelo / Serial | Siempre / Condicional |

**Subprocesses scoped a `/{{command}}` tienen prefix `{{prefix}}-*`** per convención de taxonomy.

---

_TimeKast Factory — {{workflow-name}} workflow ({{family}} family)_
