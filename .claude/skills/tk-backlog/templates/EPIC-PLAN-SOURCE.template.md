# {{EPIC-NN-slug}}: {{Nombre del epic}}

> **Status:** 📋 Backlog
> **Milestone:** {{v{X} | M{N} | sprint-{N} | milestone-{N}}}
> **Priority:** {{P0 | P1 | P2}}
> **Total Issues:** {{N}} ({{DOMAIN-NNN..DOMAIN-MMM}})
> **Story Points:** ~{{NN}}
> **UI Touching:** {{yes | no}}
> **Backlog UUID:** {{uuid}}
> **Source tier:** plan-mode
> **Plan source:** {{path/to/plan.md}}#{{section-anchor}}
> **Plan hash:** {{sha-256 first 12 chars}}

<!--
  Epic emitted by /backlog add <plan> or /backlog extend-epic EPIC-NN <plan>.
  Differs from EPIC.template.md in the blockquote header only:
   - `Backlog UUID` = v4 minted in Phase 3, stamped verbatim (backlog-central sync — BSYNC-007). NOT read by update-board.ts.
   - `Source tier: plan-mode` distinguishes from greenfield (discovery+design) epics.
   - `Plan source` anchors the origin file + section for drift detection (validar).
   - `Plan hash` is the SHA-256 of the plan file at parse time (first 12 chars).
  Body sections match EPIC.template.md (same Topology SSOT) PLUS the trailing `## Plan Review`
  placeholder — plan-mode only, filled by Phase 8. NEVER copy that section into EPIC.template.md.
-->

## Objetivo

{{Qué entrega el epic + por qué es una unidad cohesiva. Derived from plan ## Context + ## Approach (3-5 líneas plain language).}}

## Issues

<!-- Orchestrator fills post-Phase-4, en orden de número global (lee en orden de ejecución). -->

| Status | ID             | Título     | Effort | Depends on     | Par?  |
| ------ | -------------- | ---------- | ------ | -------------- | :---: |
| 📋     | {{DOMAIN-NNN}} | {{título}} | {{M}}  | {{—}}          | {{✓}} |
| 📋     | {{DOMAIN-NNN}} | {{título}} | {{S}}  | {{DOMAIN-NNN}} | {{}}  |

## Topology

<!-- SSOT de paralelismo. Per-issue `Parallelizable:` deriva de aquí (sweep enforced). -->

```yaml
parallelizable_issues: [{ { DOMAIN-NNN } }, { { DOMAIN-NNN } }]
sequential_chains:
  - [{ { DOMAIN-NNN } }, { { DOMAIN-NNN } }]
```

Invariante: `parallelizable_issues ∪ sequential_chains.flat() == {todos los issue IDs del epic}`.

```
{{ASCII/Mermaid topology graph opcional — no autoritativo, solo lectura humana}}
```

## Scope

**Incluido:** {{derived from plan ## Approach — concrete deliverables}}
**Excluido:** {{derived from plan ## Approach or explicit "no plan section covers X"}}

## Dependencias entre epics

- {{Depende de EPIC-NN porque ...}} | Ninguna.

## Implementation Evidence

_Pendiente._

## Plan Review (Phase 3.5 — {{ISO 8601 UTC}})

<!--
  Plan-mode only. La llena el orquestador en Phase 8 (sub-paso de "Finalize epic files" —
  SKILL.md §20) desde el manifest efímero, ANTES del rm -rf de artifacts y del git add del
  CP-commit. En `extend-epic` este template NO corre (el epic preexiste): Phase 8 APPENDEA
  esta misma sección con printf >> epic file, como QC Report/QC Delta. El timestamp del
  heading es el ancla que distingue estampados repetidos.
  🔴 NUNCA copiar este heading a EPIC.template.md (greenfield): Phase 3.4/3.5 son plan-mode
  only, y un heading vacío en un epic de discovery le diría a tk-implement §2.2 "aquí va lo
  ya resuelto". Shape SSOT: methodology/epic-shape.md §Plan Review append.
  Rendering (hard — SKILL.md §3/§3.1): `status` como palabra, nunca glyph · el estampador
  sanea todo check-glyph del texto copiado · `Claim` sin IDs de issue en crudo (los IDs
  viajan SOLO en `Cubre:`).
  El campo `Presupuesto:` del encabezado es OBLIGATORIO en plan-mode (methodology/epic-shape.md
  §Plan Review append): trae el nivel, la regla o señal que lo produjo con su origen, y las dos
  composiciones que compró. El consumidor lee su ausencia como cobertura NO declarada.
  Este canal es durable y su lector es /implement §2.2, no el usuario: conserva los IDs de
  sección y fase (§12.5, Phase 7). La línea homónima que CP1/CP2 narran va en lenguaje plano.
-->

> **Cubre:** {{DOMAIN-NNN, DOMAIN-NNN — los issues emitidos por este run}}
> **CP1:** {{N}} presentación(es)
> **Presupuesto:** {{riesgo N vía regla|señal (kit|proyecto) → §12.5: panel · Phase 7: panel}}

| Reviewer            | Clase                          | Claim                                    | Consulta corrida          | Status                        | Grounding                                          |
| ------------------- | ------------------------------ | ---------------------------------------- | ------------------------- | ----------------------------- | -------------------------------------------------- |
| {{architect}}       | {{rompe / está mal / decisión}} | {{qué afirmó el revisor — sin IDs en crudo}} | {{la consulta que corrió}} | {{live / resolved / dismissed}} | {{HECHO confirmado/refutado + consulta · sin grounding}} |
| {{revisor caído}}   | —                              | —                                        | —                         | failed                        | —                                                  |
| {{lente no convocada — reviewer (Phase 3.5\|7)}} | —          | —                                        | —                         | not-convened                  | —                                                  |

### Gate decisions

| Decisión                     | Resolución                     | Decomposition hash                 |
| ---------------------------- | ------------------------------ | ---------------------------------- |
| {{qué había que decidir}}    | {{qué resolvió el user en CP1}} | {{hash vigente al resolverse}}     |
