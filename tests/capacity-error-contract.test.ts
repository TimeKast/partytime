import { describe, it, expect } from 'vitest'
import {
    CAPACITY_FULL_MESSAGE,
    unwrapDbError,
    isCapacityFullError,
    isUniqueViolationError,
    isDeadlockError,
} from '@/lib/queries'

// drizzle >= 0.44 wraps driver errors: message "Failed query: ..." with the
// real NeonDbError in .cause. Classification must unwrap — a P0001 that isn't
// recognized turns a friendly 409 into a generic 500 (caught live in B4).
function drizzleWrapped(message: string, code: string): Error {
    const cause = Object.assign(new Error(message), { name: 'NeonDbError', code })
    return Object.assign(
        new Error('Failed query: INSERT INTO rsvps (id, event_id) VALUES ($1, $2)'),
        { cause },
    )
}

describe('db error classification (drizzle-wrapped and bare)', () => {
    it('recognizes CAPACITY_FULL wrapped in DrizzleQueryError', () => {
        expect(isCapacityFullError(drizzleWrapped('CAPACITY_FULL', 'P0001'))).toBe(true)
    })

    it('recognizes bare CAPACITY_FULL (raw neon client)', () => {
        expect(isCapacityFullError(Object.assign(new Error('CAPACITY_FULL'), { code: 'P0001' }))).toBe(true)
    })

    it('recognizes wrapped unique violations by SQLSTATE 23505', () => {
        expect(isUniqueViolationError(drizzleWrapped(
            'duplicate key value violates unique constraint "rsvps_event_email_unique"', '23505',
        ))).toBe(true)
        // the wrapper message alone must NOT match (it only contains the SQL)
        expect(isUniqueViolationError(new Error('Failed query: INSERT INTO rsvps ...'))).toBe(false)
    })

    it('recognizes wrapped deadlocks by SQLSTATE 40P01', () => {
        expect(isDeadlockError(drizzleWrapped('deadlock detected', '40P01'))).toBe(true)
        expect(isDeadlockError(drizzleWrapped('CAPACITY_FULL', 'P0001'))).toBe(false)
    })

    it('does not misclassify unrelated errors', () => {
        expect(isCapacityFullError(new Error('connection refused'))).toBe(false)
        expect(isUniqueViolationError(new Error('connection refused'))).toBe(false)
        expect(isDeadlockError(new Error('connection refused'))).toBe(false)
    })

    it('unwrapDbError surfaces the root code and message', () => {
        const { code, message } = unwrapDbError(drizzleWrapped('CAPACITY_FULL', 'P0001'))
        expect(code).toBe('P0001')
        expect(message).toBe('CAPACITY_FULL')
    })
})

// The API routes recognize a capacity rejection by substring-matching the
// error message thrown from lib/queries. Lock that contract so a reworded
// message can't silently turn 409s back into generic 500s.
describe('capacity error contract', () => {
    it('routes match on the "capacidad máxima" substring', () => {
        expect(CAPACITY_FULL_MESSAGE).toContain('capacidad máxima')
    })

    it('does not collide with the duplicate-RSVP message routes also match on', () => {
        expect(CAPACITY_FULL_MESSAGE).not.toContain('Ya existe un RSVP')
    })
})
