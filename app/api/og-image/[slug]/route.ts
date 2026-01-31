import { NextRequest, NextResponse } from 'next/server'
import { getEventBySlugWithSettings } from '@/lib/queries'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OG_SIZE = { width: 1200, height: 630 }
const MAX_BYTES = 5 * 1024 * 1024 // 5MB (límite práctico para scrapers como WhatsApp/FB)
const TARGET_SIZE_KB = 280 // Objetivo: < 280KB para WhatsApp
const FETCH_TIMEOUT = 8000 // 8 segundos timeout para fetch de imagen
const MIN_ASPECT_RATIO = 1.2 // Mínimo ratio ancho/alto para considerar imagen horizontal (landscape)

// Comprimir imagen con sharp para WhatsApp (objetivo: < 250KB)
async function compressForWhatsApp(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const compressed = await sharp(imageBuffer)
      .resize(1200, 630, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer()
    
    console.log(`[OG-Image] Compressed from ${(imageBuffer.length/1024).toFixed(0)}KB to ${(compressed.length/1024).toFixed(0)}KB`)
    return compressed
  } catch (err) {
    console.error(`[OG-Image] Compression failed:`, err)
    return imageBuffer
  }
}

// Función para obtener dimensiones de imagen desde buffer (PNG y JPEG)
function getImageDimensions(buf: Buffer): { width: number; height: number } | null {
  try {
    // PNG: bytes 16-19 = width, 20-23 = height (big-endian)
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      const width = buf.readUInt32BE(16)
      const height = buf.readUInt32BE(20)
      return { width, height }
    }
    
    // JPEG: buscar marker SOF0 (0xFFC0) o SOF2 (0xFFC2)
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let offset = 2
      while (offset < buf.length - 8) {
        if (buf[offset] !== 0xFF) {
          offset++
          continue
        }
        const marker = buf[offset + 1]
        // SOF markers: 0xC0-0xCF (excepto 0xC4, 0xC8, 0xCC que son otros)
        if ((marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          const height = buf.readUInt16BE(offset + 5)
          const width = buf.readUInt16BE(offset + 7)
          return { width, height }
        }
        // Saltar al siguiente segmento
        const segmentLength = buf.readUInt16BE(offset + 2)
        offset += 2 + segmentLength
      }
    }
    
    return null
  } catch {
    return null
  }
}

// Escapar caracteres especiales para XML/SVG
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Genera una imagen OG como SVG - funciona universalmente sin dependencias problemáticas
function createOgSvg(title: string, subtitle: string, date: string, time: string, location: string): NextResponse {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_SIZE.width}" height="${OG_SIZE.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a0033"/>
      <stop offset="50%" style="stop-color:#0a0015"/>
      <stop offset="100%" style="stop-color:#000510"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="600" y="200" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="64" font-weight="800" fill="#ff6b9d" filter="url(#glow)">${escapeXml(title)}</text>
  <text x="600" y="280" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="32" fill="#00f5ff" filter="url(#glow)">${escapeXml(subtitle)}</text>
  <text x="600" y="380" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="26" fill="#ffffff">${escapeXml(date)}  •  ${escapeXml(time)}</text>
  <text x="600" y="440" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="22" fill="#b8b8b8">📍 ${escapeXml(location)}</text>
</svg>`

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  console.log(`[OG-Image] Processing request for slug: ${slug}`)

  // 1. Primero buscar si existe una imagen OG personalizada en public/
  //    Formato: og-[slug].png o og-[slug].jpg
  //    En Vercel, los archivos de public/ no están accesibles via readFileSync,
  //    así que hacemos fetch desde la URL pública
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://party.timekast.mx'
  
  for (const ext of ['png', 'jpg']) {
    const customOgUrl = `${baseUrl}/og-${slug}.${ext}`
    try {
      console.log(`[OG-Image] Checking for custom OG image: ${customOgUrl}`)
      const customRes = await fetch(customOgUrl, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'OG-Image-Generator/1.0' }
      })
      
      if (customRes.ok) {
        // Verificar Content-Type del HEAD response
        const headContentType = customRes.headers.get('content-type') || ''
        if (!headContentType.startsWith('image/')) {
          console.log(`[OG-Image] Custom file is not an image (Content-Type: ${headContentType}), skipping...`)
          continue // Intentar siguiente extensión o pasar a imagen de BD
        }

        // La imagen existe, hacer fetch completo
        console.log(`[OG-Image] Found custom OG image at ${customOgUrl}`)
        const fullRes = await fetch(customOgUrl, {
          headers: { 'User-Agent': 'OG-Image-Generator/1.0' }
        })
        const imageBuffer = Buffer.from(await fullRes.arrayBuffer())
        console.log(`[OG-Image] Custom image size: ${(imageBuffer.length/1024).toFixed(0)}KB`)
        
        // Validar que el buffer sea una imagen real (mínimo 10KB y magic bytes válidos)
        const MIN_VALID_SIZE = 10 * 1024 // Mínimo 10KB para imagen válida
        const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47
        const isJpeg = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8 && imageBuffer[2] === 0xFF
        
        if (imageBuffer.length < MIN_VALID_SIZE || (!isPng && !isJpeg)) {
          console.log(`[OG-Image] Custom image invalid or too small (${imageBuffer.length} bytes, PNG: ${isPng}, JPEG: ${isJpeg}), falling back to event image...`)
          break // Salir del loop y usar imagen del evento
        }
        
        // Comprimir si es mayor a TARGET_SIZE_KB
        let finalBuffer: Buffer = imageBuffer
        let contentType = ext === 'png' ? 'image/png' : 'image/jpeg'
        
        if (imageBuffer.length > TARGET_SIZE_KB * 1024) {
          console.log(`[OG-Image] Compressing image for WhatsApp compatibility...`)
          const compressed = await compressForWhatsApp(imageBuffer)
          finalBuffer = Buffer.from(compressed)
          contentType = 'image/jpeg' // Sharp convierte a JPEG
        }
        
        return new NextResponse(new Uint8Array(finalBuffer), {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
          },
        })
      }
    } catch (err) {
      console.log(`[OG-Image] Custom image not found at ${customOgUrl}:`, err)
    }
  }

  // 2. Si no hay imagen personalizada, obtener datos del evento
  let title = 'Evento'
  let subtitle = ''
  let date = ''
  let time = ''
  let location = ''
  let imageUrl: string | null = null

  try {
    const event = await getEventBySlugWithSettings(slug)
    if (event) {
      title = event.title || 'Evento'
      subtitle = event.subtitle || ''
      date = event.date || ''
      time = event.time || ''
      location = event.location || ''
      imageUrl = event.backgroundImageUrl || null
      console.log(`[OG-Image] Event found: ${title}, imageUrl: ${imageUrl}`)
    } else {
      console.log(`[OG-Image] Event not found for slug: ${slug}`)
    }
  } catch (err) {
    console.error(`[OG-Image] Error fetching event:`, err)
  }

  // Helper para devolver fallback SVG
  const returnFallback = () => {
    console.log(`[OG-Image] Returning generated SVG fallback`)
    return createOgSvg(title, subtitle, date, time, location)
  }

  // Si no hay imagen configurada, usar fallback generado
  if (!imageUrl) {
    console.log(`[OG-Image] No image URL configured, using generated fallback`)
    return returnFallback()
  }

  // Forzar URL absoluta si viene como path local
  if (imageUrl.startsWith('/')) imageUrl = `${baseUrl}${imageUrl}`

  try {
    // Crear AbortController para timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    console.log(`[OG-Image] Fetching image from: ${imageUrl}`)
    
    const res = await fetch(imageUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Simular un navegador real para evitar bloqueos
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': baseUrl,
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.log(`[OG-Image] Fetch failed with status: ${res.status}`)
      return returnFallback()
    }

    const contentType = res.headers.get('content-type') || 'image/png'
    
    // Verificar que sea una imagen válida
    if (!contentType.startsWith('image/')) {
      console.log(`[OG-Image] Invalid content type: ${contentType}`)
      return returnFallback()
    }

    const buf = Buffer.from(await res.arrayBuffer())
    console.log(`[OG-Image] Image fetched successfully, size: ${buf.byteLength} bytes`)

    // Verificar que el buffer no esté vacío
    if (buf.byteLength < 1000) {
      console.log(`[OG-Image] Image too small or empty (${buf.byteLength} bytes), using fallback`)
      return returnFallback()
    }

    // Si es demasiado grande, WhatsApp suele ignorarlo → devolvemos fallback optimizado
    if (buf.byteLength > MAX_BYTES) {
      console.log(`[OG-Image] Image too large (${buf.byteLength} bytes), using fallback`)
      return returnFallback()
    }

    // Verificar dimensiones: si es vertical (portrait), usar fallback con formato OG correcto
    const dimensions = getImageDimensions(buf)
    if (dimensions) {
      const aspectRatio = dimensions.width / dimensions.height
      console.log(`[OG-Image] Image dimensions: ${dimensions.width}x${dimensions.height}, aspect ratio: ${aspectRatio.toFixed(2)}`)
      
      if (aspectRatio < MIN_ASPECT_RATIO) {
        console.log(`[OG-Image] Image is vertical/square (ratio ${aspectRatio.toFixed(2)} < ${MIN_ASPECT_RATIO}), using generated OG fallback`)
        return returnFallback()
      }
    } else {
      console.log(`[OG-Image] Could not determine image dimensions, proceeding with proxy`)
    }

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error(`[OG-Image] Error fetching image:`, err)
    return returnFallback()
  }
}
