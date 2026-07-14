import { NextRequest, NextResponse } from 'next/server'
import { getEventBySlugWithSettings } from '@/lib/queries'
import { normalizeOptionalString } from '@/lib/event-presentation'
import {
  createOgFallbackRaster,
  normalizeOgImage,
  type OgFallbackContent,
} from '@/lib/og-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT = 8000
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
type OgSource = 'dedicated' | 'static' | 'background' | 'generated'

function rasterResponse(imageBuffer: Buffer, source: OgSource): NextResponse {
  return new NextResponse(new Uint8Array(imageBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': CACHE_CONTROL,
      'X-OG-Source': source,
    },
  })
}

async function fetchRasterImage(
  imageUrl: string,
  headers: Record<string, string>,
): Promise<Buffer | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers,
      cache: 'no-store',
    })

    if (!response.ok) {
      console.log(`[OG-Image] Fetch failed for ${imageUrl} with status: ${response.status}`)
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      console.log(`[OG-Image] Invalid content type for ${imageUrl}: ${contentType}`)
      return null
    }

    const source = Buffer.from(await response.arrayBuffer())
    const raster = await normalizeOgImage(source)
    console.log(`[OG-Image] Normalized ${imageUrl} from ${(source.length / 1024).toFixed(0)}KB to ${(raster.length / 1024).toFixed(0)}KB`)
    return raster
  } catch (err) {
    console.log(`[OG-Image] Image unavailable or invalid at ${imageUrl}:`, err)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  console.log(`[OG-Image] Processing request for slug: ${slug}`)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://party.timekast.mx'

  const fallbackContent: OgFallbackContent = {
    title: 'Evento',
    subtitle: '',
    date: '',
    time: '',
    location: '',
  }
  let dedicatedImageUrl: string | null = null
  let backgroundImageUrl: string | null = null

  try {
    const event = await getEventBySlugWithSettings(slug)
    if (event) {
      fallbackContent.title = normalizeOptionalString(event.displayTitle)
        || normalizeOptionalString(event.title)
        || 'Evento'
      fallbackContent.subtitle = normalizeOptionalString(event.subtitle)
      fallbackContent.date = normalizeOptionalString(event.date)
      fallbackContent.time = normalizeOptionalString(event.time)
      fallbackContent.location = normalizeOptionalString(event.location)
      dedicatedImageUrl = event.ogImageUrl
      backgroundImageUrl = event.backgroundImageUrl
      console.log(`[OG-Image] Event found: ${fallbackContent.title}`)
    } else {
      console.log(`[OG-Image] Event not found for slug: ${slug}`)
    }
  } catch (err) {
    console.error('[OG-Image] Error fetching event:', err)
  }

  const returnFallback = async () => {
    console.log('[OG-Image] Returning generated JPEG fallback')
    return rasterResponse(await createOgFallbackRaster(fallbackContent), 'generated')
  }

  const eventImageHeaders = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': baseUrl,
  }

  const hasDedicatedImage = Boolean(dedicatedImageUrl)

  if (hasDedicatedImage && dedicatedImageUrl) {
    const imageUrl = dedicatedImageUrl.startsWith('/')
      ? `${baseUrl}${dedicatedImageUrl}`
      : dedicatedImageUrl
    const raster = await fetchRasterImage(imageUrl, eventImageHeaders)
    if (raster) return rasterResponse(raster, 'dedicated')
  }

  if (!hasDedicatedImage) {
    for (const ext of ['png', 'jpg']) {
      const customOgUrl = `${baseUrl}/og-${slug}.${ext}`
      console.log(`[OG-Image] Checking for custom OG image: ${customOgUrl}`)
      const raster = await fetchRasterImage(customOgUrl, {
        'User-Agent': 'OG-Image-Generator/1.0',
      })
      if (raster) return rasterResponse(raster, 'static')
    }
  }

  if (backgroundImageUrl && backgroundImageUrl !== '/background.png') {
    const imageUrl = backgroundImageUrl.startsWith('/')
      ? `${baseUrl}${backgroundImageUrl}`
      : backgroundImageUrl
    const raster = await fetchRasterImage(imageUrl, eventImageHeaders)
    if (raster) return rasterResponse(raster, 'background')
  }

  console.log('[OG-Image] No usable event image configured, using generated fallback')
  return returnFallback()
}
