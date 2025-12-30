import { ImageResponse } from 'next/og'
import eventConfig from '@/event-config.json'

export const runtime = 'edge'
export const alt = 'Invitación a fiesta'
export const size = {
    width: 1200,
    height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
    // Usamos los datos del config estático para evitar problemas con Edge runtime
    const title = eventConfig.event.title
    const subtitle = eventConfig.event.subtitle
    const date = eventConfig.event.date
    const time = eventConfig.event.time
    const location = eventConfig.event.location

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
                        padding: '40px',
                        textAlign: 'center',
                    }}
                >
                    <h1
                        style={{
                            fontSize: '72px',
                            fontWeight: 'bold',
                            color: '#ff6b9d',
                            textShadow: '0 0 30px rgba(255, 107, 157, 0.8)',
                            marginBottom: '10px',
                        }}
                    >
                        {title}
                    </h1>
                    <p
                        style={{
                            fontSize: '36px',
                            color: '#00f5ff',
                            textShadow: '0 0 20px rgba(0, 245, 255, 0.6)',
                            marginBottom: '30px',
                        }}
                    >
                        {subtitle}
                    </p>
                    <div
                        style={{
                            display: 'flex',
                            gap: '30px',
                            fontSize: '28px',
                            color: '#ffffff',
                        }}
                    >
                        <span>📅 {date}</span>
                        <span>🕘 {time}</span>
                    </div>
                    <p
                        style={{
                            fontSize: '24px',
                            color: '#b8b8b8',
                            marginTop: '20px',
                        }}
                    >
                        📍 {location}
                    </p>
                </div>
            </div>
        ),
        {
            ...size,
        }
    )
}
