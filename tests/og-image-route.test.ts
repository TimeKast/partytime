import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOgImage } from '@/lib/og-image'

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

type OgSource = 'dedicated' | 'static' | 'background' | 'generated'

async function expectJpegResponse(response: Response, source: OgSource) {
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('x-og-source')).toBe(source)

    const image = Buffer.from(await response.arrayBuffer())
    expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    await expect(sharp(image).metadata()).resolves.toMatchObject({
        format: 'jpeg',
        width: 1200,
        height: 630,
    })
}

async function expectNormalizedSource(response: Response, source: Buffer, sourceCategory: OgSource) {
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('x-og-source')).toBe(sourceCategory)

    const actual = Buffer.from(await response.arrayBuffer())
    const expected = await normalizeOgImage(source)
    const [actualPixels, expectedPixels] = await Promise.all([
        sharp(actual).raw().toBuffer(),
        sharp(expected).raw().toBuffer(),
    ])

    expect(Buffer.compare(actualPixels, expectedPixels)).toBe(0)
}

async function createSolidImage(background: string) {
    return sharp({
        create: {
            width: 1200,
            height: 630,
            channels: 3,
            background,
        },
    }).png().toBuffer()
}

async function callRoute() {
    const { GET } = await import('@/app/api/og-image/[slug]/route')
    return GET({} as never, { params: Promise.resolve({ slug: event.slug }) })
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

        await expectJpegResponse(await callRoute(), 'generated')
    })

    it('returns a JPEG fallback when the selected source fetch fails', async () => {
        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: 'https://blob.example/dedicated.jpg',
            backgroundImageUrl: 'https://blob.example/background.jpg',
        })

        await expectJpegResponse(await callRoute(), 'generated')
    })

    it('prefers the persisted dedicated image when a static custom image is available', async () => {
        const dedicatedUrl = 'https://blob.example/dedicated.png'
        const dedicated = await createSolidImage('#f97316')
        const staticImage = await createSolidImage('#7c3aed')

        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: dedicatedUrl,
            backgroundImageUrl: 'https://blob.example/background.jpg',
        })
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
            if (String(url) === dedicatedUrl) {
                return new Response(new Uint8Array(dedicated), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            if (String(url).endsWith(`/og-${event.slug}.png`)) {
                return new Response(new Uint8Array(staticImage), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return new Response(null, { status: 404 })
        }))

        const response = await callRoute()

        await expectNormalizedSource(response, dedicated, 'dedicated')
        expect(fetch).toHaveBeenCalledWith(dedicatedUrl, expect.objectContaining({
            cache: 'no-store',
        }))
    })

    it('skips a legacy static image and falls through to the background when dedicated fetch fails', async () => {
        const dedicatedUrl = 'https://blob.example/dedicated.png'
        const backgroundUrl = 'https://blob.example/background.png'
        const staticImage = await createSolidImage('#7c3aed')
        const background = await createSolidImage('#0ea5e9')
        const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
            if (String(url) === dedicatedUrl) {
                return new Response(null, { status: 503 })
            }
            if (String(url).endsWith(`/og-${event.slug}.png`)) {
                return new Response(new Uint8Array(staticImage), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            if (String(url) === backgroundUrl) {
                return new Response(new Uint8Array(background), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return new Response(null, { status: 404 })
        })

        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: dedicatedUrl,
            backgroundImageUrl: backgroundUrl,
        })
        vi.stubGlobal('fetch', fetchMock)

        const response = await callRoute()

        await expectNormalizedSource(response, background, 'background')
        expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
            dedicatedUrl,
            backgroundUrl,
        ])
        for (const [, init] of fetchMock.mock.calls) {
            expect(init).toEqual(expect.objectContaining({ cache: 'no-store' }))
        }
    })

    it('uses a legacy static image only when no dedicated image is configured', async () => {
        const staticImage = await createSolidImage('#7c3aed')
        const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
            if (String(url).endsWith(`/og-${event.slug}.png`)) {
                return new Response(new Uint8Array(staticImage), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return new Response(null, { status: 404 })
        })

        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: null,
            backgroundImageUrl: 'https://blob.example/background.jpg',
        })
        vi.stubGlobal('fetch', fetchMock)

        await expectNormalizedSource(await callRoute(), staticImage, 'static')
        expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ cache: 'no-store' }))
    })

    it('treats a legacy-looking dedicated URL as configured and skips static fallback', async () => {
        const dedicatedUrl = '/background.png'
        const resolvedDedicatedUrl = `https://party.timekast.mx${dedicatedUrl}`
        const backgroundUrl = 'https://blob.example/background.png'
        const staticImage = await createSolidImage('#7c3aed')
        const background = await createSolidImage('#0ea5e9')
        const fetchMock = vi.fn(async (url: string | URL | Request) => {
            if (String(url) === resolvedDedicatedUrl) {
                return new Response(null, { status: 404 })
            }
            if (String(url).endsWith(`/og-${event.slug}.png`)) {
                return new Response(new Uint8Array(staticImage), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            if (String(url) === backgroundUrl) {
                return new Response(new Uint8Array(background), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return new Response(null, { status: 404 })
        })

        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: dedicatedUrl,
            backgroundImageUrl: backgroundUrl,
        })
        vi.stubGlobal('fetch', fetchMock)

        await expectNormalizedSource(await callRoute(), background, 'background')
        expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
            resolvedDedicatedUrl,
            backgroundUrl,
        ])
    })

    it('falls through to the background when the dedicated response is invalid and no static image exists', async () => {
        const dedicatedUrl = 'https://blob.example/dedicated.png'
        const backgroundUrl = 'https://blob.example/background.png'
        const background = await createSolidImage('#0ea5e9')

        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: dedicatedUrl,
            backgroundImageUrl: backgroundUrl,
        })
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
            if (String(url) === dedicatedUrl) {
                return new Response('<html>not an image</html>', {
                    headers: { 'Content-Type': 'text/html' },
                })
            }
            if (String(url) === backgroundUrl) {
                return new Response(new Uint8Array(background), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return new Response(null, { status: 404 })
        }))

        await expectNormalizedSource(await callRoute(), background, 'background')
    })

    it('uses the generated fallback instead of static when dedicated content is invalid and no background exists', async () => {
        const dedicatedUrl = 'https://blob.example/dedicated.png'
        const staticImage = await createSolidImage('#7c3aed')
        const fetchMock = vi.fn(async (url: string | URL | Request) => {
            if (String(url) === dedicatedUrl) {
                return new Response('<html>not an image</html>', {
                    headers: { 'Content-Type': 'text/html' },
                })
            }
            if (String(url).endsWith(`/og-${event.slug}.png`)) {
                return new Response(new Uint8Array(staticImage), {
                    headers: { 'Content-Type': 'image/png' },
                })
            }
            return new Response(null, { status: 404 })
        })

        mocks.getEventBySlugWithSettings.mockResolvedValue({
            ...event,
            ogImageUrl: dedicatedUrl,
            backgroundImageUrl: null,
        })
        vi.stubGlobal('fetch', fetchMock)

        await expectJpegResponse(await callRoute(), 'generated')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(dedicatedUrl, expect.objectContaining({
            cache: 'no-store',
        }))
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

        await expectJpegResponse(await callRoute(), 'dedicated')
    })
})
