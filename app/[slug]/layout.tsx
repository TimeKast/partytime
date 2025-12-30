import { Metadata } from 'next'
import { getEventBySlug } from '@/lib/queries'
import eventConfig from '@/event-config.json'

interface LayoutProps {
    children: React.ReactNode
    params: { slug: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
    const { slug } = params

    try {
        const event = await getEventBySlug(slug)

        if (!event) {
            return {
                title: 'Evento no encontrado',
                description: 'La invitación que buscas no existe o no está disponible.',
            }
        }

        const title = `${event.title} - ${event.subtitle}`
        const description = `${event.date} ${event.time} - ${event.location}`

        // Evitar imágenes pesadas para WhatsApp
        let imageUrl = event.backgroundImageUrl || 'https://party.timekast.mx/og-image.png'
        if (imageUrl.includes('background.png') || imageUrl.startsWith('/')) {
            imageUrl = 'https://party.timekast.mx/og-image.png'
        }

        return {
            title,
            description,
            openGraph: {
                title,
                description,
                type: 'website',
                url: `https://party.timekast.mx/${slug}`,
                siteName: eventConfig.event.title,
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
        return {
            title: eventConfig.event.title,
            description: eventConfig.event.subtitle,
        }
    }
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
