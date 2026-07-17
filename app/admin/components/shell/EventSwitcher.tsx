'use client'

import type { Event } from '@/types/event'
import styles from './EventSwitcher.module.css'
import { ExternalLink, FolderCog } from '../ui/icons'

interface EventSwitcherProps {
  events: Event[]
  selectedEventId: string
  onSelectEvent: (slug: string) => void
  homeEventId: string
  isSuperAdmin: boolean
  onManageEvents: () => void
  collapsed?: boolean
}

export function EventSwitcher({
  events,
  selectedEventId,
  onSelectEvent,
  homeEventId,
  isSuperAdmin,
  onManageEvents,
  collapsed = false,
}: EventSwitcherProps) {
  return (
    <div className={`${styles.wrap} ${collapsed ? styles.collapsed : ''}`}>
      <select
        className={styles.select}
        value={selectedEventId}
        onChange={(e) => onSelectEvent(e.target.value)}
        aria-label="Evento seleccionado"
      >
        {events.length === 0 && <option value="">Cargando eventos...</option>}
        {events.map((evt) => (
          <option key={evt.id} value={evt.slug}>
            {evt.title} {evt.id === homeEventId && '(Inicio)'} {!evt.isActive && '(Inactivo)'}
          </option>
        ))}
      </select>
      <div className={styles.actions}>
        {isSuperAdmin && (
          <button type="button" className={styles.link} onClick={onManageEvents} title="Gestionar Eventos">
            <FolderCog size={14} /> Eventos
          </button>
        )}
        {selectedEventId && (
          <a
            className={styles.link}
            href={`/${selectedEventId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver invitación"
          >
            <ExternalLink size={14} /> Ver invitación
          </a>
        )}
      </div>
    </div>
  )
}
