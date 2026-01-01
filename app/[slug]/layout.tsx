import { Metadata } from 'next'
import { getEventBySlugWithSettings } from '@/lib/queries'

// Forzar regeneración dinámica de metadatos en cada request
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface LayoutProps {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
    const { slug } = await params
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://party.timekast.mx'

    try {
        const event = await getEventBySlugWithSettings(slug)

        if (!event) {
            return {
                metadataBase: new URL(baseUrl),
                title: 'Evento no encontrado',
                description: 'La invitación que buscas no existe o no está disponible.',
            }
        }

        const title = `${event.title} - ${event.subtitle}`
        const description = `${event.date} ${event.time} - ${event.location}`

        // Para WhatsApp: servir SIEMPRE desde nuestro dominio (proxy+fallback) para evitar bloqueos del host de la imagen.
        // El parámetro v= fuerza invalidación de caché cuando se cambia la imagen OG
        const imageUrl = `${baseUrl}/api/og-image/${slug}?v=3`

        return {
            metadataBase: new URL(baseUrl),
            title,
            description,
            openGraph: {
                title,
                description,
                type: 'website',
                locale: 'es_MX',
                url: `${baseUrl}/${slug}`,
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
    } catch (error) {
        console.error('[EventLayout] Error generating metadata:', error)
        return {
            metadataBase: new URL(baseUrl),
            title: 'Evento',
            description: 'Invitación a evento',
        }
    }
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
