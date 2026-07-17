'use client'

import styles from '../../admin.module.css'
import { FileText, Search, Sheet } from '../ui/icons'

type StatusFilter = 'all' | 'confirmed' | 'cancelled'
type PlusOneFilter = 'all' | 'yes' | 'no'
type EmailFilter = 'all' | 'sent' | 'not-sent'

interface RsvpFiltersProps {
  searchTerm: string
  onSearchTermChange: (value: string) => void
  displayFilterStatus: StatusFilter
  onDisplayFilterStatusChange: (value: StatusFilter) => void
  displayFilterPlusOne: PlusOneFilter
  onDisplayFilterPlusOneChange: (value: PlusOneFilter) => void
  displayFilterEmail: EmailFilter
  onDisplayFilterEmailChange: (value: EmailFilter) => void
  onExportPdf: () => void
  onExportExcel: () => void
  exportDisabled: boolean
  isReadOnly: boolean
  emailFilterStatus: StatusFilter
  onEmailFilterStatusChange: (value: StatusFilter) => void
  emailFilterEmail: EmailFilter
  onEmailFilterEmailChange: (value: EmailFilter) => void
  onSendBulkEmails: () => void
  bulkCount: number
  bulkDisabled: boolean
  eventPast: boolean
}

export function RsvpFilters({
  searchTerm,
  onSearchTermChange,
  displayFilterStatus,
  onDisplayFilterStatusChange,
  displayFilterPlusOne,
  onDisplayFilterPlusOneChange,
  displayFilterEmail,
  onDisplayFilterEmailChange,
  onExportPdf,
  onExportExcel,
  exportDisabled,
  isReadOnly,
  emailFilterStatus,
  onEmailFilterStatusChange,
  emailFilterEmail,
  onEmailFilterEmailChange,
  onSendBulkEmails,
  bulkCount,
  bulkDisabled,
  eventPast,
}: RsvpFiltersProps) {
  return (
    <div className={styles.controls}>
      <div className={styles.filterSection}>
        <h3>Filtros de visualización</h3>
        <div className={styles.filterRow}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Buscar por nombre, email o teléfono..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className={styles.searchInput}
              aria-label="Buscar invitados"
              style={{ paddingLeft: 32, width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <select aria-label="Filtrar por estado" value={displayFilterStatus} onChange={(e) => onDisplayFilterStatusChange(e.target.value as StatusFilter)}>
            <option value="all">Todos los estados</option>
            <option value="confirmed">Confirmados</option>
            <option value="cancelled">Cancelados</option>
          </select>

          <select aria-label="Filtrar por acompañante" value={displayFilterPlusOne} onChange={(e) => onDisplayFilterPlusOneChange(e.target.value as PlusOneFilter)}>
            <option value="all">Todos</option>
            <option value="yes">Con +1</option>
            <option value="no">Sin +1</option>
          </select>

          <select aria-label="Filtrar por email enviado" value={displayFilterEmail} onChange={(e) => onDisplayFilterEmailChange(e.target.value as EmailFilter)}>
            <option value="all">Todos los emails</option>
            <option value="sent">Email enviado</option>
            <option value="not-sent">Sin email</option>
          </select>

          <button
            onClick={onExportPdf}
            disabled={exportDisabled}
            className={styles.exportBtn}
            title="Exportar lista de invitados en PDF"
          >
            <FileText size={14} /> PDF
          </button>
          <button
            onClick={onExportExcel}
            disabled={exportDisabled}
            className={styles.exportBtn}
            title="Exportar lista de invitados en Excel"
            style={{ background: 'linear-gradient(135deg, #217346 0%, #185c36 100%)' }}
          >
            <Sheet size={14} /> Excel
          </button>
        </div>
      </div>

      {!isReadOnly && (
        <div className={styles.filterSection}>
          <h3>Envío de emails</h3>
          <div className={styles.filterRow}>
            <select aria-label="Estado para envío de emails" value={emailFilterStatus} onChange={(e) => onEmailFilterStatusChange(e.target.value as StatusFilter)}>
              <option value="all">Todos los estados</option>
              <option value="confirmed">Confirmados</option>
              <option value="cancelled">Cancelados</option>
            </select>

            <select
              value={emailFilterEmail}
              onChange={(e) => onEmailFilterEmailChange(e.target.value as EmailFilter)}
              className={styles.emailFilter}
              aria-label="Estado de envío de emails"
            >
              <option value="all">Todos</option>
              <option value="sent">Ya enviados</option>
              <option value="not-sent">Sin enviar</option>
            </select>

            <button
              onClick={onSendBulkEmails}
              disabled={bulkDisabled}
              className={styles.bulkBtn}
              title={eventPast ? 'No se pueden enviar emails - evento pasado' : undefined}
              style={eventPast ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              Enviar Emails ({eventPast ? 'Evento pasado' : bulkCount})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
