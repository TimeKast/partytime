import { describe, it, expect } from 'vitest'
import { timingSafeEqualStr } from '@/lib/timing-safe'

describe('timingSafeEqualStr', () => {
    it('returns true for equal strings', () => {
        expect(timingSafeEqualStr('secret-abc', 'secret-abc')).toBe(true)
    })
    it('returns false for different strings (incl. different lengths)', () => {
        expect(timingSafeEqualStr('secret-abc', 'secret-abd')).toBe(false)
        expect(timingSafeEqualStr('short', 'a-much-longer-value')).toBe(false)
    })
    it('handles null/undefined without throwing', () => {
        expect(timingSafeEqualStr(null, undefined)).toBe(true) // both hash to '' digest
        expect(timingSafeEqualStr('x', null)).toBe(false)
    })
})
