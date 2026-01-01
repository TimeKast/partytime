import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import React from 'react'
import eventConfig from '@/event-config.json'
import { getEventBySlugWithSettings } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OG_SIZE = { width: 1200, height: 630 }
const MAX_BYTES = 5 * 1024 * 1024 // 5MB (límite práctico para scrapers como WhatsApp/FB)

function fallbackOg(title: string, subtitle: string, date: string, time: string, location: string) {
  const rootStyle: React.CSSProperties = {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0015',
    backgroundImage: 'linear-gradient(135deg, #1a0033 0%, #0a0015 50%, #000510 100%)',
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    textAlign: 'center',
    width: '100%',
    maxWidth: '1000px',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '68px',
    fontWeight: 800,
    color: '#ff6b9d',
    textShadow: '0 0 30px rgba(255, 107, 157, 0.8)',
    lineHeight: 1.05,
  }

  const subtitleStyle: React.CSSProperties = {
    marginTop: '18px',
    fontSize: '34px',
    color: '#00f5ff',
    textShadow: '0 0 20px rgba(0, 245, 255, 0.6)',
    lineHeight: 1.2,
  }

  const dateRowStyle: React.CSSProperties = {
    marginTop: '34px',
    display: 'flex',
    gap: '28px',
    fontSize: '28px',
    color: '#ffffff',
    opacity: 0.95,
  }

  const locationStyle: React.CSSProperties = {
    marginTop: '18px',
    fontSize: '24px',
    color: '#b8b8b8',
  }

  return new ImageResponse(
    React.createElement(
      'div',
      { style: rootStyle },
      React.createElement(
        'div',
        { style: containerStyle },
        React.createElement('div', { style: titleStyle }, title),
        React.createElement('div', { style: subtitleStyle }, subtitle),
        React.createElement(
          'div',
          { style: dateRowStyle },
          React.createElement('span', null, date),
          React.createElement('span', null, time)
        ),
        React.createElement('div', { style: locationStyle }, location)
      )
    ),
    { ...OG_SIZE }
  )
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // defaults
  let title = eventConfig.event.title
  let subtitle = eventConfig.event.subtitle
  let date = eventConfig.event.date
  let time = eventConfig.event.time
  let location = eventConfig.event.location

  let imageUrl: string | null = null

  try {
    const event = await getEventBySlugWithSettings(slug)
    if (event) {
      title = event.title
      subtitle = event.subtitle
      date = event.date
      time = event.time
      location = event.location
      imageUrl = event.backgroundImageUrl || null
    }
  } catch {
    // ignore, usamos fallback
  }

  if (!imageUrl) {
    return fallbackOg(title, subtitle, date, time, location)
  }

  // Forzar URL absoluta si viene como path local
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://party.timekast.mx'
  if (imageUrl.startsWith('/')) imageUrl = `${baseUrl}${imageUrl}`

  try {
    const res = await fetch(imageUrl, {
      redirect: 'follow',
      // Un UA más "scraper-friendly" reduce bloqueos de algunos CDNs
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })

    if (!res.ok) {
      return fallbackOg(title, subtitle, date, time, location)
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())

    // Si es demasiado grande, WhatsApp suele ignorarlo → devolvemos fallback optimizado.
    if (buf.byteLength > MAX_BYTES) {
      return fallbackOg(title, subtitle, date, time, location)
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Evitar caches agresivos del CDN; WhatsApp cachea por su cuenta.
        'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch {
    return fallbackOg(title, subtitle, date, time, location)
  }
}

