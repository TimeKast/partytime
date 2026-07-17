'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './login.module.css'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [rememberMe, setRememberMe] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [checkingAuth, setCheckingAuth] = useState(true)

    // Check if already authenticated
    useEffect(() => {
        async function checkAuth() {
            try {
                const res = await fetch('/api/auth/me')
                const data = await res.json()
                if (data.authenticated) {
                    router.replace('/admin')
                }
            } catch {
                // Not authenticated, stay on login page
            } finally {
                setCheckingAuth(false)
            }
        }
        checkAuth()
    }, [router])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, rememberMe }),
            })

            const data = await res.json()

            if (data.success) {
                router.replace('/admin')
            } else {
                setError(data.error || 'Error al iniciar sesión')
            }
        } catch {
            setError('Error de conexión. Intenta de nuevo.')
        } finally {
            setIsLoading(false)
        }
    }

    if (checkingAuth) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingSpinner}></div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.loginCard}>
                {/* Logo/Brand */}
                <div className={styles.brand}>
                    <div className={styles.logo}>🎉</div>
                    <h1 className={styles.title}>Party Time!</h1>
                    <p className={styles.subtitle}>Panel de Administración</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className={styles.form}>
                    {error && (
                        <div className={styles.error}>
                            <span className={styles.errorIcon}>⚠️</span>
                            {error}
                        </div>
                    )}

                    <div className={styles.inputGroup}>
                        <label htmlFor="email" className={styles.label}>
                            Email
                        </label>
                        <input
                            id="email"
                            type="text"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={styles.input}
                            placeholder="tu@email.com"
                            required
                            autoComplete="email"
                            disabled={isLoading}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label htmlFor="password" className={styles.label}>
                            Contraseña
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={styles.input}
                            placeholder="••••••••"
                            required
                            autoComplete="current-password"
                            disabled={isLoading}
                        />
                    </div>

                    <div className={styles.rememberRow}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className={styles.checkbox}
                                disabled={isLoading}
                            />
                            <span className={styles.checkboxText}>
                                Recordar sesión (30 días)
                            </span>
                        </label>
                        <Link className={styles.forgotLink} href="/forgot-password">
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>

                    <button
                        type="submit"
                        className={styles.submitButton}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className={styles.buttonLoading}>
                                <span className={styles.buttonSpinner}></span>
                                Iniciando sesión...
                            </span>
                        ) : (
                            'Iniciar Sesión'
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className={styles.footer}>
                    <p>¿Necesitas acceso? Contacta al administrador.</p>
                </div>
            </div>
        </div>
    )
}
