import { normalizeOptionalString } from './event-presentation'
import {
    formatAmountsCollected,
    isTestPayment,
    TEST_PAYMENT_LABEL_SUFFIX,
    type RsvpListItem,
    type RsvpListView,
} from './rsvp-list'

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

// Migration 0013: the PDF/Excel guest exports mark a Stripe TEST payment
// with "(prueba)" on both its "Estado de pago" and "Monto" cells, so a
// spreadsheet read out of context never passes it off as money collected;
// the totals line below excludes it the same way lib/rsvp-list.ts does.
/** " (prueba)" for a test-mode payment, "" otherwise (including no payment). */
export function exportPaymentModeSuffix(rsvp: Pick<RsvpListItem, 'paymentStatus' | 'paymentLivemode'>): string {
    return isTestPayment(rsvp) ? TEST_PAYMENT_LABEL_SUFFIX : ''
}

/**
 * " - Pagados: N ($X MXN)" for the export stats line, plus
 * " - Pagos de prueba: M (no suman)" only when there are test payments —
 * an event without them keeps exactly its previous sentence.
 */
export function describeExportPaymentsFragment(
    view: Pick<RsvpListView<RsvpListItem>, 'paidPaymentsCount' | 'amountCollectedByCurrency' | 'testPaidPaymentsCount'>,
): string {
    const collected = ` - Pagados: ${view.paidPaymentsCount} (${formatAmountsCollected(view.amountCollectedByCurrency)})`
    return view.testPaidPaymentsCount > 0
        ? `${collected} - Pagos de prueba: ${view.testPaidPaymentsCount} (no suman)`
        : collected
}
