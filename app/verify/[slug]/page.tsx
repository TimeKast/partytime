'use client'

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import type { PublicEvent } from '@/types/event'
import {
  clampOverlayStrength,
  getSolidCtaColors,
  normalizeSolidHexColor,
  resolveBackgroundImagePosition,
  type BackgroundImageFit,
  type BackgroundImagePosition,
  type PresentationMode,
} from '@/lib/event-presentation'
import { getNextBackgroundSourceAfterError } from '@/lib/event-invitation-view-model'
import { getCancelEventDetails } from '@/app/cancel/[rsvpId]/cancel-page-helpers'
import styles from './verify.module.css'

// Same shape/length as the private invitation bearer (InvitationRegistrationClient.tsx)
// and lib/verification.ts's TOKEN_PATTERN. Copied locally rather than importing
// lib/verification.ts, which pulls in node:crypto — never safe to bundle into
// a client component.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const RESEND_COOLDOWN_SECONDS = 60

interface VerifiedRsvp {
  name: string
  email: string
  plusOne: boolean
  plusOneName: string | null
}

type VerifyState =
  | { kind: 'verifying' }
  | { kind: 'success'; rsvp: VerifiedRsvp }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'error' }

const defaultTheme = {
  primaryColor: '#f5f5f4',
  secondaryColor: '#d6d3d1',
  accentColor: '#f59e0b',
  backgroundColor: '#0f0f10',
}

const CLASSIC_OVERLAY_REFERENCE_STRENGTH = 20

function getBackgroundOverlay(
  presentationMode: PresentationMode,
  strength: number,
  primaryColor: string,
): string {
  const safeStrength = clampOverlayStrength(strength)
  if (safeStrength === 0) return 'transparent'
  if (presentationMode !== 'classic') return `rgba(0, 0, 0, ${safeStrength / 100})`

  const safePrimaryColor = normalizeSolidHexColor(primaryColor)
  const scaledAlpha = (referenceAlpha: number) => Math.min(
    255,
    Math.round(referenceAlpha * safeStrength / CLASSIC_OVERLAY_REFERENCE_STRENGTH),
  ).toString(16).padStart(2, '0')

  return `linear-gradient(180deg, ${safePrimaryColor}${scaledAlpha(0x10)} 0%, ${safePrimaryColor}${scaledAlpha(0x30)} 100%)`
}

type ShellStyle = CSSProperties & {
  '--verify-background-color': string
  '--verify-background-fit': BackgroundImageFit
  '--verify-background-position': BackgroundImagePosition
  '--verify-overlay-background': string
  '--verify-cta-background': string
  '--verify-cta-text': string
}

function PageShell({ event, children }: { event: PublicEvent | null; children: ReactNode }) {
  const theme = event?.theme || defaultTheme
  const presentationMode = event?.presentationMode || 'modern_details'
  const overlayStrength = event?.backgroundOverlayStrength ?? 48
  const backgroundImageFit = event?.backgroundImageFit || 'cover'
  const backgroundImagePosition = event ? resolveBackgroundImagePosition(event) : 'center'
  const configuredBackgroundSrc = event ? event.backgroundImage?.url || '/background.png' : null
  const [backgroundSrc, setBackgroundSrc] = useState<string | null>(configuredBackgroundSrc)
  const ctaColors = getSolidCtaColors(theme.primaryColor)
  const shellStyle: ShellStyle = {
    '--verify-background-color': theme.backgroundColor || defaultTheme.backgroundColor,
    '--verify-background-fit': backgroundImageFit,
    '--verify-background-position': backgroundImagePosition,
    '--verify-overlay-background': getBackgroundOverlay(presentationMode, overlayStrength, theme.primaryColor),
    '--verify-cta-background': ctaColors.background,
    '--verify-cta-text': ctaColors.text,
  }

  useEffect(() => {
    setBackgroundSrc(configuredBackgroundSrc)
  }, [configuredBackgroundSrc])

  return (
    <main className={styles.container} style={shellStyle}>
      <div className={styles.backgroundWrapper} aria-hidden="true">
        {backgroundSrc && (
          // Configured URL can be external, same two-step fallback as the invitation/cancel pages.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundSrc}
            alt=""
            className={styles.backgroundImage}
            referrerPolicy="no-referrer"
            onError={() => setBackgroundSrc(getNextBackgroundSourceAfterError)}
          />
        )}
        <div className={styles.overlay} />
      </div>
      {children}
    </main>
  )
}

export default function VerifyPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params?.slug as string

  const [event, setEvent] = useState<PublicEvent | null>(null)
  const [state, setState] = useState<VerifyState>({ kind: 'verifying' })
  const tokenConsumed = useRef(false)

  const [resendEmail, setResendEmail] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  // Best-effort event lookup (public DTO, no token involved) — used for the
  // themed shell and, on success, the event summary.
  useEffect(() => {
    if (!slug) return
    const controller = new AbortController()

    fetch(`/api/events/${slug}`, { signal: controller.signal })
      .then(response => response.json())
      .then(data => {
        if (data?.success && data.event) setEvent(data.event as PublicEvent)
      })
      .catch(() => {})

    return () => controller.abort()
  }, [slug])

  // ISSUE-008: read + strip the token BEFORE the POST, same reasoning as
  // InvitationRegistrationClient.tsx:34-40 — the bearer must never survive
  // in browser history/referrers past the moment it's read.
  useEffect(() => {
    if (!slug || tokenConsumed.current) return
    tokenConsumed.current = true

    const token = searchParams?.get('token') ?? ''
    window.history.replaceState(null, '', window.location.pathname)

    if (!TOKEN_PATTERN.test(token)) {
      setState({ kind: 'invalid' })
      return
    }

    const controller = new AbortController()

    async function verify() {
      try {
        const response = await fetch('/api/rsvp/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
          body: JSON.stringify({ slug, token }),
        })
        const data: unknown = await response.json()
        if (controller.signal.aborted) return

        if (
          response.ok
          && typeof data === 'object' && data !== null
          && 'success' in data && data.success === true
          && 'rsvp' in data && typeof data.rsvp === 'object' && data.rsvp !== null
        ) {
          const rsvp = data.rsvp as { name: string; email: string; plusOne: boolean; plusOneName: string | null }
          setState({ kind: 'success', rsvp })
          return
        }

        if (response.status === 410) {
          setState({ kind: 'expired' })
          return
        }

        setState({ kind: 'invalid' })
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      }
    }

    void verify()
    return () => controller.abort()
  }, [slug, searchParams])

  // Same 60s throttle as the RSVPModal resend control, against the same
  // opaque, rate-limited endpoint.
  useEffect(() => {
    if (resendCooldown <= 0) return undefined
    const timer = setTimeout(() => setResendCooldown(seconds => Math.max(0, seconds - 1)), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  const handleResend = async (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (isResending || resendCooldown > 0 || !resendEmail.trim()) return

    setIsResending(true)
    setResendMessage('')

    try {
      await fetch('/api/rsvp/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: resendEmail.trim() }),
      })
    } catch {
      // Opaque endpoint (ISSUE-007) — a network error isn't distinguishable
      // from "not eligible" and shouldn't be surfaced differently.
    } finally {
      setIsResending(false)
      setResendMessage('Si tu RSVP está pendiente de verificación, te reenviamos el enlace.')
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    }
  }

  const eventTitle = event?.displayTitle || event?.title || 'el evento'
  const visibleEventDetails = event ? getCancelEventDetails(event) : []

  if (state.kind === 'verifying') {
    return (
      <PageShell event={event}>
        <section className={styles.card} aria-labelledby="verify-title">
          <div className={styles.icon} aria-hidden="true">🎟️</div>
          <h1 id="verify-title">Verificando tu correo…</h1>
          <p role="status" aria-live="polite">Un momento, estamos confirmando tu asistencia.</p>
        </section>
      </PageShell>
    )
  }

  if (state.kind === 'success') {
    return (
      <PageShell event={event}>
        <section className={styles.card} aria-labelledby="verify-success-title">
          <div className={styles.icon} aria-hidden="true">🎉</div>
          <h1 id="verify-success-title">¡Asistencia confirmada!</h1>
          <p role="status" aria-live="polite">
            Gracias, {state.rsvp.name}. Tu correo quedó verificado y tu RSVP para {eventTitle} está confirmado.
          </p>

          {event && (
            <section className={styles.eventInfo} aria-labelledby="verify-event-title">
              <h2 id="verify-event-title">{eventTitle}</h2>
              {event.subtitle && <p className={styles.eventSubtitle}>{event.subtitle}</p>}
              {visibleEventDetails.length > 0 && (
                <dl className={styles.eventDetails}>
                  {visibleEventDetails.map(detail => (
                    <div className={styles.eventDetail} key={detail.label}>
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}

          <a href="/" className={styles.homeBtn}>Volver al inicio</a>
        </section>
      </PageShell>
    )
  }

  if (state.kind === 'expired') {
    return (
      <PageShell event={event}>
        <section className={styles.card} aria-labelledby="verify-expired-title">
          <div className={styles.icon} aria-hidden="true">⌛</div>
          <h1 id="verify-expired-title">Este link ya venció</h1>
          <p>Los links de verificación expiran a las 24 horas. Pide uno nuevo con tu correo.</p>

          <form className={styles.form} onSubmit={handleResend}>
            <div className={styles.formGroup}>
              <label htmlFor="resend-email">Tu correo</label>
              <input
                type="email"
                id="resend-email"
                name="email"
                value={resendEmail}
                onChange={e => setResendEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                disabled={isResending}
              />
            </div>
            <button type="submit" className={styles.primaryBtn} disabled={isResending || resendCooldown > 0}>
              {resendCooldown > 0
                ? `Reenviar (${resendCooldown}s)`
                : isResending
                  ? 'Enviando…'
                  : 'Reenviar link de verificación'}
            </button>
          </form>

          {resendMessage && (
            <p className={styles.success} role="status" aria-live="polite">{resendMessage}</p>
          )}

          <a href="/" className={styles.backLink}>Volver al inicio</a>
        </section>
      </PageShell>
    )
  }

  if (state.kind === 'invalid') {
    return (
      <PageShell event={event}>
        <section className={styles.card} aria-labelledby="verify-invalid-title">
          <div className={styles.icon} aria-hidden="true">🔒</div>
          <h1 id="verify-invalid-title">Este link no es válido</h1>
          <p role="alert">Puede ser incorrecto, haber sido usado ya, o ser de otro evento.</p>
          <a href="/" className={styles.homeBtn}>Volver al inicio</a>
        </section>
      </PageShell>
    )
  }

  return (
    <PageShell event={event}>
      <section className={styles.card} aria-labelledby="verify-error-title">
        <div className={styles.icon} aria-hidden="true">⚠️</div>
        <h1 id="verify-error-title">No pudimos verificar tu correo</h1>
        <p role="alert">Revisa tu conexión y vuelve a abrir el link desde tu correo.</p>
      </section>
    </PageShell>
  )
}
