'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Event } from '@/types/event'
import styles from './AdminShell.module.css'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileDrawer } from './MobileDrawer'
import { BottomNav } from './BottomNav'
import { ToastHost } from '../ui/Surfaces'
import type { AdminTab } from './NavList'

const COLLAPSE_STORAGE_KEY = 'ad_sidebar_collapsed'

interface AdminShellProps {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  canManageSelectedEvent: boolean
  isSuperAdmin: boolean
  events: Event[]
  selectedEventId: string
  onSelectEvent: (slug: string) => void
  homeEventId: string
  onLogout: () => void
  message: string
  children: ReactNode
}

export function AdminShell({
  activeTab,
  onTabChange,
  canManageSelectedEvent,
  isSuperAdmin,
  events,
  selectedEventId,
  onSelectEvent,
  homeEventId,
  onLogout,
  message,
  children,
}: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY)
    if (stored === '1') setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(current => {
      const next = !current
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  const handleManageEvents = () => onTabChange('eventos')

  return (
    <div className={styles.shell}>
      <a href="#admin-main-content" className={styles.skipLink}>Saltar al contenido</a>
      <div className={styles.body}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          canManageSelectedEvent={canManageSelectedEvent}
          isSuperAdmin={isSuperAdmin}
          events={events}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          homeEventId={homeEventId}
          onManageEvents={handleManageEvents}
          onLogout={onLogout}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />

        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          activeTab={activeTab}
          onTabChange={onTabChange}
          canManageSelectedEvent={canManageSelectedEvent}
          isSuperAdmin={isSuperAdmin}
          events={events}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          homeEventId={homeEventId}
          onManageEvents={handleManageEvents}
          onLogout={onLogout}
          triggerRef={menuButtonRef}
        />

        <div className={styles.main}>
          <Topbar
            activeTab={activeTab}
            selectedEventId={selectedEventId}
            onOpenDrawer={() => setDrawerOpen(true)}
            onLogout={onLogout}
            menuButtonRef={menuButtonRef}
            drawerOpen={drawerOpen}
          />
          <main id="admin-main-content" className={styles.content}>
            {children}
          </main>
        </div>

        <BottomNav
          activeTab={activeTab}
          onTabChange={onTabChange}
          canManageSelectedEvent={canManageSelectedEvent}
          isSuperAdmin={isSuperAdmin}
        />
      </div>
      <ToastHost message={message} />
    </div>
  )
}
