import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(path, 'utf8')

describe('public RSVP payment disclosure', () => {
    const publicEventPage = source('app/[slug]/components/EventPageClient.tsx')
    const invitationPage = source('app/invite/InvitationRegistrationClient.tsx')
    const modal = source('app/components/RSVPModal.tsx')
    const modalCss = source('app/components/RSVPModal.module.css')

    it('uses event paymentRequired for the normal flow and the effective link flag for invitation flow', () => {
        expect(publicEventPage).toContain('getPublicPaymentPricing(event.paymentRequired, event.price)')
        expect(publicEventPage).toContain('paymentPricing={paymentPricing ?? undefined}')
        expect(invitationPage).toContain('getPublicPaymentPricing(requiresPayment, registrationEvent.price)')
        expect(invitationPage).toContain('paymentPricing={paymentPricing ?? undefined}')
        expect(invitationPage).not.toContain('getPublicPaymentPricing(registrationEvent.paymentRequired')
        expect(invitationPage).toContain('state.event.paymentRequired && !state.requiresPayment')
        expect(invitationPage).toContain('? { ...state.event.price, enabled: false }')
    })

    it('announces a dynamic one-or-two-person total before submission', () => {
        expect(modal).toContain('getPublicPaymentBreakdown(paymentPricing, formData.plusOne)')
        expect(modal).toContain('aria-live="polite"')
        expect(modal).toContain('aria-atomic="true"')
        expect(modal).toContain('role="status"')
        expect(modal).toContain("paymentBreakdown.quantity === 1 ? 'cuota' : 'cuotas'")
        expect(modal).toContain('Total {formatWholeCurrencyAmount(paymentBreakdown.totalAmount')
        expect(modal).toContain('Si vienes con +1, se cobran dos cuotas.')
        expect(modal).toMatch(/paymentBreakdown\s*\? 'Continuar al pago'/)
        expect(modal).toContain("aria-describedby={paymentBreakdown ? 'rsvp-payment-helper' : undefined}")
    })

    it('keeps the payment summary readable and stacked on narrow screens', () => {
        expect(modalCss).toMatch(/\.paymentSummary\s*\{[\s\S]*?display:\s*grid;/)
        expect(modalCss).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.paymentSummaryHeader,[\s\S]*?flex-direction:\s*column;/)
        expect(modal).toContain("document.body.style.overflow = 'hidden'")
        expect(modal).toContain("document.documentElement.style.overflow = 'hidden'")
        expect(modal).toContain('document.body.style.overflow = previousBodyOverflow')
        expect(modal).toContain('document.documentElement.style.overflow = previousRootOverflow')
    })
})
