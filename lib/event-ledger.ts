/**
 * ISSUE-022 (EPIC-006) — Pure ledger math: equal-split, balances, debt
 * simplification and the Stripe participant/fund presentation view.
 *
 * 100% pure functions, no I/O, no Drizzle, no knowledge of the DB. Input and
 * output are plain objects/Maps — the data layer (ISSUE-023/024) builds the
 * `Ledger*` inputs from rows it already filtered by `deleted_at IS NULL`,
 * but every function here is defensive and re-filters soft-deleted rows
 * itself (PLAN-EPIC-006.md §5 gotcha #4: "un filtro olvidado corrompe
 * saldos silenciosamente" — this module never trusts the caller for that).
 *
 * Sign convention, Σ=0 invariant and the Stripe-virtual-participant model
 * are PLAN-EPIC-006.md §2.2 / §2.5 / §2.6 — copied here verbatim, not
 * reinvented. See PLAN-EPIC-006.md §3.2 for why this module is split from
 * Drizzle: it runs in Wave 1 alongside the ISSUE-021 migration
 * (write-sets disjoint) and is the focus of the epic's tier-3 review.
 *
 * Prohibited anywhere in this module: floating point arithmetic on amounts
 * (every numeric input is validated with `Number.isInteger`), `Math.random`,
 * `Date.now` — everything here is pure and deterministic.
 */

// ---------------------------------------------------------------------------
// Input/output types (local — this module does not import lib/schema.ts)
// ---------------------------------------------------------------------------

export interface LedgerTransaction {
    id: string
    type: 'expense' | 'income'
    participantId: string
    amountCents: number
    deletedAt: Date | null
}

export interface LedgerShare {
    transactionId: string
    participantId: string
    shareCents: number
}

export interface LedgerSettlement {
    fromParticipantId: string
    toParticipantId: string
    amountCents: number
    deletedAt: Date | null
}

export interface SuggestedTransfer {
    fromParticipantId: string
    toParticipantId: string
    amountCents: number
}

/**
 * Thrown by `computeBalances` when the postcondition Σ balances = 0 fails
 * (corrupt input: shares that do not sum to their transaction's amount,
 * caller skipped `assertValidShares` before persisting). Never returns
 * silently-wrong balances — PLAN-EPIC-006.md §2.2.
 */
export class LedgerInvariantError extends Error {
    /** The observed Σ balances in cents; should always be 0 when this is not thrown. */
    public readonly deltaCents: number

    constructor(message: string, deltaCents: number) {
        super(message)
        this.name = 'LedgerInvariantError'
        this.deltaCents = deltaCents
    }
}

function assertSafeInteger(value: number, label: string): void {
    if (!Number.isInteger(value)) {
        throw new Error(`${label} must be an integer number of cents, got ${String(value)}`)
    }
    if (!Number.isSafeInteger(value)) {
        throw new Error(`${label} exceeds Number.isSafeInteger range: ${value}`)
    }
}

// ---------------------------------------------------------------------------
// splitEqual — largest remainder, deterministic by ascending participant id
// (PLAN-EPIC-006.md §2.3)
// ---------------------------------------------------------------------------

/**
 * Equal split of `amountCents` across `participantIds` using largest
 * remainder: `base = floor(amount / n)`, and the first `amount % n`
 * participants **in ascending id order** receive `base + 1`. Deterministic:
 * same input (regardless of the array's original ordering) always produces
 * the same Map.
 *
 * Throws on `n = 0`, `amountCents <= 0`, non-integer `amountCents`,
 * duplicate participant ids (would silently collapse in the output Map and
 * lose cents), or when `amountCents < n` (some participant would receive a
 * 0-cent share, which is not a valid share row per `assertValidShares`).
 */
export function splitEqual(amountCents: number, participantIds: string[]): Map<string, number> {
    assertSafeInteger(amountCents, 'amountCents')
    if (amountCents <= 0) {
        throw new Error(`amountCents must be > 0, got ${amountCents}`)
    }

    const n = participantIds.length
    if (n === 0) {
        throw new Error('splitEqual requires at least one participant')
    }

    const uniqueIds = new Set(participantIds)
    if (uniqueIds.size !== n) {
        throw new Error('splitEqual received duplicate participant ids')
    }

    if (amountCents < n) {
        throw new Error(
            `splitEqual cannot give every participant at least 1 cent: amountCents=${amountCents} < participants=${n}`,
        )
    }

    const base = Math.floor(amountCents / n)
    const remainder = amountCents % n

    // Ascending string compare on the raw ids — never localeCompare, which is
    // locale/ICU-dependent and would break "deterministic across runs".
    const sortedIds = [...participantIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    const result = new Map<string, number>()
    sortedIds.forEach((id, index) => {
        result.set(id, base + (index < remainder ? 1 : 0))
    })

    return result
}

// ---------------------------------------------------------------------------
// assertValidShares — reused by ISSUE-023's API layer before the CTE write
// (PLAN-EPIC-006.md §5 gotcha #2)
// ---------------------------------------------------------------------------

/**
 * Validates a candidate share breakdown before it is persisted: every share
 * must be a positive integer and the shares must sum exactly to
 * `amountCents`. Throws a plain `Error` (not `LedgerInvariantError`, which
 * is reserved for `computeBalances`'s runtime postcondition) describing the
 * mismatch.
 */
export function assertValidShares(amountCents: number, shares: number[]): void {
    assertSafeInteger(amountCents, 'amountCents')
    if (amountCents <= 0) {
        throw new Error(`amountCents must be > 0, got ${amountCents}`)
    }
    if (shares.length === 0) {
        throw new Error('shares must not be empty')
    }

    let sum = 0
    shares.forEach((share, index) => {
        assertSafeInteger(share, `shares[${index}]`)
        if (share <= 0) {
            throw new Error(`shares[${index}] must be > 0, got ${share}`)
        }
        sum += share
    })

    if (sum !== amountCents) {
        throw new Error(`shares sum to ${sum} cents but amountCents is ${amountCents}`)
    }
}

// ---------------------------------------------------------------------------
// computeBalances — sign convention PLAN-EPIC-006.md §2.2
// ---------------------------------------------------------------------------

/**
 * Computes each participant's balance in cents from transactions, their
 * shares, and settlements. Sign convention (PLAN-EPIC-006.md §2.2):
 *
 * - expense: `+amount` to the payer, `-share` to each participant in the split
 * - income: `-amount` to the receiver, `+share` to each beneficiary
 * - settlement: `+amount` to whoever paid it, `-amount` to whoever received it
 *
 * Positive balance = the group owes them. Negative = they owe the group.
 *
 * Soft-deleted transactions/settlements (`deletedAt !== null`) are ignored,
 * as are the shares belonging to an ignored transaction — this module
 * re-filters defensively even though the data layer is expected to already
 * pass only live rows (gotcha #4).
 *
 * The Stripe virtual participant (PLAN §2.6) is NOT special-cased anywhere
 * in this function: a Stripe withdrawal is just a settlement whose
 * `fromParticipantId` is the Stripe node, an expense paid directly by Stripe
 * is just an expense whose `participantId` is the Stripe node.
 *
 * Postcondition enforced at runtime: Σ of all returned balances is exactly
 * 0. If corrupt input (e.g. shares that do not sum to their transaction's
 * amount) makes that false, throws `LedgerInvariantError` with the observed
 * delta rather than returning silently-wrong balances.
 */
export function computeBalances(
    transactions: LedgerTransaction[],
    shares: LedgerShare[],
    settlements: LedgerSettlement[],
): Map<string, number> {
    const balances = new Map<string, number>()
    const addTo = (participantId: string, deltaCents: number): void => {
        balances.set(participantId, (balances.get(participantId) ?? 0) + deltaCents)
    }

    const liveTransactionsById = new Map<string, LedgerTransaction>()
    for (const transaction of transactions) {
        assertSafeInteger(transaction.amountCents, `transaction ${transaction.id} amountCents`)
        if (transaction.deletedAt !== null) {
            continue
        }
        liveTransactionsById.set(transaction.id, transaction)

        if (transaction.type === 'expense') {
            addTo(transaction.participantId, transaction.amountCents)
        } else {
            addTo(transaction.participantId, -transaction.amountCents)
        }
    }

    for (const share of shares) {
        assertSafeInteger(share.shareCents, `share for transaction ${share.transactionId}`)
        const transaction = liveTransactionsById.get(share.transactionId)
        if (!transaction) {
            // Belongs to a soft-deleted or unknown transaction — ignored.
            continue
        }

        if (transaction.type === 'expense') {
            addTo(share.participantId, -share.shareCents)
        } else {
            addTo(share.participantId, share.shareCents)
        }
    }

    for (const settlement of settlements) {
        assertSafeInteger(settlement.amountCents, 'settlement amountCents')
        if (settlement.deletedAt !== null) {
            continue
        }
        addTo(settlement.fromParticipantId, settlement.amountCents)
        addTo(settlement.toParticipantId, -settlement.amountCents)
    }

    let deltaCents = 0
    for (const amount of balances.values()) {
        deltaCents += amount
    }
    if (deltaCents !== 0) {
        throw new LedgerInvariantError(
            `Ledger balances do not sum to zero (delta=${deltaCents} cents) — check shares against their transaction amounts`,
            deltaCents,
        )
    }

    return balances
}

// ---------------------------------------------------------------------------
// simplifyDebts — greedy, deterministic tie-break (PLAN-EPIC-006.md §2.5)
// ---------------------------------------------------------------------------

interface MutableEntry {
    id: string
    amount: number
}

function sortDescByAmountThenAscById(entries: MutableEntry[]): void {
    entries.sort((a, b) => {
        if (b.amount !== a.amount) {
            return b.amount - a.amount
        }
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}

/**
 * Greedy debt simplification (the Splitwise algorithm): repeatedly pick the
 * current largest debtor and largest creditor (ties broken by ascending
 * `participantId` for a stable, deterministic order across runs), emit a
 * transfer for `min(|debt|, credit)`, and repeat until every balance is
 * zero. Re-sorts on every iteration so "largest remaining" is always
 * re-evaluated after a partial settlement (not a fixed two-pointer walk,
 * which would not always match the true largest remaining debtor/creditor).
 *
 * Guarantees at most `n - 1` transfers, where `n` is the number of
 * participants with a non-zero balance. An all-zero input returns `[]`.
 *
 * The minimum possible number of transfers is NP-hard (subset-sum) and is
 * intentionally not pursued (PLAN §2.5) — greedy is enough for the group
 * sizes this ledger targets.
 */
export function simplifyDebts(balances: Map<string, number>): SuggestedTransfer[] {
    const debtors: MutableEntry[] = []
    const creditors: MutableEntry[] = []

    for (const [id, amount] of balances) {
        assertSafeInteger(amount, `balance for ${id}`)
        if (amount < 0) {
            debtors.push({ id, amount: -amount })
        } else if (amount > 0) {
            creditors.push({ id, amount })
        }
    }

    const transfers: SuggestedTransfer[] = []

    while (debtors.length > 0 && creditors.length > 0) {
        sortDescByAmountThenAscById(debtors)
        sortDescByAmountThenAscById(creditors)

        const debtor = debtors[0]
        const creditor = creditors[0]
        const amount = Math.min(debtor.amount, creditor.amount)

        transfers.push({
            fromParticipantId: debtor.id,
            toParticipantId: creditor.id,
            amountCents: amount,
        })

        debtor.amount -= amount
        creditor.amount -= amount

        if (debtor.amount === 0) {
            debtors.shift()
        }
        if (creditor.amount === 0) {
            creditors.shift()
        }
    }

    return transfers
}

// ---------------------------------------------------------------------------
// partitionStripeView — pure presentation split, no recompute
// (PLAN-EPIC-006.md §2.6 / §3.2)
// ---------------------------------------------------------------------------

export interface PartitionedTransfer extends SuggestedTransfer {
    /**
     * `'from'` when this transfer originates at the Stripe node ("retiro de
     * Stripe sugerido"), `'to'` when it flows into the Stripe node ("aporte
     * al fondo"), `null` when it does not involve Stripe at all.
     */
    involvesStripe: 'from' | 'to' | null
}

export type StripePartitionResult =
    | {
          mode: 'identity'
          balances: Map<string, number>
          transfers: SuggestedTransfer[]
      }
    | {
          mode: 'partitioned'
          personBalances: Map<string, number>
          stripeBalanceCents: number
          transfers: PartitionedTransfer[]
      }

/**
 * Splits the presentation of an already-computed `computeBalances` /
 * `simplifyDebts` result into the "participant" vs "fund" view
 * (PLAN §2.6b). This is presentation only — it never recalculates
 * anything and never changes what the ledger considers true.
 *
 * - `mode='participant'`, or no Stripe node (`stripeParticipantId === null`):
 *   returns `{ mode: 'identity', balances, transfers }` — copies of the
 *   inputs, untouched. The Stripe node (if present) stays inside `balances`
 *   like any other participant.
 * - `mode='fund'` with a Stripe node present: apportions the Stripe node out
 *   of the balances into `stripeBalanceCents`, leaving `personBalances` with
 *   only `kind='person'` participants (so `simplifyDebts` can be re-run on
 *   `personBalances` alone by the caller if a fund-mode-only suggestion list
 *   is desired), and annotates every transfer that touches the Stripe node
 *   with `involvesStripe`.
 *
 * Invariant preserved without recomputation: `Σ personBalances +
 * stripeBalanceCents === Σ balances === 0` (guaranteed by `computeBalances`'s
 * own postcondition — this function only regroups the same numbers, it
 * never invents or drops a cent).
 */
export function partitionStripeView(
    balances: Map<string, number>,
    transfers: SuggestedTransfer[],
    stripeParticipantId: string | null,
    mode: 'participant' | 'fund',
): StripePartitionResult {
    if (mode === 'participant' || stripeParticipantId === null) {
        return {
            mode: 'identity',
            balances: new Map(balances),
            transfers: transfers.map((transfer) => ({ ...transfer })),
        }
    }

    const personBalances = new Map<string, number>()
    let stripeBalanceCents = 0

    for (const [participantId, amount] of balances) {
        if (participantId === stripeParticipantId) {
            stripeBalanceCents = amount
        } else {
            personBalances.set(participantId, amount)
        }
    }

    const partitionedTransfers: PartitionedTransfer[] = transfers.map((transfer) => {
        let involvesStripe: 'from' | 'to' | null = null
        if (transfer.fromParticipantId === stripeParticipantId) {
            involvesStripe = 'from'
        } else if (transfer.toParticipantId === stripeParticipantId) {
            involvesStripe = 'to'
        }
        return { ...transfer, involvesStripe }
    })

    return {
        mode: 'partitioned',
        personBalances,
        stripeBalanceCents,
        transfers: partitionedTransfers,
    }
}
