import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(path, 'utf8')

describe('admin one-time invitation link UI contract', () => {
  const manager = source('app/admin/components/InvitationLinkManager.tsx')
  const adminPage = source('app/admin/page.tsx')
  const adminCss = source('app/admin/admin.module.css')

  it('is manager-only and reloads a secret-free link list for the selected event', () => {
    expect(adminPage).toContain('canManageSelectedEvent && selectedEventId')
    expect(adminPage).toContain('<InvitationLinkManager eventSlug={selectedEventId} onNavigateToRsvp={navigateToRsvp} />')
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
    expect(manager).toContain('También podrás copiarlo después desde Links emitidos.')
    expect(manager).toContain('navigator.clipboard.writeText(generatedUrl)')
  })

  it('labels every status, groups it beside the details and exposes revoke only inside the active branch', () => {
    expect(manager).toContain("active: 'Activo'")
    expect(manager).toContain("used: 'Usado'")
    expect(manager).toContain("expired: 'Vencido'")
    expect(manager).toContain("revoked: 'Revocado'")
    expect(manager).toContain("link.status === 'active'")
    expect(manager).toContain('className={styles.invitationLinkActions}')
    expect(manager).toContain("method: 'DELETE'")
    expect(manager).toContain('aria-live="polite"')
    expect(adminCss).toMatch(/\.invitationPrimaryAction[\s\S]*?min-height:\s*44px/)
  })

  it('recovers and copies an available active link only after an explicit click', () => {
    expect(manager).toContain("urlAvailability: InvitationLinkUrlAvailability")
    expect(manager).toContain("method: 'PATCH'")
    expect(manager).toContain('body: JSON.stringify({ eventSlug: requestEventSlug, id })')
    expect(manager).toContain("link.status === 'active'")
    expect(manager).toContain("link.urlAvailability === 'available'")
    expect(manager).toContain('onClick={() => void copyIssuedLink(link.id, link.createdAt)}')
    expect(manager).toContain('navigator.clipboard.writeText(data.url)')
    expect(manager).toContain("window.prompt('No se pudo copiar automáticamente. Copia este link:', data.url)")
    expect(manager).toContain('activeEventSlug.current !== requestEventSlug')
    expect(manager).not.toContain('setGeneratedUrl(data.url)\n        setFeedback(`Link creado')
    expect(adminCss).toMatch(/\.invitationCopyAction\s*\{[\s\S]*?border:\s*1px solid var\(--ad-primary\);/)
  })

  it('keeps issued links collapsed by default and links a consumed RSVP to its guest row', () => {
    expect(manager).toContain('const [linksExpanded, setLinksExpanded] = useState(false)')
    expect(manager).toContain('aria-expanded={linksExpanded}')
    expect(manager).toContain('aria-controls="issued-invitation-links"')
    expect(manager).toContain('hidden={!linksExpanded}')
    expect(manager).toContain('usedRsvpId: string | null')
    expect(manager).toContain('usedRsvpName?: string | null')
    expect(manager).toContain('navigateToUsedRsvp(link.usedRsvpId)')
    expect(adminPage).toContain('filterAndSortRsvps(rsvps')
    expect(adminPage).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(adminPage).toContain("behavior: reducedMotion ? 'auto' : 'smooth'")
    expect(adminPage).toContain('target.scrollIntoView')
    expect(adminPage).toContain('target.focus({ preventScroll: true })')
  })

  it('uses a content-hugging responsive form and bounds the native date input with its own control shell', () => {
    expect(adminCss).toMatch(/\.invitationLinkManager\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?box-sizing:\s*border-box;/)
    expect(adminCss).toMatch(/\.invitationLinkForm\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/)
    expect(adminCss).toMatch(/\.invitationExpiryField\s*\{[\s\S]*?min-width:\s*0;/)
    expect(manager).toContain('<div className={styles.invitationExpiryControl}>')
    expect(adminCss).toMatch(/\.invitationExpiryControl\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?overflow:\s*hidden;/)
    expect(adminCss).toMatch(/\.invitationExpiryControl input\s*\{[\s\S]*?display:\s*block;[\s\S]*?border:\s*0;/)
    expect(adminCss).toMatch(/\.invitationExpiryControl:focus-within,[\s\S]*?box-shadow:\s*var\(--ad-focus-ring\);/)
    expect(adminCss).not.toMatch(/\.invitationExpiryField\s*\{[\s\S]*?flex:\s*1 1 280px;/)
    expect(adminCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.invitationLinkForm\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/)
    expect(adminCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.invitationLinkList li\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/)
    expect(adminCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.invitationLinkActions\s*\{[\s\S]*?align-items:\s*flex-end;/)
  })

  it('ISSUE-020: gates the courtesy/verification checkboxes on the event actually having that behavior, defaults both to true and posts them', () => {
    expect(manager).toContain('const [isCourtesy, setIsCourtesy] = useState(true)')
    expect(manager).toContain('const [skipVerification, setSkipVerification] = useState(true)')
    expect(manager).toContain('/api/event-settings?eventId=')
    expect(manager).toContain('eventFlags?.priceEnabled')
    expect(manager).toContain('eventFlags?.emailVerificationEnabled')
    expect(manager).toContain('Cortesía — no paga')
    expect(manager).toContain('Saltar verificación de email')
    expect(manager).toContain('          isCourtesy,\n          skipVerification,')
    expect(manager).not.toContain('localStorage')
    expect(manager).not.toContain('console.')
  })

  it('ISSUE-020: shows unchecked-flag helper copy and per-link badges only when the event behavior applies', () => {
    expect(manager).toContain('El invitado pagará')
    expect(manager).toContain('El invitado deberá confirmar su correo.')
    expect(manager).toContain("{link.isCourtesy ? 'Cortesía' : 'Paga'}")
    expect(manager).toContain("{link.skipVerification ? 'Sin verificación' : 'Verifica'}")
    expect(adminCss).toMatch(/\.invitationFlagBadge\s*\{[\s\S]*?border-radius:\s*999px;/)
  })
})

describe('public invitation registration UI contract', () => {
  const page = source('app/invite/page.tsx')
  const eventPage = source('app/invite/[slug]/page.tsx')
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

  it('keeps the legacy entry point and binds event-aware links to the path slug', () => {
    expect(page).toContain('<InvitationRegistrationClient />')
    expect(page).toContain("export const dynamic = 'force-dynamic'")
    expect(page).toContain('export const revalidate = 0')
    expect(eventPage).toContain('<InvitationRegistrationClient expectedEventSlug={slug} />')
    expect(client).toContain('expectedEventSlug?: string')
    expect(client).toContain('expectedEventSlug && event.slug !== expectedEventSlug')
  })

  it('ISSUE-020: parses requiresPayment/requiresVerification from validation and shows copy only when either is true', () => {
    expect(client).toContain("'requiresPayment' in data && data.requiresPayment === true")
    expect(client).toContain("'requiresVerification' in data && data.requiresVerification === true")
    expect(client).toContain('requiresPayment: boolean; requiresVerification: boolean')
    expect(client).toContain('{(requiresPayment || requiresVerification) && (')
    expect(client).toContain('Tu invitación requiere pago para confirmar')
    expect(client).toContain('Te pediremos confirmar tu correo.')
  })

  it('forwards the token only when provided and replaces the form after success', () => {
    expect(modal).toContain('invitationToken?: string')
    expect(modal).toContain('onSuccess?: () => void')
    expect(modal).toContain('...(invitationToken ? { invitationToken } : {})')
    expect(modal).toContain('onSuccess()')
    expect(client).toContain("onSuccess={() => setState({ kind: 'confirmed' })}")
    expect(client).toContain('Este link de invitación ya fue utilizado.')
  })

  it('sets no-referrer, no-store and noindex headers on legacy and event-bound entry points', async () => {
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
    expect(headers).toContainEqual({
      source: '/invite/:slug',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      ],
    })
  })
})
