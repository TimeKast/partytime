import { describe, expect, it } from 'vitest'
import { buildEventExportMetadataRows, createEventExportFilename } from '@/lib/event-export'

describe('event export helpers', () => {
    it('does not add rows for empty optional metadata', () => {
        expect(buildEventExportMetadataRows({
            title: 'Nombre interno',
            subtitle: '',
            date: '',
            time: '',
            location: '',
        })).toEqual(['Nombre interno'])
    })

    it('formats date without time and time without date', () => {
        expect(buildEventExportMetadataRows({
            title: 'Evento',
            subtitle: '',
            date: '13 de julio',
            time: '',
            location: '',
        })).toEqual(['Evento', '13 de julio'])
        expect(buildEventExportMetadataRows({
            title: 'Evento',
            subtitle: '',
            date: '',
            time: '19:00',
            location: '',
        })).toEqual(['Evento', '19:00'])
    })

    it('falls back to slug or internal title for a nonempty filename', () => {
        expect(createEventExportFilename({ slug: 'fiesta-jose', title: 'Fiesta de José', subtitle: '' }, 'pdf'))
            .toBe('lista-invitados-fiesta-jose.pdf')
        expect(createEventExportFilename({ slug: '', title: 'Fiesta de José', subtitle: '' }, 'xlsx'))
            .toBe('lista-invitados-fiesta-de-jose.xlsx')
    })

    it('normalizes unsafe filename characters', () => {
        expect(createEventExportFilename({ slug: '', title: 'Cena / José: 2026?', subtitle: '' }, 'pdf'))
            .toBe('lista-invitados-cena-jose-2026.pdf')
    })
})
