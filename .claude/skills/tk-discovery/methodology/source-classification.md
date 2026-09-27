# Methodology — Source Classification

> Sub-file of `tk-discovery/methodology/`. See parent `methodology.md` for the full index.
> Topical scope: how each input document is classified before it is processed. Determines treatment downstream.

---

## §1 — Source Classification taxonomy

Cada documento de input se clasifica **antes** de procesarlo. La clasificación determina cómo se trata.

### §1.1 — Ingesta del SoT: 4 dimensiones

No existe un único shape de source package. La ingesta debe manejar al menos 3 estilos observados y prepararse para más:

- **Estilo A (tagged):** docs pre-procesados con `[DECISIÓN FIRME]` / `[SPEC]` / `[PREGUNTA ABIERTA]` explícitos.
- **Estilo B (bullet-dense):** product docs sin tags, bullets cortos, decisiones implícitas por yuxtaposición (típicamente ~150 LOC).
- **Estilo C (polished-by-LLM):** material crudo reescrito por un LLM previo al discovery — mezcla notas + directivas + placeholders. Ya pasó una capa de lossy compression.

La ingesta aplica **4 dimensiones en orden**:

**A. Tamaño total del SoT.** Sumar LOC de todos los docs SoT clasificados.

- `<500 LOC total` → transcribir **wholesale** al scratchpad per-batch `project/discovery-artifacts/explore-pass/{batch_id}-{slug}.md` (sección Transcription notes del schema en `methodology/intake.md` §10). En docs pequeños, cualquier resumen es pérdida pura — el doc entero ES la spec.
- `≥500 LOC total` → aplicar (B) por sección.

**B. Densidad estructural por sección.** Transcribir verbatim al scratchpad cualquier sección que cumpla **al menos una**:

1. Marcador explícito: `[DECISIÓN FIRME]`, `[SPEC]`, `[DECIDIDO]`.
2. `≥50 LOC` **Y** subsecciones numeradas (ej: §3.4.1, §3.4.2, …).
3. Tabla densa (≥5 filas con valores concretos) o lista de reglas/invariantes.
4. Nombre de sección con peso "spec" — regex sobre heading: `business rules|reglas de negocio|scoring|state machine|invariants|decisions|modelo de datos|lockdown|formatos|algoritmos|pricing|roles`.

Secciones que NO cumplen ninguna → resumir a bullets (comportamiento default). Resumir una sección que sí cumple = **workflow error** (drift silencioso al synthesis).

**C. Extractor de decisiones implícitas.** Aplica a todo SoT independiente de (A/B). Para cada bullet o celda de tabla:

| Patrón                                                                                                  | Interpretación                                           |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Bullet con valor concreto **sin** qualifier                                                             | Candidato a **Firm Decision**, fuente = `{doc}:§{N}`     |
| Bullet con qualifier ambiguo (`o`, `/`, `tentativo`, `TBD`, `por definir`, `pendiente`, `posiblemente`) | Candidato a **Open Question**                            |
| Lista numerada `Fase 1/2/3`, `v1/v2/v3`, `MVP/Post-MVP/Futuro`                                          | **MoSCoW implícito** — MVP / v2 / Futuro respectivamente |
| "Incluye [valor concreto]" en sección de scope/MVP                                                      | Firm inclusion en MVP                                    |
| "No incluye [X]", "Excluye", "Post-MVP"                                                                 | Firm exclusion                                           |

Ejemplo: `"Soporte MXN, USD, EUR"` → Firm (lista cerrada); `"Backend: Node.js o Python"` → OQ (alternativa no resuelta); `"Fase 1: Feature básica, Versiones, Secciones"` → Firm MVP inclusion.

**D. Standard-field presence check.** Checklist obligatorio de campos canónicos que el SoT **debe** cubrir. Búsqueda semántica (no keyword-exact). Si el SoT no cubre un campo → auto-añadir al Phase 1 intake batch (no tratar como "sin info silenciosa"):

| Campo                             | Señal de presencia                                                         |
| --------------------------------- | -------------------------------------------------------------------------- |
| Stakeholder (decisor con nombre)  | Persona nombrada con rol `PO`, `Founder`, `Product`, `Director`, etc.      |
| Team members (ejecutores con rol) | Roles técnicos nombrados con personas                                      |
| Deadline                          | Fecha explícita o marcador temporal ("antes de Q2", "para el mundial")     |
| North Star / métrica de éxito     | Outcome declarado ("correr X sin fricción", "Y% conversión", "Z usuarios") |
| User roles                        | Lista de roles que usan el sistema                                         |
| Problema explícito                | Frase que declare el dolor que se resuelve                                 |

### §1.2 — Tripwire para Estilo C (polished-by-LLM)

En Phase 1 intake, el agente debe preguntar: _¿el material es crudo o ya pasó por un LLM que lo reestructuró?_ Si pasó por LLM:

- El doc puede tener **decisiones fabricadas** que no venían de las notas crudas — un LLM "polishing" puede promover hipótesis a decisiones firmes sin querer.
- Pedir las **notas crudas** si existen. Procesarlas en paralelo al polished, detectar divergencias.
- Si no hay notas crudas → marcar todo el SoT con `confidence_drop=true`, aumentar peso de Phase 3 gap interview para validar firm decisions antes de aceptarlas como tal.

### §1.3 — Output al scratchpad

El output de la ingesta (dimensiones A-D) se persiste en dos pasos:

1. **Per-batch (cada `dsc-intake-analyst`):** cada subprocess escribe a `project/discovery-artifacts/explore-pass/{batch_id}-{slug}.md` siguiendo el schema canónico en `methodology/intake.md §10`. Shape detallado en `templates/explore-pass.template.md`.
2. **Consolidated (orchestrator post-Phase-1.2.4):** main orchestrator concatena los outputs per-batch en `project/discovery-artifacts/explore-pass.md` (single consolidated file). Este es el input que consume `dsc-freeze-map-extractor` en Phase 2 + el orchestrator usa para cross-file reconciliation (Phase 1.2.5) cuando `N(source files) >= 2`.

Las dimensiones A-D del extractor (transcriptions wholesale, section-level, implicit decisions, standard-field gaps) viven dentro del schema per-file de `methodology/intake.md §10` — no requieren un archivo `source-specs.md` separado.

Este artefacto alimenta Phase 6 Synthesis y Phase 7 Challenge Pass sin re-sintetizar el source.

| Clasificación             | Significado                                     | Tratamiento                                      | Ejemplos                                |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| **SoT** (Source of Truth) | Documento primario, decisiones son finales      | Extraer y **freeze** las decisiones              | Contrato cliente, brief firmado, MRD    |
| **Reference**             | Soporta pero NO sobreescribe el SoT             | Extraer insights, deferir al SoT en conflictos   | User research, análisis competencia     |
| **Legacy**                | Versión previa / codebase previo, contexto only | Extraer lecciones y anti-patterns, NO reproducir | App v1 que se reemplaza, docs antiguos  |
| **Attachment**            | Screenshots, Excels, reportes, procedimientos   | Procesar TODO — nunca silent sampling            | 40 screenshots de dashboard legacy      |
| **Context**               | Background, conocimiento de industria           | Enriquecer, NUNCA usar como decisión             | Wikipedia, artículos, general knowledge |

### Source Hierarchy (en conflicto, quién gana)

```
SoT  >  Reference  >  Legacy  >  Context
Attachment puede ser cualquiera — clasificar individualmente
```

---

_TimeKast Factory — Discovery methodology / source classification (sub-file)_
