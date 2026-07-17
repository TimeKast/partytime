import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { assertSameOrigin } from '@/lib/origin-check'

function requestWith(headers: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers,
    })
}

describe('assertSameOrigin', () => {
    const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

    beforeEach(() => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://partytime.example.com'
    })
    afterEach(() => {
        process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    })

    it('accepts a same-origin Origin header matching NEXT_PUBLIC_APP_URL', () => {
        const req = requestWith({ origin: 'https://partytime.example.com', host: 'partytime.example.com' })
        expect(assertSameOrigin(req)).toBe(true)
    })

    it('accepts a same-origin Origin header matching the request host (deploy preview case)', () => {
        const req = requestWith({
            origin: 'https://preview-123.vercel.app',
            host: 'preview-123.vercel.app',
            'x-forwarded-proto': 'https',
        })
        expect(assertSameOrigin(req)).toBe(true)
    })

    it('rejects a matching host with a different scheme', () => {
        const req = requestWith({
            origin: 'http://partytime.example.com',
            host: 'partytime.example.com',
            'x-forwarded-proto': 'https',
        })
        expect(assertSameOrigin(req)).toBe(false)
    })

    it('rejects a cross-site Origin header (fails closed)', () => {
        const req = requestWith({ origin: 'https://evil.example.com', host: 'partytime.example.com' })
        expect(assertSameOrigin(req)).toBe(false)
    })

    it('rejects a malformed Origin header (fails closed)', () => {
        const req = requestWith({ origin: 'not-a-url', host: 'partytime.example.com' })
        expect(assertSameOrigin(req)).toBe(false)
    })

    it('falls back to Referer when Origin is absent', () => {
        const req = requestWith({ referer: 'https://partytime.example.com/login', host: 'partytime.example.com' })
        expect(assertSameOrigin(req)).toBe(true)

        const crossSite = requestWith({ referer: 'https://evil.example.com/x', host: 'partytime.example.com' })
        expect(assertSameOrigin(crossSite)).toBe(false)
    })

    it('fails closed by default when both Origin and Referer are absent', () => {
        const req = requestWith({ host: 'partytime.example.com' })
        expect(assertSameOrigin(req)).toBe(false)
    })

    it('allows missing Origin/Referer only when allowMissing is explicitly set (public unauth routes)', () => {
        const req = requestWith({ host: 'partytime.example.com' })
        expect(assertSameOrigin(req, { allowMissing: true })).toBe(true)
    })

    it('still rejects an explicit cross-origin request even when allowMissing is set', () => {
        const req = requestWith({ origin: 'https://evil.example.com', host: 'partytime.example.com' })
        expect(assertSameOrigin(req, { allowMissing: true })).toBe(false)
    })
})
