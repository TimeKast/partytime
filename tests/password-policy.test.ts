import { describe, it, expect } from 'vitest'
import { validatePasswordPolicy } from '@/lib/password-policy'

describe('validatePasswordPolicy', () => {
    it('accepts an 8-character password with uppercase, lowercase and number but no symbol', () => {
        const result = validatePasswordPolicy('Valid123', { email: 'alex@example.com', name: 'Alex Gmora' })
        expect(result.ok).toBe(true)
        expect(result.errors).toEqual([])
    })

    it('rejects a 7-character password', () => {
        const result = validatePasswordPolicy('Valid12', { email: 'a@b.com', name: 'A' })
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('too_short')
    })

    it('uses character length for the 8-character minimum, not UTF-8 bytes', () => {
        const password = '😀😀Abc1d'
        expect(Buffer.byteLength(password, 'utf8')).toBeGreaterThanOrEqual(8)
        const result = validatePasswordPolicy(password, {})
        expect(result.errors).toContain('too_short')
    })

    it('rejects passwords longer than 72 UTF-8 bytes, counting bytes not JS chars', () => {
        // Each 'é' is 1 JS UTF-16 code unit but 2 UTF-8 bytes. 40 of them = 40 JS
        // chars (well under any char-count limit) but 80 UTF-8 bytes (over 72).
        const password = 'é'.repeat(40) + 'A1'
        expect(password.length).toBeLessThan(72)
        const result = validatePasswordPolicy(password, {})
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('too_long')
    })

    it('accepts a password at exactly 72 UTF-8 bytes', () => {
        // 'Aa1!' (4 ascii bytes) repeated 18 times = 72 bytes exactly.
        const password = 'Aa1!'.repeat(18)
        const result = validatePasswordPolicy(password, {})
        expect(result.errors).not.toContain('too_long')
    })

    it.each([
        ['uppercase', 'valid123', 'missing_uppercase'],
        ['lowercase', 'VALID123', 'missing_lowercase'],
        ['number', 'ValidPass', 'missing_number'],
    ])('rejects a password missing the required %s class', (_className, password, error) => {
        const result = validatePasswordPolicy(password, {})
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(error)
    })

    it('rejects a password equal to or containing the email local-part', () => {
        const equal = validatePasswordPolicy('alexgmora123', { email: 'alexgmora@example.com', name: '' })
        expect(equal.ok).toBe(false)
        expect(equal.errors).toContain('contains_identity')

        const contains = validatePasswordPolicy('xAlexgmoraX1!', { email: 'alexgmora@example.com', name: '' })
        expect(contains.ok).toBe(false)
        expect(contains.errors).toContain('contains_identity')
    })

    it('rejects a password containing the user name', () => {
        const result = validatePasswordPolicy('AlexGmora123!', { email: '', name: 'Alex Gmora' })
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('contains_identity')
    })

    it('rejects denylisted common passwords regardless of length/class tricks', () => {
        const result = validatePasswordPolicy('Password123!', {})
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('denylisted')
    })

    it('is case-insensitive and whitespace-tolerant when matching identity fragments', () => {
        const result = validatePasswordPolicy('  ALEXGMORA123!', { email: 'alexgmora@example.com', name: '' })
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('contains_identity')
    })
})
