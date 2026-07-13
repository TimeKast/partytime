import { NextRequest, NextResponse } from 'next/server'
import { getEventBySlugWithSettings } from '@/lib/queries'
import { normalizeOptionalString } from '@/lib/event-presentation'
import { PATCHWRK_OG_SLUG } from '@/lib/og-image-url'
import {
  createOgFallbackRaster,
  isReadyOgJpeg,
  normalizeOgImage,
  selectOgImageUrl,
  type OgFallbackContent,
} from '@/lib/og-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT = 8000
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

function rasterResponse(imageBuffer: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(imageBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': CACHE_CONTROL,
    },
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  console.log(`[OG-Image] Processing request for slug: ${slug}`)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://party.timekast.mx'

  // Preserve support for repository-provided per-event OG files, but normalize
  // them as well so every successful response is safe for social scrapers.
  for (const ext of ['png', 'jpg']) {
    const customOgUrl = `${baseUrl}/og-${slug}.${ext}`
    try {
      console.log(`[OG-Image] Checking for custom OG image: ${customOgUrl}`)
      const customRes = await fetch(customOgUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'OG-Image-Generator/1.0' },
      })

      if (!customRes.ok) continue

      const contentType = customRes.headers.get('content-type') || ''
      if (!contentType.startsWith('image/')) {
        console.log(`[OG-Image] Custom file is not an image (Content-Type: ${contentType}), skipping...`)
        continue
      }

      const imageBuffer = Buffer.from(await customRes.arrayBuffer())
      if (slug === PATCHWRK_OG_SLUG && await isReadyOgJpeg(imageBuffer)) {
        console.log(`[OG-Image] Returning repository-provided OG JPEG without re-encoding (${(imageBuffer.length / 1024).toFixed(0)}KB)`)
        return rasterResponse(imageBuffer)
      }

      const raster = await normalizeOgImage(imageBuffer)
      console.log(`[OG-Image] Normalized custom image from ${(imageBuffer.length / 1024).toFixed(0)}KB to ${(raster.length / 1024).toFixed(0)}KB`)
      return rasterResponse(raster)
    } catch (err) {
      console.log(`[OG-Image] Custom image unavailable or invalid at ${customOgUrl}:`, err)
    }
  }

  const fallbackContent: OgFallbackContent = {
    title: 'Evento',
    subtitle: '',
    date: '',
    time: '',
    location: '',
  }
  let imageUrl: string | null = null

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
      imageUrl = selectOgImageUrl(event)
      console.log(`[OG-Image] Event found: ${fallbackContent.title}, using image: ${imageUrl}`)
    } else {
      console.log(`[OG-Image] Event not found for slug: ${slug}`)
    }
  } catch (err) {
    console.error('[OG-Image] Error fetching event:', err)
  }

  const returnFallback = async () => {
    console.log('[OG-Image] Returning generated JPEG fallback')
    return rasterResponse(await createOgFallbackRaster(fallbackContent))
  }

  if (!imageUrl || imageUrl === '/background.png') {
    console.log(`[OG-Image] No event image configured (${imageUrl || 'null'}), using generated fallback`)
    return returnFallback()
  }

  if (imageUrl.startsWith('/')) imageUrl = `${baseUrl}${imageUrl}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    console.log(`[OG-Image] Fetching image from: ${imageUrl}`)
    const res = await fetch(imageUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': baseUrl,
      },
    })

    if (!res.ok) {
      console.log(`[OG-Image] Fetch failed with status: ${res.status}`)
      return returnFallback()
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      console.log(`[OG-Image] Invalid content type: ${contentType}`)
      return returnFallback()
    }

    const source = Buffer.from(await res.arrayBuffer())
    const raster = await normalizeOgImage(source)
    console.log(`[OG-Image] Normalized event image from ${(source.length / 1024).toFixed(0)}KB to ${(raster.length / 1024).toFixed(0)}KB`)
    return rasterResponse(raster)
  } catch (err) {
    console.error('[OG-Image] Error fetching or transforming image:', err)
    return returnFallback()
  } finally {
    clearTimeout(timeoutId)
  }
}
