'use client'

import { useEffect, useRef, useState } from 'react'
import styles from '../admin.module.css'
import { generatePasswordSuggestion, type PasswordSuggestionKind } from '@/lib/password-suggestion'
import { checkinPortalUrl, parseCheckinStatusPayload, type CheckinStatus } from './CheckinStatus'

export type { CheckinStatus } from './CheckinStatus'

interface CheckinSettingsProps {
  eventSlug: string
  status: CheckinStatus | null
  loadingStatus: boolean
  loadError?: string
  onStatusChange: (status: CheckinStatus) => void
}

type PendingConfirmation =
  | { type: 'disable' }
  | { type: 'password'; password: string; rotating: boolean }
  | null

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 64

export default function CheckinSettings({
  eventSlug,
  status,
  loadingStatus,
  loadError = '',
  onStatusChange,
}: CheckinSettingsProps) {
  const activeEventSlug = useRef(eventSlug)
  const settingsSectionRef = useRef<HTMLElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const confirmationReturnFocusRef = useRef<HTMLElement | null>(null)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>(null)

  activeEventSlug.current = eventSlug

  useEffect(() => {
    setPasswordDraft('')
    setError('')
    setFeedback('')
    setPendingConfirmation(null)
    setTogglingEnabled(false)
    setSavingPassword(false)
    confirmationReturnFocusRef.current = null
  }, [eventSlug])

  useEffect(() => {
    if (pendingConfirmation) confirmButtonRef.current?.focus()
  }, [pendingConfirmation])

  const applyStatus = (next: CheckinStatus, requestEventSlug: string) => {
    if (activeEventSlug.current !== requestEventSlug) return
    onStatusChange(next)
  }

  const updateEnabled = async (action: 'enable' | 'disable') => {
    const requestEventSlug = eventSlug
    setTogglingEnabled(true)
    setError('')
    setFeedback('')
    try {
      const response = await fetch('/api/admin/checkin-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSlug: requestEventSlug, action }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo actualizar el check-in.'))
      const nextStatus = parseCheckinStatusPayload(data)
      if (!nextStatus) throw new Error('La respuesta no es válida.')
      if (activeEventSlug.current !== requestEventSlug) return
      applyStatus(nextStatus, requestEventSlug)
      setFeedback(action === 'enable' ? 'Check-in habilitado.' : 'Check-in deshabilitado.')
    } catch (toggleError) {
      if (activeEventSlug.current !== requestEventSlug) return
      setError(toggleError instanceof Error ? toggleError.message : 'No se pudo actualizar el check-in.')
    } finally {
      if (activeEventSlug.current === requestEventSlug) setTogglingEnabled(false)
    }
  }

  const handleToggleEnabled = () => {
    if (!status) return
    setError('')
    setFeedback('')
    if (status.enabled) {
      confirmationReturnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      setPendingConfirmation({ type: 'disable' })
      return
    }
    void updateEnabled('enable')
  }

  const handleSuggest = (kind: PasswordSuggestionKind) => {
    setPasswordDraft(generatePasswordSuggestion(kind))
    setError('')
  }

  const requestPasswordSave = () => {
    const trimmed = passwordDraft.trim()
    if (trimmed.length < MIN_PASSWORD_LENGTH || trimmed.length > MAX_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`)
      return
    }
    setError('')
    setFeedback('')
    confirmationReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setPendingConfirmation({ type: 'password', password: trimmed, rotating: status?.hasPassword === true })
  }

  const restoreConfirmationFocus = (returnTarget: HTMLElement | null) => {
    window.requestAnimationFrame(() => {
      const targetIsDisabled = returnTarget instanceof HTMLButtonElement || returnTarget instanceof HTMLInputElement
        ? returnTarget.disabled
        : false
      const focusTarget = returnTarget?.isConnected && !targetIsDisabled
        ? returnTarget
        : settingsSectionRef.current
      focusTarget?.focus()
    })
  }

  const dismissConfirmation = () => {
    const returnTarget = confirmationReturnFocusRef.current
    confirmationReturnFocusRef.current = null
    setPendingConfirmation(null)
    restoreConfirmationFocus(returnTarget)
  }

  const savePassword = async (password: string, rotating: boolean) => {
    const requestEventSlug = eventSlug
    setSavingPassword(true)
    setError('')
    setFeedback('')
    try {
      const response = await fetch('/api/admin/checkin-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSlug: requestEventSlug, action: 'setPassword', password }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo guardar la contraseña.'))
      const nextStatus = parseCheckinStatusPayload(data)
      if (!nextStatus) throw new Error('La respuesta no es válida.')
      if (activeEventSlug.current !== requestEventSlug) return
      applyStatus(nextStatus, requestEventSlug)
      setPasswordDraft('')
      setFeedback(rotating
        ? 'Contraseña rotada. Las sesiones activas del staff se cerraron.'
        : 'Contraseña guardada. El portal ya puede recibir al staff.')
    } catch (saveError) {
      if (activeEventSlug.current !== requestEventSlug) return
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la contraseña.')
    } finally {
      if (activeEventSlug.current === requestEventSlug) setSavingPassword(false)
    }
  }

  const confirmPendingAction = async () => {
    const pending = pendingConfirmation
    if (!pending) return
    const returnTarget = confirmationReturnFocusRef.current
    confirmationReturnFocusRef.current = null
    setPendingConfirmation(null)
    if (pending.type === 'disable') {
      await updateEnabled('disable')
    } else {
      await savePassword(pending.password, pending.rotating)
    }
    restoreConfirmationFocus(returnTarget)
  }

  const portalUrl = checkinPortalUrl(eventSlug)

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl)
      setError('')
      setFeedback('URL del portal copiada.')
    } catch {
      setFeedback('')
      setError('No pudimos copiar la URL. Selecciónala en el campo y cópiala manualmente.')
    }
  }

  const busy = loadingStatus || togglingEnabled || savingPassword

  return (
    <section ref={settingsSectionRef} aria-labelledby="checkin-settings-title" tabIndex={-1}>
      <div className={styles.checkinControlHeader}>
        <div>
          <p className={styles.configSectionKicker}>Acceso del staff</p>
          <h3 id="checkin-settings-title" className={styles.configSectionTitle}>Portal de check-in</h3>
        </div>
        <span className={styles.checkinOverviewStatus} data-tone={status?.enabled ? 'success' : 'neutral'}>
          {loadingStatus ? 'Consultando…' : status?.enabled ? 'Habilitado' : 'Deshabilitado'}
        </span>
      </div>

      <div className={styles.configToggleGroup}>
        <input
          type="checkbox"
          id="checkinEnabled"
          className={styles.configCheckbox}
          checked={status?.enabled ?? false}
          disabled={busy || !status}
          onChange={handleToggleEnabled}
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
            : 'El portal está deshabilitado; el staff no puede iniciar sesión.'}
      </p>

      <div className={styles.configFormGroup}>
        <label className={styles.configLabel} htmlFor="checkinPassword">
          {status?.hasPassword ? 'Rotar contraseña del staff' : 'Fijar contraseña del staff'}
        </label>
        <div className={styles.checkinPasswordForm}>
          <input
            id="checkinPassword"
            name="checkinPassword"
            type="text"
            className={styles.configInput}
            value={passwordDraft}
            onChange={(event) => setPasswordDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (!busy && passwordDraft.trim().length > 0) requestPasswordSave()
              }
            }}
            placeholder="6 a 64 caracteres"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            autoComplete="new-password"
            disabled={busy}
          />
          <div className={styles.checkinSuggestionRow}>
            <button
              type="button"
              className={styles.checkinSuggestionButton}
              onClick={() => handleSuggest('words')}
              disabled={busy}
            >
              Sugerir 3 palabras
            </button>
            <button
              type="button"
              className={styles.checkinSuggestionButton}
              onClick={() => handleSuggest('digits')}
              disabled={busy}
            >
              Sugerir 6 dígitos
            </button>
          </div>
          <button
            type="button"
            className={styles.invitationPrimaryAction}
            onClick={requestPasswordSave}
            disabled={busy || passwordDraft.trim().length === 0}
          >
            {savingPassword ? 'Guardando…' : (status?.hasPassword ? 'Rotar contraseña' : 'Guardar contraseña')}
          </button>
        </div>
        <p className={styles.configHelper}>
          {status?.hasPassword
            ? 'Al rotar, las sesiones activas del staff se cierran de inmediato.'
            : 'El check-in no tiene contraseña aún; el staff no podrá iniciar sesión hasta que fijes una.'}
        </p>
      </div>

      <div className={styles.configFormGroup}>
        <label className={styles.configLabel} htmlFor="checkinPortalUrl">URL del portal de check-in</label>
        <div className={styles.invitationSecretRow}>
          <input
            id="checkinPortalUrl"
            name="checkinPortalUrl"
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

      {pendingConfirmation && (
        <div
          className={styles.checkinInlineConfirmation}
          role="alertdialog"
          aria-labelledby="checkin-confirm-title"
          aria-describedby="checkin-confirm-detail"
          onKeyDown={(event) => {
            if (event.key === 'Escape') dismissConfirmation()
          }}
        >
          <div>
            <strong id="checkin-confirm-title">
              {pendingConfirmation.type === 'disable' ? '¿Deshabilitar el portal?' : '¿Guardar esta contraseña?'}
            </strong>
            <p id="checkin-confirm-detail">
              {pendingConfirmation.type === 'disable'
                ? 'El staff dejará de poder registrar llegadas hasta que vuelvas a habilitarlo.'
                : pendingConfirmation.rotating
                  ? 'Las sesiones activas del staff se cerrarán y deberán entrar con la nueva contraseña.'
                  : 'La contraseña será de solo escritura y no volverá a mostrarse.'}
            </p>
          </div>
          <div className={styles.checkinConfirmationActions}>
            <button type="button" onClick={dismissConfirmation}>Cancelar</button>
            <button ref={confirmButtonRef} type="button" onClick={() => void confirmPendingAction()}>
              {pendingConfirmation.type === 'disable' ? 'Deshabilitar' : 'Confirmar contraseña'}
            </button>
          </div>
        </div>
      )}

      <div className={styles.invitationFeedback} aria-live="polite" aria-atomic="true">
        {(loadError || error) && <p className={styles.invitationError} role="alert">{loadError || error}</p>}
        {!loadError && !error && feedback && <p className={styles.invitationSuccess} role="status">{feedback}</p>}
      </div>
    </section>
  )
}
