/**
 * Database queries for RSVP and Event management
 * Replaces Firestore functions with Drizzle ORM + Neon
 */

import { randomUUID } from 'node:crypto'
import { db, isDatabaseConfigured, rsvps, events, appSettings, rsvpInvitationLinks } from './db'
import { eq, desc, and, isNull, lte, gt, gte, sql } from 'drizzle-orm'
import type { Event, NewEvent, RSVP, NewRSVP } from './schema'

// ============================================
// RSVP Functions
// ============================================

// A2-H02: capacity is enforced by the rsvps_capacity_check trigger (see
// drizzle/0002_enforce_event_capacity.sql) — the single authority for every
// seat-adding write. The helpers below only translate its errors.
export const CAPACITY_FULL_MESSAGE = 'El evento ha alcanzado su capacidad máxima'

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
    const currentSeats = current.status === 'confirmed' ? 1 + (current.plusOne ? 1 : 0) : 0
    const nextStatus = update.status ?? current.status
    const nextPlusOne = update.plusOne ?? current.plusOne
    const nextSeats = nextStatus === 'confirmed' ? 1 + (nextPlusOne ? 1 : 0) : 0
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

/**
 * Save a new RSVP
 */
export async function saveRSVP(rsvpData: {
    name: string
    email: string
    phone: string
    plusOne: boolean
    plusOneName?: string | null
    eventId: string
}): Promise<RSVP> {
    return withDeadlockRetry(() => saveRSVPOnce(rsvpData))
}

export interface RsvpInvitationLinkAdminRecord {
    id: string
    eventId: string
    tokenHash: string
    expiresAt: Date
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
}): Promise<RsvpInvitationLinkAdminRecord> {
    if (!db) throw new Error('Database not configured')

    const [created] = await db.insert(rsvpInvitationLinks).values({
        id: input.id,
        eventId: input.eventId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
    }).returning({
        id: rsvpInvitationLinks.id,
        eventId: rsvpInvitationLinks.eventId,
        tokenHash: rsvpInvitationLinks.tokenHash,
        expiresAt: rsvpInvitationLinks.expiresAt,
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

/**
 * Public read model for a valid capability. The select intentionally includes
 * only the event table: link ids, hashes and actor metadata never leave the
 * data layer on this path. Reading does not consume the token.
 */
export async function getRsvpInvitationEvent(tokenHash: string): Promise<Event | null> {
    if (!db) throw new Error('Database not configured')

    const [row] = await db.select({ event: events })
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

    return row?.event || null
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
    let result
    try {
        result = await withDeadlockRetry(() => db!.execute(sql`
        WITH eligible_invitation AS MATERIALIZED (
            SELECT candidate.id
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
                status = 'confirmed'
            WHERE target.id IN (SELECT id FROM existing_rsvp)
              AND target.status = 'cancelled'
              AND EXISTS (SELECT 1 FROM eligible_invitation)
            RETURNING target.*
        ),
        inserted_rsvp AS (
            INSERT INTO rsvps (
                id, event_id, name, email, phone, plus_one, plus_one_name, status
            )
            SELECT ${randomUUID()}, ${input.eventId}, ${input.name}, ${email}, ${input.phone},
                   ${input.plusOne}, ${input.plusOneName || null}, 'confirmed'
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
    }
}

async function saveRSVPOnce(rsvpData: {
    name: string
    email: string
    phone: string
    plusOne: boolean
    plusOneName?: string | null
    eventId: string
}): Promise<RSVP> {
    if (!db) throw new Error('Database not configured')

    const email = rsvpData.email.trim()
    const emailLower = email.toLowerCase()

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
        if (prev.status === 'confirmed') {
            throw new Error('Ya existe un RSVP con este email para este evento')
        }
        // A2-H03: a previously cancelled guest can re-register — reactivate the
        // existing row (the unique index would otherwise reject a fresh insert).
        // The predicate requires status STILL 'cancelled' so two concurrent
        // re-registrations don't both reactivate and both send a confirmation:
        // the loser gets an empty result and is treated as a duplicate.
        let reactivated
        try {
            [reactivated] = await db.update(rsvps)
                .set({
                    name: rsvpData.name,
                    email,
                    phone: rsvpData.phone,
                    plusOne: rsvpData.plusOne,
                    plusOneName: rsvpData.plusOneName || null,
                    status: 'confirmed',
                })
                .where(and(eq(rsvps.id, prev.id), eq(rsvps.status, 'cancelled')))
                .returning()
        } catch (err: any) {
            if (isCapacityFullError(err)) throw new Error(CAPACITY_FULL_MESSAGE)
            throw err
        }
        if (!reactivated) {
            throw new Error('Ya existe un RSVP con este email para este evento')
        }
        return reactivated
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
                status: 'confirmed',
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
    data: Partial<Pick<RSVP, 'name' | 'email' | 'phone' | 'plusOne' | 'plusOneName' | 'status'>>
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
            eq(rsvps.status, 'confirmed')
        ))

    return result
}
