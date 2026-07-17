import type { NextRequest } from 'next/server'

export interface AssertSameOriginOptions {
    /**
     * Allow the request through when neither Origin nor Referer is present.
     * Cookie-authenticated mutations must NOT set this (fail closed — SI7);
     * public unauth routes (forgot/reset-password) may, since there is no
     * ambient credential for a forged cross-site request to ride on.
     */
    allowMissing?: boolean
}

function originOf(url: string): string | null {
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
    } catch {
        return null
    }
}

/**
 * Same-origin assertion for cookie-auth mutations (SI7) and public
 * forgot/reset-password submissions. Compares the Origin (falling back to
 * Referer) header's full origin against the request origin and the configured
 * NEXT_PUBLIC_APP_URL origin. Fails closed on any scheme/host mismatch,
 * malformed header, or (unless `allowMissing`) absent header.
 */
export function assertSameOrigin(request: NextRequest, options: AssertSameOriginOptions = {}): boolean {
    const requestHost = request.headers.get('host')
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    const requestProtocol = forwardedProtocol === 'http' || forwardedProtocol === 'https'
        ? `${forwardedProtocol}:`
        : request.nextUrl.protocol
    const requestHostOrigin = requestHost ? `${requestProtocol}//${requestHost}` : null
    const configuredOrigin = originOf(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
    const allowedOrigins = new Set(
        [request.nextUrl.origin, requestHostOrigin, configuredOrigin]
            .map(value => value ? originOf(value) : null)
            .filter((origin): origin is string => !!origin),
    )

    const originHeader = request.headers.get('origin')
    if (originHeader) {
        const origin = originOf(originHeader)
        return !!origin && allowedOrigins.has(origin)
    }

    const refererHeader = request.headers.get('referer')
    if (refererHeader) {
        const origin = originOf(refererHeader)
        return !!origin && allowedOrigins.has(origin)
    }

    return options.allowMissing === true
}
