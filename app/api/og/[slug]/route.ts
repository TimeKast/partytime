import { ImageResponse } from 'next/og'
import eventConfig from '@/event-config.json'
import { getEventBySlugWithSettings } from '@/lib/queries'
import { NextRequest } from 'next/server'
import React from 'react'

export const runtime = 'nodejs'

const size = { width: 1200, height: 630 }

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

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
    // fallback a config estático
  }

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
    { ...size }
  )
}

