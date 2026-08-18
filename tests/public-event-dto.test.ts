import { describe, expect, it } from 'vitest'
import type { Event as DatabaseEvent } from '@/lib/schema'
import { buildPublicEventDto } from '@/lib/public-event'

const databaseEvent: DatabaseEvent = {
    id: 'private-database-id',
    slug: 'fiesta-publica',
    title: 'Nombre interno accesible',
    displayTitle: 'Fiesta pública',
    subtitle: 'Una noche especial',
    date: '20 de julio',
    time: '20:00',
    location: 'Terraza',
    details: 'Código de vestir',
    priceEnabled: true,
    priceAmount: 500,
    priceCurrency: 'MXN',
    paymentRequired: false,
    capacityEnabled: true,
    capacityLimit: 100,
    backgroundImageUrl: '/fiesta.jpg',
    presentationMode: 'modern_details',
    rsvpTitle: 'Confirma aquí',
    rsvpButtonLabel: 'Confirmar asistencia',
    backgroundOverlayStrength: 35,
    backgroundImageFit: 'contain',
    backgroundImagePosition: 'top',
    ogImageUrl: '/private-og.jpg',
    theme: {
        primaryColor: '#2563eb',
        secondaryColor: '#00ffff',
        accentColor: '#ffd700',
        backgroundColor: '#111827',
        textColor: '#ffffff',
    },
    hostName: 'Anfitrión privado',
    hostEmail: 'host@example.com',
    hostPhone: '+52 555 0100',
    isActive: true,
    rsvpClosed: false,
    rsvpClosedMessage: 'Registro terminado',
    requirePlusOneName: true,
    emailConfirmationEnabled: true,
    emailVerificationEnabled: true,
    reminderEnabled: true,
    reminderScheduledAt: new Date('2026-07-20T12:00:00Z'),
    reminderSentAt: new Date('2026-07-20T12:05:00Z'),
    createdAt: new Date('2026-07-13T00:00:00Z'),
    updatedAt: new Date('2026-07-13T01:00:00Z'),
}

describe('public event DTO', () => {
    it('returns only fields required by the public invitation', () => {
        const dto = buildPublicEventDto(databaseEvent)

        expect(Object.keys(dto).sort()).toEqual([
            'backgroundImage',
            'backgroundImageFit',
            'backgroundImagePosition',
            'backgroundOverlayStrength',
            'capacity',
            'date',
            'details',
            'displayTitle',
            'isActive',
            'location',
            'presentationMode',
            'price',
            'requirePlusOneName',
            'rsvpButtonLabel',
            'rsvpClosed',
            'rsvpClosedMessage',
            'rsvpTitle',
            'slug',
            'subtitle',
            'theme',
            'time',
            'title',
        ])
        expect(dto).toMatchObject({
            slug: 'fiesta-publica',
            title: 'Nombre interno accesible',
            backgroundImage: { url: '/fiesta.jpg' },
            price: { enabled: true, amount: 500, currency: 'MXN' },
            capacity: { enabled: true, limit: 100 },
            presentationMode: 'modern_details',
            backgroundImagePosition: 'top',
            requirePlusOneName: true,
        })
    })

    it.each([
        'id',
        'hostName',
        'hostEmail',
        'hostPhone',
        'contact',
        'emailConfirmationEnabled',
        'emailVerificationEnabled',
        'reminderEnabled',
        'reminderScheduledAt',
        'reminderSentAt',
        'emailConfig',
        'createdAt',
        'updatedAt',
        'backgroundImageUrl',
        'ogImageUrl',
        'accessRole',
    ])('does not expose denied field %s', field => {
        expect(buildPublicEventDto(databaseEvent)).not.toHaveProperty(field)
    })
})
