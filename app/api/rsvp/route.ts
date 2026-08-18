import { NextRequest, NextResponse } from 'next/server'
import eventConfig from '@/event-config.json'
import { isDatabaseConfigured } from '@/lib/db'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail } from '@/lib/email-template'
import { buildEventEmailData, buildEventEmailSubject } from '@/lib/event-email-data'
import { hashRsvpInvitationToken, isValidRsvpInvitationToken } from '@/lib/rsvp-invitation'

export const dynamic = 'force-dynamic'

// Mock storage para modo demo
const mockRsvps: any[] = []

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
    }
    const {
      name: rawName,
      email: rawEmail,
      phone: rawPhone,
      plusOne: rawPlusOne = false,
      plusOneName: rawPlusOneName,
      eventSlug: rawEventSlug,
      invitationToken,
    } = body as Record<string, unknown>

    // Validar campos requeridos
    if (
      typeof rawName !== 'string' || rawName.trim() === ''
      || typeof rawEmail !== 'string' || rawEmail.trim() === ''
      || typeof rawPhone !== 'string' || rawPhone.trim() === ''
    ) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }
    if (typeof rawPlusOne !== 'boolean' || (rawPlusOneName !== undefined && typeof rawPlusOneName !== 'string')) {
      return NextResponse.json({ error: 'Datos de acompañante inválidos' }, { status: 400 })
    }
    if (rawEventSlug !== undefined && (typeof rawEventSlug !== 'string' || rawEventSlug.trim() === '')) {
      return NextResponse.json({ error: 'Evento inválido' }, { status: 400 })
    }
    if (invitationToken !== undefined && !isValidRsvpInvitationToken(invitationToken)) {
      return NextResponse.json({ error: 'Link de invitación inválido o vencido' }, { status: 409 })
    }

    const name = rawName.trim()
    const email = rawEmail.trim()
    const phone = rawPhone.trim()
    const plusOne = rawPlusOne
    const plusOneName = typeof rawPlusOneName === 'string' ? rawPlusOneName.trim() : ''
    const eventSlug = typeof rawEventSlug === 'string' ? rawEventSlug.trim() : undefined

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      )
    }

    let eventId = eventConfig.event.id
    let eventForEmail: Awaited<ReturnType<typeof import('@/lib/queries').getEventBySlug>> = null

    // Check if database is configured
    if (isDatabaseConfigured()) {
      const { saveRSVP, saveRsvpWithInvitation, getEventBySlug } = await import('@/lib/queries')

      // Resolve the target event on EVERY path — the explicit eventSlug, or the
      // configured default. Resolving unconditionally means the isActive /
      // rsvpClosed guards below always run, closing both the direct-POST bypass
      // (A2-H01) and the unvalidated legacy-fallback that produced orphan RSVPs
      // (A2-H15).
      const event = await getEventBySlug(eventSlug || eventConfig.event.id)
      if (!event) {
        return NextResponse.json(
          { error: 'Evento no encontrado' },
          { status: 404 }
        )
      }

      eventId = event.slug
      eventForEmail = event // Store for email sending later

      if (!event.isActive) {
        return NextResponse.json(
          { error: 'Las inscripciones para este evento están cerradas' },
          { status: 400 }
        )
      }

      // A2-H01: enforce rsvpClosed at the API. Previously only the UI hid the
      // button, so a guest with the tab already open (or a direct POST) could
      // still create an RSVP — and trigger a confirmation email — on a closed event.
      if (event.rsvpClosed && invitationToken === undefined) {
        return NextResponse.json(
          { error: event.rsvpClosedMessage || 'Las inscripciones para este evento están cerradas' },
          { status: 400 }
        )
      }

      if (event.requirePlusOneName && plusOne && plusOneName === '') {
        return NextResponse.json(
          { error: 'El nombre del acompañante es requerido' },
          { status: 400 },
        )
      }

      const rsvpInput = {
        name,
        email,
        phone,
        plusOne,
        plusOneName: plusOne ? (plusOneName || null) : null,
        eventId,
      }
      const rsvp = invitationToken === undefined
        ? await saveRSVP(rsvpInput)
        : await saveRsvpWithInvitation({
          ...rsvpInput,
          tokenHash: hashRsvpInvitationToken(invitationToken),
        })

      if (!rsvp) {
        return NextResponse.json(
          { error: 'Link de invitación inválido, vencido o ya utilizado' },
          { status: 409 },
        )
      }

      if (invitationToken !== undefined) {
        console.info(JSON.stringify({
          event: 'rsvp_invitation.consumed',
          eventId,
          rsvpId: rsvp.id,
        }))
      }

      // Check if automatic confirmation email is enabled for this event
      if (eventForEmail && eventForEmail.emailConfirmationEnabled) {
        try {
          const { generateCancelToken, recordEmailSent } = await import('@/lib/queries')
          
          const eventData = buildEventEmailData(eventForEmail)

          // Generate cancel token and URL
          const cancelToken = generateCancelToken(rsvp.id, email)
          const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvp.id}?token=${cancelToken}`

          // Generate email HTML
          const htmlContent = generateConfirmationEmail({
            name,
            plusOne,
            plusOneName: plusOneName || null,
            cancelUrl,
            isReminder: false,
            isCancelled: false,
            eventData
          })

          // Send email
          const { error: emailError } = await resend.emails.send({
            from: `Party Time! <${FROM_EMAIL}>`,
            to: email,
            subject: buildEventEmailSubject(eventData, 'confirmation'),
            html: htmlContent
          })

          if (!emailError) {
            // Record email sent in database
            await recordEmailSent(rsvp.id, 'confirmation')
            console.log(`✅ [RSVP] Auto-confirmation email sent to ${email} for event ${eventForEmail.slug}`)
          } else {
            console.error(`❌ [RSVP] Failed to send auto-confirmation email:`, emailError)
          }
        } catch (emailErr) {
          // Don't fail the RSVP if email fails, just log it
          console.error(`❌ [RSVP] Error sending auto-confirmation email:`, emailErr)
        }
      }

      return NextResponse.json(
        {
          success: true,
          message: '¡RSVP confirmado exitosamente!',
          rsvp,
        },
        { status: 201 }
      )
    } else {
      // A one-time capability cannot be simulated safely in per-instance
      // memory. Fail closed instead of pretending it was consumed globally.
      if (invitationToken !== undefined) {
        return NextResponse.json(
          { error: 'Los links de invitación requieren una base de datos configurada' },
          { status: 503 },
        )
      }

      // Modo demo - guardar en memoria
      console.log('⚠️  Modo DEMO - Configura DATABASE_URL para producción')

      const mockRsvp = {
        id: `demo-${Date.now()}`,
        name,
        email,
        phone,
        plusOne,
        eventId: eventSlug || eventConfig.event.id,
        createdAt: new Date().toISOString(),
        status: 'confirmed'
      }

      mockRsvps.push(mockRsvp)

      return NextResponse.json(
        {
          success: true,
          message: '¡RSVP confirmado!',
          rsvp: mockRsvp,
          note: 'Modo Demo: Configura DATABASE_URL en .env.local para guardar datos permanentemente'
        },
        { status: 201 }
      )
    }
  } catch (error: any) {
    // Drizzle errors can carry bound parameters; with invitationToken that
    // includes the capability digest. Keep logs diagnostic but non-secret.
    console.error('Error en POST /api/rsvp:', error instanceof Error ? error.name : 'UnknownError')

    // Manejar error de duplicado
    if (error.message?.includes('Ya existe un RSVP')) {
      return NextResponse.json(
        { error: 'Ya confirmaste tu asistencia anteriormente' },
        { status: 409 }
      )
    }

    // A2-H02: el trigger de capacidad rechazó el asiento (evento lleno).
    if (error.message?.includes('capacidad máxima')) {
      return NextResponse.json(
        { error: 'El evento está lleno — se alcanzó el límite de invitados' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Error al procesar el RSVP. Por favor intenta de nuevo.' },
      { status: 500 }
    )
  }
}

// Endpoint para obtener todos los RSVPs (REQUIERE AUTENTICACIÓN ADMIN)
export async function GET(request: NextRequest) {
  // Check session
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
    const { searchParams } = new URL(request.url)
    const eventIdOrSlug = searchParams.get('eventId') || eventConfig.event.id

    if (isDatabaseConfigured()) {
      const { getRSVPsByEvent, getEventBySlug } = await import('@/lib/queries')
      
      // Resolve slug to event ID for permission check
      const event = await getEventBySlug(eventIdOrSlug)
      const eventUUID = event?.id || eventIdOrSlug
      const eventSlug = event?.slug || eventIdOrSlug

      // Check permissions using the UUID
      if (currentUser.role !== 'super_admin') {
        const { hasAccess } = await userHasEventAccess(currentUser.id, eventUUID, 'viewer')
        if (!hasAccess) {
          return NextResponse.json({ success: false, error: 'No tienes permiso para ver los RSVPs de este evento' }, { status: 403 })
        }
      }

      // Get RSVPs using the slug (as stored in eventId field)
      const rsvps = await getRSVPsByEvent(eventSlug)

      return NextResponse.json({
        success: true,
        count: rsvps.length,
        rsvps,
        eventId: eventSlug,
      })
    } else {
      // Modo demo - filter by eventId
      const filtered = mockRsvps.filter(r => r.eventId === eventIdOrSlug)
      return NextResponse.json({
        success: true,
        count: filtered.length,
        rsvps: filtered,
        eventId: eventIdOrSlug,
        note: 'Modo Demo: Datos en memoria temporal'
      })
    }
  } catch (error) {
    console.error('Error en GET /api/rsvp:', error)
    return NextResponse.json(
      { error: 'Error al obtener RSVPs' },
      { status: 500 }
    )
  }
}
