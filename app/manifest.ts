import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Party Time!',
    short_name: 'Party Time!',
    description: 'Party Time! — Invitaciones y RSVP para eventos increíbles',
    start_url: '/admin',
    display: 'standalone',
    background_color: '#1a0033',
    theme_color: '#1a0033',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
