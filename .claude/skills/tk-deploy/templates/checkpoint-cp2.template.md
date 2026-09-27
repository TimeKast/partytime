<!--
  ===== tk-deploy: CP2 — Release review =====
  Emitted at end of Phase 2 (release mode only).
  Placeholders: {BUMP_TYPE}, {BUMP_FIELD_CURRENT}, {NEW_VERSION}, {BUMP_FIELD},
                {CHANGELOG_PATH}, {CHANGELOG_ENTRY_FINAL}
-->

## 🛑 CP2 — Release review

| Item           | Valor                                                  |
| -------------- | ------------------------------------------------------ |
| Bump type      | `{BUMP_TYPE}` ({BUMP_FIELD_CURRENT} → `{NEW_VERSION}`) |
| Campo bumpeado | `{BUMP_FIELD}`                                         |
| CHANGELOG path | `{CHANGELOG_PATH}`                                     |
| Tag a crear    | `v{NEW_VERSION}`                                       |

### CHANGELOG entry final

```
{CHANGELOG_ENTRY_FINAL}
```

### Opciones
> **Presentación de opciones** (`CC.md §3` + [`fx-workflow-authoring §7.0`](../../fx-workflow-authoring/SKILL.md)): estructuradas (`AskUserQuestion`) como default interactivo; la tabla de abajo es el **fallback** cuando el runtime no tiene la tool. **Headless:** ninguna de las dos — el CP resuelve por su fail-open/fail-closed declarado y **no intenta** la tool.


| #   | Acción                                                   |
| --- | -------------------------------------------------------- |
| 1   | commitear bump + CHANGELOG (2 commits locales, sin push) |
| 2   | editar entry de nuevo                                    |
| 3   | cancelar (reset y terminar)                              |

🛑 STOP — Responde con el número.
