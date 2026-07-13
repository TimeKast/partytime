import type { EventData } from './email-template'
import { normalizeOptionalString } from './event-presentation'

export interface EventEmailSource {
    title: unknown
    displayTitle?: unknown
    subtitle?: unknown
    date?: unknown
    time?: unknown
    location?: unknown
    details?: unknown
    priceEnabled?: boolean | null
    priceAmount?: number | null
    priceCurrency?: unknown
    backgroundImageUrl?: string | null
    presentationMode?: unknown
    theme?: {
        primaryColor?: string
        secondaryColor?: string
        accentColor?: string
        backgroundColor?: string
        textColor?: string
    } | null
    hostEmail?: string | null
}

const DEFAULT_EMAIL_THEME = {
    primaryColor: '#FF1493',
    secondaryColor: '#00FFFF',
    accentColor: '#FFD700',
    backgroundColor: '#1a0033',
}

export function buildEventEmailData(event: EventEmailSource): EventData {
    const internalTitle = normalizeOptionalString(event.title) || 'Evento'
    const displayTitle = normalizeOptionalString(event.displayTitle)
    const currency = normalizeOptionalString(event.priceCurrency) || 'MXN'
    const theme = event.theme || {}

    return {
        title: displayTitle || internalTitle,
        subtitle: normalizeOptionalString(event.subtitle),
        date: normalizeOptionalString(event.date),
        time: normalizeOptionalString(event.time),
        location: normalizeOptionalString(event.location),
        details: normalizeOptionalString(event.details),
        price: event.priceEnabled && typeof event.priceAmount === 'number'
            ? `$${event.priceAmount} ${currency}`
            : null,
        backgroundImageUrl: event.backgroundImageUrl || '/background.png',
        theme: {
            primaryColor: theme.primaryColor || DEFAULT_EMAIL_THEME.primaryColor,
            secondaryColor: theme.secondaryColor || DEFAULT_EMAIL_THEME.secondaryColor,
            accentColor: theme.accentColor || DEFAULT_EMAIL_THEME.accentColor,
            backgroundColor: theme.backgroundColor || DEFAULT_EMAIL_THEME.backgroundColor,
        },
        contact: {
            hostEmail: event.hostEmail || undefined,
        },
    }
}

export type EventEmailSubjectKind = 'confirmation' | 'reminder' | 're-invitation'

const EMAIL_SUBJECT_PREFIX: Record<EventEmailSubjectKind, string> = {
    confirmation: 'Confirmación',
    reminder: 'Recordatorio',
    're-invitation': 'Te extrañamos',
}

export function buildEventEmailSubject(
    eventData: Pick<EventData, 'title'>,
    kind: EventEmailSubjectKind,
): string {
    return `${EMAIL_SUBJECT_PREFIX[kind]} - ${eventData.title}`
}
