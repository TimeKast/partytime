import type { Metadata, Viewport } from 'next'
import './globals.css'
import eventConfig from '../event-config.json'

export const metadata: Metadata = {
  title: `${eventConfig.event.title} - ${eventConfig.event.subtitle}`,
  description: `Invitación a ${eventConfig.event.title} - ${eventConfig.event.date} ${eventConfig.event.time}`,
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
