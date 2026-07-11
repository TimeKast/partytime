import { describe, it, expect } from 'vitest'
import { isSeatAddingChange } from '@/lib/queries'

// A2-H04: the guest update route blocks seat-ADDING changes on closed or
// inactive events, but must never block seat-neutral edits or cancellations.
describe('isSeatAddingChange', () => {
    it('reconfirming a cancelled RSVP adds a seat', () => {
        expect(isSeatAddingChange(
            { status: 'cancelled', plusOne: false },
            { status: 'confirmed', plusOne: false },
        )).toBe(true)
    })

    it('reconfirming with a +1 adds seats', () => {
        expect(isSeatAddingChange(
            { status: 'cancelled', plusOne: true },
            { status: 'confirmed', plusOne: true },
        )).toBe(true)
    })

    it('adding a +1 while confirmed adds a seat', () => {
        expect(isSeatAddingChange(
            { status: 'confirmed', plusOne: false },
            { plusOne: true },
        )).toBe(true)
    })

    it('contact edits without seat change are neutral', () => {
        expect(isSeatAddingChange(
            { status: 'confirmed', plusOne: true },
            { plusOne: true },
        )).toBe(false)
    })

    it('removing the +1 is seat-removing, never blocked', () => {
        expect(isSeatAddingChange(
            { status: 'confirmed', plusOne: true },
            { plusOne: false },
        )).toBe(false)
    })

    it('cancelling is seat-removing, never blocked', () => {
        expect(isSeatAddingChange(
            { status: 'confirmed', plusOne: true },
            { status: 'cancelled' },
        )).toBe(false)
    })

    it('editing a cancelled RSVP without reconfirm stays seatless', () => {
        expect(isSeatAddingChange(
            { status: 'cancelled', plusOne: false },
            { plusOne: true },
        )).toBe(false)
    })
})
