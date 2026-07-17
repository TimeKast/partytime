'use client'

import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
} from 'react'
import styles from '../admin.module.css'

interface ChangePasswordFormProps {
    isEnvironmentAdmin?: boolean
    forced?: boolean
    onSuccess?: () => void
}

const POLICY_HINTS = [
    '12 caracteres como mínimo y 72 bytes como máximo.',
    'Usa al menos 3 tipos: mayúsculas, minúsculas, números o símbolos.',
    'No incluyas tu nombre ni la parte anterior a @ de tu correo.',
]

const POLICY_MESSAGES: Record<string, string> = {
    too_short: 'La contraseña debe tener al menos 12 caracteres.',
    too_long: 'La contraseña no puede superar 72 bytes.',
    too_few_classes: 'Usa al menos 3 tipos de caracteres.',
    contains_identity: 'La contraseña no puede contener tu nombre o correo.',
    denylisted: 'Elige una contraseña menos común.',
}

export default function ChangePasswordForm({
    isEnvironmentAdmin = false,
    forced = false,
    onSuccess,
}: ChangePasswordFormProps) {
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [message, setMessage] = useState('')
    const [policyErrors, setPolicyErrors] = useState<string[]>([])
    const [submitting, setSubmitting] = useState(false)

    if (isEnvironmentAdmin) {
        return (
            <div className={styles.passwordInfo} role="status">
                ℹ️ Esta cuenta se administra por configuración del entorno. Cambia sus credenciales desde la configuración segura del despliegue.
            </div>
        )
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setMessage('')
        setPolicyErrors([])
        setSubmitting(true)

        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
            })
            const data = await response.json()

            if (!response.ok || !data.success) {
                setMessage(`❌ ${data.error || 'No se pudo cambiar la contraseña.'}`)
                setPolicyErrors(Array.isArray(data.policyErrors) ? data.policyErrors : [])
                return
            }

            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setMessage(data.message || '✅ Contraseña actualizada.')
            onSuccess?.()
        } catch {
            setMessage('❌ Error de conexión. Intenta de nuevo.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <form className={styles.passwordForm} onSubmit={handleSubmit}>
            {forced && (
                <p className={styles.passwordWarning}>
                    🔐 Debes reemplazar la contraseña temporal antes de continuar.
                </p>
            )}

            <div className={styles.passwordField}>
                <label htmlFor={forced ? 'forced-current-password' : 'current-password'}>
                    Contraseña actual
                </label>
                <input
                    id={forced ? 'forced-current-password' : 'current-password'}
                    type="password"
                    value={currentPassword}
                    onChange={event => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    autoFocus={forced}
                    disabled={submitting}
                />
            </div>

            <div className={styles.passwordField}>
                <label htmlFor={forced ? 'forced-new-password' : 'new-password'}>
                    Nueva contraseña
                </label>
                <input
                    id={forced ? 'forced-new-password' : 'new-password'}
                    type="password"
                    value={newPassword}
                    onChange={event => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={submitting}
                />
            </div>

            <div className={styles.passwordField}>
                <label htmlFor={forced ? 'forced-confirm-password' : 'confirm-password'}>
                    Confirmar nueva contraseña
                </label>
                <input
                    id={forced ? 'forced-confirm-password' : 'confirm-password'}
                    type="password"
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={submitting}
                />
            </div>

            <ul className={styles.passwordPolicy} aria-label="Requisitos de contraseña">
                {POLICY_HINTS.map(hint => <li key={hint}>{hint}</li>)}
            </ul>

            {policyErrors.length > 0 && (
                <ul className={styles.passwordErrors} role="alert">
                    {policyErrors.map(error => (
                        <li key={error}>{POLICY_MESSAGES[error] || 'Revisa los requisitos de contraseña.'}</li>
                    ))}
                </ul>
            )}

            {message && (
                <div
                    className={styles.passwordMessage}
                    role={message.startsWith('❌') ? 'alert' : 'status'}
                    aria-live="polite"
                >
                    {message}
                </div>
            )}

            <button className={styles.passwordSubmit} type="submit" disabled={submitting}>
                {submitting ? 'Actualizando…' : 'Actualizar contraseña'}
            </button>
        </form>
    )
}

export function ForcedPasswordChangeDialog({ onSuccess }: { onSuccess: () => void }) {
    const dialogRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return

        const focusableSelector = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        const focusFirst = requestAnimationFrame(() => {
            dialog.querySelector<HTMLElement>(focusableSelector)?.focus()
        })
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                return
            }
            if (event.key !== 'Tab') return

            const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
                .filter(element => element.getClientRects().length > 0)
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

        document.addEventListener('keydown', handleKeyDown)
        return () => {
            cancelAnimationFrame(focusFirst)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    return (
        <div className={styles.securityOverlay}>
            <div
                ref={dialogRef}
                className={styles.securityDialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="forced-password-title"
                aria-describedby="forced-password-description"
            >
                <h2 id="forced-password-title">Cambia tu contraseña temporal</h2>
                <p id="forced-password-description">
                    Por seguridad, el panel permanecerá bloqueado hasta que elijas una contraseña nueva.
                </p>
                <ChangePasswordForm forced onSuccess={onSuccess} />
            </div>
        </div>
    )
}
