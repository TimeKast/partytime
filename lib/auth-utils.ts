import bcrypt from 'bcryptjs'
import { db, users, userSessions } from './db'
import { eq, and, gt, lt } from 'drizzle-orm'
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
        // Return a synthetic user object for env-based super admin
        return {
            id: 'super_admin_env',
            email: superAdminEmail,
            passwordHash: '',
            name: 'Super Admin',
            role: 'super_admin',
            isActive: true,
            invitedBy: null,
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

    return user || null
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
