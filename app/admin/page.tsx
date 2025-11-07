'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
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
  
  // Estado para modal de edición
  const [editingRsvp, setEditingRsvp] = useState<RSVP | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    plusOne: false
  })

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
    const isCancelled = rsvp.status === 'cancelled'
    const isReminder = !isCancelled && !!rsvp.emailSent
    
    let messageType = 'email de confirmación'
    if (isCancelled) messageType = 'email de re-invitación'
    else if (isReminder) messageType = 'email recordatorio'
    
    // Confirmación antes de enviar
    const confirmed = window.confirm(
      `¿Estás seguro de enviar ${messageType} a ${rsvp.name} (${rsvp.email})?`
    )
    
    if (!confirmed) {
      return // Usuario canceló
    }
    
    setLoading(true)
    setMessage(`Enviando ${messageType}...`)
    
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
          emailSent: rsvp.emailSent,
          status: rsvp.status
        })
      })

      console.log('📬 Response status:', response.status)
      const data = await response.json()
      console.log('📬 Response data:', data)

      if (data.success) {
        setMessage(`✅ ${isCancelled ? 'Re-invitación' : (isReminder ? 'Recordatorio' : 'Email')} enviado a ${rsvp.name}`)
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

    // Contar por tipo de email
    const cancelledCount = emailTargetRsvps.filter(r => r.status === 'cancelled').length
    const notSentCount = emailTargetRsvps.filter(r => r.status === 'confirmed' && !r.emailSent).length
    const remindersCount = emailTargetRsvps.filter(r => r.status === 'confirmed' && r.emailSent).length
    
    // Mensaje de confirmación detallado
    let confirmParts = [`¿Enviar emails a ${count} personas?`]
    if (notSentCount > 0) confirmParts.push(`\n• ${notSentCount} confirmación${notSentCount > 1 ? 'es' : ''}`)
    if (remindersCount > 0) confirmParts.push(`\n• ${remindersCount} recordatorio${remindersCount > 1 ? 's' : ''}`)
    if (cancelledCount > 0) confirmParts.push(`\n• ${cancelledCount} re-invitación${cancelledCount > 1 ? 'es' : ''}`)
    
    if (!confirm(confirmParts.join(''))) {
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

  // Toggle status (confirmar/cancelar) sin enviar email
  const toggleStatus = async (rsvp: RSVP) => {
    const newStatus = rsvp.status === 'confirmed' ? 'cancelled' : 'confirmed'
    const action = newStatus === 'confirmed' ? 'reconfirmar' : 'cancelar'
    
    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} asistencia de ${rsvp.name}? (sin enviar email)`)) {
      return
    }

    setLoading(true)
    setMessage(`${action.charAt(0).toUpperCase() + action.slice(1)}ando...`)
    
    try {
      const authHeader = sessionStorage.getItem('admin_auth')
      
      const response = await fetch('/api/admin/update-rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify({
          rsvpId: rsvp.id,
          updates: { status: newStatus }
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`✅ ${rsvp.name} ${newStatus === 'confirmed' ? 'reconfirmado' : 'cancelado'}`)
        await loadRSVPs()
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Error al actualizar estado')
    } finally {
      setLoading(false)
    }
  }

  // Abrir modal de edición
  const openEditModal = (rsvp: RSVP) => {
    setEditingRsvp(rsvp)
    setEditForm({
      name: rsvp.name,
      email: rsvp.email,
      phone: rsvp.phone,
      plusOne: rsvp.plusOne
    })
  }

  // Cerrar modal de edición
  const closeEditModal = () => {
    setEditingRsvp(null)
    setEditForm({
      name: '',
      email: '',
      phone: '',
      plusOne: false
    })
  }

  // Guardar cambios de edición
  const saveEdit = async () => {
    if (!editingRsvp) return

    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.phone.trim()) {
      setMessage('❌ Nombre, email y teléfono son requeridos')
      return
    }

    if (!confirm(`¿Guardar cambios para ${editingRsvp.name}?`)) {
      return
    }

    setLoading(true)
    setMessage('Guardando cambios...')
    
    try {
      const authHeader = sessionStorage.getItem('admin_auth')
      
      const response = await fetch('/api/admin/update-rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify({
          rsvpId: editingRsvp.id,
          updates: editForm
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`✅ Datos actualizados para ${editForm.name}`)
        closeEditModal()
        await loadRSVPs()
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Error al guardar cambios')
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

  // Exportar lista informativa (elegante con todos los detalles)
  const exportInformativeList = () => {
    const doc = new jsPDF()
    const confirmedRsvps = rsvps.filter(r => r.status === 'confirmed')
    
    // Header elegante
    doc.setFillColor(102, 102, 234) // Color morado del tema
    doc.rect(0, 0, 210, 40, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.text(eventConfig.event.title, 105, 18, { align: 'center' })
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(eventConfig.event.subtitle, 105, 27, { align: 'center' })
    doc.text(`${eventConfig.event.date} - ${eventConfig.event.time}`, 105, 34, { align: 'center' })
    
    // Información del evento
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.text(eventConfig.event.location, 105, 48, { align: 'center' })
    
    // Stats
    const totalGuests = confirmedRsvps.length + confirmedRsvps.filter(r => r.plusOne).length
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`Lista de Invitados - ${confirmedRsvps.length} Confirmaciones - ${totalGuests} Personas`, 14, 60)
    
    // Tabla con datos
    const tableData = confirmedRsvps.map((rsvp, index) => [
      index + 1,
      rsvp.name,
      rsvp.email,
      rsvp.phone,
      rsvp.plusOne ? 'Sí (+1)' : 'No',
      rsvp.emailSent ? new Date(rsvp.emailSent).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : 'No enviado'
    ])
    
    autoTable(doc, {
      startY: 68,
      head: [['#', 'Nombre', 'Email', 'Teléfono', '+1', 'Email']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [102, 102, 234],
        textColor: 255,
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 4
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 40 },
        2: { cellWidth: 50 },
        3: { cellWidth: 35 },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'center', cellWidth: 25 }
      },
      alternateRowStyles: {
        fillColor: [245, 245, 250]
      }
    })
    
    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages()
    doc.setFontSize(8)
    doc.setTextColor(128, 128, 128)
    doc.text(
      `Generado el ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })} - Página ${pageCount}`,
      105,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    )
    
    // Nombre del archivo con subtitle normalizado (sin espacios ni caracteres especiales)
    const fileName = `lista-invitados-${eventConfig.event.subtitle.toLowerCase().replace(/\s+/g, '-')}.pdf`
    doc.save(fileName)
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

            <button
              onClick={exportInformativeList}
              disabled={stats.confirmed === 0}
              className={styles.exportBtn}
              title="Exportar lista de invitados en PDF"
            >
              📄 Exportar Lista
            </button>
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
                <th>Email</th>
                <th>Teléfono</th>
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
                      title="Enviar email"
                    >
                      📧
                    </button>
                    <button
                      onClick={() => openEditModal(rsvp)}
                      disabled={loading}
                      className={styles.editBtn}
                      title="Editar datos"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => toggleStatus(rsvp)}
                      disabled={loading}
                      className={styles.toggleBtn}
                      title="Cancelar asistencia"
                    >
                      ❌
                    </button>
                  </td>
                  <td className={styles.emailSentCell}>
                    {rsvp.emailSent ? (
                      <>Mail: {new Date(rsvp.emailSent).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</>
                    ) : (
                      <>Mail: No enviado</>
                    )}
                  </td>
                  <td className={styles.nameCell}>
                    {rsvp.name}
                    {rsvp.plusOne && <span className={styles.plusOneBadge}>+1</span>}
                  </td>
                  <td className={styles.emailCell}>
                    <a href={`mailto:${rsvp.email}`}>{rsvp.email}</a>
                  </td>
                  <td className={styles.phoneCell}>
                    <span className={styles.phoneNumber}>{rsvp.phone}</span>
                    <a href={`tel:${rsvp.phone}`} className={styles.phoneBtn} title="Llamar">📞</a>
                    <a href={`https://wa.me/${rsvp.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className={styles.phoneBtn} title="WhatsApp">💬</a>
                  </td>
                  <td className={styles.dateCell}>
                    Registro: {new Date(rsvp.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
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
                <th>Email</th>
                <th>Teléfono</th>
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
                      title="Enviar email de re-invitación"
                    >
                      📧
                    </button>
                    <button
                      onClick={() => openEditModal(rsvp)}
                      disabled={loading}
                      className={styles.editBtn}
                      title="Editar datos"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => toggleStatus(rsvp)}
                      disabled={loading}
                      className={styles.toggleBtn}
                      title="Reconfirmar asistencia"
                    >
                      ✅
                    </button>
                  </td>
                  <td className={styles.emailSentCell}>
                    {rsvp.emailSent ? (
                      <>Mail: {new Date(rsvp.emailSent).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</>
                    ) : (
                      <>Mail: No enviado</>
                    )}
                  </td>
                  <td className={styles.nameCell}>
                    {rsvp.name}
                    {rsvp.plusOne && <span className={styles.plusOneBadge}>+1</span>}
                  </td>
                  <td className={styles.emailCell}>
                    <a href={`mailto:${rsvp.email}`}>{rsvp.email}</a>
                  </td>
                  <td className={styles.phoneCell}>
                    <span className={styles.phoneNumber}>{rsvp.phone}</span>
                    <a href={`tel:${rsvp.phone}`} className={styles.phoneBtn} title="Llamar">📞</a>
                    <a href={`https://wa.me/${rsvp.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className={styles.phoneBtn} title="WhatsApp">💬</a>
                  </td>
                  <td className={styles.dateCell}>
                    Registro: {new Date(rsvp.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
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

      {editingRsvp && (
        <div className={styles.editModal} onClick={closeEditModal}>
          <div className={styles.editModalCard} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.editModalTitle}>Editar Confirmación</h2>
            <form className={styles.editForm} onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
              <div className={styles.editFormGroup}>
                <label className={styles.editFormLabel}>Nombre *</label>
                <input
                  type="text"
                  className={styles.editFormInput}
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  required
                />
              </div>
              <div className={styles.editFormGroup}>
                <label className={styles.editFormLabel}>Email *</label>
                <input
                  type="email"
                  className={styles.editFormInput}
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  required
                />
              </div>
              <div className={styles.editFormGroup}>
                <label className={styles.editFormLabel}>Teléfono *</label>
                <PhoneInput
                  defaultCountry="mx"
                  value={editForm.phone}
                  onChange={(phone) => setEditForm({...editForm, phone})}
                  className={styles.editFormPhoneInput}
                  inputClassName={styles.editFormPhoneInputField}
                  countrySelectorStyleProps={{
                    buttonClassName: styles.editFormCountrySelector
                  }}
                />
              </div>
              <div className={styles.editFormGroup}>
                <div className={styles.editFormCheckboxGroup}>
                  <input
                    type="checkbox"
                    id="editPlusOne"
                    className={styles.editFormCheckbox}
                    checked={editForm.plusOne}
                    onChange={(e) => setEditForm({...editForm, plusOne: e.target.checked})}
                  />
                  <label htmlFor="editPlusOne" className={styles.editFormLabel}>+1 Acompañante</label>
                </div>
              </div>
              <div className={styles.editFormButtons}>
                <button
                  type="button"
                  className={styles.editFormCancelBtn}
                  onClick={closeEditModal}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.editFormSaveBtn}
                  disabled={loading}
                >
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
