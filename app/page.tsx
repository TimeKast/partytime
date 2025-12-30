import { redirect } from 'next/navigation'
import eventConfig from '../event-config.json'
import { unstable_noStore as noStore } from 'next/cache'
import { getAppSetting, getEventById } from '@/lib/queries'
import { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const homeEventId = await getAppSetting('home_event_id')
  const eventId = homeEventId || eventConfig.event.id
  const event = await getEventById(eventId)
  const baseUrl = 'https://party.timekast.mx'

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
}

/**
 * Home page - redirects to the default event's slug or the configured home event
 * All events should be accessed via /{slug}
 */
export default async function Home() {
  noStore()

  // 1. Intentar obtener el ID del evento de inicio desde la DB
  const homeEventId = await getAppSetting('home_event_id')

  if (homeEventId) {
    const event = await getEventById(homeEventId)
    if (event && event.slug) {
      redirect(`/${event.slug}`)
    }
  }

  // 2. Fallback al slug del config por defecto
  // Buscamos el evento legado por su ID conocido
  const defaultEvent = await getEventById(eventConfig.event.id)
  if (defaultEvent && defaultEvent.slug) {
    redirect(`/${defaultEvent.slug}`)
  }

  // Fallback final ultra-seguro usando el ID como slug (comportamiento original)
  redirect(`/${eventConfig.event.id}`)
}
