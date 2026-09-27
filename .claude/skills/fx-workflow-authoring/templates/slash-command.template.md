---
description: { { One-line EN description visible en autocompletion — ≤120 chars, trigger surface } }
argument-hint: '{{[mode-A|mode-B|mode-C]}}'
---

# /{{command-name}}

{{1-2 oraciones de qué entrega el workflow + dónde}}

**Argumento:** `$ARGUMENTS` — `{{mode-A}}` ({{descripción}}) / `{{mode-B}}` / `{{mode-C}}`. Si está vacío, el agente pregunta el modo en Phase 0.

<!--
  ===== Modes detection =====
  - Sin prefijo (`nuevo`, `con-docs`, `validar`) → modo principal
  - Con `--` prefix (`--next`, `--plan`) → comportamiento secundario
  - `verbose=true` → activa CP verbose mode
-->

---

## Instrucciones al agente

1. **Invocar skill `tk-{{name}}`** — leer `.claude/skills/tk-{{name}}/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS`:
   - `{{mode-A}}` / `{{mode-B}}` / `{{mode-C}}` → modo explícito, saltar pregunta en Phase 0.
   - (vacío) → Phase 0 pregunta el modo.
3. **Crear TodoWrite** con N fases (Phase 0 → Phase N) desde el inicio del Turn 1.
4. Ejecutar fases respetando **turn boundaries** declarados en SKILL.md.
5. Respetar los checkpoints definidos en `tk-{{name}}/SKILL.md`. El wrapper NO redefine semántica de checkpoints — cuál mecanismo usa cada CP (inline, Plan Mode, gate-de-otro-tipo) es decisión del skill, no del wrapper.
6. No ejecutar de memoria. No saltar fases. No listar sub-pasos de fases futuras.

---

## Flujo en la pipeline

```
{{/prev-command}} → /{{command-name}} → {{/next-command}}
```

<!--
  ===== Reglas para el wrapper =====
  - Wrapper NO duplica fases del skill (eso vive en SKILL.md, no aquí).
  - Wrapper NO contradice checkpoints del skill.
  - Wrapper NO redefine semantics.
  - El conteo de líneas es guideline (~30-40 típicamente), no constraint hard.
-->

---

_TimeKast Factory — /{{command-name}} thin wrapper_
