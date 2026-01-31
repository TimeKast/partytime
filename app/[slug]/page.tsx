'use client'

import { useState, useEffect } from 'react'
import { useParams, notFound } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import RSVPModal from '../components/RSVPModal'
import styles from '../page.module.css'
import type { Event } from '@/types/event'

export default function EventPage() {
    const params = useParams()
    const slug = params.slug as string

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [event, setEvent] = useState<Event | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Load event data by slug
    useEffect(() => {
        const loadEvent = async () => {
            try {
                setLoading(true)
                const response = await fetch(`/api/events/${slug}`, {
                    cache: 'no-store'
                })

                if (!response.ok) {
                    if (response.status === 404) {
                        setError('not-found')
                    } else {
                        setError('Error al cargar el evento')
                    }
                    return
                }

                const data = await response.json()
                if (data.success && data.event) {
                    setEvent(data.event)
                } else {
                    setError('not-found')
                }
            } catch (err) {
                console.error('Error loading event:', err)
                setError('Error de conexión')
            } finally {
                setLoading(false)
            }
        }

        if (slug) {
            loadEvent()
        }
    }, [slug])

    // Loading state
    if (loading) {
        return (
            <main className={styles.main} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'white' }}>
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        style={{ fontSize: '3rem' }}
                    >
                        🎉
                    </motion.div>
                    <p style={{ marginTop: '1rem' }}>Cargando evento...</p>
                </div>
            </main>
        )
    }

    // Error/not found state
    if (error || !event) {
        return (
            <main className={styles.main} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'white', padding: '2rem' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>😢</div>
                    <h1 style={{ marginBottom: '1rem' }}>Evento no encontrado</h1>
                    <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
                        El evento que buscas no existe o ya no está disponible.
                    </p>
                    <a
                        href="/"
                        style={{
                            color: '#00FFFF',
                            textDecoration: 'underline',
                            fontSize: '1.1rem'
                        }}
                    >
                        ← Volver al inicio
                    </a>
                </div>
            </main>
        )
    }

    // Event not active
    if (!event.isActive) {
        return (
            <main className={styles.main} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'white', padding: '2rem' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔒</div>
                    <h1 style={{ marginBottom: '1rem' }}>{event.title}</h1>
                    <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
                        Las inscripciones para este evento están cerradas.
                    </p>
                </div>
            </main>
        )
    }

    const theme = event.theme

    return (
        <main className={styles.main}>
            {/* Admin icon */}
            <a href="/admin" className={styles.adminIcon} title="Admin">
                ⚙️
            </a>

            {/* Background with image */}
            <div className={styles.backgroundWrapper}>
                <div
                    className={styles.background}
                    style={{
                        backgroundImage: `url(${event.backgroundImage?.url || '/background.png'})`,
                    }}
                />
                <div
                    className={styles.overlay}
                    style={{
                        background: `linear-gradient(180deg, ${theme.primaryColor}10 0%, ${theme.primaryColor}30 100%)`
                    }}
                />
            </div>

            {/* Main content */}
            <div className={styles.content}>
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className={styles.hero}
                >
                    {/* Main title with neon effect - single line (hidden if empty) */}
                    {event.title && (
                        <h1 className={styles.title}>
                            <span
                                className={styles.titleLine1}
                                style={{
                                    color: theme.primaryColor,
                                    textShadow: `0 0 10px ${theme.primaryColor}cc, 0 0 20px ${theme.primaryColor}99, 0 0 30px ${theme.primaryColor}66, 3px 3px 0 ${theme.secondaryColor}4d`
                                }}
                            >
                                {event.title}
                            </span>
                        </h1>
                    )}

                    {/* Subtitle (hidden if empty) */}
                    {event.subtitle && (
                        <motion.h2
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                            className={styles.subtitle}
                            style={{
                                color: theme.secondaryColor,
                                textShadow: `0 0 10px ${theme.secondaryColor}cc, 0 0 20px ${theme.secondaryColor}80, 2px 2px 0 ${theme.accentColor}4d`
                            }}
                        >
                            {event.subtitle}
                        </motion.h2>
                    )}
                </motion.div>

                {/* Event information */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    className={styles.eventInfo}
                    style={{
                        background: `${theme.primaryColor}20`,
                        border: `2px solid ${theme.primaryColor}4d`,
                        boxShadow: `0 0 30px ${theme.primaryColor}4d, 0 0 60px ${theme.secondaryColor}33`
                    }}
                >
                    <div className={styles.infoItem}>
                        <span className={styles.icon}>📅</span>
                        <span className={styles.infoText}>{event.date}</span>
                    </div>

                    <div className={styles.infoItem}>
                        <span className={styles.icon}>🕔</span>
                        <span className={styles.infoText}>{event.time}</span>
                    </div>

                    <div className={styles.infoItem}>
                        <span className={styles.icon}>📍</span>
                        <span className={styles.infoText}>{event.location}</span>
                    </div>

                    {event.details && (
                        <div className={styles.infoItem}>
                            <span className={styles.infoText}>
                                {event.details.split('\n').map((line, i) => (
                                    <span key={i}>
                                        {line}
                                        {i < event.details.split('\n').length - 1 && <br />}
                                    </span>
                                ))}
                            </span>
                        </div>
                    )}

                    {event.price?.enabled && (
                        <div className={styles.infoItem}>
                            <span className={styles.infoText} style={{ color: theme.accentColor, fontWeight: 'bold' }}>
                                💵 Cuota de recuperación: ${event.price.amount} {event.price.currency}
                            </span>
                        </div>
                    )}

                    {event.capacity?.enabled && (
                        <div className={styles.infoItem}>
                            <span className={styles.infoText} style={{ color: theme.secondaryColor }}>
                                ⚠️ Cupo limitado: {event.capacity.limit} personas
                            </span>
                        </div>
                    )}
                </motion.div>

                {/* RSVP Section */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 1 }}
                    className={styles.rsvpSection}
                >
                    <h3 className={styles.rsvpTitle} style={{ color: theme.accentColor }}>
                        RSVP INDISPENSABLE
                    </h3>

                    <motion.button
                        className={styles.rsvpButton}
                        onClick={() => setIsModalOpen(true)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
                        }}
                    >
                        CONFIRMAR ASISTENCIA
                    </motion.button>
                </motion.div>

                {/* Decorative elements */}
                <div className={styles.sparkles}>
                    {[...Array(5)].map((_, i) => (
                        <motion.div
                            key={i}
                            className={styles.sparkle}
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: [0, 1, 0],
                                scale: [0, 1, 0],
                                rotate: [0, 180, 360],
                            }}
                            transition={{
                                duration: 2,
                                delay: i * 0.3,
                                repeat: Infinity,
                                repeatDelay: 1,
                            }}
                            style={{
                                left: `${20 + i * 15}%`,
                                top: `${30 + (i % 3) * 20}%`,
                            }}
                        >
                            ✨
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* RSVP Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <RSVPModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        eventSlug={slug}
                        theme={theme}
                    />
                )}
            </AnimatePresence>
        </main>
    )
}
