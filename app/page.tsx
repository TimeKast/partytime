import { redirect } from 'next/navigation'
import eventConfig from '../event-config.json'
import { unstable_noStore as noStore } from 'next/cache'
import { getAppSetting, getEventById, getEventBySlugWithSettings } from '@/lib/queries'
import { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = 'https://party.timekast.mx'

  try {
    const homeEventId = await getAppSetting('home_event_id')
    const eventId = homeEventId || eventConfig.event.id
    const event = await getEventBySlugWithSettings(eventId)

    if (!event) {
      return {
        metadataBase: new URL(baseUrl),
        title: eventConfig.event.title,
        description: eventConfig.event.subtitle,
      }
    }

    const title = `${event.title} - ${event.subtitle}`
    const description = `${event.date} ${event.time} - ${event.location}`

    // Evitar fondo pesado (18MB) que bloquea WhatsApp
    let imageUrl = event.backgroundImageUrl || '/og-event.png'

    if (imageUrl.includes('background.png')) {
      imageUrl = `${baseUrl}/og-event.png`
    } else if (imageUrl.startsWith('/')) {
      imageUrl = `${baseUrl}${imageUrl}`
    }

    return {
      metadataBase: new URL(baseUrl),
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${baseUrl}/${event.slug}`,
        siteName: eventConfig.event.title,
        type: 'website',
        locale: 'es_MX',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
    }
  } catch (error) {
    console.error('🏠 [Home] Error generating metadata:', error)
    return {
      metadataBase: new URL(baseUrl),
      title: eventConfig.event.title,
      description: eventConfig.event.subtitle,
    }
  }
}

/**
 * Home page - redirects to the default event's slug or the configured home event
 * All events should be accessed via /{slug}
 */
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
