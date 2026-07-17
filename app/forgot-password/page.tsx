'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import styles from '../login/login.module.css'

const GENERIC_CONFIRMATION = 'Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setSubmitting(true)
        setError('')

        try {
            await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            setSubmitted(true)
        } catch {
            setError('No pudimos enviar la solicitud. Revisa tu conexión e intenta de nuevo.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main className={styles.container}>
            <section className={styles.loginCard} aria-labelledby="forgot-password-title">
                <div className={styles.brand}>
                    <div className={styles.logo} aria-hidden="true">🔐</div>
                    <h1 id="forgot-password-title" className={styles.title}>Recupera tu acceso</h1>
                    <p className={styles.subtitle}>Te enviaremos un enlace de un solo uso.</p>
                </div>

                {submitted ? (
                    <div className={styles.status} role="status" aria-live="polite">
                        <span aria-hidden="true">✅</span>
                        <p>{GENERIC_CONFIRMATION}</p>
                    </div>
                ) : (
                    <form className={styles.form} onSubmit={handleSubmit}>
                        {error && <div className={styles.error} role="alert">⚠️ {error}</div>}
                        <div className={styles.inputGroup}>
                            <label className={styles.label} htmlFor="forgot-email">Email</label>
                            <input
                                id="forgot-email"
                                className={styles.input}
                                type="email"
                                value={email}
                                onChange={event => setEmail(event.target.value)}
                                autoComplete="email"
                                required
                                disabled={submitting}
                            />
                        </div>
                        <button className={styles.submitButton} type="submit" disabled={submitting}>
                            {submitting ? 'Enviando…' : 'Enviar enlace'}
                        </button>
                    </form>
                )}

                <div className={styles.footer}>
                    <Link className={styles.secondaryLink} href="/login">← Volver a iniciar sesión</Link>
                </div>
            </section>
        </main>
    )
}
