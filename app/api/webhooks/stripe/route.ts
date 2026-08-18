import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { isDatabaseConfigured } from '@/lib/db'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail } from '@/lib/email-template'
import { buildEventEmailData, buildEventEmailSubject } from '@/lib/event-email-data'

// ISSUE-012 (EPIC-004): the Stripe SDK's signature verification is not
// edge-safe here (Node's `crypto`) — same reasoning as app/api/og/[slug].
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

function paymentIntentIdOf(value: string | Stripe.PaymentIntent | null | undefined): string | null {
    if (!value) return null
    return typeof value === 'string' ? value : value.id
}

/**
 * POST /api/webhooks/stripe — the ONLY authority that confirms an RSVP paid
 * through Stripe. Every mutation this route triggers happens inside a single
 * statement in lib/queries.ts (fulfillPaidRsvp / expireRsvpPaymentBySessionId
 * / markRsvpPaymentRefunded); this route itself never touches the database
 * directly, only decides WHICH of those to call from `event.type`, and sends
 * the confirmation email AFTER (never before/inside) a mutation that actually
 * confirmed a seat.
 */
export async function POST(request: NextRequest) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
        // Fail-closed (same posture as CRON_SECRET in
        // app/api/cron/send-reminders/route.ts): without a configured secret
        // there is no way to verify a delivery came from Stripe, so refuse to
        // process it rather than trust an unverified body.
        console.error('STRIPE_WEBHOOK_SECRET no configurado — rechazando webhook de Stripe (fail-closed)')
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 503, headers: NO_STORE_HEADERS })
    }

    const signature = request.headers.get('stripe-signature')
    if (!signature) {
        return NextResponse.json({ error: 'Falta la firma del webhook' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    // MUST be the raw, unparsed body — Stripe's signature is computed over
    // the exact bytes it sent. Reading `request.json()` first (even to peek)
    // would re-serialize the body and break verification.
    const rawBody = await request.text()

    let event: Stripe.Event
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch (err) {
        console.error(
            'Firma de webhook de Stripe inválida:',
            err instanceof Error ? err.name : 'UnknownError',
        )
        return NextResponse.json({ error: 'Firma inválida' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    if (!isDatabaseConfigured()) {
        // Transient from Stripe's point of view — ask it to retry once the DB
        // is reachable, rather than silently drop a verified, money-moving
        // event.
        console.error('Webhook de Stripe verificado pero la base de datos no está configurada')
        return NextResponse.json({ error: 'Database not configured' }, { status: 503, headers: NO_STORE_HEADERS })
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                // Paridad: OXXO/SPEI y otros métodos de pago asíncronos
                // confirman vía este evento en vez de `completed` directo.
                await handleCheckoutPaid(event.data.object as Stripe.Checkout.Session)
                break

            case 'checkout.session.expired':
                await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session)
                break

            case 'charge.refunded':
                await handleChargeRefunded(event.data.object as Stripe.Charge)
                break

            default:
                // Every other event type is intentionally ignored — ack 200
                // so Stripe never retries something this endpoint will never
                // act on.
                break
        }
    } catch (err) {
        // A real infra failure mid-handling (e.g. the DB became unreachable
        // between the isDatabaseConfigured() check above and the query) is
        // the only case that should reach here — every mutation in
        // lib/queries.ts is a single statement, so nothing is ever left
        // half-applied. 5xx here is a deliberate signal for Stripe to retry.
        console.error(
            'Error procesando webhook de Stripe:',
            err instanceof Error ? err.name : 'UnknownError',
        )
        return NextResponse.json({ error: 'Error interno' }, { status: 500, headers: NO_STORE_HEADERS })
    }

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS })
}

async function handleCheckoutPaid(session: Stripe.Checkout.Session): Promise<void> {
    const { fulfillPaidRsvp } = await import('@/lib/queries')

    const result = await fulfillPaidRsvp(session.id, paymentIntentIdOf(session.payment_intent))

    // 'replay' (already paid) and 'payment_without_seat' (logged inside
    // fulfillPaidRsvp) both intentionally send no email and stop here.
    if (result.outcome !== 'confirmed' || !result.rsvp) return

    const rsvp = result.rsvp

    // Confirmation email happens strictly AFTER the mutation above, and
    // failure here must never fail the webhook — Stripe would retry an
    // already-successful mutation and double-send. Sent unconditionally,
    // independent of event.emailConfirmationEnabled: same precedent as
    // app/api/rsvp/verify/route.ts's post-verify email — the payment itself
    // already proved the guest's intent and address.
    try {
        const { getEventBySlug, generateCancelToken, recordEmailSent } = await import('@/lib/queries')
        const event = await getEventBySlug(rsvp.eventId)
        if (!event) return

        const eventData = buildEventEmailData(event)
        const cancelToken = generateCancelToken(rsvp.id, rsvp.email)
        const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancel/${rsvp.id}?token=${cancelToken}`

        const htmlContent = generateConfirmationEmail({
            name: rsvp.name,
            plusOne: rsvp.plusOne === true,
            plusOneName: rsvp.plusOneName,
            cancelUrl,
            isReminder: false,
            isCancelled: false,
            eventData,
        })

        const { error: emailError } = await resend.emails.send({
            from: `Party Time! <${FROM_EMAIL}>`,
            to: rsvp.email,
            subject: buildEventEmailSubject(eventData, 'confirmation'),
            html: htmlContent,
        })

        if (!emailError) {
            await recordEmailSent(rsvp.id, 'confirmation')
        } else {
            console.error('Failed to send Stripe confirmation email:', emailError)
        }
    } catch (emailErr) {
        console.error(
            'Error sending Stripe confirmation email:',
            emailErr instanceof Error ? emailErr.name : 'UnknownError',
        )
    }
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
    const { expireRsvpPaymentBySessionId } = await import('@/lib/queries')
    await expireRsvpPaymentBySessionId(session.id)
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId = paymentIntentIdOf(charge.payment_intent)
    if (!paymentIntentId) return

    const { markRsvpPaymentRefunded } = await import('@/lib/queries')
    await markRsvpPaymentRefunded(paymentIntentId)
}
