/**
 * ISSUE-008 (EPIC-003) — UX surface of the email verification flow: the
 * RSVPModal's pending state, the /verify/[slug] page, the private-page
 * headers, and the admin toggle. Same source-string contract style as
 * tests/rsvp-modal-modern-theme.test.ts and tests/rsvp-invitation-ui.test.ts
 * (this project's vitest config runs in a plain 'node' environment, no DOM).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const modalSource = readFileSync('app/components/RSVPModal.tsx', 'utf8')
const modalCss = readFileSync('app/components/RSVPModal.module.css', 'utf8')
const verifyPageSource = readFileSync('app/verify/[slug]/page.tsx', 'utf8')
const verifyCss = readFileSync('app/verify/[slug]/verify.module.css', 'utf8')
const nextConfigSource = readFileSync('next.config.js', 'utf8')
const adminPageSource = readFileSync('app/admin/page.tsx', 'utf8')
const contractSource = readFileSync('lib/event-api-contract.ts', 'utf8')
const settingsUpdateSource = readFileSync('app/api/admin/event-settings/update/route.ts', 'utf8')

describe('RSVPModal pending-verification state (ISSUE-008)', () => {
    it('branches on the pending_verification status without calling onSuccess', () => {
        expect(modalSource).toContain("const PENDING_VERIFICATION_STATUS = 'pending_verification'")
        expect(modalSource).toContain('data.status === PENDING_VERIFICATION_STATUS')
        expect(modalSource).toContain("setSubmitStatus('pending_verification')")

        // The pending branch must return before the existing onSuccess() call,
        // so it can never fire while the RSVP is still unconfirmed.
        const pendingBranchStart = modalSource.indexOf('data.status === PENDING_VERIFICATION_STATUS')
        const onSuccessCall = modalSource.indexOf('onSuccess()')
        const returnAfterPending = modalSource.indexOf('return', pendingBranchStart)
        expect(pendingBranchStart).toBeGreaterThan(-1)
        expect(returnAfterPending).toBeGreaterThan(pendingBranchStart)
        expect(returnAfterPending).toBeLessThan(onSuccessCall)
    })

    it('shows the destination email, the 24h expiry notice, and the resend control', () => {
        expect(modalSource).toContain('Revisa tu correo')
        expect(modalSource).toContain('{pendingEmail}')
        expect(modalSource).toContain('El link expira en 24 horas.')
        expect(modalSource).toContain("className={styles.resendButton}")
        expect(modalSource).toContain('onClick={handleResend}')
    })

    it('disables resend for 60s after each click and calls the opaque resend endpoint', () => {
        expect(modalSource).toContain('const RESEND_COOLDOWN_SECONDS = 60')
        expect(modalSource).toContain('setResendCooldown(RESEND_COOLDOWN_SECONDS)')
        expect(modalSource).toContain('disabled={isResending || resendCooldown > 0}')
        expect(modalSource).toContain("fetch('/api/rsvp/resend-verification'")
        expect(modalSource).toContain("body: JSON.stringify({ slug: eventSlug, email: pendingEmail })")
        // Opaque copy matches the endpoint's own OPAQUE_RESPONSE.message verbatim.
        expect(modalSource).toContain('Si tu RSVP está pendiente de verificación, te reenviamos el enlace.')
    })

    it('does not break the existing non-verification success flow', () => {
        expect(modalSource).toContain("setSubmitStatus('success')")
        expect(modalSource).toContain('¡Confirmado!')
        expect(modalSource).toContain('Nos vemos en la fiesta')
    })

    it('adds only additive CSS for the new resend control (no visual system reinvention)', () => {
        expect(modalCss).toContain('.resendButton {')
        expect(modalCss).toContain('.pendingEmail {')
        expect(modalCss).toContain('.modernModal .resendButton:focus-visible')
    })
})

describe('/verify/[slug] page (ISSUE-008)', () => {
    it('reads the token, clears it from the URL BEFORE the verify POST, and never refetches with the token elsewhere', () => {
        const tokenReadIndex = verifyPageSource.indexOf("searchParams?.get('token')")
        const replaceStateIndex = verifyPageSource.indexOf('window.history.replaceState')
        const postFetchIndex = verifyPageSource.indexOf("fetch('/api/rsvp/verify'")

        expect(tokenReadIndex).toBeGreaterThan(-1)
        expect(replaceStateIndex).toBeGreaterThan(tokenReadIndex)
        expect(postFetchIndex).toBeGreaterThan(replaceStateIndex)

        expect(verifyPageSource).toContain("window.history.replaceState(null, '', window.location.pathname)")
        // The token is only ever sent to /api/rsvp/verify — every other fetch
        // in this file (the public event lookup) must be token-free.
        expect(verifyPageSource.match(/fetch\(/g)?.length).toBe(3)
        expect(verifyPageSource).toContain('fetch(`/api/events/${slug}`')
        expect(verifyPageSource).not.toContain('fetch(`/api/events/${slug}?token=')
    })

    it('validates token shape client-side before ever POSTing it', () => {
        expect(verifyPageSource).toContain('const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/')
        expect(verifyPageSource).toContain('TOKEN_PATTERN.test(token)')
        expect(verifyPageSource).not.toContain("from '@/lib/verification'")
    })

    it('renders success (with the public event DTO + rsvp name), expired-with-resend, and invalid states', () => {
        expect(verifyPageSource).toContain("kind: 'success'; rsvp: VerifiedRsvp")
        expect(verifyPageSource).toContain('¡Asistencia confirmada!')
        expect(verifyPageSource).toContain('state.rsvp.name')
        expect(verifyPageSource).toContain("import type { PublicEvent } from '@/types/event'")

        expect(verifyPageSource).toContain("if (response.status === 410)")
        expect(verifyPageSource).toContain("kind: 'expired'")
        expect(verifyPageSource).toContain('Este link ya venció')
        expect(verifyPageSource).toContain("fetch('/api/rsvp/resend-verification'")
        expect(verifyPageSource).toContain('body: JSON.stringify({ slug, email: resendEmail.trim() })')

        expect(verifyPageSource).toContain("kind: 'invalid'")
        expect(verifyPageSource).toContain('Este link no es válido')
    })

    it('applies a mobile-safe, non-horizontal-scrolling shell', () => {
        expect(verifyCss).toContain('overflow-x: hidden;')
        expect(verifyCss).toContain('box-sizing: border-box;')
        expect(verifyCss).toContain('@media (max-width: 480px)')
        expect(verifyCss).toContain('min-height: 48px;')
    })
})

describe('next.config.js private-page headers for /verify (ISSUE-008)', () => {
    it('applies the same no-store/noindex/no-referrer headers as /invite', () => {
        const inviteBlockIndex = nextConfigSource.indexOf("source: '/invite/:slug'")
        const verifyBlockIndex = nextConfigSource.indexOf("source: '/verify'")
        const verifySlugBlockIndex = nextConfigSource.indexOf("source: '/verify/:slug'")

        expect(inviteBlockIndex).toBeGreaterThan(-1)
        expect(verifyBlockIndex).toBeGreaterThan(inviteBlockIndex)
        expect(verifySlugBlockIndex).toBeGreaterThan(verifyBlockIndex)

        // Both /verify blocks reuse the shared invitePrivateHeaders constant,
        // not a hand-rolled duplicate list.
        const verifySection = nextConfigSource.slice(verifyBlockIndex, verifySlugBlockIndex + 200)
        expect(verifySection.match(/headers: invitePrivateHeaders/g)?.length).toBe(2)
    })
})

describe('admin email-verification toggle (ISSUE-008)', () => {
    it('adds the toggle beside emailConfirmationEnabled with the specified helper copy', () => {
        const confirmationToggleIndex = adminPageSource.indexOf('id="emailConfirmationEnabled"')
        const verificationToggleIndex = adminPageSource.indexOf('id="emailVerificationEnabled"')
        expect(confirmationToggleIndex).toBeGreaterThan(-1)
        expect(verificationToggleIndex).toBeGreaterThan(confirmationToggleIndex)

        expect(adminPageSource).toContain('checked={configForm.emailVerificationEnabled}')
        expect(adminPageSource).toContain('emailVerificationEnabled: e.target.checked')
        expect(adminPageSource).toContain('El invitado debe confirmar su correo para quedar registrado.')
        expect(adminPageSource).toContain('Los links privados de')
        expect(adminPageSource).toContain('invitación no lo requieren.')
        expect(adminPageSource).toContain('En eventos de pago se ignora: el pago verifica el correo.')
    })

    it('loads the persisted value from settings and sends it back on save', () => {
        expect(adminPageSource).toContain('emailVerificationEnabled: data.settings.emailVerificationEnabled || false')
        expect(adminPageSource).toContain('emailVerificationEnabled: configForm.emailVerificationEnabled')
    })
})

describe('emailVerificationEnabled writable in both settings surfaces (ISSUE-008)', () => {
    it('is registered in the shared PUT /api/events/[slug] contract', () => {
        expect(contractSource).toContain("parseBoolean(input, 'emailVerificationEnabled')")
        expect(contractSource).toContain('updates.emailVerificationEnabled = emailVerificationEnabled.value')
    })

    it('is writable via the admin settings update route used by app/admin/page.tsx', () => {
        expect(settingsUpdateSource).toContain('if (body.emailVerificationEnabled !== undefined)')
        expect(settingsUpdateSource).toContain('updates.emailVerificationEnabled = body.emailVerificationEnabled === true')
    })
})
