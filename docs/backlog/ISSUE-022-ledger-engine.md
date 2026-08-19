# ISSUE-022 — Motor puro del ledger: split, saldos y simplificación de deudas

- **Epic:** EPIC-006
- **Priority:** P0
- **Story points:** 3
- **Status:** Planned
- **Dependencies:** ninguna (funciones puras sin I/O; paralelo con ISSUE-021 —
  write-sets disjuntos, Wave 1)
- **User stories:** US-015, US-016
- **Agents:** backend-specialist
- **Skills:** implement, backend
- **Write-set:** `lib/event-ledger.ts` (nuevo),
  `tests/event-ledger.test.ts` (nuevo). No toca `lib/schema.ts` ni
  `lib/queries.ts`.

## Objetivo

Toda la matemática del ledger como funciones puras deterministas sobre
centavos enteros, con tipos propios (no tipos Drizzle — el módulo no importa
schema para poder correr en Wave 1 y testearse aislado). Es el foco principal
de la review tier 3 del epic.

## Cambios exactos

### `lib/event-ledger.ts` (nuevo)

Tipos de entrada mínimos (interfaces locales):

```ts
interface LedgerTransaction { id: string; type: 'expense' | 'income'; participantId: string; amountCents: number; deletedAt: Date | null }
interface LedgerShare { transactionId: string; participantId: string; shareCents: number }
interface LedgerSettlement { fromParticipantId: string; toParticipantId: string; amountCents: number; deletedAt: Date | null }
interface SuggestedTransfer { fromParticipantId: string; toParticipantId: string; amountCents: number }
```

Funciones exportadas:

- `splitEqual(amountCents: number, participantIds: string[]): Map<string, number>`
  — división entera + **largest remainder**: `base = floor(amount/n)`, y los
  primeros `amount % n` participantes **en orden ascendente de id** reciben
  `base + 1`. Determinista: mismo input → mismo output. Lanza en `n = 0`,
  `amountCents <= 0` o no-entero.
- `computeBalances(transactions, shares, settlements): Map<string, number>`
  — convención de signos de PLAN-EPIC-006.md §2.2:
  - expense: `+amount` al pagador, `−share` a cada participante del reparto
  - income: `−amount` al receptor, `+share` a cada beneficiario
  - settlement: `+amount` al que paga, `−amount` al que recibe
  - Ignora transactions/settlements con `deletedAt !== null` (y las shares de
    transacciones ignoradas).
  - **Postcondición verificada en runtime:** la suma de todos los saldos es
    exactamente 0; si no (datos corruptos: shares que no cuadran), lanza
    `LedgerInvariantError` con el delta — nunca devolver saldos silenciosamente
    incorrectos.
- `simplifyDebts(balances: Map<string, number>): SuggestedTransfer[]`
  — greedy: separar deudores (saldo < 0) y acreedores (> 0), ordenar por
  monto desc con tie-break por id asc, emparejar mayor con mayor, transferir
  `min(|deuda|, crédito)`, repetir. Garantiza ≤ n−1 transferencias y output
  determinista. Con saldos todos en 0 → `[]`.
- `assertValidShares(amountCents: number, shares: number[]): void` — valida
  `Σ shares === amountCents`, todos > 0 y enteros; lo reutiliza la API
  (ISSUE-023) antes de armar la sentencia CTE.
- `partitionStripeView(balances, transfers, stripeParticipantId | null, mode:
  'participant' | 'fund')` — **presentación pura, no recalcula nada** (PLAN
  §2.6): con `mode='participant'` (o sin nodo Stripe) devuelve balances y
  transfers intactos; con `mode='fund'` aparta el nodo Stripe → devuelve
  `{ personBalances, stripeBalanceCents, transfers }` donde cada transfer que
  involucra al nodo Stripe viene marcada (`involvesStripe: 'from' | 'to' |
  null`) para que la UI la etiquete "retiro de Stripe sugerido" / "aporte al
  fondo". Invariante verificable: Σ personBalances + stripeBalanceCents = 0.

**El nodo Stripe NO es especial para el motor** (decisión PLAN §2.6a):
`computeBalances` y `simplifyDebts` lo tratan como cualquier participante —
retiros = settlements con `fromParticipantId` Stripe, gastos pagados por la
cuenta = expense con `participantId` Stripe. Ningún branch por `kind` dentro
de estas funciones.

Prohibido en todo el módulo: aritmética de punto flotante sobre montos
(`Number.isSafeInteger` en cada entrada), `Math.random`, `Date.now` — todo
puro y determinista.

## Acceptance criteria

```gherkin
Given amountCents=1000 y 3 participantes ["c","a","b"]
When splitEqual
Then a=334, b=333, c=333 (orden asc de id recibe el residuo) y la suma es 1000

Given un gasto de 900 pagado por A repartido 300/300/300 entre A,B,C
Then saldos A=+600, B=−300, C=−300 y Σ=0

Given además un ingreso en efectivo de 300 recibido por B repartido 100/100/100
Then saldos A=+700, B=−500, C=−200 y Σ=0

Given esos saldos
When simplifyDebts
Then sugiere exactamente [B→A 500, C→A 200] (orden determinista)

Given un settlement B→A de 500 registrado
Then el saldo de B queda 0 y simplifyDebts solo sugiere C→A 200

Given una transacción soft-deleted
Then no afecta ningún saldo

Given shares que no suman el monto
When computeBalances
Then lanza LedgerInvariantError (y assertValidShares lo detecta antes)

Given un ingreso de 1000 recibido por el nodo Stripe repartido 500/500 entre A,B
  y un settlement Stripe→A de 500 (retiro)
When computeBalances
Then Stripe=−500, A=0, B=+500, Σ=0 — sin ninguna lógica especial por kind

Given esos saldos y mode='fund'
When partitionStripeView
Then personBalances={A:0,B:+500}, stripeBalanceCents=−500, y la transfer
  sugerida Stripe→B 500 viene marcada involvesStripe='from'

Given los mismos datos y mode='participant'
Then balances y transfers pasan intactos (partición = identidad)
```

## Tests requeridos

`tests/event-ledger.test.ts`:
- splitEqual: montos primos (1000/3, 100/7), n=1, n>monto en centavos (error
  por share 0), determinismo (doble corrida idéntica), inputs inválidos.
- computeBalances: los escenarios gherkin + invariante Σ=0 con datos random
  generados (fuzz ligero con seeds fijos: N transacciones válidas → Σ=0
  siempre).
- simplifyDebts: ≤ n−1 transferencias, aplicar las transferencias sugeridas
  sobre los saldos deja todo en 0 (property test con seeds fijos), grupo ya
  saldado → [], determinismo del orden.
- partitionStripeView: identidad en modo participant, partición sin pérdida
  en modo fund (Σ personas + stripe = 0), marcado `involvesStripe` correcto,
  `stripeParticipantId=null` (evento sin nodo Stripe) = identidad en ambos
  modos.
- Rechazo de floats/no-enteros en todas las entradas.
