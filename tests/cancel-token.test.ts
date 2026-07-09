import { describe, it, expect } from 'vitest'
import { generateCancelToken, validateCancelToken } from '@/lib/queries'

// Smoke tests for the pure token helpers. These establish the Vitest harness
// (B0) and lock in current behaviour before B2 migrates the token to HMAC.
describe('cancel token', () => {
    it('is deterministic for the same rsvpId + email', () => {
        const a = generateCancelToken('rsvp-1', 'guest@example.com')
        const b = generateCancelToken('rsvp-1', 'guest@example.com')
        expect(a).toBe(b)
        expect(a).toHaveLength(32)
    })

    it('differs when the email differs', () => {
        expect(generateCancelToken('rsvp-1', 'a@example.com')).not.toBe(
            generateCancelToken('rsvp-1', 'b@example.com'),
        )
    })

    it('validates a matching token and rejects a wrong one', () => {
        const token = generateCancelToken('rsvp-1', 'guest@example.com')
        expect(validateCancelToken(token, 'rsvp-1', 'guest@example.com')).toBe(true)
        expect(validateCancelToken('not-the-token', 'rsvp-1', 'guest@example.com')).toBe(false)
    })
})
