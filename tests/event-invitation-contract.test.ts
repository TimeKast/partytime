import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Event } from '@/types/event'
import EventInvitation from '@/app/[slug]/components/EventInvitation'
import {
    buildEventInvitationViewModel,
    getNextBackgroundSourceAfterError,
} from '@/lib/event-invitation-view-model'

vi.stubGlobal('React', React)

const baseEvent: Event = {
    slug: 'fiesta-principal',
    title: 'Nombre interno',
    displayTitle: 'Título visible',
    subtitle: 'Una gran noche',
    date: '20 de julio',
    time: '20:00',
    location: 'Terraza',
    details: 'Código de vestir',
    price: { enabled: true, amount: 500, currency: 'MXN' },
    paymentRequired: false,
    capacity: { enabled: true, limit: 100 },
    backgroundImage: { url: 'https://example.com/art.jpg' },
    presentationMode: 'classic',
    rsvpTitle: 'Confirma aquí',
    rsvpButtonLabel: 'Confirmar asistencia',
    backgroundOverlayStrength: 20,
    backgroundImageFit: 'cover',
    backgroundImagePosition: 'center',
    theme: {
        primaryColor: '#2563eb',
        secondaryColor: '#00ffff',
        accentColor: '#ffd700',
        backgroundColor: '#111827',
        textColor: '#ffffff',
    },
    contact: { hostName: '', hostEmail: '' },
    isActive: true,
    emailConfig: {
        confirmationEnabled: false,
        reminderEnabled: false,
        reminderScheduledAt: null,
        reminderSentAt: null,
    },
    requirePlusOneName: true,
    rsvpClosed: false,
    rsvpClosedMessage: 'Registro terminado',
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
}

describe('event invitation view model', () => {
    it.each([
        ['classic', 6, true],
        ['modern_details', 6, true],
        ['artwork_only', 0, false],
    ] as const)('models %s mode details and visible heading', (presentationMode, detailCount, visibleHeading) => {
        const model = buildEventInvitationViewModel({ ...baseEvent, presentationMode })

        expect(model.mode).toBe(presentationMode)
        expect(model.details).toHaveLength(detailCount)
        expect(model.heading.visible).toBe(visibleHeading)
        expect(model.heading.text).toBe(visibleHeading ? 'Título visible' : 'Nombre interno')
        expect(model.heading.subtitle).toBe(presentationMode === 'artwork_only' ? null : 'Una gran noche')
    })

    it.each([
        ['classic', 'classic'],
        ['modern_details', 'modern'],
        ['artwork_only', 'modern'],
    ] as const)(
        'maps %s presentation to the %s RSVP modal variant',
        (presentationMode, modalVariant) => {
            const model = buildEventInvitationViewModel({ ...baseEvent, presentationMode })

            expect(model.rsvp).toEqual({
                kind: 'open',
                title: 'Confirma aquí',
                buttonLabel: 'Confirmar asistencia',
                modal: {
                    variant: modalVariant,
                    eventSlug: 'fiesta-principal',
                    requirePlusOneName: true,
                },
            })
        },
    )

    it.each(['classic', 'modern_details', 'artwork_only'] as const)(
        'models only the closed RSVP status in %s mode',
        presentationMode => {
            const model = buildEventInvitationViewModel({
                ...baseEvent,
                presentationMode,
                rsvpClosed: true,
            })

            expect(model.rsvp).toEqual({ kind: 'closed', status: 'Registro terminado' })
            expect(model.rsvp).not.toHaveProperty('title')
            expect(model.rsvp).not.toHaveProperty('buttonLabel')
        },
    )

    it('uses an accessible internal heading when the visible title is hidden', () => {
        const model = buildEventInvitationViewModel({
            ...baseEvent,
            presentationMode: 'modern_details',
            displayTitle: '   ',
        })

        expect(model.heading).toEqual({
            text: 'Nombre interno',
            visible: false,
            subtitle: 'Una gran noche',
        })
    })

    it('exposes the inactive gate for the page without changing invitation mode state', () => {
        const model = buildEventInvitationViewModel({
            ...baseEvent,
            presentationMode: 'artwork_only',
            isActive: false,
        })

        expect(model.pageGate).toBe('inactive')
        expect(model.inactive).toEqual({
            heading: 'Nombre interno',
            message: 'Las inscripciones para este evento están cerradas.',
        })
        expect(model.mode).toBe('artwork_only')
    })

    it('filters disabled and empty details without hiding valid zero price', () => {
        const model = buildEventInvitationViewModel({
            ...baseEvent,
            date: '',
            time: '',
            location: '',
            details: '',
            price: { enabled: true, amount: 0, currency: 'MXN' },
            capacity: { enabled: false, limit: 100 },
        })

        expect(model.details).toEqual([
            { kind: 'price', label: 'Cuota de recuperación', value: '$0 MXN' },
        ])
    })

    it('falls back from a broken image to the bundled image and then to background color', () => {
        const model = buildEventInvitationViewModel(baseEvent)

        expect(model.background.initialSrc).toBe('https://example.com/art.jpg')
        const bundledFallback = getNextBackgroundSourceAfterError(model.background.initialSrc)
        expect(bundledFallback).toBe('/background.png')
        expect(getNextBackgroundSourceAfterError(bundledFallback)).toBeNull()
        expect(getNextBackgroundSourceAfterError(null)).toBeNull()
    })
})

describe('event invitation background image position', () => {
    it.each([
        ['artwork_only', 'contain', 'top', 'top'],
        ['artwork_only', 'contain', 'center', 'center'],
        ['artwork_only', 'cover', 'top', 'center'],
        ['modern_details', 'contain', 'top', 'center'],
        ['classic', 'contain', 'top', 'center'],
    ] as const)(
        'renders %s/%s/%s with effective %s position',
        (presentationMode, backgroundImageFit, backgroundImagePosition, expectedPosition) => {
            const event = {
                ...baseEvent,
                presentationMode,
                backgroundImageFit,
                backgroundImagePosition,
            }
            const markup = renderToStaticMarkup(React.createElement(EventInvitation, {
                event,
                viewModel: buildEventInvitationViewModel(event),
                onRsvp: () => undefined,
            }))

            expect(markup).toContain(`object-fit:${backgroundImageFit};object-position:${expectedPosition}`)
        },
    )
})

describe('event invitation background overlay', () => {
    it.each([
        ['classic', false],
        ['classic', true],
        ['modern_details', false],
        ['modern_details', true],
        ['artwork_only', false],
        ['artwork_only', true],
    ] as const)(
        'renders a fully transparent overlay in %s mode when RSVP closed is %s',
        (presentationMode, rsvpClosed) => {
            const event = {
                ...baseEvent,
                presentationMode,
                rsvpClosed,
                backgroundOverlayStrength: 0,
            }
            const markup = renderToStaticMarkup(React.createElement(EventInvitation, {
                event,
                viewModel: buildEventInvitationViewModel(event),
                onRsvp: () => undefined,
            }))

            const overlayStyle = markup.match(/<div class="[^"]*overlay[^"]*" style="([^"]*)"><\/div>/)?.[1]

            expect(overlayStyle).toBe('background:transparent')
        },
    )

    it.each([
        [20, 'background:linear-gradient(180deg, #2563eb10 0%, #2563eb30 100%)'],
        [40, 'background:linear-gradient(180deg, #2563eb20 0%, #2563eb60 100%)'],
    ] as const)('scales the classic gradient with %s%% configured strength', (backgroundOverlayStrength, expectedStyle) => {
        const event = {
            ...baseEvent,
            backgroundOverlayStrength,
        }
        const markup = renderToStaticMarkup(React.createElement(EventInvitation, {
            event,
            viewModel: buildEventInvitationViewModel(event),
            onRsvp: () => undefined,
        }))

        const overlayStyle = markup.match(/<div class="[^"]*overlay[^"]*" style="([^"]*)"><\/div>/)?.[1]

        expect(overlayStyle).toBe(expectedStyle)
    })

    it.each(['modern_details', 'artwork_only'] as const)(
        'preserves the non-classic overlay at nonzero strength in %s mode',
        presentationMode => {
            const event = {
                ...baseEvent,
                presentationMode,
                backgroundOverlayStrength: 35,
            }
            const markup = renderToStaticMarkup(React.createElement(EventInvitation, {
                event,
                viewModel: buildEventInvitationViewModel(event),
                onRsvp: () => undefined,
            }))

            const overlayStyle = markup.match(/<div class="[^"]*overlay[^"]*" style="([^"]*)"><\/div>/)?.[1]

            expect(overlayStyle).toBe('background-color:rgba(0, 0, 0, 0.35)')
        },
    )
})

describe('RSVP modal accessibility contract', () => {
    it('exposes dialog semantics and keeps keyboard focus inside the modal', () => {
        const source = readFileSync('app/components/RSVPModal.tsx', 'utf8')

        expect(source).toContain('role="dialog"')
        expect(source).toContain('aria-modal="true"')
        expect(source).toContain('aria-labelledby="rsvp-modal-title"')
        expect(source).toContain('aria-label="Cerrar formulario RSVP"')
        expect(source).toContain("event.key === 'Escape'")
        expect(source).toContain("event.key !== 'Tab'")
        expect(source).toContain('previouslyFocused?.focus()')
    })
})
