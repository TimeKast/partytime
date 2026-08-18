'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import styles from '../admin.module.css'

type InvitationLinkStatus = 'active' | 'used' | 'revoked' | 'expired'

interface InvitationLink {
  id: string
  eventId: string
  expiresAt: string
  usedAt: string | null
  usedRsvpId: string | null
  usedRsvpName?: string | null
  revokedAt: string | null
  createdBy: string
  createdAt: string
  status: InvitationLinkStatus
}

interface InvitationLinkManagerProps {
  eventSlug: string
  onNavigateToRsvp?: (rsvpId: string) => void
}

const STATUS_LABELS: Record<InvitationLinkStatus, string> = {
  active: 'Activo',
  used: 'Usado',
  revoked: 'Revocado',
  expired: 'Vencido',
}

const STATUS_ORDER: Record<InvitationLinkStatus, number> = {
  active: 0,
  used: 1,
  expired: 2,
  revoked: 3,
}

function toLocalDateTimeInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function defaultExpiration(): string {
  return toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1_000))
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  return fallback
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function InvitationLinkManager({ eventSlug, onNavigateToRsvp }: InvitationLinkManagerProps) {
  const activeEventSlug = useRef(eventSlug)
  const [expiresAt, setExpiresAt] = useState(defaultExpiration)
  const [links, setLinks] = useState<InvitationLink[]>([])
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [loadingLinks, setLoadingLinks] = useState(true)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [linksExpanded, setLinksExpanded] = useState(false)

  activeEventSlug.current = eventSlug

  useEffect(() => {
    const controller = new AbortController()
    setExpiresAt(defaultExpiration())
    setLinks([])
    setGeneratedUrl(null)
    setError('')
    setFeedback('')
    setLinksExpanded(false)
    setCreating(false)
    setRevokingId(null)
    setLoadingLinks(true)

    async function loadLinks() {
      try {
        const response = await fetch(
          `/api/admin/rsvp-invitations?eventSlug=${encodeURIComponent(eventSlug)}`,
          { cache: 'no-store', signal: controller.signal },
        )
        const data: unknown = await response.json()
        if (!response.ok) {
          throw new Error(errorMessage(data, 'No se pudieron cargar los links.'))
        }
        if (
          typeof data === 'object'
          && data !== null
          && 'success' in data
          && data.success === true
          && 'links' in data
          && Array.isArray(data.links)
        ) {
          setLinks(data.links as InvitationLink[])
        } else {
          throw new Error('La respuesta de links no es válida.')
        }
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los links.')
      } finally {
        if (!controller.signal.aborted) setLoadingLinks(false)
      }
    }

    if (eventSlug) void loadLinks()
    return () => controller.abort()
  }, [eventSlug])

  const sortedLinks = useMemo(() => [...links].sort((a, b) => {
    const statusDifference = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    return statusDifference || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  }), [links])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const requestEventSlug = eventSlug
    const expiration = new Date(expiresAt)
    if (Number.isNaN(expiration.getTime()) || expiration.getTime() <= Date.now()) {
      setError('Selecciona una fecha y hora futuras.')
      return
    }

    setCreating(true)
    setGeneratedUrl(null)
    setError('')
    setFeedback('')
    try {
      const response = await fetch('/api/admin/rsvp-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSlug: requestEventSlug, expiresAt: expiration.toISOString() }),
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        throw new Error(errorMessage(data, 'No se pudo generar el link.'))
      }
      if (
        typeof data !== 'object'
        || data === null
        || !('success' in data)
        || data.success !== true
        || !('url' in data)
        || typeof data.url !== 'string'
        || !('link' in data)
      ) {
        throw new Error('La respuesta para el nuevo link no es válida.')
      }
      if (activeEventSlug.current !== requestEventSlug) return
      setGeneratedUrl(data.url)
      setLinks(current => [data.link as InvitationLink, ...current])
      setFeedback('Link generado. Cópialo ahora: no volverá a mostrarse.')
    } catch (createError) {
      if (activeEventSlug.current !== requestEventSlug) return
      setError(createError instanceof Error ? createError.message : 'No se pudo generar el link.')
    } finally {
      if (activeEventSlug.current === requestEventSlug) setCreating(false)
    }
  }

  const handleCopy = async () => {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setFeedback('Link copiado. Guárdalo en un lugar seguro antes de salir de esta vista.')
    } catch {
      setFeedback('No se pudo copiar automáticamente. Selecciona y copia el link del campo.')
    }
  }

  const navigateToUsedRsvp = (rsvpId: string | null) => {
    if (rsvpId && onNavigateToRsvp) onNavigateToRsvp(rsvpId)
  }

  const handleRevoke = async (id: string) => {
    const requestEventSlug = eventSlug
    setRevokingId(id)
    setError('')
    setFeedback('')
    try {
      const response = await fetch('/api/admin/rsvp-invitations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSlug: requestEventSlug, id }),
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        throw new Error(errorMessage(data, 'No se pudo revocar el link.'))
      }
      if (activeEventSlug.current !== requestEventSlug) return
      setLinks(current => current.map(link => link.id === id
        ? { ...link, status: 'revoked', revokedAt: new Date().toISOString() }
        : link))
      setFeedback('Link revocado. Ya no podrá usarse para registrar una asistencia.')
    } catch (revokeError) {
      if (activeEventSlug.current !== requestEventSlug) return
      setError(revokeError instanceof Error ? revokeError.message : 'No se pudo revocar el link.')
    } finally {
      if (activeEventSlug.current === requestEventSlug) setRevokingId(null)
    }
  }

  const now = new Date()
  const maxExpiration = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000)

  return (
    <section className={styles.invitationLinkManager} aria-labelledby="invitation-links-title">
      <div className={styles.invitationLinkHeader}>
        <div>
          <p className={styles.invitationLinkEyebrow}>Acceso privado de un uso</p>
          <h3 id="invitation-links-title">Links de invitación</h3>
          <p>Crea una excepción al cierre público del RSVP para una sola persona.</p>
        </div>
      </div>

      <form className={styles.invitationLinkForm} onSubmit={handleCreate}>
        <div className={styles.invitationExpiryField}>
          <label htmlFor="invitation-link-expiration">Válido hasta</label>
          <div className={styles.invitationExpiryControl}>
            <input
              id="invitation-link-expiration"
              type="datetime-local"
              value={expiresAt}
              min={toLocalDateTimeInput(now)}
              max={toLocalDateTimeInput(maxExpiration)}
              onChange={event => setExpiresAt(event.target.value)}
              required
              disabled={creating}
            />
          </div>
        </div>
        <button className={styles.invitationPrimaryAction} type="submit" disabled={creating || !expiresAt}>
          {creating ? 'Generando…' : 'Generar link'}
        </button>
      </form>

      {generatedUrl && (
        <div className={styles.invitationSecret}>
          <p><strong>Se muestra una sola vez.</strong> Cópialo antes de cambiar de evento o recargar.</p>
          <div className={styles.invitationSecretRow}>
            <input
              aria-label="Link de invitación recién generado"
              readOnly
              value={generatedUrl}
              onFocus={event => event.currentTarget.select()}
            />
            <button type="button" onClick={handleCopy}>Copiar link</button>
          </div>
        </div>
      )}

      <div className={styles.invitationFeedback} aria-live="polite" aria-atomic="true">
        {error && <p className={styles.invitationError} role="alert">{error}</p>}
        {!error && feedback && <p className={styles.invitationSuccess} role="status">{feedback}</p>}
      </div>

      <div className={styles.invitationLinkList}>
        <button
          type="button"
          className={styles.invitationListToggle}
          aria-expanded={linksExpanded}
          aria-controls="issued-invitation-links"
          onClick={() => setLinksExpanded(current => !current)}
        >
          <span>
            <strong>Links emitidos</strong>
            <small>
              {loadingLinks
                ? 'Cargando…'
                : `${sortedLinks.length} ${sortedLinks.length === 1 ? 'link' : 'links'}`}
            </small>
          </span>
          <span className={styles.filterToggleIcon} aria-hidden="true">⌄</span>
        </button>

        <div id="issued-invitation-links" hidden={!linksExpanded}>
          {loadingLinks ? (
            <p className={styles.invitationEmpty} role="status">Cargando links…</p>
          ) : sortedLinks.length === 0 ? (
            <p className={styles.invitationEmpty}>Aún no hay links para este evento.</p>
          ) : (
            <ul>
              {sortedLinks.map(link => (
                <li key={link.id}>
                  <div className={styles.invitationLinkDates}>
                    <span>Creado <time dateTime={link.createdAt}>{formatDate(link.createdAt)}</time></span>
                    <span>Vence <time dateTime={link.expiresAt}>{formatDate(link.expiresAt)}</time></span>
                    {link.usedAt && (
                      <span>Usado <time dateTime={link.usedAt}>{formatDate(link.usedAt)}</time></span>
                    )}
                    {link.status === 'used' && link.usedRsvpId && link.usedRsvpName && onNavigateToRsvp ? (
                      <button
                        type="button"
                        className={styles.invitationRsvpLink}
                        onClick={() => navigateToUsedRsvp(link.usedRsvpId)}
                      >
                        Invitado: {link.usedRsvpName}
                      </button>
                    ) : link.status === 'used' ? (
                      <span>Invitado: {link.usedRsvpName || 'Registro no disponible'}</span>
                    ) : null}
                  </div>
                  <div className={styles.invitationLinkActions}>
                    <span className={`${styles.invitationStatus} ${styles[`invitationStatus_${link.status}`]}`}>
                      {STATUS_LABELS[link.status]}
                    </span>
                    {link.status === 'active' && (
                      <button
                        className={styles.invitationRevokeAction}
                        type="button"
                        onClick={() => void handleRevoke(link.id)}
                        disabled={revokingId === link.id}
                        aria-label={`Revocar link creado el ${formatDate(link.createdAt)}`}
                      >
                        {revokingId === link.id ? 'Revocando…' : 'Revocar'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
