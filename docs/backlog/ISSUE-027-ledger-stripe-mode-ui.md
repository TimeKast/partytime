# ISSUE-027 — UI del dinero Stripe: toggle de modo, retiros y remanente

- **Epic:** EPIC-006
- **Priority:** P1
- **Story points:** 3
- **Status:** Planned (nace de la resolución de P2a, PLAN-EPIC-006.md §2.6)
- **Dependencies:** ISSUE-024 (config + summary bimodal), ISSUE-025 y
  ISSUE-026 (edita componentes que ellos crean → en serie al final de Wave 3)
- **User stories:** US-017
- **Agents:** frontend-specialist
- **Skills:** implement, frontend
- **Write-set:** `app/admin/components/finance/` (nuevo: `StripePanel.tsx` +
  css module; retoques a `LedgerTab.tsx`, `TransactionForm.tsx`,
  `SettlementsPanel.tsx`, `LedgerSummary.tsx`), tests. **No toca
  `app/admin/page.tsx`** (contrato del shell, ISSUE-025).

## Objetivo

Toda la experiencia de "el dinero de Stripe" dentro de la pestaña Finanzas:
marcar el modo del evento, registrar retiros ("alguien se cobra de lo de
Stripe" / "el que controla la cuenta le manda el $ a alguien"), ver el
remanente de utilidad en modo fondo y meter los cobros al grafo en modo
participante. Todo sobre las APIs de ISSUE-023/024 — cero cálculo local.

## Cambios exactos

### `StripePanel.tsx` (nuevo, montado por `LedgerTab`)

- Consume `GET /api/admin/ledger/config` y la sección `stripe` del summary.
- **Toggle de modo** (solo manager; viewer lo ve deshabilitado con el estado
  actual): "Stripe cuenta como participante — la cuenta es de alguien y todo
  lo cobrado se reparte" vs "Stripe es fondo del evento — cubre gastos y el
  sobrante es utilidad". Copy corto explicando cada modo.
- **Advertencia de cambio de modo** (gotcha #9): si
  `stripeIncomeRegisteredCents > 0` y se cambia a modo fondo, confirm con
  texto de posible doble conteo (los ingresos registrados al nodo siguen en
  los saldos de personas Y el remanente usa el cobrado completo). El API no
  bloquea; la UI exige el confirm.
- **Modo fondo:** mini-estado de cuenta con `collectedCents`,
  `contributionsCents` (aportes al fondo), `stripePaidExpensesCents`,
  `withdrawnCents` y `remainderCents` ("Remanente (utilidad)"; en rojo si
  negativo — se retiró/gastó más de lo cobrado). Si `pendingCents ≠ 0`,
  línea adicional: negativo = "retiros pendientes por $X", positivo =
  "aportes pendientes por $X" (utilidad devengada = remanente + pendiente).
- **Modo participante:** saldo del nodo Stripe (viene en `balances`) con nota
  "este dinero es del grupo — saldado cuando llegue a 0", y aviso
  `unregisteredPaidCents > 0`: "Tienes $X cobrados por Stripe sin registrar"
  con botón **"Registrar cobros Stripe"** → abre `TransactionForm` prellenado
  (income, recibió = nodo Stripe, monto = delta, reparto entre personas
  activas por partes iguales; todo editable antes de guardar).
- **"Registrar retiro de Stripe"** (ambos modos, solo manager): abre el form
  de settlement prellenado con `from` = nodo Stripe fijo, `to` seleccionable,
  fecha hoy — es un settlement ordinario contra la API de ISSUE-024.

### Retoques a componentes existentes

- `SettlementsPanel.tsx` (ISSUE-026): las `suggestedTransfers` con
  `involvesStripe='from'` se etiquetan "Retiro de Stripe sugerido" y su CTA
  dice "Registrar retiro"; con `'to'`, "Aporte al fondo". Historial: los
  settlements que involucran al nodo muestran el badge Stripe.
- `TransactionForm.tsx` (ISSUE-025): en modo fondo, la opción de reparto
  "Cubierto por el evento" (share 100% al nodo Stripe) está disponible para
  **cualquier pagador**, no solo payer = Stripe (PLAN §2.6b, aclaración
  2026-08-19): "A pagó el venue y se cobrará del fondo" = gasto pagado por A
  con share al nodo — eso deja al nodo deudor y genera la sugerencia "retiro
  de Stripe sugerido". Defaults: payer = Stripe ⇒ "Cubierto por el evento"
  preseleccionado; payer = persona ⇒ reparto entre personas preseleccionado
  con "Cubierto por el evento" a un clic. En modo participante no hay
  default especial.
- `LedgerSummary.tsx` (ISSUE-026): la card de Ingresos Stripe enlaza al
  `StripePanel` y su subtítulo refleja el modo ("entra a las cuentas" /
  "fondo del evento").

## Acceptance criteria

```gherkin
Given un evento en modo fondo con cobros Stripe, un gasto pagado por Stripe
  cubierto por el evento y un retiro registrado
When el manager abre Finanzas
Then ve el estado de cuenta Stripe con el remanente correcto y ningún saldo
  de persona alterado por el gasto cubierto

Given una sugerencia involvesStripe='from'
Then se muestra como "Retiro de Stripe sugerido" y su CTA prellena el
  settlement con from = nodo Stripe (no editable) y to = el acreedor

Given modo participante con cobros sin registrar
When el manager usa "Registrar cobros Stripe"
Then el form abre prellenado con el delta exacto y al guardar el aviso
  desaparece y el nodo Stripe aparece en los saldos

Given ingresos ya registrados al nodo Stripe
When el manager intenta cambiar a modo fondo
Then aparece el confirm de doble conteo y solo al aceptarlo se hace el PATCH

Given un viewer
Then ve el panel completo (modo, remanente/saldos, historial) sin toggle
  habilitado ni botones de registro

Given el cambio de modo confirmado
Then el summary se re-consulta y la vista cambia sin recargar la página
```

## Tests requeridos

`tests/ledger-stripe-mode-ui.test.ts`: render por modo (fund/participant),
gating por rol, confirm de cambio de modo (con y sin ingresos registrados),
prellenados exactos de retiro y de "Registrar cobros Stripe" (payloads),
etiquetas de sugerencias `involvesStripe`, default "Cubierto por el evento"
en modo fondo, y que `app/admin/page.tsx` no fue modificado (write-set).
