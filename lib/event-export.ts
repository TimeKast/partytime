import { normalizeOptionalString } from './event-presentation'

interface EventExportMetadataInput {
    title: unknown
    subtitle?: unknown
    date?: unknown
    time?: unknown
    location?: unknown
}

interface EventExportFilenameInput {
    slug?: unknown
    title: unknown
    subtitle?: unknown
}

export function buildEventExportMetadataRows(input: EventExportMetadataInput): string[] {
    const title = normalizeOptionalString(input.title) || 'Evento'
    const subtitle = normalizeOptionalString(input.subtitle)
    const date = normalizeOptionalString(input.date)
    const time = normalizeOptionalString(input.time)
    const location = normalizeOptionalString(input.location)
    const dateTime = date && time ? `${date} - ${time}` : date || time

    return [title, subtitle, dateTime, location].filter(Boolean)
}

function toSafeFilenamePart(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export function createEventExportFilename(
    input: EventExportFilenameInput,
    extension: 'pdf' | 'xlsx',
): string {
    const source = normalizeOptionalString(input.subtitle)
        || normalizeOptionalString(input.slug)
        || normalizeOptionalString(input.title)
        || 'evento'
    const safeName = toSafeFilenamePart(source) || 'evento'
    return `lista-invitados-${safeName}.${extension}`
}
