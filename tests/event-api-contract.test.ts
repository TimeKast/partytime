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
    paymentRequired: false,
    capacityEnabled: false,
    capacityLimit: 0,
    backgroundImageUrl: '/background.png',
    presentationMode: 'classic',
    rsvpTitle: 'RSVP INDISPENSABLE',
    rsvpButtonLabel: 'CONFIRMAR ASISTENCIA',
    backgroundOverlayStrength: 20,
    backgroundImageFit: 'cover',
    backgroundImagePosition: 'top',
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
    emailVerificationEnabled: false,
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
            backgroundImagePosition: 'center',
        })
    })

    it('accepts top image position on create and update', () => {
        expect(parseCreateEventRequest({
            slug: 'nueva-fiesta',
            title: 'Nueva fiesta',
            backgroundImagePosition: 'top',
        })).toMatchObject({
            success: true,
            value: { backgroundImagePosition: 'top' },
        })

        expect(parseEventUpdateRequest(
            { backgroundImagePosition: 'top' },
            existingEvent.slug,
            existingEvent,
        )).toEqual({
            success: true,
            value: {
                newSlug: undefined,
                updates: { backgroundImagePosition: 'top' },
            },
        })
    })

    it.each([
        { presentationMode: 'future_mode' },
        { rsvpButtonLabel: '   ' },
        { backgroundOverlayStrength: 81 },
        { backgroundImageFit: 'stretch' },
        { backgroundImagePosition: 'bottom' },
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

        const omittedPosition = parseEventUpdateRequest(
            { rsvpTitle: 'Nuevo RSVP' },
            existingEvent.slug,
            existingEvent,
        )
        expect(omittedPosition).toMatchObject({
            success: true,
            value: { updates: { rsvpTitle: 'Nuevo RSVP' } },
        })
        expect(omittedPosition.success && omittedPosition.value.updates)
            .not.toHaveProperty('backgroundImagePosition')
    })

    it('registers emailVerificationEnabled as a writable, patch-semantics boolean field (ISSUE-008)', () => {
        expect(parseEventUpdateRequest(
            { emailVerificationEnabled: true },
            existingEvent.slug,
            existingEvent,
        )).toEqual({
            success: true,
            value: {
                newSlug: undefined,
                updates: { emailVerificationEnabled: true },
            },
        })

        // Omitted entirely: leaves the stored value untouched (patch semantics).
        const omitted = parseEventUpdateRequest({ rsvpTitle: 'Nuevo RSVP' }, existingEvent.slug, existingEvent)
        expect(omitted.success && omitted.value.updates).not.toHaveProperty('emailVerificationEnabled')

        // Wrong type rejects the whole PUT instead of silently coercing.
        expect(parseEventUpdateRequest(
            { emailVerificationEnabled: 'yes' },
            existingEvent.slug,
            existingEvent,
        )).toEqual({
            success: false,
            error: 'emailVerificationEnabled debe ser booleano',
        })
    })

    it('registers paymentRequired as a writable, patch-semantics boolean field, cross-validated against price (ISSUE-010)', () => {
        expect(parseEventUpdateRequest(
            { paymentRequired: true },
            existingEvent.slug,
            { ...existingEvent, priceEnabled: true, priceAmount: 250, priceCurrency: 'MXN' },
        )).toEqual({
            success: true,
            value: {
                newSlug: undefined,
                updates: { paymentRequired: true },
            },
        })

        // Omitted entirely: leaves the stored value untouched (patch semantics).
        const omitted = parseEventUpdateRequest({ rsvpTitle: 'Nuevo RSVP' }, existingEvent.slug, existingEvent)
        expect(omitted.success && omitted.value.updates).not.toHaveProperty('paymentRequired')

        // Wrong type rejects the whole PUT instead of silently coercing.
        expect(parseEventUpdateRequest(
            { paymentRequired: 'yes' },
            existingEvent.slug,
            existingEvent,
        )).toEqual({
            success: false,
            error: 'paymentRequired debe ser booleano',
        })
    })

    it('rejects payment_required=true when the stored/effective price is not eligible (ISSUE-010)', () => {
        // No price configured at all on the existing event (defaults).
        expect(parseEventUpdateRequest(
            { paymentRequired: true },
            existingEvent.slug,
            existingEvent,
        )).toMatchObject({ success: false })

        // Explicitly turning price OFF in the same payload as payment_required=true.
        expect(parseEventUpdateRequest(
            { paymentRequired: true, price: { enabled: false } },
            existingEvent.slug,
            { ...existingEvent, priceEnabled: true, priceAmount: 250, priceCurrency: 'MXN' },
        )).toMatchObject({ success: false })

        // Disabling price_enabled while payment_required stays true in the
        // STORED event (paymentRequired omitted from this request) — the
        // exact acceptance criterion scenario from the issue.
        expect(parseEventUpdateRequest(
            { price: { enabled: false } },
            existingEvent.slug,
            { ...existingEvent, priceEnabled: true, priceAmount: 250, priceCurrency: 'MXN', paymentRequired: true },
        )).toMatchObject({ success: false })

        // A non-whitelisted currency also disqualifies it.
        expect(parseEventUpdateRequest(
            { paymentRequired: true, price: { enabled: true, amount: 250, currency: 'EUR' } },
            existingEvent.slug,
            existingEvent,
        )).toMatchObject({ success: false })
    })

    it.each([
        { presentationMode: 'future_mode' },
        { rsvpButtonLabel: '' },
        { backgroundOverlayStrength: -1 },
        { backgroundImageFit: 'fill' },
        { backgroundImagePosition: 'bottom' },
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
