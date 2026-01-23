'use client'

import { useState } from 'react'

interface ReminderRsvp {
  id: string
  name: string
  email: string
  phone: string
  lastReminderSent: string | null
  reminderCount: number
}

interface ReminderStatusData {
  summary: {
    total: number
    confirmed: number
    withReminder: number
    pendingReminder: number
  }
  needsManualReminder: Array<{
    id: string
    name: string
    email: string
    phone: string
  }>
  alreadySentReminder: ReminderRsvp[]
}

export default function ReminderStatusSection({ eventSlug }: { eventSlug: string }) {
  const [data, setData] = useState<ReminderStatusData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  const loadReminderStatus = async () => {
    if (!eventSlug) return
    
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(`/api/admin/reminder-status?eventSlug=${encodeURIComponent(eventSlug)}`)
      const result = await response.json()
      
      if (result.success) {
        setData(result)
        setIsExpanded(true)
      } else {
        setError(result.error || 'Error al cargar estado')
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      marginTop: '25px',
      padding: '20px',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      borderRadius: '12px',
      border: '1px solid #bfdbfe'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: data ? '15px' : '0'
      }}>
        <h4 style={{ margin: 0, fontSize: '16px', color: '#1e40af' }}>
          📋 Estado de Recordatorios Enviados
        </h4>
        <button
          onClick={loadReminderStatus}
          disabled={loading}
          style={{
            padding: '8px 16px',
            background: loading ? '#94a3b8' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'wait' : 'pointer',
            fontWeight: '600',
            fontSize: '13px'
          }}
        >
          {loading ? '⏳ Cargando...' : '🔄 Ver Estado'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: '#fef2f2',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '14px',
          marginTop: '10px'
        }}>
          ❌ {error}
        </div>
      )}

      {data && isExpanded && (
        <div style={{ marginTop: '15px' }}>
          {/* Resumen */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '10px',
            marginBottom: '20px'
          }}>
            <div style={{
              padding: '12px',
              background: 'white',
              borderRadius: '8px',
              textAlign: 'center',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>
                {data.summary.confirmed}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Confirmados</div>
            </div>
            <div style={{
              padding: '12px',
              background: 'white',
              borderRadius: '8px',
              textAlign: 'center',
              border: '1px solid #22c55e'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>
                {data.summary.withReminder}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>✅ Con Recordatorio</div>
            </div>
            <div style={{
              padding: '12px',
              background: data.summary.pendingReminder > 0 ? '#fef3c7' : 'white',
              borderRadius: '8px',
              textAlign: 'center',
              border: `1px solid ${data.summary.pendingReminder > 0 ? '#f59e0b' : '#e2e8f0'}`
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: data.summary.pendingReminder > 0 ? '#f59e0b' : '#64748b' }}>
                {data.summary.pendingReminder}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>⚠️ Sin Recordatorio</div>
            </div>
          </div>

          {/* Lista de personas sin recordatorio */}
          {data.needsManualReminder.length > 0 && (
            <div style={{
              background: '#fef3c7',
              padding: '15px',
              borderRadius: '10px',
              marginBottom: '15px',
              border: '1px solid #fcd34d'
            }}>
              <h5 style={{ margin: '0 0 10px 0', color: '#92400e', fontSize: '14px' }}>
                ⚠️ Necesitan Recordatorio Manual ({data.needsManualReminder.length})
              </h5>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.5)' }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #fcd34d' }}>Nombre</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #fcd34d' }}>Email</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #fcd34d' }}>Teléfono</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.needsManualReminder.map((rsvp) => (
                      <tr key={rsvp.id} style={{ background: 'rgba(255,255,255,0.3)' }}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #fcd34d' }}>{rsvp.name}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #fcd34d' }}>
                          <a href={`mailto:${rsvp.email}`} style={{ color: '#92400e' }}>{rsvp.email}</a>
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #fcd34d' }}>
                          <a href={`tel:${rsvp.phone}`} style={{ color: '#92400e' }}>{rsvp.phone}</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lista de personas con recordatorio enviado */}
          {data.alreadySentReminder.length > 0 && (
            <div style={{
              background: '#dcfce7',
              padding: '15px',
              borderRadius: '10px',
              border: '1px solid #86efac'
            }}>
              <h5 style={{ margin: '0 0 10px 0', color: '#166534', fontSize: '14px' }}>
                ✅ Ya Recibieron Recordatorio ({data.alreadySentReminder.length})
              </h5>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.5)' }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #86efac' }}>Nombre</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #86efac' }}>Email</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #86efac' }}>Enviado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.alreadySentReminder.map((rsvp) => (
                      <tr key={rsvp.id} style={{ background: 'rgba(255,255,255,0.3)' }}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #86efac' }}>{rsvp.name}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #86efac' }}>{rsvp.email}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #86efac' }}>
                          {rsvp.lastReminderSent 
                            ? new Date(rsvp.lastReminderSent).toLocaleDateString('es-MX', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : '-'}
                          {rsvp.reminderCount > 1 && ` (${rsvp.reminderCount}x)`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.summary.confirmed === 0 && (
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px', fontStyle: 'italic' }}>
              No hay invitados confirmados para este evento.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
