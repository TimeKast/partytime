import bcrypt from 'bcryptjs'
import { db, users, userSessions } from './db'
import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { eq, and, ne, gt, lt, sql } from 'drizzle-orm'
import type { User, UserSession } from './schema'

// Configuration
const SALT_ROUNDS = 12
const SESSION_DURATION_DAYS_REMEMBER = 30  // "Remember me" sessions
const SESSION_DURATION_HOURS_DEFAULT = 24  // Default session without "remember me"

// ============================================
// Password Functions
// ============================================

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
}

// ============================================
// Session Functions
// ============================================

/**
 * Generate a secure session token
 */
function generateSessionToken(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for Node.js environments without global crypto
    return require('crypto').randomBytes(32).toString('hex');
}

/**
 * Bind a newly-created DB-user session to the exact password hash observed by
 * login. The nonce remains the session secret; the HMAC tag changes whenever
 * the stored bcrypt hash changes, so a password reset invalidates a session
 * even in the narrow PostgreSQL snapshot race where the reset's DELETE cannot
 * see a just-committed concurrent INSERT.
 */
export function generatePasswordBoundSessionToken(passwordHash: string): string {
    const nonce = generateSessionToken()
    const tag = createHmac('sha256', nonce).update(passwordHash).digest('hex')
    return `${nonce}.${tag}`
}

/**
 * Legacy tokens contain no dot and remain valid until their normal expiry or
 * explicit revocation. Any token that claims the new bound format must parse
 * exactly and passes a timing-safe HMAC comparison against the current hash.
 */
export function isSessionTokenValidForPassword(token: string, passwordHash: string): boolean {
    if (!token.includes('.')) return true

    const parts = token.split('.')
    if (parts.length !== 2) return false

    const [nonce, suppliedTag] = parts
    if (!/^[a-f0-9]{64}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(suppliedTag)) {
        return false
    }

    const expectedTag = createHmac('sha256', nonce).update(passwordHash).digest()
    const suppliedTagBytes = Buffer.from(suppliedTag, 'hex')
    return suppliedTagBytes.length === expectedTag.length && timingSafeEqual(suppliedTagBytes, expectedTag)
}

/**
 * Create a new session for a user
 * @param userId - The user's ID
 * @param rememberMe - If true, session lasts 30 days; otherwise 24 hours
 * @param userAgent - Optional user agent string
 * @param ipAddress - Optional IP address
 */
export async function createSession(
    userId: string,
    rememberMe: boolean = false,
    userAgent?: string,
    ipAddress?: string
): Promise<{ token: string; expiresAt: Date }> {
    if (!db) throw new Error('Database not configured')

    const token = generateSessionToken()
    const expiresAt = new Date()

    if (rememberMe) {
        expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS_REMEMBER)
    } else {
        expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS_DEFAULT)
    }

    await db.insert(userSessions).values({
        userId,
        token,
        expiresAt,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
    })

    // Update user's last login
    await db.update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, userId))

    return { token, expiresAt }
}

/**
 * Create a DB-user session only while the exact password hash verified by the
 * route is still current. Locking the user row establishes a total order with
 * every password-change UPDATE:
 *
 * - reset wins first: the expected hash no longer matches, so no session row;
 * - login wins first: the reset changes the hash and therefore invalidates the
 *   password-bound token even if its statement snapshot misses the new row.
 */
export async function createSessionIfPasswordUnchanged(
    userId: string,
    expectedPasswordHash: string,
    rememberMe: boolean = false,
    userAgent?: string,
    ipAddress?: string,
): Promise<{ token: string; expiresAt: Date } | null> {
    if (!db) throw new Error('Database not configured')

    const token = generatePasswordBoundSessionToken(expectedPasswordHash)
    const expiresAt = new Date()

    if (rememberMe) {
        expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS_REMEMBER)
    } else {
        expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS_DEFAULT)
    }

    const result = await db.execute(sql`
        WITH eligible_user AS MATERIALIZED (
            SELECT target.id
            FROM users AS target
            WHERE target.id = ${userId}
              AND target.password_hash = ${expectedPasswordHash}
              AND target.is_active = true
            FOR UPDATE OF target
        ),
        inserted_session AS (
            INSERT INTO user_sessions (
                id, user_id, token, expires_at, user_agent, ip_address
            )
            SELECT ${randomUUID()}, eligible_user.id, ${token}, ${expiresAt}, ${userAgent || null}, ${ipAddress || null}
            FROM eligible_user
            RETURNING user_id, token
        ),
        updated_user AS (
            UPDATE users
            SET last_login_at = now()
            WHERE id IN (SELECT user_id FROM inserted_session)
            RETURNING id
        )
        SELECT token FROM inserted_session
    `)

    return result.rows.length > 0 ? { token, expiresAt } : null
}

/**
 * Validate a session token and return the associated user
 * Returns null if token is invalid or expired
 */
export async function validateSession(token: string): Promise<User | null> {
    if (!db) throw new Error('Database not configured')

    // Find session by token
    const [session] = await db.select()
        .from(userSessions)
        .where(and(
            eq(userSessions.token, token),
            gt(userSessions.expiresAt, new Date())
        ))
        .limit(1)

    if (!session) return null

    // Handle special case: super_admin via environment variables
    if (session.userId === 'super_admin_env') {
        const superAdminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || 'admin@env'
        // Return a synthetic user object for env-based super admin. This
        // account has no DB row and no stored password, so it is never
        // subject to the forced-change flag (SI8).
        return {
            id: 'super_admin_env',
            email: superAdminEmail,
            passwordHash: '',
            name: 'Super Admin',
            role: 'super_admin',
            isActive: true,
            invitedBy: null,
            mustChangePassword: false,
            createdAt: new Date(),
            lastLoginAt: new Date(),
        } as User
    }

    // Get the user from database
    const [user] = await db.select()
        .from(users)
        .where(and(
            eq(users.id, session.userId),
            eq(users.isActive, true)
        ))
        .limit(1)

    if (!user || !isSessionTokenValidForPassword(token, user.passwordHash)) {
        return null
    }

    return user
}

/**
 * Destroy a session (logout)
 */
export async function destroySession(token: string): Promise<boolean> {
    if (!db) throw new Error('Database not configured')

    await db.delete(userSessions)
        .where(eq(userSessions.token, token))

    return true
}

/**
 * Revoke all of a user's sessions, optionally keeping one token alive
 * (self-service change keeps the current session; admin/forgot-password
 * resets revoke everything — A1/A2).
 */
export async function revokeUserSessions(userId: string, exceptToken?: string): Promise<void> {
    if (!db) throw new Error('Database not configured')

    await db.delete(userSessions)
        .where(
            exceptToken
                ? and(eq(userSessions.userId, userId), ne(userSessions.token, exceptToken))
                : eq(userSessions.userId, userId)
        )
}

/**
 * Clean up expired sessions (maintenance function)
 */
export async function cleanupExpiredSessions(): Promise<number> {
    if (!db) throw new Error('Database not configured')

    const result = await db.delete(userSessions)
        .where(lt(userSessions.expiresAt, new Date()))

    return 0 // Drizzle doesn't return count, but cleanup was performed
}

// ============================================
// Cookie Helpers
// ============================================

export const SESSION_COOKIE_NAME = 'rp_session'

/**
 * Create cookie options for session
 */
export function getSessionCookieOptions(expiresAt: Date): {
    httpOnly: boolean
    secure: boolean
    sameSite: 'strict' | 'lax' | 'none'
    path: string
    expires: Date
} {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
    }
}

/**
 * Create cookie options for logout (expired cookie)
 */
export function getLogoutCookieOptions(): {
    httpOnly: boolean
    secure: boolean
    sameSite: 'strict' | 'lax' | 'none'
    path: string
    expires: Date
} {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0), // Expired date to delete cookie
    }
}
