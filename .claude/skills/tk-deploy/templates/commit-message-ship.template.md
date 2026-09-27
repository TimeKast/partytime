<!--
  ===== tk-deploy: ship-mode merge commit template =====
  Used in Phase 5 when MODE === 'ship'.
  Placeholders: {SOURCE_BRANCH}, {COMMIT_SUMMARY?}

  Format: Conventional Commits-compatible.
  Type `ship` is custom but accepted by the repo's validate-commit hook
  (treated like `chore`/`build` — non-versioned merge marker).

  If COMMIT_SUMMARY is empty, omit the body entirely.

  🔴 CONTRATO con Phase 3 (CP3 filter):
  El subject EMPIEZA con `ship: ` SIN scope por convención del workflow.
  El filtro de Phase 3 (`§3.1` del SKILL) excluye estos subjects del CP3 trigger
  con regex `^[0-9a-f]+ (release|ship)(\([^)]+\))?: ` — soporta `ship(scope):` también
  por compatibilidad futura, pero hoy tk-deploy genera SIN scope.

  Editar el subject a algo distinto de `ship: ` ROMPE el contrato silenciosamente:
  Phase 3 dejará de filtrar los merge commits del propio workflow y el user verá
  CP3 trigger en cada deploy con falsos positivos.

  Si un derivado necesita cambiar el subject, actualizar también el regex de Phase 3 §3.1
  en `.claude/skills/tk-deploy/SKILL.md` Y agregar test fixture documentando el cambio.
-->

ship: merge {SOURCE_BRANCH} into main

{COMMIT_SUMMARY}
