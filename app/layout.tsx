import type { Metadata, Viewport } from 'next'
import './globals.css'
import eventConfig from '../event-config.json'

export const metadata: Metadata = {
  title: `${eventConfig.event.title} - ${eventConfig.event.subtitle}`,
  description: `Invitación a ${eventConfig.event.title} - ${eventConfig.event.date} ${eventConfig.event.time}`,
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: `${eventConfig.event.title} - ${eventConfig.event.subtitle}`,
    description: `${eventConfig.event.date} ${eventConfig.event.time} - ${eventConfig.event.location}`,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${eventConfig.event.title} - ${eventConfig.event.subtitle}`,
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${eventConfig.event.title} - ${eventConfig.event.subtitle}`,
    description: `${eventConfig.event.date} ${eventConfig.event.time} - ${eventConfig.event.location}`,
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: eventConfig.theme.backgroundColor,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
