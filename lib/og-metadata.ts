import { createHash } from 'node:crypto'

interface OgMetadataImageOptions {
    baseUrl: string
    slug: string
    ogImageUrl?: string | null
    backgroundImageUrl?: string | null
}

function isPublicVercelBlobUrl(value: string): boolean {
    try {
        const url = new URL(value)
        return url.protocol === 'https:'
            && url.hostname.endsWith('.public.blob.vercel-storage.com')
    } catch {
        return false
    }
}

export function buildOgMetadataImageUrl(options: OgMetadataImageOptions): string {
    // Uploaded OG images already have immutable, public Vercel Blob URLs.
    // Advertising that URL directly avoids a second DB lookup and server-side
    // fetch in the proxy, while each upload naturally gets a fresh cache key.
    if (options.ogImageUrl && isPublicVercelBlobUrl(options.ogImageUrl)) {
        return options.ogImageUrl
    }

    const selectedSource = options.ogImageUrl
        || options.backgroundImageUrl
        || `generated:${options.slug}`
    const cacheKey = createHash('sha256').update(selectedSource).digest('hex').slice(0, 12)

    return `${options.baseUrl}/api/og-image/${options.slug}?v=${cacheKey}`
}
