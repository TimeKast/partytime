export interface FixedWindowRateLimiterOptions {
    maxAttempts: number
    windowMs: number
    maxEntries: number
}

interface RateEntry {
    count: number
    windowStartedAt: number
}

/**
 * Per-instance fixed-window limiter with a strict memory cap. A ring chooses
 * one slot to evict for each unseen key, so requests never scan the map and
 * both lookup and eviction remain O(1).
 */
export class BoundedFixedWindowRateLimiter {
    private readonly entries = new Map<string, RateEntry>()
    private readonly slots: Array<string | undefined>
    private cursor = 0

    constructor(private readonly options: FixedWindowRateLimiterOptions) {
        if (options.maxAttempts < 1 || options.windowMs < 1 || options.maxEntries < 1) {
            throw new Error('Rate limiter options must be positive')
        }
        this.slots = new Array(options.maxEntries)
    }

    isLimited(key: string, now: number = Date.now()): boolean {
        let entry = this.entries.get(key)

        if (!entry) {
            const evictedKey = this.slots[this.cursor]
            if (evictedKey !== undefined) this.entries.delete(evictedKey)

            this.slots[this.cursor] = key
            this.cursor = (this.cursor + 1) % this.slots.length
            entry = { count: 0, windowStartedAt: now }
            this.entries.set(key, entry)
        } else if (now - entry.windowStartedAt >= this.options.windowMs) {
            entry.count = 0
            entry.windowStartedAt = now
        }

        entry.count += 1
        return entry.count > this.options.maxAttempts
    }

    /** Exposed for deterministic memory-bound regression tests. */
    get trackedEntryCount(): number {
        return this.entries.size
    }
}
