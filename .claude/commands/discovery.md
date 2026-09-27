---
description: Product Discovery — extract project truth from stakeholder + source docs, produce Discovery Brief + project-config as SSOT.
argument-hint: '[nuevo|con-docs|validar] [--keep-artifacts]'
---

# /discovery

Workflow CC-native que destila los inputs disponibles + conversación con stakeholder en **una sesión densa objetivo** → produce los **11 canonical artifacts numerados** en `project/planning/` + `project/planning/decisions/` directory + frontmatter v2 de project-config. Modos: `nuevo` (desde cero), `con-docs` (con docs existentes), `validar` (validar brief previo).

**Éxito = "capturado o trackeado"**, NO "todo resuelto". Lo que no se cierra en sesión queda explícito en `decisions/` (DECISION/SPIKE/ADR), no asumido.

**Canonical outputs (always-emit; 07 lleva nota "N/A" si `sk_active=false`):**

```
project/planning/
├── 00_DISCOVERY_BRIEF.md          (Phase 6 synthesis)
├── 01_FREEZE_MAP.md               (Phase 2 freeze-map)
├── 02_PERSONAS.md                 (Phase 6.1)
├── 03_DEEP_DIVE.md                (Phase 4 + 4c)
├── 04_ARCHITECTURE.md             (Phase 6.1; ships con cliente)
├── 05_RBAC_MATRIX.md              (Phase 6.1, multi-pass)
├── 06_ACCEPTANCE_SCENARIOS.md     (Phase 6.1)
├── 07_SK_LEVERAGE.md              (Phase 5; nota "N/A" si !sk_active)
├── 08_GLOSSARY.md                 (incremental, appendix)
├── 09_DATA_MODEL.md               (Phase 6.1 step 2, registry-first)
├── 10_API_SURFACE.md              (Phase 6.1 step 3, registry-first)
├── project-config.md              (Phase 8 step 4, frontmatter v2)
└── decisions/                     (working state, durable)
    ├── DECISION-*.md
    ├── SPIKE-*.md
    └── ADR-*.md
```

**Ephemeral (Phase 8 strip OK):** `project/discovery-artifacts/` (audit + explore-pass + intermediate batches).

**Argumento:** `$ARGUMENTS` — `nuevo` (desde cero) / `con-docs` (con docs) / `validar` (validar existente).

🔴 **Document Gate (lo primero, SIEMPRE — salvo `validar`):** antes de cualquier entrevista, `/discovery` escanea `project/intake/`. Si ya hay documentos → confirma ("detecté estos, ¿es todo o subes más?"). Si está vacío → te pide subirlos. Solo si confirmas que no tienes nada arranca en **modo sin documentos** (entrevista guiada). Esto sesga la conversación hacia **modo con documentos**, que es mucho más preciso. Ver `tk-discovery/SKILL.md` Phase 1.0.1.

**Drop location:** `project/intake/` es la carpeta canónica donde tirar las fuentes iniciales (transcripts, PDFs, screenshots, Excels). `/discovery` la escanea siempre; los paths que pegues la complementan. Detalle: `tk-discovery/methodology/intake.md §1`.

**Flag opcional:** `--keep-artifacts` — conserva `project/discovery-artifacts/{run-id}/` completo (incluyendo `_audit/` Y los transitionals) tras el run para debug, forensics o mediciones. Sin flag, Phase 8 step 5d preserva `_audit/` por excepción y borra los transitionals.

---

## Instrucciones al agente

1. **Invocar skill `tk-discovery`** — leer `.claude/skills/tk-discovery/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS`:
   - `nuevo` / `con-docs` / `validar` → modo explícito, saltar pregunta en Phase 0.
   - (vacío) → Phase 0 pregunta el modo.
3. **Crear TodoWrite** según `SKILL.md §TodoWrite obligatorio` (Phases + CP1 + CP2 + Gap Round 2) desde el inicio del Turn 1.
4. Ejecutar fases respetando **turn boundaries** declarados en SKILL.md (cada turn cierra con STOP explícito).
5. Respetar checkpoints según `tk-discovery/SKILL.md §Checkpoints` — CP1 es **inline + STOP** (compact, conversational); CP2 es **Plan Mode formal** (synthesis multi-fuente). El wrapper NO redefine la semántica del skill.
6. No ejecutar de memoria. No saltar fases. No listar sub-pasos de fases futuras.
