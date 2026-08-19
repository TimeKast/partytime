'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { PublicEvent } from '@/types/event'
import { buildEventInvitationViewModel } from '@/lib/event-invitation-view-model'
import {
  formatWholeCurrencyAmount,
  getPublicPaymentPricing,
} from '@/lib/event-presentation'
import EventInvitation from '@/app/[slug]/components/EventInvitation'
import RSVPModal from '@/app/components/RSVPModal'
import styles from '@/app/page.module.css'

type InvitationState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'error' }
  // ISSUE-020: requiresPayment/requiresVerification are copy-only signals
  // from the link's flags — the confirm flow itself still lands with
  // ISSUE-007/011. Both false for every default/pre-0009 link (zero-noise
  // acceptance criterion).
  | { kind: 'ready'; event: PublicEvent; token: string; requiresPayment: boolean; requiresVerification: boolean }
  | { kind: 'confirmed' }

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

interface InvitationRegistrationClientProps {
  expectedEventSlug?: string
}

export default function InvitationRegistrationClient({
  expectedEventSlug,
}: InvitationRegistrationClientProps) {
  const shouldReduceMotion = useReducedMotion()
  const tokenRef = useRef<string | null>(null)
  const [state, setState] = useState<InvitationState>({ kind: 'loading' })
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const token = tokenRef.current ?? fragment.get('token') ?? ''
    tokenRef.current = token

    // Remove the bearer before any later navigation, screenshot or history
    // inspection can expose it. The fragment was never sent to the server.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)

    if (!TOKEN_PATTERN.test(token)) {
      setState({ kind: 'invalid' })
      return () => controller.abort()
    }

    async function validateInvitation() {
      try {
        const response = await fetch('/api/rsvp-invitations/validate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
          body: JSON.stringify({ token }),
        })
        const data: unknown = await response.json()
        if (controller.signal.aborted) return

        if (
          response.ok
          && typeof data === 'object'
          && data !== null
          && 'success' in data
          && data.success === true
          && 'event' in data
          && typeof data.event === 'object'
          && data.event !== null
        ) {
          const event = data.event as PublicEvent
          if (!event.isActive || (expectedEventSlug && event.slug !== expectedEventSlug)) {
            setState({ kind: 'invalid' })
            return
          }
          const requiresPayment = 'requiresPayment' in data && data.requiresPayment === true
          const requiresVerification = 'requiresVerification' in data && data.requiresVerification === true
          setState({ kind: 'ready', event, token, requiresPayment, requiresVerification })
          setIsModalOpen(true)
          return
        }

        setState({ kind: response.status === 404 ? 'invalid' : 'error' })
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      }
    }

    void validateInvitation()
    return () => controller.abort()
  }, [expectedEventSlug])

  if (state.kind === 'loading') {
    return (
      <StatusPage live="polite">
        <motion.span
          animate={shouldReduceMotion ? undefined : { rotate: 360 }}
          transition={shouldReduceMotion ? undefined : { duration: 1, repeat: Infinity, ease: 'linear' }}
          className={styles.loadingIcon}
          aria-hidden="true"
        >
          🎟️
        </motion.span>
        <h1>Validando invitación…</h1>
        <p>Estamos preparando el registro del evento.</p>
      </StatusPage>
    )
  }

  if (state.kind === 'invalid') {
    return (
      <StatusPage live="assertive">
        <span className={styles.stateIcon} aria-hidden="true">🔒</span>
        <h1>Este link ya no está disponible</h1>
        <p>Puede ser inválido, haber vencido, estar revocado o ya haber sido utilizado.</p>
        <a href="/" className={styles.stateLink}>Volver al inicio</a>
      </StatusPage>
    )
  }

  if (state.kind === 'error') {
    return (
      <StatusPage live="assertive">
        <span className={styles.stateIcon} aria-hidden="true">⚠️</span>
        <h1>No pudimos validar la invitación</h1>
        <p>Revisa tu conexión y vuelve a cargar esta página.</p>
      </StatusPage>
    )
  }

  if (state.kind === 'confirmed') {
    return (
      <StatusPage live="polite">
        <span className={styles.stateIcon} aria-hidden="true">🎉</span>
        <h1>Asistencia confirmada</h1>
        <p>Tu registro quedó listo. Este link de invitación ya fue utilizado.</p>
        <a href="/" className={styles.stateLink}>Ir al inicio</a>
      </StatusPage>
    )
  }

  const isCourtesyRegistration = state.event.paymentRequired && !state.requiresPayment
  const registrationEvent: PublicEvent = {
    ...state.event,
    rsvpClosed: false,
    price: isCourtesyRegistration
      ? { ...state.event.price, enabled: false }
      : state.event.price,
  }
  const invitationViewModel = buildEventInvitationViewModel(registrationEvent)
  const { requiresPayment, requiresVerification } = state
  const paymentPricing = getPublicPaymentPricing(requiresPayment, registrationEvent.price)

  return (
    <>
      {(requiresPayment || requiresVerification) && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '0.75rem 1.25rem',
            background: 'rgba(0, 0, 0, 0.72)',
            color: '#fff',
            fontSize: '0.9rem',
            textAlign: 'center',
          }}
        >
          {requiresPayment && (
            <p style={{ margin: 0 }}>
              Tu invitación requiere pago para confirmar
              {paymentPricing
                ? ` (${formatWholeCurrencyAmount(paymentPricing.unitAmount, paymentPricing.currency)} por persona; si registras +1 se cobran 2 cuotas).`
                : '.'}
            </p>
          )}
          {requiresVerification && (
            <p style={{ margin: 0 }}>Te pediremos confirmar tu correo.</p>
          )}
        </div>
      )}
      <EventInvitation
        event={registrationEvent}
        viewModel={invitationViewModel}
        onRsvp={() => setIsModalOpen(true)}
      />
      <AnimatePresence initial={!shouldReduceMotion}>
        {isModalOpen && invitationViewModel.rsvp.kind === 'open' && (
          <RSVPModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSuccess={() => setState({ kind: 'confirmed' })}
            variant={invitationViewModel.rsvp.modal.variant}
            eventSlug={invitationViewModel.rsvp.modal.eventSlug}
            invitationToken={state.token}
            requirePlusOneName={invitationViewModel.rsvp.modal.requirePlusOneName}
            paymentPricing={paymentPricing ?? undefined}
            theme={registrationEvent.theme}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function StatusPage({
  children,
  live,
}: {
  children: React.ReactNode
  live: 'polite' | 'assertive'
}) {
  return (
    <main className={`${styles.main} ${styles.centeredState}`}>
      <section className={styles.stateCard} aria-live={live} aria-atomic="true">
        {children}
      </section>
    </main>
  )
}
