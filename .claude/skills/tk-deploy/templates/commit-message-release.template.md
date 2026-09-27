<!--
  ===== tk-deploy: release-mode merge commit template =====
  Used in Phase 5 when MODE === 'release'.
  Placeholders: {NEW_VERSION}, {SOURCE_BRANCH}, {COMMIT_SUMMARY?}

  Format: Conventional Commits-compatible.
  Type `release` is custom but accepted by validate-commit (versioned merge marker).
  Pairs with the `v{NEW_VERSION}` tag created in the same phase.

  If COMMIT_SUMMARY is empty, default body is "See CHANGELOG for details".

  🔴 CONTRATO con Phase 3 (CP3 filter):
  El subject EMPIEZA con `release: ` SIN scope por convención del workflow.
  El filtro de Phase 3 (`§3.1` del SKILL) excluye estos subjects del CP3 trigger
  con regex `^[0-9a-f]+ (release|ship)(\([^)]+\))?: ` — soporta `release(scope):` también
  por compatibilidad futura, pero hoy tk-deploy genera SIN scope.

  Editar el subject a algo distinto de `release: ` (e.g. `chore(release):` o `release v1.2.3:`)
  ROMPE el contrato silenciosamente: Phase 3 dejará de filtrar los merge commits del propio
  workflow y el user verá CP3 trigger en cada deploy con falsos positivos.

  Si un derivado necesita cambiar el subject, actualizar también el regex de Phase 3 §3.1
  en `.claude/skills/tk-deploy/SKILL.md` Y agregar test fixture documentando el cambio.
-->

release: v{NEW_VERSION} — merge {SOURCE_BRANCH} into main

{COMMIT_SUMMARY:-See CHANGELOG for details}
