import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getAppSetting: vi.fn(),
    getEventById: vi.fn(),
    getEventBySlugWithSettings: vi.fn(),
    redirect: vi.fn(() => {
        throw new Error('unexpected redirect')
    }),
}))

vi.mock('@/lib/queries', () => ({
    getAppSetting: mocks.getAppSetting,
    getEventById: mocks.getEventById,
    getEventBySlugWithSettings: mocks.getEventBySlugWithSettings,
}))

vi.mock('next/cache', () => ({
    unstable_noStore: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    redirect: mocks.redirect,
}))

describe('home page rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getAppSetting.mockResolvedValue('event-id')
        mocks.getEventById.mockResolvedValue({ id: 'event-id', slug: 'home-event' })
    })

    it('renders the configured event at / without issuing a server redirect', async () => {
        const { default: Home } = await import('@/app/page')

        const page = await Home() as ReactElement<{ slug: string }>

        expect(mocks.redirect).not.toHaveBeenCalled()
        expect(page.props.slug).toBe('home-event')
    })
})
