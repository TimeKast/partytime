import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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

  it('tracks the visible configuration section and respects accessible motion preferences', () => {
    const configNav = read('app/admin/components/config/ConfigNav.tsx')
    const navCss = read('app/admin/components/config/ConfigNav.module.css')
    const adminCss = read('app/admin/admin.module.css')

    expect(configNav).toContain('new IntersectionObserver')
    expect(configNav).toContain('getBoundingClientRect().top')
    expect(configNav).toContain("aria-current={activeSection === section.id ? 'location' : undefined}")
    expect(configNav).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(configNav).toContain("behavior: reducedMotion ? 'auto' : 'smooth'")
    expect(configNav).toContain('href={`#${section.id}`}')
    expect(navCss).toMatch(/\.nav\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*calc\(var\(--ad-topbar-h\)/)
    expect(navCss).toContain('.active')
    expect(adminCss).toContain('scroll-margin-top: calc(var(--ad-topbar-h) + var(--ad-config-nav-frame-height) + var(--ad-2))')
  })

  it('keeps the desktop Config frame sticky and fixes the mobile frame below the topbar', () => {
    const configNav = read('app/admin/components/config/ConfigNav.tsx')
    const navCss = read('app/admin/components/config/ConfigNav.module.css')
    const adminCss = read('app/admin/admin.module.css')
    const navRule = navCss.match(/\.nav\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const trackRule = navCss.match(/\.track\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const mobileNavRule = navCss.match(/@media \(max-width: 1023px\)[\s\S]*?\.nav\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const mobileConfigPageRule = adminCss.match(/@media \(max-width: 1023px\)[\s\S]*?\.configPage\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const compactConfigPageRule = adminCss.match(/@media \(max-width: 768px\)[\s\S]*?\.configPage\s*\{([\s\S]*?)\}/)?.[1] ?? ''

    expect(configNav).toContain('<nav ref={navRef} className={styles.nav}')
    expect(configNav).toContain('<div ref={trackRef} className={styles.track}>')
    expect(navRule).toContain('position: sticky;')
    expect(navRule).not.toContain('overflow-x: auto;')
    expect(trackRule).toContain('overflow-x: auto;')
    expect(trackRule).toContain('-webkit-overflow-scrolling: touch;')
    expect(navRule).toContain('z-index: 20;')
    expect(mobileNavRule).toContain('position: fixed;')
    expect(mobileNavRule).toContain('top: var(--ad-mobile-top-offset);')
    expect(mobileNavRule).toContain('left: 0;')
    expect(mobileNavRule).toContain('right: 0;')
    expect(mobileNavRule).toContain('width: 100%;')
    expect(mobileNavRule).toContain('margin: 0;')
    expect(mobileNavRule).not.toMatch(/margin[^;]*-1|width:\s*calc\(/)
    expect(mobileNavRule).toContain('background: var(--ad-surface);')
    expect(mobileNavRule).toContain('border-bottom: 1px solid var(--ad-border-strong);')
    expect(mobileNavRule).toContain('box-shadow: var(--ad-shadow-md);')
    expect(mobileConfigPageRule).toContain('padding-top: var(--ad-config-nav-frame-height);')
    expect(compactConfigPageRule).toContain('padding-top: var(--ad-config-nav-frame-height);')

    expect(configNav).toContain("track?.querySelector<HTMLAnchorElement>('[aria-current=\"location\"]')")
    expect(configNav).toContain('const trackRect = track.getBoundingClientRect()')
    expect(configNav).toContain('const linkRect = activeLink.getBoundingClientRect()')
    expect(configNav).toContain('track.scrollTo({')
    expect(configNav).not.toContain('scrollIntoView')

    expect(configNav).toContain("style.setProperty('--ad-config-nav-frame-height', `${nav.offsetHeight}px`)")
    expect(configNav).toContain('stickyTop + nav.offsetHeight + 8')
    expect(adminCss).toContain('scroll-margin-top: calc(var(--ad-topbar-h) + var(--ad-config-nav-frame-height) + var(--ad-2))')
    expect(adminCss).toContain('scroll-margin-top: calc(var(--ad-mobile-top-offset) + var(--ad-config-nav-frame-height) + var(--ad-2))')
  })

  it('uses controlled config width, section surfaces, responsive grids, and a prominent save bar', () => {
    const page = read('app/admin/page.tsx')
    const css = read('app/admin/admin.module.css')
    const saveCss = read('app/admin/components/config/SaveBar.module.css')

    expect(page).toContain('styles.configPage')
    expect(page).toContain('className={styles.configColorGrid}')
    expect(css).toMatch(/\.configPage\s*\{[\s\S]*?width:\s*min\(100%, 1024px\);/)
    expect(css).toMatch(/\.configSection\s*\{[\s\S]*?border:\s*1px solid var\(--ad-border\);[\s\S]*?background:\s*var\(--ad-surface\);/)
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(css).toMatch(/\.configColorGrid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(saveCss).toMatch(/\.bar\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?border:\s*1px solid var\(--ad-border-strong\);[\s\S]*?box-shadow:\s*var\(--ad-shadow-pop\);/)
  })
})
