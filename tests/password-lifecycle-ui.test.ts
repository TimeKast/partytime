import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
    return readFileSync(path, 'utf8')
}

describe('password lifecycle UI contracts', () => {
    it('wires a reusable account form and a non-dismissible forced-change dialog', () => {
        const admin = source('app/admin/page.tsx')
        const form = source('app/admin/components/ChangePasswordForm.tsx')

        expect(admin).toContain("'cuenta'")
        expect(admin).toContain('mustChangePassword')
        expect(admin).toContain('<ForcedPasswordChangeDialog')
        expect(admin).toContain("currentUser.id === 'super_admin_env'")
        expect(form).toContain("fetch('/api/auth/change-password'")
        expect(form).toContain('currentPassword, newPassword, confirmPassword')
        expect(form).toContain('role="dialog"')
        expect(form).toContain('aria-modal="true"')
        expect(form).toContain("if (event.key === 'Escape')")
        expect(form).toContain('event.preventDefault()')
        expect(form).not.toContain('localStorage')
        expect(form).not.toContain('console.')
    })

    it('provides an accessible one-time admin reset reveal without persisting the secret', () => {
        const management = source('app/admin/components/UserManagement.tsx')

        expect(management).toContain('🔑 Restablecer contraseña')
        expect(management).toContain("method: 'POST'")
        expect(management).toContain('temporaryPassword: data.temporaryPassword')
        expect(management).toContain('navigator.clipboard.writeText')
        expect(management).toContain('disabled={loading || !user.isActive}')
        expect(management).toContain('Se muestra una sola vez')
        expect(management).toContain('role="dialog"')
        expect(management).toContain('aria-modal="true"')
        expect(management).toContain("event.key === 'Escape'")
        expect(management).not.toContain('localStorage')
        expect(management).not.toMatch(/console\.(?:log|error)\([^)]*temporaryPassword/)
    })

    it('links login to forgot-password and keeps recovery responses generic', () => {
        const login = source('app/login/page.tsx')
        const forgot = source('app/forgot-password/page.tsx')

        expect(login).toContain('href="/forgot-password"')
        expect(login).toContain('¿Olvidaste tu contraseña?')
        expect(forgot).toContain("fetch('/api/auth/forgot-password'")
        expect(forgot).toContain('Si el correo existe en nuestro sistema')
        expect(forgot).not.toContain('data.user')
        expect(forgot).not.toContain('console.')
    })

    it('captures and scrubs the reset token, submits it once, and never renders or logs it', () => {
        const reset = source('app/reset-password/page.tsx')

        expect(reset).toContain("useState(() => searchParams.get('token')")
        expect(reset).toContain("url.searchParams.delete('token')")
        expect(reset).toContain('window.history.replaceState')
        expect(reset).toContain("fetch('/api/auth/reset-password'")
        expect(reset).toContain('token, newPassword, confirmPassword')
        expect(reset).toContain('href="/login"')
        expect(reset).toContain('<Suspense')
        expect(reset).not.toContain('{token}')
        expect(reset).not.toContain('console.')
    })

    it('sends no referrer from the reset-password page', async () => {
        const config = await import('../next.config.js')
        const headersFactory = config.default.headers
        expect(headersFactory).toBeTypeOf('function')
        const headers = await headersFactory!()

        expect(headers).toContainEqual({
            source: '/reset-password',
            headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
        })
    })

    it('keeps the dark forms mobile-scrollable, focus-visible and reduced-motion safe', () => {
        const css = source('app/login/login.module.css')

        expect(css).toContain('overflow-y: auto')
        expect(css).toContain(':focus-visible')
        expect(css).toContain('@media (prefers-reduced-motion: reduce)')
        expect(css).toContain('min-height: 100dvh')
    })
})
