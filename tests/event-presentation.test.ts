import { describe, expect, it } from 'vitest'
import {
    LEGACY_PRESENTATION_DEFAULTS,
    NEW_EVENT_PRESENTATION_DEFAULTS,
    clampOverlayStrength,
    getVisibleEventDetails,
    getContrastTextColor,
    getContrastRatio,
    getSolidCtaColors,
    normalizeSolidHexColor,
    normalizeBackgroundImageUrl,
    normalizeEventPresentation,
    normalizeRsvpButtonLabel,
    parseBackgroundImageFit,
    parseBackgroundImagePosition,
    parseEventPresentationPatch,
    parseStrictHexColor,
    parseOverlayStrength,
    parsePresentationMode,
    resolveBackgroundImagePosition,
} from '@/lib/event-presentation'

describe('event presentation contract', () => {
    it('normalizes missing transitional values to classic defaults', () => {
        expect(normalizeEventPresentation({})).toEqual(LEGACY_PRESENTATION_DEFAULTS)
        expect(normalizeEventPresentation({ presentationMode: null })).toEqual(LEGACY_PRESENTATION_DEFAULTS)
    })

    it('uses modern details defaults for newly created events', () => {
        expect(NEW_EVENT_PRESENTATION_DEFAULTS).toEqual({
            presentationMode: 'modern_details',
            rsvpTitle: '',
            rsvpButtonLabel: 'Confirmar asistencia',
            backgroundOverlayStrength: 35,
            backgroundImageFit: 'cover',
            backgroundImagePosition: 'center',
        })
    })

    it('parses only supported presentation modes, image fits, and image positions', () => {
        expect(parsePresentationMode('classic')).toBe('classic')
        expect(parsePresentationMode('modern_details')).toBe('modern_details')
        expect(parsePresentationMode('artwork_only')).toBe('artwork_only')
        expect(parsePresentationMode('future_mode')).toBeNull()
        expect(parseBackgroundImageFit('cover')).toBe('cover')
        expect(parseBackgroundImageFit('contain')).toBe('contain')
        expect(parseBackgroundImageFit('fill')).toBeNull()
        expect(parseBackgroundImagePosition('center')).toBe('center')
        expect(parseBackgroundImagePosition('top')).toBe('top')
        expect(parseBackgroundImagePosition('bottom')).toBeNull()
    })

    it('defaults missing image position to center and accepts only supported patch values', () => {
        expect(normalizeEventPresentation({}).backgroundImagePosition).toBe('center')
        expect(parseEventPresentationPatch({ backgroundImagePosition: 'top' })).toEqual({
            success: true,
            value: { backgroundImagePosition: 'top' },
        })
        expect(parseEventPresentationPatch({ backgroundImagePosition: 'bottom' })).toEqual({
            success: false,
            error: 'Posición de imagen inválida',
        })
    })

    it('applies top only to artwork-only contained images', () => {
        expect(resolveBackgroundImagePosition({
            presentationMode: 'artwork_only',
            backgroundImageFit: 'contain',
            backgroundImagePosition: 'top',
        })).toBe('top')

        for (const presentation of [
            { presentationMode: 'artwork_only', backgroundImageFit: 'contain', backgroundImagePosition: 'center' },
            { presentationMode: 'artwork_only', backgroundImageFit: 'cover', backgroundImagePosition: 'top' },
            { presentationMode: 'classic', backgroundImageFit: 'contain', backgroundImagePosition: 'top' },
            { presentationMode: 'modern_details', backgroundImageFit: 'contain', backgroundImagePosition: 'top' },
        ] as const) {
            expect(resolveBackgroundImagePosition(presentation)).toBe('center')
        }
    })

    it('accepts overlay boundaries, rejects invalid input, and clamps display values', () => {
        expect(parseOverlayStrength(0)).toBe(0)
        expect(parseOverlayStrength(80)).toBe(80)
        expect(parseOverlayStrength(-1)).toBeNull()
        expect(parseOverlayStrength(81)).toBeNull()
        expect(parseOverlayStrength(12.5)).toBeNull()
        expect(clampOverlayStrength(-10)).toBe(0)
        expect(clampOverlayStrength(120)).toBe(80)
    })

    it('omits blank and disabled details while preserving enabled values', () => {
        expect(getVisibleEventDetails({
            presentationMode: 'modern_details',
            date: '  ',
            time: '19:00',
            location: '',
            details: 'Terraza',
            price: { enabled: false, amount: 500, currency: 'MXN' },
            capacity: { enabled: true, limit: 80 },
        })).toEqual([
            { kind: 'time', label: 'Hora', value: '19:00' },
            { kind: 'details', label: 'Detalles', value: 'Terraza' },
            { kind: 'capacity', label: 'Cupo', value: '80 personas' },
        ])
    })

    it('returns no public detail rows in artwork-only mode', () => {
        expect(getVisibleEventDetails({
            presentationMode: 'artwork_only',
            date: '13 de julio',
            time: '19:00',
            location: 'Ciudad de México',
            details: 'Terraza',
            price: { enabled: true, amount: 500, currency: 'MXN' },
            capacity: { enabled: true, limit: 80 },
        })).toEqual([])
    })

    it('requires a trimmed RSVP button label between 1 and 80 characters', () => {
        expect(normalizeRsvpButtonLabel('  Confirmar  ')).toBe('Confirmar')
        expect(normalizeRsvpButtonLabel('   ')).toBeNull()
        expect(normalizeRsvpButtonLabel('x'.repeat(81))).toBeNull()
    })

    it('preserves omitted patch fields and accepts explicit empty RSVP title and zero overlay', () => {
        expect(parseEventPresentationPatch({})).toEqual({ success: true, value: {} })
        expect(parseEventPresentationPatch({ rsvpTitle: '', backgroundOverlayStrength: 0 })).toEqual({
            success: true,
            value: { rsvpTitle: '', backgroundOverlayStrength: 0 },
        })
    })

    it('rejects invalid presentation patch values', () => {
        expect(parseEventPresentationPatch({ presentationMode: 'future_mode' }).success).toBe(false)
        expect(parseEventPresentationPatch({ rsvpButtonLabel: '  ' }).success).toBe(false)
        expect(parseEventPresentationPatch({ backgroundImageFit: 'fill' }).success).toBe(false)
        expect(parseEventPresentationPatch({ backgroundOverlayStrength: 81 }).success).toBe(false)
    })

    it('accepts safe background URLs and rejects unsafe schemes or control characters', () => {
        expect(normalizeBackgroundImageUrl('/invitations/arte.webp')).toBe('/invitations/arte.webp')
        expect(normalizeBackgroundImageUrl('https://cdn.example.com/arte.webp')).toBe('https://cdn.example.com/arte.webp')
        expect(normalizeBackgroundImageUrl('http://cdn.example.com/arte.webp')).toBe('http://cdn.example.com/arte.webp')
        expect(normalizeBackgroundImageUrl('javascript:alert(1)')).toBeNull()
        expect(normalizeBackgroundImageUrl('data:text/html,test')).toBeNull()
        expect(normalizeBackgroundImageUrl('/image\nmalicious')).toBeNull()
    })

    it('chooses black or white CTA text with WCAG AA contrast', () => {
        expect(getContrastTextColor('#ffffff')).toBe('#000000')
        expect(getContrastTextColor('#111111')).toBe('#ffffff')
        for (const background of ['#ffffff', '#000000', '#777777', '#ff1493', '#00ffff']) {
            const text = getContrastTextColor(background)
            expect(getContrastRatio(background, text)).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('canonicalizes solid hex colors and falls back for adversarial theme values', () => {
        expect(normalizeSolidHexColor('#AbC')).toBe('#aabbcc')
        expect(getSolidCtaColors('#ffffff')).toEqual({ background: '#ffffff', text: '#000000' })

        for (const color of ['', 'transparent', 'var(--primary)', '#fff0', 'linear-gradient(red, blue)', null]) {
            const cta = getSolidCtaColors(color)
            expect(cta.background).toBe('#2563eb')
            expect(getContrastRatio(cta.background, cta.text)).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('parses only complete six-digit HEX colors for persisted theme values', () => {
        expect(parseStrictHexColor('#120b18')).toBe('#120b18')
        expect(parseStrictHexColor('#A1B2C3')).toBe('#a1b2c3')

        for (const color of ['#abc', '#12345', '#1234567', '120b18', '#12zz18', '', null]) {
            expect(parseStrictHexColor(color)).toBeNull()
        }
    })
})
