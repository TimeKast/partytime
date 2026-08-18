// ISSUE-005/ISSUE-006 (EPIC-002): the five canonical rsvps.status values.
// This module cannot import lib/queries.ts's RSVP_STATUS (server-only —
// pulls in the Neon/drizzle client into every client bundle that uses this
// file, e.g. app/admin/page.tsx), so it keeps its own literal-typed union,
// same pattern this file already used pre-ISSUE-006. Keep the literals in
// sync with lib/queries.ts RSVP_STATUS.
export type RsvpStatus =
  | 'confirmed'
  | 'cancelled'
  | 'pending_payment'
  | 'pending_verification'
  | 'expired'
export type RsvpStatusFilter = 'all' | RsvpStatus
export type RsvpPlusOneFilter = 'all' | 'yes' | 'no'
export type RsvpEmailFilter = 'all' | 'sent' | 'not-sent'
export type RsvpSort = 'name-asc' | 'name-desc' | 'newest' | 'oldest'
export type RsvpPageSize = 10 | 25 | 50 | 100

// ISSUE-013 (EPIC-004): the four canonical rsvp_payments.status values, kept
// in sync with lib/queries.ts RSVP_PAYMENT_STATUS the same way RsvpStatus
// above is kept in sync with RSVP_STATUS — this module cannot import the
// server-only lib/queries.ts (see the comment on RsvpStatus).
export type RsvpPaymentStatus = 'created' | 'paid' | 'expired' | 'refunded'
export type RsvpPaymentFilter = 'all' | RsvpPaymentStatus

export interface RsvpListItem {
  id: string
  name: string
  email: string
  phone: string
  plusOne: boolean
  createdAt: string
  status: RsvpStatus
  emailSent?: string | null
  // ISSUE-013: only ever present when the admin GET joined rsvp_payments for
  // a payment_required event (lib/queries.ts getRSVPsByEvent's
  // `includePayments`) — absent, not just null, on a free event's rows, by
  // construction of that join.
  paymentStatus?: RsvpPaymentStatus | null
  paidAt?: string | null
  amountCents?: number | null
  currency?: string | null
}

export interface RsvpListOptions {
  searchTerm: string
  status: RsvpStatusFilter
  plusOne: RsvpPlusOneFilter
  email: RsvpEmailFilter
  sort: RsvpSort
  page: number
  pageSize: RsvpPageSize
  // ISSUE-013: optional so every pre-existing caller/test (built against the
  // pre-ISSUE-013 shape) keeps compiling and behaving identically — omitted
  // or 'all' never filters.
  paymentStatus?: RsvpPaymentFilter
}

export interface RsvpListView<T extends RsvpListItem> {
  filteredAndSorted: T[]
  pageItems: T[]
  page: number
  pageCount: number
  pageSize: RsvpPageSize
  total: number
  rangeStart: number
  rangeEnd: number
  confirmedTotal: number
  cancelledTotal: number
  // ISSUE-006: pending states are never folded into confirmedTotal — the
  // admin dashboard and exports need them as their own counters.
  pendingPaymentTotal: number
  pendingVerificationTotal: number
  expiredTotal: number
  // ISSUE-013: aggregated from `paid` rows within the CURRENT
  // filtered/sorted set — same scope as confirmedTotal/cancelledTotal above,
  // so the export summary line and this figure always describe the same
  // rows. Grouped by currency (cents) rather than a single sum: an event's
  // price/currency can change over its lifetime, so historical payments are
  // never assumed to share one currency.
  paidPaymentsCount: number
  amountCollectedByCurrency: Record<string, number>
}

const nameCollator = new Intl.Collator('es-MX', {
  sensitivity: 'base',
  numeric: true,
  usage: 'sort',
})

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

export function filterAndSortRsvps<T extends RsvpListItem>(
  rsvps: readonly T[],
  options: Pick<RsvpListOptions, 'searchTerm' | 'status' | 'plusOne' | 'email' | 'sort' | 'paymentStatus'>,
): T[] {
  const term = normalizeSearchValue(options.searchTerm.trim())

  return rsvps
    .filter((rsvp) => {
      if (options.status !== 'all' && rsvp.status !== options.status) return false
      if (options.plusOne === 'yes' && !rsvp.plusOne) return false
      if (options.plusOne === 'no' && rsvp.plusOne) return false
      if (options.email === 'sent' && !rsvp.emailSent) return false
      if (options.email === 'not-sent' && rsvp.emailSent) return false
      // ISSUE-013: undefined/'all' never filters — see the field's doc comment.
      if (options.paymentStatus && options.paymentStatus !== 'all' && rsvp.paymentStatus !== options.paymentStatus) return false

      if (!term) return true

      return [rsvp.name, rsvp.email, rsvp.phone].some((value) =>
        normalizeSearchValue(value).includes(term),
      )
    })
    .map((rsvp, originalIndex) => ({ rsvp, originalIndex }))
    .sort((left, right) => {
      let comparison = 0

      switch (options.sort) {
        case 'name-asc':
          comparison = nameCollator.compare(left.rsvp.name, right.rsvp.name)
          break
        case 'name-desc':
          comparison = nameCollator.compare(right.rsvp.name, left.rsvp.name)
          break
        case 'newest':
          comparison = toTimestamp(right.rsvp.createdAt) - toTimestamp(left.rsvp.createdAt)
          break
        case 'oldest':
          comparison = toTimestamp(left.rsvp.createdAt) - toTimestamp(right.rsvp.createdAt)
          break
      }

      return comparison || left.originalIndex - right.originalIndex
    })
    .map(({ rsvp }) => rsvp)
}

export function clampRsvpPage(page: number, total: number, pageSize: RsvpPageSize): number {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const normalizedPage = Number.isFinite(page) ? Math.trunc(page) : 1
  return Math.min(Math.max(normalizedPage, 1), pageCount)
}

export function buildRsvpListView<T extends RsvpListItem>(
  rsvps: readonly T[],
  options: RsvpListOptions,
): RsvpListView<T> {
  const filteredAndSorted = filterAndSortRsvps(rsvps, options)
  const total = filteredAndSorted.length
  const pageCount = Math.max(1, Math.ceil(total / options.pageSize))
  const page = clampRsvpPage(options.page, total, options.pageSize)
  const startIndex = (page - 1) * options.pageSize
  const pageItems = filteredAndSorted.slice(startIndex, startIndex + options.pageSize)

  // ISSUE-013: centavos, summed per currency — never converted to a float
  // major-unit sum here (that happens once, at display time, in
  // formatCentsAsCurrency below).
  let paidPaymentsCount = 0
  const amountCollectedByCurrency: Record<string, number> = {}
  for (const rsvp of filteredAndSorted) {
    if (rsvp.paymentStatus !== 'paid') continue
    paidPaymentsCount += 1
    const currency = rsvp.currency || 'MXN'
    amountCollectedByCurrency[currency] = (amountCollectedByCurrency[currency] ?? 0) + (rsvp.amountCents ?? 0)
  }

  return {
    filteredAndSorted,
    pageItems,
    page,
    pageCount,
    pageSize: options.pageSize,
    total,
    rangeStart: total === 0 ? 0 : startIndex + 1,
    rangeEnd: Math.min(startIndex + options.pageSize, total),
    confirmedTotal: filteredAndSorted.filter((rsvp) => rsvp.status === 'confirmed').length,
    cancelledTotal: filteredAndSorted.filter((rsvp) => rsvp.status === 'cancelled').length,
    pendingPaymentTotal: filteredAndSorted.filter((rsvp) => rsvp.status === 'pending_payment').length,
    pendingVerificationTotal: filteredAndSorted.filter((rsvp) => rsvp.status === 'pending_verification').length,
    expiredTotal: filteredAndSorted.filter((rsvp) => rsvp.status === 'expired').length,
    paidPaymentsCount,
    amountCollectedByCurrency,
  }
}

// Singular, per-row status label — used in the guest table, PDF/Excel
// exports and anywhere a single RSVP's status needs Spanish copy. Kept
// distinct from the plural filter/section labels below (statusLabels):
// "Cancelado" describes one row, "Cancelados" describes a filter/section of
// many — the existing describeRsvpListView contract expects the plural form.
export const rsvpStatusLabels: Record<RsvpStatus, string> = {
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  pending_payment: 'Pendiente de pago',
  pending_verification: 'Pendiente de verificación',
  expired: 'Expirado',
}

export function rsvpStatusLabel(status: RsvpStatus): string {
  return rsvpStatusLabels[status]
}

// ISSUE-013: per-row payment badge copy — used by the guest table badge and
// the PDF/Excel "Estado de pago" export column, so both always agree.
export const rsvpPaymentStatusLabels: Record<RsvpPaymentStatus, string> = {
  paid: 'Pagado',
  created: 'Pendiente de pago',
  expired: 'Expirado',
  refunded: 'Reembolsado',
}

export function rsvpPaymentStatusLabel(status: RsvpPaymentStatus): string {
  return rsvpPaymentStatusLabels[status]
}

// ISSUE-013: the single place amount_cents becomes a displayed amount —
// never a raw `/ 100` at a call site, so every surface (table badge,
// PDF/Excel export, aggregated total) rounds/groups identically.
export function formatCentsAsCurrency(amountCents: number, currency: string): string {
  const amount = amountCents / 100
  const formatted = new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `$${formatted} ${currency}`
}

// ISSUE-013: the amount-only half of the aggregate counter — reused by
// describePaymentsCollected below and by the standalone StatsCards-style
// figure in app/admin/page.tsx, so both read from the same grouping logic.
export function formatAmountsCollected(amountsByCurrency: Record<string, number>): string {
  const currencies = Object.keys(amountsByCurrency).sort()
  if (currencies.length === 0) return formatCentsAsCurrency(0, 'MXN')
  return currencies.map((currency) => formatCentsAsCurrency(amountsByCurrency[currency], currency)).join(' + ')
}

// ISSUE-013: "N pagados · $X,XXX MXN recaudados" — the admin dashboard's
// aggregate counter and the PDF/Excel export summary line both render this
// exact sentence, computed once here from RsvpListView.paidPaymentsCount/
// amountCollectedByCurrency.
export function describePaymentsCollected(paidCount: number, amountsByCurrency: Record<string, number>): string {
  return `${paidCount} pagados · ${formatAmountsCollected(amountsByCurrency)} recaudados`
}

const statusLabels: Record<RsvpStatusFilter, string> = {
  all: 'Todos',
  confirmed: 'Confirmados',
  cancelled: 'Cancelados',
  pending_payment: 'Pendientes de pago',
  pending_verification: 'Pendientes de verificación',
  expired: 'Expirados',
}

const plusOneLabels: Record<RsvpPlusOneFilter, string> = {
  all: 'Todos',
  yes: 'Con +1',
  no: 'Sin +1',
}

const emailLabels: Record<RsvpEmailFilter, string> = {
  all: 'Todos',
  sent: 'Enviado',
  'not-sent': 'No enviado',
}

export const rsvpSortLabels: Record<RsvpSort, string> = {
  'name-asc': 'Nombre A–Z',
  'name-desc': 'Nombre Z–A',
  newest: 'Más recientes',
  oldest: 'Más antiguos',
}

export function describeRsvpListView(
  options: Pick<RsvpListOptions, 'searchTerm' | 'status' | 'plusOne' | 'email' | 'sort' | 'paymentStatus'>,
): string {
  const parts = [
    options.searchTerm.trim() ? `Búsqueda: “${options.searchTerm.trim()}”` : 'Búsqueda: ninguna',
    `Estado: ${statusLabels[options.status]}`,
    `Acompañante: ${plusOneLabels[options.plusOne]}`,
    `Email: ${emailLabels[options.email]}`,
    `Orden: ${rsvpSortLabels[options.sort]}`,
  ]

  // ISSUE-013: omitted entirely (not just "Pago: Todos") when the caller
  // never passed it or left it at 'all' — a free event's callers never set
  // this, and the exact pre-ISSUE-013 sentence must stay byte-for-byte
  // unchanged for them (see tests/rsvp-list.test.ts).
  if (options.paymentStatus && options.paymentStatus !== 'all') {
    parts.push(`Pago: ${rsvpPaymentStatusLabels[options.paymentStatus]}`)
  }

  return parts.join(' · ')
}
