'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import styles from '../login/login.module.css'

const POLICY_MESSAGES: Record<string, string> = {
    too_short: 'Debe tener al menos 8 caracteres.',
    too_long: 'No puede superar 72 bytes.',
    missing_uppercase: 'Incluye al menos una letra mayúscula.',
    missing_lowercase: 'Incluye al menos una letra minúscula.',
    missing_number: 'Incluye al menos un número.',
    contains_identity: 'No puede contener tu nombre o correo.',
    denylisted: 'Elige una contraseña menos común.',
}

function ResetPasswordForm() {
    const searchParams = useSearchParams()
    const [token] = useState(() => searchParams.get('token') || '')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState('')
    const [policyErrors, setPolicyErrors] = useState<string[]>([])

    useEffect(() => {
        if (!searchParams.has('token')) return

        const url = new URL(window.location.href)
        url.searchParams.delete('token')
        window.history.replaceState(
            window.history.state,
            '',
            `${url.pathname}${url.search}${url.hash}`,
        )
    }, [searchParams])

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setSubmitting(true)
        setError('')
        setPolicyErrors([])

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword, confirmPassword }),
            })
            const data = await response.json()
            if (!response.ok || !data.success) {
                setError(data.error || 'No se pudo restablecer la contraseña.')
                setPolicyErrors(Array.isArray(data.policyErrors) ? data.policyErrors : [])
                return
            }
            setNewPassword('')
            setConfirmPassword('')
            setSuccess(true)
        } catch {
            setError('Error de conexión. Intenta de nuevo.')
        } finally {
            setSubmitting(false)
        }
    }

    if (!token) {
        return (
            <div className={styles.error} role="alert">
                ⚠️ El enlace es inválido o está incompleto.
            </div>
        )
    }

    if (success) {
        return (
            <div className={styles.status} role="status" aria-live="polite">
                <span aria-hidden="true">✅</span>
                <p>Tu contraseña fue actualizada. Todas tus sesiones anteriores se cerraron.</p>
                <Link className={styles.submitLink} href="/login">Iniciar sesión</Link>
            </div>
        )
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            {error && <div className={styles.error} role="alert">⚠️ {error}</div>}
            <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="reset-new-password">Nueva contraseña</label>
                <input
                    id="reset-new-password"
                    className={styles.input}
                    type="password"
                    value={newPassword}
                    onChange={event => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={submitting}
                />
            </div>
            <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="reset-confirm-password">Confirmar contraseña</label>
                <input
                    id="reset-confirm-password"
                    className={styles.input}
                    type="password"
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={submitting}
                />
            </div>
            <ul className={styles.policyList} aria-label="Requisitos de contraseña">
                <li>8 caracteres como mínimo; 72 bytes como máximo.</li>
                <li>Incluye una mayúscula, una minúscula y un número.</li>
                <li>Los símbolos son opcionales.</li>
                <li>No uses tu nombre, correo ni una contraseña común.</li>
            </ul>
            {policyErrors.length > 0 && (
                <ul className={styles.policyErrors} role="alert">
                    {policyErrors.map(code => <li key={code}>{POLICY_MESSAGES[code] || 'Revisa los requisitos.'}</li>)}
                </ul>
            )}
            <button className={styles.submitButton} type="submit" disabled={submitting}>
                {submitting ? 'Actualizando…' : 'Guardar nueva contraseña'}
            </button>
        </form>
    )
}

export default function ResetPasswordPage() {
    return (
        <main className={styles.container}>
            <section className={styles.loginCard} aria-labelledby="reset-password-title">
                <div className={styles.brand}>
                    <div className={styles.logo} aria-hidden="true">🔑</div>
                    <h1 id="reset-password-title" className={styles.title}>Nueva contraseña</h1>
                    <p className={styles.subtitle}>El enlace solo puede usarse una vez.</p>
                </div>
                <Suspense fallback={<div className={styles.loadingSpinner} aria-label="Cargando" />}>
                    <ResetPasswordForm />
                </Suspense>
                <div className={styles.footer}>
                    <Link className={styles.secondaryLink} href="/login">← Volver al inicio de sesión</Link>
                </div>
            </section>
        </main>
    )
}
