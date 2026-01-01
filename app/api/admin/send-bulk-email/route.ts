import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail } from '@/lib/email-template'
import { getRSVPsByEvent, generateCancelToken, recordEmailSent, getEventById } from '@/lib/queries'
import eventConfig from '@/event-config.json'

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

  try {
    const body = await request.json()
    const { rsvpIds, eventId } = body // Array de IDs específicos a enviar y el ID del evento

    if (!eventId) {
      return NextResponse.json({ success: false, error: 'eventId es requerido' }, { status: 400 })
    }

    // Check permissions
    if (currentUser.role !== 'super_admin') {
      const { hasAccess } = await userHasEventAccess(currentUser.id, eventId, 'manager')
      if (!hasAccess) {
        return NextResponse.json({ success: false, error: 'No tienes permiso para enviar correos masivos de este evento' }, { status: 403 })
      }
    }

    if (!rsvpIds || !Array.isArray(rsvpIds) || rsvpIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Debe proporcionar una lista de IDs'
      }, { status: 400 })
    }

    // Obtener todos los RSVPs del evento
    const allRsvps = await getRSVPsByEvent(eventId)

    // Get event title for subjects
    const event = await getEventById(eventId)
    const eventTitle = event?.title || eventConfig.event.title

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
        // Determinar tipo de email según estado
        const isCancelled = rsvp.status === 'cancelled'
        const isReminder = !isCancelled && !!rsvp.emailSent

        const cancelToken = generateCancelToken(rsvp.id!, rsvp.email)
        const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvp.id}?token=${cancelToken}`

        const htmlContent = generateConfirmationEmail({
          name: rsvp.name,
          plusOne: rsvp.plusOne || false,
          cancelUrl,
          isReminder,
          isCancelled
        })

        // Asunto según tipo de email
        let subject
        if (isCancelled) {
          subject = `Te extrañamos - ${eventTitle}`
        } else if (isReminder) {
          subject = `Recordatorio - ${eventTitle}`
        } else {
          subject = `Confirmación - ${eventTitle}`
        }

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
          const emailType = isCancelled ? 're-invitation' : (isReminder ? 'reminder' : 'confirmation')
          await recordEmailSent(rsvp.id!, emailType)
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
