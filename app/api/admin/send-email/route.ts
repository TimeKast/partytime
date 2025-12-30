import { NextRequest, NextResponse } from 'next/server'
import { validateAdminAuth, getUnauthorizedResponse } from '@/lib/auth'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail } from '@/lib/email-template'
import { generateCancelToken, recordEmailSent } from '@/lib/queries'
import eventConfig from '@/event-config.json'

export async function POST(request: NextRequest) {
  // Validar autenticación
  if (!validateAdminAuth(request)) {
    return getUnauthorizedResponse()
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

    // Determinar tipo de email según estado
    const isCancelled = status === 'cancelled'
    const isReminder = !isCancelled && !!emailSent

    // Generar token de cancelación
    const cancelToken = generateCancelToken(rsvpId, email)
    let cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvpId}?token=${cancelToken}`

    // Limpiar cualquier = que pueda estar al inicio (bug de encoding en emails)
    cancelUrl = cancelUrl.replace(/^=+/, '').trim()

    // Generar HTML del email
    const htmlContent = generateConfirmationEmail({
      name,
      plusOne: plusOne || false,
      cancelUrl,
      isReminder,
      isCancelled
    })

    // Asunto según tipo de email
    let subject
    if (isCancelled) {
      subject = `Te extrañamos - ${eventConfig.event.title}`
    } else if (isReminder) {
      subject = `Recordatorio - ${eventConfig.event.title}`
    } else {
      subject = `Confirmación - ${eventConfig.event.title}`
    }

    // Enviar email con Resend
    const { data, error } = await resend.emails.send({
      from: `Rooftop Party <${FROM_EMAIL}>`,
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

    // Registrar envío en Firestore
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
