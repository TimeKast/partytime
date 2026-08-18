import { describe, expect, it } from 'vitest'
import {
  buildRsvpListView,
  clampRsvpPage,
  describeRsvpListView,
  filterAndSortRsvps,
  type RsvpListItem,
} from '@/lib/rsvp-list'

const rsvps: RsvpListItem[] = [
  { id: '1', name: 'Álvaro 10', email: 'alvaro@example.com', phone: '+52 111', plusOne: true, createdAt: '2026-08-03T12:00:00Z', status: 'confirmed', emailSent: '2026-08-04T12:00:00Z' },
  { id: '2', name: 'Beatriz', email: 'bea@example.com', phone: '+52 222', plusOne: false, createdAt: '2026-08-01T12:00:00Z', status: 'cancelled' },
  { id: '3', name: 'alvaro 2', email: 'dos@example.com', phone: '+52 333', plusOne: true, createdAt: '2026-08-02T12:00:00Z', status: 'confirmed' },
  { id: '4', name: 'Carlos', email: 'car@example.com', phone: '+52 444', plusOne: false, createdAt: 'invalid', status: 'cancelled', emailSent: '2026-08-04T12:00:00Z' },
]

const baseOptions = {
  searchTerm: '',
  status: 'all' as const,
  plusOne: 'all' as const,
  email: 'all' as const,
  sort: 'name-asc' as const,
}

describe('RSVP list helpers', () => {
  it('combines status, plus-one, email and normalized text filters', () => {
    expect(filterAndSortRsvps(rsvps, {
      ...baseOptions,
      searchTerm: '  ÁLVARO ',
      status: 'confirmed',
      plusOne: 'yes',
      email: 'not-sent',
    }).map(({ id }) => id)).toEqual(['3'])

    expect(filterAndSortRsvps(rsvps, {
      ...baseOptions,
      searchTerm: '444',
    }).map(({ id }) => id)).toEqual(['4'])
  })

  it('sorts names locale-aware, accent-insensitive and with numeric ordering', () => {
    expect(filterAndSortRsvps(rsvps, baseOptions).map(({ id }) => id)).toEqual(['3', '1', '2', '4'])
    expect(filterAndSortRsvps(rsvps, { ...baseOptions, sort: 'name-desc' }).map(({ id }) => id))
      .toEqual(['4', '2', '1', '3'])
  })

  it('sorts by creation time and keeps ties stable', () => {
    expect(filterAndSortRsvps(rsvps, { ...baseOptions, sort: 'newest' }).map(({ id }) => id))
      .toEqual(['1', '3', '2', '4'])
    expect(filterAndSortRsvps(rsvps, { ...baseOptions, sort: 'oldest' }).map(({ id }) => id))
      .toEqual(['4', '2', '3', '1'])
  })

  it('paginates after filtering and sorting while preserving the full export collection', () => {
    const manyRsvps = Array.from({ length: 31 }, (_, index): RsvpListItem => ({
      id: String(index + 1),
      name: `Invitado ${String(index + 1).padStart(2, '0')}`,
      email: `guest${index + 1}@example.com`,
      phone: String(index + 1),
      plusOne: false,
      createdAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T12:00:00Z`,
      status: index % 3 === 0 ? 'cancelled' : 'confirmed',
    }))

    const view = buildRsvpListView(manyRsvps, {
      ...baseOptions,
      status: 'confirmed',
      page: 2,
      pageSize: 10,
    })

    expect(view.filteredAndSorted).toHaveLength(20)
    expect(view.pageItems).toHaveLength(10)
    expect(view.pageItems[0].name).toBe('Invitado 17')
    expect(view.page).toBe(2)
    expect(view.pageCount).toBe(2)
    expect(view.rangeStart).toBe(11)
    expect(view.rangeEnd).toBe(20)
    expect(view.confirmedTotal).toBe(20)
    expect(view.cancelledTotal).toBe(0)
  })

  it('clamps invalid and out-of-range pages, including an empty result set', () => {
    expect(clampRsvpPage(-3, 80, 25)).toBe(1)
    expect(clampRsvpPage(99, 80, 25)).toBe(4)
    expect(clampRsvpPage(Number.NaN, 80, 25)).toBe(1)
    expect(clampRsvpPage(3, 0, 25)).toBe(1)

    const empty = buildRsvpListView([], { ...baseOptions, page: 8, pageSize: 25 })
    expect(empty).toMatchObject({ page: 1, pageCount: 1, total: 0, rangeStart: 0, rangeEnd: 0 })
  })

  it('creates a readable, complete summary of filters and order', () => {
    expect(describeRsvpListView({
      searchTerm: '  Ana  ',
      status: 'cancelled',
      plusOne: 'no',
      email: 'sent',
      sort: 'oldest',
    })).toBe('Búsqueda: “Ana” · Estado: Cancelados · Acompañante: Sin +1 · Email: Enviado · Orden: Más antiguos')
  })

  it('does not mutate the source collection', () => {
    const originalIds = rsvps.map(({ id }) => id)
    filterAndSortRsvps(rsvps, { ...baseOptions, sort: 'name-desc' })
    expect(rsvps.map(({ id }) => id)).toEqual(originalIds)
  })
})
