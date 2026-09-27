# Anti-Patterns — lo que NO debe aparecer en un skill declarativo

> Checklist defensivo para `kb-*` / `sk-*` / `fx-*` / `pj-*`. Recórrelo antes de commitear un skill nuevo o refactor, y corre los greps de la última sección.
>
> Los ejemplos "❌" de este archivo contienen a propósito patrones prohibidos (tags de versión, nombres de cliente) — por eso los greps de cierre **excluyen `anti-patterns.md`**. La fuente de verdad de qué está mal es este archivo; el grep solo lo enforce sobre los demás.

---

## §1 — Clasificación / ontología

### ❌ Prefijo inventado fuera de la taxonomía

```
❌ op-vercel-crons, doc-discovery-helper   (op-*/doc-* NO existen en CORE.md §1)
✅ kb / sk / fx / pj / tk — y nada más. Conocimiento atado al repo = sk-*; fase docs portable = kb-*
```

### ❌ `kb-*` que describe un sistema ya shippeado

```
❌ kb-alerts-bell describiendo el NotificationBell que el kit ya tiene en src/
✅ Eso es sk-* (kit-shipped). kb-* = paradigma portable. Si dudas: "¿existe en src/?" SÍ → sk
```

### ❌ Skill declarativo que en realidad es un workflow

```
❌ kb-deploy-pipeline con "Fase 1 → CP1 → Fase 2 → gate"
✅ Eso es tk-* con fases/gates → fx-workflow-authoring. Este skill es para lo declarativo sin fases
```

---

## §2 — Frontmatter / description

### ❌ `description` multilínea enumerativa (wall-of-text)

```
❌ description: >
     Covers withAuth + withSelf + ActionResult + ActionError + [20 símbolos más]
✅ description: Kit-shipped server action helpers … Invoke when writing actions.
```

La description es **trigger surface** ("cuándo invocar"), no index card ("qué contiene"). >8 símbolos → el `skill:lint` warnea anti-enumeration.

### ❌ Duplicación bilingüe EN + ES

```
❌ description: Portable UI patterns … [EN]. Patrones portables de UI … [ES dup].
✅ description: Portable UI patterns for Next.js … {{triggers}}. For kit primitives → `sk-ui`.
```

EN-only uniforme. Duplicar duplica el costo de tokens cada sesión sin mejorar routing.

### ❌ Par kb↔sk sin anchor mutuo

```
❌ kb-x sin "For kit infra → sk-x" / sk-x sin "For portable → kb-x" (cuando el par existe)
✅ Ambas descriptions anclan al par y el par está registrado en `DEFAULT_PAIRS`. El `skill:lint` (pair-cross-refs) lo EXIGE como error P1.
```

### ❌ Forzar anchor `→ sk-X` cuando `sk-X` no existe

```
❌ description: Portable Flutter patterns … For kit infra → `sk-flutter`.   (no existe sk-flutter)
✅ description: Portable reference for Flutter … — not grounded in this repo. {{triggers}}.
```

### ❌ Falta `last-verified`

```
❌ frontmatter sin last-verified  → staleness warning
✅ last-verified: YYYY-MM-DD a la fecha de creación
```

---

## §3 — Disciplina ahistórica del body

### ❌ Tags de evolución / versión en el body

```
❌ "Phase reorganizada (NEW v6.3.0)", "post-refactor: usar Z", "previously emitted X"
✅ El body refleja behavior ACTUAL. La historia va al CHANGELOG (quién lo lleva lo decide `SKILL.md §8`: los `tk-*` pesados y las declarativas SSOT-pesado).
```

### ❌ Journey narrative

```
❌ "Antes parseábamos a mano; tras calibrar, ahora usamos el wrapper"
✅ "Usa el wrapper withAuth para auth + Zod + revalidate."
```

### ❌ Nombres de cliente / proyecto derivado

```
❌ "El proyecto Wilbur usa scoring v2…", "regresión EPIC-40 de MVPicks", "como en Aditivo CRM"
✅ Ejemplo genérico: "una entidad de ejemplo", placeholders {{entity}}, sin amarrar a un cliente
```

**Por qué importa:** los skills declarativos viajan a derivados. Un nombre de cliente o una nota de release rompe la portabilidad y confunde al ejecutor headless, que lee la frase retrospectiva como instrucción actual.

---

## §4 — Body discipline (estructura)

### ❌ Improvisar shape en vez de usar el template de la familia

```
❌ Cada kb-* con secciones distintas, orden distinto, sin anti-patterns ni checklist
✅ Anatomía consistente desde templates/ — es lo que hace el kit navegable entre proyectos
```

### ❌ `sk-*` que inventa símbolos o paths

```
❌ sk-* citando useQueryState / @/lib/foo/bar inexistentes
✅ Símbolos reales de project/reference/HOOKS.md; @/ que resuelven bajo src/ (specifiers check)
```

### ❌ Skill que redefine una rule

```
❌ kb-git re-declarando GIT.md §1 (--no-verify prohibido)
✅ Citar la rule ("ver GIT.md §1"), no reimplementarla. CORE.md §4 Regla de Oro.
```

### ❌ Hardcodear paths volátiles de project/reference como SSOT del kit

```
❌ Body que asume "leer project/planning/project-config.md" como verdad universal
✅ Esos paths son project-local y divergen en derivados. Un sk-* ancla a HOOKS.md/SCHEMA.md (autogen), no a planning
```

---

## §5 — Inflación / scope

### ❌ Crear cuando deberías extender

```
❌ sk-api-v2 al lado de sk-api porque "es más limpio"
✅ Extender sk-api con una sección. Uniqueness check (SKILL.md §4) antes de crear
```

### ❌ Referenciar un skill que no existe

```
❌ "Ver sk-payments" cuando sk-payments no existe → cross-refs error P1
✅ Solo referenciar skills presentes; si no existe, no lo cites (o créalo primero)
```

---

## §6 — Greps de cierre (antes de commit)

```bash
# Tags de evolución / versión en body (NO en CHANGELOG, que no existe para declarativos)
grep -rnE "\(NEW v|post-refactor|previously|antes (hac|us)|decidi(mos|ó)|tras calibrar" \
  .claude/skills/{{nuevo}}/ | grep -v "anti-patterns\.md"
# → vacío

# Nombres de cliente / derivado conocidos (ajusta la lista al roster real)
grep -rniE "mvpicks|aditivo|wilbur|emmons|fimubac" \
  .claude/skills/{{nuevo}}/ | grep -v "anti-patterns\.md"
# → vacío

# Description multilínea (folded scalar enumerativo)
head -8 .claude/skills/{{nuevo}}/SKILL.md | grep -E "^description: >"
# → vacío (single-line)

# Paths absolutos del dev en archivo tracked
grep -rnE "/Users/|/home/" .claude/skills/{{nuevo}}/ | grep -v "anti-patterns\.md"
# → vacío

# last-verified presente
grep -E "^last-verified:" .claude/skills/{{nuevo}}/SKILL.md
# → 1 match
```

Si alguno falla (salvo el último, que debe matchear) → no commit hasta corregir. Cierre formal: `pnpm skill:lint` → 0 errores.

---

_TimeKast Factory — anti-patterns para fx-skill-author_
