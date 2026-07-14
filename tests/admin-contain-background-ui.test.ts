import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EventPresentationSettings, {
    classifyEyeDropperError,
} from '@/app/admin/components/EventPresentationSettings'
import type { EventPresentation } from '@/lib/event-presentation'

vi.stubGlobal('React', React)

const presentation: EventPresentation = {
    presentationMode: 'artwork_only',
    rsvpTitle: 'RSVP',
    rsvpButtonLabel: 'Confirmar',
    backgroundOverlayStrength: 20,
    backgroundImageFit: 'contain',
    backgroundImagePosition: 'center',
}

function render(overrides: Partial<EventPresentation> = {}) {
    return renderToStaticMarkup(React.createElement(EventPresentationSettings, {
        value: { ...presentation, ...overrides },
        onChange: () => undefined,
        backgroundColor: '#120b18',
        backgroundImageUrl: 'https://images.example.com/party.jpg',
        onBackgroundColorChange: () => undefined,
    }))
}

describe('admin contain background controls', () => {
    it('renders the 9:16 preview for both fits and color controls only for contain', () => {
        const contain = render({ backgroundImageFit: 'contain' })
        expect(contain).toContain('Color de relleno')
        expect(contain).toContain('Se muestra en las áreas libres cuando la imagen completa no llena la pantalla.')
        expect(contain).toContain('type="color"')
        expect(contain).toContain('pattern="^#[0-9A-Fa-f]{6}$"')
        expect(contain).toContain('Previsualización móvil 9:16')
        expect(contain).toContain('https://images.example.com/party.jpg')
        expect(contain).toContain('background-color:#120b18')
        expect(contain).toContain('object-fit:contain')

        const cover = render({ backgroundImageFit: 'cover' })
        expect(cover).not.toContain('Color de relleno')
        expect(cover).toContain('Previsualización móvil 9:16')
        expect(cover).toContain('object-fit:cover')
    })

    it('shows image alignment only for artwork-only contain and previews the resolved position', () => {
        const top = render({ backgroundImagePosition: 'top' })
        expect(top).toContain('Alineación de la imagen completa')
        expect(top).toContain('Centrada (comportamiento actual)')
        expect(top).toContain('Arriba')
        expect(top).toContain('Usa “Arriba” si el CTA cubre contenido importante en la parte inferior del arte.')
        expect(top).toContain('object-fit:contain;object-position:top')

        const center = render({ backgroundImagePosition: 'center' })
        expect(center).toContain('object-position:center')

        for (const overrides of [
            { presentationMode: 'artwork_only', backgroundImageFit: 'cover', backgroundImagePosition: 'top' },
            { presentationMode: 'classic', backgroundImageFit: 'contain', backgroundImagePosition: 'top' },
            { presentationMode: 'modern_details', backgroundImageFit: 'contain', backgroundImagePosition: 'top' },
        ] as const) {
            const markup = render(overrides)
            expect(markup).not.toContain('Alineación de la imagen completa')
            expect(markup).toContain('object-position:center')
        }
    })

    it('wires image position through the admin load/save form', async () => {
        const source = await import('node:fs').then(({ readFileSync }) => (
            readFileSync('app/admin/page.tsx', 'utf8')
        ))

        expect(source.match(/backgroundImagePosition/g)?.length).toBeGreaterThanOrEqual(3)
    })

    it('treats AbortError as cancellation and other failures as manual-fallback errors', () => {
        expect(classifyEyeDropperError({ name: 'AbortError' })).toBe('cancelled')
        expect(classifyEyeDropperError({ name: 'NotAllowedError' })).toBe('error')
        expect(classifyEyeDropperError(new Error('unknown'))).toBe('error')
    })

    it('uses native progressive enhancement without canvas or remote image fetching', async () => {
        const source = await import('node:fs').then(({ readFileSync }) => (
            readFileSync('app/admin/components/EventPresentationSettings.tsx', 'utf8')
        ))

        expect(source).toContain('window.isSecureContext')
        expect(source).toContain('.open()')
        expect(source).not.toContain('canvas')
        expect(source).not.toContain('fetch(')
    })
})
