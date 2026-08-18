'use client'

import { useState, type KeyboardEvent } from 'react'
import type { CheckinGuestDto } from '@/lib/checkin-guests'
import { isCheckinMarkable, isGuestFullyArrived, type CheckinMarkTarget } from './checkin-portal-logic'
import styles from './checkin.module.css'

const MAX_NOTE_LENGTH = 500

function formatArrivalTime(iso: string): string {
    try {
        return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    } catch {
        return ''
    }
}

interface SeatCheckProps {
    label: string
    checkedAtIso: string | null
    checkedInBy: string | null
    disabled: boolean
    busy: boolean
    onToggle: (checkedIn: boolean) => void
}

/**
 * One tappable seat (the guest's own check, or their +1's). ISSUE-017:
 * "Botón grande de check ✓ ... tap target ≥ 44px" and "Marcado: fondo verde
 * suave + hora de llegada + 'por {staffName}'".
 */
function SeatCheck({ label, checkedAtIso, checkedInBy, disabled, busy, onToggle }: SeatCheckProps) {
    const checkedIn = checkedAtIso !== null
    return (
        <button
            type="button"
            className={`${styles.seatCheck} ${checkedIn ? styles.seatCheckMarked : ''}`}
            onClick={() => onToggle(!checkedIn)}
            disabled={disabled || busy}
            aria-pressed={checkedIn}
            aria-label={checkedIn ? `Desmarcar llegada de ${label}` : `Marcar llegada de ${label}`}
        >
            <span className={styles.seatCheckIcon} aria-hidden="true">{checkedIn ? '✓' : ''}</span>
            <span className={styles.seatCheckText}>
                <span className={styles.seatCheckLabel}>{label}</span>
                {checkedIn && (
                    <span className={styles.seatCheckMeta}>
                        {formatArrivalTime(checkedAtIso)}{checkedInBy ? ` · por ${checkedInBy}` : ''}
                    </span>
                )}
            </span>
        </button>
    )
}

export interface GuestRowProps {
    guest: CheckinGuestDto
    busy: boolean
    onToggle: (target: CheckinMarkTarget, checkedIn: boolean) => void
    onSaveNote: (note: string) => void
}

/**
 * ISSUE-017 row: name, +1 badge (with name), masked email, seat checks, note
 * editor, and the `pending_*` "no confirmado" read-only badge.
 */
export default function GuestRow({ guest, busy, onToggle, onSaveNote }: GuestRowProps) {
    const [noteOpen, setNoteOpen] = useState(false)
    const [noteDraft, setNoteDraft] = useState(guest.checkinNote ?? '')
    const markable = isCheckinMarkable(guest.status)
    const fullyArrived = isGuestFullyArrived(guest)

    function openNote() {
        if (!markable) return
        setNoteDraft(guest.checkinNote ?? '')
        setNoteOpen(true)
    }

    function commitNote() {
        setNoteOpen(false)
        if (noteDraft.trim() !== (guest.checkinNote ?? '')) {
            onSaveNote(noteDraft)
        }
    }

    function onNoteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Escape') {
            setNoteDraft(guest.checkinNote ?? '')
            setNoteOpen(false)
        }
    }

    return (
        <li className={`${styles.row} ${fullyArrived ? styles.rowArrived : ''}`}>
            <div className={styles.rowHeader}>
                <div className={styles.rowIdentity}>
                    <span className={styles.rowName}>{guest.name}</span>
                    {guest.plusOne && (
                        <span className={styles.plusOneBadge}>
                            +1{guest.plusOneName ? ` · ${guest.plusOneName}` : ''}
                        </span>
                    )}
                    {!markable && <span className={styles.pendingBadge}>no confirmado</span>}
                </div>
                <button
                    type="button"
                    className={styles.noteButton}
                    onClick={openNote}
                    disabled={!markable}
                    aria-label={guest.checkinNote ? 'Editar nota' : 'Agregar nota'}
                >
                    {guest.checkinNote ? '📝' : '🗒️'}
                </button>
            </div>

            <p className={styles.maskedEmail}>{guest.maskedEmail}</p>

            {noteOpen && (
                <textarea
                    className={styles.noteInput}
                    value={noteDraft}
                    maxLength={MAX_NOTE_LENGTH}
                    autoFocus
                    placeholder="Nota para este invitado…"
                    onChange={event => setNoteDraft(event.target.value)}
                    onBlur={commitNote}
                    onKeyDown={onNoteKeyDown}
                />
            )}
            {!noteOpen && guest.checkinNote && (
                <p className={styles.noteText}>{guest.checkinNote}</p>
            )}

            <div className={styles.seatChecks}>
                <SeatCheck
                    label={guest.name}
                    checkedAtIso={guest.checkedInAt}
                    checkedInBy={guest.checkedInBy}
                    disabled={!markable}
                    busy={busy}
                    onToggle={checkedIn => onToggle('guest', checkedIn)}
                />
                {guest.plusOne && (
                    <SeatCheck
                        label={guest.plusOneName || '+1'}
                        checkedAtIso={guest.plusOneCheckedInAt}
                        checkedInBy={guest.checkedInBy}
                        disabled={!markable}
                        busy={busy}
                        onToggle={checkedIn => onToggle('plusOne', checkedIn)}
                    />
                )}
            </div>
        </li>
    )
}
