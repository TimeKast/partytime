import type { Metadata } from 'next'
import InvitationRegistrationClient from './InvitationRegistrationClient'

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default function InvitationPage() {
  return <InvitationRegistrationClient />
}
