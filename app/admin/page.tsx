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
  const [emailTargetRsvps, setEmailTargetRsvps] = useState<RSVP[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Filtros para MOSTRAR en tabla
  const [displayFilterStatus, setDisplayFilterStatus] = useState<'all' | 'confirmed' | 'cancelled'>('all')
  const [displayFilterPlusOne, setDisplayFilterPlusOne] = useState<'all' | 'yes' | 'no'>('all')
  const [displayFilterEmail, setDisplayFilterEmail] = useState<'all' | 'sent' | 'not-sent'>('all')
  
  // Filtros para ENVIAR emails (default: solo confirmados sin email)
  const [emailFilterStatus, setEmailFilterStatus] = useState<'all' | 'confirmed' | 'cancelled'>('confirmed')
  const [emailFilterEmail, setEmailFilterEmail] = useState<'all' | 'sent' | 'not-sent'>('not-sent')
  
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
        
        // Ajustar filtro de email inteligentemente
        const notSentCount = data.rsvps.filter((r: RSVP) => !r.emailSent).length
        if (notSentCount > 0) {
          setEmailFilterEmail('not-sent') // Hay gente sin email, enviar a ellos
        } else {
          setEmailFilterEmail('all') // Todos tienen email, default a todos
        }
        
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

  // Filtrar RSVPs para MOSTRAR en tabla
  useEffect(() => {
    let filtered = [...rsvps]

    // Filtro por status
    if (displayFilterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === displayFilterStatus)
    }

    // Filtro por +1
    if (displayFilterPlusOne === 'yes') {
      filtered = filtered.filter(r => r.plusOne)
    } else if (displayFilterPlusOne === 'no') {
      filtered = filtered.filter(r => !r.plusOne)
    }

    // Filtro por email enviado
    if (displayFilterEmail === 'sent') {
      filtered = filtered.filter(r => r.emailSent)
    } else if (displayFilterEmail === 'not-sent') {
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
  }, [rsvps, displayFilterStatus, displayFilterPlusOne, displayFilterEmail, searchTerm])

  // Filtrar RSVPs para ENVIAR emails
  useEffect(() => {
    let filtered = [...rsvps]

    // Filtro por status
    if (emailFilterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === emailFilterStatus)
    }

    // Filtro por email enviado
    if (emailFilterEmail === 'sent') {
      filtered = filtered.filter(r => r.emailSent)
    } else if (emailFilterEmail === 'not-sent') {
      filtered = filtered.filter(r => !r.emailSent)
    }

    setEmailTargetRsvps(filtered)
  }, [rsvps, emailFilterStatus, emailFilterEmail])

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
    const count = emailTargetRsvps.length
    if (count === 0) {
      setMessage('❌ No hay RSVPs para enviar')
      return
    }

    const notSentCount = emailTargetRsvps.filter(r => !r.emailSent).length
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
      
      // Enviar lista de IDs específicos de los RSVPs filtrados para email
      const response = await fetch('/api/admin/send-bulk-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify({
          rsvpIds: emailTargetRsvps.map(r => r.id)
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
  const confirmedRsvps = rsvps.filter(r => r.status === 'confirmed')
  const stats = {
    total: rsvps.length,
    confirmed: confirmedRsvps.length,
    cancelled: rsvps.filter(r => r.status === 'cancelled').length,
    plusOne: confirmedRsvps.filter(r => r.plusOne).length, // Solo +1 confirmados
    totalGuests: confirmedRsvps.length + confirmedRsvps.filter(r => r.plusOne).length,
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
          <h3>{stats.totalGuests}</h3>
          <p>👥 Invitados</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.total}</h3>
          <p>📋 RSVPs</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.confirmed}</h3>
          <p>✅ Confirmados</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.plusOne}</h3>
          <p>➕ Con +1</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.cancelled}</h3>
          <p>❌ Cancelados</p>
        </div>
        <div className={styles.statCard}>
          <h3>{stats.emailsSent}</h3>
          <p>✉️ Emails</p>
        </div>
      </div>

      {/* Controles */}
      <div className={styles.controls}>
        <div className={styles.filterSection}>
          <h3>🔍 Filtros de Visualización</h3>
          <div className={styles.filterRow}>
            <input
              type="text"
              placeholder="Buscar por nombre, email o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />

            <select value={displayFilterStatus} onChange={(e) => setDisplayFilterStatus(e.target.value as any)}>
              <option value="all">Todos los estados</option>
              <option value="confirmed">✅ Confirmados</option>
              <option value="cancelled">❌ Cancelados</option>
            </select>

            <select value={displayFilterPlusOne} onChange={(e) => setDisplayFilterPlusOne(e.target.value as any)}>
              <option value="all">Todos</option>
              <option value="yes">👥 Con +1</option>
              <option value="no">👤 Sin +1</option>
            </select>

            <select value={displayFilterEmail} onChange={(e) => setDisplayFilterEmail(e.target.value as any)}>
              <option value="all">Todos los emails</option>
              <option value="sent">✉️ Email enviado</option>
              <option value="not-sent">📭 Sin email</option>
            </select>
          </div>
        </div>

        <div className={styles.filterSection}>
          <h3>📧 Envío de Emails</h3>
          <div className={styles.filterRow}>
            <select value={emailFilterStatus} onChange={(e) => setEmailFilterStatus(e.target.value as any)}>
              <option value="all">Todos los estados</option>
              <option value="confirmed">✅ Confirmados</option>
              <option value="cancelled">❌ Cancelados</option>
            </select>

            <select value={emailFilterEmail} onChange={(e) => setEmailFilterEmail(e.target.value as any)} className={styles.emailFilter}>
              <option value="all">Todos</option>
              <option value="sent">✉️ Ya enviados</option>
              <option value="not-sent">📭 Sin enviar</option>
            </select>

            <button
              onClick={sendBulkEmails}
              disabled={loading || emailTargetRsvps.length === 0}
              className={styles.bulkBtn}
            >
              📧 Enviar Emails ({emailTargetRsvps.length})
            </button>
          </div>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      {/* Tabla de RSVPs Confirmados */}
      {filteredRsvps.filter(r => r.status === 'confirmed').length > 0 && (
        <div className={styles.tableContainer}>
          <h2 className={styles.sectionTitle}>✅ Confirmados ({filteredRsvps.filter(r => r.status === 'confirmed').length})</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Acciones</th>
                <th>Email Enviado</th>
                <th>Nombre</th>
                <th>+1</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Fecha Registro</th>
              </tr>
            </thead>
            <tbody>
              {filteredRsvps.filter(r => r.status === 'confirmed').map((rsvp) => (
                <tr key={rsvp.id} className={styles.rsvpRow}>
                  <td className={styles.actionCell}>
                    <button
                      onClick={() => sendEmail(rsvp)}
                      disabled={loading}
                      className={styles.sendBtn}
                    >
                      📧
                    </button>
                  </td>
                  <td className={styles.nameCell}>{rsvp.name}</td>
                  <td className={styles.plusOneCell}>
                    {rsvp.plusOne && <span className={styles.plusOneBadge}>👥 +1</span>}
                  </td>
                  <td className={styles.emailCell}>
                    <a href={`mailto:${rsvp.email}`}>{rsvp.email}</a>
                  </td>
                  <td className={styles.phoneCell}>
                    <a href={`tel:${rsvp.phone}`}>{rsvp.phone}</a>
                  </td>
                  <td className={styles.dateCell}>
                    Registro: {new Date(rsvp.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className={styles.emailSentCell}>
                    {rsvp.emailSent ? (
                      <>Mail: {new Date(rsvp.emailSent).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</>
                    ) : (
                      <>Mail: No enviado</>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla de RSVPs Cancelados */}
      {filteredRsvps.filter(r => r.status === 'cancelled').length > 0 && (
        <div className={styles.tableContainer}>
          <h2 className={styles.sectionTitle}>❌ Cancelados ({filteredRsvps.filter(r => r.status === 'cancelled').length})</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Acciones</th>
                <th>Email Enviado</th>
                <th>Nombre</th>
                <th>+1</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Fecha Registro</th>
              </tr>
            </thead>
            <tbody>
              {filteredRsvps.filter(r => r.status === 'cancelled').map((rsvp) => (
                <tr key={rsvp.id} className={styles.rsvpRow}>
                  <td className={styles.actionCell}>
                    <button
                      onClick={() => sendEmail(rsvp)}
                      disabled={loading}
                      className={styles.sendBtn}
                    >
                      📧
                    </button>
                  </td>
                  <td className={styles.nameCell}>{rsvp.name}</td>
                  <td className={styles.plusOneCell}>
                    {rsvp.plusOne && <span className={styles.plusOneBadge}>👥 +1</span>}
                  </td>
                  <td className={styles.emailCell}>
                    <a href={`mailto:${rsvp.email}`}>{rsvp.email}</a>
                  </td>
                  <td className={styles.phoneCell}>
                    <a href={`tel:${rsvp.phone}`}>{rsvp.phone}</a>
                  </td>
                  <td className={styles.dateCell}>
                    Registro: {new Date(rsvp.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className={styles.emailSentCell}>
                    {rsvp.emailSent ? (
                      <>Mail: {new Date(rsvp.emailSent).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</>
                    ) : (
                      <>Mail: No enviado</>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredRsvps.length === 0 && (
        <div className={styles.tableContainer}>
          <p className={styles.noData}>No hay RSVPs que coincidan con los filtros</p>
        </div>
      )}
    </div>
  )
}
