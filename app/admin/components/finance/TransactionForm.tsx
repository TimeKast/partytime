'use client'

import * as React from 'react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { LedgerParticipant, LedgerTransaction } from './LedgerTab'
import { participantSelectLabel } from './ParticipantsManager'
import { formatCents, parseAmountToCents } from './money'
import styles from './TransactionForm.module.css'

// PLAN-EPIC-006.md §2.8: same whitelist enforced server-side
// (app/api/admin/ledger/transactions/route.ts LEDGER_CURRENCIES).
const LEDGER_CURRENCIES = ['MXN', 'USD'] as const

const DESCRIPTION_MAX_LENGTH = 200
const NOTE_MAX_LENGTH = 500

type SplitMode = 'equal' | 'custom'

/** ISSUE-027 — fresh-create prefill (never applies in edit mode), used by StripePanel's "Registrar cobros Stripe". */
export interface TransactionFormPrefill {
  type: 'expense' | 'income'
  participantId: string
  amountCents: number
  splitParticipantIds: string[]
  description?: string
}

interface TransactionFormProps {
  eventId: string
  participants: LedgerParticipant[]
  /** Currency already fixed by an earlier transaction (PLAN §2.8) — locks the currency field when present. */
  existingCurrency: string | null
  /** Null = create mode; present = edit mode, prefilled from the given transaction. */
  transaction: LedgerTransaction | null
  /**
   * ISSUE-027 (PLAN §2.6b) — drives the "cubierto por el evento" defaults.
   * Optional + defaults to 'participant' (no special behavior) so callers
   * that predate this issue keep compiling/behaving unchanged.
   */
  stripeMode?: 'participant' | 'fund'
  stripeParticipantId?: string | null
  /** Fresh-create prefill — used by StripePanel's "Registrar cobros Stripe" (ISSUE-027). Never applies when `transaction` is set. */
  prefill?: TransactionFormPrefill
  onCancel: () => void
  onSaved: (transaction: LedgerTransaction) => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

export default function TransactionForm({
  eventId,
  participants,
  existingCurrency,
  transaction,
  stripeMode = 'participant',
  stripeParticipantId = null,
  prefill,
  onCancel,
  onSaved,
}: TransactionFormProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  const [type, setType] = useState<'expense' | 'income'>(transaction?.type ?? prefill?.type ?? 'expense')
  const [description, setDescription] = useState(transaction?.description ?? prefill?.description ?? '')
  const [amountInput, setAmountInput] = useState(() => {
    const initialCents = transaction?.amountCents ?? prefill?.amountCents
    return initialCents !== undefined ? centsToInputValue(initialCents) : ''
  })
  const [currency, setCurrency] = useState(transaction?.currency ?? existingCurrency ?? 'MXN')
  const [occurredOn, setOccurredOn] = useState(transaction?.occurredOn ?? todayIso())
  const [participantId, setParticipantIdState] = useState(transaction?.participantId ?? prefill?.participantId ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  // Editing always starts from the exact persisted shares (custom); a fresh
  // movement defaults to "partes iguales" (ISSUE-025 spec default) — unless
  // a prefill hands over an explicit split (ISSUE-027 "Registrar cobros Stripe").
  const [splitMode, setSplitMode] = useState<SplitMode>(transaction ? 'custom' : 'equal')
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(
    () => new Set(transaction?.shares.map(share => share.participantId) ?? prefill?.splitParticipantIds ?? []),
  )

  /**
   * ISSUE-027 (PLAN §2.6b) — in fund mode, choosing the payer drives a smart
   * split default: payer = Stripe -> "cubierto por el evento" (100% share to
   * the Stripe node); payer = a person -> split among the other people, one
   * click from "cubierto por el evento" via the dedicated button below. Only
   * applies to a fresh create (never overrides an edit's persisted shares)
   * and only in fund mode — participant mode has no special default (spec).
   */
  const handleParticipantChange = (nextParticipantId: string) => {
    setParticipantIdState(nextParticipantId)
    if (transaction || stripeMode !== 'fund' || !nextParticipantId) return
    if (stripeParticipantId && nextParticipantId === stripeParticipantId) {
      setSplitMode('equal')
      setSelectedParticipantIds(new Set([stripeParticipantId]))
    } else {
      setSplitMode('equal')
      setSelectedParticipantIds(new Set(participants.filter(p => p.kind === 'person').map(p => p.id)))
    }
  }

  /** "Cubierto por el evento" — share 100% al nodo Stripe, disponible para cualquier pagador en modo fondo (ISSUE-027, PLAN §2.6b). */
  const applyCoveredByEvent = () => {
    if (!stripeParticipantId) return
    setSplitMode('equal')
    setSelectedParticipantIds(new Set([stripeParticipantId]))
  }

  const coveredByEventActive = stripeParticipantId !== null
    && splitMode === 'equal'
    && selectedParticipantIds.size === 1
    && selectedParticipantIds.has(stripeParticipantId)
  const [customShareInputs, setCustomShareInputs] = useState<Record<string, string>>(
    () => Object.fromEntries((transaction?.shares ?? []).map(share => [share.participantId, centsToInputValue(share.shareCents)])),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

  const currencyLocked = existingCurrency !== null

  const amountCents = useMemo(() => parseAmountToCents(amountInput), [amountInput])

  const customShareEntries = useMemo(() => {
    return Object.entries(customShareInputs)
      .map(([id, value]) => ({ participantId: id, shareCents: parseAmountToCents(value) }))
      .filter((entry): entry is { participantId: string; shareCents: number } => entry.shareCents !== null && entry.shareCents > 0)
  }, [customShareInputs])

  const customShareTotal = customShareEntries.reduce((sum, entry) => sum + entry.shareCents, 0)
  const customShareDiff = amountCents !== null ? amountCents - customShareTotal : null

  const toggleEqualParticipant = (id: string) => {
    setSelectedParticipantIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setCustomShareValue = (id: string, value: string) => {
    setCustomShareInputs((current) => ({ ...current, [id]: value }))
  }

  const descriptionValid = description.trim().length > 0 && description.trim().length <= DESCRIPTION_MAX_LENGTH
  const noteValid = note.length <= NOTE_MAX_LENGTH
  const splitValid = splitMode === 'equal'
    ? selectedParticipantIds.size > 0
    : customShareEntries.length > 0 && customShareDiff === 0

  const canSubmit = !submitting
    && descriptionValid
    && amountCents !== null
    && amountCents > 0
    && participantId.trim().length > 0
    && occurredOn.trim().length > 0
    && noteValid
    && splitValid

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || amountCents === null) return

    setSubmitting(true)
    setError('')

    const basePayload = {
      eventId,
      type,
      participantId,
      description: description.trim(),
      amountCents,
      currency,
      occurredOn,
      note: note.trim() ? note.trim() : undefined,
    }

    const splitPayload = splitMode === 'equal'
      ? { splitMode: 'equal' as const, participantIds: Array.from(selectedParticipantIds) }
      : { shares: customShareEntries }

    const payload = transaction
      ? { ...basePayload, ...splitPayload, transactionId: transaction.id }
      : { ...basePayload, ...splitPayload }

    try {
      const response = await fetch('/api/admin/ledger/transactions', {
        method: transaction ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo guardar el movimiento.'))
      onSaved((data as { transaction: LedgerTransaction }).transaction)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar el movimiento.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className={styles.title}>
          {transaction ? 'Editar movimiento' : 'Registrar movimiento'}
        </h3>

        <form onSubmit={handleSubmit}>
          <div className={styles.typeToggle}>
            <button
              type="button"
              className={styles.typeOption}
              data-active={type === 'expense'}
              onClick={() => setType('expense')}
            >
              Gasto
            </button>
            <button
              type="button"
              className={styles.typeOption}
              data-active={type === 'income'}
              onClick={() => setType('income')}
            >
              Ingreso
            </button>
          </div>

          <div className={styles.fields} style={{ marginTop: 'var(--ad-3)' }}>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} htmlFor="tx-description">Descripción</label>
              <input
                id="tx-description"
                className={styles.input}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={DESCRIPTION_MAX_LENGTH}
                required
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="tx-amount">Monto</label>
              <input
                id="tx-amount"
                className={styles.input}
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="tx-currency">Moneda</label>
              {currencyLocked ? (
                <p className={styles.staticCurrency}>{currency} (moneda fijada del evento)</p>
              ) : (
                <select
                  id="tx-currency"
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
              <label className={styles.label} htmlFor="tx-date">Fecha</label>
              <input
                id="tx-date"
                type="date"
                className={styles.input}
                value={occurredOn}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="tx-participant">
                {type === 'expense' ? 'Quién pagó' : 'Quién recibió'}
              </label>
              <select
                id="tx-participant"
                className={styles.select}
                value={participantId}
                onChange={(event) => handleParticipantChange(event.target.value)}
                required
              >
                <option value="" disabled>Selecciona un participante</option>
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participantSelectLabel(participant)}
                  </option>
                ))}
              </select>
            </div>

            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} htmlFor="tx-note">Nota (opcional)</label>
              <textarea
                id="tx-note"
                className={styles.textarea}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={NOTE_MAX_LENGTH}
              />
            </div>
          </div>

          <fieldset style={{ border: 0, padding: 0, marginTop: 'var(--ad-4)' }}>
            <legend className={styles.label}>Reparto</legend>
            <div className={styles.splitModeToggle}>
              <button
                type="button"
                className={styles.typeOption}
                data-active={splitMode === 'equal'}
                onClick={() => setSplitMode('equal')}
              >
                Partes iguales
              </button>
              <button
                type="button"
                className={styles.typeOption}
                data-active={splitMode === 'custom'}
                onClick={() => setSplitMode('custom')}
              >
                Montos personalizados
              </button>
              {stripeMode === 'fund' && stripeParticipantId && (
                <button
                  type="button"
                  className={styles.typeOption}
                  data-active={coveredByEventActive}
                  onClick={applyCoveredByEvent}
                >
                  Cubierto por el evento
                </button>
              )}
            </div>

            {splitMode === 'equal' ? (
              <div className={styles.splitParticipants} style={{ marginTop: 'var(--ad-3)' }}>
                {participants.map((participant) => (
                  <label key={participant.id} className={styles.splitRow}>
                    <span className={styles.splitRowLabel}>
                      <input
                        type="checkbox"
                        checked={selectedParticipantIds.has(participant.id)}
                        onChange={() => toggleEqualParticipant(participant.id)}
                      />
                      {participantSelectLabel(participant)}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <>
                <div className={styles.splitParticipants} style={{ marginTop: 'var(--ad-3)' }}>
                  {participants.map((participant) => (
                    <div key={participant.id} className={styles.splitRow}>
                      <span className={styles.splitRowLabel}>{participantSelectLabel(participant)}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={styles.splitAmountInput}
                        placeholder="0.00"
                        value={customShareInputs[participant.id] ?? ''}
                        onChange={(event) => setCustomShareValue(participant.id, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
                {amountCents !== null && (
                  <p className={styles.splitSummary} data-balanced={customShareDiff === 0}>
                    {customShareDiff === 0
                      ? 'El reparto cuadra con el monto total.'
                      : customShareDiff !== null && customShareDiff > 0
                        ? `Falta repartir ${formatCents(customShareDiff, currency)}.`
                        : customShareDiff !== null
                          ? `Sobran ${formatCents(-customShareDiff, currency)} respecto al monto total.`
                          : null}
                  </p>
                )}
              </>
            )}
          </fieldset>

          {error && <p className={styles.errorText} role="alert" style={{ marginTop: 'var(--ad-3)' }}>{error}</p>}

          <div className={styles.formActions} style={{ marginTop: 'var(--ad-4)' }}>
            <button type="button" className={styles.ghostButton} onClick={onCancel}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
              {submitting ? 'Guardando…' : 'Guardar movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
