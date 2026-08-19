'use client'

import * as React from 'react'
import { useMemo, useState, type FormEvent } from 'react'
import type { LedgerParticipant, LedgerSettlement, LedgerSuggestedTransfer, LedgerSummaryData } from './LedgerTab'
import { participantSelectLabel } from './ParticipantsManager'
import { formatCents, parseAmountToCents } from './money'
import { Plus } from '../ui/icons'
import styles from './SettlementsPanel.module.css'

// PLAN-EPIC-006.md §2.8: same whitelist enforced server-side
// (app/api/admin/ledger/settlements/route.ts LEDGER_CURRENCIES).
const LEDGER_CURRENCIES = ['MXN', 'USD'] as const
const NOTE_MAX_LENGTH = 500

interface SettlementsPanelProps {
  eventId: string
  /** Full roster (incluye inactivos y el nodo Stripe) — solo para resolver nombres en sugerencias/historial. */
  participants: LedgerParticipant[]
  /** Participantes seleccionables al dar de alta/editar un settlement. */
  activeParticipants: LedgerParticipant[]
  settlements: LedgerSettlement[]
  settlementsLoading: boolean
  settlementsError: string
  /** El summary completo (ISSUE-024) — solo se leen `suggestedTransfers`, `settled` y `currency` (nota P2a: nada de UX dedicada de Stripe aquí). */
  summary: LedgerSummaryData | null
  summaryError: string
  summaryErrorCode: string | null
  readOnly: boolean
  onSettlementSaved: (settlement: LedgerSettlement) => void
  onSettlementDeleted: (settlementId: string) => void
}

type FormState =
  | {
      mode: 'create'
      prefill?: { fromParticipantId?: string; toParticipantId?: string; amountCents?: number }
      /** ISSUE-027 — participantId forced as "from", rendered read-only (retiro de Stripe sugerido / botón dedicado del StripePanel). */
      lockedFrom?: string
    }
  | { mode: 'edit'; settlement: LedgerSettlement }
  | null

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

function formatSettledOn(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

/**
 * ISSUE-026 — "Para saldar" (suggestedTransfers) + alta manual + historial
 * de settlements con editar/eliminar (manager) / solo lectura (viewer).
 * ISSUE-027 (PLAN §2.6b): `involvesStripe='from'` se etiqueta "Retiro de
 * Stripe sugerido" con CTA "Registrar retiro" (from = nodo Stripe, fijo);
 * `involvesStripe='to'` se etiqueta "Aporte al fondo". El historial marca
 * con badge Stripe los settlements que involucran al nodo. El toggle de
 * modo, el balance del fondo y "Registrar cobros Stripe" viven en
 * StripePanel.
 */
export default function SettlementsPanel({
  eventId,
  participants,
  activeParticipants,
  settlements,
  settlementsLoading,
  settlementsError,
  summary,
  summaryError,
  summaryErrorCode,
  readOnly,
  onSettlementSaved,
  onSettlementDeleted,
}: SettlementsPanelProps) {
  const [formState, setFormState] = useState<FormState>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const participantById = useMemo(() => new Map(participants.map(participant => [participant.id, participant])), [participants])
  const labelFor = (participantId: string): string => {
    const participant = participantById.get(participantId)
    return participant ? participantSelectLabel(participant) : 'Participante eliminado'
  }
  // ISSUE-027 — used to badge history rows that involve the Stripe node.
  const stripeParticipantId = useMemo(() => participants.find(p => p.kind === 'stripe')?.id ?? null, [participants])

  const currency = summary?.currency ?? null
  const suggestedTransfers: LedgerSuggestedTransfer[] = summary?.suggestedTransfers ?? []
  const settled = summary?.settled ?? false
  const suggestionsUnavailable = summaryErrorCode === 'LEDGER_INVARIANT' || (!summary && Boolean(summaryError))

  const handleDelete = async (settlement: LedgerSettlement) => {
    if (!window.confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return
    setDeleteError('')
    setDeletingId(settlement.id)
    try {
      const response = await fetch('/api/admin/ledger/settlements', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, settlementId: settlement.id }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo eliminar el pago.'))
      onSettlementDeleted(settlement.id)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar el pago.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.section} aria-labelledby="settlements-suggested-title">
        <h3 id="settlements-suggested-title" className={styles.sectionTitle}>Para saldar</h3>

        {suggestionsUnavailable ? (
          <p className={styles.emptyState}>No se pudieron calcular las sugerencias — revisa el resumen financiero.</p>
        ) : settled || suggestedTransfers.length === 0 ? (
          <p className={styles.emptyState}>No hay transferencias pendientes.</p>
        ) : (
          <ul className={styles.suggestionList}>
            {suggestedTransfers.map((transfer, index) => {
              // ISSUE-027 (PLAN §2.6b, resolución 2026-08-19): 'from' = el
              // nodo Stripe queda deudor -> retiro sugerido; 'to' = el nodo
              // queda acreedor -> aporte al fondo. NUNCA al revés.
              const stripeBadgeLabel = transfer.involvesStripe === 'from'
                ? 'Retiro de Stripe sugerido'
                : transfer.involvesStripe === 'to'
                  ? 'Aporte al fondo'
                  : null
              const ctaLabel = transfer.involvesStripe === 'from' ? 'Registrar retiro' : 'Registrar pago'
              return (
                <li
                  key={`${transfer.fromParticipantId}-${transfer.toParticipantId}-${index}`}
                  className={styles.suggestionRow}
                >
                  <span className={styles.suggestionText}>
                    {labelFor(transfer.fromParticipantId)} le paga {formatCents(transfer.amountCents, currency ?? 'MXN')} a {labelFor(transfer.toParticipantId)}
                    {stripeBadgeLabel && <span className={styles.badge}>{stripeBadgeLabel}</span>}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      className={styles.primaryButtonSmall}
                      onClick={() => setFormState({
                        mode: 'create',
                        prefill: {
                          fromParticipantId: transfer.fromParticipantId,
                          toParticipantId: transfer.toParticipantId,
                          amountCents: transfer.amountCents,
                        },
                        lockedFrom: transfer.involvesStripe === 'from' ? transfer.fromParticipantId : undefined,
                      })}
                    >
                      {ctaLabel}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="settlements-history-title">
        <div className={styles.sectionHeader}>
          <h3 id="settlements-history-title" className={styles.sectionTitle}>Historial de pagos</h3>
          {!readOnly && (
            <button type="button" className={styles.toggleForm} onClick={() => setFormState({ mode: 'create' })}>
              <Plus size={16} />
              Registrar settlement
            </button>
          )}
        </div>

        {settlementsLoading && <p className={styles.status}>Cargando pagos…</p>}
        {!settlementsLoading && settlementsError && <p className={styles.errorText} role="alert">{settlementsError}</p>}
        {!settlementsLoading && !settlementsError && (
          settlements.length === 0 ? (
            <p className={styles.emptyState}>Aún no hay pagos registrados.</p>
          ) : (
            <ul className={styles.historyList}>
              {settlements.map((settlement) => {
                const involvesStripe = stripeParticipantId !== null
                  && (settlement.fromParticipantId === stripeParticipantId || settlement.toParticipantId === stripeParticipantId)
                return (
                <li key={settlement.id} className={styles.historyRow}>
                  <div className={styles.historyInfo}>
                    <span className={styles.historyAmount}>{formatCents(settlement.amountCents, settlement.currency)}</span>
                    <span className={styles.historyParties}>
                      {labelFor(settlement.fromParticipantId)} → {labelFor(settlement.toParticipantId)}
                      {involvesStripe && <span className={styles.badge}>Stripe</span>}
                    </span>
                    <span className={styles.historyMeta}>
                      {formatSettledOn(settlement.settledOn)}
                      {settlement.note ? ` · ${settlement.note}` : ''}
                    </span>
                  </div>
                  {!readOnly && (
                    <div className={styles.actions}>
                      <button type="button" className={styles.ghostButton} onClick={() => setFormState({ mode: 'edit', settlement })}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => void handleDelete(settlement)}
                        disabled={deletingId === settlement.id}
                      >
                        {deletingId === settlement.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </div>
                  )}
                </li>
                )
              })}
            </ul>
          )
        )}
        {deleteError && <p className={styles.errorText} role="alert">{deleteError}</p>}
      </section>

      {formState && (
        <SettlementForm
          eventId={eventId}
          participants={activeParticipants}
          existingCurrency={currency}
          formState={formState}
          onCancel={() => setFormState(null)}
          onSaved={(settlement) => {
            onSettlementSaved(settlement)
            setFormState(null)
          }}
        />
      )}
    </div>
  )
}

interface SettlementFormProps {
  eventId: string
  participants: LedgerParticipant[]
  existingCurrency: string | null
  formState: Exclude<FormState, null>
  onCancel: () => void
  onSaved: (settlement: LedgerSettlement) => void
}

/**
 * Un solo form para alta manual, alta prellenada desde una sugerencia y
 * edición — todos editables antes de guardar (pagos parciales válidos,
 * ISSUE-024). Exportado (además de usado internamente por SettlementsPanel)
 * para poder probar el prellenado directamente, igual que TransactionForm.
 */
export function SettlementForm({ eventId, participants, existingCurrency, formState, onCancel, onSaved }: SettlementFormProps) {
  const editing = formState.mode === 'edit' ? formState.settlement : null
  const prefill = formState.mode === 'create' ? formState.prefill : undefined
  // ISSUE-027 — "retiro de Stripe sugerido" y el botón dedicado del
  // StripePanel abren este form con "quién paga" fijo en el nodo Stripe.
  const lockedFrom = formState.mode === 'create' ? formState.lockedFrom : undefined
  const lockedFromParticipant = lockedFrom ? participants.find(p => p.id === lockedFrom) ?? null : null
  const lockedFromLabel = lockedFromParticipant ? participantSelectLabel(lockedFromParticipant) : 'Stripe (cuenta del evento)'

  const [fromParticipantId, setFromParticipantId] = useState(lockedFrom ?? editing?.fromParticipantId ?? prefill?.fromParticipantId ?? '')
  const [toParticipantId, setToParticipantId] = useState(editing?.toParticipantId ?? prefill?.toParticipantId ?? '')
  const [amountInput, setAmountInput] = useState(() => {
    const initialCents = editing?.amountCents ?? prefill?.amountCents
    return initialCents !== undefined ? centsToInputValue(initialCents) : ''
  })
  const [currency, setCurrency] = useState(editing?.currency ?? existingCurrency ?? 'MXN')
  const [settledOn, setSettledOn] = useState(editing?.settledOn ?? todayIso())
  const [note, setNote] = useState(editing?.note ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const currencyLocked = existingCurrency !== null

  const amountCents = useMemo(() => parseAmountToCents(amountInput), [amountInput])
  const sameParticipant = fromParticipantId.length > 0 && fromParticipantId === toParticipantId

  const canSubmit = !submitting
    && fromParticipantId.trim().length > 0
    && toParticipantId.trim().length > 0
    && !sameParticipant
    && amountCents !== null
    && amountCents > 0
    && settledOn.trim().length > 0
    && note.length <= NOTE_MAX_LENGTH

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || amountCents === null) return

    setSubmitting(true)
    setError('')

    const basePayload = {
      eventId,
      fromParticipantId,
      toParticipantId,
      amountCents,
      currency,
      settledOn,
      note: note.trim() ? note.trim() : undefined,
    }
    const payload = editing ? { ...basePayload, settlementId: editing.id } : basePayload

    try {
      const response = await fetch('/api/admin/ledger/settlements', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo guardar el pago.'))
      onSaved((data as { settlement: LedgerSettlement }).settlement)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar el pago.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div
        className={styles.formPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="settlement-form-title" className={styles.formTitle}>
          {editing ? 'Editar pago' : lockedFrom ? 'Registrar retiro de Stripe' : 'Registrar pago'}
        </h3>

        <form onSubmit={handleSubmit}>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="settlement-from">Quién paga</label>
              {lockedFrom ? (
                <p className={styles.staticCurrency} id="settlement-from">{lockedFromLabel} (fijo)</p>
              ) : (
                <select
                  id="settlement-from"
                  className={styles.select}
                  value={fromParticipantId}
                  onChange={(event) => setFromParticipantId(event.target.value)}
                  required
                >
                  <option value="" disabled>Selecciona un participante</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>{participantSelectLabel(participant)}</option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settlement-to">Quién recibe</label>
              <select
                id="settlement-to"
                className={styles.select}
                value={toParticipantId}
                onChange={(event) => setToParticipantId(event.target.value)}
                required
              >
                <option value="" disabled>Selecciona un participante</option>
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>{participantSelectLabel(participant)}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settlement-amount">Monto</label>
              <input
                id="settlement-amount"
                className={styles.input}
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settlement-currency">Moneda</label>
              {currencyLocked ? (
                <p className={styles.staticCurrency}>{currency} (moneda fijada del evento)</p>
              ) : (
                <select
                  id="settlement-currency"
                  className={styles.select}
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  {LEDGER_CURRENCIES.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settlement-date">Fecha</label>
              <input
                id="settlement-date"
                type="date"
                className={styles.input}
                value={settledOn}
                onChange={(event) => setSettledOn(event.target.value)}
                required
              />
            </div>

            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} htmlFor="settlement-note">Nota (opcional)</label>
              <textarea
                id="settlement-note"
                className={styles.textarea}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={NOTE_MAX_LENGTH}
              />
            </div>
          </div>

          {sameParticipant && (
            <p className={styles.errorText} role="alert">
              Quién paga y quién recibe no pueden ser el mismo participante.
            </p>
          )}
          {error && <p className={styles.errorText} role="alert">{error}</p>}

          <div className={styles.formActions}>
            <button type="button" className={styles.ghostButton} onClick={onCancel}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
              {submitting ? 'Guardando…' : 'Guardar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
