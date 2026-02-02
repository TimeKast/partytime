import { NextRequest, NextResponse } from 'next/server'
import eventConfig from '@/event-config.json'
import { isDatabaseConfigured } from '@/lib/db'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail, EventData } from '@/lib/email-template'

export const dynamic = 'force-dynamic'

// Mock storage para modo demo
const mockRsvps: any[] = []

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, phone, plusOne = false, plusOneName, eventSlug } = body

    // Validar campos requeridos
    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      )
    }

    // Determine eventId: use eventSlug if provided, otherwise fall back to static config
    let eventId = eventConfig.event.id
    let eventForEmail: Awaited<ReturnType<typeof import('@/lib/queries').getEventBySlug>> = null

    // Check if database is configured
    if (isDatabaseConfigured()) {
      const { saveRSVP, getEventBySlug } = await import('@/lib/queries')

      // If eventSlug was provided, look up the event
      if (eventSlug) {
        const event = await getEventBySlug(eventSlug)
        if (event) {
          eventId = event.slug
          eventForEmail = event // Store for email sending later

          // Check if event accepts RSVPs
          if (!event.isActive) {
            return NextResponse.json(
              { error: 'Las inscripciones para este evento están cerradas' },
              { status: 400 }
            )
          }
        } else {
          return NextResponse.json(
            { error: 'Evento no encontrado' },
            { status: 404 }
          )
        }
      }

      const rsvp = await saveRSVP({
        name,
        email,
        phone,
        plusOne,
        plusOneName: plusOne ? (plusOneName?.trim() || null) : null,
        eventId,
      })

      // Check if automatic confirmation email is enabled for this event
      if (eventForEmail && eventForEmail.emailConfirmationEnabled) {
        try {
          const { generateCancelToken, recordEmailSent } = await import('@/lib/queries')
          
          // Build EventData for the email template
          const theme = (eventForEmail.theme as any) || {}
          const eventData: EventData = {
            title: eventForEmail.title,
            subtitle: eventForEmail.subtitle || '',
            date: eventForEmail.date || '',
            time: eventForEmail.time || '',
            location: eventForEmail.location || '',
            details: eventForEmail.details || '',
            price: eventForEmail.priceEnabled ? `$${eventForEmail.priceAmount} ${eventForEmail.priceCurrency || 'MXN'}` : null,
            backgroundImageUrl: eventForEmail.backgroundImageUrl || '/background.png',
            theme: {
              primaryColor: theme.primaryColor || '#FF1493',
              secondaryColor: theme.secondaryColor || '#00FFFF',
              accentColor: theme.accentColor || '#FFD700',
              backgroundColor: theme.backgroundColor || '#1a0033'
            },
            contact: {
              hostEmail: eventForEmail.hostEmail || eventConfig.contact?.hostEmail
            }
          }

          // Generate cancel token and URL
          const cancelToken = generateCancelToken(rsvp.id, email)
          const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvp.id}?token=${cancelToken}`

          // Generate email HTML
          const htmlContent = generateConfirmationEmail({
            name,
            plusOne,
            cancelUrl,
            isReminder: false,
            isCancelled: false,
            eventData
          })

          // Send email
          const { error: emailError } = await resend.emails.send({
            from: `Party Time! <${FROM_EMAIL}>`,
            to: email,
            subject: `Confirmación - ${eventForEmail.title}`,
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
    console.error('Error en POST /api/rsvp:', error)

    // Manejar error de duplicado
    if (error.message?.includes('Ya existe un RSVP')) {
      return NextResponse.json(
        { error: 'Ya confirmaste tu asistencia anteriormente' },
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
