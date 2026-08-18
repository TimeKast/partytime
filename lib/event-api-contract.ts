import type { Event as DatabaseEvent, NewEvent } from '@/lib/schema'
import {
    NEW_EVENT_PRESENTATION_DEFAULTS,
    normalizeBackgroundImageUrl,
    normalizeOptionalString,
    parseEventPresentationPatch,
} from '@/lib/event-presentation'

export const DEFAULT_EVENT_THEME = {
    primaryColor: '#FF1493',
    secondaryColor: '#00FFFF',
    accentColor: '#FFD700',
    backgroundColor: '#1a0033',
    textColor: '#ffffff',
}

type EventTheme = NonNullable<DatabaseEvent['theme']>
type EventUpdates = Partial<Omit<DatabaseEvent, 'id' | 'createdAt'>>
type CreateEventData = Omit<NewEvent, 'id' | 'createdAt' | 'updatedAt'>

type ParseResult<T> =
    | { success: true; value: T }
    | { success: false; error: string }

interface EventUpdateState {
    priceAmount: number | null
    capacityEnabled: boolean | null
    capacityLimit: number | null
}

export interface ParsedEventUpdate {
    newSlug?: string
    updates: EventUpdates
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key)
}

function parseOptionalString(source: Record<string, unknown>, key: string): ParseResult<string | undefined> {
    if (!hasOwn(source, key)) return { success: true, value: undefined }
    if (typeof source[key] !== 'string') return { success: false, error: `${key} debe ser una cadena` }
    return { success: true, value: normalizeOptionalString(source[key]) }
}

function parseBoolean(source: Record<string, unknown>, key: string): ParseResult<boolean | undefined> {
    if (!hasOwn(source, key)) return { success: true, value: undefined }
    if (typeof source[key] !== 'boolean') return { success: false, error: `${key} debe ser booleano` }
    return { success: true, value: source[key] }
}

function parseTheme(value: unknown): ParseResult<EventTheme> {
    if (!isRecord(value)) return { success: false, error: 'El tema debe ser un objeto' }
    const themeKeys: Array<keyof EventTheme> = [
        'primaryColor',
        'secondaryColor',
        'accentColor',
        'backgroundColor',
        'textColor',
    ]
    const theme = { ...DEFAULT_EVENT_THEME }
    for (const key of themeKeys) {
        if (typeof value[key] !== 'string') {
            return { success: false, error: `theme.${key} debe ser una cadena` }
        }
        theme[key] = value[key]
    }
    return { success: true, value: theme }
}

export function parseFullUpdatePrice(value: unknown): ParseResult<{
    priceEnabled: boolean
    priceAmount: number
    priceCurrency: string
}> {
    if (value === undefined) {
        return { success: true, value: { priceEnabled: false, priceAmount: 0, priceCurrency: 'MXN' } }
    }
    if (!isRecord(value)) return { success: false, error: 'price debe ser un objeto' }
    if (hasOwn(value, 'enabled') && typeof value.enabled !== 'boolean') {
        return { success: false, error: 'price.enabled debe ser booleano' }
    }
    const priceEnabled = value.enabled === true
    if (priceEnabled && !hasOwn(value, 'amount')) {
        return { success: false, error: 'La cuota es requerida al habilitar el precio' }
    }
    const priceAmount = hasOwn(value, 'amount') ? value.amount : 0
    if (!Number.isInteger(priceAmount) || Number(priceAmount) < 0) {
        return { success: false, error: 'La cuota debe ser un entero no negativo' }
    }
    if (hasOwn(value, 'currency') && typeof value.currency !== 'string') {
        return { success: false, error: 'price.currency debe ser una cadena' }
    }
    return {
        success: true,
        value: {
            priceEnabled,
            priceAmount: Number(priceAmount),
            priceCurrency: normalizeOptionalString(value.currency) || 'MXN',
        },
    }
}

function parseCreateCapacity(value: unknown): ParseResult<{
    capacityEnabled: boolean
    capacityLimit: number
}> {
    if (value === undefined) return { success: true, value: { capacityEnabled: false, capacityLimit: 0 } }
    if (!isRecord(value)) return { success: false, error: 'capacity debe ser un objeto' }
    if (hasOwn(value, 'enabled') && typeof value.enabled !== 'boolean') {
        return { success: false, error: 'capacity.enabled debe ser booleano' }
    }
    const capacityEnabled = value.enabled === true
    const capacityLimit = value.limit ?? 0
    const minimum = capacityEnabled ? 1 : 0
    if (!Number.isInteger(capacityLimit) || Number(capacityLimit) < minimum) {
        return {
            success: false,
            error: capacityEnabled
                ? 'El límite de capacidad debe ser un entero positivo'
                : 'El límite de capacidad no puede ser negativo',
        }
    }
    return { success: true, value: { capacityEnabled, capacityLimit: Number(capacityLimit) } }
}

export function parseCreateEventRequest(input: unknown): ParseResult<CreateEventData> {
    if (!isRecord(input)) return { success: false, error: 'El cuerpo debe ser un objeto' }

    const slug = normalizeOptionalString(input.slug)
    const title = normalizeOptionalString(input.title)
    if (!slug || !title) return { success: false, error: 'slug y title son requeridos' }
    if (!/^[a-z0-9-]+$/.test(slug)) {
        return { success: false, error: 'El slug solo puede contener letras minúsculas, números y guiones' }
    }

    const presentationPatch = parseEventPresentationPatch(input)
    if (!presentationPatch.success) return presentationPatch
    const price = parseFullUpdatePrice(input.price)
    if (!price.success) return price
    const capacity = parseCreateCapacity(input.capacity)
    if (!capacity.success) return capacity

    const optionalFields = ['displayTitle', 'subtitle', 'date', 'time', 'location', 'details'] as const
    const strings: Partial<Record<typeof optionalFields[number], string>> = {}
    for (const field of optionalFields) {
        const parsed = parseOptionalString(input, field)
        if (!parsed.success) return parsed
        strings[field] = parsed.value ?? ''
    }

    let backgroundImageUrl = '/background.png'
    if (input.backgroundImage !== undefined) {
        if (!isRecord(input.backgroundImage)) return { success: false, error: 'backgroundImage debe ser un objeto' }
        if (hasOwn(input.backgroundImage, 'url')) {
            backgroundImageUrl = normalizeBackgroundImageUrl(input.backgroundImage.url) ?? ''
            if (!backgroundImageUrl) return { success: false, error: 'URL de imagen de fondo inválida' }
        }
    }

    let theme: EventTheme = DEFAULT_EVENT_THEME
    if (input.theme !== undefined) {
        const parsedTheme = parseTheme(input.theme)
        if (!parsedTheme.success) return parsedTheme
        theme = parsedTheme.value
    }

    let hostName = ''
    let hostEmail = ''
    let hostPhone = ''
    if (input.contact !== undefined) {
        if (!isRecord(input.contact)) return { success: false, error: 'contact debe ser un objeto' }
        const parsedHostName = parseOptionalString(input.contact, 'hostName')
        const parsedHostEmail = parseOptionalString(input.contact, 'hostEmail')
        const parsedHostPhone = parseOptionalString(input.contact, 'hostPhone')
        if (!parsedHostName.success) return parsedHostName
        if (!parsedHostEmail.success) return parsedHostEmail
        if (!parsedHostPhone.success) return parsedHostPhone
        hostName = parsedHostName.value ?? ''
        hostEmail = parsedHostEmail.value ?? ''
        hostPhone = parsedHostPhone.value ?? ''
    }

    const active = parseBoolean(input, 'isActive')
    if (!active.success) return active

    return {
        success: true,
        value: {
            slug,
            title,
            displayTitle: strings.displayTitle,
            subtitle: strings.subtitle,
            date: strings.date,
            time: strings.time,
            location: strings.location,
            details: strings.details,
            ...price.value,
            ...capacity.value,
            backgroundImageUrl,
            ...NEW_EVENT_PRESENTATION_DEFAULTS,
            ...presentationPatch.value,
            theme,
            hostName,
            hostEmail,
            hostPhone,
            isActive: active.value ?? true,
        },
    }
}

export function parseEventUpdateRequest(
    input: unknown,
    currentSlug: string,
    existing: EventUpdateState,
): ParseResult<ParsedEventUpdate> {
    if (!isRecord(input)) return { success: false, error: 'El cuerpo debe ser un objeto' }

    const presentationPatch = parseEventPresentationPatch(input)
    if (!presentationPatch.success) return presentationPatch
    const updates: EventUpdates = { ...presentationPatch.value }
    let newSlug: string | undefined

    if (hasOwn(input, 'newSlug')) {
        if (typeof input.newSlug !== 'string') return { success: false, error: 'newSlug debe ser una cadena' }
        const candidate = normalizeOptionalString(input.newSlug)
        if (!candidate || !/^[a-z0-9-]+$/.test(candidate)) {
            return { success: false, error: 'El slug solo puede contener letras minúsculas, números y guiones' }
        }
        if (candidate !== currentSlug) newSlug = candidate
    }

    if (hasOwn(input, 'title')) {
        if (typeof input.title !== 'string') return { success: false, error: 'title debe ser una cadena' }
        const title = normalizeOptionalString(input.title)
        if (!title) return { success: false, error: 'El nombre interno del evento es requerido' }
        updates.title = title
    }

    const optionalFields = ['displayTitle', 'subtitle', 'date', 'time', 'location', 'details'] as const
    for (const field of optionalFields) {
        const parsed = parseOptionalString(input, field)
        if (!parsed.success) return parsed
        if (parsed.value !== undefined) updates[field] = parsed.value
    }

    if (input.price !== undefined) {
        if (!isRecord(input.price)) return { success: false, error: 'price debe ser un objeto' }
        if (hasOwn(input.price, 'enabled')) {
            if (typeof input.price.enabled !== 'boolean') return { success: false, error: 'price.enabled debe ser booleano' }
            updates.priceEnabled = input.price.enabled
        }
        if (hasOwn(input.price, 'amount')) {
            if (!Number.isInteger(input.price.amount) || Number(input.price.amount) < 0) {
                return { success: false, error: 'La cuota debe ser un entero no negativo' }
            }
            updates.priceAmount = Number(input.price.amount)
        }
        if (hasOwn(input.price, 'currency')) {
            if (typeof input.price.currency !== 'string') return { success: false, error: 'price.currency debe ser una cadena' }
            updates.priceCurrency = normalizeOptionalString(input.price.currency) || 'MXN'
        }
        if (
            input.price.enabled === true
            && !hasOwn(input.price, 'amount')
            && (!Number.isInteger(existing.priceAmount) || Number(existing.priceAmount) < 0)
        ) {
            return { success: false, error: 'La cuota debe ser un entero no negativo' }
        }
    }

    if (input.capacity !== undefined) {
        if (!isRecord(input.capacity)) return { success: false, error: 'capacity debe ser un objeto' }
        if (hasOwn(input.capacity, 'enabled')) {
            if (typeof input.capacity.enabled !== 'boolean') return { success: false, error: 'capacity.enabled debe ser booleano' }
            updates.capacityEnabled = input.capacity.enabled
        }
        const effectiveEnabled = typeof input.capacity.enabled === 'boolean'
            ? input.capacity.enabled
            : existing.capacityEnabled ?? false
        if (hasOwn(input.capacity, 'limit')) {
            const minimum = effectiveEnabled ? 1 : 0
            if (!Number.isInteger(input.capacity.limit) || Number(input.capacity.limit) < minimum) {
                return {
                    success: false,
                    error: effectiveEnabled
                        ? 'El límite de capacidad debe ser un entero positivo'
                        : 'El límite de capacidad no puede ser negativo',
                }
            }
            updates.capacityLimit = Number(input.capacity.limit)
        }
        if (input.capacity.enabled === true && !hasOwn(input.capacity, 'limit') && (existing.capacityLimit ?? 0) < 1) {
            return { success: false, error: 'El límite de capacidad debe ser un entero positivo' }
        }
    }

    if (input.backgroundImage !== undefined) {
        if (!isRecord(input.backgroundImage)) return { success: false, error: 'backgroundImage debe ser un objeto' }
        if (hasOwn(input.backgroundImage, 'url')) {
            const backgroundImageUrl = normalizeBackgroundImageUrl(input.backgroundImage.url)
            if (!backgroundImageUrl) return { success: false, error: 'URL de imagen de fondo inválida' }
            updates.backgroundImageUrl = backgroundImageUrl
        }
    }

    if (hasOwn(input, 'theme')) {
        const theme = parseTheme(input.theme)
        if (!theme.success) return theme
        updates.theme = theme.value
    }

    if (input.contact !== undefined) {
        if (!isRecord(input.contact)) return { success: false, error: 'contact debe ser un objeto' }
        const hostName = parseOptionalString(input.contact, 'hostName')
        const hostEmail = parseOptionalString(input.contact, 'hostEmail')
        if (!hostName.success) return hostName
        if (!hostEmail.success) return hostEmail
        if (hostName.value !== undefined) updates.hostName = hostName.value
        if (hostEmail.value !== undefined) updates.hostEmail = hostEmail.value
    }

    const active = parseBoolean(input, 'isActive')
    const closed = parseBoolean(input, 'rsvpClosed')
    const closedMessage = parseOptionalString(input, 'rsvpClosedMessage')
    // ISSUE-008: per-event email verification toggle (EPIC-003). Same
    // optional-boolean pattern as isActive/rsvpClosed above — omitted from
    // the body leaves the stored value untouched.
    const emailVerificationEnabled = parseBoolean(input, 'emailVerificationEnabled')
    if (!active.success) return active
    if (!closed.success) return closed
    if (!closedMessage.success) return closedMessage
    if (!emailVerificationEnabled.success) return emailVerificationEnabled
    if (active.value !== undefined) updates.isActive = active.value
    if (closed.value !== undefined) updates.rsvpClosed = closed.value
    if (closedMessage.value !== undefined) updates.rsvpClosedMessage = closedMessage.value
    if (emailVerificationEnabled.value !== undefined) updates.emailVerificationEnabled = emailVerificationEnabled.value

    return { success: true, value: { newSlug, updates } }
}

interface EventUpdateMutations {
    updateSlug: (eventId: string, newSlug: string) => Promise<{ event: DatabaseEvent; updatedRsvps: number }>
    updateEvent: (eventId: string, updates: EventUpdates) => Promise<DatabaseEvent>
}

export type ApplyEventUpdateResult =
    | { success: false; status: 400 | 403; error: string }
    | {
        success: true
        event: DatabaseEvent
        newSlug?: string
        updatedRsvps: number
    }

export async function validateAndApplyEventUpdate(
    input: unknown,
    currentSlug: string,
    existingEvent: DatabaseEvent,
    canChangeSlug: boolean,
    mutations: EventUpdateMutations,
): Promise<ApplyEventUpdateResult> {
    const parsed = parseEventUpdateRequest(input, currentSlug, existingEvent)
    if (!parsed.success) return { success: false, status: 400, error: parsed.error }
    if (parsed.value.newSlug && !canChangeSlug) {
        return { success: false, status: 403, error: 'Solo un Super Admin puede cambiar el slug de un evento' }
    }

    let event = existingEvent
    let updatedRsvps = 0
    if (parsed.value.newSlug) {
        try {
            const slugResult = await mutations.updateSlug(existingEvent.id, parsed.value.newSlug)
            event = slugResult.event
            updatedRsvps = slugResult.updatedRsvps
        } catch (error) {
            return {
                success: false,
                status: 400,
                error: error instanceof Error ? error.message : 'Error al cambiar el slug',
            }
        }
    }

    if (Object.keys(parsed.value.updates).length > 0) {
        event = await mutations.updateEvent(event.id, parsed.value.updates)
    }

    return {
        success: true,
        event,
        newSlug: parsed.value.newSlug,
        updatedRsvps,
    }
}
