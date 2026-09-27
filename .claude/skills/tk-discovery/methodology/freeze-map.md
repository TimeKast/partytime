# Methodology — Freeze Map (5 buckets, confidence tags, completeness gate, HIGH findings)

> Sub-file of `tk-discovery/methodology/`. See parent `methodology.md` for the full index.
> Topical scope: schemas and rules for the Freeze Map artifact (Phase 2 output) — bucket structure, anti-drift rules, inline confidence tags, post-synthesis quantitative gate, and HIGH-finding classification from the Phase 7 Challenge Pass.

---

## §3 — Freeze Map schema

El Freeze Map es el artefacto central del discovery. Se persiste a `project/planning/01_FREEZE_MAP.md` al final de Phase 2.

> **Post-GR2 reconciliation:** Phase 6.2 reconcilia este artifact a la **bucket correcta** (Firm / OQ / Contradictions / Recommendations / Post-MVP) per outcome de cada resolution. NO siempre route a Firm Decisions — eso convertiría el bucket en dumping ground. Ver `SKILL.md §Phase 6.2 Impact map universal` para bucket-mapping table.

> **Doctrina Firm Decisions:** "Firm" = **current canonical con source + change_cost**, NO dogma. Un firm puede modificarse en Phase 7 (Challenge Pass GR2) si reviewers detectan que era prematuro, o reversirse en `/design`/`/backlog`/`/implement` vía DECISION-XXX/ADR-XXX con impact map + revalidation downstream. **NO se locks por paso de tiempo** — lo que aumenta con phases es `change_cost` (más artifacts a re-syntetizar), NO inmutabilidad. `change_cost: high` significa "cambio probable cuesta data migration" — NO "imposible cambiar". El agente NO defiende firms post-mortem; los actualiza cuando hay evidence nueva.

### Estructura (5 buckets)

```markdown
# Freeze Map — {{project}}

## Firm Decisions

| #   | Decisión                           | Fuente                | Change cost      |
| --- | ---------------------------------- | --------------------- | ---------------- |
| F1  | {decisión literal, NO parafrasear} | {doc §N o entrevista} | Low / Med / High |

## Open Questions

| #   | Pregunta   | Impacto           | Owner              |
| --- | ---------- | ----------------- | ------------------ |
| OQ1 | {pregunta} | Alto / Med / Bajo | Cliente / TimeKast |

## Contradictions

| #   | Doc A dice       | Doc B dice       | Qué hacer                                    |
| --- | ---------------- | ---------------- | -------------------------------------------- |
| C1  | {cita literal A} | {cita literal B} | {escalamiento / default / resolver con user} |

## Recommendations

| #   | Recomendación             | Fuente   |
| --- | ------------------------- | -------- |
| R1  | {recomendación declarada} | {doc §N} |

## Post-MVP / Future

| #   | Item   | Por qué no MVP                    |
| --- | ------ | --------------------------------- |
| PM1 | {item} | {razón explícita del stakeholder} |
```

### Campos obligatorios por bucket

- **Firm Decisions:** decisión literal (NO parafrasear) + fuente trazable + reversibilidad.
- **Open Questions:** pregunta concreta + impacto + owner.
- **Contradictions:** citas literales de ambas fuentes + acción a tomar.
- **Recommendations:** marcadas claramente como `[RECOMMENDED]`, NO confundir con firm.
- **Post-MVP:** razón explícita del stakeholder, NO inferencia del agent.

### 🔴 Anti-drift reglas durante extracción

1. **NUNCA** cambiar stakeholder, deadline, scope sin autorización explícita.
2. **NUNCA** convertir Recommendation → Firm sin confirmación.
3. **NUNCA** mergear entidades/conceptos del source package sin declararlo.
4. **NUNCA** llenar gaps con contenido plausible — marcar como `[INFERRED]` o `[OQ]`.
5. **NUNCA** tratar Reference/Legacy/Context como SoT.
6. **NUNCA** promover Post-MVP a MVP silenciosamente.

---

## §4 — Confidence Tags en la prosa

Cuando el brief se escribe (Phase 6 Synthesis), cada statement tiene un tag mental:

| Tag             | Significado                                | Aparición en el brief                                                                            |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `Confirmed`     | Explícito en source o confirmado por user  | Default — sin marker visual                                                                      |
| `Inferred`      | Deducción razonable del agent              | Prefijo `[INFERRED]` **obligatorio** inline en la oración/bullet. NO basta con tabla Assumptions |
| `Assumption`    | Gap-fill que podría ir para cualquier lado | Prefijo `[ASSUMPTION]` **obligatorio** inline + entry en §Assumptions                            |
| `Open Question` | Info insuficiente                          | Prefijo `[OQ]` **obligatorio** inline + entry en Open Questions                                  |

Si más de 5 items marcados `Confirmed` eran realmente `Inferred` → drift introducido. Revisar.

**Enforcement:** Phase 6 Synthesis debe emitir el brief con los 3 tags inline. Phase 7 gate (§8 abajo) valida que `count(inline [INFERRED|ASSUMPTION|OQ]) ≥ count(filas tablas Assumptions + OQs + §Drift Inferred)`. Si inline < tablas → re-sintetizar. La tabla Assumptions separada sin tags en prosa es insuficiente — reduce scan-readability y oculta drift.

---

## §8 — Quantitative completeness gate

Antes de cerrar el brief (Phase 6 post-synthesis), ejecutar el gate cuantitativo — tool **Grep** en modo count:

- `WIP_FT` — Grep (pattern: `FT-`, path: `project/planning/03_DEEP_DIVE.md`, output_mode: `count`)
- `BRIEF_FT` — Grep (pattern: `FT-`, path: `project/planning/00_DISCOVERY_BRIEF.md`, output_mode: `count`)

Fail si el Brief tiene <90% de los tokens `FT-` que el WIP (synthesis perdió features silenciosamente).

Mismo check para:

- `BR-` (business rules)
- Nombres de entidades (del §4.1)
- Nombres de pantallas (del §7.2)

Si cualquier count está <90% del WIP → **FAIL**. Re-sintetizar con énfasis en lo perdido.

### §8.1 — Confidence tag inline gate (extensión)

Counts inline en la prosa del brief — tool **Grep** (path: `project/planning/00_DISCOVERY_BRIEF.md`, output_mode: `count`):

- `INLINE_INFERRED` — pattern: `\[INFERRED\]`
- `INLINE_ASSUMPTION` — pattern: `\[ASSUMPTION\]`
- `INLINE_OQ` — pattern: `\[OQ\]`

Counts de filas en las tablas canónicas — extracción por sección + count es pipeline multi-paso (Bash legítimo, `CC.md §1.3`):

```bash
TABLE_ASSUMPTIONS=$(awk '/## Assumptions/,/^---$/' project/planning/00_DISCOVERY_BRIEF.md | grep -cE '^\| A[0-9]+')
TABLE_OQS=$(awk '/## Open Questions/,/^---$/' project/planning/00_DISCOVERY_BRIEF.md | grep -cE '^\| OQ[0-9]+|^\| Q[0-9]+|^\| PB[0-9]+')
```

Gate: inline count ≥ table count.

- Fail si `INLINE_ASSUMPTION < TABLE_ASSUMPTIONS` → hay assumptions en tabla sin tag en prosa (drift de scan-readability).
- Fail si `INLINE_OQ < TABLE_OQS` → hay OQs en tabla sin tag en prosa.

Si cualquier inline count < table count → **FAIL**. Re-sintetizar agregando los tags inline donde correspondan. La tabla es el índice; los tags inline son el enforcement de lecturabilidad — ambos son obligatorios.

---

## §15 — Classification de HIGH findings (Phase 7 Challenge Pass)

Cada HIGH finding de architect / product-owner / project-planner cae en una de dos buckets:

### (a) Stakeholder decisions (requieren Gap Round 2)

Findings donde la decisión depende del user/PO, no de implementation. Orchestrator compila estos en mini-Gap-Round-2 batch pre-CP2.

**Triggers típicos:**

- Product-owner flaggea "feature X no tiene user problem claro" → user valida in/out
- Product-owner flaggea "scope drift: decisión Y no pedida por stakeholder" → user confirma o overridea
- Architect surfacea "ADR decision preference (ej: 3-entity vs polymorphic)" → user elige shape
- Planner surfacea "descope strategy si velocity slip" → user aprueba orden de corte

### (b) Implementation decisions (documentar inline, sin user input)

Findings donde orchestrator/tech lead resuelve sin involucrar stakeholder:

- Architect flaggea ADR draft needed → `§8.7.1 ADRs pre-backlog` enumera con deadlines
- Planner flaggea test gate pre-Wave-N → documentar en §8.7 Descope Plan
- Architect flaggea unit test golden fixtures → pattern para `/implement`

### Regla de oro

CP2 es estrictamente "approve close". **Nunca** aprobar decisiones tácitas del bucket (a) — esas requieren Gap Round 2 explícito. Si user dice "apruebo" y adentro hay decisiones del bucket (a) no expuestas, workflow error.

---

_TimeKast Factory — Discovery methodology / freeze map (sub-file)_
