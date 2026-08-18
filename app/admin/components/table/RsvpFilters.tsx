'use client'

import styles from '../../admin.module.css'
import {
  rsvpSortLabels,
  type RsvpEmailFilter,
  type RsvpPageSize,
  type RsvpPlusOneFilter,
  type RsvpSort,
  type RsvpStatusFilter,
} from '@/lib/rsvp-list'
import { FileText, Search, Sheet } from '../ui/icons'

interface RsvpFiltersProps {
  searchTerm: string
  onSearchTermChange: (value: string) => void
  displayFilterStatus: RsvpStatusFilter
  onDisplayFilterStatusChange: (value: RsvpStatusFilter) => void
  displayFilterPlusOne: RsvpPlusOneFilter
  onDisplayFilterPlusOneChange: (value: RsvpPlusOneFilter) => void
  displayFilterEmail: RsvpEmailFilter
  onDisplayFilterEmailChange: (value: RsvpEmailFilter) => void
  sort: RsvpSort
  onSortChange: (value: RsvpSort) => void
  pageSize: RsvpPageSize
  onPageSizeChange: (value: RsvpPageSize) => void
  page: number
  pageCount: number
  rangeStart: number
  rangeEnd: number
  resultCount: number
  onPreviousPage: () => void
  onNextPage: () => void
  onExportPdf: () => void
  onExportExcel: () => void
  exportDisabled: boolean
  isReadOnly: boolean
  emailFilterStatus: RsvpStatusFilter
  onEmailFilterStatusChange: (value: RsvpStatusFilter) => void
  emailFilterEmail: RsvpEmailFilter
  onEmailFilterEmailChange: (value: RsvpEmailFilter) => void
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
  sort,
  onSortChange,
  pageSize,
  onPageSizeChange,
  page,
  pageCount,
  rangeStart,
  rangeEnd,
  resultCount,
  onPreviousPage,
  onNextPage,
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

          <select aria-label="Filtrar por estado" value={displayFilterStatus} onChange={(e) => onDisplayFilterStatusChange(e.target.value as RsvpStatusFilter)}>
            <option value="all">Todos los estados</option>
            <option value="confirmed">Confirmados</option>
            <option value="cancelled">Cancelados</option>
          </select>

          <select aria-label="Filtrar por acompañante" value={displayFilterPlusOne} onChange={(e) => onDisplayFilterPlusOneChange(e.target.value as RsvpPlusOneFilter)}>
            <option value="all">Todos</option>
            <option value="yes">Con +1</option>
            <option value="no">Sin +1</option>
          </select>

          <select aria-label="Filtrar por email enviado" value={displayFilterEmail} onChange={(e) => onDisplayFilterEmailChange(e.target.value as RsvpEmailFilter)}>
            <option value="all">Todos los emails</option>
            <option value="sent">Email enviado</option>
            <option value="not-sent">Sin email</option>
          </select>

          <select aria-label="Ordenar invitados" value={sort} onChange={(e) => onSortChange(e.target.value as RsvpSort)}>
            {Object.entries(rsvpSortLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            aria-label="Resultados por página"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as RsvpPageSize)}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>{size} por página</option>
            ))}
          </select>

          <button
            onClick={onExportPdf}
            disabled={exportDisabled}
            className={styles.exportBtn}
            title="Exportar todos los resultados filtrados en PDF"
          >
            <FileText size={14} /> PDF
          </button>
          <button
            onClick={onExportExcel}
            disabled={exportDisabled}
            className={styles.exportBtn}
            title="Exportar todos los resultados filtrados en Excel"
            style={{ background: 'linear-gradient(135deg, #217346 0%, #185c36 100%)' }}
          >
            <Sheet size={14} /> Excel
          </button>
        </div>
        <div className={styles.paginationBar} aria-label="Paginación de invitados">
          <p className={styles.paginationSummary} aria-live="polite">
            {resultCount === 0
              ? '0 resultados'
              : `${rangeStart}–${rangeEnd} de ${resultCount} resultados`}
            {' · '}Página {page} de {pageCount}
          </p>
          <div className={styles.paginationActions}>
            <button
              type="button"
              className={styles.paginationBtn}
              onClick={onPreviousPage}
              disabled={page <= 1}
              aria-label="Ir a la página anterior"
            >
              Anterior
            </button>
            <button
              type="button"
              className={styles.paginationBtn}
              onClick={onNextPage}
              disabled={page >= pageCount}
              aria-label="Ir a la página siguiente"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {!isReadOnly && (
        <div className={styles.filterSection}>
          <h3>Envío de emails</h3>
          <div className={styles.filterRow}>
            <select aria-label="Estado para envío de emails" value={emailFilterStatus} onChange={(e) => onEmailFilterStatusChange(e.target.value as RsvpStatusFilter)}>
              <option value="all">Todos los estados</option>
              <option value="confirmed">Confirmados</option>
              <option value="cancelled">Cancelados</option>
            </select>

            <select
              value={emailFilterEmail}
              onChange={(e) => onEmailFilterEmailChange(e.target.value as RsvpEmailFilter)}
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
