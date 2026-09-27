---
name: {{prefix}}-{{name}}
description: {{Phase-N purpose for /{{command}}. What it processes, what it produces, where it writes. Single-line EN, ≤300 chars.}}
tools: Read, Grep, Glob{{, Write si writer/extractor}}{{, Bash si ejecuta comandos}}
model: {{opus | sonnet | haiku}} # alias DECIDIDO por verificabilidad (§8). No hay default: `inherit` solo si la herencia es deliberada y está escrita
---

# {{prefix}}-{{name}} — {{Phase N}} {{purpose}}

<!--
  ===== Tools allowlist (REQUIRED in frontmatter) =====
  Default sugerido: read-only `Read, Grep, Glob`.
  Agregar `Write` SOLO si el contract del subprocess exige persistir un artifact directo
    (caso: writers, extractors, scaffolders).
  Agregar `Bash` SOLO si el subprocess ejecuta comandos (caso: test runners, validators).
  Auditors / reviewers (PO, planner, security-auditor) NO necesitan `Write` — retornan findings inline.

  ===== Skill grounding (CC.md §2) =====
  Si el dominio del subprocess matchea ≥1 skill del kit, citar paths repo-relative
  en la sección "Skill grounding" abajo. Subprocesses NO reciben listing por description injection.
-->

## Mandate

{{1-2 oraciones describiendo qué hace el subprocess. Verbo de acción (clasifica / extrae / produce / valida / mapea / detecta). Output esperado.}}

> **Cross-refs canónicos:**
>
> - {{Topic A}} → [`{{path-relative}} §{{N}}`]({{path-relative}})
> - {{Topic B}} → [`{{path-relative}} §{{N}}`]({{path-relative}})
> - Template canónico → [`{{path-relative}}`]({{path-relative}})

---

## Skill grounding

<!-- OBLIGATORIO si el dominio del subprocess matchea skills del kit.
     Subprocesses NO reciben listing por description injection (CC.md §2).
     Citar paths repo-relative — paths absolutos no deben aparecer aquí. -->

Consulta antes de empezar:

- `.claude/skills/{{relevant-skill-1}}/SKILL.md` — {{razón}}
- `.claude/skills/{{relevant-skill-2}}/SKILL.md` — {{razón}}

---

## Input contract

El orchestrator invoca el subprocess con:

- **`{{param-1}}`** — {{descripción + tipo}}
- **`{{param-2}}`** — {{descripción}}
- **`output_path`** — `{{path-pre-calculado-por-orchestrator}}`
- **`{{project_slug or batch_id}}`** — {{para naming}}

**Garantía del orchestrator:** {{precondiciones que el orchestrator garantiza — ej: caps de batch, validación de inputs, etc.}}

---

## Processing loop

### 1. {{Step name}}

- {{acción}}
- {{validación}}

### 2. {{Step name}}

- {{...}}

<!-- Repetir steps numerados que cubren el flujo desde input → output. -->

---

## Output write

**Atomic Write** a `output_path` siguiendo {{shape declarado en cross-refs}}.

🔴 **NUNCA escribir a {{consolidated-path}}** (singular). Ese file lo genera el main orchestrator post-{{phase}} via concatenación de outputs de subprocesses paralelos.

🔴 **NUNCA retornar el output completo inline** como mensaje. Return summary corto solamente (siguiente sección).

---

## Return summary (returned to orchestrator)

Al finalizar, retornar al orchestrator un resumen corto (5-8 líneas máximo):

```
{{Subprocess id}} — {{batch_id or scope}}
{{Counter 1}}: {{N}}
{{Counter 2}}: {{N}}
{{Specific finding 1}}
Output: {{path}}
```

---

## Cuándo NO usar este subprocess

- {{Use case 1 que sería confuso}} → {{subprocess o handler correcto}}
- {{Use case 2}} → {{...}}
- {{Use case 3}} → {{...}}

<!-- Boundary enforcement. Cada subprocess debe listar 3-4 casos donde NO es responsable
     (previene mission creep, fuerza decomposition clara). -->

---

_{{prefix}}-{{name}} — {{Phase N}} {{purpose}} (`/{{command}}` workflow)_
