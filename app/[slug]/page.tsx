'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import RSVPModal from '../components/RSVPModal'
import EventInvitation from './components/EventInvitation'
import styles from '../page.module.css'
import type { PublicEvent } from '@/types/event'
import { buildEventInvitationViewModel } from '@/lib/event-invitation-view-model'

export default function EventPage() {
    const params = useParams()
    const slug = params.slug as string
    const shouldReduceMotion = useReducedMotion()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [event, setEvent] = useState<PublicEvent | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadEvent = async () => {
            try {
                setLoading(true)
                const response = await fetch(`/api/events/${slug}`, { cache: 'no-store' })
                if (!response.ok) {
                    setError(response.status === 404 ? 'not-found' : 'Error al cargar el evento')
                    return
                }

                const data = await response.json()
                if (data.success && data.event) {
                    setEvent(data.event)
                } else {
                    setError('not-found')
                }
            } catch (loadError) {
                console.error('Error loading event:', loadError)
                setError('Error de conexión')
            } finally {
                setLoading(false)
            }
        }

        if (slug) void loadEvent()
    }, [slug])

    if (loading) {
        return (
            <main className={`${styles.main} ${styles.centeredState}`}>
                <div className={styles.stateCard}>
                    <motion.div
                        animate={shouldReduceMotion ? undefined : { rotate: 360 }}
                        transition={shouldReduceMotion ? undefined : { duration: 1, repeat: Infinity, ease: 'linear' }}
                        className={styles.loadingIcon}
                        aria-hidden="true"
                    >
                        🎉
                    </motion.div>
                    <p>Cargando evento...</p>
                </div>
            </main>
        )
    }

    if (error || !event) {
        return (
            <main className={`${styles.main} ${styles.centeredState}`}>
                <div className={styles.stateCard}>
                    <span className={styles.stateIcon} aria-hidden="true">😢</span>
                    <h1>Evento no encontrado</h1>
                    <p>El evento que buscas no existe o ya no está disponible.</p>
                    <a href="/" className={styles.stateLink}>← Volver al inicio</a>
                </div>
            </main>
        )
    }

    const invitationViewModel = buildEventInvitationViewModel(event)

    if (invitationViewModel.pageGate === 'inactive') {
        return (
            <main className={`${styles.main} ${styles.centeredState}`}>
                <div className={styles.stateCard}>
                    <span className={styles.stateIcon} aria-hidden="true">🔒</span>
                    <h1>{invitationViewModel.inactive.heading}</h1>
                    <p>{invitationViewModel.inactive.message}</p>
                </div>
            </main>
        )
    }

    return (
        <>
            <EventInvitation
                key={`${event.slug}:${invitationViewModel.background.initialSrc}`}
                event={event}
                viewModel={invitationViewModel}
                onRsvp={() => setIsModalOpen(true)}
            />
            <AnimatePresence initial={!shouldReduceMotion}>
                {isModalOpen && invitationViewModel.rsvp.kind === 'open' && (
                    <RSVPModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        variant={invitationViewModel.rsvp.modal.variant}
                        eventSlug={invitationViewModel.rsvp.modal.eventSlug}
                        requirePlusOneName={invitationViewModel.rsvp.modal.requirePlusOneName}
                        theme={event.theme}
                    />
                )}
            </AnimatePresence>
        </>
    )
}
