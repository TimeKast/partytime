'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import type { PublicEvent } from '@/types/event'
import type { CheckinGuestDto } from '@/lib/checkin-guests'
import {
    clearStoredStaffName,
    computeArrivalCount,
    filterGuests,
    interpretAuthResponse,
    performOptimisticMark,
    readStoredStaffName,
    writeStoredStaffName,
    type CheckinMarkTarget,
    type CheckinQuickFilter,
} from './checkin-portal-logic'
import GuestRow from './GuestRow'
import styles from './checkin.module.css'

// ISSUE-017: "Polling cada 12 s ... pausar cuando document.hidden".
const POLL_INTERVAL_MS = 12000
const NO_STORE: RequestInit = { cache: 'no-store' }

export default function CheckinPortalPage() {
    const params = useParams()
    const slug = (params?.slug as string) || ''

    // Best-effort public event lookup, gate/header title only.
    const [eventInfo, setEventInfo] = useState<PublicEvent | null>(null)
    // True ONLY when the event itself does not exist (GET /api/events/[slug]
    // 404) or a later authenticated fetch discovers the portal is off — the
    // permanent, full-screen "Portal no disponible" state. "Wrong password"
    // and "rate limited" are separate, gate-local error states, not this.
    const [eventUnavailable, setEventUnavailable] = useState(false)

    const [phase, setPhase] = useState<'gate' | 'list'>('gate')
    // The cookie is HttpOnly — this is only ever an optimistic hint of who's
    // logged in for THIS tab, sourced from sessionStorage on mount or from a
    // successful POST /api/checkin/auth. It is never used to decide access;
    // every 401 from any fetch below bounces back to the gate regardless.
    const [staffName, setStaffName] = useState<string | null>(null)
    const staffNameRef = useRef<string | null>(null)
    useEffect(() => { staffNameRef.current = staffName }, [staffName])

    // Gate (screen 1) form state.
    const [staffNameInput, setStaffNameInput] = useState('')
    const [passwordInput, setPasswordInput] = useState('')
    const [gateSubmitting, setGateSubmitting] = useState(false)
    const [gateError, setGateError] = useState<string | null>(null)
    const [gateNotice, setGateNotice] = useState<string | null>(null)

    // List (screen 2) state.
    const [guests, setGuests] = useState<CheckinGuestDto[] | null>(null)
    const [listError, setListError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [quickFilter, setQuickFilter] = useState<CheckinQuickFilter>('all')
    const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
    const [actionMessage, setActionMessage] = useState<string | null>(null)

    // Best-effort event lookup (public DTO, no cookie involved) — used for
    // the gate/header title, same pattern as /verify and /pago. A 404 means
    // the event does not exist at all; anything else (network hiccup, 5xx)
    // is NOT treated as unavailable — /api/checkin/auth's own opaque 404 is
    // the real source of truth for "the check-in portal is off".
    useEffect(() => {
        if (!slug) return
        const controller = new AbortController()

        fetch(`/api/events/${slug}`, { signal: controller.signal, cache: 'no-store' })
            .then(async response => {
                if (response.status === 404) {
                    setEventUnavailable(true)
                    return
                }
                const data = await response.json().catch(() => null)
                if (data?.success && data.event) setEventInfo(data.event as PublicEvent)
            })
            .catch(() => {})

        return () => controller.abort()
    }, [slug])

    // Resume an already-authenticated tab. sessionStorage only ever holds
    // staffName (NEVER the password, which the client never persists
    // anywhere) — this is just an optimistic hint; the guests fetch below
    // is what actually proves the cookie is still valid.
    useEffect(() => {
        if (!slug) return
        const stored = readStoredStaffName(slug)
        if (stored) {
            setStaffName(stored)
            setPhase('list')
        }
    }, [slug])

    const returnToGate = useCallback((message: string) => {
        if (slug) clearStoredStaffName(slug)
        setStaffName(null)
        setGuests(null)
        setPhase('gate')
        setGateNotice(message)
    }, [slug])

    const fetchGuests = useCallback(async (signal?: AbortSignal) => {
        if (!slug) return
        try {
            const response = await fetch(`/api/checkin/guests?slug=${encodeURIComponent(slug)}`, { ...NO_STORE, signal })
            if (signal?.aborted) return

            if (response.status === 404) {
                // Portal was turned off (or the event deactivated) mid-session
                // — no point bouncing to a gate that will 404 too.
                setEventUnavailable(true)
                return
            }
            if (response.status === 401) {
                returnToGate('Tu sesión expiró. Vuelve a iniciar sesión.')
                return
            }
            if (!response.ok) {
                setListError('No se pudo cargar la lista. Reintentando…')
                return
            }

            const data = await response.json()
            if (signal?.aborted) return
            if (data?.success && Array.isArray(data.guests)) {
                setGuests(data.guests as CheckinGuestDto[])
                setListError(null)
            }
        } catch {
            if (!signal?.aborted) setListError('Sin conexión. Reintentando…')
        }
    }, [slug, returnToGate])

    // Initial load + 12s polling while on screen 2, paused whenever the tab
    // is hidden (ISSUE-017 acceptance criterion: two staff devices converge
    // within 15s).
    useEffect(() => {
        if (phase !== 'list') return undefined
        const controller = new AbortController()
        void fetchGuests(controller.signal)

        const interval = setInterval(() => {
            if (document.hidden) return
            void fetchGuests()
        }, POLL_INTERVAL_MS)

        return () => {
            controller.abort()
            clearInterval(interval)
        }
    }, [phase, fetchGuests])

    async function handleGateSubmit(event: FormEvent) {
        event.preventDefault()
        if (gateSubmitting) return
        setGateError(null)
        setGateNotice(null)
        setGateSubmitting(true)

        try {
            const response = await fetch('/api/checkin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify({ slug, password: passwordInput, staffName: staffNameInput.trim() }),
            })
            const outcome = await interpretAuthResponse(response)

            switch (outcome.kind) {
                case 'success':
                    // Cleared immediately after use — the password itself is
                    // never written to any storage, only kept in this form's
                    // in-memory state for the duration of the submit.
                    setPasswordInput('')
                    writeStoredStaffName(slug, outcome.staffName)
                    setStaffName(outcome.staffName)
                    setPhase('list')
                    break
                case 'unavailable':
                    setEventUnavailable(true)
                    break
                case 'invalid_credentials':
                    setGateError('Contraseña incorrecta.')
                    break
                case 'rate_limited':
                    setGateError('Demasiados intentos. Espera unos minutos e intenta de nuevo.')
                    break
                case 'error':
                    setGateError('No pudimos iniciar sesión. Intenta de nuevo.')
                    break
            }
        } catch {
            setGateError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.')
        } finally {
            setGateSubmitting(false)
        }
    }

    const visibleGuests = useMemo(
        () => filterGuests(guests ?? [], searchQuery, quickFilter),
        [guests, searchQuery, quickFilter],
    )
    const arrivalCount = useMemo(() => computeArrivalCount(guests ?? []), [guests])

    const markGuest = useCallback(async (
        rsvpId: string,
        target: CheckinMarkTarget,
        checkedIn: boolean,
        note?: string | null,
    ) => {
        const activeStaffName = staffNameRef.current
        if (!guests || !activeStaffName) return

        setPendingIds(prev => new Set(prev).add(rsvpId))
        setActionMessage(null)

        const outcome = await performOptimisticMark(
            guests,
            { rsvpId, target, checkedIn, staffName: activeStaffName, note },
            () => fetch('/api/checkin/mark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify({ slug, rsvpId, target, checkedIn, ...(note !== undefined ? { note } : {}) }),
            }),
            optimisticGuests => setGuests(optimisticGuests),
        )

        setPendingIds(prev => {
            const next = new Set(prev)
            next.delete(rsvpId)
            return next
        })

        if (outcome.sessionExpired) {
            returnToGate(outcome.errorMessage ?? 'Tu sesión expiró. Vuelve a iniciar sesión.')
            return
        }
        setGuests(outcome.guests)
        if (!outcome.ok && outcome.errorMessage) setActionMessage(outcome.errorMessage)
    }, [guests, slug, returnToGate])

    const eventTitle = eventInfo?.displayTitle || eventInfo?.title || 'el evento'

    if (eventUnavailable) {
        return (
            <main className={styles.container}>
                <section className={styles.card} aria-labelledby="checkin-unavailable-title">
                    <div className={styles.icon} aria-hidden="true">🔒</div>
                    <h1 id="checkin-unavailable-title">Portal no disponible</h1>
                    <p role="alert">Este link de check-in no está activo. Contacta al organizador del evento.</p>
                </section>
            </main>
        )
    }

    if (phase === 'gate') {
        return (
            <main className={styles.container}>
                <section className={styles.card} aria-labelledby="checkin-gate-title">
                    <h1 id="checkin-gate-title">{eventTitle}</h1>
                    {eventInfo?.date && (
                        <p className={styles.eventMeta}>
                            {eventInfo.date}{eventInfo.time ? ` · ${eventInfo.time}` : ''}
                        </p>
                    )}
                    <p className={styles.gateSubtitle}>Acceso de staff — check-in</p>

                    <form className={styles.form} onSubmit={handleGateSubmit}>
                        <div className={styles.formGroup}>
                            <label htmlFor="checkin-staff-name">Tu nombre</label>
                            <input
                                id="checkin-staff-name"
                                type="text"
                                value={staffNameInput}
                                onChange={e => setStaffNameInput(e.target.value)}
                                placeholder="Tu nombre"
                                autoComplete="name"
                                required
                                minLength={2}
                                maxLength={120}
                                disabled={gateSubmitting}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="checkin-password">Password del evento</label>
                            <input
                                id="checkin-password"
                                type="password"
                                value={passwordInput}
                                onChange={e => setPasswordInput(e.target.value)}
                                placeholder="Password del evento"
                                autoComplete="off"
                                required
                                disabled={gateSubmitting}
                            />
                        </div>
                        <button type="submit" className={styles.primaryBtn} disabled={gateSubmitting}>
                            {gateSubmitting ? 'Entrando…' : 'Entrar'}
                        </button>
                    </form>

                    {gateNotice && <p className={styles.notice} role="status" aria-live="polite">{gateNotice}</p>}
                    {gateError && <p className={styles.error} role="alert">{gateError}</p>}
                </section>
            </main>
        )
    }

    return (
        <main className={styles.listContainer}>
            <header className={styles.listHeader}>
                <div className={styles.listHeaderTop}>
                    <h1 className={styles.listTitle}>{eventTitle}</h1>
                    <p className={styles.counter} aria-live="polite">
                        <span className={styles.counterArrived}>{arrivalCount.arrived}</span>
                        {' / '}
                        <span>{arrivalCount.totalSeats}</span>
                        {' llegados'}
                    </p>
                </div>

                <input
                    type="search"
                    className={styles.searchInput}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre…"
                    aria-label="Buscar invitado por nombre"
                />

                <div className={styles.filterRow} role="group" aria-label="Filtros rápidos">
                    <button
                        type="button"
                        className={`${styles.filterBtn} ${quickFilter === 'all' ? styles.filterBtnActive : ''}`}
                        onClick={() => setQuickFilter('all')}
                        aria-pressed={quickFilter === 'all'}
                    >
                        Todos
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterBtn} ${quickFilter === 'pending' ? styles.filterBtnActive : ''}`}
                        onClick={() => setQuickFilter('pending')}
                        aria-pressed={quickFilter === 'pending'}
                    >
                        Falta por llegar
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterBtn} ${quickFilter === 'arrived' ? styles.filterBtnActive : ''}`}
                        onClick={() => setQuickFilter('arrived')}
                        aria-pressed={quickFilter === 'arrived'}
                    >
                        Ya llegaron
                    </button>
                </div>
            </header>

            {listError && <p className={styles.listBanner} role="status" aria-live="polite">{listError}</p>}
            {actionMessage && <p className={styles.listBannerError} role="alert">{actionMessage}</p>}

            {guests === null ? (
                <p className={styles.loadingState} role="status" aria-live="polite">Cargando invitados…</p>
            ) : visibleGuests.length === 0 ? (
                <p className={styles.emptyState}>No hay invitados que coincidan.</p>
            ) : (
                <ul className={styles.list}>
                    {visibleGuests.map(guest => (
                        <GuestRow
                            key={guest.id}
                            guest={guest}
                            busy={pendingIds.has(guest.id)}
                            onToggle={(target, checkedIn) => void markGuest(guest.id, target, checkedIn)}
                            onSaveNote={note => void markGuest(guest.id, 'guest', guest.checkedInAt !== null, note)}
                        />
                    ))}
                </ul>
            )}
        </main>
    )
}
