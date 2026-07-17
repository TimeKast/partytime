'use client'

import styles from './BottomNav.module.css'
import { getAdminNavItems, type AdminTab } from './NavList'

interface BottomNavProps {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  canManageSelectedEvent: boolean
  isSuperAdmin: boolean
}

export function BottomNav({ activeTab, onTabChange, canManageSelectedEvent, isSuperAdmin }: BottomNavProps) {
  const items = getAdminNavItems(canManageSelectedEvent, isSuperAdmin)

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
