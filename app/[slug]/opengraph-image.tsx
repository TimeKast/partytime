import { ImageResponse } from 'next/og'
import eventConfig from '@/event-config.json'
import { getEventBySlugWithSettings } from '@/lib/queries'

export const runtime = 'nodejs'
export const alt = 'Invitación a fiesta'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image({ params }: { params: { slug: string } }) {
  const { slug } = params

  let title = eventConfig.event.title
  let subtitle = eventConfig.event.subtitle
  let date = eventConfig.event.date
  let time = eventConfig.event.time
  let location = eventConfig.event.location

  try {
    const event = await getEventBySlugWithSettings(slug)
    if (event) {
      title = event.title
      subtitle = event.subtitle
      date = event.date
      time = event.time
      location = event.location
    }
  } catch {
    // Si falla DB (edge/build/etc), usamos config estático.
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0015',
          backgroundImage: 'linear-gradient(135deg, #1a0033 0%, #0a0015 50%, #000510 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px',
            textAlign: 'center',
            width: '100%',
            maxWidth: '1000px',
          }}
        >
          <div
            style={{
              fontSize: '68px',
              fontWeight: 800,
              color: '#ff6b9d',
              textShadow: '0 0 30px rgba(255, 107, 157, 0.8)',
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: '18px',
              fontSize: '34px',
              color: '#00f5ff',
              textShadow: '0 0 20px rgba(0, 245, 255, 0.6)',
              lineHeight: 1.2,
            }}
          >
            {subtitle}
          </div>

          <div
            style={{
              marginTop: '34px',
              display: 'flex',
              gap: '28px',
              fontSize: '28px',
              color: '#ffffff',
              opacity: 0.95,
            }}
          >
            <span>{date}</span>
            <span>{time}</span>
          </div>

          <div
            style={{
              marginTop: '18px',
              fontSize: '24px',
              color: '#b8b8b8',
            }}
          >
            {location}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}

