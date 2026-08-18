import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const chain = {
        from: vi.fn(),
        leftJoin: vi.fn(),
        where: vi.fn(),
        orderBy: vi.fn(),
    }
    chain.from.mockReturnValue(chain)
    chain.leftJoin.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)

    return {
        chain,
        select: vi.fn(() => chain),
        eq: vi.fn((left, right) => ({ left, right })),
        and: vi.fn((...conditions) => conditions),
        desc: vi.fn(value => value),
    }
})

vi.mock('@/lib/db', () => ({
    db: { select: mocks.select },
    isDatabaseConfigured: true,
    appSettings: {},
    events: {},
    rsvpInvitationLinks: {
        id: 'link.id',
        eventId: 'link.eventId',
        expiresAt: 'link.expiresAt',
        usedAt: 'link.usedAt',
        usedRsvpId: 'link.usedRsvpId',
        revokedAt: 'link.revokedAt',
        revokedBy: 'link.revokedBy',
        createdBy: 'link.createdBy',
        createdAt: 'link.createdAt',
    },
    rsvps: {
        id: 'rsvp.id',
        eventId: 'rsvp.eventId',
        name: 'rsvp.name',
    },
}))

vi.mock('drizzle-orm', async importOriginal => ({
    ...(await importOriginal<typeof import('drizzle-orm')>()),
    eq: mocks.eq,
    and: mocks.and,
    desc: mocks.desc,
}))

import { listRsvpInvitationLinks } from '@/lib/queries'

describe('RSVP invitation admin query', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.chain.from.mockReturnValue(mocks.chain)
        mocks.chain.leftJoin.mockReturnValue(mocks.chain)
        mocks.chain.where.mockReturnValue(mocks.chain)
        mocks.chain.orderBy.mockResolvedValue([])
    })

    it('joins the consuming RSVP in the same event and selects its display name', async () => {
        await listRsvpInvitationLinks('fiesta')

        expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({
            usedRsvpId: 'link.usedRsvpId',
            usedRsvpName: 'rsvp.name',
        }))
        expect(mocks.chain.leftJoin).toHaveBeenCalledWith(
            expect.anything(),
            [
                { left: 'rsvp.id', right: 'link.usedRsvpId' },
                { left: 'rsvp.eventId', right: 'link.eventId' },
            ],
        )
        expect(mocks.chain.where).toHaveBeenCalledWith({
            left: 'link.eventId',
            right: 'fiesta',
        })
    })
})
