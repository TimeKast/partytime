'use client'

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { PhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'
import { getSolidCtaColors } from '@/lib/event-presentation'
import type { RsvpModalVariant } from '@/lib/event-invitation-view-model'
import styles from './RSVPModal.module.css'

interface RSVPModalProps {
  isOpen: boolean
  onClose: () => void
  variant: RsvpModalVariant
  eventSlug?: string
  requirePlusOneName?: boolean
  theme?: {
    primaryColor: string
    secondaryColor: string
    accentColor: string
  }
}

type ModalStyle = CSSProperties & {
  '--rsvp-primary'?: string
}

export default function RSVPModal({ isOpen, onClose, variant, eventSlug, requirePlusOneName, theme }: RSVPModalProps) {
  // Configuración por defecto si no se provee el tema
  const activeTheme = theme || {
    primaryColor: '#FF1493',
    secondaryColor: '#00FFFF',
    accentColor: '#FFD700'
  }
  const isModern = variant === 'modern'
  const ctaColors = getSolidCtaColors(activeTheme.primaryColor)
  const modalStyle: ModalStyle = isModern
    ? {
        '--rsvp-primary': ctaColors.background,
        borderColor: 'rgba(15, 23, 42, 0.16)',
        boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)',
        background: 'rgba(250, 250, 249, 0.97)',
      }
    : {
        borderColor: `${activeTheme.primaryColor}80`,
        boxShadow: `0 0 40px ${activeTheme.primaryColor}66, 0 0 80px ${activeTheme.secondaryColor}33`,
        background: `linear-gradient(135deg, rgba(26, 0, 51, 0.98), ${activeTheme.primaryColor}15)`,
      }

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    plusOne: false,
    plusOneName: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus())

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getClientRects().length > 0)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleDialogKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleDialogKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen, onClose])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    // Validar nombre del +1 si es requerido
    if (formData.plusOne && requirePlusOneName && !formData.plusOneName.trim()) {
      setSubmitStatus('error')
      setErrorMessage('El nombre del acompañante es requerido')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, eventSlug }),
      })

      const data = await response.json()

      if (response.ok) {
        setSubmitStatus('success')
        setTimeout(() => {
          onClose()
          setFormData({ name: '', email: '', phone: '', plusOne: false, plusOneName: '' })
          setSubmitStatus('idle')
        }, 2500)
      } else {
        setSubmitStatus('error')
        setErrorMessage(data.error || 'Error al enviar el formulario')
      }
    } catch (error) {
      setSubmitStatus('error')
      setErrorMessage('Error de conexión. Por favor intenta de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    const newData = {
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    }
    // Si desmarca plusOne, limpiar el nombre del +1
    if (name === 'plusOne' && !checked) {
      newData.plusOneName = ''
    }
    setFormData(newData)
  }

  if (!isOpen) return null

  return (
    <motion.div
      className={`${styles.overlay} ${isModern ? styles.modernOverlay : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        className={`${styles.modal} ${isModern ? styles.modernModal : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rsvp-modal-title"
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 50 }}
        onClick={(e) => e.stopPropagation()}
        style={modalStyle}
      >
        <button
          ref={closeButtonRef}
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Cerrar formulario RSVP"
          style={isModern ? undefined : { borderColor: `${activeTheme.primaryColor}80` }}
        >
          ✕
        </button>

        <div className={styles.modalHeader}>
          <h2
            id="rsvp-modal-title"
            className={styles.modalTitle}
            style={isModern ? {
              color: '#111827',
              textShadow: 'none',
            } : {
              color: activeTheme.primaryColor,
              textShadow: `0 0 10px ${activeTheme.primaryColor}99, 0 0 20px ${activeTheme.primaryColor}66`
            }}
          >
            ¡Confirma tu Asistencia!
          </h2>
          <p
            className={styles.modalSubtitle}
            style={isModern ? undefined : { color: activeTheme.secondaryColor }}
          >
            Necesitamos tus datos para el RSVP
          </p>
        </div>

        {submitStatus === 'success' ? (
          <motion.div
            className={styles.successMessage}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            style={isModern ? undefined : {
              background: `${activeTheme.secondaryColor}10`,
              borderRadius: '20px',
              border: `1px solid ${activeTheme.secondaryColor}33`,
              padding: '40px 20px',
              marginTop: '10px'
            }}
          >
            <div className={styles.successIcon}>🎉</div>
            <h3 style={isModern ? undefined : { color: activeTheme.secondaryColor }}>¡Confirmado!</h3>
            <p>Nos vemos en la fiesta</p>
          </motion.div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label htmlFor="name" className={styles.label}>
                Nombre Completo
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className={styles.input}
                placeholder="Tu nombre"
                disabled={isSubmitting}
                style={isModern ? undefined : { borderColor: `${activeTheme.primaryColor}4d` }}
                onFocus={isModern ? undefined : (e) => (e.target.style.borderColor = activeTheme.primaryColor)}
                onBlur={isModern ? undefined : (e) => (e.target.style.borderColor = `${activeTheme.primaryColor}4d`)}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className={styles.input}
                placeholder="tu@email.com"
                disabled={isSubmitting}
                style={isModern ? undefined : { borderColor: `${activeTheme.primaryColor}4d` }}
                onFocus={isModern ? undefined : (e) => (e.target.style.borderColor = activeTheme.primaryColor)}
                onBlur={isModern ? undefined : (e) => (e.target.style.borderColor = `${activeTheme.primaryColor}4d`)}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="phone" className={styles.label}>
                Teléfono
              </label>
              <PhoneInput
                defaultCountry="mx"
                value={formData.phone}
                onChange={(phone) => setFormData({ ...formData, phone })}
                className={styles.phoneInput}
                disabled={isSubmitting}
                inputClassName={styles.phoneInputField}
                countrySelectorStyleProps={{
                  buttonClassName: styles.countrySelector
                }}
                inputProps={{ id: 'phone', name: 'phone' }}
                disableDialCodePrefill={false}
                forceDialCode={true}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel} style={isModern ? undefined : { borderColor: `${activeTheme.primaryColor}4d` }}>
                <input
                  type="checkbox"
                  name="plusOne"
                  checked={formData.plusOne}
                  onChange={handleChange}
                  className={styles.checkbox}
                  disabled={isSubmitting}
                  style={{ accentColor: activeTheme.primaryColor }}
                />
                <span className={styles.checkboxText}>¿Vienes con +1?</span>
              </label>
            </div>

            {/* Campo condicional para nombre del +1 */}
            {formData.plusOne && requirePlusOneName && (
              <motion.div
                className={styles.formGroup}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label htmlFor="plusOneName" className={styles.label}>
                  Nombre del Acompañante *
                </label>
                <input
                  type="text"
                  id="plusOneName"
                  name="plusOneName"
                  value={formData.plusOneName}
                  onChange={handleChange}
                  required
                  className={styles.input}
                  placeholder="Nombre completo del +1"
                  disabled={isSubmitting}
                  style={isModern ? undefined : { borderColor: `${activeTheme.primaryColor}4d` }}
                  onFocus={isModern ? undefined : (e) => (e.target.style.borderColor = activeTheme.primaryColor)}
                  onBlur={isModern ? undefined : (e) => (e.target.style.borderColor = `${activeTheme.primaryColor}4d`)}
                />
              </motion.div>
            )}


            {submitStatus === 'error' && (
              <div className={styles.errorMessage}>
                {errorMessage}
              </div>
            )}

            <motion.button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting}
              whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
              whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
              style={isModern ? {
                background: ctaColors.background,
                color: ctaColors.text,
                boxShadow: 'none',
              } : {
                background: `linear-gradient(135deg, ${activeTheme.primaryColor}, ${activeTheme.secondaryColor})`,
                boxShadow: `0 0 20px ${activeTheme.primaryColor}80, 0 0 40px ${activeTheme.secondaryColor}4d`
              }}
            >
              {isSubmitting ? (
                <span className={styles.spinner}>Enviando...</span>
              ) : (
                isModern ? 'Confirmar asistencia' : 'CONFIRMAR ASISTENCIA'
              )}
            </motion.button>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}
