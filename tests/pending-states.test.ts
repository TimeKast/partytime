import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    CHECKIN_SEMANTIC_CHECK_NAMES,
    EXPECTED_CAPACITY_FUNCTION_BODY_HASH,
    EXPECTED_PENDING_STATES_CAPACITY_FUNCTION_BODY_HASH,
    HISTORICAL_SEMANTIC_CHECK_NAMES,
    PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES,
    PENDING_STATES_SEMANTIC_CHECK_NAMES,
    type CheckinSemanticState,
    type HistoricalSemanticState,
    type PasswordLifecycleSemanticState,
    type PendingStatesSemanticState,
} from '@/lib/migration-semantic-contract'
import {
    RSVP_INVITATION_SEMANTIC_CHECK_NAMES,
    type RsvpInvitationSemanticState,
} from '@/lib/rsvp-invitation-migration-contract'
import {
    PAYMENTS_SEMANTIC_CHECK_NAMES,
    type PaymentsSemanticState,
} from '@/lib/rsvp-payments-migration-contract'
import {
    LEDGER_SEMANTIC_CHECK_NAMES,
    type LedgerSemanticState,
} from '@/lib/event-ledger-migration-contract'
import {
    REQUIRED_HISTORICAL_OBJECTS,
    REQUIRED_IMAGE_POSITION_OBJECTS,
    REQUIRED_PASSWORD_LIFECYCLE_OBJECTS,
    REQUIRED_PAYMENTS_OBJECTS,
    REQUIRED_PENDING_STATES_OBJECTS,
    REQUIRED_PRESENTATION_OBJECTS,
    REQUIRED_RSVP_INVITATION_OBJECTS,
    classifyMigrationPreflight,
    type MigrationObjectState,
} from '@/lib/migration-preflight'

function capacityFunctionBodyFromMigration(path: string): string {
    const migration = readFileSync(path, 'utf8')
    const body = migration.match(/RETURNS trigger AS \$\$([\s\S]*?)\$\$ LANGUAGE plpgsql/)?.[1]
    expect(body).toBeDefined()
    return body!
}

function capacityFunctionBodyFingerprint(body: string): string {
    return createHash('md5').update(body.trim().replace(/\s+/g, ' ')).digest('hex')
}

describe('drizzle/0009_pending_states.sql — schema additions', () => {
    const migration = readFileSync('drizzle/0009_pending_states.sql', 'utf8')

    it('adds the four rsvps pending-state/verification columns, nullable, no defaults', () => {
        expect(migration).toContain('ALTER TABLE "rsvps" ADD COLUMN "pending_expires_at" timestamp;')
        expect(migration).toContain('ALTER TABLE "rsvps" ADD COLUMN "verified_at" timestamp;')
        expect(migration).toContain('ALTER TABLE "rsvps" ADD COLUMN "verification_token_hash" varchar(64);')
        expect(migration).toContain('ALTER TABLE "rsvps" ADD COLUMN "verification_expires_at" timestamp;')
    })

    it('adds events.email_verification_enabled NOT NULL DEFAULT false', () => {
        expect(migration).toContain(
            'ALTER TABLE "events" ADD COLUMN "email_verification_enabled" boolean DEFAULT false NOT NULL;',
        )
    })

    it('adds the two per-link flags NOT NULL DEFAULT true (PLAN §2.1)', () => {
        expect(migration).toContain(
            'ALTER TABLE "rsvp_invitation_links" ADD COLUMN "is_courtesy" boolean DEFAULT true NOT NULL;',
        )
        expect(migration).toContain(
            'ALTER TABLE "rsvp_invitation_links" ADD COLUMN "skip_verification" boolean DEFAULT true NOT NULL;',
        )
    })

    it('is additive only — no DROP/DELETE/TRUNCATE and no bare UPDATE outside the function body', () => {
        expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|TRUNCATE)\b/im)
        // The only UPDATE statements allowed are the ones inside the plpgsql
        // function body (which starts after "LANGUAGE plpgsql" is declared).
        const beforeFunction = migration.slice(0, migration.indexOf('CREATE OR REPLACE FUNCTION'))
        expect(beforeFunction).not.toMatch(/^\s*UPDATE\b/im)
    })

    it('chains generated snapshot and journal entry after 0008', () => {
        const snapshot8 = JSON.parse(readFileSync('drizzle/meta/0008_snapshot.json', 'utf8')) as { id: string }
        const snapshot9 = JSON.parse(readFileSync('drizzle/meta/0009_snapshot.json', 'utf8')) as {
            prevId: string
            tables: Record<string, { columns: Record<string, unknown> }>
        }
        const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
            entries: Array<{ idx: number; tag: string }>
        }

        expect(snapshot9.prevId).toBe(snapshot8.id)
        expect(snapshot9.tables['public.events'].columns).toHaveProperty('email_verification_enabled')
        expect(snapshot9.tables['public.rsvps'].columns).toHaveProperty('pending_expires_at')
        expect(snapshot9.tables['public.rsvps'].columns).toHaveProperty('verification_token_hash')
        expect(snapshot9.tables['public.rsvp_invitation_links'].columns).toHaveProperty('is_courtesy')
        expect(snapshot9.tables['public.rsvp_invitation_links'].columns).toHaveProperty('skip_verification')
        expect(journal.entries[9]).toEqual(expect.objectContaining({
            idx: 9,
            tag: '0009_pending_states',
        }))
    })
})

// Acceptance criteria (ISSUE-005): "Given un evento con capacity_limit=2 y 1
// confirmed + 1 pending_payment vigente / When un tercer invitado intenta
// RSVP / Then el trigger lanza CAPACITY_FULL"; "Given una fila
// pending_verification vigente / When se actualiza a confirmed / Then el
// trigger NO rechaza la transición". Both are properties of the live Postgres
// trigger, which these unit tests (no DATABASE_URL) verify at the SQL-text
// level — the same technique tests/migration-safety.test.ts already uses for
// the 0002 baseline. Live semantic verification against a disposable Postgres
// runs separately via `pnpm test:db:capacity-semantics`.
describe('enforce_event_capacity() — pending states reserve a seat (0009)', () => {
    const body = capacityFunctionBodyFromMigration('drizzle/0009_pending_states.sql')
    const PENDING_SET = "IN ('confirmed', 'pending_payment', 'pending_verification')"

    it('counts confirmed + pending_payment + pending_verification for the NEW row', () => {
        expect(body).toMatch(new RegExp(`NEW\\.status ${PENDING_SET.replace(/[()]/g, '\\$&')}`))
    })

    it('counts the same three statuses for the OLD row (seat-neutral pending->confirmed)', () => {
        expect(body).toMatch(new RegExp(`OLD\\.status ${PENDING_SET.replace(/[()]/g, '\\$&')}`))
    })

    it('recounts seats_taken from the same three-status set', () => {
        const recount = body.slice(body.indexOf('SELECT COALESCE(SUM'))
        expect(recount).toContain(PENDING_SET)
    })

    it('a pending->confirmed transition is seat-neutral: identical NEW/OLD status sets', () => {
        // Both branches of the seats_new/seats_old CASE use the exact same
        // IN (...) list, so seats_new === seats_old whenever OLD.status and
        // NEW.status are both in that set (e.g. pending_verification ->
        // confirmed) — the trigger's `IF seats_new <= seats_old THEN RETURN
        // NEW` short-circuit fires and CAPACITY_FULL can never be raised for
        // that transition, regardless of how full the event is.
        const [newClause] = body.match(new RegExp(`NEW\\.status ${PENDING_SET.replace(/[()]/g, '\\$&')}`))!
        const [oldClause] = body.match(new RegExp(`OLD\\.status ${PENDING_SET.replace(/[()]/g, '\\$&')}`))!
        expect(newClause.replace('NEW.status', 'X')).toBe(oldClause.replace('OLD.status', 'X'))
    })

    it('keeps the seat-serializing lock (FOR NO KEY UPDATE) before the recount — this is what makes the last-seat race resolve to exactly one winner', () => {
        // "Given un evento con capacity_limit=2 y 1 confirmed + 1
        // pending_payment vigente / When un tercer invitado intenta RSVP":
        // two concurrent writers both pass the cheap seats_new<=seats_old
        // check, then both try to lock the events row. Postgres serializes
        // them there; the loser's recount (after the lock wait) sees the
        // winner's committed row and is the one that raises CAPACITY_FULL.
        // Unchanged from drizzle/0002_enforce_event_capacity.sql.
        expect(body).toContain('FOR NO KEY UPDATE')
        expect(body.indexOf('FOR NO KEY UPDATE')).toBeLessThan(body.indexOf('SELECT COALESCE(SUM'))
        expect(body).toContain("RAISE EXCEPTION 'CAPACITY_FULL' USING ERRCODE = 'P0001'")
    })

    it('changes nothing else about the reviewed 0002 body (lock choice, +1 handling, exception)', () => {
        const body0002 = capacityFunctionBodyFromMigration('drizzle/0002_enforce_event_capacity.sql')
        // Strip the only intentional diff (the status predicate) from both
        // bodies and diff what remains.
        const strip = (text: string) => text.replace(
            /status IN \('confirmed', 'pending_payment', 'pending_verification'\)|status = 'confirmed'/g,
            'STATUS_PREDICATE',
        )
        expect(strip(body).trim().replace(/\s+/g, ' ')).toBe(strip(body0002).trim().replace(/\s+/g, ' '))
    })

    it('the 0009 body fingerprint matches the constant migration-semantic-contract.ts widened its check to', () => {
        expect(capacityFunctionBodyFingerprint(body)).toBe(EXPECTED_PENDING_STATES_CAPACITY_FUNCTION_BODY_HASH)
        expect(capacityFunctionBodyFingerprint(body)).not.toBe(EXPECTED_CAPACITY_FUNCTION_BODY_HASH)
    })
})

describe('migration-preflight — 0009 pending states classification', () => {
    it('lists exactly the seven flat table.column entries the migration adds', () => {
        expect(REQUIRED_PENDING_STATES_OBJECTS.columns).toEqual([
            'events.email_verification_enabled',
            'rsvps.pending_expires_at',
            'rsvps.verified_at',
            'rsvps.verification_token_hash',
            'rsvps.verification_expires_at',
            'rsvp_invitation_links.is_courtesy',
            'rsvp_invitation_links.skip_verification',
        ])
    })

    const validHistoricalSemantics = Object.fromEntries(
        HISTORICAL_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as HistoricalSemanticState
    const validPasswordLifecycleSemantics = Object.fromEntries(
        PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as PasswordLifecycleSemanticState
    const validRsvpInvitationSemantics = Object.fromEntries(
        RSVP_INVITATION_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as RsvpInvitationSemanticState
    const validPendingStatesSemantics = Object.fromEntries(
        PENDING_STATES_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as PendingStatesSemanticState
    const absentPaymentsSemantics = Object.fromEntries(
        PAYMENTS_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as PaymentsSemanticState
    const validPaymentsSemantics = Object.fromEntries(
        PAYMENTS_SEMANTIC_CHECK_NAMES.map(name => [name, true]),
    ) as PaymentsSemanticState
    // ISSUE-015: 0011 has not run yet in this suite's fixtures — every state
    // here represents check-in as absent. See tests/checkin-migration.test.ts
    // for the classification of a database that has actually run 0011.
    const absentCheckinSemantics = Object.fromEntries(
        CHECKIN_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as CheckinSemanticState
    // ISSUE-021: 0012 has not run yet in this suite's fixtures either — every
    // state here also represents the ledger as absent.
    const absentLedgerSemantics = Object.fromEntries(
        LEDGER_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as LedgerSemanticState

    // A DB that has run through exactly 0008 (rsvp invitation complete,
    // migration 0009's columns absent).
    const objectsAt0008: MigrationObjectState = {
        tables: [...REQUIRED_HISTORICAL_OBJECTS.tables],
        columns: [...REQUIRED_HISTORICAL_OBJECTS.columns],
        constraints: [...REQUIRED_HISTORICAL_OBJECTS.constraints],
        indexes: [...REQUIRED_HISTORICAL_OBJECTS.indexes],
        triggers: [...REQUIRED_HISTORICAL_OBJECTS.triggers],
        functions: [...REQUIRED_HISTORICAL_OBJECTS.functions],
        historicalSemantics: validHistoricalSemantics,
        duplicateEventEmailGroups: 0,
        orphanRsvps: 0,
        presentationColumns: [...REQUIRED_PRESENTATION_OBJECTS.columns],
        presentationConstraints: [...REQUIRED_PRESENTATION_OBJECTS.constraints],
        imagePositionColumns: [...REQUIRED_IMAGE_POSITION_OBJECTS.columns],
        imagePositionConstraints: [...REQUIRED_IMAGE_POSITION_OBJECTS.constraints],
        passwordLifecycleTables: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.tables],
        passwordLifecycleColumns: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.columns],
        passwordLifecycleConstraints: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.constraints],
        passwordLifecycleIndexes: [...REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.indexes],
        passwordLifecycleSemantics: validPasswordLifecycleSemantics,
        rsvpInvitationTables: [...REQUIRED_RSVP_INVITATION_OBJECTS.tables],
        rsvpInvitationColumns: [...REQUIRED_RSVP_INVITATION_OBJECTS.columns],
        rsvpInvitationConstraints: [...REQUIRED_RSVP_INVITATION_OBJECTS.constraints],
        rsvpInvitationIndexes: [...REQUIRED_RSVP_INVITATION_OBJECTS.indexes],
        rsvpInvitationSemantics: validRsvpInvitationSemantics,
        pendingStatesColumns: [],
        pendingStatesSemantics: Object.fromEntries(
            PENDING_STATES_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
        ) as PendingStatesSemanticState,
        paymentsTables: [],
        paymentsColumns: [],
        paymentsConstraints: [],
        paymentsIndexes: [],
        paymentsSemantics: absentPaymentsSemantics,
        checkinColumns: [],
        checkinSemantics: absentCheckinSemantics,
        ledgerTables: [],
        ledgerColumns: [],
        ledgerConstraints: [],
        ledgerIndexes: [],
        ledgerSemantics: absentLedgerSemantics,
    }

    const registryUpTo0008 = Array.from({ length: 9 }, (_, index) => ({
        hash: `hash-${index}`,
        createdAt: index,
    }))
    const registryUpTo0009 = [...registryUpTo0008, { hash: 'hash-9', createdAt: 9 }]
    const registryUpTo0010 = [...registryUpTo0009, { hash: 'hash-10', createdAt: 10 }]

    it('classifies an exact 0008 database as ready to apply 0009 (canApply0009)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0008,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedRsvpInvitationRegistry: registryUpTo0008,
            expectedCurrentRegistry: registryUpTo0009,
            objects: objectsAt0008,
        })

        expect(result).toMatchObject({
            classification: 'registered-rsvp-invitation-ready',
            canApply0008: false,
            canApply0009: true,
            missingPendingStatesObjects: REQUIRED_PENDING_STATES_OBJECTS.columns,
        })
    })

    // ISSUE-010: this exact object state (0009-complete, 0010's rsvp_payments/
    // payment_required objects still absent) used to be the terminal
    // 'registered-current-schema' before migration 0010 existed. Now that
    // 0010 exists, this state is one step behind "current" — it's the new
    // intermediate registered-pending-states-ready gate, mirroring how
    // registered-rsvp-invitation-ready was introduced when 0009 shipped. See
    // tests/rsvp-payments-migration.test.ts for the classification of a
    // database that has actually run 0010.
    it('classifies the 0009 objects (applied on a disposable Neon branch) as ready to apply 0010 (canApply0010)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0009,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedRsvpInvitationRegistry: registryUpTo0008,
            expectedPendingStatesRegistry: registryUpTo0009,
            expectedCurrentRegistry: registryUpTo0010,
            objects: {
                ...objectsAt0008,
                pendingStatesColumns: [...REQUIRED_PENDING_STATES_OBJECTS.columns],
                pendingStatesSemantics: validPendingStatesSemantics,
            },
        })

        expect(result).toMatchObject({
            classification: 'registered-pending-states-ready',
            canApply0009: false,
            canApply0010: true,
            missingPendingStatesObjects: [],
            invalidPendingStatesSemantics: [],
            missingPaymentsObjects: [
                ...REQUIRED_PAYMENTS_OBJECTS.tables,
                ...REQUIRED_PAYMENTS_OBJECTS.columns,
                ...REQUIRED_PAYMENTS_OBJECTS.constraints,
                ...REQUIRED_PAYMENTS_OBJECTS.indexes,
            ],
        })
    })

    it('fails closed for a partial 0009 state (columns present, capacity trigger body not yet updated)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0009,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedRsvpInvitationRegistry: registryUpTo0008,
            expectedPendingStatesRegistry: registryUpTo0009,
            expectedCurrentRegistry: registryUpTo0010,
            objects: {
                ...objectsAt0008,
                pendingStatesColumns: [...REQUIRED_PENDING_STATES_OBJECTS.columns],
                pendingStatesSemantics: {
                    ...validPendingStatesSemantics,
                    'column.rsvps.verification_token_hash': false,
                },
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.invalidPendingStatesSemantics).toContain('column.rsvps.verification_token_hash')
        expect(result.reasons.join('\n')).toContain('invalid pending states semantics')
    })

    // ISSUE-015: this exact object state (0010-complete, 0011's check-in
    // columns still absent) used to be the terminal 'registered-current-schema'
    // before migration 0011 existed. Now that 0011 exists, this state is one
    // step behind "current" — it's the new intermediate registered-payments-ready
    // gate, mirroring how registered-pending-states-ready was introduced when
    // 0010 shipped. See tests/checkin-migration.test.ts for the classification
    // of a database that has actually run 0011.
    it('classifies the 0010 objects (applied on a disposable Neon branch) as ready to apply 0011 (canApply0011)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0010,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedRsvpInvitationRegistry: registryUpTo0008,
            expectedPendingStatesRegistry: registryUpTo0009,
            expectedPaymentsRegistry: registryUpTo0010,
            expectedCurrentRegistry: registryUpTo0010,
            objects: {
                ...objectsAt0008,
                pendingStatesColumns: [...REQUIRED_PENDING_STATES_OBJECTS.columns],
                pendingStatesSemantics: validPendingStatesSemantics,
                paymentsTables: [...REQUIRED_PAYMENTS_OBJECTS.tables],
                paymentsColumns: [...REQUIRED_PAYMENTS_OBJECTS.columns],
                paymentsConstraints: [...REQUIRED_PAYMENTS_OBJECTS.constraints],
                paymentsIndexes: [...REQUIRED_PAYMENTS_OBJECTS.indexes],
                paymentsSemantics: validPaymentsSemantics,
            },
        })

        expect(result).toMatchObject({
            classification: 'registered-payments-ready',
            canApply0010: false,
            canApply0011: true,
            missingPaymentsObjects: [],
            invalidPaymentsSemantics: [],
        })
    })

    it('fails closed for a partial 0010 state (rsvp_payments columns present, amount_cents CHECK not yet valid)', () => {
        const result = classifyMigrationPreflight({
            drizzleRegistry: registryUpTo0010,
            publicRegistry: null,
            expectedFoundationRegistry: [],
            expectedPresentationRegistry: [],
            expectedImagePositionRegistry: [],
            expectedRsvpInvitationRegistry: registryUpTo0008,
            expectedPendingStatesRegistry: registryUpTo0009,
            expectedCurrentRegistry: registryUpTo0010,
            objects: {
                ...objectsAt0008,
                pendingStatesColumns: [...REQUIRED_PENDING_STATES_OBJECTS.columns],
                pendingStatesSemantics: validPendingStatesSemantics,
                paymentsTables: [...REQUIRED_PAYMENTS_OBJECTS.tables],
                paymentsColumns: [...REQUIRED_PAYMENTS_OBJECTS.columns],
                paymentsConstraints: [...REQUIRED_PAYMENTS_OBJECTS.constraints],
                paymentsIndexes: [...REQUIRED_PAYMENTS_OBJECTS.indexes],
                paymentsSemantics: {
                    ...validPaymentsSemantics,
                    'constraint.rsvp_payments_amount_cents_check': false,
                },
            },
        })

        expect(result.classification).toBe('registered-inconsistent-schema')
        expect(result.invalidPaymentsSemantics).toContain('constraint.rsvp_payments_amount_cents_check')
        expect(result.reasons.join('\n')).toContain('invalid payments semantics')
    })
})

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
    db: { execute: executeMock },
    rsvps: {},
    events: {},
    appSettings: {},
    rsvpInvitationLinks: {},
}))

import { RSVP_STATUS, expireStalePendingRsvps } from '@/lib/queries'

function sqlTextOf(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
}

describe('RSVP_STATUS', () => {
    it('exposes exactly the five canonical status values from the issue spec', () => {
        expect(RSVP_STATUS).toEqual({
            CONFIRMED: 'confirmed',
            CANCELLED: 'cancelled',
            PENDING_PAYMENT: 'pending_payment',
            PENDING_VERIFICATION: 'pending_verification',
            EXPIRED: 'expired',
        })
    })
})

describe('expireStalePendingRsvps', () => {
    beforeEach(() => executeMock.mockReset())

    const expiredRow = {
        id: 'rsvp-1',
        event_id: 'fiesta',
        name: 'Alex',
        email: 'alex@example.com',
        phone: '+525500000000',
        plus_one: false,
        plus_one_name: null,
        status: 'expired',
        email_sent: null,
        email_history: [],
        cancel_token: null,
        created_at: '2026-08-17T00:00:00.000Z',
        pending_expires_at: null,
        verified_at: null,
        verification_token_hash: null,
        verification_expires_at: null,
    }

    it('uses exactly one SQL statement: expire vencidos + restore their invitation links', async () => {
        executeMock.mockResolvedValueOnce({ rows: [expiredRow] })

        const result = await expireStalePendingRsvps('fiesta')

        expect(executeMock).toHaveBeenCalledTimes(1)
        expect(result).toEqual([expect.objectContaining({
            id: 'rsvp-1',
            eventId: 'fiesta',
            status: 'expired',
            pendingExpiresAt: null,
            verifiedAt: null,
            verificationTokenHash: null,
            verificationExpiresAt: null,
        })])

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        expect(statement).toContain('expired_rsvps AS')
        expect(statement).toContain("SET status =")
        expect(statement).toContain('pending_expires_at = NULL')
        expect(statement).toContain('pending_expires_at < now()')
        expect(statement).toContain('restored_links AS')
        expect(statement).toContain('used_at = NULL')
        expect(statement).toContain('used_rsvp_id = NULL')
        expect(statement).toContain('used_rsvp_id IN (SELECT id FROM expired_rsvps)')
        expect(statement).toContain('revoked_at IS NULL')
        expect(statement).toContain('expires_at IS NULL OR expires_at > now()')

        // Restoration must be scoped to rows this statement just expired, and
        // must run after (not instead of) the expiration itself.
        expect(statement.indexOf('expired_rsvps AS')).toBeLessThan(statement.indexOf('restored_links AS'))
        expect(statement.match(/UPDATE rsvps/g)).toHaveLength(1)
        expect(statement.match(/UPDATE rsvp_invitation_links/g)).toHaveLength(1)
    })

    it('scopes the expiry to pending_payment/pending_verification rows of the given event only', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })
        await expireStalePendingRsvps('fiesta')

        const statement = sqlTextOf(executeMock.mock.calls[0][0])
        const expireClause = statement.slice(
            statement.indexOf('expired_rsvps AS'),
            statement.indexOf('restored_links AS'),
        )
        expect(expireClause).toContain('WHERE event_id =')
        expect(expireClause).toContain('status IN (')
    })

    it('returns an empty array (never null) when nothing was expired', async () => {
        executeMock.mockResolvedValueOnce({ rows: [] })
        await expect(expireStalePendingRsvps('fiesta')).resolves.toEqual([])
    })

    it('retries once on a deadlock abort, same pattern as saveRsvpWithInvitation', async () => {
        const root = Object.assign(new Error('deadlock detected'), { code: '40P01' })
        executeMock.mockRejectedValueOnce(Object.assign(new Error('Failed query'), { cause: root }))
        executeMock.mockResolvedValueOnce({ rows: [expiredRow] })

        const result = await expireStalePendingRsvps('fiesta')

        expect(executeMock).toHaveBeenCalledTimes(2)
        expect(result).toHaveLength(1)
    })

    it('maps every rsvps column onto the RSVP shape, including the four new pending-state columns', async () => {
        executeMock.mockResolvedValueOnce({
            rows: [{
                ...expiredRow,
                pending_expires_at: null,
                verified_at: '2026-08-17T01:00:00.000Z',
                verification_token_hash: 'a'.repeat(64),
                verification_expires_at: '2026-08-18T00:00:00.000Z',
            }],
        })

        const [rsvp] = await expireStalePendingRsvps('fiesta')

        expect(rsvp.verifiedAt).toEqual(new Date('2026-08-17T01:00:00.000Z'))
        expect(rsvp.verificationTokenHash).toBe('a'.repeat(64))
        expect(rsvp.verificationExpiresAt).toEqual(new Date('2026-08-18T00:00:00.000Z'))
    })
})
