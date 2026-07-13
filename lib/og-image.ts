import sharp from 'sharp'

export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

export interface OgFallbackContent {
    title: string
    subtitle: string
    date: string
    time: string
    location: string
}

interface OgImageSources {
    ogImageUrl?: string | null
    backgroundImageUrl?: string | null
}

export function selectOgImageUrl(sources: OgImageSources): string | null {
    return sources.ogImageUrl || sources.backgroundImageUrl || null
}

export async function normalizeOgImage(imageBuffer: Buffer): Promise<Buffer> {
    return sharp(imageBuffer)
        .rotate()
        .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, {
            fit: 'cover',
            position: 'center',
        })
        .flatten({ background: '#0a0015' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer()
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function createOgFallbackSvg(content: OgFallbackContent): string {
    const lines = [
        { text: content.title, size: 64, weight: 800, color: '#ff6b9d', glow: true },
        ...(content.subtitle
            ? [{ text: content.subtitle, size: 32, weight: 600, color: '#00f5ff', glow: true }]
            : []),
        ...((content.date || content.time)
            ? [{
                text: [content.date, content.time].filter(Boolean).join('  •  '),
                size: 26,
                weight: 500,
                color: '#ffffff',
                glow: false,
            }]
            : []),
        ...(content.location
            ? [{ text: `📍 ${content.location}`, size: 22, weight: 500, color: '#b8b8b8', glow: false }]
            : []),
    ]
    const lineGap = 76
    const startY = 315 - ((lines.length - 1) * lineGap) / 2
    const textElements = lines.map((line, index) => (
        `<text x="600" y="${startY + index * lineGap}" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="${line.size}" font-weight="${line.weight}" fill="${line.color}"${line.glow ? ' filter="url(#glow)"' : ''}>${escapeXml(line.text)}</text>`
    )).join('\n  ')

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
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
  ${textElements}
</svg>`
}

export async function createOgFallbackRaster(content: OgFallbackContent): Promise<Buffer> {
    return normalizeOgImage(Buffer.from(createOgFallbackSvg(content)))
}
