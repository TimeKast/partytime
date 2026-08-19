'use client'

import * as React from 'react'
import type { LedgerSummaryData } from './LedgerTab'
import { formatCents } from './money'
import { CheckCircle } from '../ui/icons'
import styles from './LedgerSummary.module.css'

interface LedgerSummaryProps {
  summary: LedgerSummaryData | null
  loading: boolean
  error: string
  errorCode: string | null
  /** ISSUE-027 — la card de Ingresos Stripe enlaza a StripePanel (opcional para no romper a los consumidores previos a este issue). */
  onOpenStripePanel?: () => void
}

/**
 * ISSUE-026 — cards de totales + saldos por participante, consumidos tal
 * cual del summary (ISSUE-024). Nunca calcula montos localmente (PLAN
 * §2.4): todo lo que se pinta viene de `summary`. La card de Ingresos
 * Stripe enlaza a StripePanel (ISSUE-027) y su subtítulo refleja el modo;
 * la sección Stripe con presentación específica por modo vive en
 * StripePanel, no aquí.
 */
export default function LedgerSummary({ summary, loading, error, errorCode, onOpenStripePanel }: LedgerSummaryProps) {
  if (loading) {
    return <p className={styles.status}>Cargando saldos…</p>
  }

  // PLAN §2.4 / ISSUE-026: un LEDGER_INVARIANT nunca debe pintar saldos
  // parciales — estado de error dedicado, sin acceso a `summary` (que
  // además viene null en este caso porque loadSummary lo limpia).
  if (errorCode === 'LEDGER_INVARIANT') {
    return (
      <section className={styles.summary} aria-labelledby="ledger-summary-title">
        <h3 id="ledger-summary-title" className={styles.sectionTitle}>Resumen financiero</h3>
        <p className={styles.errorInvariant} role="alert">
          Los datos no cuadran, revisa los movimientos.
        </p>
      </section>
    )
  }

  if (error || !summary) {
    return (
      <section className={styles.summary} aria-labelledby="ledger-summary-title">
        <h3 id="ledger-summary-title" className={styles.sectionTitle}>Resumen financiero</h3>
        <p className={styles.errorStatus} role="alert">
          {error || 'No se pudo cargar el resumen financiero.'}
        </p>
      </section>
    )
  }

  const currency = summary.currency ?? 'MXN'

  return (
    <section className={styles.summary} aria-labelledby="ledger-summary-title">
      <h3 id="ledger-summary-title" className={styles.sectionTitle}>Resumen financiero</h3>

      <div className={styles.cards}>
        <div className={styles.card}>
          <p className={styles.cardValue}>{formatCents(summary.totals.expensesCents, currency)}</p>
          <p className={styles.cardLabel}>Gastos</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardValue}>{formatCents(summary.totals.manualIncomeCents, currency)}</p>
          <p className={styles.cardLabel}>Ingresos manuales</p>
        </div>
        <button
          type="button"
          className={`${styles.card} ${styles.cardLink}`}
          onClick={() => onOpenStripePanel?.()}
        >
          <p className={styles.cardValue}>{formatCents(summary.totals.stripePaidCents, currency)}</p>
          <p className={styles.cardLabel}>Ingresos Stripe</p>
          <p className={styles.cardSubtitle}>
            {summary.stripeMode === 'fund' ? 'Fondo del evento' : 'Entra a las cuentas'}
          </p>
        </button>
        <div className={styles.card}>
          <p className={styles.cardValue}>{formatCents(summary.totals.netCents, currency)}</p>
          <p className={styles.cardLabel}>Neto</p>
        </div>
      </div>

      {summary.settled && summary.balances.length > 0 && (
        <p className={styles.settledBanner}>
          <CheckCircle size={16} />
          Todo saldado ✓
        </p>
      )}

      {summary.balances.length === 0 ? (
        <p className={styles.emptyState}>Aún no hay saldos que mostrar.</p>
      ) : (
        <ul className={styles.balancesList}>
          {summary.balances.map((balance) => {
            const tone = balance.balanceCents > 0 ? 'positive' : balance.balanceCents < 0 ? 'negative' : 'zero'
            const label = balance.balanceCents > 0
              ? `Le deben ${formatCents(balance.balanceCents, currency)}`
              : balance.balanceCents < 0
                ? `Debe ${formatCents(-balance.balanceCents, currency)}`
                : 'Saldado'
            return (
              <li key={balance.participantId} className={styles.balanceRow} data-inactive={!balance.isActive}>
                <span className={styles.balanceName}>
                  {balance.name}
                  {balance.kind === 'stripe' && <span className={styles.badge}>Stripe</span>}
                  {!balance.isActive && <span className={styles.badge} data-tone="neutral">Inactivo</span>}
                </span>
                <span className={styles.balanceAmount} data-tone={tone}>{label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
