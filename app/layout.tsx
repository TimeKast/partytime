import type { Metadata, Viewport } from 'next'
import './globals.css'
import eventConfig from '../event-config.json'

export const metadata: Metadata = {
  metadataBase: new URL('https://party.timekast.mx'),
  title: {
    default: eventConfig.event.title,
    template: `%s | ${eventConfig.event.title}`
  },
  description: eventConfig.event.subtitle,
  icons: {
    icon: '/favicon.ico',
  }
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
