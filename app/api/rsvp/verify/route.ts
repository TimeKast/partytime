import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { assertSameOrigin } from '@/lib/origin-check'
import { hashVerificationToken, isValidVerificationToken } from '@/lib/verification'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { generateConfirmationEmail } from '@/lib/email-template'
import { buildEventEmailData, buildEventEmailSubject } from '@/lib/event-email-data'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const INVALID = { success: false, error: 'Link de verificación inválido' }
const EXPIRED = { success: false, error: 'Link de verificación vencido, usado, o de otro evento' }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Consume a verification bearer from a request body, never from a URL (same
 * reasoning as app/api/rsvp-invitations/validate/route.ts). Missing Origin is
 * allowed for non-browser clients because no ambient credential is involved;
 * an explicit cross-origin browser request still fails closed.
 */
export async function POST(request: NextRequest) {
    if (!assertSameOrigin(request, { allowMissing: true })) {
        return NextResponse.json(
            { success: false, error: 'Origen no permitido' },
            { status: 403, headers: NO_STORE_HEADERS },
        )
    }
    if (!isDatabaseConfigured()) {
        return NextResponse.json(
            { success: false, error: 'Base de datos no configurada' },
            { status: 503, headers: NO_STORE_HEADERS },
        )
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(INVALID, { status: 400, headers: NO_STORE_HEADERS })
    }

    if (
        !isRecord(body)
        || Object.keys(body).length !== 2
        || typeof body.slug !== 'string' || body.slug.trim() === ''
        || !isValidVerificationToken(body.token)
    ) {
        return NextResponse.json(INVALID, { status: 400, headers: NO_STORE_HEADERS })
    }

    const slug = body.slug.trim()
    const token = body.token

    try {
        const { verifyRsvpByToken, getEventBySlug, generateCancelToken, recordEmailSent } = await import('@/lib/queries')

        // Format validated above, BEFORE hashing (lib/verification.ts). The
        // hash equality itself runs as a plain SQL WHERE inside
        // verifyRsvpByToken — a 64-hex-char digest compare, not a JS secret
        // comparison.
        const rsvp = await verifyRsvpByToken(slug, hashVerificationToken(token))
        if (!rsvp) {
            // Fails closed without mutating anything for a vencido/usado/otro
            // evento token — this route never distinguishes those cases in
            // its response, only in the (non-secret) HTTP status.
            return NextResponse.json(EXPIRED, { status: 410, headers: NO_STORE_HEADERS })
        }

        // ISSUE-007 (PLAN §2, decision): the confirmation email always goes
        // out post-verify, independent of emailConfirmationEnabled — the
        // click itself already proved the address is real.
        try {
            const event = await getEventBySlug(slug)
            if (event) {
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
                    console.error('Failed to send post-verification confirmation email')
                }
            }
        } catch {
            // Don't fail the verify response if the confirmation email fails —
            // the RSVP is already confirmed at this point.
            console.error('Error sending post-verification confirmation email')
        }

        return NextResponse.json(
            {
                success: true,
                rsvp: {
                    id: rsvp.id,
                    name: rsvp.name,
                    email: rsvp.email,
                    plusOne: rsvp.plusOne,
                    plusOneName: rsvp.plusOneName,
                    status: rsvp.status,
                },
            },
            { headers: NO_STORE_HEADERS },
        )
    } catch {
        // Never log the raw token, digest, or a driver error with bound values.
        console.error('Error verifying RSVP token')
        return NextResponse.json(
            { success: false, error: 'Error al verificar el RSVP' },
            { status: 500, headers: NO_STORE_HEADERS },
        )
    }
}
