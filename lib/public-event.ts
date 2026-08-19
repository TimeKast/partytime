import type { Event as DatabaseEvent } from '@/lib/schema'
import {
    normalizeBackgroundImageUrl,
    normalizeEventPresentation,
} from '@/lib/event-presentation'
import type { PublicEvent } from '@/types/event'

const DEFAULT_THEME: PublicEvent['theme'] = {
    primaryColor: '#FF1493',
    secondaryColor: '#00FFFF',
    accentColor: '#FFD700',
    backgroundColor: '#1a0033',
    textColor: '#ffffff',
}

/** Explicit allowlist for the unauthenticated invitation endpoint. */
export function buildPublicEventDto(event: DatabaseEvent): PublicEvent {
    const theme = event.theme ?? DEFAULT_THEME

    return {
        slug: event.slug,
        title: event.title,
        displayTitle: event.displayTitle ?? '',
        subtitle: event.subtitle ?? '',
        date: event.date ?? '',
        time: event.time ?? '',
        location: event.location ?? '',
        details: event.details ?? '',
        price: {
            enabled: event.priceEnabled ?? false,
            amount: event.priceAmount ?? 0,
            currency: event.priceCurrency ?? 'MXN',
        },
        paymentRequired: event.paymentRequired ?? false,
        capacity: {
            enabled: event.capacityEnabled ?? false,
            limit: event.capacityLimit ?? 0,
        },
        backgroundImage: {
            url: normalizeBackgroundImageUrl(event.backgroundImageUrl) || '/background.png',
        },
        ...normalizeEventPresentation(event),
        theme: {
            primaryColor: theme.primaryColor || DEFAULT_THEME.primaryColor,
            secondaryColor: theme.secondaryColor || DEFAULT_THEME.secondaryColor,
            accentColor: theme.accentColor || DEFAULT_THEME.accentColor,
            backgroundColor: theme.backgroundColor || DEFAULT_THEME.backgroundColor,
            textColor: theme.textColor || DEFAULT_THEME.textColor,
        },
        isActive: event.isActive ?? true,
        requirePlusOneName: event.requirePlusOneName ?? false,
        rsvpClosed: event.rsvpClosed ?? false,
        rsvpClosedMessage: event.rsvpClosedMessage ?? '¡Nos vemos en el próximo evento!',
    }
}
