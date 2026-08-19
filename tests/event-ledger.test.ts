/**
 * ISSUE-022 (EPIC-006) — pure ledger math tests. This is the tier-3 focus
 * of the epic review: cents-exact invariants, largest-remainder splitting,
 * deterministic debt simplification, and the Stripe participant/fund
 * partition. See PLAN-EPIC-006.md §2.2/§2.3/§2.5/§2.6 and
 * docs/backlog/ISSUE-022-ledger-engine.md for the spec these assert against.
 */
import { describe, expect, it } from 'vitest'
import {
    LedgerInvariantError,
    type LedgerSettlement,
    type LedgerShare,
    type LedgerTransaction,
    type SuggestedTransfer,
    assertValidShares,
    computeBalances,
    partitionStripeView,
    simplifyDebts,
    splitEqual,
} from '@/lib/event-ledger'

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG for the fuzz/property tests — never Math.random,
// so failures are always reproducible from the printed seed.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
    let a = seed
    return () => {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function sumBalances(balances: Map<string, number>): number {
    let total = 0
    for (const amount of balances.values()) {
        total += amount
    }
    return total
}

describe('lib/event-ledger.ts — splitEqual (largest remainder)', () => {
    it('splits a prime amount (1000/3) with ascending-id remainder assignment', () => {
        const result = splitEqual(1000, ['c', 'a', 'b'])
        expect(result.get('a')).toBe(334)
        expect(result.get('b')).toBe(333)
        expect(result.get('c')).toBe(333)
        expect(sumBalances(result)).toBe(1000)
    })

    it('splits another prime amount (100/7)', () => {
        const ids = ['g', 'e', 'f', 'a', 'c', 'b', 'd']
        const result = splitEqual(100, ids)
        const base = Math.floor(100 / 7)
        const remainder = 100 % 7
        const sortedAsc = [...ids].sort()
        sortedAsc.forEach((id, index) => {
            expect(result.get(id)).toBe(base + (index < remainder ? 1 : 0))
        })
        expect(sumBalances(result)).toBe(100)
    })

    it('gives the single participant the full amount when n=1', () => {
        const result = splitEqual(777, ['solo'])
        expect(result.get('solo')).toBe(777)
        expect(result.size).toBe(1)
    })

    it('throws when a participant would receive a 0-cent share (n > amountCents)', () => {
        expect(() => splitEqual(2, ['a', 'b', 'c', 'd', 'e'])).toThrow()
    })

    it('is deterministic: repeated calls with the same input produce identical output', () => {
        const first = splitEqual(1000, ['c', 'a', 'b'])
        const second = splitEqual(1000, ['c', 'a', 'b'])
        expect([...first.entries()].sort()).toEqual([...second.entries()].sort())
    })

    it('is deterministic regardless of the input array order', () => {
        const a = splitEqual(1000, ['c', 'a', 'b'])
        const b = splitEqual(1000, ['a', 'b', 'c'])
        const c = splitEqual(1000, ['b', 'c', 'a'])
        expect([...a.entries()].sort()).toEqual([...b.entries()].sort())
        expect([...a.entries()].sort()).toEqual([...c.entries()].sort())
    })

    it('rejects n=0', () => {
        expect(() => splitEqual(1000, [])).toThrow()
    })

    it('rejects amountCents <= 0', () => {
        expect(() => splitEqual(0, ['a', 'b'])).toThrow()
        expect(() => splitEqual(-100, ['a', 'b'])).toThrow()
    })

    it('rejects non-integer amountCents (floats forbidden)', () => {
        expect(() => splitEqual(100.5, ['a', 'b'])).toThrow()
        expect(() => splitEqual(Number.NaN, ['a', 'b'])).toThrow()
    })

    it('rejects duplicate participant ids (would silently lose cents via Map collapse)', () => {
        expect(() => splitEqual(1000, ['a', 'a', 'b'])).toThrow()
    })
})

describe('lib/event-ledger.ts — assertValidShares', () => {
    it('passes when shares are positive integers summing to amountCents', () => {
        expect(() => assertValidShares(900, [300, 300, 300])).not.toThrow()
    })

    it('throws when shares do not sum to amountCents', () => {
        expect(() => assertValidShares(900, [300, 300, 299])).toThrow()
    })

    it('throws on a non-positive share', () => {
        expect(() => assertValidShares(900, [900, 0])).toThrow()
        expect(() => assertValidShares(900, [1000, -100])).toThrow()
    })

    it('throws on a non-integer share or amount', () => {
        expect(() => assertValidShares(900.5, [900])).toThrow()
        expect(() => assertValidShares(900, [450.5, 449.5])).toThrow()
    })

    it('throws on an empty shares array', () => {
        expect(() => assertValidShares(900, [])).toThrow()
    })
})

describe('lib/event-ledger.ts — computeBalances (sign convention + Σ=0 invariant)', () => {
    function tx(overrides: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'id' | 'type' | 'participantId' | 'amountCents'>): LedgerTransaction {
        return { deletedAt: null, ...overrides }
    }

    function settlement(overrides: Partial<LedgerSettlement> & Pick<LedgerSettlement, 'fromParticipantId' | 'toParticipantId' | 'amountCents'>): LedgerSettlement {
        return { deletedAt: null, ...overrides }
    }

    it('an expense of 900 paid by A split 300/300/300 across A,B,C', () => {
        const transactions: LedgerTransaction[] = [
            tx({ id: 't1', type: 'expense', participantId: 'A', amountCents: 900 }),
        ]
        const shares: LedgerShare[] = [
            { transactionId: 't1', participantId: 'A', shareCents: 300 },
            { transactionId: 't1', participantId: 'B', shareCents: 300 },
            { transactionId: 't1', participantId: 'C', shareCents: 300 },
        ]
        const balances = computeBalances(transactions, shares, [])
        expect(balances.get('A')).toBe(600)
        expect(balances.get('B')).toBe(-300)
        expect(balances.get('C')).toBe(-300)
        expect(sumBalances(balances)).toBe(0)
    })

    it('adds a cash income of 300 received by B split 100/100/100 across A,B,C', () => {
        const transactions: LedgerTransaction[] = [
            tx({ id: 't1', type: 'expense', participantId: 'A', amountCents: 900 }),
            tx({ id: 't2', type: 'income', participantId: 'B', amountCents: 300 }),
        ]
        const shares: LedgerShare[] = [
            { transactionId: 't1', participantId: 'A', shareCents: 300 },
            { transactionId: 't1', participantId: 'B', shareCents: 300 },
            { transactionId: 't1', participantId: 'C', shareCents: 300 },
            { transactionId: 't2', participantId: 'A', shareCents: 100 },
            { transactionId: 't2', participantId: 'B', shareCents: 100 },
            { transactionId: 't2', participantId: 'C', shareCents: 100 },
        ]
        const balances = computeBalances(transactions, shares, [])
        expect(balances.get('A')).toBe(700)
        expect(balances.get('B')).toBe(-500)
        expect(balances.get('C')).toBe(-200)
        expect(sumBalances(balances)).toBe(0)
    })

    it('a settlement B->A of 500 zeroes B and leaves C owing A 200 (matches simplifyDebts chain)', () => {
        const transactions: LedgerTransaction[] = [
            tx({ id: 't1', type: 'expense', participantId: 'A', amountCents: 900 }),
            tx({ id: 't2', type: 'income', participantId: 'B', amountCents: 300 }),
        ]
        const shares: LedgerShare[] = [
            { transactionId: 't1', participantId: 'A', shareCents: 300 },
            { transactionId: 't1', participantId: 'B', shareCents: 300 },
            { transactionId: 't1', participantId: 'C', shareCents: 300 },
            { transactionId: 't2', participantId: 'A', shareCents: 100 },
            { transactionId: 't2', participantId: 'B', shareCents: 100 },
            { transactionId: 't2', participantId: 'C', shareCents: 100 },
        ]
        const settlements: LedgerSettlement[] = [
            settlement({ fromParticipantId: 'B', toParticipantId: 'A', amountCents: 500 }),
        ]
        const balances = computeBalances(transactions, shares, settlements)
        expect(balances.get('B')).toBe(0)
        expect(balances.get('A')).toBe(200)
        expect(balances.get('C')).toBe(-200)
        expect(sumBalances(balances)).toBe(0)

        const transfers = simplifyDebts(balances)
        expect(transfers).toEqual([{ fromParticipantId: 'C', toParticipantId: 'A', amountCents: 200 }])
    })

    it('a soft-deleted transaction does not affect any balance', () => {
        const transactions: LedgerTransaction[] = [
            tx({ id: 't1', type: 'expense', participantId: 'A', amountCents: 900, deletedAt: new Date('2026-01-01') }),
        ]
        const shares: LedgerShare[] = [
            { transactionId: 't1', participantId: 'A', shareCents: 300 },
            { transactionId: 't1', participantId: 'B', shareCents: 300 },
            { transactionId: 't1', participantId: 'C', shareCents: 300 },
        ]
        const balances = computeBalances(transactions, shares, [])
        expect(balances.size).toBe(0)
        expect(sumBalances(balances)).toBe(0)
    })

    it('a soft-deleted settlement does not affect any balance', () => {
        const settlements: LedgerSettlement[] = [
            settlement({
                fromParticipantId: 'B',
                toParticipantId: 'A',
                amountCents: 500,
                deletedAt: new Date('2026-01-01'),
            }),
        ]
        const balances = computeBalances([], [], settlements)
        expect(balances.size).toBe(0)
        expect(sumBalances(balances)).toBe(0)
    })

    it('a live settlement alongside a soft-deleted one only applies the live one', () => {
        const settlements: LedgerSettlement[] = [
            settlement({ fromParticipantId: 'B', toParticipantId: 'A', amountCents: 200 }),
            settlement({
                fromParticipantId: 'B',
                toParticipantId: 'A',
                amountCents: 500,
                deletedAt: new Date('2026-01-01'),
            }),
        ]
        const balances = computeBalances([], [], settlements)
        expect(balances.get('B')).toBe(200)
        expect(balances.get('A')).toBe(-200)
        expect(sumBalances(balances)).toBe(0)
    })

    it('throws LedgerInvariantError when shares do not sum to the transaction amount', () => {
        const transactions: LedgerTransaction[] = [
            tx({ id: 't1', type: 'expense', participantId: 'A', amountCents: 900 }),
        ]
        const shares: LedgerShare[] = [
            { transactionId: 't1', participantId: 'A', shareCents: 300 },
            { transactionId: 't1', participantId: 'B', shareCents: 300 },
            // missing C's 300 -> shares only sum to 600, not 900
        ]
        expect(() => computeBalances(transactions, shares, [])).toThrow(LedgerInvariantError)
        try {
            computeBalances(transactions, shares, [])
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(LedgerInvariantError)
            expect((error as LedgerInvariantError).deltaCents).not.toBe(0)
        }
    })

    it('assertValidShares catches the same corruption before computeBalances would', () => {
        expect(() => assertValidShares(900, [300, 300])).toThrow()
    })

    it('fuzz: N valid random transactions always sum to zero (seeded, reproducible)', () => {
        const seeds = [1, 42, 1337, 99991, 2026]
        const participants = ['alice', 'bob', 'carol', 'dave', 'erin']

        for (const seed of seeds) {
            const rand = mulberry32(seed)
            const transactions: LedgerTransaction[] = []
            const shares: LedgerShare[] = []
            const settlements: LedgerSettlement[] = []

            for (let i = 0; i < 200; i += 1) {
                const kindRoll = rand()
                if (kindRoll < 0.45) {
                    // expense
                    const amountCents = 100 + Math.floor(rand() * 99900)
                    const payer = participants[Math.floor(rand() * participants.length)]
                    const id = `tx-${seed}-${i}`
                    transactions.push({ id, type: 'expense', participantId: payer, amountCents, deletedAt: null })
                    const split = splitEqual(amountCents, participants)
                    for (const [participantId, shareCents] of split) {
                        shares.push({ transactionId: id, participantId, shareCents })
                    }
                } else if (kindRoll < 0.85) {
                    // income
                    const amountCents = 100 + Math.floor(rand() * 99900)
                    const receiver = participants[Math.floor(rand() * participants.length)]
                    const id = `tx-${seed}-${i}`
                    transactions.push({ id, type: 'income', participantId: receiver, amountCents, deletedAt: null })
                    const split = splitEqual(amountCents, participants)
                    for (const [participantId, shareCents] of split) {
                        shares.push({ transactionId: id, participantId, shareCents })
                    }
                } else {
                    // settlement between two distinct random participants
                    const fromIndex = Math.floor(rand() * participants.length)
                    let toIndex = Math.floor(rand() * participants.length)
                    while (toIndex === fromIndex) {
                        toIndex = Math.floor(rand() * participants.length)
                    }
                    const amountCents = 100 + Math.floor(rand() * 9900)
                    settlements.push({
                        fromParticipantId: participants[fromIndex],
                        toParticipantId: participants[toIndex],
                        amountCents,
                        deletedAt: null,
                    })
                }
            }

            const balances = computeBalances(transactions, shares, settlements)
            expect(sumBalances(balances)).toBe(0)
        }
    })
})

describe('lib/event-ledger.ts — simplifyDebts (greedy, deterministic)', () => {
    it('returns [] for an already-settled group', () => {
        const balances = new Map<string, number>([
            ['A', 0],
            ['B', 0],
        ])
        expect(simplifyDebts(balances)).toEqual([])
    })

    it('emits at most n-1 transfers and fully zeroes the group when applied', () => {
        const balances = new Map<string, number>([
            ['A', 700],
            ['B', -500],
            ['C', -200],
        ])
        const transfers = simplifyDebts(balances)
        expect(transfers.length).toBeLessThanOrEqual(balances.size - 1)

        const applied = new Map(balances)
        for (const transfer of transfers) {
            applied.set(transfer.fromParticipantId, (applied.get(transfer.fromParticipantId) ?? 0) + transfer.amountCents)
            applied.set(transfer.toParticipantId, (applied.get(transfer.toParticipantId) ?? 0) - transfer.amountCents)
        }
        for (const amount of applied.values()) {
            expect(amount).toBe(0)
        }
    })

    it('breaks ties deterministically by ascending participantId when amounts are equal', () => {
        const balances = new Map<string, number>([
            ['zeta', -500],
            ['alpha', -500],
            ['omega', 1000],
        ])
        const transfers = simplifyDebts(balances)
        // Largest creditor (omega, 1000) is matched first; among equal-amount
        // debtors (zeta/alpha, both 500), the ascending-id tie-break picks
        // "alpha" first.
        expect(transfers[0]).toEqual({ fromParticipantId: 'alpha', toParticipantId: 'omega', amountCents: 500 })
        expect(transfers[1]).toEqual({ fromParticipantId: 'zeta', toParticipantId: 'omega', amountCents: 500 })
    })

    it('is deterministic across repeated runs on the same input', () => {
        const balances = new Map<string, number>([
            ['A', 700],
            ['B', -500],
            ['C', -200],
        ])
        const first = simplifyDebts(new Map(balances))
        const second = simplifyDebts(new Map(balances))
        expect(first).toEqual(second)
    })

    it('handles a single debtor / single creditor pair', () => {
        const balances = new Map<string, number>([
            ['debtor', -300],
            ['creditor', 300],
        ])
        expect(simplifyDebts(balances)).toEqual([
            { fromParticipantId: 'debtor', toParticipantId: 'creditor', amountCents: 300 },
        ])
    })

    it('property: for random balanced (Σ=0) inputs, applying transfers always zeroes everyone (seeded)', () => {
        const seeds = [7, 123, 4096, 8675309]
        const participants = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

        for (const seed of seeds) {
            const rand = mulberry32(seed)
            const balances = new Map<string, number>()
            let runningTotal = 0
            for (let i = 0; i < participants.length - 1; i += 1) {
                const amount = Math.floor(rand() * 20001) - 10000
                balances.set(participants[i], amount)
                runningTotal += amount
            }
            // Last participant absorbs whatever balances the sum to exactly 0.
            balances.set(participants[participants.length - 1], -runningTotal)
            expect(sumBalances(balances)).toBe(0)

            const transfers = simplifyDebts(new Map(balances))
            expect(transfers.length).toBeLessThanOrEqual(participants.length - 1)

            const applied = new Map(balances)
            for (const transfer of transfers) {
                applied.set(transfer.fromParticipantId, (applied.get(transfer.fromParticipantId) ?? 0) + transfer.amountCents)
                applied.set(transfer.toParticipantId, (applied.get(transfer.toParticipantId) ?? 0) - transfer.amountCents)
            }
            for (const amount of applied.values()) {
                expect(amount).toBe(0)
            }
        }
    })
})

describe('lib/event-ledger.ts — partitionStripeView (presentation, no recompute)', () => {
    // Scenario from ISSUE-022 acceptance criteria: an income of 1000 received
    // by the Stripe node, split 500/500 between A and B, plus a Stripe->A
    // withdrawal settlement of 500.
    function buildStripeScenario(): { balances: Map<string, number>; transfers: SuggestedTransfer[] } {
        const transactions: LedgerTransaction[] = [
            { id: 't1', type: 'income', participantId: 'stripe', amountCents: 1000, deletedAt: null },
        ]
        const shares: LedgerShare[] = [
            { transactionId: 't1', participantId: 'A', shareCents: 500 },
            { transactionId: 't1', participantId: 'B', shareCents: 500 },
        ]
        const settlements: LedgerSettlement[] = [
            { fromParticipantId: 'stripe', toParticipantId: 'A', amountCents: 500, deletedAt: null },
        ]
        const balances = computeBalances(transactions, shares, settlements)
        const transfers = simplifyDebts(balances)
        return { balances, transfers }
    }

    it('computeBalances on the Stripe scenario matches the gherkin: stripe=-500, A=0, B=+500, Σ=0', () => {
        const { balances } = buildStripeScenario()
        expect(balances.get('stripe')).toBe(-500)
        expect(balances.get('A')).toBe(0)
        expect(balances.get('B')).toBe(500)
        expect(sumBalances(balances)).toBe(0)
    })

    it("mode='fund' apportions the Stripe node out and marks the Stripe transfer involvesStripe='from'", () => {
        const { balances, transfers } = buildStripeScenario()
        const result = partitionStripeView(balances, transfers, 'stripe', 'fund')

        expect(result.mode).toBe('partitioned')
        if (result.mode !== 'partitioned') {
            throw new Error('expected partitioned result')
        }

        expect(result.personBalances.get('A')).toBe(0)
        expect(result.personBalances.get('B')).toBe(500)
        expect(result.personBalances.has('stripe')).toBe(false)
        expect(result.stripeBalanceCents).toBe(-500)

        // No cents invented or dropped by the partition.
        expect(sumBalances(result.personBalances) + result.stripeBalanceCents).toBe(0)

        const stripeTransfer = result.transfers.find((t) => t.fromParticipantId === 'stripe' || t.toParticipantId === 'stripe')
        expect(stripeTransfer?.involvesStripe).toBe('from')
    })

    it("mode='participant' passes balances and transfers through intact (partition = identity)", () => {
        const { balances, transfers } = buildStripeScenario()
        const result = partitionStripeView(balances, transfers, 'stripe', 'participant')

        expect(result.mode).toBe('identity')
        if (result.mode !== 'identity') {
            throw new Error('expected identity result')
        }
        expect([...result.balances.entries()].sort()).toEqual([...balances.entries()].sort())
        expect(result.transfers).toEqual(transfers)
    })

    it('stripeParticipantId=null (no Stripe node) is identity in both modes', () => {
        const balances = new Map<string, number>([
            ['A', 300],
            ['B', -300],
        ])
        const transfers: SuggestedTransfer[] = [{ fromParticipantId: 'B', toParticipantId: 'A', amountCents: 300 }]

        const participantMode = partitionStripeView(balances, transfers, null, 'participant')
        const fundMode = partitionStripeView(balances, transfers, null, 'fund')

        expect(participantMode.mode).toBe('identity')
        expect(fundMode.mode).toBe('identity')
        if (participantMode.mode === 'identity' && fundMode.mode === 'identity') {
            expect([...participantMode.balances.entries()].sort()).toEqual([...balances.entries()].sort())
            expect([...fundMode.balances.entries()].sort()).toEqual([...balances.entries()].sort())
            expect(participantMode.transfers).toEqual(transfers)
            expect(fundMode.transfers).toEqual(transfers)
        }
    })

    it('marks a fund-mode transfer flowing INTO Stripe as involvesStripe="to" (aporte al fondo)', () => {
        const balances = new Map<string, number>([
            ['stripe', 200],
            ['A', -200],
        ])
        const transfers: SuggestedTransfer[] = [{ fromParticipantId: 'A', toParticipantId: 'stripe', amountCents: 200 }]

        const result = partitionStripeView(balances, transfers, 'stripe', 'fund')
        expect(result.mode).toBe('partitioned')
        if (result.mode !== 'partitioned') {
            throw new Error('expected partitioned result')
        }
        expect(result.transfers[0].involvesStripe).toBe('to')
        expect(result.stripeBalanceCents).toBe(200)
        expect(result.personBalances.get('A')).toBe(-200)
        expect(sumBalances(result.personBalances) + result.stripeBalanceCents).toBe(0)
    })

    it('a transfer that does not involve Stripe is marked involvesStripe=null in fund mode', () => {
        const balances = new Map<string, number>([
            ['stripe', 0],
            ['A', 100],
            ['B', -100],
        ])
        const transfers: SuggestedTransfer[] = [{ fromParticipantId: 'B', toParticipantId: 'A', amountCents: 100 }]

        const result = partitionStripeView(balances, transfers, 'stripe', 'fund')
        expect(result.mode).toBe('partitioned')
        if (result.mode !== 'partitioned') {
            throw new Error('expected partitioned result')
        }
        expect(result.transfers[0].involvesStripe).toBeNull()
        expect(result.stripeBalanceCents).toBe(0)
    })

    it('fund mode with a Stripe node absent from balances (no Stripe activity) defaults stripeBalanceCents=0', () => {
        const balances = new Map<string, number>([
            ['A', 100],
            ['B', -100],
        ])
        const transfers: SuggestedTransfer[] = [{ fromParticipantId: 'B', toParticipantId: 'A', amountCents: 100 }]

        const result = partitionStripeView(balances, transfers, 'stripe', 'fund')
        expect(result.mode).toBe('partitioned')
        if (result.mode !== 'partitioned') {
            throw new Error('expected partitioned result')
        }
        expect(result.stripeBalanceCents).toBe(0)
        expect(sumBalances(result.personBalances) + result.stripeBalanceCents).toBe(0)
    })
})
