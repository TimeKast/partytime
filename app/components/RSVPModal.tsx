'use client'

import { useState, FormEvent } from 'react'
import { motion } from 'framer-motion'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import styles from './RSVPModal.module.css'

interface RSVPModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function RSVPModal({ isOpen, onClose }: RSVPModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    plusOne: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok) {
        setSubmitStatus('success')
        setTimeout(() => {
          onClose()
          setFormData({ name: '', email: '', phone: '', plusOne: false })
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
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    })
  }

  if (!isOpen) return null

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.modal}
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 50 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.closeButton} onClick={onClose}>
          ✕
        </button>

        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>¡Confirma tu Asistencia!</h2>
          <p className={styles.modalSubtitle}>Necesitamos tus datos para el RSVP</p>
        </div>

        {submitStatus === 'success' ? (
          <motion.div
            className={styles.successMessage}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <div className={styles.successIcon}>🎉</div>
            <h3>¡Confirmado!</h3>
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
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="phone" className={styles.label}>
                Teléfono
              </label>
              <PhoneInput
                international
                defaultCountry="MX"
                value={formData.phone}
                onChange={(value) => setFormData({ ...formData, phone: value || '' })}
                className={styles.phoneInput}
                disabled={isSubmitting}
                placeholder="Ingresa tu número"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  name="plusOne"
                  checked={formData.plusOne}
                  onChange={handleChange}
                  className={styles.checkbox}
                  disabled={isSubmitting}
                />
                <span className={styles.checkboxText}>¿Vienes con +1?</span>
              </label>
            </div>

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
            >
              {isSubmitting ? (
                <span className={styles.spinner}>Enviando...</span>
              ) : (
                'CONFIRMAR ASISTENCIA'
              )}
            </motion.button>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}
