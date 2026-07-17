import { describe, it, expect } from 'vitest'
import { generatePasswordResetEmail, PASSWORD_RESET_EMAIL_SUBJECT } from '@/lib/password-reset-email'

describe('generatePasswordResetEmail', () => {
    it('has the expected subject constant', () => {
        expect(PASSWORD_RESET_EMAIL_SUBJECT).toBe('Restablece tu contraseña - Party Time!')
    })

    it('includes the name and the clean reset URL in both html and text', () => {
        const { html, text } = generatePasswordResetEmail({
            name: 'Alex Gmora',
            resetUrl: 'https://partytime.example.com/reset-password?token=abc123',
        })

        expect(html).toContain('Alex Gmora')
        expect(html).toContain('https://partytime.example.com/reset-password?token=abc123')
        expect(text).toContain('Alex Gmora')
        expect(text).toContain('https://partytime.example.com/reset-password?token=abc123')
    })

    it('strips a leading encoding artifact ("=") from the reset URL, like the cancel-link idiom', () => {
        const { html, text } = generatePasswordResetEmail({
            name: 'Alex',
            resetUrl: '=https://partytime.example.com/reset-password?token=abc123  ',
        })

        expect(html).toContain('https://partytime.example.com/reset-password?token=abc123')
        expect(html).not.toContain('=https://partytime.example.com')
        expect(text).toContain('https://partytime.example.com/reset-password?token=abc123')
        expect(text).not.toContain('=https://partytime.example.com')
    })

    it('does not introduce a second, different token-bearing URL anywhere in the output', () => {
        const { html, text } = generatePasswordResetEmail({
            name: 'Alex',
            resetUrl: 'https://partytime.example.com/reset-password?token=super-secret-raw-token',
        })
        // The reset URL may legitimately appear twice (button href + plain-text
        // fallback), but only ever as this exact URL — never altered/duplicated
        // with a different token value.
        expect(html.match(/token=[\w-]+/g)?.every(match => match === 'token=super-secret-raw-token')).toBe(true)
        expect(text.match(/token=[\w-]+/g)?.every(match => match === 'token=super-secret-raw-token')).toBe(true)
    })

    it('escapes user-controlled HTML in the name and URL attributes', () => {
        const { html, text } = generatePasswordResetEmail({
            name: '<img src=x onerror=alert(1)>',
            resetUrl: 'https://partytime.example.com/reset-password?token=abc&next="bad"',
        })

        expect(html).not.toContain('<img src=x')
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
        expect(html).toContain('&amp;next=&quot;bad&quot;')
        expect(text).toContain('<img src=x onerror=alert(1)>')
    })
})
