import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const modalSource = readFileSync('app/components/RSVPModal.tsx', 'utf8')
const modalCss = readFileSync('app/components/RSVPModal.module.css', 'utf8')
const modernCss = modalCss.slice(modalCss.indexOf('/* Modern presentation variant */'))

describe('modern RSVP modal theme contract', () => {
    it('uses the invitation dark-card palette instead of light inline panel styles', () => {
        expect(modalSource).toContain("borderColor: 'rgba(255, 255, 255, 0.18)'")
        expect(modalSource).toContain("background: 'rgba(15, 15, 16, 0.96)'")
        expect(modalSource).not.toContain("background: 'rgba(250, 250, 249, 0.97)'")
        expect(modalSource).not.toContain("color: '#111827'")
    })

    it('keeps every modern control and feedback surface dark and readable', () => {
        expect(modernCss).toContain('color: #ffffff;')
        expect(modernCss).toContain('border: 1px solid rgba(255, 255, 255, 0.18) !important;')
        expect(modernCss).toContain('background: rgba(255, 255, 255, 0.07) !important;')
        expect(modernCss).toContain('color: rgba(255, 255, 255, 0.5) !important;')
        expect(modernCss).toContain('box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.16) !important;')
        expect(modernCss).toContain('background: rgba(15, 15, 16, 0.98) !important;')
        expect(modernCss).toContain('background: rgba(255, 255, 255, 0.06);')
        expect(modernCss).toContain('background: rgba(127, 29, 29, 0.32);')
        expect(modernCss).toContain('scrollbar-color: rgba(255, 255, 255, 0.28) rgba(255, 255, 255, 0.05);')

        expect(modernCss).not.toMatch(/background:\s*(?:#fff(?:fff)?|#f[3-ef][0-9a-f]{4})\b/i)
        expect(modernCss).not.toContain('#FF1493')
        expect(modernCss).not.toContain('#00FFFF')
        expect(modernCss).not.toContain('linear-gradient')
    })

    it('keeps the modern CTA solid and contrast-aware', () => {
        expect(modalSource).toContain('background: ctaColors.background')
        expect(modalSource).toContain('color: ctaColors.text')
    })
})
