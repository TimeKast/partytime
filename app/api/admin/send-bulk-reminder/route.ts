/**
 * Endpoint to send reminder emails to specific RSVPs
 * POST /api/admin/send-bulk-reminder
 * 
 * Body: { eventSlug: string, rsvpIds: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail, EventData } from '@/lib/email-template'
import eventConfig from '@/event-config.json'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

export async function POST(request: NextRequest) {
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
            getRSVPById,
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

        // Build EventData for email template
        const theme = (event.theme as any) || {}
        const eventData: EventData = {
            title: event.title,
            subtitle: event.subtitle || '',
            date: event.date || '',
            time: event.time || '',
            location: event.location || '',
            details: event.details || '',
            price: event.priceEnabled ? `$${event.priceAmount} ${event.priceCurrency || 'MXN'}` : null,
            backgroundImageUrl: event.backgroundImageUrl || '/background.png',
            theme: {
                primaryColor: theme.primaryColor || '#FF1493',
                secondaryColor: theme.secondaryColor || '#00FFFF',
                accentColor: theme.accentColor || '#FFD700',
                backgroundColor: theme.backgroundColor || '#1a0033'
            },
            contact: {
                hostEmail: event.hostEmail || eventConfig.contact?.hostEmail
            }
        }

        let sent = 0
        let failed = 0
        const errors: string[] = []

        // Process each RSVP
        for (const rsvpId of rsvpIds) {
            try {
                const rsvp = await getRSVPById(rsvpId)
                if (!rsvp) {
                    errors.push(`RSVP ${rsvpId}: No encontrado`)
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
                    cancelUrl,
                    isReminder: true,
                    isCancelled: false,
                    eventData
                })

                // Send email
                const { error: emailError } = await resend.emails.send({
                    from: `Party Time! <${FROM_EMAIL}>`,
                    to: rsvp.email,
                    subject: `Recordatorio - ${event.title}`,
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
