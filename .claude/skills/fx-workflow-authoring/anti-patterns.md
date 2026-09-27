# Anti-Patterns — lo que NO debe aparecer en un workflow CC-native

> Checklist defensivo. Revisar antes de commitear un workflow nuevo o refactor.
>
> **Cómo usar:** después de autorar/refactorizar un workflow `tk-*`, recorrer las 14 secciones de este archivo y correr los greps de `§14`. Si alguno falla → no commit hasta corregir.

---

## §1 — Runtime / execution

### ❌ Ejecutar fases sin Read del phase file en la sesión actual

```
❌ "Yo sé cómo se hace la Phase 3, voy a ejecutarla de memoria"
✅ Read del phase-3-*.md → ejecutar siguiendo las instrucciones leídas
```

**Por qué:** cada phase file contiene decisiones y detalles que la memoria del modelo degrada. CC.md §8 lo prohíbe explícitamente. Aplica también a SKILL.md monolíticos: leer la sección antes de ejecutarla.

### ❌ Listar sub-pasos numerados en el SKILL.md padre

```
❌ SKILL.md lista: "Phase 3.1 → Phase 3.2 → Phase 3.3 → Checkpoint"
✅ SKILL.md lista: "Phase 3 → CP1" — los sub-pasos viven DENTRO del phase file (o de la sección)
```

**Por qué:** si el padre enumera sub-pasos, el modelo los lee como un bloque y los ejecuta corridos, saltando checkpoints intermedios. Es el anti-pattern central de "saltarse el gate".

### ❌ Checkpoint sin opciones explícitas y excluyentes

```
❌ "¿Apruebas el plan?"
✅ AskUserQuestion — [continuar] [ajustar] [cancelar]      ← default interactivo
✅ "### Opciones: | 1 | continuar | 2 | ajustar | 3 | cancelar |"   ← fallback sin la tool
```

**Por qué:** texto libre produce respuestas ambiguas. Lo que el anti-pattern prohíbe es la **pregunta abierta**, no un formato concreto: las opciones tienen que ser explícitas y mutuamente excluyentes, y da igual si llegan como opciones estructuradas o como tabla numerada.

**Cuál usar** → [`SKILL.md §7.0`](SKILL.md). Resumen: con user y `AskUserQuestion` disponible, estructurada; con user y sin la tool, tabla numerada; **headless, ninguna de las dos** — el CP resuelve por su fail-open/fail-closed y **no intenta** la tool (sin usuario bloquea).

### ❌ "Probablemente el usuario quiere continuar"

```
❌ Auto-proceder en checkpoint porque la intención parece clara
✅ Esperar la elección real del user (§7.0)
```

**Por qué:** el checkpoint existe porque la intención NO está clara sin confirmación. Auto-proceder rompe el contrato del workflow.

---

## §2 — Estructura y archivos

### ❌ Duplicar funcionalidad ya cubierta por rules o CLAUDE.md

```
❌ Workflow re-declara CODING.md §3 (surgical changes)
✅ Workflow asume rules always-on; cita sección si refuerza ("ver CODING.md §3")
```

### ❌ Meter un workflow en rules

```
❌ .claude/rules/backlog-workflow.md con pasos ejecutables
✅ .claude/skills/tk-backlog/ con phase files; .claude/rules/ solo declara constraints
```

**Por qué:** rules son declarativas (always-on, constraints universales). Workflows son procedurales (secuencia + estado).

### ❌ Hardcodear paths volátiles

```
❌ "Leer project/reference/design-system/tokens.md"
✅ "Leer {{design-system-ref}}" + resolver por tipo en el workflow
```

**Por qué:** las paths de `project/reference/` cambian. Referenciar por tipo/contenido desacopla.

### ❌ Componentes runtime compartidos replicados en cada workflow

```
❌ Cada tk-*/ con su propio _shared/checkpoint-format.md, _shared/context-check.md
✅ CC runtime ya gestiona auto-compact context, Plan Mode, hooks. NO replicar primitivas.
```

**Por qué:** trust the harness. Si CC ya hace algo, no lo duplicamos. Cada workflow es distinto y se documenta solo. Esto es lo opuesto a la heurística AG donde primitivas reusables eran necesarias por context window restrictivo.

---

## §3 — Carry-overs de Antigravity (rescate como referencia)

> **Por qué esta sección existe:** este meta-skill RESCATA el ejercicio de filtrar legacy AG aplicando la idea nueva de cómo opera discovery. La filtración es valor — saber qué descartar al venir de AG.

Si ves alguno de estos en un workflow `.claude/`, **es un carry-over sin filtrar.** Sustituir.

### ❌ `cat file.md` como mecanismo de carga

✅ Usar Read tool sobre el archivo.

### ❌ `// turbo` / `// turbo-all` annotations

✅ Permission declarada en `.claude/settings.json` allow list.

### ❌ `notify_user` como tool o en prosa

✅ STOP inline con opciones explícitas y excluyentes (§7.0) + esperar la elección.

### ❌ `ShouldAutoProceed: true/false` flag

✅ Risk Assessment table + Plan Mode si HIGH (CC.md §4).

### ❌ `BlockedOnUser: true` property

✅ Implícito — el bloque termina con 🛑 STOP + opciones, runtime espera respuesta.

### ❌ Progress file paralelo al workflow

✅ `/handoff` → `.claude/transitions/YYYY-MM-DD/HHMMSS.md` + `/continue` para resume.

### ❌ Referenciar `registry.yaml`, `registry_cli.py`, `ARCHITECTURE.md`, `CONTENTS.md`

✅ CC no tiene registry — routing por description. No hay index manual hoy.

### ❌ Batching obligatorio cuando el contenido cabe

✅ Evaluar si el contenido satura contexto; batching como herramienta, no regla.

### ❌ `write_to_file` / `read_file` en prosa

✅ Write tool / Read tool (CC built-in).

---

## §4 — Frontmatter / description

### ❌ `description: >` multiline enumerativo (wall-of-text)

```
❌ description: >
     Covers `auditFields` + `softDeleteFields` + `getNextHumanId` +
     [20 more lines enumerating every symbol in the body]
✅ description: Kit-shipped DB helpers... Invoke when defining schema.
```

**Por qué:** la description es **trigger surface** ("cuándo invocar"), no index card ("qué contiene"). Enumerar >5 símbolos satura el system prompt sin mejorar el routing — los embeddings ya matchean sinónimos.

### ❌ Duplicación bilingüe EN + ES en description

```
❌ description: Portable UI patterns for Next.js... [EN]. Patrones portables de UI... [ES dup].
✅ description: Portable UI patterns for Next.js + React + Tailwind — {{triggers}}. For kit primitives → `sk-ui`.
```

**Por qué:** EN-only uniforme. Duplicar duplica el costo de tokens en cada sesión sin mejorar routing (embeddings entrenados mayoritariamente en EN).

### ❌ Forzar `kb-X → sk-X` anchor cuando `sk-X` no existe en proyecto

```
❌ description: Portable Flutter patterns... For kit infra → `sk-flutter`. (sin sk-flutter)
✅ description: Portable reference for Flutter... — not grounded in this repo. {{triggers}}.
```

### ❌ Description con keywords sin contexto

```
❌ "implement execute issue build code"
✅ "Execute a backlog issue end-to-end — plan → code → QC → close. Primary invocation is `/implement ISSUE-ID`."
```

### ❌ Omitir boundary ("NOT for...")

```
❌ description sin decir qué NO hace
✅ "Use for ISSUE-ID implementation. NOT for auditoría profunda (eso es /audit)."
```

---

## §5 — Scope y governance

### ❌ Workflow que crece al mezclar con otro

```
❌ tk-backlog absorbe también validación de AC + auditoría de DoD
✅ tk-backlog genera issues; /audit verifica calidad; separated concerns
```

### ❌ Agregar "pequeñas mejoras" en un refactor no pedido

```
❌ "Ya que estoy, renombro esta fase"
✅ CODING.md §3 — surgical changes; deuda adyacente → /park, no tocar
```

### ❌ Skill meta referencia un skill que no existe

```
❌ "Ver fx-release-pipeline" (no existe)
✅ Solo referenciar skills/agents presentes; si no existe, "pendiente futuro"
```

---

## §6 — CC-specific gotchas

### ❌ Bash heredocs para crear archivos

```
❌ cat << EOF > file.md ... EOF
✅ Write tool. Excepción: git commit -m con HEREDOC
```

### ❌ Paths absolutos `<absolute-user-path>/...` en config tracked

```
❌ .claude/settings.json con <home>/foo/...
✅ Paths absolutos viven en .claude/settings.local.json (CC.md §6.1)
```

### ❌ Skip TodoWrite en workflows de 3+ fases

```
❌ Workflow con 5 fases sin TodoWrite
✅ TodoWrite desde inicio; mark completed inmediatamente al terminar cada fase
```

### ❌ Múltiples todos `in_progress` a la vez

```
❌ 3 fases marcadas in_progress simultáneas
✅ Una sola a la vez; completed → next in_progress en atomic update
```

---

## §7 — Skill body discipline

### ❌ Client names en skill body / methodology / templates

```
❌ "El proyecto Wilbur usa scoring v2..." (client name leak)
✅ "El workflow soporta scoring genérico — config en `templates/scoring.template.md`"
```

### ❌ Journey narrative en skill body

```
❌ "Antes hacíamos X, después de la calibración con cliente Z, ahora hacemos Y"
✅ Body refleja behavior actual. La historia va al CHANGELOG.
```

### ❌ Workflow-evolution tags en body

```
❌ "Phase 4 (NEW v5.2) ahora maneja..." / "post-refactor: usar Z"
✅ El cambio se registra en CHANGELOG `[Unreleased]`. Body queda ahistórico.
```

**Por qué:** workflow-evolution narrative en el body confunde al agente ejecutor — frases retrospectivas se leen como instrucciones de behavior actual. Project-name leakage rompe portabilidad: ejemplos quedan amarrados a un cliente o calibración específica.

---

## §8 — Subprocess skill citation (CC.md §2 codification)

### ❌ Invocar Agent tool sin paths a skills relevantes en prompt

```
❌ Agent(subagent_type=architect, prompt="Audit <draft> for risks")
✅ Agent(subagent_type=architect, prompt="
   Consulta antes de empezar:
   - .claude/skills/sk-features-index/SKILL.md
   - .claude/skills/sk-db/SKILL.md
   - .claude/skills/sk-security/SKILL.md
   Audit <draft> for risks...")
```

**Por qué:** subprocesses NO reciben listing por description injection. CC.md §2 lo establece como obligatorio. Sin paths citados, el subprocess opera sin el kit (`sk-*`/`kb-*`).

**Format obligatorio:** paths repo-relative, no absolutos. `<absolute-user-path>/...` no debe aparecer en docs tracked.

---

## §9 — Heavy without companions

### ❌ Heavy workflow sin templates/, methodology, CHANGELOG, thin wrapper

```
❌ tk-{{name}}/ con solo SKILL.md de 800 líneas, produce 5 artifacts sin templates
✅ tk-{{name}}/ + templates/*.template.md + (methodology.md si schemas) + CHANGELOG.md + commands/{{name}}.md
```

**Decision tree** en `SKILL.md §11 Companions decision tree`. Heavy = 3+ phases con artifacts durables / schemas formales / subprocesses propios.

---

## §10 — Wrapper anti-patterns

### ❌ Wrapper duplica fases del skill

```
❌ commands/{name}.md enumera "Phase 0 → Phase 1 → ... → Phase N"
✅ commands/{name}.md: "Invocar skill tk-{name}; respetar fases declaradas en SKILL.md"
```

### ❌ Wrapper contradice checkpoints del skill

```
❌ commands/{name}.md prescribe un mecanismo de CP distinto al definido en SKILL.md
   (ej: dice "todos los CP son Plan Mode" cuando el skill define CP1 inline)
✅ commands/{name}.md: "Respetar checkpoints según SKILL.md §Checkpoints. Wrapper NO redefine semántica."
```

### ❌ Wrapper redefine semantics

```
❌ Wrapper introduce un modo no documentado en el SKILL ("ad-hoc batch mode")
✅ Modes viven en el SKILL Phase 0; wrapper solo parsea $ARGUMENTS y delega
```

---

## §11 — Artifact without template (hard rule)

### ❌ Workflow genera artifact sin template versionado

```
❌ Phase 8 escribe project/output.md improvising shape
✅ Phase 8 lee templates/output.template.md → fill placeholders → Write canonical path
```

**Hard rule:** si el workflow va a generar `foo.md`, primero crea `templates/foo.template.md`. Sin template, no se genera.

**Por qué:** templates son schema obligatorio de artefactos. Improvisar shape produce drift entre runs y entre proyectos derivados. No hay versioning posible si el shape no está fijado en un archivo.

---

## §12 — Missing invalidation handling

### ❌ Workflow heavy sin sección "qué pasa si llega info post-CP"

```
❌ SKILL.md tiene CP1 + CP2 pero no declara qué hacer si user aporta info
   nueva después de CP1
✅ SKILL.md §Invalidation handling con threshold + opciones (patch/regen/backtrack/user choice)
```

**Por qué:** los workflows iterativos sin invalidation handling explícito producen state inconsistente cuando el user inevitable aporta info post-checkpoint. Cada workflow heavy DEBE declarar la política.

**Anchor:** `SKILL.md §10 Invalidation handling rule`.

---

## §13 — Subprocess sin tools allowlist o con allowlist excesivo

### ❌ Subprocess con default tools (todas)

```
❌ frontmatter sin `tools:` (default = todas, peligroso)
✅ frontmatter con `tools: Read, Grep, Glob` mínimo necesario
```

### ❌ Subprocess auditor/reviewer con `Write`

```
❌ product-owner.md con `tools: Read, Grep, Glob, Write` — auditor no debe escribir
✅ product-owner.md con `tools: Read, Grep, Glob` — retorna findings inline al orchestrator
```

**Default sugerido por rol:**

- **Writer / extractor** (persiste artifact directo) → `Read, Grep, Glob, Write`
- **Auditor / reviewer** (findings inline al orchestrator, no escribe archivos) → `Read, Grep, Glob`
- **Test runner** (ejecuta comandos, no persiste) → `Read, Grep, Glob, Bash`

**Anchor:** `SKILL.md §8 Subprocess delegation policy`.

---

## §14 — Review checklist final (greps para CI)

Antes de commit:

```bash
# Carry-overs AG residuales
grep -rE "(cat |// turbo|notify_user|write_to_file|ShouldAutoProceed|BlockedOnUser)" \
  .claude/skills/{{nuevo}}/ | grep -v "anti-patterns\.md"
# → vacío

# Paths absolutos en docs tracked (excluir self-reference de este archivo)
grep -rE "/Users/" .claude/skills/{{nuevo}}/ \
  | grep -v "anti-patterns\.md\|SKILL\.md.*<absolute-user-path>\|subprocess-prompt\.template\.md"
# → vacío en archivos del workflow nuevo

# Registry / ARCHITECTURE / CONTENTS legacy
grep -rE "registry_cli|ARCHITECTURE\.md|CONTENTS\.md" .claude/skills/{{nuevo}}/
# → vacío

# Cada checkpoint presenta opciones explícitas y excluyentes (estructuradas o tabla — §7.0)
grep -E "1=|opciones" .claude/skills/{{nuevo}}/SKILL.md
# → ≥2 matches por checkpoint

# Workflow-evolution tags en body
grep -rE "\(NEW v|post-refactor|Closes WD-" .claude/skills/{{nuevo}}/SKILL.md
# → vacío (todo eso va al CHANGELOG)

# Subprocess sin tools allowlist
for f in .claude/agents/{{prefix}}-*.md; do
  grep -q "^tools:" "$f" || echo "MISSING tools allowlist: $f"
done
# → ningún output (todos tienen tools declarado)

# Description EN-only single-line
head -10 .claude/skills/{{nuevo}}/SKILL.md | grep -E "^description:.*\\\\$"
# → vacío (no continuation lines)
```

Si alguno falla → no commit hasta corregir.

---

_TimeKast Factory — anti-patterns para fx-workflow-authoring_
