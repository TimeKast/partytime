import { redirect } from 'next/navigation'
import eventConfig from '../event-config.json'
import { unstable_noStore as noStore } from 'next/cache'
import { getAppSetting, getEventById, getEventBySlugWithSettings } from '@/lib/queries'
import { Metadata } from 'next'

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
              type: 'image/png',
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

    const title = `${event.title} - ${event.subtitle}`
    const description = `${event.date} ${event.time} - ${event.location}`

    // WhatsApp necesita un og:image servible, rápido y con URL absoluta.
    // Usamos una imagen OG generada por evento (ligera) para evitar fondos pesados.
    const imageUrl = `${baseUrl}/${event.slug}/opengraph-image`

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
            type: 'image/png',
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
            type: 'image/png',
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
    // 1. Intentar obtener el ID del evento de inicio desde la DB
    const homeEventId = await getAppSetting('home_event_id')
    console.log('🏠 [Home] home_event_id from DB:', homeEventId)

    if (homeEventId) {
      const event = await getEventById(homeEventId)
      console.log('🏠 [Home] Found event for homeEventId:', event?.slug)
      if (event && event.slug) {
        return redirect(`/${event.slug}`)
      } else if (event) {
        // Si el evento existe pero no tiene slug (raro), redireccionar al ID
        console.warn('🏠 [Home] Event found but has no slug, using ID:', event.id)
        return redirect(`/${event.id}`)
      }
    }

    // 2. Fallback al slug del config por defecto
    console.log('🏠 [Home] Falling back to default event config ID:', eventConfig.event.id)
    const defaultEvent = await getEventById(eventConfig.event.id)
    if (defaultEvent && defaultEvent.slug) {
      console.log('🏠 [Home] Redirecting to default event slug:', defaultEvent.slug)
      return redirect(`/${defaultEvent.slug}`)
    }
  } catch (error) {
    // Next.js redirect standard throws are caught here, we need to rethrow them
    if (error && typeof error === 'object' && 'digest' in error && (error as any).digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    console.error('🏠 [Home] Critical error in home page redirect:', error)
  }

  // Fallback final ultra-seguro usando el ID como slug (comportamiento original)
  console.log('🏠 [Home] Last resort fallback redirect to:', eventConfig.event.id)
  redirect(`/${eventConfig.event.id}`)
}
