<!--
  ===== tk-implement: EPIC QC Report template =====
  Este template define la ESTRUCTURA de la sección `## QC Report (Phase 4 — {ts})` que se
  appendea al body del epic file durable (project/backlog/{LAYOUT}/epics/EPIC-NN-{slug}.md),
  NO un archivo separado.

  Flow (ver tk-implement/SKILL.md §Phase 4):
    1. Orchestrator corre verify/build/e2e redirigiendo a temp files en implement-artifacts/{run-id}/.
    2. Spawn quality-engineer (Read/Grep/Glob/Bash — sin Write/Edit) con outputs_dir + epic_file_path.
    3. Subagent emite el QC report markdown como output de su turn (este shape).
    4. Orchestrator captura el output y appendea al epic file con printf >> .

  IMPORTANTE: el heading del output del subagent debe ser `## QC Report (Phase 4 — {ISO 8601 UTC})`.
  NO usar `# QC Report — {epic-slug}` H1 — eso colisionaría con el H1 del epic file (epic title).

  Sanity check en Phase 5 valida: grep -c '^## QC Report (Phase 4' epic_file >= 1.
-->

## QC Report (Phase 4 — {{ISO_8601_UTC_TIMESTAMP}})

> Output de Phase 4 (epic integration). Lo produce `quality-engineer` (solo report, NO fixes).
> Orchestrator inline appendea esta sección al body del epic file durable. Input de CP-B.

### AC coverage (por issue)

| Issue        | AC cubiertos | Evidencia           |
| ------------ | ------------ | ------------------- |
| {{ISSUE-ID}} | {{n/n}} ✅   | {{file:Lxx / test}} |
| {{ISSUE-ID}} | {{n/n}} ✅   | {{…}}               |

### Verificación integrada del epic

| Check                | Comando                    | Status            |
| -------------------- | -------------------------- | ----------------- |
| Lint + Types + Tests | `pnpm verify`              | {{✅ / 🔴}}       |
| Build (producción)   | dentro de `pnpm test:e2e`¹ | {{✅ / 🔴}}       |
| E2E                  | `pnpm test:e2e`            | {{✅ / 🔴 / N/A}} |

> ¹ El runner de e2e construye el build de producción y lo sirve con `next start`; la
> evidencia es la línea `Build ready` en `e2e.log`. Si el e2e no corrió (sin credenciales
> de Neon), el fallback es un `pnpm build` suelto con su propio `build.log`.

### Áreas sensibles — cómo quedaron

- {{ej: "Tablas nuevas creadas vía migración (db:generate + db:migrate), reversible" / "Login: rutas RBAC cubiertas por E2E".}}

### Hallazgos

{{Un bullet por finding, **cada uno con su clase entre corchetes** — es el input de Phase 4.7, que le da destino a cada uno. Si ninguno → "Sin hallazgos abiertos".}}

```
- [rompe]     {qué} — {archivo:línea o test} — {evidencia: spec roja / build / AC-N no verificado}
- [está mal]  {qué} — {archivo:línea} — {consulta: test rojo / línea de log / resultado de búsqueda}
- [cosmético] {qué} — {archivo:línea} — {consulta: …}
- [decisión]  {qué hay que decidir y entre qué caminos} — {archivos candidatos}
```

> **Las clases, con su umbral** (mapeo desde la escala nativa `🔴 BLOCKER / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW`):
> `rompe` = test rojo, build roto o AC con verificación fallida — **BLOCKER**. `está mal` = calidad, sin romper nada — **HIGH/MEDIUM**. `cosmético` = el fix no cambia ninguna ruta de ejecución (prueba mecánica en `tk-implement §4.7.1`; ante duda, `está mal`) — **LOW, sólo si pasa la prueba**. `decisión` = hay dos caminos válidos y elegir no le toca al agente — **cualquier severidad**.
>
> **El segmento `{consulta: …}` es la ranura de evidencia** (`fx-execution-policy §4.4` — eje `evidenced`/`unevidenced`): el artefacto que exige el hallazgo — test rojo, línea de log, resultado de una búsqueda en el código. Sin consulta citable se omite el segmento — nunca se inventa. (En `[rompe]` ese rol lo cumple el segmento `{evidencia: …}` que ya lleva.)
>
> Un AC funcional incumplido va como `[rompe]`; **no** se reabre el issue dueño (ruta retirada — `tk-implement §4.3`): el fix viaja en el commit `Refs: EPIC-NN` de 4.7.5.

### Verdict

{{✅ PASS — listo para cerrar · 🛑 NEEDS CONFIRM · 🔴 FAIL (qué falta)}}

> Si Phase 4.7 corrige deuda después de este report, **un `## QC Delta` posterior supersede este verdict** — este describe el árbol previo a esas correcciones y se conserva como historial, no como estado actual.

---

> **CP-B:** 1 Completar · 2 Revisar (incl. el triage de la deuda) · 3 Dejar en progreso. (Push se pregunta aparte — `GIT.md §2`.)
