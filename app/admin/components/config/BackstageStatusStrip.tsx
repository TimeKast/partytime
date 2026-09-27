import styles from './BackstageStatusStrip.module.css'
import { checkinReadiness, type CheckinStatus } from '../CheckinStatus'

interface BackstageStatusStripProps {
  rsvpClosed: boolean
  paymentRequired: boolean
  /** Migration 0013: the event's SAVED Stripe mode is 'test'. */
  paymentTestMode?: boolean
  priceAmount: number
  checkinStatus: CheckinStatus | null
  checkinLoading?: boolean
}

export function BackstageStatusStrip({
  rsvpClosed,
  paymentRequired,
  paymentTestMode = false,
  priceAmount,
  checkinStatus,
  checkinLoading = false,
}: BackstageStatusStripProps) {
  const checkin = checkinReadiness(checkinStatus, checkinLoading)

  return (
    <dl className={styles.strip} aria-label="Estado operativo del evento">
      <div className={styles.item}>
        <dt>RSVP</dt>
        <dd data-tone={rsvpClosed ? 'warning' : 'success'}>{rsvpClosed ? 'Cerrado' : 'Abierto'}</dd>
      </div>
      <div className={styles.item}>
        <dt>Cobro</dt>
        <dd data-tone={paymentRequired ? 'warning' : 'neutral'}>
          {paymentRequired
            ? `$${priceAmount} por persona${paymentTestMode ? ' · prueba' : ''}`
            : 'No requerido'}
        </dd>
      </div>
      <div className={styles.item}>
        <dt>Check-in</dt>
        <dd data-tone={checkin.tone}>{checkin.label}</dd>
      </div>
    </dl>
  )
}
