import type { Event } from '@/lib/schema'

export type EventAccessRole = 'manager' | 'viewer'
export type EventWithAccessRole = Event & { accessRole?: EventAccessRole }

/**
 * Explicit allowlist for every authenticated admin response that carries an
 * event (list, create, update). Database Event rows contain server-only fields
 * (most importantly checkinPasswordHash), so returning a spread of the Drizzle
 * row would make every new schema column public to the browser by default.
 * Keep this DTO intentionally small: these are the fields the current admin UI
 * consumes plus a hash-free check-in readiness summary.
 */
export function toAdminEventDto(event: EventWithAccessRole) {
    return {
        id: event.id,
        slug: event.slug,
        title: event.title,
        subtitle: event.subtitle ?? '',
        date: event.date ?? '',
        time: event.time ?? '',
        location: event.location ?? '',
        isActive: event.isActive ?? false,
        ...(event.accessRole ? { accessRole: event.accessRole } : {}),
        checkin: {
            enabled: event.checkinEnabled,
            hasPassword: !!event.checkinPasswordHash,
            updatedAt: event.checkinPasswordUpdatedAt,
        },
    }
}
