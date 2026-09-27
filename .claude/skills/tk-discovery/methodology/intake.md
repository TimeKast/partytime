# Methodology — Intake (bulk attachments, modes, schemas, reconciliation, invalidation)

> Sub-file of `tk-discovery/methodology/`. See parent `methodology.md` for the full index.
> Topical scope: how the source package is ingested (Phase 1) — bulk rules, media-type strategies, mode classification, per-file schema, cross-file reconciliation appendix, and cross-phase invalidation handling.

---

## §1 — Default intake drop location (`project/intake/`)

`project/intake/` es la carpeta canónica donde se dumpean las **fuentes iniciales** de un proyecto (transcripts, PDFs, screenshots, Excels, apuntes) **antes** de correr `/discovery`. Es un drop location estructural que viaja con el kit a los proyectos derivados (marcado con `.gitkeep`), de modo que un equipo que clona el template ya tiene dónde tirar el material sin crear la carpeta a mano.

**Contrato:**

- 🔴 **Document Gate (lo PRIMERO, SIEMPRE):** antes que nada `/discovery` escanea `project/intake/` y **STOP**: si hay documentos → confirma ("detecté estos, ¿es todo o subes más?"); si está vacío → pide subirlos. Recién tras la respuesta decide el modo. El sesgo es **hacia con documentos** porque es mucho más preciso (deriva de fuentes vs inferir en la entrevista). 🗣️ Al user se le dice **"modo con documentos"** / **"modo sin documentos"** — nunca "desde cero" (internamente el modo sin documentos es D0). Detalle del gate: `SKILL.md` Phase 1.0.1.
- **Scan automático:** `/discovery` escanea `project/intake/` en Phase 0 (mode detection) + Phase 1 (intake). No requiere que el user pegue paths — la presencia de archivos satisface el gate y entra a D1 directo.
- **Complementa, no reemplaza:** los paths que el user provea explícitamente se suman a `project/intake/` (fuentes que viven en otro repo/carpeta). El intake nunca es excluyente.
- ⚠️ **Datos del cliente:** lo que cae en `project/intake/` (transcripts, PDFs, hojas con nombres, montos o datos personales) queda **en el historial de git** del derivado. Antes de dumpear, el equipo decide si ese material puede vivir en el repo o se procesa desde una ruta fuera de él (los paths explícitos siguen entrando al intake) — el workflow no lo decide por nadie.
- **Contenido versionado:** el material dumpeado se trackea en git (igual que `project/backlog/`), no se gitignora — preserva trazabilidad de qué input produjo qué brief. La carpeta nunca queda vacía en git porque el `.gitkeep` siempre la marca.
- **Reglas de procesamiento:** una vez ubicadas las fuentes (de intake o de paths), aplican §2 (bulk attachments — procesar TODO) y §2.1 (media-type strategies). El drop location define *dónde se buscan*, no *cómo se procesan*.

> 🔴 No silent sampling: si `project/intake/` trae 40 screenshots, se procesan los 40 (§2). El scan default no cambia esa regla — solo elimina el paso manual de pegar paths.

---

## §2 — Bulk Attachments Rule

🔴 **NUNCA** silent sampling. Si el user trae 40 screenshots o 6 Excels, procesar **TODOS**.

Opciones válidas cuando el volumen es extremo:

- **Particionado explícito:** declarar en texto "procesando batch 1 de 3 (items 1-15)"
- **Paralelización:** delegar a `dsc-intake-analyst` con batching determinístico (ver §2.1 + SKILL.md Phase 1)
- **Priorización por relevancia declarada:** "procesando primero los 10 marcados como críticos, después el resto"

Lo que **NO** es válido:

- Procesar 6 de 40 y seguir como si fuera completo
- Asumir representatividad de una muestra sin declararlo
- Saltarse attachments "porque parecen similares"

Si por límite real se omite algo, DECLARAR qué y por qué.

### §2.1 — Intake Strategies by Media-Type

**Doctrina:** implementar solo strategies para media-types con ≥1 caso real. Los tipos novel se **bifurcan por legibilidad, no por extensión**: **binario / necesita herramienta** (scan, encoding roto, unknown-no-texto) → `intake-drift` ticket + continue (Tier 2); **texto plano ya legible sin strategy dedicada** → **Tier 1-fallback** (extrae ya, no drift — ver abajo). Promoción de un fallback recurrente a strategy dedicada de Tier 1 es decisión manual del Factory maintainer (harvest process, fuera de scope de este methodology).

#### Tier 1 — Strategies implementadas ahora

| Type                                | Extension / detector                                              | Strategy                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured text                     | `.md` con headings/tables/lists                                   | 4-dim detector (`methodology/source-classification.md` §1.1)                                                                                                                                                                                                                          |
| Transcript conversational           | `.md` / `.txt` de Fathom / Fireflies (timestamps + speaker attr.) | Conversational parser: attribute decisions to speakers; detect "acordamos", "let's go with", "pendiente", "quedó pending"                                                                                                                                                             |
| Visual (UI / diagrams / whiteboard) | `.jpg` / `.jpeg` / `.png`                                         | Multimodal review per-image: visual description, UI elements, semantic grouping, UX patterns. **Review all del batch.** Batching determinístico — ver SKILL.md Phase 1 batch planning.                                                                                                |
| Tabular text                        | `.csv` (text-extractable)                                         | Parse headers + first 5 data rows per section. Column schema → `Extracted decisions`. Data ranges + section structure (subtotals, grand totals) → `Context`. Classify file as `Attachment` per source-classification §2. Multi-section reports: detect by blank rows + reset headers. Si el `.csv` es companion de un `.xlsx`, las imágenes embebidas del `.xlsx` las cubre el sub-paso de abajo — el `.csv` nunca puede traerlas. |

#### Tier 2 — Types sin strategy detallada (drift-ticket-ready)

Cuando `dsc-intake-analyst` detecta cualquiera de estos, emite `intake-drift` ticket + continúa con `[MEDIA-PENDING-STRATEGY]` en report. Pipeline NO se detiene; field correspondiente queda `[OQ]`.

| Type              | Detector                                     | Suggestion en ticket                                                                                                                                                             |
| ----------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.docx`           | Extension match                              | "treat as structured text if text extraction available"                                                                                                                          |
| `.pdf` text-layer | Extension + heuristic "has extractable text" | "pdftotext + apply 4-dim detector"                                                                                                                                               |
| `.pdf` scan       | Extension + heuristic "no text layer"        | "OCR required; do not hallucinate"                                                                                                                                               |
| `.xlsx`           | Extension match                              | "if `.csv` companion same stem exists → informational only (no info loss); else flag for human export to CSV before intake (long-term: ssconvert pre-processing or xlsx parser)" |
| Unknown           | Extension no match + magic bytes no match    | "human triage"                                                                                                                                                                   |

#### Sub-paso opcional — imágenes embebidas en `.xlsx`

> Las celdas se leen por el companion `.csv` (Tier 1 "Tabular text") o quedan en triage (fila `.xlsx` de arriba); las **imágenes** pegadas en la hoja no viven en ninguna celda y ningún camino anterior las ve. Este sub-paso las inventaría. **Opcional:** un run que no lo aplica no bloquea el intake del resto del archivo.

**Gate por extensión:** solo `.xlsx` (contenedor OOXML = ZIP). Nunca `.csv` (texto plano, no embebe medios) ni `.xls` (binario legacy, no es ZIP → sigue en Tier 2). Aplica exista o no el companion `.csv`: ese es justo el caso donde hoy las imágenes se pierden.

**Mecanismo** (formato OOXML documentado, con las tools de siempre — `unzip -l` / `unzip -p`, sin script del kit):

1. `unzip -l {file}.xlsx` → ¿hay entradas `xl/media/*`? **No** → fin del sub-paso, reporte idéntico al de hoy (sin ticket, sin `[OQ]`, sin línea extra).
2. Hoja → drawing: `xl/worksheets/_rels/sheetN.xml.rels` apunta a `xl/drawings/drawingN.xml`.
3. Drawing → imagen: cada ancla (`oneCellAnchor` / `twoCellAnchor`) trae `<from><row>` (**0-based** → fila visible = valor + 1) y un `r:embed="rIdN"` que `xl/drawings/_rels/drawingN.xml.rels` resuelve a `xl/media/imageN.*`. El prefijo `xdr:` puede venir o no (namespace default) — leer por nombre de elemento, no por prefijo.
4. Extraer cada imagen (`unzip -p … xl/media/imageN.png`) y describirla con la strategy **Visual** de Tier 1 (multimodal review per-image). Todas — Bulk Attachments Rule (§2), nunca muestrear.

**Edge cases:**

- Imagen sin fila resoluble (`absoluteAnchor`, drawing huérfano, o medio en `xl/media/` que ningún drawing referencia — p. ej. imágenes "en celda" de Excel 365, que viven en `xl/richData/`) → se inventaría igual, marcada `fila: desconocida`. Nunca se omite en silencio.
- ZIP inválido / encoding roto → `[CORRUPT-FILE]` (§10) y el intake sigue con el resto del archivo; el sub-paso no lanza error.

#### Tier 1-fallback — texto plano legible sin strategy dedicada

> Llena el **seam** entre Tier 1 y Tier 2: un archivo puede **no** matchear ninguna strategy de Tier 1 y aún así **no** pertenecer a Tier 2. Tier 2 es para lo que necesita herramienta o triage humano (OCR, binario, encoding roto); **no** para texto que ya se lee limpio. Regla general — evita enumerar una fila por cada extensión novel.

**Trigger objetivo:** extensión sin match en la tabla Tier 1 **Y** el archivo es texto plano legible (magic bytes = texto, `Read` devuelve contenido limpio sin OCR ni encoding cuestionable). Observados: `.yml`/`.yaml` de config declarativa, `.sh` comentado. Candidatos plausibles: `.toml`, `.env.example`.

**Tratamiento:**

- 🔴 **NO** degradar a Tier 2 ni marcar el field como `[OQ]` — es pérdida de info sobre contenido 100% extraíble.
- 🔴 **NO** emite `intake-drift` ticket — el fallback ya resuelve la extracción; no hay gap accionable que escalar.
- Extraer best-effort con el detector de texto estructurado (`source-classification.md §1.1`, dims A-D), con dos ajustes de peso:
  - Clasificar el file como **Reference** por defecto en la jerarquía de fuentes (`source-classification.md §1`) — config e infra-as-code informan arquitectura y constraints — **nunca SoT**; reservar **Context** solo para background sin señal arquitectónica (ej. un `.sh` de utilería trivial sin decisión implícita). No fijan decisiones de producto firmes.
  - Comentarios con intención explícita (`# por qué X`) → contexto citable, **no** `Firm Decision` de producto.
- En el schema §10, `Media-type detected` marca el estado `Tier 1-fallback` (extraído, no bloqueado).

🔴 El discriminador es **¿se lee limpio ya?**, no la extensión. Binario / scan / encoding roto / unknown-no-texto → siguen en Tier 2 (drift + `[OQ]`).

#### Escalation rule

Si count de `intake-drift` tickets en un single run **≥3** → main orchestrator surface summary al user al cierre de Phase 1 (antes de CP1):

```
⚠️ Phase 1 cerrada con {N} intake-drift tickets emitidos:
  - {path-1} → type={T1}
  - ...
¿Revisar tickets antes de Phase 2, o continuar con drift async?
```

---

## §6 — Modos D0 / D1 / D2

Tres modos según input quality:

| Modo | Input                      | Estrategia                                | Mínimo preguntas                                 |
| ---- | -------------------------- | ----------------------------------------- | ------------------------------------------------ |
| D0   | Desde cero (idea sin docs) | Full Socratic interview                   | No aplica — es la interview                      |
| D1   | Con docs existentes        | Parse → tag → freeze → solo gaps genuinos | `max(3, 🟡 sections + contradictions)` — NUNCA 0 |
| D2   | Validar brief existente    | Load → verify → drift report              | Según drift detectado                            |

Regla D1: "0 preguntas nunca es válido". Input rico = **mejores** preguntas, no menos preguntas.

---

## §7 — Reconciliation Appendix A — mechanics

El Appendix A del brief es un checklist **mecánico** post-prosa. No agrega contenido, verifica consistencia cruzada.

### A.1 Entidades Registradas

Para CADA entidad mencionada en la prosa, una fila:

| # | Entidad | Aparece en §4.1 | Feature relacionada §3.1 | Pantalla §7.2 | Regla §6 |

Si una entidad aparece en §3 Features pero NO en §4 Modelo de Datos → **gap detectado**.

### A.2 Pantallas Registradas

Para CADA pantalla mencionada en la prosa, una fila:

| # | Pantalla | §7.2 | Entidades que muestra | Roles que acceden |

Si una pantalla no tiene entidades ni roles → **gap detectado**.

### A.3 Features Cross-Map

Para CADA feature, una fila completa:

| Feature | Entidades afectadas | Pantallas involucradas | Reglas de negocio aplicables |

Si una feature carece de una de las 3 columnas → spec incompleto.

### Por qué es mecánico y no contenido

- La prosa §1-§11 es **fuente de verdad**.
- Appendix A es el **índice verificable** construido mecánicamente desde la prosa.
- Nadie edita Appendix A directamente — se regenera del contenido.
- Si la prosa dice "feature usa entidad X" pero Appendix A no lo refleja → bug en el generador (re-correr, no editar manual).

---

## §10 — Intake Explore Schema

Shape del reporte estructurado que `dsc-intake-analyst` produce por-file.

**Principio:** raw extraction per-file, no consolidación. Main orchestrator traduce "extracted" → firm / inferred / contradicted al armar el Freeze Map (`methodology/freeze-map.md` §3) cross-file. Los buckets aquí se llaman deliberadamente distinto al Freeze Map para evitar confusión entre raw source extraction y consolidación post-cross-file.

```markdown
## File: {path}

### Media-type detected

{ext} + {magic-bytes-hint} → {strategy-applied} (Tier 1 | Tier 1-fallback | Tier 2-drift)

### Classification (source hierarchy)

SoT / Reference / Legacy / Attachment / Context

### Extracted decisions (claims made in this file)

- {claim} (fuente: §X del doc)
- Imagen embebida `xl/media/{imageN}` — hoja {sheet}, fila {N | desconocida}: {descripción multimodal} (solo `.xlsx` con medios — §2.1 sub-paso opcional)

### Extracted questions (gaps in this file)

- {question} (owner hint: Cliente / TimeKast / TBD)

### Intra-file tensions (same file, contradictory statements)

- {tensión} (cita A vs cita B del mismo doc)

> Cross-file contradictions NO van aquí — las detecta el main orchestrator al consolidar Freeze Map.

### Implicit claims (Fix #1 dim C — bullet patterns)

- Firm-candidate: {bullet + cita + ruta}
- Question-candidate: {bullet + qualifier}
- MoSCoW-candidate: {phase → priority}

### Standard-field gaps (Fix #1 dim D)

- {campo faltante: stakeholder / deadline / north_star / success_metric / user_roles / problema}

### Transcription notes

- Verbatim → Transcription notes en `project/discovery-artifacts/explore-pass/{batch_id}-{slug}.md` §{N}
- Summarized → {reason}
- Inferred → [INFERRED] markers

### Escalations (factory-tickets emitted from this file)

- [MEDIA-PENDING-STRATEGY]: {path} → ticket at project/factory/intake-drift-{YYYY-MM-DD}-{slug}.md
- [MEDIA-SCAN-NO-OCR]: {path} → same
- [UNKNOWN-MEDIA-TYPE]: {path} → same
- [CORRUPT-FILE]: {path}
```

### Concurrency contract

Each agent writes to own `project/discovery-artifacts/explore-pass/{NN}-{slug}.md`. Main orchestrator concatena post-Phase-1 → `project/discovery-artifacts/explore-pass.md`. No locks required.

### Consolidation mapping (main orchestrator, Phase 2 → Phase 3)

| Explore bucket (per-file, raw) | Freeze Map bucket (cross-file, consolidated)                               |
| ------------------------------ | -------------------------------------------------------------------------- |
| Extracted decisions            | Firm Decisions (coincide cross-file) / Inferred Decisions (solo 1 file)    |
| Extracted questions            | Open Questions                                                             |
| Intra-file tensions            | Tensions (extended con cross-file tensions detectadas por el orchestrator) |
| Standard-field gaps            | Phase 1 follow-up questions / Open Questions if unresolved                 |

---

## §16 — Invalidation handling cross-phase

Cuando una resolution downstream contradice un Firm upstream (ej: Phase 4 Tier L sub-ronda revela Firm F-N de Phase 2 era incorrecto):

### Detección objetiva

Re-read del Firm citado vs nueva resolution. Si contradicen literal → invalidation confirmed. **No juicio**, solo string comparison de la claim literal.

### Prompt al user (nunca automático)

```
⚠️ Contradicción detectada entre Firm F{N} (Phase 2) y resolution en Phase {X}.

F{N}: {quote}
Phase {X} reveals: {evidence}

Opciones:
1. Backtrack → regresar a Phase 2, update Firm F{N}, re-run Phase 3-{X} con cambios
2. Override → mantener Firm F{N}, documentar dissent en §Drift Report del brief
3. Resolve now → proponer nueva Firm F{N}', re-run solo Phase {X} con contexto actualizado
```

User decide. Orchestrator ejecuta según la opción.

### Cascade rule

Si invalidation aprobada (opción 1 o 3) afecta otros Firms dependientes → orchestrator los re-evalúa y surface cada uno como mini-prompt antes de re-correr. NO auto-cascade silencioso.

---

_TimeKast Factory — Discovery methodology / intake (sub-file)_
