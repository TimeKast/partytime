'use client'

import * as React from 'react'
import { useState, type FormEvent } from 'react'
import type { LedgerParticipant } from './LedgerTab'
import { Pencil, Plus } from '../ui/icons'
import styles from './ParticipantsManager.module.css'

interface ParticipantsManagerProps {
  eventId: string
  participants: LedgerParticipant[]
  readOnly: boolean
  onParticipantSaved: (participant: LedgerParticipant) => void
}

/** ISSUE-025 spec: the Stripe node reads "Stripe (cuenta del evento)" wherever it is selectable (payer/receiver, share checkboxes). */
export function participantSelectLabel(participant: LedgerParticipant): string {
  return participant.kind === 'stripe' ? 'Stripe (cuenta del evento)' : participant.name
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

type EditingState = { participantId: string; name: string; email: string } | null

export default function ParticipantsManager({
  eventId,
  participants,
  readOnly,
  onParticipantSaved,
}: ParticipantsManagerProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [createError, setCreateError] = useState('')
  const [savingCreate, setSavingCreate] = useState(false)

  const [editing, setEditing] = useState<EditingState>(null)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState('')

  const resetCreateForm = () => {
    setNewName('')
    setNewEmail('')
    setCreateError('')
    setCreating(false)
  }

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (savingCreate) return
    setCreateError('')
    setSavingCreate(true)
    try {
      const response = await fetch('/api/admin/ledger/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          name: newName.trim(),
          email: newEmail.trim() ? newEmail.trim() : undefined,
        }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo crear el participante.'))
      const created = (data as { participant: LedgerParticipant }).participant
      onParticipantSaved(created)
      resetCreateForm()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'No se pudo crear el participante.')
    } finally {
      setSavingCreate(false)
    }
  }

  const startEditing = (participant: LedgerParticipant) => {
    setEditError('')
    setEditing({ participantId: participant.id, name: participant.name, email: participant.email ?? '' })
  }

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing || savingEdit) return
    setEditError('')
    setSavingEdit(true)
    try {
      const response = await fetch('/api/admin/ledger/participants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          participantId: editing.participantId,
          name: editing.name.trim(),
          email: editing.email.trim() ? editing.email.trim() : null,
        }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo actualizar el participante.'))
      const updated = (data as { participant: LedgerParticipant }).participant
      onParticipantSaved(updated)
      setEditing(null)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo actualizar el participante.')
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleActive = async (participant: LedgerParticipant) => {
    const nextActive = !participant.isActive
    const label = nextActive ? 'reactivar' : 'desactivar'
    if (!window.confirm(`¿${label.charAt(0).toUpperCase() + label.slice(1)} a ${participant.name}?`)) return

    setToggleError('')
    setTogglingId(participant.id)
    try {
      const response = await fetch('/api/admin/ledger/participants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, participantId: participant.id, isActive: nextActive }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(data, 'No se pudo actualizar el participante.'))
      onParticipantSaved((data as { participant: LedgerParticipant }).participant)
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'No se pudo actualizar el participante.')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div>
      {participants.length === 0 ? (
        <p className={styles.emptyState}>Aún no hay participantes registrados.</p>
      ) : (
        <ul className={styles.list}>
          {participants.map((participant) => {
            const isStripe = participant.kind === 'stripe'
            const isEditingThis = editing?.participantId === participant.id
            return (
              <li key={participant.id} className={styles.row} data-inactive={!participant.isActive}>
                {isEditingThis ? (
                  <form className={styles.fields} onSubmit={submitEdit} style={{ flex: 1 }}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`participant-name-${participant.id}`}>Nombre</label>
                      <input
                        id={`participant-name-${participant.id}`}
                        className={styles.input}
                        value={editing.name}
                        onChange={(event) => setEditing(current => current && { ...current, name: event.target.value })}
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`participant-email-${participant.id}`}>Email (opcional)</label>
                      <input
                        id={`participant-email-${participant.id}`}
                        className={styles.input}
                        type="email"
                        value={editing.email}
                        onChange={(event) => setEditing(current => current && { ...current, email: event.target.value })}
                      />
                    </div>
                    <div className={styles.formActions} style={{ gridColumn: '1 / -1' }}>
                      <button type="submit" className={styles.primaryButton} disabled={savingEdit}>
                        {savingEdit ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button type="button" className={styles.ghostButton} onClick={() => setEditing(null)}>Cancelar</button>
                    </div>
                    {editError && <p className={styles.errorText} role="alert" style={{ gridColumn: '1 / -1' }}>{editError}</p>}
                  </form>
                ) : (
                  <>
                    <div className={styles.identity}>
                      <span className={styles.name}>
                        {participant.name}
                        {isStripe && <span className={styles.badge}>Stripe</span>}
                        {!participant.isActive && <span className={styles.badge} data-tone="neutral">Inactivo</span>}
                      </span>
                      {participant.email && <span className={styles.email}>{participant.email}</span>}
                    </div>
                    {!readOnly && !isStripe && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Editar a ${participant.name}`}
                          onClick={() => startEditing(participant)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => void toggleActive(participant)}
                          disabled={togglingId === participant.id}
                        >
                          {togglingId === participant.id ? 'Guardando…' : (participant.isActive ? 'Desactivar' : 'Reactivar')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {toggleError && <p className={styles.errorText} role="alert">{toggleError}</p>}

      {!readOnly && (
        creating ? (
          <form className={styles.form} onSubmit={submitCreate}>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="new-participant-name">Nombre</label>
                <input
                  id="new-participant-name"
                  className={styles.input}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                  autoFocus
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="new-participant-email">Email (opcional)</label>
                <input
                  id="new-participant-email"
                  className={styles.input}
                  type="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                />
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="submit" className={styles.primaryButton} disabled={savingCreate || newName.trim().length < 2}>
                {savingCreate ? 'Guardando…' : 'Guardar participante'}
              </button>
              <button type="button" className={styles.ghostButton} onClick={resetCreateForm}>Cancelar</button>
            </div>
            {createError && <p className={styles.errorText} role="alert">{createError}</p>}
          </form>
        ) : (
          <button type="button" className={styles.toggleForm} onClick={() => setCreating(true)}>
            <Plus size={16} />
            Agregar participante
          </button>
        )
      )}
    </div>
  )
}
