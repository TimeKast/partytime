import React from 'react'
import eventConfig from '../event-config.json'
import { unstable_noStore as noStore } from 'next/cache'
import { getAppSetting, getEventById, getEventBySlugWithSettings } from '@/lib/queries'
import { Metadata } from 'next'
import { buildEventMetadata } from '@/lib/event-presentation'
import { buildOgMetadataImageUrl } from '@/lib/og-metadata'
import EventPageClient from './[slug]/components/EventPageClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://party.timekast.mx'

  try {
    const homeEventId = await getAppSetting('home_event_id')
    const eventId = homeEventId || eventConfig.event.id
    const event = await getEventBySlugWithSettings(eventId)

    if (!event) {
      return {
        metadataBase: new URL(baseUrl),
        title: eventConfig.event.title,
        description: eventConfig.event.subtitle,
        openGraph: {
          title: eventConfig.event.title,
          description: eventConfig.event.subtitle,
          url: `${baseUrl}/`,
          siteName: eventConfig.event.title,
          type: 'website',
          locale: 'es_MX',
          images: [
            {
              url: `${baseUrl}/opengraph-image`,
              secureUrl: `${baseUrl}/opengraph-image`,
              width: 1200,
              height: 630,
              alt: eventConfig.event.title,
            },
          ],
        },
        twitter: {
          card: 'summary_large_image',
          title: eventConfig.event.title,
          description: eventConfig.event.subtitle,
          images: [`${baseUrl}/opengraph-image`],
        },
      }
    }

    const { title, description } = buildEventMetadata(event)

    const imageUrl = buildOgMetadataImageUrl({
      baseUrl,
      slug: event.slug,
      ogImageUrl: event.ogImageUrl,
      backgroundImageUrl: event.backgroundImageUrl,
    })

    return {
      metadataBase: new URL(baseUrl),
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${baseUrl}/`,
        siteName: eventConfig.event.title,
        type: 'website',
        locale: 'es_MX',
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
  } catch (error) {
    console.error('🏠 [Home] Error generating metadata:', error)
    return {
      metadataBase: new URL(baseUrl),
      title: eventConfig.event.title,
      description: eventConfig.event.subtitle,
      openGraph: {
        title: eventConfig.event.title,
        description: eventConfig.event.subtitle,
        url: `${baseUrl}/`,
        siteName: eventConfig.event.title,
        type: 'website',
        locale: 'es_MX',
        images: [
          {
            url: `${baseUrl}/opengraph-image`,
            secureUrl: `${baseUrl}/opengraph-image`,
            width: 1200,
            height: 630,
            alt: eventConfig.event.title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: eventConfig.event.title,
        description: eventConfig.event.subtitle,
        images: [`${baseUrl}/opengraph-image`],
      },
    }
  }
}

export default async function Home() {
  noStore()

  try {
    const homeEventId = await getAppSetting('home_event_id')
    console.log('🏠 [Home] home_event_id from DB:', homeEventId)

    if (homeEventId) {
      const event = await getEventById(homeEventId)
      console.log('🏠 [Home] Found event for homeEventId:', event?.slug)
      if (event) {
        return <EventPageClient slug={event.slug || event.id} />
      }
    }

    console.log('🏠 [Home] Falling back to default event config ID:', eventConfig.event.id)
    const defaultEvent = await getEventById(eventConfig.event.id)
    if (defaultEvent) {
      return <EventPageClient slug={defaultEvent.slug || defaultEvent.id} />
    }
  } catch (error) {
    console.error('🏠 [Home] Error resolving home event:', error)
  }

  console.log('🏠 [Home] Last resort fallback event:', eventConfig.event.id)
  return <EventPageClient slug={eventConfig.event.id} />
}
