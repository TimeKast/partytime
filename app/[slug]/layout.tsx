import { Metadata } from 'next'
import { getEventBySlugWithSettings } from '@/lib/queries'
import { buildEventPageMetadata } from '@/lib/event-page-metadata'

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

        return buildEventPageMetadata(event, { baseUrl })
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
