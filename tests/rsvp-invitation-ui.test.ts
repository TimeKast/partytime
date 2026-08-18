import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(path, 'utf8')

describe('admin one-time invitation link UI contract', () => {
  const manager = source('app/admin/components/InvitationLinkManager.tsx')
  const adminPage = source('app/admin/page.tsx')
  const adminCss = source('app/admin/admin.module.css')

  it('is manager-only and reloads a secret-free link list for the selected event', () => {
    expect(adminPage).toContain('canManageSelectedEvent && selectedEventId')
    expect(adminPage).toContain('<InvitationLinkManager eventSlug={selectedEventId} />')
    expect(manager).toContain('/api/admin/rsvp-invitations?eventSlug=')
    expect(manager).toContain('}, [eventSlug])')
    expect(manager).not.toContain('localStorage')
    expect(manager).not.toContain('console.')
  })

  it('creates an exact local expiry and reveals the returned URL only in memory', () => {
    expect(manager).toContain('type="datetime-local"')
    expect(manager).toContain('24 * 60 * 60 * 1_000')
    expect(manager).toContain("method: 'POST'")
    expect(manager).toContain('expiresAt: expiration.toISOString()')
    expect(manager).toContain('setGeneratedUrl(data.url)')
    expect(manager).toContain('Se muestra una sola vez.')
    expect(manager).toContain('navigator.clipboard.writeText(generatedUrl)')
  })

  it('labels every status and exposes revoke only inside the active branch', () => {
    expect(manager).toContain("active: 'Activo'")
    expect(manager).toContain("used: 'Usado'")
    expect(manager).toContain("expired: 'Vencido'")
    expect(manager).toContain("revoked: 'Revocado'")
    expect(manager).toContain("link.status === 'active'")
    expect(manager).toContain("method: 'DELETE'")
    expect(manager).toContain('aria-live="polite"')
    expect(adminCss).toMatch(/\.invitationPrimaryAction[\s\S]*?min-height:\s*44px/)
  })
})

describe('public invitation registration UI contract', () => {
  const page = source('app/invite/page.tsx')
  const client = source('app/invite/InvitationRegistrationClient.tsx')
  const modal = source('app/components/RSVPModal.tsx')

  it('extracts the fragment bearer, scrubs history and validates it only in a POST body', () => {
    expect(page).toContain('<InvitationRegistrationClient />')
    expect(client).toContain("window.location.hash.slice(1)")
    expect(client).toContain('tokenRef.current ?? fragment.get')
    expect(client).toContain('window.history.replaceState')
    expect(client).toContain("fetch('/api/rsvp-invitations/validate'")
    expect(client).toContain("method: 'POST'")
    expect(client).toContain('body: JSON.stringify({ token })')
    expect(client).toContain("cache: 'no-store'")
    expect(client).not.toContain('console.')
  })

  it('opens registration despite public RSVP closure and fails closed for unavailable links', () => {
    expect(client).toContain('rsvpClosed: false')
    expect(client).toContain('setIsModalOpen(true)')
    expect(client).toContain('Puede ser inválido, haber vencido, estar revocado o ya haber sido utilizado.')
    expect(client).toContain("state.kind === 'invalid'")
    expect(client).toContain('invitationToken={state.token}')
  })

  it('forwards the token only when provided and replaces the form after success', () => {
    expect(modal).toContain('invitationToken?: string')
    expect(modal).toContain('onSuccess?: () => void')
    expect(modal).toContain('...(invitationToken ? { invitationToken } : {})')
    expect(modal).toContain('onSuccess()')
    expect(client).toContain("onSuccess={() => setState({ kind: 'confirmed' })}")
    expect(client).toContain('Este link de invitación ya fue utilizado.')
  })

  it('sets no-referrer, no-store and noindex headers on the fragment entry point', async () => {
    const config = await import('../next.config.js')
    const headersFactory = config.default.headers
    expect(headersFactory).toBeTypeOf('function')
    if (!headersFactory) throw new Error('next.config.js headers() is required')
    const headers = await headersFactory()
    expect(headers).toContainEqual({
      source: '/invite',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      ],
    })
  })
})
