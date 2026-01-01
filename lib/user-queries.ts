/**
 * User-related database queries
 * Handles user CRUD and event assignments
 */

import { db, users, userEventAssignments, events } from './db'
import { eq, and, desc } from 'drizzle-orm'
import { hashPassword } from './auth-utils'
import type { User, NewUser, UserEventAssignment } from './schema'

// ============================================
// User CRUD Functions
// ============================================

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
 * Update user password
 */
export async function updateUserPassword(id: string, newPassword: string): Promise<void> {
    if (!db) throw new Error('Database not configured')

    const passwordHash = await hashPassword(newPassword)

    await db.update(users)
        .set({ passwordHash })
        .where(eq(users.id, id))
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
