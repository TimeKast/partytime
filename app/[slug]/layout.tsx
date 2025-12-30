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

        // Evitar imágenes gigantes (background.png es de 18MB)
        let imageUrl = event.backgroundImageUrl || '/og-image.png'
        if (imageUrl.includes('background.png')) {
            imageUrl = '/og-image.png'
        }

        return {
            title,
            description,
            openGraph: {
                title,
                description,
                type: 'website',
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
            title: eventConfig.event.title,
            description: eventConfig.event.subtitle,
        }
    }
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
