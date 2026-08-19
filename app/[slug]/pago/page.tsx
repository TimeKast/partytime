'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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
import styles from './pago.module.css'

// ISSUE-011: Stripe's own Checkout Session id format — mirrors
// app/api/rsvp/payment-status/route.ts's SESSION_ID_PATTERN. Copied locally
// rather than importing lib code that pulls in the DB driver, same reasoning
// as the TOKEN_PATTERN copies in the verify/invite client pages.
const SESSION_ID_PATTERN = /^cs_[a-zA-Z0-9_]+$/
const POLL_ATTEMPTS = 3
const POLL_INTERVAL_MS = 2500

type PagoState =
  | { kind: 'checking' }
  | { kind: 'success_confirmed' }
  | { kind: 'success_pending' }
  | { kind: 'cancelled' }
  | { kind: 'invalid' }

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
  '--pago-background-color': string
  '--pago-background-fit': BackgroundImageFit
  '--pago-background-position': BackgroundImagePosition
  '--pago-overlay-background': string
  '--pago-cta-background': string
  '--pago-cta-text': string
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
    '--pago-background-color': theme.backgroundColor || defaultTheme.backgroundColor,
    '--pago-background-fit': backgroundImageFit,
    '--pago-background-position': backgroundImagePosition,
    '--pago-overlay-background': getBackgroundOverlay(presentationMode, overlayStrength, theme.primaryColor),
    '--pago-cta-background': ctaColors.background,
    '--pago-cta-text': ctaColors.text,
  }

  useEffect(() => {
    setBackgroundSrc(configuredBackgroundSrc)
  }, [configuredBackgroundSrc])

  return (
    <main className={styles.container} style={shellStyle}>
      <div className={styles.backgroundWrapper} aria-hidden="true">
        {backgroundSrc && (
          // Configured URL can be external, same two-step fallback as the invitation/verify pages.
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

export default function PagoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params?.slug as string
  const stateParam = searchParams?.get('state')
  const sessionId = searchParams?.get('session_id') ?? ''

  const [event, setEvent] = useState<PublicEvent | null>(null)
  const [state, setState] = useState<PagoState>({ kind: 'checking' })

  // Best-effort event lookup (public DTO, no session_id involved) — used only
  // for the themed shell, same as the verify page.
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

  // ISSUE-011: this page is PURELY informational — it never confirms or
  // cancels anything itself. `state=success` triggers a short, bounded poll
  // (2-3 attempts) of the read-only payment-status endpoint so a guest whose
  // webhook has already landed sees a green check instead of "revisa tu
  // correo" for no reason; if the webhook hasn't landed yet within that short
  // window, the copy below stays honest about what's still pending. Real
  // confirmation always happens server-side, via the webhook (ISSUE-012),
  // regardless of anything this page observes.
  useEffect(() => {
    if (stateParam === 'cancelled') {
      setState({ kind: 'cancelled' })
      return
    }

    if (stateParam !== 'success' || !SESSION_ID_PATTERN.test(sessionId)) {
      setState({ kind: 'invalid' })
      return
    }

    const controller = new AbortController()

    async function poll() {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        if (controller.signal.aborted) return
        try {
          const response = await fetch(
            `/api/rsvp/payment-status?session_id=${encodeURIComponent(sessionId)}`,
            { cache: 'no-store', signal: controller.signal },
          )
          if (response.ok) {
            const data: unknown = await response.json()
            const status = typeof data === 'object' && data !== null && 'status' in data
              ? (data as { status: unknown }).status
              : null
            if (status === 'paid') {
              if (!controller.signal.aborted) setState({ kind: 'success_confirmed' })
              return
            }
          }
        } catch {
          // A transient network error isn't "not paid yet" — just keep polling.
        }

        if (attempt < POLL_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        }
      }
      if (!controller.signal.aborted) setState({ kind: 'success_pending' })
    }

    void poll()
    return () => controller.abort()
  }, [stateParam, sessionId])

  const eventTitle = event?.displayTitle || event?.title || 'el evento'

  if (state.kind === 'checking') {
    return (
      <PageShell event={event}>
        <section className={styles.card} aria-labelledby="pago-checking-title">
          <div className={styles.icon} aria-hidden="true">💳</div>
          <h1 id="pago-checking-title">Un momento…</h1>
          <p role="status" aria-live="polite">Estamos revisando tu pago.</p>
        </section>
      </PageShell>
    )
  }

  if (state.kind === 'success_confirmed') {
    return (
      <PageShell event={event}>
        <section className={styles.card} aria-labelledby="pago-success-title">
          <div className={styles.icon} aria-hidden="true">✅</div>
          <h1 id="pago-success-title">¡Pago recibido!</h1>
          <p role="status" aria-live="polite">
            Tu lugar en {eventTitle} está confirmado — te llegará el comprobante de Stripe y tu confirmación por correo.
          </p>
          <a href={`/${slug}`} className={styles.homeBtn}>Volver al evento</a>
        </section>
      </PageShell>
    )
  }

  if (state.kind === 'success_pending') {
    return (
      <PageShell event={event}>
        <section className={styles.card} aria-labelledby="pago-pending-title">
          <div className={styles.icon} aria-hidden="true">📬</div>
          <h1 id="pago-pending-title">¡Pago recibido!</h1>
          <p role="status" aria-live="polite">
            Se está confirmando tu lugar en {eventTitle}. Revisa tu correo en unos minutos —
            ahí te llegará el comprobante de Stripe y tu confirmación.
          </p>
          <a href={`/${slug}`} className={styles.homeBtn}>Volver al evento</a>
        </section>
      </PageShell>
    )
  }

  if (state.kind === 'cancelled') {
    return (
      <PageShell event={event}>
        <section className={styles.card} aria-labelledby="pago-cancelled-title">
          <div className={styles.icon} aria-hidden="true">⚠️</div>
          <h1 id="pago-cancelled-title">No se completó el pago</h1>
          <p>Tu lugar se libera en unos minutos. Puedes intentar de nuevo cuando quieras.</p>
          <a href={`/${slug}`} className={styles.primaryBtn}>Volver a intentar</a>
        </section>
      </PageShell>
    )
  }

  return (
    <PageShell event={event}>
      <section className={styles.card} aria-labelledby="pago-invalid-title">
        <div className={styles.icon} aria-hidden="true">🔒</div>
        <h1 id="pago-invalid-title">Este link no es válido</h1>
        <p role="alert">Puede ser incorrecto o estar incompleto.</p>
        <a href={`/${slug}`} className={styles.homeBtn}>Volver al evento</a>
      </section>
    </PageShell>
  )
}
