# Cómo contribuir a {{repo}}

Gracias por sumarte. Este repo lo mantiene TimeKast; tú trabajas desde un **fork** y propones
cambios con **pull requests**. Un miembro del equipo revisa, prueba y mergea cada PR.

## 1. Arranque

1. Forkea `{{owner}}/{{repo}}` en GitHub y clona tu fork.
2. Instala dependencias: `pnpm install`.
3. Variables de entorno: el proyecto las lee de la bóveda de secretos (no hay `.env.local`).
   Sigue `.claude/skills/sk-vault/SKILL.md` — primera vez en tu máquina (`infisical login`) y el
   día a día. Tienes acceso **solo** al entorno `local`; si necesitas una variable nueva, pídela al
   equipo: no la agregues tú.
4. `pnpm dev` para levantar la app.

## 2. Antes de abrir el PR

- Trabaja en una rama de tu fork y abre el PR contra **`{{working_branch}}`**.
- Corre `pnpm verify` (lint + typecheck + tests) y que pase en verde.
- Describe en el PR **qué cambia para el usuario** y cómo probarlo.

## 3. Lo que un PR no puede tocar

Un PR que modifique cualquiera de estas rutas se regresa sin revisarlo — lo que corre alrededor
del producto lo cambia el equipo:

- `.claude/`, `CLAUDE.md`, `.husky/`, `.github/`, `scripts/`, `.gitignore`, `.timekast/`
- archivos de configuración de herramientas (`*.config.*`), `vitest.setup*`, `.npmrc`,
  `.pnpmfile.cjs`, `pnpm-workspace.yaml`
- los campos `scripts` y `pnpm` de `package.json`

Agregar una dependencia sí se puede: menciónala en el PR y por qué hace falta.

## 4. Reglas del repo que aplican y las que no

Las reglas de `.claude/rules/` describen cómo se escribe código aquí (estructura de `src/`,
componentes, base de datos, tests) y **sí aplican** a tu código.

Algunas describen el flujo interno del equipo y **no te aplican**:

- crear issues con `/backlog add` (`SK.md §5`) — tú propones cambios por PR;
- leer y ejecutar workflows del kit (`CC.md §8`) — los workflows no están en este repo;
- `git push` a ramas del repo, deploys y migraciones contra bases compartidas — los hace el equipo.

## 5. Después del merge

El equipo mergea tu PR a `{{working_branch}}`; el deploy de preview sale de ese merge. Si algo
falla en las pruebas end-to-end, te pediremos el ajuste en un PR nuevo.
