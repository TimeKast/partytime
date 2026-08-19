export const PRESENTATION_MODES = ['classic', 'modern_details', 'artwork_only'] as const
export const BACKGROUND_IMAGE_FITS = ['cover', 'contain'] as const
export const BACKGROUND_IMAGE_POSITIONS = ['center', 'top'] as const
export const DEFAULT_CTA_BACKGROUND = '#2563eb'

export type PresentationMode = typeof PRESENTATION_MODES[number]
export type BackgroundImageFit = typeof BACKGROUND_IMAGE_FITS[number]
export type BackgroundImagePosition = typeof BACKGROUND_IMAGE_POSITIONS[number]

export interface EventPresentation {
    presentationMode: PresentationMode
    rsvpTitle: string
    rsvpButtonLabel: string
    backgroundOverlayStrength: number
    backgroundImageFit: BackgroundImageFit
    backgroundImagePosition: BackgroundImagePosition
}

/**
 * Whole-currency-unit pricing shown before RSVP submission. The amount is the
 * same per-person recovery fee configured on the event; Stripe converts it to
 * cents only on the server.
 */
export interface PublicPaymentPricing {
    unitAmount: number
    currency: string
}

export interface PublicPaymentBreakdown extends PublicPaymentPricing {
    quantity: 1 | 2
    totalAmount: number
}

interface PublicPaymentPriceInput {
    enabled?: boolean
    amount?: number
    currency?: string
}

/**
 * Fail closed unless the current registration path truly requires payment and
 * exposes a valid whole-unit fee. Invitation links pass their own effective
 * `requiresPayment` flag so courtesy links never inherit the event-level fee.
 */
export function getPublicPaymentPricing(
    requiresPayment: boolean,
    price: PublicPaymentPriceInput,
): PublicPaymentPricing | null {
    const currency = normalizeOptionalString(price.currency).toUpperCase()

    if (
        !requiresPayment
        || price.enabled !== true
        || !Number.isSafeInteger(price.amount)
        || Number(price.amount) <= 0
        || !/^[A-Z]{3}$/.test(currency)
    ) {
        return null
    }

    return {
        unitAmount: Number(price.amount),
        currency,
    }
}

export function getPublicPaymentBreakdown(
    pricing: PublicPaymentPricing,
    hasPlusOne: boolean,
): PublicPaymentBreakdown {
    const quantity: 1 | 2 = hasPlusOne ? 2 : 1

    return {
        ...pricing,
        quantity,
        totalAmount: pricing.unitAmount * quantity,
    }
}

export function formatWholeCurrencyAmount(amount: number, currency: string): string {
    return `$${new Intl.NumberFormat('es-MX', {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
    }).format(amount)} ${currency}`
}

export const LEGACY_PRESENTATION_DEFAULTS: EventPresentation = {
    presentationMode: 'classic',
    rsvpTitle: 'RSVP INDISPENSABLE',
    rsvpButtonLabel: 'CONFIRMAR ASISTENCIA',
    backgroundOverlayStrength: 20,
    backgroundImageFit: 'cover',
    backgroundImagePosition: 'center',
}

export const NEW_EVENT_PRESENTATION_DEFAULTS: EventPresentation = {
    presentationMode: 'modern_details',
    rsvpTitle: '',
    rsvpButtonLabel: 'Confirmar asistencia',
    backgroundOverlayStrength: 35,
    backgroundImageFit: 'cover',
    backgroundImagePosition: 'center',
}

interface EventPresentationInput {
    presentationMode?: unknown
    rsvpTitle?: unknown
    rsvpButtonLabel?: unknown
    backgroundOverlayStrength?: unknown
    backgroundImageFit?: unknown
    backgroundImagePosition?: unknown
}

export function parsePresentationMode(value: unknown): PresentationMode | null {
    return typeof value === 'string' && PRESENTATION_MODES.includes(value as PresentationMode)
        ? value as PresentationMode
        : null
}

export function parseBackgroundImageFit(value: unknown): BackgroundImageFit | null {
    return typeof value === 'string' && BACKGROUND_IMAGE_FITS.includes(value as BackgroundImageFit)
        ? value as BackgroundImageFit
        : null
}

export function parseBackgroundImagePosition(value: unknown): BackgroundImagePosition | null {
    return typeof value === 'string' && BACKGROUND_IMAGE_POSITIONS.includes(value as BackgroundImagePosition)
        ? value as BackgroundImagePosition
        : null
}

export function parseOverlayStrength(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 80
        ? value
        : null
}

export function clampOverlayStrength(value: number): number {
    if (!Number.isFinite(value)) return LEGACY_PRESENTATION_DEFAULTS.backgroundOverlayStrength
    return Math.min(80, Math.max(0, Math.round(value)))
}

export function normalizeOptionalString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

export function normalizeRsvpButtonLabel(value: unknown): string | null {
    const label = normalizeOptionalString(value)
    return label.length >= 1 && label.length <= 80 ? label : null
}

export function normalizeBackgroundImageUrl(value: unknown): string | null {
    const url = normalizeOptionalString(value)
    if (!url || /[\u0000-\u001F\u007F]/.test(url)) return null
    if (url.startsWith('/') && !url.startsWith('//')) return url

    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null
    } catch {
        return null
    }
}

export function parseStrictHexColor(value: unknown): string | null {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return null
    return value.toLowerCase()
}

export function normalizeEventPresentation(
    input: EventPresentationInput,
    defaults: EventPresentation = LEGACY_PRESENTATION_DEFAULTS,
): EventPresentation {
    return {
        presentationMode: parsePresentationMode(input.presentationMode) ?? defaults.presentationMode,
        rsvpTitle: typeof input.rsvpTitle === 'string' ? input.rsvpTitle.trim() : defaults.rsvpTitle,
        rsvpButtonLabel: normalizeRsvpButtonLabel(input.rsvpButtonLabel) ?? defaults.rsvpButtonLabel,
        backgroundOverlayStrength: parseOverlayStrength(input.backgroundOverlayStrength)
            ?? defaults.backgroundOverlayStrength,
        backgroundImageFit: parseBackgroundImageFit(input.backgroundImageFit) ?? defaults.backgroundImageFit,
        backgroundImagePosition: parseBackgroundImagePosition(input.backgroundImagePosition)
            ?? defaults.backgroundImagePosition,
    }
}

export type EventPresentationPatch = Partial<EventPresentation>

export type PresentationPatchResult =
    | { success: true; value: EventPresentationPatch }
    | { success: false; error: string }

function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key)
}

export function parseEventPresentationPatch(input: unknown): PresentationPatchResult {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { success: false, error: 'La presentación debe ser un objeto' }
    }

    const source = input as Record<string, unknown>
    const value: EventPresentationPatch = {}

    if (hasOwn(source, 'presentationMode')) {
        const presentationMode = parsePresentationMode(source.presentationMode)
        if (!presentationMode) return { success: false, error: 'Modo de presentación inválido' }
        value.presentationMode = presentationMode
    }

    if (hasOwn(source, 'rsvpTitle')) {
        if (typeof source.rsvpTitle !== 'string') {
            return { success: false, error: 'El texto RSVP debe ser una cadena' }
        }
        value.rsvpTitle = source.rsvpTitle.trim()
    }

    if (hasOwn(source, 'rsvpButtonLabel')) {
        const rsvpButtonLabel = normalizeRsvpButtonLabel(source.rsvpButtonLabel)
        if (!rsvpButtonLabel) {
            return { success: false, error: 'El botón RSVP debe tener entre 1 y 80 caracteres' }
        }
        value.rsvpButtonLabel = rsvpButtonLabel
    }

    if (hasOwn(source, 'backgroundOverlayStrength')) {
        const backgroundOverlayStrength = parseOverlayStrength(source.backgroundOverlayStrength)
        if (backgroundOverlayStrength === null) {
            return { success: false, error: 'El oscurecimiento debe ser un entero entre 0 y 80' }
        }
        value.backgroundOverlayStrength = backgroundOverlayStrength
    }

    if (hasOwn(source, 'backgroundImageFit')) {
        const backgroundImageFit = parseBackgroundImageFit(source.backgroundImageFit)
        if (!backgroundImageFit) return { success: false, error: 'Ajuste de imagen inválido' }
        value.backgroundImageFit = backgroundImageFit
    }

    if (hasOwn(source, 'backgroundImagePosition')) {
        const backgroundImagePosition = parseBackgroundImagePosition(source.backgroundImagePosition)
        if (!backgroundImagePosition) return { success: false, error: 'Posición de imagen inválida' }
        value.backgroundImagePosition = backgroundImagePosition
    }

    return { success: true, value }
}

type BackgroundImagePositionInput = Pick<
    EventPresentation,
    'presentationMode' | 'backgroundImageFit' | 'backgroundImagePosition'
>

export function resolveBackgroundImagePosition(input: BackgroundImagePositionInput): BackgroundImagePosition {
    return input.presentationMode === 'artwork_only'
        && input.backgroundImageFit === 'contain'
        && input.backgroundImagePosition === 'top'
        ? 'top'
        : 'center'
}

export type EventDetailKind = 'date' | 'time' | 'location' | 'details' | 'price' | 'capacity'

export interface VisibleEventDetail {
    kind: EventDetailKind
    label: string
    value: string
}

interface VisibleEventDetailsInput {
    presentationMode: PresentationMode
    date?: unknown
    time?: unknown
    location?: unknown
    details?: unknown
    price?: {
        enabled?: boolean
        amount?: number
        currency?: string
    }
    capacity?: {
        enabled?: boolean
        limit?: number
    }
}

export function getVisibleEventDetails(input: VisibleEventDetailsInput): VisibleEventDetail[] {
    if (input.presentationMode === 'artwork_only') return []

    const rows: VisibleEventDetail[] = []
    const date = normalizeOptionalString(input.date)
    const time = normalizeOptionalString(input.time)
    const location = normalizeOptionalString(input.location)
    const details = normalizeOptionalString(input.details)

    if (date) rows.push({ kind: 'date', label: 'Fecha', value: date })
    if (time) rows.push({ kind: 'time', label: 'Hora', value: time })
    if (location) rows.push({ kind: 'location', label: 'Ubicación', value: location })
    if (details) rows.push({ kind: 'details', label: 'Detalles', value: details })

    if (input.price?.enabled && typeof input.price.amount === 'number' && input.price.amount >= 0) {
        const currency = normalizeOptionalString(input.price.currency) || 'MXN'
        rows.push({ kind: 'price', label: 'Cuota de recuperación', value: `$${input.price.amount} ${currency}` })
    }

    if (input.capacity?.enabled && typeof input.capacity.limit === 'number' && input.capacity.limit > 0) {
        rows.push({ kind: 'capacity', label: 'Cupo', value: `${input.capacity.limit} personas` })
    }

    return rows
}

interface EventMetadataInput {
    title: unknown
    displayTitle?: unknown
    subtitle?: unknown
    date?: unknown
    time?: unknown
    location?: unknown
}

export interface EventMetadataContent {
    title: string
    description: string
}

export function buildEventMetadata(input: EventMetadataInput): EventMetadataContent {
    const internalTitle = normalizeOptionalString(input.title) || 'Evento'
    const visibleTitle = normalizeOptionalString(input.displayTitle) || internalTitle
    const subtitle = normalizeOptionalString(input.subtitle)
    const logistics = [input.date, input.time, input.location]
        .map(normalizeOptionalString)
        .filter(Boolean)

    return {
        title: subtitle ? `${visibleTitle} - ${subtitle}` : visibleTitle,
        description: logistics.length > 0
            ? logistics.join(' · ')
            : `Invitación a ${visibleTitle}`,
    }
}

export function normalizeSolidHexColor(value: unknown, fallback = DEFAULT_CTA_BACKGROUND): string {
    const normalize = (candidate: unknown): string | null => {
        if (typeof candidate !== 'string') return null
        const match = candidate.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
        if (!match) return null
        const hex = match[1].length === 3
            ? match[1].split('').map(character => character + character).join('')
            : match[1]
        return `#${hex.toLowerCase()}`
    }

    return normalize(value) ?? normalize(fallback) ?? DEFAULT_CTA_BACKGROUND
}

function getRelativeLuminance(color: string): number {
    const hex = normalizeSolidHexColor(color).slice(1)
    const channels = [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    const [red, green, blue] = channels.map(channel => (
        channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4
    ))
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function getContrastRatio(firstColor: string, secondColor: string): number {
    const firstLuminance = getRelativeLuminance(firstColor)
    const secondLuminance = getRelativeLuminance(secondColor)
    const lighter = Math.max(firstLuminance, secondLuminance)
    const darker = Math.min(firstLuminance, secondLuminance)
    return (lighter + 0.05) / (darker + 0.05)
}

export function getContrastTextColor(backgroundColor: string): '#000000' | '#ffffff' {
    const background = normalizeSolidHexColor(backgroundColor)
    const blackContrast = getContrastRatio(background, '#000000')
    const whiteContrast = getContrastRatio(background, '#ffffff')
    return blackContrast >= whiteContrast ? '#000000' : '#ffffff'
}

export interface SolidCtaColors {
    background: string
    text: '#000000' | '#ffffff'
}

export function getSolidCtaColors(themeColor: unknown): SolidCtaColors {
    const background = normalizeSolidHexColor(themeColor)
    return {
        background,
        text: getContrastTextColor(background),
    }
}
