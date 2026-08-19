'use client'

import { NavItem } from './NavItem'
import { LayoutDashboard, Lock, Settings, Users, Wallet } from '../ui/icons'

export type AdminTab = 'dashboard' | 'config' | 'finanzas' | 'eventos' | 'usuarios' | 'cuenta'

interface NavListProps {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  canManageSelectedEvent: boolean
  isSuperAdmin: boolean
  collapsed?: boolean
}

// ISSUE-025 (EPIC-006): "Finanzas" has no requiresEventManagement /
// requiresSuperAdmin gate — PLAN-EPIC-006.md §2.7 confirms viewer reads,
// manager/super_admin mutates (same split as Dashboard), so the tab itself
// stays visible to both; LedgerTab/ParticipantsManager/TransactionList are
// the ones that hide mutation controls behind `readOnly`.
export const ADMIN_NAV_ITEMS = [
  { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { tab: 'finanzas', label: 'Finanzas', icon: Wallet },
  { tab: 'config', label: 'Config', icon: Settings, requiresEventManagement: true },
  { tab: 'usuarios', label: 'Usuarios', icon: Users, requiresSuperAdmin: true },
  { tab: 'cuenta', label: 'Cuenta', icon: Lock },
] as const

export function getAdminNavItems(canManageSelectedEvent: boolean, isSuperAdmin: boolean) {
  return ADMIN_NAV_ITEMS.filter(item =>
    (!('requiresEventManagement' in item) || canManageSelectedEvent)
    && (!('requiresSuperAdmin' in item) || isSuperAdmin)
  )
}

/** Shared nav item list used by both the desktop Sidebar and the mobile drawer. */
export function NavList({ activeTab, onTabChange, canManageSelectedEvent, isSuperAdmin, collapsed = false }: NavListProps) {
  return (
    <>
      {getAdminNavItems(canManageSelectedEvent, isSuperAdmin).map(item => {
        const Icon = item.icon
        return (
          <NavItem
            key={item.tab}
            icon={<Icon size={18} />}
            label={item.label}
            active={activeTab === item.tab}
            collapsed={collapsed}
            onClick={() => onTabChange(item.tab)}
          />
        )
      })}
    </>
  )
}
