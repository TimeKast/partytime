/**
 * Database queries for RSVP and Event management
 * Replaces Firestore functions with Drizzle ORM + Neon
 */

import { randomUUID } from 'node:crypto'
import { db, isDatabaseConfigured, rsvps, events, appSettings, rsvpInvitationLinks, rsvpPayments } from './db'
import { eq, desc, asc, and, isNull, lte, gt, gte, sql } from 'drizzle-orm'
import type { Event, NewEvent, RSVP, NewRSVP, RsvpPayment } from './schema'

// ============================================
// RSVP Functions
// ============================================

// A2-H02: capacity is enforced by the rsvps_capacity_check trigger (see
// drizzle/0002_enforce_event_capacity.sql) — the single authority for every
// seat-adding write. The helpers below only translate its errors.
export const CAPACITY_FULL_MESSAGE = 'El evento ha alcanzado su capacidad máxima'

// ISSUE-005 (EPIC-002, migration 0009): canonical rsvps.status values.
// pending_payment/pending_verification reserve a seat (see
// drizzle/0009_pending_states.sql's enforce_event_capacity()) until they are
// confirmed or lazily expired by expireStalePendingRsvps below.
export const RSVP_STATUS = {
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    PENDING_PAYMENT: 'pending_payment',
    PENDING_VERIFICATION: 'pending_verification',
    EXPIRED: 'expired',
} as const

export type RsvpStatus = typeof RSVP_STATUS[keyof typeof RSVP_STATUS]

// ISSUE-011 (EPIC-004, migration 0010): canonical rsvp_payments.status
// values. 'created' is the row inserted right after a Checkout Session is
// created; the webhook (ISSUE-012) is the only writer of 'paid'/'refunded'.
// 'expired' is written both by that same webhook (checkout.session.expired)
// and, synchronously, by this file when a re-submit supersedes a still-
// 'created' row or a Stripe API error leaves no session to pay — see
// expireRsvpPaymentRecord below for why that direct write never breaks the
// webhook's own idempotency.
export const RSVP_PAYMENT_STATUS = {
    CREATED: 'created',
    PAID: 'paid',
    EXPIRED: 'expired',
    REFUNDED: 'refunded',
} as const

export type RsvpPaymentStatus = typeof RSVP_PAYMENT_STATUS[keyof typeof RSVP_PAYMENT_STATUS]

// drizzle >= 0.44 wraps driver errors in DrizzleQueryError: err.message is
// "Failed query: <sql>" and the real NeonDbError (with .code / the PG
// message) lives in err.cause. Walk the cause chain so classification sees
// the root Postgres error.
export function unwrapDbError(err: any): { code?: string; message: string } {
    let root = err
    for (let i = 0; i < 3 && root?.cause; i++) root = root.cause
    return { code: root?.code, message: String(root?.message ?? err?.message ?? '') }
}

export function isCapacityFullError(err: any): boolean {
    return /CAPACITY_FULL/.test(unwrapDbError(err).message)
}

export function isUniqueViolationError(err: any): boolean {
    const { code, message } = unwrapDbError(err)
    return code === '23505' || /unique|duplicate key/i.test(message)
}

// A rare but real deadlock exists between an RSVP update (child row lock →
// trigger locks parent event) and a concurrent slug rename (parent lock →
// cascade/manual update of child rows). Postgres resolves it by aborting one
// side with 40P01; a single retry makes that benign.
export function isDeadlockError(err: any): boolean {
    const { code, message } = unwrapDbError(err)
    return code === '40P01' || /deadlock detected/i.test(message)
}

// A2-H04: does a guest edit ADD seats? Reconfirming a cancelled RSVP or
// turning on plus_one while confirmed both take a seat; everything else
// (contact edits, removing the +1, cancelling) is seat-neutral or -removing
// and must never be blocked by closure state.
export function isSeatAddingChange(
    current: Pick<RSVP, 'status' | 'plusOne'>,
    update: { status?: string; plusOne?: boolean | null },
): boolean {
    const currentSeats = current.status === RSVP_STATUS.CONFIRMED ? 1 + (current.plusOne ? 1 : 0) : 0
    const nextStatus = update.status ?? current.status
    const nextPlusOne = update.plusOne ?? current.plusOne
    const nextSeats = nextStatus === RSVP_STATUS.CONFIRMED ? 1 + (nextPlusOne ? 1 : 0) : 0
    return nextSeats > currentSeats
}

async function withDeadlockRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn()
    } catch (err: any) {
        // A deadlock abort means nothing committed — one retry is safe.
        if (isDeadlockError(err)) return await fn()
        throw err
    }
}

// ISSUE-007 (EPIC-003): the caller (route) generates the raw token, hashes
// it, and passes only the hash + shared TTL expiry here — the raw token
// never enters lib/queries.ts. Both verification_expires_at and
// pending_expires_at get this same instant (PLAN-EPICS-002-005.md §3.2): if
// the guest never clicks, the pending row expires and releases its seat.
export interface PendingVerificationIssuance {
    tokenHash: string
    expiresAt: Date
}

/**
 * Save a new RSVP. When `verification` is provided the row is created (or
 * an eligible existing row reactivated) as `pending_verification` with that
 * token hash/expiry instead of going straight to `confirmed`.
 */
export async function saveRSVP(
    rsvpData: {
        name: string
        email: string
        phone: string
        plusOne: boolean
        plusOneName?: string | null
        eventId: string
    },
    verification?: PendingVerificationIssuance,
): Promise<RSVP> {
    return withDeadlockRetry(() => saveRSVPOnce(rsvpData, verification))
}

export interface RsvpInvitationLinkAdminRecord {
    id: string
    eventId: string
    tokenHash: string
    expiresAt: Date
    // ISSUE-020/PLAN §2.1: per-link flags the organizer chooses at creation.
    // Read-only surface here — ISSUE-007/011 honor them when consuming a link.
    isCourtesy: boolean
    skipVerification: boolean
    usedAt: Date | null
    usedRsvpId: string | null
    usedRsvpName: string | null
    revokedAt: Date | null
    revokedBy: string | null
    createdBy: string
    createdAt: Date
}

export interface SaveRsvpWithInvitationInput {
    tokenHash: string
    eventId: string
    name: string
    email: string
    phone: string
    plusOne: boolean
    plusOneName?: string | null
    // ISSUE-007: a verification bearer the caller MUST always generate for
    // every invitation-flow attempt (cheap: one randomBytes + one sha256),
    // regardless of whether it will end up used. Whether it is actually
    // persisted is decided entirely inside the CTE below, from data read
    // fresh in the same statement (invitation_event.email_verification_enabled
    // AND NOT candidate.skip_verification) — never from a value the caller
    // read moments earlier. That closes the TOCTOU window a caller-side
    // decision would otherwise open: if the flag flipped between the
    // caller's read and this statement, a stale caller-side "skip" would
    // land a pending_verification row with no token, stranding the guest.
    verificationCandidate: {
        tokenHash: string
        expiresAt: Date
    }
    // ISSUE-011 (EPIC-004): a payment bearer the caller MUST always generate
    // for every invitation-flow attempt, exactly like verificationCandidate
    // above — cheap (just a Date), and whether it is actually used is decided
    // fresh inside the CTE below (invitation_event.payment_required AND NOT
    // candidate.is_courtesy). Only the TTL is needed here: creating the real
    // Stripe Checkout Session is a network call the route makes AFTER this
    // statement returns, once it knows the row actually landed on
    // pending_payment — see app/api/rsvp/route.ts.
    paymentCandidate: {
        expiresAt: Date
    }
}

/**
 * Persist only the digest for a newly issued bearer capability.
 */
export async function createRsvpInvitationLink(input: {
    id: string
    eventId: string
    tokenHash: string
    expiresAt: Date
    createdBy: string
    isCourtesy: boolean
    skipVerification: boolean
}): Promise<RsvpInvitationLinkAdminRecord> {
    if (!db) throw new Error('Database not configured')

    const [created] = await db.insert(rsvpInvitationLinks).values({
        id: input.id,
        eventId: input.eventId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
        isCourtesy: input.isCourtesy,
        skipVerification: input.skipVerification,
    }).returning({
        id: rsvpInvitationLinks.id,
        eventId: rsvpInvitationLinks.eventId,
        tokenHash: rsvpInvitationLinks.tokenHash,
        expiresAt: rsvpInvitationLinks.expiresAt,
        isCourtesy: rsvpInvitationLinks.isCourtesy,
        skipVerification: rsvpInvitationLinks.skipVerification,
        usedAt: rsvpInvitationLinks.usedAt,
        usedRsvpId: rsvpInvitationLinks.usedRsvpId,
        revokedAt: rsvpInvitationLinks.revokedAt,
        revokedBy: rsvpInvitationLinks.revokedBy,
        createdBy: rsvpInvitationLinks.createdBy,
        createdAt: rsvpInvitationLinks.createdAt,
    })

    return { ...created, usedRsvpName: null }
}

export async function listRsvpInvitationLinks(eventId: string): Promise<RsvpInvitationLinkAdminRecord[]> {
    if (!db) throw new Error('Database not configured')

    return db.select({
        id: rsvpInvitationLinks.id,
        eventId: rsvpInvitationLinks.eventId,
        tokenHash: rsvpInvitationLinks.tokenHash,
        expiresAt: rsvpInvitationLinks.expiresAt,
        isCourtesy: rsvpInvitationLinks.isCourtesy,
        skipVerification: rsvpInvitationLinks.skipVerification,
        usedAt: rsvpInvitationLinks.usedAt,
        usedRsvpId: rsvpInvitationLinks.usedRsvpId,
        usedRsvpName: rsvps.name,
        revokedAt: rsvpInvitationLinks.revokedAt,
        revokedBy: rsvpInvitationLinks.revokedBy,
        createdBy: rsvpInvitationLinks.createdBy,
        createdAt: rsvpInvitationLinks.createdAt,
    })
        .from(rsvpInvitationLinks)
        .leftJoin(rsvps, and(
            eq(rsvps.id, rsvpInvitationLinks.usedRsvpId),
            eq(rsvps.eventId, rsvpInvitationLinks.eventId),
        ))
        .where(eq(rsvpInvitationLinks.eventId, eventId))
        .orderBy(desc(rsvpInvitationLinks.createdAt))
}

/** Internal admin record used to prove and reconstruct one selected bearer. */
export async function getRsvpInvitationLinkForAdmin(
    id: string,
    eventId: string,
): Promise<RsvpInvitationLinkAdminRecord | null> {
    if (!db) throw new Error('Database not configured')

    const [link] = await db.select({
        id: rsvpInvitationLinks.id,
        eventId: rsvpInvitationLinks.eventId,
        tokenHash: rsvpInvitationLinks.tokenHash,
        expiresAt: rsvpInvitationLinks.expiresAt,
        isCourtesy: rsvpInvitationLinks.isCourtesy,
        skipVerification: rsvpInvitationLinks.skipVerification,
        usedAt: rsvpInvitationLinks.usedAt,
        usedRsvpId: rsvpInvitationLinks.usedRsvpId,
        usedRsvpName: rsvps.name,
        revokedAt: rsvpInvitationLinks.revokedAt,
        revokedBy: rsvpInvitationLinks.revokedBy,
        createdBy: rsvpInvitationLinks.createdBy,
        createdAt: rsvpInvitationLinks.createdAt,
    })
        .from(rsvpInvitationLinks)
        .leftJoin(rsvps, and(
            eq(rsvps.id, rsvpInvitationLinks.usedRsvpId),
            eq(rsvps.eventId, rsvpInvitationLinks.eventId),
        ))
        .where(and(
            eq(rsvpInvitationLinks.id, id),
            eq(rsvpInvitationLinks.eventId, eventId),
        ))
        .limit(1)

    return link || null
}

/** Revoke only a still-active link belonging to the selected event. */
export async function revokeRsvpInvitationLink(
    id: string,
    eventId: string,
    revokedBy: string,
): Promise<boolean> {
    if (!db) throw new Error('Database not configured')

    const [revoked] = await db.update(rsvpInvitationLinks)
        .set({ revokedAt: new Date(), revokedBy })
        .where(and(
            eq(rsvpInvitationLinks.id, id),
            eq(rsvpInvitationLinks.eventId, eventId),
            isNull(rsvpInvitationLinks.usedAt),
            isNull(rsvpInvitationLinks.revokedAt),
            gt(rsvpInvitationLinks.expiresAt, sql`now()`),
        ))
        .returning({ id: rsvpInvitationLinks.id })

    return !!revoked
}

export interface RsvpInvitationPublicEventResult {
    event: Event
    // ISSUE-020: the public validate route derives requiresPayment/
    // requiresVerification from these — never expose the raw flags themselves.
    isCourtesy: boolean
    skipVerification: boolean
}

/**
 * Public read model for a valid capability. The select intentionally includes
 * only the event table plus the two link flags needed to compute the public
 * copy: link ids, hashes and actor metadata never leave the data layer on
 * this path. Reading does not consume the token.
 */
export async function getRsvpInvitationEvent(tokenHash: string): Promise<RsvpInvitationPublicEventResult | null> {
    if (!db) throw new Error('Database not configured')

    const [row] = await db.select({
        event: events,
        isCourtesy: rsvpInvitationLinks.isCourtesy,
        skipVerification: rsvpInvitationLinks.skipVerification,
    })
        .from(rsvpInvitationLinks)
        .innerJoin(events, eq(events.slug, rsvpInvitationLinks.eventId))
        .where(and(
            eq(rsvpInvitationLinks.tokenHash, tokenHash),
            isNull(rsvpInvitationLinks.usedAt),
            isNull(rsvpInvitationLinks.revokedAt),
            gt(rsvpInvitationLinks.expiresAt, sql`now()`),
            eq(events.isActive, true),
        ))
        .limit(1)

    return row || null
}

/**
 * Atomically create/reactivate an RSVP and consume its one-time capability.
 *
 * neon-http does not support interactive transactions, so every state change
 * is expressed in one data-modifying CTE statement. `FOR UPDATE` conditionally
 * claims the still-valid token row; concurrent callers serialize there and
 * PostgreSQL rechecks the validity predicate after the wait. The final token
 * UPDATE depends on a returned RSVP row. Any uniqueness/capacity/trigger error
 * aborts the whole statement, rolling back both RSVP and claim.
 */
export async function saveRsvpWithInvitation(
    input: SaveRsvpWithInvitationInput,
): Promise<RSVP | null> {
    if (!db) throw new Error('Database not configured')

    const email = input.email.trim()
    const emailLower = email.toLowerCase()
    const verificationTokenHash = input.verificationCandidate.tokenHash
    const verificationExpiresAt = input.verificationCandidate.expiresAt
    const paymentExpiresAt = input.paymentCandidate.expiresAt
    // ISSUE-009 (EPIC-003): reactivated_rsvp's verified_at is set NULL
    // unconditionally below, unlike saveRSVPOnce's public-flow reactivation
    // above (which has a CASE preserving it for an already-verified,
    // case-insensitively identical email). An invite can bypass straight to
    // confirmed via skip_verification, so a carried-over verified_at here
    // would misrepresent an address that was never checked on THIS attempt.
    // existing_rsvp above only ever matches a row whose lower(email) already
    // equals this submission's (same rsvps_event_email_unique reasoning as
    // saveRSVPOnce's reachability note), so "the email changed" is never a
    // genuinely different identity here either — just a possible case
    // change — which is exactly why there is no invite-flow parallel to the
    // public flow's "same guest already proved it" grace case: this path
    // can confirm without ever asking, so nothing should ever look verified.
    let result
    try {
        result = await withDeadlockRetry(() => db!.execute(sql`
        WITH eligible_invitation AS MATERIALIZED (
            -- ISSUE-011/PLAN §2.1: requires_payment and requires_verification
            -- are both computed fresh here — never from anything the caller
            -- read earlier (same TOCTOU reasoning as the ISSUE-007 predecessor
            -- of this comment). Payment supersedes verification: requires_
            -- verification is only true when requires_payment is false, so the
            -- two are mutually exclusive and the CASE branches below can check
            -- requires_payment first without ever double-gating a row.
            SELECT candidate.id, candidate.is_courtesy, candidate.skip_verification,
                   (invitation_event.payment_required AND NOT candidate.is_courtesy)
                       AS requires_payment,
                   (NOT (invitation_event.payment_required AND NOT candidate.is_courtesy)
                       AND invitation_event.email_verification_enabled AND NOT candidate.skip_verification)
                       AS requires_verification
            FROM rsvp_invitation_links AS candidate
            INNER JOIN events AS invitation_event
                ON invitation_event.slug = candidate.event_id
            WHERE candidate.token_hash = ${input.tokenHash}
              AND candidate.event_id = ${input.eventId}
              AND candidate.used_at IS NULL
              AND candidate.revoked_at IS NULL
              AND candidate.expires_at > now()
              AND invitation_event.is_active = true
            FOR UPDATE OF candidate
        ),
        existing_rsvp AS MATERIALIZED (
            SELECT target.id
            FROM rsvps AS target
            WHERE target.event_id = ${input.eventId}
              AND lower(target.email) = ${emailLower}
              AND EXISTS (SELECT 1 FROM eligible_invitation)
            FOR UPDATE OF target
        ),
        reactivated_rsvp AS (
            UPDATE rsvps AS target
            SET name = ${input.name},
                email = ${email},
                phone = ${input.phone},
                plus_one = ${input.plusOne},
                plus_one_name = ${input.plusOneName || null},
                status = CASE WHEN (SELECT requires_payment FROM eligible_invitation)
                              THEN ${RSVP_STATUS.PENDING_PAYMENT}
                              WHEN (SELECT requires_verification FROM eligible_invitation)
                              THEN ${RSVP_STATUS.PENDING_VERIFICATION} ELSE ${RSVP_STATUS.CONFIRMED} END,
                verified_at = NULL,
                verification_token_hash = CASE WHEN (SELECT requires_verification FROM eligible_invitation)
                              THEN ${verificationTokenHash} ELSE NULL END,
                verification_expires_at = CASE WHEN (SELECT requires_verification FROM eligible_invitation)
                              THEN ${verificationExpiresAt} ELSE NULL END,
                pending_expires_at = CASE WHEN (SELECT requires_payment FROM eligible_invitation)
                              THEN ${paymentExpiresAt}
                              WHEN (SELECT requires_verification FROM eligible_invitation)
                              THEN ${verificationExpiresAt} ELSE NULL END
            -- PLAN §2.1: expired rows must be reactivable so a guest whose
            -- pending payment/verification lapsed can retry with the same
            -- (restored) invitation link. Seats are re-checked by the
            -- capacity trigger on this UPDATE (expired rows hold no seat).
            WHERE target.id IN (SELECT id FROM existing_rsvp)
              AND target.status IN (${RSVP_STATUS.CANCELLED}, ${RSVP_STATUS.EXPIRED})
              AND EXISTS (SELECT 1 FROM eligible_invitation)
            RETURNING target.*
        ),
        inserted_rsvp AS (
            INSERT INTO rsvps (
                id, event_id, name, email, phone, plus_one, plus_one_name, status,
                verification_token_hash, verification_expires_at, pending_expires_at
            )
            SELECT ${randomUUID()}, ${input.eventId}, ${input.name}, ${email}, ${input.phone},
                   ${input.plusOne}, ${input.plusOneName || null},
                   CASE WHEN eligible_invitation.requires_payment
                        THEN ${RSVP_STATUS.PENDING_PAYMENT}
                        WHEN eligible_invitation.requires_verification
                        THEN ${RSVP_STATUS.PENDING_VERIFICATION} ELSE ${RSVP_STATUS.CONFIRMED} END,
                   CASE WHEN eligible_invitation.requires_verification
                        THEN ${verificationTokenHash} ELSE NULL END,
                   CASE WHEN eligible_invitation.requires_verification
                        THEN ${verificationExpiresAt} ELSE NULL END,
                   CASE WHEN eligible_invitation.requires_payment
                        THEN ${paymentExpiresAt}
                        WHEN eligible_invitation.requires_verification
                        THEN ${verificationExpiresAt} ELSE NULL END
            FROM eligible_invitation
            WHERE NOT EXISTS (SELECT 1 FROM existing_rsvp)
            ON CONFLICT DO NOTHING
            RETURNING rsvps.*
        ),
        successful_rsvp AS (
            SELECT * FROM reactivated_rsvp
            UNION ALL
            SELECT * FROM inserted_rsvp
        ),
        claimed_invitation AS (
            UPDATE rsvp_invitation_links AS claimed
            SET used_at = now(),
                used_rsvp_id = (SELECT id FROM successful_rsvp LIMIT 1)
            WHERE claimed.id IN (SELECT id FROM eligible_invitation)
              AND claimed.used_at IS NULL
              AND claimed.revoked_at IS NULL
              AND EXISTS (SELECT 1 FROM successful_rsvp)
            RETURNING claimed.id
        )
        SELECT successful_rsvp.*
        FROM successful_rsvp
        WHERE EXISTS (SELECT 1 FROM claimed_invitation)
        `))
    } catch (err: any) {
        if (isCapacityFullError(err)) throw new Error(CAPACITY_FULL_MESSAGE)
        throw err
    }

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) return null

    return mapRsvpRow(row)
}

/**
 * Map a raw `rsvps` row (as returned by a hand-written `RETURNING *`/`SELECT *`
 * statement) to the `RSVP` shape. Shared by every query that reads whole rows
 * back from a CTE instead of going through drizzle's own row mapper — keeps
 * the pending-state columns (ISSUE-005) included everywhere a row is mapped.
 */
function mapRsvpRow(row: Record<string, unknown>): RSVP {
    return {
        id: String(row.id),
        eventId: String(row.event_id),
        name: String(row.name),
        email: String(row.email),
        phone: String(row.phone),
        plusOne: row.plus_one === true,
        plusOneName: row.plus_one_name == null ? null : String(row.plus_one_name),
        status: String(row.status),
        emailSent: row.email_sent == null ? null : new Date(String(row.email_sent)),
        emailHistory: Array.isArray(row.email_history) ? row.email_history as RSVP['emailHistory'] : [],
        cancelToken: row.cancel_token == null ? null : String(row.cancel_token),
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
        pendingExpiresAt: row.pending_expires_at == null ? null : new Date(String(row.pending_expires_at)),
        verifiedAt: row.verified_at == null ? null : new Date(String(row.verified_at)),
        verificationTokenHash: row.verification_token_hash == null ? null : String(row.verification_token_hash),
        verificationExpiresAt: row.verification_expires_at == null
            ? null
            : new Date(String(row.verification_expires_at)),
    }
}

/**
 * ISSUE-005 (EPIC-002): lazy expiration of pending rows, run at the start of
 * every RSVP attempt on an event (wired in ISSUE-007/011 — this is only the
 * helper + test). One CTE statement (neon-http has no interactive
 * transactions, same pattern as saveRsvpWithInvitation above):
 *   1. expires pending_payment/pending_verification rows whose TTL passed;
 *   2. restores the invitation link that produced each expired row — only if
 *      the link is still not revoked and not expired itself — so the guest
 *      can retry with the same link (PLAN-EPICS-002-005.md §2.1).
 * Wrapped in withDeadlockRetry defensively: it writes rsvps then
 * rsvp_invitation_links in one statement, the same multi-table shape that
 * motivates the retry on saveRsvpWithInvitation.
 */
export async function expireStalePendingRsvps(eventSlug: string): Promise<RSVP[]> {
    if (!db) throw new Error('Database not configured')

    const result = await withDeadlockRetry(() => db!.execute(sql`
        WITH expired_rsvps AS (
            UPDATE rsvps
            SET status = ${RSVP_STATUS.EXPIRED}, pending_expires_at = NULL
            WHERE event_id = ${eventSlug}
              AND status IN (${RSVP_STATUS.PENDING_PAYMENT}, ${RSVP_STATUS.PENDING_VERIFICATION})
              AND pending_expires_at < now()
            RETURNING *
        ),
        restored_links AS (
            UPDATE rsvp_invitation_links
            SET used_at = NULL,
                used_rsvp_id = NULL
            WHERE used_rsvp_id IN (SELECT id FROM expired_rsvps)
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > now())
            RETURNING id
        )
        SELECT * FROM expired_rsvps
    `))

    return (result.rows as Record<string, unknown>[]).map(mapRsvpRow)
}

/**
 * ISSUE-007 (EPIC-003): atomically consume a verification token — validates
 * status, expiry and hash match, and flips the row to `confirmed` in the
 * same statement. Single-table, so a plain `UPDATE ... RETURNING` is already
 * one atomic statement (no CTE needed here, unlike saveRsvpWithInvitation's
 * multi-table consume+claim). Of any number of concurrent callers racing the
 * same token, the predicate (`status = pending_verification AND
 * verification_token_hash = tokenHash AND verification_expires_at > now()`)
 * combined with `RETURNING` guarantees at most one observes a non-empty
 * result — the loser's UPDATE matches zero rows because the winner already
 * moved the row's status away from `pending_verification`. A vencido, ya
 * usado (status no longer pending_verification), or otro-evento token (slug
 * mismatch) never matches the WHERE clause, so it fails closed without any
 * mutation. Comparing the hash via SQL `=` is not a JS secret-length
 * comparison (64 hex chars) — see lib/verification.ts.
 */
export async function verifyRsvpByToken(slug: string, tokenHash: string): Promise<RSVP | null> {
    if (!db) throw new Error('Database not configured')

    const result = await db.execute(sql`
        UPDATE rsvps
        SET status = ${RSVP_STATUS.CONFIRMED},
            verified_at = now(),
            verification_token_hash = NULL,
            verification_expires_at = NULL,
            pending_expires_at = NULL
        WHERE event_id = ${slug}
          AND status = ${RSVP_STATUS.PENDING_VERIFICATION}
          AND verification_token_hash = ${tokenHash}
          AND verification_expires_at > now()
        RETURNING *
    `)

    const row = result.rows[0] as Record<string, unknown> | undefined
    return row ? mapRsvpRow(row) : null
}

/**
 * ISSUE-007: reissue (overwrite) the verification token/expiries on a
 * guest's own still-pending row — the resend-verification route's atomic
 * write. Scoped to `pending_verification` only: an already-confirmed,
 * cancelled, or expired row has nothing to resend for, and this UPDATE
 * simply matches zero rows in that case (fails closed, same shape as
 * verifyRsvpByToken above).
 */
export async function reissueVerificationToken(input: {
    eventId: string
    email: string
    tokenHash: string
    expiresAt: Date
}): Promise<RSVP | null> {
    if (!db) throw new Error('Database not configured')

    const emailLower = input.email.trim().toLowerCase()
    const result = await db.execute(sql`
        UPDATE rsvps
        SET verification_token_hash = ${input.tokenHash},
            verification_expires_at = ${input.expiresAt},
            pending_expires_at = ${input.expiresAt}
        WHERE event_id = ${input.eventId}
          AND lower(email) = ${emailLower}
          AND status = ${RSVP_STATUS.PENDING_VERIFICATION}
        RETURNING *
    `)

    const row = result.rows[0] as Record<string, unknown> | undefined
    return row ? mapRsvpRow(row) : null
}

// ISSUE-007: statuses an existing row may be reactivated FROM. A confirmed
// (or, once ISSUE-011 lands, pending_payment) row is a live registration and
// must reject as a duplicate, not be silently overwritten. An expired row
// already released its seat (PLAN-EPICS-002-005.md §3.1: "el email queda
// libre para reintentar") and a still-pending_verification row is exactly
// the re-submit case the issue's Gherkin covers — refresh it in place.
const RSVP_REACTIVATABLE_STATUSES: readonly string[] = [
    RSVP_STATUS.CANCELLED,
    RSVP_STATUS.EXPIRED,
    RSVP_STATUS.PENDING_VERIFICATION,
]

async function saveRSVPOnce(
    rsvpData: {
        name: string
        email: string
        phone: string
        plusOne: boolean
        plusOneName?: string | null
        eventId: string
    },
    verification?: PendingVerificationIssuance,
): Promise<RSVP> {
    if (!db) throw new Error('Database not configured')

    const email = rsvpData.email.trim()
    const emailLower = email.toLowerCase()
    const initialStatus = verification ? RSVP_STATUS.PENDING_VERIFICATION : RSVP_STATUS.CONFIRMED
    const verificationTokenHash = verification?.tokenHash ?? null
    const verificationExpiresAt = verification?.expiresAt ?? null
    // Same TTL drives both columns — see PendingVerificationIssuance.
    const pendingExpiresAt = verification?.expiresAt ?? null
    // ISSUE-009: whether THIS event/attempt requires verification at all —
    // gates the "preserve verified_at on identical email" exception below.
    const requiresVerification = verification !== undefined

    // A2-H05: case-insensitive lookup so "Foo@x.com" and "foo@x.com" are the
    // same guest and do not create duplicate confirmations.
    const existing = await db.select()
        .from(rsvps)
        .where(and(
            eq(rsvps.eventId, rsvpData.eventId),
            sql`lower(${rsvps.email}) = ${emailLower}`
        ))
        .limit(1)

    if (existing.length > 0) {
        const prev = existing[0]
        if (!RSVP_REACTIVATABLE_STATUSES.includes(prev.status)) {
            throw new Error('Ya existe un RSVP con este email para este evento')
        }
        // A2-H03/ISSUE-007: a previously cancelled/expired guest re-registers,
        // or a still-pending_verification guest re-submits the form — either
        // way, reactivate the existing row in place (the unique index would
        // otherwise reject a fresh insert) rather than erroring. The
        // predicate requires status STILL `prev.status` so two concurrent
        // re-submits don't both win: the loser gets an empty result and is
        // treated as a duplicate.
        //
        // ISSUE-009 (EPIC-003): a fresh submission resets verification state
        // (PLAN-EPICS-002-005.md §3.2) EXCEPT for the one case where the
        // guest re-registers under the EXACT same (case-insensitive) email
        // that already completed verification — that guest already proved
        // ownership, so re-sending a token would only add friction. Whether
        // that exception applies is decided fresh from the row's OWN stored
        // `email`/`verified_at` columns inside this single UPDATE (matching
        // ISSUE-007's `requires_verification` CTE pattern for
        // saveRsvpWithInvitation below) rather than from `prev` — which was
        // read by a separate SELECT moments earlier — closing the same class
        // of TOCTOU that pattern closes. Postgres evaluates every SET
        // expression against the PRE-update row, so `email`/`verified_at` in
        // the CASE below always see the value before this statement's own
        // `email = ...` assignment lands.
        //
        // Reachability note (see tests/verification-reactivation.test.ts):
        // the unique (event_id, lower(email)) index (rsvps_event_email_unique)
        // means `prev` is only ever found because `lower(prev.email)` already
        // equals `emailLower` — a genuinely DIFFERENT email can never
        // reactivate this row through this lookup; it either matches no row
        // (fresh insert, unrelated to any prior verification) or a different
        // row already keyed to that other email. So the "case-insensitive
        // identical email" bucket below is the ONLY reachable "same row"
        // case; the `lower(email) = ${emailLower}` comparison is kept anyway
        // as the SQL-level source of truth (not a redundant JS check), so a
        // future change to the SELECT above can't silently reopen the TOCTOU
        // this closes.
        const preservesVerification = sql`(${requiresVerification} AND lower(email) = ${emailLower} AND verified_at IS NOT NULL)`
        let raw
        try {
            raw = await db.execute(sql`
                UPDATE rsvps
                SET name = ${rsvpData.name},
                    email = ${email},
                    phone = ${rsvpData.phone},
                    plus_one = ${rsvpData.plusOne},
                    plus_one_name = ${rsvpData.plusOneName || null},
                    status = CASE WHEN ${preservesVerification}
                                  THEN ${RSVP_STATUS.CONFIRMED} ELSE ${initialStatus} END,
                    verified_at = CASE WHEN ${preservesVerification}
                                  THEN verified_at ELSE NULL END,
                    verification_token_hash = CASE WHEN ${preservesVerification}
                                  THEN NULL ELSE ${verificationTokenHash} END,
                    verification_expires_at = CASE WHEN ${preservesVerification}
                                  THEN NULL ELSE ${verificationExpiresAt} END,
                    pending_expires_at = CASE WHEN ${preservesVerification}
                                  THEN NULL ELSE ${pendingExpiresAt} END
                WHERE id = ${prev.id} AND status = ${prev.status}
                RETURNING *
            `)
        } catch (err: any) {
            if (isCapacityFullError(err)) throw new Error(CAPACITY_FULL_MESSAGE)
            throw err
        }
        const reactivatedRow = raw.rows[0] as Record<string, unknown> | undefined
        if (!reactivatedRow) {
            throw new Error('Ya existe un RSVP con este email para este evento')
        }
        return mapRsvpRow(reactivatedRow)
    }

    try {
        const [newRsvp] = await db.insert(rsvps)
            .values({
                name: rsvpData.name,
                email,
                phone: rsvpData.phone,
                plusOne: rsvpData.plusOne,
                plusOneName: rsvpData.plusOneName || null,
                eventId: rsvpData.eventId,
                status: initialStatus,
                verificationTokenHash,
                verificationExpiresAt,
                pendingExpiresAt,
            })
            .returning()

        return newRsvp
    } catch (err: any) {
        // A2-H06: a concurrent insert that won the race trips the unique index.
        if (isUniqueViolationError(err)) {
            throw new Error('Ya existe un RSVP con este email para este evento')
        }
        if (isCapacityFullError(err)) throw new Error(CAPACITY_FULL_MESSAGE)
        throw err
    }
}

// ISSUE-011: statuses saveRSVPPendingPayment may move a row FROM. Unlike
// RSVP_REACTIVATABLE_STATUSES above, PENDING_PAYMENT itself is included —
// a re-submit while the guest's OWN pending_payment row is still valid
// reuses that SAME row in place (refreshing its TTL) rather than erroring,
// per the ISSUE-011 Gherkin ("el mismo email reintenta mientras su pending
// sigue vivo"). CONFIRMED is deliberately excluded: a live registration is a
// duplicate, not something a public-flow payment attempt may overwrite.
const RSVP_PENDING_PAYMENT_REACTIVATABLE_STATUSES: readonly string[] = [
    RSVP_STATUS.CANCELLED,
    RSVP_STATUS.EXPIRED,
    RSVP_STATUS.PENDING_VERIFICATION,
    RSVP_STATUS.PENDING_PAYMENT,
]

/**
 * ISSUE-011 (EPIC-004): create or reuse the `pending_payment` row for the
 * PUBLIC (non-invitation) flow — `event.payment_required` is a plain column
 * read fresh by the route just before this call (no per-link flag to race
 * against, same trust level as `saveRSVP`'s `event.emailVerificationEnabled`
 * usage). Unlike the invitation flow's CTE, there is no capability to consume
 * here, so a plain select-then-update/insert is enough; the reactivation
 * UPDATE's `WHERE status = ${prev.status}` predicate still makes concurrent
 * re-submits/reactivations race-safe (loser matches zero rows, treated as a
 * duplicate) exactly like `saveRSVPOnce`.
 *
 * The caller (app/api/rsvp/route.ts) is responsible for everything Stripe:
 * this function only ever returns the RSVP row so the route can decide,
 * from its OWN `id`, whether a Checkout Session already exists for it
 * (`getActivePaymentForRsvp`) and needs to be superseded.
 */
export async function saveRSVPPendingPayment(
    rsvpData: {
        name: string
        email: string
        phone: string
        plusOne: boolean
        plusOneName?: string | null
        eventId: string
    },
    pendingExpiresAt: Date,
): Promise<RSVP> {
    return withDeadlockRetry(() => saveRSVPPendingPaymentOnce(rsvpData, pendingExpiresAt))
}

async function saveRSVPPendingPaymentOnce(
    rsvpData: {
        name: string
        email: string
        phone: string
        plusOne: boolean
        plusOneName?: string | null
        eventId: string
    },
    pendingExpiresAt: Date,
): Promise<RSVP> {
    if (!db) throw new Error('Database not configured')

    const email = rsvpData.email.trim()
    const emailLower = email.toLowerCase()

    // A2-H05: same case-insensitive lookup as saveRSVPOnce.
    const existing = await db.select()
        .from(rsvps)
        .where(and(
            eq(rsvps.eventId, rsvpData.eventId),
            sql`lower(${rsvps.email}) = ${emailLower}`
        ))
        .limit(1)

    if (existing.length > 0) {
        const prev = existing[0]
        if (!RSVP_PENDING_PAYMENT_REACTIVATABLE_STATUSES.includes(prev.status)) {
            throw new Error('Ya existe un RSVP con este email para este evento')
        }
        try {
            const [updated] = await db.update(rsvps)
                .set({
                    name: rsvpData.name,
                    email,
                    phone: rsvpData.phone,
                    plusOne: rsvpData.plusOne,
                    plusOneName: rsvpData.plusOneName || null,
                    status: RSVP_STATUS.PENDING_PAYMENT,
                    // Payment supersedes verification (PLAN §2) — a row
                    // moving into (or refreshed within) pending_payment never
                    // carries a stray verification token/expiry.
                    verifiedAt: null,
                    verificationTokenHash: null,
                    verificationExpiresAt: null,
                    pendingExpiresAt,
                })
                .where(and(eq(rsvps.id, prev.id), eq(rsvps.status, prev.status)))
                .returning()

            if (!updated) {
                // Concurrent re-submit/reactivation won the race first.
                throw new Error('Ya existe un RSVP con este email para este evento')
            }
            return updated
        } catch (err: any) {
            if (isCapacityFullError(err)) throw new Error(CAPACITY_FULL_MESSAGE)
            throw err
        }
    }

    try {
        const [newRsvp] = await db.insert(rsvps)
            .values({
                name: rsvpData.name,
                email,
                phone: rsvpData.phone,
                plusOne: rsvpData.plusOne,
                plusOneName: rsvpData.plusOneName || null,
                eventId: rsvpData.eventId,
                status: RSVP_STATUS.PENDING_PAYMENT,
                pendingExpiresAt,
            })
            .returning()

        return newRsvp
    } catch (err: any) {
        if (isUniqueViolationError(err)) {
            throw new Error('Ya existe un RSVP con este email para este evento')
        }
        if (isCapacityFullError(err)) throw new Error(CAPACITY_FULL_MESSAGE)
        throw err
    }
}

/**
 * ISSUE-011: release a `pending_payment` row that will never be paid — a
 * Stripe API error right after the row was created/reused (no Checkout
 * Session exists to redirect the guest to). Single UPDATE+CTE, same shape as
 * `expireStalePendingRsvps`, but targeted by id instead of by TTL: flips the
 * row to `expired` and restores the invitation link that produced it, if any
 * (the restore is a no-op for a public-flow row, since `used_rsvp_id` never
 * points at one).
 */
export async function expirePendingPaymentRsvp(rsvpId: string): Promise<RSVP | null> {
    if (!db) throw new Error('Database not configured')

    const result = await withDeadlockRetry(() => db!.execute(sql`
        WITH expired_rsvp AS (
            UPDATE rsvps
            SET status = ${RSVP_STATUS.EXPIRED}, pending_expires_at = NULL
            WHERE id = ${rsvpId} AND status = ${RSVP_STATUS.PENDING_PAYMENT}
            RETURNING *
        ),
        restored_link AS (
            UPDATE rsvp_invitation_links
            SET used_at = NULL,
                used_rsvp_id = NULL
            WHERE used_rsvp_id IN (SELECT id FROM expired_rsvp)
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > now())
            RETURNING id
        )
        SELECT * FROM expired_rsvp
    `))

    const row = result.rows[0] as Record<string, unknown> | undefined
    return row ? mapRsvpRow(row) : null
}

/**
 * ISSUE-011: the most recent still-open (`created`) Checkout Session row for
 * an RSVP, if any. Used by the route to detect a re-submit of the guest's own
 * pending_payment row so the previous Stripe session can be expired
 * best-effort before a new one is created (PLAN §3.3 Gherkin: "solo hay una
 * sesión activa").
 */
export async function getActivePaymentForRsvp(rsvpId: string): Promise<RsvpPayment | null> {
    if (!db) throw new Error('Database not configured')

    const [result] = await db.select()
        .from(rsvpPayments)
        .where(and(eq(rsvpPayments.rsvpId, rsvpId), eq(rsvpPayments.status, RSVP_PAYMENT_STATUS.CREATED)))
        .orderBy(desc(rsvpPayments.createdAt))
        .limit(1)

    return result || null
}

/**
 * Tier-4 review finding F1 (EPIC-004): two concurrent payment POSTs for the
 * same guest can both pass getActivePaymentForRsvp's pre-check before either
 * has inserted its rsvp_payments row, leaving TWO live Checkout sessions the
 * guest could pay twice. There is no partial-unique index on
 * (rsvp_id) WHERE status='created', so the invariant is enforced by
 * post-insert election instead: after inserting its own row, each request
 * asks which 'created' row is the survivor (oldest wins, id as tiebreaker for
 * equal timestamps). Exactly one request can ever see its own id first; every
 * loser expires its session and returns a retryable error.
 */
export async function electSurvivingCreatedPayment(rsvpId: string): Promise<string | null> {
    if (!db) throw new Error('Database not configured')

    const [result] = await db.select({ id: rsvpPayments.id })
        .from(rsvpPayments)
        .where(and(eq(rsvpPayments.rsvpId, rsvpId), eq(rsvpPayments.status, RSVP_PAYMENT_STATUS.CREATED)))
        .orderBy(asc(rsvpPayments.createdAt), asc(rsvpPayments.id))
        .limit(1)

    return result?.id ?? null
}

/**
 * ISSUE-011: mark a Checkout Session row `expired` — called synchronously
 * when a re-submit supersedes it (see getActivePaymentForRsvp above), ahead
 * of the ISSUE-012 webhook's own `checkout.session.expired` handling. The
 * `status = created` guard makes this idempotent: if that webhook later
 * arrives for the SAME row (Stripe still sent the event even though we
 * pre-empted it), its own equivalent UPDATE matches zero rows and no-ops —
 * exactly the same "loser matches zero rows" shape used throughout this file.
 */
export async function expireRsvpPaymentRecord(id: string): Promise<void> {
    if (!db) throw new Error('Database not configured')

    await db.update(rsvpPayments)
        .set({ status: RSVP_PAYMENT_STATUS.EXPIRED })
        .where(and(eq(rsvpPayments.id, id), eq(rsvpPayments.status, RSVP_PAYMENT_STATUS.CREATED)))
}

/**
 * ISSUE-011: insert the `rsvp_payments` row for a freshly created Checkout
 * Session. `amountCents`/`currency` are passed in rather than re-derived here
 * so the route can guarantee the EXACT same value it sent to Stripe is what
 * gets persisted (PLAN §3.3 "Fuente única de precio").
 */
export async function createRsvpPaymentRecord(input: {
    rsvpId: string
    eventId: string
    stripeSessionId: string
    amountCents: number
    currency: string
}): Promise<RsvpPayment> {
    if (!db) throw new Error('Database not configured')

    const [created] = await db.insert(rsvpPayments)
        .values({
            rsvpId: input.rsvpId,
            eventId: input.eventId,
            stripeSessionId: input.stripeSessionId,
            amountCents: input.amountCents,
            currency: input.currency,
            status: RSVP_PAYMENT_STATUS.CREATED,
        })
        .returning()

    return created
}

/**
 * ISSUE-011: the ONLY thing `GET /api/rsvp/payment-status` is allowed to read
 * — a bare status string, never a full row (no rsvp_id, no amount, no name/
 * email). Session id format is validated by the route before this is called.
 */
export async function getRsvpPaymentStatusBySessionId(stripeSessionId: string): Promise<RsvpPaymentStatus | null> {
    if (!db) throw new Error('Database not configured')

    const [result] = await db.select({ status: rsvpPayments.status })
        .from(rsvpPayments)
        .where(eq(rsvpPayments.stripeSessionId, stripeSessionId))
        .limit(1)

    return result ? (result.status as RsvpPaymentStatus) : null
}

// ISSUE-012: no PII (no email/name), and never the raw Stripe session object
// — only internal ids, so this is safe to send to any log sink. Emitted when
// Stripe already collected money but the RSVP could not land on `confirmed`
// (seat lost to capacity, or the guest cancelled while the payment was in
// flight) — the payment row stays `paid` regardless, this is purely a signal
// for manual reconciliation/refund.
function logPaymentWithoutSeat(input: { rsvpId: string; stripeSessionId: string }): void {
    console.error(JSON.stringify({
        event: 'PAYMENT_WITHOUT_SEAT',
        rsvpId: input.rsvpId,
        stripeSessionId: input.stripeSessionId,
    }))
}

export type FulfillPaidRsvpOutcome = 'confirmed' | 'replay' | 'payment_without_seat'

export interface FulfillPaidRsvpResult {
    outcome: FulfillPaidRsvpOutcome
    // Only populated when outcome === 'confirmed' — the row the caller (the
    // webhook route) needs to send the confirmation email.
    rsvp: RSVP | null
}

/**
 * ISSUE-012 (EPIC-004): the webhook's `checkout.session.completed` /
 * `checkout.session.async_payment_succeeded` handler — the ONLY writer of
 * `rsvp_payments.status = 'paid'` and the ONLY thing that ever confirms an
 * RSVP that went through Stripe. One CTE statement (neon-http has no
 * interactive transactions, same pattern as saveRsvpWithInvitation above):
 *   1. UPDATE rsvp_payments ... WHERE stripe_session_id = $1 AND status =
 *      'created' — the status condition IS the idempotency: a replayed
 *      webhook (or a losing concurrent delivery) matches zero rows here and
 *      the whole statement returns nothing further down.
 *   2. Chained off payment_id via WHERE id IN (SELECT rsvp_id FROM
 *      paid_payment): UPDATE rsvps ... WHERE status IN ('pending_payment',
 *      'expired') — the 'expired' branch is what re-confirms a guest whose
 *      pending row was lazily expired (or expired by the webhook's own
 *      `checkout.session.expired` handler below) moments before the
 *      still-valid payment webhook arrived. The capacity trigger
 *      (enforce_event_capacity) runs on this UPDATE and can reject it with
 *      CAPACITY_FULL (P0001) if the seat is genuinely gone by now.
 *   3. A LEFT JOIN (not an INNER JOIN/plain SELECT off step 2) is required so
 *      "payment step matched, rsvp step matched zero rows" is distinguishable
 *      from "payment step matched zero rows" (replay) purely from
 *      `result.rows.length` / the joined row's nullability — no separate
 *      round trip needed to tell the two apart.
 *
 * Two distinct paths land on 'payment_without_seat' — money collected, no
 * seat, always logged, NEVER thrown as an error the webhook route would turn
 * into a 5xx (Stripe must not retry an outcome that will never change):
 *   (a) the UPDATE ... rsvps above matches zero rows without an exception
 *       (e.g. the guest cancelled their own pending_payment row via the
 *       cancel-token while the Checkout session was still open) — visible
 *       right here as a joined row with only payment_id/payment_rsvp_id set.
 *   (b) the capacity trigger aborts the WHOLE statement with CAPACITY_FULL —
 *       caught below, and because the abort rolled back the payment UPDATE
 *       too, `fulfillPaymentWithoutSeat` repeats ONLY that UPDATE in a fresh,
 *       single-table statement (nothing else in it left to abort).
 */
export async function fulfillPaidRsvp(
    stripeSessionId: string,
    stripePaymentIntentId: string | null,
): Promise<FulfillPaidRsvpResult> {
    if (!db) throw new Error('Database not configured')

    let result
    try {
        result = await withDeadlockRetry(() => db!.execute(sql`
        WITH paid_payment AS (
            UPDATE rsvp_payments
            SET status = ${RSVP_PAYMENT_STATUS.PAID},
                paid_at = now(),
                stripe_payment_intent_id = ${stripePaymentIntentId}
            WHERE stripe_session_id = ${stripeSessionId}
              AND status = ${RSVP_PAYMENT_STATUS.CREATED}
            RETURNING id AS payment_id, rsvp_id AS payment_rsvp_id
        ),
        confirmed_rsvp AS (
            UPDATE rsvps
            SET status = ${RSVP_STATUS.CONFIRMED},
                verified_at = now(),
                pending_expires_at = NULL,
                verification_token_hash = NULL,
                verification_expires_at = NULL
            WHERE id IN (SELECT payment_rsvp_id FROM paid_payment)
              AND status IN (${RSVP_STATUS.PENDING_PAYMENT}, ${RSVP_STATUS.EXPIRED})
            RETURNING *
        )
        SELECT paid_payment.payment_id, paid_payment.payment_rsvp_id, confirmed_rsvp.*
        FROM paid_payment
        LEFT JOIN confirmed_rsvp ON confirmed_rsvp.id = paid_payment.payment_rsvp_id
        `))
    } catch (err: any) {
        if (isCapacityFullError(err)) {
            return fulfillPaymentWithoutSeat(stripeSessionId, stripePaymentIntentId)
        }
        throw err
    }

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) {
        // Replay, or lost a race against a concurrent delivery of the same
        // event — the payment step already matched zero rows.
        return { outcome: 'replay', rsvp: null }
    }

    if (row.id == null) {
        // Path (a) above: the payment IS paid (this statement just committed
        // it), but the rsvp update matched nothing.
        logPaymentWithoutSeat({ rsvpId: String(row.payment_rsvp_id), stripeSessionId })
        return { outcome: 'payment_without_seat', rsvp: null }
    }

    return { outcome: 'confirmed', rsvp: mapRsvpRow(row) }
}

/**
 * ISSUE-012: path (b) of fulfillPaidRsvp's PAYMENT_WITHOUT_SEAT handling —
 * see that function's docstring. Reached only after the combined CTE above
 * aborted entirely (CAPACITY_FULL), which rolled back its rsvp_payments
 * UPDATE along with everything else in that statement. Stripe already
 * charged the guest; leaving the payment row stuck on 'created' would hide a
 * real charge from reconciliation, so this repeats ONLY the payment-side
 * UPDATE, alone in its own statement (nothing left in it for the trigger —
 * which only fires on the rsvps table — to abort).
 */
async function fulfillPaymentWithoutSeat(
    stripeSessionId: string,
    stripePaymentIntentId: string | null,
): Promise<FulfillPaidRsvpResult> {
    if (!db) throw new Error('Database not configured')

    const result = await db.execute(sql`
        UPDATE rsvp_payments
        SET status = ${RSVP_PAYMENT_STATUS.PAID},
            paid_at = now(),
            stripe_payment_intent_id = ${stripePaymentIntentId}
        WHERE stripe_session_id = ${stripeSessionId}
          AND status = ${RSVP_PAYMENT_STATUS.CREATED}
        RETURNING id, rsvp_id
    `)

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) {
        // Lost a race against another delivery that already marked this
        // 'paid' (via this same fallback, or — impossible in practice, since
        // a capacity abort never leaves a committed 'paid' row, but kept as a
        // defensive no-op either way).
        return { outcome: 'replay', rsvp: null }
    }

    logPaymentWithoutSeat({ rsvpId: String(row.rsvp_id), stripeSessionId })
    return { outcome: 'payment_without_seat', rsvp: null }
}

/**
 * ISSUE-012: the webhook's `checkout.session.expired` handler. Mirrors
 * expirePendingPaymentRsvp's link-restoration shape above (same predicate:
 * not revoked, not itself expired) but is NOT a thin wrapper around it —
 * expirePendingPaymentRsvp never touches rsvp_payments, and folding the
 * payment-row write in here too must stay inside the SAME statement so a
 * replayed event is idempotent by construction (the `status = 'created'`
 * guard on rsvp_payments is what makes a second delivery match zero rows and
 * no-op, same pattern as fulfillPaidRsvp above). Idempotent for every
 * ordering: a session already superseded by a re-submit
 * (expireRsvpPaymentRecord, called synchronously from app/api/rsvp/route.ts)
 * or already paid (fulfillPaidRsvp) never re-mutates here either, because in
 * both cases the payment row is no longer 'created'.
 */
export async function expireRsvpPaymentBySessionId(stripeSessionId: string): Promise<RSVP | null> {
    if (!db) throw new Error('Database not configured')

    const result = await withDeadlockRetry(() => db!.execute(sql`
        WITH expired_payment AS (
            UPDATE rsvp_payments
            SET status = ${RSVP_PAYMENT_STATUS.EXPIRED}
            WHERE stripe_session_id = ${stripeSessionId}
              AND status = ${RSVP_PAYMENT_STATUS.CREATED}
            RETURNING id, rsvp_id
        ),
        expired_rsvp AS (
            UPDATE rsvps
            SET status = ${RSVP_STATUS.EXPIRED}, pending_expires_at = NULL
            WHERE id IN (SELECT rsvp_id FROM expired_payment)
              AND status = ${RSVP_STATUS.PENDING_PAYMENT}
            RETURNING *
        ),
        restored_link AS (
            UPDATE rsvp_invitation_links
            SET used_at = NULL,
                used_rsvp_id = NULL
            WHERE used_rsvp_id IN (SELECT id FROM expired_rsvp)
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > now())
            RETURNING id
        )
        SELECT expired_rsvp.*
        FROM expired_payment
        LEFT JOIN expired_rsvp ON expired_rsvp.id = expired_payment.rsvp_id
    `))

    const row = result.rows[0] as Record<string, unknown> | undefined
    return row && row.id != null ? mapRsvpRow(row) : null
}

/**
 * ISSUE-012: the webhook's `charge.refunded` handler. Single-table, so a
 * plain UPDATE is already one atomic statement — no CTE needed (same
 * reasoning as expireRsvpPaymentRecord above). Scoped to `status = 'paid'` so
 * a duplicate refund event (Stripe redelivers, or a second partial refund on
 * the same charge) never re-stamps `refunded_at`. Deliberately does NOT touch
 * `rsvps` — a refund is the organizer's call on whether to also cancel the
 * guest's seat (PLAN-EPICS-002-005.md §3.3), never automatic here.
 */
export async function markRsvpPaymentRefunded(stripePaymentIntentId: string): Promise<boolean> {
    if (!db) throw new Error('Database not configured')

    const [updated] = await db.update(rsvpPayments)
        .set({ status: RSVP_PAYMENT_STATUS.REFUNDED, refundedAt: new Date() })
        .where(and(
            eq(rsvpPayments.stripePaymentIntentId, stripePaymentIntentId),
            eq(rsvpPayments.status, RSVP_PAYMENT_STATUS.PAID),
        ))
        .returning({ id: rsvpPayments.id })

    return !!updated
}

// ISSUE-013 (EPIC-004): payment fields joined onto an RSVP row for the admin
// list — only ever populated when the caller passes `includePayments: true`
// (the route only does so for a `payment_required` event — never a free
// one, so a free event's DTO never carries these keys at all, see
// getRSVPsByEvent below). Sourced from the MOST RECENT rsvp_payments row per
// rsvp_id; deliberately never includes stripe_session_id/
// stripe_payment_intent_id, which stay internal to lib/queries.ts/the
// webhook — the admin list has no use for either and they are not safe to
// hand to the browser.
export interface RsvpWithPayment extends RSVP {
    paymentStatus: RsvpPaymentStatus | null
    paidAt: Date | null
    amountCents: number | null
    currency: string | null
}

function mapRsvpRowWithPayment(row: Record<string, unknown>): RsvpWithPayment {
    return {
        ...mapRsvpRow(row),
        paymentStatus: row.payment_status == null ? null : String(row.payment_status) as RsvpPaymentStatus,
        paidAt: row.paid_at == null ? null : new Date(String(row.paid_at)),
        amountCents: row.amount_cents == null ? null : Number(row.amount_cents),
        currency: row.currency == null ? null : String(row.currency),
    }
}

/**
 * Get all RSVPs for an event. ISSUE-013: when `includePayments` is true each
 * row is additionally joined — via a LATERAL join, the cheapest way to
 * express "latest payment per rsvp" without a second round trip or a window
 * function the neon-http driver would have to buffer client-side — to its
 * most recent `rsvp_payments` row (`ORDER BY created_at DESC LIMIT 1`).
 * `includePayments` defaults to false and is byte-for-byte the pre-ISSUE-013
 * query: a plain drizzle select with no payment columns at all, so every
 * existing caller (send-bulk-email, send-bulk-reminder, reminder-status,
 * stats) and every free event keeps seeing exactly the RSVP shape it always
 * has.
 */
export async function getRSVPsByEvent(eventId: string, options?: { includePayments?: false }): Promise<RSVP[]>
export async function getRSVPsByEvent(eventId: string, options: { includePayments: true }): Promise<RsvpWithPayment[]>
export async function getRSVPsByEvent(
    eventId: string,
    options?: { includePayments?: boolean },
): Promise<RSVP[] | RsvpWithPayment[]> {
    if (!db) throw new Error('Database not configured')

    if (!options?.includePayments) {
        const result = await db.select()
            .from(rsvps)
            .where(eq(rsvps.eventId, eventId))
            .orderBy(desc(rsvps.createdAt))

        return result
    }

    const result = await db.execute(sql`
        SELECT rsvps.*,
               latest_payment.status AS payment_status,
               latest_payment.paid_at AS paid_at,
               latest_payment.amount_cents AS amount_cents,
               latest_payment.currency AS currency
        FROM rsvps
        LEFT JOIN LATERAL (
            SELECT status, paid_at, amount_cents, currency
            FROM rsvp_payments
            WHERE rsvp_payments.rsvp_id = rsvps.id
            ORDER BY created_at DESC
            LIMIT 1
        ) latest_payment ON true
        WHERE rsvps.event_id = ${eventId}
        ORDER BY rsvps.created_at DESC
    `)

    return (result.rows as Record<string, unknown>[]).map(mapRsvpRowWithPayment)
}

/**
 * Get RSVP by ID
 */
export async function getRSVPById(rsvpId: string): Promise<RSVP | null> {
    if (!db) throw new Error('Database not configured')

    const [result] = await db.select()
        .from(rsvps)
        .where(eq(rsvps.id, rsvpId))
        .limit(1)

    return result || null
}

/**
 * Update RSVP
 */
export async function updateRSVP(
    rsvpId: string,
    // ISSUE-009: 'verifiedAt' is settable so the cancel-token update route
    // can clear it (to null) when the guest changes their email — never to
    // set it, there is no verification flow on this path.
    data: Partial<Pick<RSVP, 'name' | 'email' | 'phone' | 'plusOne' | 'plusOneName' | 'status' | 'verifiedAt'>>
): Promise<RSVP> {
    if (!db) throw new Error('Database not configured')

    let updated
    try {
        [updated] = await withDeadlockRetry(() => db!.update(rsvps)
            .set(data)
            .where(eq(rsvps.id, rsvpId))
            .returning())
    } catch (err: any) {
        // Editing an email to one already used for this event trips the unique
        // index (A2-H06) — surface a duplicate error, not a raw 500.
        if (isUniqueViolationError(err)) {
            throw new Error('Ya existe un RSVP con este email para este evento')
        }
        // Reconfirming or adding a +1 on a full event trips the capacity
        // trigger (A2-H02).
        if (isCapacityFullError(err)) throw new Error(CAPACITY_FULL_MESSAGE)
        throw err
    }

    if (!updated) throw new Error('RSVP no encontrado')
    return updated
}

// ISSUE-006: distinct sentinel so the cancel-token route can map an
// already-cancelled RSVP to 410 Gone instead of a generic 500/no-op. Kept out
// of the generic 'RSVP no encontrado' bucket (used for expired, see below)
// because the two cases are semantically different for the caller.
export const RSVP_ALREADY_CANCELLED_MESSAGE = 'RSVP_ALREADY_CANCELLED'

/**
 * Cancel RSVP
 */
export async function cancelRSVP(rsvpId: string, token: string): Promise<RSVP> {
    if (!db) throw new Error('Database not configured')

    const [rsvp] = await db.select()
        .from(rsvps)
        .where(eq(rsvps.id, rsvpId))
        .limit(1)

    if (!rsvp) throw new Error('RSVP no encontrado')

    if (!validateCancelToken(token, rsvpId, rsvp.email)) {
        throw new Error('Token inválido')
    }

    // ISSUE-006: an expired row already released its seat (and, if it came
    // from an invitation link, that link was already restored by
    // expireStalePendingRsvps) — there is nothing left for the guest's
    // cancel-token to act on, so this is treated like "not found". An
    // already-cancelled row has nothing further to cancel either; the route
    // maps this to 410 Gone instead of silently no-op-returning success.
    // pending_payment/pending_verification rows are NOT blocked here — a
    // pending guest can still cancel (PLAN-EPICS-002-005.md ISSUE-006 ACs).
    if (rsvp.status === RSVP_STATUS.EXPIRED) {
        throw new Error('RSVP no encontrado')
    }
    if (rsvp.status === RSVP_STATUS.CANCELLED) {
        throw new Error(RSVP_ALREADY_CANCELLED_MESSAGE)
    }

    const [updated] = await db.update(rsvps)
        .set({ status: RSVP_STATUS.CANCELLED })
        .where(eq(rsvps.id, rsvpId))
        .returning()

    return updated
}

/**
 * Record email sent
 */
export async function recordEmailSent(
    rsvpId: string,
    type: 'confirmation' | 'reminder' | 're-invitation' | 'verification'
): Promise<boolean> {
    if (!db) throw new Error('Database not configured')

    const [rsvp] = await db.select()
        .from(rsvps)
        .where(eq(rsvps.id, rsvpId))
        .limit(1)

    if (!rsvp) throw new Error('RSVP no encontrado')

    const currentHistory = (rsvp.emailHistory || []) as Array<{
        sentAt: string
        type: 'confirmation' | 'reminder' | 're-invitation' | 'verification'
    }>

    await db.update(rsvps)
        .set({
            emailSent: new Date(),
            emailHistory: [
                ...currentHistory,
                { sentAt: new Date().toISOString(), type }
            ]
        })
        .where(eq(rsvps.id, rsvpId))

    return true
}

/**
 * Get event stats
 */
export async function getEventStats(eventId: string) {
    if (!db) throw new Error('Database not configured')

    const allRsvps = await db.select()
        .from(rsvps)
        .where(eq(rsvps.eventId, eventId))

    const confirmed = allRsvps.filter(r => r.status === RSVP_STATUS.CONFIRMED).length
    const cancelled = allRsvps.filter(r => r.status === RSVP_STATUS.CANCELLED).length
    // ISSUE-006: expose the pending states separately (never folded into
    // "confirmed") so every consumer of this helper sees the same counters
    // the admin dashboard and /api/stats now show.
    const pendingPayment = allRsvps.filter(r => r.status === RSVP_STATUS.PENDING_PAYMENT).length
    const pendingVerification = allRsvps.filter(r => r.status === RSVP_STATUS.PENDING_VERIFICATION).length
    const expired = allRsvps.filter(r => r.status === RSVP_STATUS.EXPIRED).length

    return {
        totalConfirmed: allRsvps.length,
        confirmed,
        cancelled,
        pendingPayment,
        pendingVerification,
        expired,
    }
}

// ============================================
// Token Functions
// ============================================

export function generateCancelToken(rsvpId: string, email: string): string {
    const secret = process.env.CANCEL_TOKEN_SECRET || 'default-secret'
    const data = `${rsvpId}-${email}-${secret}`
    const nodeCrypto = require('crypto')
    return nodeCrypto.createHash('sha256').update(data).digest('hex').substring(0, 32)
}

export function validateCancelToken(token: string, rsvpId: string, email: string): boolean {
    const expectedToken = generateCancelToken(rsvpId, email)
    return token === expectedToken
}

// ============================================
// Event Functions
// ============================================

/**
 * Create a new event
 */
export async function createEvent(input: Omit<NewEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Event> {
    if (!db) throw new Error('Database not configured')

    // Check if slug exists
    const existing = await getEventBySlug(input.slug)
    if (existing) {
        throw new Error('Ya existe un evento con este slug')
    }

    const [event] = await db.insert(events)
        .values(input)
        .returning()

    return event
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
    if (!db) throw new Error('Database not configured')

    // 1. Intentar por slug
    const [result] = await db.select()
        .from(events)
        .where(eq(events.slug, slug))
        .limit(1)

    if (result) return result

    // 2. Intentar por ID (como fallback)
    const [resultById] = await db.select()
        .from(events)
        .where(eq(events.id, slug))
        .limit(1)

    return resultById || null
}

/**
 * Get event by slug (simplified - no settings merge needed)
 * Returns formatted event data for metadata generation
 */
export async function getEventBySlugWithSettings(slug: string): Promise<{
    id: string
    slug: string
    title: string
    displayTitle: string
    subtitle: string
    date: string
    time: string
    location: string
    backgroundImageUrl: string | null
    ogImageUrl: string | null
} | null> {
    const event = await getEventBySlug(slug)
    if (!event) return null

    return {
        id: event.id,
        slug: event.slug,
        title: event.title,
        displayTitle: event.displayTitle ?? '',
        subtitle: event.subtitle ?? '',
        date: event.date ?? '',
        time: event.time ?? '',
        location: event.location ?? '',
        backgroundImageUrl: event.backgroundImageUrl,
        ogImageUrl: event.ogImageUrl,
    }
}

/**
 * Get event by ID
 */
export async function getEventById(eventId: string): Promise<Event | null> {
    if (!db) throw new Error('Database not configured')

    const [result] = await db.select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1)

    return result || null
}

/**
 * Get all events
 */
export async function getAllEvents(activeOnly: boolean = false): Promise<Event[]> {
    if (!db) throw new Error('Database not configured')

    let result = await db.select()
        .from(events)
        .orderBy(desc(events.createdAt))

    if (activeOnly) {
        result = result.filter(e => e.isActive)
    }

    return result
}

/**
 * Update event
 */
export async function updateEvent(
    eventId: string,
    updates: Partial<Omit<Event, 'id' | 'createdAt'>>
): Promise<Event> {
    if (!db) throw new Error('Database not configured')

    const [updated] = await db.update(events)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning()

    if (!updated) throw new Error('Evento no encontrado')
    return updated
}

/**
 * Delete event (soft or hard)
 */
export async function deleteEvent(eventId: string, hardDelete: boolean = false): Promise<boolean> {
    if (!db) throw new Error('Database not configured')

    if (hardDelete) {
        // A3-02/A6-09: deleting only the events row left the RSVPs orphaned,
        // and a recycled slug inherited them (wrong-recipient bulk emails).
        // The FK (ON DELETE RESTRICT) now blocks that at the DB; an intentional
        // hard delete removes RSVPs + event in one batch — a single transaction
        // on neon-http, so a failure leaves both intact.
        const [ev] = await db.select({ slug: events.slug })
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1)
        if (!ev) return true
        await db.batch([
            db.delete(rsvps).where(eq(rsvps.eventId, ev.slug)),
            db.delete(events).where(eq(events.id, eventId)),
        ])
    } else {
        await db.update(events)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(events.id, eventId))
    }

    return true
}

/**
 * Update event slug
 * This also updates all RSVPs that reference the old slug
 * @returns The updated event and the count of updated RSVPs
 */
export async function updateEventSlug(
    eventId: string,
    newSlug: string
): Promise<{ event: Event; updatedRsvps: number }> {
    // A rename can be picked as the deadlock victim in the race against a
    // concurrent RSVP edit (see isDeadlockError). The retry is safe: if the
    // first attempt already renamed the event, the re-run early-returns on
    // oldSlug === newSlug.
    return withDeadlockRetry(() => updateEventSlugOnce(eventId, newSlug))
}

async function updateEventSlugOnce(
    eventId: string,
    newSlug: string
): Promise<{ event: Event; updatedRsvps: number }> {
    if (!db) throw new Error('Database not configured')

    // 1. Validate new slug format
    if (!/^[a-z0-9-]+$/.test(newSlug)) {
        throw new Error('El slug solo puede contener letras minúsculas, números y guiones')
    }

    // 2. Get the current event
    const [currentEvent] = await db.select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1)

    if (!currentEvent) {
        throw new Error('Evento no encontrado')
    }

    const oldSlug = currentEvent.slug

    // 3. If slug is the same, no changes needed
    if (oldSlug === newSlug) {
        return { event: currentEvent, updatedRsvps: 0 }
    }

    // 4. Check if new slug is already in use
    const [existingWithSlug] = await db.select()
        .from(events)
        .where(eq(events.slug, newSlug))
        .limit(1)

    if (existingWithSlug) {
        throw new Error('Ya existe un evento con este slug')
    }

    // 5. Update the event's slug
    const [updatedEvent] = await db.update(events)
        .set({ slug: newSlug, updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning()

    // 6. Update any RSVPs still referencing the old slug. With the FK's
    // ON UPDATE CASCADE this is a 0-row no-op (step 5 already moved them
    // atomically); it stays as the fallback for a deploy window where this
    // code runs before the FK migration (adversarial-review finding).
    const result = await db.update(rsvps)
        .set({ eventId: newSlug })
        .where(eq(rsvps.eventId, oldSlug))

    // Drizzle returns the number of affected rows in different ways depending on driver
    // We'll count manually
    const oldRsvps = await db.select()
        .from(rsvps)
        .where(eq(rsvps.eventId, newSlug))

    return {
        event: updatedEvent,
        updatedRsvps: oldRsvps.length
    }
}

// ============================================
// App Settings Functions
// ============================================

/**
 * Get app setting by ID
 */
export async function getAppSetting(id: string): Promise<string | null> {
    if (!db) {
        console.log(`⚠️ [getAppSetting] DB is not configured while fetching ${id}`)
        return null
    }

    try {
        const [result] = await db.select()
            .from(appSettings)
            .where(eq(appSettings.id, id))
            .limit(1)

        console.log(`🔍 [getAppSetting] Fetched ${id}:`, result ? result.value : 'null')
        return result ? result.value : null
    } catch (error) {
        console.error(`❌ [getAppSetting] Error fetching ${id}:`, error)
        return null
    }
}

/**
 * Save app setting
 */
export async function saveAppSetting(id: string, value: string): Promise<void> {
    if (!db) throw new Error('Database not configured')

    const existing = await getAppSetting(id)

    if (existing !== null) {
        await db.update(appSettings)
            .set({ value, updatedAt: new Date() })
            .where(eq(appSettings.id, id))
    } else {
        await db.insert(appSettings)
            .values({ id, value })
    }
}

// ============================================
// Email Reminder Functions
// ============================================

/**
 * Get events with pending reminders to send
 * Conditions: reminderEnabled = true, reminderScheduledAt <= now, reminderSentAt IS NULL
 */
export async function getEventsWithPendingReminders(): Promise<Event[]> {
    if (!db) throw new Error('Database not configured')

    const now = new Date()

    // A1-02: fire when the scheduled MOMENT has passed (absolute-time compare),
    // not "scheduled sometime today in UTC" — the old UTC day-window sent up to
    // ~24h early and ignored the chosen time. A short grace window lets a missed
    // run retry on the next 1-2 cron cycles (A1-06) while keeping the exposure to
    // a post-event send small (P2). A robust past-event filter needs a structured
    // event date (A1-04 / B15) — event.date is currently free text.
    //
    // Cadence caveat: with the 12h cron (`vercel.json`), a reminder can still go
    // out up to ~one interval after its scheduled time. We do NOT re-introduce
    // early sends to compensate (that was the A1-02 bug). Tightening the interval
    // requires a shorter cron than Vercel Hobby allows (A8-04 / B14, needs Pro).
    const GRACE_MS = 30 * 60 * 60 * 1000 // 30h ≈ next couple of 12h cron runs
    const graceStart = new Date(now.getTime() - GRACE_MS)

    const result = await db.select()
        .from(events)
        .where(and(
            eq(events.reminderEnabled, true),
            eq(events.isActive, true),
            lte(events.reminderScheduledAt, now),        // scheduled time has passed
            gte(events.reminderScheduledAt, graceStart), // but not ancient
            isNull(events.reminderSentAt)
        ))

    // Filter out closed events
    const upcomingEvents = result.filter(event => {
        if (event.rsvpClosed) return false
        return true
    })

    return upcomingEvents
}

/**
 * Mark reminder as sent for an event
 */
export async function markReminderSent(eventId: string): Promise<void> {
    if (!db) throw new Error('Database not configured')

    await db.update(events)
        .set({ reminderSentAt: new Date(), updatedAt: new Date() })
        .where(eq(events.id, eventId))
}

/**
 * Get confirmed RSVPs for reminder (only confirmed, no cancelled)
 */
export async function getConfirmedRSVPsForReminder(eventSlug: string): Promise<RSVP[]> {
    if (!db) throw new Error('Database not configured')

    const result = await db.select()
        .from(rsvps)
        .where(and(
            eq(rsvps.eventId, eventSlug),
            eq(rsvps.status, RSVP_STATUS.CONFIRMED)
        ))

    return result
}
