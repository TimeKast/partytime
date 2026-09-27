<!--
  ===== tk-deploy: CP4 — Merge conflicts =====
  Emitted in Phase 4 ONLY if `git diff --name-only --diff-filter=U` non-empty.
  Placeholders: {CONFLICTS}, {SOURCE_BRANCH}
-->

## 🛑 CP4 — Conflictos en merge

Archivos con conflict markers:

```
{CONFLICTS}
```

### Opciones
> **Presentación de opciones** (`CC.md §3` + [`fx-workflow-authoring §7.0`](../../fx-workflow-authoring/SKILL.md)): estructuradas (`AskUserQuestion`) como default interactivo; la tabla de abajo es el **fallback** cuando el runtime no tiene la tool. **Headless:** ninguna de las dos — el CP resuelve por su fail-open/fail-closed declarado y **no intenta** la tool.


| #   | Acción                                                                                 |
| --- | -------------------------------------------------------------------------------------- |
| 1   | resolver todos a favor de `{SOURCE_BRANCH}` (`git checkout {SOURCE_BRANCH} -- {file}`) |
| 2   | resolver manualmente (workflow espera hasta `git diff --diff-filter=U` vacío)          |
| 3   | abort merge (`git merge --abort`) y cancelar deploy                                    |

🛑 STOP — Responde con el número.
