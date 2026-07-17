import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('admin mobile shell source contracts', () => {
  it('integrates a bottom nav with its role-aware item source', () => {
    const shell = read('app/admin/components/shell/AdminShell.tsx')
    const navList = read('app/admin/components/shell/NavList.tsx')
    const bottomNav = read('app/admin/components/shell/BottomNav.tsx')

    expect(shell).toContain("import { BottomNav } from './BottomNav'")
    expect(shell).toContain('<BottomNav')
    expect(shell).toContain('onTabChange={onTabChange}')
    expect(shell).toContain('canManageSelectedEvent={canManageSelectedEvent}')
    expect(shell).toContain('isSuperAdmin={isSuperAdmin}')
    expect(navList).toContain("{ tab: 'config', label: 'Config', icon: Settings, requiresEventManagement: true }")
    expect(navList).toContain("{ tab: 'usuarios', label: 'Usuarios', icon: Users, requiresSuperAdmin: true }")
    expect(navList).toContain('getAdminNavItems(canManageSelectedEvent, isSuperAdmin)')
    expect(bottomNav).toContain("{ tab: 'config', label: 'Config', icon: Settings, requiresEventManagement: true }")
    expect(bottomNav).toContain("!('requiresEventManagement' in item) || canManageSelectedEvent")
    expect(bottomNav).toContain("!('requiresSuperAdmin' in item) || isSuperAdmin")
  })

  it('keeps Usuarios in shared navigation and replaces it with role-gated Eventos in BottomNav', () => {
    const navList = read('app/admin/components/shell/NavList.tsx')
    const bottomNav = read('app/admin/components/shell/BottomNav.tsx')
    const sharedItemSource = navList.slice(navList.indexOf('export const ADMIN_NAV_ITEMS'), navList.indexOf('export function getAdminNavItems'))
    const bottomItemSource = bottomNav.slice(bottomNav.indexOf('const BOTTOM_NAV_ITEMS'), bottomNav.indexOf('export function BottomNav'))

    expect(sharedItemSource).toContain("{ tab: 'usuarios', label: 'Usuarios', icon: Users, requiresSuperAdmin: true }")
    expect(sharedItemSource).not.toContain("tab: 'eventos'")
    expect(sharedItemSource).not.toContain("label: 'Eventos'")
    expect(bottomItemSource).not.toContain("tab: 'usuarios'")
    expect(bottomItemSource).not.toContain("label: 'Usuarios'")
    expect(bottomItemSource).toContain("{ tab: 'eventos', label: 'Eventos', icon: FolderCog, requiresSuperAdmin: true }")
    expect(bottomNav).toContain('onClick={() => onTabChange(item.tab)}')
  })

  it('fixes the mobile topbar and compensates for its iPhone safe area', () => {
    const shellCss = read('app/admin/components/shell/AdminShell.module.css')
    const topbarCss = read('app/admin/components/shell/Topbar.module.css')

    expect(shellCss).toMatch(/--ad-mobile-top-offset:\s*calc\(var\(--ad-topbar-h\) \+ env\(safe-area-inset-top\)\);/)
    expect(shellCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.main\s*\{[\s\S]*?padding-top:\s*var\(--ad-mobile-top-offset\);/)
    expect(topbarCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.topbar\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*0;[\s\S]*?height:\s*var\(--ad-mobile-top-offset\);[\s\S]*?padding-top:\s*env\(safe-area-inset-top\);/)
  })

  it('keeps fixed bottom navigation and mobile overlays clear of each other', () => {
    const shellCss = read('app/admin/components/shell/AdminShell.module.css')
    const bottomCss = read('app/admin/components/shell/BottomNav.module.css')
    const saveCss = read('app/admin/components/config/SaveBar.module.css')
    const toastCss = read('app/admin/components/ui/Surfaces.module.css')

    expect(shellCss).toMatch(/--ad-mobile-bottom-offset:\s*calc\(var\(--ad-bottom-nav-h\) \+ env\(safe-area-inset-bottom\)\);/)
    expect(shellCss).toMatch(/\.content\s*\{[\s\S]*?padding-bottom:\s*calc\(var\(--ad-5\) \+ var\(--ad-mobile-bottom-offset\)\);/)
    expect(shellCss).toMatch(/--ad-z-bottom-nav:\s*40;[\s\S]*?--ad-z-drawer:\s*60;[\s\S]*?--ad-z-modal:\s*80;/)
    expect(bottomCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*0;[\s\S]*?height:\s*var\(--ad-mobile-bottom-offset\);[\s\S]*?env\(safe-area-inset-bottom\)/)
    expect(saveCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*?bottom:\s*calc\(var\(--ad-mobile-bottom-offset\) \+ var\(--ad-2\)\);/)
    expect(toastCss).toContain('bottom: calc(var(--ad-mobile-bottom-offset) + var(--ad-4))')
  })

  it('provides equal-width accessible targets and reduced-motion support', () => {
    const bottomNav = read('app/admin/components/shell/BottomNav.tsx')
    const bottomCss = read('app/admin/components/shell/BottomNav.module.css')

    expect(bottomNav).toContain("aria-current={active ? 'page' : undefined}")
    expect(bottomNav).toContain('aria-label="Navegación principal"')
    expect(bottomCss).toMatch(/\.item\s*\{[\s\S]*?flex:\s*1 1 0;[\s\S]*?min-height:\s*44px;/)
    expect(bottomCss).toMatch(/\.item:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--ad-focus\);/)
    expect(bottomCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none;/)
  })
})
