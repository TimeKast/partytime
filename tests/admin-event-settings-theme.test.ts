import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getEventBySlug: vi.fn(),
    updateEvent: vi.fn(),
    validateSession: vi.fn(),
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
    userHasEventAccess: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
    isDatabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/queries', () => ({
    getEventBySlug: mocks.getEventBySlug,
    updateEvent: mocks.updateEvent,
}))

const storedTheme = {
    primaryColor: '#112233',
    secondaryColor: '#445566',
    accentColor: '#778899',
    backgroundColor: '#120b18',
    textColor: '#fefefe',
}

const storedEvent = {
    id: 'event-id',
    slug: 'partytime',
    title: 'PartyTime',
    displayTitle: '',
    subtitle: '',
    date: '',
    time: '',
    location: '',
    details: '',
    priceEnabled: false,
    priceAmount: 0,
    priceCurrency: 'MXN',
    capacityEnabled: false,
    capacityLimit: 0,
    backgroundImageUrl: 'https://images.example.com/party.jpg',
    presentationMode: 'artwork_only',
    rsvpTitle: 'RSVP',
    rsvpButtonLabel: 'Confirmar',
    backgroundOverlayStrength: 20,
    backgroundImageFit: 'contain',
    backgroundImagePosition: 'top',
    ogImageUrl: '',
    theme: storedTheme,
    requirePlusOneName: false,
    rsvpClosed: false,
    rsvpClosedMessage: '',
    emailConfirmationEnabled: false,
    emailVerificationEnabled: false,
    reminderEnabled: false,
    reminderScheduledAt: null,
    reminderSentAt: null,
}

function fullUpdate(theme: Record<string, unknown>) {
    return {
        eventId: storedEvent.slug,
        title: storedEvent.title,
        displayTitle: '',
        subtitle: '',
        date: '',
        time: '',
        location: '',
        details: '',
        price: { enabled: false, amount: 0, currency: 'MXN' },
        capacity: { enabled: false, limit: 0 },
        backgroundImage: { url: storedEvent.backgroundImageUrl },
        ogImage: { url: '' },
        theme,
    }
}

async function getSettings(eventId = storedEvent.slug) {
    const { GET } = await import('@/app/api/event-settings/route')
    return GET(new Request(`http://localhost/api/event-settings?eventId=${eventId}`) as never)
}

async function updateSettings(body: object) {
    const { POST } = await import('@/app/api/admin/event-settings/update/route')
    return POST(new Request('http://localhost/api/admin/event-settings/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    }) as never)
}

describe('admin event settings theme round-trip', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.validateSession.mockResolvedValue({ id: 'admin-id', role: 'super_admin' })
        mocks.getEventBySlug.mockResolvedValue(storedEvent)
        mocks.updateEvent.mockImplementation(async (_id, updates) => ({ ...storedEvent, ...updates }))
    })

    it('returns persisted backgroundColor and textColor from the database', async () => {
        const response = await getSettings()
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(payload.settings.theme).toEqual(storedTheme)
        expect(payload.settings.backgroundImagePosition).toBe('top')
    })

    it('returns legacy-compatible color defaults when the event is not in the database', async () => {
        mocks.getEventBySlug.mockResolvedValue(null)

        const response = await getSettings('new-event')
        const payload = await response.json()

        expect(response.status).toBe(200)
        expect(payload.settings.theme).toMatchObject({
            backgroundColor: '#1a0033',
            textColor: '#ffffff',
        })
        expect(payload.settings.backgroundImagePosition).toBe('center')
    })

    it('persists top image position and rejects invalid values before writing', async () => {
        const accepted = await updateSettings({
            ...fullUpdate(storedTheme),
            backgroundImagePosition: 'top',
        })

        expect(accepted.status).toBe(200)
        expect(mocks.updateEvent).toHaveBeenCalledWith(storedEvent.id, expect.objectContaining({
            backgroundImagePosition: 'top',
        }))

        mocks.updateEvent.mockClear()
        const rejected = await updateSettings({
            ...fullUpdate(storedTheme),
            backgroundImagePosition: 'bottom',
        })
        expect(rejected.status).toBe(400)
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })

    it('saves a valid backgroundColor while preserving every omitted theme color', async () => {
        const response = await updateSettings(fullUpdate({ backgroundColor: '#Aa10Ff' }))

        expect(response.status).toBe(200)
        expect(mocks.updateEvent).toHaveBeenCalledWith(storedEvent.id, expect.objectContaining({
            theme: {
                ...storedTheme,
                backgroundColor: '#aa10ff',
            },
        }))
    })

    it('persists emailVerificationEnabled through the settings update route and round-trips via GET (ISSUE-008)', async () => {
        const response = await updateSettings({
            ...fullUpdate(storedTheme),
            emailVerificationEnabled: true,
        })

        expect(response.status).toBe(200)
        expect(mocks.updateEvent).toHaveBeenCalledWith(storedEvent.id, expect.objectContaining({
            emailVerificationEnabled: true,
        }))

        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent, emailVerificationEnabled: true })
        const settingsResponse = await getSettings()
        const payload = await settingsResponse.json()
        expect(payload.settings.emailVerificationEnabled).toBe(true)
    })

    it('leaves emailVerificationEnabled untouched when the field is omitted from a settings update', async () => {
        await updateSettings(fullUpdate(storedTheme))

        expect(mocks.updateEvent).toHaveBeenCalledWith(
            storedEvent.id,
            expect.not.objectContaining({ emailVerificationEnabled: expect.anything() }),
        )
    })

    it.each(['#abc', '#12345', '#1234567', '120b18', '#12zz18', '']) (
        'returns 400 and does not persist invalid backgroundColor %j',
        async backgroundColor => {
            const response = await updateSettings(fullUpdate({ backgroundColor }))
            const payload = await response.json()

            expect(response.status).toBe(400)
            expect(payload).toMatchObject({ success: false })
            expect(mocks.updateEvent).not.toHaveBeenCalled()
        },
    )
})
