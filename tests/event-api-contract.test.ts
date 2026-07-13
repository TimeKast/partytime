import { describe, expect, it, vi } from 'vitest'
import type { Event as DatabaseEvent } from '@/lib/schema'
import {
    parseCreateEventRequest,
    parseEventUpdateRequest,
    parseFullUpdatePrice,
    validateAndApplyEventUpdate,
} from '@/lib/event-api-contract'

const existingEvent: DatabaseEvent = {
    id: 'event-id',
    slug: 'evento-original',
    title: 'Evento original',
    displayTitle: '',
    subtitle: '',
    date: '',
    time: '',
    location: '',
    details: '',
    priceEnabled: false,
    priceAmount: 0,
    priceCurrency: 'MXN',
    capacityEnabled: false,
    capacityLimit: 0,
    backgroundImageUrl: '/background.png',
    presentationMode: 'classic',
    rsvpTitle: 'RSVP INDISPENSABLE',
    rsvpButtonLabel: 'CONFIRMAR ASISTENCIA',
    backgroundOverlayStrength: 20,
    backgroundImageFit: 'cover',
    ogImageUrl: null,
    theme: {
        primaryColor: '#FF1493',
        secondaryColor: '#00FFFF',
        accentColor: '#FFD700',
        backgroundColor: '#1a0033',
        textColor: '#ffffff',
    },
    hostName: '',
    hostEmail: '',
    hostPhone: '',
    isActive: true,
    rsvpClosed: false,
    rsvpClosedMessage: '¡Nos vemos en el próximo evento!',
    requirePlusOneName: false,
    emailConfirmationEnabled: false,
    reminderEnabled: false,
    reminderScheduledAt: null,
    reminderSentAt: null,
    createdAt: new Date('2026-07-13T00:00:00Z'),
    updatedAt: new Date('2026-07-13T00:00:00Z'),
}

describe('event API request contracts', () => {
    it('applies modern presentation defaults while allowing optional public fields on create', () => {
        const result = parseCreateEventRequest({ slug: 'nueva-fiesta', title: 'Nueva fiesta' })

        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.value).toMatchObject({
            slug: 'nueva-fiesta',
            title: 'Nueva fiesta',
            displayTitle: '',
            subtitle: '',
            date: '',
            time: '',
            location: '',
            details: '',
            presentationMode: 'modern_details',
            rsvpTitle: '',
            rsvpButtonLabel: 'Confirmar asistencia',
            backgroundOverlayStrength: 35,
            backgroundImageFit: 'cover',
        })
    })

    it.each([
        { presentationMode: 'future_mode' },
        { rsvpButtonLabel: '   ' },
        { backgroundOverlayStrength: 81 },
        { backgroundImageFit: 'stretch' },
    ])('rejects invalid presentation create payload %#', presentation => {
        expect(parseCreateEventRequest({
            slug: 'nueva-fiesta',
            title: 'Nueva fiesta',
            ...presentation,
        }).success).toBe(false)
    })

    it('requires an own nonnegative integer amount when create enables price', () => {
        expect(parseCreateEventRequest({
            slug: 'nueva-fiesta',
            title: 'Nueva fiesta',
            price: { enabled: true },
        })).toEqual({ success: false, error: 'La cuota es requerida al habilitar el precio' })

        expect(parseCreateEventRequest({
            slug: 'nueva-fiesta',
            title: 'Nueva fiesta',
            price: Object.create({ amount: 500 }, { enabled: { value: true, enumerable: true } }),
        }).success).toBe(false)
    })

    it('requires an own nonnegative integer amount when a full update enables price', () => {
        expect(parseFullUpdatePrice({ enabled: true })).toEqual({
            success: false,
            error: 'La cuota es requerida al habilitar el precio',
        })
        expect(parseFullUpdatePrice({ enabled: true, amount: 0 })).toMatchObject({
            success: true,
            value: { priceEnabled: true, priceAmount: 0 },
        })
    })

    it('allows patch updates to reuse only a valid existing price amount', () => {
        expect(parseEventUpdateRequest(
            { price: { enabled: true } },
            existingEvent.slug,
            { ...existingEvent, priceAmount: 250 },
        ).success).toBe(true)
        expect(parseEventUpdateRequest(
            { price: { enabled: true } },
            existingEvent.slug,
            { ...existingEvent, priceAmount: null },
        ).success).toBe(false)
    })

    it('uses patch semantics and preserves every omitted event property', () => {
        expect(parseEventUpdateRequest(
            { rsvpTitle: '', backgroundOverlayStrength: 0 },
            existingEvent.slug,
            existingEvent,
        )).toEqual({
            success: true,
            value: {
                newSlug: undefined,
                updates: { rsvpTitle: '', backgroundOverlayStrength: 0 },
            },
        })
    })

    it.each([
        { presentationMode: 'future_mode' },
        { rsvpButtonLabel: '' },
        { backgroundOverlayStrength: -1 },
        { backgroundImageFit: 'fill' },
    ])('rejects invalid presentation update payload %#', presentation => {
        expect(parseEventUpdateRequest(presentation, existingEvent.slug, existingEvent).success).toBe(false)
    })

    it.each([
        { title: '   ' },
        { price: { enabled: true, amount: -1 } },
        { capacity: { enabled: true, limit: 0 } },
        { backgroundImage: { url: 'javascript:alert(1)' } },
        { rsvpButtonLabel: '   ' },
    ])('validates the entire PUT before mutating a requested slug %#', async invalidLaterField => {
        const updateSlug = vi.fn(async () => ({ event: existingEvent, updatedRsvps: 0 }))
        const updateEvent = vi.fn(async () => existingEvent)

        const result = await validateAndApplyEventUpdate(
            { newSlug: 'evento-nuevo', ...invalidLaterField },
            existingEvent.slug,
            existingEvent,
            true,
            { updateSlug, updateEvent },
        )

        expect(result).toMatchObject({ success: false, status: 400 })
        expect(updateSlug).not.toHaveBeenCalled()
        expect(updateEvent).not.toHaveBeenCalled()
    })
})
