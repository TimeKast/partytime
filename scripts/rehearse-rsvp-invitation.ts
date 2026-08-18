/**
 * End-to-end rehearsal for a disposable Neon branch and local app server.
 * Generates the bearer only in memory, uses synthetic .invalid PII, and cleans
 * its exact RSVP/link rows. It refuses to run unless the caller pins the
 * expected branch host and explicitly enables the rehearsal.
 */
import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db, events, rsvpInvitationLinks, rsvps } from '@/lib/db'
import { createRsvpInvitationLink, saveRsvpWithInvitation } from '@/lib/queries'
import { generateRsvpInvitationToken, hashRsvpInvitationToken } from '@/lib/rsvp-invitation'

async function main() {
    if (process.env.ALLOW_RSVP_INVITATION_REHEARSAL !== 'true') {
        throw new Error('Rehearsal requires ALLOW_RSVP_INVITATION_REHEARSAL=true')
    }
    if (!db || !process.env.DATABASE_URL) throw new Error('Database not configured')

    const expectedHost = process.env.RSVP_REHEARSAL_DB_HOST
    const actualHost = new URL(process.env.DATABASE_URL).hostname
    if (!expectedHost || actualHost !== expectedHost) {
        throw new Error('DATABASE_URL does not match RSVP_REHEARSAL_DB_HOST')
    }

    const baseUrl = new URL(process.env.RSVP_REHEARSAL_BASE_URL || 'http://127.0.0.1:3100')
    const rehearsalId = randomUUID()
    const email = `codex-rsvp-${rehearsalId}@example.invalid`
    const token = generateRsvpInvitationToken()
    const concurrentEmails = [
        `codex-rsvp-race-a-${rehearsalId}@example.invalid`,
        `codex-rsvp-race-b-${rehearsalId}@example.invalid`,
    ]
    const concurrentToken = generateRsvpInvitationToken()
    let linkId: string | null = null
    let concurrentLinkId: string | null = null
    let eventSlug: string | null = null

    try {
        const [event] = await db.select({ slug: events.slug })
            .from(events)
            .where(and(
                eq(events.isActive, true),
                eq(events.capacityEnabled, false),
                eq(events.emailConfirmationEnabled, false),
            ))
            .limit(1)
        if (!event) throw new Error('No safe rehearsal event is available')
        eventSlug = event.slug

        const link = await createRsvpInvitationLink({
            id: randomUUID(),
            eventId: event.slug,
            tokenHash: hashRsvpInvitationToken(token),
            expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
            createdBy: 'codex-neon-rehearsal',
            isCourtesy: true,
            skipVerification: true,
        })
        linkId = link.id

        const validate = await fetch(new URL('/api/rsvp-invitations/validate', baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: baseUrl.origin },
            body: JSON.stringify({ token }),
        })
        if (validate.status !== 200) throw new Error('Initial validation did not return 200')

        const register = await fetch(new URL('/api/rsvp', baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: baseUrl.origin },
            body: JSON.stringify({
                name: 'Codex Neon Rehearsal',
                email,
                phone: '+15555550100',
                plusOne: false,
                eventSlug: event.slug,
                invitationToken: token,
            }),
        })
        if (register.status !== 201) throw new Error('Registration did not return 201')

        const validateAgain = await fetch(new URL('/api/rsvp-invitations/validate', baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: baseUrl.origin },
            body: JSON.stringify({ token }),
        })
        const registerAgain = await fetch(new URL('/api/rsvp', baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: baseUrl.origin },
            body: JSON.stringify({
                name: 'Codex Neon Rehearsal Retry',
                email,
                phone: '+15555550100',
                plusOne: false,
                eventSlug: event.slug,
                invitationToken: token,
            }),
        })

        const [claimed] = await db.select({ usedAt: rsvpInvitationLinks.usedAt })
            .from(rsvpInvitationLinks)
            .where(eq(rsvpInvitationLinks.id, link.id))
            .limit(1)
        const persisted = await db.select({ id: rsvps.id })
            .from(rsvps)
            .where(and(eq(rsvps.eventId, event.slug), eq(rsvps.email, email)))

        if (validateAgain.status !== 404 || registerAgain.status !== 409) {
            throw new Error('Second use did not fail closed')
        }
        if (!claimed?.usedAt || persisted.length !== 1) {
            throw new Error('Database postconditions do not prove one-time use')
        }

        const concurrentLink = await createRsvpInvitationLink({
            id: randomUUID(),
            eventId: event.slug,
            tokenHash: hashRsvpInvitationToken(concurrentToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
            createdBy: 'codex-neon-rehearsal',
            isCourtesy: true,
            skipVerification: true,
        })
        concurrentLinkId = concurrentLink.id
        const concurrentResults = await Promise.all(concurrentEmails.map((candidateEmail, index) =>
            saveRsvpWithInvitation({
                eventId: event.slug,
                tokenHash: hashRsvpInvitationToken(concurrentToken),
                name: `Codex Concurrent Rehearsal ${index + 1}`,
                email: candidateEmail,
                phone: '+15555550100',
                plusOne: false,
                plusOneName: null,
            }),
        ))
        const winners = concurrentResults.filter(result => result !== null)
        const concurrentPersisted = await db.select({ id: rsvps.id })
            .from(rsvps)
            .where(and(
                eq(rsvps.eventId, event.slug),
                inArray(rsvps.email, concurrentEmails),
            ))
        const [concurrentClaim] = await db.select({
            usedAt: rsvpInvitationLinks.usedAt,
            usedRsvpId: rsvpInvitationLinks.usedRsvpId,
        })
            .from(rsvpInvitationLinks)
            .where(eq(rsvpInvitationLinks.id, concurrentLink.id))
            .limit(1)

        if (
            winners.length !== 1
            || concurrentPersisted.length !== 1
            || !concurrentClaim?.usedAt
            || concurrentClaim.usedRsvpId !== concurrentPersisted[0]?.id
        ) {
            throw new Error('Concurrent claim did not produce one correlated RSVP')
        }

        console.log(JSON.stringify({
            initialValidation: validate.status,
            registration: register.status,
            secondValidation: validateAgain.status,
            secondRegistration: registerAgain.status,
            persistedRsvps: persisted.length,
            consumed: true,
            concurrentClaimers: concurrentResults.length,
            concurrentWinners: winners.length,
            correlatedRsvp: true,
        }))
    } finally {
        if (eventSlug) {
            await db.delete(rsvps).where(and(eq(rsvps.eventId, eventSlug), eq(rsvps.email, email)))
            for (const concurrentEmail of concurrentEmails) {
                await db.delete(rsvps).where(and(
                    eq(rsvps.eventId, eventSlug),
                    eq(rsvps.email, concurrentEmail),
                ))
            }
        }
        if (linkId) {
            await db.delete(rsvpInvitationLinks).where(eq(rsvpInvitationLinks.id, linkId))
        }
        if (concurrentLinkId) {
            await db.delete(rsvpInvitationLinks).where(eq(rsvpInvitationLinks.id, concurrentLinkId))
        }
    }
}

main().catch(() => {
    console.error('RSVP invitation rehearsal failed')
    process.exit(1)
})
