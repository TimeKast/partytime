'use client'

import * as React from 'react'
import { useState } from 'react'
import type { LedgerParticipant, LedgerTransaction } from './LedgerTab'
import { participantSelectLabel } from './ParticipantsManager'
import { formatCents } from './money'
import styles from './TransactionList.module.css'

interface TransactionListProps {
  eventId: string
  transactions: LedgerTransaction[]
  participants: LedgerParticipant[]
  readOnly: boolean
  onEdit: (transaction: LedgerTransaction) => void
  onDeleted: (transactionId: string) => void
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

function formatOccurredOn(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

export default function TransactionList({
  eventId,
  transactions,
  participants,
  readOnly,
  onEdit,
  onDeleted,
}: TransactionListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const participantById = new Map(participants.map(participant => [participant.id, participant]))

  const handleDelete = async (transaction: LedgerTransaction) => {
    if (!window.confirm(`¿Eliminar "${transaction.description}"? Esta acción no se puede deshacer.`)) return
    setDeleteError('')
    setDeletingId(transaction.id)
    try {
      const response = await fetch('/api/admin/ledger/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, transactionId: transaction.id }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo eliminar el movimiento.'))
      onDeleted(transaction.id)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar el movimiento.')
    } finally {
      setDeletingId(null)
    }
  }

  if (transactions.length === 0) {
    return <p className={styles.emptyState}>Aún no hay movimientos registrados.</p>
  }

  return (
    <div>
      {deleteError && <p className={styles.errorText} role="alert">{deleteError}</p>}
      <ul className={styles.list}>
        {transactions.map((transaction) => {
          const counterparty = participantById.get(transaction.participantId)
          const counterpartyLabel = counterparty ? participantSelectLabel(counterparty) : 'Participante eliminado'
          const expanded = expandedId === transaction.id

          return (
            <li key={transaction.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.typeBadge} data-type={transaction.type}>
                  {transaction.type === 'expense' ? 'Gasto' : 'Ingreso'}
                </span>
                <span className={styles.amount}>{formatCents(transaction.amountCents, transaction.currency)}</span>
              </div>

              <p className={styles.description}>{transaction.description}</p>

              <div className={styles.meta}>
                <span>{transaction.type === 'expense' ? 'Pagó' : 'Recibió'}: {counterpartyLabel}</span>
                <span>{formatOccurredOn(transaction.occurredOn)}</span>
              </div>

              <button
                type="button"
                className={styles.sharesToggle}
                aria-expanded={expanded}
                onClick={() => setExpandedId(current => (current === transaction.id ? null : transaction.id))}
              >
                {expanded ? 'Ocultar reparto' : `Ver reparto (${transaction.shares.length})`}
              </button>
              {expanded && (
                <ul className={styles.sharesList}>
                  {transaction.shares.map((share) => {
                    const shareParticipant = participantById.get(share.participantId)
                    const label = shareParticipant ? participantSelectLabel(shareParticipant) : 'Participante eliminado'
                    return (
                      <li key={share.participantId}>
                        {label}: {formatCents(share.shareCents, transaction.currency)}
                      </li>
                    )
                  })}
                </ul>
              )}

              {!readOnly && (
                <div className={styles.actions}>
                  <button type="button" className={styles.ghostButton} onClick={() => onEdit(transaction)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void handleDelete(transaction)}
                    disabled={deletingId === transaction.id}
                  >
                    {deletingId === transaction.id ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
