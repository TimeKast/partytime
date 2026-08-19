'use client'

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  LedgerParticipant,
  LedgerSettlement,
  LedgerSummaryData,
  LedgerTransaction,
} from './LedgerTab'
import { SettlementForm } from './SettlementsPanel'
import TransactionForm from './TransactionForm'
import { formatCents } from './money'
import { AlertTriangle } from '../ui/icons'
import styles from './StripePanel.module.css'

interface StripeConfig {
  stripeIsParticipant: boolean
  stripeIncomeRegisteredCents: number
}

interface StripePanelProps {
  eventId: string
  readOnly: boolean
  summary: LedgerSummaryData | null
  summaryLoading: boolean
  summaryError: string
  summaryErrorCode: string | null
  /** Participantes activos — para prellenar los selects de los forms de retiro/cobros. El nodo Stripe se resuelve desde `summary.stripe.participantId` (ISSUE-024), no se busca localmente. */
  activeParticipants: LedgerParticipant[]
  /** El toggle de modo (PATCH config) no mueve saldos por sí mismo, pero cambia cómo se presentan — se re-consulta el summary tras confirmarlo (PLAN §2.6c). */
  onModeChanged: () => void
  onTransactionSaved: (transaction: LedgerTransaction) => void
  onSettlementSaved: (settlement: LedgerSettlement) => void
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return typeof value === 'number' ? value : 0
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function isConfigDto(data: unknown): data is StripeConfig {
  return typeof data === 'object' && data !== null
    && typeof (data as Record<string, unknown>).stripeIsParticipant === 'boolean'
    && typeof (data as Record<string, unknown>).stripeIncomeRegisteredCents === 'number'
}

const DOUBLE_COUNT_WARNING = 'Ya hay ingresos registrados al nodo Stripe. '
  + 'Si cambias a modo fondo, esos ingresos siguen contando en los saldos de las personas '
  + 'Y el remanente usará todo lo cobrado por Stripe — puede parecer que el dinero se cuenta dos veces. '
  + '¿Cambiar de todas formas?'

/**
 * ISSUE-027 (EPIC-006, PLAN §2.6) — toda la UX de "el dinero de Stripe":
 * toggle de modo (con confirm de doble conteo, gotcha #9), mini-estado de
 * cuenta en modo fondo, saldo del nodo + "Registrar cobros Stripe" en modo
 * participante, y "Registrar retiro de Stripe" en ambos modos. Cero cálculo
 * local: todo número mostrado viene de `summary.stripe` / `summary.balances`
 * (ISSUE-024) o de `/api/admin/ledger/config` (ISSUE-024).
 */
export default function StripePanel({
  eventId,
  readOnly,
  summary,
  summaryLoading,
  summaryError,
  summaryErrorCode,
  activeParticipants,
  onModeChanged,
  onTransactionSaved,
  onSettlementSaved,
}: StripePanelProps) {
  const activeEventId = useRef(eventId)
  activeEventId.current = eventId

  const [config, setConfig] = useState<StripeConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState('')
  const [togglingMode, setTogglingMode] = useState(false)
  const [toggleError, setToggleError] = useState('')
  const [withdrawFormOpen, setWithdrawFormOpen] = useState(false)
  const [incomeFormOpen, setIncomeFormOpen] = useState(false)

  const loadConfig = useCallback(async () => {
    const requestEventId = eventId
    setConfigLoading(true)
    setConfigError('')
    try {
      const response = await fetch(`/api/admin/ledger/config?eventId=${encodeURIComponent(requestEventId)}`, { cache: 'no-store' })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo cargar la configuración de Stripe.'))
      if (activeEventId.current !== requestEventId) return
      if (isConfigDto(data)) {
        setConfig({ stripeIsParticipant: data.stripeIsParticipant, stripeIncomeRegisteredCents: data.stripeIncomeRegisteredCents })
      }
    } catch (loadError) {
      if (activeEventId.current !== requestEventId) return
      setConfigError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la configuración de Stripe.')
    } finally {
      if (activeEventId.current === requestEventId) setConfigLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    void loadConfig()
  }, [eventId, loadConfig])

  const currentMode: 'participant' | 'fund' | null = summary?.stripeMode
    ?? (config ? (config.stripeIsParticipant ? 'participant' : 'fund') : null)

  const stripe = summary?.stripe ?? {}
  const stripeParticipantId = summary ? stringField(stripe, 'participantId') : null
  const currency = summary?.currency ?? 'MXN'

  const applyModeChange = async (nextIsParticipant: boolean) => {
    setToggleError('')
    setTogglingMode(true)
    try {
      const response = await fetch('/api/admin/ledger/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, stripeIsParticipant: nextIsParticipant }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo actualizar el modo de Stripe.'))
      if (isConfigDto(data)) {
        setConfig({ stripeIsParticipant: data.stripeIsParticipant, stripeIncomeRegisteredCents: data.stripeIncomeRegisteredCents })
      }
      onModeChanged()
    } catch (toggleErr) {
      setToggleError(toggleErr instanceof Error ? toggleErr.message : 'No se pudo actualizar el modo de Stripe.')
    } finally {
      setTogglingMode(false)
    }
  }

  /**
   * Gotcha #9 (PLAN §2.6c) — el API no bloquea el cambio de modo con
   * ingresos ya registrados al nodo Stripe; la UI exige confirmación
   * explícita del posible doble conteo SOLO al entrar a modo fondo.
   */
  const handleModeSelect = (nextIsParticipant: boolean) => {
    if (readOnly || togglingMode || currentMode === null) return
    const nextMode = nextIsParticipant ? 'participant' : 'fund'
    if (currentMode === nextMode) return
    if (!nextIsParticipant && config && config.stripeIncomeRegisteredCents > 0) {
      if (!window.confirm(DOUBLE_COUNT_WARNING)) return
    }
    void applyModeChange(nextIsParticipant)
  }

  const stripeBalanceEntry = summary?.balances.find(balance => balance.participantId === stripeParticipantId) ?? null

  const stripeBalanceLabel = (() => {
    if (!stripeBalanceEntry) return null
    const cents = stripeBalanceEntry.balanceCents
    if (cents > 0) return `Le deben ${formatCents(cents, currency)}`
    if (cents < 0) return `Debe ${formatCents(-cents, currency)}`
    return 'Saldado'
  })()

  const unregisteredPaidCents = numberField(stripe, 'unregisteredPaidCents')
  const collectedCents = numberField(stripe, 'collectedCents')
  const contributionsCents = numberField(stripe, 'contributionsCents')
  const stripePaidExpensesCents = numberField(stripe, 'stripePaidExpensesCents')
  const withdrawnCents = numberField(stripe, 'withdrawnCents')
  const remainderCents = numberField(stripe, 'remainderCents')
  const pendingCents = numberField(stripe, 'pendingCents')

  const activePersons = activeParticipants.filter(participant => participant.kind === 'person')

  const showError = summaryErrorCode === 'LEDGER_INVARIANT' || (!summary && Boolean(summaryError))

  return (
    <div className={styles.panel}>
      {configError && <p className={styles.errorText} role="alert">{configError}</p>}

      <div className={styles.modeToggle} role="group" aria-label="Modo de Stripe">
        <button
          type="button"
          className={styles.modeOption}
          data-active={currentMode === 'participant'}
          disabled={readOnly || togglingMode || currentMode === null}
          onClick={() => handleModeSelect(true)}
        >
          Stripe cuenta como participante
        </button>
        <button
          type="button"
          className={styles.modeOption}
          data-active={currentMode === 'fund'}
          disabled={readOnly || togglingMode || currentMode === null}
          onClick={() => handleModeSelect(false)}
        >
          Stripe es fondo del evento
        </button>
      </div>
      <p className={styles.modeCopy}>
        {currentMode === 'participant'
          ? 'La cuenta es de alguien: todo lo cobrado por Stripe se reparte igual que cualquier otro ingreso.'
          : currentMode === 'fund'
            ? 'Stripe cubre gastos del evento; lo que sobra después de gastos y retiros es utilidad.'
            : 'Cargando modo…'}
      </p>
      {toggleError && <p className={styles.errorText} role="alert">{toggleError}</p>}

      {summaryLoading && <p className={styles.status}>Cargando información de Stripe…</p>}

      {!summaryLoading && showError && (
        <p className={styles.errorText} role="alert">
          {summaryErrorCode === 'LEDGER_INVARIANT'
            ? 'Los datos no cuadran, revisa los movimientos.'
            : (summaryError || 'No se pudo cargar la información de Stripe.')}
        </p>
      )}

      {!summaryLoading && !showError && summary && (
        <>
          {currentMode === 'fund' && (
            <dl className={styles.statement}>
              <div className={styles.statementRow}>
                <dt>Cobrado por Stripe</dt>
                <dd>{formatCents(collectedCents, currency)}</dd>
              </div>
              <div className={styles.statementRow}>
                <dt>Aportes al fondo</dt>
                <dd>{formatCents(contributionsCents, currency)}</dd>
              </div>
              <div className={styles.statementRow}>
                <dt>Gastos pagados por Stripe</dt>
                <dd>{formatCents(stripePaidExpensesCents, currency)}</dd>
              </div>
              <div className={styles.statementRow}>
                <dt>Retiros</dt>
                <dd>{formatCents(withdrawnCents, currency)}</dd>
              </div>
              <div className={styles.statementRow} data-emphasis="true">
                <dt>Remanente (utilidad)</dt>
                <dd data-tone={remainderCents < 0 ? 'negative' : 'positive'}>{formatCents(remainderCents, currency)}</dd>
              </div>
              {pendingCents !== 0 && (
                <p className={styles.pendingNote}>
                  {pendingCents < 0
                    ? `Retiros pendientes por ${formatCents(-pendingCents, currency)}`
                    : `Aportes pendientes por ${formatCents(pendingCents, currency)}`}
                </p>
              )}
            </dl>
          )}

          {currentMode === 'participant' && (
            <div className={styles.participantMode}>
              <p className={styles.participantBalance}>
                Saldo del nodo Stripe: {stripeBalanceLabel ?? 'Sin datos'}
              </p>
              <p className={styles.helperText}>Este dinero es del grupo — saldado cuando llegue a 0.</p>

              {unregisteredPaidCents > 0 && (
                <div className={styles.unregisteredNotice} role="status">
                  <AlertTriangle size={16} />
                  <span>Tienes {formatCents(unregisteredPaidCents, currency)} cobrados por Stripe sin registrar.</span>
                  {!readOnly && (
                    <button
                      type="button"
                      className={styles.primaryButtonSmall}
                      onClick={() => setIncomeFormOpen(true)}
                    >
                      Registrar cobros Stripe
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!readOnly && stripeParticipantId && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setWithdrawFormOpen(true)}
            >
              Registrar retiro de Stripe
            </button>
          )}
        </>
      )}

      {withdrawFormOpen && stripeParticipantId && (
        <SettlementForm
          eventId={eventId}
          participants={activeParticipants}
          existingCurrency={currency}
          formState={{ mode: 'create', prefill: { fromParticipantId: stripeParticipantId }, lockedFrom: stripeParticipantId }}
          onCancel={() => setWithdrawFormOpen(false)}
          onSaved={(settlement) => {
            onSettlementSaved(settlement)
            setWithdrawFormOpen(false)
          }}
        />
      )}

      {incomeFormOpen && stripeParticipantId && (
        <TransactionForm
          eventId={eventId}
          participants={activeParticipants}
          existingCurrency={currency}
          transaction={null}
          stripeMode={currentMode ?? 'participant'}
          stripeParticipantId={stripeParticipantId}
          prefill={{
            type: 'income',
            participantId: stripeParticipantId,
            amountCents: unregisteredPaidCents,
            splitParticipantIds: activePersons.map(participant => participant.id),
            description: 'Cobros de Stripe',
          }}
          onCancel={() => setIncomeFormOpen(false)}
          onSaved={(transaction) => {
            onTransactionSaved(transaction)
            setIncomeFormOpen(false)
          }}
        />
      )}
    </div>
  )
}
