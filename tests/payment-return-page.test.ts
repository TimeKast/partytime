import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync('app/[slug]/pago/page.tsx', 'utf8')

describe('Stripe payment return page polling', () => {
    it('restarts cleanly after the React Strict Mode effect cleanup', () => {
        expect(pageSource).not.toContain('pollStarted')
        expect(pageSource).toContain("const stateParam = searchParams?.get('state')")
        expect(pageSource).toContain("const sessionId = searchParams?.get('session_id') ?? ''")
        expect(pageSource).toContain('}, [stateParam, sessionId])')
    })
})
