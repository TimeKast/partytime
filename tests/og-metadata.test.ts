import type { Metadata } from 'next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getAppSetting: vi.fn(),
    getEventById: vi.fn(),
    getEventBySlugWithSettings: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
    getAppSetting: mocks.getAppSetting,
    getEventById: mocks.getEventById,
    getEventBySlugWithSettings: mocks.getEventBySlugWithSettings,
}))

vi.mock('next/cache', () => ({
    unstable_noStore: vi.fn(),
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
    ogImageUrl: 'https://blob.example/dedicated-a.jpg' as string | null,
    backgroundImageUrl: 'https://blob.example/background-a.jpg' as string | null,
}

function getMetadataImageUrl(metadata: Metadata): string {
    const images = metadata.openGraph?.images
    const image = Array.isArray(images) ? images[0] : images

    if (typeof image === 'string') return image
    if (image instanceof URL) return image.toString()
    if (image && 'url' in image) return image.url.toString()

    throw new Error('OpenGraph image URL is missing')
}

function getTwitterImageUrl(metadata: Metadata): string {
    const images = metadata.twitter?.images
    const image = Array.isArray(images) ? images[0] : images

    if (typeof image === 'string') return image
    if (image instanceof URL) return image.toString()
    if (image && 'url' in image) return image.url.toString()

    throw new Error('Twitter image URL is missing')
}

async function getEventMetadata(currentEvent = event): Promise<Metadata> {
    mocks.getEventBySlugWithSettings.mockResolvedValue(currentEvent)
    const { generateMetadata } = await import('@/app/[slug]/layout')
    return generateMetadata({
        children: null,
        params: Promise.resolve({ slug: currentEvent.slug }),
    })
}

async function getHomeMetadata(currentEvent = event): Promise<Metadata> {
    mocks.getAppSetting.mockResolvedValue(currentEvent.id)
    mocks.getEventBySlugWithSettings.mockResolvedValue(currentEvent)
    const { generateMetadata } = await import('@/app/page')
    return generateMetadata()
}

describe('OG metadata cache keys', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('changes the metadata image URL when the dedicated OG URL changes', async () => {
        const first = getMetadataImageUrl(await getEventMetadata(event))
        const second = getMetadataImageUrl(await getEventMetadata({
            ...event,
            ogImageUrl: 'https://blob.example/dedicated-b.jpg',
        }))

        expect(first).not.toBe(second)
    })

    it('uses the same metadata image URL for the home and event pages', async () => {
        const eventMetadata = await getEventMetadata(event)
        const homeMetadata = await getHomeMetadata(event)
        const eventImage = getMetadataImageUrl(eventMetadata)
        const homeImage = getMetadataImageUrl(homeMetadata)

        expect(homeImage).toBe(eventImage)
        expect(getTwitterImageUrl(eventMetadata)).toBe(eventImage)
        expect(getTwitterImageUrl(homeMetadata)).toBe(homeImage)

        const cacheKey = new URL(eventImage).searchParams.get('v')
        expect(cacheKey).toMatch(/^[a-f0-9]{12}$/)
        expect(eventImage).not.toContain('blob.example')
    })

    it('derives the key from background only when no dedicated OG is configured', async () => {
        const backgroundOnly = { ...event, ogImageUrl: null }
        const first = getMetadataImageUrl(await getEventMetadata(backgroundOnly))
        const second = getMetadataImageUrl(await getEventMetadata({
            ...backgroundOnly,
            backgroundImageUrl: 'https://blob.example/background-b.jpg',
        }))

        expect(first).not.toBe(second)
    })

    it('keeps the dedicated key when only the lower-priority background changes', async () => {
        const first = getMetadataImageUrl(await getEventMetadata(event))
        const second = getMetadataImageUrl(await getEventMetadata({
            ...event,
            backgroundImageUrl: 'https://blob.example/background-b.jpg',
        }))

        expect(first).toBe(second)
    })

    it('keeps a stable fallback key when no persisted image source is configured', async () => {
        const noPersistedSource = {
            ...event,
            ogImageUrl: null,
            backgroundImageUrl: null,
        }

        const first = getMetadataImageUrl(await getEventMetadata(noPersistedSource))
        const second = getMetadataImageUrl(await getEventMetadata(noPersistedSource))

        expect(first).toBe(second)
    })
})
