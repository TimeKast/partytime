'use client'

import styles from './BottomNav.module.css'
import type { AdminTab } from './NavList'
import { FolderCog, LayoutDashboard, Lock, Settings } from '../ui/icons'

interface BottomNavProps {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  canManageSelectedEvent: boolean
  isSuperAdmin: boolean
}

const BOTTOM_NAV_ITEMS = [
  { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { tab: 'config', label: 'Config', icon: Settings, requiresEventManagement: true },
  { tab: 'eventos', label: 'Eventos', icon: FolderCog, requiresSuperAdmin: true },
  { tab: 'cuenta', label: 'Cuenta', icon: Lock },
] as const

export function BottomNav({ activeTab, onTabChange, canManageSelectedEvent, isSuperAdmin }: BottomNavProps) {
  const items = BOTTOM_NAV_ITEMS.filter(item =>
    (!('requiresEventManagement' in item) || canManageSelectedEvent)
    && (!('requiresSuperAdmin' in item) || isSuperAdmin)
  )

  return (
    <nav className={styles.nav} aria-label="Navegación principal">
      {items.map(item => {
        const Icon = item.icon
        const active = activeTab === item.tab

        return (
          <button
            key={item.tab}
            type="button"
            className={`${styles.item} ${active ? styles.active : ''}`}
            onClick={() => onTabChange(item.tab)}
            aria-current={active ? 'page' : undefined}
          >
            <span className={styles.icon}><Icon size={20} /></span>
            <span className={styles.label}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
