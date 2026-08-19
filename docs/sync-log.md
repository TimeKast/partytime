# Documentation sync log

## Sync — 2026-08-18

### Summary

- Files scanned: 5 release/backlog/audit documents.
- Drift items: 7.
- Auto-fixed: 7.
- Manual review: 0.

### Drift items

- **ROLLOUT-001:** el plan maestro aún marcaba deploy/migración como pendientes; actualizado con commit, DB gates y smokes productivos.
- **ROLLOUT-002:** el epic decía “ready”; actualizado a `Shipped to production`.
- **ROLLOUT-003:** ISSUE-002 conservaba la migración como frontera futura; actualizado con promoción y verificación reales.
- **ROLLOUT-004:** ISSUE-004 conservaba gates operacionales abiertos; actualizado con resultados productivos y observación programada.
- **ROLLOUT-005:** el addendum de seguridad terminaba antes del rollout; añadida evidencia productiva sin reescribir el veredicto histórico.

## Sync — 2026-08-18 (feedback de pagos y operación)

### Summary

- Files scanned: 8 documentos de plan, epic, issue y runbook; contratos de
  pago, evento público y check-in admin.
- Drift items: 5.
- Auto-fixed: 5.
- Manual review: 1 corrida Stripe test-mode pendiente.

### Drift items

- **PAY-001:** PLAN/ISSUE-010/ISSUE-011 aún definían precio por RSVP y
  `quantity=1`; actualizados a cuota por persona, cantidad 1/2 desde el RSVP
  persistido y total exacto en `amount_cents`.
- **PAY-002:** la documentación no describía el bloqueo de `plus_one` ante
  pagos `created`/`paid` ni la relectura que cierra la carrera de creación de
  Checkout; contratos y delivery evidence sincronizados.
- **PAY-003:** la auditoría Tier 4 detectó que una actualización concurrente
  anterior al insert del pago podía dejar dos lugares cobrados como uno;
  contratos actualizados con el bloqueo desde `pending_payment`, predicado en
  la propia fila y barrera `FOR SHARE`.
- **PAY-004:** ISSUE-011 aún prescribía expirar la sesión anterior como
  `best-effort`; reemplazado por reconciliación fail-closed (`expired` +
  `unpaid`) antes de mutar el ledger o crear otra Checkout.
- **UX-001:** el flujo documentado no mostraba el total antes de Stripe;
  añadido DTO público seguro, resumen dinámico 1×/2× y comportamiento de links
  de cortesía.
- **CHECKIN-001:** ISSUE-018 omitía que el dashboard inicial no cargaba estado
  hasta visitar Configuración; documentado GET para viewer, PATCH para manager,
  tarjeta operativa y DTO allowlist sin hash.
- **NAV-001:** settings seguía descrito como superficie monolítica; plan/epic
  actualizados a cinco pestañas accesibles, disclosures y navegación
  mobile-first sin pérdida de controles.

### Manual review

- **E2E-001:** `docs/features/payments/E2E_RUNBOOK.md` incorpora el Escenario
  1B para validar en Stripe test mode el modal, Checkout y persistencia de una
  reservación con +1. Permanece sin marcar hasta ejecutarlo tras el deploy de
  esta corrección.
