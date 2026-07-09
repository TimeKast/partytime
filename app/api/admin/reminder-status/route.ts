/**
 * Endpoint to check reminder status for RSVPs
 * GET /api/admin/reminder-status?eventSlug=xxx
 * 
 * Returns list of RSVPs with their reminder email status
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { isDatabaseConfigured } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    // Check auth
    const cookieStore = await cookies()
    const token = cookieStore.get('rp_session')?.value

    if (!token) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }

    const currentUser = await validateSession(token)
    if (!currentUser) {
        return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
    }

    if (!isDatabaseConfigured()) {
        return NextResponse.json({
            success: false,
            error: 'Database not configured'
        }, { status: 500 })
    }

    try {
        const { searchParams } = new URL(request.url)
        const eventSlug = searchParams.get('eventSlug')

        if (!eventSlug) {
            return NextResponse.json({
                success: false,
                error: 'eventSlug parameter is required'
            }, { status: 400 })
        }

        const { getRSVPsByEvent, getEventBySlug } = await import('@/lib/queries')

        // Resolve event and check per-event access (viewer is enough for read-only status)
        const event = await getEventBySlug(eventSlug)
        if (!event) {
            return NextResponse.json({
                success: false,
                error: 'Event not found'
            }, { status: 404 })
        }

        if (currentUser.role !== 'super_admin') {
            const { hasAccess } = await userHasEventAccess(currentUser.id, event.id, 'viewer')
            if (!hasAccess) {
                return NextResponse.json({ success: false, error: 'No tienes permiso para ver este evento' }, { status: 403 })
            }
        }

        // Get all RSVPs for this event
        const rsvps = await getRSVPsByEvent(event.slug)

        // Process each RSVP to extract reminder info
        const rsvpsWithReminderStatus = rsvps.map(rsvp => {
            const emailHistory = (rsvp.emailHistory || []) as Array<{
                sentAt: string
                type: 'confirmation' | 'reminder' | 're-invitation'
            }>

            // Find reminder entries
            const reminderEmails = emailHistory.filter(e => e.type === 'reminder')
            const lastReminder = reminderEmails.length > 0 
                ? reminderEmails[reminderEmails.length - 1] 
                : null

            return {
                id: rsvp.id,
                name: rsvp.name,
                email: rsvp.email,
                phone: rsvp.phone,
                status: rsvp.status,
                plusOne: rsvp.plusOne,
                createdAt: rsvp.createdAt,
                // Reminder specific info
                hasReceivedReminder: reminderEmails.length > 0,
                reminderCount: reminderEmails.length,
                lastReminderSent: lastReminder?.sentAt || null,
                // Full email history for debugging
                emailHistory: emailHistory
            }
        })

        // Separate into categories
        const confirmedRsvps = rsvpsWithReminderStatus.filter(r => r.status === 'confirmed')
        const withReminder = confirmedRsvps.filter(r => r.hasReceivedReminder)
        const pendingReminder = confirmedRsvps.filter(r => !r.hasReceivedReminder)

        return NextResponse.json({
            success: true,
            eventSlug,
            summary: {
                total: rsvps.length,
                confirmed: confirmedRsvps.length,
                withReminder: withReminder.length,
                pendingReminder: pendingReminder.length
            },
            // List of people who NEED manual reminder (didn't get one)
            needsManualReminder: pendingReminder.map(r => ({
                id: r.id,
                name: r.name,
                email: r.email,
                phone: r.phone
            })),
            // List of people who already got reminder
            alreadySentReminder: withReminder.map(r => ({
                id: r.id,
                name: r.name,
                email: r.email,
                lastReminderSent: r.lastReminderSent,
                reminderCount: r.reminderCount
            })),
            // Full details if needed
            allRsvps: rsvpsWithReminderStatus
        })

    } catch (error: any) {
        console.error('❌ [reminder-status] Error:', error)
        return NextResponse.json({
            success: false,
            error: error.message || 'Error fetching reminder status'
        }, { status: 500 })
    }
}
