# ISSUE-025 — UI admin del ledger: pestaña Finanzas, participantes y movimientos

- **Epic:** EPIC-006
- **Priority:** P1
- **Story points:** 5
- **Status:** Planned
- **Dependencies:** ISSUE-023 (consume sus APIs); secuenciar con ISSUE-026 y
  ISSUE-027 (los tres tocan `app/admin/components/finance/`; este issue es el
  único que toca `app/admin/page.tsx`)
- **User stories:** US-014
- **Agents:** frontend-specialist
- **Skills:** implement, frontend
- **Write-set:** `app/admin/page.tsx` (shell de la pestaña),
  `app/admin/admin.module.css` (si hace falta),
  `app/admin/components/finance/` (nuevo: `LedgerTab.tsx`,
  `ParticipantsManager.tsx`, `TransactionList.tsx`, `TransactionForm.tsx`,
  `money.ts`, css modules), `app/admin/components/index.ts`, tests.

## Objetivo

La pestaña "Finanzas" del evento seleccionado con gestión de participantes y
registro/edición de gastos e ingresos. Los saldos/settlements llegan en
ISSUE-026 (este issue deja el contenedor listo con un placeholder).

## Cambios exactos

### Shell en `app/admin/page.tsx`

- Nueva pestaña "Finanzas" del evento seleccionado, junto a las existentes.
  Gating igual que el resto: visible para viewer en modo lectura y para
  manager con mutaciones (`canManageSelectedEvent`, `app/admin/page.tsx:102`)
  — pendiente P1b del PLAN; si José restringe a manager, reusar el mismo
  gate de la pestaña `config`.
- El shell solo monta `<LedgerTab eventId={...} readOnly={isReadOnly} />` —
  TODO el contenido vive en `components/finance/` para que ISSUE-026 no tenga
  que tocar `page.tsx` (gotcha #5 del PLAN: el archivo es enorme y es el
  punto de solape).

### `app/admin/components/finance/` (nuevo)

- `money.ts` — helpers únicos de dinero en UI: `formatCents(cents, currency)`
  con `Intl.NumberFormat('es-MX')`, y `parseAmountToCents(input)` (acepta
  "1,234.50" → 123450; rechaza >2 decimales y negativos). **Único** punto de
  conversión pesos↔centavos del frontend; test unitario con edge cases.
- `LedgerTab.tsx` — contenedor: carga participantes y movimientos
  (`/api/admin/ledger/participants|transactions`), estados
  loading/error/empty, y organiza secciones con `SettingsDisclosure`
  (mobile-first, patrón de la pestaña Check-in). Deja
  `<section data-testid="ledger-balances-slot" />` como punto de montaje para
  ISSUE-026.
- `ParticipantsManager.tsx` — lista + alta (nombre, email opcional) +
  edición/desactivación. Nombre duplicado → mostrar el 409 del API inline.
  En `readOnly` solo lista. El nodo `kind='stripe'` (viene del GET, PLAN
  §2.6a) se muestra con badge "Stripe" y **sin** acciones de
  edición/desactivación; en los selects de participantes aparece como
  "Stripe (cuenta del evento)". La UX específica de Stripe (defaults por
  modo, retiros, toggle) llega en ISSUE-027 — aquí solo debe renderizarse
  sin romperse y ser seleccionable como pagó/recibió.
- `TransactionList.tsx` — tabla/cards responsive de movimientos activos:
  tipo (badge gasto/ingreso), descripción, quién pagó/recibió, fecha, monto
  formateado, reparto colapsable; acciones editar/eliminar (confirm) solo
  manager.
- `TransactionForm.tsx` — modal/disclosure de alta y edición:
  tipo, descripción, monto (input → `parseAmountToCents`), fecha
  (default hoy), quién pagó/recibió (select de participantes **activos**),
  reparto: "Partes iguales" (checkboxes de participantes; el server calcula
  vía `splitMode: 'equal'`) o "Montos personalizados" (inputs por
  participante con suma en vivo y aviso si no cuadra — el server revalida).
  Errores del API (moneda, shares, cap) mostrados inline.
- CSS modules propios siguiendo `CheckinSettings`/`config/*` (tokens de
  `admin.module.css`, sin estilos inline).

## Acceptance criteria

```gherkin
Given un manager con un evento seleccionado
When abre la pestaña Finanzas
Then ve participantes y movimientos, y puede dar de alta ambos

Given el formulario de gasto con monto "1,500.00" y 3 participantes en partes iguales
When guarda
Then el POST manda amountCents=150000 y splitMode 'equal' (el server reparte)

Given reparto personalizado cuya suma no cuadra con el monto
Then el submit se bloquea client-side con el faltante/sobrante visible

Given un viewer
Then ve todo en modo lectura sin botones de alta/edición/eliminación

Given un movimiento eliminado (confirm aceptado)
Then desaparece de la lista sin recargar la página

Given viewport 375px
Then las secciones usan disclosures y la lista de movimientos es usable (cards)
```

## Tests requeridos

`tests/ledger-admin-registro-ui.test.ts` (patrón
`tests/admin-refinement-ui.test.ts`): render de la pestaña por rol
(readOnly), `parseAmountToCents`/`formatCents` edge cases (decimales, comas,
negativos), payload exacto del submit (equal y custom), manejo de 409/400 del
API, render del nodo Stripe (badge, sin acciones de edición, seleccionable
como payer), y que `page.tsx` solo monta el shell (contrato del slot para
ISSUE-026).
