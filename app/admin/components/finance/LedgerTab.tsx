'use client'

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SettingsDisclosure } from '../config/SettingsDisclosure'
import { Plus } from '../ui/icons'
import ParticipantsManager from './ParticipantsManager'
import TransactionList from './TransactionList'
import TransactionForm from './TransactionForm'
import LedgerSummary from './LedgerSummary'
import SettlementsPanel from './SettlementsPanel'
import StripePanel from './StripePanel'
import styles from './LedgerTab.module.css'

/**
 * ISSUE-025 (EPIC-006) — shapes mirror the DTO allowlists in
 * app/api/admin/ledger/participants/route.ts and .../transactions/route.ts
 * verbatim. Defined locally (not imported from lib/schema.ts) for the same
 * reason app/admin/components/index.ts keeps its own `RSVP` type: avoid
 * pulling the server-only DB client into the client bundle.
 */
export interface LedgerParticipant {
  id: string
  kind: 'person' | 'stripe'
  name: string
  email: string | null
  userId: string | null
  isActive: boolean
  createdAt: string
}

export interface LedgerTransactionShare {
  participantId: string
  shareCents: number
}

export interface LedgerTransaction {
  id: string
  type: 'expense' | 'income'
  participantId: string
  description: string
  amountCents: number
  currency: string
  occurredOn: string
  note: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  shares: LedgerTransactionShare[]
}

/** Mirrors app/api/admin/ledger/settlements/route.ts `settlementDto` verbatim (ISSUE-024). */
export interface LedgerSettlement {
  id: string
  fromParticipantId: string
  toParticipantId: string
  amountCents: number
  currency: string
  settledOn: string
  note: string | null
  createdBy: string
  createdAt: string
}

/**
 * ISSUE-026 — shapes mirror the summary route's JSON contract verbatim
 * (app/api/admin/ledger/summary/route.ts). `stripe` is intentionally typed
 * loosely (`Record<string, unknown>`): its exact per-mode shape is owned by
 * ISSUE-027 (the dedicated Stripe UX), never re-derived here — this issue
 * only reads the mode-agnostic fields (`totals`, `balances`,
 * `suggestedTransfers`, `settled`) per the P2a note.
 */
export interface LedgerBalanceEntry {
  participantId: string
  name: string
  kind: 'person' | 'stripe'
  balanceCents: number
  isActive: boolean
}

export interface LedgerSuggestedTransfer {
  fromParticipantId: string
  toParticipantId: string
  amountCents: number
  involvesStripe: 'from' | 'to' | null
}

export interface LedgerSummaryTotals {
  expensesCents: number
  manualIncomeCents: number
  stripePaidCents: number
  netCents: number
}

export interface LedgerSummaryData {
  currency: string | null
  stripeMode: 'participant' | 'fund'
  totals: LedgerSummaryTotals
  stripe: Record<string, unknown>
  balances: LedgerBalanceEntry[]
  suggestedTransfers: LedgerSuggestedTransfer[]
  settled: boolean
}

interface LedgerTabProps {
  eventId: string
  readOnly: boolean
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

type FormState = { mode: 'create' } | { mode: 'edit'; transaction: LedgerTransaction } | null

export default function LedgerTab({ eventId, readOnly }: LedgerTabProps) {
  const activeEventId = useRef(eventId)
  activeEventId.current = eventId

  const [participants, setParticipants] = useState<LedgerParticipant[]>([])
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formState, setFormState] = useState<FormState>(null)

  // ISSUE-026: saldos y settlements se cargan por separado de
  // participantes/movimientos (PLAN §2.4 — siempre del servidor, nunca
  // calculados localmente). Un fallo de summary (p.ej. LEDGER_INVARIANT) no
  // debe tumbar Participantes/Movimientos, por eso su loading/error vive
  // aparte del `loading`/`error` de arriba.
  const [summary, setSummary] = useState<LedgerSummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')
  const [summaryErrorCode, setSummaryErrorCode] = useState<string | null>(null)

  const [settlements, setSettlements] = useState<LedgerSettlement[]>([])
  const [settlementsLoading, setSettlementsLoading] = useState(true)
  const [settlementsError, setSettlementsError] = useState('')

  // ISSUE-027 — la card "Ingresos Stripe" de LedgerSummary fuerza abierto el
  // disclosure de StripePanel (SettingsDisclosure.revealKey), sin necesitar
  // estado propio de "open" acá.
  const [stripePanelRevealKey, setStripePanelRevealKey] = useState(0)

  const load = useCallback(async () => {
    const requestEventId = eventId
    setLoading(true)
    setError('')
    try {
      const [participantsRes, transactionsRes] = await Promise.all([
        fetch(`/api/admin/ledger/participants?eventId=${encodeURIComponent(requestEventId)}`, { cache: 'no-store' }),
        fetch(`/api/admin/ledger/transactions?eventId=${encodeURIComponent(requestEventId)}`, { cache: 'no-store' }),
      ])
      const participantsData: unknown = await participantsRes.json()
      const transactionsData: unknown = await transactionsRes.json()

      if (!participantsRes.ok) throw new Error(errorMessage(participantsData, 'No se pudieron cargar los participantes.'))
      if (!transactionsRes.ok) throw new Error(errorMessage(transactionsData, 'No se pudieron cargar los movimientos.'))

      if (activeEventId.current !== requestEventId) return
      const participantsList = typeof participantsData === 'object' && participantsData !== null && 'participants' in participantsData
        ? (participantsData as { participants: LedgerParticipant[] }).participants
        : []
      const transactionsList = typeof transactionsData === 'object' && transactionsData !== null && 'transactions' in transactionsData
        ? (transactionsData as { transactions: LedgerTransaction[] }).transactions
        : []
      setParticipants(participantsList)
      setTransactions(transactionsList)
    } catch (loadError) {
      if (activeEventId.current !== requestEventId) return
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la información financiera.')
    } finally {
      if (activeEventId.current === requestEventId) setLoading(false)
    }
  }, [eventId])

  /**
   * ISSUE-026 — refreshes the summary from the server. Called on mount and
   * after every mutation that can move balances (transactions, settlements):
   * saldos SIEMPRE vienen del servidor, la UI jamás los calcula localmente
   * (PLAN §2.4).
   */
  const loadSummary = useCallback(async () => {
    const requestEventId = eventId
    setSummaryLoading(true)
    setSummaryError('')
    setSummaryErrorCode(null)
    try {
      const response = await fetch(`/api/admin/ledger/summary?eventId=${encodeURIComponent(requestEventId)}`, { cache: 'no-store' })
      const data: unknown = await response.json()
      if (!response.ok) {
        if (activeEventId.current !== requestEventId) return
        const code = typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string'
          ? data.code
          : null
        setSummaryErrorCode(code)
        setSummaryError(errorMessage(data, 'No se pudo cargar el resumen financiero.'))
        setSummary(null)
        return
      }
      if (activeEventId.current !== requestEventId) return
      setSummary(data as LedgerSummaryData)
    } catch (loadError) {
      if (activeEventId.current !== requestEventId) return
      setSummaryError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el resumen financiero.')
      setSummary(null)
    } finally {
      if (activeEventId.current === requestEventId) setSummaryLoading(false)
    }
  }, [eventId])

  const loadSettlements = useCallback(async () => {
    const requestEventId = eventId
    setSettlementsLoading(true)
    setSettlementsError('')
    try {
      const response = await fetch(`/api/admin/ledger/settlements?eventId=${encodeURIComponent(requestEventId)}`, { cache: 'no-store' })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudieron cargar los settlements.'))
      if (activeEventId.current !== requestEventId) return
      const list = typeof data === 'object' && data !== null && 'settlements' in data
        ? (data as { settlements: LedgerSettlement[] }).settlements
        : []
      setSettlements(list)
    } catch (loadError) {
      if (activeEventId.current !== requestEventId) return
      setSettlementsError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los settlements.')
    } finally {
      if (activeEventId.current === requestEventId) setSettlementsLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    void load()
    void loadSummary()
    void loadSettlements()
  }, [eventId, load, loadSummary, loadSettlements])

  const handleParticipantSaved = useCallback((participant: LedgerParticipant) => {
    setParticipants(current => {
      const exists = current.some(item => item.id === participant.id)
      const next = exists
        ? current.map(item => (item.id === participant.id ? participant : item))
        : [...current, participant]
      return [...next].sort((a, b) => a.name.localeCompare(b.name, 'es-MX'))
    })
  }, [])

  const handleTransactionSaved = useCallback((transaction: LedgerTransaction) => {
    setTransactions(current => {
      const exists = current.some(item => item.id === transaction.id)
      const next = exists
        ? current.map(item => (item.id === transaction.id ? transaction : item))
        : [transaction, ...current]
      return [...next].sort((a, b) => {
        if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1
        return a.createdAt < b.createdAt ? 1 : -1
      })
    })
    setFormState(null)
    void loadSummary()
  }, [loadSummary])

  const handleTransactionDeleted = useCallback((transactionId: string) => {
    setTransactions(current => current.filter(item => item.id !== transactionId))
    void loadSummary()
  }, [loadSummary])

  /**
   * ISSUE-026 — settlements are reconciled locally (server returns the full
   * created/updated row, no need to refetch the whole list) but ALWAYS
   * trigger a summary refetch: balances are server-derived, never
   * recomputed client-side (PLAN §2.4).
   */
  const handleSettlementSaved = useCallback((settlement: LedgerSettlement) => {
    setSettlements(current => {
      const exists = current.some(item => item.id === settlement.id)
      const next = exists
        ? current.map(item => (item.id === settlement.id ? settlement : item))
        : [settlement, ...current]
      return [...next].sort((a, b) => {
        if (a.settledOn !== b.settledOn) return a.settledOn < b.settledOn ? 1 : -1
        return a.createdAt < b.createdAt ? 1 : -1
      })
    })
    void loadSummary()
  }, [loadSummary])

  const handleSettlementDeleted = useCallback((settlementId: string) => {
    setSettlements(current => current.filter(item => item.id !== settlementId))
    void loadSummary()
  }, [loadSummary])

  const activeParticipants = participants.filter(participant => participant.isActive)
  // ISSUE-027 — drives TransactionForm's fund-mode "cubierto por el evento" defaults for the general "Registrar movimiento" flow (PLAN §2.6b).
  const stripeParticipantId = participants.find(participant => participant.kind === 'stripe')?.id ?? null
  const stripeMode = summary?.stripeMode ?? 'participant'

  return (
    <section className={styles.ledgerTab} aria-labelledby="ledger-tab-title">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Contabilidad interna del evento</p>
          <h2 id="ledger-tab-title" className={styles.title}>Finanzas</h2>
          <p className={styles.description}>
            Registra quién adelantó gastos y quién recibió ingresos fuera de Stripe.
          </p>
        </div>
      </div>

      {loading && <p className={styles.status}>Cargando información financiera…</p>}
      {!loading && error && <p className={styles.errorStatus} role="alert">{error}</p>}

      {!loading && !error && (
        <>
          <LedgerSummary
            summary={summary}
            loading={summaryLoading}
            error={summaryError}
            errorCode={summaryErrorCode}
            onOpenStripePanel={() => setStripePanelRevealKey(key => key + 1)}
          />

          <SettlementsPanel
            eventId={eventId}
            participants={participants}
            activeParticipants={activeParticipants}
            settlements={settlements}
            settlementsLoading={settlementsLoading}
            settlementsError={settlementsError}
            summary={summary}
            summaryError={summaryError}
            summaryErrorCode={summaryErrorCode}
            readOnly={readOnly}
            onSettlementSaved={handleSettlementSaved}
            onSettlementDeleted={handleSettlementDeleted}
          />

          <SettingsDisclosure
            title="Stripe"
            summary={summary ? (summary.stripeMode === 'fund' ? 'Fondo del evento' : 'Cuenta como participante') : 'Cargando…'}
            defaultOpen
            revealKey={stripePanelRevealKey}
          >
            <StripePanel
              eventId={eventId}
              readOnly={readOnly}
              summary={summary}
              summaryLoading={summaryLoading}
              summaryError={summaryError}
              summaryErrorCode={summaryErrorCode}
              activeParticipants={activeParticipants}
              onModeChanged={loadSummary}
              onTransactionSaved={handleTransactionSaved}
              onSettlementSaved={handleSettlementSaved}
            />
          </SettingsDisclosure>

          <SettingsDisclosure
            title="Participantes"
            summary={`${participants.length} ${participants.length === 1 ? 'registrado' : 'registrados'}`}
            defaultOpen
          >
            <ParticipantsManager
              eventId={eventId}
              participants={participants}
              readOnly={readOnly}
              onParticipantSaved={handleParticipantSaved}
            />
          </SettingsDisclosure>

          <SettingsDisclosure
            title="Movimientos"
            summary={`${transactions.length} ${transactions.length === 1 ? 'movimiento' : 'movimientos'}`}
            defaultOpen
          >
            {!readOnly && (
              <button
                type="button"
                className={styles.addTransactionButton}
                onClick={() => setFormState({ mode: 'create' })}
                disabled={activeParticipants.length === 0}
              >
                <Plus size={16} />
                Registrar movimiento
              </button>
            )}
            {!readOnly && activeParticipants.length === 0 && (
              <p className={styles.helper}>Da de alta al menos un participante antes de registrar movimientos.</p>
            )}

            <TransactionList
              eventId={eventId}
              transactions={transactions}
              participants={participants}
              readOnly={readOnly}
              onEdit={(transaction) => setFormState({ mode: 'edit', transaction })}
              onDeleted={handleTransactionDeleted}
            />
          </SettingsDisclosure>

          {formState && (
            <TransactionForm
              eventId={eventId}
              participants={activeParticipants}
              existingCurrency={transactions[0]?.currency ?? null}
              transaction={formState.mode === 'edit' ? formState.transaction : null}
              stripeMode={stripeMode}
              stripeParticipantId={stripeParticipantId}
              onCancel={() => setFormState(null)}
              onSaved={handleTransactionSaved}
            />
          )}
        </>
      )}
    </section>
  )
}
