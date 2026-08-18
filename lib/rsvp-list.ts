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

export interface RsvpListItem {
  id: string
  name: string
  email: string
  phone: string
  plusOne: boolean
  createdAt: string
  status: RsvpStatus
  emailSent?: string | null
}

export interface RsvpListOptions {
  searchTerm: string
  status: RsvpStatusFilter
  plusOne: RsvpPlusOneFilter
  email: RsvpEmailFilter
  sort: RsvpSort
  page: number
  pageSize: RsvpPageSize
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
  options: Pick<RsvpListOptions, 'searchTerm' | 'status' | 'plusOne' | 'email' | 'sort'>,
): T[] {
  const term = normalizeSearchValue(options.searchTerm.trim())

  return rsvps
    .filter((rsvp) => {
      if (options.status !== 'all' && rsvp.status !== options.status) return false
      if (options.plusOne === 'yes' && !rsvp.plusOne) return false
      if (options.plusOne === 'no' && rsvp.plusOne) return false
      if (options.email === 'sent' && !rsvp.emailSent) return false
      if (options.email === 'not-sent' && rsvp.emailSent) return false

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
  options: Pick<RsvpListOptions, 'searchTerm' | 'status' | 'plusOne' | 'email' | 'sort'>,
): string {
  const parts = [
    options.searchTerm.trim() ? `Búsqueda: “${options.searchTerm.trim()}”` : 'Búsqueda: ninguna',
    `Estado: ${statusLabels[options.status]}`,
    `Acompañante: ${plusOneLabels[options.plusOne]}`,
    `Email: ${emailLabels[options.email]}`,
    `Orden: ${rsvpSortLabels[options.sort]}`,
  ]

  return parts.join(' · ')
}
