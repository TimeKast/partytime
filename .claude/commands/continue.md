---
description: Auto-carga el transition más reciente de .claude/transitions/ y retoma sesión con contexto mínimo. Úsalo después de /clear.
---

# /continue

Carga el transition más reciente y brief al usuario con el estado exacto para retomar. Contraparte de `/handoff`.

---

## Instrucciones al agente

### 1. Localizar el transition más reciente

Usar la tool **Glob** (pattern: `.claude/transitions/*/*.md`) — matchea solo transitions activos (`YYYY-MM-DD/HHMMSS.md`, 2 niveles; los de `archive/YYYY-MM-DD/` quedan a 3 niveles y no entran).

1. Del resultado, filtrar paths con shape `.claude/transitions/YYYY-MM-DD/HHMMSS.md` y tomar el mayor en orden lexicográfico (fecha + hora viven en el path → el mayor es el más reciente).
2. Si no hay matches → reportar "⚠️ No hay transitions guardados. Ejecuta /handoff en la próxima sesión para crear uno." y detener.
3. **Path resuelto:** usarlo directo con Read tool.

> El parseo (filtrar shape, ordenar desc) lo hace el agente inline sobre el resultado del Glob — cero Bash, cero pipes/subshells que chocarían con el permission matcher (matchea por prefix del string completo).

### 2. Leer el transition

Usar Read tool sobre el path resuelto. El archivo contiene secciones estándar: Focus, Current Work, Recent Decisions, Blockers, Next Steps, Modified Files, Commits.

**Parsear el header buscando líneas `EPIC-PLAN activo:` o `EPIC-PLAN activos`** (escritas por `/handoff` Paso 2.5 cuando había `/implement` mid-flight). Estas líneas indican que hay un epic pausado al que se puede regresar con `--start-at`.

### 3. Brief al user en ≤6 líneas

```
📂 Retomando: .claude/transitions/YYYY-MM-DD/HHMMSS.md
🎯 Focus: <primera línea del Focus>
🔄 Last work: <1-line summary del Current Work>
🚧 Blockers: <N blockers — "ninguno" si vacío>
➡️  Next: <primer item de Next Steps>

¿Procedo con "Next"?
```

**Si el transition tenía `EPIC-PLAN activo:` o `EPIC-PLAN activos`**, agregar una línea adicional ANTES del "¿Procedo con Next?":

```
⚠️  Hay un epic pausado: EPIC-XX (run-id: ABC)
➡️  Para resumir: /implement EPIC-XX --start-at ISSUE-YY
```

Si hubo N > 1 epics activos → listar los N + advertir "Varios epics en progreso; especifica el `--start-at` del que quieras resumir."

**No ejecutar** el next step automáticamente. Esperar confirmación del user.

### 4. Pasada oportunista de cleanup (opcional, 1× por /continue)

Después del brief, chequear la edad de los transitions por el date del filename (el path ya codifica `YYYY-MM-DD`): activos = el resultado del Glob del paso 1; para el archive, tool **Glob** (pattern: `.claude/transitions/archive/**/*.md`). Dos chequeos independientes:

**4a. Activos (fuera de `archive/`):** disparar sugerencia si se cumple **cualquiera**:

- **Stale:** hay archivos >14 días (excluir `archive/`)
- **Acumulación:** el total de transitions activos es >7

Acción propuesta → **archivar** (mover a `.claude/transitions/archive/YYYY-MM-DD/`) preservando jerarquía de fechas.

**4b. Archivo retention (>30 días en `archive/`):** disparar sugerencia si hay archivos en `archive/` con más de 30 días.

Acción propuesta → **borrar** (`rm`) — el archive no es SSOT, es buffer de recuperación.

**Formato combinado (máximo 1 prompt por sesión):**

```
🧹 Cleanup sugerido:
   • N transitions activos >14 días o acumulados (>7)  → archivar
   • M transitions en archive/ >30 días                → borrar

¿Procedo?
```

- Si los dos chequeos aplican → una sola propuesta combinada, no dos prompts
- Si solo uno aplica → mostrar solo esa línea
- Si el user confirma → ejecutar las operaciones aprobadas
- Si el user ignora → no insistir, solo mostrar una vez por sesión
- Si el user quiere granularidad ("archiva sí, borra no") → respetar

### 5. Reglas

- **NUNCA** borrar transitions sin confirmación explícita
- **NUNCA** ejecutar el "Next Step" del transition sin que el user diga "sí" o "procede"
- Si el user dice "procede" y el next step implica HIGH risk (commit, schema change, deploy) → aplicar CC.md §4 (Plan Mode antes)
- Si el transition tiene >7 días → advertir: "⚠️ Transition de hace >7 días — verificar que el contexto siga aplicando antes de ejecutar"

### 6. Edge cases

- **Transition corrupto** (secciones faltantes) → degradar gracefully: leer lo que haya, reportar "Transition parcial — verificar contenido"
- **Conflicto con trabajo en curso:** si hay cambios unstaged en git al invocar /continue → advertir "Working tree no limpio: ¿quieres incorporar cambios al plan o los stasheamos primero?"
- **Branch diferente:** si el transition menciona una branch distinta a la actual → reportar discrepancia, NO cambiar de branch automático
