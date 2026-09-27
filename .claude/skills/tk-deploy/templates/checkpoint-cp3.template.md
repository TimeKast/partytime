<!--
  ===== tk-deploy: CP3 — Unexpected commits in origin/main =====
  Emitted in Phase 3 SOLO si después del filtro de §3.1 quedan commits.
  El filtro excluye los subjects creados por el propio /deploy:
    grep -vE '^[0-9a-f]+ (release|ship)(\([^)]+\))?: '
  Si tras ese filtro UNEXPECTED está vacío, Phase 4 corre directo (no CP3).

  La opción 2 (rebase) solo es segura si {SOURCE_BRANCH} NO está pusheada: §3.3
  computa SOURCE_PUSHED con `git ls-remote --heads origin {SOURCE_BRANCH}` y de ahí
  deriva el texto de {REBASE_SAFETY_NOTE} (⚠️ si está pusheada — rebase reescribiría
  historia pública y el push de Phase 6 sería non-fast-forward; ℹ️ si no, rebase seguro).

  Placeholders:
    {SOURCE_BRANCH}, {UNEXPECTED_COMMITS}, {REBASE_SAFETY_NOTE}
-->

## 🛑 CP3 — Commits inesperados en `origin/main`

`origin/main` tiene commits que NO son del propio `/deploy` (no son `release:` ni `ship:`, con o sin scope) ni están en `{SOURCE_BRANCH}`:

```
{UNEXPECTED_COMMITS}
```

Estos commits pueden ser hotfixes directos a main, merges manuales fuera del workflow, o force-pushes. Revísalos antes de proseguir — el merge puede traer cambios que no pasaron por `pnpm verify` ni por los checkpoints del workflow.

### Opciones
> **Presentación de opciones** (`CC.md §3` + [`fx-workflow-authoring §7.0`](../../fx-workflow-authoring/SKILL.md)): estructuradas (`AskUserQuestion`) como default interactivo; la tabla de abajo es el **fallback** cuando el runtime no tiene la tool. **Headless:** ninguna de las dos — el CP resuelve por su fail-open/fail-closed declarado y **no intenta** la tool.


| #   | Acción                                                                                   |
| --- | ---------------------------------------------------------------------------------------- |
| 1   | continuar al merge — Phase 4 los integra                                                 |
| 2   | rebase `{SOURCE_BRANCH}` sobre `origin/main` ANTES de mergear                            |
| 3   | cancelar deploy                                                                          |

{REBASE_SAFETY_NOTE}

🛑 STOP — Responde con el número.
