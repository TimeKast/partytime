/**
 * Event type definition for multi-party support
 */
import type {
    BackgroundImageFit,
    BackgroundImagePosition,
    PresentationMode,
} from '@/lib/event-presentation'

export interface PublicEvent {
    slug: string           // URL-friendly identifier (e.g., 'andrreas')
    title: string
    displayTitle?: string   // Optional: empty means no visible title on the invitation page
    subtitle: string
    date: string
    time: string
    location: string
    details: string
    price: {
        enabled: boolean
        amount: number
        currency: string
    }
    capacity: {
        enabled: boolean
        limit: number
    }
    backgroundImage: {
        url: string
        uploadedAt?: string
    }
    presentationMode: PresentationMode
    rsvpTitle: string
    rsvpButtonLabel: string
    backgroundOverlayStrength: number
    backgroundImageFit: BackgroundImageFit
    backgroundImagePosition: BackgroundImagePosition
    theme: {
        primaryColor: string
        secondaryColor: string
        accentColor: string
        backgroundColor: string
        textColor: string
    }
    isActive: boolean      // Can guests still RSVP?
    requirePlusOneName?: boolean  // If true, +1 name is mandatory in RSVP
    rsvpClosed?: boolean  // If true, RSVP period is closed
    rsvpClosedMessage?: string  // Message to show when RSVP is closed
}

export interface Event extends PublicEvent {
    id?: string
    /**
     * Access role of the current authenticated user for this event.
     * Returned by `/api/events` for non-super-admin users.
     */
    accessRole?: 'manager' | 'viewer'
    contact: {
        hostName: string
        hostEmail: string
        hostPhone?: string
    }

    // Email configuration
    emailConfig: {
        confirmationEnabled: boolean  // Send automatic confirmation on RSVP
        reminderEnabled: boolean      // Enable scheduled reminder
        reminderScheduledAt: string | null  // When to send the reminder
        reminderSentAt: string | null       // When the reminder was actually sent
    }
    
    createdAt: string
    updatedAt: string
}

/**
 * Input type for creating a new event (without auto-generated fields)
 */
export type CreateEventInput = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Input type for updating an event (all fields optional)
 */
export type UpdateEventInput = Partial<Omit<Event, 'id' | 'createdAt'>>
