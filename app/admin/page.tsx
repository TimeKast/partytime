'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import eventConfig from '@/event-config.json'
import styles from './admin.module.css'

interface RSVP {
  id: string
  name: string
  email: string
  phone: string
  plusOne: boolean
  createdAt: string
  status: 'confirmed' | 'cancelled'
  emailSent?: string
}

export default function AdminDashboard() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rsvps, setRsvps] = useState<RSVP[]>([])
  const [filteredRsvps, setFilteredRsvps] = useState<RSVP[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'confirmed' | 'cancelled'>('all')
  const [filterPlusOne, setFilterPlusOne] = useState<'all' | 'yes' | 'no'>('all')
  const [filterEmail, setFilterEmail] = useState<'all' | 'sent' | 'not-sent'>('all')
  const [message, setMessage] = useState('')

  // Autenticación
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Guardar credenciales en sessionStorage
    const credentials = btoa(`${username}:${password}`)
    sessionStorage.setItem('admin_auth', credentials)
    
    // Marcar como autenticado y cargar RSVPs
    setIsAuthenticated(true)
    await loadRSVPs()
  }

  const loadRSVPs = async () => {
    setLoading(true)
    try {
      console.log('🔄 Cargando RSVPs...')
      
      // Cargar RSVPs desde la API
      const response = await fetch('/api/rsvp')

      if (!response.ok) {
        throw new Error('Error al cargar RSVPs')
      }

      const data = await response.json()
      
      console.log('✅ RSVPs recibidos:', data)
      console.log('📊 data.success:', data.success)
      console.log('📊 data.rsvps:', data.rsvps)
      console.log('📊 data.rsvps length:', data.rsvps?.length)
      
      if (data.success && data.rsvps) {
        setRsvps(data.rsvps)
        setFilteredRsvps(data.rsvps)
        console.log('✅ RSVPs guardados en estado:', data.rsvps.length)
      } else {
        console.log('⚠️ No hay RSVPs o success es false')
      }
    } catch (error) {
      console.error('❌ Error cargando RSVPs:', error)
      setMessage('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  // Cargar RSVPs al montar si hay sesión
  useEffect(() => {
    console.log('🔍 Verificando sesión...')
    const authHeader = sessionStorage.getItem('admin_auth')
    console.log('🔑 Auth header:', authHeader ? 'Existe' : 'No existe')
    
    if (authHeader) {
      setIsAuthenticated(true)
      console.log('✅ Usuario autenticado, cargando RSVPs...')
      loadRSVPs()
    } else {
      console.log('❌ Usuario no autenticado')
    }
  }, [])

  // Filtrar RSVPs
  useEffect(() => {
    let filtered = [...rsvps]

    // Filtro por status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === filterStatus)
    }

    // Filtro por +1
    if (filterPlusOne === 'yes') {
      filtered = filtered.filter(r => r.plusOne)
    } else if (filterPlusOne === 'no') {
      filtered = filtered.filter(r => !r.plusOne)
    }

    // Filtro por email enviado
    if (filterEmail === 'sent') {
      filtered = filtered.filter(r => r.emailSent)
    } else if (filterEmail === 'not-sent') {
      filtered = filtered.filter(r => !r.emailSent)
    }

    // Búsqueda por texto
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        r.phone.includes(term)
      )
    }

    setFilteredRsvps(filtered)
  }, [rsvps, filterStatus, filterPlusOne, filterEmail, searchTerm])

  // Enviar email individual
  const sendEmail = async (rsvp: RSVP) => {
    setLoading(true)
    const isReminder = !!rsvp.emailSent
    setMessage(`Enviando ${isReminder ? 'recordatorio' : 'email'}...`)
    
    try {
      const authHeader = sessionStorage.getItem('admin_auth')
      console.log('🔐 Auth header existe:', !!authHeader)
      console.log('🔐 Auth header (primeros 20 chars):', authHeader?.substring(0, 20))
      
      const response = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify({
          rsvpId: rsvp.id,
          name: rsvp.name,
          email: rsvp.email,
          plusOne: rsvp.plusOne,
          emailSent: rsvp.emailSent
        })
      })

      console.log('📬 Response status:', response.status)
      const data = await response.json()
      console.log('📬 Response data:', data)

      if (data.success) {
        setMessage(`✅ ${isReminder ? 'Recordatorio' : 'Email'} enviado a ${rsvp.name}`)
        await loadRSVPs()
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Error al enviar email')
    } finally {
      setLoading(false)
    }
  }

  // Enviar emails masivos
  const sendBulkEmails = async () => {
    const count = filteredRsvps.length
    if (count === 0) {
      setMessage('❌ No hay RSVPs para enviar')
      return
    }

    const notSentCount = filteredRsvps.filter(r => !r.emailSent).length
    const confirmMessage = notSentCount > 0
      ? `¿Enviar emails a ${count} personas? (${notSentCount} sin email previo)`
      : `¿Enviar emails a ${count} personas? (Todos ya recibieron email antes)`
    
    if (!confirm(confirmMessage)) {
      return
    }

    setLoading(true)
    setMessage('Enviando emails...')
    
    try {
      const authHeader = sessionStorage.getItem('admin_auth')
      
      // Enviar lista de IDs específicos de los RSVPs filtrados
      const response = await fetch('/api/admin/send-bulk-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify({
          rsvpIds: filteredRsvps.map(r => r.id)
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`✅ Enviados: ${data.sent} | ❌ Fallidos: ${data.failed}`)
        await loadRSVPs()
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Error al enviar emails')
    } finally {
      setLoading(false)
    }
  }

  // Cerrar sesión
  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth')
    setIsAuthenticated(false)
    setUsername('')
    setPassword('')
  }

  // Stats
  const stats = {
    total: rsvps.length,
    confirmed: rsvps.filter(r => r.status === 'confirmed').length,
    cancelled: rsvps.filter(r => r.status === 'cancelled').length,
    plusOne: rsvps.filter(r => r.plusOne).length,
    emailsSent: rsvps.filter(r => r.emailSent).length,
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.loginContainer}>
        <div className={styles.loginBox}>
          <h1>🔐 Admin Dashboard</h1>
          <p>{eventConfig.event.title}</p>
          
          <form onSubmit={handleLogin} className={styles.loginForm}>
            <input
              type="text"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1>📊 Admin Dashboard</h1>
          <p>{eventConfig.event.title}</p>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          Cerrar Sesión
        </button>
      </header>

      {/* Estadísticas */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <h3>{stats.total}</h3>
          <p>Total RSVPs</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.confirmed}</h3>
          <p>Confirmados</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.cancelled}</h3>
          <p>Cancelados</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.plusOne}</h3>
          <p>Con +1</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.emailsSent}</h3>
          <p>Emails Enviados</p>
        </div>
      </div>

      {/* Controles */}
      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
          <option value="all">Todos los estados</option>
          <option value="confirmed">✅ Confirmados</option>
          <option value="cancelled">❌ Cancelados</option>
        </select>

        <select value={filterPlusOne} onChange={(e) => setFilterPlusOne(e.target.value as any)}>
          <option value="all">Todos los +1</option>
          <option value="yes">👥 Con +1</option>
          <option value="no">👤 Sin +1</option>
        </select>

        <select value={filterEmail} onChange={(e) => setFilterEmail(e.target.value as any)} className={styles.emailFilter}>
          <option value="all">Todos los emails</option>
          <option value="sent">✉️ Email enviado</option>
          <option value="not-sent">📭 Sin email</option>
        </select>

        <button
          onClick={sendBulkEmails}
          disabled={loading || filteredRsvps.length === 0}
          className={styles.bulkBtn}
        >
          📧 Enviar a Filtrados ({filteredRsvps.length})
        </button>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      {/* Tabla de RSVPs */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>+1</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Email Enviado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredRsvps.map((rsvp) => (
              <tr key={rsvp.id}>
                <td>{rsvp.name}</td>
                <td>{rsvp.email}</td>
                <td>{rsvp.phone}</td>
                <td>{rsvp.plusOne ? '✅ Sí' : '❌ No'}</td>
                <td>
                  <span className={rsvp.status === 'confirmed' ? styles.confirmed : styles.cancelled}>
                    {rsvp.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}
                  </span>
                </td>
                <td>{new Date(rsvp.createdAt).toLocaleDateString()}</td>
                <td>
                  {rsvp.emailSent ? (
                    <span className={styles.emailSent}>
                      ✅ {new Date(rsvp.emailSent).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className={styles.emailNotSent}>No enviado</span>
                  )}
                </td>
                <td>
                  <button
                    onClick={() => sendEmail(rsvp)}
                    disabled={loading}
                    className={styles.sendBtn}
                  >
                    📧 Enviar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredRsvps.length === 0 && (
          <p className={styles.noData}>No hay RSVPs que coincidan con los filtros</p>
        )}
      </div>
    </div>
  )
}
