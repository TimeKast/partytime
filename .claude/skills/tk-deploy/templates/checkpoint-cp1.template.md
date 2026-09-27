<!--
  ===== tk-deploy: CP1 — Pre-deploy validation (fusionado, 2 modos) =====
  Emitted at end of Phase 1 después de §1.1 (compute state) + §1.2 (branch mismatch).
  El SKILL §1.1 decide el modo según los flags computados:
   - mode=valid    → todos los checks pasan (tree limpio, no es main, hay commits)
   - mode=blocking → al menos un check falla; CP1 renderiza el error inline sin opción de continuar

  Placeholders comunes:
    {MODE_VALID_OR_BLOCKING}  — "valid" | "blocking"

  Modo `valid` placeholders:
    {MODE}, {SOURCE_BRANCH}, {BUMP_FIELD_CURRENT}, {BUMP_FIELD},
    {COMMITS_AHEAD}, {UNPUSHED}, {RECENT_COMMITS}, {NEXT_PHASE_DESC}

  {NEXT_PHASE_DESC} — refleja el routing real de SKILL §1.3 (no improvisar):
    · Phase 1.5 (pnpm verify) si SHOULD_VERIFY
    · sino Phase 1.6 (readiness) si activa — release: build + sweep T1
      (--skip-preflight salta solo el sweep); ship post-release: sweep T1
    · sino Phase 2 (bump + CHANGELOG, release) / Phase 3 (inspect main, ship)

  Modo `blocking` placeholders:
    {BLOCKING_REASON}  — mensaje específico:
                         · "Working tree no limpio — {DIRTY_COUNT} archivos modificados."
                         · "Estás en main. Switch a `{SOURCE_BRANCH}` antes de continuar."
                         · "No hay commits para mergear en main."
    {DETAIL_HINT}      — comando que el user puede correr para ver el detalle.
-->

{{# if MODE_VALID_OR_BLOCKING == "valid" }}

## 🛑 CP1 — Pre-deploy validation

### Estado

| Item                               | Valor                                   |
| ---------------------------------- | --------------------------------------- |
| Modo                               | {MODE}                                  |
| Branch                             | `{SOURCE_BRANCH}` → `main`              |
| Versión actual                     | `{BUMP_FIELD_CURRENT}` (`{BUMP_FIELD}`) |
| Commits a mergear                  | {COMMITS_AHEAD}                         |
| Working tree                       | ✅ limpio                               |
| Commits locales sin push en source | {UNPUSHED} (se pushea en Phase 6)       |

### Últimos commits (preview)

```
{RECENT_COMMITS}
```

### Plan de continuación

{NEXT_PHASE_DESC}

### Opciones
> **Presentación de opciones** (`CC.md §3` + [`fx-workflow-authoring §7.0`](../../fx-workflow-authoring/SKILL.md)): estructuradas (`AskUserQuestion`) como default interactivo; la tabla de abajo es el **fallback** cuando el runtime no tiene la tool. **Headless:** ninguna de las dos — el CP resuelve por su fail-open/fail-closed declarado y **no intenta** la tool.


| #   | Acción    |
| --- | --------- |
| 1   | continuar |
| 2   | cancelar  |

🛑 STOP — Responde con el número.

{{# else (MODE_VALID_OR_BLOCKING == "blocking") }}

## 🛑 CP1 — Pre-deploy BLOQUEADO

### Razón

{BLOCKING_REASON}

### Cómo ver el detalle

```bash
{DETAIL_HINT}
```

### Opciones
> **Presentación de opciones** (`CC.md §3` + [`fx-workflow-authoring §7.0`](../../fx-workflow-authoring/SKILL.md)): estructuradas (`AskUserQuestion`) como default interactivo; la tabla de abajo es el **fallback** cuando el runtime no tiene la tool. **Headless:** ninguna de las dos — el CP resuelve por su fail-open/fail-closed declarado y **no intenta** la tool.


| #   | Acción      |
| --- | ----------- |
| 1   | cancelar    |
| 2   | ver detalle |

🛑 STOP — Responde con el número. Sin opción de "continuar" — el error bloquea por construcción. Si arreglas el estado fuera del workflow, opción `2` re-checkea desde §1.1.

{{# endif }}
