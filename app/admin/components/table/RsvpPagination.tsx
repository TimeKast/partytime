'use client'

import styles from '../../admin.module.css'

interface RsvpPaginationProps {
  position: 'top' | 'bottom'
  page: number
  pageCount: number
  rangeStart: number
  rangeEnd: number
  resultCount: number
  onPreviousPage: () => void
  onNextPage: () => void
}

export function RsvpPagination({
  position,
  page,
  pageCount,
  rangeStart,
  rangeEnd,
  resultCount,
  onPreviousPage,
  onNextPage,
}: RsvpPaginationProps) {
  const positionLabel = position === 'top' ? 'superior' : 'inferior'

  return (
    <nav
      className={`${styles.paginationBar} ${styles[`paginationBar_${position}`]}`}
      aria-label={`Paginación ${positionLabel} de invitados`}
      data-pagination-position={position}
    >
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
          aria-label={`Ir a la página anterior desde la paginación ${positionLabel}`}
        >
          Anterior
        </button>
        <button
          type="button"
          className={styles.paginationBtn}
          onClick={onNextPage}
          disabled={page >= pageCount}
          aria-label={`Ir a la página siguiente desde la paginación ${positionLabel}`}
        >
          Siguiente
        </button>
      </div>
    </nav>
  )
}
