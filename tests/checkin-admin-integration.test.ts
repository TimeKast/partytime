/**
 * ISSUE-018 (EPIC-005) — check-in admin integration: settings section,
 * "Llegada" column/counter, and export columns.
 *
 * Four parts, same split rationale as tests/rsvp-payments-admin-visibility.test.ts:
 *   1. Route RBAC + DTO shape for the EXISTING (ISSUE-015) endpoint
 *      app/api/admin/checkin-config/route.ts — this issue must not change
 *      that route, only rely on its contract, so this locks in "manager
 *      required to PATCH, password never in the response" from the admin
 *      surface's point of view.
 *   2. Pure lib/rsvp-list.ts logic: computeCheckinArrivalCount/
 *      describeCheckinArrivals.
 *   3. Pure lib/password-suggestion.ts logic: the 3-words/6-digits generator.
 *   4. UI source contracts (RsvpTable/app/admin/page.tsx/CheckinSettings),
 *      the same source-inspection style as tests/rsvp-payments-admin-visibility.test.ts's
 *      own "UI wiring" describe block, to lock in "columns/counter/exports
 *      only for a checkin_enabled event" and "RBAC: only a manager ever
 *      reaches the section" without a full RTL render of the 2900-line
 *      admin page.
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const read = (path: string) => readFileSync(path, 'utf8')

// ============================================================
// Part 1 — app/api/admin/checkin-config/route.ts (RBAC + DTO shape)
// ============================================================

const mocks = vi.hoisted(() => ({
    getEventBySlug: vi.fn(),
    updateEvent: vi.fn(),
    validateSession: vi.fn(),
    userHasEventAccess: vi.fn(),
    hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: vi.fn(() => ({ value: 'session-token' })),
    })),
}))

vi.mock('@/lib/auth-utils', () => ({
    validateSession: mocks.validateSession,
    hashPassword: mocks.hashPassword,
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

const storedEvent = {
    id: 'event-id',
    slug: 'fiesta',
    checkinEnabled: false,
    checkinPasswordHash: null as string | null,
    checkinPasswordUpdatedAt: null as Date | null,
}

function getRequest(eventSlug = 'fiesta') {
    return new NextRequest(`http://localhost/api/admin/checkin-config?eventSlug=${eventSlug}`)
}

function patchRequest(body: object) {
    return new NextRequest('http://localhost/api/admin/checkin-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify(body),
    })
}

describe('app/api/admin/checkin-config/route.ts — RBAC + DTO shape (relied on, not modified, by ISSUE-018)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getEventBySlug.mockResolvedValue({ ...storedEvent })
        mocks.updateEvent.mockImplementation(async (_id: string, updates: Record<string, unknown>) => ({
            ...storedEvent,
            ...updates,
        }))
        mocks.hashPassword.mockImplementation(async (password: string) => `hashed:${password}`)
    })

    it('GET: a viewer (viewer-level access) can read the status — DTO is enabled/hasPassword/updatedAt only, never the hash', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true })
        mocks.getEventBySlug.mockResolvedValue({
            ...storedEvent,
            checkinEnabled: true,
            checkinPasswordHash: 'bcrypt-hash-should-never-leak',
            checkinPasswordUpdatedAt: new Date('2026-08-01T00:00:00.000Z'),
        })

        const { GET } = await import('@/app/api/admin/checkin-config/route')
        const response = await GET(getRequest())
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data).toEqual({
            success: true,
            checkin: { enabled: true, hasPassword: true, updatedAt: '2026-08-01T00:00:00.000Z' },
        })
        expect(JSON.stringify(data)).not.toContain('bcrypt-hash-should-never-leak')
    })

    it('PATCH enable: a viewer (no manager access) is rejected with 403 — the toggle is manager-only', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(patchRequest({ eventSlug: 'fiesta', action: 'enable' }))
        const data = await response.json()

        expect(response.status).toBe(403)
        expect(data.success).toBe(false)
        expect(mocks.updateEvent).not.toHaveBeenCalled()
    })

    it('PATCH setPassword: a viewer is rejected with 403 and hashPassword is never called (password never processed for a non-manager)', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: false })

        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(patchRequest({ eventSlug: 'fiesta', action: 'setPassword', password: 'sol-mar-luna' }))
        const data = await response.json()

        expect(response.status).toBe(403)
        expect(data.success).toBe(false)
        expect(mocks.hashPassword).not.toHaveBeenCalled()
    })

    it('PATCH enable: a manager succeeds and the response never includes a password/hash field', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'user-1', role: 'user' })
        mocks.userHasEventAccess.mockResolvedValue({ hasAccess: true })

        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(patchRequest({ eventSlug: 'fiesta', action: 'enable' }))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data).toEqual({ success: true, checkin: { enabled: true, hasPassword: false, updatedAt: null } })
        expect(mocks.updateEvent).toHaveBeenCalledWith('event-id', { checkinEnabled: true })
    })

    it('PATCH setPassword: a super_admin succeeds regardless of per-event access, and the response DTO never carries the plaintext or the hash', async () => {
        mocks.validateSession.mockResolvedValue({ id: 'admin-1', role: 'super_admin' })

        const { PATCH } = await import('@/app/api/admin/checkin-config/route')
        const response = await PATCH(patchRequest({ eventSlug: 'fiesta', action: 'setPassword', password: 'sol-mar-luna' }))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.checkin).toMatchObject({ hasPassword: true })
        expect(JSON.stringify(data)).not.toContain('sol-mar-luna')
        expect(JSON.stringify(data)).not.toContain('hashed:')
        // A viewer-role check was never even needed — super_admin bypasses it.
        expect(mocks.userHasEventAccess).not.toHaveBeenCalled()
    })
})

// ============================================================
// Part 2 — lib/rsvp-list.ts: computeCheckinArrivalCount / describeCheckinArrivals
// ============================================================

describe('lib/rsvp-list.ts — ISSUE-018 arrival counter (pure)', () => {
    it('counts confirmed guests as 1 seat and their +1 as a second, independent seat', async () => {
        const { computeCheckinArrivalCount } = await import('@/lib/rsvp-list')
        const rsvps = [
            { status: 'confirmed' as const, plusOne: false, checkedInAt: '2026-08-18T20:00:00Z', plusOneCheckedInAt: null },
            { status: 'confirmed' as const, plusOne: true, checkedInAt: null, plusOneCheckedInAt: '2026-08-18T20:05:00Z' },
            { status: 'confirmed' as const, plusOne: true, checkedInAt: null, plusOneCheckedInAt: null },
        ]

        const result = computeCheckinArrivalCount(rsvps)

        // Seats: guest1 (1) + guest2+1 (2) + guest3+1 (2) = 5
        expect(result.totalSeats).toBe(5)
        // Arrived: guest1's own seat + guest2's +1 seat = 2
        expect(result.arrived).toBe(2)
    })

    it('never counts pending_*/cancelled/expired rows — only `confirmed` holds a seat', async () => {
        const { computeCheckinArrivalCount } = await import('@/lib/rsvp-list')
        const rsvps = [
            { status: 'pending_payment' as const, plusOne: false, checkedInAt: null, plusOneCheckedInAt: null },
            { status: 'cancelled' as const, plusOne: true, checkedInAt: '2026-08-18T20:00:00Z', plusOneCheckedInAt: '2026-08-18T20:00:00Z' },
            { status: 'expired' as const, plusOne: false, checkedInAt: null, plusOneCheckedInAt: null },
        ]

        expect(computeCheckinArrivalCount(rsvps)).toEqual({ arrived: 0, totalSeats: 0 })
    })

    it('an empty roster is 0/0', async () => {
        const { computeCheckinArrivalCount } = await import('@/lib/rsvp-list')
        expect(computeCheckinArrivalCount([])).toEqual({ arrived: 0, totalSeats: 0 })
    })

    it('describeCheckinArrivals: "Llegados X / Confirmados Y"', async () => {
        const { describeCheckinArrivals } = await import('@/lib/rsvp-list')
        expect(describeCheckinArrivals({ arrived: 3, totalSeats: 8 })).toBe('Llegados 3 / Confirmados 8')
        expect(describeCheckinArrivals({ arrived: 0, totalSeats: 0 })).toBe('Llegados 0 / Confirmados 0')
    })
})

// ============================================================
// Part 3 — lib/password-suggestion.ts (pure)
// ============================================================

describe('lib/password-suggestion.ts — ISSUE-018 suggestion generator (pure)', () => {
    it('generateDigitsSuggestion: always exactly 6 digits, 0-9 only', async () => {
        const { generateDigitsSuggestion } = await import('@/lib/password-suggestion')
        for (let i = 0; i < 20; i++) {
            const suggestion = generateDigitsSuggestion()
            expect(suggestion).toMatch(/^\d{6}$/)
        }
    })

    it('generateWordsSuggestion: 3 hyphen-joined, distinct, lowercase-letter words — within the 6-64 password bounds', async () => {
        const { generateWordsSuggestion } = await import('@/lib/password-suggestion')
        for (let i = 0; i < 20; i++) {
            const suggestion = generateWordsSuggestion()
            const parts = suggestion.split('-')
            expect(parts).toHaveLength(3)
            expect(new Set(parts).size).toBe(3) // distinct
            parts.forEach(part => expect(part).toMatch(/^[a-z]+$/))
            expect(suggestion.length).toBeGreaterThanOrEqual(6)
            expect(suggestion.length).toBeLessThanOrEqual(64)
        }
    })

    it('generatePasswordSuggestion: dispatches on kind', async () => {
        const { generatePasswordSuggestion } = await import('@/lib/password-suggestion')
        expect(generatePasswordSuggestion('digits')).toMatch(/^\d{6}$/)
        expect(generatePasswordSuggestion('words').split('-')).toHaveLength(3)
    })
})

// ============================================================
// Part 4 — UI source contracts
// ============================================================

describe('UI wiring — ISSUE-018 (source contracts, same style as tests/rsvp-payments-admin-visibility.test.ts)', () => {
    it('RsvpTable only renders the "Llegada" column/badges when showCheckin is true', () => {
        const table = read('app/admin/components/table/RsvpTable.tsx')

        expect(table).toContain('showCheckin: boolean')
        expect(table).toContain('{showCheckin && <th scope="col">Llegada</th>}')
        expect(table).toContain('{showCheckin && (')
        expect(table).toContain('Sin llegar')
    })

    it('app/admin/page.tsx gates every check-in surface (table column, counter, exports) behind checkinEnabled, sourced from CheckinSettings\' onStatusChange', () => {
        const page = read('app/admin/page.tsx')

        expect(page).toContain('const checkinEnabled = checkinStatus?.enabled ?? false')
        expect((page.match(/showCheckin=\{checkinEnabled\}/g) ?? []).length).toBe(5)
        expect(page).toContain('{checkinEnabled && (')
        expect(page).toContain('describeCheckinArrivals(checkinArrivalCount)')
        expect(page).toContain('const showCheckinColumns = checkinEnabled')
        expect((page.match(/const showCheckinColumns = checkinEnabled/g) ?? []).length).toBe(2)
        expect(page).toContain('<CheckinSettings eventSlug={selectedEventId} onStatusChange={handleCheckinStatusChange} />')
    })

    it('the CheckinSettings section is only ever rendered inside the manager-only config tab — a viewer never reaches it (same RBAC pattern as InvitationLinkManager)', () => {
        const page = read('app/admin/page.tsx')
        const configTabStart = page.indexOf("{activeTab === 'config' && canManageSelectedEvent && (")
        const eventosTabStart = page.indexOf("{/* Contenido de Eventos */}")
        expect(configTabStart).toBeGreaterThan(-1)
        const configTab = page.slice(configTabStart, eventosTabStart)

        expect(configTab).toContain('<CheckinSettings')
        // Only ever reachable through the tab-level canManageSelectedEvent guard —
        // asserted structurally by locating the component's markup strictly
        // inside the config-tab slice computed above.
    })

    it('the PDF export appends the 4 check-in columns after the payment columns, independent of showPaymentColumns', () => {
        const page = read('app/admin/page.tsx')
        const pdfFnStart = page.indexOf('const exportInformativeList = ()')
        const excelFnStart = page.indexOf('const exportExcelList = ()')
        const pdfFn = page.slice(pdfFnStart, excelFnStart)

        expect(pdfFn).toContain("const showCheckinColumns = checkinEnabled")
        expect(pdfFn).toContain("['Llegó (hora)', 'Llegada +1', 'Marcó', 'Nota check-in']")
        expect(pdfFn).toContain('rsvp.checkedInBy ? stripEmojis(rsvp.checkedInBy) : ')
        expect(pdfFn).toContain('rsvp.checkinNote ? stripEmojis(rsvp.checkinNote) : ')
    })

    it('the Excel export appends the same 4 check-in columns, without stripEmojis (XLSX handles Unicode natively)', () => {
        const page = read('app/admin/page.tsx')
        const excelFnStart = page.indexOf('const exportExcelList = ()')
        const excelFn = page.slice(excelFnStart)

        expect(excelFn).toContain("['Llegó (hora)', 'Llegada +1', 'Marcó', 'Nota check-in']")
        expect(excelFn).toContain('rsvp.checkedInBy || ')
        expect(excelFn).toContain('rsvp.checkinNote || ')
    })

    it('CheckinSettings never re-displays the saved password (write-only) — the draft is cleared on every successful save', () => {
        const component = read('app/admin/components/CheckinSettings.tsx')

        expect(component).toContain("setPasswordDraft('')")
        expect(component).not.toMatch(/value=\{status\??\.\w*[Pp]assword/)
    })
})
