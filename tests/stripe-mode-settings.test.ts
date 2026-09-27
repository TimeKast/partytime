/**
 * Migration 0013 — per-event Stripe mode (events.stripe_mode), API half:
 * lib/event-api-contract.ts (parse + permission), POST
 * /api/admin/event-settings/update (partial and full paths), GET
 * /api/event-settings (mode + one "key present" flag per mode), and the
 * public event DTO's `paymentTestMode` boolean.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event as DatabaseEvent } from '@/lib/schema'

const mocks = vi.hoisted(() => ({
    getEventBySlug: vi.fn(),
    updateEvent: vi.fn(),
    validateSession: vi.fn(),
    userHasEventAccess: vi.fn(),
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: vi.fn(() => ({ value: 'session-token' })),
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
}))

vi.mock('@/lib/user-queries', () => ({
    userHasEventAccess: mocks.userHasEventAccess,
}))

vi.mock('@/lib/db', () => ({
    isDatabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    updateEvent: mocks.updateEvent,
}))

const storedEvent: DatabaseEvent = {
    id: 'event-id',
    slug: 'fiesta',
    title: 'Fiesta',
    displayTitle: '',
    subtitle: '',
    date: '',
    time: '',
    location: '',
    details: '',
    priceEnabled: true,
    priceAmount: 250,
    priceCurrency: 'MXN',
    paymentRequired: true,
    stripeMode: 'live',
    capacityEnabled: false,
    capacityLimit: 0,
    backgroundImageUrl: '/background.png',
    presentationMode: 'classic',
    rsvpTitle: 'RSVP',
    rsvpButtonLabel: 'Confirmar',
    backgroundOverlayStrength: 20,
    backgroundImageFit: 'cover',
    backgroundImagePosition: 'center',
    ogImageUrl: '',
    theme: {
        primaryColor: '#FF1493',
        secondaryColor: '#00FFFF',
        accentColor: '#FFD700',
        backgroundColor: '#1a0033',
        textColor: '#ffffff',
    },
    hostName: '',
    hostEmail: '',
    hostPhone: '',
    isActive: true,
    rsvpClosed: false,
    rsvpClosedMessage: '',
    requirePlusOneName: false,
    emailConfirmationEnabled: false,
    emailVerificationEnabled: false,
    reminderEnabled: false,
    reminderScheduledAt: null,
    reminderSentAt: null,
    checkinEnabled: false,
    checkinPasswordHash: null,
    checkinPasswordUpdatedAt: null,
    ledgerStripeIsParticipant: false,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
}

function fullUpdate(extra: Record<string, unknown> = {}) {
    return {
        eventId: storedEvent.slug,
        title: storedEvent.title,
        price: { enabled: true, amount: 250, currency: 'MXN' },
        paymentRequired: true,
        capacity: { enabled: false, limit: 0 },
        backgroundImage: { url: storedEvent.backgroundImageUrl },
        ogImage: { url: '' },
        theme: storedEvent.theme,
        ...extra,
    }
}

async function updateSettings(body: object) {
    const { POST } = await import('@/app/api/admin/event-settings/update/route')
    return POST(new Request('http://localhost/api/admin/event-settings/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    }) as never)
}

async function getSettings(eventId = storedEvent.slug) {
    const { GET } = await import('@/app/api/event-settings/route')
    return GET(new Request(`http://localhost/api/event-settings?eventId=${eventId}`) as never)
}

const asSuperAdmin = () => mocks.validateSession.mockResolvedValue({ id: 'root', role: 'super_admin' })
const asManager = () => {
    mocks.validateSession.mockResolvedValue({ id: 'manager-1', role: 'user' })
    mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true, role: 'manager' })
}

beforeEach(() => {
    vi.clearAllMocks()
    asSuperAdmin()
    mocks.getEventBySlug.mockResolvedValue(storedEvent)
    mocks.updateEvent.mockImplementation(async (_id: string, updates: object) => ({ ...storedEvent, ...updates }))
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('lib/event-api-contract — stripeMode parsing', () => {
    it('only puts a REAL change into updates; omitted or same value is not a change', async () => {
        const { parseEventUpdateRequest } = await import('@/lib/event-api-contract')

        const omitted = parseEventUpdateRequest({ title: 'Fiesta' }, storedEvent.slug, storedEvent)
        const same = parseEventUpdateRequest({ stripeMode: 'live' }, storedEvent.slug, storedEvent)
        const changed = parseEventUpdateRequest({ stripeMode: 'test' }, storedEvent.slug, storedEvent)

        expect(omitted.success && omitted.value.updates).not.toHaveProperty('stripeMode')
        expect(same.success && same.value.updates).not.toHaveProperty('stripeMode')
        expect(changed).toMatchObject({ success: true, value: { updates: { stripeMode: 'test' } } })
    })

    it.each([['LIVE'], ['sandbox'], [''], [null], [true], [1], [{ mode: 'test' }]])(
        'rejects stripeMode %j with a 400-class parse error',
        async (value) => {
            const { parseEventUpdateRequest, parseCreateEventRequest, STRIPE_MODE_INVALID_ERROR } = await import('@/lib/event-api-contract')

            expect(parseEventUpdateRequest({ stripeMode: value }, storedEvent.slug, storedEvent))
                .toEqual({ success: false, error: STRIPE_MODE_INVALID_ERROR })
            expect(parseCreateEventRequest({ slug: 'nueva', title: 'Nueva', stripeMode: value }))
                .toEqual({ success: false, error: STRIPE_MODE_INVALID_ERROR })
        },
    )

    it('create accepts an explicit test mode and omits the key otherwise (DB default live)', async () => {
        const { parseCreateEventRequest } = await import('@/lib/event-api-contract')

        expect(parseCreateEventRequest({ slug: 'demo', title: 'Demo', stripeMode: 'test' }))
            .toMatchObject({ success: true, value: { stripeMode: 'test' } })
        const defaulted = parseCreateEventRequest({ slug: 'demo', title: 'Demo' })
        expect(defaulted.success && defaulted.value).not.toHaveProperty('stripeMode')
    })

    it('validateAndApplyEventUpdate: a change is 403 unless canChangeStripeMode (fails closed by default)', async () => {
        const { validateAndApplyEventUpdate, STRIPE_MODE_FORBIDDEN_ERROR } = await import('@/lib/event-api-contract')
        const mutations = { updateSlug: vi.fn(), updateEvent: vi.fn(async (_id: string, updates: object) => ({ ...storedEvent, ...updates })) }

        const denied = await validateAndApplyEventUpdate({ stripeMode: 'test' }, storedEvent.slug, storedEvent, false, mutations)
        expect(denied).toEqual({ success: false, status: 403, error: STRIPE_MODE_FORBIDDEN_ERROR })
        expect(mutations.updateEvent).not.toHaveBeenCalled()

        const unchanged = await validateAndApplyEventUpdate({ stripeMode: 'live', title: 'Otra' }, storedEvent.slug, storedEvent, false, mutations)
        expect(unchanged.success).toBe(true)
        expect(mutations.updateEvent).toHaveBeenCalledWith(storedEvent.id, { title: 'Otra' })

        mutations.updateEvent.mockClear()
        const allowed = await validateAndApplyEventUpdate(
            { stripeMode: 'test' }, storedEvent.slug, storedEvent, true, mutations, { canChangeStripeMode: true },
        )
        expect(allowed.success).toBe(true)
        expect(mutations.updateEvent).toHaveBeenCalledWith(storedEvent.id, { stripeMode: 'test' })
    })

    it('the PUT /api/events/[slug] route grants canChangeStripeMode only to super_admin', async () => {
        const { readFileSync } = await import('node:fs')
        const route = readFileSync('app/api/events/[slug]/route.ts', 'utf8')
        expect(route).toContain("{ canChangeStripeMode: currentUser.role === 'super_admin' }")
    })
})

describe('POST /api/admin/event-settings/update — stripeMode', () => {
    it('super_admin can switch live -> test on the full path', async () => {
        const response = await updateSettings(fullUpdate({ stripeMode: 'test' }))

        expect(response.status).toBe(200)
        expect(mocks.updateEvent).toHaveBeenCalledWith(storedEvent.id, expect.objectContaining({ stripeMode: 'test' }))
    })

    it('super_admin can switch on the partial (image-only) path too', async () => {
        const response = await updateSettings({
            eventId: storedEvent.slug,
            backgroundImage: { url: '/nuevo.png' },
            stripeMode: 'test',
        })

        expect(response.status).toBe(200)
        expect(mocks.updateEvent).toHaveBeenCalledWith(storedEvent.id, expect.objectContaining({
            stripeMode: 'test',
            backgroundImageUrl: '/nuevo.png',
        }))
    })

    it('a manager trying to CHANGE the mode gets 403 and nothing is written (full and partial paths)', async () => {
        asManager()

        const full = await updateSettings(fullUpdate({ stripeMode: 'test' }))
        const partial = await updateSettings({ eventId: storedEvent.slug, ogImage: { url: '' }, stripeMode: 'test' })

        expect(full.status).toBe(403)
        expect(partial.status).toBe(403)
        expect((await full.json()).message).toMatch(/Super Admin/)
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })

    it('a manager re-sending the SAME stored mode is not a change (200, stripeMode not written)', async () => {
        asManager()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent, stripeMode: 'test' })

        const response = await updateSettings(fullUpdate({ stripeMode: 'test' }))

        expect(response.status).toBe(200)
        expect(mocks.updateEvent).toHaveBeenCalledTimes(1)
        expect(mocks.updateEvent.mock.calls[0][1]).not.toHaveProperty('stripeMode')
    })

    it('a manager saving without stripeMode (the admin UI never sends it for them) still works', async () => {
        asManager()
        const response = await updateSettings(fullUpdate())
        expect(response.status).toBe(200)
        expect(mocks.updateEvent.mock.calls[0][1]).not.toHaveProperty('stripeMode')
    })

    it.each([['production'], [null], [false]])('rejects stripeMode %j with 400 for every role', async (value) => {
        const asSuper = await updateSettings(fullUpdate({ stripeMode: value }))
        asManager()
        const asMgr = await updateSettings(fullUpdate({ stripeMode: value }))

        expect(asSuper.status).toBe(400)
        expect(asMgr.status).toBe(400)
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })

    it('a viewer is still rejected by the existing manager-access gate', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'viewer-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const response = await updateSettings(fullUpdate({ stripeMode: 'test' }))
        expect(response.status).toBe(403)
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })
})

describe('GET /api/event-settings — stripeMode + per-mode key flags', () => {
    it('returns the stored mode and one boolean per mode (never the keys)', async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_SECRET_SENTINEL')
        vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_live')
        vi.stubEnv('STRIPE_TEST_SECRET_KEY', '')
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent, stripeMode: 'test' })

        const response = await getSettings()
        const raw = await response.text()
        const payload = JSON.parse(raw)

        expect(response.status).toBe(200)
        expect(payload.settings).toMatchObject({
            stripeMode: 'test',
            stripeConfigured: true,
            stripeTestConfigured: false,
        })
        expect(raw).not.toContain('SECRET_SENTINEL')
    })

    it('stripeConfigured keeps meaning LIVE; test flag follows STRIPE_TEST_SECRET_KEY', async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', '')
        vi.stubEnv('STRIPE_TEST_SECRET_KEY', 'sk_test_x')
        vi.stubEnv('STRIPE_TEST_WEBHOOK_SECRET', 'whsec_test')

        const payload = await (await getSettings()).json()
        expect(payload.settings).toMatchObject({ stripeMode: 'live', stripeConfigured: false, stripeTestConfigured: true })
    })

    it('falls back to live for an unexpected stored value', async () => {
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent, stripeMode: 'weird' })
        const payload = await (await getSettings()).json()
        expect(payload.settings.stripeMode).toBe('live')
    })

    it('the not-in-database fallback also carries the mode and both flags', async () => {
        mocks.getEventBySlug.mockResolvedValue(null)
        const payload = await (await getSettings('nuevo')).json()
        expect(payload.settings).toHaveProperty('stripeMode', 'live')
        expect(payload.settings).toHaveProperty('stripeConfigured')
        expect(payload.settings).toHaveProperty('stripeTestConfigured')
    })
})

describe('public event DTO — paymentTestMode', () => {
    it('is absent on an event that does not require payment, whatever its mode', async () => {
        const { buildPublicEventDto } = await import('@/lib/public-event')

        expect(buildPublicEventDto({ ...storedEvent, paymentRequired: false, stripeMode: 'test' }))
            .not.toHaveProperty('paymentTestMode')
        expect(buildPublicEventDto({ ...storedEvent, paymentRequired: false, stripeMode: 'live' }))
            .not.toHaveProperty('paymentTestMode')
    })

    it('is a plain boolean on a paid event, and never leaks the raw mode', async () => {
        const { buildPublicEventDto } = await import('@/lib/public-event')

        const live = buildPublicEventDto({ ...storedEvent, stripeMode: 'live' })
        const test = buildPublicEventDto({ ...storedEvent, stripeMode: 'test' })

        expect(live.paymentTestMode).toBe(false)
        expect(test.paymentTestMode).toBe(true)
        expect(test).not.toHaveProperty('stripeMode')
        expect(JSON.stringify(test)).not.toContain('"test"')
    })
})
