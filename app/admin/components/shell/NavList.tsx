'use client'

import { NavItem } from './NavItem'
import { LayoutDashboard, Lock, Settings, Users } from '../ui/icons'

export type AdminTab = 'dashboard' | 'config' | 'eventos' | 'usuarios' | 'cuenta'

interface NavListProps {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  canManageSelectedEvent: boolean
  isSuperAdmin: boolean
  collapsed?: boolean
}

export const ADMIN_NAV_ITEMS = [
  { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
