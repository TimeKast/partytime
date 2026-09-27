# Cross-File Reconciliation — {{project_slug}}

> **Produced by:** main orchestrator (Phase 1.2.5 of `/discovery`) post-concat de `explore-pass.md` cuando `N(source files) >= 2`.
> **Consumed by:** `dsc-freeze-map-extractor` (Phase 2) como input adicional al producir el freeze map.
> **Lifecycle:** audit-only — archivado a `project/discovery-artifacts/_audit/cross-file-reconciliation.md` en Phase 8 close.

**Run date:** {{YYYY-MM-DD}}
**Source files reconciliados:** {{N}} files
**Source pairs analyzed:** {{N(N-1)/2}} pairs

---

## Contradictions detected

<!-- Pares (file A vs file B) donde una claim contradice a otra.
     Citar literal cada lado. Proponer resolución específica (no "resolver con user" genérico). -->

| #   | File A claim                            | File B claim                            | Propuesta de resolución                                                       |
| --- | --------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| C1  | `{{file-A.md §N}}` — "{{cita literal}}" | `{{file-B.md §M}}` — "{{cita literal}}" | {{Phase 3 batch #N / default firm A / default firm B / user decision needed}} |
| C2  | {{...}}                                 | {{...}}                                 | {{...}}                                                                       |

---

## Estilo-C drift (polished-vs-crudo)

<!-- Solo aplica si hay par crudo+polished en el source package.
     Detectar dónde el polished doc endurece o amplía claims relativas a sus notas crudas.
     3-5 puntos críticos por par. -->

### Par {{file-crudo.md}} ↔ {{file-polished.md}}

1. {{Punto donde polished endurece: claim X en polished aparece como "decisión firme" pero en crudo era "tentativo / quizá"}}
2. {{Punto donde polished amplía: añade detalle Y que no aparece en crudo}}
3. {{Punto donde polished suprime: claim Z visible en crudo pero ausente en polished}}
4. {{...}}

**Default tratamiento:** preferir crudo cuando hay divergencia (polished pasó por capa lossy). Excepción: si stakeholder confirma explícitamente el polished en Phase 3.

---

## Cross-file patterns

<!-- Patterns repetidos a través de múltiples files que sugieren decisión consolidada.
     Útil para Phase 2 firm extraction. -->

- **{{Pattern 1}}** — aparece en `{{file-A.md §N}}`, `{{file-B.md §M}}`, `{{file-C.md §K}}`. Sugiere firm decision: {{decisión consolidada propuesta}}.
- **{{Pattern 2}}** — {{...}}

---

## Tensions flagged (no resueltas)

<!-- Tensiones que `dsc-intake-analyst` flaggeó como hints intra-file pero NO resolvió
     (cross-file está fuera de su scope). Orchestrator las consolida aquí. -->

| #   | Tensión         | File(s)       | Acción downstream                                  |
| --- | --------------- | ------------- | -------------------------------------------------- |
| T1  | {{descripción}} | `{{file.md}}` | {{Phase 3 question / Phase 4 deep-dive sub-ronda}} |

---

## Notes for `dsc-freeze-map-extractor` (Phase 2 consumer)

<!-- Anchors útiles para que el extractor priorice contradictions ya detectadas
     y evite re-detectar lo que ya está acá. -->

1. {{nota 1: ej "C1 ya tiene propuesta default firm — no escalar a Phase 3"}}
2. {{nota 2: ej "Estilo-C drift en par X-Y sugiere confidence_drop=true para todo el SoT"}}
3. {{...}}

---

_TimeKast Factory — Cross-File Reconciliation (tk-discovery Phase 1.2.5 · audit-only)_
