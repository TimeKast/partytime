import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRsvpGetDto } from '@/app/api/rsvp/get/dto'
import { getCancelEventDetails } from '@/app/cancel/[rsvpId]/cancel-page-helpers'
import { getNextBackgroundSourceAfterError } from '@/lib/event-invitation-view-model'

const routeMocks = vi.hoisted(() => ({
  getRSVPById: vi.fn(),
  validateCancelToken: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
  getRSVPById: routeMocks.getRSVPById,
  validateCancelToken: routeMocks.validateCancelToken,
}))

const pageSource = readFileSync('app/cancel/[rsvpId]/page.tsx', 'utf8')
const pageCss = readFileSync('app/cancel/[rsvpId]/cancel.module.css', 'utf8')

describe('modify/cancel RSVP page presentation contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMocks.validateCancelToken.mockReturnValue(true)
  })

  it('uses the event artwork and presentation settings in a shared dark shell', () => {
    expect(pageSource).toContain('backgroundImage: event.backgroundImage')
    expect(pageSource).toContain('backgroundOverlayStrength: event.backgroundOverlayStrength')
    expect(pageSource).toContain('backgroundImageFit: event.backgroundImageFit')
    expect(pageSource).toContain('backgroundImagePosition: event.backgroundImagePosition')
    expect(pageSource).toContain('...(event.theme || {})')
    expect(pageSource).toContain("'--cancel-background-color': theme.backgroundColor")
    expect(pageSource.match(/<PageShell/g)).toHaveLength(4)
    expect(pageSource).toContain('setBackgroundSrc(getNextBackgroundSourceAfterError)')
    expect(pageSource).toContain('referrerPolicy="no-referrer"')

    expect(pageCss).toContain('background: rgba(15, 15, 16, 0.94);')
    expect(pageCss).toContain('border: 1px solid rgba(255, 255, 255, 0.18);')
    expect(pageCss).not.toContain('#667eea')
    expect(pageCss).not.toMatch(/\.card\s*\{[^}]*background:\s*white;/)
  })

  it('keeps controls dark, accessible, and compact on mobile', () => {
    expect(pageSource).toContain("inputProps={{ id: 'phone', name: 'phone' }}")
    expect(pageSource).toContain('role="status"')
    expect(pageSource).toContain('role="alert"')
    expect(pageSource).toContain('aria-live="polite"')

    expect(pageCss).toContain('min-height: 48px;')
    expect(pageCss).toContain('background: rgba(255, 255, 255, 0.07) !important;')
    expect(pageCss).toContain('color: #ffffff !important;')
    expect(pageCss).toContain(':focus-visible')
    expect(pageCss).toContain('env(safe-area-inset-bottom)')
    expect(pageCss).toContain('@media (max-width: 480px)')
    expect(pageCss).toContain('overflow-x: hidden;')
    expect(pageCss.match(/box-sizing: border-box;/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('uses a solid contrast-aware CTA and restrained action copy', () => {
    expect(pageSource).toContain('getSolidCtaColors(theme.primaryColor)')
    expect(pageSource).toContain("'--cancel-cta-background': ctaColors.background")
    expect(pageSource).toContain("'--cancel-cta-text': ctaColors.text")
    expect(pageSource).not.toMatch(/linear-gradient\([^\n]*theme\.primaryColor/)
    expect(pageSource).not.toContain('💾')
    expect(pageSource).not.toContain('❌ Cancelar')
    expect(pageSource).not.toContain('✅ Reconfirmar')
  })

  it('falls back once from configured artwork and stops after the bundled fallback fails', () => {
    const bundledFallback = getNextBackgroundSourceAfterError('https://example.invalid/missing.jpg')

    expect(bundledFallback).toBe('/background.png')
    expect(getNextBackgroundSourceAfterError(bundledFallback)).toBeNull()
    expect(getNextBackgroundSourceAfterError(null)).toBeNull()
  })

  it('trims event details and omits empty or whitespace-only values', () => {
    expect(getCancelEventDetails({
      date: '  16 de julio  ',
      time: '   ',
      location: '\n Terraza Norte \t',
    })).toEqual([
      { label: 'Fecha', value: '16 de julio' },
      { label: 'Ubicación', value: 'Terraza Norte' },
    ])
    expect(getCancelEventDetails({ date: '', time: null, location: undefined })).toEqual([])
  })

  it('includes plusOneName in the executable RSVP GET DTO mapper', () => {
    expect(buildRsvpGetDto({
      id: 'rsvp-1',
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+525500000000',
      plusOne: true,
      plusOneName: 'Grace',
      status: 'confirmed',
      eventId: 'party-time',
    })).toEqual({
      id: 'rsvp-1',
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+525500000000',
      plusOne: true,
      plusOneName: 'Grace',
      status: 'confirmed',
      eventId: 'party-time',
    })
  })

  it('returns plusOneName from the real RSVP GET route', async () => {
    routeMocks.getRSVPById.mockResolvedValue({
      id: 'rsvp-1',
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+525****0000',
      plusOne: true,
      plusOneName: 'Grace',
      status: 'confirmed',
      eventId: 'party-time',
    })
    const { GET } = await import('@/app/api/rsvp/get/route')
    const response = await GET(new Request(
      'http://localhost/api/rsvp/get?rsvpId=rsvp-1&token=valid-token',
    ) as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      rsvp: {
        id: 'rsvp-1',
        plusOne: true,
        plusOneName: 'Grace',
      },
    })
    expect(routeMocks.validateCancelToken).toHaveBeenCalledWith(
      'valid-token',
      'rsvp-1',
      'ada@example.com',
    )
  })

  it('keeps the page wired to the executable helpers', () => {
    expect(pageSource).toContain('getCancelEventDetails(eventData)')
    expect(pageSource).toContain('setPlusOneName(data.rsvp.plusOneName || \'\')')
    expect(pageSource).toContain("plusOneName: plusOne ? plusOneName : ''")
  })
})
