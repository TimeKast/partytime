'use client'

import { useEffect, useRef, useState } from 'react'
import styles from '../admin.module.css'
import { generatePasswordSuggestion, type PasswordSuggestionKind } from '@/lib/password-suggestion'

export interface CheckinStatus {
  enabled: boolean
  hasPassword: boolean
  updatedAt: string | null
}

interface CheckinSettingsProps {
  eventSlug: string
  /**
   * ISSUE-018: lets app/admin/page.tsx gate the "Llegada" column, the
   * dashboard arrival counter and the export columns on the SAME status this
   * section just loaded/changed — a single fetch feeds every checkin_enabled
   * gate in the admin UI instead of each surface re-fetching independently.
   */
  onStatusChange?: (status: CheckinStatus | null) => void
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function portalUrlFor(eventSlug: string): string {
  const configuredBase = process.env.NEXT_PUBLIC_APP_URL
  const base = configuredBase || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/checkin/${eventSlug}`
}

const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 64

export default function CheckinSettings({ eventSlug, onStatusChange }: CheckinSettingsProps) {
  const activeEventSlug = useRef(eventSlug)
  const [status, setStatus] = useState<CheckinStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  activeEventSlug.current = eventSlug

  useEffect(() => {
    const controller = new AbortController()
    setStatus(null)
    setPasswordDraft('')
    setError('')
    setFeedback('')
    setLoadingStatus(true)
    onStatusChange?.(null)

    async function loadStatus() {
      try {
        const response = await fetch(
          `/api/admin/checkin-config?eventSlug=${encodeURIComponent(eventSlug)}`,
          { cache: 'no-store', signal: controller.signal },
        )
        const data: unknown = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) {
          throw new Error(errorMessage(data, 'No se pudo cargar el estado del check-in.'))
        }
        if (
          typeof data === 'object' && data !== null
          && 'success' in data && data.success === true
          && 'checkin' in data && typeof data.checkin === 'object' && data.checkin !== null
        ) {
          const next = data.checkin as CheckinStatus
          setStatus(next)
          onStatusChange?.(next)
        } else {
          throw new Error('La respuesta del estado de check-in no es válida.')
        }
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el estado del check-in.')
      } finally {
        if (!controller.signal.aborted) setLoadingStatus(false)
      }
    }

    if (eventSlug) void loadStatus()
    return () => controller.abort()
  }, [eventSlug, onStatusChange])

  const applyStatus = (next: CheckinStatus) => {
    if (activeEventSlug.current !== eventSlug) return
    setStatus(next)
    onStatusChange?.(next)
  }

  const handleToggleEnabled = async () => {
    if (!status) return
    const nextAction = status.enabled ? 'disable' : 'enable'
    if (nextAction === 'disable' && !confirm('¿Deshabilitar el check-in? El portal dejará de aceptar marcas de asistencia.')) {
      return
    }

    const requestEventSlug = eventSlug
    setTogglingEnabled(true)
    setError('')
    setFeedback('')
    try {
      const response = await fetch('/api/admin/checkin-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSlug: requestEventSlug, action: nextAction }),
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        throw new Error(errorMessage(data, 'No se pudo actualizar el check-in.'))
      }
      if (
        typeof data !== 'object' || data === null
        || !('success' in data) || data.success !== true
        || !('checkin' in data)
      ) {
        throw new Error('La respuesta no es válida.')
      }
      if (activeEventSlug.current !== requestEventSlug) return
      applyStatus(data.checkin as CheckinStatus)
      setFeedback(nextAction === 'enable' ? 'Check-in habilitado.' : 'Check-in deshabilitado.')
    } catch (toggleError) {
      if (activeEventSlug.current !== requestEventSlug) return
      setError(toggleError instanceof Error ? toggleError.message : 'No se pudo actualizar el check-in.')
    } finally {
      if (activeEventSlug.current === requestEventSlug) setTogglingEnabled(false)
    }
  }

  const handleSuggest = (kind: PasswordSuggestionKind) => {
    setPasswordDraft(generatePasswordSuggestion(kind))
    setError('')
  }

  // ISSUE-018: a plain handler (not a <form onSubmit>) on purpose — this
  // section is rendered inside app/admin/page.tsx's own outer
  // <form onSubmit={saveEventConfig}> (the event-settings form, ending in
  // SaveBar's type="submit" button). Nesting a second <form> inside it would
  // be invalid HTML that browsers silently flatten, letting Enter in the
  // password field (or this button) submit the WRONG form.
  const handleSetPassword = async () => {
    const trimmed = passwordDraft.trim()
    if (trimmed.length < MIN_PASSWORD_LENGTH || trimmed.length > MAX_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`)
      return
    }
    // ISSUE-018 acceptance criterion: rotating the password must warn that
    // every active staff session closes — checkinPasswordUpdatedAt is the
    // `pwv` every issued cookie embeds (app/api/admin/checkin-config/route.ts).
    const warning = status?.hasPassword
      ? '¿Rotar la contraseña del check-in? Las sesiones activas del staff se cerrarán y deberán volver a iniciar sesión con la nueva contraseña.'
      : '¿Guardar la contraseña del check-in?'
    if (!confirm(warning)) return

    const requestEventSlug = eventSlug
    setSavingPassword(true)
    setError('')
    setFeedback('')
    try {
      const response = await fetch('/api/admin/checkin-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSlug: requestEventSlug, action: 'setPassword', password: trimmed }),
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        throw new Error(errorMessage(data, 'No se pudo guardar la contraseña.'))
      }
      if (
        typeof data !== 'object' || data === null
        || !('success' in data) || data.success !== true
        || !('checkin' in data)
      ) {
        throw new Error('La respuesta no es válida.')
      }
      if (activeEventSlug.current !== requestEventSlug) return
      applyStatus(data.checkin as CheckinStatus)
      // ISSUE-018: write-only — never redisplay the password once saved, so
      // it never lingers in state/the DOM after this point.
      setPasswordDraft('')
      setFeedback('Contraseña guardada. Las sesiones activas del staff se cerraron.')
    } catch (saveError) {
      if (activeEventSlug.current !== requestEventSlug) return
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la contraseña.')
    } finally {
      if (activeEventSlug.current === requestEventSlug) setSavingPassword(false)
    }
  }

  const portalUrl = portalUrlFor(eventSlug)

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl)
      setFeedback('URL del portal copiada.')
    } catch {
      window.prompt('No se pudo copiar automáticamente. Copia esta URL:', portalUrl)
    }
  }

  return (
    <section aria-labelledby="checkin-settings-title">
      <div className={styles.configToggleGroup}>
        <input
          type="checkbox"
          id="checkinEnabled"
          className={styles.configCheckbox}
          checked={status?.enabled ?? false}
          disabled={loadingStatus || togglingEnabled || !status}
          onChange={() => void handleToggleEnabled()}
        />
        <label htmlFor="checkinEnabled" className={styles.configToggleLabel}>
          Habilitar portal de check-in
        </label>
      </div>
      <p className={styles.configHelper}>
        {loadingStatus
          ? 'Cargando estado del check-in…'
          : status?.enabled
            ? 'El staff puede iniciar sesión en el portal y marcar asistencia.'
            : 'El portal está deshabilitado — el staff no puede iniciar sesión.'}
      </p>

      <div className={styles.configFormGroup} style={{ marginTop: 'var(--ad-5)' }}>
        <label className={styles.configLabel} htmlFor="checkinPassword">
          {status?.hasPassword ? 'Rotar contraseña del staff' : 'Fijar contraseña del staff'}
        </label>
        <div className={styles.checkinPasswordForm}>
          <input
            id="checkinPassword"
            type="text"
            className={styles.configInput}
            value={passwordDraft}
            onChange={(event) => setPasswordDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (!loadingStatus && !savingPassword && passwordDraft.trim().length > 0) void handleSetPassword()
              }
            }}
            placeholder="6 a 64 caracteres"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            autoComplete="new-password"
            disabled={loadingStatus || savingPassword}
          />
          <div className={styles.checkinSuggestionRow}>
            <button
              type="button"
              className={styles.checkinSuggestionButton}
              onClick={() => handleSuggest('words')}
              disabled={loadingStatus || savingPassword}
            >
              Sugerir 3 palabras
            </button>
            <button
              type="button"
              className={styles.checkinSuggestionButton}
              onClick={() => handleSuggest('digits')}
              disabled={loadingStatus || savingPassword}
            >
              Sugerir 6 dígitos
            </button>
          </div>
          <button
            type="button"
            className={styles.invitationPrimaryAction}
            onClick={() => void handleSetPassword()}
            disabled={loadingStatus || savingPassword || passwordDraft.trim().length === 0}
          >
            {savingPassword ? 'Guardando…' : (status?.hasPassword ? 'Rotar contraseña' : 'Guardar contraseña')}
          </button>
        </div>
        <p className={styles.configHelper}>
          {status?.hasPassword
            ? 'Al rotar, las sesiones activas del staff se cierran de inmediato.'
            : 'El check-in no tiene contraseña aún — el staff no podrá iniciar sesión hasta que fijes una.'}
        </p>
      </div>

      <div className={styles.configFormGroup}>
        <label className={styles.configLabel}>URL del portal de check-in</label>
        <div className={styles.invitationSecretRow}>
          <input
            aria-label="URL del portal de check-in"
            readOnly
            value={portalUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" onClick={() => void handleCopyUrl()}>Copiar URL</button>
        </div>
        <p className={styles.configHelper}>
          Comparte esta URL con el staff. Iniciarán sesión ahí con la contraseña de arriba.
        </p>
      </div>

      {status?.updatedAt && (
        <p className={styles.configHelper}>
          Contraseña actualizada por última vez el {formatDate(status.updatedAt)}.
        </p>
      )}

      <div className={styles.invitationFeedback} aria-live="polite" aria-atomic="true">
        {error && <p className={styles.invitationError} role="alert">{error}</p>}
        {!error && feedback && <p className={styles.invitationSuccess} role="status">{feedback}</p>}
      </div>
    </section>
  )
}
