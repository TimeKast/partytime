# ISSUE-024 — API de settlements, resumen financiero y config del modo Stripe

- **Epic:** EPIC-006
- **Priority:** P0
- **Story points:** 5
- **Status:** In progress (rev. 2026-08-19 por P2a: absorbe el toggle de modo
  Stripe y el summary bimodal, PLAN §2.6 — subió de 3 a 5 pts). **Rev. 2
  mismo día:** gherkin fund adjudicado a favor de la matemática implementada
  + delta chico al shape (`contributionsCents`/`pendingCents`, fórmula de
  `remainderCents`) — ver sección Resolución al final.
- **Dependencies:** ISSUE-021, ISSUE-022, **ISSUE-023** (extiende
  `lib/ledger-queries.ts` que 023 crea — write-set solapado → en serie,
  Wave 2)
- **User stories:** US-015, US-016
- **Agents:** backend-specialist
- **Skills:** implement, backend, sk-api
- **Write-set:** `lib/ledger-queries.ts` (extiende),
  `app/api/admin/ledger/settlements/route.ts`,
  `app/api/admin/ledger/config/route.ts`,
  `app/api/admin/ledger/summary/route.ts`, tests. No toca `app/admin/`.

## Objetivo

Registrar pagos entre participantes (incluyendo retiros desde el nodo
Stripe), exponer el toggle de modo Stripe, y entregar el cálculo completo:
saldos, transferencias sugeridas y totales del evento presentados según el
modo (PLAN §2.6b).

## Cambios exactos

### `lib/ledger-queries.ts` (extender)

- `listSettlements(eventId)` — activos, orden `settled_on desc`.
- `createSettlement(...)` / `updateSettlement(...)` /
  `softDeleteSettlement(...)` — mismas reglas que movimientos: participantes
  del evento y activos (FK compuesta + predicado), `from <> to`, moneda
  uniforme del ledger, `amount_cents` entero 1..99,999,999, soft-delete.
- `getLedgerSnapshot(eventId)` — lee en una pasada transacciones activas con
  shares, settlements activos y participantes (con `kind`); input directo
  para `computeBalances` (ISSUE-022).
- `getStripePaidTotal(eventId)` — `SUM(amount_cents)` de `rsvp_payments`
  con `status='paid'` del evento. **Solo lectura**: el ledger jamás muta
  `rsvp_payments` (foco de review, PLAN §7).
- `getLedgerStripeMode(eventId)` / `setLedgerStripeMode(eventId, bool)` —
  lee/escribe `events.ledger_stripe_is_participant`.

### `app/api/admin/ledger/settlements/route.ts` (GET/POST/PATCH/DELETE)

- Auth/RBAC idéntico a ISSUE-023 (GET viewer, mutaciones manager).
- POST body `{ eventId, fromParticipantId, toParticipantId, amountCents,
  currency, settledOn, note? }`. No se valida que el settlement "cuadre" con
  una sugerencia — los participantes pueden pagarse montos parciales o
  arbitrarios; los saldos absorben cualquier pago (§2.2).
- **Retiros de Stripe** (PLAN §2.6a): el nodo Stripe es válido como `from`
  (retiro / "le manda el $ a alguien") y como `to` (aporte al fondo), en
  ambos modos — es un settlement ordinario, sin endpoint aparte. Si el
  cliente lo necesita provisionado, ya lo garantizó el GET de participantes
  (ISSUE-023).
- DTO `{ id, fromParticipantId, toParticipantId, amountCents, currency,
  settledOn, note, createdBy, createdAt }` — test de keys exactas.

### `app/api/admin/ledger/config/route.ts` (GET/PATCH)

- GET (viewer): `{ stripeIsParticipant: boolean,
  stripeIncomeRegisteredCents: number }` — el segundo campo (Σ de ingresos
  activos recibidos por el nodo Stripe) alimenta la advertencia de cambio de
  modo en la UI (gotcha #9; el API **no bloquea** el cambio).
- PATCH (manager): `{ eventId, stripeIsParticipant }` →
  `setLedgerStripeMode`. Responde el mismo shape del GET.

### `app/api/admin/ledger/summary/route.ts` (GET `?eventId=`)

- Auth/RBAC: GET viewer (P1b confirmada).
- Ejecuta `getLedgerSnapshot` → `computeBalances` → `simplifyDebts` →
  `partitionStripeView` (ISSUE-022) con el modo de `getLedgerStripeMode`, y
  responde:

```jsonc
{
  "currency": "MXN",              // moneda vigente del ledger (null si vacío)
  "stripeMode": "participant" | "fund",
  "totals": {
    "expensesCents": 0,            // Σ gastos activos (incluye pagados por Stripe)
    "manualIncomeCents": 0,        // Σ ingresos activos NO recibidos por el nodo Stripe
    "stripePaidCents": 0,          // SUM rsvp_payments paid (solo lectura)
    "netCents": 0                  // manualIncome + stripePaid − expenses
  },
  "stripe": {                      // sección del nodo Stripe, según modo
    "participantId": "…",          // null si aún no se provisiona
    // modo participant: su saldo va ADEMÁS dentro de balances como uno más;
    // aquí solo se reporta el delta de cobros sin registrar:
    "unregisteredPaidCents": 0,    // stripePaidCents − ingresos registrados al nodo
    // modo fund: el nodo NO va en balances; aquí vive su contabilidad:
    "collectedCents": 0,           // = stripePaidCents
    "stripePaidExpensesCents": 0,  // gastos activos con payer = nodo Stripe
    "withdrawnCents": 0,           // settlements activos from = nodo Stripe
    "contributionsCents": 0,       // settlements activos to = nodo Stripe (aportes al fondo)
    // Remanente CASH del fondo (corregido 2026-08-19, ver Resolución abajo):
    "remainderCents": 0,           // collected + contributions − stripePaidExpenses − withdrawn
    // Saldo del nodo en el motor (partitionStripeView.stripeBalanceCents):
    // negativo = el fondo aún debe retiros; positivo = aportes pendientes.
    // Utilidad devengada = remainderCents + pendingCents (documentar en UI).
    "pendingCents": 0
  },
  "balances": [                    // orden: saldo desc, tie-break nombre
    { "participantId": "…", "name": "…", "kind": "person", "balanceCents": 0, "isActive": true }
  ],
  "suggestedTransfers": [          // greedy determinista, no persistidas
    { "fromParticipantId": "…", "toParticipantId": "…", "amountCents": 0,
      "involvesStripe": null }     // 'from' = retiro sugerido, 'to' = aporte al fondo
  ],
  "settled": true                  // modo participant: TODOS los saldos en 0
                                   // modo fund: saldos de personas en 0
}
```

Campos de `stripe` no aplicables al modo activo van en 0/omitidos según fije
el test de shape (una sola forma por modo, sin ambigüedad).

- Si `computeBalances` lanza `LedgerInvariantError` (datos corruptos): 500
  con código `LEDGER_INVARIANT` y log del delta — **nunca** responder saldos
  inventados. Test explícito.
- Participantes desactivados con saldo ≠ 0 SÍ aparecen en `balances` (la
  deuda no desaparece por desactivar a alguien); desactivados con saldo 0 se
  omiten.
- Headers `no-store` (datos financieros, nada cacheable).

## Acceptance criteria

```gherkin
Given el escenario del gherkin de ISSUE-022 (gasto 900 de A + ingreso 300 a B)
When GET summary
Then balances A=+700, B=−500, C=−200, suggestedTransfers [B→A 500, C→A 200] y settled=false

Given un settlement registrado B→A de 500
When GET summary
Then el saldo de B es 0, solo se sugiere C→A 200

Given settlements que dejan todos los saldos en 0
Then settled=true y suggestedTransfers=[]

Given rsvp_payments con dos pagos 'paid' de 25000 y uno 'expired'
Then totals.stripePaidCents=50000 y ningún balance cambia por sí solo

Given modo fund y un gasto de 600 pagado por A con share 100% al nodo Stripe
  ("cubierto por el evento")
Then A=+600, el nodo queda deudor (−600, oculto de balances), la sugerencia es
  Stripe→A 600 marcada involvesStripe='from' (retiro sugerido), y tras
  registrar ese retiro A=0, pendingCents=0 y remainderCents bajó 600

Given modo fund, un gasto de 5000 pagado por el nodo Stripe con share 100% al
  propio nodo (neutro para todos), y un retiro Stripe→A de 600 sin deuda previa
Then A=−600 y el nodo queda ACREEDOR (+600 = pendingCents): la sugerencia es
  A→Stripe 600 marcada involvesStripe='to' (aporte al fondo) — NO 'from' —,
  y stripe.remainderCents = stripePaid + 0 − 5000 − 600

Given modo participant con ingreso registrado al nodo Stripe y retiros parciales
Then el nodo aparece en balances, settled solo cuando TODO (incluido Stripe)
  está en 0, y stripe.unregisteredPaidCents refleja el delta sin registrar

Given un manager que cambia el modo vía PATCH config
When se repite el GET summary
Then la respuesta cambia de forma según el modo SIN que ningún dato persistido
  se haya modificado (mismo snapshot, otra partición)

Given un settlement con from == to o de participantes de otro evento
Then 400/409 sin insertar

Given un viewer
Then GET summary/settlements/config 200; POST/PATCH 403
```

## Tests requeridos

`tests/ledger-settlements-api.test.ts`, `tests/ledger-config-api.test.ts` y
`tests/ledger-summary-api.test.ts`: criterios de arriba + keys exactas de
DTOs (una forma de `stripe` por modo) + `LEDGER_INVARIANT` en corrupción
simulada + orden determinista de balances y sugerencias + `no-store` +
verificación de que ninguna query del ledger escribe en `rsvp_payments` +
los dos escenarios fund corregidos (retiro sugerido vs aporte al fondo) y
`remainderCents` con aportes incluidos.

## Resolución 2026-08-19 — adjudicación del gherkin "retiro Stripe→A"

Durante la ejecución de este issue, el agente detectó (y verificó con test
unitario y contra la DB) que el gherkin original de modo fund pedía
`involvesStripe='from'` en un escenario donde la matemática de §2.2 produce
`'to'`. **Adjudicación del Architect: la implementación (matemática
verificada) es la correcta; el gherkin tenía un error de construcción del
escenario.** Detalle:

- Un settlement Stripe→A (retiro) suma al nodo y resta a A (§2.2, sin caso
  especial). Sin deuda previa, el nodo queda **acreedor** (+600) — "el fondo
  fronteó dinero" — y la única sugerencia posible es A→Stripe = `'to'`
  (aporte al fondo). El gherkin decía `'from'`: imposible sin romper Σ=0 o
  sin meter lógica especial por `kind`, que el diseño prohíbe expresamente.
- El caso que SÍ produce `'from'` (retiro sugerido) es nodo **deudor**: un
  gasto con share al nodo ("cubierto por el evento") pagado por una persona.
  Ese es además el flujo canónico completo de "alguien se cobra de lo de
  Stripe" en modo fund: share al nodo + retiro que lo salda deja a todos
  en 0. Ambos escenarios quedaron fijados en el gherkin corregido.
- **ISSUE-022 NO se reabre**: cero cambios al motor; la semántica uniforme
  de settlements es la correcta.
- Corrección adicional detectada en la misma revisión: `remainderCents`
  omitía los aportes al fondo (settlements activos `to` = nodo), que son
  cash que regresa al fondo y que el propio motor sugiere vía `'to'`.
  Fórmula corregida: `collected + contributions − stripePaidExpenses −
  withdrawn`; se agregan `contributionsCents` y `pendingCents` (saldo del
  nodo) al shape — delta chico sobre la implementación ya hecha.
- La tabla de labels de PLAN §2.6b era correcta y no cambia; se le agregó
  prosa aclarando cuándo aparece cada sugerencia. ISSUE-027 construye el
  copy sobre `involvesStripe` tal como lo devuelve la API actual.
