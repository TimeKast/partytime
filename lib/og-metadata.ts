import { createHash } from 'node:crypto'

interface OgMetadataImageOptions {
    baseUrl: string
    slug: string
    ogImageUrl?: string | null
    backgroundImageUrl?: string | null
}

export function buildOgMetadataImageUrl(options: OgMetadataImageOptions): string {
    const selectedSource = options.ogImageUrl
        || options.backgroundImageUrl
        || `generated:${options.slug}`
    const cacheKey = createHash('sha256').update(selectedSource).digest('hex').slice(0, 12)

    return `${options.baseUrl}/api/og-image/${options.slug}?v=${cacheKey}`
}
