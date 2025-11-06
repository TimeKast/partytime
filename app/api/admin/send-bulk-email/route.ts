import { NextRequest, NextResponse } from 'next/server'
import { validateAdminAuth, getUnauthorizedResponse } from '@/lib/auth'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail } from '@/lib/email-template'
import { getRSVPsByEvent, generateCancelToken, recordEmailSent } from '@/lib/firestore'
import eventConfig from '@/event-config.json'

export async function POST(request: NextRequest) {
  // Validar autenticación
  if (!validateAdminAuth(request)) {
    return getUnauthorizedResponse()
  }

  try {
    const body = await request.json()
    const { rsvpIds } = body // Array de IDs específicos a enviar

    if (!rsvpIds || !Array.isArray(rsvpIds) || rsvpIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Debe proporcionar una lista de IDs'
      }, { status: 400 })
    }

    // Obtener todos los RSVPs del evento
    const allRsvps = await getRSVPsByEvent(eventConfig.event.id)

    // Filtrar solo los RSVPs con los IDs especificados
    const filteredRsvps = allRsvps.filter(r => rsvpIds.includes(r.id))

    if (filteredRsvps.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay RSVPs para enviar',
        sent: 0,
        failed: 0
      })
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[]
    }

    // Enviar emails uno por uno
    for (const rsvp of filteredRsvps) {
      try {
        // Determinar si es recordatorio (ya se envió email antes)
        const isReminder = !!rsvp.emailSent

        const cancelToken = generateCancelToken(rsvp.id!, rsvp.email)
        const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvp.id}?token=${cancelToken}`

        const htmlContent = generateConfirmationEmail({
          name: rsvp.name,
          plusOne: rsvp.plusOne || false,
          cancelUrl,
          isReminder
        })

        // Asunto según tipo de email
        const subject = isReminder 
          ? `Recordatorio - ${eventConfig.event.title}`
          : `Confirmación - ${eventConfig.event.title}`

        const { error } = await resend.emails.send({
          from: FROM_EMAIL,
          to: rsvp.email,
          subject,
          html: htmlContent
        })

        if (error) {
          results.failed++
          results.errors.push(`${rsvp.email}: ${error.message}`)
          console.error(`Error enviando a ${rsvp.email}:`, error)
        } else {
          await recordEmailSent(rsvp.id!, isReminder ? 'reminder' : 'confirmation')
          results.sent++
        }

        // Pequeña pausa para no saturar la API de Resend
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error: any) {
        results.failed++
        results.errors.push(`${rsvp.email}: ${error.message}`)
        console.error(`Error procesando ${rsvp.email}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Envío masivo completado`,
      sent: results.sent,
      failed: results.failed,
      errors: results.errors
    })

  } catch (error: any) {
    console.error('Error en POST /api/admin/send-bulk-email:', error)
    return NextResponse.json(
      { error: 'Error al procesar solicitud', details: error.message },
      { status: 500 }
    )
  }
}
