import type { Metadata } from 'next'
import { getEventBySlugWithSettings } from '@/lib/queries'
import { buildEventPageMetadata } from '@/lib/event-page-metadata'
import InvitationRegistrationClient from '../InvitationRegistrationClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PRIVATE_ROBOTS: Metadata['robots'] = {
  index: false,
  follow: false,
  nocache: true,
}

interface InvitationPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: InvitationPageProps): Promise<Metadata> {
  const { slug } = await params
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://party.timekast.mx'

  try {
    const event = await getEventBySlugWithSettings(slug)
    if (!event) {
      return {
        metadataBase: new URL(baseUrl),
        title: 'Invitación no disponible',
        description: 'Este link de invitación no está disponible.',
        robots: PRIVATE_ROBOTS,
      }
    }

    return buildEventPageMetadata(event, {
      baseUrl,
      robots: PRIVATE_ROBOTS,
    })
  } catch {
    console.error('[InvitationPage] Error generating event metadata')
    return {
      metadataBase: new URL(baseUrl),
      title: 'Invitación',
      description: 'Invitación a evento',
      robots: PRIVATE_ROBOTS,
    }
  }
}

export default async function EventInvitationPage({ params }: InvitationPageProps) {
  const { slug } = await params
  return <InvitationRegistrationClient expectedEventSlug={slug} />
}
