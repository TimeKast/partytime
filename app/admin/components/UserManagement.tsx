'use client'

import { useState, useEffect, useRef } from 'react'
import styles from '../admin.module.css'

interface User {
    id: string
    email: string
    name: string
    role: string
    isActive: boolean
    createdAt: string
    lastLoginAt: string | null
}

interface EventAssignment {
    eventId: string
    eventSlug: string
    eventTitle: string
    role: string
}

interface Event {
    id?: string
    slug: string
    title: string
}

interface UserManagementProps {
    events: Event[]
}

export default function UserManagement({ events }: UserManagementProps) {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [userAssignments, setUserAssignments] = useState<EventAssignment[]>([])
    const [resetReveal, setResetReveal] = useState<{ userName: string; temporaryPassword: string } | null>(null)
    const [copyMessage, setCopyMessage] = useState('')
    const resetDialogRef = useRef<HTMLDivElement>(null)
    const copyButtonRef = useRef<HTMLButtonElement>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)

    const [newUserForm, setNewUserForm] = useState({
        email: '',
        password: '',
        name: '',
    })

    // Load users on mount
    useEffect(() => {
        loadUsers()
    }, [])

    useEffect(() => {
        if (!resetReveal) return

        const focusFrame = requestAnimationFrame(() => copyButtonRef.current?.focus())
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                setResetReveal(null)
                setCopyMessage('')
                return
            }
            if (event.key !== 'Tab' || !resetDialogRef.current) return

            const focusable = Array.from(resetDialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

        document.addEventListener('keydown', handleKeyDown)
        return () => {
            cancelAnimationFrame(focusFrame)
            document.removeEventListener('keydown', handleKeyDown)
            previousFocusRef.current?.focus()
        }
    }, [resetReveal])

    const loadUsers = async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/admin/users')
            const data = await response.json()
            if (data.success) {
                setUsers(data.users)
            } else {
                setMessage(`❌ ${data.error}`)
            }
        } catch {
            setMessage('❌ Error al cargar usuarios')
        } finally {
            setLoading(false)
        }
    }

    const loadUserAssignments = async (userId: string) => {
        try {
            const response = await fetch(`/api/admin/users/${userId}/events`)
            const data = await response.json()
            if (data.success) {
                setUserAssignments(data.assignments)
            }
        } catch {
            console.error('Error loading assignments')
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        try {
            const response = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUserForm),
            })

            const data = await response.json()

            if (data.success) {
                setMessage('✅ Usuario creado exitosamente')
                setShowCreateForm(false)
                setNewUserForm({ email: '', password: '', name: '' })
                await loadUsers()
            } else {
                setMessage(`❌ ${data.error}`)
            }
        } catch {
            setMessage('❌ Error al crear usuario')
        } finally {
            setLoading(false)
        }
    }

    const handleToggleActive = async (user: User) => {
        if (!confirm(`¿${user.isActive ? 'Desactivar' : 'Activar'} usuario ${user.name}?`)) {
            return
        }

        setLoading(true)
        try {
            const response = await fetch(`/api/admin/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !user.isActive }),
            })

            const data = await response.json()

            if (data.success) {
                setMessage(`✅ Usuario ${data.user.isActive ? 'activado' : 'desactivado'}`)
                await loadUsers()
            } else {
                setMessage(`❌ ${data.error}`)
            }
        } catch {
            setMessage('❌ Error al actualizar usuario')
        } finally {
            setLoading(false)
        }
    }

    const handleChangeRole = async (user: User, newRole: string) => {
        if (!confirm(`¿Cambiar rol de ${user.name} a ${newRole}?`)) {
            return
        }

        setLoading(true)
        try {
            const response = await fetch(`/api/admin/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            })

            const data = await response.json()

            if (data.success) {
                setMessage(`✅ Rol cambiado a ${newRole}`)
                await loadUsers()
            } else {
                setMessage(`❌ ${data.error}`)
            }
        } catch {
            setMessage('❌ Error al cambiar rol')
        } finally {
            setLoading(false)
        }
    }

    const handleAssignEvent = async (userId: string, eventId: string, role: 'manager' | 'viewer') => {
        setLoading(true)
        try {
            const response = await fetch(`/api/admin/users/${userId}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId, role }),
            })

            const data = await response.json()

            if (data.success) {
                setMessage('✅ Evento asignado')
                await loadUserAssignments(userId)
            } else {
                setMessage(`❌ ${data.error}`)
            }
        } catch {
            setMessage('❌ Error al asignar evento')
        } finally {
            setLoading(false)
        }
    }

    const handleRemoveAssignment = async (userId: string, eventId: string) => {
        if (!confirm('¿Quitar acceso a este evento?')) {
            return
        }

        setLoading(true)
        try {
            const response = await fetch(`/api/admin/users/${userId}/events?eventId=${eventId}`, {
                method: 'DELETE',
            })

            const data = await response.json()

            if (data.success) {
                setMessage('✅ Acceso removido')
                await loadUserAssignments(userId)
            } else {
                setMessage(`❌ ${data.error}`)
            }
        } catch {
            setMessage('❌ Error al remover acceso')
        } finally {
            setLoading(false)
        }
    }

    const selectUser = async (user: User) => {
        setSelectedUser(user)
        await loadUserAssignments(user.id)
    }

    const handleResetPassword = async (user: User) => {
        if (!window.confirm(`¿Restablecer la contraseña de ${user.name}? Se cerrarán todas sus sesiones.`)) {
            return
        }

        previousFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null
        setLoading(true)
        setMessage('')
        try {
            const response = await fetch(`/api/admin/users/${user.id}/reset-password`, {
                method: 'POST',
            })
            const data = await response.json()
            if (!response.ok || !data.success || typeof data.temporaryPassword !== 'string') {
                setMessage(`❌ ${data.error || 'No se pudo restablecer la contraseña'}`)
                return
            }

            setCopyMessage('')
            setResetReveal({ userName: user.name, temporaryPassword: data.temporaryPassword })
        } catch {
            setMessage('❌ Error al restablecer la contraseña')
        } finally {
            setLoading(false)
        }
    }

    const copyTemporaryPassword = async () => {
        if (!resetReveal) return
        try {
            await navigator.clipboard.writeText(resetReveal.temporaryPassword)
            setCopyMessage('✅ Contraseña copiada')
        } catch {
            setCopyMessage('❌ No se pudo copiar. Selecciona el valor manualmente.')
        }
    }

    const closeResetReveal = () => {
        setResetReveal(null)
        setCopyMessage('')
    }

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'super_admin':
                return <span style={{ background: '#dc2626', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Super Admin</span>
            default:
                return null // No global badge for regular users to avoid confusion
        }
    }

    return (
        <div style={{ padding: '20px', color: '#1f2937' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>👥 Gestión de Usuarios</h2>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    style={{
                        padding: '10px 20px',
                        background: showCreateForm ? '#6b7280' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                    }}
                >
                    {showCreateForm ? '✕ Cancelar' : '➕ Nuevo Usuario'}
                </button>
            </div>

            {message && (
                <div style={{
                    padding: '10px 15px',
                    marginBottom: '15px',
                    background: message.startsWith('✅') ? '#d1fae5' : '#fee2e2',
                    borderRadius: '8px',
                }}>
                    {message}
                </div>
            )}

            {/* Create User Form */}
            {showCreateForm && (
                <div style={{
                    background: '#f9fafb',
                    padding: '20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                }}>
                    <h3 style={{ marginBottom: '15px' }}>Crear Nuevo Usuario</h3>
                    <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: '15px', maxWidth: '500px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Nombre *</label>
                            <input
                                type="text"
                                value={newUserForm.name}
                                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                required
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Email *</label>
                            <input
                                type="email"
                                value={newUserForm.email}
                                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                required
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="new-user-password"
                                style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}
                            >
                                Contraseña *
                            </label>
                            <input
                                id="new-user-password"
                                type="password"
                                value={newUserForm.password}
                                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                required
                                minLength={8}
                                aria-describedby="new-user-password-hint"
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                            />
                            <p
                                id="new-user-password-hint"
                                style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '0.875rem' }}
                            >
                                8 caracteres como mínimo y 72 bytes como máximo. Incluye una mayúscula, una minúscula y un número.
                                {' '}Los símbolos son opcionales. No uses el nombre, correo ni una contraseña común.
                            </p>
                        </div>
                        {/* Global role selection removed as it's redundant. Use assignments instead. */}
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '12px',
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.7 : 1,
                            }}
                        >
                            {loading ? 'Creando...' : 'Crear Usuario'}
                        </button>
                    </form>
                </div>
            )}

            {/* Users List */}
            <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 1fr' : '1fr', gap: '20px' }}>
                <div>
                    <h3 style={{ marginBottom: '15px' }}>Usuarios ({users.length})</h3>
                    {loading && users.length === 0 ? (
                        <p>Cargando usuarios...</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    onClick={() => selectUser(user)}
                                    style={{
                                        padding: '15px',
                                        background: selectedUser?.id === user.id ? '#e0e7ff' : 'white',
                                        border: selectedUser?.id === user.id ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        opacity: user.isActive ? 1 : 0.6,
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontWeight: '600', marginBottom: '5px' }}>
                                                {user.name}
                                                {!user.isActive && <span style={{ color: '#dc2626', marginLeft: '8px' }}>(Inactivo)</span>}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{user.email}</div>
                                        </div>
                                        <div>{getRoleBadge(user.role)}</div>
                                    </div>
                                    {user.lastLoginAt && (
                                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '8px' }}>
                                            Último acceso: {new Date(user.lastLoginAt).toLocaleDateString('es-MX', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected User Details */}
                {selectedUser && (
                    <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px' }}>
                        {(() => {
                            const user = selectedUser; // Local constant for type narrowing
                            return (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <h3>{user.name}</h3>
                                        <button
                                            onClick={() => setSelectedUser(null)}
                                            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div style={{ marginBottom: '20px' }}>
                                        <p><strong>Email:</strong> {user.email}</p>
                                        <p><strong>Estado:</strong> {user.isActive ? '🟢 Activo' : '🔴 Inactivo'}</p>
                                        {user.role === 'super_admin' && (
                                            <p><strong>Rol Global:</strong> {getRoleBadge(user.role)}</p>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        {user.role !== 'super_admin' && (
                                            <button
                                                onClick={() => handleToggleActive(user)}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: user.isActive ? '#ef4444' : '#10b981',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {user.isActive ? '🚫 Desactivar Cuenta' : '✅ Activar Cuenta'}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleResetPassword(user)}
                                            disabled={loading || !user.isActive}
                                            title={user.isActive ? undefined : 'Activa la cuenta antes de restablecer su contraseña'}
                                            className={styles.resetPasswordButton}
                                        >
                                            🔑 Restablecer contraseña
                                        </button>
                                    </div>

                                    {/* Event Assignments */}
                                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
                                        <h4 style={{ marginBottom: '15px' }}>🎫 Eventos Asignados</h4>

                                        {userAssignments.length === 0 ? (
                                            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No tiene eventos asignados</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                                                {userAssignments.map((assignment) => (
                                                    <div
                                                        key={assignment.eventId}
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            padding: '10px',
                                                            background: 'white',
                                                            borderRadius: '6px',
                                                            border: '1px solid #e5e7eb',
                                                        }}
                                                    >
                                                        <div>
                                                            <div style={{ fontWeight: '500' }}>{assignment.eventTitle}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                                                Rol: {assignment.role === 'manager' ? 'Manager' : 'Viewer'}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveAssignment(user.id, assignment.eventId)}
                                                            style={{
                                                                padding: '4px 8px',
                                                                background: '#fee2e2',
                                                                color: '#dc2626',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.875rem',
                                                            }}
                                                        >
                                                            ✕ Quitar
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Add Event Assignment */}
                                        {user.role !== 'super_admin' && (
                                            <div style={{ marginTop: '15px' }}>
                                                <h5 style={{ marginBottom: '10px' }}>Asignar Evento</h5>
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    <select
                                                        id="assignEventSelect"
                                                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                                    >
                                                        <option value="">Seleccionar evento...</option>
                                                        {events
                                                            .filter(e => !userAssignments.some(a => a.eventId === e.id))
                                                            .map(event => (
                                                                <option key={event.id} value={event.id}>{event.title}</option>
                                                            ))
                                                        }
                                                    </select>
                                                    <select
                                                        id="assignRoleSelect"
                                                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                                    >
                                                        <option value="viewer">Viewer</option>
                                                        <option value="manager">Manager</option>
                                                    </select>
                                                    <button
                                                        onClick={() => {
                                                            const eventSelect = document.getElementById('assignEventSelect') as HTMLSelectElement
                                                            const roleSelect = document.getElementById('assignRoleSelect') as HTMLSelectElement
                                                            if (eventSelect.value) {
                                                                handleAssignEvent(user.id, eventSelect.value, roleSelect.value as 'manager' | 'viewer')
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '8px 16px',
                                                            background: '#10b981',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        ➕ Asignar
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>

            {resetReveal && (
                <div className={styles.securityOverlay} onClick={closeResetReveal}>
                    <div
                        ref={resetDialogRef}
                        className={styles.securityDialog}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="temporary-password-title"
                        aria-describedby="temporary-password-warning"
                        onClick={event => event.stopPropagation()}
                    >
                        <h2 id="temporary-password-title">Contraseña temporal de {resetReveal.userName}</h2>
                        <p id="temporary-password-warning" className={styles.passwordWarning}>
                            ⚠️ Se muestra una sola vez. Compártela por un canal seguro; no se volverá a mostrar.
                        </p>
                        <code className={styles.temporaryPassword}>{resetReveal.temporaryPassword}</code>
                        <div className={styles.securityDialogActions}>
                            <button
                                ref={copyButtonRef}
                                type="button"
                                className={styles.passwordSubmit}
                                onClick={copyTemporaryPassword}
                            >
                                📋 Copiar
                            </button>
                            <button type="button" className={styles.secondaryButton} onClick={closeResetReveal}>
                                Ya la guardé, cerrar
                            </button>
                        </div>
                        {copyMessage && <p role="status" aria-live="polite">{copyMessage}</p>}
                    </div>
                </div>
            )}
        </div>
    )
}
