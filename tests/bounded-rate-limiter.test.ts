import { describe, expect, it } from 'vitest'
import { BoundedFixedWindowRateLimiter } from '@/lib/bounded-rate-limiter'

describe('BoundedFixedWindowRateLimiter', () => {
    it('enforces a per-key fixed-window limit', () => {
        const limiter = new BoundedFixedWindowRateLimiter({
            maxAttempts: 2,
            windowMs: 1000,
            maxEntries: 4,
        })

        expect(limiter.isLimited('ip-a', 0)).toBe(false)
        expect(limiter.isLimited('ip-a', 1)).toBe(false)
        expect(limiter.isLimited('ip-a', 2)).toBe(true)
        expect(limiter.isLimited('ip-a', 1000)).toBe(false)
    })

    it('never grows past its cap while rotating keys', () => {
        const limiter = new BoundedFixedWindowRateLimiter({
            maxAttempts: 1,
            windowMs: 60_000,
            maxEntries: 3,
        })

        for (let index = 0; index < 100; index++) {
            limiter.isLimited(`ip-${index}`, index)
            expect(limiter.trackedEntryCount).toBeLessThanOrEqual(3)
        }
        expect(limiter.trackedEntryCount).toBe(3)
    })
})
