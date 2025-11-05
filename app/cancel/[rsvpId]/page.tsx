'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import eventConfig from '@/event-config.json'
import styles from './cancel.module.css'

interface RSVPData {
  id: string
  name: string
  email: string
  phone: string
  plusOne: boolean
  status: string
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
          plusOne
        })
      })

      const data = await response.json()

      if (data.success) {
        setUpdated(true)
        setRsvpData(data.rsvp)
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

  if (cancelled) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.iconSuccess}>✅</div>
          <h1>RSVP Cancelado</h1>
          <p>Tu asistencia ha sido cancelada exitosamente.</p>
          <p className={styles.subtext}>
            Lamentamos que no puedas asistir a {eventConfig.event.title}.
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

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Gestionar Asistencia</h1>
        
        <div className={styles.eventInfo}>
          <h2>{eventConfig.event.title}</h2>
          <p>{eventConfig.event.subtitle}</p>
          <p>{eventConfig.event.date} - {eventConfig.event.time}</p>
          <p>{eventConfig.event.location}</p>
        </div>

        {error && (
          <div className={styles.error}>
            ❌ {error}
          </div>
        )}

        {updated && (
          <div className={styles.success}>
            ✅ Información actualizada correctamente
          </div>
        )}

        <form onSubmit={handleUpdate} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Nombre completo</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="phone">Teléfono</label>
            <input
              type="tel"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={plusOne}
                onChange={(e) => setPlusOne(e.target.checked)}
                disabled={saving}
              />
              <span>Asistiré con acompañante (+1)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={styles.updateBtn}
          >
            {saving ? 'Guardando...' : '💾 Actualizar Información'}
          </button>
        </form>

        <div className={styles.divider}>o</div>

        <button
          onClick={handleCancel}
          disabled={saving}
          className={styles.cancelBtn}
        >
          {saving ? 'Procesando...' : '❌ Cancelar mi Asistencia'}
        </button>

        <a href="/" className={styles.backLink}>
          Volver al inicio
        </a>
      </div>
    </div>
  )
}
