import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
    return readFileSync(path, 'utf8')
}

describe('password policy copies', () => {
    it('keeps self-change and forced-change hints/errors aligned with the server policy', () => {
        const form = source('app/admin/components/ChangePasswordForm.tsx')

        expect(form).toContain('8 caracteres como mínimo y 72 bytes como máximo.')
        expect(form).toContain('una mayúscula, una minúscula y un número')
        expect(form).toContain('Los símbolos son opcionales.')
        expect(form).toContain('missing_uppercase')
        expect(form).toContain('missing_lowercase')
        expect(form).toContain('missing_number')
        expect(form).not.toContain('12 caracteres')
        expect(form).not.toContain('3 tipos')
    })

    it('keeps forgot/reset pages aligned without weakening the generic forgot response', () => {
        const forgot = source('app/forgot-password/page.tsx')
        const reset = source('app/reset-password/page.tsx')

        expect(forgot).toContain('Si el correo existe en nuestro sistema')
        expect(reset).toContain('8 caracteres como mínimo; 72 bytes como máximo.')
        expect(reset).toContain('una mayúscula, una minúscula y un número')
        expect(reset).toContain('Los símbolos son opcionales.')
        expect(reset).toContain('missing_uppercase')
        expect(reset).toContain('missing_lowercase')
        expect(reset).toContain('missing_number')
        expect(reset).not.toContain('12 caracteres')
        expect(reset).not.toContain('3 tipos')
    })

    it('aligns admin creation, bootstrap, generator and documentation contracts', () => {
        const management = source('app/admin/components/UserManagement.tsx')
        const seed = source('scripts/create-super-admin.ts')
        const generator = source('lib/password-utils.ts')
        const readme = source('README.md')

        expect(management).toContain('minLength={8}')
        expect(management).toContain('una mayúscula, una minúscula y un número')
        expect(management).toContain('Los símbolos son opcionales.')
        expect(management).not.toContain('minLength={6}')
        expect(seed).toContain("validatePasswordPolicy(password, { email, name })")
        expect(seed).not.toContain('password.length < 12')
        expect(generator).not.toContain('pickRandomChar(SYMBOLS)')
        expect(readme).toContain('8 caracteres, máximo 72 bytes, al menos una mayúscula, una minúscula y un número; los símbolos son opcionales')
        expect(readme).not.toContain('12 caracteres, máximo 72 bytes y al menos 3 clases')
    })
})
