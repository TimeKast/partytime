import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PATCHWRK_OG_CACHE_VERSION } from '@/lib/og-image-url'

const mocks = vi.hoisted(() => ({
  getAppSetting: vi.fn(),
  getEventBySlugWithSettings: vi.fn(),
}))

vi.mock('@/lib/queries', () => ({
  getAppSetting: mocks.getAppSetting,
  getEventById: vi.fn(),
  getEventBySlugWithSettings: mocks.getEventBySlugWithSettings,
}))

const event = {
  slug: 'patchwrk-260815',
  title: 'Patchwrk',
  displayTitle: 'REBIRTH',
  subtitle: '',
  date: '15 de agosto',
  time: '9:00 PM',
  location: 'Secret Location',
}

function expectCacheBustedOgImage(metadata: Awaited<ReturnType<typeof import('@/app/page').generateMetadata>>) {
  const expectedUrl = `https://party.timekast.mx/api/og-image/${event.slug}?v=${PATCHWRK_OG_CACHE_VERSION}`

  expect(metadata.openGraph?.images).toEqual([
    expect.objectContaining({
      url: expectedUrl,
      secureUrl: expectedUrl,
      width: 1200,
      height: 630,
    }),
  ])
  expect(metadata.twitter?.images).toEqual([expectedUrl])
}

describe('Patchwrk OG metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getEventBySlugWithSettings.mockResolvedValue(event)
  })

  it('advertises the cache-busted OG route from the home page', async () => {
    mocks.getAppSetting.mockResolvedValue(event.slug)
    const { generateMetadata } = await import('@/app/page')

    expectCacheBustedOgImage(await generateMetadata())
  })

  it('advertises the same cache-busted OG route from the event page', async () => {
    const { generateMetadata } = await import('@/app/[slug]/layout')

    expectCacheBustedOgImage(await generateMetadata({
      children: null,
      params: Promise.resolve({ slug: event.slug }),
    }))
  })
})
