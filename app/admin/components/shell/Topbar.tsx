'use client'

import type { RefObject } from 'react'
import styles from './Topbar.module.css'
import { IconButton } from '../ui/Button'
import { ExternalLink, LogOut, Menu } from '../ui/icons'
import type { AdminTab } from './NavList'

const TITLES: Record<AdminTab, string> = {
  dashboard: 'Dashboard',
  finanzas: 'Finanzas',
  config: 'Config',
  eventos: 'Eventos',
  usuarios: 'Usuarios',
  cuenta: 'Cuenta',
}

interface TopbarProps {
  activeTab: AdminTab
  selectedEventId: string
  onOpenDrawer: () => void
  onLogout: () => void
  menuButtonRef: RefObject<HTMLButtonElement>
  drawerOpen: boolean
}

export function Topbar({ activeTab, selectedEventId, onOpenDrawer, onLogout, menuButtonRef, drawerOpen }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          type="button"
          ref={menuButtonRef}
          className={styles.menuBtn}
          onClick={onOpenDrawer}
          aria-label="Abrir menú de navegación"
          aria-controls="admin-mobile-navigation"
          aria-expanded={drawerOpen}
        >
          <Menu size={20} />
        </button>
        <h1 className={styles.title}>{TITLES[activeTab]}</h1>
      </div>
      <div className={styles.right}>
        {selectedEventId && (
          <a
            className={styles.mobileOnly}
            href={`/${selectedEventId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver invitación"
            style={{ color: 'var(--ad-text-muted)' }}
          >
            <ExternalLink size={18} />
          </a>
        )}
        <IconButton
          className={styles.mobileOnly}
          label="Cerrar sesión"
          icon={<LogOut size={18} />}
          onClick={onLogout}
        />
      </div>
    </header>
  )
}
