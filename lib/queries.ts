/**
 * Database queries for RSVP and Event management
 * Replaces Firestore functions with Drizzle ORM + Neon
 */

import { db, isDatabaseConfigured, rsvps, events, eventSettings } from './db'
import { eq, desc, and } from 'drizzle-orm'
import type { Event, NewEvent, RSVP, NewRSVP, EventSettings } from './schema'
import crypto from 'crypto'

// ============================================
// RSVP Functions
// ============================================

/**
 * Save a new RSVP
 */
export async function saveRSVP(rsvpData: {
    name: string
    email: string
    phone: string
    plusOne: boolean
    eventId: string
}): Promise<RSVP> {
    if (!db) throw new Error('Database not configured')

    // Check for existing RSVP with same email for this event
    const existing = await db.select()
        .from(rsvps)
        .where(and(
            eq(rsvps.email, rsvpData.email),
            eq(rsvps.eventId, rsvpData.eventId)
        ))
        .limit(1)

    if (existing.length > 0) {
        throw new Error('Ya existe un RSVP con este email para este evento')
    }

    // Generate cancel token
    const cancelToken = generateCancelToken(crypto.randomUUID(), rsvpData.email)

    const [newRsvp] = await db.insert(rsvps)
        .values({
            name: rsvpData.name,
            email: rsvpData.email,
            phone: rsvpData.phone,
            plusOne: rsvpData.plusOne,
            eventId: rsvpData.eventId,
            status: 'confirmed',
            cancelToken,
        })
        .returning()

    return newRsvp
}

/**
 * Get all RSVPs for an event
 */
export async function getRSVPsByEvent(eventId: string): Promise<RSVP[]> {
    if (!db) throw new Error('Database not configured')

    const result = await db.select()
        .from(rsvps)
        .where(eq(rsvps.eventId, eventId))
        .orderBy(desc(rsvps.createdAt))

    return result
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
    data: Partial<Pick<RSVP, 'name' | 'email' | 'phone' | 'plusOne' | 'status'>>
): Promise<RSVP> {
    if (!db) throw new Error('Database not configured')

    const [updated] = await db.update(rsvps)
        .set(data)
        .where(eq(rsvps.id, rsvpId))
        .returning()

    if (!updated) throw new Error('RSVP no encontrado')
    return updated
}

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

    const [updated] = await db.update(rsvps)
        .set({ status: 'cancelled' })
        .where(eq(rsvps.id, rsvpId))
        .returning()

    return updated
}

/**
 * Record email sent
 */
export async function recordEmailSent(
    rsvpId: string,
    type: 'confirmation' | 'reminder' | 're-invitation'
): Promise<boolean> {
    if (!db) throw new Error('Database not configured')

    const [rsvp] = await db.select()
        .from(rsvps)
        .where(eq(rsvps.id, rsvpId))
        .limit(1)

    if (!rsvp) throw new Error('RSVP no encontrado')

    const currentHistory = (rsvp.emailHistory || []) as Array<{
        sentAt: string
        type: 'confirmation' | 'reminder' | 're-invitation'
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

    const confirmed = allRsvps.filter(r => r.status === 'confirmed').length
    const cancelled = allRsvps.filter(r => r.status === 'cancelled').length

    return {
        totalConfirmed: allRsvps.length,
        confirmed,
        cancelled,
    }
}

// ============================================
// Token Functions
// ============================================

export function generateCancelToken(rsvpId: string, email: string): string {
    const secret = process.env.CANCEL_TOKEN_SECRET || 'default-secret'
    const data = `${rsvpId}-${email}-${secret}`
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32)
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

/**
 * Get event by slug
 */
export async function getEventBySlug(slug: string): Promise<Event | null> {
    if (!db) throw new Error('Database not configured')

    const [result] = await db.select()
        .from(events)
        .where(eq(events.slug, slug))
        .limit(1)

    return result || null
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
        await db.delete(events).where(eq(events.id, eventId))
    } else {
        await db.update(events)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(events.id, eventId))
    }

    return true
}

// ============================================
// Event Settings Functions (backwards compatibility)
// ============================================

/**
 * Get event settings by eventId
 */
export async function getEventSettings(eventId: string): Promise<EventSettings | null> {
    if (!db) throw new Error('Database not configured')

    const [result] = await db.select()
        .from(eventSettings)
        .where(eq(eventSettings.eventId, eventId))
        .limit(1)

    return result || null
}

/**
 * Save event settings
 */
export async function saveEventSettings(
    settings: Omit<EventSettings, 'id' | 'updatedAt'>
): Promise<EventSettings> {
    if (!db) throw new Error('Database not configured')

    // Check if exists
    const existing = await getEventSettings(settings.eventId)

    if (existing) {
        // Update
        const [updated] = await db.update(eventSettings)
            .set({ ...settings, updatedAt: new Date() })
            .where(eq(eventSettings.eventId, settings.eventId))
            .returning()
        return updated
    } else {
        // Insert
        const [created] = await db.insert(eventSettings)
            .values(settings)
            .returning()
        return created
    }
}
