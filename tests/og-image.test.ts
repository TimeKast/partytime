import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
    createOgFallbackRaster,
    normalizeOgImage,
    selectOgImageUrl,
} from '@/lib/og-image'

const OG_WIDTH = 1200
const OG_HEIGHT = 630

async function expectWhatsAppSafeJpeg(image: Buffer) {
    expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))

    const metadata = await sharp(image).metadata()
    expect(metadata.format).toBe('jpeg')
    expect(metadata.width).toBe(OG_WIDTH)
    expect(metadata.height).toBe(OG_HEIGHT)
}

describe('WhatsApp OG image rendering', () => {
    it('renders the generated fallback as a 1200x630 raster image', async () => {
        const image = await createOgFallbackRaster({
            title: 'Fiesta de prueba',
            subtitle: 'Terraza',
            date: '13 de julio',
            time: '20:00',
            location: 'Ciudad de México',
        })

        await expectWhatsAppSafeJpeg(image)
    })

    it('transforms a portrait uploaded source into a 1200x630 raster image', async () => {
        const portrait = await sharp({
            create: {
                width: 630,
                height: 1200,
                channels: 3,
                background: '#7c3aed',
            },
        }).png().toBuffer()

        const image = await normalizeOgImage(portrait)

        await expectWhatsAppSafeJpeg(image)
    })

    it('transforms a decodable source larger than 5 MB instead of discarding it', async () => {
        const largeSource = await sharp({
            create: {
                width: 1600,
                height: 1400,
                channels: 3,
                background: '#0ea5e9',
            },
        }).tiff({ compression: 'none' }).toBuffer()

        expect(largeSource.byteLength).toBeGreaterThan(5 * 1024 * 1024)

        const image = await normalizeOgImage(largeSource)

        await expectWhatsAppSafeJpeg(image)
    })

    it('preserves dedicated OG image priority over the event background', () => {
        expect(selectOgImageUrl({
            ogImageUrl: 'https://blob.example/dedicated.jpg',
            backgroundImageUrl: 'https://blob.example/background.jpg',
        })).toBe('https://blob.example/dedicated.jpg')

        expect(selectOgImageUrl({
            ogImageUrl: null,
            backgroundImageUrl: 'https://blob.example/background.jpg',
        })).toBe('https://blob.example/background.jpg')
    })
})
