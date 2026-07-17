'use client'

import type { Event } from '@/types/event'
import styles from './Sidebar.module.css'
import { EventSwitcher } from './EventSwitcher'
import { NavList, type AdminTab } from './NavList'
import { IconButton } from '../ui/Button'
import { ChevronLeft, LogOut, Menu } from '../ui/icons'

interface SidebarProps {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  canManageSelectedEvent: boolean
  isSuperAdmin: boolean
  events: Event[]
  selectedEventId: string
  onSelectEvent: (slug: string) => void
  homeEventId: string
  onManageEvents: () => void
  onLogout: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function Sidebar({
  activeTab,
  onTabChange,
  canManageSelectedEvent,
  isSuperAdmin,
  events,
  selectedEventId,
  onSelectEvent,
  homeEventId,
  onManageEvents,
  onLogout,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`} aria-label="Navegación de administración">
      <div className={styles.brand}>
        <h1 className={styles.brandTitle}>PartyTime</h1>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <EventSwitcher
        events={events}
        selectedEventId={selectedEventId}
        onSelectEvent={onSelectEvent}
        homeEventId={homeEventId}
        isSuperAdmin={isSuperAdmin}
        onManageEvents={onManageEvents}
        collapsed={collapsed}
      />

      <nav className={styles.nav}>
        <NavList
          activeTab={activeTab}
          onTabChange={onTabChange}
          canManageSelectedEvent={canManageSelectedEvent}
          isSuperAdmin={isSuperAdmin}
          collapsed={collapsed}
        />
      </nav>

      <div className={styles.footer}>
        <IconButton
          label="Cerrar sesión"
          icon={<LogOut size={18} />}
          onClick={onLogout}
          style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', gap: 'var(--ad-3)' }}
        />
      </div>
    </aside>
  )
}
