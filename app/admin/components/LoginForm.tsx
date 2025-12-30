'use client'

import { useState, FormEvent } from 'react'
import styles from '../admin.module.css'
import eventConfig from '@/event-config.json'

interface LoginFormProps {
    onLoginSuccess: (credentials: string) => void
}

/**
 * H-008 FIX: Extracted LoginForm component from monolithic admin page
 * Handles admin authentication with Basic HTTP auth
 */
export default function LoginForm({ onLoginSuccess }: LoginFormProps) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    const handleLogin = async (e: FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        try {
            // Crear credenciales Base64
            const credentials = btoa(`${username}:${password}`)

            // Validar credenciales con el servidor
            const response = await fetch('/api/admin/validate', {
                headers: {
                    'Authorization': `Basic ${credentials}`
                }
            })

            if (response.status === 401) {
                setMessage('❌ Credenciales incorrectas')
                setLoading(false)
                return
            }

            if (!response.ok) {
                setMessage('❌ Error de conexión')
                setLoading(false)
                return
            }

            // Credenciales válidas - guardar y notificar
            sessionStorage.setItem('admin_auth', credentials)
            onLoginSuccess(credentials)
        } catch (error) {
            console.error('Error en login:', error)
            setMessage('❌ Error de conexión')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginBox}>
                <h1>🔐 Admin Dashboard</h1>
                <p>{eventConfig.event.title}</p>

                <form onSubmit={handleLogin} className={styles.loginForm} autoComplete="off">
                    <input
                        type="text"
                        placeholder="Usuario"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        required
                    />
                    <input
                        type="password"
                        placeholder="Contraseña"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                    />
                    <button type="submit" disabled={loading}>
                        {loading ? 'Verificando...' : 'Iniciar Sesión'}
                    </button>
                </form>

                {message && <p className={styles.message}>{message}</p>}
            </div>
        </div>
    )
}
