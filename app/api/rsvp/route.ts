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
import {
  VERIFICATION_TOKEN_TTL_MS,
  buildVerificationUrl,
  generateVerificationToken,
  hashVerificationToken,
} from '@/lib/verification'
import { buildVerificationEmailSubject, generateVerificationEmail } from '@/lib/verification-email'
import { stripe } from '@/lib/stripe'
import { buildCheckoutSessionParams, PENDING_PAYMENT_RSVP_TTL_MS } from '@/lib/stripe-checkout'
import { derivePaymentAmountCents } from '@/lib/payment-config'

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
      const {
        saveRSVP,
        saveRsvpWithInvitation,
        saveRSVPPendingPayment,
        getEventBySlug,
        expireStalePendingRsvps,
        RSVP_STATUS,
      } = await import('@/lib/queries')

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

      // ISSUE-005/007: expire stale pending_payment/pending_verification rows
      // (and restore the invitation links that produced them) before this
      // attempt reads/writes capacity or the unique (event, email) slot — so
      // a guest whose earlier attempt lapsed never sees a false duplicate or
      // false CAPACITY_FULL.
      await expireStalePendingRsvps(eventId)

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

      // ISSUE-011 (PLAN §2): payment supersedes verification. For the PUBLIC
      // path this is decided directly from the freshly-fetched event row —
      // no per-link flag to race against, same trust level already applied
      // to isActive/rsvpClosed above. For the invitation path the decision
      // is made fresh inside saveRsvpWithInvitation's CTE from
      // invitation_event.payment_required AND NOT candidate.is_courtesy —
      // never from anything read here.
      const publicRequiresPayment = invitationToken === undefined && event.paymentRequired === true

      // ISSUE-007: candidate verification bearer. For the invitation path
      // this is ALWAYS generated — whether it ends up persisted is decided
      // inside saveRsvpWithInvitation's atomic CTE from data it reads fresh
      // in that same statement (see SaveRsvpWithInvitationInput.verificationCandidate
      // for why a caller-side decision would be unsafe here). For the public
      // path there is no per-link flag to race against, so the route's own
      // freshly-fetched `event.emailVerificationEnabled` is authoritative —
      // same trust level already applied to the isActive/rsvpClosed checks
      // above. ISSUE-011: on the public path, a payment-required event skips
      // this entirely (payment IS the verification, PLAN §2).
      const verificationCandidate = invitationToken !== undefined || (event.emailVerificationEnabled && !publicRequiresPayment)
        ? (() => {
          const token = generateVerificationToken()
          return {
            token,
            tokenHash: hashVerificationToken(token),
            expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
          }
        })()
        : undefined

      // ISSUE-011: TTL for a pending_payment row — cheap to compute even when
      // it ends up unused (invitation path: the CTE decides fresh whether to
      // persist it, exactly like verificationCandidate above).
      const paymentExpiresAt = new Date(Date.now() + PENDING_PAYMENT_RSVP_TTL_MS)

      const rsvp = invitationToken === undefined
        ? (publicRequiresPayment
          ? await saveRSVPPendingPayment(rsvpInput, paymentExpiresAt)
          : await saveRSVP(
            rsvpInput,
            verificationCandidate
              ? { tokenHash: verificationCandidate.tokenHash, expiresAt: verificationCandidate.expiresAt }
              : undefined,
          ))
        : await saveRsvpWithInvitation({
          ...rsvpInput,
          tokenHash: hashRsvpInvitationToken(invitationToken),
          // Always defined on this branch — see verificationCandidate above.
          verificationCandidate: {
            tokenHash: verificationCandidate!.tokenHash,
            expiresAt: verificationCandidate!.expiresAt,
          },
          paymentCandidate: { expiresAt: paymentExpiresAt },
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

      // ISSUE-011: a row that landed on pending_payment never gets the
      // verification/confirmation email branches below — it gets redirected
      // to a hosted Stripe Checkout session instead. Real confirmation only
      // ever happens via the webhook (ISSUE-012); this response is purely
      // "here's where to pay".
      if (rsvp.status === RSVP_STATUS.PENDING_PAYMENT) {
        const {
          getActivePaymentForRsvp,
          expireRsvpPaymentRecord,
          createRsvpPaymentRecord,
          expirePendingPaymentRsvp,
        } = await import('@/lib/queries')

        // ISSUE-011: a re-submit while this guest's OWN pending_payment row
        // is still valid reuses the row (saveRSVPPendingPayment above) but
        // must never leave two live Stripe sessions. Best-effort expire the
        // previous session and mark its row 'expired' ourselves now, rather
        // than waiting on the ISSUE-012 webhook — which doesn't exist yet
        // and, once it does, simply no-ops on an already-'expired' row (see
        // expireRsvpPaymentRecord's status='created' guard). Unreachable on
        // the invitation path: a link is single-use, so a second POST with
        // the same token never re-matches eligible_invitation and 409s above
        // instead of reaching this branch.
        const previousPayment = await getActivePaymentForRsvp(rsvp.id)
        if (previousPayment) {
          try {
            await stripe.checkout.sessions.expire(previousPayment.stripeSessionId)
          } catch (expireError) {
            console.error(
              'Failed to expire previous Stripe checkout session (best-effort):',
              expireError instanceof Error ? expireError.name : 'UnknownError',
            )
          }
          await expireRsvpPaymentRecord(previousPayment.id)
        }

        const amountCents = derivePaymentAmountCents(event)
        const currency = event.priceCurrency || 'MXN'

        // Defensive: payment_required should never be true without a
        // positive price (checkPaymentRequiredEligibility enforces this at
        // write time in the admin API), but never send Stripe a zero/
        // negative amount — release the seat instead of a broken checkout.
        if (amountCents <= 0) {
          await expirePendingPaymentRsvp(rsvp.id)
          console.error(`payment_required event with non-positive derived amount: ${eventId}`)
          return NextResponse.json(
            { error: 'No pudimos iniciar el pago. Intenta de nuevo en unos minutos.' },
            { status: 502 },
          )
        }

        let session
        try {
          session = await stripe.checkout.sessions.create(buildCheckoutSessionParams({
            rsvpId: rsvp.id,
            eventSlug: eventId,
            email: rsvp.email,
            eventTitle: buildEventEmailData(event).title,
            amountCents,
            currency,
          }))
        } catch (stripeError) {
          // ISSUE-011 acceptance criterion: never leave an orphaned
          // pending_payment row with no way to pay — release the seat (and
          // restore the invitation link, if any) the same way a lazily
          // expired row would.
          console.error(
            'Stripe checkout session creation failed:',
            stripeError instanceof Error ? stripeError.name : 'UnknownError',
          )
          await expirePendingPaymentRsvp(rsvp.id)
          return NextResponse.json(
            { error: 'No pudimos iniciar el pago. Intenta de nuevo en unos minutos.' },
            { status: 502 },
          )
        }

        if (!session.url) {
          // Should never happen for a mode:'payment', non-embedded session,
          // but fail the same closed way if it ever does.
          console.error('Stripe checkout session created without a redirect URL')
          await expirePendingPaymentRsvp(rsvp.id)
          return NextResponse.json(
            { error: 'No pudimos iniciar el pago. Intenta de nuevo en unos minutos.' },
            { status: 502 },
          )
        }

        await createRsvpPaymentRecord({
          rsvpId: rsvp.id,
          eventId,
          stripeSessionId: session.id,
          amountCents,
          currency,
        })

        return NextResponse.json(
          {
            success: true,
            status: RSVP_STATUS.PENDING_PAYMENT,
            message: 'Te llevamos a un pago seguro con Stripe…',
            checkoutUrl: session.url,
            rsvp,
          },
          { status: 201 },
        )
      }

      // ISSUE-007: a row that landed on pending_verification never gets the
      // normal confirmation email — only the verification link. The
      // invariant "verificationCandidate is defined whenever rsvp.status is
      // pending_verification" holds because that status is only ever set
      // (in saveRSVPOnce / the saveRsvpWithInvitation CTE) as a direct
      // consequence of a candidate having been passed in above.
      if (rsvp.status === RSVP_STATUS.PENDING_VERIFICATION && verificationCandidate) {
        try {
          const { recordEmailSent } = await import('@/lib/queries')

          const eventData = buildEventEmailData(eventForEmail!)
          const verificationUrl = buildVerificationUrl(eventId, verificationCandidate.token)
          const { html, text } = generateVerificationEmail({
            name,
            eventTitle: eventData.title,
            verificationUrl,
          })

          const { error: emailError } = await resend.emails.send({
            from: `Party Time! <${FROM_EMAIL}>`,
            to: email,
            subject: buildVerificationEmailSubject(eventData.title),
            html,
            text,
          })

          if (!emailError) {
            await recordEmailSent(rsvp.id, 'verification')
            console.log(`✅ [RSVP] Verification email sent to ${email} for event ${eventForEmail!.slug}`)
          } else {
            console.error(`❌ [RSVP] Failed to send verification email:`, emailError)
          }
        } catch (emailErr) {
          // Don't fail the RSVP if email fails, just log it
          console.error(`❌ [RSVP] Error sending verification email:`, emailErr)
        }

        return NextResponse.json(
          {
            success: true,
            status: RSVP_STATUS.PENDING_VERIFICATION,
            message: 'Revisa tu correo para confirmar tu asistencia',
            rsvp,
          },
          { status: 201 }
        )
      }

      // Check if automatic confirmation email is enabled for this event.
      // ISSUE-006/007: confirmation emails only go out once the RSVP is
      // actually `confirmed` — a pending_verification row is handled by the
      // branch above instead, and gets the confirmation email later, from
      // app/api/rsvp/verify/route.ts, once the guest clicks the link.
      if (eventForEmail && eventForEmail.emailConfirmationEnabled && rsvp.status === RSVP_STATUS.CONFIRMED) {
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
          status: rsvp.status,
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

      // Get RSVPs using the slug (as stored in eventId field). ISSUE-013:
      // only join rsvp_payments when this event actually requires payment —
      // a free event's DTO must never carry payment-shaped noise.
      const rsvps = event?.paymentRequired === true
        ? await getRSVPsByEvent(eventSlug, { includePayments: true })
        : await getRSVPsByEvent(eventSlug)

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
