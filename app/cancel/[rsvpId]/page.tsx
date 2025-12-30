'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { PhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'
import styles from './cancel.module.css'

interface RSVPData {
  id: string
  name: string
  email: string
  phone: string
  plusOne: boolean
  status: string
  eventId: string
}

interface EventData {
  title: string
  subtitle: string
  date: string
  time: string
  location: string
  theme: {
    primaryColor: string
    secondaryColor: string
    accentColor: string
  }
}

// H-010 FIX: Default fallback theme (only used if API fails)
const defaultTheme = {
  primaryColor: '#FF1493',
  secondaryColor: '#00FFFF',
  accentColor: '#FFD700'
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
  // H-010 FIX: Store full event data instead of just theme
  const [eventData, setEventData] = useState<EventData | null>(null)

  // Campos editables
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [plusOne, setPlusOne] = useState(false)


  // Cargar datos del RSVP
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

          // H-010 FIX: Load full event data from API
          try {
            const eventRes = await fetch(`/api/events/${data.rsvp.eventId}`)
            const eventApiData = await eventRes.json()
            if (eventApiData.success && eventApiData.event) {
              const event = eventApiData.event
              setEventData({
                title: event.title || 'Evento',
                subtitle: event.subtitle || '',
                date: event.date || '',
                time: event.time || '',
                location: event.location || '',
                theme: event.theme || defaultTheme
              })
            }
          } catch (e) {
            console.error('Error loading event data:', e)
          }
        } else {
          setError(data.error || 'No se pudo cargar la información')
        }
      } catch (err) {
        setError('Error de conexión')
      } finally {
        setLoading(false)
      }
    }

    loadRSVP()
  }, [rsvpId, token])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()

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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rsvpId,
          token,
          name,
          email,
          phone,
          plusOne,
          reconfirm: rsvpData?.status === 'cancelled' // Si está cancelado, reconfirmar
        })
      })

      const data = await response.json()

      if (data.success) {
        const wasReconfirmed = rsvpData?.status === 'cancelled'
        setUpdated(true)
        setRsvpData(data.rsvp)

        // Mostrar mensaje apropiado
        if (wasReconfirmed) {
          setError('') // Limpiar errores
        }
      } else {
        setError(data.error || 'Error al actualizar')
      }
    } catch (err) {
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

    if (!confirm('¿Estás seguro de que quieres cancelar tu asistencia?')) {
      return
    }

    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/rsvp/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rsvpId,
          token
        })
      })

      const data = await response.json()

      if (data.success) {
        setCancelled(true)
      } else {
        setError(data.error || 'Error al cancelar')
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Cargando...</p>
        </div>
      </div>
    )
  }

  // H-010 FIX: Use dynamic event data for cancelled message
  const eventTitle = eventData?.title || 'el evento'

  if (cancelled) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.iconSuccess}>✅</div>
          <h1>RSVP Cancelado</h1>
          <p>Tu asistencia ha sido cancelada exitosamente.</p>
          <p className={styles.subtext}>
            Lamentamos que no puedas asistir a {eventTitle}.
          </p>
          <a href="/" className={styles.homeBtn}>
            Volver al inicio
          </a>
        </div>
      </div>
    )
  }

  if (!rsvpData) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.error}>
            ❌ {error || 'No se encontró el RSVP'}
          </div>
          <a href="/" className={styles.homeBtn}>
            Volver al inicio
          </a>
        </div>
      </div>
    )
  }

  // H-010 FIX: Use dynamic event data throughout
  const displayTitle = eventData?.title || 'Evento'
  const displaySubtitle = eventData?.subtitle || ''
  const displayDate = eventData?.date || ''
  const displayTime = eventData?.time || ''
  const displayLocation = eventData?.location || ''
  const theme = eventData?.theme || defaultTheme

  return (
    <div className={styles.container}>
      <div
        className={styles.card}
        style={{
          borderColor: `${theme.primaryColor}80`,
          boxShadow: `0 0 30px ${theme.primaryColor}33`,
          background: `linear-gradient(135deg, rgba(26, 0, 51, 0.95), ${theme.primaryColor}15)`,
          color: '#ffffff'
        }}
      >
        <h1 style={{ color: theme.primaryColor, textShadow: `0 0 10px ${theme.primaryColor}4d` }}>
          Modificar o Cancelar Asistencia
        </h1>

        <div
          className={styles.eventInfo}
          style={{
            background: `${theme.primaryColor}15`,
            border: `1px solid ${theme.primaryColor}33`
          }}
        >
          <h2 style={{ color: theme.primaryColor }}>{displayTitle}</h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{displaySubtitle}</p>
          {/* H-010 FIX: Use dynamic date/time/location from the actual event */}
          <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{displayDate} - {displayTime}</p>
          <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{displayLocation}</p>
        </div>

        {rsvpData?.status === 'cancelled' && !updated && (
          <div className={styles.warning}>
            ⚠️ Tu asistencia está cancelada. Puedes actualizarla para reconfirmar.
          </div>
        )}

        {error && (
          <div className={styles.error}>
            ❌ {error}
          </div>
        )}

        {updated && (
          <div className={styles.success} style={{ borderColor: theme.secondaryColor }}>
            {rsvpData?.status === 'confirmed'
              ? '✅ ¡Asistencia reconfirmada! Nos vemos en el evento 🎉'
              : '✅ Información actualizada correctamente'}
          </div>
        )}

        <form onSubmit={handleUpdate} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="name" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Nombre completo</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={saving}
              style={{ borderColor: `${theme.primaryColor}4d` }}
              onFocus={(e) => (e.target.style.borderColor = theme.primaryColor)}
              onBlur={(e) => (e.target.style.borderColor = `${theme.primaryColor}4d`)}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={saving}
              style={{ borderColor: `${theme.primaryColor}4d` }}
              onFocus={(e) => (e.target.style.borderColor = theme.primaryColor)}
              onBlur={(e) => (e.target.style.borderColor = `${theme.primaryColor}4d`)}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="phone" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Teléfono</label>
            <PhoneInput
              defaultCountry="mx"
              value={phone}
              onChange={(phone) => setPhone(phone)}
              className={styles.phoneInput}
              disabled={saving}
              inputClassName={styles.phoneInputField}
              countrySelectorStyleProps={{
                buttonClassName: styles.countrySelector
              }}
              disableDialCodePrefill={false}
              forceDialCode={true}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel} style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
              <input
                type="checkbox"
                checked={plusOne}
                onChange={(e) => setPlusOne(e.target.checked)}
                disabled={saving}
                style={{ accentColor: theme.primaryColor } as any}
              />
              <span>Asistiré con acompañante (+1)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={styles.updateBtn}
            style={{
              background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
              boxShadow: `0 4px 15px ${theme.primaryColor}4d`
            }}
          >
            {saving
              ? 'Guardando...'
              : rsvpData?.status === 'cancelled'
                ? '✅ Reconfirmar Asistencia'
                : '💾 Actualizar Información'}
          </button>
        </form>

        {rsvpData?.status === 'confirmed' && (
          <>
            <div className={styles.divider}>o</div>

            <button
              onClick={handleCancel}
              disabled={saving}
              className={styles.cancelBtn}
            >
              {saving ? 'Procesando...' : '❌ Cancelar mi Asistencia'}
            </button>
          </>
        )}

        <a
          href="/"
          className={styles.backLink}
          style={{ color: theme.secondaryColor }}
        >
          Volver al inicio
        </a>
      </div>
    </div>
  )
}
