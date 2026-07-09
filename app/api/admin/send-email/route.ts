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
    const { rsvpId } = body

    if (!rsvpId) {
      return NextResponse.json(
        { error: 'Falta el campo requerido: rsvpId' },
        { status: 400 }
      )
    }

    // FS-06: the RSVP must exist. Everything (recipient, type, event) is derived
    // from the DB row — NOT from the request body — so a caller cannot send to an
    // arbitrary address, and the authorization check below can never be skipped.
    const rsvp = await getRSVPById(rsvpId)
    if (!rsvp) {
      return NextResponse.json({ success: false, error: 'RSVP no encontrado' }, { status: 404 })
    }

    // Resolve the event that owns this RSVP (rsvp.eventId stores the slug).
    const event = await getEventBySlug(rsvp.eventId)
    if (!event) {
      // A1-08: never fall back to the static event-config for event data.
      return NextResponse.json(
        { success: false, error: 'No se encontró el evento asociado a este RSVP' },
        { status: 422 }
      )
    }

    // Authorization is now UNCONDITIONAL (not nested under "if the RSVP exists").
    if (currentUser.role !== 'super_admin') {
      const { hasAccess } = await userHasEventAccess(currentUser.id, event.id, 'manager')
      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: 'No tienes permiso para enviar correos de este evento' },
          { status: 403 }
        )
      }
    }

    // Build EventData from the actual event (dynamic).
    const theme = (event.theme as any) || eventConfig.theme
    const eventData: EventData = {
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
        backgroundColor: theme.backgroundColor || eventConfig.theme.backgroundColor,
      },
      contact: {
        hostEmail: event.hostEmail || eventConfig.contact.hostEmail,
      },
    }

    // Recipient and email TYPE are derived from the DB row, not the body.
    const recipient = rsvp.email
    const isCancelled = rsvp.status === 'cancelled'
    const isReminder = !isCancelled && !!rsvp.emailSent

    // Cancel token is bound to the RSVP's real id + current email, so the link
    // it produces validates against the DB.
    const cancelToken = generateCancelToken(rsvpId, recipient)
    let cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvpId}?token=${cancelToken}`
    cancelUrl = cancelUrl.replace(/^=+/, '').trim()

    const htmlContent = generateConfirmationEmail({
      name: rsvp.name,
      plusOne: rsvp.plusOne || false,
      plusOneName: rsvp.plusOneName || null,
      cancelUrl,
      isReminder,
      isCancelled,
      eventData,
    })

    // A1-13: emails use displayTitle when set (matching the public page), else title.
    const eventTitle = (event.displayTitle && event.displayTitle.trim()) ? event.displayTitle : event.title
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
      to: recipient,
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

    // Registrar envío. If this fails AFTER a successful send, do NOT return 500
    // (a retry would send a duplicate). Log and still report success.
    const emailType = isCancelled ? 're-invitation' : (isReminder ? 'reminder' : 'confirmation')
    try {
      await recordEmailSent(rsvpId, emailType)
    } catch (recordErr) {
      console.error('Email enviado pero recordEmailSent falló (no se reintenta):', recordErr)
    }

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
