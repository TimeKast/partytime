'use client'

import { useEffect, useRef } from 'react'
import type { Event } from '@/types/event'
import styles from './MobileDrawer.module.css'
import { EventSwitcher } from './EventSwitcher'
import { NavList, type AdminTab } from './NavList'
import { IconButton } from '../ui/Button'
import { LogOut, X } from '../ui/icons'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getFocusableElements(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(element => element.getClientRects().length > 0)
}

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
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
  triggerRef: React.RefObject<HTMLElement | null>
}

export function MobileDrawer({
  open,
  onClose,
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
  triggerRef,
}: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const trigger = triggerRef.current
    const previousBodyOverflow = document.body.style.getPropertyValue('overflow')
    const previousBodyOverflowPriority = document.body.style.getPropertyPriority('overflow')

    document.body.style.setProperty('overflow', 'hidden')

    const focusFrame = requestAnimationFrame(() => {
      if (!panel) return
      const [firstFocusable] = getFocusableElements(panel)
      const focusTarget = firstFocusable ?? panel
      focusTarget.focus({ preventScroll: true })
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = getFocusableElements(panel)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement

      if (!panel.contains(activeElement) || activeElement === panel) {
        event.preventDefault()
        const focusTarget = event.shiftKey ? last : first
        focusTarget.focus()
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown, true)
      if (previousBodyOverflow) {
        document.body.style.setProperty('overflow', previousBodyOverflow, previousBodyOverflowPriority)
      } else {
        document.body.style.removeProperty('overflow')
      }
      trigger?.focus({ preventScroll: true })
    }
  }, [open, triggerRef])

  if (!open) return null

  const handleNav = (tab: AdminTab) => {
    onTabChange(tab)
    onClose()
  }

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        id="admin-mobile-navigation"
        className={styles.panel}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navegación"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>PartyTime</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <EventSwitcher
          events={events}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          homeEventId={homeEventId}
          isSuperAdmin={isSuperAdmin}
          onManageEvents={() => handleNav('eventos')}
        />

        <nav className={styles.nav}>
          <NavList
            activeTab={activeTab}
            onTabChange={handleNav}
            canManageSelectedEvent={canManageSelectedEvent}
            isSuperAdmin={isSuperAdmin}
          />
        </nav>

        <div className={styles.footer}>
          <IconButton
            label="Cerrar sesión"
            icon={<LogOut size={18} />}
            onClick={onLogout}
            style={{ width: '100%', justifyContent: 'flex-start', gap: 'var(--ad-3)' }}
          />
        </div>
      </div>
    </>
  )
}
