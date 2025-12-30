import { Metadata } from 'next'
import { getEventBySlug } from '@/lib/queries'
import eventConfig from '@/event-config.json'

interface LayoutProps {
    children: React.ReactNode
    params: { slug: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
    const { slug } = params
    const baseUrl = 'https://party.timekast.mx'

    try {
        const event = await getEventBySlug(slug)

        if (!event) {
            return {
                metadataBase: new URL(baseUrl),
                title: 'Evento no encontrado',
                description: 'La invitación que buscas no existe o no está disponible.',
            }
        }

        const title = `${event.title} - ${event.subtitle}`
        const description = `${event.date} ${event.time} - ${event.location}`

        // Usar imagen optimizada og-event.png si la imagen es pesada o local
        let imageUrl = event.backgroundImageUrl || `${baseUrl}/og-event.png`
        if (imageUrl.includes('background.png') || !imageUrl.startsWith('http')) {
            imageUrl = `${baseUrl}/og-event.png`
        }

        return {
            metadataBase: new URL(baseUrl),
            title,
            description,
            openGraph: {
                title,
                description,
                type: 'website',
                url: `${baseUrl}/${slug}`,
                siteName: eventConfig.event.title,
                images: [
                    {
                        url: imageUrl,
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
        return {
            metadataBase: new URL(baseUrl),
            title: eventConfig.event.title,
            description: eventConfig.event.subtitle,
        }
    }
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
