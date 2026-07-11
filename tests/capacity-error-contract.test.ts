import { describe, it, expect } from 'vitest'
import { CAPACITY_FULL_MESSAGE } from '@/lib/queries'

// A2-H02: the API routes recognize a capacity rejection by substring-matching
// the error message thrown from lib/queries. This locks that contract so a
// reworded message can't silently turn 409s back into generic 500s.
describe('capacity error contract', () => {
    it('routes match on the "capacidad máxima" substring', () => {
        expect(CAPACITY_FULL_MESSAGE).toContain('capacidad máxima')
    })

    it('does not collide with the duplicate-RSVP message routes also match on', () => {
        expect(CAPACITY_FULL_MESSAGE).not.toContain('Ya existe un RSVP')
    })
})
