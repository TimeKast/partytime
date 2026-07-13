import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATCHWRK_OG_CACHE_VERSION } from '@/lib/og-image-url'

const mocks = vi.hoisted(() => ({
    getEventBySlugWithSettings: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
    getEventBySlugWithSettings: mocks.getEventBySlugWithSettings,
}))

const event = {
    id: 'event-id',
    slug: 'home-event',
    title: 'Fiesta',
    displayTitle: 'Fiesta visible',
    subtitle: 'Terraza',
    date: '13 de julio',
    time: '20:00',
    location: 'Ciudad de México',
    ogImageUrl: null as string | null,
    backgroundImageUrl: null as string | null,
}

async function expectJpegResponse(response: Response) {
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')

    const image = Buffer.from(await response.arrayBuffer())
    expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    await expect(sharp(image).metadata()).resolves.toMatchObject({
        format: 'jpeg',
        width: 1200,
        height: 630,
    })
}

async function callRoute(slug = event.slug) {
    const { GET } = await import('@/app/api/og-image/[slug]/route')
    return GET({} as never, { params: Promise.resolve({ slug }) })
}

describe('OG image route raster contract', () => {
    beforeEach(() => {
        mocks.getEventBySlugWithSettings.mockReset()
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('returns a JPEG fallback when the valid event has no image source', async () => {
        mocks.getEventBySlugWithSettings.mockResolvedValue(event)

        await expectJpegResponse(await callRoute())
    })

    it('returns a JPEG fallback when the selected source fetch fails', async () => {
        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: 'https://blob.example/dedicated.jpg',
            backgroundImageUrl: 'https://blob.example/background.jpg',
        })

        await expectJpegResponse(await callRoute())
    })

    it('returns a normalized JPEG when the selected source is portrait', async () => {
        const portrait = await sharp({
            create: {
                width: 630,
                height: 1200,
                channels: 3,
                background: '#f97316',
            },
        }).png().toBuffer()
        const dedicatedUrl = 'https://blob.example/dedicated.png'

        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: dedicatedUrl,
            backgroundImageUrl: 'https://blob.example/background.jpg',
        })
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
            if (String(url) === dedicatedUrl) {
                return new Response(new Uint8Array(portrait), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return new Response(null, { status: 404 })
        }))

        await expectJpegResponse(await callRoute())
    })

    it('fetches the versioned repository JPEG without cache and serves it before event image sources', async () => {
        const slug = 'patchwrk-260815'
        const customJpeg = readFileSync(`public/og-${slug}.jpg`)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://party.timekast.mx'
        const customJpegUrl = `${baseUrl}/og-${slug}.jpg?v=${PATCHWRK_OG_CACHE_VERSION}`

        const fetchMock = vi.fn(async (url: string | URL | Request) => {
            if (String(url) === customJpegUrl) {
                return new Response(new Uint8Array(customJpeg), {
                    headers: { 'Content-Type': 'image/jpeg' },
                })
            }
            return new Response(null, { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const response = await callRoute(slug)
        const responseImage = Buffer.from(await response.arrayBuffer())

        expect(fetchMock).toHaveBeenCalledWith(customJpegUrl, expect.objectContaining({
            method: 'GET',
            cache: 'no-store',
        }))
        expect(response.headers.get('content-type')).toBe('image/jpeg')
        expect(responseImage).toEqual(customJpeg)
        await expect(sharp(responseImage).metadata()).resolves.toMatchObject({
            format: 'jpeg',
            width: 1200,
            height: 630,
        })
        expect(mocks.getEventBySlugWithSettings).not.toHaveBeenCalled()
    })
})
