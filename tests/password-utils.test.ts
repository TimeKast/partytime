import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { generateResetToken, hashResetToken, generateTemporaryPassword } from '@/lib/password-utils'
import { validatePasswordPolicy } from '@/lib/password-policy'

describe('generateResetToken', () => {
    it('returns a 256-bit (64 hex char) raw token and its sha256 hash', () => {
        const { raw, hash } = generateResetToken()
        expect(raw).toMatch(/^[0-9a-f]{64}$/)
        expect(hash).toBe(createHash('sha256').update(raw).digest('hex'))
    })

    it('generates unique tokens on each call', () => {
        const a = generateResetToken()
        const b = generateResetToken()
        expect(a.raw).not.toBe(b.raw)
        expect(a.hash).not.toBe(b.hash)
    })
})

describe('hashResetToken', () => {
    it('is a pure sha256 hex digest, deterministic and matching generateResetToken', () => {
        const { raw, hash } = generateResetToken()
        expect(hashResetToken(raw)).toBe(hash)
        expect(hashResetToken(raw)).toBe(hashResetToken(raw))
    })
})

describe('generateTemporaryPassword', () => {
    it('generates a policy-compliant password', () => {
        const password = generateTemporaryPassword()
        const result = validatePasswordPolicy(password, {})
        expect(result.ok).toBe(true)
        expect(result.errors).toEqual([])
    })

    it('is at least 16 characters, contains every required class and needs no symbol', () => {
        const password = generateTemporaryPassword()
        expect(password.length).toBeGreaterThanOrEqual(16)
        expect(password).not.toMatch(/[0OIl1]/)
        expect(password).toMatch(/[a-z]/)
        expect(password).toMatch(/[A-Z]/)
        expect(password).toMatch(/[0-9]/)
        expect(password).toMatch(/^[A-Za-z0-9]+$/)
    })

    it('generates unique passwords on each call', () => {
        const a = generateTemporaryPassword()
        const b = generateTemporaryPassword()
        expect(a).not.toBe(b)
    })

    it('validates generated passwords against the target user identity', () => {
        const context = { email: 'temporary@example.com', name: 'Temporary User' }
        for (let index = 0; index < 20; index++) {
            const password = generateTemporaryPassword(context)
            expect(validatePasswordPolicy(password, context).ok).toBe(true)
        }
    })
})
