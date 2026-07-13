/**
 * Endpoint to send reminder emails to specific RSVPs
 * POST /api/admin/send-bulk-reminder
 * 
 * Body: { eventSlug: string, rsvpIds: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { isDatabaseConfigured } from '@/lib/db'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail } from '@/lib/email-template'
import { buildEventEmailData, buildEventEmailSubject } from '@/lib/event-email-data'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

export async function POST(request: NextRequest) {
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
        const body = await request.json()
        const { eventSlug, rsvpIds } = body

        if (!eventSlug || !rsvpIds || !Array.isArray(rsvpIds) || rsvpIds.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'eventSlug and rsvpIds are required'
            }, { status: 400 })
        }

        const {
            getEventBySlug,
            getRSVPsByEvent,
            generateCancelToken,
            recordEmailSent
        } = await import('@/lib/queries')

        // Get event data
        const event = await getEventBySlug(eventSlug)
        if (!event) {
            return NextResponse.json({
                success: false,
                error: 'Event not found'
            }, { status: 404 })
        }

        // Check permissions using UUID
        if (currentUser.role !== 'super_admin') {
            const { hasAccess } = await userHasEventAccess(currentUser.id, event.id, 'manager')
            if (!hasAccess) {
                return NextResponse.json({ success: false, error: 'No tienes permiso para enviar correos masivos de este evento' }, { status: 403 })
            }
        }

        const eventData = buildEventEmailData(event)

        let sent = 0
        let failed = 0
        const errors: string[] = []

        // Scope recipients to this event (same pattern as send-bulk-email):
        // fetch the event's RSVPs and filter the requested IDs against that set,
        // so IDs belonging to other events are never processed
        const allRsvps = await getRSVPsByEvent(event.slug)
        const rsvpsById = new Map(allRsvps.map(r => [r.id, r]))

        // Process each RSVP
        for (const rsvpId of rsvpIds) {
            try {
                const rsvp = rsvpsById.get(rsvpId)
                if (!rsvp) {
                    errors.push(`RSVP ${rsvpId}: No encontrado en este evento`)
                    failed++
                    continue
                }

                if (rsvp.status !== 'confirmed') {
                    errors.push(`${rsvp.email}: No confirmado`)
                    failed++
                    continue
                }

                // Generate cancel token and URL
                const cancelToken = generateCancelToken(rsvp.id, rsvp.email)
                const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvp.id}?token=${cancelToken}`

                // Generate email HTML (isReminder = true)
                const htmlContent = generateConfirmationEmail({
                    name: rsvp.name,
                    plusOne: rsvp.plusOne || false,
                    plusOneName: (rsvp as any).plusOneName || null,
                    cancelUrl,
                    isReminder: true,
                    isCancelled: false,
                    eventData
                })

                // Send email
                const { error: emailError } = await resend.emails.send({
                    from: `Party Time! <${FROM_EMAIL}>`,
                    to: rsvp.email,
                    subject: buildEventEmailSubject(eventData, 'reminder'),
                    html: htmlContent
                })

                if (emailError) {
                    console.error(`❌ [BULK-REMINDER] Failed to send to ${rsvp.email}:`, emailError)
                    errors.push(`${rsvp.email}: ${emailError.message || 'Error'}`)
                    failed++
                } else {
                    // Record email sent
                    await recordEmailSent(rsvp.id, 'reminder')
                    sent++
                    console.log(`✅ [BULK-REMINDER] Reminder sent to ${rsvp.email}`)
                }

                // 5 second delay between emails
                if (rsvpIds.indexOf(rsvpId) < rsvpIds.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000))
                }

            } catch (rsvpError: any) {
                console.error(`❌ [BULK-REMINDER] Error processing RSVP ${rsvpId}:`, rsvpError)
                errors.push(`RSVP ${rsvpId}: ${rsvpError.message}`)
                failed++
            }
        }

        console.log(`📧 [BULK-REMINDER] Completed - Sent: ${sent}, Failed: ${failed}`)

        return NextResponse.json({
            success: true,
            sent,
            failed,
            errors: errors.length > 0 ? errors : undefined
        })

    } catch (error: any) {
        console.error('❌ [BULK-REMINDER] Error:', error)
        return NextResponse.json({
            success: false,
            error: error.message || 'Error sending reminders'
        }, { status: 500 })
    }
}
