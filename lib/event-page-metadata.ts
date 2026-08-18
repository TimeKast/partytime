import type { Metadata } from 'next'
import { buildEventMetadata } from '@/lib/event-presentation'
import { buildOgMetadataImageUrl } from '@/lib/og-metadata'

export interface EventPageMetadataSource {
    slug: string
    title: string
    displayTitle: string
    subtitle: string
    date: string
    time: string
    location: string
    backgroundImageUrl: string | null
    ogImageUrl: string | null
}

interface EventPageMetadataOptions {
    baseUrl: string
    robots?: Metadata['robots']
}

/**
 * Canonical event metadata shared by the public event page and event-bound
 * one-time invitation entry points. Capability tokens must never be passed to
 * this helper: canonical and social URLs intentionally identify only the event.
 */
export function buildEventPageMetadata(
    event: EventPageMetadataSource,
    options: EventPageMetadataOptions,
): Metadata {
    const metadataBase = new URL(options.baseUrl)
    const canonicalEventUrl = new URL(`/${encodeURIComponent(event.slug)}`, metadataBase).toString()
    const { title, description } = buildEventMetadata(event)
    const imageUrl = buildOgMetadataImageUrl({
        baseUrl: metadataBase.origin,
        slug: event.slug,
        ogImageUrl: event.ogImageUrl,
        backgroundImageUrl: event.backgroundImageUrl,
    })

    return {
        metadataBase,
        title,
        description,
        alternates: { canonical: canonicalEventUrl },
        ...(options.robots ? { robots: options.robots } : {}),
        openGraph: {
            title,
            description,
            type: 'website',
            locale: 'es_MX',
            url: canonicalEventUrl,
            siteName: event.title,
            images: [
                {
                    url: imageUrl,
                    secureUrl: imageUrl,
                    width: 1200,
                    height: 630,
                    alt: event.title,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [imageUrl],
        },
    }
}
