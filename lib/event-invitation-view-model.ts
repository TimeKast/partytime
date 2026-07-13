import type { PublicEvent } from '@/types/event'
import {
    getVisibleEventDetails,
    normalizeOptionalString,
    type VisibleEventDetail,
} from '@/lib/event-presentation'

const DEFAULT_BACKGROUND_IMAGE = '/background.png'
const DEFAULT_CLOSED_MESSAGE = '¡Nos vemos en el próximo evento!'

export interface InvitationHeadingViewModel {
    text: string
    visible: boolean
    subtitle: string | null
}

export type RsvpModalVariant = 'classic' | 'modern'

export type InvitationRsvpViewModel =
    | {
        kind: 'open'
        title: string | null
        buttonLabel: string
        modal: {
            variant: RsvpModalVariant
            eventSlug: string
            requirePlusOneName: boolean
        }
    }
    | {
        kind: 'closed'
        status: string
    }

export interface EventInvitationViewModel {
    pageGate: 'invitation' | 'inactive'
    inactive: {
        heading: string
        message: string
    }
    mode: PublicEvent['presentationMode']
    isClassic: boolean
    isArtworkOnly: boolean
    heading: InvitationHeadingViewModel
    details: VisibleEventDetail[]
    rsvp: InvitationRsvpViewModel
    background: {
        initialSrc: string
        fallbackSrc: typeof DEFAULT_BACKGROUND_IMAGE
    }
}

export function buildEventInvitationViewModel(event: PublicEvent): EventInvitationViewModel {
    const internalTitle = normalizeOptionalString(event.title) || 'Evento'
    const displayTitle = normalizeOptionalString(event.displayTitle)
    const isArtworkOnly = event.presentationMode === 'artwork_only'
    const visibleTitle = isArtworkOnly ? '' : displayTitle
    const subtitle = isArtworkOnly ? '' : normalizeOptionalString(event.subtitle)
    const rsvpTitle = normalizeOptionalString(event.rsvpTitle)
    const closedMessage = normalizeOptionalString(event.rsvpClosedMessage) || DEFAULT_CLOSED_MESSAGE

    return {
        pageGate: event.isActive ? 'invitation' : 'inactive',
        inactive: {
            heading: internalTitle,
            message: 'Las inscripciones para este evento están cerradas.',
        },
        mode: event.presentationMode,
        isClassic: event.presentationMode === 'classic',
        isArtworkOnly,
        heading: {
            text: visibleTitle || internalTitle,
            visible: Boolean(visibleTitle),
            subtitle: subtitle || null,
        },
        details: getVisibleEventDetails({
            presentationMode: event.presentationMode,
            date: event.date,
            time: event.time,
            location: event.location,
            details: event.details,
            price: event.price,
            capacity: event.capacity,
        }),
        rsvp: event.rsvpClosed
            ? { kind: 'closed', status: closedMessage }
            : {
                kind: 'open',
                title: rsvpTitle || null,
                buttonLabel: event.rsvpButtonLabel,
                modal: {
                    variant: event.presentationMode === 'classic' ? 'classic' : 'modern',
                    eventSlug: event.slug,
                    requirePlusOneName: event.requirePlusOneName === true,
                },
            },
        background: {
            initialSrc: normalizeOptionalString(event.backgroundImage.url) || DEFAULT_BACKGROUND_IMAGE,
            fallbackSrc: DEFAULT_BACKGROUND_IMAGE,
        },
    }
}

export function getNextBackgroundSourceAfterError(currentSrc: string | null): string | null {
    if (currentSrc && currentSrc !== DEFAULT_BACKGROUND_IMAGE) return DEFAULT_BACKGROUND_IMAGE
    return null
}
