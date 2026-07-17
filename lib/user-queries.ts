/**
 * User-related database queries
 * Handles user CRUD and event assignments
 */

import { db, users, userEventAssignments, events } from './db'
import { randomUUID } from 'crypto'
import { eq, and, desc, sql } from 'drizzle-orm'
import { generatePasswordBoundSessionToken, hashPassword } from './auth-utils'
import { validatePasswordPolicy } from './password-policy'
import type { User, NewUser, UserEventAssignment } from './schema'

// ============================================
// User CRUD Functions
// ============================================

export class UserPasswordPolicyError extends Error {
    readonly code = 'PASSWORD_POLICY_VIOLATION' as const

    constructor(readonly policyErrors: string[]) {
        super('La contraseña no cumple con la política requerida')
        this.name = 'UserPasswordPolicyError'
    }
}

/**
 * Create a new user
 */
export async function createUser(data: {
    email: string
    password: string
    name: string
    role?: 'super_admin' | 'manager' | 'viewer'
    invitedBy?: string
}): Promise<User> {
    if (!db) throw new Error('Database not configured')

    const policy = validatePasswordPolicy(data.password, {
        email: data.email,
        name: data.name,
    })
    if (!policy.ok) {
        throw new UserPasswordPolicyError(policy.errors)
    }

    // Check if email already exists
    const existing = await getUserByEmail(data.email)
    if (existing) {
        throw new Error('Ya existe un usuario con este email')
    }

    // Hash password
    const passwordHash = await hashPassword(data.password)

    const [user] = await db.insert(users).values({
        email: data.email.toLowerCase().trim(),
        passwordHash,
        name: data.name.trim(),
        role: data.role || 'viewer',
        invitedBy: data.invitedBy || null,
    }).returning()

    return user
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
    if (!db) throw new Error('Database not configured')

    const [user] = await db.select()
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1)

    return user || null
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
    if (!db) throw new Error('Database not configured')

    const [user] = await db.select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1)

    return user || null
}

/**
 * Get all users
 */
export async function getAllUsers(): Promise<User[]> {
    if (!db) throw new Error('Database not configured')

    return db.select()
        .from(users)
        .orderBy(desc(users.createdAt))
}

/**
 * Update user
 */
export async function updateUser(
    id: string,
    updates: Partial<Pick<User, 'name' | 'role' | 'isActive'>>
): Promise<User> {
    if (!db) throw new Error('Database not configured')

    const [updated] = await db.update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning()

    if (!updated) throw new Error('Usuario no encontrado')
    return updated
}

/**
 * Set (or clear) the forced-change flag independent of a password write.
 */
export async function setMustChangePassword(id: string, value: boolean): Promise<void> {
    if (!db) throw new Error('Database not configured')

    await db.update(users)
        .set({ mustChangePassword: value })
        .where(eq(users.id, id))
}

/**
 * Self-service password change (A1, SI3). Atomically: updates the password
 * hash, clears the forced-change flag, and revokes every OTHER session for
 * this user — all in a single statement. A single statement is atomic on
 * Postgres by itself; this project's neon-http driver does not support
 * interactive `db.transaction()`, so multi-effect security writes MUST be
 * expressed this way (one round trip, one implicit transaction) rather than
 * as several separate statements.
 */
export async function changePasswordKeepingSession(
    id: string,
    expectedPasswordHash: string,
    newPasswordHash: string,
    exceptToken: string,
): Promise<{ token: string; expiresAt: Date } | null> {
    if (!db) throw new Error('Database not configured')

    const replacementToken = generatePasswordBoundSessionToken(newPasswordHash)

    const result = await db.execute(sql`
        WITH updated_user AS (
            UPDATE users AS target
            SET password_hash = ${newPasswordHash}, must_change_password = false
            WHERE target.id = ${id}
              AND target.password_hash = ${expectedPasswordHash}
              AND target.is_active = true
              AND EXISTS (
                  SELECT 1 FROM user_sessions current_session
                  WHERE current_session.user_id = target.id
                    AND current_session.token = ${exceptToken}
                    AND current_session.expires_at > now()
              )
            RETURNING target.id
        ),
        deleted_sessions AS (
            DELETE FROM user_sessions
            WHERE user_id IN (SELECT id FROM updated_user)
            RETURNING user_id, token, expires_at, user_agent, ip_address
        ),
        replacement_session AS (
            INSERT INTO user_sessions (
                id, user_id, token, expires_at, user_agent, ip_address
            )
            SELECT ${randomUUID()}, user_id, ${replacementToken}, expires_at, user_agent, ip_address
            FROM deleted_sessions
            WHERE token = ${exceptToken}
            RETURNING token, expires_at
        ),
        invalidated_reset_tokens AS (
            UPDATE password_reset_tokens
            SET consumed_at = now(), issuance_slot = NULL
            WHERE user_id IN (SELECT id FROM updated_user)
              AND consumed_at IS NULL
            RETURNING id
        )
        SELECT token, expires_at FROM replacement_session
    `)

    const row = result.rows[0] as { token: string; expires_at: Date | string } | undefined
    return row
        ? {
            token: row.token,
            expiresAt: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
        }
        : null
}

/**
 * Admin-initiated password reset (A2, SI3). Atomically: sets a new
 * (temporary) password hash, forces a change on next login, and revokes ALL
 * sessions for the target user — all in a single statement (see rationale
 * on changePasswordKeepingSession above).
 */
export async function adminResetPassword(
    id: string,
    expectedPasswordHash: string,
    newPasswordHash: string,
): Promise<boolean> {
    if (!db) throw new Error('Database not configured')

    const result = await db.execute(sql`
        WITH updated_user AS (
            UPDATE users AS target
            SET password_hash = ${newPasswordHash}, must_change_password = true
            WHERE target.id = ${id}
              AND target.password_hash = ${expectedPasswordHash}
              AND target.is_active = true
            RETURNING target.id
        ),
        revoked_sessions AS (
            DELETE FROM user_sessions
            WHERE user_id IN (SELECT id FROM updated_user)
            RETURNING id
        ),
        invalidated_reset_tokens AS (
            UPDATE password_reset_tokens
            SET consumed_at = now(), issuance_slot = NULL
            WHERE user_id IN (SELECT id FROM updated_user)
              AND consumed_at IS NULL
            RETURNING id
        )
        SELECT id FROM updated_user
    `)

    return result.rows.length > 0
}

/**
 * Deactivate user (soft delete)
 */
export async function deactivateUser(id: string): Promise<void> {
    if (!db) throw new Error('Database not configured')

    await db.update(users)
        .set({ isActive: false })
        .where(eq(users.id, id))
}

// ============================================
// Event Assignment Functions
// ============================================

/**
 * Get all events assigned to a user
 */
export async function getUserEventAssignments(userId: string): Promise<Array<{
    assignment: UserEventAssignment
    event: {
        id: string
        slug: string
        title: string
        isActive: boolean | null
    }
}>> {
    if (!db) throw new Error('Database not configured')

    const assignments = await db.select()
        .from(userEventAssignments)
        .where(eq(userEventAssignments.userId, userId))
        .orderBy(desc(userEventAssignments.assignedAt))

    // Get event details for each assignment
    const result = []
    for (const assignment of assignments) {
        const [event] = await db.select({
            id: events.id,
            slug: events.slug,
            title: events.title,
            isActive: events.isActive,
        })
            .from(events)
            .where(eq(events.id, assignment.eventId))
            .limit(1)

        if (event) {
            result.push({ assignment, event })
        }
    }

    return result
}

/**
 * Assign an event to a user
 */
export async function assignEventToUser(
    userId: string,
    eventId: string,
    role: 'manager' | 'viewer',
    assignedBy?: string
): Promise<UserEventAssignment> {
    if (!db) throw new Error('Database not configured')

    // Check if assignment already exists
    const [existing] = await db.select()
        .from(userEventAssignments)
        .where(and(
            eq(userEventAssignments.userId, userId),
            eq(userEventAssignments.eventId, eventId)
        ))
        .limit(1)

    if (existing) {
        // Update existing assignment
        const [updated] = await db.update(userEventAssignments)
            .set({ role, assignedBy: assignedBy || null, assignedAt: new Date() })
            .where(eq(userEventAssignments.id, existing.id))
            .returning()
        return updated
    }

    // Create new assignment
    const [assignment] = await db.insert(userEventAssignments)
        .values({
            userId,
            eventId,
            role,
            assignedBy: assignedBy || null,
        })
        .returning()

    return assignment
}

/**
 * Remove event assignment from user
 */
export async function removeEventAssignment(userId: string, eventId: string): Promise<void> {
    if (!db) throw new Error('Database not configured')

    await db.delete(userEventAssignments)
        .where(and(
            eq(userEventAssignments.userId, userId),
            eq(userEventAssignments.eventId, eventId)
        ))
}

/**
 * Check if user has access to event with specific role
 */
export async function userHasEventAccess(
    userId: string,
    eventId: string,
    requiredRole?: 'manager' | 'viewer'
): Promise<{ hasAccess: boolean; role: string | null }> {
    if (!db) throw new Error('Database not configured')

    const [assignment] = await db.select()
        .from(userEventAssignments)
        .where(and(
            eq(userEventAssignments.userId, userId),
            eq(userEventAssignments.eventId, eventId)
        ))
        .limit(1)

    if (!assignment) {
        return { hasAccess: false, role: null }
    }

    // If no specific role required, any assignment grants access
    if (!requiredRole) {
        return { hasAccess: true, role: assignment.role }
    }

    // Manager has all permissions
    if (assignment.role === 'manager') {
        return { hasAccess: true, role: assignment.role }
    }

    // Viewer only has access if viewer role is required
    if (requiredRole === 'viewer' && assignment.role === 'viewer') {
        return { hasAccess: true, role: assignment.role }
    }

    return { hasAccess: false, role: assignment.role }
}

/**
 * Get all event IDs a user has access to
 */
export async function getUserAccessibleEventIds(userId: string): Promise<string[]> {
    if (!db) throw new Error('Database not configured')

    const assignments = await db.select({ eventId: userEventAssignments.eventId })
        .from(userEventAssignments)
        .where(eq(userEventAssignments.userId, userId))

    return assignments.map(a => a.eventId)
}
