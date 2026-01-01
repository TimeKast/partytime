import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail, EventData } from '@/lib/email-template'
import { generateCancelToken, recordEmailSent, getRSVPById, getEventBySlug } from '@/lib/queries'
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
    const { rsvpId, name, email, plusOne, emailSent, status } = body

    if (!rsvpId || !name || !email) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: rsvpId, name, email' },
        { status: 400 }
      )
    }

    // H-005 FIX: Fetch the actual event data for this RSVP
    let eventData: EventData | undefined
    try {
      const rsvp = await getRSVPById(rsvpId)
      if (rsvp && rsvp.eventId) {
        // Resolve slug to event for permission check
        const event = await getEventBySlug(rsvp.eventId)
        const eventUUID = event?.id || rsvp.eventId
        
        // Check permissions using UUID
        if (currentUser.role !== 'super_admin') {
          const { hasAccess } = await userHasEventAccess(currentUser.id, eventUUID, 'manager')
          if (!hasAccess) {
            return NextResponse.json({ success: false, error: 'No tienes permiso para enviar correos de este evento' }, { status: 403 })
          }
        }

        if (event) {
          // Build EventData from the actual event
          const theme = (event.theme as any) || eventConfig.theme
          eventData = {
            title: event.title,
            subtitle: event.subtitle || '',
            date: event.date || '',
            time: event.time || '',
            location: event.location || '',
            details: event.details || '',
            price: event.priceEnabled ? `$${event.priceAmount} ${event.priceCurrency || 'MXN'}` : null,
            backgroundImageUrl: event.backgroundImageUrl || eventConfig.event.backgroundImage || '/background.png',
            theme: {
              primaryColor: theme.primaryColor || eventConfig.theme.primaryColor,
              secondaryColor: theme.secondaryColor || eventConfig.theme.secondaryColor,
              accentColor: theme.accentColor || eventConfig.theme.accentColor,
              backgroundColor: theme.backgroundColor || eventConfig.theme.backgroundColor
            },
            contact: {
              hostEmail: event.hostEmail || eventConfig.contact.hostEmail
            }
          }
        }
      }
    } catch (eventError) {
      console.warn('Could not load event data for email, using defaults:', eventError)
    }

    // Determinar tipo de email según estado
    const isCancelled = status === 'cancelled'
    const isReminder = !isCancelled && !!emailSent

    // Generar token de cancelación
    const cancelToken = generateCancelToken(rsvpId, email)
    let cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvpId}?token=${cancelToken}`

    // Limpiar cualquier = que pueda estar al inicio (bug de encoding en emails)
    cancelUrl = cancelUrl.replace(/^=+/, '').trim()

    // Generar HTML del email con datos dinámicos del evento
    const htmlContent = generateConfirmationEmail({
      name,
      plusOne: plusOne || false,
      cancelUrl,
      isReminder,
      isCancelled,
      eventData // H-005 FIX: Pass dynamic event data
    })

    // Asunto según tipo de email - use dynamic title if available
    const eventTitle = eventData?.title || eventConfig.event.title
    let subject
    if (isCancelled) {
      subject = `Te extrañamos - ${eventTitle}`
    } else if (isReminder) {
      subject = `Recordatorio - ${eventTitle}`
    } else {
      subject = `Confirmación - ${eventTitle}`
    }

    // Enviar email con Resend
    const { data, error } = await resend.emails.send({
      from: `Party Time! <${FROM_EMAIL}>`,
      to: email,
      subject,
      html: htmlContent
    })

    if (error) {
      console.error('Error enviando email con Resend:', error)
      return NextResponse.json(
        { error: 'Error al enviar email', details: error },
        { status: 500 }
      )
    }

    // Registrar envío en base de datos
    const emailType = isCancelled ? 're-invitation' : (isReminder ? 'reminder' : 'confirmation')
    await recordEmailSent(rsvpId, emailType)

    return NextResponse.json({
      success: true,
      message: `Email ${isCancelled ? 'de re-invitación' : (isReminder ? 'recordatorio' : 'confirmación')} enviado exitosamente`,
      emailId: data?.id
    })

  } catch (error: any) {
    console.error('Error en POST /api/admin/send-email:', error)
    return NextResponse.json(
      { error: 'Error al procesar solicitud', details: error.message },
      { status: 500 }
    )
  }
}
