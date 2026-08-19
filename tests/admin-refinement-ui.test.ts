import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  isPlusOneLockedForPayment,
  plusOnePaymentLockMessage,
} from '../app/admin/components/config/rsvp-edit-policy'

const read = (path: string) => readFileSync(path, 'utf8')

describe('admin refinement UI contracts', () => {
  it('removes the redundant Eventos nav item while retaining super-admin event management', () => {
    const navList = read('app/admin/components/shell/NavList.tsx')
    const eventSwitcher = read('app/admin/components/shell/EventSwitcher.tsx')
    const adminShell = read('app/admin/components/shell/AdminShell.tsx')

    expect(navList).not.toContain('label="Eventos"')
    expect(navList).not.toContain("onTabChange('eventos')")
    expect(eventSwitcher).toContain('{isSuperAdmin && (')
    expect(eventSwitcher).toContain('onClick={onManageEvents}')
    expect(eventSwitcher).toContain('Gestionar Eventos')
    expect(adminShell).toContain("const handleManageEvents = () => onTabChange('eventos')")
  })

  it('gates the Dashboard Configurar evento CTA with the existing event-management permission', () => {
    const page = read('app/admin/page.tsx')
    const dashboardStart = page.indexOf("{activeTab === 'dashboard' && (")
    const configStart = page.indexOf('{/* Contenido de Configuración */}', dashboardStart)
    const dashboard = page.slice(dashboardStart, configStart)

    expect(dashboard).toContain('{canManageSelectedEvent && (')
    expect(dashboard).toContain('Configurar evento')
    expect(dashboard).toContain("onClick={() => setActiveTab('config')}")
  })

  it('keeps guest actions in an equal-size desktop row and a deliberate mobile grid', () => {
    const table = read('app/admin/components/table/RsvpTable.tsx')
    const css = read('app/admin/admin.module.css')

    expect(table).toContain('className={styles.actionCluster}')
    expect(table).toContain('role="group"')
    expect(table).toContain('onClick={() => onSendEmail(rsvp)}')
    expect(table).toContain('disabled={loading || isEventPast}')
    expect(table).toContain('onClick={() => onEdit(rsvp)}')
    expect(table).toContain('onClick={() => onToggleStatus(rsvp)}')
    expect(css).toMatch(/\.actionCell\s*\{[\s\S]*?white-space:\s*nowrap;/)
    expect(css).toMatch(/\.actionCluster\s*\{[\s\S]*?grid-auto-flow:\s*column;[\s\S]*?grid-auto-columns:\s*var\(--ad-control-h-sm\);/)
    expect(css).toMatch(/\.actionButton\s*\{[\s\S]*?width:\s*var\(--ad-control-h-sm\);[\s\S]*?height:\s*var\(--ad-control-h-sm\);/)
    expect(css).toMatch(/\.actionCluster\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?width:\s*100%;/)
  })

  it('keeps filters collapsed by default with accessible state and a visible active summary', () => {
    const filters = read('app/admin/components/table/RsvpFilters.tsx')
    const css = read('app/admin/admin.module.css')

    expect(filters).toContain('useState(false)')
    expect(filters).toContain('aria-expanded={displayFiltersExpanded}')
    expect(filters).toContain('aria-controls="rsvp-display-filters"')
    expect(filters).toContain('hidden={!displayFiltersExpanded}')
    expect(filters).toContain('activeDisplayFilterCount')
    expect(filters).toContain('Sin filtros activos')
    expect(css).toMatch(/\.filterToggle,\s*\.invitationListToggle\s*\{[\s\S]*?min-height:\s*44px;/)
    expect(css).toMatch(/\.filterCollapsible\[hidden\]\s*\{[\s\S]*?display:\s*none;/)
  })

  it('renders pagination immediately above and below the guest list instead of inside filters', () => {
    const page = read('app/admin/page.tsx')
    const filters = read('app/admin/components/table/RsvpFilters.tsx')
    const pagination = read('app/admin/components/table/RsvpPagination.tsx')
    const listStart = page.indexOf('<section className={styles.rsvpList}')
    const listEnd = page.indexOf('</section>', listStart)
    const guestList = page.slice(listStart, listEnd)

    expect(filters).not.toContain('styles.paginationBar')
    expect(guestList).toContain('position="top"')
    expect(guestList).toContain('position="bottom"')
    expect(guestList.indexOf('position="top"')).toBeLessThan(guestList.indexOf('<RsvpTable'))
    expect(guestList.lastIndexOf('position="bottom"')).toBeGreaterThan(guestList.lastIndexOf('<RsvpTable'))
    expect(pagination).toContain('data-pagination-position={position}')
    expect(pagination).toContain('Paginación ${positionLabel} de invitados')
  })

  it('uses a controlled five-tab configuration model with keyboard navigation and motion-safe track scrolling', () => {
    const configNav = read('app/admin/components/config/ConfigNav.tsx')
    const page = read('app/admin/page.tsx')

    expect(configNav).toContain("{ id: 'general', label: 'General' }")
    expect(configNav).toContain("{ id: 'guests', label: 'Invitados' }")
    expect(configNav).toContain("{ id: 'design', label: 'Diseño' }")
    expect(configNav).toContain("{ id: 'messages', label: 'Mensajes' }")
    expect(configNav).toContain("{ id: 'checkin', label: 'Check-in' }")
    expect(configNav).toContain('role="tablist"')
    expect(configNav).toContain('role="tab"')
    expect(configNav).toContain('aria-selected={active}')
    expect(configNav).toContain('aria-controls={active ? `config-panel-${section.id}` : undefined}')
    expect(configNav).toContain("['ArrowLeft', 'ArrowRight', 'Home', 'End']")
    expect(configNav).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(configNav).toContain("behavior: reducedMotion ? 'auto' : 'smooth'")
    expect(page).toContain('window.history.replaceState(null, \'\', `#config-${section}`)')
    expect(page).toContain("activeConfigSection === 'general'")
    expect(page).toContain("activeConfigSection === 'checkin'")
    expect(configNav).not.toMatch(/>\s*0[1-5]\s*</)
  })

  it('keeps only the tab track horizontally scrollable and exposes accessible disclosures', () => {
    const configNav = read('app/admin/components/config/ConfigNav.tsx')
    const navCss = read('app/admin/components/config/ConfigNav.module.css')
    const disclosure = read('app/admin/components/config/SettingsDisclosure.tsx')
    const disclosureCss = read('app/admin/components/config/SettingsDisclosure.module.css')
    const navRule = navCss.match(/\.nav\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const trackRule = navCss.match(/\.track\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const mobileNavRule = navCss.match(/@media \(max-width: 1023px\)[\s\S]*?\.nav\s*\{([\s\S]*?)\}/)?.[1] ?? ''

    expect(configNav).toContain('<nav className={styles.nav}')
    expect(configNav).toContain('<div ref={trackRef} className={styles.track} role="tablist"')
    expect(navRule).toContain('position: sticky;')
    expect(navRule).not.toContain('overflow-x: auto;')
    expect(trackRule).toContain('overflow-x: auto;')
    expect(trackRule).toContain('overscroll-behavior-inline: contain;')
    expect(trackRule).toContain('-webkit-overflow-scrolling: touch;')
    expect(navRule).toContain('z-index: 20;')
    expect(mobileNavRule).toContain('top: var(--ad-mobile-top-offset);')
    expect(mobileNavRule).not.toContain('position: fixed;')
    expect(configNav).toContain('const trackRect = track.getBoundingClientRect()')
    expect(configNav).toContain('const tabRect = activeTab.getBoundingClientRect()')
    expect(configNav).toContain('track.scrollTo({')
    expect(configNav).not.toContain('scrollIntoView')

    expect(disclosure).toContain('aria-expanded={open}')
    expect(disclosure).toContain('aria-controls={contentId}')
    expect(disclosure).toContain('hidden={!open}')
    expect(disclosureCss).toMatch(/\.titleBlock small\s*\{[\s\S]*?-webkit-line-clamp:\s*2;/)
    expect(disclosureCss).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('uses the Backstage Runbook surface, equivalent custom validation, responsive grids, and a compact save bar', () => {
    const page = read('app/admin/page.tsx')
    const css = read('app/admin/admin.module.css')
    const saveCss = read('app/admin/components/config/SaveBar.module.css')

    expect(page).toContain('styles.configPage')
    expect(page).toContain('<BackstageStatusStrip')
    expect(page).toContain('<SettingsDisclosure')
    expect(page).toContain('onSubmit={saveEventConfig} noValidate')
    expect(page).toContain('const validationFailure = (() => {')
    expect(page).toContain('setConfigValidationReveal(current => ({')
    expect(page).toContain("revealKey={configValidationReveal.id === 'identity'")
    expect(page).toContain("revealKey={configValidationReveal.id === 'reminder'")
    expect(page).toContain('className={styles.configColorGrid}')
    expect(css).toMatch(/\.configPage\s*\{[\s\S]*?--ad-runbook-ink:\s*#29271f;[\s\S]*?width:\s*min\(100%, 1080px\);/)
    expect(css).toMatch(/\.configSection\s*\{[\s\S]*?border:\s*1px solid var\(--ad-runbook-line,[\s\S]*?background:\s*var\(--ad-runbook-paper,/)
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(css).toMatch(/\.configColorGrid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(saveCss).toMatch(/\.bar\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?border-left:\s*4px solid var\(--ad-runbook-amber/)
    expect(saveCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.bar button\s*\{[\s\S]*?width:\s*auto;/)
  })

  it('keeps the save affordance mounted on Check-in and expands a collapsed disclosure before focusing invalid input', () => {
    const page = read('app/admin/page.tsx')
    const disclosure = read('app/admin/components/config/SettingsDisclosure.tsx')
    const formStart = page.indexOf('<form className={styles.configForm}')
    const checkinPanel = page.indexOf("activeConfigSection === 'checkin'", formStart)
    const saveBar = page.indexOf('<SaveBar', checkinPanel)
    const formEnd = page.indexOf('</form>', saveBar)

    expect(formStart).toBeGreaterThan(-1)
    expect(checkinPanel).toBeGreaterThan(formStart)
    expect(saveBar).toBeGreaterThan(checkinPanel)
    expect(formEnd).toBeGreaterThan(saveBar)
    expect(disclosure).toContain('if (revealKey > 0) setOpen(true)')
    expect(page).toContain('window.requestAnimationFrame(() => {')
  })

  it('allows an informational zero-dollar display but requires a positive integer when Stripe collection is active', () => {
    const page = read('app/admin/page.tsx')

    expect(page).toContain('!Number.isInteger(configForm.priceAmount) || configForm.priceAmount < 0')
    expect(page).toContain('configForm.paymentRequired && (!configForm.priceEnabled || configForm.priceAmount <= 0)')
    expect(page).not.toContain('configForm.priceEnabled && configForm.priceAmount <= 0')
    expect(page).toContain('min="0"')
  })

  it('locks the companion count while Checkout is open or paid, without blocking repricing after expiry/refund', () => {
    const page = read('app/admin/page.tsx')

    expect(isPlusOneLockedForPayment('created')).toBe(true)
    expect(isPlusOneLockedForPayment('paid')).toBe(true)
    expect(isPlusOneLockedForPayment('expired')).toBe(false)
    expect(isPlusOneLockedForPayment('refunded')).toBe(false)
    expect(plusOnePaymentLockMessage('created')).toContain('Checkout abierto')
    expect(plusOnePaymentLockMessage('paid')).toContain('número de cuotas')
    expect(page).toContain('disabled={Boolean(plusOneLockMessage)}')
    expect(page).toContain('aria-describedby={plusOneLockMessage')
  })

  it('does not expose an invalid zero-range progressbar in the check-in overview', () => {
    const overview = read('app/admin/components/CheckinOverview.tsx')

    expect(overview).toContain('{totalSeats > 0 ? (')
    expect(overview).toContain('aria-valuemax={totalSeats}')
    expect(overview).toContain('aria-valuenow={boundedArrived}')
    expect(overview).toContain('Aún no hay invitados confirmados.')
  })
})
