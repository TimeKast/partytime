# ISSUE-026 — UI de saldos, simplificación de deudas y settlements

- **Epic:** EPIC-006
- **Priority:** P1
- **Story points:** 3
- **Status:** Planned
- **Dependencies:** ISSUE-024 (consume summary/settlements), ISSUE-025 (monta
  dentro del slot de `LedgerTab`; ambos tocan `app/admin/components/finance/`
  → en serie, Wave 3); ISSUE-027 va después (edita componentes de este issue)
- **User stories:** US-015, US-016
- **Agents:** frontend-specialist
- **Skills:** implement, frontend
- **Write-set:** `app/admin/components/finance/` (nuevo: `LedgerSummary.tsx`,
  `SettlementsPanel.tsx`, css modules; edita `LedgerTab.tsx` para llenar el
  slot), tests. **No toca `app/admin/page.tsx`** (contrato del shell,
  ISSUE-025).
- **Nota P2a:** este issue renderiza `balances`/`suggestedTransfers` tal como
  los entrega el summary (que ya viene particionado por modo, ISSUE-024) y
  trata las transfers con `involvesStripe` como cualquier otra con etiqueta
  genérica. La UX dedicada de Stripe (sección remanente, toggle, acción
  "Registrar retiro", labels "retiro sugerido"/"aporte al fondo") es de
  ISSUE-027 — no duplicarla aquí.

## Objetivo

Cerrar el ciclo Splitwise en la UI: resumen financiero, saldo de cada quien,
"quién le paga a quién" y registro de pagos entre participantes hasta que
`settled=true`.

## Cambios exactos

### `LedgerSummary.tsx` (nuevo)

- Consume `GET /api/admin/ledger/summary?eventId=`.
- Cards de totales (patrón `StatsCards`): Gastos, Ingresos manuales,
  Ingresos Stripe, Neto. (La explicación del rol de Stripe según el modo y
  su sección dedicada llegan en ISSUE-027; aquí la card solo muestra
  `totals.stripePaidCents`.)
- Lista de saldos: participante, monto formateado y dirección clara —
  positivo "le deben X" (verde), negativo "debe X" (rojo), cero "saldado".
  Participantes desactivados con saldo ≠ 0 aparecen marcados como inactivos.
- Banner "Todo saldado ✓" cuando `settled=true`.
- Estado de error dedicado si el API responde `LEDGER_INVARIANT` (mensaje
  "los datos no cuadran, revisa los movimientos" — nunca pintar saldos con
  error 500 silencioso).

### `SettlementsPanel.tsx` (nuevo)

- Sección "Para saldar" con las `suggestedTransfers`: "B le paga $500 a A" +
  botón **"Registrar pago"** (solo manager) que abre el form de settlement
  **prellenado** (from/to/monto/fecha hoy) — editable antes de guardar
  (pagos parciales válidos, ISSUE-024).
- Alta manual de settlement (from, to, monto, fecha, nota) sin pasar por una
  sugerencia.
- Historial de settlements activos con editar/eliminar (confirm, solo
  manager); viewer ve todo en lectura.
- Tras cualquier mutación (settlement o — vía callback del contenedor —
  movimientos de ISSUE-025) se refresca el summary: los saldos SIEMPRE vienen
  del servidor, la UI jamás los calcula localmente (fuente única, PLAN §2.4).

### `LedgerTab.tsx` (editar)

- Reemplazar el slot `ledger-balances-slot` por `<LedgerSummary>` +
  `<SettlementsPanel>` y cablear el refresh compartido del summary después
  de mutaciones de movimientos/settlements.

## Acceptance criteria

```gherkin
Given el summary con B=−500, C=−200, A=+700
When el manager abre Finanzas
Then ve las dos transferencias sugeridas y los saldos con dirección clara

Given clic en "Registrar pago" de la sugerencia B→A 500
Then el form abre prellenado y al guardar el summary se refresca y B queda saldado

Given un pago parcial editado a 300 antes de guardar
Then se registra y la sugerencia siguiente refleja el remanente (server-driven)

Given settled=true
Then aparece el banner de todo saldado y la sección "Para saldar" queda vacía

Given un viewer
Then ve saldos, sugerencias e historial sin ningún botón de registro/edición

Given una respuesta LEDGER_INVARIANT
Then se muestra el estado de error dedicado, sin saldos parciales pintados
```

## Tests requeridos

`tests/ledger-balances-ui.test.ts`: render de saldos por signo, prellenado
del settlement desde sugerencia, refresh post-mutación (mock del fetch de
summary llamado de nuevo), gating por rol, banner saldado, estado
`LEDGER_INVARIANT`, y que `app/admin/page.tsx` no fue modificado (write-set
respetado — verificable en el diff del issue).
