import { describe, expect, it } from 'vitest'
import { buildEventMetadata } from '@/lib/event-presentation'

describe('event metadata composition', () => {
    it('omits dangling title separators', () => {
        expect(buildEventMetadata({
            title: 'Nombre interno',
            displayTitle: '',
            subtitle: '',
            date: '13 de julio',
            time: '',
            location: 'Ciudad de México',
        })).toEqual({
            title: 'Nombre interno',
            description: '13 de julio · Ciudad de México',
        })
    })

    it('uses the visible title when populated and the internal title otherwise', () => {
        expect(buildEventMetadata({
            title: 'Nombre interno',
            displayTitle: 'Título visible',
            subtitle: 'Terraza',
            date: '',
            time: '',
            location: '',
        }).title).toBe('Título visible - Terraza')
    })

    it('uses a neutral description when every logistics field is empty', () => {
        expect(buildEventMetadata({
            title: 'Nombre interno',
            displayTitle: '',
            subtitle: '',
            date: '',
            time: '',
            location: '',
        }).description).toBe('Invitación a Nombre interno')
    })
})
