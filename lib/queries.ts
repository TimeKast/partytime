/**
 * Database queries for RSVP and Event management
 * Replaces Firestore functions with Drizzle ORM + Neon
 */

import { db, isDatabaseConfigured, rsvps, events, appSettings } from './db'
import { eq, desc, and, isNull, lte } from 'drizzle-orm'
import type { Event, NewEvent, RSVP, NewRSVP } from './schema'

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
        await db.delete(events).where(eq(events.id, eventId))
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

    // 6. Update all RSVPs that reference the old slug
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

    const result = await db.select()
        .from(events)
        .where(and(
            eq(events.reminderEnabled, true),
            eq(events.isActive, true),
            lte(events.reminderScheduledAt, now),
            isNull(events.reminderSentAt)
        ))

    return result
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
            eq(rsvps.status, 'confirmed')
        ))

    return result
}
