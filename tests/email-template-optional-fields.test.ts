import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    buildEventEmailData,
    buildEventEmailSubject,
    type EventEmailSource,
    type EventEmailSubjectKind,
} from '@/lib/event-email-data'
import { generateConfirmationEmail } from '@/lib/email-template'

const baseEvent: EventEmailSource = {
    title: 'Nombre interno',
    displayTitle: '',
    subtitle: '',
    date: '',
    time: '',
    location: '',
    details: '',
    priceEnabled: false,
    priceAmount: 500,
    priceCurrency: 'MXN',
    backgroundImageUrl: '/background.png',
    presentationMode: 'modern_details',
    theme: {
        primaryColor: '#111111',
        secondaryColor: '#eeeeee',
        accentColor: '#fbbf24',
        backgroundColor: '#000000',
        textColor: '#ffffff',
    },
    hostEmail: 'host@example.com',
}

function renderEvent(overrides: Partial<typeof baseEvent> = {}): string {
    return generateConfirmationEmail({
        name: 'Invitada',
        plusOne: false,
        cancelUrl: 'https://example.com/cancel',
        eventData: buildEventEmailData({ ...baseEvent, ...overrides }),
    })
}

describe('optional event fields in email', () => {
    it.each<[EventEmailSubjectKind, string]>([
        ['confirmation', 'Confirmación - Título visible'],
        ['reminder', 'Recordatorio - Título visible'],
        ['re-invitation', 'Te extrañamos - Título visible'],
    ])('composes the %s subject from the shared mapped title', (kind, expected) => {
        const eventData = buildEventEmailData({
            ...baseEvent,
            title: 'Nombre interno',
            displayTitle: '  Título visible  ',
        })

        expect(buildEventEmailSubject(eventData, kind)).toBe(expected)
    })

    it('uses the internal title in every subject path when display title is blank', () => {
        const eventData = buildEventEmailData({
            ...baseEvent,
            title: 'Nombre interno',
            displayTitle: '   ',
        })

        expect(['confirmation', 'reminder', 're-invitation'].map(kind => (
            buildEventEmailSubject(eventData, kind as EventEmailSubjectKind)
        ))).toEqual([
            'Confirmación - Nombre interno',
            'Recordatorio - Nombre interno',
            'Te extrañamos - Nombre interno',
        ])
    })

    it.each([
        ['public confirmation', 'app/api/rsvp/route.ts', "buildEventEmailSubject(eventData, 'confirmation')"],
        ['individual admin', 'app/api/admin/send-email/route.ts', 'buildEventEmailSubject'],
        ['bulk admin', 'app/api/admin/send-bulk-email/route.ts', 'buildEventEmailSubject'],
        ['bulk reminder', 'app/api/admin/send-bulk-reminder/route.ts', "buildEventEmailSubject(eventData, 'reminder')"],
        ['scheduled reminder', 'app/api/cron/send-reminders/route.ts', 'buildEventEmailSubject(eventData, "reminder")'],
    ])('routes the %s subject through the shared mapped-title helper', (_name, path, expectedCall) => {
        const source = readFileSync(path, 'utf8')

        expect(source).toContain('buildEventEmailData')
        expect(source).toContain(expectedCall)
    })

    it('omits empty subtitle, logistics, details card, and additional details block', () => {
        const html = renderEvent()

        expect(html).not.toContain('<h2')
        expect(html).not.toContain('>Fecha</p>')
        expect(html).not.toContain('>Hora</p>')
        expect(html).not.toContain('>Lugar</p>')
        expect(html).not.toContain('Detalles adicionales')
        expect(html).not.toContain('<br>\n                                  \n')
    })

    it('renders one populated logistics row without a trailing divider', () => {
        const html = renderEvent({ date: '13 de julio' })

        expect(html).toContain('>Fecha</p>')
        expect(html).not.toContain('>Hora</p>')
        expect(html).not.toContain('>Lugar</p>')
        expect(html).not.toContain('border-bottom: 1px solid #333340')
    })

    it('includes price only while its toggle is enabled', () => {
        expect(buildEventEmailData(baseEvent).price).toBeNull()
        expect(buildEventEmailData({ ...baseEvent, priceEnabled: true }).price).toBe('$500 MXN')
    })

    it('keeps populated logistics in email for artwork-only invitations', () => {
        const data = buildEventEmailData({
            ...baseEvent,
            presentationMode: 'artwork_only',
            location: 'Ciudad de México',
        })

        expect(data.location).toBe('Ciudad de México')
    })

    it('prefers display title and falls back to the required internal title', () => {
        expect(buildEventEmailData({ ...baseEvent, displayTitle: 'Título visible' }).title).toBe('Título visible')
        expect(buildEventEmailData(baseEvent).title).toBe('Nombre interno')
    })
})
