import { describe, it, expect } from 'vitest'
import { validatePasswordPolicy } from '@/lib/password-policy'

describe('validatePasswordPolicy', () => {
    it('accepts a password meeting length, class and context requirements', () => {
        const result = validatePasswordPolicy('Correct-Horse9', { email: 'alex@example.com', name: 'Alex Gmora' })
        expect(result.ok).toBe(true)
        expect(result.errors).toEqual([])
    })

    it('rejects passwords shorter than 12 characters', () => {
        const result = validatePasswordPolicy('Short1!', { email: 'a@b.com', name: 'A' })
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('too_short')
    })

    it('uses character length for the 12-character minimum, not UTF-8 bytes', () => {
        const result = validatePasswordPolicy('😀😀😀A1!', {})
        expect(Buffer.byteLength('😀😀😀A1!', 'utf8')).toBeGreaterThanOrEqual(12)
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

    it('requires at least 3 of the 4 character classes', () => {
        // Only lowercase + digits (2 classes), 12+ chars.
        const result = validatePasswordPolicy('lowercase123', {})
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('too_few_classes')
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
