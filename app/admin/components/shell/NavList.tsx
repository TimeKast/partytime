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

/** Shared nav item list used by both the desktop Sidebar and the mobile drawer. */
export function NavList({ activeTab, onTabChange, canManageSelectedEvent, isSuperAdmin, collapsed = false }: NavListProps) {
  return (
    <>
      <NavItem
        icon={<LayoutDashboard size={18} />}
        label="Dashboard"
        active={activeTab === 'dashboard'}
        collapsed={collapsed}
        onClick={() => onTabChange('dashboard')}
      />
      {canManageSelectedEvent && (
        <NavItem
          icon={<Settings size={18} />}
          label="Config"
          active={activeTab === 'config'}
          collapsed={collapsed}
          onClick={() => onTabChange('config')}
        />
      )}
      {isSuperAdmin && (
        <NavItem
          icon={<Users size={18} />}
          label="Usuarios"
          active={activeTab === 'usuarios'}
          collapsed={collapsed}
          onClick={() => onTabChange('usuarios')}
        />
      )}
      <NavItem
        icon={<Lock size={18} />}
        label="Cuenta"
        active={activeTab === 'cuenta'}
        collapsed={collapsed}
        onClick={() => onTabChange('cuenta')}
      />
    </>
  )
}
