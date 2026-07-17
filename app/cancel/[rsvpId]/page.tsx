'use client'

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { PhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'
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
import { getCancelEventDetails } from './cancel-page-helpers'
import styles from './cancel.module.css'

interface RSVPData {
  id: string
  name: string
  email: string
  phone: string
  plusOne: boolean
  plusOneName?: string | null
  status: string
  eventId: string
}

interface EventData {
  title: string
  subtitle: string
  date: string
  time: string
  location: string
  requirePlusOneName?: boolean
  backgroundImage: { url: string } | null
  presentationMode: PresentationMode
  backgroundOverlayStrength: number
  backgroundImageFit: BackgroundImageFit
  backgroundImagePosition: BackgroundImagePosition
  theme: {
    primaryColor: string
    secondaryColor: string
    accentColor: string
    backgroundColor: string
  }
}

type ShellStyle = CSSProperties & {
  '--cancel-background-color': string
  '--cancel-background-fit': BackgroundImageFit
  '--cancel-background-position': BackgroundImagePosition
  '--cancel-overlay-background': string
  '--cancel-primary': string
  '--cancel-cta-background': string
  '--cancel-cta-text': string
}

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

function PageShell({ eventData, children }: { eventData: EventData | null; children: ReactNode }) {
  const theme = eventData?.theme || defaultTheme
  const presentationMode = eventData?.presentationMode || 'modern_details'
  const overlayStrength = eventData?.backgroundOverlayStrength ?? 48
  const backgroundImageFit = eventData?.backgroundImageFit || 'cover'
  const backgroundImagePosition = eventData
    ? resolveBackgroundImagePosition(eventData)
    : 'center'
  const configuredBackgroundSrc = eventData
    ? eventData.backgroundImage?.url || '/background.png'
    : null
  const [backgroundSrc, setBackgroundSrc] = useState<string | null>(configuredBackgroundSrc)
  const ctaColors = getSolidCtaColors(theme.primaryColor)
  const shellStyle: ShellStyle = {
    '--cancel-background-color': theme.backgroundColor || defaultTheme.backgroundColor,
    '--cancel-background-fit': backgroundImageFit,
    '--cancel-background-position': backgroundImagePosition,
    '--cancel-overlay-background': getBackgroundOverlay(
      presentationMode,
      overlayStrength,
      theme.primaryColor,
    ),
    '--cancel-primary': ctaColors.background,
    '--cancel-cta-background': ctaColors.background,
    '--cancel-cta-text': ctaColors.text,
  }

  useEffect(() => {
    setBackgroundSrc(configuredBackgroundSrc)
  }, [configuredBackgroundSrc])

  const handleBackgroundError = () => {
    setBackgroundSrc(getNextBackgroundSourceAfterError)
  }

  return (
    <main className={styles.container} style={shellStyle}>
      <div className={styles.backgroundWrapper} aria-hidden="true">
        {backgroundSrc && (
          // The validated URL can be external and needs the invitation's two-step fallback.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundSrc}
            alt=""
            className={styles.backgroundImage}
            referrerPolicy="no-referrer"
            onError={handleBackgroundError}
          />
        )}
        <div className={styles.overlay} />
      </div>
      {children}
    </main>
  )
}

export default function CancelPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const rsvpId = params?.rsvpId as string
  const token = searchParams?.get('token')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [updated, setUpdated] = useState(false)
  const [error, setError] = useState('')
  const [rsvpData, setRsvpData] = useState<RSVPData | null>(null)
  const [eventData, setEventData] = useState<EventData | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [plusOne, setPlusOne] = useState(false)
  const [plusOneName, setPlusOneName] = useState('')

  useEffect(() => {
    if (!rsvpId || !token) {
      setError('Link inválido')
      setLoading(false)
      return
    }

    const loadRSVP = async () => {
      try {
        const response = await fetch(`/api/rsvp/get?rsvpId=${rsvpId}&token=${token}`)
        const data = await response.json()

        if (data.success && data.rsvp) {
          setRsvpData(data.rsvp)
          setName(data.rsvp.name)
          setEmail(data.rsvp.email)
          setPhone(data.rsvp.phone)
          setPlusOne(data.rsvp.plusOne)
          setPlusOneName(data.rsvp.plusOneName || '')

          try {
            const eventRes = await fetch(`/api/events/${data.rsvp.eventId}`)
            const eventApiData = await eventRes.json()
            if (eventApiData.success && eventApiData.event) {
              const event = eventApiData.event
              setEventData({
                title: event.displayTitle || event.title || 'Evento',
                subtitle: event.subtitle || '',
                date: event.date || '',
                time: event.time || '',
                location: event.location || '',
                requirePlusOneName: event.requirePlusOneName || false,
                backgroundImage: event.backgroundImage || null,
                presentationMode: event.presentationMode || 'modern_details',
                backgroundOverlayStrength: event.backgroundOverlayStrength ?? 48,
                backgroundImageFit: event.backgroundImageFit || 'cover',
                backgroundImagePosition: event.backgroundImagePosition || 'center',
                theme: {
                  ...defaultTheme,
                  ...(event.theme || {}),
                },
              })
            }
          } catch (eventError) {
            console.error('Error loading event data:', eventError)
          }
        } else {
          setError(data.error || 'No se pudo cargar la información')
        }
      } catch {
        setError('Error de conexión')
      } finally {
        setLoading(false)
      }
    }

    loadRSVP()
  }, [rsvpId, token])

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault()

    if (!rsvpId || !token) {
      setError('Link inválido')
      return
    }

    setSaving(true)
    setError('')
    setUpdated(false)

    try {
      const response = await fetch('/api/rsvp/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rsvpId,
          token,
          name,
          email,
          phone,
          plusOne,
          plusOneName: plusOne ? plusOneName : '',
          reconfirm: rsvpData?.status === 'cancelled',
        }),
      })
      const data = await response.json()

      if (data.success) {
        setUpdated(true)
        setRsvpData(data.rsvp)
      } else {
        setError(data.error || 'Error al actualizar')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    if (!rsvpId || !token) {
      setError('Link inválido')
      return
    }

    if (!confirm('¿Estás seguro de que quieres cancelar tu asistencia?')) return

    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/rsvp/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpId, token }),
      })
      const data = await response.json()

      if (data.success) {
        setCancelled(true)
      } else {
        setError(data.error || 'Error al cancelar')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageShell eventData={eventData}>
        <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="loading-title">
          <h1 id="loading-title">Gestionar asistencia</h1>
          <p className={styles.stateMessage} role="status" aria-live="polite">Cargando tu registro…</p>
        </section>
      </PageShell>
    )
  }

  const eventTitle = eventData?.title || 'el evento'

  if (cancelled) {
    return (
      <PageShell eventData={eventData}>
        <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="cancelled-title">
          <h1 id="cancelled-title">RSVP cancelado</h1>
          <p>Tu asistencia ha sido cancelada correctamente.</p>
          <p className={styles.subtext}>Lamentamos que no puedas asistir a {eventTitle}.</p>
          <a href="/" className={styles.homeBtn}>Volver al inicio</a>
        </section>
      </PageShell>
    )
  }

  if (!rsvpData) {
    return (
      <PageShell eventData={eventData}>
        <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="error-title">
          <h1 id="error-title">No pudimos abrir tu registro</h1>
          <p className={styles.error} role="alert">{error || 'No se encontró el RSVP'}</p>
          <a href="/" className={styles.homeBtn}>Volver al inicio</a>
        </section>
      </PageShell>
    )
  }

  const displayTitle = eventData?.title || 'Evento'
  const displaySubtitle = eventData?.subtitle || ''
  const visibleEventDetails = eventData ? getCancelEventDetails(eventData) : []
  return (
    <PageShell eventData={eventData}>
      <article className={styles.card} aria-labelledby="page-title">
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>Tu confirmación</p>
          <h1 id="page-title">Modificar o cancelar asistencia</h1>
          <p className={styles.intro}>Revisa tus datos, actualiza tu registro o cancela tu asistencia.</p>
        </header>

        <section className={styles.eventInfo} aria-labelledby="event-title">
          <h2 id="event-title">{displayTitle}</h2>
          {displaySubtitle && <p className={styles.eventSubtitle}>{displaySubtitle}</p>}
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

        {rsvpData.status === 'cancelled' && !updated && (
          <p className={styles.warning} role="status" aria-live="polite">
            Tu asistencia está cancelada. Guarda tus datos para reconfirmarla.
          </p>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}

        {updated && (
          <p className={styles.success} role="status" aria-live="polite">
            {rsvpData.status === 'confirmed'
              ? 'Asistencia reconfirmada. Nos vemos en el evento.'
              : 'Información actualizada correctamente.'}
          </p>
        )}

        <form onSubmit={handleUpdate} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Nombre completo</label>
            <input
              type="text"
              id="name"
              name="name"
              value={name}
              onChange={event => setName(event.target.value)}
              autoComplete="name"
              required
              disabled={saving}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={saving}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="phone">Teléfono</label>
            <PhoneInput
              defaultCountry="mx"
              value={phone}
              onChange={setPhone}
              className={styles.phoneInput}
              disabled={saving}
              inputClassName={styles.phoneInputField}
              inputProps={{ id: 'phone', name: 'phone' }}
              countrySelectorStyleProps={{ buttonClassName: styles.countrySelector }}
              disableDialCodePrefill={false}
              forceDialCode
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel} htmlFor="plusOne">
              <input
                id="plusOne"
                name="plusOne"
                type="checkbox"
                checked={plusOne}
                onChange={event => {
                  setPlusOne(event.target.checked)
                  if (!event.target.checked) setPlusOneName('')
                }}
                disabled={saving}
              />
              <span>Asistiré con acompañante (+1)</span>
            </label>
          </div>

          {plusOne && eventData?.requirePlusOneName && (
            <div className={styles.formGroup}>
              <label htmlFor="plusOneName">Nombre del acompañante</label>
              <input
                type="text"
                id="plusOneName"
                name="plusOneName"
                value={plusOneName}
                onChange={event => setPlusOneName(event.target.value)}
                autoComplete="name"
                required
                placeholder="Nombre completo del acompañante"
                disabled={saving}
              />
            </div>
          )}

          <button type="submit" disabled={saving} className={styles.updateBtn}>
            {saving
              ? 'Guardando…'
              : rsvpData.status === 'cancelled'
                ? 'Reconfirmar asistencia'
                : 'Actualizar información'}
          </button>
        </form>

        {rsvpData.status === 'confirmed' && (
          <section className={styles.cancellationSection} aria-labelledby="cancel-title">
            <h2 id="cancel-title">¿Ya no puedes asistir?</h2>
            <p>Esta acción cancelará tu confirmación para el evento.</p>
            <button onClick={handleCancel} disabled={saving} className={styles.cancelBtn}>
              {saving ? 'Procesando…' : 'Cancelar mi asistencia'}
            </button>
          </section>
        )}

        <a href="/" className={styles.backLink}>Volver al inicio</a>
      </article>
    </PageShell>
  )
}
