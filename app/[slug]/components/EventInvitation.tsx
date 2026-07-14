'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { PublicEvent } from '@/types/event'
import {
    getSolidCtaColors,
    resolveBackgroundImagePosition,
    type VisibleEventDetail,
} from '@/lib/event-presentation'
import {
    getNextBackgroundSourceAfterError,
    type EventInvitationViewModel,
} from '@/lib/event-invitation-view-model'
import styles from '../../page.module.css'

interface EventInvitationProps {
    event: PublicEvent
    viewModel: EventInvitationViewModel
    onRsvp: () => void
}

const DETAIL_ICONS: Record<VisibleEventDetail['kind'], string> = {
    date: '📅',
    time: '🕔',
    location: '📍',
    details: '',
    price: '💵',
    capacity: '⚠️',
}

const CLASSIC_OVERLAY_REFERENCE_STRENGTH = 20

function getBackgroundOverlayStyle(isClassic: boolean, strength: number, primaryColor: string) {
    if (strength === 0) {
        return { background: 'transparent' }
    }

    if (!isClassic) {
        return { backgroundColor: `rgba(0, 0, 0, ${strength / 100})` }
    }

    const scaledAlpha = (referenceAlpha: number) => Math.min(
        255,
        Math.round(referenceAlpha * strength / CLASSIC_OVERLAY_REFERENCE_STRENGTH),
    ).toString(16).padStart(2, '0')

    return {
        background: `linear-gradient(180deg, ${primaryColor}${scaledAlpha(0x10)} 0%, ${primaryColor}${scaledAlpha(0x30)} 100%)`,
    }
}

export default function EventInvitation({ event, viewModel, onRsvp }: EventInvitationProps) {
    const shouldReduceMotion = useReducedMotion()
    const [backgroundSrc, setBackgroundSrc] = useState<string | null>(viewModel.background.initialSrc)
    const { isClassic, isArtworkOnly, details } = viewModel
    const dateTimeDetails = details.filter(detail => detail.kind === 'date' || detail.kind === 'time')
    const otherDetails = details.filter(detail => detail.kind !== 'date' && detail.kind !== 'time')
    const ctaColors = getSolidCtaColors(event.theme.primaryColor)

    const handleBackgroundError = () => {
        setBackgroundSrc(getNextBackgroundSourceAfterError)
    }

    const modernEntrance = shouldReduceMotion
        ? { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } }
        : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55 } }
    const classicHeroEntrance = shouldReduceMotion
        ? { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } }
        : { initial: { opacity: 0, y: 50 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: 0.2 } }
    const classicDetailsEntrance = shouldReduceMotion
        ? { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } }
        : { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: 0.8 } }
    const classicRsvpEntrance = shouldReduceMotion
        ? { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } }
        : { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.6, delay: 1 } }

    return (
        <main
            className={`${styles.main} ${isClassic ? styles.classicMain : styles.modernMain} ${isArtworkOnly ? styles.artworkMain : ''}`}
            style={{ backgroundColor: event.theme.backgroundColor }}
        >
            <a href="/admin" className={styles.adminIcon} aria-label="Administrar evento">⚙️</a>

            <div className={styles.backgroundWrapper} aria-hidden="true">
                {backgroundSrc && (
                    // The validated URL can be external and needs a two-step runtime fallback.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={backgroundSrc}
                        alt=""
                        className={styles.backgroundImage}
                        style={{
                            objectFit: event.backgroundImageFit,
                            objectPosition: resolveBackgroundImagePosition(event),
                        }}
                        onError={handleBackgroundError}
                    />
                )}
                <div
                    className={`${styles.overlay} ${isClassic ? styles.classicOverlay : styles.modernOverlay}`}
                    style={getBackgroundOverlayStyle(
                        isClassic,
                        event.backgroundOverlayStrength,
                        event.theme.primaryColor,
                    )}
                />
            </div>

            <div className={`${styles.content} ${isClassic ? '' : styles.modernContent} ${isArtworkOnly ? styles.artworkContent : ''}`}>
                {viewModel.heading.visible || viewModel.heading.subtitle ? (
                    <motion.header
                        {...(isClassic ? classicHeroEntrance : modernEntrance)}
                        className={isClassic ? styles.hero : styles.modernHero}
                    >
                        {viewModel.heading.visible ? (
                            <h1 className={isClassic ? styles.title : styles.modernTitle}>
                                <span
                                    className={isClassic ? styles.titleLine1 : undefined}
                                    style={isClassic ? {
                                        color: event.theme.primaryColor,
                                        textShadow: `0 0 10px ${event.theme.primaryColor}cc, 0 0 20px ${event.theme.primaryColor}99, 0 0 30px ${event.theme.primaryColor}66, 3px 3px 0 ${event.theme.secondaryColor}4d`,
                                    } : undefined}
                                >
                                    {viewModel.heading.text}
                                </span>
                            </h1>
                        ) : (
                            <h1 className={styles.visuallyHidden}>{viewModel.heading.text}</h1>
                        )}
                        {viewModel.heading.subtitle && (isClassic ? (
                            <motion.h2
                                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, delay: 0.6 }}
                                className={styles.subtitle}
                                style={{
                                    color: event.theme.secondaryColor,
                                    textShadow: `0 0 10px ${event.theme.secondaryColor}cc, 0 0 20px ${event.theme.secondaryColor}80, 2px 2px 0 ${event.theme.accentColor}4d`,
                                }}
                            >
                                {viewModel.heading.subtitle}
                            </motion.h2>
                        ) : (
                            <p className={styles.modernSubtitle}>{viewModel.heading.subtitle}</p>
                        ))}
                    </motion.header>
                ) : (
                    <h1 className={styles.visuallyHidden}>{viewModel.heading.text}</h1>
                )}

                {!isArtworkOnly && details.length > 0 && (
                    <motion.section
                        {...(isClassic ? classicDetailsEntrance : modernEntrance)}
                        className={isClassic ? styles.eventInfo : styles.modernEventInfo}
                        aria-label="Información del evento"
                        style={isClassic ? {
                            background: `${event.theme.primaryColor}20`,
                            border: `2px solid ${event.theme.primaryColor}4d`,
                            boxShadow: `0 0 30px ${event.theme.primaryColor}4d, 0 0 60px ${event.theme.secondaryColor}33`,
                        } : undefined}
                    >
                        {!isClassic && dateTimeDetails.length > 0 && (
                            <div className={styles.modernDateTimeGroup}>
                                {dateTimeDetails.map(detail => <DetailRow key={detail.kind} detail={detail} modern />)}
                            </div>
                        )}
                        {(isClassic ? details : otherDetails).map(detail => (
                            <DetailRow
                                key={detail.kind}
                                detail={detail}
                                modern={!isClassic}
                                color={!isClassic ? undefined : detail.kind === 'price'
                                    ? event.theme.accentColor
                                    : detail.kind === 'capacity'
                                        ? event.theme.secondaryColor
                                        : undefined}
                            />
                        ))}
                    </motion.section>
                )}

                <motion.section
                    {...(isClassic ? classicRsvpEntrance : modernEntrance)}
                    className={`${styles.rsvpSection} ${isClassic ? '' : styles.modernRsvpSection} ${isArtworkOnly ? styles.artworkRsvpSection : ''}`}
                    aria-label="Confirmación de asistencia"
                >
                    {viewModel.rsvp.kind === 'closed' ? (
                        <>
                            {isClassic && <h2 className={styles.rsvpTitle} style={{ color: event.theme.accentColor }} aria-hidden="true">🎉</h2>}
                            <div
                                className={isClassic ? styles.rsvpButton : styles.closedStatus}
                                role="status"
                                style={isClassic ? { opacity: 0.8, cursor: 'default', padding: '1.5rem 3rem' } : undefined}
                            >
                                <span style={isClassic ? { fontSize: '1.2rem' } : undefined}>
                                    {viewModel.rsvp.status}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            {viewModel.rsvp.title && (
                                <h2
                                    className={isClassic ? styles.rsvpTitle : styles.modernRsvpTitle}
                                    style={isClassic ? { color: event.theme.accentColor } : undefined}
                                >
                                    {viewModel.rsvp.title}
                                </h2>
                            )}
                            <motion.button
                                type="button"
                                className={`${styles.rsvpButton} ${isClassic ? '' : styles.modernRsvpButton}`}
                                onClick={onRsvp}
                                whileHover={shouldReduceMotion ? undefined : isClassic ? { scale: 1.05 } : { y: -2 }}
                                whileTap={shouldReduceMotion ? undefined : isClassic ? { scale: 0.95 } : { scale: 0.98 }}
                                style={isClassic ? {
                                    background: `linear-gradient(135deg, ${event.theme.primaryColor}, ${event.theme.secondaryColor})`,
                                } : {
                                    background: ctaColors.background,
                                    color: ctaColors.text,
                                }}
                            >
                                {viewModel.rsvp.buttonLabel}
                            </motion.button>
                        </>
                    )}
                </motion.section>

                {isClassic && !shouldReduceMotion && (
                    <div className={styles.sparkles} aria-hidden="true">
                        {[...Array(5)].map((_, index) => (
                            <motion.span
                                key={index}
                                className={styles.sparkle}
                                animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], rotate: [0, 180, 360] }}
                                transition={{ duration: 2, delay: index * 0.3, repeat: Infinity, repeatDelay: 1 }}
                                style={{ left: `${20 + index * 15}%`, top: `${30 + (index % 3) * 20}%` }}
                            >
                                ✨
                            </motion.span>
                        ))}
                    </div>
                )}
            </div>
        </main>
    )
}

function DetailRow({ detail, modern, color }: { detail: VisibleEventDetail; modern: boolean; color?: string }) {
    const classicValue = detail.kind === 'price'
        ? `${detail.label}: ${detail.value}`
        : detail.kind === 'capacity'
            ? `Cupo limitado: ${detail.value}`
            : detail.value

    return (
        <div className={modern ? styles.modernInfoItem : styles.infoItem}>
            {DETAIL_ICONS[detail.kind] && <span className={styles.icon} aria-hidden="true">{DETAIL_ICONS[detail.kind]}</span>}
            <div>
                {modern && detail.kind !== 'details' && <span className={styles.modernInfoLabel}>{detail.label}</span>}
                <span className={modern ? styles.modernInfoText : styles.infoText} style={color ? { color } : undefined}>
                    {modern ? detail.value : classicValue}
                </span>
            </div>
        </div>
    )
}
