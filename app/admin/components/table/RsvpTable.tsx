'use client'

import styles from '../../admin.module.css'
import type { RSVP } from '../index'
import { CheckCircle, Mail, MessageCircle, Phone, Pencil, XCircle } from '../ui/icons'

interface RsvpTableProps {
  variant: 'confirmed' | 'cancelled'
  rsvps: RSVP[]
  totalCount: number
  isReadOnly: boolean
  loading: boolean
  isEventPast: boolean
  highlightedRsvpId: string | null
  onSendEmail: (rsvp: RSVP) => void
  onEdit: (rsvp: RSVP) => void
  onToggleStatus: (rsvp: RSVP) => void
}

export function RsvpTable({
  variant,
  rsvps,
  totalCount,
  isReadOnly,
  loading,
  isEventPast,
  highlightedRsvpId,
  onSendEmail,
  onEdit,
  onToggleStatus,
}: RsvpTableProps) {
  if (totalCount === 0) return null

  const isConfirmed = variant === 'confirmed'
  const title = isConfirmed ? `Confirmados (${totalCount})` : `Cancelados (${totalCount})`
  const sendTitle = isConfirmed ? 'Enviar email' : 'Enviar email de re-invitación'
  const toggleTitle = isConfirmed ? 'Cancelar asistencia' : 'Reconfirmar asistencia'
  const ToggleIcon = isConfirmed ? XCircle : CheckCircle
  const titleId = `rsvp-${variant}-title`

  return (
    <div className={styles.tableContainer}>
      <h2 id={titleId} className={styles.sectionTitle}>{title}</h2>
      {rsvps.length === 0 ? (
        <p className={styles.emptyPageSection}>No hay {isConfirmed ? 'confirmados' : 'cancelados'} en esta página.</p>
      ) : (
      <table className={styles.table} aria-labelledby={titleId}>
        <thead>
          <tr>
            {!isReadOnly && <th scope="col">Acciones</th>}
            <th scope="col">Email Enviado</th>
            <th scope="col">Nombre</th>
            <th scope="col">Email</th>
            <th scope="col">Teléfono</th>
            <th scope="col">Fecha Registro</th>
          </tr>
        </thead>
        <tbody>
          {rsvps.map((rsvp) => (
            <tr
              key={rsvp.id}
              id={`rsvp-guest-${rsvp.id}`}
              className={styles.rsvpRow}
              data-read-only={isReadOnly ? 'true' : undefined}
              data-highlighted={highlightedRsvpId === rsvp.id ? 'true' : undefined}
              tabIndex={-1}
            >
              {!isReadOnly && (
                <td className={styles.actionCell}>
                  <div className={styles.actionCluster} role="group" aria-label={`Acciones para ${rsvp.name}`}>
                    <button
                      onClick={() => onSendEmail(rsvp)}
                      disabled={loading || isEventPast}
                      className={`${styles.actionButton} ${styles.sendBtn}`}
                      title={isEventPast ? 'No se pueden enviar emails - evento pasado' : sendTitle}
                      aria-label={`${sendTitle} a ${rsvp.name}`}
                    >
                      <Mail size={16} />
                    </button>
                    <button
                      onClick={() => onEdit(rsvp)}
                      disabled={loading}
                      className={`${styles.actionButton} ${styles.editBtn}`}
                      title="Editar datos"
                      aria-label={`Editar datos de ${rsvp.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => onToggleStatus(rsvp)}
                      disabled={loading}
                      className={`${styles.actionButton} ${styles.toggleBtn}`}
                      title={toggleTitle}
                      aria-label={`${toggleTitle} de ${rsvp.name}`}
                    >
                      <ToggleIcon size={16} />
                    </button>
                  </div>
                </td>
              )}
              <td className={styles.emailSentCell}>
                {rsvp.emailSent ? (
                  <>Mail: {new Date(rsvp.emailSent).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</>
                ) : (
                  <>Mail: No enviado</>
                )}
              </td>
              <td className={styles.nameCell}>
                {rsvp.name}
                {rsvp.plusOne && (
                  <>
                    <span className={styles.plusOneBadge}>+1</span>
                    {rsvp.plusOneName && <span style={{ color: '#a78bfa', fontSize: '0.85em', marginLeft: '4px' }}>({rsvp.plusOneName})</span>}
                  </>
                )}
              </td>
              <td className={styles.emailCell}>
                <a href={`mailto:${rsvp.email}`}>{rsvp.email}</a>
              </td>
              <td className={styles.phoneCell}>
                <span className={styles.phoneNumber}>{rsvp.phone}</span>
                <a href={`tel:${rsvp.phone}`} className={styles.phoneBtn} title="Llamar" aria-label={`Llamar a ${rsvp.name}`}><Phone size={14} /></a>
                <a href={`https://wa.me/${rsvp.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className={styles.phoneBtn} title="WhatsApp" aria-label={`Abrir WhatsApp para ${rsvp.name}`}><MessageCircle size={14} /></a>
              </td>
              <td className={styles.dateCell}>
                Registro: {new Date(rsvp.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  )
}
