/**
 * Password reset token queries (forgot-password flow, A4/A5/A7/A8/SI1/SI2).
 */

import { db, passwordResetTokens, users } from './db'
import { eq, and, isNull, gt, lt, sql } from 'drizzle-orm'

export interface CreateResetTokenInput {
    userId: string
    tokenHash: string
    expiresAt: Date
    requestIp?: string
}

export interface IssueResetTokenInput extends CreateResetTokenInput {
    since: Date
    maxRecentTokens: number
}

/**
 * Persist a newly issued reset token. Only the SHA-256 hash is stored — the
 * raw token is emailed once and never logged or written to the database.
 */
export async function createResetToken(input: CreateResetTokenInput): Promise<void> {
    if (!db) throw new Error('Database not configured')

    await db.insert(passwordResetTokens).values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        requestIp: input.requestIp || null,
    })
}

/**
 * Count unconsumed tokens issued for a user since a given time — a
 * DB-backed issuance throttle (A8) for forgot-password, since the
 * serverless in-memory limiter alone is not authoritative across instances.
 */
export async function countRecentUnconsumedTokens(userId: string, since: Date): Promise<number> {
    if (!db) throw new Error('Database not configured')

    const rows = await db.select({ count: sql<number>`count(*)` })
        .from(passwordResetTokens)
        .where(and(
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.consumedAt),
            gt(passwordResetTokens.createdAt, since),
        ))

    return Number(rows[0]?.count ?? 0)
}

/**
 * Atomically enforce the authoritative issuance limit and insert a token.
 *
 * The active user row is locked before the count/insert CTEs run, serializing
 * concurrent issuers for the same account. Passing a non-existent decoy id is
 * safe and intentionally executes the same DB-shaped statement without
 * inserting a row; the forgot-password route uses that for anti-enumeration.
 */
export async function issueResetTokenIfAllowed(input: IssueResetTokenInput): Promise<boolean> {
    if (!db) throw new Error('Database not configured')

    const result = await db.execute(sql`
        WITH locked_user AS MATERIALIZED (
            SELECT id
            FROM users
            WHERE id = ${input.userId} AND is_active = true
            FOR UPDATE
        ),
        released_slots AS (
            UPDATE password_reset_tokens
            SET issuance_slot = NULL
            WHERE user_id IN (SELECT id FROM locked_user)
              AND issuance_slot IS NOT NULL
              AND (
                  consumed_at IS NOT NULL
                  OR expires_at <= now()
                  OR created_at <= ${input.since}
              )
            RETURNING id
        ),
        available_slot AS MATERIALIZED (
            SELECT candidate.slot
            FROM generate_series(1, ${input.maxRecentTokens}) AS candidate(slot)
            WHERE NOT EXISTS (
                SELECT 1
                FROM password_reset_tokens
                WHERE user_id IN (SELECT id FROM locked_user)
                  AND issuance_slot = candidate.slot
                  AND consumed_at IS NULL
                  AND expires_at > now()
                  AND created_at > ${input.since}
            )
            ORDER BY candidate.slot
            LIMIT 1
        ),
        inserted_token AS (
            INSERT INTO password_reset_tokens (
                id, user_id, token_hash, expires_at, request_ip, issuance_slot
            )
            SELECT ${crypto.randomUUID()}, locked_user.id, ${input.tokenHash}, ${input.expiresAt}, ${input.requestIp || null}, available_slot.slot
            FROM locked_user
            CROSS JOIN available_slot
            ON CONFLICT (user_id, issuance_slot)
                WHERE consumed_at IS NULL AND issuance_slot IS NOT NULL
                DO NOTHING
            RETURNING id
        )
        SELECT id FROM inserted_token
    `)

    return result.rows.length > 0
}

export interface ResetTokenUserContext {
    userId: string
    email: string
    name: string
}

/**
 * Resolve only a currently valid token belonging to an active user so the
 * password policy can reject identity-derived passwords before bcrypt work.
 * This read never claims the token; consumeResetToken remains the sole atomic
 * write and re-checks every predicate to close races.
 */
export async function getResetTokenUserContext(tokenHash: string): Promise<ResetTokenUserContext | null> {
    if (!db) throw new Error('Database not configured')

    const [row] = await db.select({
        userId: users.id,
        email: users.email,
        name: users.name,
    })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.consumedAt),
            gt(passwordResetTokens.expiresAt, sql`now()`),
            eq(users.isActive, true),
        ))
        .limit(1)

    return row || null
}

/**
 * Atomically claim a single-use token, update the target user's password,
 * clear the forced-change flag, and revoke ALL of their sessions (A2, SI2,
 * SI3) — all in one statement. The claim predicate
 * (`consumed_at IS NULL AND expires_at > now()`) combined with `RETURNING`
 * guarantees that of any number of concurrent callers racing the same raw
 * token, at most one observes a non-empty result. A single statement is
 * atomic on Postgres by itself; this project's neon-http driver has no
 * interactive `db.transaction()`, so this combined effect MUST be one
 * statement rather than separate reads/writes.
 */
export async function consumeResetToken(
    tokenHash: string,
    newPasswordHash: string,
): Promise<{ userId: string } | null> {
    if (!db) throw new Error('Database not configured')

    const result = await db.execute(sql`
        WITH eligible_user AS MATERIALIZED (
            SELECT target.id
            FROM users AS target
            INNER JOIN password_reset_tokens AS candidate
                ON candidate.user_id = target.id
            WHERE candidate.token_hash = ${tokenHash}
              AND candidate.consumed_at IS NULL
              AND candidate.expires_at > now()
              AND target.is_active = true
            FOR UPDATE OF target
        ),
        invalidated_reset_tokens AS (
            UPDATE password_reset_tokens AS reset_token
            SET consumed_at = now(), issuance_slot = NULL
            WHERE reset_token.user_id IN (SELECT id FROM eligible_user)
              AND reset_token.consumed_at IS NULL
            RETURNING user_id, token_hash
        ),
        updated_user AS (
            UPDATE users
            SET password_hash = ${newPasswordHash}, must_change_password = false
            WHERE id IN (
                SELECT user_id
                FROM invalidated_reset_tokens
                WHERE token_hash = ${tokenHash}
            )
            RETURNING id
        ),
        revoked_sessions AS (
            DELETE FROM user_sessions
            WHERE user_id IN (SELECT id FROM updated_user)
            RETURNING id
        )
        SELECT id AS user_id FROM updated_user
    `)

    const row = result.rows[0] as { user_id: string } | undefined
    return row ? { userId: row.user_id } : null
}

/**
 * Housekeeping: remove expired tokens. Not security-critical (an expired
 * token already fails the consume predicate above), just table hygiene.
 */
export async function cleanupExpiredResetTokens(): Promise<void> {
    if (!db) throw new Error('Database not configured')

    await db.delete(passwordResetTokens)
        .where(lt(passwordResetTokens.expiresAt, new Date()))
}
