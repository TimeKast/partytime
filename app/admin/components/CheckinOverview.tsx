'use client'

import styles from '../admin.module.css'
import { checkinPortalUrl, checkinReadiness, type CheckinStatus } from './CheckinStatus'
import { ExternalLink, Settings } from './ui/icons'

interface CheckinOverviewProps {
  eventSlug: string
  status: CheckinStatus | null
  loading: boolean
  error?: string
  arrived: number
  totalSeats: number
  onConfigure?: () => void
}

export default function CheckinOverview({
  eventSlug,
  status,
  loading,
  error,
  arrived,
  totalSeats,
  onConfigure,
}: CheckinOverviewProps) {
  const readiness = checkinReadiness(status, loading)
  const boundedArrived = Math.max(0, Math.min(arrived, totalSeats))
  const progress = totalSeats > 0 ? Math.min(100, Math.round((boundedArrived / totalSeats) * 100)) : 0

  return (
    <section className={styles.checkinOverview} aria-labelledby="checkin-overview-title">
      <div className={styles.checkinOverviewHeader}>
        <div>
          <p className={styles.checkinOverviewEyebrow}>Operación de puerta</p>
          <h3 id="checkin-overview-title">Portal de check-in</h3>
        </div>
        <span className={styles.checkinOverviewStatus} data-tone={error ? 'danger' : readiness.tone}>
          {error ? 'No disponible' : readiness.label}
        </span>
      </div>

      <div className={styles.checkinOverviewBody}>
        <div className={styles.checkinOverviewProgress}>
          <div className={styles.checkinOverviewCount}>
            <span>Llegados</span>
            <strong>{arrived}</strong>
            <span>/ {totalSeats}</span>
          </div>
          {totalSeats > 0 ? (
            <div
              className={styles.checkinProgressTrack}
              role="progressbar"
              aria-label="Progreso de llegadas"
              aria-valuemin={0}
              aria-valuemax={totalSeats}
              aria-valuenow={boundedArrived}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : (
            <p className={styles.checkinOverviewEmpty}>Aún no hay invitados confirmados.</p>
          )}
        </div>

        <p className={styles.checkinOverviewDetail}>{error || readiness.detail}</p>
      </div>

      {(readiness.tone === 'success' || onConfigure) && (
        <div className={styles.checkinOverviewActions}>
          {readiness.tone === 'success' && (
            <a href={checkinPortalUrl(eventSlug)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} />
              Abrir portal
            </a>
          )}
          {onConfigure && (
            <button type="button" onClick={onConfigure}>
              <Settings size={16} />
              Configurar
            </button>
          )}
        </div>
      )}
    </section>
  )
}
