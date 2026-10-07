# Rutas que un PR de colaborador no puede tocar

> **SSOT:** `REJECTED_PATHS` y `REJECTED_PACKAGE_FIELDS` en `cli/src/lib/prune-pr-check.ts`, que
> aplica `factory prune check-pr` antes del checkout. Este archivo explica la lista; si difieren,
> manda el código.

El socio corre el código del PR en su máquina (`pnpm install`, `pnpm verify`). La org acepta ese
riesgo **para código de producto**. Todo lo que se ejecuta alrededor del producto, o que decide
qué de la metodología entra al repo, se rechaza por ruta:

| Ruta | Por qué |
| --- | --- |
| `.claude/` | El cerebro del kit: reglas, hooks del agente, políticas — incluido `prune-tiers.json`, que decide qué se comparte |
| `CLAUDE.md` | Instrucciones que el agente del socio sigue |
| `.husky/` | Hooks de git: corren en la máquina de quien commitea (el guard de `prune` vive ahí) |
| `.github/` | CI y configuración de GitHub |
| `scripts/` | Lo que corren los hooks y `pnpm verify` |
| `.gitignore` | Decide qué de la metodología entra al repo |
| `.timekast/` | El interruptor del repo compartido (`prune.json`) y el estado del kit |
| `*.config.*` (cualquier nivel) | Configuración de herramientas que ejecutan código: next, vitest, eslint, playwright, postcss… |
| `vitest.setup*` | Código que corre antes de cada test |
| `.npmrc`, `.pnpmfile.cjs`, `pnpm-workspace.yaml` | pnpm: registro, hooks de instalación |
| `package.json#scripts`, `package.json#pnpm` | Comandos que corren en la máquina del socio |

**Sí pasa:** dependencias nuevas en `package.json` — no se rechazan, pero `/integrate` las marca
y el socio decide antes de instalarlas.

**Renames:** cuentan los dos lados. Mover `.husky/pre-commit` a `src/` también se rechaza.

**Un PR rechazado** se regresa al colaborador con la ruta y la razón, o un socio rehace ese cambio
en su propia rama. No hay excepción manual: si una ruta de esta lista tiene que cambiar, la cambia
un socio.
