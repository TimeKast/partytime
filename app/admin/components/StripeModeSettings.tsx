'use client'

import { useId } from 'react'
// Type-only: erased at build time, so the Stripe SDK behind lib/stripe.ts is
// never pulled into this client bundle.
import type { StripeMode } from '@/lib/stripe'
import styles from './StripeModeSettings.module.css'

/**
 * Migration 0013 — per-event Stripe mode (events.stripe_mode).
 *
 * `StripeModeSelector` lives inside Config → Invitados → "Cuota y cobro", next
 * to "Requerir pago para confirmar". Every role that can open Config sees it;
 * only a super_admin can change it (the server enforces the same rule with a
 * 403 — this is only the UI half).
 *
 * `StripeTestModeBanner` is the dashboard's "MODO PRUEBA" indicator.
 */

export const STRIPE_MODE_OPTIONS: ReadonlyArray<{ value: StripeMode; label: string; description: string }> = [
  {
    value: 'live',
    label: 'Cobro real',
    description: 'Stripe cobra dinero real a la tarjeta del invitado.',
  },
  {
    value: 'test',
    label: 'Modo prueba',
    description: 'Tarjetas de prueba de Stripe. No se mueve dinero.',
  },
]

const SECRET_KEY_ENV: Record<StripeMode, string> = {
  live: 'STRIPE_SECRET_KEY',
  test: 'STRIPE_TEST_SECRET_KEY',
}

/**
 * Consequence copy for switching the SAVED mode `from` → `to`, or null when
 * nothing changes. Shared by the inline callout and the confirm() dialog on
 * save, so both always say the same thing.
 */
export function describeStripeModeTransition(from: StripeMode, to: StripeMode): string | null {
  if (from === to) return null
  if (to === 'live') {
    return 'A partir de ahora se cobra dinero real. Los pagos de prueba abiertos ya no confirmarán lugares.'
  }
  return 'Los nuevos pagos usarán tarjetas de prueba: no se cobra dinero real y los lugares se confirman sin ingreso. Los pagos reales que ya estén abiertos siguen siendo válidos.'
}

/** "Stripe no está configurado…" for the chosen mode, or null when its key exists. */
export function describeMissingStripeKey(mode: StripeMode, configured: boolean): string | null {
  if (configured) return null
  const modeLabel = mode === 'test' ? 'modo prueba' : 'cobro real'
  return `Stripe (${modeLabel}) no está configurado en este entorno. Los cobros fallarán hasta agregar ${SECRET_KEY_ENV[mode]}.`
}

interface StripeModeSelectorProps {
  /** Mode currently chosen in the form (may be unsaved). */
  value: StripeMode
  /** Mode persisted on the event — drives the "switching" warning. */
  savedValue: StripeMode
  canEdit: boolean
  liveConfigured: boolean
  testConfigured: boolean
  onChange: (mode: StripeMode) => void
}

export function StripeModeSelector({
  value,
  savedValue,
  canEdit,
  liveConfigured,
  testConfigured,
  onChange,
}: StripeModeSelectorProps) {
  const groupName = useId()
  const helperId = `${groupName}-helper`
  const transition = describeStripeModeTransition(savedValue, value)
  const missingKey = describeMissingStripeKey(value, value === 'test' ? testConfigured : liveConfigured)

  return (
    <fieldset
      className={styles.fieldset}
      data-mode={value}
      disabled={!canEdit}
      aria-describedby={helperId}
    >
      <legend className={styles.legend}>Modo de cobro</legend>

      <div className={styles.segments}>
        {STRIPE_MODE_OPTIONS.map(option => (
          <label
            key={option.value}
            className={styles.segment}
            data-mode={option.value}
            data-checked={value === option.value ? 'true' : undefined}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className={styles.radio}
            />
            <span className={styles.segmentText}>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
          </label>
        ))}
      </div>

      <p id={helperId} className={styles.helper}>
        {canEdit
          ? 'Úsalo en modo prueba solo para demos. El cambio se aplica al guardar.'
          : 'Solo un Super Admin puede cambiar el modo de cobro.'}
      </p>

      {transition && (
        <p className={styles.notice} data-tone="warning" role="status">
          <strong>{value === 'live' ? 'Pasarás a cobro real.' : 'Pasarás a modo prueba.'}</strong>{' '}
          {transition}
        </p>
      )}

      {missingKey && (
        <p className={styles.notice} data-tone="danger" role="alert">
          {missingKey}
        </p>
      )}
    </fieldset>
  )
}

interface StripeTestModeBannerProps {
  onConfigure?: () => void
}

export function StripeTestModeBanner({ onConfigure }: StripeTestModeBannerProps) {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.bannerPill}>Modo prueba</span>
      <p className={styles.bannerText}>
        Los cobros de este evento usan tarjetas de prueba de Stripe: no entra dinero real y esos pagos no suman a lo recaudado.
      </p>
      {onConfigure && (
        <button type="button" className={styles.bannerAction} onClick={onConfigure}>
          Revisar cobro
        </button>
      )}
    </div>
  )
}
